## http_proxy_sse — универсальный HTTP‑прокси (Node.js) с агрегацией SSE

Стек: Node.js + TypeScript (Express/Undici).  
Цель: предоставить простой прокси‑сервис, который:
- Проксирует любые HTTP-запросы к целевому серверу.
- Если целевой сервер отвечает Server-Sent Events (SSE, `text/event-stream`), прокси «собирает» поток целиком и возвращает клиенту финальный ответ одним ответом (без стриминга).
- Подходит для случаев, когда клиенту неудобно/невозможно обрабатывать SSE (например, ограниченный рантайм, инструменты интеграции, простые тесты).

### Ключевые требования и поведение
- Прокси НИЧЕГО не добавляет к запросу клиента. Метод, URL, заголовки и тело передаются «как есть» (pass‑through).
- Если ответ НЕ SSE (нет `text/event-stream` и тело не начинается с `data:`) — прокси возвращает статус, заголовки и тело ответа сервера БЕЗ изменений.
- Если ответ SSE — прокси читает поток до конца и возвращает единый ответ:
  - По умолчанию возвращается «сырой» текст полной SSE‑последовательности (все строки `data: ...`), как единое тело ответа.
  - Статус ответа сохраняется (обычно 200). Заголовок `Content-Type` в этом режиме будет установлен в `text/plain; charset=utf-8` (так как это больше не поток SSE).
  - Заголовки, специфичные для стриминга (например, `Cache-Control: no-cache`, `Connection: keep-alive`) в этом режиме не транслируются как есть, чтобы избежать некорректной семантики.

Примечание: при необходимости можно расширить поведение, чтобы дополнительно предоставлять «разобранный» JSON (склейка `content.text` и т. п.). По умолчанию — возврат «сырого» полного SSE‑текста без постобработки.

### Формат API
Прокси поднимает HTTP API, принимая универсальный JSON:

POST /proxy
```json
{
  "method": "POST",
  "url": "https://target.example.com/api",
  "headers": { "Authorization": "Bearer ..." },
  "body": { "any": "json" },
  "timeout": 60
}
```

Ответ (пример, если был SSE):
```json
{
  "status": 200,
  "headers": { "content-type": "text/plain; charset=utf-8" },
  "body": "data: { ... }\n\ndata: { ... }\n\n... (полный SSE как текст)"
}
```

Ответ (если обычный JSON):
```json
{
  "status": 200,
  "headers": { "content-type": "application/json; charset=utf-8" },
  "body": { "...": "..." }
}
```

Ответ (если обычный текст):
```json
{
  "status": 200,
  "headers": { "content-type": "text/plain; charset=utf-8" },
  "body": "<строковый ответ>"
}
```

### Поведение агрегации SSE
- Определение SSE: `Content-Type` содержит `text/event-stream` ИЛИ тело начинается с `data:`.
- Агрегация: читаем поток до закрытия соединения и склеиваем весь контент в один текст (включая все строки `data:`). Никакой дополнительной обработки содержимого не выполняется.

### Примеры использования
1) Проксирование SSE в единый текст (типичный чат-эндпоинт):
```json
{
  "method": "POST",
  "url": "https://code.1c.ai/chat_api/v1/conversations/{id}/messages",
  "headers": { "Authorization": "<token>", "Accept": "application/json" },
  "body": { "tool_content": { "instruction": "Вопрос..." } }
}
```

2) Обычный POST без SSE — прокси вернет исходный JSON как есть.

### Настройки
- PORT — порт HTTP‑прокси (по умолчанию 3002)
- TIMEOUT — таймаут запроса (сек)

### Запуск
- Установка: `npm i`
- Dev‑режим: `npm run dev`
- Прод: `npm run build && npm start`

### Быстрый старт (Windows)
- Запуск прокси (dev): `start-proxy.cmd`
- Запуск тестового SSE/JSON сервера (8081): `start-test-server.cmd`
- Запуск тест‑клиента: `start-test-client.cmd`

### Структура проекта
```
http_proxy_sse/
  README.md
  settings.json                # Глобальные настройки (listen.port=3002 и др.)
  package.json                 # Скрипты: dev, build, start, start:test-*
  tsconfig.json
  free-ports.cmd               # Освобождение портов 3002 и 8081
  start-proxy.cmd              # Быстрый запуск прокси (dev)
  start-test-server.cmd        # Запуск тестового SSE/JSON сервера (8081)
  start-test-client.cmd        # Запуск тест‑клиента
  src/
    index.ts                   # Реализация POST /proxy (passthrough + SSE-агрегация)
  test/
    server.ts                  # Простой SSE/JSON апстрим на 8081
    client.ts                  # Клиент, проверяющий JSON и SSE через прокси
```

### Настройки (settings.json / env)
Все параметры прокси разделены на глобальные политики (settings) и per‑request значения (в payload клиента).

- listen.host (string, default: "localhost") — адрес, на котором слушает прокси
- listen.port (number, default: 8088) — порт прокси
- requestTimeoutDefault (number, seconds, default: 60) — таймаут запроса по умолчанию
- sseReadTimeoutDefault (number, seconds, default: 0) — таймаут чтения SSE (0 = без лимита)
- sseMaxBodyBytes (number, bytes, default: 0) — максимальный размер агрегированного SSE‑тела (0 = без лимита)
- sseMaxDurationSec (number, seconds, default: 0) — максимальная длительность агрегации SSE (0 = без лимита)
- onLimit ("413" | "504" | "close", default: "504") — действие при превышении лимита
  - "413" — вернуть 413 Payload Too Large
  - "504" — вернуть 504 Gateway Timeout
  - "close" — оборвать соединение
