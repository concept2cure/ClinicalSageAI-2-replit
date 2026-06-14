# GA Readiness Audit — Executive Summary

**Platform:** Concept2Cure RIAI (ClinicalSageAI-2) — regulated, multi-tenant clinical/regulatory SaaS
**Date:** 2026-06-14
**Scope:** Backend/server code, shared libraries, Python services, infrastructure, CI/CD, build, and dependencies. **Out of scope by request:** the React UI (`client/`) and raw DB schema/migration design.
**Method:** Net-new independent review conducted by a swarm of nine specialist auditor agents, each owning one domain and a slice of the tree. No prior audit report in the repo was consulted. Every finding is verified against source and cited as `file:line`. The Security domain was independently double-run, and its findings were reconciled (the deeper injection/SSRF/traversal results supersede the broader IDOR-sweep's "clean" conclusions where they conflict).

---

## Overall verdict: **NOT READY for GA**

The platform has a **genuinely strong engineering foundation** — a hardened security perimeter (HS256-pinned JWT, fail-closed SAML, bcrypt/MFA/lockout, strict CORS/CSP/CSRF), a well-tuned shared Postgres pool with a resilient AI gateway, graceful shutdown and crash handlers, a redacting logger with Sentry, a production-grade encrypted Multi-AZ AWS architecture with OIDC deploys, and ~40 bespoke governance CI gates. This is not an immature codebase.

**But it is not GA-ready**, because the controls that define this product's core risk surface — **multi-tenant data isolation** and **21 CFR Part 11 audit/record integrity** — are not reliably enforced, and the **test/CI safety nets that should have caught these gaps do not actually execute**. There are **16 launch-blocking defects**, including two distinct remote-code-execution paths, a cluster of cross-tenant IDOR vulnerabilities (one of which can transmit another tenant's submission to the FDA), an audit trail that is mutable and unverifiable on its canonical path, and a regulated artifact generator that fabricates clinical efficacy numbers into a submittable document.

These are **fixable without re-architecture** — they are scoping bugs, missing guards, config hardening, and CI provisioning, not structural flaws. But they must be closed and regression-tested before GA.

---

## Severity rollup by domain

| # | Domain | Verdict | BLOCKER | HIGH | MED | LOW |
|---|--------|---------|:-:|:-:|:-:|:-:|
| 01 | Security & Authentication | **NOT READY** | 7 | 5 | 6 | 5 |
| 02 | Reliability & Error Handling | Conditional | 0 | 3 | 4 | 2 |
| 03 | Regulatory Compliance & Data Integrity | **NOT READY** | 4 | 5 | 4 | 2 |
| 04 | API & Route Contracts | Conditional | 0 | 4 | 5 | 3 |
| 05 | Performance & Scalability | Conditional | 0 | 4 | 4 | 2 |
| 06 | Observability & Operations | Conditional | 0 | 4 | 5 | 3 |
| 07 | Infrastructure, Deployment & CI/CD | Conditional | 2 | 6 | 7 | 4 |
| 08 | Testing, Build & Dependencies | Conditional (→ Not Ready) | 0 | 1 | 4 | 4 |
| 09 | Python Services | **NOT READY** | 3 | 5 | 6 | 3 |
| | **TOTAL** | **NOT READY** | **16** | **37** | **45** | **28** |

Some findings are corroborated across domains (e.g. the eCTD fabricated-data and faers-bridge injection appear in both Compliance/Security and Python); these are cross-referenced rather than deduplicated out, because each domain's fix owner differs.

---

## The 16 launch-blocking defects (must fix before GA)

### A. Remote code execution (2)
1. **Post-auth OS command injection / RCE** — `server/routes/analytics-routes.ts:128,148`. PDF-extracted text interpolated into a `child_process.exec` shell string. Any authenticated tenant user → arbitrary commands on the shared host. *(Security B-7)*
2. **Python code injection / RCE** — `server/faers-bridge.js:24-58`. `ndcCode`/`productName` interpolated into generated Python source executed via `spawn`. Latent (no live caller) but ships as-is. *(Python B-1)*

