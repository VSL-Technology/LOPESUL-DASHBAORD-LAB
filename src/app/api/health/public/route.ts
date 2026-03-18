export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'dashboard',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
}
