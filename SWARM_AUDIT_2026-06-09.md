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
- **"Demo login button renders unconditionally in production."** False — the
  button is gated behind `isDev` (`Concept2CureLogin.tsx:463`), and the
  `/api/auth/dev-login` endpoint is hard-gated server-side behind
  `isDevAuthAllowed()` (`NODE_ENV=development` AND `ALLOW_DEV_AUTH=1`),
  returning 404 otherwise.

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
11. **`_sync/` directory** — stale 2026-06-02 audit artifacts, no code references.
    Left in place (documentation, not code); delete at will.

---

# Wave 2 — 2026-06-10

Three additional agents: data architect (verification pass on wave-1 schema
claims), auth/middleware/workers auditor, AI-gateway/orchestration auditor.

## Fixed in wave 2

- **Express 5 sanitizer bug (live, every request)** —
  `server/middleware/enterprise-security.ts` `sanitizeInput` assigned
  `req.query = sanitizeObject(req.query)`. Express 5 exposes `req.query` via a
  getter, so the assignment **throws on every request**; the fail-open catch
  then skipped the query/params prototype-pollution scrub entirely (verified
  empirically against express@5.2.1). Query/params are now scrubbed in place,
  and the catch fails closed (400) instead of passing unsanitized input through.
- **API-key validation failed open** — `validateApiKey` caught key-store errors
  and marked the request `authMethod: 'api_key'` with only a hash, no
  validation. Nothing downstream consumed those fields (so no tenant access was
  granted), but the request proceeded as if no key was presented. Now fails
  closed with 503 `API_KEY_SERVICE_UNAVAILABLE`.
- **Duplicate EventBus deleted** — `server/services/eventBus.js` (409 lines) was
  a second, divergent EventBus singleton alongside `server/events/eventBus.js`.
  Zero importers (verified); the split-bus event-loss risk is gone with it.
- **`server/brain/` deleted entirely** — all four files (`draftGenerator.js`,
  `vaultIndexer.js`, `vaultRetriever.js`, `embeddings.json`) had zero importers
  and no path-string references in scripts/Docker/CI. `draftGenerator` also
  contained the "both branches return the mock" TODO the AI auditor flagged —
  moot now.
- **Drift sentinel silent failure** — `server/jobs/driftSentinelSweep.ts`
  swallowed sweep errors with an empty catch; an ISO 14971 control could go
  dark unnoticed. Failures are now logged.
- **JWT rotation misconfiguration check** — `server/config/environment.ts` now
  fails loud when the previous JWT secret equals the current one (a no-op
  rotation slot).
- **Orphaned schema tables removed** — `regulatoryMeetings` and
  `charterAuditEvents` in `shared/schema/project-charter.ts` had no migration,
  no bootstrap DDL, and zero queries/type consumers (any use would have hit
  "relation does not exist"). Tables, insert schemas, types, and relations
  removed.

## Wave-1 claims overturned by the wave-2 data architect

- `apiKeys`, `projectCharters`, `ctdOnboarding*`, and the CAPA/MDR tables are
  **not** orphaned — they are migrated and queried (largely via raw SQL, which
  the wave-1 grep missed).
- The Prisma directory is **not** a remnant: `server/prisma/client.js` is a
  deliberate Prisma-compatible facade over Drizzle/pg with tenant guards, used
  by `semanticSearch.js` and `bulk_import.js`. `@prisma/client` is not a
  dependency. Keep.
- MFA/lockout columns are fully present in the Drizzle `users` schema
  (shared/schema.ts:2479-2495) — no drift.

## Wave-2 claims verified and REJECTED

- **"Gateway stream callback errors are unhandled."** False — `onStream` is
  invoked lexically inside the stream try block; a throwing callback is caught
  by the existing `streamErr` handler, which preserves partial content and
  clears the watchdog in `finally`.
