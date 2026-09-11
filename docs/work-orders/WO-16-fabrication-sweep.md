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
| `server/services/audit/signedAuditExport.ts:170-188` | Signed audit-trail export asserts chainIntegrity 'intact' over rows that carry no hash at all, and over an empty result set — and HMAC-signs the claim. *(Corrected 2026-09-10, WO-16B: the `catch` at :188 honestly reports `'unavailable'` and was never a defect; the two paths that report a conclusion they did not reach are the empty set at :167 and the all-null-hash loop.)* |
| `server/services/audit/signedAuditExport.ts:337-361` | The audit row recording that an audit export happened can never be written — string into an INTEGER NOT NULL column, swallowed |
| `server/routes/part11-compliance.ts:314-341, 740-757` | POST /api/part11/audit-trail answers success:true with a hash-chained entry that is never persisted — the INSERT always violates NOT NULL. *(Verified 2026-09-10, WO-16B, and the original wording stands: `setAuditPool(pool)` was injected at boot by `register-advanced-platform-routes.ts:185`, the route was `appendAuditEntry`'s only caller and never passed an organisation id, and `audit_events.organization_id` is `integer NOT NULL` on the live catalog — so the INSERT ran in production on every call and raised 23502 into a swallowing `.catch` every time. The brief's "'always' is not established" was an over-correction, and my own first draft of this correction — "nothing in production ever called setAuditPool" — came from a grep truncated by a line limit and was wrong; the untruncated grep found the caller. The durable defect is still the fire-and-forget + success:true.)* |
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

---

## WO-16B — the Part 11 ten, executed 10 September 2026 (cortex session)

**Can this platform hold a customer's electronic signature today? Not through
any path but one.** The single conforming path — `/api/esignature/sign` →
`services/part11/signature-persistence.ts`, credentials verified by
`part11ComplianceService.verifyUserCredentials` — was not among the ten and is
untouched. Every other signature-shaped surface in this slice either recorded a
signature it had not verified (28, 30), verified nothing (29), or reported a
verdict for a check that had not run (12, 13, 14, 25, 26, 27, 10). Those are now
gone or honest. What remains true after this change: the audit_events hash-chain
trigger is still not in the deploy set, so on a canonically provisioned database
`record_hash` is null on every row and every chain surface now says
`unverified` rather than `intact`. That is the honest state, and it is a
convergence-migration decision, not a route fix.

### The thread, and the shape

Every one of the ten collapsed "could not verify" into "failed" (12) or into
"passed" (29, 25, 27, 10) or into a workflow verdict (14). The fix is a third
state, not a boolean: `server/lib/verification-outcome.ts` generalises the
`{ ran: true, … } | { ran: false, reason }` union that
`server/routes/innovation-routes.ts` shipped for ownership guards, with
`VerificationUnavailableError` playing `GuardUnavailableError`'s role and mapping
to **503** at every route. Where the output is a document, the state reaches the
document: `<AuditLog unavailable="true" reason="…"/>` is a different artefact
from `<AuditLog count="0">`, and an export that cannot record itself refuses.

### Restated, verified, and what was done

