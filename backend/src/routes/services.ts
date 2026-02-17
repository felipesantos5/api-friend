import { Router, Request, Response } from "express";
import Service from "../models/Service";
import { monitor } from "../monitor";

const router = Router();

// POST /services - Cadastrar nova API para monitoramento
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, url, checkInterval, discordWebhook, coolifyWebhook, coolifyToken } = req.body;

    if (!name || !url) {
      res.status(400).json({ error: "name e url sao obrigatorios" });
      return;
    }

    const service = await Service.create({
      name,
      url,
      checkInterval: checkInterval || 3000,
      discordWebhook: discordWebhook || "",
      coolifyWebhook: coolifyWebhook || "",
      coolifyToken: coolifyToken || "",
    });

    console.log(`[API] Servico cadastrado: ${service.name} (${service.url})`);

    // Iniciar monitoramento imediatamente
    monitor.startWatching(service);

    res.status(201).json(service);
  } catch (err) {
    console.error("[API] Erro ao cadastrar servico:", err);
    res.status(500).json({ error: "Erro interno ao cadastrar servico" });
  }
});

// GET /services - Listar APIs monitoradas
router.get("/", async (_req: Request, res: Response) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    console.error("[API] Erro ao listar servicos:", err);
    res.status(500).json({ error: "Erro interno ao listar servicos" });
  }
});

// GET /services/:id - Buscar servico por ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado" });
      return;
    }
    res.json(service);
  } catch (err) {
    console.error("[API] Erro ao buscar servico:", err);
    res.status(500).json({ error: "Erro interno ao buscar servico" });
  }
});

// PUT /services/:id - Atualizar servico
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { name, url, checkInterval, discordWebhook, coolifyWebhook, coolifyToken } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado" });
      return;
    }

    // Parar monitoramento antes de atualizar
    monitor.stopWatching(service._id.toString());

    if (name !== undefined) service.name = name;
    if (url !== undefined) service.url = url;
    if (checkInterval !== undefined) service.checkInterval = checkInterval;
    if (discordWebhook !== undefined) service.discordWebhook = discordWebhook;
    if (coolifyWebhook !== undefined) service.coolifyWebhook = coolifyWebhook;
    if (coolifyToken !== undefined) service.coolifyToken = coolifyToken;

    await service.save();

    console.log(`[API] Servico atualizado: ${service.name}`);

    // Reiniciar monitoramento com novos dados
    monitor.startWatching(service);

    res.json(service);
  } catch (err) {
    console.error("[API] Erro ao atualizar servico:", err);
    res.status(500).json({ error: "Erro interno ao atualizar servico" });
  }
});

// DELETE /services/:id - Remover monitoramento
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado" });
      return;
    }

    // Parar monitoramento
    monitor.stopWatching(service._id.toString());

    console.log(`[API] Servico removido: ${service.name}`);
    res.json({ message: "Servico removido com sucesso" });
  } catch (err) {
    console.error("[API] Erro ao remover servico:", err);
    res.status(500).json({ error: "Erro interno ao remover servico" });
  }
});

export default router;
