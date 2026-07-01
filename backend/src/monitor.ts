import axios from "axios";
import Service from "./models/Service";
import StatusLog from "./models/StatusLog";
import { IService } from "./interfaces/IService";

const GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutos (tempo de segurança para deploy)
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora
const DOUBLE_CHECK_DELAY_MS = 60 * 1000; // 1 minuto - aguarda antes da dupla checagem

class Monitor {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private generations: Map<string, number> = new Map();
  private snapshotInterval: NodeJS.Timeout | null = null;

  /**
   * Inicia o monitoramento de todos os servicos cadastrados no banco
   */
  async startAll(): Promise<void> {
    // 100% Seguro: Resetar qualquer flag de deploy que tenha ficado "presa" por causa de um restart do servidor
    try {
      await Service.updateMany({}, { isDeploying: false });
      console.log("[MONITOR] Flags de deploy resetadas para segurança");
    } catch (err) {
      console.error("[MONITOR] Erro ao resetar flags de deploy:", err);
    }

    const services = await Service.find();
    console.log(`[MONITOR] Iniciando monitoramento de ${services.length} servico(s)`);

    for (const service of services) {
      if (service.isActive) {
        this.startWatching(service);
      }
    }

    // Snapshot horario de todos os servicos
    this.snapshotInterval = setInterval(async () => {
      await this.takeSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
  }

  /**
   * Cria snapshot de status de todos os servicos (para dados de grafico)
   */
  private async takeSnapshot(): Promise<void> {
    try {
      const services = await Service.find();
      const now = new Date();
      const logs = services.map((s) => ({
        serviceId: s._id.toString(),
        status: s.status,
        checkedAt: now,
      }));
      if (logs.length > 0) {
        await StatusLog.insertMany(logs);
      }
    } catch (err) {
      console.error("[MONITOR] Erro ao criar snapshot:", err);
    }
  }

  /**
   * Inicia o monitoramento de um servico especifico
   */
  startWatching(service: IService): void {
    const id = service._id.toString();
    const newGen = (this.generations.get(id) || 0) + 1;
    this.generations.set(id, newGen);

    // Evitar duplicatas
    this.stopWatching(id, false);

    console.log(`[MONITOR] Watchdog ativo para: ${service.name} | Intervalo: ${service.checkInterval}ms | Gen: ${newGen}`);

    const runLoop = async (gen: number) => {
      // Verifica se ainda é a geração ativa
      if (this.generations.get(id) !== gen) return;

      const currentService = await Service.findById(id);
      
      // Se não achar o serviço ou ele estiver inativo, para o watchdog
      if (!currentService || !currentService.isActive) {
        console.log(`[MONITOR] Watchdog encerrado para: ${id} (Inativo ou removido)`);
        this.stopWatching(id);
        return;
      }

      await this.checkService(id, gen);
      
      // Re-verificar após o check (caso tenha mudado durante a execução)
      if (this.generations.get(id) !== gen) return;

      const freshService = await Service.findById(id);
      if (freshService && freshService.isActive) {
        const timeout = setTimeout(() => runLoop(gen), freshService.checkInterval || 3000);
        this.intervals.set(id, timeout as any);
      } else {
         this.stopWatching(id);
      }
    };

    const initialTimeout = setTimeout(() => runLoop(newGen), service.checkInterval || 3000);
    this.intervals.set(id, initialTimeout as any);
  }

  /**
   * Para o monitoramento de um servico
   */
  stopWatching(id: string, clearGen: boolean = true): void {
    const timeout = this.intervals.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.intervals.delete(id);
      console.log(`[MONITOR] Watchdog parado para ID: ${id}`);
    }
    if (clearGen) {
      this.generations.delete(id);
    }
  }

  /**
   * Realiza a chamada HTTP de health check
   */
  private async performHealthCheck(url: string): Promise<boolean> {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      return response.status === 200;
    } catch (err) {
      return false;
    }
  }

  /**
   * Lida com o sucesso de um check (API online)
   */
  private async handleSuccess(service: IService): Promise<void> {
    let changed = false;

    if (service.status === "offline") {
      console.log(`[MONITOR] ✅ ${service.name} voltou ao ar!`);
      service.status = "online";
      changed = true;

      // Registrar transicao no historico
      await StatusLog.create({
        serviceId: service._id.toString(),
        status: "online",
        checkedAt: new Date(),
      });

      // Notificar Discord que voltou
      await this.sendDiscordNotification(service, true);
    }

    // Se ele voltou, podemos liberar o isDeploying mais cedo (opcional, mas seguro)
    // No seu caso, vamos manter o isDeploying como bloqueio por um tempo se quiser,
    // mas se o deploy já teve sucesso, o ideal é limpar para a próxima falha.
    if (service.isDeploying) {
       service.isDeploying = false;
       changed = true;
    }

    if (changed) {
      await service.save();
    }
  }

