# Spec: мультиотраслевой Vippi Leads (ADR-024)

**Статус:** принят к реализации (заказчик подтвердил продуктовые решения 1–5, см. ниже). Дата: 2026-10-22.
Основной SPEC — [SPEC.md](./SPEC.md); решение — [ADR-024](../discovery/decisions.md#adr-024-любая-лидогенерация-пресеты-свои-поля-названия-статусов).

## Objective

Сделать Vippi Leads пригодным для **любой** лидогенерации (клиники, автосалоны, школы, услуги), оставив недвижимость одним из отраслевых пресетов. Пользователь — владелец/РОП малого бизнеса в Узбекистане; успех: компания «Другой бизнес» регистрируется, ведёт заявки со своими полями и не видит полей недвижимости и вопросов AI про районы/комнаты.

Подтверждённые решения заказчика:
1. Страна прежняя: +998, UZS/USD, Asia/Tashkent, ru/uz. Меняется только отрасль.
2. Коды статусов `NEW/CONTACTED/QUALIFIED/WON/LOST` и машина статусов неизменны; меняются только подписи (per-org). Конструктора воронки нет.
3. Колонки недвижимости (`district`, `propertyType`, `rooms`) остаются в `Lead`, показываются только при пресете `REAL_ESTATE`. Бюджет виден всем.
4. Владелец переключает пресет `REAL_ESTATE ↔ GENERIC`; данные не стираются, только скрываются.
5. Демо «Demo Realty» остаётся `REAL_ESTATE`; второй демо-тенант — опционально (срез 4).

Допущения исполнителя (заказчик спит, решения записаны в ADR-024):
- A1. Определения доп. полей и подписи статусов хранятся JSON-колонками в `Organization` (≤ 8 полей, читаются вместе с сессией), значения — `Lead.attributes JSONB`.
- A2. Ключ и тип поля неизменяемы после создания; подписи, `required`, `showInCreate`, варианты — редактируемы.
- A3. `required` проверяется при ручном создании и при правке; intake API и импорт CSV его не требуют (внешние системы не знают о новых полях — иначе сломается интеграция сайта).
- A4. Удалённое определение скрывает значения (API их не отдаёт, но не удаляет); повторное создание с тем же ключом снова их показывает.
- A5. Поля недвижимости при `GENERIC` API принимает и хранит (intake/CSV не ломаются), UI их не показывает.
- A6. Подписи статусов применяются в вебе через переопределение ключей i18next (`lead.status.WON` и т. п.), поэтому действуют везде, где рендерится статус.
- A7. Промпты: недвижимость — без изменений (`lead-analysis@2`, `reply-draft@2`, кэш сохраняется); универсальные — отдельные id `lead-analysis-generic@1`, `reply-draft-generic@1`, так что ключи кэша `AiInsight` не пересекаются.

## Контракт

**Prisma:** `enum IndustryPreset { REAL_ESTATE GENERIC }`; `Organization.industryPreset` (default `REAL_ESTATE`), `Organization.leadFieldDefs JSONB '[]'`, `Organization.statusLabels JSONB '{}'`; `Lead.attributes JSONB '{}'`. Миграция `20261022090000_industry_presets` (аддитивная).

**shared:** `INDUSTRY_PRESETS`; `schemas/org-config.ts` — `LeadFieldDefSchema` (`key` `^[a-zA-Z][a-zA-Z0-9_]{0,31}$`, `label {ru?, uz?}` ≥1 непустая, `type text|number|money|single_select`, `options` только для `single_select`, `required`, `showInCreate`), `MAX_LEAD_FIELDS = 8`, `StatusLabelsSchema {WON?, LOST?}`, `buildLeadAttributesSchema(defs, mode)` / `validateLeadAttributes`. `RegisterOrganizationSchema.industryPreset?`, `UpdateOrganizationSchema.industryPreset?/statusLabels?`, `Create/Intake/UpdateLeadSchema.attributes?`, `LeadDto.attributes`, `OrganizationDto`/`MeResponse.organization` + `industryPreset, leadFields, statusLabels`. Право `leadFields.manage` (OWNER, HEAD_OF_SALES). Аудит: `ORG_INDUSTRY_PRESET_CHANGED`, `LEAD_FIELDS_UPDATED`; подписи — `ORG_SETTINGS_UPDATED {fields:['statusLabels']}`.

**API (`/api/v1`):**
| Метод | Путь | Право | Ответ |
|---|---|---|---|
| PATCH | `/organization` (+`industryPreset`, `statusLabels`) | `org.manage` (OWNER) | `OrganizationDto` |
| GET | `/lead-fields` | `org.read` | `LeadFieldDef[]` |
| POST | `/lead-fields` | `leadFields.manage` | 201 `LeadFieldDef[]`; 409 `CONFLICT` (ключ занят), 422 `LEAD_FIELDS_LIMIT` |
| PATCH | `/lead-fields/:key` | `leadFields.manage` | `LeadFieldDef[]`; 404 |
| DELETE | `/lead-fields/:key` | `leadFields.manage` | 204; 404 |

`GET /leads/export.csv` после фиксированных колонок добавляет `attr:<key>` на каждое активное доп. поле (импорт CSV их не читает).

Ошибки значений атрибутов — `400 VALIDATION_FAILED`, `details[].path = attributes.<key>`, коды `unknown_field`, `invalid_value`, `required`.

**AI:** при `GENERIC` анализ и черновик используют универсальные промпты и JSON-схему, где `district/propertyType/rooms` — всегда `null` (формат `LeadAnalysisSchema` прежний). Rule-based: без вопросов о районе/комнатах/типе объекта и без бонусов за них; вопросы — о деталях запроса, удобном времени и незаполненных доп. полях.

## Commands

```
pnpm typecheck · pnpm lint · pnpm test · pnpm test:integration · pnpm i18n:check · pnpm --filter @vippi/web build
```

## Testing Strategy

- shared (vitest): схемы доп. полей и атрибутов.
- api unit: rule-based AI для `GENERIC` (нет вопросов про район/комнаты, поля `null`, нет бонусов).
- api integration: регистрация `GENERIC`; переключение пресета сохраняет данные; лид без района в `GENERIC`; атрибуты — неверный тип, неизвестный ключ, чужой тенант, required; CRUD полей + матрица доступа; подписи статусов.
- web (vitest + RTL): выбор отрасли при регистрации; скрытие полей недвижимости; рендер доп. полей; переопределённые подписи статусов.

## Boundaries

- Always: аддитивные правки; не трогать незакоммиченную работу; `organizationId` только из сессии.
- Never: удалять колонки/данные недвижимости, менять коды статусов, коммитить, деструктивные команды БД кроме тестовой БД.

## Success Criteria

Все проверки из раздела Commands зелёные; сценарий «регистрация как Другой бизнес → доп. поле → лид с полем → AI без вопросов о районе» проходит в интеграционном тесте.

## Вне объёма

Конструктор воронки, сделки/задачи, международные телефоны и валюты, переименование существительного «лид», атрибуты в импорте CSV.
