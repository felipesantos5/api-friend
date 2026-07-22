import axios from "axios";
import Service from "./models/Service";
import StatusLog from "./models/StatusLog";
import { IService } from "./interfaces/IService";

const GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutos (tempo de segurança para deploy)
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora
const DOUBLE_CHECK_DELAY_MS = 60 * 1000; // 1 minuto - aguarda antes da dupla checagem
const HTTP_TIMEOUT_MS = 10 * 1000;

// Escalada apos o OFFLINE confirmado. Cada etapa reverifica e alerta de novo;
// a ultima dispara o redeploy no Coolify.
const ESCALATION_STEPS_MS = [2 * 60 * 1000, 2 * 60 * 1000, 1 * 60 * 1000];

type NotificationPhase =
  | { type: "recovery" }
  | { type: "offline_confirmed" }
  | { type: "offline_still"; attempt: number; total: number }
  | { type: "offline_redeploy"; redeployed: boolean };

interface PendingSleep {
  timer: NodeJS.Timeout;
  resolve: () => void;
}

class Monitor {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private generations: Map<string, number> = new Map();
  private pendingSleeps: Map<string, PendingSleep> = new Map();
  private graceTimers: Map<string, NodeJS.Timeout> = new Map();
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

    // Evitar duplicatas (aborta o ciclo anterior sem apagar a geracao nova)
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