  /**
   * Verifica a saude de um servico com logica de retentativa
   */
  private async checkService(id: string, gen: number): Promise<void> {
    try {
      const service = await Service.findById(id);
      if (!service || !service.isActive) {
        if (!service) this.stopWatching(id);
        return;
      }

      // Se o serviço já está em processo de deploy, fazemos apenas uma checagem simples.
      if (service.isDeploying) {
        const isOnline = await this.performHealthCheck(service.url);
        if (isOnline) {
          await this.handleSuccess(service);
        }
        return;
      }

      // 1ª validação
      const isOnline = await this.performHealthCheck(service.url);
      if (isOnline) {
        await this.handleSuccess(service);
        return;
      }

      // Primeira falha: NÃO alerta ainda. Aguarda 1 min e faz a dupla checagem.
      if (this.generations.get(id) !== gen) return;
      console.log(`[MONITOR] ⚠️ Falha detectada em ${service.name}. Aguardando ${DOUBLE_CHECK_DELAY_MS / 1000}s para dupla checagem (sem alertar ainda)...`);

      await new Promise(resolve => setTimeout(resolve, DOUBLE_CHECK_DELAY_MS));

      // Re-verificar se continua ativo após o delay
      if (this.generations.get(id) !== gen) return;
      const serviceRecheck = await Service.findById(id);
      if (!serviceRecheck || !serviceRecheck.isActive) return;

      // 2ª validação (dupla checagem)
      const isOnlineRecheck = await this.performHealthCheck(serviceRecheck.url);
      if (isOnlineRecheck) {
        // Voltou na dupla checagem: foi só uma instabilidade momentânea, segue em silêncio.
        console.log(`[MONITOR] ✅ ${serviceRecheck.name} respondeu na dupla checagem. Instabilidade momentânea, sem alerta.`);
        await this.handleSuccess(serviceRecheck);
        return;
      }

      // Falhou nas 2 validações: agora sim confirma OFFLINE, alerta e age.
      if (this.generations.get(id) !== gen) return;
      await this.handleFailure(serviceRecheck);
    } catch (err) {
      console.error(`[MONITOR] Erro critico ao verificar servico ${id}:`, err);
    }
  }

  /**
   * Lida com falha confirmada de um servico
   */
  private async handleFailure(service: IService): Promise<void> {
    console.log(`[MONITOR] ❌ ${service.name} confirmado OFFLINE após retentativas! (${service.url})`);

    const wasOnline = service.status === "online";
    service.status = "offline";
    service.lastFailAt = new Date();

    // Registrar transicao no historico
    if (wasOnline) {
      await StatusLog.create({
        serviceId: service._id.toString(),
        status: "offline",
        checkedAt: new Date(),
      });
    }

    if (!service.isDeploying) {
      service.isDeploying = true;
      await service.save();

      console.log(`[MONITOR] 🔄 Iniciando processo de recuperacao para: ${service.name}`);

      // Enviar notificacao Discord de queda confirmada (após dupla checagem)
      await this.sendDiscordNotification(service, false);

      // Disparar redeploy no Coolify
      await this.triggerCoolifyRedeploy(service);

      // Grace period - aguardar antes de permitir novo redeploy
      console.log(`[MONITOR] ⏳ Grace period de ${GRACE_PERIOD_MS / 1000 / 60} minutos para: ${service.name}`);
      setTimeout(async () => {
        try {
          const freshService = await Service.findById(service._id);
          if (freshService) {
            freshService.isDeploying = false;
            await freshService.save();
            console.log(`[MONITOR] Grace period encerrado para: ${freshService.name}`);
          }
        } catch (err) {
          console.error(`[MONITOR] Erro ao encerrar grace period:`, err);
        }
      }, GRACE_PERIOD_MS);
    } else {
      await service.save();
      console.log(`[MONITOR] ⏳ ${service.name} ja esta em deploy, aguardando grace period...`);
    }
  }


  /**
   * Envia notificacao para o Discord via webhook
   */
  private async sendDiscordNotification(service: IService, isRecovery: boolean): Promise<void> {
    if (!service.discordWebhook) {
      console.log(`[MONITOR] Sem webhook Discord configurado para: ${service.name}`);
      return;
    }

    let title = "";
    let description = "";
    let color = 0x000000;
    const fields: any[] = [
      { name: "URL", value: service.url, inline: true },
    ];

    if (isRecovery) {
      title = "✅ Servico Recuperado";
      description = `**${service.name}** voltou ao ar!`;
      color = 0x00ff00;
      fields.push({ name: "Status", value: "Online", inline: true });
    } else {
      // Falha confirmada após dupla checagem
      title = "🚨 Servico Offline";
      description = `**${service.name}** esta fora do ar!`;
      color = 0xff0000;
      fields.push({ name: "Status", value: "Offline (confirmado em 2 checagens)", inline: true });

      if (service.coolifyWebhook) {
        fields.push({ name: "Acao", value: "Redeploy automatico iniciado", inline: false });
      } else {
        fields.push({ name: "Acao", value: "De fato caiu e precisa fazer um redeploy manual", inline: false });
      }
    }

    const embed = {
      title,
      description,
      color,
      fields,
      timestamp: new Date().toISOString(),
    };

    try {
      await axios.post(service.discordWebhook, { embeds: [embed] });
      console.log(`[MONITOR] Notificacao Discord enviada para: ${service.name} (${isRecovery ? 'Recovery' : 'Failure'})`);
    } catch (err) {
      console.error(`[MONITOR] Erro ao enviar notificacao Discord:`, err);
    }
  }

  /**
   * Dispara redeploy no Coolify
   */
  private async triggerCoolifyRedeploy(service: IService): Promise<void> {
    if (!service.coolifyWebhook) {
      console.log(`[MONITOR] Sem webhook Coolify configurado para: ${service.name}`);
      return;
    }

    try {
      await axios.post(
        service.coolifyWebhook,
        {},
        {
          headers: {
            Authorization: `Bearer ${service.coolifyToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`[MONITOR] 🚀 Redeploy Coolify disparado para: ${service.name}`);
    } catch (err) {
      console.error(`[MONITOR] Erro ao disparar redeploy Coolify para ${service.name}:`, err);
    }
  }
}

export const monitor = new Monitor();
