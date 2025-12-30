import http from 'http';

const port = process.env.PORT || 9999;

const server = http.createServer((req, res) => {
  const { method, url, headers } = req;
  let body = '';
  req.on('data', (chunk) => { body += chunk.toString(); });
  req.on('end', () => {
    console.log('[WEBHOOK] %s %s', method, url);
    console.log('[WEBHOOK] headers:', JSON.stringify(headers));
    console.log('[WEBHOOK] body:', body);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});

server.listen(port, () => console.log('[WEBHOOK] listening on', port));

// Graceful shutdown
process.on('SIGINT', () => { console.log('[WEBHOOK] SIGINT, shutting down'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { console.log('[WEBHOOK] SIGTERM, shutting down'); server.close(() => process.exit(0)); });
