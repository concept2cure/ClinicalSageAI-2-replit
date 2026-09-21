# POLICY-VM-006 — Vendor and AI-Model Governance Policy (DRAFT)

**Owner:** Founder. **TSC:** CC9.2, CC3.2.

## 1. Vendor inventory (sub-processors)
| Vendor | Purpose | Data | Contract status |
|---|---|---|---|
| Amazon Web Services | hosting, RDS, S3, KMS, Secrets Manager, CloudTrail | all tenant data at rest | **Planned** — account/BAA not yet in place (row D1) |
| Anthropic | Claude models via the AI gateway | prompts and retrieved context for governed drafting | **Planned** — BAA not signed; ZDR not requested (see POLICY-DR-007) |
| OpenAI, Moonshot, Google Vertex, Azure OpenAI, AWS Bedrock | alternate generation lanes | only under placement approvals | **Planned** — no contracts; lanes disabled by default |
| GitHub | source control, CI | source code, no tenant data | in use |
| Neon (preview databases) | CI/preview only | synthetic data | in use, non-production |
| Stripe, SendGrid, Redis | billing, e-mail, cache | account e-mail, payment tokens | optional; not in launch scope |

## 2. Vendor controls
| Control | Status | Evidence |
|---|---|---|
| Sub-processor list published and tenants notified of changes | **Planned** | `TRUST_STATEMENT.md` carries the first list |
| Vendor security review (SOC 2 report / ISO cert on file) before production use | **Planned** | — |
| New production dependency requires a written justification | **Implemented** | `AGENTS.md`; `docs/security/DEPENDENCIES.md` |
| Dependency advisories gated in CI and sealed to the lockfile | **Implemented** | `scripts/ci/check-dependency-risk.mjs` |

## 3. AI-model governance (the multi-model rule)
| Control | Status | Evidence |
|---|---|---|
| Every selectable model is an approved-models registry entry with pinned version, rationale and eval reference | **Implemented** | `server/services/ai-governance/approved-models.ts` |
| Only PQ-passed models serve high-risk regulatory drafting; `riskTier` capped otherwise | **Partial** — tiers exist; PQ evidence for the launch model not yet filed | `server/eval/rag/`, `server/eval/doc-quality/` |
| Every model call goes through the gateway (CI-enforced) | **Implemented** | `scripts/ci/check-gateway-bypass.mjs`; `server/services/ai-gateway/gateway.ts` |
| Provider placement (region, ZDR) is an explicit approval; failover never crosses residency/ZDR | **Implemented** | `AI_PROVIDER_PLACEMENT_APPROVALS`, `server/services/ai-gateway/sensitive-placement-policy.ts`; `gateway.ts:2298-2344` |
| PII screen and groundedness gate on AI traffic, visible at boot | **Implemented** (defaults: PII `block`; posture warned at boot) | `server/startup/ai-governance-posture.ts` |
| Numbers, verdicts and governed content come from deterministic engines; the model narrates | **Implemented as rule; enforced per-tool** | `CLAUDE.md` Rule 2; `docs/LAUNCH_DEFINITION_OF_DONE.md` |
| Model change = change under POLICY-CM-003 with eval re-run | **Planned** | — |

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
