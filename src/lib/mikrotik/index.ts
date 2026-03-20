// src/lib/mikrotik/index.ts
// Módulo único de integração Mikrotik.
// Consolida: mikrotik.js, mikrotik.ts, mikrotikClient.ts,
//            mikrotikService.ts, mikrotikAccessControl.js, mikrotikLiberacao.js
//
// Arquitetura: todas as operações em produção passam pelo Relay (HTTP assinado).
// Conexão direta RouterOSAPI é mantida apenas para fallback e para o trial system.

import { RouterOSAPI } from 'routeros-api';
import prisma from '@/lib/prisma';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { relayAuthorize, relayRevoke } from '@/lib/relayClient';
import { logger } from '@/lib/logger';
import { normalizeIpAddress, normalizeMacAddress } from '@/lib/trial/validators';
import type { Pedido, Roteador, SessaoAtiva } from '@prisma/client';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface MikrotikConnection {
  write: (cmd: string, args?: string[]) => Promise<unknown[]>;
  close: () => void;
}

export interface ActiveUser {
  address: string;
  macAddress?: string;
  uptime?: string;
  comment?: string;
}

export interface MikrotikCommandResult {
  ok: boolean;
  command: string;
  status: number;
  data: unknown;
}

export interface MultiCommandResult {
  ok: boolean;
  results: MikrotikCommandResult[];
}

export interface RouterContext {
  roteador: Pick<Roteador, 'id' | 'nome' | 'ipLan' | 'usuario'>;
  userFallback?: string | null;
  requestId?: string;
}

export interface LiberaPorPedidoOptions {
  pedido: Pedido;
  ipOverride?: string | null;
  macOverride?: string | null;
  origem?: string;
  minutos?: number | null;
  criarSessao?: boolean;
}

export interface LiberaPorPedidoResult {
  ok: boolean;
  pedidoId: string;
  roteadorId?: string | null;
  sessaoId?: string | null;
  mikrotik?: unknown;
}

export interface RevogaPorSessaoOptions {
  sessao: SessaoAtiva;
  pedido?: Pedido | null;
}

export interface MultiRevogaResult {
  ok: boolean;
  roteadorId: string | null;
  mikrotik?: unknown;
}