- **"Gateway error responses pollute cost accounting (zeroed tokens look like
  cheap successes)."** False — `logAudit` is called with `success: false` and the
  provider error message; the audit table has `success`/`error` columns, so
  error rows are fully distinguishable.
- **"Audit-chain cron callback has no error handler."** False —
  `runAuditChainIntegrityCheck` is documented "Never throws", wraps everything
  in try/catch, logs failures, and emits a process warning on chain breaks.
- **No gateway bypasses and no prompt-injection-prone concatenation** were
  found in the AI orchestration layer (per dedicated sweep).

## Wave-2 advisories (reported, not fixed)

- `charterSections`, `timelinePhases`, `projectCommitments`: migrated but
  unqueried (staged feature surface) — keep or implement.
- `AnaDocumentDraftingService` pins explicit model IDs instead of delegating
  selection to the gateway registry.
- `startup-invariants` logs critical failures but lets boot continue; decide
  whether `criticalFailures > 0` should halt.
- Retention-job notify failures are logged but not surfaced to monitoring;
  tenant-impersonation audit writes are fire-and-forget.
- Two env vars (`AI_GATEWAY_DETERMINISTIC`, `DETERMINISTIC_MODE`) both enable
  deterministic mode; document the canonical one.

Verification: typecheck no-regression 0 errors; 66 middleware tests and the
full security suite (183 tests, 32 files) pass after all wave-2 changes.

---

# Wave 3 — 2026-06-10

Three auditors (remaining server services; top-level non-server directories;
client deep pass) plus a dedicated fixer for the innovation-routes tenant gap.

## Fixed in wave 3

- **Tenant-isolation hardening (innovation routes)** — six write routes in
  `server/routes/innovation-routes.ts` passed `req.body` (with caller-supplied
  org) straight into services that run `SET app.bypass_rls = 'true'`:
  delta-radar guidance import, heatmap scoring config, workspace presets,
  template create, guardrail rules, guardrail profiles. All now apply the
  existing `requireAuthedOrgId` guard and override `organizationId`/`orgId`
  in the payload with the authenticated org (field names matched per-service).
  Seven other write routes were verified NOT org-scoped and left unchanged.
- **`server/repositories/learningRepository.ts` deleted** — its schema table
  references were literally `null` (`const learningModules: any = null`), so
  every method would crash at runtime; zero importers existed.
- **Dead Python services deleted** — `services/ich_wiz/` and
  `services/ich_ingest/` (11 files, zero references in code, CI, or Docker).
- **Dead performance-optimizer chain deleted** —
  `server/initializers/performanceOptimizer.ts`,
  `server/utils/database-performance-optimizer.ts` (duplicate dead
  implementations), `server/test/performance-test.ts`,
  `server/db/indexOptimizer.ts` (only consumed by the above).
- **`config/ui-surface-registry.json` deleted** (zero references).
- **FDA-ESG credential audit write** — best-effort insert no longer swallows
  its error silently; failures are logged.
- **Client `useCortex.ts`** — `useProjectContext` fetch now has an
  AbortController (no setState after unmount) and `encodeURIComponent` on the
  project id; `streamMessage`'s dependency array now includes `projectContext`
  (stale-closure bug: thread could stream with an outdated project context).

## Wave-3 claims verified and REJECTED

- **"`server/policies/` is missing — OPA mount will fail."** False — the
  directory exists (`server/policies/concept2cure.rego`).
- **"`services/ectd_generator.py` (40KB) is dead."** False — it is the
  ENTRYPOINT of `services/Dockerfile` and imported by the CI-run
  `services/tests/test_generator.py`.
- **"`shared/utils/communication-center-rules.ts` and
  `therapeutic-area-classifier.ts` are unused."** False — imported by
  `server/routes/concept2cure-communication-center.ts` and
  `server/protocol-analyzer-service.ts` respectively.
- **"Governed-decision recording failure is invisible."** False — the
  fire-and-forget catch defers to logging inside `recordGovernedDecision`.
