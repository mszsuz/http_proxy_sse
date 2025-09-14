import http from 'http';
import fs from 'fs';
import path from 'path';

const settings = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'settings.json'), 'utf8')
);
const PORT = settings?.test?.serverPort || 8081;
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/sse' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    let i = 0;
    const timer = setInterval(() => {
      i++;
      res.write(`data: {"n":${i},"msg":"hello #${i}"}\n\n`);
      if (i >= 3) {
        clearInterval(timer);
        res.end();
      }
    }, 300);
    return;
  }

  if (req.url === '/json' && req.method === 'POST') {
    let body = Buffer.alloc(0);
    req.on('data', (c) => { body = Buffer.concat([body, c]); });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, echo: body.toString('utf8') }));
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`test sse server http://${HOST}:${PORT}`);
});


