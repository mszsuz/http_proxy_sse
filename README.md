## http_proxy_sse — универсальный HTTP‑прокси (Node.js) с агрегацией SSE

Стек: Node.js + TypeScript (Express + встроенный http/https).  
Цель: предоставить простой прокси‑сервис, который:
- Проксирует любые HTTP-запросы к целевому серверу.
- Если целевой сервер отвечает Server-Sent Events (SSE, `text/event-stream`), прокси «собирает» поток целиком и возвращает клиенту единый финальный ответ (не потоковый).
- Удобен, когда клиент не может/не хочет обрабатывать SSE.

### Особенности
- **Прозрачный passthrough**: для не‑SSE ответов возвращается исходный статус/заголовки/тело без изменений.
- **Агрегация SSE**: режимы `raw`, `final-text`, `smart` (выбор per‑request).
- **Конфигурируемость**: `settings.json` для глобальных политик + пер‑запросные параметры в payload.
- **Безопасность**: настройка TLS (`rejectUnauthorized`, `caFile`) и allowlist хостов апстрима.
- **Контроль ресурсов**: лимиты размера/длительности SSE и таймауты.
- **Инфраструктура**: CORS, health‑эндпоинты, готовые Windows‑скрипты, локальные тест‑сервер и клиент.

### Содержание
- [Ключевые свойства](#ключевые-свойства)
- [Определение SSE](#определение-sse)
- [Формат API](#формат-api)
- [Поведение агрегации SSE](#поведение-агрегации-sse)
- [Примеры использования](#примеры-использования)
- [Настройки (settings.json)](#настройки-settingsjson)
- [Параметры запроса клиента (POST /proxy)](#параметры-запроса-клиента-post-proxy)
- [Здоровье и CORS](#здоровье-и-cors)
- [Установка](#установка)
- [Скрипты npm](#скрипты-npm)
- [Быстрый старт (Windows)](#быстрый-старт-windows)
- [Структура проекта](#структура-проекта)
- [Совместимость](#совместимость)
- [Ограничения](#ограничения)
- [Лицензия](#лицензия)

### Ключевые свойства
- Прокси не изменяет запрос клиента: метод, URL, заголовки и тело передаются «как есть» (pass‑through).
- Не‑SSE ответ (нет `Content-Type: text/event-stream`) возвращается без изменений: исходный HTTP‑статус, заголовки и тело апстрима.
- SSE ответ агрегируется до конца и возвращается одним ответом:
  - `Content-Type` для агрегированного ответа — `text/plain; charset=utf-8` (по умолчанию, настраивается).
  - Потоковые заголовки апстрима (keep‑alive/transfer‑encoding и т. п.) не переносятся.

### Определение SSE
- SSE определяется по заголовку `Content-Type` апстрима, содержащему `text/event-stream`.

### Формат API
Прокси поднимает HTTP API и принимает управляемый JSON в теле запроса.

POST /proxy
```json
{
  "method": "POST",
  "url": "https://target.example.com/api",
  "headers": { "Authorization": "Bearer ..." },
  "body": { "any": "json" },
  "timeout": 60,
  "sse": { "aggregationMode": "raw|final-text|smart", "responseContentType": "text/plain; charset=utf-8" },
  "tls": { "rejectUnauthorized": true }
}
```

Ответ:
- Это непосредственный HTTP‑ответ прокси, сформированный на основе ответа апстрима:
  - HTTP‑статус: как у апстрима.
  - HTTP‑заголовки: как у апстрима (для не‑SSE); для SSE — только `Content-Type` агрегированного ответа.
  - Тело: собственно тело ответа (без JSON‑обёртки `status/headers/body`).

Примеры (для наглядности):
- Если апстрим вернул обычный JSON:
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"ok":true}
```
- Если апстрим вернул SSE, прокси вернёт агрегированный текст:
```
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

data: { ... }\n\n
data: { ... }\n\n...
```

### Поведение агрегации SSE
- Режимы агрегации (переключаются per‑request, с дефолтом из settings):
  - `raw` — вернуть «сырой» SSE‑текст: все строки `data:` склеены в один текст.
  - `final-text` — попытка универсально собрать финальный `content.text` ассистента, корректно работая как с кумулятивными, так и с дельтовыми потоками.
  - `smart` — эвристика, выбирающая лучшую версию финального текста (между кумулятивной и дельтовой стратегиями).
- Таймауты/лимиты: можно ограничить время чтения, общий размер агрегата и действие при превышении (см. настройки).

### Примеры использования
1) Проксирование SSE‑чат‑эндпоинта в единый ответ:
```json
{
  "method": "POST",
  "url": "https://code.1c.ai/chat_api/v1/conversations/{id}/messages",
  "headers": { "Authorization": "<token>", "Accept": "application/json" },
  "body": { "tool_content": { "instruction": "Вопрос..." } },
  "sse": { "aggregationMode": "smart" }
}
```
2) Обычный POST без SSE — прокси вернёт исходный JSON «как есть».

### Настройки (settings.json)
Глобальная конфигурация в `settings.json`.

- listen.host (string, default: "localhost") — адрес, на котором слушает прокси
- listen.port (number, default: 3002) — порт прокси
- requestTimeoutDefault (number, seconds, default: 60) — таймаут запроса к апстриму по умолчанию
- sseReadTimeoutDefault (number, seconds, default: 0) — таймаут чтения SSE (0 = без лимита)
- sseMaxBodyBytes (number, bytes, default: 0) — максимальный размер агрегированного SSE‑тела (0 = без лимита)
- sseMaxDurationSec (number, seconds, default: 0) — максимальная длительность агрегации SSE (0 = без лимита)
- onLimit ("413" | "504" | "close", default: "504") — действие при превышении лимита
  - "413" — вернуть 413 Payload Too Large
  - "504" — вернуть 504 Gateway Timeout
  - "close" — оборвать соединение
- tls.rejectUnauthorized (boolean, default: true) — строгая проверка TLS сертификата апстрима
- tls.caFile (string, default: "") — путь к дополнительному CA (опционально)
- cors.enabled (boolean, default: false) — включить CORS
- cors.allowedOrigins (string[] | "*", default: []) — список разрешённых Origin ("*" допустимо в dev)
- limits.maxRequestBodyBytes (number, bytes, default: 0) — лимит размера тела входящего клиентского запроса (0 = без лимита)
- upstream.allowedHosts (string[], default: []) — белый список хостов апстрима (пусто = разрешить любые)
- health.enabled (boolean, default: true) — включить `/healthz` и `/ready`
- health.paths.healthz (string, default: "/healthz") — путь health
- health.paths.ready (string, default: "/ready") — путь ready
- sse.responseContentType (string, default: "text/plain; charset=utf-8") — `Content-Type` агрегированного SSE‑ответа
- sse.aggregationMode ("raw" | "final-text" | "smart", default: "raw") — дефолтный режим агрегации SSE

Примечания к параметрам, присутствующим в `settings.json`, но пока не используемым реализацией:
- logging.level, logging.maskAuthorization, logging.toFile, logging.filePath — зарезервировано (логирование не активно)
- passthroughNonOK — зарезервировано (сейчас любые статусы отдаются «как есть»)
- sse.dropStreamingHeaders, sse.preserveHeadersAllowlist — зарезервировано (при SSE переносим только `Content-Type`)
- metrics.enabled — зарезервировано (метрик нет)

Переменные окружения для переопределения настроек не поддерживаются — используйте `settings.json`.

### Параметры запроса клиента (POST /proxy)
Тело запроса клиента определяет конкретный апстрим‑вызов и может переопределить поведение на один запрос.

```json
{
  "method": "GET|POST|PUT|PATCH|DELETE|...",          // обязательно
  "url": "https://host/path?query#hash",               // обязательно, полный URL апстрима
  "headers": { "Header-Name": "value" },             // опционально, по умолчанию {}
  "body": <любой JSON/строка/бинарь>,                   // опционально; передаётся как есть
  "timeout": 45,                                        // опционально; сек, перекрывает requestTimeoutDefault
  "sse": {                                              // опционально; переопределяет настройки SSE
    "aggregationMode": "raw|final-text|smart",         // как собирать поток; по умолчанию raw
    "responseContentType": "text/plain; charset=utf-8" // content-type ответа при агрегировании
  },
  "tls": { "rejectUnauthorized": true }               // опционально; перекрывает глобальную TLS‑проверку
}
```

Поведение ответа:
- Не‑SSE: исходные HTTP‑статус, заголовки и тело апстрима без изменений (строгий passthrough).
- SSE: поток агрегируется согласно `sse.aggregationMode`; ответ возвращается с HTTP‑статусом апстрима и `Content-Type`, заданным `sse.responseContentType`.

### Здоровье и CORS
- Health: `GET /healthz` → `ok`, `GET /ready` → `ready` (пути настраиваются).
- CORS: включается и настраивается через `settings.cors.*`.

### Установка
- Требования: установленный Node.js (рекомендуется 18 LTS или выше) и npm.
- Склонируйте репозиторий или скопируйте директорию `http_proxy_sse/` в ваш проект.
- Перейдите в каталог `http_proxy_sse` и установите зависимости: `npm i`.
- При необходимости отредактируйте `settings.json` (порт/хост, TLS, CORS, allowlist хостов, лимиты, health).
- Запуск в dev: `npm run dev`. Продакшен: `npm run build && npm start`.
- На Windows можно использовать скрипты `start-*.cmd`.

### Скрипты npm
- **dev**: запустить прокси в dev‑режиме (`ts-node src/index.ts`).
- **build**: собрать TypeScript в `dist/` (`tsc -p .`).
- **start**: запустить собранную версию (`node dist/index.js`).
- **start:test-server**: локальный тестовый SSE/JSON‑сервер.
- **start:test-client**: локальный клиент, проверяющий passthrough и SSE‑агрегацию.

### Быстрый старт (Windows)
- Установка зависимостей: `npm i`
- Dev‑режим: `npm run dev`
- Прод: `npm run build && npm start`
- Запуск прокси (dev): `start-proxy.cmd`
- Запуск тестового SSE/JSON сервера (порт берётся из `settings.test.serverPort`, по умолчанию 8081): `start-test-server.cmd`
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
  start-test-server.cmd        # Запуск тестового SSE/JSON сервера
  start-test-client.cmd        # Запуск тест‑клиента
  src/
    index.ts                   # Реализация POST /proxy (passthrough + SSE‑агрегация)
  test/
    server.ts                  # Простой SSE/JSON апстрим
    client.ts                  # Клиент, проверяющий JSON и SSE через прокси
```

### Совместимость
- Node.js: рекомендуется версия 18 LTS и выше (проект использует `ts-node` и встроенные `http/https`).

### Ограничения
- Прокси не выполняет аутентификацию; безопасность заголовков — ответственность вызывающей стороны.
- Для больших SSE‑потоков рекомендуется лимитировать размер и время агрегации.

### Лицензия
MIT. Добавьте файл `LICENSE` при публикации.


