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

---

# WO-16C — the 104 unverified findings, one agent each plus an adversarial panel

**Run by:** the cortex / WO-16B session · **11 September 2026** · **Verified at head `c5e770288`**

**Sixty-five of the 104 describe something true about the code, but only sixteen
have any consequence a customer can reach, none is critical, and the one that
would have changed the pilot answer — an audit-trail entry whose actor the
caller could name themselves — is fixed in this pass.**

**Update, same day: all sixteen are now fixed.** The section below was written
as a backlog, which is what WO-16C asked for. The product owner then asked for
the backlog to be worked rather than filed, so the thirteen that remained were
implemented the same way as the first three — one agent per finding, each
required to prove its test red before the change and green after. The ranked
tables are kept as written, because the ranking is the evidence for the order
they were taken in; the **Fixed in this pass** table below now lists all sixteen,
and the recommended-order section that followed it has been replaced by what
each fix actually turned out to be.

## What was run

One verifier agent per finding, then **two adversarial refuters per survivor on
distinct lenses** — one re-reading the code, one attacking reach and consequence
— each told to default to `refuted: true` unless it could positively confirm the
claim from source it had read itself. 104 verifiers and 128 refuters, 232 agents,
about 26M subagent tokens.

The refuters were not decoration. They refuted 21 findings outright, split on 48
more, and where they let a finding stand they still capped its severity: the
final rating for every finding is the verifier's, lowered to the lowest rating
any refuter gave it. That rule is why the numbers below are so much smaller than
the verifier pass alone produced. A verifier-only run would have reported 3
criticals and 22 highs; after the panel there are none and six.

## The answer in numbers

| | Findings |
|---|---|
| Not a defect at all | **39** |
| — refuted by both refuters | 21 |
| — one refuter refuted, the residue has no consequence | 16 |
| — already fixed (your lane, `440df4a4e`, `f567da99b`) | 2 |
| Real, and something reaches a customer | **65** |
| — high | 6 |
| — medium | 10 |
| — low (true, but dead, unrendered, or cosmetic) | 49 |
| — critical | 0 |

**The sweep's tiers do not survive contact with the code, in both directions.**

| Sweep tier | → high | → medium | → low | → nothing |
|---|---|---|---|---|
| high (45) | 6 | 5 | 26 | 8 |
| medium (43) | 0 | 3 | 21 | 19 |
| low (16) | 0 | 2 | 2 | 12 |

Two of the sweep's `low` entries are worth more than most of its `high` ones, and
26 of its 45 `high` entries are dead code or a prompt instruction nothing renders.
The one structural reason, visible in the table: **39 of the 65 live findings
have no `client/src` caller at all.** The sweep tiered on how alarming a literal
looked in isolation, not on whether anything reads it.

## Does any of it change the pilot answer?

No — with one exception that is now closed, and one caveat that is yours.

**#67 would have.** `POST /api/part11/audit-trail` took the actor's printed name
from `req.body.userName` and wrote it onto a persisted, hash-chained
`audit_events` row flagged `regulatory_significant`. Every other identity field
on that INSERT came from the authenticated principal; only the field a reviewer
reads when asking *who did this* came from the caller. An audit trail in which a
tenant member can file an entry under a colleague's name is not an audit trail,
which is the same sentence you wrote about the chain trigger. It is fixed
(`bb5ec75e3`), derived now by the same rule the sibling writer to the same table
already used. This one was mine to catch in WO-16B and I did not: I rewrote that
handler and never noticed the name came from the body while everything around it
came from auth.

**The caveat, now closed at both ends.** Nothing in these 104 touches the
`audit_events` hash-chain trigger; you took that and landed it while this panel
was running. The two findings meet at the same row, so it is worth saying how:
your change makes the chain over `audit_events` verifiable, and #67 was writing a
caller-asserted actor name into that same chain. A verifiable chain over a
misattributed row attests only that the misattribution was not altered later.
Both halves had to be true, and now are.

None of the remaining five highs blocks a pilot on its own. They are wrong
numbers and unearned labels on screens, not corrupted records.

## Fixed in this pass

All sixteen findings that carry a consequence — every high and every medium —
are fixed. Each survived both refuters, each is outside your §5 file list, and
each was proven red before green, with the failure injected at the dependency
wherever there was a dependency to fail.

| # | Final | What it was | Commit |
|---|---|---|---|
| 67 | high | The Part 11 audit row's printed actor came from the request body | `bb5ec75e3` |
| 48 | high | The endpoint recommender asked a model to *write* the FDA/EMA guidance it then cited | `bb5ec75e3` |
| 71 | high | Every decision-lineage export certified five frameworks nothing evaluates | `ce703ea54` |
| 45 | high | An unscored statistical dimension became 50 — including an honest 0 | `0671cb461` |
| 59 | high | Three constants in the dossier-filed judgment table; "adequate" was unreachable | `3f86d566e` |
| 70 | high | `cfr11Compliant: true` on every node; a pending approval stamped with the export's own build time | `061801441` |
| 42 | medium | The work board read "0 open, 0 blocking" when a source query failed | `394b14fc1` |
| 58 | medium | Unmeasured readiness dimensions emitted as "unknown = neutral" 50 | `c02159e05` |
| 63 | medium | A regulatory screen run on the literal string `Section <id>` | `72c9ac244` |
| 65 | medium | IND Readiness graded a protocol it never read | `14b03f7d9` |
| 72 | medium | The chain monitor logged "all links intact" over rows carrying no hashes | `d6aaf61d2` |
| 99 | medium | A Refuse-to-File gauge painted 0% over a recorded risk of 90 | `1521c31dc` |
| 107 | medium | Every real audit action displayed as a read; a chain link shown as a signature | `50b93b0fe` |
| 109 | medium | Every Activity row attributed to "System" | `48a49025c` |
| 124 | medium | Deterministic rules stamped with invented confidence percentages | `423db8730` |
| 133 | medium | A PDEV approval returned success identical to a lost Part 11 audit row | `57d7bbfd8` |

