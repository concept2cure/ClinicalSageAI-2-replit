# CMC Convergence Map — 2026-04-01

## Inventory (routes/schemas/services/UI)

| Area | Path | Role | Decision |
|---|---|---|---|
| Canonical CMC schema (legacy) | `shared/cmc-schema.ts` | Existing CMC core entities | **Keep + adapt** |
| Overlapping CMC entities in monolith | `shared/schema.ts` and `shared/schema/regulatory-atoms.ts` | Split-brain with CMC domain objects | **Merge into canonical CMC OS** |
| CMC API aggregate routes | `server/api/cmc/routes.ts` | Mixed DB + in-memory comparability | **Keep + harden** |
| CMC workflow routes | `server/api/cmc/workflowRoutes.ts` | DB workflows + in-memory AI results | **Keep + harden** |
| Spec routes | `server/api/cmc/specificationRoutes.ts` | Runtime DDL + tenant-scoped SQL | **Keep + migrate-safe** |
| Stability routes | `server/api/cmc/stabilityRoutes.ts` | Runtime DDL + tenant-scoped SQL | **Keep + migrate-safe** |
| Batch routes | `server/api/cmc/batchRecordRoutes.ts` | Runtime DDL + tenant-scoped SQL | **Keep + migrate-safe** |
| CMC dashboard route | `server/routes/cmc-dashboard.ts` | Shared/schema change control metrics | **Keep (consumer of canonical DB)** |
| Blueprint generation | `server/api/cmc/blueprintRoutes.ts`, `server/api/cmc/routes.ts` | Narrative-first generation path | **Merge with deterministic compile pipeline** |
| CMC hub entry | `client/src/concept2cure/components/cmc/CMCHub.tsx` | Primary UI shell | **Keep + extend to command center** |

## Duplicate source-of-truth patterns identified

1. **Comparability state** duplicated between in-memory array (`server/api/cmc/routes.ts`) and persistent table intent in schema.
2. **AI command results** duplicated between transient `Map` cache (`server/api/cmc/workflowRoutes.ts`) and persistent workflow artifacts.
3. **Runtime DDL in route handlers** in specs/stability/batch routes creates infrastructure side effects in request path.
4. **Module 3 content generation** currently narrative-first (AI) rather than deterministic structured compile from governed source objects.
5. **Schema split-brain** between `shared/cmc-schema.ts` and CMC entities in broader schema surfaces.

## Convergence target (single-source-of-truth)

- Canonical persistence plane:
  - `cmc_source_objects`
  - `cmc_module3_sections`
  - `cmc_section_lineage`
  - `cmc_contradictions`
  - `cmc_ai_command_results`
- Existing operational tables retained and governed:
  - `quality_specifications`, `stability_studies`, `cmc_batch_records`, `cmc_change_control`, `cmc_comparability_assessments`
- Deterministic compiler becomes authoritative for structured Module 3 section payloads; AI remains additive narrative overlay.

## Keep / Merge / Replace / Delete summary

- **Keep:** existing CMC routes and CMCHub shell.
- **Merge:** legacy CMC schema + regulatory-atom CMC tables via canonical migration-backed OS tables.
- **Replace:** in-memory comparability + AI result caches with DB tables.
- **Delete (architecturally):** request-path runtime DDL behavior as core persistence strategy.

## Sprint hardening status (implementation delta)

- Deterministic compiler hash stabilized by removing volatile compile timestamps from hash payload.
- Compile pipeline now persists section lineage rows and provenance compile events.
- Governance strengthened with section approval snapshots (`cmc_module3_section_versions`) and refresh provenance events.
- Contradiction persistence now refreshes atomically per project run (delete+recompute) to avoid stale blockers.