- tls.rejectUnauthorized (boolean, default: true) — строгая проверка TLS сертификата апстрима
- tls.caFile (string, path, default: "") — путь к дополнительному CA (опционально)
- cors.enabled (boolean, default: false) — включить CORS
- cors.allowedOrigins (string[] | "*", default: []) — список разрешённых Origin ("*" допустимо в dev)
- logging.level ("silent" | "error" | "warn" | "info" | "debug", default: "info") — уровень логов
- logging.maskAuthorization (boolean, default: true) — маскировать заголовок Authorization в логах
- logging.toFile (boolean, default: false) — писать логи в файл
- logging.filePath (string, default: "./proxy.log") — путь к лог‑файлу
- passthroughNonOK (boolean, default: true) — 4xx/5xx от апстрима отдаются без изменений
- sse.responseContentType (string, default: "text/plain; charset=utf-8") — `Content-Type` агрегированного SSE ответа
- sse.dropStreamingHeaders (boolean, default: true) — не переносить потоковые заголовки (keep‑alive, transfer‑encoding)
- sse.preserveHeadersAllowlist (string[], default: []) — allowlist заголовков, которые можно сохранить при SSE‑агрегации
- upstream.allowedHosts (string[], default: []) — белый список хостов апстрима (пусто = разрешить все)
- limits.maxRequestBodyBytes (number, bytes, default: 0) — лимит размера тела входящего клиентского запроса (0 = без лимита)
- health.enabled (boolean, default: true) — включить `/healthz` и `/ready`
- health.paths.healthz (string, default: "/healthz") — путь health
- health.paths.ready (string, default: "/ready") — путь ready
- metrics.enabled (boolean, default: false) — включить метрики (опционально)

Переменные окружения (опционально) могут переопределять значения settings, например:
- PROXY_HOST, PROXY_PORT
- REQUEST_TIMEOUT_DEFAULT, SSE_READ_TIMEOUT_DEFAULT
- SSE_MAX_BODY_BYTES, SSE_MAX_DURATION_SEC, ON_LIMIT
- TLS_REJECT_UNAUTHORIZED, TLS_CA_FILE
- CORS_ENABLED, CORS_ALLOWED_ORIGINS
- LOG_LEVEL, LOG_TO_FILE, LOG_FILE_PATH, LOG_MASK_AUTH
- PASSTHROUGH_NON_OK
- SSE_RESPONSE_CONTENT_TYPE, SSE_DROP_STREAMING_HEADERS, SSE_PRESERVE_HEADERS
- UPSTREAM_ALLOWED_HOSTS
- LIMITS_MAX_REQUEST_BODY_BYTES
- HEALTH_ENABLED, HEALTH_PATH, READY_PATH
- METRICS_ENABLED

### Параметры запроса клиента (POST /proxy)
Тело запроса клиента определяет конкретный апстрим‑вызов и может переопределить таймаут на один запрос.

```json
{
  "method": "GET|POST|PUT|PATCH|DELETE|...",          // обязательно
  "url": "https://host/path?query#hash",               // обязательно, полный URL апстрима
  "headers": { "Header-Name": "value", ... },        // опционально, по умолчанию {}
  "body": <любой JSON/строка/бинарь>,                   // опционально; передаётся как есть
  "timeout": 45,                                        // опционально; сек, перекрывает requestTimeoutDefault
  "sse": {                                              // опционально; переопределяет настройки SSE
    "aggregationMode": "raw|final-text|smart",         // как собирать поток; по умолчанию raw
    "responseContentType": "text/plain; charset=utf-8" // content-type ответа при агрегировании
  },
  "tls": { "rejectUnauthorized": true }               // опционально; перекрывает глобальную TLS проверку
}
```

Поведение ответа:
- НЕ‑SSE: возвращаются исходные `status`, `headers`, `body` апстрима без изменений (строгий passthrough).
- SSE: поток обрабатывается согласно `sse.aggregationMode`:
  - `raw` — вернуть «сырой» SSE‑текст (все строки `data:` как есть, склеенные прокси)
  - `final-text` — универсально собрать финальный `content.text` ассистента (поддерживает кумулятивные и дельтовые потоки)
  - `smart` — эвристика: выбирает лучшую версию между кумулятивной и дельтовой сборкой
  Ответ отдаётся с тем же `status` апстрима и `Content-Type` из `sse.responseContentType` (по умолчанию `text/plain; charset=utf-8`). Потоковые заголовки не переносятся.

### Пример вызова с per‑request параметрами
```json
{
  "method": "POST",
  "url": "https://code.1c.ai/chat_api/v1/conversations/{id}/messages",
  "headers": { "Authorization": "<token>", "Accept": "application/json" },
  "body": { "tool_content": { "instruction": "Вопрос..." } },
  "timeout": 60,
  "sse": { "aggregationMode": "final-text" },
  "tls": { "rejectUnauthorized": true }
}
```

### Ограничения
- Прокси не выполняет аутентификацию пользователя; безопасность заголовков — зона ответственности вызывающей стороны.
- Для больших SSE потоков рекомендуется лимитировать размер и время агрегации.

---
Далее: создадим структуру Node.js/TS проекта (`package.json`, `tsconfig.json`, `src/index.ts`) и реализуем универсальный `/proxy` с агрегацией SSE.


