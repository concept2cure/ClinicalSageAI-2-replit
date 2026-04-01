# Stage 4 — Backend Route Manifest and Beta Smoke Net

Stage: Stage 4 — Backend Route Manifest and Beta Smoke Net  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `e69c7705` (`e69c7705c0bf6f6139784d872ec04e448e10441b`) (delivered Stage 4 commit)

## Scope reviewed

- `server/index.ts` (control-plane mount order)
- `server/routes/concept2cure.ts`
- `server/routes/ana-ri.ts`
- Route families mounted from `server/index.ts` relevant to beta external behavior

## Classification rubric

- **canonical**: explicitly primary surface or core product gateway
- **compatibility**: alias/legacy/redirect/deprecation bridge
- **preview**: explicitly preview-oriented surface
- **unknown**: mounted and active, but canonicality not explicit in code
- **dev-only**: development/QA/testing-only mount or comment-gated path

## Material backend route family manifest (from `server/index.ts` mount evidence)

| Route family | Mount evidence | Classification | Beta critical | Notes |
|---|---|---|---|---|
| Fast health probes (`/healthz`, `/readyz`, `/api/health`, `/api/health/full`) | `server/index.ts:261-272`, `:406-416` | canonical | Yes | Core uptime/readiness contract during beta. |
| Auth router (`/api/auth`) | `server/index.ts:522` | canonical | Yes | Primary auth route family. |
| Auth compatibility alias (`/api/v1/auth`) | `server/index.ts:524` | compatibility | Yes | Alias to same auth router. |
| Legacy auth redirects (`/api/login`, `/api/logout`, `/api/register`) | `server/index.ts:551-562` | compatibility | Yes | Redirect-only bridge to `/api/auth/*`. |
| Enterprise auth (`/api/auth/enterprise`) | `server/index.ts:572` | unknown | Yes | Mounted and active. |
| SSO auth (`/api/auth/sso`) | `server/index.ts:590` | dev-only | No | In-code comment marks developer/testing usage. |
| Global `/api` JWT gate | `server/index.ts:600-622` | canonical | Yes | Enforces auth for nearly all `/api/*` except allowlist prefixes. |
| Public API (`/api/v1`) | `server/index.ts:1828` | compatibility | Yellow | API-key contract exists in `public-api.ts`, but still inside global `/api` auth envelope in index order. |
| Concept2Cure core (`/api/concept2cure`) | `server/index.ts:3951`; router hardening `concept2cure.ts:149-152` | canonical | Yes | Product API spine with auth + tenant + org middleware. |
| Concept2Cure compute (`/api/concept2cure/compute`) | `server/index.ts:3956`; `compute.ts:28-31` | canonical | Yes | Compute plane behind same auth/tenant/org stack. |
| AnA RI (`/api/ana-ri`) | `server/index.ts:3866`; core endpoints in `ana-ri.ts:187,744,1430,1474,1537` | canonical | Yes | Mounted behind circuit breaker. |
| Chat spine (`/api/chat`) | `server/index.ts:3917`; `chat.ts:992-993` | canonical | Yes | Active chat API with root alias and `/send-message`. |
| Legacy RI endpoint (`/api/ask-ana-ri`) | `server/index.ts:3198` | compatibility | No | Parallel RI surface; should not be primary beta contract. |
| AnA feature families (`/api/ana`, `/api/ana/platform`, `/api/ana-cortex`, `/api/ana-1-0-ri-cortex`, `/api/ana-cortex-ft`) | `server/index.ts:1045-1046`, `:3860`, `:3909`, `:7429` | compatibility | Yellow | Multiple parallel AnA surfaces; canonicality split. |
| Document authoring (`/api/document-authoring`) | `server/index.ts:1523` | canonical | Yes | Distinct authoring route family. |
| Authoring compatibility mounts (`/api/authoring`, `/api/authoring-actions`) | `server/index.ts:3891`, `:3900` | compatibility | Yes | Additional authoring surfaces still externally reachable. |
| CERV2 docs (`/api/cerv2`) | `server/index.ts:1434`; `cerv2-document-routes.ts:79` | canonical | Yes | Direct beta document family. |
| CERV2 aux (`/api/cerv2-sections`, `/api/cerv2-versions`) | `server/index.ts:1740`, `:1750` | compatibility | Yes | Adjacent CERV2 support routes. |
| 510(k) project (`/api/510k-project`) | `server/index.ts:4557` | canonical | Yes | Beta entry family for 510(k) projects. |
| 510(k) workflow (`/api/510k-workflow/*`) | `server/index.ts:4100+` | unknown | Yes | Inline handlers in control-plane; high-change risk. |
| eCTD family (`/api/coauthor`, `/api/ectd-documents`, `/api/ectd-validate`, `/api/ectd-compile`, `/api/ectd/export`, `/api/ectd-submissions`) | `server/index.ts:1532-1547` | canonical | Yes | Explicit mount pack under eCTD block. |
| IND generation (`/api/ind`) | `server/index.ts:3922`, `:6996` | unknown | Yes | Mounted twice from different modules; ownership ambiguous. |
| IND subfamilies (`/api/ind-wizard`, `/api/ind-templates`, `/api/ind-submissions`, `/api/ind-database`, `/api/ind-automation`, `/api/ind-autodraft`, `/api/ind-pdf`, `/api/ind-sections`) | `server/index.ts:1580-1602`, `:7272-7360` | unknown | Yes | Beta-visible but split across many modules. |
| Vault (`/api/vault`) | `server/index.ts:7150`; routes in `vault-auto.ts:6,29` | canonical | Yes | Explicit vault mount. |
| Documents (`/api/documents`) | `server/index.ts:1760`, `:7158`, `:7166`, `:7182` | compatibility | Yes | Multiple overlays on same prefix; resolution depends on mount order. |
| Device data center (`/api/device-data-center`) | `server/index.ts:1622`; routes in `document-data-center.ts:13,45` | unknown | Yes | 510(k)/document vault adjunct. |
| Evidence BFF and external evidence (`/api/evidence*`, `/api/evidence-fabric`, `/api/external-evidence`, `/api/firecrawl`) | `server/index.ts:1632-1665`, `:3880-3881` | unknown | Yes | Multiple evidence surfaces; `/api/evidence` mounted twice. |
| Knowledge/docx/predicate BFF (`/api/knowledge-base`, `/api/docx-factory`, `/api/predicate-intelligence`) | `server/index.ts:1649-1655` | unknown | Yellow | Heavy BFF family, used but not canonicalized. |
| Cortex (`/api/cortex`) | `server/index.ts:1861-1872` | canonical | Yellow | In-code comment marks this as canonical public gateway. |
| Foresight (`/api/foresight*`, `/api/foresight/rag`) | `server/index.ts:1092-1131` | compatibility | No | Deprecation headers + sunset + canonical link set in middleware. |
| Reports/audit/retention/search inline families | `server/index.ts:2367+`, `:2599+`, `:3130+` | unknown | Yellow | Large inline legacy block; useful but high-noise for external contract. |
| Tenant/project/admin operational families (`/api/tenants`, `/api/projects`, `/api/project-hierarchy`, `/api/tenant-*`, `/api/workspace/projects`) | `server/index.ts:6963+`, `:7057+`, `:7312+`, `:7624+` | unknown | Yellow | Important operations but inconsistent naming + duplicate project surfaces. |
| Integration test route (`/api/integration-test`) | `server/index.ts:7380` | dev-only | No | In-code comment marks development/QA usage. |
| Catch-all unknown API handler (`app.all('/api/*')`) | `server/index.ts:7733` | canonical | Yes | Defines fallback 404 contract for unmapped APIs. |

