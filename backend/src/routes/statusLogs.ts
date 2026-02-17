import { Router, Request, Response } from "express";
import StatusLog from "../models/StatusLog";
import Service from "../models/Service";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /status-logs/:serviceId - Retorna ultimos 7 dias agregados por dia
router.get("/:serviceId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user?.uid;

    // Verificar se o serviço pertence ao usuário
    const service = await Service.findOne({ _id: serviceId, userId });
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado ou acesso negado" });
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const logs = await StatusLog.find({
      serviceId,
      checkedAt: { $gte: sevenDaysAgo },
    }).sort({ checkedAt: 1 });

    // Agregar por dia
    const days: Record<string, { online: number; offline: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { online: 0, offline: 0 };
    }

    for (const log of logs) {
      const key = log.checkedAt.toISOString().slice(0, 10);
      if (days[key]) {
        days[key][log.status]++;
      }
    }

    const result = Object.entries(days).map(([date, counts]) => {
      let dominant: "online" | "offline" | null = null;
      if (counts.online + counts.offline > 0) {
        dominant = counts.online >= counts.offline ? "online" : "offline";
      }
      return { date, ...counts, dominant };
    });

    res.json(result);
  } catch (err) {
    console.error("[API] Erro ao buscar status logs:", err);
    res.status(500).json({ error: "Erro interno ao buscar status logs" });
  }
});

export default router;
