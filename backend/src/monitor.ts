import axios from "axios";
import Service from "./models/Service";
import StatusLog from "./models/StatusLog";
import { IService } from "./interfaces/IService";

const GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutos (tempo de segurança para deploy)
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

class Monitor {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
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
      this.startWatching(service);
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

    // Evitar duplicatas
    if (this.intervals.has(id)) {
      this.stopWatching(id);
    }

    console.log(`[MONITOR] Watchdog ativo para: ${service.name} | Intervalo: ${service.checkInterval}ms`);

    const runLoop = async () => {
      await this.checkService(id);
      
      const currentService = await Service.findById(id);
      if (currentService) {
        const timeout = setTimeout(runLoop, currentService.checkInterval || 3000);
        this.intervals.set(id, timeout as any);
      }
    };

    const initialTimeout = setTimeout(runLoop, service.checkInterval || 3000);
    this.intervals.set(id, initialTimeout as any);
  }

  /**
   * Para o monitoramento de um servico
   */
  stopWatching(id: string): void {
    const timeout = this.intervals.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.intervals.delete(id);
      console.log(`[MONITOR] Watchdog parado para ID: ${id}`);
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
  private async checkService(id: string): Promise<void> {
    try {
      const service = await Service.findById(id);
      if (!service) {
        this.stopWatching(id);
        return;
      }

      // Se o serviço já está em processo de deploy, fazemos apenas uma checagem simples.
      // Não precisamos da lógica de retentativa (30s + 30s) enquanto ele está subindo.
      if (service.isDeploying) {
        const isOnline = await this.performHealthCheck(service.url);
        if (isOnline) {
          await this.handleSuccess(service);
        }
        return;
      }

      // 1ª Tentativa
      const isOnline = await this.performHealthCheck(service.url);

      if (isOnline) {
        await this.handleSuccess(service);
        return;
      }

      // Se falhou a primeira vez, aguarda 30 segundos e tenta de novo
      console.log(`[MONITOR] ⚠️ Falha detectada em ${service.name}. Aguardando 30s para 2ª tentativa...`);
      await new Promise(resolve => setTimeout(resolve, 30000));

      const isOnlineRetry1 = await this.performHealthCheck(service.url);
      if (isOnlineRetry1) {
        await this.handleSuccess(service);
        return;
      }

      // Se falhou a segunda vez, aguarda mais 30 segundos e tenta a última vez
      console.log(`[MONITOR] ⚠️ Segunda falha em ${service.name}. Aguardando mais 30s para tentativa final...`);
      await new Promise(resolve => setTimeout(resolve, 30000));

      const isOnlineRetry2 = await this.performHealthCheck(service.url);
      if (isOnlineRetry2) {
        await this.handleSuccess(service);
        return;
      }

      // Se falhou as 3 vezes (inicial + 2 retries), aí sim marca como offline e age
      await this.handleFailure(service);
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

      // Enviar notificacao Discord
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

    const embed = isRecovery
      ? {
          title: "✅ Servico Recuperado",
          description: `**${service.name}** voltou ao ar!`,
          color: 0x00ff00,
          fields: [
            { name: "URL", value: service.url, inline: true },
            { name: "Status", value: "Online", inline: true },
          ],
          timestamp: new Date().toISOString(),
        }
      : {
          title: "🚨 Servico Offline",
          description: `**${service.name}** esta fora do ar!`,
          color: 0xff0000,
          fields: [
            { name: "URL", value: service.url, inline: true },
            { name: "Status", value: "Offline", inline: true },
            { name: "Acao", value: "Redeploy automatico iniciado", inline: false },
          ],
          timestamp: new Date().toISOString(),
        };

    try {
      await axios.post(service.discordWebhook, { embeds: [embed] });
      console.log(`[MONITOR] Notificacao Discord enviada para: ${service.name}`);
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
