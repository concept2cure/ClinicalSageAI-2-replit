# Pharma / Biotech / MedTech CSO Security Evaluation — Licensing Readiness

**Platform:** Concept2Cure RIAI / ClinicalSageAI (enterprise regulatory-intelligence platform for life sciences)
**Evaluation date:** 2026-06-08
**Author:** Office of the CSO (codebase-grounded review)
**Lens:** How a Chief Security Officer at a pharma, biotech, or medical-device (MDx) client will evaluate this product before authorizing their company to become a licensed user.
**Method:** Evidence-based review of the live `claude/pharma-cso-security-eval-hLEiD` working tree — four parallel read-only domain sweeps (identity/tenancy, AI data governance, 21 CFR Part 11 / cryptography, AppSec / DevSecOps), each finding re-verified against source, plus direct inspection of the SSO/SAML path. File:line references are provided so any client auditor can reproduce.

> This document deliberately supersedes the security-relevant rows of `C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md` (Feb 2026), which materially overstated SSO maturity. See §7 (Questionnaire reconciliation).

---

## 1. Executive verdict

**Overall posture: STRONG architecture, ONE live critical, and a short list of licensing blockers.**

This platform is **substantially more hardened than the typical Series-A/B life-sciences SaaS** a client CSO will have seen. The controls that vendors usually fake — tenant isolation, an audited single seam for all AI egress, data residency/zero-retention as *hard* constraints, 21 CFR Part 11 hash-chained audit with e-signatures, and an unusually deep suite of CI security gates — are genuinely implemented and, in most cases, regression-tested and enforced on every PR.

The review found **one critical**: the enterprise **SAML SSO path failed open** (authenticated forged/unsigned assertions) — a client's pen-test vendor would have found it on day one, and because the existing client questionnaire already answers "SSO ✅ supported," it was both a security issue *and* a trust/credibility issue. **This PR remediates it** with a fail-closed, vetted-library (`@node-saml/node-saml`) rewrite, regression tests, and a new CI guardrail (see §3.1); live-IdP interop validation and SCIM remain as follow-ups.

| Decision | Status |
|---|---|
| Proceed to licensing **as-is** | ❌ No |
| Proceed **with conditions** (fix the blockers in §3, then ship) | ✅ **Recommended** |
| Delay / major rework | ❌ Not warranted — the core is sound |

**Time-to-licensable (engineering):** the §3 blockers are days–weeks of focused work, not a re-architecture. The longer pole is **organizational evidence** (SOC 2 Type II report, pen-test attestation, sub-processor list, DPA/BAA) — those are procurement gating items independent of code.

---

## 2. How a life-sciences client CSO actually evaluates us

A pharma/biotech/MDx CSO does not read source. They run our answers through a battery of frameworks and a third-party questionnaire, then commission a pen test. We are graded against:

| Category | What they send us / check | Our readiness |
|---|---|---|
| **Vendor security questionnaire** | SIG / SIG-Lite, CAIQ (CSA STAR), HECVAT, or a bespoke pharma IT-security questionnaire | Mostly answerable; SSO answer must be corrected (§7) |
| **SOC 2 Type II** | Independent auditor report, ≥6-month observation window | ⚠️ Targeted Q1 2026; **no report evidenced in repo as of this review** |
| **ISO 27001 / 27701** | Certificate + SoA | ❌ Not evidenced |
| **HIPAA / HITECH** (US PHI) | BAA, Security Rule safeguards, encryption | Technically capable; BAA + ZDR contracts required |
| **GDPR / EU** (EU personal data) | DPA, sub-processors, residency, DSR/erasure | EU residency supported (Vertex/Azure); DPA + retention SOP needed |
| **21 CFR Part 11 / EU Annex 11 / GAMP 5 / CSA** | Audit trail, e-signature, validation, immutability | ✅ Strong core; 3 tracked gaps (§5.4) |
| **NIST CSF 2.0 / ISO 42001 / NIST AI RMF / EU AI Act** | AI governance, model cards, data-flow control | ✅ Unusually strong for the segment |
| **OWASP ASVS / Top 10, pen test** | Hands-on test of auth, IDOR, injection, SSRF | ✅ Mostly — **except the SAML critical (§3.1)** |

