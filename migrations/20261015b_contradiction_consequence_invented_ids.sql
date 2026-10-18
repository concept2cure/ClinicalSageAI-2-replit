-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Correct the records that say a contradiction consequence was
--          carried out when the code that wrote them created nothing.
--
-- eCTD/CTD Context:
--   - Module(s): none (contradiction governance across the dossier)
--   - Integrity Risk Addressed: a finding, a decision receipt and two logs
--     asserting that a review thread, memo, rewrite, dossier attachment,
--     escalation or supersession exists, naming an id nothing holds
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No schema change. Rows are corrected (or, for the propagation log's
--     auto-trigger claims, removed); every statement matches only the exact
--     invented id formats, so it is idempotent and does nothing once nothing
--     writes them.
-- =============================================================================
--
-- THE DEFECT (fixed in code 2026-10-15). Two consequence paths returned ids
-- they made up and recorded them as executed:
--
--   contradiction-engine-service executeConsequence (now delegates)
--     thread_contradiction_<finding>_<ms>, memo_<finding>, escalation_<finding>,
--     action_<finding>
--   contradiction-consequence-service executeConsequence
--     thread_contradiction_<finding>_<ms>, harmonize_<finding>_<ms>,
--     dossier_attach_<finding>_<ms>, escalation_<finding>_<ms>,
--     memo_<finding>_<ms> (when the memo was not stored),
--     supersession_skipped_<finding>, supersession_failed_<finding>
--
-- and reactive-dependency-service autoTriggerConsequence logged
-- auto_created_review_thread / auto_created_contradiction_memo /
-- auto_superseded_assumption to impact_propagation_log for every
-- high-confidence finding, creating none of them.
--
-- Every id pattern below is anchored to the finding's own uuid, so a real
-- object id (a concept2cure_artifacts integer, an assumption uuid, a decision
-- id) cannot match. An escalation the old service DID apply to a decision
-- stays on that decision's own record; only the finding's claim, which named
-- an invented id, is withdrawn — the finding reads "not executed" until a
-- person takes the consequence again.

DO $consequence_invented_ids$
BEGIN
  -- 1. The finding: consequence_executed / consequence_object_id are what the
  --    contradiction scan reports.
  IF to_regclass('public.contradiction_findings') IS NOT NULL THEN
    UPDATE public.contradiction_findings f
       SET consequence_executed = false,
           consequence_object_id = NULL,
           updated_at = NOW()
     WHERE f.consequence_object_id IS NOT NULL
       AND (
         f.consequence_object_id IN (
           'memo_' || f.id::text, 'escalation_' || f.id::text, 'action_' || f.id::text,
           'supersession_skipped_' || f.id::text, 'supersession_failed_' || f.id::text)
         OR starts_with(f.consequence_object_id, 'thread_contradiction_' || f.id::text || '_')
         OR starts_with(f.consequence_object_id, 'harmonize_' || f.id::text || '_')
         OR starts_with(f.consequence_object_id, 'dossier_attach_' || f.id::text || '_')
         OR starts_with(f.consequence_object_id, 'escalation_' || f.id::text || '_')
         OR starts_with(f.consequence_object_id, 'memo_' || f.id::text || '_')
       );
  END IF;

  -- 2. The consequence log: kept, marked as not having happened. 'failed' is
  --    the one status both creators admit (db/migrations/20260323 checks
  --    pending | executed | failed).
  IF to_regclass('public.contradiction_consequence_log') IS NOT NULL THEN
    UPDATE public.contradiction_consequence_log l
       SET execution_status = 'failed',
           notes = concat_ws(' ', l.notes,
             '[Corrected 2026-10-15: nothing was created; this id was invented by the consequence path. '
             || 'migrations/20261015b_contradiction_consequence_invented_ids.sql]')
     WHERE l.execution_status = 'executed'
       AND l.consequence_object_id IS NOT NULL
       AND (
         l.consequence_object_id IN (
           'memo_' || l.finding_id::text, 'escalation_' || l.finding_id::text, 'action_' || l.finding_id::text,
           'supersession_skipped_' || l.finding_id::text, 'supersession_failed_' || l.finding_id::text)
         OR starts_with(l.consequence_object_id, 'thread_contradiction_' || l.finding_id::text || '_')
         OR starts_with(l.consequence_object_id, 'harmonize_' || l.finding_id::text || '_')
         OR starts_with(l.consequence_object_id, 'dossier_attach_' || l.finding_id::text || '_')
         OR starts_with(l.consequence_object_id, 'escalation_' || l.finding_id::text || '_')
         OR starts_with(l.consequence_object_id, 'memo_' || l.finding_id::text || '_')
       );
  END IF;

  -- 3. The decision receipt: kept, no longer saying it was executed. Its
  --    contradiction-link entry names the finding; another entry names the
  --    invented id.
  IF to_regclass('public.decision_receipts') IS NOT NULL THEN
    UPDATE public.decision_receipts r
       SET execution_executed = false,
           executed_at = NULL,
           execution_error = concat_ws(' ', r.execution_error,
             '[Corrected 2026-10-15: the consequence created nothing; the affected object id was invented. '
             || 'migrations/20261015b_contradiction_consequence_invented_ids.sql]')
     WHERE r.execution_executed = true
       AND r.execution_method LIKE 'consequence:%'
       AND EXISTS (
         SELECT 1
           FROM jsonb_array_elements(COALESCE(r.affected_objects, '[]'::jsonb)) link,
                jsonb_array_elements(COALESCE(r.affected_objects, '[]'::jsonb)) obj
          WHERE link->>'objectType' = 'contradiction-link'
            AND (
              obj->>'objectId' IN (
                'memo_' || (link->>'objectId'), 'escalation_' || (link->>'objectId'),
                'action_' || (link->>'objectId'),
                'supersession_skipped_' || (link->>'objectId'),
                'supersession_failed_' || (link->>'objectId'))
              OR starts_with(obj->>'objectId', 'thread_contradiction_' || (link->>'objectId') || '_')
              OR starts_with(obj->>'objectId', 'harmonize_' || (link->>'objectId') || '_')
              OR starts_with(obj->>'objectId', 'dossier_attach_' || (link->>'objectId') || '_')
              OR starts_with(obj->>'objectId', 'escalation_' || (link->>'objectId') || '_')
              OR starts_with(obj->>'objectId', 'memo_' || (link->>'objectId') || '_')
            )
       );
  END IF;

  -- 4. The propagation log's auto-trigger claims: removed. The table has no
  --    column to annotate and its action CHECK admits nothing truthful to
  --    relabel them with. Matched by everything the removed writer stamped and
  --    nothing a genuine writer would: a "created" action that names no
  --    created object (impacted_object_id IS NULL).
  IF to_regclass('public.impact_propagation_log') IS NOT NULL THEN
    DELETE FROM public.impact_propagation_log p
     WHERE p.trigger_type = 'contradiction_created'
       AND p.trigger_object_type = 'contradiction'
       AND p.action_taken IN (
         'auto_created_review_thread', 'auto_created_contradiction_memo', 'auto_superseded_assumption')
       AND p.auto_triggered = true
       AND p.impacted_object_id IS NULL;
  END IF;
END
$consequence_invented_ids$;
