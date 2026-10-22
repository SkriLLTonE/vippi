-- ADR-025: industry catalog code next to the ADR-024 preset. Additive only; no columns dropped.

-- AlterTable: the default matches the industryPreset default (REAL_ESTATE).
ALTER TABLE "Organization" ADD COLUMN "industry" VARCHAR(32) NOT NULL DEFAULT 'REAL_ESTATE';

-- Backfill: legacy GENERIC organizations become OTHER (no template fields).
UPDATE "Organization" SET "industry" = 'OTHER' WHERE "industryPreset" = 'GENERIC';

-- The synthetic demo clinic (FR-095) already uses the dental template field keys.
UPDATE "Organization" SET "industry" = 'DENTAL_CLINIC'
WHERE "isDemo" = true AND "name" = 'Demo Smile Dental (DEMO)' AND "industryPreset" = 'GENERIC';
