import { conectarMikrotik } from './mikrotik';

export async function liberarCliente(ip) {
  const ipAddress = String(ip || '').trim();
  if (!ipAddress) {
    throw new Error('IP inválido para liberação');
  }

  let conn;
  try {
    conn = await conectarMikrotik();
    console.log('🚀 Liberando cliente no MikroTik:', ipAddress);
    await conn.write('/ip/hotspot/ip-binding/add', [
      `=address=${ipAddress}`,
      '=type=bypassed',
      '=comment=LIBERADO-LOPESUL',
    ]);
    console.log('✅ Cliente liberado com sucesso:', ipAddress);
    return true;
  } catch (error) {
    console.error('❌ Erro ao liberar cliente:', {
      ip: ipAddress,
      erro: error?.message || error,
    });
    throw error;
  } finally {
    try {
      conn?.close?.();
    } catch (closeErr) {
      console.warn('[MIKROTIK] falha ao fechar conexão após liberação:', closeErr?.message || closeErr);
    }
  }
}
