-- 20261015_shadow_review_waiver.sql
--
-- P-34 (docs/LAUNCH_DEFINITION_OF_DONE.md, decided 2026-10-15): Shadow Review
-- stays a dispatch gate, with a signed human waiver for an AI provider outage.
--
-- Three columns on shadow_review_runs (migrations/20260604_shadow_review.sql),
-- and nothing else:
--
--   failure_code               Why a 'failed' run failed, from the closed set in
--                              server/services/shadow-review/shadow-review-failure.ts
--                              (provider_unavailable, provider_overloaded,
--                              rate_limited, invalid_ai_response,
--                              model_not_qualified, placement_refused,
--                              policy_blocked, token_limit,
--                              no_provider_configured, internal). Until now a
--                              failed run kept no reason at all, so nothing could
--                              tell an outage from a reply that was not an
--                              assessment or a governance refusal. Only the first
--                              two are waivable. NULL on a run that is not failed,
--                              and on a run that failed before this file — such a
--                              run cannot be shown to be an outage, so it is
--                              never waivable.
--   waiver_signature_action_id On a row with status 'waived': the governed `sign`
--                              action (c2c_ana_actions.id, intent 'shadow-waiver')
--                              whose Part 11 signature waived the review.
--   waived_failed_run_id       On a row with status 'waived': the failed run the
--                              waiver relies on.
--
-- status gains the value 'waived'. The column has no CHECK (20260604), and none
-- is added: the vocabulary is the service's, and under CLAUDE.md RULE 1 a CHECK a
-- later file also defines is the replay hazard that rule exists for. Every reader
-- that counts reviews filters status = 'complete' (the dispatch assessor's
-- countCompletedShadowRuns, the Shadow Review view assembler), so a waived row is
-- never counted as a review.
--
-- Single use is held twice: by the ledger (an audit row SHADOW_REVIEW_WAIVED
-- spends the signature, submission-service signatureSpentBy) and here, by a
-- partial unique index per signature, and one waiver per failed run.
--
-- Replay-safe (RULE 1): additive and IF NOT EXISTS throughout. The foreign key is
-- added separately and only when pg_constraint does not already hold it, so a
-- re-run never adds a second copy. Drops nothing. public + organization_id
-- INTEGER NOT NULL already (20260604), so the tenant sweeps cover the table and
-- this file sits anywhere above the final pair. Mirrored in
-- shared/schema/shadow-review.ts.

ALTER TABLE public.shadow_review_runs
  ADD COLUMN IF NOT EXISTS failure_code TEXT;

ALTER TABLE public.shadow_review_runs
  ADD COLUMN IF NOT EXISTS waiver_signature_action_id TEXT;

ALTER TABLE public.shadow_review_runs
  ADD COLUMN IF NOT EXISTS waived_failed_run_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shadow_review_runs_waived_failed_run_id_fkey'
       AND conrelid = 'public.shadow_review_runs'::regclass
  ) THEN
    ALTER TABLE public.shadow_review_runs
      ADD CONSTRAINT shadow_review_runs_waived_failed_run_id_fkey
      FOREIGN KEY (waived_failed_run_id) REFERENCES public.shadow_review_runs(id);
  END IF;
END $$;

-- Every FK indexed (the 20260604 convention); unique, because one failed run
-- supports one waiver.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_runs_waived_failed_run
  ON public.shadow_review_runs (waived_failed_run_id)
  WHERE waived_failed_run_id IS NOT NULL;

-- A waiver signature is used once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_runs_waiver_signature
  ON public.shadow_review_runs (organization_id, waiver_signature_action_id)
  WHERE waiver_signature_action_id IS NOT NULL;

COMMENT ON COLUMN public.shadow_review_runs.failure_code IS
  'Why a failed run failed (closed set, shadow-review-failure.ts). Only provider_unavailable and provider_overloaded are waivable (P-34). NULL when not failed, or failed before 2026-10-15.';

COMMENT ON COLUMN public.shadow_review_runs.waiver_signature_action_id IS
  'status = waived: the governed sign action (intent shadow-waiver) whose Part 11 signature waived Shadow Review for this sequence (P-34).';

COMMENT ON COLUMN public.shadow_review_runs.waived_failed_run_id IS
  'status = waived: the failed run (provider outage) the waiver relies on (P-34).';

-- Down:
-- DROP INDEX IF EXISTS public.uq_shadow_runs_waiver_signature;
-- DROP INDEX IF EXISTS public.uq_shadow_runs_waived_failed_run;
-- ALTER TABLE public.shadow_review_runs DROP CONSTRAINT IF EXISTS shadow_review_runs_waived_failed_run_id_fkey;
-- ALTER TABLE public.shadow_review_runs DROP COLUMN IF EXISTS waived_failed_run_id;
-- ALTER TABLE public.shadow_review_runs DROP COLUMN IF EXISTS waiver_signature_action_id;
-- ALTER TABLE public.shadow_review_runs DROP COLUMN IF EXISTS failure_code;
