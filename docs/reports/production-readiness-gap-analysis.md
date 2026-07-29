# Production-Readiness Gap Analysis — ClinicalSageAI

_Consolidated from six independent read-only audits: observability/ops, test coverage & CI gates, security & auth, AI safety & grounding, 21 CFR Part 11 breadth, and external-data integrations. Scope excludes UI and DB schema (being addressed separately)._

## Headline verdict

This is a **mature, heavily-hardened platform**, not an MVP. Every audited dimension has substantive, well-engineered foundations:

- **Observability**: Sentry (fail-closed PII scrub), Pino redacting logger, OpenTelemetry, Prometheus + alert rules, Terraform IaC on AWS ECS, graceful shutdown, LLM circuit-breaker with provider fallback.
- **Testing/CI**: 1,515 test files, a 6-stage blocking CI with RLS/tenant-isolation/migration guardrails, CodeQL + Semgrep + Trivy, contract tests, 26 Playwright specs.
- **Security**: JWT with zero-downtime rotation, SAML+SCIM, MFA/TOTP, RBAC, CSRF double-submit, CSP nonces, HSTS, a 336-line prompt-injection library, encrypted credential vault.
- **AI safety**: runtime deterministic grounding check, a grounding CI eval gate, model-governance lockfile with drift detection, risk-tiered human-review gates, Part 11 signoff gates, a scope-guard that refuses data-integrity violations and hands off medical/legal advice.
- **Part 11**: SHA-256 hash-chain + HMAC-sealed audit log, a real e-signature route (password+MFA+signer binding), daily chain-integrity sweep, retention cron, draft IQ/OQ/PQ + a Part-11 traceability matrix.
- **Data integrations**: retry/backoff/timeout, graceful fallback to manual-search guidance, AES-256 encrypted per-tenant credential vault.

**The single dominant theme across all six audits:** the machinery exists but is **not fully enforced or wired in**. The fastest, highest-leverage path to market is to *flip the switches you already built* before building anything new.

---

## Cross-cutting theme #1 — "Built but not enforced" (flip these switches)

Each of these is infrastructure that already exists but runs in advisory/opt-in/partial mode:

