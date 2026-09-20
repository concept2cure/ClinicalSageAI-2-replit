# WO-16C — Verify the unverified tiers: brief for the concurrent session

**To:** the session that executed Cortex Route B and WO-16B · **From:** Claude Code (schema/gates session)
**Date:** 10 September 2026 · **Head at handoff:** `9aed6ded6`

WO-16B was well done, and the part I want to single out is not the ten fixes. It
is that you corrected three characterisations including one of your own, from a
grep truncated by a line limit, and let the typecheck catch you. That is the
standard this work order runs on.

---

## 0. Branch discipline — unchanged

`CLAUDE.md` RULE 0. `concept2cure-v2` only, merge never rebase, never set
`ALLOW_NON_CANONICAL_PUSH=1`. Your commits are merged into my history; we are in
sync at `9aed6ded6`.

---

## 1. The job: 104 findings nobody has verified

`WO-16-fabrication-findings.json` holds 134 entries. **30 were tiered critical,
104 were not, and only the 30 have ever been verified properly.** I ran the
criticals through one-agent-per-finding verification with adversarial refutation
this session. The result is the reason you are being asked to do this:

| | Findings file says | After per-finding verification |
|---|---|---|
| my lane's 16 criticals | 16 × critical | **1 critical, 12 high, 2 medium, 1 low** |

**The tiers are unreliable in both directions.** One "critical" had *zero
reach* — affirmatively disproven at three independent hops, no mount exists.
Another named a route that does not exist. Meanwhile the same pass turned up
five fabrication sites no finding had named at all, one of which was an
unauthenticated E2B(R3) ICSR generator that classified every case as
non-serious.

So: **the 45 high-tier entries almost certainly contain criticals, and the 59
medium/low almost certainly contain nothing.** Nobody knows which. That is the
gap this work order closes.

## 2. Method — the part that matters

The original sweep refuted **4 of 135 (3%)**, against 24% on comparable prior
work. The cause was my design: every finding from a lens went into ONE verifier
prompt, so the verifier graded a batch instead of a claim. Do not repeat it.

**One agent per finding.** Each agent must:

1. Read the actual source at the cited lines, and enough surrounding context to
   know what the function is for. Quote it verbatim — no paraphrase.
2. Decide whether the claim is true **as written**, and restate it in its own
   words. `CONFIRMED_VERBATIM` / `CONFIRMED_NARROWER` / `OVERSTATED` / `REFUTED`.
3. **Trace reach to a `file:line` for every hop**: the mount, the auth gate (or
   its absence), a `client/src` caller, a test. "Probably mounted" is not reach.
4. Say what a paying customer actually sees or downloads because of it.
5. Re-rate severity **after** reading the code.

Then **two adversarial refuters per survivor, on distinct lenses** — one reading
the code, one attacking reach and consequence — each instructed to default to
`refuted: true` when it cannot positively confirm from source it has read.

My run was 49 agents for 16 findings and cost about 4.2M subagent tokens. Scale
accordingly; the budget is not the constraint, the batching is.

## 3. What to fix, and what to leave

**Fix** a verified finding when all three hold: confirmed after refutation, the
fix is small and local, and the file is not on my list in §5. Same bar as
WO-16B: red first, failure injected at the dependency, never mocked at the
boundary.

**Do not fix, report instead**, when the finding is confirmed but the fix is
architectural, spans a subsystem, or lands in one of my files. A triaged, ranked
backlog is the deliverable here; fixes are a bonus.

**Refuted is a result, not a failure.** I expect a substantial refutation rate
this time and will be suspicious of another 3%. Write each refutation down with
the source that refutes it.

## 4. Two things I learned the hard way this session, both of which will bite you

**"A real implementation exists" and "which one is canonical" are different
questions.** I fixed the fabricated FAERS statistics by wiring the route to a
real disproportionality engine — and picked the wrong one. Two exist here:
`pharmacovigilance-knowledge.ts::detectSafetySignal` and
`stats/signal-disproportionality.ts::screenSignalPanel`. The second is canonical
(own test suite, five consumers, a real BCPNN IC025 and a real Gamma-Poisson
EBGM where the first admits in its own docstring to an approximation). My first
fix resolved the fabrication and entrenched the duplication; corrected at
`d26cf7dec`. **Before wiring anything to a "canonical" implementation, grep for
a second one and compare consumers.**

**The guard-test trap, twice now.** A module whose only importer is a test may be
the only thing holding a fabrication or a security fix down. It nearly took out
`csr-extractor-service.ts` (its test pins hardcoded 0.92/0.85 confidence values),
and it sits directly beside the obvious fix for finding #4:
`server/utils/document-file-roots.ts` has exactly ONE non-test importer, and its
test is a cross-tenant path-traversal regression guard for confirmed findings
EXP-06 / INJ-PATH-001. Deleting the router would have stranded it. **Read what a
module's tests assert before calling it deletable.**

A third, smaller: **fabrication is not always a reason to delete.** I deleted
`/api/leaves` because it invented its content regardless of input. I kept
`document-understanding.ts`, which advertised four ML models it does not run but
genuinely extracts from the caller's real document — there, only the provenance
was false, and the proportionate fix was to make it describe itself truthfully.
Ask which one you have.

## 5. Coordination — files I have open

| Mine | |
|---|---|
| `server/routes/ai-assistance.ts` | WO-16 #3 |
| `server/services/contradiction-engine-service.ts` | WO-16 #6 |
| `server/services/cognitive-ecosystem/fhir-validation.service.ts` | WO-16 #7 |
| `server/api/cmc/workflowRoutes.ts` | WO-16 #9 |
| `server/protocol-optimizer-service.ts` | the `confidence: 0.9/0.8/0.7` constants |
| `scripts/db/migration-set.mjs`, `scripts/db/deploy-migrate.mjs` | **the audit_events convergence — see §6** |
| `docs/work-orders/WO-1`, `WO-15`, `WO-16-fabrication-findings.json` | mine |

Everything else in the 104 is yours. `docs/work-orders/WO-16C-*` is yours;
append your results to `WO-16-fabrication-sweep.md` rather than rewriting my
sections.

## 6. The audit_events chain trigger — I am taking it, not handing it back

You were right to flag it and right not to decide it. For the record so you do
not spend time on it: the hash-chain trigger is not in `C2C_MIGRATION_FILES`, so
on a canonically provisioned database every chain surface now reports
`unverified`. That is the honest state and it is also a pilot blocker — an audit
trail whose integrity cannot be verified is not an audit trail. It is RULE 1
migration work in the applier model I have been in all session, so it is mine.
**Do not edit `migration-set.mjs` or `deploy-migrate.mjs`.**

## 7. What "done" looks like

For each of the 104: a verdict, a re-rated severity, reach traced to `file:line`,
and one of **fixed** (with the red-first test), **refuted** (with the source), or
**deferred** (with what it costs and what it blocks).

Then the standing list:

```bash
npm run ci:unverified-verdicts        # yours, from WO-16B
npm run ci:duplicate-table-ddl
npm run ci:migration-set-order && npm run ci:migration-drop-safety
npm run audit:orphaned-endpoints:strict
npx vitest run tests/schema-contract/
npm run db:provision-test && npm run ci:tables-live-schema
```

And one sentence at the top of your section: **how many of the 104 are real, and
whether any of them changes the pilot answer.** That sentence is the deliverable.
