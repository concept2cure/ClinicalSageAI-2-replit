# Product decisions on the parked items, 2026-10-12

The founder delegated these. Each one below is **decided**, with the evidence that
decided it and what would reopen it. Where a decision is "don't", the reason is
recorded so the next session does not re-litigate it from scratch — that is the
point of writing them down.

Standing constraint on all of them: **Rule 2 — no new capability until the ten
launch rows are green.** These decisions serve that rule; none of them carves an
exception from it.

---

## D-1. The 37 "dead" metrics services — DELETE NOTHING. C-10 is a false positive.

**Decision: delete nothing, including `server/metrics.js`. C-10 is closed as
incorrect, not as done.**

C-10 said *"37 of 43 `*-metrics.ts` services are dead code — no endpoint and no
caller."* The count is wrong (there are 44) and the conclusion is wrong in the
other direction too: **zero are dead.** Every one sits on a live two-ended chain,
verified for all 40 under `server/services/`, not sampled:

- a mounted route module statically imports and **calls** its `record*()` /
  `observe*()` / `set*()` counters, and
- the single aggregate `/api/metrics` handler
  (`server/startup/inline-endpoints.ts:264`) **dynamically** imports and calls
  its `render*Metrics()`.

**The trap, which is the part worth keeping.** There is no per-service endpoint —
no `/api/grants/metrics`. All 40 aggregate into one handler and are pulled in by
`await import('../services/grants-metrics.js')` inside a try/catch, which is
invisible to a static-import or path grep. So a search shaped *"does this service
have an endpoint?"* correctly returns nothing, and the inference from that to
"dead" does not hold. **It is the trap that will recur, not the file list.**

**And a dangerous near-miss, recorded because the first pass made it.** The
investigation concluded `server/metrics.js` was *"the one genuinely unreachable
metrics module"* and recommended deleting it — having grepped the exported
**symbol** rather than the **module**, the mirror image of the error it had just
faulted the review for. Verified by hand: three production importers, and two are
CMC / Module 3, which Rule 2 decision P-28 puts **inside** the launch catalog:

- `server/services/cmc/link-to-module3.ts:34`, called at `:108`
- `server/api/cmc/routes.ts:74` (mounted via `bootstrap/register-core-routes.ts`)
- `server/routes/c2c/shared.ts:16`, destructured at `:28`

Deleting it breaks launch-catalog code. The adversarial pass caught it; a
single-pass investigation would have shipped it.

### The real question this surfaced, which is NOT a deletion

`/api/metrics` **has no scrape configuration in this repository.** The only one
present (`charts/trialsage-cer/templates/servicemonitor.yaml`) scrapes
`port: metrics` / `path: /metrics`, which no production code serves; the `/metrics`
router at `server/routes/health.ts:225` is mounted nowhere; the deploy target is
Replit autoscale, not Helm. `infra/alerts/*.yml` mention `/api/metrics` **only in
comments** and are loaded by no Prometheus config, CI step, script or template.

So the 40 `render*Metrics()` functions are **built and not wired to a reader**.
That does not make them deletable — the `record*` sites are compiled into mounted
routes, and the regulatory basis comments live in those files, so deletion would
lose knowledge rather than supersede it. It makes "does this telemetry have a
consumer?" an open **operations** question, filed as such.

Note also that the earlier claim of *"live Alertmanager rules"* at risk was
unsupported: it inferred deployment from a file's existence — again the same move.

**What would reopen it:** a scrape config landing for `/api/metrics` (which closes
the open question), or a specific file shown to have no importer by a
module-level, not symbol-level, search.

---

## D-2. The QMS and inspection migrations — NOT LANDED. The blocker is a column.

**Final: the two files stay off `C2C_MIGRATION_FILES`. The reason is not Rule 1
and not Rule 2 — it is that the Part 11 guard two entries below them hard-fails
the deploy until `public.electronic_signatures` carries `created_at`.**

This decision moved twice before it landed, and the sequence is the useful part:

