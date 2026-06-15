# OpenAPI ↔ Implementation Drift Reconciliation

Date: 2026-06-15
Scope: `submission-center.openapi.json`, `ivd-platform.openapi.json` (repo root).
Method: read the OpenAPI specs and the actual Express route files (READ-ONLY), enumerated `router.METHOD(path)` handlers, and added accurate path entries for endpoints that were implemented but undocumented. No route implementation files were modified. No existing spec entries were removed.

## submission-center.openapi.json

Mount point: `/api/submissions` (router `server/routes/submissions.ts`, `authenticateToken` + `requireRole('regulatory-author')` at mount/handler level). Spec also documents two sibling routers (`/api/ectd-documents/*`, `/api/region-profiles/*`) that were already present and left unchanged.

| Metric | Count |
|---|---|
| Operations documented before | 24 (across 19 paths) |
| `submissions.ts` handlers implemented | ~62 route handlers (≈54 distinct method+path on `/api/submissions`) |
| Paths after reconciliation | 63 |
| Operations after reconciliation | 68 |
| Endpoints added | 44 operations (40 new paths) |

`info.version` bumped `1.0.0` → `1.1.0` (additive minor; the spec already carried a semver and the change is purely additive).

### Endpoints added (all under `/api/submissions`, bearer auth, role regulatory-author)

Validation / reference data:
- `GET /validation-rules`

Market specs (new tag **Market Specs**):
- `GET /market-specs`, `GET /market-specs/{specId}`, `POST /market-specs/{specId}/validate`
- `GET /document-templates`, `GET /document-templates/{templateId}`

Planner:
- `GET /requirements`, `GET /requirements/{type}`, `POST /requirements/{type}/assess`
- `GET /designations`, `POST /designations/{id}/assess`

Lifecycle (new tag **Lifecycle**):
- `GET /change-categories`, `POST /change-categories/classify`

Device (new tag **Device**):
- `GET /device/cer/structure`, `POST /device/cer/assess`, `GET /device/cer/{reportId}/assess-stored`
- `GET /device/per/structure`, `POST /device/per/assess`
- `POST /device/classify`
- `GET /device/reviewer-checklist`
- `GET /device/risk-management/structure`, `POST /device/risk-management/assess`
- `POST /device/biocompatibility`
- `POST /device/software/classify`
- `POST /device/blueprint`
- `GET /device/global-strategy`
- `GET /device/timeline`
- `POST /device/udi/validate`
- `POST /device/electrical-safety`
- `POST /device/sterilization`
- `GET /device/qms/structure`, `POST /device/qms/assess`
- `POST /device/labeling`
- `GET /regulatory-capabilities`
- `POST /combination-product/assess`
- `GET /sequences/{seqId}/technical-file`

Pathways (new tag **Pathways**):
- `GET /sequences/{seqId}/pathway-readiness`
- `GET /sequences/{seqId}/pathway-manifest`

Dispatch / governed transitions (existing tag **Dispatch**):
- `POST /sequences/{seqId}/technical-file/assemble`
- `POST /sequences/{seqId}/assemble`
- `GET /sequences/{seqId}/dispatch-readiness`
- `POST /sequences/{seqId}/freeze`
- `POST /sequences/{seqId}/dispatch`
- `POST /sequences/{seqId}/transmit`

Notes on accuracy:
- Method, path, query/path params, request-body required fields and enums, and 4xx error responses were transcribed from the Zod schemas and handler bodies in `submissions.ts`. Response bodies for compute/reference endpoints are stubbed as `type: object` (the handlers return service-typed objects without a shared JSON Schema); the governed transition endpoints reference the existing `EctdSequence` schema, which matches their service return type.
- Literal-path ordering (`/validation-rules`, `/market-specs`, `/device/*`, etc. are registered **before** `/:id` so they are not shadowed by the id param route) is a routing concern, not an OpenAPI one, so no spec change was needed — each literal path is documented as its own entry.

## ivd-platform.openapi.json

Mount points: `/api/ivd-lifecycle` (`server/routes/ivd-lifecycle.ts`), `/api/ivd-knowledge` (`server/routes/ivd-knowledge.ts`), `/api/ivd-assessments` (`server/routes/ivd-assessments.ts`); spec server base is `/api`.

| Metric | Count |
|---|---|
| Operations documented before | 37 (34 paths) |
| Endpoints added | 0 |
| Paths after | 34 |

No changes were required. The audit's "49 endpoints vs ~24 documented" for `ivd-lifecycle.ts` over-counts because the spec already documents the full lifecycle surface via:
- ~25 explicit named paths (`/classify/ivdr`, `/cdx/pair`, `/study-design`, `/review-simulation[/distribution]`, `/portfolio/{simulate,batch}`, `/diagnostic-accuracy/montecarlo`, `/program-plan[/brief]`, `/scenarios/compare`, `/decision/{emv,go-no-go,evpi}`, `/benchmark`, `/risk-register/simulate`, `/capabilities`, `/coverage/simulate`, `/calibration/backtest`, `/drift/detect`, `/evidence/sensitivity`, `/time-to-market`, `/pathways`), AND
- a single generic catch-all `POST /ivd-lifecycle/{calculator}` whose `description` explicitly enumerates the remaining ~27 stateless calculators (`stability/real-time`, `stability/accelerated`, `carryover`, `hook-effect`, `recovery`, `cutoff`, `traceability`, `scientific-validity`, `software/{safety-class,sdlc,sbom,cybersecurity}`, `change/{fda-510k,eu-significant}`, `process-validation`, `process-capability`, `lot-release`, `signal/disproportionality`, `authoring/{emdr,mir,fsn,psur}`, `registration/{fda,eu}`, `declaration-of-conformity`, `pathways/readiness`).

Every concrete `router.post(...)` in `ivd-lifecycle.ts` maps to either an explicit spec path or the documented `{calculator}` set; `ivd-knowledge.ts` (7 routes) and `ivd-assessments.ts` (6 routes) are each fully documented already. No drift to add.

### Intentionally left undocumented (with reason)

- `POST /api/ivd-lifecycle/{calculator}` — the ~27 individual calculator paths are intentionally documented as one parameterized path with an enumerating description rather than 27 explicit entries. This matches the existing spec convention and the engine's own self-documenting `GET /capabilities` manifest. Expanding to 27 explicit paths would be a stylistic rewrite, not a correctness fix, so it was left as-is per "minimal, additive" scope. Each is confirmed to exist in code.

## Validation

`node -e "JSON.parse(... submission-center.openapi.json); JSON.parse(... ivd-platform.openapi.json); console.log('both specs parse OK')"` → **both specs parse OK**. No duplicate path keys (verified via key-count parity).

## Ambiguity / dynamic-mounting flags

- **`/api/ivd-lifecycle/{calculator}` (dynamic)**: a single Express route handles ~27 calculator sub-paths via a path param dispatch. Handled by keeping the spec's existing single parameterized entry (description enumerates the valid values) rather than inventing 27 entries — accurate and avoids speculative paths.
- **`submissions.ts` literal-vs-param ordering**: many literal paths (`/market-specs`, `/device/*`, `/requirements`, …) must be registered before `/:id`; this is a server-routing detail with no OpenAPI representation. Each literal path is documented individually; the `/:id`, `/:id/...` and `/sequences/:seqId/...` param paths remain distinct entries, so there is no path collision in the spec.
- **Sibling routers in submission-center spec** (`/api/ectd-documents/*`, `/api/region-profiles/*`) live in separate route files outside the stated scope (`submissions.ts`); their existing entries were left untouched and not re-verified against their implementations.