### B. Cross-tenant data exposure & regulatory mutation — IDOR cluster (4)
3. **Clinical-ops IDOR (read)** — `server/routes/clinical-operations-routes.ts:527` (+ monitoring-visits, deviations, milestones, forecast). Child tables queried `WHERE study_id = $1` from params with no org scoping → read another tenant's enrollment data and protocol deviations. *(Security B-1)*
4. **FDA ESG submission IDOR** — `server/services/ESGSubmissionService.ts:136`. Project fetched by `projectId` only → **transmit another tenant's submission to the FDA** (irreversible). *(Security B-2)*
5. **510k workflow IDOR + body-supplied tenant** — `server/routes/510k-workflow-routes.ts:23`. Reads `organizationId` from `req.body`; cross-tenant write + tenant-claim forgery. *(Security B-3)*
6. **FDA form generation IDOR** — `server/routes/fda-forms.routes.ts:118` → `fetchProjectData`. Generate/export FDA forms populated with another tenant's data. *(Security B-4)*

### C. Auth-boundary & secret exposure (3)
7. **Unauthenticated `/uploads` static mount** — `server/bootstrap/register-inline-routes.ts:225`. `express.static('/tmp/uploads')` outside the `/api` gate, no tenant scoping. *(Security B-5)*
8. **Hardcoded credential-vault AES key** — `server/services/integrations/credentialVault.ts:21`. Baked-in default key with no production guard → stored tenant credentials decryptable by anyone with the bundle. *(Security B-6)*
9. **Unauthenticated Python generation service** — `services/api.py`. All routes unauthenticated; attacker-controlled `template_path` → host-file disclosure into output DOCX; unscoped `job_id` → cross-tenant artifact download by enumeration. *(Python B-2)*

### D. 21 CFR Part 11 / data-integrity failures (5)
10. **Canonical audit path is unchained & mutable** — `server/services/.../auditService.ts:198`; the Drizzle `auditLogs` table has no `sha256_chain`/`hmac_seal`. Most audited actions stored mutable. *(Compliance B-1)*
11. **Audit writes are fire-and-forget, outside the action transaction** — `auditService.ts:213`, `esignature.ts:254`. A crash yields "ghost actions": approvals/signatures/deletes with no record. *(Compliance B-2)*
12. **Audit retrieval reads a volatile in-memory array capped at 10k** — `auditLogger.ts:55,137`. Inspection copies incomplete; lost on restart. *(Compliance B-3)*
13. **Integrity verification reports `ok:true` when the HMAC seal is skipped** — `audit-integrity-service.ts:41`; keyless sha256 chain is forgeable by anyone with DB write. *(Compliance B-4)*
14. **eCTD generator fabricates clinical efficacy data** — `services/ectd_generator.py:236-247`. When input lacks tables, emits hardcoded systolic-BP endpoint numbers into a COMPLETED "Module 2.7.3 Clinical Summary" with no DRAFT/watermark. *(Python B-3 / Compliance HIGH)*

### E. Infrastructure reproducibility & supply chain (2)
15. **Production ECS runs mutable `:latest` image tags** — `terraform/environments/production/main.tf:114`; `deploy-aws.yml:104`. No digest pinning, no atomic rollback, no "what is in prod?" answer. *(Infra B-1)*
16. **No GitHub Action is SHA-pinned** — all on floating tags incl. `checkov-action@master` (`terraform-compliance.yml:25`); these workflows hold the prod AWS deploy role. *(Infra B-2)*

---

## Cross-cutting themes (the systemic root causes)

These are why the individual blockers exist, and fixing them prevents recurrence:

1. **Multi-tenant isolation rests on a single, leaky layer with no backstop and no test.** Application-layer org scoping is the *only* enforcement, it has the IDOR holes above, **Postgres RLS ships in shadow mode (off) by default** (`server/db/rlsEnforcement.ts`, `migrations/0021_*`), and the **tenant-isolation/RLS integration tests self-skip in CI** because the Test job runs without a database. Three independent layers that should defend tenancy are each disabled.

