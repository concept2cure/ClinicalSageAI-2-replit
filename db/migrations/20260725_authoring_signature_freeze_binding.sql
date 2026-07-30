-- Bind each authoring signature to the frozen snapshot it covers
-- (ledger C-11 residual 2).
--
-- Two independently-verifiable hash chains existed, with nothing joining them:
--
--   frozen_documents.content_hash = sha256(frozen_content)
--       — verifiable against the stored snapshot bytes, and Journey A recomputes
--         it. But it covers a JSON blob that includes a `frozenAt` timestamp.
--
--   authoring_signatures.content_hash = sha256(section code:content join)
--       — verifiable against durable section state, also recomputed by Journey A.
--
-- Both verify. Neither references the other. So a signature could be proven
-- authentic, and a snapshot could be proven unaltered, while nothing established
-- WHICH snapshot a given signature attested to. Under 21 CFR Part 11 §11.70 the
-- signature/record link is the point — a signature not bound to a specific record
-- version is not a Part 11 signature.
--
-- Two additive columns close it:
--
--   covered_freeze_version — the frozen_documents.version in force when signed
--   covered_content_hash   — that snapshot's content_hash
--
-- Both nullable: a signature may legitimately precede any freeze, and existing
-- rows predate this binding. Absence is recorded as absence rather than
-- backfilled with a guess.
--
-- The binding is made cryptographic, not merely referential, by
-- authoring_signatures.signature_digest, which the router now computes over a
-- canonical, TIMESTAMP-FREE string:
--
--   authoring-sig-v1|<signer_email>|<meaning>|<content_hash>|<covered_content_hash>
--
-- Every input is a stored column, so any auditor can recompute the digest from
-- the row alone and detect tampering with the signer, the meaning, the content it
-- covered, or which snapshot it was bound to. The version prefix exists so a
-- future change to the scheme is distinguishable rather than silently
-- incompatible.
--
-- Rollback:
--   ALTER TABLE authoring_signatures DROP COLUMN IF EXISTS covered_freeze_version;
--   ALTER TABLE authoring_signatures DROP COLUMN IF EXISTS covered_content_hash;

ALTER TABLE IF EXISTS authoring_signatures
  ADD COLUMN IF NOT EXISTS covered_freeze_version TEXT;

ALTER TABLE IF EXISTS authoring_signatures
  ADD COLUMN IF NOT EXISTS covered_content_hash TEXT;

-- Answers "which signatures attest to this exact snapshot?" — the query an
-- inspector asks.
CREATE INDEX IF NOT EXISTS idx_authoring_signatures_covered
  ON authoring_signatures (covered_content_hash, tenant_id);
