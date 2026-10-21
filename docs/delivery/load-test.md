# Нагрузочное измерение (NFR-001)

Дата: 2026-10-21. Инструмент: [autocannon](https://github.com/mcollina/autocannon) 8.0.0 (MIT), скрипты `apps/api/scripts/load/`.

## Цели (PRD NFR-001, SPEC §15)

- p95 `GET /leads`, `GET /leads/{id}` ≤ 300 мс при 10 000 лидов в организации;
- p95 `GET /analytics/dashboard` ≤ 800 мс при 50 000 лидов;
- эталонный стенд: 4 vCPU, 8 ГБ ОЗУ, Docker.

## Данные

`load:seed` создаёт две **синтетические** организации (`isDemo = true`, название «Нагрузочный тест — синтетические данные …») через настоящий API регистрации и вставляет 10 000 и 50 000 лидов пачками (детерминированный PRNG). Распределение:

- `receivedAt` равномерно за 60 дней;
- 70 % с первым ответом (MET/BREACHED по 15-минутному SLA), остальные PENDING/BREACHED;
- статусы NEW/CONTACTED/QUALIFIED/WON/LOST;
- 8 источников, все районы, треть с бюджетом;
- 80 % назначены владельцу.

Данные пишутся только в отдельную БД (скрипт отказывается работать, если в `DATABASE_URL` нет `load`).

## Методика

- 10 соединений, 20 с на сценарий, перед замером прогрев (по одному запросу на сценарий).
- Сессия: cookie владельца, запросы `GET` без кэша на клиенте.
- p50/p95/p99 считаются по всем временам ответа (событие `response` autocannon), а не по гистограмме autocannon, где нет p95.
- Сценарии:
  - `GET /leads` — первая страница, страницы 1–50, фильтр `status+slaState`, поиск `q` по 4 запросам;
  - `GET /leads/{id}` — по кругу 100 id;
  - дашборд — `preset=30d` и 60-дневный период (все 50 000 лидов).

## Результат 1 — эталоноподобный стенд (Docker, 4 CPU, 8 ГБ)

API: образ `vippi-api` из `docker compose`, `docker run --cpus 4 --memory 8g` (Docker Desktop ограничивает ОЗУ 7,6 ГиБ), `NODE_ENV=production`, `LOG_LEVEL=warn`, `AI_PROVIDER=none`. PostgreSQL 17 — контейнер `db` из того же compose, без лимитов. Хост: Intel i7-12700H (20 логических CPU), 16 ГБ, Windows 11, Docker Desktop (WSL2).

| Сценарий | Запросов | RPS | p50, мс | p95, мс | p99, мс | max, мс | не-2xx / ошибки | Цель p95 | Итог |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| GET /leads (10k, page 1, default sort) | 5580 | 279 | 35.5 | 45.6 | 53.8 | 73.6 | 0 / 0 | ≤300 | OK |
| GET /leads (10k, pages 1–50) | 5462 | 273 | 36.5 | 46.6 | 52.1 | 69.1 | 0 / 0 | ≤300 | OK |
| GET /leads?status=NEW&slaState=BREACHED (10k) | 4984 | 249 | 39.8 | 51 | 57.5 | 95.6 | 0 / 0 | ≤300 | OK |
| GET /leads?q=… search (10k) | 4878 | 244 | 40.5 | 52.2 | 59.7 | 79.3 | 0 / 0 | ≤300 | OK |
| GET /leads/{id} (10k, 100 ids) | 9005 | 450 | 21.9 | 28.4 | 32.9 | 44 | 0 / 0 | ≤300 | OK |
| GET /analytics/dashboard?preset=30d (50k) | 1696 | 85 | 115.8 | 150.1 | 168.9 | 196.1 | 0 / 0 | ≤800 | OK |
| GET /analytics/dashboard 60 days = all 50k leads | 878 | 44 | 221.9 | 295.7 | 329.4 | 442.8 | 0 / 0 | ≤800 | OK |

## Результат 2 — API на хосте без лимитов (для сравнения)

`node dist/src/main.js`, `NODE_ENV=production`, та же БД.

| Сценарий | RPS | p50, мс | p95, мс | p99, мс | Итог |
|---|---:|---:|---:|---:|---|
| GET /leads (10k, page 1) | 761 | 12.8 | 15.9 | 19.2 | OK |
| GET /leads (10k, pages 1–50) | 733 | 13.4 | 16.1 | 17.9 | OK |
| GET /leads?status&slaState (10k) | 732 | 13.4 | 16.3 | 18.7 | OK |
| GET /leads?q (10k) | 566 | 15.7 | 26.4 | 30.1 | OK |
| GET /leads/{id} (10k) | 1073 | 9.2 | 10.9 | 12.0 | OK |
| GET /analytics/dashboard 30d (50k) | 81 | 122.0 | 162.0 | 187.1 | OK |
| GET /analytics/dashboard 60d (50k) | 42 | 233.3 | 298.1 | 336.5 | OK |

## Выводы и ограничения

- Все цели NFR-001 выполнены с запасом: списки и карточка — в 6–10 раз, дашборд по всем 50 000 лидов — в 2,7 раза.
- Узкое место — дашборд: его время почти не зависит от лимита CPU API, то есть упирается в агрегатные SQL-запросы. Пропускная способность ~44 запроса в секунду на организацию с 50 000 лидов в пиковом окне. При росте данных — материализованные дневные агрегаты (SPEC §15, п. 4).
- Ограничения замера:
  - PostgreSQL не был ограничен 4 CPU и работал на том же хосте, что и генератор нагрузки;
  - одна организация за раз, все лиды у одного ответственного (таблица «по менеджерам» короче, чем в реальной команде);
  - не измерялись запись (`POST /leads`, intake) и поведение при параллельных арендаторах.

## Как повторить

```bash
docker exec vippi-db-1 psql -U vippi -d postgres -c "CREATE DATABASE vippi_load"
cd apps/api
DATABASE_URL=postgresql://vippi:…@localhost:5432/vippi_load pnpm run db:migrate
# API против этой БД (любой из вариантов выше), затем:
DATABASE_URL=…/vippi_load LOAD_API=http://localhost:3101 pnpm run load:seed
LOAD_API=http://localhost:3101 pnpm run load:run      # печатает таблицу, exit 1 при нарушении цели
docker exec vippi-db-1 psql -U vippi -d postgres -c "DROP DATABASE vippi_load"
```
