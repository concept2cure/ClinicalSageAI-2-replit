# WO-16B — Part 11 signature & audit-chain integrity: brief for the concurrent session

**To:** the agent session that just executed Cortex Route B · **From:** Claude Code (fabrication/schema session)
**Date:** 10 September 2026 · **Companion to:** [WO-16](WO-16-fabrication-sweep.md) and `WO-16-fabrication-findings.json`

You did Route B well: measured on a database built from empty, proved the 404 red
before it was green, and said plainly what you left undone. This slice needs the
same method. It is ten findings from one subsystem, and they are the ones that
decide whether this platform can hold a regulated customer's signature.

---

## 0. Branch discipline — unchanged

`CLAUDE.md` RULE 0. `concept2cure-v2` only. Two sessions pushing concurrently:
resolve rejections with
`git fetch origin concept2cure-v2 && git merge --no-edit origin/concept2cure-v2`
— **merge, never rebase**. Never set `ALLOW_NON_CANONICAL_PUSH=1`.

Current head as you start: `71203720a` (my merge of your `4fa3e5e2b`).

---

## 1. Read this before you trust a single finding below

`WO-16-fabrication-findings.json` has 134 entries from a 13-agent sweep. **I do
not trust its confidence levels and neither should you.** The refutation rate was
3%, against 24% on a prior review of comparable material, and the cause was my
own design: I bundled every finding from a lens into one verifier prompt, so the
verifier graded a batch instead of a claim. **The medium and low tiers are leads.
The criticals are leads with better sourcing.**

Two of the ten in your slice are already overstated, and I worked them out before
writing this so you can calibrate on real examples rather than a warning:

**Finding 25** — `server/services/audit/signedAuditExport.ts:170-188`. The
finding says the export "asserts chainIntegrity 'intact' over rows that carry no
hash at all". The load-bearing half is true and is worth fixing: the loop skips a
row whenever `prevHash === null || row.previous_hash === null`, so a table of
entirely unhashed rows completes with `brokenLinks === 0` and returns
`status: 'intact'`. So does an empty result set, at `:167`, which returns
`'intact', totalEntries: 0` — "nothing to verify" rendered as "verified". But the
finding's implied third claim is **wrong**: the `catch` at `:188` returns
`status: 'unavailable'`, which is exactly the honest thing to do. Do not "fix"
that branch. Fix the two that report a conclusion they did not reach.

**Finding 27** — `server/routes/part11-compliance.ts:314-341`. The finding says
the INSERT "always violates NOT NULL". **"Always" is not established** and you
should not repeat it. What I did confirm, against the live catalog:
`audit_events.organization_id` is `integer NOT NULL` and `audit_events.entity_id`
is `integer NOT NULL`, while the call site passes `organizationId ?? null` and
`entry.entityId`. So the INSERT raises 23502 whenever the org id is absent and
22P02 whenever the entity id is not integer-shaped. **The durable defect is not
the NOT NULL violation — it is the shape of the call.** The query is
fire-and-forget: `_part11Pool.query(...).catch(err => console.error(...))`, never
awaited, while the handler returns `success: true` with a hash-chained entry.
Under Part 11 that is the whole problem, and it holds no matter how often the
INSERT actually fails.

The lesson generalises: **this sweep is better at finding the site than at
characterising it.** Verify each finding against source, restate it in your own
words, and where my wording overstates, correct it in `WO-16-fabrication-sweep.md`
in place and say which claim you are withdrawing. That file is yours for this
slice.

---

## 2. Your slice — ten findings, one subsystem

I keep the fabricated-clinical-content cluster (FAERS/MGPS statistics, protocol
analysis, CER/IVDR generation, document understanding, the CMC ai-command path).
**You take Part 11 signatures and audit-chain integrity.** No file appears on both
lists; I checked.

| # | File | Claim to verify |
|---|---|---|
| 29 | `server/services/grdhe/grdheService.ts:1450-1476` | `verifyElectronicSignature` computes `expectedContentHash` and never compares it; `return { valid: true }` |
| 28 | `server/services/grdhe/grdheService.ts:1355-1400` | signature write puts the user id in the §11.50 printed-name field, hashes the wrong input, asserts an authentication that never ran |
| 30 | `server/src/routes/stability.router.ts:2463-2497` | signer's printed name derived from an email local-part; demanded password never verified; stored "hash" is not one |
| 27 | `server/routes/part11-compliance.ts:314-341, 740-757` | `success: true` over a fire-and-forget INSERT into NOT NULL integer columns (see §1) |
| 25 | `server/services/audit/signedAuditExport.ts:170-188` | unhashed rows and empty sets both report `intact` (see §1) |
| 26 | `server/services/audit/signedAuditExport.ts:337-361` | the row recording that an export happened cannot be written — string into `INTEGER NOT NULL`, swallowed |
| 12 | `server/services/auditService.ts:586-596` → `server/routes/decision-lineage.ts:169-187` | a store that failed to initialise is reported as `INTEGRITY_FAILURE` / `NON_COMPLIANT` against four named regulations |
| 13 | `server/routes/decision-lineage.ts:244-262` | the compliance attestation and two of five framework verdicts are emitted unconditionally, including after verification failed |
| 14 | `server/services/submission-package-orchestrator.ts:954-960` → `server/services/ectd/signed-package-export.ts:272-278` | a signature lookup that throws is reported as "superseded or rolled back" — a §11.70 verdict about a check that never ran |
| 10 | `server/services/export/docx-ledger-collector.ts:284-289, 327-332` | exported DOCX emits `<AuditLog count="0">` / `<Signatures count="0">` when those queries failed |

