// src/lib/auth/session.js
import jwt from 'jsonwebtoken';

const SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 horas

function resolveRole(role) {
  if (!role) return 'READER';
  const normalized = String(role).toUpperCase();
  if (normalized === 'MASTER' || normalized === 'ADMIN') return 'MASTER';
  return 'READER';
}

function getSessionSecret() {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  if (!secret) {
    throw new Error('SESSION_SECRET não configurado');
  }
  return secret;
}

export function createSessionToken(operador, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload = {
    sub: operador.id,
    username: operador.nome,
    role: resolveRole(operador.role),
  };

  return jwt.sign(payload, getSessionSecret(), {
    expiresIn: ttlSeconds,
  });
}

export function verifySession(token) {
  try {
    const payload = jwt.verify(token, getSessionSecret());
    return { ...payload, role: resolveRole(payload.role) };
  } catch {
    return null;
  }
}
