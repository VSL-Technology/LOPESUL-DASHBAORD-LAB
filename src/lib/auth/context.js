// src/lib/auth/context.js
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth/session';
import { getMaintenanceFlag } from '@/lib/config/state';

export async function getRequestAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value || null;
  const session = token ? verifySession(token) : null;
  const maintenance = await getMaintenanceFlag();

  return {
    session,
    maintenance,
    isMaster: session?.role === 'MASTER' || session?.role === 'ADMIN',
    role: session?.role || 'READER',
  };
}
