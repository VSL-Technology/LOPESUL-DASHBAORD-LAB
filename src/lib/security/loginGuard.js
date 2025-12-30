// src/lib/security/loginGuard.js
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp } from "./requestUtils";

const WINDOW_MINUTES = 15;
const MAX_FAIL_PER_IP = 20;
const MAX_FAIL_PER_USER = 10;

export async function isLoginBlocked({ username, ip }) {
  // Se o prisma não existir ou não tiver o model, falha suave
  if (!prisma || !prisma.loginAttempt) {
    logger.warn("[AUTH] Prisma/LoginAttempt indisponível — ignorando bloqueio temporariamente");
    return false;
  }

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  try {
    const [byIp, byUser] = await Promise.all([
      prisma.loginAttempt.count({
        where: { ip, createdAt: { gte: since }, success: false },
      }),
      prisma.loginAttempt.count({
        where: { username, createdAt: { gte: since }, success: false },
      }),
    ]);

    const blocked = byIp >= MAX_FAIL_PER_IP || byUser >= MAX_FAIL_PER_USER;
    if (blocked) {
      logger.warn("[AUTH] Login bloqueado por suspeita de brute force", {
        username,
        ip,
        failByIp: byIp,
        failByUser: byUser,
      });
    }
    return blocked;
  } catch (err) {
    // Falha de conexão com o DB: registrar e deixar o login prosseguir (fail-open)
    logger.error("[AUTH] Erro ao verificar bloqueio (DB indisponível). Ignorando bloqueio.", {
      error: err?.message ?? err,
    });
    return false;
  }
}

export async function registerLoginAttempt({ username, ip, success }) {
  if (!prisma || !prisma.loginAttempt) {
    logger.warn("[AUTH] Prisma/LoginAttempt indisponível — não será registrado tentativa.");
    return;
  }

  try {
    await prisma.loginAttempt.create({
      data: { username, ip, success },
    });
  } catch (err) {
    // Só logar — não propagar erro para o fluxo de login
    logger.error("[AUTH] Erro ao registrar tentativa de login", { error: err?.message ?? String(err) });
  }
}