The takeaway for sales/security engineering: **we win on architecture and AI governance; we lose deals on (a) the SAML bug, (b) missing third-party attestations, and (c) the questionnaire/reality gap.** Fixing (a) and (c) is on us this sprint; (b) is a compliance-calendar item.

---

## 3. Licensing blockers — must fix before a questionnaire/pen-test

### 3.1 🔴 CRITICAL — SAML SSO authenticates forged assertions (auth bypass, cross-tenant impersonation)

**The single most important finding in this review.**

- **Fail-open on signature failure.** `server/routes/sso.ts:190-198`: the ACS callback calls `verifySignature()`, and when it returns `false` it merely logs `"SAML Response signature verification failed — proceeding with caution"` and **continues to parse and trust the assertion**. There is no rejection. An attacker can POST a self-authored, unsigned SAML Response to the public callback and be issued a session as **any email in any tenant**.
- **Regex-based XML assertion parsing.** `server/services/saml-provider.ts` extracts `NameID`, `Issuer`, attributes, etc. with regular expressions (`extractElementContent` returns the *first* match). This is the textbook setup for **XML Signature Wrapping (XSW)**: an attacker wraps a forged assertion next to a legitimately signed blob; the regex reads the forged one while any signature check passes over the other.
- **Non-canonical signature check.** `verifySignature()` (`saml-provider.ts:341-381`) verifies over raw `SignedInfo` text and self-documents the gap: *"Full XML canonicalization (c14n) is complex; this validates the digest over the raw signed content."* It does not perform C14N, does not validate the `Reference`/digest binds the consumed assertion, and does not pin the IdP cert to a trust anchor beyond config.
- **Exposure.** The router is mounted at `/api/auth/sso` (`server/bootstrap/register-platform-routes.ts:170`) and `/api/auth` is on the unauthenticated `openPrefixes` allowlist (`register-platform-routes.ts:181`), so the callback is reachable pre-auth. It is inert only until a customer configures `SAML_IDP_*` env vars — i.e., it activates exactly for the enterprise customers who demand SSO.

**Severity rationale:** complete authentication bypass + multi-tenant impersonation on a regulated-data platform. This is *worse* than having no SSO, because it advertises a security feature that is exploitable.

**✅ REMEDIATED IN THIS PR (vetted-library rewrite):**
- `server/services/saml-provider.ts` rewritten as a thin, **fail-closed** wrapper around **`@node-saml/node-saml` v5.1.0** (real XML-DSig via `xml-crypto`: canonicalization/C14N, Reference-digest binding). All regex XML parsing removed.
- Security invariants enforced: `wantAssertionsSigned: true` (unsigned/invalid assertions are **rejected**), `audience` pinned to the SP entityId, `validateInResponseTo` for replay/solicitation binding, IdP certificate as the trust anchor.
- `server/routes/sso.ts` ACS now validates via `provider.validateResponse()`, which **throws on any signature/assertion failure** — the `"proceeding with caution"` fail-open path is gone. The org is selected from (untrusted) RelayState, which only chooses *which* IdP cert validates, so it cannot forge a login. The previous `new URL(relayState)` **open-redirect / token-exfil** path was replaced with a same-origin-only return path (validated at both initiate and callback).
- Regression suite `server/services/__tests__/saml-provider.test.ts` proves forged/unsigned assertions are rejected and no user is ever returned for an unverified assertion (wired into `npm run test:security`).
- New CI guardrail `scripts/ci/check-saml-fail-closed.mjs` (`npm run ci:saml-fail-closed`, added to the Lint job) blocks reintroduction of the fail-open/regex-parsing pattern.

