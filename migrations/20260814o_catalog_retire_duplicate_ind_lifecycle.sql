-- ============================================================================
-- Apps catalog — retire the duplicate 'ind-lifecycle' row
-- ============================================================================
--
-- THE DEFECT. migrations/20260814j_catalog_missing_product_surfaces.sql added
-- eight built-but-undiscoverable surfaces to the catalog. Seven were genuinely
-- absent. The eighth, 'ind-lifecycle', was already in the catalog under its
-- canonical id:
--
--   db/migrations/20260810_reconcile_module_catalog.sql:283
--     ('ind-checklist', 'IND lifecycle',
--      'IND checklist, forms (1571/1572/3674), autodraft, master data,
--       amendments, annual reports, safety reports.', …)
--
-- Same product, same label, same scope. 'ind-lifecycle' is not a second surface
-- — client/src/concept2cure/v2/surfaceViews.ts mounts the SAME `IndLifecycle`
-- component at both ids (lines 433 and 434), and registryModel's
-- DEEP_LINK_ALIASES canonicalises 'ind-lifecycle' → 'ind-checklist' so the shell
-- never has two active ids for one screen.
--
-- The consequence of the duplicate row is not cosmetic. A catalog row IS an
-- entitlement toggle, so one module appeared twice in the Apps catalog and could
-- be switched on under one id and off under the other — an organization could be
-- sold "IND lifecycle" and still have it dark, or be billed for it twice.
--
-- ── Retire, do not delete ───────────────────────────────────────────────────
-- Same rule the 20260810 re-key states and follows: organization_modules
-- references available_modules ON DELETE CASCADE, so deleting a row silently
-- takes every subscription attached to it. Deprecating hides the row from the
-- catalog reader and leaves the record intact.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Clear the flag; do NOT delete anything:
--   UPDATE available_modules
--      SET metadata = COALESCE(metadata::jsonb, '{}'::jsonb) - 'deprecated',
--          updated_at = now()
--    WHERE module_id = 'ind-lifecycle';
--
-- Idempotent: re-running sets the same flag on the same row.
-- ============================================================================

-- `metadata` is a `json` column, so it is cast to jsonb for the merge exactly as
-- the 20260810 re-key does (postgres has no || operator on plain json).
UPDATE available_modules
   SET metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || '{"deprecated": true}'::jsonb,
       updated_at = now()
 WHERE module_id = 'ind-lifecycle';
