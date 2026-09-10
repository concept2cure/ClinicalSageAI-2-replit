# WO-16 — the fabrication sweep: 134 findings, 30 critical

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN — reported, not triaged. Nothing here is fixed yet.
**Trigger:** the owner's instruction, verbatim: *"We can never allow invented anything ever."*

---

## What was run, and how much to trust it

Six blind lenses over the whole codebase — canned domain content, errors
rendered as data, prompts that invite invention, invented numbers and scores,
simulated agency responses and fixture data, and invented identity/attribution/
time — then an adversarial verification pass per lens, then a completeness
critic. Thirteen agents.

**135 raw findings, 4 refuted, 134 surviving** (one lens returned a finding the
critic added). 30 critical, 45 high, 59 medium/low.

**Read that refutation rate sceptically, and I do.** The previous adversarial
review in this engagement refuted 13 of 54 — 24%. This one refuted 3%. The
likeliest explanation is not that these findings are better: it is that I
bundled every finding from a lens into a single verifier prompt, so a verifier
facing 24 findings at once did thinner work than one facing a single claim.
**Treat the medium and low tiers as unverified leads.** The criticals below are
worth acting on, and I hand-verified three of them against the source before
writing this.

## The three I verified myself, verbatim

**`server/services/grdhe/grdheService.ts:1450-1476` — a 21 CFR Part 11 signature
verification that always returns valid.** It computes `expectedContentHash`,
never compares it, and returns `{ valid: true }`. The code says so:

```ts
    const expectedContentHash = computeHash(/* … */);
    // Note: In production, this would verify against stored hash and PKI certificate
    return { valid: true };
```

**`server/routes/real-world-evidence.ts:472-481` — fabricated pharmacovigilance
statistics, attributed to a named FDA algorithm.**

```ts
    reportingOddsRatio: 1.0 + r.percentage / 10,
    proportionalReportingRatio: 1.0 + r.percentage / 15,
    ic025: r.percentage > 5 ? 0.5 : -0.5,
    signalDetected: r.percentage > 5,
    confidence: 0.7,
```

and at `:726`, `signalDetectionMethod: 'Multi-item Gamma Poisson Shrinker
(MGPS)'` — a real FDA disproportionality method that appears nowhere in this
repository. The response carries a `regulatoryImplication` advising REMS
evaluation or a label update.

**`server/routes/leaves.js` — mounted without authentication, fabricating Part 11
e-signatures.** `server/bootstrap/register-clinical-intel-routes.ts:126` is
`app.use('/api/leaves', leavesRoutes.default)` with no `authenticateToken`,
while `/api/citations` at `:107` and `/api/source-tracer` at `:144` in the same
file carry it. There is no global auth middleware. Inside, `:206` produces a
signature "hash" as `` `hash_${Date.now()}_${Math.random().toString(36)...}` ``
and `:352` falls back to a signer of `'demo_user'`. The routes answer
`success: true` and persist nothing.

## The gap that lets all of this exist

**No gate in this repository inspects a response payload.** Four exist nearby
and none covers it: `check-fabricated-identity` matches person-identity
templates only (it reports 0 today, including against `'demo_user'`);
`check-phantom-tokens` is CSS; `check-server-error-leaks` governs what a 5xx
body may contain, and is blind to an error that never becomes a 5xx — which is
the entire "errors rendered as data" lens; `check-unbacked-tables` is about
table backing.

Nothing in CI can see a hardcoded score, a canned domain fact, or a provenance
claim that does not match the code that produced it.

## A structural pattern worth naming

Repeatedly, **the honest behaviour is implemented one layer up and defeated one
layer down.** `contradiction-engine-service.ts:1434` carries an explicit
fail-closed branch with a comment stating the rule — and all four Pass-8
detectors end `catch { log.warn(...) } return findings;` so they resolve rather
than reject, while still listing themselves in `detectionMethods`.
`evidence-search.ts:144` returns an honest 500 with a comment saying an empty
set must not read as "no evidence exists" — defeated by three
`.catch(() => ({rows: []}))` inside `gatherEvidence`. The rule is understood
here. It is being undone underneath.

## The 30 critical findings

