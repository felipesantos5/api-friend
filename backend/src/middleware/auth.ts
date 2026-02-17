import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

// Inicializar Firebase Admin
const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
} else {
  console.warn("⚠️ Arquivo serviceAccountKey.json não encontrado. Auth do Firebase desativada para desenvolvimento local.");
}

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido ou inválido." });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (!fs.existsSync(serviceAccountPath)) {
      // Modo de desenvolvimento sem Firebase se o arquivo for omitido (apenas se você quiser facilitar o dev local)
      // Se preferir segurança total sempre, remova esse 'if'
      (req as any).user = { uid: "dev-user-id" };
      return next();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Erro ao validar token:", error);
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
};
