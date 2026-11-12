# P-99 C1: a compile of a sequence already sent is not recorded as what it sent (row D7, 2026-11-09)

## The decision

- **P-99** (founder, 2026-11-03): an unrecorded sent sequence is put back on record. One of its clauses is "Nothing
  restores a sequence silently."
- **The design** is `docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md`.
  - §1.6 names a silent restore that exists today.
  - §5 C1 closes it, alone and first, before the two restoring acts (C2 to C4).

## What already exists (RULE 3)

- **`POST /api/ectd-compile/:projectIdent/compile`** (`server/routes/ectd-compile.ts`) compiles a named sequence
  (`spineForRequest`) or the program's latest sequence. On the canonical path it records a non-rehearsal compile with
  its leaf manifest (`INSERT INTO ectd_compilations`, `compileFromSpine`).
- **The filed-state fold** (`server/services/ectd/prior-sequence-loader.ts`) reads a sent sequence's record from its
  transmit. For a send before the platform kept what each send carried, it reads the record from the sequence's
  compiles (basis `compiles`), or finds none (`none`). With `none`, the next sequence's lifecycle read refuses: that is
  F1 slice 1's refusal.
- **The defect:** nothing on the compile path read the sequence's dispatch status. The design's `git grep` found 0
  lines in `ectd-compile.ts`, `assemble-from-core.ts`, `package-from-core.ts` and `cmc/submission-spine.ts`.
  - So a compile made after a send was recorded like any other.
  - The fold then read it as what was sent (`none` became `compiles`), and slice 1's refusal lifted.
  - No act said the sequence had been put back on record.
- **The filed rule** is `isFiledDispatchStatus` (`server/services/submission-service/filed-dispatch.ts`):
  `sent`, `acknowledged`.
- **Rehearsals** are recorded with type `rehearsal`, which the fold never reads as filed.

## The change

`refuseCompileOfSequenceOnFile` in `server/routes/ectd-compile.ts` runs on the canonical path, after the region and
rehearsal checks and before the type check, the assembly and the record. It reads the live sequence's
`dispatch_status`.

- **Filed** (`sent`, `acknowledged`): 409 `ECTD_SEQUENCE_ON_FILE`:
  > Sequence 0000 is on file at the agency, so a compile of it now is not recorded: it would not be what it sent. Its
  > sent package is on Gateway transmittals when the platform kept it. Start the next sequence to compile again.
- **In flight** (`transmitting`): the same code:
  > A send of sequence 0000 is unresolved, so a compile of it now is not recorded. Nothing was assembled.
- **Unchanged:**
  - a rehearsal;
  - a sequence that is `pending` or `rejected`, or has no dispatch status;
  - the draft-backbone path, which records no manifest.
- **No client change.** The Compile & export screen already shows the server's refusal in its existing toast.
- No migration, no new route.
- **The test harness** (`tests/routes/ectd-compile-spine.harness.ts`) gains an optional `dispatchStatus`. It defaults
  to none, so every existing compile test reads as before.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | at `92c984c2f`: a sent, an acknowledged, a named sent and a transmitting sequence are each compiled and recorded (4 fail); a sequence with no status, a pending one, a rejected one and a rehearsal compile as before (4 pass) |
| `green.txt` | every compile route test and every test that imports the route, the two client compile tests included: 198 pass in 15 files |
| `mutation-1-refusal-dropped` | the four on-file cases fail |
| `mutation-2-pending-refused-too` | the pending case fails |
| `mutation-3-rehearsal-refused-too` | the rehearsal case fails |
| `mutation-4-in-flight-not-refused` | the transmitting case fails |
| `real-postgres/` | added 2026-11-09 (the correction under "Not done here"): the design's real-PostgreSQL case, its runs and its red, and the pre-deploy query run on a throwaway database |

The test is `tests/routes/ectd-compile-sent-sequence.test.ts`.

## Not done here, and why