## Beta-safe families that must remain green through cleanup

1. **Auth + global `/api` auth gate**
2. **Concept2Cure core + compute**
3. **AnA RI + chat**
4. **Document authoring surfaces**
5. **CERV2 / 510(k) entry surfaces**
6. **Vault/documents + device data center**
7. **eCTD / IND exposed surfaces**
8. **Evidence/external-evidence compute-adjacent surfaces**

## Families to treat as unsupported/noise in external beta contract

- Legacy RI endpoint: `/api/ask-ana-ri`
- Deprecated foresight family (`/api/foresight*`, `/api/foresight/rag`)
- Dev/QA-only route: `/api/integration-test`
- Redundant compatibility aliases where canonical equivalents exist (`/api/v1/auth`, legacy login/register redirects)

## Stage 4 route-manifest risks

1. **Duplicate mount ownership**: `/api/ind` and `/api/documents` are mounted multiple times.
2. **Auth model ambiguity**: `/api/v1` API-key routes coexist with global `/api` JWT gate.
3. **Control-plane sprawl**: large inline `app.get/post` blocks in `server/index.ts` increase hidden coupling and make behavior order-sensitive.

## Stage 4 smoke-net interpretation (reality check)

Stage 4 smoke coverage is intentionally a **tripwire net**: primarily mount/manifest/contract-presence assertions plus a small set of deterministic endpoint checks (for example, invalid-message and invalid-payload paths). It is not a full end-to-end integration proof across every green family.

## Stage 4 smoke net execution

- Test file updated: `server/__tests__/routes/smoke.test.ts`
- Command run:
  - `npx vitest run --config vitest.config.ts server/__tests__/routes/smoke.test.ts`
- Result:
  - **PASS** (1 file, 19 tests)
- Coverage added in this stage:
  - mount evidence assertions for beta-critical families (auth, concept2cure, ana/chat, authoring, cerv2/510k, vault/documents, eCTD/IND, evidence/external-evidence)
  - route-contract assertions for `concept2cure.ts` and `ana-ri.ts` envelopes and critical endpoints
  - lightweight runtime smoke checks for deterministic error paths:
    - `POST /api/ectd-validate/quick` with invalid payload -> `400`
    - `POST /api/chat` with empty payload -> `400` + `INVALID_MESSAGE`
- Non-blocking warnings observed:
  - duplicate `jsdom` key warning in `package.json`
  - existing vite/esbuild warnings from unrelated large service files

