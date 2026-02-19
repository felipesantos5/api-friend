import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

/**
 * Sanitiza a FIREBASE_PRIVATE_KEY para funcionar corretamente em qualquer ambiente.
 *
 * Problemas comuns:
 * 1. No Windows/.env, \n vira \\n literal (string de 2 chars)
 * 2. Aspas simples/duplas envolvendo a chave
 * 3. Chave sem quebras de linha reais entre header/body/footer PEM
 */
function sanitizePrivateKey(raw: string): string {
  // 1. Remove aspas simples ou duplas que possam envolver a chave inteira
  let key = raw.trim().replace(/^['"]|['"]$/g, "");

  // 2. Substitui \\n literal (2 caracteres) por quebra de linha real
  key = key.replace(/\\n/g, "\n");

  // 3. Remove espaços/tabs extras em torno das quebras de linha
  key = key.replace(/[ \t]*\n[ \t]*/g, "\n");

  // 4. Garante que o header e footer PEM tenham quebras de linha
  key = key
    .replace(/(-----BEGIN PRIVATE KEY-----)\s*/g, "$1\n")
    .replace(/\s*(-----END PRIVATE KEY-----)/g, "\n$1");

  // 5. Remove múltiplas quebras de linha consecutivas
  key = key.replace(/\n{2,}/g, "\n").trim();

  // 6. Garante que a chave termina com \n (requisito PEM)
  if (!key.endsWith("\n")) {
    key += "\n";
  }

  return key;
}

// Inicializar Firebase Admin (uma única vez)
if (admin.apps.length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  console.log("[Firebase] Verificando configurações...", {
    projectId: projectId ? `✅ (${projectId})` : "❌ ausente",
    clientEmail: clientEmail ? `✅ (${clientEmail})` : "❌ ausente",
    privateKey: rawPrivateKey
      ? `✅ (${rawPrivateKey.length} chars)`
      : "❌ ausente",
  });

  if (projectId && clientEmail && rawPrivateKey) {
    try {
      const privateKey = sanitizePrivateKey(rawPrivateKey);

      // Validação mínima do formato PEM
      if (
        !privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
        !privateKey.includes("-----END PRIVATE KEY-----")
      ) {
        throw new Error(
          "Chave privada não contém headers PEM válidos (BEGIN/END PRIVATE KEY)."
        );
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      console.log("✅ Firebase Admin inicializado com sucesso via variáveis de ambiente.");
    } catch (error: any) {
      console.error("❌ Erro ao inicializar Firebase Admin:", error.message);
      console.error(
        "💡 Dica: Verifique se FIREBASE_PRIVATE_KEY no .env está no formato correto.",
        "\n   No .env, a chave deve estar em uma única linha com \\\\n representando quebras.",
        "\n   Exemplo: FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\\\nMII...\\\\n-----END PRIVATE KEY-----\\\\n\""
      );
    }
  } else {
    // Fallback: tenta usar arquivo JSON localmente
    const serviceAccountPath = path.join(
      __dirname,
      "../../serviceAccountKey.json"
    );

    console.warn("⚠️  Variáveis de ambiente Firebase ausentes. Tentando fallback com arquivo JSON...", {
      projectId: !!projectId,
      clientEmail: !!clientEmail,
      privateKey: !!rawPrivateKey,
    });

    if (fs.existsSync(serviceAccountPath)) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        console.log("✅ Firebase Admin inicializado via serviceAccountKey.json.");
      } catch (error: any) {
        console.error("❌ Erro ao inicializar Firebase Admin via JSON:", error.message);
      }
    } else {
      console.error(
        "❌ Firebase não pôde ser inicializado.",
        "\n   Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env",
        "\n   ou coloque um serviceAccountKey.json na raiz do backend."
      );
    }
  }
}

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (admin.apps.length === 0) {
    console.error("🚨 Tentativa de autenticação sem Firebase inicializado.");
    return res.status(500).json({
      error: "Erro de configuração no servidor: Firebase não inicializado.",
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido ou inválido." });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Erro ao validar token Firebase:", error);
    return res
      .status(401)
      .json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
};
