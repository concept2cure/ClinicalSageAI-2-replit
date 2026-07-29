# BETA READINESS MASTER — TRUTH RECONCILIATION (Post PR #279)

Date: 2026-03-27  
Branch baseline: `concept2cure-v2` HEAD after merged PR #279 (as present in this repo snapshot)

## Executive summary
PR #279 closed an important blocker: there is now a governed export persistence path via the Artifact Compute Plane writeback flow (`registerArtifactWithGovernance`) with provenance + audit references persisted on job completion.  
As of the current route implementation, `POST /api/510k/estar/build` and CERV2 `POST /api/cerv2/export/pdf|docx|zip` all return governed export consequence payloads with artifact/provenance/audit references rather than direct dead-end streams. Broad beta readiness should now be evaluated on remaining operational gates (coverage tests, policy enforcement, and release controls), not on those route-family bypass claims.

## What changed (stale statements corrected)

### Corrected: “No governed 510(k)/eSTAR artifact path”
- **Now stale as an absolute statement.**
- There is now a governed path for the `governed_export` surface in compute:
  - Route supports `surfaceKey: 'governed_export'` job creation.
  - Compute completion writes artifact via governance writeback and records provenance/audit refs.
- This closes the “no governed path exists anywhere” claim.

### Corrected: “CERV2 PDF/DOCX are all dead-end downloads”
- **No longer true.**
- CERV2 `POST /api/cerv2/export/pdf|docx|zip` now use governed consequence responses.

## Updated blocker status

### Closed by PR #279
1. Governed export persistence exists for compute-driven governed export surface.
2. Persisted consequence now includes artifact id/status/version + provenance/audit references in compute job result summary.

### Still open blockers (remaining only)
1. **Coverage-proof gap:** automated e2e route tests proving governed consequence persistence for eSTAR + CERV2 export surfaces are still required.
2. **Policy enforcement gap:** production policy must explicitly block any future export path that does not produce governed consequence.
3. **Path consistency risk:** new/legacy routes could drift unless governance coverage checks are codified in CI.
4. **Go/no-go risk:** broad beta should remain no-go until governance coverage tests + release gate controls are active.

## Go / no-go recommendation (reassessed)
- **Recommendation:** **NO-GO for broad beta** (unchanged).
- **Reason:** route-level governed persistence now exists for primary eSTAR/CERV2 exports, but release evidence is still incomplete (policy/coverage gating not yet proven in CI/e2e).
- **Conditional partial-go:** acceptable for controlled/internal beta if governed consequence coverage tests and policy checks are enforced for all beta-visible export surfaces.

## Next sprint priorities (post-PR #279)
1. Add route-level policy: production mode must reject export paths that cannot produce governed artifact consequence.
2. Add e2e tests that prove artifact/version/provenance/audit records for eSTAR + CERV2 export UX paths.
3. Add CI governance coverage checks to prevent route drift/regression.
4. Publish an updated launch gate packet with governed export evidence snapshots.

---

## 2026-07-29 middleware and beta-harness reassessment

### Scope and decision

This update audits the existing startup middleware composition, beta flow telemetry, beta route fence, tester telemetry routes, and audit immutability controls. UI was excluded.

**Decision: NO-GO for external beta.** The slice is acceptable for continued internal authenticated testing after deployment configuration is verified, but the repository does not yet have sufficient external-beta evidence.

### Reuse and duplication investigation

Before finalizing this update, the repository was searched for existing beta/readiness scripts, reports, middleware suites, telemetry routes, and route manifests. The implementation was consolidated into existing assets rather than adding parallel structures:

- Readiness findings are recorded here in the existing `BETA_READINESS_MASTER.md`; the separate middleware readiness report was removed.
- Startup order, debug privacy, and immutability contracts were merged into the existing `server/startup/__tests__/audit-chain-wiring.test.ts`; three parallel startup test files were removed.
- Tester telemetry authentication-mount coverage was merged into the existing `tests/routes/beta-telemetry.routes.test.ts`; the separate route-manifest test was removed.
- The standalone middleware readiness script and package command were removed. Its meaningful assertions now run as Vitest contracts in the existing startup suite, while environment/service checks remain in `scripts/readiness-check.mjs` and `scripts/beta-health-check.sh`.
- Existing implementations were extended in place: `betaRouteManifest.ts`, `betaRouteFence.ts`, `betaFlowTelemetry.ts`, `beta-telemetry.routes.ts`, and startup middleware. No replacement telemetry, route-fence, auth, or readiness subsystem remains in the cumulative change.

### Verified/remediated in this workstream

1. Debug middleware now follows core parser/security installation and remains after fast-path health endpoints.
2. Debug logging is metadata-only: request body/query values are omitted and headers are allowlisted.
3. Beta flow paths strip query strings/fragments, are length bounded, and classify canonical Concept2Cure project/artifact/export paths.
4. `route_errors` events are not double counted.
5. Audit-event PUT/PATCH/DELETE and explicit bulk deletion fail closed at the Express layer; path boundaries avoid similarly named false positives.
6. Configured beta-fence prefixes are normalized, deduplicated, and path-boundary matched.
7. Tester telemetry is authenticated at mount, requires organization context, stamps organization identity server-side, and tenant-filters reads.

### P0 blockers before external beta

1. **Durable tenant-scoped tester telemetry:** current tester telemetry remains process-local and appends NDJSON under `test-results/`; it is not multi-instance safe and has no governed retention lifecycle.
2. **Real authenticated E2E evidence:** start the actual server with PostgreSQL, authenticate two organizations, and prove mounted-route tenant isolation, route fencing, and immutability responses.
3. **Persistence-layer audit immutability:** Express enforcement can be bypassed by jobs, scripts, alternate services, or direct database access.
4. **Large payload benchmark:** `/api/concept2cure` permits 50 MB JSON before route-level authorization; concurrent memory/rate-limit behavior has not been proven.

### P1 gaps for stable guided beta

- Add 4xx telemetry for authorization, validation, conflict, and rate-limit failures.
- Replace raw identifier paths in exported metrics with route templates or bounded hashes.
- Replace heuristic flow classification with a published route-to-flow contract.
- Verify `ENABLE_BETA_ROUTE_FENCE` and blocked prefixes in release configuration.
- Repair the route-mount auditor: it currently exits successfully while capturing zero mounts after bootstrap extraction.
- Define tester telemetry retention, deletion authority, access audit, and export approval.

### Readiness matrix

| Dimension | Status |
|---|---|
| Middleware ordering | Ready for focused internal beta |
| Debug secret/PHI hygiene | Ready for focused internal beta |
| Authentication and tenant isolation | Conditional; focused tests pass, real JWT/DB E2E missing |
| Audit immutability | Conditional; Express enforcement only |
| Telemetry accuracy | Conditional; 4xx and cardinality gaps remain |
| Operational durability | Not ready |
| Performance / 50 MB payload behavior | Not assessed |

### Automated evidence

- Focused middleware, telemetry, route-fence, tester-route, and audit-chain tests pass.
- Beta-slice TypeScript check passes.
- Production build passes with existing font/CSS/chunk-size warnings.
- No-mock-in-production-routes check passes.
- Route-mount audit exits zero but captures zero mounts and is therefore not accepted as readiness proof.

### Required execution order

1. Add durable PostgreSQL-backed tester telemetry behind a feature flag, with schema/migration, tenant isolation, retention, tests, and documentation.
2. Add a two-tenant authenticated E2E beta harness against the real startup path.
3. Add persistence-layer audit immutability and direct-database negative tests.
4. Benchmark concurrent large Concept2Cure requests before external client traffic.
