import axios from "axios";
import Service from "./models/Service";
import StatusLog from "./models/StatusLog";
import { IService } from "./interfaces/IService";

const GRACE_PERIOD_MS = 6 * 60 * 1000; // 6 minutos (tempo máximo de build do Coolify)
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

class Monitor {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private snapshotInterval: NodeJS.Timeout | null = null;

  /**
   * Inicia o monitoramento de todos os servicos cadastrados no banco
   */
  async startAll(): Promise<void> {
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

    const interval = setInterval(async () => {
      await this.checkService(id);
    }, service.checkInterval || 3000);

    this.intervals.set(id, interval);
  }

  /**
   * Para o monitoramento de um servico
   */
  stopWatching(id: string): void {
    const interval = this.intervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(id);
      console.log(`[MONITOR] Watchdog parado para ID: ${id}`);
    }
  }

  /**
   * Verifica a saude de um servico
   */
  private async checkService(id: string): Promise<void> {
    try {
      const service = await Service.findById(id);
      if (!service) {
        console.log(`[MONITOR] Servico ${id} nao encontrado, parando watchdog`);
        this.stopWatching(id);
        return;
      }

      try {
        const response = await axios.get(service.url, { timeout: 10000 });

        if (response.status === 200) {
          // API esta online
          if (service.status === "offline") {
            console.log(`[MONITOR] ✅ ${service.name} voltou ao ar!`);
            service.status = "online";
            await service.save();

            // Registrar transicao no historico
            await StatusLog.create({
              serviceId: id,
              status: "online",
              checkedAt: new Date(),
            });

            // Notificar Discord que voltou
            await this.sendDiscordNotification(service, true);
          }
        } else {
          await this.handleFailure(service);
        }
      } catch {
        await this.handleFailure(service);
      }
    } catch (err) {
      console.error(`[MONITOR] Erro critico ao verificar servico ${id}:`, err);
    }
  }

  /**
   * Lida com falha de um servico
   */
  private async handleFailure(service: IService): Promise<void> {
    console.log(`[MONITOR] ❌ ${service.name} esta OFFLINE! (${service.url})`);

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
      console.log(`[MONITOR] ⏳ Grace period de ${GRACE_PERIOD_MS / 1000}s para: ${service.name}`);
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
