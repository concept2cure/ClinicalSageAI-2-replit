-- ═══════════════════════════════════════════════════════════════════════════
-- file_uploads.checksum_sha256 — so a stored document's bytes can be checked
-- against what was received (GA ledger L25).
--
-- L25 records this as "the byte reader never loads the checksum". The gap is
-- one level deeper: there was no checksum to load. `file_uploads` carried
-- id, user_id, original_name, mime_type, file_size, storage_path, status,
-- created_at, organization_id — and no digest of any kind. So nothing about an
-- uploaded document was ever verifiable after the fact: bytes silently altered
-- on disk, a truncated write, or a restore from a bad backup would all be
-- served to a regulatory user as the original, and `file_size` is the only
-- thing that would have to be kept consistent to hide it.
--
-- ── Why existing rows are left NULL rather than backfilled ──────────────────
-- The bytes are still on disk, so a backfill is trivially possible — and it is
-- exactly the wrong thing to do. Hashing whatever is on disk TODAY and storing
-- it as the authentic digest would launder any corruption that has already
-- happened into a "verified" state, and would do it for every legacy row at
-- once. The one thing worse than an unverifiable record is a false claim that
-- it was verified.
--
-- NULL therefore means "recorded before checksums existed — not verifiable",
-- and the reader reports that distinctly from a match and from a mismatch.
-- Rows written from here on carry a digest of the bytes as received.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.file_uploads') IS NULL THEN
    RAISE NOTICE '[file-uploads-checksum] table not present — nothing to do.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'file_uploads'
       AND column_name  = 'checksum_sha256'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.file_uploads ADD COLUMN checksum_sha256 text;

  COMMENT ON COLUMN public.file_uploads.checksum_sha256 IS
    'Lowercase hex SHA-256 of the bytes as received. NULL means the row predates '
    'checksumming and its bytes are NOT verifiable — never backfilled, because '
    'hashing the current bytes would record corruption as authentic.';

  RAISE NOTICE '[file-uploads-checksum] added checksum_sha256 (existing rows left NULL).';
END $$;
