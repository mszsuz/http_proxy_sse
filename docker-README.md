# HTTP Proxy SSE - Docker Setup

Этот проект теперь поддерживает запуск в Docker контейнерах с помощью docker-compose.

## Структура сервисов

- **proxy** - основной HTTP Proxy SSE сервис (порт 3002)
- **test-server** - тестовый сервер для проверки функциональности (порт 8081)
- **test-client** - тестовый клиент, который проверяет работу прокси

### Назначение тестовых сервисов

#### test-server (Тестовый сервер)
- **Цель**: Имитирует внешний API, который ваш прокси будет проксировать
- **Эндпоинты**:
  - `GET /sse` - отправляет Server-Sent Events (3 сообщения с интервалом 300мс)
  - `POST /json` - эхо-сервер, возвращает отправленные данные
- **Порт**: 8081
- **Зачем нужен**: Для тестирования работы прокси без подключения к реальным внешним API

#### test-client (Тестовый клиент)
- **Цель**: Автоматически тестирует работу прокси
- **Что делает**:
  1. Отправляет POST запрос через прокси к test-server
  2. Тестирует SSE агрегацию (получение и обработку потоковых данных)
  3. Проверяет JSON passthrough функциональность
- **Зачем нужен**: Автоматическая проверка, что прокси работает правильно

### Практические сценарии использования

1. **Разработка**: Используйте test-server для локальной разработки
2. **CI/CD**: test-client автоматически проверяет работоспособность
3. **Демо**: Показывает возможности прокси на простых примерах
4. **Отладка**: Помогает понять, как работает прокси

## Быстрый старт

### 1. Сборка и запуск всех сервисов

```bash
docker-compose up --build
```

### 2. Запуск только основного прокси сервиса

```bash
docker-compose up proxy
```

### 3. Запуск прокси и тестового сервера

```bash
docker-compose up proxy test-server
```

### 4. Запуск тестового клиента (после запуска proxy и test-server)

```bash
docker-compose up test-client
```

### 5. Различные сценарии использования

#### Полное тестирование (все сервисы)
```bash
docker-compose up --build
docker-compose logs test-client  # Посмотреть результаты тестов
```

#### Только продакшн (без тестов)
```bash
docker-compose up proxy
```

#### Разработка (прокси + тестовый сервер для ручного тестирования)
```bash
docker-compose up proxy test-server
# Теперь можно тестировать вручную через curl или браузер
```

## Управление сервисами

### Остановка всех сервисов
```bash
docker-compose down
```

### Просмотр логов
```bash
# Все сервисы
docker-compose logs

# Конкретный сервис
docker-compose logs proxy
docker-compose logs test-server
docker-compose logs test-client
```

### Пересборка образов
```bash
docker-compose build
```

## Проверка работоспособности

После запуска сервисов:

1. **Прокси сервис** доступен по адресу: http://localhost:3002
2. **Тестовый сервер** доступен по адресу: http://localhost:8081
3. **Health check** прокси: http://localhost:3002/healthz

### Тестирование API

#### Автоматическое тестирование
```bash
# Запустить test-client для автоматической проверки
docker-compose up test-client
docker-compose logs test-client
```

#### Ручное тестирование

**1. Тестирование SSE агрегации:**
```bash
curl -X POST http://localhost:3002/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "http://localhost:8081/sse"
  }'
```

**2. Тестирование JSON passthrough:**
```bash
curl -X POST http://localhost:3002/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "method": "POST",
    "url": "http://localhost:8081/json",
    "headers": { "Accept": "application/json" },
    "body": { "ping": "pong" }
  }'
```

**3. Прямое обращение к тестовому серверу:**
```bash
# SSE поток
curl http://localhost:8081/sse

# JSON эхо
curl -X POST http://localhost:8081/json \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**4. Health check прокси:**
```bash
curl http://localhost:3002/healthz
curl http://localhost:3002/ready
```

## Переменные окружения

- `PROXY_HOST` - хост прокси сервера (для тестового клиента)
- `NODE_ENV` - окружение Node.js

## Сетевая архитектура

Все сервисы работают в изолированной Docker сети `proxy-network`, что позволяет им общаться друг с другом по именам сервисов:
- `proxy` - основной сервис
- `test-server` - тестовый сервер
- `test-client` - тестовый клиент

## Файлы конфигурации

- `Dockerfile` - основной образ для прокси
- `Dockerfile.test-server` - образ для тестового сервера
- `Dockerfile.test-client` - образ для тестового клиента
- `docker-compose.yml` - конфигурация всех сервисов
- `.dockerignore` - исключения при сборке образов
- `settings.json` - конфигурация приложения (монтируется извне)

## Конфигурация

Файл `settings.json` монтируется в контейнеры как внешний том (`./settings.json:/app/settings.json:ro`). Это означает:

- ✅ Можно изменять настройки без пересборки образов
- ✅ Изменения применяются при перезапуске контейнера
- ✅ Файл доступен только для чтения в контейнере (безопасность)
- ✅ Один файл конфигурации для всех сервисов
