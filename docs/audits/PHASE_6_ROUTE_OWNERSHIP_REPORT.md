# Phase 6 — Route Ownership Normalization

**Branch:** `concept2cure-v2`
**Date:** 2026-04-22
**Status:** Complete.

## Objective

Turn `server/startup/routes.ts` into a pure composition root. Before
Phase 6, it held 13 named bootstrap-family calls interleaved with ~30
ad-hoc `app.use(...)` blocks — templates, dynamic imports, and init
logic scattered throughout a 398-line file. That layout made it
impossible to answer "who owns `/api/foo`?" without grepping, and every
new route required editing the orchestration file directly.

Target shape: every mount delegated to a named `register*Routes`
function in `server/bootstrap/`.

## Constraints carried forward from phases 1–4

- No rewrite; byte-for-byte preservation of mount semantics.
- Governed document contract tripwires must stay green
  (`chat-governed-upload.test.ts`, `ai-entry-point-contract.test.ts`).
- AI Gateway canonical.
- Startup ordering is significant (auth gate, static-data guards,
  feature flags depend on it) — order must be preserved exactly.

## What landed

### Files

| File | Change | Size |
| --- | --- | --- |
| `server/bootstrap/register-inline-routes.ts` | **new** | 329 lines |
| `server/startup/routes.ts` | slimmed to pure orchestration | 398 → **176** lines |
| `docs/audits/ROUTE_OWNERSHIP.md` | **new** — truth table | — |
| `docs/audits/ARCHITECTURE_CONSOLIDATION_MASTER.md` | Phase 6 marked complete | — |

Net size change: routes.ts lost 222 lines; those lines moved into
`register-inline-routes.ts` (+329 lines including doc headers and
typed exports). Zero logic lines changed; every `console.log`,
`try/catch`, dynamic `import`, and `app.use(...)` is preserved verbatim.

### Module shape

`register-inline-routes.ts` exports six slot functions, each named for
the position in the startup sequence where it plugs in:

```
registerInlineEarlyRoutes              # slot 1  — after registerPlatformRoutes
registerInlineAnaIntelligenceRoutes    # slot 2  — after registerIntegrationRoutes
registerInlineLitCommerceRoutes        # slot 3  — after registerRegulatoryRoutes
registerInlinePlatformFacadesRoutes    # slot 4  — after registerDocumentRoutes
registerInlineAiWorkflowRoutes         # slot 5  — after registerAdminRoutes
registerInlineSubmissionWorkflowRoutes # slot 6  — after registerGovernanceRoutes
```

`registerPreStartRoutes` now reads as a 14-step orchestration — the
original 13 family calls plus the 6 inline slots, interleaved in their
exact historical positions. `registerPostStartRoutes` was already
clean (4 family calls) and needed no change.

## Startup order — preserved exactly

Recorded here so any future reshuffle has to consciously break this
ordering (see invariants in `ROUTE_OWNERSHIP.md`):

```
1.  registerPlatformRoutes             (auth, /api gate, SSO, health)
2.  registerInlineEarlyRoutes          (device-projects)
3.  registerCoreRoutes                 (templates, AI assistance, CMC, ...)
4.  registerIntegrationRoutes          (foresight deprecation)
5.  registerInlineAnaIntelligenceRoutes (ana-cortex, nano-banana, predictive,
                                         foresight alias, biotech RAG)
6.  registerRegulatoryRoutes           (510k, CERV2, IVDR, Mfg, PV, ...)
7.  registerInlineLitCommerceRoutes    (license, billing, analytics,
                                         stability)
8.  registerDocumentRoutes             (eCTD, GCC, Cortex, Evidence,
                                         Authoring, Biostat)
9.  registerInlinePlatformFacadesRoutes (uploads static, CSR, audit
                                          trail, AnA RI inline facades)
10. registerAiRoutes                   (ana, ana-ri, firecrawl, chat,
                                         ind-generation, regulatory,
                                         ai-claims, claude)
11. registerConcept2CureRoutes
12. registerAdminRoutes
13. registerInlineAiWorkflowRoutes     (authoring, authoring-actions,
                                         ana/platform, ai-actions + init,
                                         orchestration)
14. registerGovernanceRoutes
15. registerInlineSubmissionWorkflowRoutes (reg-submissions, submission-ops,
                                             correspondence, 510k/pma workflow,
                                             beta-safe, fda-forms, field-sync,
                                             content-assembly, misc-inline)
```