// ─── Helpers de ambiente ──────────────────────────────────────────────────────

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function toBoolean(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMikrotikEnv() {
  // MIKROTIK_USE_SSL é o nome canônico; MIKROTIK_SSL é aceito para compatibilidade
  const ssl = toBoolean(process.env.MIKROTIK_USE_SSL ?? process.env.MIKROTIK_SSL);
  const portEnv = process.env.PORTA_MIKROTIK || process.env.MIKROTIK_PORT || '';
  const defaultPort = ssl ? 8729 : 8728;
  const resolvedPort = toPositiveNumber(portEnv || defaultPort, defaultPort);
  const timeout = toPositiveNumber(process.env.MIKROTIK_TIMEOUT_MS ?? process.env.MIKROTIK_TIMEOUT ?? 8000, 8000);

  if (resolvedPort === 8728) {
    // Aviso emitido uma única vez por processo (via módulo singleton)
    if (!getMikrotikEnv._warned8728) {
      getMikrotikEnv._warned8728 = true;
      console.warn(
        '[MIKROTIK] Conexão usando porta 8728 (plaintext). ' +
        'Recomendado: habilitar SSL no RouterOS e definir MIKROTIK_USE_SSL=true + MIKROTIK_PORT=8729'
      );
    }
  }

  return {
    host: process.env.MIKROTIK_HOST || process.env.MIKOTIK_HOST || '',
    user: process.env.MIKROTIK_USER || '',
    pass: process.env.MIKROTIK_PASS || '',
    port: resolvedPort,
    secure: ssl,
    timeout,
  };
}
// Propriedade estática para controle do aviso
getMikrotikEnv._warned8728 = false;

// ─── Conexão direta (RouterOSAPI) ─────────────────────────────────────────────

interface RouterConfig {
  host?: string;
  user?: string;
  pass?: string;
  password?: string;
  userPass?: string;
  port?: number | string;
  secure?: boolean;
  ssl?: boolean;
  timeout?: number | string;
}

function resolveRouterConfig(router: RouterConfig = {}): { host: string; user: string; password: string; port: number; timeout: number } {
  const env = getMikrotikEnv();
  const host = (router.host || env.host || '').trim();
  const user = (router.user || env.user || '').trim();
  const password = String(router.pass ?? router.password ?? router.userPass ?? env.pass ?? '');

  if (!host || !user || !password) {
    throw new Error('[MIKROTIK] credenciais incompletas para conexão');
  }

  const explicitSsl = typeof router.secure === 'boolean' ? router.secure :
    typeof router.ssl === 'boolean' ? router.ssl : env.secure;
  const defaultPort = explicitSsl ? 8729 : 8728;

  return {
    host,
    user,
    password,
    port: toPositiveNumber(router.port ?? defaultPort, defaultPort),
    timeout: toPositiveNumber(router.timeout ?? env.timeout, env.timeout),
  };
}

/**
 * Cria uma conexão direta com o Mikrotik via RouterOS API.
 * Use apenas para testes ou fallback — produção usa Relay.
 */
export async function connect(
  host: string,
  user: string,
  pass: string,
  port = 8728
): Promise<MikrotikConnection> {
  const conn = new RouterOSAPI({ host, user, password: pass, port, timeout: 8000 });
  await conn.connect();
  return conn as unknown as MikrotikConnection;
}

/** Conexão com retry (3 tentativas). */
export async function conectarMikrotik(router: RouterConfig = {}): Promise<MikrotikConnection> {
  const cfg = resolveRouterConfig(router);
  const MAX_ATTEMPTS = 3;
  const DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const conn = new RouterOSAPI({
      host: cfg.host,
      user: cfg.user,
      password: cfg.password,
      port: cfg.port,
      timeout: cfg.timeout,
    });

    try {
      logger.info({ host: cfg.host, port: cfg.port, attempt }, '[MIKROTIK] Tentando conectar');
      await conn.connect();
      logger.info({ host: cfg.host, attempt }, '[MIKROTIK] Conectado');
      return conn as unknown as MikrotikConnection;
    } catch (error: unknown) {
      logger.error({ attempt, host: cfg.host, error: (error as Error)?.message }, '[MIKROTIK] Falha na conexão');
      try { conn.close(); } catch { /* ignore */ }
      if (attempt === MAX_ATTEMPTS) throw new Error('[MIKROTIK] Falha definitiva ao conectar');
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  throw new Error('[MIKROTIK] Falha definitiva ao conectar');
}

/** Testa se é possível conectar ao Mikrotik. */
export async function testConnection(host: string, user: string, pass: string, port = 8728): Promise<boolean> {
  let conn: MikrotikConnection | null = null;
  try {
    conn = await connect(host, user, pass, port);
    return true;
  } catch {
    return false;
  } finally {
    try { conn?.close(); } catch { /* ignore */ }
  }
}

// ─── Operações diretas baixo nível ───────────────────────────────────────────

/** Adiciona IP binding no hotspot (tipo bypassed por padrão). */
export async function addIpBinding(
  conn: MikrotikConnection,
  mac: string,
  ip: string,
  type = 'bypassed',
  comment = 'LOPESUL'
): Promise<void> {
  const args = [`=address=${ip}`, `=type=${type}`, `=comment=${comment}`];
  if (mac) args.push(`=mac-address=${mac}`);
  await conn.write('/ip/hotspot/ip-binding/add', args);
}

/** Remove IP binding pelo endereço/MAC. */
export async function removeIpBinding(conn: MikrotikConnection, mac: string, ip?: string): Promise<void> {
  const filter = [mac ? `mac-address="${mac}"` : null, ip ? `address="${ip}"` : null]
    .filter(Boolean).join(' or ');
  if (!filter) return;
  await conn.write('/ip/hotspot/ip-binding/remove', [`[find ${filter}]`]).catch(() => {});
}

/** Remove sessão ativa do hotspot pelo IP/MAC. */
export async function removeActiveSession(conn: MikrotikConnection, mac: string, ip?: string): Promise<void> {
  const findParts = [mac ? `mac-address="${mac}"` : null, ip ? `address="${ip}"` : null]
    .filter(Boolean) as string[];
  if (!findParts.length) return;
  const filter = findParts.join(' or ');
  await conn.write('/ip/hotspot/active/remove', [`[find ${filter}]`]).catch(() => {});
  if (ip) {
    await conn.write('/ip/firewall/connection/remove', [`[find src-address~"${ip}" or dst-address~"${ip}"]`]).catch(() => {});
  }
}

/** Lista usuários ativos no hotspot. */
export async function listActiveUsers(conn: MikrotikConnection): Promise<ActiveUser[]> {
  try {
    const rows = await conn.write('/ip/hotspot/active/print', ['detail']) as Record<string, string>[];
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      address: r.address || '',
      macAddress: r['mac-address'],
      uptime: r.uptime,
      comment: r.comment,
    }));
  } catch {
    return [];
  }
}

