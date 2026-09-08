-- Vault filing — dossier placement columns on vault.documents.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- Every uploaded document lands in vault.documents with documentType='OTHER'
-- (client/src/concept2cure/v2/useVaultUpload.ts hard-codes it: "a file named
-- like a CSR is not grounds to FILE it as a CSR") and NO dossier position of
-- any kind — no folder, no module, no section. The taxonomy that says where a
-- file belongs exists (shared/constants/domain/vault-taxonomy.ts folder
-- presets; server/services/ctd-ingestion-service.ts detectCTDSection;
-- server/services/etmf/etmf-logic.ts zone rules) and none of it runs on the
-- upload path, so the Vault tree cannot show an upload anywhere but nowhere.
--
-- ── What this adds ──────────────────────────────────────────────────────────
-- A PLACEMENT, distinct from the document's type. The classifier PROPOSES
-- (placement_status='suggested', with confidence + a human-readable rationale)
-- and a person CONFIRMS or moves (placement_status='confirmed', placed_by /
-- placed_at, chained audit row) — automatic filing with visible provenance,
-- never a silent guess written into a regulatory type column. A document the
-- classifier cannot place stays 'unfiled' and visibly so: the Vault renders an
-- Unfiled queue, not a black hole.
--
--   folder_id             taxonomy folder id for the program's vault view
--                         (vault-taxonomy.ts presets: module-1..module-5 /
--                         sequences / corresp / shared for pharma+biotech;
--                         k510 / pma / cer / eng / udi / pv / qms / corresp /
--                         shared for device+ivd; z01..z11 TMF zones for the
--                         service view). NULL = unfiled.
--   evidence_kind         what the document IS (VaultDocKind vocabulary).
--   ctd_section           finer CTD placement when detected (e.g. '3.2.P.8').
--   placement_status      unfiled | suggested | confirmed. App-enforced
--                         vocabulary (TEXT like document_type, not an enum, so
--                         a partial vault provision cannot strand the column).
--   placement_confidence  high | medium | none — the classifier's own claim.
--   placement_rationale   why the classifier (or person) placed it there;
--                         rendered in the UI and carried into the audit row.
--   placed_by / placed_at who confirmed/moved it, when (NULL while suggested —
--                         a machine suggestion is not a person's signature).
--
-- Additive only, same guard discipline as
-- migrations/20260821_vault_documents_canonical_shape.sql: a database that has
-- no vault schema is legitimate and this file stays silent there.

DO $vault_placement$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS folder_id            TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS evidence_kind        TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS ctd_section          TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS placement_status     TEXT NOT NULL DEFAULT 'unfiled';
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS placement_confidence TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS placement_rationale  TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS placed_by            INTEGER;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS placed_at            TIMESTAMPTZ;

  -- The Vault tree groups a program's uploads by folder, and the Unfiled queue
  -- filters on placement_status; both reads are per-program.
  CREATE INDEX IF NOT EXISTS vault_documents_program_folder_idx
    ON vault.documents (program_id, folder_id);
  CREATE INDEX IF NOT EXISTS vault_documents_program_placement_idx
    ON vault.documents (program_id, placement_status);
END
$vault_placement$;
