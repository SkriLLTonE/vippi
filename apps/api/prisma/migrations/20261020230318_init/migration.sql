-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'HEAD_OF_SALES', 'MANAGER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('NO_ANSWER', 'TOO_EXPENSIVE', 'BOUGHT_ELSEWHERE', 'NOT_INTERESTED', 'DUPLICATE', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'TELEGRAM', 'WEBSITE', 'OLX', 'PHONE', 'WALK_IN', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadCreatedVia" AS ENUM ('MANUAL', 'CSV', 'API', 'SEED');

-- CreateEnum
CREATE TYPE "SlaState" AS ENUM ('PENDING', 'MET', 'BREACHED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('CALL', 'TELEGRAM', 'INSTAGRAM', 'WHATSAPP', 'SMS', 'EMAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UZS', 'USD');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'FIRST_CONTACT', 'COMMENT', 'SLA_BREACHED', 'FIELDS_UPDATED', 'AI_ANALYSIS_GENERATED', 'AI_DRAFT_SENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SLA_BREACHED', 'LEAD_ASSIGNED');

-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('LEAD_ANALYSIS', 'REPLY_DRAFT', 'WEEKLY_SUMMARY');

-- CreateEnum
CREATE TYPE "AiProviderName" AS ENUM ('GEMINI', 'RULE_BASED');

-- CreateEnum
CREATE TYPE "AiFallbackReason" AS ENUM ('NO_PROVIDER_CONFIGURED', 'ORG_DISABLED', 'LIMIT_EXCEEDED', 'INPUT_TOO_LONG', 'TIMEOUT', 'PROVIDER_ERROR', 'INVALID_OUTPUT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'API_KEY', 'SYSTEM');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent',
    "defaultLocale" VARCHAR(2) NOT NULL DEFAULT 'ru',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "aiExternalProcessingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nextLeadNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "locale" VARCHAR(2) NOT NULL DEFAULT 'ru',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "ip" INET,
    "userAgent" VARCHAR(256),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "invitedById" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "acceptedUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "createdById" UUID,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "fullName" VARCHAR(100),
    "phone" VARCHAR(16),
    "source" "LeadSource" NOT NULL,
    "sourceDetail" VARCHAR(100),
    "message" TEXT,
    "budgetAmount" BIGINT,
    "budgetCurrency" "Currency",
    "district" VARCHAR(32),
    "propertyType" "PropertyType",
    "rooms" SMALLINT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "lostReason" "LostReason",
    "lostComment" VARCHAR(500),
    "assigneeId" UUID,
    "createdById" UUID,
    "createdVia" "LeadCreatedVia" NOT NULL,
    "externalId" VARCHAR(100),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstResponseDueAt" TIMESTAMPTZ(3) NOT NULL,
    "firstResponseAt" TIMESTAMPTZ(3),
    "firstResponseById" UUID,
    "firstResponseChannel" "ContactChannel",
    "slaState" "SlaState" NOT NULL DEFAULT 'PENDING',
    "slaBreachedAt" TIMESTAMPTZ(3),
    "possibleDuplicateOfId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "searchText" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "actorUserId" UUID,
    "body" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 15,
    "forgottenAfterHours" INTEGER NOT NULL DEFAULT 24,
    "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "workdays" SMALLINT[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::SMALLINT[],
    "workStart" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "workEnd" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "leadId" UUID,
    "payload" JSONB NOT NULL,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID,
    "kind" "AiInsightKind" NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "promptVersion" VARCHAR(32) NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "params" JSONB,
    "provider" "AiProviderName" NOT NULL,
    "model" VARCHAR(64),
    "isFallback" BOOLEAN NOT NULL,
    "fallbackReason" "AiFallbackReason",
    "output" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" UUID,
    "actorApiKeyId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(32),
    "entityId" UUID,
    "subjectHash" CHAR(64),
    "metadata" JSONB,
    "ip" INET,
    "userAgent" VARCHAR(256),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_status_idx" ON "Membership"("organizationId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_createdAt_idx" ON "Invitation"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_revokedAt_idx" ON "ApiKey"("organizationId", "revokedAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_receivedAt_idx" ON "Lead"("organizationId", "status", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_organizationId_source_receivedAt_idx" ON "Lead"("organizationId", "source", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_number_key" ON "Lead"("organizationId", "number");

-- CreateIndex
CREATE INDEX "LeadActivity_organizationId_leadId_createdAt_idx" ON "LeadActivity"("organizationId", "leadId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_organizationId_key" ON "SlaPolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiInsight_organizationId_createdAt_idx" ON "AiInsight"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_organizationId_leadId_kind_createdAt_idx" ON "AiInsight"("organizationId", "leadId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_action_createdAt_idx" ON "AuditLog"("organizationId", "action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_firstResponseById_fkey" FOREIGN KEY ("firstResponseById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_possibleDuplicateOfId_fkey" FOREIGN KEY ("possibleDuplicateOfId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorApiKeyId_fkey" FOREIGN KEY ("actorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL not expressible in Prisma schema (SPEC §10)
-- ---------------------------------------------------------------------------

-- Lead constraints
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_message_len" CHECK ("message" IS NULL OR char_length("message") <= 4000);
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_budget_pair" CHECK (("budgetAmount" IS NULL) = ("budgetCurrency" IS NULL));
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_budget_positive" CHECK ("budgetAmount" IS NULL OR "budgetAmount" > 0);
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_rooms_range" CHECK ("rooms" IS NULL OR ("rooms" BETWEEN 1 AND 10));
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_lost_reason" CHECK (("lostReason" IS NOT NULL) = ("status" = 'LOST'));
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_first_response_after_received" CHECK ("firstResponseAt" IS NULL OR "firstResponseAt" >= "receivedAt");

-- Lead indexes
CREATE INDEX "Lead_org_received_active_idx" ON "Lead" ("organizationId", "receivedAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX "Lead_org_assignee_status_idx" ON "Lead" ("organizationId", "assigneeId", "status") WHERE "deletedAt" IS NULL;
CREATE INDEX "Lead_org_overdue_idx" ON "Lead" ("organizationId", "slaState", "firstResponseDueAt") WHERE "firstResponseAt" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX "Lead_scheduler_idx" ON "Lead" ("firstResponseDueAt") WHERE "slaState" = 'PENDING' AND "firstResponseAt" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX "Lead_org_phone_idx" ON "Lead" ("organizationId", "phone") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Lead_org_externalId_key" ON "Lead" ("organizationId", "externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX "Lead_searchText_trgm_idx" ON "Lead" USING GIN ("searchText" gin_trgm_ops);

-- Comments
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_comment_len" CHECK ("type" <> 'COMMENT' OR char_length("body") BETWEEN 1 AND 2000);

-- SLA policy
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_minutes_range" CHECK ("firstResponseMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_forgotten_range" CHECK ("forgottenAfterHours" BETWEEN 1 AND 168);
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_window" CHECK ("workStart" < "workEnd");

-- Invitations: one active invitation per email per organization
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_role" CHECK ("role" IN ('HEAD_OF_SALES', 'MANAGER'));
CREATE UNIQUE INDEX "Invitation_org_email_active_key" ON "Invitation" ("organizationId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- AI insights cache
CREATE INDEX "AiInsight_cache_idx" ON "AiInsight" ("organizationId", "kind", "inputHash") WHERE "isFallback" = false;
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_fallback_reason" CHECK (("fallbackReason" IS NOT NULL) = "isFallback");

-- Audit: failed-login counter
CREATE INDEX "AuditLog_failed_login_idx" ON "AuditLog" ("subjectHash", "action", "createdAt") WHERE "action" = 'AUTH_LOGIN_FAILED';