// ─── Relay — execução de comandos ─────────────────────────────────────────────

function resolveRelayCredentials(ctx: RouterContext) {
  const host = ctx.roteador.ipLan?.trim();
  const user = process.env.MIKROTIK_USER || ctx.roteador.usuario || '';
  const pass = process.env.MIKROTIK_PASS || '';

  if (!host || !user || !pass) {
    throw new Error(`[MIKROTIK] credenciais relay ausentes para roteador ${ctx.roteador.id}`);
  }
  return { host, user, pass };
}

export async function execOnRouter(ctx: RouterContext, command: string): Promise<MikrotikCommandResult> {
  const { host, user, pass } = resolveRelayCredentials(ctx);
  const out = await relayFetchSigned({
    method: 'POST',
    originalUrl: '/relay/exec',
    body: { host, user, pass, command },
    requestId: ctx.requestId,
  });
  const body = (out?.data || {}) as Record<string, unknown>;
  return { ok: out.ok && body?.ok !== false, command, status: out.status, data: body };
}

async function execMultiOnRouter(
  ctx: RouterContext,
  commands: string[]
): Promise<MultiCommandResult> {
  if (commands.length === 0) return { ok: true, results: [] };
  const results: MikrotikCommandResult[] = [];
  let allOk = true;

  for (const cmd of commands) {
    try {
      const res = await execOnRouter(ctx, cmd);
      results.push(res);
      if (!res.ok) allOk = false;
    } catch (e: unknown) {
      results.push({ ok: false, command: cmd, status: 500, data: { error: (e as Error)?.message ?? String(e) } });
      allOk = false;
    }
  }
  return { ok: allOk, results };
}

export async function liberarClienteOnRouter(
  ctx: RouterContext,
  input: { ip?: string | null; mac?: string | null; username?: string | null; comment?: string | null }
): Promise<MultiCommandResult> {
  const comment = (input.comment || '').slice(0, 64) || 'painel';
  const commands: string[] = [];

  if (input.ip) commands.push(`/ip/firewall/address-list/add list=paid_clients address=${input.ip} comment="${comment}"`);
  if (input.mac) commands.push(`/interface/wireless/access-list/add mac-address=${input.mac} comment="${comment}"`);
  if (input.username) commands.push(`/ip/hotspot/user/add name=${input.username} password=${input.username}`);

  return execMultiOnRouter(ctx, commands);
}

export async function revogarClienteOnRouter(
  ctx: RouterContext,
  input: { ip?: string | null; mac?: string | null; username?: string | null }
): Promise<MultiCommandResult> {
  const commands: string[] = [];

  if (input.ip) commands.push(`/ip/firewall/address-list/remove [find list=paid_clients address=${input.ip}]`);
  if (input.mac) commands.push(`/interface/wireless/access-list/remove [find mac-address=${input.mac}]`);
  if (input.username) commands.push(`/ip/hotspot/user/remove [find name=${input.username}]`);

  return execMultiOnRouter(ctx, commands);
}

// ─── Alto nível — roteador por Pedido / Sessão ────────────────────────────────

function pickIpMac(pedido: Pedido, override?: { ip?: string | null; mac?: string | null }) {
  const ip = (override?.ip || pedido.ip || '').toString().trim() || null;
  const mac = (override?.mac || pedido.deviceMac || '').trim().toUpperCase() || null;
  return { ip, mac };
}

