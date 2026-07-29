# AI Brain Consolidation Plan (issue #844)

**Date:** 2026-06-16
**Goal:** Collapse the overlapping AI "brains" into the single `ana-ri` spine (`/api/ana-ri` + AI-Gateway + AI-Actions), without dropping real IP or breaking the live client.
**Basis:** Two code-grounded investigation agents (caller-map + capability-classification). Branch: `claude/phase0-rls-ai-consolidation`.

## Current surfaces

| Module | Mount | Live client caller? | Verdict |
|---|---|---|---|
| `ana-ri` (`routes/ana-ri/*`) | `/api/ana-ri` | — (target spine via `useAnaChat`) | **CANONICAL — keep** |
| `cortex-unified.ts` | `/api/cortex` | **Yes** — `client/.../services/cortexService.ts` calls `/api/cortex/{chat,search,health,stats}` | **Keep until client migrates** (see Step 2) |
| `cortexRoutes.ts` | sub-mount of `/api/cortex` | `/search` only | Merge into unified; **epistemic/causal/transfer/evolution endpoints call non-existent DB functions → dead** |
| `cortexQueryRoutes.ts` | sub-mount `/api/cortex/query` | No (only `/stats`, duplicated) | Retire sub-mount |
| `cortexAdvisoryRoutes.ts` | sub-mount `/api/cortex/advisory` | No (client calls `/advisory/signals` & `/predictions` which **don't exist** → graceful 404) | Migrate real logic, then retire |
| `cortexManagementRoutes.ts` | `/api/cortex/management` | No (client fallback ignores 404) | Real KG-admin logic, no callers → migrate or keep as isolated admin tier |
| `cognitive-ecosystem.ts` | `/api/cognitive` | No | **RETIRED in this PR — pure mock** |

## Capability classification (what must be preserved)

**UNIQUE-REAL — migrate into `ana-ri` before retiring the source:**
- **IND Pyramid risk framework** + **pyramid-weighted readiness score** (`cortexAdvisoryRoutes.ts`) → fold into `ana-ri/deficiency-taxonomy.ts` + `command-executor.ts computeReadinessScore`.
- **510(k) device section guidance** (`cortexAdvisoryRoutes.ts DEVICE_510K_SECTIONS`) → `ana-ri` device pathway.
- **Knowledge-graph admin** — atom quality, conflict detection, version history/audit (`cortexManagementRoutes.ts` + `atomQualityService`/`conflictDetectionService`/`atomVersionService`). Real schema (`cortex.atoms`/`cortex.edges`). **Recommend keep as an isolated KB-admin service tier** rather than fold into the chat spine.

**DUP — already provided by `ana-ri`, safe to drop after client migration:**
- Rejection-pattern matching → `ana-ri/deficiency-taxonomy` + `context-enrichment`.
- Proactive guidance → `ana-ri/orchestrator` + `industry-wisdom-pack`.
- Project memory / similar learnings → `ana-ri/command-executor` context + `industry-wisdom-pack`.
- Regulatory signal extraction / prediction → `ana-ri/orchestrator` + `evidence-validation` + AI-gateway.
- Semantic search / advisory query modes → `ana-ri/ragRouter` + `orchestrator`.

**MOCK/STUB — safe to drop immediately (call non-existent DB functions or return fixtures):**
- `cortexRoutes` epistemic uncertainty, causal effect, counterfactual, cross-domain transfer, self-evolving distillation (DB functions `cortex.estimate_uncertainty/…` **do not exist**).
- Entire `cognitive-ecosystem` (agent runtime, FHIR, manufacturing twins, federated learning — hardcoded responses). ← **retired in this PR**.

## Sequenced rollout

1. **This PR (safe, zero-dependent):** retire `cognitive-ecosystem` registration. ✅
2. **Client migration (#845):** move `cortexService.ts`/`useCortex` callers to `useAnaChat`/`/api/ana-ri`. This unblocks retiring the `/api/cortex` surface.
3. **Migrate UNIQUE-REAL logic** (IND pyramid, readiness weighting, 510(k) sections) into `ana-ri`; add tests.
4. **Drop DUP + MOCK** cortex sub-mounts (`cortexAdvisoryRoutes`, `cortexQueryRoutes`, dead `cortexRoutes` endpoints); collapse remaining real handlers into `cortex-unified` or `ana-ri`.
5. **Decide KG-admin home:** keep `cortexManagementRoutes` as an isolated `/api/kb-admin` tier OR fold into `ana-ri`. Recommend isolated tier (admin/compliance separation).
6. **Retire `/api/cortex`** once steps 2–5 land; `ana-ri` is the sole AI entry path.

**Guardrail:** do not unregister `cortex-unified` or the `/search`/`/chat` handlers until Step 2 is merged — the live client depends on them.

https://claude.ai/code/session_01PEmJuGi3Jd724WYLDWVX8K
