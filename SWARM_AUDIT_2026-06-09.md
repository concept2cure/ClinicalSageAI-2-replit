# Multi-Agent Swarm Audit — 2026-06-09

Six specialized audit agents (routes/wiring, services/fake-code, **data architect**,
client/frontend, dead-code/legacy, logic-bug hunter) swept the codebase in parallel.
Every finding below was independently re-verified before action — several agent
claims turned out to be false positives and are documented as such so the next
audit doesn't re-litigate them.

Verification gate: `npm run ci:typecheck:no-regression` (baseline 0) clean before
and after all fixes.

---

## Fixed in this pass

### Fabricated FDA responses (fail-open → fail-closed)
- `server/services/ESGSubmissionService.ts`
  - `transmitToESG()` returned a fabricated FDA transaction ID + ACK number in the
    **production** path (reachable via `POST /api/510k/:projectId/esg/submit`).
    Now throws a structured not-implemented error, matching the existing policy in
    `downloadAcknowledgment()` and `fdaIntegrationService.sendToESG()`. Test-mode
    simulation is unchanged.
  - `checkSubmissionStatus()` returned a fabricated `processing` status in
    production and a `Math.random()` ACK in test mode. Production now fails closed;
    test mode returns a deterministic mock.
- `server/services/part11ComplianceService.ts`
  - `getSubmissionData()` / `getDocumentData()` returned hardcoded stub objects,
    meaning any Part 11 integrity verification would be computed over fake data.
    No live callers today (verified); both now throw rather than fabricate, so a
    future caller fails loudly instead of producing a false compliance result.

### Swallowed errors / fake success in the client
- `client/src/concept2cure/components/concept2cure-projects/tabs/ChatsTab.tsx`
  - Attachment upload ignored HTTP status entirely — a 500 still triggered the
    success path (`onProjectMutated`). Now checks `res.ok` per file, logs failures,
    and only refreshes when at least one upload succeeded.
  - Message POST in `handleSend` had no `res.ok` check (the sibling conversation
    create did). Now throws on non-OK so the existing catch path handles it.
- `client/src/concept2cure/components/concept2cure-projects/tabs/FilesTab.tsx`
  - Same upload pattern fixed; `refetchFiles()`/`onProjectMutated` no longer fire
    on total failure.

### Pool connection leaks (data architect + bug hunter)
Clients acquired with `pool.connect()` were released only on the happy path —
any thrown query leaked the connection (pool exhaustion under error load):
- `server/services/innovation/outcome-based-template-learning-service.ts`
  (`createTemplate`, `recordUsage`, `recordOutcomeInternal`)
- `server/services/innovation/adaptive-reviewer-workspace-service.ts`
  (`createRole` both branches, `getUserPreferences`, `updateUserPreferences`)
- `server/services/innovation/auto-traceability-service.ts` (`storeLink`)
- `server/services/innovation/evidence-confidence-heatmap-service.ts`
  (`createScoringConfig`, `getScoringConfigs`)
- `server/services/innovation/submission-readiness-twin-service.ts` (`createCriteria`)

All now use `try { … } finally { client.release(); }`.
(`regulatory-delta-radar-service.ts` and `regulatory-negotiation-logbook-service.ts`
were audited and already correct.)

### Fragile batch correlation (silent citation loss)
- `server/routes/concept2cure.ts` (claim persist, ~line 5123): citation linkage
  correlated `INSERT … RETURNING` rows to input claims **by array position**.
  Now returns `id, claim_index` and correlates through a Map keyed on
  `claim_index`, removing the row-ordering assumption.

### Hardcoded identity
- `server/services/templateService.ts` `duplicateTemplate()` wrote
  `createdBy: 1 // TODO: Get from authentication`. Zero call sites exist
  (verified), so the signature now requires `userId: number` and uses it —
  future callers cannot reintroduce the misattribution.

### Dead code removed (zero references verified by grep before deletion)
- `server/services/ana-gold-standard.ts` (~735 lines, never imported, not in
  SERVICE_REGISTRY)
- `models/cer.py` (orphaned Python model; `models/` had no other content)
- `server/db/index.ts` deprecated shim (unreachable: module resolution prefers
  `server/db.ts`; no explicit `db/index` imports exist)
- `server/src/db/index.ts` deprecated shim — its single importer
  (`server/src/services/xai.ts`) was rewired to import `query` from
  `server/db.ts` directly.