function requireIdentity(roteador: Roteador): string {
  const identity = (roteador as unknown as { identity?: string })?.identity;
  if (!identity || !identity.trim()) {
    const err = new Error('Missing router identity (required for Relay calls)');
    (err as NodeJS.ErrnoException).code = 'MISSING_ROUTER_IDENTITY';
    throw err;
  }
  return identity.trim();
}

async function resolveRoteadorFromPedido(pedido: Pedido): Promise<Roteador | null> {
  const meta = pedido.metadata as Record<string, unknown> | null;
  if (meta?.roteadorId && typeof meta.roteadorId === 'string') {
    const r = await prisma.roteador.findUnique({ where: { id: meta.roteadorId } });
    if (r) return r;
  }

  if (pedido.busId) {
    const frota = await prisma.frota.findUnique({
      where: { id: pedido.busId },
      include: { roteador: true },
    }).catch(() => null);

    if (frota?.roteador) return frota.roteador;
    if (frota?.roteadorId) {
      const r = await prisma.roteador.findUnique({ where: { id: frota.roteadorId } });
      if (r) return r;
    }
  }

  return null;
}

export async function liberarAcessoPorPedido(opts: LiberaPorPedidoOptions): Promise<LiberaPorPedidoResult> {
  const { pedido } = opts;
  const roteador = await resolveRoteadorFromPedido(pedido);

  if (!roteador) {
    logger.warn({ pedidoId: pedido.id, busId: pedido.busId }, '[MIKROTIK] Nenhum roteador para pedido');
    return { ok: false, pedidoId: pedido.id, roteadorId: null, mikrotik: { error: 'roteador_not_found' } };
  }

  const { ip, mac } = pickIpMac(pedido, { ip: opts.ipOverride, mac: opts.macOverride });

  if (!ip && !mac) {
    return { ok: false, pedidoId: pedido.id, roteadorId: roteador.id, mikrotik: { error: 'missing_ip_mac' } };
  }

  const identity = requireIdentity(roteador);
  const mkResult = await relayAuthorize({
    identity,
    pedidoId: pedido.id,
    mac: mac ?? undefined,
    ip: ip ?? undefined,
    plano: { minutos: opts.minutos ?? undefined, perfil: pedido.description ?? undefined },
  });

  let sessaoId: string | null = null;
  if (opts.criarSessao) {
    const minutos = Number.isFinite(opts.minutos as number) ? (opts.minutos as number) : 120;
    const now = new Date();
    const sessao = await prisma.sessaoAtiva.create({
      data: {
        ipCliente: ip || `sem-ip-${pedido.id}`.slice(0, 255),
        macCliente: mac,
        plano: pedido.description || 'Acesso',
        inicioEm: now,
        expiraEm: new Date(now.getTime() + minutos * 60 * 1000),
        ativo: true,
        pedidoId: pedido.id,
        roteadorId: roteador.id,
      },
    });
    sessaoId = sessao.id;
  }

  return { ok: mkResult.ok, pedidoId: pedido.id, roteadorId: roteador.id, sessaoId, mikrotik: mkResult };
}

export async function revogarAcessoPorSessao(opts: RevogaPorSessaoOptions): Promise<MultiRevogaResult> {
  const { sessao } = opts;
  let roteador: Roteador | null = null;

  if (sessao.roteadorId) {
    roteador = await prisma.roteador.findUnique({ where: { id: sessao.roteadorId } });
  } else if (sessao.pedidoId) {
    const pedido = opts.pedido ?? (await prisma.pedido.findUnique({ where: { id: sessao.pedidoId } }));
    if (pedido) roteador = await resolveRoteadorFromPedido(pedido);
  }

  if (!roteador) {
    logger.warn({ sessaoId: sessao.id }, '[MIKROTIK] revogar: nenhum roteador para sessão');
    return { ok: false, roteadorId: null, mikrotik: { error: 'roteador_not_found' } };
  }

  const ip = sessao.ipCliente || null;
  const mac = (sessao.macCliente || '').trim().toUpperCase() || null;
  const identity = requireIdentity(roteador);

  const mkResult = await relayRevoke({
    identity,
    pedidoId: sessao.pedidoId ?? undefined,
    sessionId: sessao.id,
    mac: mac ?? undefined,
    ip: ip ?? undefined,
  });

  return { ok: mkResult.ok, roteadorId: roteador.id, mikrotik: mkResult };
}

