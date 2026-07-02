# PII/PHI Field-Level Encryption — Adoption Plan

**Date:** 2026-07-02
**Utility:** `server/services/security/field-encryption.ts`
**Status:** Utility + tests landed. Column migration is separate DB work (see "Migration approach").

## Summary

A reusable field-level encryption helper now exists. It reuses the platform's
established crypto approach — AES-256-GCM, random 12-byte IV per value, appended
128-bit auth tag — the same scheme already used by
`server/services/mfaService.ts` (TOTP secrets) and
`server/services/integrations/credentialVault.ts` (integration credentials). It
mirrors credentialVault's production fail-closed key discipline: production
throws if the dedicated key is unset; a non-secret dev key is allowed only
outside production and logged loudly.

### API

| Function | Signature | Notes |
|----------|-----------|-------|
| `encryptField` | `(plaintext: string \| null \| undefined) => string \| null \| undefined` | Returns `enc:v1:<b64(iv)>:<b64(tag)>:<b64(ct)>`. Empty string and null/undefined pass through unchanged. |
| `decryptField` | `(payload: string \| null \| undefined) => string \| null \| undefined` | Throws on non-`enc:v1:` input, on malformed payloads, and on any GCM auth failure (tampered IV/tag/ciphertext). No plaintext leaked in errors. |
| `isEncrypted` | `(value: unknown) => boolean` | True iff a string carrying the `enc:v1:` prefix. Used to dual-read mixed columns during migration. |

- **Key:** `PII_ENCRYPTION_KEY` (dedicated env var). Derived to a 32-byte AES key
  via SHA-256, identical to credentialVault/mfaService.
- **Versioned + self-describing** format (`enc:v1:`) so ciphertext is detectable
  and the scheme can evolve (`v2`) without ambiguity.

## Candidate PII/PHI columns to adopt this

Columns below were identified by grepping the schema. These are the encryption
targets; the actual ALTER/backfill is DB work handled separately.

### Direct patient identifiers (highest priority)

| Table | Column | File:line | Type |
|-------|--------|-----------|------|
| `dose_cohorts` | `patient_id` | `shared/schema.ts:13258` | text |
| `dlt_events` | `patient_id` | `shared/schema.ts:13298` | text |
| `rbm_patient_profiles` | `subject_id` | `shared/schema.ts:18346` | text |
| `clinical_study_deviations` | `subject_id` | `shared/schema.ts:19076` | text |
| `clinical_study_aes` | `subject_id` | `shared/schema.ts:19101` | text |
| `regulatory-atoms` | `subject_name` | `shared/schema/regulatory-atoms.ts:333` | text |
| `ind-cross-references` | `subject_name` | `shared/schema/ind-cross-references.ts:38` | text |
| `ind-master-data` (person) | `first_name`, `last_name` | `shared/schema/ind-master-data.ts:137-138` | text |

> Note: several `patient_id` / `subject_id` columns participate in unique
> indexes (e.g. `cohort_patient_idx` in `dose_cohorts`). Because AES-GCM is
> non-deterministic (random IV), encrypting an indexed identifier breaks
> equality lookups and uniqueness. For those columns, either (a) keep a separate
> deterministic keyed HMAC "blind index" column for lookup while storing the
> encrypted value for display, or (b) leave the pseudonymized study ID in place
> and encrypt only the columns that are not used as lookup keys. This is a
> DB-design decision to make during the migration.

### Diagnosis / clinical coding

| Table | Column | File:line | Type |
|-------|--------|-----------|------|
| `coverage-analysis` | `icd10_code` | `shared/schema/coverage-analysis.ts:89` | text |

### Biomarkers

| Table | Column | File:line | Type |
|-------|--------|-----------|------|
| (biomarker registry) | `biomarker_used` | `shared/schema.ts:12753` | text |
| (biomarker registry) | `biomarker_name`, `biomarker_type` | `shared/schema.ts:12957-12958` | text |
| `csr-knowledge-db` | `biomarker_name`, `biomarker_type` | `shared/schema/csr-knowledge-db.ts:735-736` | text/varchar |
| `regulatory-atoms` | `biomarker_name`, `biomarker_type` | `shared/schema/regulatory-atoms.ts:213-214` | text |
| (clinical row) | `biomarker` | `shared/schema.ts:18739` | text |
| `dose_cohorts` | `biomarker_results` | `shared/schema.ts:13272` | json (per-field encrypt values before serializing) |

### Demographics

| Table | Column | File:line | Type |
|-------|--------|-----------|------|
| `csr-knowledge-db` | `age_range` | `shared/schema/csr-knowledge-db.ts:392` | varchar |

> **SSN / DOB / MRN:** No literal `ssn`, `date_of_birth`, or `mrn` columns were
> found in the current schema. If/when they are added (or discovered in a JSON
> demographics blob such as `dose_cohorts.metadata`), they are the top-priority
> candidates and must be wrapped in `encryptField` at write time. DOB stored as
> a real `date` column cannot be encrypted in place — it would need to move to a
> `text`/`bytea` column first (DB work).

## Recommended migration approach (per column)

For each column above, three phases — all coordinated with the separate DB work:

1. **Dual-read (deploy code first).** At every read site, wrap the value:
   `isEncrypted(v) ? decryptField(v) : v`. This tolerates a column that still
   holds legacy plaintext alongside newly-encrypted values. At every write site,
   call `encryptField(v)`. New writes are encrypted immediately; old rows remain
   readable.

2. **Backfill (DB work, separate).** A batch job reads each row, and for any
   value where `isEncrypted(v) === false`, rewrites it as `encryptField(v)`.
   Idempotent and resumable because already-encrypted rows are skipped via
   `isEncrypted`.

3. **Enforce.** Once the backfill is complete and verified (no rows fail
   `isEncrypted`), tighten reads to assume ciphertext and, if desired, add a
   check/monitor that flags any plaintext write. The `v1` version tag leaves room
   for a future `v2` re-key/re-scheme migration using the same dual-read shape.

### Constraints to respect during migration (DB-owned)

- **Indexed / unique identifier columns:** see the note above — non-deterministic
  encryption breaks equality and uniqueness. Decide blind-index vs. leave-as-ID
  per column.
- **Non-text column types** (`date` DOB, numeric age): must change to a
  text/bytea column to hold the `enc:v1:` string. Schema change, done separately.
- **JSON columns** (`biomarker_results`, `metadata`): encrypt the sensitive
  leaf values before serializing, not the whole document, so non-sensitive keys
  stay queryable.
- **Key management:** provision `PII_ENCRYPTION_KEY` in every non-dev
  environment before enabling encrypted writes. Losing the key = losing the
  data (GCM has no recovery). Coordinate key custody with the same process used
  for `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`.

## Out of scope for this change

- No schema files, migrations, routes, or services were modified.
- The actual column encryption (ALTER TABLE, backfill jobs, index redesign) is
  DB work being handled separately. This utility + adoption plan is the
  application-layer building block those changes will call.
