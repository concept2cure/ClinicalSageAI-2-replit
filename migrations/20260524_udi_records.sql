-- ============================================================================
-- udi_records — UDI assignment + GUDID state (backfill for drizzle table)
-- ============================================================================
--
-- udiRecords is defined in shared/schema.ts and queried by
-- server/routes/mdx-udi.ts, but `drizzle-kit push` does not reliably
-- materialize it in every environment (it gets tangled in enum-rename
-- detection and skips the table), leaving the UDI surface 500ing with
-- "relation udi_records does not exist". This migration creates it
-- idempotently, mirroring the drizzle column definitions verbatim.
-- ============================================================================

CREATE TABLE IF NOT EXISTS udi_records (
    id                  SERIAL PRIMARY KEY,
    organization_id     INTEGER NOT NULL REFERENCES organizations(id),
    program_id          UUID,
    device_name         TEXT NOT NULL,
    udi_di              TEXT NOT NULL,
    udi_pi_format       TEXT,
    issuing_agency      TEXT NOT NULL,
    gmdn_code           TEXT,
    device_class        TEXT,
    product_code        TEXT,
    brand_name          TEXT,
    catalog_number      TEXT,
    version_or_model    TEXT,
    package_qty         INTEGER,
    package_type        TEXT,
    mri_safety          TEXT,
    lot_serial          TEXT,
    prescription_use    BOOLEAN DEFAULT true,
    hctp                BOOLEAN DEFAULT false,
    kit                 BOOLEAN DEFAULT false,
    single_use          BOOLEAN DEFAULT false,
    rx_only             BOOLEAN DEFAULT true,
    gudid_submitted_at  TIMESTAMPTZ,
    gudid_status        TEXT DEFAULT 'draft',
    gudid_payload       JSONB,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS udi_records_org_idx         ON udi_records (organization_id);
CREATE INDEX IF NOT EXISTS udi_records_program_idx     ON udi_records (program_id);
CREATE INDEX IF NOT EXISTS udi_records_org_program_idx ON udi_records (organization_id, program_id);
