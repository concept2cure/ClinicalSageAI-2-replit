# Forensic code audit — concept2cure-v2

**Date:** 2026-05-29
**Scope:** Full codebase — `server/` (313 service dirs / 768 service files, 301 route files), `client/src/concept2cure/` (483 files, ~148k lines), Python `services/`/`workers/`/`ingestion/`, tests, CI, docs.
**Method:** Seven parallel forensic sweeps plus direct verification. Comments and status docs were not trusted — every finding is backed by `file:line` evidence.
**Posture:** Chief honesty officer. Findings cut both ways: fabrications are named, but genuinely solid systems are credited so the picture is true.

---

## Bottom line

The platform is **not vaporware**. The core AI gateway, e-signature, audit hash-chain, deep-research connectors, governed-action ledger, and the live DOCX renderer are real, well-built systems. But the product **fabricates the two things a regulatory platform exists to guarantee**:

1. **Regulatory submission to the FDA is faked** — `Math.random()` acknowledgment numbers and randomly-cycled "ACCEPTED" statuses, on a route whose own comment calls it "a real submission to FDA."
2. **The tamper-evidence on the audit trail is undermined** — a hardcoded HMAC fallback secret, and the new mutation-primitives chain is written but never verified.

Plus: the polished new UI is **not what loads** — `/` and `/concept2cure` still render the 2,191-line legacy ZenApp; the new shell is reachable only as a sub-route. And several "intelligence" surfaces present `Math.random()` output as predictive analysis.

What's genuinely encouraging, and worth stating plainly: the much-feared "is the AI real?" question resolves **yes** — real Claude/OpenAI calls, real pgvector search, real PubMed/ClinicalTrials/FDA fetches, with honest, *labeled* degradation paths. And the `errorCount: 0` typecheck claim is **honest** (a real CI ratchet drove 2,598 → 0), not a cover-up.

---

## Severity ledger

| Sev | Count | Theme |
|-----|-------|-------|
| CRITICAL | 5 | Faked FDA submission/status, hardcoded audit secret, unverified audit chain, dead-default UI, parallel fake app |
| HIGH | 11 | Fabricated analytics/priors, cross-tenant target resolver, dev-auth bypass, default-allow authority, undisclosed fixtures, skipped isolation tests, dead Python stack |
| MEDIUM | ~20 | No-op/empty service returns, stub surfaces in live nav, audit attribution gaps, inert citation links |
| LOW | ~10 | Hardcoded cosmetic metrics, dead bridges, misleading file headers |

---

## CRITICAL

### CR-1 · FDA ESG submission is a `Math.random()` mock — presented to users as a real submission
- `server/services/fdaIntegrationService.ts:717-728` — `sendToESG()`: `setTimeout(1000)` then returns `status:'RECEIVED'` + synthetic `receiptNumber`. Caller `submitToFDA()` logs `'FDA_SUBMISSION','success'` and returns "Submission sent to FDA successfully." Reachable via `medicalDeviceService.ts`.
- `server/services/fdaIntegrationService.ts:733-747` — `queryESGStatus()` returns a **`Math.random()`-picked** status from `['RECEIVED','VALIDATING','UNDER_REVIEW','ACCEPTED']`; `startStatusPolling()` (764-777) writes these into live state.
- `server/services/ESGSubmissionService.ts:314-317` — `transmitToESG()` production branch returns a mock `acknowledgmentNumber: ACK${year}${Math.random()...}`; `checkSubmissionStatus():352` likewise. Mounted at `POST /api/510k/:projectId/esg/submit` (`server/routes/esgSubmissionRoutes.ts:14`), whose comment reads "Most consequential mutation in the platform: a real submission to FDA."
- **Honesty note:** the *newer docstrings* in `ESGSubmissionService.ts:446-498` are candid ("AS2/SFTP … neither exists in this repo today") and the production path there now *throws* rather than fakes — but `fdaIntegrationService.ts` still fabricates, and the route comment overstates.
- **Cure:** Implement real ESG AS2/SFTP transport, or fail-closed (throw / 501) when transport+creds are absent, exactly as `ESGSubmissionService.ts:491-498` already does. Gate any simulation behind explicit `NODE_ENV!=='production'`. Correct the route comment.

