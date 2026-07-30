-- Part 11 credential verification needs three columns no migration ever added
-- (ledger C-20).
--
-- part11ComplianceService.verifyUserCredentials — the §11.200 identity check in
-- front of EVERY electronic signature on this platform — selects:
--
--     users.id, users.password_hash, users.status, users.locked_until
--
-- and then reads users.failed_login_attempts / users.last_failed_login when a
-- password fails, for lockout tracking.
--
-- `public.users` is created by migrations/0000_sweet_joseph.sql with:
--   id, email, name, password_hash, title, department, avatar, bio, status,
--   last_login, default_organization_id, preferences, created_at, updated_at
--
-- `locked_until`, `failed_login_attempts` and `last_failed_login` are NOT among
-- them, and no migration adds them. They exist only in shared/schema.ts — the
-- `drizzle-kit push` surface. (db/migrations/051_gcc_multi_tenant_identity.sql
-- does define failed_login_attempts, but on `identity.users`, a different
-- schema-qualified table.)
--
-- Consequence on any migration-provisioned environment: the SELECT throws
-- "column locked_until does not exist", verifyUserCredentials catches it and
-- returns false, and the caller reports invalid credentials. So NO electronic
-- signature can be applied anywhere — /api/esignature/sign,
-- /api/submissions/:id/sign-release, /api/part11/signatures and the AnA
-- verified-seal route all fail identically, and all of them fail as
-- "wrong password" rather than as a schema fault. A correct password is
-- indistinguishable from a wrong one.
--
-- This is the same root cause as C-17 and C-19 — a capability provisioned on the
-- push path only — but the widest blast radius of the three, because it is the
-- shared credential check rather than one route's storage.
--
-- All three are additive and nullable/defaulted, so existing rows stay valid.
--
-- Rollback:
--   ALTER TABLE users DROP COLUMN IF EXISTS locked_until;
--   ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts;
--   ALTER TABLE users DROP COLUMN IF EXISTS last_failed_login;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

-- NULL means "not locked". The check is `locked_until > now()`, so a NULL row is
-- never locked out — the safe default for existing accounts.
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP;

-- Supports the lockout sweep ("which accounts are currently locked?").
CREATE INDEX IF NOT EXISTS idx_users_locked_until
  ON users (locked_until)
  WHERE locked_until IS NOT NULL;

-- ── The rest of the auth surface, for the same reason ───────────────────────
--
-- createElectronicSignature loads the signer with a bare
-- `select().from(users)`, which drizzle expands to EVERY column in the
-- shared/schema.ts definition. So the signature path fails on the first missing
-- one regardless of whether it is semantically needed — the error above was
-- `column "mfa_enabled" does not exist`, reached only after locked_until was
-- fixed. Adding the lockout trio alone would just move the failure along.
--
-- These sixteen columns are exactly what that emitted SELECT lists and the
-- 0000 baseline lacks. Types mirror shared/schema.ts.
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSON;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT 'email';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email_otp_hash TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER DEFAULT 0;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_history JSON;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP;

-- ── electronic_signatures: the audit timestamps drizzle assumes ─────────────
--
-- shared/schema.ts declares createdAt/updatedAt on this table; the 0000 baseline
-- has only signed_at. findActiveReleaseSignature orders by created_at, so the
-- "is there already an active signature for this payload?" lookup failed with
-- "column created_at does not exist" — logged as non-fatal, which meant the
-- idempotency check silently never worked.
ALTER TABLE IF EXISTS electronic_signatures
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS electronic_signatures
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ── device_audit_trail: the same one-column drift ───────────────────────────
--
-- part11ComplianceService writes a device_audit_trail row as part of creating a
-- signature, and drizzle's insert names every column in its definition —
-- including updated_at, which the 0000 baseline omits. One absent column failed
-- the whole signature creation.
ALTER TABLE IF EXISTS device_audit_trail
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
