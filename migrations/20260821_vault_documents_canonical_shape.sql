-- W0-6 — reconcile vault.documents onto ONE shape, so ingestion can happen at all.
--
-- ── The defect ──────────────────────────────────────────────────────────────
-- `vault.documents` had two definitions that never agreed:
--
--   db/migrations/044c_gcc_vault_schema.sql:65   11 columns, CREATE TABLE IF NOT
--                                                EXISTS, from the GCC evidence
--                                                vault: filename, content_hash,
--                                                file_size, mime_type, title,
--                                                source_type, status.
--   shared/schema/vault.ts:69                    the Drizzle model the product
--                                                is written against: 28 columns
--                                                including document_code,
--                                                s3_key, classification,
--                                                processing_status, created_by.
--
-- The migration runs first and `IF NOT EXISTS` makes the model's version a
-- silent no-op, so the shape that exists in a provisioned database is the
-- 11-column one. `POST /api/vault/ingest` — the ONLY endpoint in the product
-- that persists bytes, computes a SHA-256 and writes a document row — INSERTs
-- twenty columns, sixteen of which are not there. Measured against a freshly
-- provisioned database:
--
--   ERROR:  column "document_code" of relation "documents" does not exist
--
-- So every document upload in the product 500s, and has for as long as both
-- definitions have existed. The MDX lane's missing upload button was hiding a
-- back end that could not have accepted the file anyway.
--
-- Nothing caught it. `scripts/ci/check-insert-columns-declared.mjs` compares an
-- INSERT's columns against Drizzle models AND migration lineage, and is
-- satisfied when EITHER declares them — so a model and a migration disagreeing
-- about the same table reads as compliant. That gap is now closed by
-- scripts/ci/check-model-migration-agreement.mjs.
--
-- ── What this does ──────────────────────────────────────────────────────────
-- Additive only. Every column the Drizzle model declares and the legacy table
-- lacks is added; `filename` is carried over into `file_name` rather than
-- renamed, so the GCC-era readers that still select `filename` keep working
-- while the product writes the canonical column. Nothing is dropped.
--
-- `created_by` is INTEGER, not the model's `uuid`. That is a deliberate
-- correction and the model is changed to match: `users.id` is an integer in
-- this database, `req.user.id` is an integer, and the route passes it straight
-- through — a uuid column could never have held a single real value. Two
-- defects in one table definition, and the second would have replaced the
-- missing-column error with a type error the moment the first was fixed.

DO $vault_canonical$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    -- Nothing provisioned this schema in this database; 044c owns creation and
    -- this file only ever reconciles. Staying silent is correct — raising here
    -- would break every install that legitimately has no vault schema.
    RETURN;
  END IF;

  -- Document identity ------------------------------------------------------
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS document_code  TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS document_title TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS document_type  TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS version        TEXT DEFAULT '1.0';

  -- Object storage ---------------------------------------------------------
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS s3_bucket      TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS s3_key         TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS s3_version_id  TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS file_name      TEXT;

  -- Retention + classification. The enum types are created by 044c; guard on
  -- their presence so this file is safe against a partial vault provision.
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'vault' AND t.typname = 'document_classification') THEN
    ALTER TABLE vault.documents
      ADD COLUMN IF NOT EXISTS classification vault.document_classification
      NOT NULL DEFAULT 'INTERNAL';
  ELSE
    ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'INTERNAL';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'vault' AND t.typname = 'storage_class') THEN
    ALTER TABLE vault.documents
      ADD COLUMN IF NOT EXISTS storage_class vault.storage_class NOT NULL DEFAULT 'STANDARD';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'vault' AND t.typname = 'processing_status') THEN
    ALTER TABLE vault.documents
      ADD COLUMN IF NOT EXISTS processing_status vault.processing_status
      NOT NULL DEFAULT 'PENDING';
  ELSE
    ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'PENDING';
  END IF;

  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS retention_policy TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS retention_until  DATE;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS processed_at     TIMESTAMPTZ;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS processing_error TEXT;

  -- Extraction -------------------------------------------------------------
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS page_count     INTEGER;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS word_count     INTEGER;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS language       TEXT DEFAULT 'en';

  -- Lineage ----------------------------------------------------------------
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS parent_document_id UUID;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS supersedes_id      UUID;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;

  -- Attribution. INTEGER to match users.id — see the header.
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS created_by INTEGER;

  -- Carry the legacy identity columns into the canonical ones so an existing
  -- GCC-era row is not left with a null file_name / document_title the product
  -- treats as required. Runs before the NOT NULL tightening below.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'vault' AND table_name = 'documents'
               AND column_name = 'filename') THEN
    UPDATE vault.documents SET file_name = filename WHERE file_name IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'vault' AND table_name = 'documents'
               AND column_name = 'title') THEN
    UPDATE vault.documents SET document_title = title WHERE document_title IS NULL;
  END IF;
  UPDATE vault.documents SET document_code = id::text WHERE document_code IS NULL;
  UPDATE vault.documents SET document_type = 'OTHER'  WHERE document_type IS NULL;
  UPDATE vault.documents SET s3_bucket = 'local'      WHERE s3_bucket IS NULL;
  UPDATE vault.documents SET s3_key = id::text        WHERE s3_key IS NULL;

  -- The legacy identity columns stop BLOCKING the canonical ones.
  --
  -- `filename` is NOT NULL and is the same field as `file_name` spelled
  -- differently, so with both present every canonical INSERT failed a second
  -- time — the missing-column error simply moved:
  --
  --   ERROR:  null value in column "filename" violates not-null constraint
  --
  -- Nothing in server/, shared/ or scripts/ reads `filename`, `title`,
  -- `source_type` or `status` on this table; the live readers are
  -- retentionCron (Drizzle model) and vault-ingest (canonical columns). The
  -- columns are kept rather than dropped — dropping a column is not reversible
  -- and this file's job is to make writes possible, not to prune — but they
  -- stop being required, and `filename` is kept in step with `file_name` for
  -- any reader outside this repo that still expects it.
  ALTER TABLE vault.documents ALTER COLUMN filename DROP NOT NULL;
  UPDATE vault.documents SET filename = file_name WHERE filename IS NULL AND file_name IS NOT NULL;

  -- The uniqueness the route's ON CONFLICT target depends on. Without it the
  -- upsert raises "no unique or exclusion constraint matching the ON CONFLICT
  -- specification" — which would have been the NEXT failure after the missing
  -- columns, on the very same request.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_documents_program_doc_version'
  ) THEN
    ALTER TABLE vault.documents
      ADD CONSTRAINT vault_documents_program_doc_version
      UNIQUE (program_id, document_code, version);
  END IF;
END
$vault_canonical$;
