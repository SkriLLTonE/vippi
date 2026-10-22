-- ADR-024: industry presets, custom lead fields and per-organization status labels. Additive only.

-- CreateEnum
CREATE TYPE "IndustryPreset" AS ENUM ('REAL_ESTATE', 'GENERIC');

-- AlterTable: existing organizations keep the real-estate behaviour.
ALTER TABLE "Organization" ADD COLUMN     "industryPreset" "IndustryPreset" NOT NULL DEFAULT 'REAL_ESTATE',
ADD COLUMN     "leadFieldDefs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "statusLabels" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}';
