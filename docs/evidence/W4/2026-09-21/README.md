# W4 evidence — the D4 validation package, 2026-09-21

**Row moved:** D4 (validation package — CSA-aligned plan, URS per launch app,
risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix
generated from tests, summary report).

**State after this session: D4 is NOT green, and the package says so itself.**
`VSR-LAUNCH-001` reports **INCOMPLETE**, and `npm run pack:validation:run`
exits 1. That is the intended outcome of a first execution, not a failure of
it: a summary report that could only ever say COMPLETE would evidence nothing.
What changed is that the row now has a package that is generated from the code,
executed against a live instance, and mechanically prevented from drifting —
where before it had seven stale markdown files naming a different product.

Nothing here is signed. Signing is D4's other half and belongs to the founder
and one qualified contractor (§7 of the plan).

---

## What was there before

`docs/validation/` held `VMP-/IQ-/OQ-/VSR-CORTEX-001`. Those documents are
dated **2025-01-24**, are marked **DRAFT**, name a different product, and
predate the launch catalog entirely. Beyond that:

- there was **no URS for any launch app**;
- `TM-CORTEX-001-PART11-TRACEABILITY.md` was **74 hand-written lines**, not a
  matrix generated from tests;
- `generate-iq-oq-pack.mjs` executed **vitest only**, while D4 asks for OQ with
  executed **Playwright** evidence.

`VP-LAUNCH-001` §10 records the disposition of the old set rather than silently
inheriting it: two of them (cloud vendor qualification, security assessment)
cover ground this plan does not and are left for the signer to decide on.

## What the package is

Requirements live as **data** (`docs/validation/launch/urs-registry.json`) and
the documents are rendered from it. The reason is the failure mode this
repository keeps having to remove: seven hand-maintained markdown files drift
the moment a route moves and **nothing reports it** — a traceability matrix
whose cited test was deleted last week still renders as a matrix.

| Artifact | What produces it |
|---|---|
| `VP-LAUNCH-001-VALIDATION-PLAN.md` | written by hand — a plan is a commitment, not an observation |
| `URS-<APP>.md` ×6 | generated |
| `RA-LAUNCH-001-RISK-ASSESSMENT.md` | generated |
| `TM-LAUNCH-001-TRACEABILITY-MATRIX.md` | generated |
| `VSR-LAUNCH-001-SUMMARY-REPORT.md` | generated |
| IQ | `scripts/ops/generate-iq-oq-pack.mjs`, referenced not restated |

## How the requirements were arrived at

They were **not written from imagination**. Six parallel agents surveyed the
launch apps' real code and produced 73 candidate requirements, each obliged to
cite implementing code and existing tests by path. Every one of the 73 was then
put to an **independent adversarial reviewer** — one per app, instructed to
refute rather than approve, and to judge whether the cited test genuinely
asserts the behaviour or merely something adjacent.

| | |
|---|---|
| Candidates surveyed | 73 |
| Dangling citations (checked mechanically against disk) | **0** |
| Verdict `unsupported` | 0 |
| Verdict `overstated` — reworded to what the code actually does | **25** |
| Cited tests the reviewer judged to genuinely exercise the requirement | 53 of 73 |

The reviewer repeatedly did better than reject. On `URS-VAULT-01` it found the
cited test **mocks the pool and asserts SQL text** with the ownership pre-check
hard-coded to succeed — so the absent-not-forbidden behaviour is never
exercised — and then named the two suites that *do* prove it. Those names are
carried into `evidenceOwed` rather than promoted to citations: a test mentioned
is not a test read.

## What the gates refuse

`npm run ci:validation-traceability` (wired into `ci.yml`, selftest first).
Its `--self-test` constructs **19** registries — 17 that each break exactly one
rule, and 2 controls that break none — and every mutation is caught while both
controls stay clean. A gate that has only ever been seen to pass has not been
tested.

Proven on the real code path, not only in the self-test — see
`after/generator-fails-closed.txt`:

1. **No registry** → exit 1, no documents.
2. **A citation that does not resolve** → exit 1, both dangling paths named,
   and **zero documents written**, because a rendered matrix is
   indistinguishable from a correct one.
3. **A suite that executes nothing** → `ERROR`, never a pass. A vitest file
   that runs no tests exits 0; the matrix row reads
   *"the report did not mention this file — it was not executed"*.

## The honest-shortfall mechanism

The assurance rule is strict: a high-assurance requirement cannot be discharged
by inspection or a unit test alone. Building the registry against real
requirements exposed the loophole that strictness creates — the path of least
resistance is to write down whatever level the existing evidence happens to
satisfy, turning a real gap into a document that reads fully qualified.

So `assuranceLevel` is what the cited evidence supports and `assuranceTarget` is
what the risk deserves. Where they differ the requirement is **declared but not
qualified**, `evidenceOwed` names the work, and the verdict cannot read COMPLETE.
The gate refuses a target with no evidence owed, and a target no higher than the
level already achieved.

