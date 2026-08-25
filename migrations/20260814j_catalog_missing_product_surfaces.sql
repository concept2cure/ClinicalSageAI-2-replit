-- ============================================================================
-- Apps catalog — add eight built surfaces a user could not find
-- (GA ledger L40)
-- ============================================================================
--
-- THE GAP. The product renders 118 surfaces. The persistent rail exposes 14;
-- everything else is meant to be found through the Apps catalog, which is
-- seeded from `available_modules`. Nothing kept the two lists in step, so a
-- surface could be built, routed, tested and shipped while being reachable only
-- by someone who already knew its URL.
--
-- Eight were in exactly that state. Each is backed — a mounted route and live
-- API calls, one of them across seventeen endpoints — and none appeared in the
-- catalog:
--
--   design-controls         /api/design-controls
--   human-factors           /api/human-factors
--   etmf                    /api/etmf
--   ind-lifecycle           /api/ind-lifecycle          (17 endpoints)
--   investigator-brochure   /api/investigator-brochure
--   labeling-smpc           /api/labeling-smpc
--   ectd-publishing         /api/ectd/…
--   report-engine           /api/analytics/…
--
-- ── What is NOT added, and why ──────────────────────────────────────────────
-- The seven `pdev-*` surfaces are also absent from the catalog and stay absent.
-- They are the internal tabs of the `pdev` surface, which IS in the catalog and
-- routes to them through its own nav vocabulary. Listing sub-tabs as separately
-- subscribable modules would misrepresent what a customer is switching on and
-- bury the eight above in noise. They are declared contextual in
-- scripts/ci/check-surface-discoverability.mjs instead, with that reason.
--
-- Nor is anything added to make the gate quiet. A catalog entry is a statement
-- that a capability is available; listing a shell would be worse than the
-- invisibility this fixes, so every id here was checked for a mounted route and
-- real API calls first.
--
-- ── Idempotent, and it does not resurrect a deliberate removal ──────────────
-- ON CONFLICT DO NOTHING: re-running changes nothing, and an entry an operator
-- has since edited or deprecated keeps their version rather than being reset to
-- these defaults. `deprecated` is deliberately not set — the catalog reader
-- filters on it, and an entry added here as deprecated would be invisible
-- again, which is the bug.
--
-- Tier and industry metadata are left OPEN (`[]`) exactly as the neighbouring
-- 2026-08-10 entries are: gating these behind a tier is a commercial decision,
-- and guessing at one here would silently withhold a capability from customers
-- entitled to it.
--
-- ROLLBACK
--   DELETE FROM available_modules WHERE module_id IN (…the eight ids…);
-- Rollback restores the invisibility; no surface, route or data is touched.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.available_modules') IS NULL THEN
    RAISE NOTICE 'available_modules absent — catalog additions skipped';
    RETURN;
  END IF;

  INSERT INTO available_modules
    (module_id, name, description, category, path, icon, sort_order, metadata)
  VALUES
    ('design-controls', 'Design controls',
     'Design inputs, outputs, verification and validation traced to a device design history file, with the traceability matrix an auditor asks for.',
     'Device & diagnostics', '/concept2cure/design-controls', 'shield', 210, '{"tiers": [], "industries": []}'::json),

    ('human-factors', 'Human factors',
     'Use-related risk analysis, use scenarios and usability validation against IEC 62366 and FDA human-factors guidance.',
     'Device & diagnostics', '/concept2cure/human-factors', 'users', 220, '{"tiers": [], "industries": []}'::json),

    ('etmf', 'eTMF',
     'Trial master file structured to the TMF Reference Model, with per-artifact completeness and inspection readiness by trial.',
     'Clinical operations', '/concept2cure/etmf', 'folder', 230, '{"tiers": [], "industries": []}'::json),

    ('ind-lifecycle', 'IND lifecycle',
     'The IND from original submission through amendments, safety reports and annual reports — cover letters, forms, and the sequence each one files into.',
     'Submissions', '/concept2cure/ind-lifecycle', 'fileText', 240, '{"tiers": [], "industries": []}'::json),

    ('investigator-brochure', 'Investigator brochure',
     'IB authoring against ICH E6 structure, drafted from the nonclinical and clinical record rather than from a blank template.',
     'Author & assemble', '/concept2cure/investigator-brochure', 'book', 250, '{"tiers": [], "industries": []}'::json),

    ('labeling-smpc', 'SmPC labeling',
     'EU Summary of Product Characteristics authoring and change control, section by section against the QRD template.',
     'Labeling', '/concept2cure/labeling-smpc', 'tag', 260, '{"tiers": [], "industries": []}'::json),

    ('ectd-publishing', 'Publishing centre',
     'eCTD specification versions, controlled vocabularies and the qualification harness the assembled sequence is checked against.',
     'Submissions', '/concept2cure/ectd-publishing', 'send', 270, '{"tiers": [], "industries": []}'::json),

    ('report-engine', 'Report engine',
     'Protocol and portfolio analytics — structured reads over the study record rather than a static dashboard.',
     'Insights', '/concept2cure/report-engine', 'chart', 280, '{"tiers": [], "industries": []}'::json)
  ON CONFLICT (module_id) DO NOTHING;
END
$do$;
