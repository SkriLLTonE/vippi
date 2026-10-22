# Развёртывание публичного демо на Render (free)

Архитектура и обоснование — [ADR-022](../discovery/decisions.md#adr-022-публичный-демо-стенд-на-render-free). Конфигурация — [`render.yaml`](../../render.yaml) (Blueprint) и корневой [`Dockerfile`](../../Dockerfile).

```
браузер ──https──▶ Render (Cloudflare → балансировщик) ──▶ контейнер vippi-leads (Node, PORT=10000)
                                                            ├─ /            SPA (apps/web/dist) + заголовки безопасности
                                                            ├─ /api/v1/*    REST API, cookie-сессии (один origin)
                                                            └─ /api/health  health-check Render
                                                                  │ приватная сеть
                                                                  ▼
                                                            Render PostgreSQL 17 (free, vippi-db)
```

## Статус

На **2026-10-22** стенд **Live**: [https://vippi-leads.onrender.com](https://vippi-leads.onrender.com) (`/api/health/ready` → `ready`). Сервисы Blueprint: `vippi-leads` + `vippi-db`. Пароль демо — `DEMO_SEED_PASSWORD` в Environment у `vippi-leads`. Ниже — шаги на случай пересоздания Blueprint или нового workspace.

## Шаги развёртывания (делает владелец аккаунта)

1. Откройте <https://dashboard.render.com> и войдите через **GitHub** (аккаунт с доступом к `SkriLLTonE/vippi`).
2. **New** → **Blueprint**.
3. Подключите GitHub, если Render попросит, и выберите репозиторий **SkriLLTonE/vippi**, ветка `main`. Render найдёт `render.yaml` и покажет сервис `vippi-leads` (web, Docker, Free) и базу `vippi-db` (PostgreSQL, Free).
4. Задайте имя Blueprint (любое, например `vippi`). Заполните запрошенную переменную **`GEMINI_API_KEY`** — она **необязательная**: оставьте пустой, тогда AI работает в rule-based режиме.
5. Нажмите **Apply** (Deploy Blueprint). Первая сборка образа занимает ~5–10 минут.
6. Дождитесь статуса **Live** у `vippi-leads`. При первом старте контейнер сам применит миграции и создаст синтетическую демо-организацию (`DEMO_SEED_ON_START=if-missing`) — отдельная команда сида **не нужна**.
7. Пароль демо-аккаунтов: сервис `vippi-leads` → **Environment** → `DEMO_SEED_PASSWORD` (сгенерирован Render, нажмите «показать»). Логины — в [README](../../README.md#демо-доступ) (`owner@demo-realty.example` и др.).
8. Проверьте:
   - `https://<адрес>/api/health/ready` → `200` с `{"status":"ready"}`;
   - `https://<адрес>/` → страница входа;
   - вход `owner@demo-realty.example` с паролем из шага 7 → список лидов (~175 демо-лидов).
9. **Проверка IP за прокси (один раз):** войдите в приложение, откройте «Журнал аудита» (владелец, широкий экран) — в событии входа колонка IP должна совпадать с вашим внешним IP (например, с <https://ifconfig.me>). Если там адрес Cloudflare/10.x — сообщите исполнителю: нужно скорректировать `TRUST_PROXY` (ADR-022).

Автодеплой: каждый push в `main` деплоится после зелёного CI (`autoDeployTrigger: checksPass`).

### Пересоздать демо-данные (переналивка)

На free-тарифе нет Shell и one-off jobs, поэтому сид управляется переменной окружения:

1. `vippi-leads` → **Environment** → `DEMO_SEED_ON_START` = `reset` → **Save, rebuild, and deploy** (или Save + **Manual Deploy → Deploy latest commit**).
2. После статуса **Live** демо-организация пересоздана (все изменения в ней потеряны; другие организации не затрагиваются).
3. **Обязательно** верните `DEMO_SEED_ON_START` = `if-missing` и сохраните — иначе данные будут сбрасываться при каждом пробуждении сервиса.

Сменить пароль демо-аккаунтов: измените `DEMO_SEED_PASSWORD` (≥ 10 символов) и выполните переналивку выше. Сид идемпотентен: всегда одна демо-организация, данные только синтетические (`isDemo`, баннер «Демо-данные», телефоны `+99800…`).

### Ключ шифрования API-ключей (`API_KEY_ENCRYPTION_KEY`)

Полные API-ключи хранятся в БД зашифрованными (AES-256-GCM), чтобы владелец мог скопировать ключ позже («Настройки → API-ключи»). Для проверки входящих запросов по-прежнему используется только SHA-256-хэш.

- В Blueprint переменная задана как `generateValue: true`: Render сам сгенерирует случайное значение (base64, 256 бит) при создании или синхронизации Blueprint. Если сервис создан раньше и Blueprint не синхронизирован — `vippi-leads` → **Environment** → добавьте `API_KEY_ENCRYPTION_KEY` = вывод `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` → Save. **Задайте её до деплоя этой версии:** при `NODE_ENV=production` без переменной API не стартует (health-check не пройдёт, Render оставит предыдущую версию).
- Не меняйте значение без необходимости: после смены старые ключи продолжают принимать заявки, но скопировать их уже нельзя — нужна кнопка «Обновить» (ротация) у каждого ключа.
- Ключи, созданные до этого обновления, хранятся только как хэш: в интерфейсе их можно удалить или обновить, но не скопировать.

### Включить Google Gemini

1. `vippi-leads` → **Environment** → `GEMINI_API_KEY` = ключ → Save (сервис перезапустится). `AI_PROVIDER=gemini` уже задан в Blueprint.
2. Войдите владельцем → «Настройки → Организация» → включите согласие на внешнюю AI-обработку (ADR-016; по умолчанию выключено).

Без ключа или без согласия — честный rule-based режим с пометкой «Без AI · по правилам». AI ничего не выполняет сам.

### Включить push и email-уведомления (ADR-023)

1. Локально: `npx web-push generate-vapid-keys`. В `vippi-leads` → **Environment** задайте `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` и `VAPID_SUBJECT=mailto:ваш@email`.
2. Для писем задайте `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. `SMTP_PORT` = 587 уже стоит в Blueprint; для 465 TLS включится сам.
3. Нажмите Save — сервис перезапустится. Затем «Профиль» → включите каналы → «Отправить тестовое уведомление».

Free-инстанс спит, поэтому push и письма о событиях, накопившихся за время сна, отправляются после пробуждения, если событию меньше 6 ч. Демо-организация писем не получает: адреса вымышленные. Push в ней работает.

### Свой домен

Добавьте домен в Render (Settings → Custom Domains) и задайте `PUBLIC_APP_URL=https://ваш-домен` — иначе защита по Origin отклонит запросы с нового домена.

## Ограничения free-тарифа

Источники: [render.com/docs/free](https://render.com/docs/free), [render.com/docs/blueprint-spec](https://render.com/docs/blueprint-spec), [render.com/docs/deploys](https://render.com/docs/deploys) — проверено **2026-10-21**; условия Render могут измениться.

| Ограничение | Что это значит для демо |
|---|---|
| Сервис засыпает после **15 мин** без входящего трафика, пробуждение **~1 мин** | Первый заход после паузы долгий. Перед показом откройте URL заранее |
| **750** бесплатных инстанс-часов в месяц на workspace | Одного сервиса хватает на месяц |
| **PostgreSQL free истекает через 30 дней** после создания, затем 14 дней льготного периода, после — **удаление** | Раз в месяц: удалить и заново создать базу (или Blueprint целиком, или перейти на платный план). Данные не сохраняются |
| Нет бэкапов БД, лимит **1 ГБ**, одна free-БД на workspace | Только демо и синтетические данные; реальных данных клиентов не загружать |
| Нет Shell/SSH, one-off jobs и pre-deploy команды | Миграции — в entrypoint контейнера, сид — флагом `DEMO_SEED_ON_START` |
| Эфемерная файловая система, перезапуск в любой момент | Приложение не пишет на диск; всё состояние в БД |

### SLA-планировщик и сон

Cron-задача SLA (раз в минуту) работает, **только пока инстанс не спит**. При пробуждении API сразу выполняет догоняющий проход:
- просрочка вычисляется от сохранённых дедлайнов, `slaBreachedAt` = дедлайн (а не время пробуждения), поэтому метрики и отчёты корректны;
- проход идемпотентен (advisory lock, `dedupeKey`): повторный запуск не создаёт дублей;
- таймер обратного отсчёта в интерфейсе считается от дедлайна и всегда корректен.

Ограничение: уведомления о просрочках, случившихся во время сна, появляются только после пробуждения (с фактическим «просрочено на N мин»). Сервис не будит себя сам: внешние «пинги» для обхода сна не настроены (это противоречит смыслу free-тарифа).

### Прочие ограничения

- Лимиты частоты запросов (вход, intake API, AI) хранятся в памяти процесса и сбрасываются при перезапуске/сне.
- Число прокси-хопов `TRUST_PROXY=3` установлено по сообщениям сообщества Render (ADR-022) и требует проверки на первом деплое (шаг 9).
- Ключа Gemini в проекте нет — по умолчанию rule-based режим.
- Регион — Frankfurt (ЕС). Для реальных данных нужна юридическая проверка размещения и трансграничной передачи (H-12, TBD-6).

## Локальная проверка production-образа (выполнено 2026-10-21)

Тот же `Dockerfile`, условия, близкие к free-тарифу: `--memory=512m --memory-swap=512m --cpus=0.1`, PostgreSQL 17 из compose-сети, отдельная БД.

```bash
docker build -t vippi-app:render .
docker run -d --name vippi-render-local --network vippi_default -p 8090:10000 \
  --memory=512m --memory-swap=512m --cpus=0.1 \
  -e DATABASE_URL=postgresql://vippi:<пароль>@db:5432/vippi_render \
  -e PUBLIC_APP_URL=http://localhost:8090 -e COOKIE_SECURE=false \
  -e SLA_CRON_ENABLED=true -e DEMO_SEED_ON_START=if-missing -e DEMO_SEED_PASSWORD=<≥10 символов> \
  -e API_KEY_ENCRYPTION_KEY=<32 байта base64> \
  vippi-app:render
E2E_BASE_URL=http://localhost:8090 pnpm --filter @vippi/web exec playwright test
```

Результаты:

- Образ: ~740 МБ (Prisma CLI и движки для `migrate deploy`).
- Холодный старт с миграциями и сидом (175 синтетических лидов): health-check `ready` через ~28 с.
- Повторный старт: «No pending migrations», сид пропущен (`if-missing`), `lastSlaRunAt` выставлен сразу (догоняющий проход).
- Smoke-проверки:
  - `/` отдаёт HTML с CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`;
  - глубокая ссылка → `index.html`; ассеты — 200;
  - неизвестный `/api/v1/...` → JSON 404; `/api/docs` → 404;
  - вход демо-владельцем → 200 и httpOnly-cookie `vippi_sid`; дашборд с данными;
  - POST с чужим Origin → 403.
- Playwright E2E против контейнера: **6 passed** (2,7 мин, включая реальную SLA-просрочку).
- Память: ~64 МиБ в простое, пик cgroup **102 МиБ** (в том числе при `DEMO_SEED_ON_START=reset`); OOM нет.

Автотесты, покрывающие режим Render:
- `apps/api/test/integration/deployment.test.ts` — статика, SPA fallback, заголовки, 404 для `/api` и ассетов, IP клиента через 3 прокси, лимит входа по IP с подделанным `X-Forwarded-For`;
- `apps/api/test/unit/config.test.ts` — `PORT`/`RENDER_EXTERNAL_URL`, `COOKIE_SECURE` от https, валидация `TRUST_PROXY`, догоняющий запуск SLA при старте;
- `leads-sla.test.ts` — «catch-up after a long sleep».

`render.yaml` проверен JSON-схемой Render (<https://render.com/schema/render.yaml.json>, ajv, draft 2020-12): valid.