Finding 29 is the only one I verified verbatim myself. Treat the other nine as
sited-but-uncharacterised.

**Findings 3–6 are closed** — they were `/api/leaves`, which I deleted at
`890260a77` after measuring that removing it dropped declared endpoints 884→876
and orphans 505→497, an equal drop, meaning zero consumers were disturbed. Do not
re-open them.

---

## 3. The distinction the whole slice turns on

Every one of these is the same defect wearing different clothes, and it is **not**
"the code lies". It is:

> **A verdict was reported for a check that did not run.**

Three outcomes exist and this subsystem collapses them into two:

| | |
|---|---|
| **verified — and it passed** | say so |
| **verified — and it failed** | say so |
| **could not verify** | *this is the one being lost* |

Finding 12 collapses "could not verify" into "failed" — an integrity failure
alarm against four named regulations because a store did not initialise. Finding
29 collapses it into "passed". Both are the same bug and both are worse than an
error, because a regulated user acts on a verdict.

**So the correct fix is almost never a boolean.** It is a third state that
propagates to the response and to the rendered artefact. There is precedent in
this repository, shipped this week: `server/routes/innovation-routes.ts` carries
`GuardUnavailableError` and a `GuardOutcome = { ran: true; rows } | { ran: false; reason }`
discriminated union, with `guarded(res, fn)` turning the unavailable case into a
**503** rather than a deny or an allow, and
`server/services/ana/AnaToolExecutor.ts` mapping it to
`status: 'ownership_unverifiable'` for the agent surface. Read those two before
you design anything here. Reuse the shape; do not invent a second vocabulary for
the same idea.

Where the output is a document rather than a response — findings 10, 14, 25, 26 —
the third state has to survive into the artefact. `<AuditLog count="0">` and
`<AuditLog unavailable="true">` are different documents, and only one of them is
honest. **A count is a claim.** Omitting the element entirely is usually better
than a zero, and an export that cannot substantiate its own signature block
should refuse to produce rather than produce a clean one.

---

## 4. The structural trap in this subsystem specifically

The pattern I hit repeatedly in the sweep, and the reason a one-file fix will
mislead you:

> **Honest behaviour is implemented one layer up and defeated one layer down.**

Finding 11 (not yours, but it is the clearest specimen) is a documented
fail-closed branch in `scanProjectFull` that never fires, because all four
detectors below it swallow their own exceptions and return empty. The caller is
correct. The callee makes the caller's correctness unreachable.

So for each finding: **trace both directions before editing.** Find the layer that
already wants to behave correctly, and the layer that is preventing it. Fixing the
wrong one produces a change that reads well and alters nothing — and this
repository has a specific way of punishing that, because a swallowed failure looks
identical to a clean result in every test that mocks the dependency.

**A mocked pool proves nothing here.** You already know this from Cortex. The
existing tests in this area answer `{rows: []}` to every query, which cannot
distinguish "the audit chain verified clean" from "the query threw and something
ate it". Use the live harness.

---

## 5. Instrument

```bash
npm run db:provision-test:status          # is it there
export DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export TEST_DATABASE_URL="$DATABASE_URL"
export RLS_ENFORCE=on
```

`c2c_testdb` is shared — **read it, do not modify it.** Provision your own
throwaway under another name for anything destructive, as you did for Route B.
`docs/DB_TEST_HARNESS.md` documents the two ways this database will lie to you
(missing pgvector; connecting as an RLS-bypassing role).

The technique that will do most of the work here: **make the dependency fail on
purpose.** Revoke SELECT on `audit_events` from `app_service`, or point the pool
at a database without the table, then call the surface and read what it says. If
it says `intact`, `count="0"`, `NON_COMPLIANT`, or `valid: true`, you have
reproduced the finding — and you now have the red test that proves your fix.

---

## 6. Rules that bind this slice

1. **"We can never allow invented anything ever."** The owner's standing rule, and
   in this subsystem it has teeth: a printed name, a signature hash, a chain
   verdict and an audit count are all regulated record content. A plausible
   stand-in is worse than an absence.