A second bucket, `awaitingEvidence`, holds requirements whose behaviour is in
the code but which **nothing** yet verifies. They are declared rather than
omitted: the behaviour exists, a reviewer will ask about it, and a package that
left it out would read as though the surface had nothing further to validate.
**A declared gap is evidence; a silent one is a misrepresentation.**

## Executed Playwright evidence — the part D4 names specifically

None of the 73 surveyed requirements cited a browser test, so this had to be
built. `tests/e2e/oq/launch-surface-access-control.oq.spec.ts` is OQ evidence
for **21 CFR 11.10(d)**: one surface per launch application plus the two
never-switchable compliance surfaces, each asserted **both ways** — a visitor
with no session is returned to sign-in, and the same URL renders once a session
exists. The negative control is what gives the positive case meaning; a surface
with no guard at all renders just as happily for an authenticated user.

- **16 of 16 passed** against a live server driving real Chromium
  (`after/oq-access-control.txt`).
- **Mutation-tested.** Removing the session from the positive case makes it fail
  with `/projects bounced an AUTHENTICATED session to login`
  (`after/oq-access-control-mutation.txt`), so the test genuinely depends on the
  session rather than passing regardless.

### A false finding this session caught on itself

A first reconnaissance pass read `body.innerText` about two seconds after
navigation and concluded that **nine launch surfaces rendered nothing**. They
were not blank. Re-probed with a generous settle, every one carried 23–39 KB of
DOM and 269–468 nodes; the affected surfaces were the canvas-owning
(`full: true`) ones that were still mounting. That would have put a fabricated
defect into a validation document. The OQ spec therefore polls on a DOM-node
threshold rather than on text, and the header records why.

## The environment the evidence was executed against

OQ evidence run against a schema that does not match the code is worthless, and
the schema here did not match:

- `column "expires_at" does not exist` — the database predated
  `db/migrations/20260824_module_grant_expiry.sql`.
- `project_memory_entries` was **absent from every schema** while four
  migrations referenced it, because it is created by `drizzle-kit push`
  (`shared/schema.ts:15526`), not by a raw migration.

`install-fresh.mjs` refused to repair that in place, and said exactly why:
`drizzle-kit push` cannot introspect a database that already carries the
overlay's expression indexes, so **13 declared tables can never be created
retrospectively**. Its error names the 13 and says to provision into an empty
database. So a fresh one was provisioned, in the order `docs/LOCAL_TESTING.md`
prescribes:

| Step | Result |
|---|---|
| `CREATE EXTENSION vector` (pgvector 0.6.0, owned by the provisioning role) | ok |
| `gcc_*` roles created | ok — this and extension ownership were the cause of the 6 governed-content failures `LOCAL_TESTING.md` documents |
| `node scripts/db/install-fresh.mjs` | **Application schema install complete**, no incomplete areas |
| `APPLY_C2C_MIGRATIONS=true node scripts/db/apply-c2c-migrations.mjs` | **290 applied, 0 failed** |
| Tables / RLS policies | **791 / 819** |

## A defect in this generator, found by its own output

The first full run reported one `ERROR`:
`tests/db/authoring-section-concurrency.dbtest.ts` — *"the report did not
mention this file — it was not executed"*. That was correct and the cause was
mine: `*.dbtest.ts` is **excluded** from `vitest.config.ts` (which installs a
process-wide `vi.mock('pg')`) and belongs to `vitest.db.config.ts`. Running it
under the default config executes nothing. The generator now partitions the
files and runs each under the config it belongs to.

Worth stating plainly: the generator reported this as `ERROR` rather than as a
pass. Had it not distinguished "ran nothing" from "passed", the defect would
have been invisible and the matrix would have carried a green row for a test
that never ran.

## Not established, and not claimed

- **Tenant isolation at the database layer.** The application connected as the
  owning role with `RLS_ENFORCE` off. Requirements about tenant scoping are
  evidenced at the route layer, which is what they cite. RLS enforcement under
  the non-superuser app role is **row D3** and is not claimed here.
- **Whether a requirement is true of the code.** No generator establishes that.
  It is the reviewer's judgement, and every generated document says so in its
  own header.
- **Any signature.** Nothing in this folder is signed.

## Files

| Path | What it is |
|---|---|
| `after/ci-validation-traceability-selftest.txt` | 19 self-test cases, every mutation caught |
| `after/generator-fails-closed.txt` | the three fail-closed proofs on the real code path |
| `after/oq-access-control.txt` | 16/16 Playwright OQ, live server |
| `after/oq-access-control-mutation.txt` | the same spec failing when the session is removed |
| `after/install-fresh-summary.txt` | schema provisioning |
| `after/c2c-migrations-summary.txt` | 290/290 migrations |
| `after/pack-run.txt` | the executed package run and its verdict |
