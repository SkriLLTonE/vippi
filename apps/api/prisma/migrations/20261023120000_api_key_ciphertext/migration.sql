-- Encrypted copy of the full API key (AES-256-GCM, API_KEY_ENCRYPTION_KEY) so owners can copy it later.
-- Existing keys stay hash-only (NULL): they keep working and become copyable after rotation.
ALTER TABLE "ApiKey" ADD COLUMN "keyCiphertext" TEXT,
ADD COLUMN "keyLast3" VARCHAR(3);