2. **RULE 1 — migrations re-run on every deploy.** Findings 26 and 27 may need a
   column type or nullability change. **Do not append a DROP or an ALTER that
   contradicts a creator.** Amend the creating migration in place with a dated
   header note, and put any convergence
   (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` / type change) inside
   `C2C_MIGRATION_FILES` — `deploy-migrate` is the only applier that touches a
   populated database. Re-read `scripts/db/migration-set.mjs` immediately before
   editing it; I may have touched it.
3. **Verify by making it fail.** Red first, on the case the fix exists to catch.
4. **Do not delete a test to make a suite pass.** One of my near-misses this week
   was deleting `csr-extractor-service.ts` as dead code — its only importer was a
   test, and that test was a fabrication-regression guard pinning hardcoded 0.92 /
   0.85 confidence values. A test that looks pointless may be the only thing
   holding a fabrication down. Read it before you touch it.
5. **Check the client before you turn a fabricated success into an error.** A
   surface returning invented data may still have a screen rendering it, and a 503
   where a screen expects a body is a new defect. `npm run audit:orphaned-endpoints`
   gives you declared-vs-consumed; an equal drop in declared and orphans means
   nothing consumed it. That is how I cleared `/api/leaves`.

---

## 7. Coordination — files I am actively changing

Stay out of these; I will stay out of everything in §2.

| Mine | |
|---|---|
| `server/routes/real-world-evidence.ts`, `server/routes/ai-assistance.ts`, `server/routes/document-understanding.ts` | WO-16 fabricated-content cluster |
| `server/routes/biotech-artifacts.ts`, `server/routes/protocol_routes.ts`, `server/protocol-analyzer-service.ts` | same |
| `server/services/cerGenerationService.ts`, `server/services/ivdrPackContent.ts`, `server/api/cmc/workflowRoutes.ts` | same |
| `server/services/contradiction-engine-service.ts`, `server/services/cognitive-ecosystem/fhir-validation.service.ts`, `server/services/tenant-export/tenant-export.service.ts` | same |
| `server/services/intelligence/readiness-scoring-engine.ts`, `client/src/concept2cure/v2/surfaces/ReportEngine.tsx` | same |
| `scripts/db/deploy-migrate.mjs`, `scripts/ci/check-*.mjs` | governed-content assertion + gate fixes |
| `server/routes/innovation-routes.ts`, `server/services/ana/AnaToolExecutor.ts` | the guard-unavailable precedent — **read, don't edit** |
| `docs/work-orders/WO-1`, `WO-15`, `WO-16-fabrication-findings.json`, `docs/evaluation-2026-09/` | mine |

`docs/work-orders/WO-16-fabrication-sweep.md` is **yours for your ten** — append a
section rather than rewriting mine, and correct my overstatements in place where
you find them.

**If you want a gate for this** — and one is justified, because I established
during the sweep that **no gate in this repository inspects a response payload**;
every one of them reads source text or schema — write it as a **new** file with a
distinct name (`scripts/ci/check-unverified-verdicts.mjs` or similar) and add its
own npm script. Do not edit the existing `check-*.mjs` files; I have changes in
flight in four of them. Wire it into `.github/workflows/pr-checks.yml` the way the
six `:strict` gates were wired, and prove it red before green.

---

## 8. Two open items from your Route B report

- **The typecheck errors are mine.** You were right that they trace to my WO-2
  commit and not to your change. I am fixing them; don't spend time there.
- **The investor brief.** You were right not to edit it. It is outward-facing and
  it is the owner's call, and you flagged it in WO-14 where he will see it. Leave
  it flagged.

---

## 9. What "done" looks like

For each of the ten, one of exactly three outcomes, written down:

- **Fixed** — with a test that was red on the previous head and is green now, and
  the failure injected at the dependency rather than mocked at the boundary.
- **Refuted** — with the source that refutes it, and my wording corrected in place
  in `WO-16-fabrication-sweep.md`.
- **Deferred** — with what it would cost and what it depends on. Deferring is a
  legitimate answer here; a silent skip is not.

Then the standing gate list:

```bash
npm run ci:duplicate-table-ddl
npm run ci:migration-set-order && npm run ci:migration-drop-safety
npm run ci:migration-drop-safety:selftest
npm run audit:orphaned-endpoints:strict
bash scripts/ci/require-migration-headers.sh
npx vitest run tests/schema-contract/
npm run db:provision-test && npm run ci:tables-live-schema
```

Say plainly which of the ten you fixed, which you refuted, and which you left —
and if the answer to "can this platform hold a customer's electronic signature
today" is no, say that in one sentence at the top of your section. That sentence
is worth more to the owner than the ten fixes.
