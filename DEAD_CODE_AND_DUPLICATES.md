# Dead code & duplicates — full-codebase swarm report

Four parallel read-only agents swept **server/services**, **routes/API**, **shared/schema+types**, and **client/src** for dead/orphaned code and duplicate/competing implementations. Method: import-reference + SQL-name cross-checks; entrypoints, tests, migrations, and ESM shims excluded. **Nothing was deleted — this is the plan; deletion awaits your approval** (as with the legacy-UI removal).

## Headline counts
| Area | Dead/orphaned | Duplicates / competing |
|---|---|---|
| Routes/API | **17 dead router files** (~162 unreachable endpoints) | 4 canonical-vs-dead twins, 1 double-mount, 2 fragile prefix stacks |
| client/src | **185 zero-importer source files** (of 647) | ~16 duplicate `.jsx/.js`↔`.tsx/.ts` variants |
| shared/schema | **~157 fully-dead tables** + 4 dead shared modules | **8 same-SQL-name table collisions**, type-mirror drift |
| server/services | 4 dead modules | audit ×3, FDA510k-predicate ×2, KG ×4, CER ×2, +governed AI/RAG sprawl |

## Important: what is NOT dead (do not touch)
- The new submission surface and its staged kit: `client/src/concept2cure/submission/_install/{Temporary,submissionClient,hooks,workspaces,fixtures}`, `shared/types/submission-constants.ts`, `shared/types/submission-ui.ts`, and the `submission_regions` table — all intentionally staged-not-yet-wired this session.
- Live shadcn primitives under `client/src/components/ui/*.tsx` (imported by Claude Design).
- ESM-resolution `.js` shims (`auditService.js`, `roleBasedAccess.js`, `CSRIntelligenceLibrary.js`, `shared/schema.js`) — re-export their `.ts` twins.
- The **AI-provider** (`aiProviderRouter`, `openai-client`, …) and **embedding/RAG** sprawl — already governed by CI burndown baselines (`check-gateway-bypass.mjs`, `check-embedding-runtime-canonicality.mjs`); the operator's migration track, not a free delete.

---

## Tier 1 — zero-risk deletes (top-level orphans, grep-confirmed zero importers)
- `client/src/component-registry.ts`, `domain.figma.tsx`, `primitives.figma.tsx`, `stub-router-dom.tsx`, `lightweight-wrappers.js` (+ `.jsx` twin)
- `client/src/design-system/` (entire folder — only the dead figma/registry island references it; live `EmptyState` is `concept2cure/components/ana/EmptyState.tsx`)
- `client/src/role/RoleContext.tsx`, `client/src/store/manufacturing.store.jsx`
- `client/src/workers/healthMonitor.worker.js` + `client/src/utils/freezeDetection.js` (mutually-dead worker + only spawner)
- `client/src/i18n.js`, `client/src/i18n/` (no i18n wired into the live tree)
- Duplicate variants superseded by canonical: `components/ui/toaster.jsx`, `toast.jsx`; `hooks/use-toast.{tsx,js,jsx}`; `hooks/useQCWebSocket.{js,ts,tsx}`; `lib/queryClient.js`, `queryClient.enhanced.js`, `ui-utils.{ts,js}`, `utils.js`; `utils/axiosWithToken.{js,ts}`, `utils/errorBoundary.jsx`; `contexts/AuthContext.{jsx,tsx}`, `UserContext.{jsx,tsx}`
- shared modules with zero importers: `shared/types/firebase-events.ts`, `shared/types/regulatory-operating-model.ts`, `shared/regulatory/project-model-integration.ts`, `shared/regulatory/readiness-matrix.ts`
- server services: `server/services/ana-continuous-eval.ts`, `documentPreviewService.ts`, `docusign.js`, `deviceProfileService.ts` (test-only)

## Tier 2 — dead routers (17 files, ~162 endpoints; default `Router` export, mounted by nothing)
`server/api/ind-submission.ts`, `routes/audit.ts`, `beta-telemetry.routes.ts`, `cer-analytics-routes.ts`, `connector-library.ts`, `enterprise-integrations.ts`, `export-routes.ts`, `fda510k-workflow.ts`, `healthCheck.ts`, `medical-device-api.ts`, `product-audit.ts`, `quality-validation-routes.ts`, `regulatory-pathway-intelligence.ts`, `supplyChain.routes.ts`, `support-admin.ts`, `traceability-mapping-routes.ts`, `workspace-projects.ts`.
Each verified: path never in any `app.use`/bootstrap `mod:`, zero importers. **Of these, 4 are dead twins** of a live router (delete the dead one, keep the mounted): `fda510k-workflow.ts`↔`510k-workflow-routes.ts`; `medical-device-api.ts`↔`medical-device-routes.js`; `quality-validation-routes.ts`↔`tenant-quality-validation.ts`; `traceability-mapping-routes.ts`↔`tenant-traceability.ts`.

Also fix (not deletes): `ai-assistance` double-mount at `/api/ai`+`/api/ai-assistance`; `regulatoryRoutes.ts` double-prefix bug (`/api/regulatory/regulatory/...`).

## Tier 3 — large client legacy clusters (high-confidence dead; build-verify per cluster before bulk delete)
`client/src/services/` (~48: legacy CERV2/510k/eCTD service layer), `client/src/utils/` (~36: self-healing/resilience), `client/src/hooks/` (~20), `client/src/lib/` (~19), `client/src/contexts/` (~12 legacy contexts), `client/src/api/` (~6 fetch helpers), `client/src/templates/ectd/`, `client/src/data/`. All zero-importer from `main.tsx`. Recommend deleting per-directory with a `tsc`/build run after each.

