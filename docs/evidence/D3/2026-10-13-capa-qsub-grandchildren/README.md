# Policying a table moves the frontier: five descendants of yesterday's two

**Row** D3 (tenant isolation). **Date** 2026-10-13.
**Caused by** `docs/evidence/D3/2026-10-12-unkeyed-table-classification/` — my
own change the day before.

## What broke, and that it was mine

`Tier 5 Browser Smoke` was red on trunk, step *"Provision the application
schema from scratch"*. Reproduced locally against a fresh database with the
same command the workflow runs (`node scripts/db/install-fresh.mjs`):

```
❌ Install failed: 4 tenant-keyed table(s) carry no RLS policy — rows are
   readable across tenants once anything reads them:
   public.capa_actions (child of public.capa_records, row security off),
   public.q_sub_meetings (child of public.q_submissions, row security off),
   public.q_sub_questions (child of public.q_submissions, row security off),
   public.q_sub_timeline_entries (child of public.q_submissions, row security off)
EXIT=1
```

Adding `capa_records` and `q_submissions` to the parent-scoped `specs` list
yesterday made them **tenant-keyed parents** — which was the point. It also gave
each of them children that were suddenly "children of a tenant-keyed parent
with no policy", which is precisely the class the installer's verifier refuses.

The verifier was right and it was the only thing that caught this. No gate I ran
yesterday would have: `ci:tenant-isolation:strict` looks at raw SQL predicates,
`ci:unkeyed-request-tables` at tables with no tenant column, and the db-tier
suite at the tables the migration names. None of them asks "did policying this
table orphan the generation below it?" — only a from-scratch provision does.

## A false start worth recording

Fixing those four and re-provisioning failed again:

```
❌ Install failed: 1 tenant-keyed table(s) carry no RLS policy:
   public.q_sub_commitments (child of public.q_sub_questions, row security off)
EXIT=1
```

`q_sub_commitments` was not a child of a tenant-keyed parent until the fix made
`q_sub_questions` one. Two rounds of this is enough to stop guessing: the
descendant tree was then walked **transitively**, through `pg_constraint`,
rather than one CI failure at a time.

```
depth | child                  | fk column         | parent          | rls before
------+------------------------+-------------------+-----------------+-----------
    1 | capa_actions           | capa_id           | capa_records    | false
    1 | q_sub_meetings         | q_submission_id   | q_submissions   | false
    1 | q_sub_questions        | q_submission_id   | q_submissions   | false
    1 | q_sub_timeline_entries | q_submission_id   | q_submissions   | false
    2 | q_sub_commitments      | q_sub_question_id | q_sub_questions | false
```

Nothing below depth 2. Five tables, not four.

## Where they go, and why not `specs`

All five are grandchildren or deeper: their parents carry no `organization_id`
of their own and are themselves scoped through `regulatory_programs`. So they
belong in the migration's `chained` list, which delegates to the parent's own
policy rather than naming a tenant column. Keys are uuid → uuid throughout, so
unlike the text-program-id class above them no text comparison is involved.

Order is load-bearing twice over: `specs` (line 316) runs before `chained`
(line 506), so the two parents are policied first; and within `chained`,
`q_sub_commitments` follows `q_sub_questions` so that policy exists when it is
reached.

## Verified

```
$ psql t5_repro3 -f db/migrations/20260813_child_table_parent_scoped_rls.sql
NOTICE: [child-rls] public.capa_actions scoped through public.capa_records (chained)
NOTICE: [child-rls] public.q_sub_meetings scoped through public.q_submissions (chained)
NOTICE: [child-rls] public.q_sub_questions scoped through public.q_submissions (chained)
NOTICE: [child-rls] public.q_sub_timeline_entries scoped through public.q_submissions (chained)
NOTICE: [child-rls] public.q_sub_commitments scoped through public.q_sub_questions (chained)

        relname         | rls | force | pol
------------------------+-----+-------+-----
 capa_actions           | t   | t     |   1
 q_sub_meetings         | t   | t     |   1
 q_sub_questions        | t   | t     |   1
 q_sub_timeline_entries | t   | t     |   1
 q_sub_commitments      | t   | t     |   1
```

And the whole thing, from an empty database:

```
$ DATABASE_URL=…/t5_repro3 node scripts/db/install-fresh.mjs
EXIT=0
```

That is the step Tier 5 failed on, green on a database created empty moments
before.

## Verify by making the check fail

The five are now in the db-tier suite's structural list. With their policies
dropped and their rows removed from the migration so `beforeAll` cannot restore
them:

```
× every table named by the migration ends up policied, enabled and FORCEd
  → capa_actions has no tenant_isolation_policy: expected false to be true
 Tests  1 failed | 14 passed (15)
```

Restored: 15 passed, `5 of 5 policied`.

## The lesson, written where the next session will hit it

The migration's header note now says it, because the shape of this mistake is
not specific to these tables: **policying a table moves the frontier rather
than closing it.** A table that gains a tenant policy becomes a tenant-keyed
parent, and every generation below it has to be walked — transitively, in one
pass, not one deploy failure at a time. The note carries the two failing
verdicts and the depth table above, so the next person adding to `specs` sees
what it costs before paying it.
