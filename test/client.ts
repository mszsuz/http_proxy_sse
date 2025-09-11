import http from 'http';
import fs from 'fs';
import path from 'path';

const settings = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'settings.json'), 'utf8')
);
const PROXY_PORT = settings?.listen?.port || 3002;
const TEST_HOST = settings?.test?.serverHost || 'localhost';
const TEST_PORT = settings?.test?.serverPort || 8081;

function post(path: string, body: any, cb: (code: number, headers: any, text: string) => void) {
  const data = Buffer.from(JSON.stringify(body));
  const req = http.request({
    hostname: 'localhost', port: PROXY_PORT, path, method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': data.length
    }
  }, (res) => {
    let buf = Buffer.alloc(0);
    res.on('data', c => buf = Buffer.concat([buf, c]));
    res.on('end', () => cb(res.statusCode || 0, res.headers, buf.toString('utf8')));
  });
  req.on('error', (e) => console.error('client error:', e));
  req.write(data);
  req.end();
}

// 1) Проверка JSON passthrough
post('/proxy', {
  method: 'POST',
  url: `http://${TEST_HOST}:${TEST_PORT}/json`,
  headers: { 'Accept': 'application/json' },
  body: { ping: 'pong' }
}, (code, headers, text) => {
  console.log('JSON passthrough:', code, headers['content-type']);
  console.log(text);
});

// 2) Проверка SSE aggregation
post('/proxy', {
  method: 'GET',
  url: `http://${TEST_HOST}:${TEST_PORT}/sse`,
  headers: { 'Accept': 'text/event-stream' }
}, (code, headers, text) => {
  console.log('SSE aggregated:', code, headers['content-type']);
  console.log(text);
});


