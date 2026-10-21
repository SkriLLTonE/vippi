# Vippi Leads — демо-MVP

Контроль скорости ответа на заявки для агентств недвижимости Ташкента: лиды из разных каналов, SLA первого ответа с уведомлениями о просрочке, AI-сводка и черновик ответа (с честным rule-based режимом без ключа), дашборд, импорт/экспорт CSV, intake API. Интерфейс на русском и узбекском (латиница), даты — `Asia/Tashkent`, суммы — UZS.

Документы: [PRD](docs/product/PRD.md) · [SPEC](docs/technical/SPEC.md) · [UX-UI](docs/design/UX-UI-spec.md) · [design-system](docs/design/design-system.md) · [решения (ADR)](docs/discovery/decisions.md) · [план и статусы](docs/delivery/implementation-plan.md) · [сценарий демо](docs/delivery/demo-script.md) · [развёртывание](docs/delivery/deployment.md)

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

## Публичное демо на Render (free)

Один Docker-сервис отдаёт и сайт, и API на одном домене (cookie-сессии без CORS), база — Render PostgreSQL free ([ADR-022](docs/discovery/decisions.md)). Всё описано в [`render.yaml`](render.yaml). Чтобы развернуть:

1. Войдите на <https://dashboard.render.com> через **GitHub**.
2. **New → Blueprint** → репозиторий **SkriLLTonE/vippi** (ветка `main`).
3. `GEMINI_API_KEY` — необязательно, можно оставить пустым (rule-based AI).
4. **Apply**. Через ~5–10 мин сервис `vippi-leads` будет **Live**: миграции и синтетический демо-сид выполняются автоматически при первом старте.
5. Пароль демо-аккаунтов: `vippi-leads` → **Environment** → `DEMO_SEED_PASSWORD` (сгенерирован Render).

Переналивка демо-данных, включение Gemini, проверки после деплоя и ограничения free-тарифа описаны в [docs/delivery/deployment.md](docs/delivery/deployment.md):
- сон после 15 мин простоя;
- **база удаляется через 30 + 14 дней**;
- SLA догоняет просрочки при пробуждении.

## Демо-доступ

Сид создаёт демо-организацию «Demo Realty Toshkent (DEMO)» (помечена `isDemo`, в интерфейсе — баннер «Демо-данные: все заявки и люди вымышлены») с ~180 **синтетическими** лидами за 30 дней. Все имена, телефоны (`+99800…`) и тексты вымышлены.

| Роль                | Email                                                           |
| ------------------- | --------------------------------------------------------------- |
| Владелец            | `owner@demo-realty.example`                                     |
| Руководитель продаж | `head@demo-realty.example`                                      |
| Менеджеры           | `manager1@demo-realty.example` … `manager3@demo-realty.example` |

Пароль — значение `DEMO_SEED_PASSWORD` из вашего `.env` (в `.env.example` — `demo-password-2026`; смените для любого не-локального запуска; на Render генерируется автоматически). Повторный запуск сида пересоздаёт демо-организацию; `--if-missing` — создаёт только если её нет.

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

Модель по умолчанию — `gemini-3.5-flash-lite` (`AI_MODEL`; `AI_THINKING_LEVEL` — необязательный уровень «размышлений» для моделей Gemini 3.x). Проверка на реальном Gemini (нужен ключ в `.env`, в CI не запускается):

```bash
pnpm test:ai:live       # 15 синтетических лидов RU/UZ/кириллица/смешанные/инъекции/длинный текст через AiService
                        # + кэш, таймаут, дневной лимит; отчёт — apps/api/test/live/results/<model>.json (не в git)
```

Результаты, качество узбекского, устойчивость к инъекциям и стоимость — [docs/ai/ai-evaluation.md](docs/ai/ai-evaluation.md).

## Проверки

```bash
pnpm lint               # ESLint + steiger (границы FSD)
pnpm typecheck
pnpm test               # unit: shared (152), api (131), web — Vitest + React Testing Library (49)
pnpm test:integration   # API на реальной БД из DATABASE_URL_TEST (имя должно содержать "test"), 78 тестов:
                        # изоляция тенантов по всем маршрутам с :id × 3 роли, матрица прав, SLA-планировщик (в т.ч. догон после сна),
                        # AI с мок-провайдером, режим единого образа (SPA, заголовки, IP за прокси)
pnpm i18n:check         # паритет ключей ru/uz и использование ключей в коде
pnpm build
pnpm test:e2e           # Playwright: основной сценарий (≈2 мин, ждёт реальную SLA-просрочку)
                        # + адаптивность и доступность на 1440/768/390 и клавиатурная навигация
```

E2E сам поднимает API (`:3000`) и `vite preview` (`:4173`); API должен получить `PUBLIC_APP_URL=http://localhost:4173`. Против Docker-стека: `E2E_BASE_URL=http://localhost:8081 pnpm test:e2e`. Перед первым запуском: `pnpm --filter @vippi/web exec playwright install chromium`. Скриншоты для документации: `SCREENSHOTS_DIR=../../docs/delivery/screenshots pnpm --filter @vippi/web exec playwright test e2e/responsive-a11y.spec.ts` → [docs/delivery/screenshots](docs/delivery/screenshots/).

**CI** (GitHub Actions, `.github/workflows/ci.yml`) на каждый push в `main` и PR:

- lint + typecheck + i18n + build;
- unit и интеграционные тесты (PostgreSQL 17 service) в TZ UTC / Asia/Tashkent / America/New_York;
- Playwright E2E.

**Нагрузка** (NFR-001): `pnpm --filter @vippi/api run load:seed` / `load:run` (autocannon) на отдельной БД — методика и результаты в [docs/delivery/load-test.md](docs/delivery/load-test.md).

## Ограничения MVP

- Нет подключения к каналам (Telegram, Instagram, OLX, телефония): лиды вводятся вручную, CSV-импортом или через `POST /api/v1/intake/leads` с API-ключом. «Первый ответ» — отметка менеджера (ADR-017), система не видит само сообщение.
- Уведомления — внутри приложения (опрос раз в 30 с), без push/email/Telegram.
- Ключ Gemini в репозитории не хранится; реальный провайдер проверен локально на синтетических лидах ([ai-evaluation.md](docs/ai/ai-evaluation.md)), на free-тарифе Google использует запросы для улучшения продуктов — реальные данные клиентов только на платном тарифе и после юридической проверки.
- Узбекские строки — без вычитки носителем языка.
- Публичный стенд — только Render free (демо): засыпает, БД без бэкапов и удаляется через 30 + 14 дней, лимиты запросов в памяти. Для пилота с реальными данными нужны платная БД с бэкапами и юридическая проверка хостинга. Локально HTTPS нет (`COOKIE_SECURE=false` для localhost).
- Покрытие тестами неполное (нет RTL-тестов компонентов, нагрузочного замера, Lighthouse, axe) — подробности в разделе 7 [плана](docs/delivery/implementation-plan.md).
- `pnpm audit`: 1 high без доступного исправления (`braces` в dev-инструменте steiger, в рантайм-образы не попадает) — см. ADR-021.