| # | Restated in my words (verified at source; catalog checked live) | Outcome |
|---|---|---|
| **29** | `verifyElectronicSignature` read the row, computed a hash it never compared, and answered `valid: true` for every non-invalidated row. It could not have compared: the stored `content_hash` was taken over `type\|id\|version\|<js now()>` and the recomputation used the database's `authentication_timestamp`, so the two would never match. Reachable at `GET /api/grdhe/signatures/:id/verify`; no client. | **Fixed by removal.** Method deleted; route answers 410 naming `/api/auth/enterprise/electronic-signature/:id/verify`. |
| **28** | `createElectronicSignature` wrote `request.userId` into `signer_name` (a user id as the §11.50 printed name), hashed no content, and stored `authentication_method` + `authentication_timestamp = NOW()` for a password it never checked ("placeholder for the actual dual-authentication flow"). Reachable at `POST /api/grdhe/signatures`; no client; `regulatory_harmonization.electronic_signatures` held 0 rows live. | **Fixed by removal.** Method deleted; route answers 410 `ESIGNATURE_ENDPOINT_REMOVED` naming `/api/esignature/sign`, the precedent `signature-write-path-single.test.ts` set. Table not dropped. |
| **30** | `POST /api/stability/studies/:id/request-signoff` destructured `password` and never used it, set `signer_name = email.split('@')[0]`, and stored `hash = \`${stage}-${Date.now()}\``. No client reference; `server/src/routes` is outside the orphan scanner's walk, so it could not have been counted either way; `stab_signoffs` held 0 rows live. | **Fixed by removal.** Route answers 410 `STABILITY_SIGNOFF_REMOVED` and says a Part 11 stability sign-off does not yet exist. The `stab_signoffs` reader (dependencies view) is untouched and honestly empty. |
| **27** | The INSERT ran on a module-level pool that `register-advanced-platform-routes.ts:185` injected at boot, the route was `appendAuditEntry`'s only caller and never passed an organisation id, and `organization_id` is `integer NOT NULL` — so on every call, in production, the INSERT raised 23502 into a swallowing `.catch` while the handler answered `success: true` with a "hash-chained entry" that lived in process memory until restart. WO-16's "always violates NOT NULL" was right; the brief's "'always' is not established" was an over-correction; and my own first correction ("setAuditPool has no caller") was wrong — a grep cut off by a line limit, caught by the typecheck when I removed the function. The durable defect is the one the brief named: fire-and-forget + success:true. | **Fixed.** Route writes on the request's tenant-pinned client with the JWT's organisation, awaits `RETURNING`, answers 201 from the row (with `recordHash: null, hashChained: false` where the database holds no chain), 503 `AUDIT_ENTRY_NOT_PERSISTED` / `AUDIT_TRAIL_STORE_UNPROVISIONED` otherwise, 400 for an entity id the integer column cannot hold. The in-memory chain, `setAuditPool` and the `/status` field that printed its head are gone. No client posts here. |
| **25** | `snapshotChainIntegrity` answered `intact` for an empty result set and for a table in which no row carries `record_hash` (the loop skipped every link), then HMAC-signed the manifest. Its `catch` answered `unavailable` and was never a defect — WO-16's row implied it was; corrected above. | **Fixed.** Four states: `intact` / `broken` / `unverified` (ran, nothing verifiable, with `hashedEntries`, `unhashedEntries`, `reason`) / `unavailable` (did not run, with `reason`). Partially-hashed chains are `unverified` too. |
| **26** | The row recording that an export happened put the export id (a string) into `entity_id integer NOT NULL` — 22P02 on every call, swallowed — after the manifest had already been sealed. "Can never be written" holds: a string never fits that column. | **Fixed.** The row is written *before* sealing (entity_id `0`, the repository's convention for "no integer entity", with the export id in `reason` and `metadata`), its id rides in the signed manifest as `exportRecord.auditEventId`, and a failed write refuses the export: `VerificationUnavailableError` → 503 `AUDIT_EXPORT_NOT_RECORDED` on both export routes. An export without an organisation id is refused for the same reason. |
| **12** | `auditService.verifyChain` returned `{ valid: false, entriesVerified: 0 }` when the store had not initialised or the query threw — indistinguishable from a broken chain — and `/verify-chain` rendered it as `INTEGRITY_FAILURE` / `NON_COMPLIANT` against four named regulations. | **Fixed.** `verifyChain` returns `ChainVerification` (`ran: false, reason` when it could not run); the route answers 503 `UNVERIFIABLE` / `UNVERIFIABLE`; `DecisionLineageService` carries `chainVerification: 'verified' \| 'failed' \| 'unverifiable'` and its export prints it. The DecisionLineage screen already renders a 503 as "Couldn't verify the hash chain". |
| **13** | `/compliance-report` emitted the attestation ("generated from an immutable, cryptographically-verified audit trail") unconditionally, and marked ICH E6(R2) and GAMP 5 `COMPLIANT` unconditionally — nothing in the report evaluates either. | **Fixed.** Chain-dependent verdicts take `COMPLIANT` / `REVIEW_REQUIRED` / `UNVERIFIABLE`; the two unevaluated frameworks say `NOT_ASSESSED` with a note; the attestation is emitted only over a verified chain and `attestationWithheld` says why otherwise. No client consumer. |
| **14** | `findActiveReleaseSignature` caught every error as "non-fatal" and returned `null`, the same value as a genuine miss, so the signed-package export refused with `signature-revoked` — "it was superseded or rolled back" — about a lookup that had thrown (the 42703 its own comment records). | **Fixed.** The lookup throws `VerificationUnavailableError`; the export refuses with a new `signature-unverifiable` (→ 503), whose detail says the signature has *not* been found revoked; the EctdCompile screen titles it "could not be checked right now". |
| **10** | The AnALedger collector swallowed every error on the audit and signature loads into `[]`, and the XML rendered `<AuditLog count="0">` / `<Signatures count="0">`. A count is a claim. | **Fixed.** `ArtifactLedger` carries `auditLogUnavailable` / `signaturesUnavailable` (reason strings; a missing table counts); the XML renders `unavailable="true" reason="…"` with no count; the DOCX export refuses (`LEDGER_UNAVAILABLE`, 503) rather than embed a ledger it cannot substantiate; the provenance summary prints the state. |

**Refuted:** none outright; three characterisations corrected (25's catch
branch, 27's "always", and 29's unreachability — it *was* reachable, via
`/api/grdhe`). **Deferred:** none of the ten. Two adjacent things were seen and
left, deliberately: `securityHealth.checkAuditChainIntegrity` grades a thrown
verification as a critical `fail` (same class as 12, not in the ten, not
touched); and the `audit_events` hash-chain trigger is absent from
`C2C_MIGRATION_FILES`, which is why every chain surface now honestly reports
`unverified` on a canonical database — a convergence decision for the schema
session, recorded here, not made here.

### Proven red before green

`tests/gates/unverified-verdicts/` — six files, 25 assertions, every one red on
the pre-fix head (`Tests 25 failed (25)`), green after. Failure is injected at
the dependency in each: a rejecting pool, a rejecting request-scoped client, or
a pool handed to the function as its parameter; nothing at a service boundary is
mocked. The one existing test that changed, `signed-package-export.test.ts`,
gained a case; the existing guard `part11-signature-post-removed.test.ts` was
kept and respected (it bans `user_agent` as a column token in that router, so
the new INSERT carries the user agent in metadata as the old code did).

### One rule the fixes had to respect

`ci:server-error-leaks` flagged the first version of these 503s: they put the
caught Postgres text in the body. The repository's containment rule (and its
`serverError` helper) is that failure detail goes to the log against the
request id, and the client gets a code, one sentence and that id. So
`respondVerificationUnavailable` in `verification-outcome.ts` is the 503
sibling of `serverError`: the operator still gets the reason with one log
lookup; a regulatory reader never receives the internal shape of a store. The
reasons that reach *documents* (the export manifest's `chainIntegrity.reason`,
the AnALedger's `reason` attribute) stay, because there the reader is the
tenant's own reviewer and the reason is what makes the absence honest.

### The gate

`npm run ci:unverified-verdicts` — `scripts/ci/check-unverified-verdicts.mjs`, a
new file with its own npm script, wired into `.github/workflows/pr-checks.yml`
beside the other hard gates. It is the first gate in this repository that reads
a response payload rather than source or schema. Its rule lives in
`scripts/ci/lib/verdict-inspector.mjs` and self-tests first: it must catch the
seven fabricated shapes this slice found and accept the six honest ones, or the
gate fails before any surface runs. Then it runs the six surface files.

---

# Verification pass — the fabricated-content lane, 16 findings, one agent each

**Added 10 September 2026 by the schema/gates session.** The Part 11 lane is
[WO-16B](WO-16B-part11-integrity-session-brief.md) and belongs to the other
session; this section covers the sixteen findings in the fabricated-content
cluster.

## Why this pass happened, and what it corrects about the sweep above

The sweep that produced `WO-16-fabrication-findings.json` refuted **4 of 135**
findings — 3%, against 24% on comparable prior work. I attributed that to my own
design: every finding from a lens went into ONE verifier prompt, so the verifier
graded a batch rather than a claim. This pass re-ran verification with **one
agent per finding**, each required to read the source, quote it, trace the mount
chain to a `file:line`, and restate the claim in its own words — then two
adversarial refuters per survivor, on distinct lenses (code-reading, and
reach/consequence).

**Result: all 16 confirmed, none refuted. But the severity distribution the
findings file asserts is wrong**, and that is the finding worth recording:

| Severity in `WO-16-fabrication-findings.json` | After per-finding verification |
|---|---|
| 16 × critical | **1 critical, 12 high, 2 medium, 1 low** |

So the sweep was reliable about **where** and unreliable about **how bad**. Nine
of the sixteen also needed their claim narrowed or their attribution corrected.
Treat the tiers in that JSON as unranked leads.

## The verdict table

| # | File | Verdict | Severity | Status |
|---|---|---|---|---|
| 1 | `routes/real-world-evidence.ts` FAERS statistics | CONFIRMED_VERBATIM | high | **FIXED** `bfacd8890` |
| 2 | `routes/real-world-evidence.ts` outage → all-clear | CONFIRMED_VERBATIM | high | **FIXED** `bfacd8890` |
| 3 | `routes/ai-assistance.ts` hardcoded credibility | CONFIRMED_VERBATIM | medium | **FIXED** (this commit) |
| 4 | `routes/document-understanding.ts` phantom models | CONFIRMED_VERBATIM | high | **FIXED** `e08cceee0` |
| 5 | `services/ivdrPackContent.ts` failed query → "no records" | CONFIRMED_VERBATIM | high | **FIXED** `345178089` |
| 6 | `services/contradiction-engine-service.ts` Pass-8 swallowing | CONFIRMED_NARROWER | medium | **FIXED** (this commit) |
| 7 | `services/cognitive-ecosystem/fhir-validation.service.ts` | CONFIRMED_NARROWER | **low** | **FIXED** (this commit) |
| 8 | `services/tenant-export/tenant-export.service.ts` | CONFIRMED_VERBATIM | high | **FIXED** `10b5bd2c2` |
| 9 | `api/cmc/workflowRoutes.ts` CMC doc from a drug name | CONFIRMED_NARROWER | high | **FIXED** (this commit) |
| 10 | `services/intelligence/readiness-scoring-engine.ts` | CONFIRMED_NARROWER | **critical** | **FIXED** `41dbc96ff` |
| 11 | `protocol-analyzer-service.ts` invented protocols | CONFIRMED_VERBATIM | high | **FIXED** `7c71de271` |
| 12 | `v2/surfaces/ReportEngine.tsx` fake power calculation | CONFIRMED_VERBATIM | high | **FIXED** `41dbc96ff` |
| 13 | `routes/biotech-artifacts.ts` invented ICSR/PSUR facts | CONFIRMED_VERBATIM | high | **FIXED** `f567da99b` |
| 14 | `routes/protocol_routes.ts` fabricated PDF text | CONFIRMED_VERBATIM | high | **FIXED** `7c71de271` |
| 15 | `protocol-analyzer-service.ts` unconditional FDA/EMA verdict | CONFIRMED_VERBATIM | high | **FIXED** `7c71de271` |
| 16 | `services/cerGenerationService.ts` contraindications | CONFIRMED_VERBATIM | high | **FIXED** `9aed6ded6` |

## Corrections to my own findings file — read these before working an entry

These are wrong in `WO-16-fabrication-findings.json` as written. I have not
rewritten the JSON, because a findings file that silently changes is worse than
one with a correction list attached:

- **#7 is not critical, it is low.** The claim ("two FHIR rule evaluators return
  `{ passed: true }` from their catch") is true of the code, and the reach is
  **zero** — affirmatively disproven at three independent hops, not merely
  unproven. No mount exists. Fixing it is still correct; prioritising it over
  #13 would not be.
- **#9 names the wrong route.** The finding, and the JSDoc it was copied from,
  say `POST /api/cmc/ai-command`. The router is mounted at `/api/cmc/workflows`.
  The verifier reproduced the defect by executing the real schema.
- **#5 attributes the strings to the wrong file.** `ivdrPackContent.ts:148/157/
  166/175` produce the silent empty result (`.catch(() => ({ rows: [] }))`); the
  "No analytical validation records." strings live elsewhere. The defect is real
  and broader than stated — the same catches feed both a count and a resource
  list.
- **#8 understates it.** Each swallowed catch feeds both `counts.<resource>` and
  `resources.<resource>`, so a failed query does not merely misreport a number.
  The verifier also found the answer already written: `tenant-full-export
  .service.ts:252-259` is the same team's fix for the same problem. Reuse it
  rather than inventing a second shape.
- **#10's stated mechanism is beside the point.** The finding says the engine's
  fallback "is the only branch that ever runs". Not established — the twin table
  has a writer — and irrelevant, because **both** branches fabricated. See
  `41dbc96ff`.
- **#6 is narrower than "every detector defeats the fail-closed branch".** The
  swallowing is real and the gate at `:1434` cannot fire for those four; the
  consequence claim needed narrowing.

## Sites found during the fixes that no finding named

Each was in a file a finding pointed at, and none was in the list:

- `real-world-evidence.ts` never checked `response.ok`, so an openFDA 404, 429
  or 500 reported **zero reports on the success path** without reaching the
  catch. Also `demographicDistribution` and `reportsByYear` returned `{}` while
  never being computed, and `GET /health` asserted eight hardcoded `true`s
  including `hipaaCompliant` and three analytics with no implementation.
- `submission-readiness-twin-service.ts:912` was a **second** fabricated
  approval-probability formula, independent of the one the finding named.
- `protocol_routes.ts` `POST /optimize-deep` produced "recommendations" by fixed
  arithmetic on defaults, with rationales citing trial and benchmark evidence it
  never read, while destructuring `prediction` and `benchmarks` and using
  neither. Disabled (501), following the `/generate` precedent in the same file.
- `protocol-analyzer-service.ts` also asserted `global_compliance: {FDA: true,
  EMA: true, ...}`, a monitoring determination, and invented geographic regions.
- `protocol-optimizer-service.ts` stamps `confidence: 0.9 / 0.8 / 0.7` on
  rule-based recommendations. **Still open** — the constants are per-rule and
  the field name asserts a computed confidence.

## Open, in the order I would take them

**#13 `biotech-artifacts.ts`** is the one I would do next: it invents the
clinical facts of an E2B(R3) ICSR, a PSUR and a CIOMS-I — `seriousness ||
'non_serious'`, `causality || 'possible'` — which are regulated safety-report
content. Then **#5** and **#8** (both are the same "failed query rendered as an
empty result" shape, and #8 has a fix to copy), then **#4**, **#16**, **#9**,
**#3**, **#6**, and **#7** last on reach.


---

## Second-pass corrections, 10 September (after the adversarial verification completed)

**Finding 1 — I fixed it with the wrong engine, and corrected it.** `bfacd8890`
replaced the fabricated FAERS statistics with a real implementation, but wired
the route to `pharmacovigilance-knowledge.ts::detectSafetySignal` when
`stats/signal-disproportionality.ts::screenSignalPanel` is the canonical one —
its own test suite, five existing consumers, a real BCPNN IC025 and a real
Gamma-Poisson EBGM where the other's docstring admits to "a deterministic
approximation of the MGPS shrinkage". So the first fix resolved the fabrication
and entrenched the duplication. Corrected in `d26cf7dec`. **The lesson is the
one this whole work order is about: "a real implementation exists" is not the
same question as "which one is canonical", and I answered the first and assumed
the second.**

**Finding 13 was worse than recorded, and the sweep missed the auth gap.** The
verification found `/api/biotech-artifacts` had NO authentication and was the one
mount in `register-document-routes.ts` without `authenticateToken`. Executing the
previous router proved the rest: `POST /pv/icsr` with an EMPTY BODY returned
HTTP 200 and an E2B(R3) XML carrying `<serious>2</serious>` — non-serious, the
code that decides whether a 15-day expedited report is owed — addressed to
EudraVigilance. Fixed in `f567da99b`.

**Finding 5's file attribution was wrong**, as the verifier said. The swallowing
catches are in `ivdrPackContent.ts`; the `"No analytical validation records."`
strings are in `docxGenerator.ts` and `ivdrPackHtml.ts`. The fix spans all three.

**Finding 8's answer already existed in the repo.** `tenant-full-export.service
.ts` records `coverage.tablesFailed` rather than folding a failure into a count.
Copied rather than reinvented.

### Still open in this lane, in order

**#4** `document-understanding.ts` (phantom models advertised as active) ·
**#16** `cerGenerationService.ts` · **#9** `api/cmc/workflowRoutes.ts` (note the
route path in the JSON is wrong — it is `/api/cmc/workflows`) · **#3**
`ai-assistance.ts` · **#6** `contradiction-engine-service.ts` · **#7**
`fhir-validation.service.ts` (last — reach is zero).

Plus one found while fixing and not yet addressed: `protocol-optimizer-service.ts`
stamps `confidence: 0.9 / 0.8 / 0.7` on rule-based recommendations, where the
field name asserts a computed confidence and the values are per-rule constants.


---

## All sixteen closed — 11 September 2026

Every finding in the fabricated-content lane is now fixed, with a red-first test
for each. The last three: #9 (CMC ai-command), #6 (contradiction Pass-8) and #7
(FHIR rule engine).

**Still open, found while fixing and not yet addressed:**
`server/protocol-optimizer-service.ts` stamps `confidence: 0.9 / 0.8 / 0.7` on
rule-based recommendations. The values are per-rule constants and the field name
asserts a computed confidence. Smaller than anything above, and real.

**Not a finding in this file, but the largest thing this lane surfaced:** the
`audit_events` hash chain was on no applier, so on a canonically provisioned
database no audit row carried a `record_hash` and every Part 11 chain surface
reported `unverified`. Fixed by adding
`db/migrations/20260222_audit_events_hash_chain.sql` to `C2C_MIGRATION_FILES`
with its backfill removed — a backfilled chain hashes history from its current
contents and so attests to nothing, and the backfill's UPDATE would have raised
P0A01 against the already-deployed no-update trigger. Verified end to end on the
canonical database.
