import { Router, Request, Response } from "express";
import Service from "../models/Service";
import { monitor } from "../monitor";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// Aplicar autenticação em todas as rotas de serviços
router.use(authenticate);

// POST /services - Cadastrar nova API para monitoramento
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, checkInterval, discordWebhook, coolifyWebhook, coolifyToken } = req.body;
    const userId = req.user?.uid;

    if (!userId) {
      res.status(401).json({ error: "Usuário não identificado" });
      return;
    }

    if (!name || !url) {
      res.status(400).json({ error: "name e url sao obrigatorios" });
      return;
    }

    const service = await Service.create({
      userId,
      name,
      url,
      checkInterval: checkInterval || 3000,
      discordWebhook: discordWebhook || "",
      coolifyWebhook: coolifyWebhook || "",
      coolifyToken: coolifyToken || "",
    });

    console.log(`[API] Servico cadastrado: ${service.name} (${service.url}) pelo usuario ${userId}`);

    // Iniciar monitoramento imediatamente
    monitor.startWatching(service);

    res.status(201).json(service);
  } catch (err) {
    console.error("[API] Erro ao cadastrar servico:", err);
    res.status(500).json({ error: "Erro interno ao cadastrar servico" });
  }
});

// GET /services - Listar APIs monitoradas do usuário
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const services = await Service.find({ userId });
    res.json(services);
  } catch (err) {
    console.error("[API] Erro ao listar servicos:", err);
    res.status(500).json({ error: "Erro interno ao listar servicos" });
  }
});

// GET /services/:id - Buscar servico por ID (se pertencer ao usuário)
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const service = await Service.findOne({ _id: req.params.id, userId });
    
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado ou acesso negado" });
      return;
    }
    res.json(service);
  } catch (err) {
    console.error("[API] Erro ao buscar servico:", err);
    res.status(500).json({ error: "Erro interno ao buscar servico" });
  }
});

// PUT /services/:id - Atualizar servico
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, checkInterval, discordWebhook, coolifyWebhook, coolifyToken } = req.body;
    const userId = req.user?.uid;

    const service = await Service.findOne({ _id: req.params.id, userId });
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado ou acesso negado" });
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
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const service = await Service.findOneAndDelete({ _id: req.params.id, userId });
    
    if (!service) {
      res.status(404).json({ error: "Servico nao encontrado ou acesso negado" });
      return;
    }

    // Parar monitoramento
    monitor.stopWatching(service._id.toString());

    console.log(`[API] Servico removido: ${service.name} pelo usuario ${userId}`);
    res.json({ message: "Servico removido com sucesso" });
  } catch (err) {
    console.error("[API] Erro ao remover servico:", err);
    res.status(500).json({ error: "Erro interno ao remover servico" });
  }
});

export default router;