- **"`auto-vault.ts` swallows link-update errors."** It logs via
  `console.error`; behavior change (rethrow) would alter the documented
  best-effort design — left as-is.

## Wave-3 advisories (reported, not fixed)

- **Program-scoped innovation tables lack org columns** —
  `negotiation_threads`, `auto_trace_links`, `template_usage`,
  `submission_outcomes` are keyed by `program_id` under RLS bypass; program
  ownership is never verified, so a guessed programId can cross tenants.
  Fixing requires schema + service changes (org column or program-ownership
  join).
- **`mockVault.ts`** guards on `NODE_ENV === 'production'`; a misconfigured
  NODE_ENV would let placeholder vault content reach export routes. Consider a
  development/test allowlist instead of a production denylist.
- **`vercel.json`** routes assume `server/index.js`, but the build outputs
  `dist/index.js` — verify or retire the Vercel config.
- **`server/ind-automation-service.ts`** spawns a Python service from an
  `ind_automation/` directory that does not exist in the repo (knip-ignored).
  Feature fails at runtime if invoked — implement or remove.
- **`artifact-document-bridge.ts` / `s3-provider.ts`** return zeros/empty/false
  on DB or S3 errors, indistinguishable from genuine empties (documented
  graceful-degradation choices; revisit per-callsite).
- **Client**: `streamMessage` has no concurrent-stream guard (two rapid sends
  can interleave into the same assistant message); `createProject` mutation has
  no `onError` surface; `services/` (Python/Celery) is E2E/staging-only and
  should be documented as such.

Verification: typecheck no-regression 0 errors; security suite green.

---

# Wave 4 — 2026-06-10 (test integrity + remaining advisories)

## Test-integrity risk register (audited, mostly deliberate debt)

659 test files audited; 24 contain skipped/disabled tests (~100+ individual
tests, 8 whole suites). Most skips carry documented reasons tied to unshipped
Phase 3/5 surfaces — they are honest debt, not hidden failures. The
load-bearing gaps, in priority order:

1. **Part 11 e-signature/snapshot lifecycle** — `tests/phase10-runtime-esign-snapshots.test.ts`
   suites 10H–10K skipped pending the Phase 3+ workbench; includes the
   '21 CFR Part 11 badge' check.
2. **Tenant scoping at module level** — `tests/services/project-module-bridge.test.ts`
   suite skipped after a signature change (being restored in this wave).
3. **Agent audit trails** — `mdx-explain-audit-row` (4/8 skipped),
   `mdx-agent-audit-contract` (`section.approve`, `audit.explain` probes
   skipped) — mock pools missing column shapes.
4. **AnA RI degraded-mode (503) resilience** — whole suite skipped
   (mock surface incomplete).
5. **Regulatory-correspondence heuristic intake** — 201 contract skipped
   (issue-parser mock shape).
6. **`ana-mdx-pen-scaffold.test.ts:278`** contains `expect(true).toBe(true)` —
   an explicit scaffold acknowledging pen-testing is external; flagged so it
   isn't mistaken for coverage.
7. DB/asset-gated suites (`document-consequence`, `ocr-live`) silently skip
   when DATABASE_URL/tessdata are absent — verify CI provides both.

No orphaned test files (all match runner globs) and no missing snapshot
fixtures were found.

## Other wave-4 fixes (verified individually)

- Seven dead controllers deleted from `server/controllers/` (976 lines,
  zero static/dynamic importers; `governance-controller.ts` retained — it is
  dynamically imported by `concept2cure.ts`).
- Startup invariants now run at boot (previously diagnostics-route-only);
  `STRICT_STARTUP_INVARIANTS=true` halts on critical failures.
- `mockVault` guard flipped to a development/test allowlist
  (+`ALLOW_MOCK_VAULT=1` override); deploy configs verified unaffected.