| Switch | Current state | Evidence | Action |
|---|---|---|---|
| Coverage thresholds | Defined at 70/60/70/70 but **overridden to 0** in CI (`continue-on-error`) | `vitest.config.ts`, `.github/workflows/ci.yml` | Set a real floor; ratchet up per subsystem |
| TypeScript strictness | **~2,598 pre-existing errors**; only no-regression gated | `ci.yml` typecheck job | Freeze baseline; burn down; strict on new files |
| Postgres RLS | `RLS_REQUIRE_ENFORCE` defaults to **warn-only** | `.env.example`, `tenantIsolation.ts` | Enforce=on by default; fail startup if off in prod |
| Prompt-injection lib | Comprehensive lib, **not wired into the AnA chat/stream loop** | `server/lib/prompt-injection-protection.ts` (no callers in `server/services/ana/`) | Wrap all user-input + MCP-output paths |
| Grounding check | Runtime check runs but is **advisory** (doesn't block) | `grounding-core.ts`, `answer-grounding.ts` | Gate high-risk output on grounding score |
| AI eval gates | `eval:grounding`/`ai:eval-doc-quality` exist but **not in blocking CI** | `package.json` scripts, no CI job | Add as required CI gates |
| OpenTelemetry | Present but **opt-in** (`OTEL_ENABLED` off by default) | `telemetry/opentelemetry.ts` | Enable in prod + propagate trace context |
| Audit logging | Hash-chain robust but **~12.5% route coverage** | `auditService.ts` (58 of 463 routes) | Middleware default-capture or systematic per-route |
| E2E (Playwright) | 26 specs exist, **not gated in main CI** | `playwright.config.ts` | Add a gated E2E job |

None of these require new architecture — they are configuration, wiring, and coverage work.

---

## Tier 1 — Blocking for the first regulated paying customer

| # | Item | Owner | Type |
|---|---|---|---|
| 1 | **SME sign-off of generated regulatory content** — the 16 flows, ~440 auditor rules, and all ICH/CFR citations were LLM-generated and must be reviewed/certified by qualified regulatory-affairs professionals before customers rely on them | Compliance/RA | Process |
| 2 | **Field-level PII/PHI encryption at rest** — diagnosis codes, demographics, biomarkers are plaintext (only MFA secrets/API keys encrypted); HIPAA §164.312 + Part 11 expect this | Eng | Code |
| 3 | **Systematic tenant isolation** — enforce RLS by default; add a lint/test that fails on any org-unscoped query (today it's per-route + 23 contract tests) | Eng | Code |
| 4 | **Wire prompt-injection defense into the chat/stream + MCP-output paths** — the library isn't invoked in the hot path | Eng | Code |
| 5 | **Gate high-risk AI output on grounding** — make the grounding/confidence check blocking for drafting/compliance/submission tiers; add the eval gates to CI | Eng | Code |
| 6 | **Universal input validation** — Zod schema on every POST/PUT/PATCH; today only sensitive routes | Eng | Code |
| 7 | **Audit-trail coverage + integrity alerting** — extend audit logging to all regulated-record operations; make the chain-integrity sweep alert+quarantine on a break instead of only logging | Eng | Code |
| 8 | **E-signature verification endpoint** — can create signatures but not independently re-verify them (Part 11 §11.50) | Eng | Code |
| 9 | **SOC 2 Type II + HIPAA BAA readiness** — start early; multi-month lead times | Compliance | Process |
| 10 | **CSV execution** — IQ/OQ/PQ exist as drafts; execute + sign them and produce the Validation Summary Report | Compliance | Process |
| 11 | **Legal**: ToS with liability limitations scoped to regulatory-advice risk, user-visible "decision-support, not regulatory/legal advice" framing, DPAs, E&O insurance | Legal | Process |
| 12 | **External-data ToS/licensing review** — commercial redistribution of ClinicalTrials.gov / PubMed / ChEMBL / openFDA data needs documented attribution/permission | Legal/Eng | Process+Code |

## Tier 2 — Blocking for scale / real load

| # | Item | Owner | Type |
|---|---|---|---|
| 13 | Complete `/readyz` (add Redis + worker checks) so LBs don't route to degraded instances | Eng | Code |
| 14 | Load/performance testing — no k6/artillery baseline exists | Eng | Code |
| 15 | External-API rate limiting / quota / admission control (unbounded concurrent calls to NCBI/openFDA today) | Eng | Code |
| 16 | Strongly type external API responses (currently `any`) + schema-drift detection; fix the Lucene injection in the MAUDE query builder | Eng | Code |
| 17 | Caching beyond MAUDE (ClinicalTrials/PubMed/ChEMBL uncached) + data-staleness signaling to the model | Eng | Code |
| 18 | Ban `console.*` in server paths (~3,197 calls bypass Pino redaction — PII-leak + observability risk) | Eng | Code |
| 19 | Enable OTel in prod + propagate trace context across Node→Python→LLM | Eng | Code |
| 20 | Backup **restore** runbook + periodic restore testing + offsite/encrypted backups (backup scripts exist; restore path unproven) | Eng | Code+Process |
| 21 | LLM cost/quota circuit-breakers per tenant (usage metering exists; enforcement doesn't) | Eng | Code |

## Tier 3 — Fast-follow / hardening

| # | Item | Owner | Type |
|---|---|---|---|
| 22 | Per-document-type AI accuracy eval (CTD 2.5, 510(k), PMA, CER, NDA response) — currently unmeasured | Eng | Code |
| 23 | Artifact→model provenance link (tag each generated artifact with model_id + prompt_version + audit_log_id) | Eng | Code |
| 24 | Record-level access control + audit-log read scoping | Eng | Code |
| 25 | Schema-level immutability for approved records (today middleware-guarded, not DB-constrained) | Eng | Code |
| 26 | Burn down the ~2,598 TS errors; raise coverage on the ~41% of service modules with zero tests | Eng | Code |
| 27 | Enforce deterministic (temp=0) generation for high-risk drafting tiers | Eng | Code |
| 28 | Retention floor for audit_logs / e-signatures / submissions (GDPR-erasure vs Part 11 retention tension) | Eng+Compliance | Code+Process |
| 29 | Trusted time source / NTP-sync verification for audit + signature timestamps | Eng | Code |
| 30 | Add DAST (OWASP ZAP/Burp) to CI; secret-rotation playbook for third-party keys | Eng | Code+Process |

---

## The one thing that matters most

For a product whose value proposition is *telling regulated companies what the FDA/EMA expects*, **Tier 1 #1 (SME validation of the generated content) and #5 (grounding-gated, eval-gated AI output) are existential**. Everything else is standard enterprise-SaaS hardening that this codebase is already well-positioned for. If the regulatory guidance is wrong, no amount of SOC 2 or encryption saves the product — and conversely, the strong safety scaffolding here (scope-guard, review gates, grounding eval, model lockfile) means the gap is *enforcement and expert validation*, not invention.