1. **Held**, as "a new capability while the launch rows are red."
2. **Reversed**, because that premise was false: `qms` IS a launch app, granted
   by default, and its surface has been rendering "Could not be read" in
   production. Fixing a broken catalog entry serves Rule 2 rather than bending it.
3. **Held again**, because the deep check found the actual blocker — and only the
   deep check could.

### The blocker

`20261001_qms_document_signature_required.sql` self-guards with `to_regclass`
and returns a NOTICE while `qms_documents` is absent. **The moment the table
exists it stops no-opping** and runs its own preflight: it requires SEVEN columns
on `public.electronic_signatures` — `organization_id`, `signed_target`,
`signature_type`, `superseded_by`, `is_valid`, `verification_status`,
`created_at` — and `RAISE EXCEPTION`s if any is missing.

`created_at` is **absent** from the drizzle journal's
`CREATE TABLE "electronic_signatures"` (`migrations/0000_sweet_joseph.sql`) and
**nothing in the 372-entry set adds it.** `shared/schema.ts` declares it, so a
database provisioned by `drizzle-kit push` has it and one migrated only through
the set does not — and which production is cannot be answered from a container
with no live database. That is exactly the `ci:tables-live-schema` check I had
already flagged as unavailable, now with a concrete consequence.

`tests/schema-contract/tenant-isolation-sweep.contract.test.ts` — "C-33: the
batch applies in set order, **twice**" — fails on pass 1 at that file with
precisely this message when the two entries are added:

```
pass 1: migrations/20261001_qms_document_signature_required.sql failed —
  [qms-document-signature-required] public.electronic_signatures lacks
  superseded_by, created_at; the guard would refuse every approval.
```

**So landing it risks a broken deploy for every tenant.** That is categorically
worse than the broken Quality surface it fixes — and that surface fails
*honestly*, saying "Could not be read" rather than showing a zero. A broken
deploy has no honest failure mode.

### The prerequisite, by name

1. A migration adding `created_at` to `public.electronic_signatures` (and
   asserting the other six), placed **before** `20261001`.
2. Then the two QMS files go **above** `20261001`, where
   `ci:migration-guard-order` now holds the ordering.
3. The contract fixture also needs `db/migrations/20260725_esig_gate_columns_port.sql`
   (set index 43) hand-applied: the fixture's slice starts at `BATCH_START`
   (index 78) so it never applies the file that supplies `superseded_by`. That
   one IS a fixture gap, of the class the fixture's own comments describe three
   times. **`created_at` is not** — it is a real gap and that hand-apply does not
   fix it.

The Rule 1 replay analysis (clean: 43 statements, all `IF NOT EXISTS`, all ten
tables `public` + `organization_id integer NOT NULL`, one creator each) is
recorded in `migration-set.mjs` beside the commented-out entries, so whoever
clears the prerequisite does not redo it.

### What DID land

`ci:migration-guard-order`, which is independently valuable and carries no deploy
risk. For every (table, guard) pair in the set — triggers, added constraints,
RLS enable/force, policies — the creator's index must be lower than the guard's.
Verified before writing it: with the QMS files misplaced after the trigger file,
`ci:migration-set-order`, `ci:migration-drop-safety` and
`ci:migration-deploy-path` **all pass**. It has a `--selftest` that builds that
case both ways, it is in `.husky/pre-push`, and it is green on the live set with
zero baselined entries.

Its own first run found a bug in itself: it reported `electronic_signatures` as
violating, having discarded the schema qualifier and collided
`regulatory_harmonization.electronic_signatures` (created at index 124) with
`public.electronic_signatures` (guarded at index 54). Keys are `schema.table`
now. A gate's first finding is a claim about the code like any other.

---

## D-2 (superseded twice) — the reasoning held first, kept because the sequence is the point.

**I held this, then reversed it when the evidence came back, and the reversal is
the right call. Both files are now on `C2C_MIGRATION_FILES`, placed above
`20261001_qms_document_signature_required.sql`, with a new gate protecting that
placement.**

