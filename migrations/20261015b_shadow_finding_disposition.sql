-- 20261015b_shadow_finding_disposition.sql
--
-- P-35 (docs/LAUNCH_DEFINITION_OF_DONE.md, decided 2026-10-15): a critical
-- Shadow Review finding is closed by a named person's signature, never by
-- silence.
--
-- The dispatch gate blocks on every open critical finding across every run of
-- the sequence, and nothing in the product could ever close one: status had
-- 'accepted', 'fixed' and 'waived' in its vocabulary (20260604) and no code that
-- wrote them. This file adds the four columns a signed disposition is recorded
-- in, on shadow_review_findings (migrations/20260604_shadow_review.sql), and
-- nothing else:
--
--   disposition_signature_action_id  The governed `sign` action
--                                    (c2c_ana_actions.id, intent
--                                    'shadow-finding-disposition') whose Part 11
--                                    signature closed the finding.
--   disposed_by                      The signer (users.id).
--   disposed_at                      When the disposition was recorded.
--   disposition_reason               The signature's own reason: for 'accepted'
--                                    why the risk is accepted, for 'fixed' what
--                                    changed.
--
-- status takes 'accepted' (risk accepted) or 'fixed', written only by
-- server/services/ectd/shadow-finding-disposition.ts through submission-service
-- dispositionShadowFinding. The column keeps no CHECK (20260604), and none is
-- added: the vocabulary is the service's, and under CLAUDE.md RULE 1 a CHECK a
-- later file also defines is the replay hazard that rule exists for. The
-- dispatch assessor counts status = 'open' AND severity = 'critical'
-- (countOpenShadowCriticals), so a dispositioned critical leaves the count and
-- nothing else does: a later review never closes an earlier critical by itself.
--
-- Single use is held twice: by the ledger (an audit row
-- SHADOW_FINDING_DISPOSITIONED spends the signature, submission-service
-- signatureSpentBy) and here, by a partial unique index per signature.
--
-- Replay-safe (RULE 1): additive and IF NOT EXISTS throughout. The foreign key
-- is added separately and only when pg_constraint does not already hold it, so
-- a re-run never adds a second copy. Drops nothing. public + organization_id
-- INTEGER NOT NULL already (20260604), so the tenant sweeps cover the table and
-- this file sits anywhere above the final pair. Mirrored in
-- shared/schema/shadow-review.ts.

ALTER TABLE public.shadow_review_findings
  ADD COLUMN IF NOT EXISTS disposition_signature_action_id TEXT;

ALTER TABLE public.shadow_review_findings
  ADD COLUMN IF NOT EXISTS disposed_by INTEGER;

ALTER TABLE public.shadow_review_findings
  ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMPTZ;

ALTER TABLE public.shadow_review_findings
  ADD COLUMN IF NOT EXISTS disposition_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shadow_review_findings_disposed_by_fkey'
       AND conrelid = 'public.shadow_review_findings'::regclass
  ) THEN
    ALTER TABLE public.shadow_review_findings
      ADD CONSTRAINT shadow_review_findings_disposed_by_fkey
      FOREIGN KEY (disposed_by) REFERENCES public.users(id);
  END IF;
END $$;

-- Every FK indexed (the 20260604 convention).
CREATE INDEX IF NOT EXISTS idx_shadow_findings_disposed_by
  ON public.shadow_review_findings (disposed_by)
  WHERE disposed_by IS NOT NULL;

-- A disposition signature is used once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_findings_disposition_signature
  ON public.shadow_review_findings (organization_id, disposition_signature_action_id)
  WHERE disposition_signature_action_id IS NOT NULL;

COMMENT ON COLUMN public.shadow_review_findings.disposition_signature_action_id IS
  'status accepted|fixed: the governed sign action (intent shadow-finding-disposition) whose Part 11 signature closed this critical finding (P-35).';

COMMENT ON COLUMN public.shadow_review_findings.disposed_by IS
  'status accepted|fixed: the signer who closed this critical finding (P-35).';

COMMENT ON COLUMN public.shadow_review_findings.disposed_at IS
  'status accepted|fixed: when the signed disposition was recorded (P-35).';

COMMENT ON COLUMN public.shadow_review_findings.disposition_reason IS
  'status accepted|fixed: the signature''s own reason; for fixed, what changed (P-35).';

-- Down:
-- DROP INDEX IF EXISTS public.uq_shadow_findings_disposition_signature;
-- DROP INDEX IF EXISTS public.idx_shadow_findings_disposed_by;
-- ALTER TABLE public.shadow_review_findings DROP CONSTRAINT IF EXISTS shadow_review_findings_disposed_by_fkey;
-- ALTER TABLE public.shadow_review_findings DROP COLUMN IF EXISTS disposition_reason;
-- ALTER TABLE public.shadow_review_findings DROP COLUMN IF EXISTS disposed_at;
-- ALTER TABLE public.shadow_review_findings DROP COLUMN IF EXISTS disposed_by;
-- ALTER TABLE public.shadow_review_findings DROP COLUMN IF EXISTS disposition_signature_action_id;
