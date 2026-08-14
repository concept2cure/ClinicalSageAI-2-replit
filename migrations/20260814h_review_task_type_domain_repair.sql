-- Repair the concept2cure_review_tasks.task_type domain.
--
-- WHAT WAS WRONG
-- phase13_review_threads_tasks.sql created the table with an INLINE, unnamed
-- check:
--     task_type TEXT NOT NULL DEFAULT 'review_task'
--       CHECK (task_type IN ('change_request','follow_up','review_task'))
--
-- 0001_phase13_full.sql then set out to widen that domain to include
-- 'approval_task', but it ADDED a second, named constraint rather than
-- replacing the first:
--     ADD CONSTRAINT c2c_task_type_chk
--       CHECK (task_type IN ('change_request','follow_up','review_task','approval_task'))
--
-- Postgres applies every check on a column, so the effective domain is the
-- INTERSECTION of the two — which is exactly the original three values. The
-- widening silently did nothing, and 'approval_task' has never been insertable.
--
-- The visible consequence is in the review my-queue endpoint
-- (server/routes/concept2cure.ts, the derived counters): `approvalsNeeded`
-- counts review tasks with task_type = 'approval_task'. Because no such row can
-- exist, that counter has always been 0 and the surface has never been able to
-- tell a reviewer an approval was waiting on them. It failed silently: no error,
-- no empty state, just a number that is always zero.
--
-- WHAT THIS DOES
-- Drops the stale inline check so the intended wider domain governs, and
-- guarantees the named one is present. Deliberately NOT a blanket "drop every
-- check on this table": it only drops a check whose expression constrains
-- task_type and does NOT permit 'approval_task', so re-running is a no-op and a
-- future, deliberately-narrower constraint is not silently discarded.
--
-- Data-safe: widening a CHECK cannot invalidate an existing row.

DO $$
DECLARE
  con RECORD;
BEGIN
  IF to_regclass('public.concept2cure_review_tasks') IS NULL THEN
    RAISE NOTICE 'concept2cure_review_tasks absent — skipping task_type domain repair';
    RETURN;
  END IF;

  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.concept2cure_review_tasks'::regclass
       AND c.contype = 'c'
  LOOP
    IF con.def LIKE '%task_type%' AND con.def NOT LIKE '%approval_task%' THEN
      EXECUTE format(
        'ALTER TABLE public.concept2cure_review_tasks DROP CONSTRAINT %I',
        con.conname
      );
      RAISE NOTICE 'dropped narrowing task_type check %', con.conname;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.concept2cure_review_tasks'::regclass
       AND conname = 'c2c_task_type_chk'
  ) THEN
    ALTER TABLE public.concept2cure_review_tasks
      ADD CONSTRAINT c2c_task_type_chk
      CHECK (task_type IN ('change_request', 'follow_up', 'review_task', 'approval_task'));
  END IF;
END $$;