### What changed my mind

I held it as "a new capability while the launch rows are red." That premise is
false. `qms` **is a launch app**: `shared/constants/launch-scope.ts` lists it with
`surfaces: ['quality']` and `modules: ['quality']`, granted to a new organisation
by default, and `client/src/concept2cure/quality/hooks.ts` reads
`/api/mdx/qms/documents`, `/templates`, `/review-due` and `/training/compliance`
live. Those routes read tables that were on no applier but `install-fresh`.

So the Quality surface has been rendering **"Could not be read" on every load, for
every organisation, in production.** It failed honestly — `SopRegister` computes
`regFailed` instead of showing a zero, and `/readiness` degrades per block on
`42P01` so "a zero from an absent system" is not an all-clear — which is why
nobody caught it as a data-integrity bug. But a launch app whose primary store
does not exist is a **broken promise, not a deferred feature**, and Rule 2 exists
to stop new capability, not to keep a shipped catalog entry broken. Fixing it
*serves* Rule 2.

And the second fact the review did not have: because `qms_documents` has never
existed, `20261001_qms_document_signature_required.sql` has self-guarded with
`to_regclass` and **no-opped on every deploy since it landed** — so the Part 11
§11.50/§11.70 database guard for controlled documents has never existed on any
deployed database. Placing the creator correctly is what finally arms it.

### The Rule 1 case, which is clean

All 43 statements across both files are `CREATE TABLE` / `CREATE [UNIQUE] INDEX`,
every one `IF NOT EXISTS`. No DROP, no ALTER, no `ADD CONSTRAINT`, no DML, no DO
block, no self-transaction — nothing can fail on a replay, and 20260610's eight
CHECKs are inline in their `CREATE TABLE` so they are never re-validated over
rows a later file admitted. All ten tables are unqualified (so `public`) with
`organization_id integer NOT NULL REFERENCES organizations(id)`, which is the
final sweep's own selector, so each is policied without an entry in the
hand-maintained non-public list. Each table has exactly **one** creator in the
repository, so the outcome worth hunting for — `CREATE TABLE IF NOT EXISTS` over
a table that already exists in a different shape, a silent no-op leaving the
columns wrong — has no rival shape to collide with.

### The gate, because the placement was load-bearing and nothing checked it

Ordered *after* the trigger file, the tables arrive on deploy N and the guard on
deploy N+1, leaving a window in which `UPDATE qms_documents SET status =
'effective'` commits **with no electronic signature**, on a surface that can by
then write to it. The set has made that mistake twice
(`20260224_binder_evidence_source_types`, `20260617_precedent_org_isolation`).

**Verified, not assumed:** with the two files misplaced after the trigger file,
`ci:migration-set-order`, `ci:migration-drop-safety` and
`ci:migration-deploy-path` **all pass.** So `ci:migration-guard-order` is new:
for every (table, guard) pair in the set — triggers, added constraints, RLS
enable/force, policies — the creator's index must be lower than the guard's. It
is in `.husky/pre-push`, it has a `--selftest` that constructs this exact case in
both orders, and it is green on the live set with **zero** baselined entries.

Its own first run found a bug in itself, which is recorded in the script: it
reported `electronic_signatures` as violating, because it discarded the schema
qualifier and collided `regulatory_harmonization.electronic_signatures` (created
at index 124) with `public.electronic_signatures` (guarded at index 54). Keys are
now `schema.table`. A gate's first finding is a claim about the code like any
other, and it did not survive checking either.

### The residual I did NOT fix, deliberately

Every child FK in both files is a bare single-column reference, so nothing in the
database requires `inspection_findings → inspections`,
`finding_responses → inspection_findings`, `readiness_assessments → inspections`,
`qms_training_records → qms_documents` or
`labeling_translations → labeling_documents` to be the **same organisation's**.
The services close it in application code and the sweep policies each row by its
own `organization_id`, so a child written with org A under org B's parent would
be shown to A. The repo's current practice is a `NOT VALID` same-org key
(`20261008d_cre_source_study_ref.sql`, `20261008f_stats_computation_runs.sql`).