- `vercel.json` deleted (build command and routes referenced nonexistent
  files; no CI step deploys to Vercel).
- Client: 'Sample data' pill when seed fallback is active; createProject
  error toast + onSettled reconciliation; stream-guard stale-closure fix.
- `services/README.md` documents the Python/Celery stack as E2E/staging-only;
  `AI_GATEWAY_DETERMINISTIC` documented as the canonical deterministic switch.

## Wave-4 advisories downgraded after verification

- **IND automation**: missing `ind_automation/` Python backend degrades
  honestly (logged + 503 from the route) — not a fake-success path.
- **`export-service.getStudyInsights`**: returns `[]` with a warning, but the
  enclosing archive path has no live callers and no insights table exists yet.

## Wave 4 — deep remediation (fixer agents, all verified)

- **Program-level tenant isolation closed** (`server/routes/innovation-routes.ts`,
  +476 lines): every innovation route keyed by programId / scanId / findingId /
  assessmentId / linkId / threadId / entryId / runId now resolves the row to its
  owning program and verifies that program belongs to the authed org
  (`assertProgramInOrg` / `assertChildInOrg` + parameterized child→program
  resolvers). Nonexistent, unresolvable, and cross-tenant rows all return the
  same 404; guard queries fail closed on DB errors.
- **Tenant-isolation baseline shrunk 77 → 61**: 16 raw-SQL queries that had org
  context available were fixed with real scoping across `contentAssembly.routes`,
  `project-hierarchy`, `project-sections`, `deep-research`, `folder-management`,
  `510k-project.routes`, `ectdExportService`, `semanticEmbeddingService`,
  `rules-engine/actions`; `docs/reports/tenant-isolation-baseline.json` updated;
  checker passes.
- **Hardcoded identity eliminated**: `FormalDecisionRecord` gained optional
  `organizationId`; `persistDecision` now uses the real org and SKIPS DB
  persistence with a loud warning when the caller has no tenant context —
  never fabricates org 1 (in-memory record retained). Creator call sites wired
  (`authoring-actions`, `command-executor`, `contradiction-consequence`).
  `DynamicContentAssembly.saveAssemblyToDatabase` and
  `cerGenerationService.getOrCreateTemplate` take real user/org parameters.
- **Tenant-scoping test suite restored**: `tests/services/project-module-bridge.test.ts`
  un-skipped and re-derived against the current signature — 7 tests verifying
  org scoping now run (previously dead coverage on a security boundary).
- **Client honesty (committed earlier this wave)**: "Sample data" pill renders
  when the projects list is showing seed fallback; `createProject` surfaces
  errors; stream guard fixed.
