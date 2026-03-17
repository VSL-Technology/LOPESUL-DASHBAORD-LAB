import prisma from '@/lib/prisma';
import { trialDurationMinutes } from './config';

const MAC_REGEX = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

function normalizeMac(value) {
  if (!value) return null;
  const cleaned = String(value).trim().toUpperCase().replace(/-/g, ':');
  return MAC_REGEX.test(cleaned) ? cleaned : null;
}

function normalizeIp(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function ensureMac(value) {
  const normalized = normalizeMac(value);
  if (!normalized) {
    throw new Error('MAC address inválido');
  }
  return normalized;
}

export async function logDeviceEvent({ macAddress, ip, eventType, description, metadata }) {
  const normalizedMac = ensureMac(macAddress);
  const entry = await prisma.deviceAccessEvent.create({
    data: {
      macAddress: normalizedMac,
      ip: normalizeIp(ip),
      eventType,
      description: description ? String(description).slice(0, 512) : null,
      metadata: metadata || {},
    },
  });
  return entry;
}

export async function upsertDeviceSession({ macAddress, ip }) {
  const normalizedMac = ensureMac(macAddress);
  const now = new Date();
  const ipAddress = normalizeIp(ip);
  const existing = await prisma.deviceAccessSession.findUnique({ where: { macAddress: normalizedMac } });

  if (!existing) {
    const trialEndsAt = new Date(now.getTime() + trialDurationMinutes * 60 * 1000);
    return prisma.deviceAccessSession.create({
      data: {
        macAddress: normalizedMac,
        currentIp: ipAddress,
        status: 'TRIAL',
        trialStartedAt: now,
        trialEndsAt,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  return prisma.deviceAccessSession.update({
    where: { macAddress: normalizedMac },
    data: {
      currentIp: ipAddress || existing.currentIp,
      lastSeenAt: now,
    },
  });
}

export async function blockDeviceSession({ macAddress, ip, reason }) {
  const normalizedMac = ensureMac(macAddress);
  const now = new Date();
  const ipAddress = normalizeIp(ip);

  const session = await prisma.deviceAccessSession.upsert({
    where: { macAddress: normalizedMac },
    create: {
      macAddress: normalizedMac,
      currentIp: ipAddress,
      status: 'BLOCKED',
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      status: 'BLOCKED',
      currentIp: ipAddress || undefined,
      lastSeenAt: now,
    },
  });

  await logDeviceEvent({
    macAddress: normalizedMac,
    ip: ipAddress,
    eventType: 'BLOCKED',
    description: reason || 'Bloqueado pelo sistema',
    metadata: reason ? { reason } : {},
  });

  return session;
}

export async function activatePaidAccess({ macAddress, ip, planName, durationMinutes, orderId }) {
  const normalizedMac = ensureMac(macAddress);
  const now = new Date();
  const minutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : trialDurationMinutes;
  const paidEndsAt = new Date(now.getTime() + minutes * 60 * 1000);
  const ipAddress = normalizeIp(ip);

  const session = await prisma.deviceAccessSession.upsert({
    where: { macAddress: normalizedMac },
    create: {
      macAddress: normalizedMac,
      currentIp: ipAddress,
      status: 'PAID',
      paidStartedAt: now,
      paidEndsAt,
      lastPlanName: planName || null,
      lastOrderId: orderId || null,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      status: 'PAID',
      currentIp: ipAddress || undefined,
      paidStartedAt: now,
      paidEndsAt,
      lastPlanName: planName || null,
      lastOrderId: orderId || null,
      lastSeenAt: now,
    },
  });

  await logDeviceEvent({
    macAddress: normalizedMac,
    ip: ipAddress,
    eventType: 'PAID_ACTIVATED',
    description: planName || 'Plano pago',
    metadata: {
      orderId: orderId || null,
      durationMinutes: minutes,
    },
  });

  return session;
}

export async function expireTrialIfNeeded(session) {
  if (!session || session.status !== 'TRIAL' || !session.trialEndsAt) return;
  const now = new Date();
  if (now < session.trialEndsAt) return;
  await blockDeviceSession({ macAddress: session.macAddress, ip: session.currentIp, reason: 'trial_expired' });
}

export async function expirePaidIfNeeded(session) {
  if (!session || session.status !== 'PAID' || !session.paidEndsAt) return;
  const now = new Date();
  if (now < session.paidEndsAt) return;
  await prisma.deviceAccessSession.update({
    where: { id: session.id },
    data: { status: 'EXPIRED' },
  });
  await logDeviceEvent({
    macAddress: session.macAddress,
    ip: session.currentIp,
    eventType: 'PAID_EXPIRED',
    description: 'Plano pago expirado',
  });
  await blockDeviceSession({ macAddress: session.macAddress, ip: session.currentIp, reason: 'paid_expired' });
}

function describeRemainingSeconds(targetDate) {
  if (!targetDate) return null;
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 1000) : 0;
}

function buildStatePayload(session) {
  if (!session) return null;
  const state = {
    status: session.status,
    remainingSeconds: null,
    trialEndsAt: session.trialEndsAt ? session.trialEndsAt.toISOString() : null,
    paidEndsAt: session.paidEndsAt ? session.paidEndsAt.toISOString() : null,
    planName: session.lastPlanName || null,
    orderId: session.lastOrderId || null,
    currentIp: session.currentIp || null,
  };

  if (session.status === 'TRIAL') {
    state.remainingSeconds = describeRemainingSeconds(session.trialEndsAt);
    if (state.remainingSeconds === 0) {
      state.status = 'BLOCKED';
    }
  }

  if (session.status === 'PAID') {
    state.remainingSeconds = describeRemainingSeconds(session.paidEndsAt);
    if (state.remainingSeconds === 0) {
      state.status = 'BLOCKED';
    }
  }

  return state;
}

export async function getDeviceAccessState({ macAddress, ip }) {
  const normalizedMac = ensureMac(macAddress);
  const ipAddress = normalizeIp(ip);
  let session = await prisma.deviceAccessSession.findUnique({ where: { macAddress: normalizedMac } });

  if (session) {
    session = await prisma.deviceAccessSession.update({
      where: { macAddress: normalizedMac },
      data: {
        currentIp: ipAddress || session.currentIp,
        lastSeenAt: new Date(),
      },
    });
  } else {
    session = await upsertDeviceSession({ macAddress: normalizedMac, ip: ipAddress });
  }

  await expireTrialIfNeeded(session);
  await expirePaidIfNeeded(session);

  session = await prisma.deviceAccessSession.findUnique({ where: { macAddress: normalizedMac } });

  return buildStatePayload(session);
}