- **The design's real-PostgreSQL case** (`tests/db/ectd-filed-state-view.dbtest.ts`, as `app_service` with
  `RLS_ENFORCE=on`): **corrected 2026-11-09.** This line said the case was not added because "this container has the
  `psql` client but no PostgreSQL server". That was wrong: a PostgreSQL 16 server was available, as P-86's README
  found for the same claim. The case is now added and run, in a commit of its own (`real-postgres/`):
  - **The case:** a sent sequence with one placed leaf and no compile. Through the real compile route, it is refused
    409 `ECTD_SEQUENCE_ON_FILE` in the server's words. `ectd_compilations` gets no row for the organisation, and the
    filed-state view answers exactly as it did before the compile was asked (the sequence not filed).
  - **Where:** a throwaway database provisioned as CI provisions it (`scripts/db/install-fresh.mjs`, then
    `scripts/db/deploy-migrate.mjs`), PostgreSQL 16.15, as `app_service` with `RLS_ENFORCE=on`.
  - **Runs:** before the case, 7 of 7 (`baseline-7-of-7.txt`); with it, 8 of 8 (`green.txt`).
  - **Its red:** C1's code landed before this case existed, so the case could not be red first. With the refusal's
    call removed from the route, the case is red: the route goes on to compile (`mutation-refusal-dropped.txt`,
    driver `p99-dbmut.py`, the file restored by SHA-256).
  - C2's database cases stay owed with C2.
- **The client case** the design lists for `ectdCompile.test.tsx` (the toast carries the server's sentence) was not
  added. The screen already renders the server's message for a refusal. Its two compile tests ran green above.
- **Pre-deploy, read-only, on each deployed database: sequences already restored silently before this change.** The
  query lists sent or acknowledged live sequences that have recorded non-rehearsal compiles, and none made before their
  first `ECTD_TRANSMITTED` row.
  - It is written against the columns the code writes: `ectd_compilations` (`organization_id`, `submission_id`,
    `sequence_number`, `compilation_type`, `compiled_at`) and `audit_logs` (`tenant_id`, `action`, `record_id`,
    `occurred_at`).
  - It was **not run here**, because there is no database in this container. *Corrected 2026-11-09:* there was one.
    The query has now been run once on the throwaway database above, read-only:
    - it parses and runs against the schema a deployment builds (`pre-deploy-query-on-throwaway.txt`, 0 rows);
    - in a transaction rolled back, it lists a sent sequence whose only compile was made after its transmit, and not
      one compiled before it (`pre-deploy-query-finds-a-silent-restore.txt`).

    Its run on each deployed database is still owed, and still precedes the deploy.
  - Each row it returns is told to the founder (design §7 item 2). A sequence whose transmit recorded its manifest is
    read from that record and was never at risk, so the list may include such rows, and each is checked.

```sql
SELECT s.organization_id, s.submission_id, s.id AS sequence_id, s.sequence_number, s.dispatch_status, t.sent_at
  FROM ectd_sequences s
  JOIN LATERAL (SELECT min(a.occurred_at) AS sent_at FROM audit_logs a
                 WHERE a.tenant_id = s.organization_id AND a.action = 'ECTD_TRANSMITTED'
                   AND a.record_id = s.id::text) t ON t.sent_at IS NOT NULL
 WHERE s.deleted_at IS NULL AND s.dispatch_status IN ('sent', 'acknowledged')
   AND EXISTS (SELECT 1 FROM ectd_compilations c
                WHERE c.organization_id = s.organization_id AND c.submission_id = s.submission_id
                  AND c.sequence_number = s.sequence_number AND c.compilation_type <> 'rehearsal')
   AND NOT EXISTS (SELECT 1 FROM ectd_compilations c
                WHERE c.organization_id = s.organization_id AND c.submission_id = s.submission_id
                  AND c.sequence_number = s.sequence_number AND c.compilation_type <> 'rehearsal'
                  AND c.compiled_at <= t.sent_at);
```

## Plan

`Plan: F1`, `Completes: server/routes/ectd-compile.ts`. The hold on `ectd-compile.ts`, unheld when claimed, is
recorded and released in `.design/claude-convergence/COORDINATION.md` with this commit.
