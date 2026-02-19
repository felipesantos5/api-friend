import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import serviceRoutes from "./routes/services";
import statusLogRoutes from "./routes/statusLogs";
import { monitor } from "./monitor";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/api-friend";

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas da API
app.get("/health", (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "UP" : "DOWN";
  res.status(200).json({
    status: "UP",
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use("/services", serviceRoutes);
app.use("/status-logs", statusLogRoutes);

// Servir frontend em producao (opcional)
const frontendPath = path.join(__dirname, "..", "web", "dist");

if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ message: "API Friend está rodando!", status: "Backend OK, Frontend não encontrado." });
  });
}


// Conectar ao MongoDB e iniciar servidor
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("[DB] Conectado ao MongoDB");

    // Iniciar monitoramento de todos os servicos cadastrados
    await monitor.startAll();

    app.listen(PORT, () => {
      console.log(`[SERVER] API Friend rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[DB] Erro ao conectar ao MongoDB:", err);
    process.exit(1);
  });
