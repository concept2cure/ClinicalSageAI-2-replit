-- ============================================================================
-- Apps catalog — Global filing strategy
-- ============================================================================
--
-- THE GAP. `/api/regulatory-precedent-intelligence` mounts 39 endpoints and had
-- zero references anywhere in `client/src`. Two of its families exist NOWHERE
-- else in the platform:
--
--   cross-jurisdictional  8 endpoints — filing sequence optimisation, agency
--                                       divergence, reliance pathways
--   confidence            6 endpoints — prediction calibration
--
-- Verified against `/api/precedent-engine`, which serves the overlapping
-- CRL/RTF/EMA/advisory-committee concepts and already has a surface. These
-- fourteen had no duplicate anywhere and no way to reach them.
--
-- ── The backing is real, and the description says what it actually is ──────
-- db/migrations/20260322_regulatory_precedent_intelligence.sql creates the
-- eleven `regulatory_intel.*` tables these endpoints read, and it is in the
-- applied set (scripts/db/migration-set.mjs).
--
-- CORRECTION. The first version of this entry checked that the tables EXIST and
-- did not check that they have ROWS. They ship empty: that migration seeds
-- nothing, and the only INSERTs anywhere in the repo are these endpoints' own
-- write handlers. So the original description — "Where to file and in what order
-- across agencies" — promised a shipped knowledge base, and what exists is
-- storage plus query for a record the tenant builds.
--
-- That is a real capability and worth listing, but it has to be listed as what
-- it is. The rule this file already states is that a catalog entry is a
-- statement a capability is available, and listing a shell is worse than the
-- invisibility it fixes; describing an empty store as a populated one is the
-- same failure in a different place.
--
-- ── What the surface covers, so this is not a promise ───────────────────────
-- Filing sequence optimisation across two or more agencies, requirement
-- divergence between any agency pair, and the confidence-calibration report.
-- It deliberately does NOT touch the CRL/RTF/EMA/advisory-committee endpoints:
-- those overlap with precedent-engine's independent 1,797-line implementation,
-- and choosing which of two implementations is authoritative changes the advice
-- a sponsor receives. That is a domain decision, recorded in
-- docs/design/WORK_ORDER_mission_control.md rather than taken here.
--
-- Category places it with the regulatory-intelligence surfaces a strategist
-- already works from, rather than inventing one.
--
-- Tier and industry metadata are left OPEN (`[]`), matching the neighbouring
-- entries: gating this is a commercial decision, and guessing would withhold a
-- capability from customers entitled to it.
--
-- ROLLBACK
--   DELETE FROM available_modules WHERE module_id = 'filing-strategy';
-- Rollback restores the invisibility; no surface, route or data is touched.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.available_modules') IS NULL THEN
    RAISE NOTICE 'available_modules absent — catalog addition skipped';
    RETURN;
  END IF;

  INSERT INTO available_modules
    (module_id, name, description, category, path, icon, sort_order, metadata)
  VALUES
    ('filing-strategy', 'Global filing strategy',
     'Build and consult your organisation''s cross-jurisdictional record: filing sequence across agencies, where two agencies diverge on requirements, and how well past predictions held up. Starts empty — the record is yours to populate.',
     'Regulatory intelligence', '/concept2cure/filing-strategy', 'route', 206,
     '{"tiers": [], "industries": []}'::json)
  ON CONFLICT (module_id) DO NOTHING;

  RAISE NOTICE 'Global filing strategy catalog entry ensured';
END
$do$;
