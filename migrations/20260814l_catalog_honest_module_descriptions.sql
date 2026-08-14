-- Two Apps-catalog descriptions could not be shown to a customer as written.
--
-- `authoring-engine` was sold as "An AI system per document type (no
-- hallucinations, every required element) ... GxP automations whose non-AI
-- validation logic runs as intended 100% of the time." Three absolutes, none
-- of them evidenced, in the one place a buyer decides whether to switch a
-- capability on. The screen behind that description reads no data at all: it
-- renders inline fixtures describing what the engine is built to do. The
-- surface now says so on itself, and `check:compliance-claims` grew rules for
-- AI absolutes so the copy cannot drift back (an earlier draft of that rule
-- was inert — `\b` after `100%` can never match — which is why the claims sat
-- in customer-facing copy while a gate for customer-facing claims was green).
--
-- `document-authoring` — the REAL editor, the one the engine page points at —
-- carried an internal engineering note as its customer-facing description:
-- "See HANDOFF_TO_DESIGN_document_authoring.md — editor + Yjs co-author +
-- track-changes + comments + versions + approval + e-sign all have working
-- backends, no UI." It named an internal document, and its "no UI" was stale:
-- the surface is 1,387 lines over eight endpoint families. The replacement
-- claims only what the surface demonstrably does — editing against the
-- governed section store, commenting, the draft/in-review/approved status
-- ladder, and server-side revisions. It deliberately does NOT claim Yjs
-- co-authoring or track-changes, which have backends but no UI on this
-- surface; describing them here would repeat the original error with the
-- opposite sign.
--
-- Descriptions only. No module is added, removed, re-priced or re-categorised,
-- so no entitlement changes.

-- ROLLBACK
--   Restore the two prior description strings from
--   db/migrations/20260810_reconcile_module_catalog.sql. Rollback restores the
--   unsupported claims; no module, entitlement or surface is touched either way.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.available_modules') IS NULL THEN
    RAISE NOTICE 'available_modules absent — catalog description fixes skipped';
    RETURN;
  END IF;

  UPDATE available_modules
  SET description = 'Capability overview of the CTD authoring engine: the raw-data-to-draft pipeline, the drafting system for each document type, and the deterministic post-checks that run before a draft is promoted. This page describes coverage and does not read your programs — the document editor is where authoring happens.'
  WHERE module_id = 'authoring-engine';

  UPDATE available_modules
  SET description = 'The document editor. Draft and edit sections against the governed section store, comment and resolve, and move a document through draft, in review and approved. Every save is recorded server-side as an auditable revision.'
  WHERE module_id = 'document-authoring';
END
$do$;
