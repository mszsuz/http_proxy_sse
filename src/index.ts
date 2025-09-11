import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { URL } from 'url';

type Settings = {
  listen: { host: string; port: number };
  requestTimeoutDefault: number;
  sseReadTimeoutDefault: number;
  sseMaxBodyBytes: number;
  sseMaxDurationSec: number;
  onLimit: '413' | '504' | 'close';
  tls: { rejectUnauthorized: boolean; caFile: string };
  cors: { enabled: boolean; allowedOrigins: string[] | '*'};
  sse: { responseContentType: string; aggregationMode?: 'raw' | 'final-text' | 'smart' };
  upstream: { allowedHosts: string[] };
  limits: { maxRequestBodyBytes: number };
  health: { enabled: boolean; paths: { healthz: string; ready: string } };
};

function readSettings(): Settings {
  const candidates = [
    path.resolve(__dirname, '..', 'settings.json'),
    path.resolve(process.cwd(), 'settings.json'),
    path.resolve(process.cwd(), 'http_proxy_sse', 'settings.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  throw new Error('settings.json not found near src/ or cwd');
}

const settings: Settings = readSettings();

const app = express();

if (settings.cors.enabled) {
  if (settings.cors.allowedOrigins === '*') {
    app.use(cors());
  } else {
    app.use(cors({ origin: settings.cors.allowedOrigins }));
  }
}

app.use(express.raw({ type: '*/*', limit: settings.limits.maxRequestBodyBytes || undefined }));

if (settings.health.enabled) {
  app.get(settings.health.paths.healthz, (_req, res) => res.send('ok'));
  app.get(settings.health.paths.ready, (_req, res) => res.send('ready'));
}

// logging/masking не используется

function allowedHost(u: URL): boolean {
  const wl = settings.upstream.allowedHosts || [];
  if (!wl.length) return true;
  return wl.includes(u.hostname);
}

app.post('/proxy', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.toString('utf8')) as {
      method: string;
      url: string;
      headers?: Record<string, string>;
      timeout?: number;
      body?: any;
      sse?: { aggregationMode?: 'raw' | 'final-text' | 'smart'; responseContentType?: string };
      tls?: { rejectUnauthorized?: boolean };
    };

    const { method, url, headers = {}, timeout, body } = payload;
    if (!method || !url) {
      res.status(400).send('method and url are required');
      return;
    }

    const u = new URL(url);
    if (!allowedHost(u)) {
      res.status(403).send('upstream host not allowed');
      return;
    }

    const agentOptions = { rejectUnauthorized: (payload.tls?.rejectUnauthorized ?? settings.tls.rejectUnauthorized) } as https.AgentOptions;
    if (settings.tls.caFile && fs.existsSync(settings.tls.caFile)) {
      agentOptions.ca = fs.readFileSync(settings.tls.caFile);
    }

    const isHttps = u.protocol === 'https:';
    const agent = isHttps ? new https.Agent(agentOptions) : new http.Agent();

    const options: https.RequestOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers,
      agent,
      timeout: 1000 * (timeout ?? settings.requestTimeoutDefault)
    };

    const upstream = (isHttps ? https : http).request(options, (up) => {
      const contentType = String(up.headers['content-type'] || '').toLowerCase();
      const isSse = contentType.includes('text/event-stream');

      if (!isSse) {
        // strict passthrough: статус, заголовки, тело как есть
        res.status(up.statusCode || 200);
        Object.entries(up.headers).forEach(([k, v]) => {
          if (v !== undefined) res.setHeader(k, v as any);
        });
        up.pipe(res);
        return;
      }

      // SSE aggregation
      const start = Date.now();
      let total = 0;
      let chunks: Buffer[] = [];
      let bufferText = '';
      let lastAssistantLen = 0;

      // заменяем заголовки для агрегированного ответа
      res.status(up.statusCode || 200);
      const perReqRespCT = payload.sse?.responseContentType || settings.sse.responseContentType;
      res.setHeader('Content-Type', perReqRespCT);

      const sseTimeoutMs = (settings.sseReadTimeoutDefault || 0) * 1000;
      let timer: NodeJS.Timeout | null = null;
      if (sseTimeoutMs > 0) {
        timer = setTimeout(() => {
          try { up.destroy(new Error('SSE read timeout')); } catch {}
        }, sseTimeoutMs);
      }

      const aggMode: 'raw' | 'final-text' | 'smart' = (payload.sse?.aggregationMode || (settings as any).sse?.aggregationMode || 'raw');

      up.on('data', (c: Buffer) => {
        chunks.push(c);
        total += c.length;
        if (aggMode === 'final-text' || aggMode === 'smart') {
          // Пытаемся распознавать SSE и извлекать финальный текст ассистента
          bufferText += c.toString('utf8');
          const lines = bufferText.split(/\r?\n/);
          // оставим последнюю незавершенную строку в буфере
          bufferText = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const dataStr = line.substring(5).trim();
              try {
                const obj = JSON.parse(dataStr);
                const role = obj?.role;
                const finished = !!obj?.finished;
                const contentText = obj?.content?.text;
                if (role === 'assistant' && typeof contentText === 'string') {
                  if (aggMode === 'final-text') {
                    // Кумулятивная или дельтовая: универсально обновляем current по схеме
                    if (contentText.length >= lastAssistantLen) {
                      // кумулятивная — заменяем
                      (up as any)._finalText = contentText;
                      lastAssistantLen = contentText.length;
                    } else {
                      // дельтовая — добавляем
                      (up as any)._finalText = ((up as any)._finalText || '') + contentText;
                      lastAssistantLen = ((up as any)._finalText as string).length;
                    }
                  } else if (aggMode === 'smart') {
                    // В smart режиме оставим обе стратегии и в конце вернём наиболее длинную версию
                    const prev = (up as any)._smartText || '';
                    const candidate = contentText.length >= prev.length ? contentText : (prev + contentText);
                    (up as any)._smartText = candidate;
                  }
                }
                // флаг finished учтём при завершении потока в обработчике 'end'
              } catch {
                // не JSON — игнорируем
              }
            }
          }
        }
        if (settings.sseMaxBodyBytes > 0 && total > settings.sseMaxBodyBytes) {
          if (timer) clearTimeout(timer);
          if (settings.onLimit === 'close') {
            up.destroy();
            res.end();
          } else {
            res.status(settings.onLimit === '413' ? 413 : 504).end();
            up.destroy();
          }
        }
        if (settings.sseMaxDurationSec > 0 && Date.now() - start > settings.sseMaxDurationSec * 1000) {
          if (timer) clearTimeout(timer);
          if (settings.onLimit === 'close') {
            up.destroy();
            res.end();
          } else {
            res.status(settings.onLimit === '413' ? 413 : 504).end();
            up.destroy();
          }
        }
      });

      up.on('end', () => {
        if (timer) clearTimeout(timer);
        if (aggMode === 'final-text') {
          const finalText = (up as any)._finalText || '';
          res.end(Buffer.from(finalText, 'utf8'));
          return;
        }
        if (aggMode === 'smart') {
          const smartText = (up as any)._smartText || '';
          res.end(Buffer.from(smartText, 'utf8'));
          return;
        }
        const body = Buffer.concat(chunks);
        res.end(body);
      });

      up.on('error', (e) => {
        if (timer) clearTimeout(timer);
        res.status(502).send(String(e.message || e));
      });
    });

    upstream.on('error', (e) => {
      res.status(502).send(String((e as any).message || e));
    });

    if (body !== undefined) {
      // передаём тело как есть
      if (Buffer.isBuffer(body)) {
        upstream.write(body);
      } else if (typeof body === 'string') {
        upstream.write(body);
      } else {
        // если клиент прислал JSON-объект — сериализуем
        upstream.write(JSON.stringify(body));
      }
    }
    upstream.end();
  } catch (e: any) {
    res.status(400).send('bad request');
  }
});

const server = app.listen(settings.listen.port, settings.listen.host, () => {
  console.log(`http-proxy-sse listening on http://${settings.listen.host}:${settings.listen.port}`);
});


