// API para fazer upload do redirect.html para o MikroTik via fetch
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { relayFetchSigned } from '@/lib/relayFetchSigned';
import { requireMutationAuth } from '@/lib/auth/requireMutationAuth';
import { applySecurityHeaders } from '@/lib/security/httpGuards';
import { getOrCreateRequestId } from '@/lib/security/requestId';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const started = Date.now();
  const requestId = getOrCreateRequestId(req);
  const auth = await requireMutationAuth(req, { role: 'MASTER' });
  if (auth instanceof Response) return auth;

  try {
    const RELAY_URL = process.env.RELAY_BASE_URL || process.env.RELAY_URL || process.env.RELAY_BASE || '';
    const RELAY_TOKEN = process.env.RELAY_TOKEN || process.env.RELAY_API_TOKEN;
    const RELAY_API_SECRET = process.env.RELAY_API_SECRET;

    if (!RELAY_TOKEN) {
      logger.error('[Upload Redirect] RELAY_TOKEN missing');
      recordApiMetric('mikrotik_upload_redirect', { durationMs: Date.now() - started, ok: false });
      return json({ ok: false, error: 'RELAY_TOKEN not configured' }, 500);
    }
    if (!RELAY_API_SECRET) {
      logger.error('[Upload Redirect] RELAY_API_SECRET missing');
      recordApiMetric('mikrotik_upload_redirect', { durationMs: Date.now() - started, ok: false });
      return json({ ok: false, error: 'RELAY_API_SECRET not configured' }, 500);
    }
    if (!RELAY_URL) {
      logger.error('[Upload Redirect] RELAY_URL/RELAY_BASE_URL missing');
      recordApiMetric('mikrotik_upload_redirect', { durationMs: Date.now() - started, ok: false });
      return json({ ok: false, error: 'RELAY_URL not configured' }, 500);
    }

    // HTML do redirect com variáveis MikroTik
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Redirecionando...</title>
<meta http-equiv="refresh" content="0; url=https://cativo.lopesuldashboardwifi.com/?mac=$(mac)&ip=$(ip)">
</head>
<body>
<script>
var mac = "$(mac)";
var ip = "$(ip)";
if (mac && ip) {
  window.location.href = "https://cativo.lopesuldashboardwifi.com/?mac=" + encodeURIComponent(mac) + "&ip=" + encodeURIComponent(ip);
} else {
  window.location.href = "https://cativo.lopesuldashboardwifi.com/";
}
</script>
<p style="text-align:center;font-family:sans-serif;margin-top:50px;">
Redirecionando para o portal de pagamento...<br>
<small>Aguarde</small>
</p>
</body>
</html>`;

    // Encodar em base64 para o MikroTik
    const base64Content = Buffer.from(redirectHtml).toString('base64');

    logger.info('[Upload Redirect] Enviando arquivo via Relay endpoint declarativo...');

    const response = await relayFetchSigned({
      method: 'POST',
      originalUrl: '/relay/hotspot/upload-redirect',
      baseUrl: RELAY_URL,
      token: RELAY_TOKEN,
      apiSecret: RELAY_API_SECRET,
      headers: { 'x-request-id': requestId },
      body: {
        htmlBase64: base64Content,
        path: 'hotspot4/redirect.html',
      },
    }).catch((err) => {
      logger.warn({ err: err?.message || err }, '[Upload Redirect] Relay upload failed');
      return {
        ok: false,
        status: err?.status || 0,
        data: err?.data || null,
      };
    });

    const result = response?.data || null;
    logger.info({ result }, '[Upload Redirect] Resposta do relay');

    if (!response || !response.ok || !result?.ok) {
      return json({
        ok: false,
        error: 'Upload via Relay falhou. Será necessário upload manual.',
        details: result || { message: 'relay_unreachable' },
        instruction: 'Conecte via WinBox, vá em Files, navegue até hotspot4/ e faça upload do arquivo redirect.html',
        file_content: redirectHtml,
      });
    }

    recordApiMetric('mikrotik_upload_redirect', { durationMs: Date.now() - started, ok: true });
    return json({
      ok: true,
      message: 'Arquivo redirect.html enviado para o MikroTik com sucesso!',
      path: 'hotspot4/redirect.html',
      details: result,
    });

  } catch (error) {
    logger.error({ error: error?.message || error }, '[Upload Redirect] Erro');
    recordApiMetric('mikrotik_upload_redirect', { durationMs: Date.now() - started, ok: false });
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}

export async function GET() {
  // Retorna o conteúdo do redirect.html para visualização/download
  const redirectHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Redirecionando...</title>
<meta http-equiv="refresh" content="0; url=https://cativo.lopesuldashboardwifi.com/?mac=$(mac)&ip=$(ip)">
</head>
<body>
<script>
var mac = "$(mac)";
var ip = "$(ip)";
if (mac && ip) {
  window.location.href = "https://cativo.lopesuldashboardwifi.com/?mac=" + encodeURIComponent(mac) + "&ip=" + encodeURIComponent(ip);
} else {
  window.location.href = "https://cativo.lopesuldashboardwifi.com/";
}
</script>
<p style="text-align:center;font-family:sans-serif;margin-top:50px;">
Redirecionando para o portal de pagamento...<br>
<small>Aguarde</small>
</p>
</body>
</html>`;

  return new Response(redirectHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="redirect.html"',
    },
  });
}

function json(payload, status = 200) {
  return applySecurityHeaders(NextResponse.json(payload, { status }), { noStore: true });
}