- Removing the `server/db/index.ts` shim surfaced two same-directory importers
  (`server/db/execute.ts`, `server/db/maudDb.ts`), now rewired to
  `./runtime`. This also fixes a **latent runtime bug**: the old shim exported
  neither `pool` nor a default, so `maudDb.ts`'s `db.pool || db.default`
  silently resolved to `undefined` — MAUD DB calls would have crashed at first
  use instead of using the real pool. They now get the real `pool` from
  `runtime.ts`.

---

## Audit claims re-verified and REJECTED (false positives)

- **"CRITICAL: `/api/ai` mounted twice/thrice — route shadowing."** False. The three
  routers mounted at `/api/ai` (`api/ai/routes`, `routes/ai-assistance`,
  `routes/ai-claims-routes`) define fully disjoint sub-paths
  (`/analyze-compliance|/generate-boilerplate|/regulatory-guidance|/contextual-guidance`
  vs `/assist|/verify|/health` vs `/claims/:claimId/add-to-binder`). Express falls
  through routers on no-match; nothing is shadowed.
- **"`510k-estar-routes.ts` is orphaned."** False — mounted via
  `server/bootstrap/register-regulatory-routes.ts:23`.
- **"`biotechRagService.js` is dead, replaced by ragRouter."** False — it powers
  the live `/api/biotech-rag` routes (`register-inline-routes.ts:142-144`). Its
  header already documents the retirement plan (corpus migration required).
- **"Citation batch insert can produce a SQL parameter-count mismatch."** False —
  placeholders and values are appended in the same loop iteration and cannot
  diverge. (The positional-correlation fragility was real and is fixed above.)
- **"Missing `return` after `res.status(500).json(...)` in 510k-workflow-routes."**
  The catch block is the final statement of the handler; nothing executes after.
  Style-only; matching sibling files left untouched.
- **"`tmp/lumen-cortex-ft-control-plane.json` is a dead fixture."** False —
  referenced by `server/routes/ana-cortex-ft.ts:152`.

---

## Reported, not fixed (needs product/architecture decision)

1. **Demo/seed data fallbacks in the client** — `useProjectsApi.ts` falls back to
   seed `PR_PROJECTS` (it does track `usingSeed`), and the home surface
   (`concept2cure-home/data.tsx`) ships `BX-204`/`NDA 212345` demo constants as
   design defaults. These are intentional prototype fallbacks; productionizing
   means wiring real data or rendering explicit empty/demo states. Decide before GA.
2. **RLS bypass without caller authorization** — innovation services run
   `SET app.bypass_rls = 'true'` with caller-supplied `orgId` and no membership
   check (`outcome-based-template-learning-service.ts` et al.). Needs an
   org-membership guard before the bypass, plus audit logging.
3. **77 baselined tenant-isolation violations** (`check-tenant-isolation.mjs`
   baseline) lack documented justification; several are admin/billing paths but
   each should carry an RFC note.
4. **Orphaned Drizzle schema definitions** (~16 tables incl. `apiKeys`,
   `projectCharters`, `ctdOnboardingProjects`): defined in `shared/schema/` but no
   migration creates them and/or no code queries them. Either add migrations or
   remove definitions. (`cdisc-reference.ts` is documented as staged — keep.)
5. **`FDAFormGenerator.getAISuggestion()`** is a stub returning `''` while
   `aiSuggestionEnabled` implies AI assistance. Degrades gracefully (blank field),
   but either implement or drop the flag.
6. **`export-service.getStudyInsights()`** returns `[]` with a TODO (it does warn).
7. **Hardcoded `organizationId: 1`** in `decision-lifecycle-service.persistDecision`,
   `DynamicContentAssembly.saveAssemblyToDatabase`, `cerGenerationService` default
   template — fixing requires plumbing org context through `FormalDecisionRecord`
   and callers (cross-cutting; not a safe mechanical change).
8. **Tenant column naming drift** — `tenant_id` (external-evidence tables) vs
   `organization_id` (everywhere else) vs `org_id` (innovation schema). Standardize
   via migration when touching those tables.
9. **Deprecated 510(k) route files** (`510kRoutes.ts`, `510k-project.routes.ts`,
   `510k-literature-routes.ts`, sunset 2026-06-30) are still dynamically imported
   by `fda510k-unified.ts`. Delete at sunset after confirming unified absorption.
10. **Prisma remnant** — `server/prisma/schema.prisma` (3 models) in a
    Drizzle codebase; remove or justify.
11. **Demo login** (`Concept2CureLogin.tsx`) posts a hardcoded demo email and the
    button renders unconditionally; gate behind a flag for production builds.
12. **`_sync/` directory** — stale 2026-06-02 audit artifacts, no code references.
    Left in place (documentation, not code); delete at will.
