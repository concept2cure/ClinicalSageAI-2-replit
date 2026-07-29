-- Migration: 20260605_consistency_findings
-- Purpose:  Truth Engine cross-document consistency verdicts (spec §6.4 / §8.1),
--           deferred from Phase 1. A finding records that a claim/section (leftRef)
--           does or does not agree with another reference (rightRef) along a named
--           dimension (e.g. subject-counts, spec-vs-qos, label-vs-safety).
--
-- Reconcile: no consistency_findings table existed. CREATE-NEW. Mandatory 6
-- columns; FKs indexed; snake_case matches camelCase in shared/schema/evidence.ts.

-- Up:
CREATE TABLE IF NOT EXISTS public.consistency_findings (
  id               SERIAL PRIMARY KEY,
  submission_id    INTEGER NOT NULL REFERENCES public.submissions(id),
  dimension        TEXT NOT NULL,                     -- subject-counts | spec-vs-qos | label-vs-safety | ...
  left_ref         TEXT NOT NULL,                     -- the claim/section under review (e.g. "2.7.3")
  right_ref        TEXT NOT NULL,                     -- the reference checked against (e.g. "5.3.5.1")
  status           TEXT NOT NULL,                     -- match | conflict
  detail           TEXT,                              -- one-line discrepancy description for conflicts
  organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by       INTEGER NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_consistency_submission_id   ON public.consistency_findings(submission_id);
CREATE INDEX IF NOT EXISTS idx_consistency_organization_id ON public.consistency_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_consistency_status          ON public.consistency_findings(status);

-- Down:
-- DROP TABLE IF EXISTS public.consistency_findings;