**Still open (follow-up):**
- **Live-IdP interop validation** against Okta / Entra ID / Ping (the unit tests prove fail-closed but do not exercise a real signed assertion end-to-end). Recommend a staging IdP integration test before GA.
- **SCIM** provisioning/deprovisioning — ✅ **core landed in this PR** (`server/routes/scim.ts`, mounted at `/scim/v2`): bearer-token auth, Users list/create/get/replace/patch, and the **deprovision/offboarding path** (PATCH `active:false` / DELETE → deactivate), tenant-scoped to a configured `SCIM_ORG_ID`. Groups + multi-org SCIM tokens are the follow-on.
- **Shared InResponseTo cache (Redis)** for multi-instance HA (node-saml's default request cache is per-process; single-instance/sticky routing is fine until then).

### 3.2 🟠 HIGH — Third-party security attestations not evidenced

SOC 2 Type II was targeted for Q1 2026; as of this review (2026-06-08) **no SOC 2 report, ISO 27001 certificate, or independent pen-test attestation is present in the repository or referenced as available.** Most enterprise pharma procurement will not sign without at least a SOC 2 Type II report (or a Type I + bridge letter) and a recent pen-test summary. *Action: confirm current audit status with Compliance; if achieved, publish to the trust center; if not, set a credible date and offer the bridge artifacts (security whitepaper, this evaluation, the CI-gate evidence).* 

### 3.3 ✅ HIGH — Hard-delete of regulated records (Part 11 §11.10(e)) — **REMEDIATED IN THIS PR**

Regulated tables previously permitted unaudited hard-deletes: `coauthor_documents` (`ectd-documents.ts`, `coauthor.ts`), `authoring_documents` (`authoring.router.ts`), and **`ind_applications`** (`ind.ts`) — actual IND submission records.

**Fix (landed):** a new fail-closed primitive `server/services/audit/regulatedDeletion.ts` (`logRegulatedDeletion`) writes a **hash-chained `audit_logs` row with a full pre-image snapshot** of the record into the immutable trail, reusing the same `computeAuditChain` serialization as `recordGovernedAction` (so the chain stays valid) but **decoupled from the c2c target resolver**. All four handlers now, in a **single transaction**: lock + load the pre-image (`SELECT … FOR UPDATE`) → `await logRegulatedDeletion(...)` → `DELETE` → `COMMIT`. An audit-write failure rolls the transaction back, so the delete never commits. This satisfies §11.10(e) (attributed, reason-stamped, time-stamped audit of the deletion) **and** §11.10(c) (the deleted record's content is retained, retrievable, in the tamper-evident chain). The four `check-regulated-delete-audit` allowlist entries are removed (the gate now runs with an **empty allowlist**), and a Part 11 contract test (`ind-applications-delete-audit-order.contract.test.ts`) proves audit-before-delete, fail-closed rollback, and no-op on 404/409.

**Follow-up (not blocking):** `deleted_at` *soft-delete* with read-path filtering (`deleted_at IS NULL`) across the ~30 read sites mapped for these tables is the stronger product ideal, but it requires the DB-backed integration test lane to verify no read path leaks/hides rows — deferred rather than done blind.

### 3.4 🟡 MEDIUM — Supply-chain hardening (partially remediated)

**Corrections to the initial automated read (verified against source):**
- **Secret scanning is present** — **GitGuardian** runs on every PR (`GitGuardian Security Checks`, observed green), so the "no secret scanning" finding was overstated; a `gitleaks` gate would be redundant.
- **The HIGH `tmp` advisory (GHSA-ph9p-34f9-6g65) is already handled** — not an open gap. `scripts/ci/audit-with-allowlist.mjs:37-43` documents it with a sound justification: `exceljs` calls `tmp` with fixed internal strings (not user-controlled prefix/postfix), so the path-traversal vector is unreachable; the entry self-expires when `exceljs` ships a release depending on `tmp >= 0.2.6`. `npm audit` is gated through this wrapper, and genuine new HIGH/CRITICAL advisories still fail it.

**✅ REMEDIATED IN THIS PR:** a **CycloneDX SBOM** is now generated on every CI run (`npm run sbom` → `npm sbom --sbom-format cyclonedx`) and published as a 90-day build artifact (`sbom-cyclonedx`) from the Security Scan job — the concrete artifact pharma vendor questionnaires increasingly request.

**Still open (deliberately not flipped blindly):** Trivy fs/config scans remain advisory (`continue-on-error: true`). Making them merge-blocking is the right end-state, but flipping it without a confirmed-clean baseline would turn the whole repo's CI red on every PR (the `.trivyignore` documents pre-existing IaC findings). *Action: run a full Trivy pass in the team's CI env, drive CRITICAL/HIGH to zero (or `.trivyignore` with justification), then remove `continue-on-error`.*

---

## 4. Domain scorecard

Ratings are A (client-CSO-ready) → C (questionnaire risk). "Enforced" means a CI gate blocks regression on every PR.

| # | Domain | Rating | One-line basis |
|---|---|:---:|---|
| 1 | **Authentication & session** | A− | JWT HS256 *pinned* + CI gate, bcrypt-12, NIST password policy, lockout, zero-downtime secret rotation. (SSO is the exception — §3.1.) |
| 2 | **MFA** | A− | TOTP (speakeasy) + email-OTP; AES-256-GCM secret storage; dev-skip double-gated and CI-enforced. Make org-level enforce-MFA the default. |
| 3 | **Authorization / RBAC** | B | Global `/api` auth gate (~99% coverage, regression-tested); role + membership model. No fine-grained (resource/project-level) permissions yet. |
| 4 | **Multi-tenant isolation** | A− | Primary boundary = JWT-derived org scoping (`authedOrgId`) + `check-tenant-isolation` CI gate + 22 contract suites/133 tests; Postgres RLS as defense-in-depth. IDOR sweep closed 8 findings (QC 2026-06-07). |
| 5 | **AI data governance** | A | Single audited gateway seam; residency + ZDR are *hard* constraints; air-gappable local inference; bypass CI ratchet burning down legacy callers. Best-in-segment. |
| 6 | **21 CFR Part 11 / GxP** | A− | SHA-256 hash-chained + HMAC tamper-proof audit, DB-trigger immutability, mandatory reason-for-change, e-signature manifests. 3 tracked gaps (§3.3, §5.4). |
| 7 | **Cryptography / secrets** | B+ | Fail-closed required secrets at boot, no hardcoded secrets, KMS/HSM signer mode designed. Field encryption is dev-grade in places; KMS signer not yet wired (DEV mode). |
| 8 | **HTTP hardening** | A | Helmet + per-request CSP nonce + `strict-dynamic`, HSTS preload, locked CORS allowlist, multi-tier Redis rate limits. |
| 9 | **Injection / input validation** | A | Drizzle parameterized throughout, Zod at boundaries, `ban-new-pool` enforced, file magic-byte checks, SSRF in webhooks closed. |
| 10 | **XSS** | A | DOMPurify (client + isomorphic) on all rendered markdown/HTML, CSP nonce, no unsanitized `dangerouslySetInnerHTML`. |
| 11 | **File upload** | A− | Magic-byte validation, size caps, tenant-scoped storage, ClamAV (note: fails *open* if scanner unreachable — monitor). |
| 12 | **DevSecOps / CI gates** | A− | Exceptional breadth of enforced gates; GitGuardian secret scanning + CycloneDX SBOM artifact; only Trivy fs/config remain advisory (§3.4). |
| 13 | **Logging / error handling** | A | Prod 5xx generic (no stack/PII leak), request-id hardening, and a **fail-closed Sentry `beforeSend` scrubber** (strips auth headers/cookies/user PII + backstops secret/email/SSN across the event) — landed in this PR. |
| 14 | **Org attestations (SOC2/ISO/pen-test)** | C | Not evidenced in repo (§3.2) — the main *non-code* blocker. |

---

## 5. Selected evidence (for the client auditor)

### 5.1 Tenant isolation — the boundary CSOs probe hardest
- Global gate: `server/bootstrap/register-platform-routes.ts:178` routes all non-allowlisted `/api/*` through `authMiddleware`; regression test `server/bootstrap/__tests__/api-auth-gate.test.ts`.
- Org id is sourced **only** from the verified JWT (`server/utils/authedOrgId.ts`), never from `req.params/query/body`; cross-tenant ids return **404** to avoid existence disclosure.
- QC sweep 2026-06-07 (`QC_SECURITY_REVIEW_2026-06-07.md`) found and **fixed 8 IDOR/auth issues** (global-compliance, intelligent-reports, foresight, branding, pm-settings, tenants-simple) and a forged-JWT collab-WebSocket bug; added 133 security tests now gating CI via a `security-tests` job that runs **independent of lint** so a regression always reports.
- Defense-in-depth: Postgres RLS (`server/db/tenantRls.ts`) with `check-rls-allowlist-sync` + `check-tenant-isolation` CI gates. **Recommendation:** move RLS to enforce-on by default and add a boot assertion, so RLS backstops the app-layer scoping rather than depending on an env var.

### 5.2 AI data governance — our differentiator with a regulated buyer
- **One seam:** `server/services/ai-gateway/gateway.ts:376` `route()` — "the ONLY method external code should call"; every call persisted to `ai.gateway_audit_log` (`ai-gateway/audit.ts`) with substrate/region/retention/prompt-hash (content **not** stored in plaintext).
- **Residency/ZDR as hard constraints:** `ai-gateway/providers/placement.ts` per-provider region+ZDR; per-org DB policy (`aiPlacementPolicies`); `gateway.ts` `meetsPlacementRequirements()` will *never* relax residency or ZDR to satisfy a model fallback. Bedrock/Vertex/Azure default ZDR-on; shared frontier APIs default ZDR-off until a signed agreement is set.
- **Air-gappable:** `AI_LOCAL_ENABLED` + local embeddings — fully on-prem inference, the gold standard for top-20 pharma. 
- **Bypass control (correcting an over-statement from an automated sub-sweep):** a CI gate **does** exist — `scripts/ci/check-gateway-bypass.mjs` with a ratchet baseline (`gateway-bypass-baseline.json`); recent commits (#695/#696) are actively migrating legacy direct-client callers onto the seam. *Open item:* finish burning down the baseline and flip to `--strict`.
- **Content classification exists** — `server/services/ai-governance/classification/index.ts` (`AI_CLASSIFIER_MODE=heuristic|slm`). *Open item:* confirm the classifier output **gates placement** (forces PHI/regulatory content to ZDR-only/local), not just labels it.
- **Prompt-injection:** high-precision detector (`ai-gateway/promptInjection.ts`, 20 tests) scoped to untrusted user messages, designed to avoid false positives on regulatory phrasing ("disregard prior adverse events" is allowed). *Open item:* no output-side validation / tool-schema gating yet.

### 5.3 21 CFR Part 11 / e-signatures
- Hash chain: `server/services/audit/chain.ts` (`sha256(content+prev)`, `SELECT … FOR UPDATE`), background integrity monitor (`chainIntegrityMonitor.ts`), tamper-proof log with DB trigger blocking UPDATE/DELETE and HMAC over the chain (`server/lib/tamper-proof-audit.ts`); `AUDIT_HMAC_SECRET` required in prod.
- E-signature: password + TOTP re-auth, deterministic signature hash + manifest, written to `electronic_signatures` and the central audit in one path (`server/routes/esignature.ts`). Signed, verifiable audit exports (`server/services/audit/signedAuditExport.ts`).
- Reason-for-change: mandatory (≥8 chars) on governed mutations, captured via PG session GUCs into version history (`server/routes/c2c/documents.ts`, `c2c/actions.ts`).

### 5.4 Part 11 open items (tracked, gated against regression)
1. Hard-delete of regulated records → soft-delete + audit (§3.3) — **highest priority**.
2. In-memory `auditLogger` at ~28 non-c2c call sites (se-matrix, defense-packet) → migrate to persistent hash-chained/HMAC store.
3. Immutability HTTP middleware only guards `/api/audit/*` → decide policy reach for other regulated tables.
4. Wire KMS/HSM signer (`CONCEPT2CURE_SIGNER_MODE=hsm_kms|hsm_vault`); DEV password+TOTP is acceptable only for early/pre-submission use.

---

## 6. Prioritized remediation roadmap

| Priority | Item | Owner | Effort | Gate when done |
|---|---|---|---|---|
| ~~P0~~ ✅ | SAML fail-closed + vetted-library rewrite + fail-closed tests + CI gate (§3.1) — **landed in this PR**; live-IdP interop + SCIM are follow-ups | Eng (Security) | done | `ci:saml-fail-closed` ✅ |
| **P0** | Confirm/publish SOC 2 Type II (or Type I + bridge) + pen-test summary (§3.2) | Compliance | Calendar | trust center |
| ~~P1~~ ✅ | Audit-before-delete (fail-closed, pre-image snapshot) for `ind_applications`/`coauthor_documents`/`authoring_documents` (§3.3) — **landed in this PR**; soft-delete read-filtering is the deferred follow-up | Eng | done | `check-regulated-delete-audit` allowlist = 0 ✅ |
| ~~P1~~ ◑ | §3.4: **SBOM landed** (CycloneDX artifact); secret scanning already present (GitGuardian) and the HIGH `tmp` advisory already justified-allowlisted — both corrected. **Remaining:** make Trivy gating once a clean baseline is confirmed | DevSecOps | partial | SBOM artifact ✅ |
| ~~P1~~ ◑ | SCIM provisioning/deprovisioning ✅ **core landed** (`/scim/v2` Users + deactivate); org-default enforce-MFA still open | Eng | partial | contract test ✅ |
| **P2** | Confirm classifier gates AI placement; finish gateway-bypass burn-down → `--strict` | Eng (AI) | ~1 wk | `check-gateway-bypass --strict` |
| **P2** | ~~RLS boot assertion~~ ✅ **landed** (loud prod warning if `RLS_ENFORCE`≠on; opt-in hard-fail via `RLS_REQUIRE_ENFORCE`); ~~Sentry `beforeSend` PII scrub~~ ✅ **landed**; remaining: flip RLS default to on (needs verified rollout), KMS signer wiring, retention/DR SOP | Eng/Compliance | partial | — |
| **P3** | Fine-grained (resource-level) RBAC; column-level encryption for PII; mTLS between services | Eng | Roadmap | — |

---

## 7. Questionnaire reconciliation (trust risk)

`C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md` (Feb 2026) answers **16.4 "Is SSO supported? ✅ Yes"** citing `server/routes/sso.ts`. This review finds SSO is *present but exploitable* (§3.1). Shipping that answer to a client whose pen-test then breaks the SSO flow is a credibility loss that can sink the whole evaluation. **Do not send any security questionnaire until §3.1 is fixed**, then answer SSO as "SAML 2.0 + OIDC via `<vendored library>`, signed assertions enforced, SCIM available," with the new CI gate as evidence. Similarly, soften "zero data retention" claims to "ZDR enforced per provider where a signed ZDR/BAA is in force; air-gapped/local inference available" — which is what the code actually guarantees.

---

## 8. What to lead with in front of a client CSO

Genuine strengths, all code-backed, that most competitors cannot show:
1. **AI data governance that a regulated buyer can verify** — one audited egress seam, residency + zero-retention as hard constraints, and a fully air-gappable on-prem inference option.
2. **21 CFR Part 11 that is real, not a checkbox** — tamper-evident hash-chained + HMAC audit with DB-enforced immutability, e-signatures, mandatory reason-for-change.
3. **Security enforced in CI, not just in policy** — tenant-isolation, JWT-pinning, no-dev-auth-in-prod, password-hygiene, regulated-delete-audit, gateway-bypass ratchet: regressions are blocked on every PR, and the security test job runs even when lint is red.
4. **A demonstrated, honest security process** — the QC sweep that found and fixed 8 IDOR issues and recorded its own false positives is exactly the maturity signal a CSO wants to see.

**Bottom line:** close the four blockers in §3 — above all the SAML auth bypass — and this platform presents as a credibly secure, GxP-aware, AI-governed system that a pharma/biotech/MDx CSO can defensibly approve for licensing.