| Location | Finding |
|---|---|
| `server/routes/real-world-evidence.ts:472-481, 715-735` | FAERS "signal detection" invents ROR / PRR / IC025 and labels the method as MGPS |
| `server/routes/real-world-evidence.ts:486-495` | A failed FAERS fetch is rendered as "No significant safety signals detected" |
| `server/routes/leaves.js:99-128 (definition), 295` | /api/leaves serves invented CMC, stability and batch-release facts with invented source document numbers |
| `server/routes/leaves.js:55-97 (templates), 234-2` | /api/leaves/:leafId returns fabricated eCTD module prose, blocks and a citation |
| `server/routes/leaves.js:205-222, 344-364` | /api/leaves accept-all fabricates a 21 CFR Part 11 e-signature record and persists nothing |
| `server/routes/leaves.js:188-203, 223-236, 337, 3` | /api/leaves apply-patch and save report success with invented change counts, writing nothing |
| `server/routes/ai-assistance.ts:283, 302-306, 339-343` | AI content verification returns a hardcoded credibility score on the real-AI success path |
| `server/routes/document-understanding.ts:664-718, 725-740, 531` | Document Understanding advertises LayoutLMv3, Donut, Table Transformer, DiT and a "Bayesian ensemble" as active models; none exists |
| `server/services/ivdrPackContent.ts:148, 157, 166, 175` | IVDR technical-documentation pack prints "No analytical validation records." / "No clinical evidence records." when the query failed |
| `server/services/export/docx-ledger-collector.ts:284-289 (audit), 327-332` | Exported DOCX ledger emits <AuditLog count="0"> and <Signatures count="0"> when the audit and signature queries fail |
| `server/services/contradiction-engine-service.ts:992, 1080, 1195, 1299 (i` | Every Pass-8 contradiction detector swallows its own failure, defeating scanProjectFull's documented fail-closed branch |
| `server/services/auditService.ts:586-596 (verifyChain) ->` | /api/decision-lineage/verify-chain reports 'INTEGRITY_FAILURE' and 'NON_COMPLIANT' against four named regulations when the audit store merely failed to initialise |
| `server/routes/decision-lineage.ts:244-262` | The compliance report's attestation and two of its five framework verdicts are emitted unconditionally, including when chain verification failed |
| `server/services/submission-package-orchestrator.ts:954-960 (catch) -> serve` | A signature lookup that throws is reported to the operator as "it was superseded or rolled back" — a §11.70 verdict about a check that never ran |
| `server/services/cognitive-ecosystem/fhir-validation.service.ts:753-754 (checkValueSet),` | Two FHIR validation rule evaluators return `{ passed: true }` from their catch — a rule that threw is recorded as complied-with |
| `server/services/tenant-export/tenant-export.service.ts:153, 164, 175, 188, 198` | Tenant data export emits row counts and an audit-log count computed from swallowed query failures |
| `server/api/cmc/workflowRoutes.ts:83-88 (schema), 617-624 ` | POST /api/cmc/ai-command generates and stores a full CMC regulatory document (incl. nitrosamine risk assessments) from a drug name alone — the caller's real inputs are silently stripped by the Zod schema |
| `server/services/intelligence/readiness-scoring-engine.ts:223-225` | Approval probability is the readiness score plus 10 — and it is the only branch that ever runs |
| `server/protocol-analyzer-service.ts:65, 109, 116, 125, 134, ` | Whole clinical protocols fabricated from regex misses, then stamped confidence_score 0.85 |
| `client/src/concept2cure/v2/surfaces/ReportEngine.tsx:127-131` | A fake power calculation, printed to one decimal with an alpha, filed into the Module 5 dossier |
| `server/routes/biotech-artifacts.ts:139-215` | Pharmacovigilance document generator invents the clinical facts of an E2B(R3) ICSR, a PSUR, a CIOMS-I and an expedited safety report |
| `server/routes/protocol_routes.ts:378-392` | /api/protocol/analyze-file fabricates the text of every PDF/DOCX upload, then analyses the fabrication |
| `server/protocol-analyzer-service.ts:109-226` | protocol-analyzer-service invents sample size, endpoints, design and arms when the protocol does not state them, and asserts FDA/EMA compliance unconditionally |
| `server/services/cerGenerationService.ts:128` | Every generated Clinical Evaluation Report records 'contraindications: None identified' for a column that does not exist |
| `server/services/audit/signedAuditExport.ts:170-188` | Signed audit-trail export asserts chainIntegrity 'intact' over rows that carry no hash at all — and HMAC-signs the claim |
| `server/services/audit/signedAuditExport.ts:337-361` | The audit row recording that an audit export happened can never be written — string into an INTEGER NOT NULL column, swallowed |
| `server/routes/part11-compliance.ts:314-341, 740-757` | POST /api/part11/audit-trail answers success:true with a hash-chained entry that is never persisted — the INSERT always violates NOT NULL |
| `server/services/grdhe/grdheService.ts:1355-1400` | GRDHE electronic signature writes the user id as the §11.50 printed name, hashes the wrong thing, and asserts an authentication that never happened |
| `server/services/grdhe/grdheService.ts:1450-1476` | verifyElectronicSignature computes the expected content hash, discards it, and returns valid:true unconditionally |
| `server/src/routes/stability.router.ts:2463-2497` | Stability sign-off manufactures the signer's printed name from an email local-part, never verifies the password it demands, and stores a fake 'hash' |

## What is NOT claimed

- **Nothing here is fixed.** This is a report.
- The medium and low tiers are leads, not findings, for the reason given above.
- Two findings were labelled unreachable by the sweep itself rather than
  inflated, and I have kept that labelling: the CMC blueprint-generator router
  has no mount, and `server/utils/generate_sap_snippet.ts` is in the
  unreferenced-modules baseline.
- One finding — the base system prompt's few-shot exemplars carrying a specific
  N, LSM and predicate number — is reported as a risk that could not be shown to
  fire. The prompt does instruct the model not to reuse them.

## The good patterns, on the record

These are the standard the rest should meet, and they are already in this
codebase: `buildFallbackSynthesis` (labels itself as a template),
`buildFallbackResult` in readinessEvaluator (fail-closed, with a written
rationale for why 0 and not 100), `SIMULATION_DISCLOSURE` on every
prediction-bearing route in `regulatory-digital-twin.ts`, the `DataGate` /
`sampleMode` pair in the MDX client (opt-in only, force-disabled in PROD
builds, standing banner, never a fallback), the nat-history-dossier guard that
makes `provenance: 'sample'` non-exportable, and `sap-generator-service`'s
refusal to state a power figure it was not given.