2. **The audit/record-integrity story is fragmented and unverifiable.** Five disjoint audit sinks, an unchained canonical path, fire-and-forget writes, in-memory retrieval, and an integrity checker that greenlights unsealed records — combined with forgeable actor identity (`x-user-id` headers, Security M-1) and fabricated regulated content. For a Part 11 product this is the highest-stakes theme.

3. **CI provides false assurance precisely where risk is highest.** The DB-less Test job lets safety-critical suites pass by being skipped; coverage thresholds are never enforced (no `--coverage`); Trivy fs/config scans and SAST are `continue-on-error`; the production deploy gates only on `lint`+`test`, bypassing the rich guardrails; and the route-mount audit passes vacuously (targets the wrong entrypoint). The ~40 governance gates create confidence that the running pipeline does not earn.

4. **Untrusted input reaches dangerous sinks.** Two RCE paths, connector SSRF (tenant-controlled `baseUrl`/`tokenEndpoint` → cloud-metadata theft), and three path-traversal endpoints — all from request/content data flowing into `exec`/`fetch`/`fs` without validation.

5. **Reliability under real concurrent load is unproven.** Unguarded transaction ROLLBACK recirculates poisoned pool connections (Reliability H-1, ~266 callers); N+1 patterns can exhaust the pool for all tenants; the eCTD ZIP is built fully in heap (OOM); Celery tasks lack retry/idempotency/dead-letter.

---

## Recommended path to GA

**Phase 1 — Close the 16 blockers (hard gate).**
- RCE: replace `exec` shell strings with `execFile`/argv in `analytics-routes.ts` and `faers-bridge.js`.
- IDOR: org-scope every `studyId`/`projectId` lookup; never read `organizationId` from body/headers; add a cross-tenant contract test per endpoint.
- Auth surfaces: lock down `/uploads` and `services/api.py`; add the credential-vault production key guard.
- Part 11: standardize on the one sound sink (the C2C in-transaction chain+seal model), make audit writes transactional, make integrity-verify fail-closed on unsealed records, and remove the eCTD placeholder-data path (fail or watermark instead).
- Infra: pin prod images by digest; SHA-pin all GitHub Actions.

**Phase 2 — Restore the safety nets (so blockers can't silently return).**
- Provision a Postgres service in the CI Test job; make skipped safety suites a failure, not a pass. Enforce `--coverage` thresholds.
- Flip `RLS_ENFORCE=on` in production and burn down the 28 baseline unscoped query sites; then set `RLS_REQUIRE_ENFORCE=true`.
- Remove `continue-on-error` from Trivy/SAST for high-severity findings; route the prod deploy through the full gate set; fix the route-mount audit entrypoint.

**Phase 3 — Address the 37 HIGH findings** (reliability transaction handling, performance N+1/streaming, observability `console.*` redaction + `/readyz` dependency checks + metrics auth, API validation/spec-drift, infra HIGHs) **before or during the first GA weeks**, per the per-domain reports.

---

## Per-domain reports

| File | Domain |
|------|--------|
| `01-security-auth.md` | Security & Authentication |
| `02-reliability-errors.md` | Reliability & Error Handling |
| `03-compliance-integrity.md` | Regulatory Compliance & Data Integrity |
| `04-api-routes.md` | API & Route Contracts |
| `05-performance-scalability.md` | Performance & Scalability |
| `06-observability-ops.md` | Observability & Operations |
| `07-infra-deploy-cicd.md` | Infrastructure, Deployment & CI/CD |
| `08-testing-build-deps.md` | Testing, Build & Dependencies |
| `09-python-services.md` | Python Services |

*Each section contains the full finding list with `file:line` evidence, GA impact, and recommended fixes. Severity tags: BLOCKER (must fix before GA) / HIGH / MEDIUM / LOW.*