### CR-2 · Hardcoded audit-integrity HMAC fallback defeats Part 11 tamper-evidence
- `server/lib/tamper-proof-audit.ts:127` — `this.hmacSecret = 'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION'` when `AUDIT_HMAC_SECRET` is unset; used at `:501` `createHmac('sha256', this.hmacSecret)`. Only `console.warn`s — does not refuse to run. Anyone with the source can forge/recompute the chain.
- **Cure:** Fail-closed — `throw` on missing `AUDIT_HMAC_SECRET` when `NODE_ENV==='production'`, mirroring the JWT_SECRET enforcement already at `server/config/environment.ts:103-123`. Never embed a deterministic signing key.

> **Update (2026-05-29):** CR-1, CR-2, CR-3, and CR-5 addressed on branch `claude/concept2cure-v2-audit-5zufv` (PR #621). CR-1/CR-2 fail-closed; CR-3 all three gaps fixed (org-scoped `resolveTarget`, real DB errors propagate, and a `verifyAuditChain` + `GET /api/c2c/actions/verify-chain` verifier added); CR-5 `SimpleApp.tsx` deleted (verified zero references). CR-4 (route flip) remains open — design-gated on Phase 3.

### CR-3 · The new mutation-primitives audit chain is written but never verified; target resolver is not tenant-scoped
- **Write side is real:** `server/services/audit/chain.ts:39-62` genuinely computes a SHA-256 hash chain inside the txn (`server/routes/c2c/actions.ts:223`); dual-writes `audit_logs` + `c2c_ana_actions` transactionally; idempotency enforced by DB UNIQUE. All 12 endpoints mounted (`server/bootstrap/register-inline-routes.ts:289-294`) and auth-gated. Re-auth gate is real bcrypt + TOTP (`actions.ts:158-181`).
- **Gap 1 (verification missing):** the only chain verifier, `server/services/audit/chainIntegrityMonitor.ts:66-94`, queries a **different table** (`audit_events`), not `audit_logs` where the new `sha256_chain` lives. Nothing re-derives the new chain → tamper-evidence is unobservable.
- **Gap 2 (cross-tenant):** `actions.ts:96-136` `resolveTarget` looks up every target `WHERE id=$1` with **no org/tenant predicate** — a user in org A can write a governed mutation referencing org B's document and pass validation. The CI tenant-isolation gate **blanket-exempts this file** (`scripts/ci/check-tenant-isolation.mjs:143`).
- **Gap 3:** `actions.ts:149-153` catch returns `{exists:false}` which the handler accepts as valid → existence never truly enforced; real DB errors masked.
- **Cure:** Add an `audit_logs` chain re-derivation verifier wired to the monitor/an endpoint. Thread `orgId` into `resolveTarget` with `AND org_id=$2`; narrow the CI exemption to just the `password_hash` lookup. Distinguish "missing table" from real errors.

### CR-4 · The new UI shell is not the default route — `/` and `/concept2cure` render legacy ZenApp
- `client/src/App.jsx:67-73` → all unmatched paths render `<ZenRouter/>`.
- `client/src/concept2cure/router/ZenRouter.tsx:204-241` — `/`, `/concept2cure`, `/concept2cure/*`, catch-all all render legacy `ZenApp` (2,191 lines). Only `/concept2cure/mdx` (`:192`) renders the new shell directly. The new surfaces are reachable only through ZenApp's internal `layoutMode` switch.
- This is documented in CLAUDE.md/HANDOFF as gated on Phase 3 — so it's a *known* gate, not concealed — but it means "the new UI" is not the live product.
- **Cure:** When Phase 3 ships, flip the catch-all to the new shell and delete the ZenApp switch.

### CR-5 · `SimpleApp.tsx` — a parallel 1,193-line app with fabricated clinical dashboards
- `client/src/SimpleApp.tsx:548-789` — CRO dashboard with hardcoded "24/47/12/94%" and fabricated activity ("BPI-001 First Patient Enrolled · 2 hours ago"); `:1024-1044` CSR Reports stub; `:354-383` greyed-out dead IND Wizard sections. Not imported by `main.tsx` (appears dead) but shipped source presenting fake clinical data.
- **Cure:** Delete if unused; confirm nothing lazy-imports it.

---

## HIGH

### HI-1 · `Math.random()`-driven "regulatory intelligence" presented as prediction
- `server/routes/regulatory-digital-twin.ts:1125-1352` — FDA/EMA "reviewer digital twin": panelist bias `(Math.random()-0.5)*0.2`, abstain `Math.random()>0.85`, IR/CRL likelihoods, review-day extensions `30+Math.random()*60`, hardcoded approval rates. Output is a deficiency/RTF/AdComm-vote *prediction* that is RNG + constants.
- **Cure:** Back probabilities with a model trained on historical FDA decisions, or label the surface explicitly as a non-predictive Monte-Carlo illustration.
- **Update (2026-05-29):** addressed on branch `claude/audit-hi123-remediation`. Every prediction-bearing response from `regulatory-digital-twin.ts` (simulations POST/GET/list, predict-questions, rtf-assessment, deficiency-prediction, advisory-committee, monte-carlo-timing, cross-agency) now carries a `_disclosure` envelope (`predictive:false`, `methodology:'monte-carlo-illustration'`, `validatedAgainstHistoricalDecisions:false`) so the RNG-driven output cannot be mistaken for validated prediction. The underlying stochastic model is unchanged; the labeling cure was taken (no historical-decision model exists to train against).

### HI-2 · Fabricated statistical priors feed sample-size / power / success-probability outputs
- `server/services/power-sample-size-service.ts:684-716,725` — `getHistoricalEffectSizes()`/`getHistoricalDropoutRates()` return hardcoded "mockup data" (Cohen's d 0.5, OR 1.8, HR 0.75, 15% dropout) labeled "historical from similar trials," feeding power calculations.
- `server/services/report-generator-service.ts:196-205` — `generateSuccessProbability()` returns hardcoded phase-transition probabilities ("we're providing simulated data").
- `server/services/sap-generator-service.ts:99-100` — power/effect-size as `0.8 + Math.random()*0.1`.
- **Cure:** Source priors from the CSR database per indication/endpoint; return the existing "No historical data available" branch rather than canned numbers.
- **Update (2026-05-29):** addressed on branch `claude/audit-hi123-remediation`. `getHistoricalEffectSizes` / `getHistoricalDropoutRates` now return `{available:false, source:'none', note}` instead of canned Cohen's d / OR / HR / 15%-base constants. `report-generator-service.generateSuccessProbability` returns `available:false` unless a real `success_rate` comes from `statisticsService.getIndication` — the canned phase1→2/2→3/3→approval/industry-benchmark constants are deleted. `sap-generator-service` no longer derives power/effect size from `Math.random()`: it uses caller-supplied `target_power`/`minimum_detectable_effect`, and otherwise the SAP narrative explicitly defers the calculation to the study statistician. Behavioral + source guards in `tests/audit-hi-1-2-3-honesty-remediation.test.ts`.

### HI-3 · "Compliance analysis" is substring matching emitting a percentage
- `server/services/regulatory-intelligence-service.ts:584-665` — `analyzeProtocolCompliance()` is naive `includes()` keyword matching, then emits `COMPLIANCE SUMMARY: X%`. `:532-577` `generateSpecialConsiderations()` returns hardcoded advice ("For now, return some sample considerations"). `:100-135` loads from local JSON/hardcoded defaults. Live at `/api/regulatory-intelligence`.
- **Cure:** Wire the LLM/HF service the comments reference; suppress the percentage until a real scorer exists; load rule-packs from DB.
- **Update (2026-05-29):** percentage suppressed on branch `claude/audit-hi123-remediation`. `analyzeProtocolCompliance` no longer emits `COMPLIANCE SUMMARY: X%`; it now opens with a `METHOD:` disclaimer ("heuristic keyword screen, not a validated compliance score") and reports plain match counts (checked / matching-language-detected / require-manual-review). The substring-match logic and rule-pack DB loading are unchanged — only the false-precision score was removed; wiring a real scorer remains open.

### HI-4 · Empty/no-op service returns presented as results
- `server/services/export-service.ts:192-201` — `getStudyInsights()`: `// TODO … Returning empty array` → always `[]`.
- `server/services/export-service.ts:174-187` — `getLatestProtocol()` does a server-side `fetch` of a relative URL (fails) → `null`.
- `server/services/csr/index.ts:95-106` — `extract()` throws "not implemented"; `getKnowledge()` returns `{}`.
- `server/services/regulatoryAIServicePhase3.js` — "Minimal stub," returns `[]`; wired into `server/api/ai/phase3-routes.js`.
- `server/services/FDAFormGenerator.ts:111-114` — `getAISuggestion()`: TODO → returns `''`.
- `server/services/eventBus.js:255-269` — `createSubmissionContainer()` returns `success:true` without creating anything.
- **Cure:** Implement the queries/integrations, or return explicit 501/empty-state rather than success.
- **Update (2026-05-29):** the highest-harm cases addressed on `concept2cure-v2`. `export-service.ts` no longer writes fabricated content into a user's exported archive: `getPredictionResults` (was hardcoded `probability:0.83`) and `getSummaryReport` (was a canned "Phase 2 trial…" summary, even truncated) now return `null` so those files are simply omitted; `getLatestProtocol`'s broken server-side relative `fetch` is replaced with an honest `null`. `eventBus.createSubmissionContainer` no longer returns `success:true` + a fabricated `containerId` — it returns `{success:false, implemented:false, reason}` (the caller discards the value, so no flow breaks). Guards in `tests/audit-hi-4-noop-returns-remediation.test.ts`. **Still open:** `csr/index.ts` `getKnowledge` (no caller — dead), `regulatoryAIServicePhase3.js` (live `/api/ai/phase3` route returning `[]` — needs a 501/honest-empty decision), `FDAFormGenerator.getAISuggestion` returning `''` (empty suggestion, not a fabricated success — low harm).

### HI-5 · MDX workbench surfaces render fixtures with no disclosure
- The honest `SampleDataBanner.tsx` exists and is used by ~18 surfaces, but **not** in `client/src/concept2cure/mdx/workbench/Workbench.tsx`, which falls back to fixtures at `:49-50` (`?? TASKS`), `:473-475` (validation), `:638` (submissions), `:888` (templates). Endpoints exist, so this is a disclosure gap — regulated users can mistake demo tasks/validation for live data.
- `MemorySurface.tsx:35-39` may always show fixtures (its `/api/mdx/memory` path has 0 server files — verify hook targets the real `/api/mdx/ana/memory`).
- **Cure:** Render `<SampleDataBanner show={live===null && !loading}/>` in each workbench sub-surface; audit every `?? FIXTURE` against a confirmed route.

### HI-6 · Security: dev-auth bypass, default-allow authority, non-blocking scanners
- `server/routes/users.ts:53,216,277,339,390,444,450` — 7 sites short-circuit auth when `NODE_ENV==='development'`, returning a synthetic user / faking mutations. The CI guard `ci:no-dev-auth-in-prod` misses this file.
- `server/routes/part11-compliance.ts:774` — authority-check endpoint returns `authorized:true` unconditionally ("production enforces RBAC" is a comment, not code).
- `.github/workflows/ci.yml:281,291` — Trivy secret/dep scans are `continue-on-error:true` → cannot fail the build. `.claude/skills/gstack/test/skill-e2e-cso.test.ts:45` commits an `sk-`-format dummy key.
- **Cure:** Route dev bypasses through `isDevAuthAllowed()` (explicit `ALLOW_DEV_AUTH=1` + non-prod) or delete; implement/501 the authority endpoint; remove `continue-on-error` from Trivy; sanitize the key.
- **Update (2026-05-29):** dev-auth + authority parts fixed on PR #621. `users.ts` `isDev` now routes through `isDevAuthAllowed()` (requires `NODE_ENV==='development'` **and** `ALLOW_DEV_AUTH==='1'`), correcting all 6 call sites at once. `part11-compliance.ts` `/authority-check` now calls the real DB-backed `rbacService.checkPermission()` (fail-closed) instead of returning `authorized:true`. The Trivy `continue-on-error` + committed dummy key remain open (CI-policy changes, left for review).

### HI-7 · Tenant-isolation tests are skipped; security suites contain no-op assertions
- `server/__tests__/routes/cortex-threads.runtime.test.ts:48,131,152` — 3× `it.skip` on the **cross-user 403 ownership** checks (the multi-tenant guarantee).
- `tests/founder-critical-path-proof.test.ts:120` (`describe.skip` sign-out proof), `tests/routes/ectd-export-governance.test.ts:48` (`describe.skip` governance gate).
- `server/__tests__/security/audit-trail-contract.test.ts:213` and `ana-mdx-pen-scaffold.test.ts:278` — `expect(true).toBe(true)` in the *security* suite.
- All three CI test steps use `--passWithNoTests` (green on zero tests).
- **Cure:** Re-enable the cross-user 403 suite as a release blocker; replace no-op asserts; drop `--passWithNoTests`.
- **Update (2026-05-29):** the three cross-user 403 tests in `cortex-threads.runtime.test.ts` are re-enabled on PR #621 (the route already enforced ownership; the skip rationale was stale). Verified meaningful via mutation testing — disabling the ownership check makes them fail.
- **Update 2 (2026-05-29):** further HI-7 items closed on PR #621:
  - `tests/routes/ectd-export-governance.test.ts` — `describe.skip` removed; all 3 governance-gate tests pass (the "stale spies" rationale was outdated — the route's call graph matches the mocks). Mutation-verified: disabling the human-review gate in `ectd-export.ts` makes the strict-mode block fail.
  - `server/__tests__/security/audit-trail-contract.test.ts:213` — the `expect(true).toBe(true)` esignature no-op is replaced with a real fail-closed assertion: a `POST /api/esignature/sign` whose signature can't persist must not return 201 and must not emit an `esignature.sign` audit row (the Part 11 integrity property). Mutation-verified: logging `esignature.sign` on the failure path makes it fail.
  - `--passWithNoTests` dropped from both `ci.yml` test steps (lines 107, 206) — the full vitest suite always collects tests, so the flag only masked a misconfig.
  - **Deliberately left (not dishonest):** `tests/founder-critical-path-proof.test.ts:120` (`describe.skip` sign-out) tests components deleted in the design-system port; the Phase 5 auth surface isn't built yet (per CLAUDE.md), so there is nothing to assert. `ana-mdx-pen-scaffold.test.ts:278`'s `expect(true)` is an explicit "this file is a SCAFFOLD, not a pen test" acknowledgement, not a hollow coverage claim. Both are honest as-is and re-enable when their surfaces ship.

### HI-8 · The entire `services/` Python stack is dead; there is no real eCTD generation
- `server/startup/services.ts:29-31` — `startPythonBackend()` is a hard stub (`return Promise.resolve(null)`, "Python backend is currently disabled"). The only live Node→Python bridge is the artifact-compute DOCX worker.
- `services/api.py`, `celery_app.py`, `secure_runner.py`, `ectd_generator.py`, `worker.py` (Celery+FastAPI) have **no Node caller** — orphaned, and `celery`/`redis`/`pinecone`/`lxml` are absent from every requirements file, so they can't even `pip install`.
- ~~**No real eCTD anywhere:** grep for `index.xml|md5|regional|dtd|backbone|leaf` across generators returns nothing.~~ `ectd_generator.py` emits a single DOCX (misnomer). `ectd/TEST001/**` and `ectd-stubs/*.json` are hand-built fixtures (`us-regional.xml` is literally `<regional/>`).
- **CORRECTION (2026-05-29):** the "no real eCTD anywhere" claim was **overstated** — that grep covered only the Python `services/` stack. The **TypeScript** layer has three real, structured backbone generators: `server/services/ectdExportService.ts` (live at `POST /api/ectd/export`; builds `index.xml` + regional XML + STF + per-leaf MD5 + m1–m5 hierarchy from DB content), `server/services/submission-gateways/regional-packager.ts` (FDA/EMA/PMDA regional backbones with correct DTD DOCTYPEs + `util/index-md5.txt`), and `server/src/services/reg/{indexXml,packager}.ts` (DB-backed sequence leaves, `crypto md5`, `ectd:leaf` operations). Real validators exist too (`ectd/ectd4-validator.ts`, `ectd-regional-rules.ts`). The capability is ~60–75% of an agency-submittable generator, not absent. The Python-stack and DOCX-misnomer parts of this finding stand. Full re-scope, real-vs-stub table, and remediation plan in **`HI_8_ECTD_SCOPING_BRIEF.md`**. Notable confirmed gap: **no `.dtd` file exists in the repo and no generator bundles `util/dtd/`**, so referenced DTDs dangle (G1 in the brief).
- `ingestion/benchling_connector.py` is a bare JSON dict (hardcoded "TestDrug"), not valid Python — breaks `import ingestion`.
- `.github/workflows/nightly-contradiction-scan.yml:61` runs `python -m shadow_service.nightly_scan` which **does not exist**; `shadow_service/scoring/risk_code_map.py:31` imports a missing `models_predicate` sibling (non-importable).
- `services/ich_ingest/agent.py:172` uses the removed pre-1.0 `openai.ChatCompletion.acreate` (will `AttributeError`); `:189-227` returns hardcoded `sample_tasks`.
- **Genuinely real:** `workers/artifact-compute/docx-python-runtime.py` (well-built, sandboxed DOCX renderer) and `ingestion/pdf_extractor.py` (6-strategy extraction).
- **Cure:** Delete the orphaned Celery/ICH stacks or wire + dependency-pin them; if eCTD packaging is a requirement, build a real backbone generator (lxml + ICH DTDs + per-leaf MD5 + regional XML); fix/remove the broken Benchling connector and nightly workflow.

---

## MEDIUM (representative)

> **Update (2026-05-29):** three MEDIUM items below addressed on `concept2cure-v2` — Part 11 attribution gaps, degraded-by-default RAG, and the digital-twin CQA `Math.random()`. Guards in `tests/audit-medium-fabrication-attribution.test.ts`. Details inline.

- **Part 11 attribution gaps:** ~~`part11ComplianceService.ts:608` hardcodes `ipAddress:'127.0.0.1'`; `medicalDeviceService.ts:835-836` hardcodes `userName:'User ${userId}'`, `userRole:'regulatory_specialist'`.~~ **FIXED:** `part11ComplianceService.generateCryptographicSignature` takes an optional `ipAddress` and records it (or `null`) — no more fabricated localhost; `medicalDeviceService.logAuditTrail` resolves the real `users.name` and sets `userRole: null` (users has no role column) instead of stamping every actor `regulatory_specialist`. Route-level IP threading (passing `req.ip` into the signature call) remains a follow-up.
- **Degraded-by-default RAG (`biotechRagService.js`): FIXED** — the empty `try{}` now initializes `new OpenAI({apiKey})` when `OPENAI_API_KEY` is set, so real embeddings are used instead of always falling back to TF-IDF. (`semantic-search-service.ts:232` hardcoded-0.1 fallback still open.)
- **Digital-twin CQA `Math.random()` (`cognitive-ecosystem/digital-twin-runtime.service.ts:798`): FIXED** — synthetic CQA values fed `avgConfidence` → an automated `RTRT_APPROVED` real-time-release decision. The synthetic path can no longer auto-approve (forced to `MANUAL_REVIEW`) and the response discloses the predictions are synthetic/non-actionable. (Originally listed at `:798-821`.)
- **`semantic-search-service.ts:232` fabricated fallback: FIXED** — on no keyword match it returned arbitrary documents at a hardcoded `score:0.1`; it now returns no results. Guards in `tests/audit-medium-extraction-search.test.ts`.

> **Re-verified, NOT bugs (2026-05-29):**
> - **`/api/c2c/actions/sign` not writing `electronic_signatures`** is **schema-gated, not a quick fix**: `electronic_signatures` requires `document_id`/`version_id` FKs into the legacy `documents`/`document_versions` tables, but the c2c `sign` target resolves to `c2c_documents` — a write would FK-violate. The c2c path already records the signing event immutably (actor, reason, payload_hash, sha256 chain, bcrypt+TOTP re-auth) in `audit_logs` + `c2c_ana_actions`; generalizing the manifest table belongs with the Phase 9 schema work.
> - **`regulatoryAIServicePhase3` returning `[]` on a live route** is fail-closed: every `phase3-routes.js` handler gates on `getFeatureFlags()` (all `false`) and returns "AI Intelligence features not enabled" before reaching the stub. The stub's `compliant:true` is unreachable.
> - **Committed `sk-` dummy key** (`.claude/skills/gstack/test/skill-e2e-cso.test.ts:45`) is an **intentional planted-vuln test fixture** — the `/cso` security-audit skill E2E asserts the scanner detects it (`:87`). Sanitizing it would defeat the test. It is vendored skill test data, not product code or a leaked secret.
- **`/api/c2c/actions/sign` writes `audit_logs` but not `electronic_signatures`** — two parallel e-sig paths; the Part 11 signature manifest table isn't written by the new path.
- **Heuristic dressed as NLP:** `foresight-knowledge-graph.ts:351,378`, `endpoint-recommender-service.ts:442`, `PathwayAdvisor.ts:471`, `ModuleIntegrationService.ts:404` — "simplified … in production this would use NLP." **Partially FIXED (2026-05-29):** `foresight-knowledge-graph` `extractBiomarkers`/`extractEndpoints` no longer fabricate indication/phase-based defaults (HbA1c, PD-L1, "Primary Efficacy") and present them as extracted — they now return `[]` when CSR metadata is absent. The other three are honest heuristics (real keyword extraction / an unimplemented filter / a coarse audit-diff), not fabricated data presented as real — left as-is with their disclosing comments.
- **Inert citation/provenance links:** `mdx/editors/DocumentEditor.tsx:204,454`, `EstarEditor.tsx:258,640`, `projects/components/ProjectAside.tsx:58,73` ("Vault →"/"Open log →" are dead `href="#"`). Undercuts the evidence-chain claim.
- **Stub surfaces in live nav:** `mdx/data/nav.ts:59-96 MDX_STUBS` (engineering/udi/postmarket/analytics/memory/admin → `InDesignSurface`); `biopharma/data/nav.ts` lists 28 items, most `Stub.tsx`. Honestly labeled "In design," but clickable production nav.
- **Home rail mislabeled redirects:** `concept2cure-home/data.tsx:15-33` — all 16 `href:null`; `ZenApp.tsx:1165-1182` maps `protocol→#templates`, `cmc→#cer`, `audit→#admin`, `biostat→''` (canned Ana message). Items open unrelated surfaces.
- **Degraded-by-default RAG:** `server/services/biotechRagService.js:16-20` — the OpenAI-init `try{}` is **empty**, so it *always* uses crude TF-IDF, never real embeddings. `semantic-search-service.ts:232` returns first-N docs at hardcoded score 0.1 on failure.
- **`digital-twin-runtime.service.ts:798-821`** — `simulateCQAPredictions()` fabricates CQA values with `Math.random()` ("placeholder for actual ML model").
- **17 `@ts-nocheck` files** including `server/middleware/auth.ts:1` and `server/auth/index.ts` — auth code sits outside the "0 type errors" guarantee. `tsconfig.json:35-36` excludes `AuthContext.tsx` from typechecking; lint ignores all of `client/src`.

---

## LOW (representative)

- Demo-mode LLM responses (`ai-gateway/gateway.ts:230-280,370-374`) are env-gated and **labeled "(Demo Mode)"** — honest, but a keyless prod deploy would silently serve demo regulatory text. **FIXED (2026-05-29):** the no-provider branch now throws in `NODE_ENV==='production'` instead of falling back to the demo/deterministic response — fail-closed. Dev still falls back; the explicit `deterministicMode` opt-in is unchanged. Guard in `tests/audit-ai-gateway-keyless-prod.test.ts`.
- Home module-tile footers (`concept2cure-home/data.tsx:63-113`) ship hardcoded "87% readiness," "12,480 docs," "248k events" as if live telemetry.
- `server/faers-bridge.js` and `foresight-csr-integration.ts:26` (`http://localhost:8000`) are bridges to Python services that never start.
- `aiProviderRouter.ts:403` — `Math.random()` tiebreak makes "cost-optimized routing" non-reproducible for audit.
- `TenantContext.tsx:182-183` — the one genuinely empty `catch{}` in the client.

---

## What is genuinely real (credited)

- **AI/LLM layer is real:** `ai-gateway/gateway.ts:587,752,1060` live OpenAI/Anthropic/Moonshot calls; real embeddings (`enhancedEmbeddingService.ts:145`) + pgvector cosine search (`regulatory-guidance-retrieval.ts:66`); real connectors to ClinicalTrials/PubMed/FDA (`server/services/connectors/*`); deep-research synthesis with real citation IDs; governed actions perform real DB transactions + audit ledger (`ai-actions/handlers/promote-artifact.ts:210`). Degradation paths are labeled, not deceptive.
- **E-signature** (`server/routes/esignature.ts`): real bcrypt + TOTP, SHA-256 content hash, persists to `electronic_signatures`, **503s rather than faking** when schema missing.
- **Audit service** (`server/services/auditService.ts`): dual-write to `audit_logs` + tamper-proof HMAC chain with `verifyChain()`.
- **Mutation primitives** (`server/routes/c2c/actions.ts`): real transactional dual-write, real idempotency, real re-auth — strong despite the two gaps in CR-3.
- **Already-remediated fabrications (verified):** citation-verification, RWE study execution, Snow Globe scoring, and analytics dropout now return real values or honest `null`/501/`insufficient_data` (0 `Math.random` in those files). The corresponding UI_HANDOFF docs are accurate.
- **Typecheck `errorCount: 0`** is an honest, CI-enforced ratchet (2,598 → 0), not concealment.
- **JWT/CORS/CSRF/SQL:** JWT enforced (no `id=0` fallback), CORS allowlisted (not `*`), CSRF present, SQL parameterized.

---

## Documentation honesty (docs-vs-code drift)

| Doc claim | Verdict | Evidence |
|-----------|---------|----------|
| `DocumentIntelligenceService` "deleted, zero importers" | **FALSE** | Still at `client/src/concept2cure/services/documentIntelligenceService.ts` with 3 importers |
| GENERAL_RELEASE_AUDIT "all 5 CRITICAL resolved" (C4 API keys) | **OVERSTATED** | `LiteratureRetrievalService.js:163,186` still reads `VITE_PUBMED_API_KEY` |
| QC_AUDIT CRIT-01/02 "RBAC/Audit are stubs returning true/[]" | **STALE (now false)** | `roleBasedAccess.ts` 338 lines DB-backed; `auditService.ts` 371 lines real inserts |
| FEATURE_INVENTORY "ZenApp 113 KB" | **PARTIAL** | Now ~87 KB |
| HANDOFF changelog "Phase 4–11 shipped" | **AMBIGUOUS** | Means *design kit* shipped, not implemented in codebase; table's "Ready to implement" is the code truth |

Most-needed doc corrections: remove DocumentIntelligenceService from the deleted list; downgrade C4 to partial; mark QC_AUDIT CRIT-01/02 superseded; clarify "kit shipped" vs "implemented" in HANDOFF.

---

## Recommended remediation order

1. **CR-1** — stop faking FDA submission/status (fail-closed). Highest user-trust + regulatory exposure.
2. **CR-2** — fail-closed on missing `AUDIT_HMAC_SECRET`; delete the hardcoded key.
3. **CR-3** — wire an `audit_logs` chain verifier; tenant-scope `resolveTarget`; narrow the CI exemption.
4. **HI-6 / HI-7** — close dev-auth bypass + default-allow authority; re-enable cross-user 403 tests; make Trivy blocking.
5. **HI-1/HI-2/HI-3** — stop presenting `Math.random()`/keyword-match as predictions; source real priors or label honestly.
6. **HI-5** — render `SampleDataBanner` in the workbench surfaces.
7. **HI-8** — delete or wire (+ dependency-pin) the dead Python stack; build real eCTD or remove the misnamed generators.
8. **Docs** — apply the corrections above so the status docs stop overstating.
9. **CR-4/CR-5** — execute the route flip when Phase 3 lands; delete `SimpleApp.tsx` and legacy `editor/regulatory/workspace` (~37k lines) as kits route.

*No files were modified during this audit.*