**Four of the thirteen turned out to be worse than the panel had established,
and the implementing agents found it by reading rather than trusting the brief.**

- **#59** — because the effect-size dimension was hardcoded `marginal`, the
  aggregate could never reach `adequate`. The `adequate / proceed / low` path and
  its confidence branch were dead code, so *every* design this surface ever filed
  into the dossier read "marginal / proceed_with_conditions / moderate",
  including a well-powered one.
- **#70** — `workflow_approvals.completed_by` exists and was ignored, so a
  DECIDED approval was also attributed to `assignedTo[0]` rather than to the
  person who actually completed it, not only a pending one.
- **#109** — `ownerName` is not a column on `c2c_milestones` at all, so the
  fallback fired on every row, not merely on rows with a missing actor. The fix
  goes further than the finding and resolves the real creator from `created_by_id`.
- **#133** — the pre-existing sibling test's audit mock resolved `undefined`,
  which would have let the fix pass green without proving anything. The agent
  corrected the mock in the same change.

**Two corrections against the verification pass, both in its favour.** #72's
agent showed the brief was wrong that a NULL hash poisons the next comparison —
the old code produced the same skip, so the set of broken links is byte-identical
before and after and only the counting and the verdict changed, which is why
seven pre-existing tests stayed green. #59's agent declined to touch
`fragilityIndex`, because both refuters had narrowed it out: it derives from the
real breakpoint search and is a redundant label on a computed margin, not a
fabricated number.

**#48 is worse than the sweep said, and the refuters found why.**
`loadRegulatoryGuidance` caches a file only when its parsed content has
`.indication` and an array `.guidance`; both files under `regulatory_data/` are
top-level arrays. The cache is therefore never written, `foundGuidance` is always
false, and the model-generated branch was not a fallback — it was the only source
this service had. The array is load-bearing: `classifyEndpointBasis` returns
`regulatory_recommended`, the highest basis there is, for any endpoint with a
non-empty `regulatory_guidance`, so an invented citation outranked endpoints
backed by the real corpus. I confirmed the empty-cache mechanism by reading the
loader and the two data files myself before accepting it.

**#71 contradicted your own WO-16B fix.** `a668d73e2` made the compliance report
on that router say `NOT_ASSESSED` for ICH E6(R2) and GAMP 5, because no check
evaluates them. The export from the same router went on asserting all five
unconditionally — and the export is the file a reviewer keeps. Since a hardcoded
constant has no dependency to fail, red-before-green took two steps: a throwaway
probe asserting the pre-fix output passed against the old code, then failed
against the new one and was deleted.

## The ranked backlog — everything with a consequence

Ordered by severity, then by whether the panel split, then by reach. "1 of 2
refuted" means one refuter would throw the finding out entirely; those rows are
ranked below an equal-severity row both refuters let stand.