It must be a **guarded ALTER in a new file, never an in-place amendment** of
these `CREATE TABLE`s: install-fresh databases already have these tables, so an
inline amendment is a silent no-op exactly where it is needed. Conflating it with
this change would have risked the placement, which is the part with a Part 11
window behind it. **This is the next migration to write.**

---

## D-2 (superseded) — the reasoning I held first, kept because the reversal is the point.

**Decision: do not add `20260511_qms_and_labeling.sql` or
`20260610_inspection_readiness.sql` to `C2C_MIGRATION_FILES` now. The Rule 1
safety case is clean and is recorded here so whoever does it inherits the
analysis rather than redoing it.**

The safety case **passes**, and comfortably:

- **Replay-safe.** All 43 statements across both files are `CREATE TABLE IF NOT
  EXISTS` or `CREATE [UNIQUE] INDEX IF NOT EXISTS`. Zero DROP, zero ALTER, zero
  `ADD CONSTRAINT`, zero DML, no DO block, no self-transaction. 20260610's eight
  CHECKs are inline in their `CREATE TABLE`, so they are created once and never
  re-validated — exactly the shape Rule 1's `ADD CONSTRAINT` corollary exists to
  force.
- **Tenant-safe.** All ten tables are unqualified (so `public`) and declare
  `organization_id integer NOT NULL REFERENCES organizations(id)`, which is the
  sweep's own selector — so all ten are policied, FORCE'd and ENABLE'd by the
  final `TENANT_ISOLATION_SWEEP` with no entry in the hand-maintained
  non-public list. (`labeling_documents.program_id` is uuid but it is a foreign
  key, not the tenant key.)
- **No silent no-op.** The outcome to hunt hardest for — `CREATE TABLE IF NOT
  EXISTS` over a table that already exists with a different shape, leaving the
  columns wrong — does not apply: each of the ten tables has exactly one creator
  in the repository, so there is no rival shape to collide with.

**Why not now, then. Three reasons, in order.**

1. **It is a new capability, and the launch rows are not green.** Adding these
   makes 30+ built QMS endpoints reachable. Rule 2 is the founder's own standing
   rule and it binds this decision too; "QMS controlled documents" being in the
   catalog makes it *eligible*, not *due*.
2. **The placement is load-bearing and no gate protects it.** If 20260511 lands
   near the tail — the reflex for a new entry — rather than before index ~2885,
   the Part 11 constraint triggers in `20261001` arrive only on the SECOND
   deploy. Between the two deploys, `UPDATE qms_documents SET status = 'effective'`
   commits **with no electronic signature**, on a table the UI can by then write
   to. The set has made this exact mistake twice before
   (`20260224_binder_evidence_source_types`, `20260617_precedent_org_isolation`)
   and **`ci:migration-set-order` does not catch it.** A Part 11 signature-bypass
   window is not a side effect to accept from a reporting-coverage session.
3. **It wants a live-schema confirmation this container cannot give.**
   `ci:tables-live-schema` against the real database is the check that turns "one
   creator in the repo" into "one shape in production."

**The follow-up that would make this safe to do, and is worth more than the
migration itself:** a gate that fails when a migration creating a table is
ordered after a migration that attaches a constraint trigger to it. That is the
hazard in (2), it has fired twice, and it is invisible to the current gate.

**What would reopen it:** the launch rows going green, or a founder decision that
the QMS unlock outranks Rule 2 — plus the placement gate, or a hand-verified
placement before index ~2885 with the live-schema check run.

---

## D-3. The attestation's stronger claim — NARROW THE CLAIM, NOT THE CHAIN.

