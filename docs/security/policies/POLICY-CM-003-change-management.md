# POLICY-CM-003 — Change Management Policy (DRAFT)

**Owner:** Founder. **TSC:** CC8.1. **GxP:** validated-state maintenance (CSA).

## 1. Source control
| Control | Status | Evidence |
|---|---|---|
| Single canonical branch; no long-lived forks | **Implemented** | `CLAUDE.md` Rule 0; `.husky/pre-push` refuses agent branches unconditionally |
| Every change attributable (author, session link) | **Implemented** | commit trailers (`Co-Authored-By`, `Claude-Session`) |
| Peer review before merge | **Partial** — control-tower review of AI worker sessions; single human, so no independent human reviewer | `AGENTS.md` Control-Tower Execution Model |

## 2. Pre-merge gates (all run in CI, most also in `pre-push`)
| Gate | Status | Evidence |
|---|---|---|
| Unit/integration tests (vitest, jest) | **Implemented** | `.github/workflows/ci.yml` |
| Static analysis: CodeQL, Semgrep, ESLint warning ratchet | **Implemented** | `.github/workflows/codeql.yml`, `semgrep.yml`; ESLint baseline (warnings may only shrink) |
| Dependency advisory gate sealed to the lockfile | **Implemented** | `scripts/ci/check-dependency-risk.mjs`, `docs/security/dependency-risk-ledger.json` |
| Migration safety: every migration replays; DROPs must be amendments | **Implemented** | `CLAUDE.md` Rule 1; `npm run ci:migration-drop-safety` |
| Fixture/mocks cannot reach production routes | **Implemented** | `ci:fixture-fallback`, `ci:no-mock-in-prod-routes` |
| Tenant-isolation gates | **Implemented** | `ci:tenant-*` scripts |
| Gateway bypass check (every AI call through `getGateway()`) | **Implemented** | `scripts/ci/check-gateway-bypass.mjs` |
| Environment-variable documentation gate | **Implemented** | `docs/runbooks/env-var-documentation-gate.md` |

## 3. Deployment
| Control | Status | Evidence |
|---|---|---|
| Image built once, promoted staging → production | **Partial** — workflow exists, production environment not yet applied | `.github/workflows/deploy-aws.yml`, `terraform/environments/{staging,production}` |
| Infrastructure as code, plan reviewed before apply | **Partial** | `terraform/`, `.github/workflows/terraform-compliance.yml` |
| Boot-time posture asserts stop a misconfigured release | **Implemented** | see POLICY-IS-001 §3 |
| Readiness probe gates traffic | **Implemented** | `/readyz` (`server/startup/inline-endpoints.ts:76`) |
| Rollback procedure documented and tested | **Planned** | — |

## 4. Validated state (GxP)
| Control | Status | Evidence |
|---|---|---|
| Change impact recorded against the traceability matrix; OQ re-executed for affected requirements | **Planned** — validation package is row D4 | `docs/evidence/validation/` (to be created) |
| Emergency changes reviewed after the fact within 5 business days | **Planned** | — |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