| # | Sweep said | Now | Panel | File | Reach | Fix | What a customer actually gets |
|---|---|---|---|---|---|---|---|
| 59 | high | **high** | both held | `client/src/concept2cure/v2/surfaces/Biostatistics.tsx` | mounted, 4 client callers | small-local | On the Biostatistics screen's document preview (Biostatistics.tsx:898) and in the document the customer files into the dossier under Module 5 (toast at line 699: "filed to the dossier under Module 5"), the Sample Size Rationale carries "- **Confidence Level**: moderate (64/100)" (or low 42/100) and… |
| 70 | high | **high** | both held | `server/services/workflow/DecisionLineageService.ts` | mounted, 2 client callers | medium | An authenticated user opening the DecisionLineage surface sees a '21 CFR §11' badge on every node of every trail, and any pending approval shown as performed by its first assignee at the moment the page loaded. Clicking XML/CSV/JSON under 'Export for the audit package' downloads a file headed 'Deci… |
| 71 | high | **high** | both held | `server/services/workflow/DecisionLineageService.ts` | mounted, 2 client callers | small-local | A signed-in customer on the Decision Lineage surface exports a lineage record and downloads a file that, regardless of entity, org, or whether any check ran, states: CSV — "# Compliance: FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2) GCP, PMDA ERES Guidelines, GAMP 5"; XML — the same line inside a com… |
| 45 | high | **high** | both held | `server/services/statistical-defensibility-service.ts` | mounted, 1 client caller | small-local | On the Biostatistics workbench (surface 'biostat-workbench'), after entering only phase/indication/design/primary-endpoint/sample size, the customer sees a large "Overall score" number, a Rating chip (strong/adequate/weak/deficient) and a Reviewer-risk chip (BiostatWorkbench.tsx:492-494), under a c… |
| 67 | high | **high** | both held | `server/routes/part11-compliance.ts` | mounted, 1 client caller | small-local | An authenticated member of a tenant who calls POST /api/part11/audit-trail with `userName: "<anyone>"` creates a persisted, hash-chained, regulatory_significant audit_events row attributed to that printed name. The customer then sees that forged actor as the "actor" column/detail in the v2 Admin >… |
| 48 | high | **high** | both held | `server/services/endpoint-recommender-service.ts` | mounted, no client caller | small-local | An API-key integrator calling GET /api/v1/endpoints/recommend?indication=... receives, for any endpoint whose name the model happens to echo as a key, a `regulatory_guidance` array of model-invented `{authority:'FDA'\|'EMA'\|..., document_name:'<invented title>', guidance_text:'<invented quote>'}`… |
| 107 | medium | **medium** | both held | `client/src/concept2cure/mdx/hooks/usePathwayTabsData.ts` | mounted, 4 client callers | small-local | On the Audit tab of the device pathway surface (510(k)/PMA/IVD/CER), under the heading "Serves the 21 CFR Part 11 audit trail" and a "Tamper-evident · SHA-256 · N events" badge, every audit row is chipped with a kind the client invented from the action string. Because the server writes the canonica… |
| 42 | high | **medium** | both held | `server/services/unified-work/unified-work-view.ts` | mounted, 3 client callers | small-local | On the Workbench "Tasks and reviews" page (v2 surface 'device-tasks'), the header line "+N not on this board: X schedule milestone(s), Y tracked filing(s) · Z blocking" is computed from summary.bySource.schedule + summary.bySource.filing and summary.blocking. If the project_tasks or estar_submissio… |
| 58 | high | **medium** | both held | `server/services/orchestration/readiness-engine.ts` | mounted, 3 client callers | medium | On the AnaCommand pre-submission gate panel (AnaCommand.tsx:712-713) a customer whose project has no validations and no CMC rows sees 'compliance 50' and, with no routed/promoted items, 'consistency 50' as labelled subscores, with no marker that neither dimension was assessed. On both the Orchestra… |
| 99 | medium | **medium** | both held | `server/services/shadow-review/shadow-review-service.ts` | mounted, 3 client callers | medium | On the "Shadow review" surface (Review & govern → Shadow review), for a lens whose latest complete run recorded no rtf/format-dimension findings, the "Administrative gate — will they accept the filing?" card shows "0%", an empty fill bar and the words "low risk"; if there are also no critical/major… |
| 124 | low | **medium** | both held | `server/services/orchestration/recommendation-engine.ts` | mounted, 3 client callers | small-local | On the AnA Command screen ("Next best actions" column), every recommendation card shows an unlabeled percentage chip — "95%" beside "X is in review status but has never been validated", "90%" beside "Task Y is blocked", "70%" beside "Z has not been updated in over 30 days" — that is a constant type… |
| 133 | low | **medium** | both held | `server/services/pdev/pdev-workflow-bridge.ts` | mounted, 3 client callers | medium | Conditional, but concrete when it fires — nothing is invented, a required record silently goes missing. Normal operation: no difference; the audit row lands and the customer sees nothing. When either audit store is down, unconfigured, or rejects the row (pool exhausted, RLS WITH CHECK failure, conn… |
| 109 | medium | **medium** | both held | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` | mounted, 2 client callers | small-local | On the device workstream's Submissions surface, selecting a package renders an "Activity" list in the detail drawer where the actor column reads "System" for every milestone row (Workbench.tsx:648), regardless of who created the milestone (createdById is on the row but never resolved to a name). Th… |
| 63 | high | **medium** | both held | `server/routes/regulatoryRoutes.ts` | mounted, no client caller | small-local | Nothing on any product screen — no client code calls the path. An authenticated user or integration that requests GET /api/regulatory/risk/<anything> (or /api/regulatory/regulatory/risk/<anything>) receives JSON `{ sectionId, analysis }` where `analysis` is a fixed text titled 'Regulatory Requireme… |
| 65 | high | **medium** | both held | `server/routes/analytics-routes.ts` | mounted, no client caller | small-local | A logged-in customer (or an integration) that POSTs any protocol text to /api/analytics/demo-analysis receives JSON in which `ind_analysis.strengths` states the protocol has "Well-defined primary and secondary endpoints", "Clear inclusion/exclusion criteria", "Appropriate statistical analysis plan"… |
| 72 | high | **medium** | both held | `server/services/audit/chainIntegrityMonitor.ts` | conditional, 1 client caller | small-local | No screen, no generated document, no export and no persisted record carries this verdict — that is the honest answer, and it is why this is not critical. What a customer can actually get: an authenticated GET to /api/audit/chain-monitor/status (or a POST to .../check) returns `{"success":true,"data… |

## What the fixes turned out to need

The backlog above proposed an order; this is what each one actually was once
implemented. The pattern across all sixteen is narrower than "delete the lie":
in ten of them the code read real input and only its claims about provenance
were false, so the proportionate fix was to make it describe itself truthfully.

**A value nothing computed is now null, with a reason, and the aggregate is
renormalised over what was assessed.** #45, #58, #59, #99 and #124 all had the
same shape: a literal standing in for a measurement, then carried into a mean or
a sort key where it did work only a real number may do. The trap in each was the
obvious repair — turning the constant into a 0 deflates the aggregate as surely
as 50 inflates it — so each fix drops the unassessed dimension out of both the
numerator and the denominator, and names it in an `unassessed` list.

**A failed read is now distinguishable from an empty one.** #42, #72 and #133
reuse the WO-16B third state verbatim (`{ran: true, …} | {ran: false, reason}`,
`persisted`, `unverified`), which is the point of having established it: three
separate agents reached for the same vocabulary without coordinating.

**An unrecorded actor is now unrecorded.** #70, #107 and #109 each substituted a
plausible name — `'system'`, `'System'`, an assignee, a category — for something
the record did not say. Two of the three could resolve the real actor once
someone looked: #109 from `created_by_id`, #70 from `completed_by`.

**Two surfaces had nothing truthful to say and were removed or withheld.** #63's
handlers are deleted, because a screen fed a literal placeholder has no honest
version. #65 keeps its real reference material, relabelled as standing guidance,
and returns `NOT_ASSESSED` for the verdict it was never entitled to.

Five findings widened a shared type (`LineageNode.performedBy`,
`Recommendation.confidence`, `ReadinessAssessment.scores`, `AuditKind`,
`UnifiedWorkSummary`). Every consumer was updated in the same change and
`tsc --noEmit` is clean across all thirteen together.

## What I did not do, and why

- **#30 `ai-assistance.ts` is yours** (§5), and you have already closed it —
  `parseCredibilityScore` now reads the model's own rating and `credibilityBasis`
  carries the third state. Recorded here only because both refuters independently
  found the part the sweep missed, and it is the more interesting half: the
  *real-AI* branches hard-coded `credibility: 85` and returned it with
  `isRealAI: true` and `fallback: false` — no signal at all — while the prompt at
  line 283 explicitly asked the model to rate credibility 0–100 and the answer was
  dropped into `analysis`. The fallback 75 the sweep named was the
  better-behaved of the two, because at least it admitted it was a template.
- **The 49 low findings are real and I am still not proposing work on them**,
  now that the sixteen above are closed. Almost all
  are one of: a route with no client caller, a prompt instruction with no rendered
  effect, or a defensive fallback no reachable code path can trigger. They belong
  in the record, not in a sprint.
- **The 39 refuted are written down with the source that refutes them**, below.
  Refuted is a result. Several were refuted because a hop the verifier asserted
  does not exist in source — which is the same failure mode the original sweep
  had, caught here by making a second agent look for the hop itself.

## Everything that is true but has no consequence

Real as a statement about the code; dead, unrendered, or unreachable in practice.

| # | Sweep said | Panel | File | Why it is low |
|---|---|---|---|---|
| 43 | high | both held | `server/services/ana/AnaToolExecutor.ts` | `resolveCapabilities` (server/services/entitlements/resolver.ts:105, 111) substitutes the literal tier `'standard'` whenever the `SELECT tier FROM organizations` query throws (caught at 112… |
| 85 | medium | both held | `server/services/working-memory.ts` | In `buildMemoryContextForChat` the working-memory layer can only ever be labelled 'ok' or 'empty': a failed `conversation_working_memory` read is swallowed at source (`getLatestWorkingMemor… |
| 82 | medium | both held | `server/routes/c2c/project-access.ts` | verifyProjectAccess (server/routes/c2c/project-access.ts:273-288) wraps its access lookup in a bare, unbound, non-logging `catch { return false; }`. When loadProjectAccessRow throws for an… |
| 30 | high | both held | `server/routes/ai-assistance.ts` *(yours)* | In POST /api/ai-assistance/verify (server/routes/ai-assistance.ts:254), the returned `credibility` is a literal constant on all three branches and `sources_verified` is always just `sources… |
| 31 | high | both held | `server/routes/document-understanding.ts` | POST /api/document-understanding/analyze (and /extract-tables, /extract-form-fields) returns, for a file read only as UTF-8 text and never rendered, a `bbox` on every element (x fixed at 72… |
| 33 | high | both held | `server/api/cmc/blueprintRoutes.ts` | POST /api/cmc/blueprint/generate-blueprint returns three literal arrays as data.workflows, data.compliance and data.risks, with no field marking them static. Narrowly: createWorkflowTemplat… |
| 37 | high | both held | `server/api/ai/routes.ts` | POST /api/ai/analyze-compliance (server/api/ai/routes.ts:299), mounted unconditionally behind authenticateToken at server/bootstrap/register-core-routes.ts:47-48, returns an unqualified 0-1… |
| 46 | high | both held | `server/services/sentenceTraceabilityService.ts` | In mapBatchToSources, the model is shown only a 300-char truncation of each real source (sentenceTraceabilityService.ts:436) and asked to return a "relevant excerpt from source" plus a conf… |
| 51 | high | both held | `server/routes/cerv2-ai-routes.ts` | At c5e770288 the two LLM system prompts in server/routes/cerv2-ai-routes.ts — :285 (POST /api/cerv2/ai/suggest) and :737 (POST /api/cerv2/ai/analyze-section) — instruct the model to cite ap… |
| 52 | high | both held | `server/api/cmc/routes.ts` | POST /api/cmc/generate-enhanced-blueprint (server/api/cmc/routes.ts:1916-1968) validates only `section`. When `drugSubstance`/`drugProduct` are omitted it inserts the literal strings "Drug… |
| 64 | high | both held | `server/services/regulatory-intelligence-service.ts` | generateSpecialConsiderations (server/services/regulatory-intelligence-service.ts:532-577) returns hardcoded 2-3-sentence arrays selected only by exact match on the `phase` string and a sub… |
| 76 | medium | both held | `server/services/sap-generator-service.ts` | In server/services/sap-generator-service.ts the SAP body template hardcodes two trial-design pre-specification claims that no caller can supply or suppress: line 174 emits "Stratification f… |
| 86 | medium | both held | `server/routes/c2c/context-intelligence.ts` | GET /api/concept2cure/compliance (server/routes/c2c/context-intelligence.ts:785-810) wraps its `compliance_tracking` SELECT in a bare `catch {}` (:801-803) that discards the error and falls… |
| 89 | medium | both held | `server/services/figureGenerationService.ts` | With OPENAI_API_KEY set, every figure reachable through the only caller is generated from zero source data — audit-services.ts:42-54 forwards `dataSource`/`options`, which FigureGenerationR… |
| 95 | medium | both held | `server/services/biostatistics-judgment/assumption-fragility.ts` | In assessEffectSizeFragility (server/services/biostatistics-judgment/assumption-fragility.ts:119-155) the figure presented to the caller as "approximate power" after a 20% effect-size reduc… |
| 96 | medium | both held | `server/services/figureGenerationService.ts` | `computeFigureConfidence` (server/services/figureGenerationService.ts:561-579) computes `FigureSpec.confidence` — declared at :37 as "0-1 confidence in data accuracy" — from a 0.5 base plus… |
| 94 | medium | already fixed 41dbc96ff | `server/services/innovation/submission-readiness-twin-service.ts` | Nothing today. Because the only writer of innovation.readiness_twin_assessments is behind an unmounted router, every AnA "how ready are we to file?" query returns status not_assessed ("No r… |
| 39 | high | 1 of 2 refuted | `server/services/governed-decision-repository.ts` | recordGovernedDecisionSync (server/services/governed-decision-repository.ts:243-263) returns a GovernedDecisionReference before the decision_records INSERT is attempted, and every failure o… |
| 44 | high | 1 of 2 refuted | `server/services/realTimeValidationService.ts` | In server/services/realTimeValidationService.ts, `analyzeContentWithAI` catches any failure of the gateway call or of `JSON.parse` and returns the literal `{ issues: [], suggestions: [] }`… |
| 57 | high | 1 of 2 refuted | `server/services/shadow-review/shadow-review-service.ts` | In the branch where the model's returned rtfRiskScore/crlRiskScore exceeds the findings-derived aggregate, shadow-review-service.ts:162-163 persists the model's own number unchanged (:184)… |
| 112 | medium | 1 of 2 refuted | `server/services/report-os/lineage-trace-report.ts` | server/services/report-os/lineage-trace-report.ts:245 renders the literal 'system' in the Actor column of the Evidence & Provenance Trace Report whenever concept2cure_provenance_events.acto… |
| 40 | high | 1 of 2 refuted | `server/services/ana/lineage-dossier.ts` | In server/services/ana/lineage-dossier.ts the six satellite loaders (271-274, 302-305, 358-361, 392-395, 468-471, 507-510) catch every error — not only the 42P01 missing-table case they doc… |
| 61 | high | 1 of 2 refuted | `server/services/regulatory-precedent-intelligence/seeds/crl-trigger-patterns.ts` | Two things stand, and neither is the sweep's original "invented rates drive a tenant's readiness verdict". (1) The fabricated statistics in crl-trigger-patterns.ts and advisory-committee-pa… |
| 104 | medium | 1 of 2 refuted | `server/services/ana-ri/mdx-explain-audit-row.ts` | `renderExplainer` invents the actor when the row did not record one. `server/services/ana-ri/mdx-explain-audit-row.ts:171` defaults a missing `new_values.actorKind` to the literal `'human'`… |
| 73 | high | 1 of 2 refuted | `server/routes/audit-trail-routes.ts` | `formatAuditRow` (server/routes/audit-trail-routes.ts:132-160), which shapes the response of GET /api/audit/logs, /api/audit-logs and /api/audit (lines 178, 200, 519 — all mounted unconditi… |
| 108 | medium | 1 of 2 refuted | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx` | In DecisionLineage.tsx the third lead branch — taken whenever the adopted graph has no node with action 'locked' and no pending-signature decision node (lines 115-116) — renders at line 168… |
| 32 | high | 1 of 2 refuted | `server/api/cmc/blueprintRoutes.ts` | On the success branch of generateAIBlueprint (server/api/cmc/blueprintRoutes.ts:325-373) six fields of the returned blueprint are compile-time constants that vary with nothing: sections.dru… |
| 34 | high | 1 of 2 refuted | `server/routes/manufacturing-routes.ts` | GET /api/manufacturing/ai/review (server/routes/manufacturing-routes.ts:768-833) and POST /api/manufacturing/ai/simulate-deficiency (839-863) are mounted unconditionally behind authenticate… |
| 35 | high | 1 of 2 refuted | `server/src/services/ai/stability.ts` | In `aiRootCauseOOS` the catch branch (server/src/services/ai/stability.ts:233-251) returns four `probableCauses` and four `recommendations` that are string literals independent of the `oosD… |
| 36 | high | 1 of 2 refuted | `server/api/ai/routes.ts` | In `server/api/ai/routes.ts`, the `section === 'section_completion'` branch of `POST /api/ai/generate-boilerplate` (lines 426-429) picks one entry of the matched CTD template's `criticalFla… |
| 38 | high | 1 of 2 refuted | `server/services/governed-decision-repository.ts` | The third-state collapse is real and every reach hop checks out in source, but no customer-facing surface consumes it. Concretely: on a deploy-migrate production database where decision_rec… |
| 41 | high | 1 of 2 refuted | `server/services/ana/since-last-visit.ts` | getSinceLastVisit swallows failures from exactly two live reads — getDeadlineRadar (since-last-visit.ts:168-172; deadline-radar.ts:171 propagates a failed `regulatory_obligations` read) and… |
| 50 | high | 1 of 2 refuted | `server/routes/c2c/ai-editing.ts` | On both POST /ai/edit-section and POST /ai/templates/:templateId/generate, text retrieved from the tenant's own lumen_data_atoms is concatenated verbatim (truncated to 600 / 500 chars) into… |
| 53 | high | 1 of 2 refuted | `server/routes/cortexQueryRoutes.ts` | In handleAdvisoryMode (server/routes/cortexQueryRoutes.ts:382-459), all three structured fields of results.advisory are manufactured rather than read from the model, and nothing in the payl… |
| 54 | high | 1 of 2 refuted | `server/services/intelligence/readiness-scoring-engine.ts` | In server/services/intelligence/readiness-scoring-engine.ts:181, `ModuleScore.gapCount` (declared `readonly gapCount: number` at :48) is not a count of anything: it is a constant per score… |
| 66 | high | 1 of 2 refuted | `server/routes/cer-routes.ts` | At server/routes/cer-routes.ts:246-274, generateCERNarrative builds a single user prompt whose only inputs are caller-POSTed FAERS aggregates — report count, manufacturer/generic strings th… |
| 74 | high | 1 of 2 refuted | `server/services/grdhe/grdheService.ts` | server/services/grdhe/grdheService.ts:69-72 defines `getCurrentUserId()`, which takes no request argument and returns `process.env.CURRENT_USER_ID \|\| 'system'`. `CURRENT_USER_ID` is set n… |
| 75 | medium | 1 of 2 refuted | `server/routes/cortexAdvisoryRoutes.ts` | `server/routes/cortexAdvisoryRoutes.ts:422` emits `confidence: 85` — an unlabelled integer literal with no input and no computation — as a field of the success response of GET /api/cortex/a… |
| 77 | medium | 1 of 2 refuted | `server/services/knowledgeGraphService.ts` | server/services/knowledgeGraphService.ts sets `confidence` to a hard-coded per-heuristic literal on every edge it manufactures — 0.6 for a regex-pattern match (:267), 0.5 for same atom_type… |
| 79 | medium | 1 of 2 refuted | `server/api/enterprise/routes.js` | In `performLocalTextEnhancement` (server/api/enterprise/routes.js:397-400), when the request body's `improvements` array contains the literal string `'regulatory compliance'`, the function… |
| 84 | medium | 1 of 2 refuted | `server/src/services/reg/evidence.ts` | In `server/src/services/reg/evidence.ts`, each of the three evidence queries in `gatherEvidence` ends in `.catch(() => ({ rows: [] }))` (:24, :38, :52), so once the module-scope pool has in… |
| 88 | medium | 1 of 2 refuted | `server/services/contradiction-consequence-service.ts` | In server/services/contradiction-consequence-service.ts the review_thread, harmonization_rewrite and dossier_review_attachment consequences have no persistent effect other than a single INS… |
| 90 | medium | 1 of 2 refuted | `server/routes/planner-routes.ts` | POST /api/planner/generate-sap (server/routes/planner-routes.ts:100-167) sends the model a required-section outline containing "Sample size calculation and power" (:119) and, when csrContex… |
| 91 | medium | 1 of 2 refuted | `server/services/statistical-continuum-service.ts` | In `generateAnalysisSpecs`, the ADaM-specification user prompt asserts a trial duration to the model that no input supplied: statistical-continuum-service.ts:254 renders `Duration: ${protoc… |
| 92 | medium | 1 of 2 refuted | `server/routes/ana-cortex-ft.ts` | POST /api/ana-cortex-ft/inference and POST /api/ana-cortex-ft/generate-section attach invented numeric quality signals to citations that were never verified. Every bracketed string matching… |
| 97 | medium | 1 of 2 refuted | `server/services/regulatory-graph/standards-applicability.service.ts` | Every entry `recommendApplicability` emits carries a `confidence` number written as a bare literal into the rule branch that produced it — 22 literals across the 9 rules in `RULES` (277-287… |
| 118 | low | 1 of 2 refuted | `server/utils/document-generator.js` | In server/utils/document-generator.js the `pdf` (95-99) and `docx`/default (122-127) branches of generateDocumentation write the raw LLM text verbatim to `<id>.pdf` / `<id>.docx` with no en… |
| 127 | low | 1 of 2 refuted | `server/api/ai/routes.ts` | In POST /api/ai/generate-boilerplate (server/api/ai/routes.ts:386), the `section === 'section_completion'` branch at :426-429 selects one entry of the matched CTD template's `criticalFlags`… |
| 116 | medium | 1 of 2 refuted | `server/services/automation/scheduled-jobs.ts` | On any deploy with REDIS_URL set, two scheduled handlers in server/services/automation/scheduled-jobs.ts run no query and return a fabricated success: handleDataFreshnessCheck (:81-110) ret… |

## Not a defect — refuted, already fixed, or no consequence

Each row names the source that closes it. Where two refuters are quoted, both
reached the conclusion independently on different lenses.

| # | Sweep said | Outcome | File | The source that closes it |
|---|---|---|---|---|
| 47 | high | refuted by both | `server/services/ana-ri/artifact-generator.ts` | **code** The restatement is materially overstated on its load-bearing clause and on its consequence, though a thin residue survives. (1) "no per-artifact grounding constraint" is contradicted by the very file quoted. The deficien… |
| 49 | high | refuted by both | `server/services/safety-narrative-service.ts` | **reach** REACH HOPS — I re-verified each one at head c5e770288 and the verifier's map is accurate as far as it goes. Mount: `import safetyNarrative from '../routes/safety-narrative.js'` (register-inline-routes.ts:88), entry at :… |
| 55 | high | refuted by both | `server/services/innovation/evidence-confidence-heatmap-service.ts` | **code** The restatement's central persistence mechanism is false. It says runAssessment "INSERTs an assessment row plus innovation.evidence_gaps rows whose claim_text is the manufactured sentence", and customer_impact repeats it… |
| 56 | high | no consequence | `server/services/innovation/evidence-confidence-heatmap-service.ts` | **reach** Reach collapses at every hop, and one hop the verifier asserted does not exist at all. (1) MOUNT — confirmed absent, and it is not a flag/env condition, it is a deleted mount. `server/bootstrap/register-advanced-platfor… |
| 60 | high | refuted by both | `server/services/cerGenerationService.ts` | **code** The finding's headline — "CER benefit-risk verdict IS derived by dividing the count of listed benefits by the count of listed risks" — is false of every value this system computes, and the restatement's framing of the su… |
| 62 | high | refuted by both | `server/services/precedent-engine.ts` | **code** The load-bearing inference of the restatement is false against the source it cites, and the defect it describes is unreachable on every path, including one the reach map missed. 1. NO DOC/CODE MISMATCH. The claim says "'… |
| 68 | high | refuted by both | `server/routes/audit-trail-routes.ts` | **code** The helper text is real, but the restatement's load-bearing verb — "persist that substitute" — is false for the id half, and the other two values are not inventions of this file. 1) user_id 0 CANNOT be persisted. `audit_… |
| 69 | high | refuted by both | `server/routes/mdx-audit.ts` | **reach** The transport reach holds — I verified every hop myself — but the TRIGGER for the claim's headline element has no producer in source, and that element is what carries the 'high' rating.\n\nHOPS I CONFIRMED (all real): m… |
| 78 | medium | refuted by both | `server/services/lumen-context/base-system-prompt.ts` | **code** The literal text is where the verifier says it is — I read lines 226-245 of server/services/lumen-context/base-system-prompt.ts and the three specimens (Study 301 N=648 / Study 302 N=612, LSM -0.82% / -0.79% with CIs and… |
| 80 | medium | no consequence | `server/services/auditService.ts` | **reach** Reach and consequence both collapse, and one asserted hop is wrong in source. CODE SHAPE (not disputed): at head c5e770288 the quoted body is byte-accurate. `getAuditLog` is defined at auditService.ts:507; the primary D… |
| 81 | medium | refuted by both | `server/services/ana/contradiction-watch.ts` | **code** The literal quote is accurate — contradiction-watch.ts:155-157 really is a bare `catch { return []; }` with no log and no discriminant. But the restatement's operative claim ("All three production consumers then treat th… |
| 83 | medium | no consequence | `server/services/biostats-signal-engine/engine.ts` | **reach** REACH IS ZERO — every hop verified by me at head c5e770288, and the consequence collapses to nothing. CODE TEXT: not in dispute. I read engine.ts:434-461; the quoted source is accurate line-for-line, including `} catch… |
| 87 | medium | already fixed | `server/routes/innovation-routes.ts` | Fixed at 440df4a4e. The sweep's claim was true of the pre-fix code: guardQuery returned a bare `null` for "no pool", "connect failed", and "query failed" alike, with no logging, and every caller discarded the null so a check that… |
| 93 | medium | no consequence | `server/services/cognitive-ecosystem/digital-twin-runtime.service.ts` | **reach** Refuted on reach and consequence. I re-walked every hop in source and could not find a single live one; the fabrication is real text in a file nothing executes. (1) MOUNT — absent. `server/bootstrap/register-document-ro… |
| 98 | medium | refuted by both | `server/services/evidence-sufficiency/evidence-sufficiency.service.ts` | **code** The mechanism half of the restatement is accurate (I confirmed scorePillar's 100/60/50/30/0 tiers at lines 190-196, the 1-or-2 minimums and the three requiresQuantitative pillars in pillars.ts, and deriveVerdict's weight… |
| 100 | medium | already fixed | `server/routes/biotech-artifacts.ts` | Fixed at f567da99b. At sweep time the cover-letter handler substituted `applicant \|\| 'Concept2Cure Inc.'`, `applicationNumber \|\| 'IND-000000'` and `sequence \|\| '0001'` (and the validation-report handler `sequence \|\| '0001… |
| 101 | medium | refuted by both | `server/services/ai-gateway/gateway.ts` | **code** Two of the restatement's three load-bearing assertions fail against the code at c5e770288. (1) "that value is written to the AI audit ledger" is FALSE. route() runs 467-686. The deterministic branch RETURNS at gateway.ts… |
| 102 | medium | refuted by both | `shared/schema/gspr.seed.ts` | **code** The restatement is materially overstated in three code-checkable ways, and the part that survives is a dev-only data defect, not a fabricated value. (1) "computeCoverage divides decided mappings by exactly the seeded in-… |
| 103 | medium | refuted by both | `regulatory_data/guidance.json` | **code** The finding's core identification survives, but its stated mechanism and its entire customer-impact paragraph are falsified by running the exact code it cites, and the error inverts the shape of the defect.\n\nCONFIRMED… |
| 105 | medium | refuted by both | `server/services/regulatory-programs.service.ts` | **reach** REACH: the server hops hold, but the chain terminates before any consequence, and I verified the terminal hop myself rather than accepting the assertion. Hops I confirmed in source: the mount at register-inline-routes.t… |
| 106 | medium | no consequence | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx` | **reach** REFUTED ON CONSEQUENCE. The surface reach hops all hold — I confirmed each in source — but the DEFECT has no producer, so the finding as titled ("displays a missing creator as 'system'") describes an event that cannot o… |
| 110 | medium | refuted by both | `server/api/cmc/collaborationRoutes.ts` | **code** The finding as titled — "CMC collaboration comments are authored by 'Current User' with userId 'current-user-id' and role 'Team Member'" — is false at head c5e770288, and I closed the one gap the verifier left open, whic… |
| 111 | medium | no consequence | `server/services/authoring/doc-journey-view-assembler.ts` | **reach** TRANSPORT HOPS ALL VERIFY — I am not refuting those. I read each one at c5e770288: server/index.ts:70 imports './startup/routes'; server/startup/routes.ts:173 `await registerInlineAiWorkflowRoutes(inlineCtx);` with no f… |
| 113 | medium | refuted by both | `server/services/tasking/task-audit.ts` | **code** Both halves of the restatement are materially overstated, and the one that drives the re-rating to HIGH is simply false. (1) "The §11.50 signature manifestation — whose only persistence is this ledger payload (task-signo… |
| 114 | medium | refuted by both | `server/services/regulatory-graph/defense-packet-staleness.service.ts` | **reach** The reach as the verifier restated it does not survive source. Three of its load-bearing hops are dead ends, and the one hop it never checked (the job trigger) is env-gated off. (1) THE TWO "GOVERNED" HOPS CANNOT REACH… |
| 115 | medium | refuted by both | `client/src/concept2cure/_shared/components/EsignModal.tsx` | **reach** REACH: most hops hold, but the one hop the finding lives or dies on — a production render that actually prints the literal 'You' — does not exist in source. Hops I confirmed myself at c5e770288: the mount is real and un… |
| 117 | medium | refuted by both | `server/services/decision-lifecycle-service.ts` | **code** The restatement's own "live defect" rests on one unverified assumption, which the verifier listed as unverified point #1 and never closed: "Whether req.userId is actually populated on /api/authoring-actions requests in p… |
| 119 | low | no consequence | `server/utils/generate_sap_snippet.ts` | **reach** REFUTED ON REACH AND CONSEQUENCE. The literal text is real — I read server/utils/generate_sap_snippet.ts:168 and it does hardcode "approximately 80% power ... at a two-sided significance level of 0.05" from sampleSize/a… |
| 120 | low | no consequence | `server/services/innovation/compliance-guardrails-sdk-service.ts` | **reach** On the reach-and-consequence lens the finding collapses completely: no paying customer can see, download, or otherwise be affected by the fabricated run, and nothing is persisted anywhere. I verified each hop myself at… |
| 121 | low | no consequence | `server/services/artifact-document-bridge.ts` | **reach** REACH COLLAPSES COMPLETELY — there is no hop to verify, and I confirmed each absence myself at head c5e770288. The quoted source is accurate: I read `server/services/artifact-document-bridge.ts` lines 76-106 and the tex… |
| 122 | low | no consequence | `server/storage.ts` | **reach** REACH AND CONSEQUENCE COLLAPSE. The code pattern is real — I read it verbatim — but there is no hop from it to any customer, and the one hop chain the verifier listed leads somewhere else entirely. HOP 1 (mount, VERIFIE… |
| 123 | low | refuted by both | `server/services/ind/ctd/lifecycle-document-types.ts` | **reach** REACH VERDICT: the two hops that would give this finding any consequence do not exist in source. The text hop is real; the consequence hop is empty in both directions (no model, no client), so this is precisely "a promp… |
| 125 | low | no consequence | `server/services/ana-scoped-rule-loader.ts` | **reach** REACH LENS — refuted on consequence; every hop verified myself at head c5e770288. The string is real: `grep -rn "reviewer satisfaction"` over the whole repo (excluding node_modules/.git) returns exactly ONE hit, server/… |
| 126 | low | no consequence | `server/routes/cognitive-ecosystem.ts` | **reach** The code text is verbatim accurate — I read server/routes/cognitive-ecosystem.ts:145-158 and the handler does echo workflowId with constant status 'running', currentNode 'analysis', progress 0.45, checkpoints []. But un… |
| 128 | low | no consequence | `client/src/concept2cure/mdx/data/presub.ts` | **reach** REFUTED ON CONSEQUENCE. The quoted text is accurate — I read presub.ts:200-300 and the fabricated CDRH prose, the sample-size verdict, the labelling instruction and "FDA · Dr. K. Patel" are all verbatim there. But the f… |
| 129 | low | no consequence | `server/seed.ts` | **reach** REFUTED ON REACH AND CONSEQUENCE. The claim's own reach chain has no first hop: nothing in the repository executes server/seed.ts, and I confirmed this five independent ways at c5e770288, going past what the verifier ch… |
| 130 | low | refuted by both | `server/services/ana/se-discussion/fixtures.ts` | **reach** REACH IS NIL, AND THE ONE RESIDUAL CONSEQUENCE THE VERIFIER ASSERTS DOES NOT EXIST TODAY. I confirmed the relevant tree is byte-identical to the claimed head: `git diff c5e770288 HEAD -- server/services/ana/se-discussio… |
| 131 | low | no consequence | `server/prisma/client.js` | **reach** REACH AND CONSEQUENCE BOTH COLLAPSE — and the verifier's own reach block concedes it (mounted: NOT_MOUNTED, customer_impact: "Nothing"). I re-walked every hop in source at c5e770288 (file is byte-identical there; `git d… |
| 132 | low | no consequence | `server/utils/audit-logger.js` | **reach** The three code facts are real and I re-confirmed them at head (the file is byte-identical between c5e770288 and HEAD 8327d15a4 — `git diff --stat` over audit-logger.js/retentionCron.ts/run-retention.ts is empty). `od -c… |
