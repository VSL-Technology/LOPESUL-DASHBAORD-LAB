// src/lib/config/state.js
import prisma from '@/lib/prisma';

let maintenanceCache = {
  value: false,
  expiresAt: 0,
};

export async function getMaintenanceFlag({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && maintenanceCache.expiresAt > now) {
    return maintenanceCache.value;
  }

  try {
    const row = await prisma.config.findUnique({
      where: { key: 'maintenance' },
      select: { value: true },
    });
    const next = String(row?.value ?? 'false') === 'true';
    maintenanceCache = { value: next, expiresAt: now + 5_000 };
    return next;
  } catch {
    return maintenanceCache.value;
  }
}

export async function setMaintenanceFlag(active) {
  const value = active ? 'true' : 'false';
  await prisma.config.upsert({
    where: { key: 'maintenance' },
    update: { value },
    create: { key: 'maintenance', value },
  });
  maintenanceCache = { value: active, expiresAt: Date.now() + 5_000 };
  return active;
}
