# Vippi Leads — демо-MVP

Контроль скорости ответа на заявки для агентств недвижимости Ташкента: лиды из разных каналов, SLA первого ответа с уведомлениями о просрочке, AI-сводка и черновик ответа (с честным rule-based режимом без ключа), дашборд, импорт/экспорт CSV, intake API. Интерфейс на русском и узбекском (латиница), даты — `Asia/Tashkent`, суммы — UZS.

Документы: [PRD](docs/product/PRD.md) · [SPEC](docs/technical/SPEC.md) · [UX-UI](docs/design/UX-UI-spec.md) · [design-system](docs/design/design-system.md) · [решения (ADR)](docs/discovery/decisions.md) · [план и статусы](docs/delivery/implementation-plan.md) · [сценарий демо](docs/delivery/demo-script.md)

## Запуск в Docker (рекомендуется)

Нужны Docker с Compose v2. Из корня репозитория:

```bash
cp .env.example .env          # локальные значения; секретов в репозитории нет
docker compose up -d --build  # db + api (миграции при старте) + web (nginx)
docker compose exec api node dist/prisma/seed/demo.js   # синтетические демо-данные
```

Откройте <http://localhost:8080>. Проверка: `curl http://localhost:8080/api/health/ready` → `200`.

**Если порт 8080 занят**, задайте другой порт и тот же origin для API (иначе защита по Origin отклонит запросы):

```bash
WEB_PORT=8081 PUBLIC_APP_URL=http://localhost:8081 docker compose up -d --build
```

Swagger: `/api/docs` (при `SWAGGER_ENABLED=true`).

## Демо-доступ

Сид создаёт демо-организацию «Demo Realty Toshkent (DEMO)» (помечена `isDemo`, в интерфейсе — баннер «Демо-данные: все заявки и люди вымышлены») с ~180 **синтетическими** лидами за 30 дней. Все имена, телефоны (`+99800…`) и тексты вымышлены.

| Роль                | Email                                                           |
| ------------------- | --------------------------------------------------------------- |
| Владелец            | `owner@demo-realty.example`                                     |
| Руководитель продаж | `head@demo-realty.example`                                      |
| Менеджеры           | `manager1@demo-realty.example` … `manager3@demo-realty.example` |

Пароль — значение `DEMO_SEED_PASSWORD` из вашего `.env` (в `.env.example` — `demo-password-2026`; смените для любого не-локального запуска). Повторный запуск сида пересоздаёт демо-организацию.

## Разработка без Docker-образов приложения

Нужны Node ≥ 24 и pnpm 12 (`corepack enable`), PostgreSQL 17 (можно `docker compose up -d db`).

```bash
pnpm install
cp .env.example .env               # для dev укажите PUBLIC_APP_URL=http://localhost:5173
pnpm build:shared && pnpm db:migrate
pnpm --filter @vippi/api build && pnpm db:seed:demo
pnpm dev                           # API :3000, web :5173 (прокси /api → :3000)
```

Фронтенд **не** читает корневой `.env` (там `NODE_ENV` для API); переменные `VITE_*` — только в `apps/web/.env.local`.

## AI

По умолчанию `AI_PROVIDER=none` — работает rule-based режим: извлечение бюджета/района/комнат, шаблонные черновики RU/UZ, шаблонная сводка; результат помечен «Без AI · по правилам». Для Google Gemini: `AI_PROVIDER=gemini`, `GEMINI_API_KEY=…`, и владелец организации включает согласие на внешнюю обработку в «Настройки → Организация» (по умолчанию выключено, в том числе у демо-организации; ADR-016, ADR-021). AI ничего не выполняет сам: черновик редактирует и отправляет менеджер, затем отмечает «отправлен».

## Проверки

```bash
pnpm lint               # ESLint + steiger (границы FSD)
pnpm typecheck
pnpm test               # unit: shared, api, web
pnpm test:integration   # API на реальной БД из DATABASE_URL_TEST (имя должно содержать "test")
pnpm i18n:check         # паритет ключей ru/uz и использование ключей в коде
pnpm build
pnpm test:e2e           # Playwright: основной сценарий (≈2 мин, ждёт реальную SLA-просрочку)
```

E2E сам поднимает API (`:3000`) и `vite preview` (`:4173`); API должен получить `PUBLIC_APP_URL=http://localhost:4173`. Против Docker-стека: `E2E_BASE_URL=http://localhost:8081 pnpm test:e2e`. Перед первым запуском: `pnpm --filter @vippi/web exec playwright install chromium`.

## Ограничения MVP

- Нет подключения к каналам (Telegram, Instagram, OLX, телефония): лиды вводятся вручную, CSV-импортом или через `POST /api/v1/intake/leads` с API-ключом. «Первый ответ» — отметка менеджера (ADR-017), система не видит само сообщение.
- Уведомления — внутри приложения (опрос раз в 30 с), без push/email/Telegram.
- Ключа Gemini в проекте нет; реальный провайдер проверен только на мок-тестах.
- Узбекские строки — без вычитки носителем языка.
- Только локальный запуск; HTTPS, бэкапы и хостинг не настроены (`COOKIE_SECURE=false` для localhost).
- Покрытие тестами неполное (нет RTL-тестов компонентов, нагрузочного замера, Lighthouse, axe) — подробности в разделе 7 [плана](docs/delivery/implementation-plan.md).
- `pnpm audit`: 1 high без доступного исправления (`braces` в dev-инструменте steiger, в рантайм-образы не попадает) — см. ADR-021.
