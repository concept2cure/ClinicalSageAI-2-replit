# W4 — converged onto the canonical D4 package, 2026-09-21

**Row:** D4 (validation package). **Outcome: this session's validation package
was deleted, not landed.** Another session (W3a) was building D4 at the same
time and got further. What survives from here is one control its package did
not have, and eleven citation defects that control found on its first run.

## What happened

I opened on D4 after reconnaissance showed no W3/W4 evidence directory and no
launch playbook naming who held which workstream. `docs/LAUNCH_DEFINITION_OF_DONE.md`
§"How sessions run" assigns one workstream per session (W1–W7) but the playbook
it refers to does not exist in the repository, so there was nothing to read a
claim from. W3a's work reached `origin/concept2cure-v2` while this session was
executing, and the collision only became visible on the merge before push.

That is a coordination defect worth naming rather than smoothing over: **two
sessions built a CSA validation package for the same six launch apps on the same
day.** The DoD's own mechanism for preventing it is a document that is not there.

## Why W3a's package is the canonical one

Compared honestly, before deleting anything:

| | W3a (kept) | this session (deleted) |
|---|---|---|
| Requirements | 67 | 59 |
| OQ execution | per-app protocol runners driving real Chromium, **per-step evidence bundles** — API request/response, screenshots, console errors | one Playwright spec |
| Verdict vocabulary | pass / fail / **deviation** / not-executed | PASS / FAIL / ERROR / NOT EXECUTED |
| IQ | `validation:iq` runner | referenced the existing pack |
| Traceability | generated, with its own selftest | generated, with a CI gate |
| Real defects found | **10 fails**, four already fixed in `b98ac05f0` | 0 |

W3a's OQ harness is materially better: it records what the server actually
returned per step, screenshots the browser, and distinguishes a **deviation**
(the step could not be executed — no credential, no provider) from a failure.
It also did the thing a validation package is for, which is find real defects.

So the working agreement applies as written — *one canonical implementation per
capability; a parallel path is migrated onto the canonical one and deleted in
the same change*. Deleted here: `docs/validation/launch/` (10 documents and the
registry), `scripts/ops/generate-validation-package.mjs`,
`scripts/ops/validation/registry.mjs`, and the `pack:validation*` scripts.

## What survived, because W3a's package did not have it

**`npm run ci:validation-traceability`**, rewritten to read W3a's format.

`validation:traceability` builds TM-001 by joining the URS requirement tables to
the executed OQ results. It answers *was this requirement verified and did it
pass*. It cannot ask whether the code a requirement cites still exists, because
a deleted file simply stops being mentioned — the row still renders, the matrix
still looks complete, and the package quietly becomes a description of a
codebase that has moved on.

The gate resolves every backticked citation in every `URS-00*.md` row. A path
must exist; a bare filename (the URS documents use both) must match exactly one
file in the repository — **several matches is also a finding**, because a
citation a reviewer cannot follow is not traceability. Line numbers are stripped
deliberately: they go stale constantly and pinning them would make this noise.

### It found eleven defects on its first real run

- **10 rows** across `URS-004` and `URS-005` cited a bare `submissions.ts`,
  which matches three files — `server/routes/submissions.ts`,
  `server/routes/biopharma/submissions.ts` and `shared/schema/submissions.ts`.
  Resolved to `server/routes/submissions.ts`, confirmed by reading line 209:
  `const AUTHOR = 'regulatory-author'`, which is what those rows describe.
- **1 row** cited `templates/submission-readiness-review.ts`, which does not
  exist at that path. It is
  `server/services/orchestration/templates/submission-readiness-review.ts`.

Both fixed here. `validation:traceability` re-run afterwards: unchanged at 67
requirements, pass 53, partial 1, fail 10, open 3.

The `--self-test` builds 9 fixture repositories — 3 controls that break no rule
and 6 that each break exactly one — and every mutation is caught while the
controls stay clean. Wired into `ci.yml`, selftest first.

## Also kept: a browser-tier control W3a's OQ does not cover

`tests/e2e/launch-surface-access-control.e2e.spec.ts`. W3a's OQ asserts that an
**anonymous API** request is refused 401/403, and that the login page renders.
It does not navigate to a protected **surface** with no session and assert the
guard bounces you. This does, for one surface per launch app plus the two
surfaces `LAUNCH_SHELL_SURFACES` marks never-switchable, asserted **both ways** —
a surface with no guard at all renders just as happily for an authenticated
user, so only the negative control gives the positive case meaning.

- 16 of 16 pass against a live server driving real Chromium.
- **Mutation-tested**: remove the session from the positive case and it fails
  with `/projects bounced an AUTHENTICATED session to login`.

It lives in `tests/e2e/` beside the existing authenticated smoke rather than in
a second OQ tree.

### A false finding this session caught on itself

A reconnaissance pass read `body.innerText` about two seconds after navigation
and concluded **nine launch surfaces rendered nothing**. They did not. Re-probed
with a real settle, every one carried 23–39 KB of DOM and 269–468 nodes; the
affected surfaces were the canvas-owning (`full: true`) ones still mounting.
That would have put a fabricated defect into a validation document. The spec
therefore polls on a DOM-node threshold and never on text, and its header
records why.

## The environment, which is reusable by whoever runs OQ next

OQ evidence executed against a schema that does not match the code is not
evidence, and the schema here did not match:

- `column "expires_at" does not exist` — the database predated
  `db/migrations/20260824_module_grant_expiry.sql`.
- `project_memory_entries` was **absent from every schema** while four
  migrations referenced it, because it is created by `drizzle-kit push`
  (`shared/schema.ts:15526`), not by a raw migration.

`install-fresh.mjs` refuses to repair that in place and says exactly why:
`drizzle-kit push` cannot introspect a database that already carries the
overlay's expression indexes, so **13 declared tables can never be created
retrospectively**. Provisioned fresh instead, in the order
`docs/LOCAL_TESTING.md` prescribes:

| Step | Result |
|---|---|
| `CREATE EXTENSION vector` (pgvector 0.6.0, owned by the provisioning role) | ok |
| `gcc_*` roles created | ok — these and extension ownership are the cause of the 6 governed-content failures `LOCAL_TESTING.md` documents as a container limitation |
| `node scripts/db/install-fresh.mjs` | **Application schema install complete**, no incomplete areas |
| `APPLY_C2C_MIGRATIONS=true node scripts/db/apply-c2c-migrations.mjs` | **290 applied, 0 failed** |
| Tables / RLS policies | **791 / 819** |

Worth recording for `LOCAL_TESTING.md`: the governed-content tree is **not** an
unavoidable container limitation. Creating the four `gcc_*` roles and owning the
`vector` extension clears all six failures.

## What this session did not do

- It did not move D4 to green. W3a's package stands at 10 fails, 1 partial and
  3 open, and nothing is signed.
- It did not verify W3a's requirements against the code. Its own 73-candidate
  survey and adversarial review are discarded with the package.
- It did not test RLS under the non-superuser app role — that is row D3.

## Files

| Path | What it is |
|---|---|
| `after/ci-validation-traceability-selftest.txt` | 9 self-test cases, then the 11 real findings and the clean re-run |
| `after/oq-access-control.txt` | 16/16 Playwright, live server |
| `after/oq-access-control-mutation.txt` | the same spec failing when the session is removed |
| `after/install-fresh-summary.txt` | schema provisioning |
| `after/c2c-migrations-summary.txt` | 290/290 migrations |