    // Libera qualquer espera em andamento (dupla checagem / escalada) para que
    // o fluxo suspenso acorde na hora e aborte na checagem de geracao.
    const pending = this.pendingSleeps.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingSleeps.delete(id);
      pending.resolve();
    }

    if (clearGen) {
      this.clearGraceTimer(id);
      this.generations.delete(id);
    }
  }

  /**
   * Espera cancelavel: se o servico for parado/atualizado, resolve na hora
   * (o chamador aborta em seguida pela checagem de geracao).
   */
  private sleep(id: string, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingSleeps.delete(id);
        resolve();
      }, ms);
      this.pendingSleeps.set(id, { timer, resolve });
    });
  }

  private isCurrentGen(id: string, gen: number): boolean {
    return this.generations.get(id) === gen;
  }

  /**
   * Rebusca o servico garantindo que o ciclo ainda e o ativo e o servico segue valido
   */
  private async getActiveService(id: string, gen: number): Promise<IService | null> {
    if (!this.isCurrentGen(id, gen)) return null;

    const service = await Service.findById(id);
    if (!service || !service.isActive) return null;

    // Revalida depois do await: o servico pode ter sido alterado nesse meio tempo
    if (!this.isCurrentGen(id, gen)) return null;

    return service;
  }

  private clearGraceTimer(id: string): void {
    const timer = this.graceTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(id);
    }
  }

  /**
   * Realiza a chamada HTTP de health check
   */
  private async performHealthCheck(url: string): Promise<boolean> {
    try {
      const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
      return response.status === 200;
    } catch (err) {
      return false;
    }
  }

  /**
   * Lida com o sucesso de um check (API online)
   */
  private async handleSuccess(service: IService): Promise<void> {
    const id = service._id.toString();
    let changed = false;

    if (service.status === "offline") {
      console.log(`[MONITOR] ✅ ${service.name} voltou ao ar!`);
      service.status = "online";
      changed = true;

      // Registrar transicao no historico
      await StatusLog.create({
        serviceId: id,
        status: "online",
        checkedAt: new Date(),
      });

      // Notificar Discord que voltou
      await this.sendDiscordNotification(service, { type: "recovery" });
    }

    // Voltou ao ar: encerra o cooldown pos-redeploy mais cedo
    if (service.isDeploying) {
      service.isDeploying = false;
      changed = true;
    }
    this.clearGraceTimer(id);

    if (changed) {
      await service.save();
    }
  }

  /**
   * Verifica a saude de um servico: 2 checagens para confirmar a queda,
   * e entao a escalada de alertas ate o redeploy.
   */
  private async checkService(id: string, gen: number): Promise<void> {
    try {
      const service = await Service.findById(id);
      if (!service || !service.isActive) {
        if (!service) this.stopWatching(id);
        return;
      }

      // Cooldown pos-redeploy: apenas checagem simples ate ele voltar ao ar.
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
      if (!this.isCurrentGen(id, gen)) return;
      console.log(`[MONITOR] ⚠️ Falha detectada em ${service.name}. Aguardando ${DOUBLE_CHECK_DELAY_MS / 1000}s para dupla checagem (sem alertar ainda)...`);

      await this.sleep(id, DOUBLE_CHECK_DELAY_MS);

      const serviceRecheck = await this.getActiveService(id, gen);
      if (!serviceRecheck) return;

      // 2ª validação (dupla checagem)
      const isOnlineRecheck = await this.performHealthCheck(serviceRecheck.url);
      if (isOnlineRecheck) {
        // Voltou na dupla checagem: foi só uma instabilidade momentânea, segue em silêncio.
        console.log(`[MONITOR] ✅ ${serviceRecheck.name} respondeu na dupla checagem. Instabilidade momentânea, sem alerta.`);
        await this.handleSuccess(serviceRecheck);
        return;
      }

      // Falhou nas 2 validações: agora sim confirma OFFLINE, alerta e escala.
      if (!this.isCurrentGen(id, gen)) return;
      await this.handleFailure(serviceRecheck, gen);
    } catch (err) {
      console.error(`[MONITOR] Erro critico ao verificar servico ${id}:`, err);
    }
  }

  /**
   * Falha confirmada nas 2 checagens: alerta imediato e inicia a escalada.
   * Cada etapa reverifica; se voltar ao ar em qualquer ponto, a escalada e cancelada.
   */
  private async handleFailure(service: IService, gen: number): Promise<void> {
    const id = service._id.toString();
    console.log(`[MONITOR] ❌ ${service.name} confirmado OFFLINE após retentativas! (${service.url})`);

    const wasOnline = service.status === "online";
    service.status = "offline";
    service.lastFailAt = new Date();
    await service.save();

    // Registrar transicao no historico
    if (wasOnline) {
      await StatusLog.create({
        serviceId: id,
        status: "offline",
        checkedAt: new Date(),
      });
    }

    // Alerta 1: queda confirmada
    await this.sendDiscordNotification(service, { type: "offline_confirmed" });

    const totalSteps = ESCALATION_STEPS_MS.length;

    for (let step = 0; step < totalSteps; step++) {
      const waitMs = ESCALATION_STEPS_MS[step];
      const isLastStep = step === totalSteps - 1;

      console.log(`[MONITOR] ⏳ ${service.name}: aguardando ${waitMs / 1000 / 60} min para a reverificacao ${step + 1}/${totalSteps}...`);
      await this.sleep(id, waitMs);

      const fresh = await this.getActiveService(id, gen);
      if (!fresh) return;

      // Se voltou ao ar durante a escalada, cancela tudo e avisa a recuperacao.
      const backOnline = await this.performHealthCheck(fresh.url);
      if (backOnline) {
        console.log(`[MONITOR] ✅ ${fresh.name} voltou ao ar na reverificacao ${step + 1}/${totalSteps}. Escalada cancelada.`);
        await this.handleSuccess(fresh);
        return;
      }

      if (!this.isCurrentGen(id, gen)) return;

      if (!isLastStep) {
        console.log(`[MONITOR] ❌ ${fresh.name} continua offline (reverificacao ${step + 1}/${totalSteps}).`);
        await this.sendDiscordNotification(fresh, {
          type: "offline_still",
          attempt: step + 1,
          total: totalSteps,
        });
        continue;
      }

      // Ultima etapa: dispara o redeploy e reporta o resultado real no Discord.
      console.log(`[MONITOR] 🔄 ${fresh.name} offline na ultima reverificacao. Iniciando recuperacao...`);
      await this.startRecovery(fresh, gen);
    }
  }

  /**
   * Dispara o redeploy no Coolify e abre o cooldown (grace period) do servico
   */
  private async startRecovery(service: IService, gen: number): Promise<void> {
    const id = service._id.toString();

    // Cooldown ativo mesmo sem Coolify configurado: evita repetir a escalada
    // inteira (e o spam de alertas) a cada ciclo enquanto o servico segue fora.
    service.isDeploying = true;
    await service.save();

    const redeployed = await this.triggerCoolifyRedeploy(service);

    if (this.isCurrentGen(id, gen)) {
      await this.sendDiscordNotification(service, { type: "offline_redeploy", redeployed });
    }

    // Grace period - aguardar antes de permitir nova escalada/redeploy
    console.log(`[MONITOR] ⏳ Grace period de ${GRACE_PERIOD_MS / 1000 / 60} minutos para: ${service.name}`);
    this.clearGraceTimer(id);
    const timer = setTimeout(async () => {
      this.graceTimers.delete(id);
      try {
        const freshService = await Service.findById(id);
        if (freshService && freshService.isDeploying) {
          freshService.isDeploying = false;
          await freshService.save();
          console.log(`[MONITOR] Grace period encerrado para: ${freshService.name}`);
        }
      } catch (err) {
        console.error(`[MONITOR] Erro ao encerrar grace period:`, err);
      }
    }, GRACE_PERIOD_MS);
    this.graceTimers.set(id, timer);
  }

  /**
   * Envia notificacao para o Discord via webhook
   */
  private async sendDiscordNotification(service: IService, phase: NotificationPhase): Promise<void> {
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

    if (phase.type === "recovery") {
      title = "✅ Servico Recuperado";
      description = `**${service.name}** voltou ao ar!`;
      color = 0x00ff00;
      fields.push({ name: "Status", value: "Online", inline: true });
    } else if (phase.type === "offline_confirmed") {
      title = "🚨 Servico Offline";
      description = `**${service.name}** esta fora do ar!`;
      color = 0xff0000;
      fields.push({ name: "Status", value: "Offline (confirmado em 2 checagens)", inline: true });
      fields.push({
        name: "Acao",
        value: `Monitorando. Se nao voltar, redeploy automatico em ~${this.minutesUntilRedeploy()} min`,
        inline: false,
      });
    } else if (phase.type === "offline_still") {
      title = "🚨 Servico Continua Offline";
      description = `**${service.name}** segue fora do ar.`;
      color = 0xff0000;
      fields.push({ name: "Status", value: `Offline (reverificacao ${phase.attempt}/${phase.total})`, inline: true });
      fields.push({
        name: "Acao",
        value: `Aguardando. Redeploy automatico em ~${this.minutesUntilRedeploy(phase.attempt)} min se nao voltar`,
        inline: false,
      });
    } else {
      title = "🚨 Servico Offline - Ultima Verificacao";
      description = `**${service.name}** nao voltou ao ar apos todas as reverificacoes.`;
      color = 0xff0000;
      fields.push({ name: "Status", value: "Offline (confirmado em 5 checagens)", inline: true });

      if (!service.coolifyWebhook) {
        fields.push({ name: "Acao", value: "De fato caiu e precisa fazer um redeploy manual", inline: false });
      } else if (phase.redeployed) {
        fields.push({ name: "Acao", value: "🚀 Redeploy automatico disparado no Coolify", inline: false });
      } else {
        fields.push({ name: "Acao", value: "⚠️ Falha ao disparar o redeploy no Coolify - redeploy manual necessario", inline: false });
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
      await axios.post(service.discordWebhook, { embeds: [embed] }, { timeout: HTTP_TIMEOUT_MS });
      console.log(`[MONITOR] Notificacao Discord enviada para: ${service.name} (${phase.type})`);
    } catch (err) {
      console.error(`[MONITOR] Erro ao enviar notificacao Discord:`, err);
    }
  }

  /**
   * Minutos restantes ate o redeploy automatico, a partir da etapa ja concluida
   */
  private minutesUntilRedeploy(completedSteps: number = 0): number {
    const remainingMs = ESCALATION_STEPS_MS
      .slice(completedSteps)
      .reduce((total, ms) => total + ms, 0);
    return Math.round(remainingMs / 1000 / 60);
  }

  /**
   * Dispara redeploy no Coolify
   */
  private async triggerCoolifyRedeploy(service: IService): Promise<boolean> {
    if (!service.coolifyWebhook) {
      console.log(`[MONITOR] Sem webhook Coolify configurado para: ${service.name}`);
      return false;
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
          timeout: HTTP_TIMEOUT_MS,
        }
      );
      console.log(`[MONITOR] 🚀 Redeploy Coolify disparado para: ${service.name}`);
      return true;
    } catch (err) {
      console.error(`[MONITOR] Erro ao disparar redeploy Coolify para ${service.name}:`, err);
      return false;
    }
  }
}

export const monitor = new Monitor();
