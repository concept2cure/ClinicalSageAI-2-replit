-- 2026-10-18: bind the company metadata return to the existing purge receipt.
-- Legacy receipts stay NULL. They authorize purge only while no company section
-- exists; exporting again records a versioned deterministic metadata hash.
-- No customer prose, legal metadata, logo bytes or settings are retained here.
ALTER TABLE tenant_export_receipts
  ADD COLUMN IF NOT EXISTS company_documents_version INTEGER,
  ADD COLUMN IF NOT EXISTS company_documents_sha256 TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tenant_export_receipts'::regclass
      AND conname='tenant_export_receipts_company_documents_binding') THEN
    ALTER TABLE tenant_export_receipts ADD CONSTRAINT tenant_export_receipts_company_documents_binding CHECK (
      (company_documents_version IS NULL AND company_documents_sha256 IS NULL) OR
      (company_documents_version IS NOT NULL AND company_documents_version = 1 AND company_documents_sha256 IS NOT NULL
        AND company_documents_sha256 ~ '^[a-f0-9]{64}$')
    );
  END IF;
END $$;
