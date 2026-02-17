import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
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
app.use("/services", serviceRoutes);
app.use("/status-logs", statusLogRoutes);

// Servir frontend em producao
const frontendPath = path.join(__dirname, "..", "web", "dist");
app.use(express.static(frontendPath));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

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