// ─── Compat: liberarAcesso / revogarAcesso (usados por rotas legadas) ─────────

export async function liberarAcesso(args: { ip?: string | null; mac?: string | null; minutos?: number | null }) {
  const ip = (args.ip || '').trim() || null;
  const mac = (args.mac || '').trim().toUpperCase() || null;

  const pedido = await prisma.pedido.findFirst({
    where: {
      status: 'PAID',
      OR: [ip ? { ip } : undefined, mac ? { deviceMac: mac } : undefined].filter(Boolean) as object[],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pedido) {
    logger.warn({ ip, mac }, '[MIKROTIK] liberarAcesso: nenhum pedido PAID para IP/MAC');
    return { ok: false, reason: 'pedido_not_found' };
  }

  return liberarAcessoPorPedido({ pedido, ipOverride: ip, macOverride: mac, origem: 'legacy/liberarAcesso', minutos: args.minutos ?? null, criarSessao: true });
}

export async function revogarAcesso(args: { ip?: string | null; mac?: string | null }) {
  const ip = (args.ip || '').trim() || null;
  const mac = (args.mac || '').trim().toUpperCase() || null;

  const sessao = await prisma.sessaoAtiva.findFirst({
    where: {
      ativo: true,
      OR: [ip ? { ipCliente: ip } : undefined, mac ? { macCliente: mac } : undefined].filter(Boolean) as object[],
    },
    orderBy: { inicioEm: 'desc' },
  });

  if (!sessao) {
    logger.warn({ ip, mac }, '[MIKROTIK] revogarAcesso: nenhuma sessão ativa para IP/MAC');
    return { ok: false, reason: 'sessao_not_found' };
  }

  const res = await revogarAcessoPorSessao({ sessao });
  if (res.ok) {
    await prisma.sessaoAtiva.update({ where: { id: sessao.id }, data: { ativo: false, expiraEm: new Date() } }).catch(() => {});
  }
  return res;
}

// Alias para rotas que importam revogarCliente
export const revogarCliente = revogarAcesso;

// ─── liberarCliente (simples, por IP via conexão direta) ──────────────────────

export async function liberarCliente(ip: string): Promise<true> {
  const ipAddress = String(ip || '').trim();
  if (!ipAddress) throw new Error('[MIKROTIK] IP inválido para liberação');

  let conn: MikrotikConnection | null = null;
  try {
    conn = await conectarMikrotik();
    logger.info({ ip: ipAddress }, '[MIKROTIK] Liberando cliente via conexão direta');
    await conn.write('/ip/hotspot/ip-binding/add', [
      `=address=${ipAddress}`,
      '=type=bypassed',
      '=comment=LIBERADO-LOPESUL',
    ]);
    return true;
  } finally {
    try { conn?.close(); } catch { /* ignore */ }
  }
}

// ─── Trial / Controle de Acesso (mikrotikAccessControl) ─────────────────────

async function withConnection<T>(action: (conn: MikrotikConnection) => Promise<T>): Promise<T> {
  const conn = await conectarMikrotik();
  try {
    return await action(conn);
  } finally {
    try { conn?.close(); } catch { /* ignore */ }
  }
}

export async function liberarTrial(args: { ip: string; macAddress?: string }) {
  const ipAddress = normalizeIpAddress(args.ip);
  if (!ipAddress) throw new Error('[MIKROTIK] IP inválido para liberação de trial');
  const mac = normalizeMacAddress(args.macAddress || '');

  logger.info({ ip: ipAddress, mac }, '[MIKROTIK] liberando trial');

  return withConnection(async (conn) => {
    const bindingArgs = [`=address=${ipAddress}`, '=type=bypassed', '=comment=TRIAL-LOPESUL'];
    if (mac) bindingArgs.push(`=mac-address=${mac}`);
    await conn.write('/ip/hotspot/ip-binding/add', bindingArgs);
    await addIpBinding(conn, mac || '', ipAddress, 'bypassed', 'TRIAL-LOPESUL').catch(() => {});
    await removeActiveSession(conn, mac || '', ipAddress);
  });
}

export async function liberarPago(args: { ip: string; macAddress?: string; planName?: string }) {
  const ipAddress = normalizeIpAddress(args.ip);
  if (!ipAddress) throw new Error('[MIKROTIK] IP inválido para liberação paga');
  const mac = normalizeMacAddress(args.macAddress || '');

  logger.info({ ip: ipAddress, mac, planName: args.planName }, '[MIKROTIK] liberando acesso pago');

  return withConnection(async (conn) => {
    const bindingArgs = [`=address=${ipAddress}`, '=type=bypassed', '=comment=PAGO-LOPESUL'];
    if (mac) bindingArgs.push(`=mac-address=${mac}`);
    await conn.write('/ip/hotspot/ip-binding/add', bindingArgs);
    await addIpBinding(conn, mac || '', ipAddress, 'bypassed', 'PAGO-LOPESUL').catch(() => {});
    await removeActiveSession(conn, mac || '', ipAddress);
  });
}

export async function bloquearAcesso(args: { ip?: string; macAddress?: string; reason?: string }) {
  const ipAddress = normalizeIpAddress(args.ip || '');
  const mac = normalizeMacAddress(args.macAddress || '');
  if (!ipAddress && !mac) {
    logger.warn({ ip: args.ip, mac: args.macAddress }, '[MIKROTIK] nada para bloquear');
    return;
  }

  logger.info({ ip: ipAddress, mac, reason: args.reason }, '[MIKROTIK] bloqueando acesso');

  return withConnection(async (conn) => {
    await removeIpBinding(conn, mac || '', ipAddress || undefined);
    await removeActiveSession(conn, mac || '', ipAddress || undefined);
  });
}

export async function garantirEstadoMikrotik(args: { status: string; ip?: string; macAddress?: string; planName?: string }) {
  const normalizedStatus = String(args.status || '').toUpperCase();
  try {
    if (normalizedStatus === 'TRIAL') { await liberarTrial({ ip: args.ip || '', macAddress: args.macAddress }); return; }
    if (normalizedStatus === 'PAID') { await liberarPago({ ip: args.ip || '', macAddress: args.macAddress, planName: args.planName }); return; }
    if (normalizedStatus === 'BLOCKED' || normalizedStatus === 'EXPIRED') {
      await bloquearAcesso({ ip: args.ip, macAddress: args.macAddress, reason: `status_${normalizedStatus.toLowerCase()}` });
      return;
    }
    logger.warn({ status: args.status }, '[MIKROTIK] estado desconhecido');
  } catch (error: unknown) {
    logger.error({ error: (error as Error)?.message, status: args.status }, '[MIKROTIK] falha ao sincronizar estado');
    throw error;
  }
}

// ─── Utilidades extras ────────────────────────────────────────────────────────

export async function getStarlinkStatus(router?: RouterConfig) {
  const conn = await conectarMikrotik(router);
  try {
    const pingTarget = process.env.STARLINK_PING_TARGET || '1.1.1.1';
    const rows = await conn.write(`/ping address=${pingTarget} count=3`) as Record<string, string>[];
    const list = Array.isArray(rows) ? rows : [];
    const rowWithTime = list.find((item) => item?.time);
    const raw = rowWithTime?.time ? String(rowWithTime.time).replace(/ms$/i, '') : '';
    const rtt = Number.isFinite(Number(raw)) ? Number(raw) : null;
    return { ok: true, connected: true, rtt_ms: rtt };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error)?.message ?? String(err) };
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

export async function listPppActive(router?: RouterConfig) {
  const conn = await conectarMikrotik(router);
  try {
    const data = await conn.write('/ppp/active/print detail');
    return { ok: true, data };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error)?.message ?? String(err) };
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

// ─── Default export (compatibilidade com import default) ─────────────────────

const mikrotik = {
  getMikrotikEnv,
  connect,
  conectarMikrotik,
  testConnection,
  addIpBinding,
  removeIpBinding,
  removeActiveSession,
  listActiveUsers,
  execOnRouter,
  liberarClienteOnRouter,
  revogarClienteOnRouter,
  liberarAcessoPorPedido,
  revogarAcessoPorSessao,
  liberarAcesso,
  revogarAcesso,
  revogarCliente,
  liberarCliente,
  liberarTrial,
  liberarPago,
  bloquearAcesso,
  garantirEstadoMikrotik,
  getStarlinkStatus,
  listPppActive,
};

export default mikrotik;
