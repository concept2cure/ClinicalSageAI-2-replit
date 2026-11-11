-- ============================================================================
-- 20261110_projects_risk_level_not_defaulted.sql
--
-- P-122 defects, item 2 (2026-11-10). Evidence: docs/evidence/DESIGN/P-122/defects/2-rollup/.
--
-- projects.risk_level carried DEFAULT 'medium' (shared/schema.ts projects.riskLevel, laid down by push), so every
-- project was created with a risk of "medium" that no person, rule or engine had assessed, and the project
-- hierarchy's roll-up (server/services/project-rollup-service.ts) reported it as the project's risk. The level is
-- recorded by a person (AnA's update-project command, the project's rules) or a rule (the rules engine's
-- escalation); until one is, there is none.
--
-- This removes the default, so a project created from now on has no risk level until one is recorded.
--   - Its only creator is push; shared/schema.ts drops the default in the same change, and nothing in the set sets
--     one (migrations/0000_sweet_joseph.sql still declares it, but is inert on every applier: its first CREATE
--     TABLE fails 42P07 against push). So nothing re-creates what this removes (CLAUDE.md RULE 1).
--   - Conditional: it acts only while the column has a default, so every deploy after the first does nothing.
--   - It changes no row. A project created before this reads 'medium' whether a person recorded it or the default
--     gave it, and the two cannot be told apart from the row; which stored values to clear is a decision for a
--     person, not a replayed migration (a replayed UPDATE would also clear a 'medium' recorded later).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'projects'
       AND column_name = 'risk_level'
       AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.projects ALTER COLUMN risk_level DROP DEFAULT;
  END IF;
END $$;