Post-start (unchanged): `registerTenantRoutes → registerProjectRoutes →
registerClinicalIntelRoutes → registerAdvancedPlatformRoutes`.

## Verification

### Typecheck

`npx tsc --noEmit` ran clean across the two Phase 6 files:

```
server/startup/routes.ts               → 0 errors
server/bootstrap/register-inline-routes.ts → 0 errors
```

The repo-wide error count (2,501) is unchanged from pre-refactor — all
errors are pre-existing in other files. Phase 6 introduced zero
regressions.

### Contract tests

```
npx vitest run tests/routes/chat-governed-upload.test.ts
               tests/routes/ai-entry-point-contract.test.ts
→ Test Files  2 passed (2)
→ Tests      34 passed (34)
```

Both tripwires green. AI Gateway canonical check on `chat.ts` still
passes (Phase 4 thin router intact). Governed document contract check
on `/api/chat/upload` still passes.

### Runtime behavior — preservation checks

- **Route paths unchanged.** The truth table in `ROUTE_OWNERSHIP.md`
  was produced by grepping `app.use(...)` calls across the pre- and
  post-Phase-6 codebase. All paths line up 1:1.
- **Try/catch boundaries unchanged.** Every dynamic `import(...)` that
  was wrapped in `try/catch` before is still wrapped in `try/catch` at
  the same granularity. A single failing route import cannot cascade
  into other families.
- **Console log lines unchanged.** Every `✅ <name> routes mounted`
  (and the four `⚠️` / `❌` warnings) is present in the new slot
  functions.
- **Init side-effects unchanged.** The AI Actions initialization
  (Redis, queue, SSE broadcaster) still runs before mounting
  `/api/ai-actions`, in the same family (`registerInlineAiWorkflowRoutes`
  — slot 5). The `/uploads` directory is still created with
  `fs.mkdirSync(UPDIR, { recursive: true })` in `registerInlinePlatformFacadesRoutes`
  — slot 4.

## Invariants introduced

Recorded in `ROUTE_OWNERSHIP.md`:

1. No inline `app.use(...)` in `server/startup/routes.ts`. Every mount
   is delegated.
2. Slot ordering is fixed. The six `registerInline*Routes` slots map to
   the six historical positions where ad-hoc mounts lived.
3. AI Gateway canonical (unchanged).
4. Governed Document Contract canonical (unchanged).

## Not in scope (intentionally)

- **Further subdivision.** Six of the slot families hold multiple
  unrelated route groups (commerce vs. analytics vs. stability, for
  example). Subdividing them into per-domain bootstrap modules is a
  separate refactor; the subdivision plan is documented at the end of
  `ROUTE_OWNERSHIP.md`.
- **Routes registered elsewhere.** A handful of routes mount via
  `server/startup/inline-endpoints.ts` or deeper in service
  bootstraps (e.g. session, checkpoint). Phase 6 does not touch those;
  they are the target of Phase 7's truth-table work.
- **Pre-existing typecheck errors.** The 10 errors documented in
  Phase 4's report (orchestratorResult scoping, MemoryAssemblyDiagnostics
  cast, `string | string[]` query params) and the 2,491 others repo-wide
  remain untouched. Surgery only.

## Next

Phase 7: tests + truth tables to prevent regression. Good candidate
tests to add:
- Snapshot test on `server/startup/routes.ts` that imports the module
  and asserts no `app.use(...)` calls appear in its source.
- Route-count reconciliation: walk the Express router stack after boot
  and diff against the expected mounts from `ROUTE_OWNERSHIP.md`.
- Follow-up fixes for the pre-existing chat typecheck errors
  (orchestratorResult scope, query-param narrowing, MemoryAssemblyDiagnostics
  cast) listed in `PHASE_4_CHAT_ROUTE_REPORT.md`.
