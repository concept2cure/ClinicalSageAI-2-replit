-- ============================================================================
-- 20260730_release_signature_uniqueness.sql
--
-- 21 CFR Part 11 §11.70 / release-gate OQ-3 ("one active signature per
-- release"). Auth/e-signature audit 2026-07-30 — release-gate integrity phase.
--
-- OQ-3 was enforced ONLY by the sign-release route's check-then-insert
-- (findActiveReleaseSignature → INSERT). That is a race: two concurrent
-- signers both pass the existence check, both insert, and the release ends
-- up with TWO active signatures for one payload — a §11.70 integrity defect
-- and a duplicate-audit hazard. This adds the database backstop the check
-- always needed: a UNIQUE partial index on the active release signature for
-- an (org, payload-digest) pair.
--
-- SCOPE IS DELIBERATE. bound_payload_digest is shared by two paths: release
-- signatures (this invariant) and document e-signatures via
-- /api/esignature/sign, where MULTIPLE active signatures on one version
-- (approval + review + witness, §11.50) are legitimate and carry the SAME
-- version-binding digest. Scoping the index to
-- signature_type = 'submission-release' (the type createElectronicSignature
-- stamps for the release path) enforces OQ-3 without ever blocking document
-- multi-signing.
--
-- Idempotent + safe on populated tables: a guarded pre-step supersedes any
-- pre-existing duplicate active release signatures (keeping the newest) via
-- the write-once superseded_by transition — the one UPDATE the immutability
-- trigger permits — so the unique index can always be created. On real
-- databases the release gate was non-functional until the C-17 port, so this
-- pre-step is expected to touch zero rows.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.electronic_signatures') IS NULL THEN
    RETURN;
  END IF;

  -- Defensive dedup: if two+ active release signatures already share an
  -- (org, digest), supersede all but the newest so the unique index is
  -- creatable. superseded_by NULL→id is the append-only-permitted transition.
  WITH ranked AS (
    SELECT id,
           organization_id,
           bound_payload_digest,
           row_number() OVER (
             PARTITION BY organization_id, bound_payload_digest
             ORDER BY created_at DESC, id DESC
           ) AS rn,
           first_value(id) OVER (
             PARTITION BY organization_id, bound_payload_digest
             ORDER BY created_at DESC, id DESC
           ) AS keep_id
    FROM electronic_signatures
    WHERE signature_type = 'submission-release'
      AND superseded_by IS NULL
      AND bound_payload_digest <> ''
  )
  UPDATE electronic_signatures es
     SET superseded_by = ranked.keep_id
    FROM ranked
   WHERE es.id = ranked.id
     AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS electronic_signatures_active_release_uniq
  ON electronic_signatures (organization_id, bound_payload_digest)
  WHERE superseded_by IS NULL
    AND signature_type = 'submission-release'
    AND bound_payload_digest <> '';
