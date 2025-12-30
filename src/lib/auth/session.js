// src/lib/auth/session.js
import jwt from 'jsonwebtoken';
import { ENV } from '@/lib/env';

const SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 horas

function resolveRole(role) {
  if (!role) return 'READER';
  const normalized = String(role).toUpperCase();
  if (normalized === 'MASTER' || normalized === 'ADMIN') return 'MASTER';
  return 'READER';
}

export function createSessionToken(operador, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload = {
    sub: operador.id,
    username: operador.nome,
    role: resolveRole(operador.role),
  };

  return jwt.sign(payload, ENV.SESSION_SECRET, {
    expiresIn: ttlSeconds,
  });
}

export function verifySession(token) {
  try {
    const payload = jwt.verify(token, ENV.SESSION_SECRET);
    return { ...payload, role: resolveRole(payload.role) };
  } catch {
    return null;
  }
}
