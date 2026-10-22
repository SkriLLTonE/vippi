-- Optional per-organization From address for notification emails (display name = Organization.name).

ALTER TABLE "Organization" ADD COLUMN "emailFrom" VARCHAR(254);
