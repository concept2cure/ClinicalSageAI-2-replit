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

## D-2. The QMS and inspection migrations — SAFE, but NOT in this session.

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