## Tier 4 — schema duplicate-SQL-name collisions (reconcile before deleting; both sides live)
`shared/cmc-schema.ts` re-declares **6 tables already owned by `schema.ts`** with different column shapes — `drug_substances`, `drug_products`, `analytical_methods`, `stability_studies`, `regulatory_documents`, `compliance_tracking` — a real insert/migration hazard. Plus `workflow_templates` (unified_workflow vs cmc-schema) and `document_comments` (schema.ts vs unified_workflow, already dodged in `schema/index.ts:46`). **Fix:** fold `cmc-schema.ts` into `schema.ts` and repoint `server/api/cmc/*` + `routes/knowledge-base.ts` onto the canonical consts — an operator-reviewed migration, not a blind delete.

## Tier 5 — ~157 fully-dead tables (const + SQL-name both unreferenced)
Dominated by **CDISC** (37, schema.ts:12154–13370), **CSR knowledge DB** (26, csr-knowledge-db.ts), **QC** (6, qc-schemas.ts), **regulatory-atoms** (10), **project-charter** (5), plus scattered singles. The existing `schema/index.ts` "47 tables" note and `docs/SCHEMA_AUDIT_NOTES.md` "91 tables" both **undercount and are stale**. Removing tables touches Drizzle + migrations; treat as a controlled schema-cleanup PR, not a sweep.

## Type-layer drift (fix, not delete)
`shared/types/database.d.ts` hand-mirrors ~12 Drizzle `$inferSelect` types (`Submission`, `User`, `Project`, `Document`, `AuditLog`, …) that **silently drift** from the schema. Replace the hand-authored mirrors with `typeof table.$inferSelect` re-exports. Several cross-module type-name collisions exist (`WorkflowTemplate`, `WorkflowBlocker`, `ReadinessSnapshot`, `EvidenceSource`, `ValidationFinding`) — `schema/index.ts` already omits some to dodge ambiguity.

## server/services duplicate reconciliations
- **Audit ×3:** keep `auditService.ts` (78 importers, hash-chained); migrate the 6 + 2 callers off `audit/auditLogger.ts` / `auditLoggerV2.ts`, then remove.
- **FDA510k predicate ×2:** `FDA510kService.ts` (canonical) vs `PredicateFinderService.ts` — consolidate.
- **510k compliance tracker ×2**, **CER generation ×2**, **knowledge-graph ×4** — softer; pick canonical per CI canonicality gates where present.

---

## Recommended approach (lowest-risk → highest)
1. **Tier 1 + Tier 2** (top-level orphans + 17 dead routers): delete, `tsc` + build, commit. Near-zero risk; biggest immediate cleanup.
2. **Tier 3** client clusters: delete per-directory with a build run between each.
3. **server/services dead 4** + audit/predicate consolidation (migrate callers first).
4. **Tier 4/5 schema**: a separate, migration-reviewed PR — fold `cmc-schema`, then prune dead tables.
5. **Type drift**: replace `database.d.ts` mirrors with `$inferSelect` re-exports.

Say the word and I'll execute Tier 1 + Tier 2 first (safest, ~highest yield), build-verify, and push — then proceed tier by tier with your go at each.

---

## Execution status (2026-06-05)

**Done — all `vite build` + `tsc` verified, 7 commits, ~211 files / ~55.6k lines removed:**
- **Tier 2:** 16 dead router files + 2 orphan tests removed. **Correction:** `beta-telemetry.routes.ts` was a swarm **false positive** — it IS live (mounted via `betaRouteManifest.ts` → `register-inline-routes`) and was restored. (Lesson: the agent's scan checked `register-*.ts` bootstrap files but not sibling mount helpers; `tsc` caught it.)
- **Tier 1A:** dead server services (`ana-continuous-eval`, `documentPreviewService`, `docusign.js`, `deviceProfileService`+test) + 4 dead shared modules.
- **Tier 1B:** dead client islands (figma/registry, `stub-router-dom`, `role/`, `store/manufacturing.store`, worker+spawner, the dead `client/src/design-system/` island).
- **Tier 3:** the legacy CERV2/510k/eCTD **client layer** — dead dirs (`api/`, `templates/`, `data/`, `i18n/`), superseded `.jsx/.js` duplicate variants, and **126 zero-reference files** across `services/`/`utils/`/`lib/`/`contexts/`/`hooks/` (+ cascade). Live files (`services/portal`, `lib/queryClient.ts`, `utils/authToken.ts`, the ~45 in-use hooks, the 3 live contexts) preserved.

**Remaining — these are REFACTORS/MIGRATIONS, not pure deletes; recommend dedicated reviewed passes (higher risk near go-live):**
- **server/services duplicate consolidation:** migrate the 6+2 callers off `audit/auditLogger.ts` + `auditLoggerV2.ts` onto canonical `auditService.ts`, then remove; consolidate `FDA510kService` vs `PredicateFinderService`. (Changes live audit/route behavior — review required.)
- **Tier 4 schema collisions:** fold `shared/cmc-schema.ts`'s 6 duplicate-SQL-name tables into `schema.ts` and repoint `server/api/cmc/*` + `routes/knowledge-base.ts`. (Migration + insert-path review.)
- **Tier 5:** prune ~157 fully-dead tables (CDISC/CSR/QC/…) — a controlled schema-cleanup migration.
- **Type drift:** replace `shared/types/database.d.ts` hand-mirrors with `typeof table.$inferSelect` re-exports.