- **Dead legacy composition root removed**: `server/routes.js` (zero importers;
  replaced by bootstrap registrars) plus its exclusive chain
  `server/api/index.js`, `server/api/cer.js` (returned a hardcoded "Sample
  Product" report for any reportId), `server/api/cmc-blueprint-generator.js`
  (placeholder CMC sections with fake CAS numbers) — 1,085 lines. The
  fabricated-data findings in those files are moot via deletion.
- **Live `server/api/cmc` fixes**: `/collaboration/share` previously fabricated
  a successful share (record never persisted; `/shared/workflow/:id` has no
  route anywhere) — now 501 fail-closed. Workflow/AI/checklist/task/notification
  IDs switched from `Math.random()` to `crypto.randomUUID()`. Team roster
  lookup failure now logs and sets `rosterUnavailable: true` instead of
  silently presenting an empty team. AI blueprint fallback responses are
  labelled `generatedFrom: 'fallback'`.

## Wave-4 advisories (remaining, need product decisions)

- `server/api/cmc/portfolio.ts`: overview/export return hardcoded zeros for
  cov/missing/seqCrit/pbOpen/qcOpen alongside real ir_* metrics, and
  `snapshot/save` iterates `reg_submissions` without org scoping (now visible
  in the 61-item baseline; needs schema-informed fix).
- `/api/v1` session-auth bypass relies on a comment-level invariant that each
  sub-route enforces API-key auth; consider a structural gate.
- `playbookRoutes` checklists and `blueprintRoutes` workflow templates are
  hardcoded defaults shared across orgs (acceptable as defaults; label or make
  customizable per-org).

Verification (wave 4 final): typecheck 0 errors; tenant-isolation checker
passes (baseline 61); restored bridge suite 7/7; security suite 183/183.

## Wave 4 finale — portfolio honesty + scoping

- **`server/api/cmc/portfolio.ts` — fabricated RPI fixed at the root**: the
  handler's dynamic `require('../../services/reg/rpi')` pointed at a path that
  has never existed (the engine lives at `server/src/services/reg/rpi.ts`), so
  the catch swallowed the failure and **every portfolio row rendered a
  fabricated fallback score of 60**. The real engine is now imported; on
  genuine computation failure the score is `null` (client type widened to
  `number | null`; UI already renders null safely) and failed snapshots are
  skipped (`{ saved, skipped }`), never stored.
- **Org scoping added to all four portfolio handlers** (`overview`,
  `rpi-trend`, `snapshot/save`, `export.csv`): `reg_submissions` is filtered by
  `tenant_id` from `getSecureOrgId`, and `rpi-trend` joins snapshots to
  submissions to verify tenant before returning trend data. Previously every
  handler iterated/returned all tenants' submissions.
- **`/api/v1` advisory closed as verified-acceptable**: single mount;
  `/health` and `/docs` deliberately open; position-based
  `router.use(requireApiKey)` plus per-route scope/quota guards cover all data
  routes. No structural gate needed while the single-mount invariant holds.

---

# Wave 5 — 2026-06-10 (server/src reclamation + coverage restoration)

- **`server/src/` transitive reachability analysis**: of the parallel tree, 22
  files are reachable from 8 verified entry points (control-plane kernel,
  observability middleware, stability/control-plane/pm-settings routers,
  reg/evidence, manufacturingReviewer, reg/rpi). **32 dead files deleted
  (~3,400 lines)**: the never-wired reg pipeline (`gatekeeper`, `preflight`,
  `playbook`, `impact`, `timeline`, `upstream`, `emailParse`, `sign`,
  `digest`, `policy` + orphan `policy.schema.json`), five dead `services/ai/*`
  JS modules, duplicate `digest/ectd/ectdMap/gatekeeper/policy` copies,
  `mw/rbac`, `cache.ts`, `lumen/extraction` prompt files, and an orphan SQL
  script. One reachability false positive caught by the typecheck gate:
  `integrations/gmail.ts` is dynamically imported by
  `correspondence-search.ts` — restored; a follow-up string sweep confirmed no
  other dynamic references to the deleted set.
- **Portfolio metrics now real**: `m3_missing` and `stability_cov_m` computed
  from `reg_m3_sections` in overview + CSV; the CSV previously wrote hardcoded
  zeros for ALL metric columns including IR/obligation counts that overview
  already computed. Unimplemented counts are null/empty, never zero.
- **Three skipped test suites restored (31 tests)**:
  `beta-ops-telemetry` rewritten against the current POST /event / POST /issue
  / GET /events contract (12 tests incl. validation, fail-open persistence,
  50MB log cap); `smoke.test.ts` Stage 4 un-skipped (its body had already been
  rewritten for the bootstrap registrars — only the stale `.skip` remained;
  all mount assertions verified against current sources, 18 tests);
  `ana-cortex-correlation` un-skipped (the ESM blocker was fixed by
  production's `jwtVerify.js`/`environment.js` shims since the skip was
  added). Combined with the bridge suite: **38 restored tests passing**.
- Advisory note: `rpi.ts` contains a documented `trendRisk = 85` proxy
  component (5% weight) — a disclosed modeling simplification, left for a
  product decision rather than silently altered.