**Decided and shipped** (commit on this branch, "The attestation declares its own
method, in its signed body"). Recorded here because the reasoning is a
compliance judgement, not an engineering one.

Re-deriving a hash per entry needs a recipe, and every row already in the chain
was written under the current one. Changing it makes all historical rows
un-reproducible, so the report would say **BROKEN across the entire pre-cutover
span** — and an inspector reading that does not conclude "the recipe changed",
they conclude the trail is compromised. **A narrow true claim beats a broad claim
that cannot be kept.**

So the recipe is untouched, and the report now declares its own method inside its
HMAC-signed body (`verifies`, schemaVersion 1.1): it establishes that the stored
links join — nothing removed, inserted or reordered — and explicitly does not
establish anything about an entry's contents.

**What would reopen it:** a dated cutover that puts before/after values inside
the hashed envelope. That is a schema decision with a migration behind it.

---

## D-4. Collapsing the 61-type catalog onto ~6 parameterised computations — NOT NOW.

**Decision: do not collapse the catalog. Build engines under it instead, as the
`regional` engine did.**

The review's finding stands: 26 of the 61 types are a pathway label on one
underlying computation, with near-identical declared `dataDependencies`. There
were never 43 distinct computations to write.

But collapsing means deleting 26 governed type definitions that live in a
**deployed seed migration**, which under Rule 1 means amending the creating
migration in place, and under the working agreement means naming a reachable
replacement by path for each. For zero launch benefit: the canvas is **already
honest** — it lists them as "not computed in this release" and `POST /runs`
refuses them — so no user is being misled today.

The `regional` engine is the pattern that works instead: one region-parameterised
engine, bounded by a record that actually has the data
(`shared/regulatory/regional-module1.ts`), which turned four of those labels into
real computations without touching the catalog. Widening it means adding a
regulator's Module 1 tree with a basis per heading — incremental, reversible, and
honest at every step.

**What would reopen it:** a client-facing surface that presents the 61 as
available (none does), or the catalog becoming a sales artifact rather than an
internal registry.

---

## Methodology finding, which outlives all four

**Not the one the investigation reported.** It reported that the working
agreement's required history search
(`git log --all --diff-filter=D -- <paths>`) silently returns nothing here
because the clone is shallow, making an empty result indistinguishable from "no
deletion ever happened" — a false clean for a rule that exists precisely because
five editor generations were deleted and rebuilt.

**Checked, and it does not hold.** `git rev-parse --is-shallow-repository`
answers `false`; the clone carries 13,803 commits; and the search returns real
results for both the case at hand and the case the rule was written for:

```
$ git log --all --diff-filter=D --name-only -- 'server/**/*metrics*'
ac5018cc3  server/services/__tests__/submission-chat-metrics.test.ts
87d13d7cd  server/routers/csr_metrics.py

$ git log --all --diff-filter=D --name-only -- 'client/**/*Editor*'
90760ae00  client/src/concept2cure/v2/surfaces/EditorCanvas.tsx
02a8f8508  client/public/design-system/ui_kits/mdx/EstarEditor.jsx
```

The working agreement's gate works in this container. Nobody needs to
`--unshallow` anything.

**So the finding worth keeping is the one this correction demonstrates: an
agent's claim about the state of the TOOLING needs verifying exactly as much as
its claim about the code, and is likelier to slip through** — a claim about a
function is checked by reading the function, while a claim about "the search
returns nothing" reads like an observation and gets believed.

That is now the fourth claim this review cycle that did not survive checking.
The first three were in the review itself (C-7's copy was never "No expedited
report required"; C-6's cap is in the AnA context, not the rendered feed; C-4's
"one-line fix" would have put a Run button on a POST guaranteed to 422). The
fourth is this one, from the pass sent to check the others — and the pass sent to
check THAT one caught a dangerous error in it (D-1's near-deletion of
`server/metrics.js`) while repeating the shallow-clone premise unchallenged.

The practice that held, every time: **verify the claim against the artifact
before acting on it** — the code for a code claim, and the command for a tooling
claim. Two adversarial passes did not substitute for running
`git rev-parse --is-shallow-repository` once.
