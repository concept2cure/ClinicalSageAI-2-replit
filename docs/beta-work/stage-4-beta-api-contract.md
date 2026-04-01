# Stage 4 — Beta Backend API Contract (Green/Yellow/Red)

Stage: Stage 4 — Backend Route Manifest and Beta Smoke Net  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `e69c7705` (`e69c7705c0bf6f6139784d872ec04e448e10441b`)

## Contract intent

Define a defendable external beta backend contract tied to current `server/index.ts` mount evidence and Stage 4 smoke coverage.  
This is an **operational contract** (what we keep green through cleanup), not a full product capability map.

## Green route families (external beta contract)

These are part of the beta-safe backend contract and should remain green through front-end cleanup.

| Family | Prefixes / entrypoints | Why green |
|---|---|---|
| Auth gateway | `/api/auth/*`, legacy `/api/login|logout|register` redirects | Explicit global gateway + open-prefix policy in `server/index.ts`; still required for all protected `/api/*` access. |
| Concept2Cure core API | `/api/concept2cure/*` | Canonical project/workspace backend with tenant + org enforcement chain in router. |
| Concept2Cure compute plane | `/api/concept2cure/compute/*` | Explicit compute plane mount; scoped policy/tenant/auth stack in compute router. |
| AnA RI API | `/api/ana-ri/*` | Mounted behind circuit breaker; shared success/error envelope helpers; core RI endpoints visible and smoke-covered. |
| Chat gateway | `/api/chat` | Explicit mount and lightweight deterministic invalid-message behavior validated in smoke net. |
| Authoring surfaces | `/api/document-authoring/*`, `/api/authoring/*`, `/api/authoring-actions/*` | Explicitly mounted authoring families required for governed document workflows. |
| CERV2 / 510k entry surfaces | `/api/cerv2/*`, `/api/510k-project/*`, `/api/510k-workflow/*` | Still exposed from control plane; part of beta device/regulatory workflows. |
| Vault / documents surfaces | `/api/vault/*`, `/api/documents/*` | Material routes mounted and stacked; must stay green while ownership is narrowed later. |
| eCTD / IND entry surfaces | `/api/ectd-validate/*`, `/api/ectd-compile/*`, `/api/ectd/export/*`, `/api/ectd-submissions/*`, `/api/ind/*` | Exposed and active in mount graph; required by dossier/submission workflows. |
| Evidence ingress surfaces | `/api/firecrawl/*`, `/api/external-evidence/*`, `/api/evidence*`, `/api/evidence-fabric/*` | Exposed and in active flow; keep green while deduplicating ownership later. |

## Yellow route families (keep available, but not a stable public commitment yet)

| Family | Prefixes / entrypoints | Why yellow |
|---|---|---|
| `/api/ind` split ownership | `/api/ind` mounted by `indGenerationRoutes` and later `indRoutes.default` | Duplicate prefix owners in bootstrap create ordering risk; keep green but do not over-promise behavior stability until convergence. |
| `/api/documents` multi-owner stack | `versionDiffRoutes`, `documentsUnified`, `sourceLinksRoutes`, `documentIntelligenceRoutes` all under `/api/documents` | Layered mounts imply behavior depends on route order and internal path overlaps. |
| `/api/ana` parallel family | `/api/ana/*` plus `/api/ana-ri/*` plus `/api/chat` | User-facing outcomes may overlap; canonical interaction path should continue to be clarified by stage. |
| `/api/v1/*` public API | `/api/v1` with API-key semantics in route module | Global `/api` auth middleware allowlist does not currently include `/api/v1`; treat as caution/compat until auth boundary is explicitly reconciled. |

## Red route families (not external beta contract)

| Family | Prefixes / entrypoints | Why red |
|---|---|---|
| Legacy AnA direct endpoint | `/api/ask-ana-ri` | Parallel legacy-style route in `server/index.ts`; not part of canonical RI contract. |
| Deprecated foresight compatibility layer | `/api/foresight*`, `/api/foresight/rag` | Explicit deprecation + sunset + canonical link headers indicate compatibility path, not contract-forward path. |
| Dev/diagnostic routes | `/api/diag`, `/api/integration-test`, operational diagnostics | Helpful internally, not part of external beta contract. |

## Smoke net proving this contract

### Stage 4 smoke assertions added

- `server/__tests__/routes/smoke.test.ts` now includes **Stage 4 backend beta contract smoke net** checks for:
  - canonical mounts in `server/index.ts` (auth, concept2cure, compute, ana-ri, chat, authoring, cerv2/510k, vault/documents, eCTD/IND, evidence)
  - concept2cure tenant-scoped middleware chain and envelope helpers
  - ana-ri core endpoint and envelope helper presence
  - CERV2/vault/document-data-center/eCTD/IND entry route visibility
  - deterministic lightweight behavior checks:
    - `POST /api/ectd-validate/quick` with missing payload -> `400`
    - `POST /api/chat` with missing message -> `400` + `INVALID_MESSAGE`

### Smoke command

- `npx vitest run --config vitest.config.ts server/__tests__/routes/smoke.test.ts`

### Smoke net scope reality check

The Stage 4 smoke net is primarily a **manifest/mount/contract-presence tripwire** plus a few deterministic endpoint checks (`/api/chat` invalid-message and `/api/ectd-validate/quick` invalid payload).
It is not a full end-to-end integration proof for every green family.

## Unsupported / hidden-by-contract guidance for beta

- Do not expose `/api/ask-ana-ri` as part of external beta API docs.
- Do not document deprecated `/api/foresight*` routes as first-class beta contract.
- Keep `/api/v1/*` in a caution bucket until auth-boundary behavior is explicitly reconciled.

