# ui-v2 install log — full client UI replacement

**Kit:** `design_handoff_c2c_v2_ui_replacement` (Concept2Cure.RI unified design kit, 2026-07-06)
**Runbook:** the kit's `START_HERE_CLAUDE_CODE.md` (7 phases) · target audited in its `docs/INSTALL_TARGET_AUDIT.md`
**Flag:** `ENABLE_UI_V2` (`client/src/flags/featureFlags.ts`) — runtime override `?ui-v2=1` / localStorage `c2c-ui-v2` (`client/src/concept2cure/v2/uiV2Flag.ts`)

Prime directives carried through every phase: never invent (GAP RULE), `live ?? fixture`
behind a visible "Sample data" pill, answer-first not dashboard, Part 11 governed writes,
no model-vendor branding on screen, reuse existing providers/hooks/governed components.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Branch (`concept2cure-v2` @ e6ebf60) + `ENABLE_UI_V2` flag | ✅ this change |
| 1 | Foundation: tokens · fonts (DECIDED) · kit CSS as stylesheet · Shell/TopBar/AnaRail/⌘K behind flag | ✅ this change |
| 2 | Registry reconciliation (see `UI_V2_REGISTRY_RECONCILIATION_2026-07-06.md`) | ✅ this change |
| 3 | Surface port loop (~95 surfaces, 5-layer model, contract-ready first) | ✅ complete — all registry surfaces installed across all 12 kits; render-verified in CI (see 2026-07-14 update below) |
| 4 | Editor + governance + provenance (TipTap stack, SSE draft, Prov tab) | ⏳ |
| 5 | Entry flows (Auth → MFA → org picker · Onboarding · Portal decision) | ⏳ |
| 6 | Entitlements · e-sign live wiring (blocked on INSTALL §5 backend validator) | ⏳ |
| 7 | Delete ZenApp/zen-app-constants/ZenRouter switch · flip flag · CI gates | ⏳ |

## Phase 0–2 record (2026-07-06)

### Registry (Phase 2 — done before mass porting, per runbook)
`shared/constants/ui-surface-registry.ts` reconciled with the kit's
`app/registry.jsx`: 33 → 81 surfaces (48 kit additions, 0 drops, 4 field
patches, `icon?` added to the interface). Full diff + disposition:
`UI_V2_REGISTRY_RECONCILIATION_2026-07-06.md`.

### Foundation (Phase 1)
- **Shell** — `client/src/concept2cure/v2/` (`V2App.tsx`, `Shell.tsx`,
  `SurfaceScaffold.tsx`, `AnswerLead.tsx`, `routing.ts`, `registryModel.ts`,
  `icons.tsx`, `dataConnect.tsx`, `surfaceViews.ts`). Mounted from
  `ZenRouter.tsx` in place of ZenApp when the flag is on (auth +
  client-portal redirects untouched); lazy chunk so the flag-off path loads
  nothing new. Every registry id resolves at `/concept2cure/:surfaceId`
  (deep links); unported surfaces render the honest `SurfaceScaffold`
  (answer-first + the surface's registry record — GAP RULE, no fake screens).
- **Nav is registry-driven** — rail/⌘K read the reconciled registry + the
  kit's rail model (`registryModel.ts`, generated from kit `registry.jsx`).
- **CSS** — kit `app/app.css` ported as a real stylesheet import
  (`v2/styles/app-v2.css`), NOT runtime-injected (CSP): generated, scoped
  under `.c2c-v2` so kit class names can't collide with legacy ZenApp/MDX
  styles while both shells ship. Kit `:root` token block dropped per
  design-system/CLAUDE.md — canonical `colors_and_type.css` supplies tokens;
  the module shim aliases kit-only names (mdx/app.css convention). Kit
  shadows carried as `--v2-shadow-*` (canonical `--shadow-*` are
  Claude-flat 0-alpha; not mutated). Shell-required blocks from kit
  `coverage.css` (.al-*, .acct-*) and `specialist.css` (.esign-*) are
  appended — **do not re-port those blocks with their Phase-3 families**.
- **Fonts (DECIDED 2026-07-06)** — Lora (`--font-serif`) + system-ui
  (`--font-sans`) + JetBrains Mono (`--font-mono`) in
  `design-system/colors_and_type.css`; `client/index.html` now loads
  Lora + JetBrains Mono (Poppins removed from chrome — the recommended
  reconciliation; also removed the rejected Styrene/Tiempos/Copernicus
  @font-face declarations). Poppins references in `theme.css`, `toast.css`,
  `document-preview.css` now read `var(--font-sans)`.

### Honesty gaps held open on purpose (wired in later phases)
- **AnA replies + action results are fixtures stamped `sample`** — the rail
  header carries the SampleTag; `/api/ana-ri` SSE + `/api/ai-actions/execute`
  wiring lands with the surface phases. A fabricated reply is never presented
  as live.
- **E-sign gate is demonstration-only and says so on-screen** — live signing
  blocked on the INSTALL §5 meaning-enum validator (backend ask).
- **Co-author context** binds live-first to `/api/coauthor` and falls back to
  the kit fixture behind the pill.

### Verification (this change)
- `tests/ui-readiness/ui-surface-registry.test.ts` — 14/14
- `client/src/concept2cure/v2/__tests__/` — 21/21 (model↔registry parity,
  routing/aliases, flag overrides)
- `ci:typecheck:no-regression` 0 errors · `ci:design-system` clean ·
  `ci:token-cascade` unchanged vs base (12 pre-existing unresolved vars in
  legacy pdev/biopharma/projects-prototype css; `app-v2.css` resolves 100%)

## Phase 3 record

### Tranche 1a (2026-07-06) — home · global-ri · intelligence-catalog · kit scaffold
- **Port pipeline** — kit fixtures are extracted by evaluating the kit data
  files and code-generating TS modules (1:1 data fidelity, no transcription);
  per-family CSS ports through the same `.c2c-v2` scoping generator as the
  shell (`surfaces-v2.css`, `intelligence-v2.css`).
- **`home`** — kit `Surfaces.jsx` Home: time-aware greeting (real
  authenticated first name), segment context card, composer with engine
  selector, quick actions, per-segment module grid (all ids resolve in the
  reconciled registry).
- **`global-ri`** (contract-ready) — kit capability browser bound LIVE to
  `GET /api/global-ri/catalog` via the existing `useGlobalRiCatalog()` hook;
  kit fixture is the offline mirror behind the pill. Capability runs call the
  real routes; offline seeds carry their own caveat text and the pill.
  The live catalog carries per-tool `tools[].inputSchema` (the @shared
  contract); the kit fixture flattens the first tool's schema — the browser
  accepts both (`GriCapability` view type).
- **`intelligence-catalog`** — PedigreeBadge · CitationChips · DetResultCard ·
  ValidationSummaryPanel (the SHARED deterministic renderers — reuse, never
  redefine) + the Capability Index (142 tools / 24 domains). Worked demos are
  reference records marked with the Sample pill; `intelResultFor` returns the
  honest "inputs required" scaffold for tools without a worked record —
  nothing fabricated.
- **Kit scaffold** — unported surfaces now render the kit's own
  `SurfaceScaffold` (5-layer install path, mounted routes, bindings,
  compliance rails) instead of the interim placeholder.
- **Verified in a real browser** (Playwright + the dev server on the PR #1010
  boot fixes): login → shell → all four surfaces render; global-ri pill shows
  LIVE with 41 capabilities · 26 AnA tools from the backend; AnA rail
  live-first fetch to `/api/coauthor` falls back to fixture-behind-pill on
  404 exactly as designed. Environment findings for the backend track:
  `users` schema drift vs migrations (email_otp_* columns), tamper-proof
  audit requires the `audit` schema to exist before first boot, and the
  request-kernel 403s browser module requests from a `127.0.0.1` Origin
  (use `localhost`).

### Tranche 1b (2026-07-06) — coverage (live install tracker)
- **`coverage`** (contract-ready) — kit coverage.jsx ported: the whole
  reconciled 81-surface registry alive in the UI, cross-referenced against
  what this shell has ported (SURFACE_VIEWS) and whether the backend link is
  live. Reads straight from `UI_SURFACES` + `CROSS_CUTTING_CONCERNS` +
  `connected()` — no fixture; it IS the install/coverage tracker. Verified
  live: 81 surfaces · 3 ported · 5 contract-ready · 66 routes-ready ·
  10 kit-only/planned · backend "Live".
- **CSS pipeline hardened** — family ports no longer duplicate the app.css
  token-shim header (lives once in app-v2.css); added the `.cv-kpis` grid the
  kit coverage.css omitted (port-helper, flagged to upstream).

### Tranche 1c (2026-07-06) — submission-center (answer-first reference)
- **`submission-center`** (contract-ready) — the SCREENS.md §03 reference:
  opens with the AnswerLead dispatch verdict, not a grid; the 8 workspaces
  scaffold from the real `SUBMISSION_WORKSPACES` contract; portfolio binds
  live to `GET /api/submissions` (fixture behind the pill otherwise).
- **Shared-CSS architecture** — journey.css ported and promoted (with
  coverage.css) to global imports in V2App, matching the kit's global CSS
  load; the honest scaffold's status chips are styled as a result. The
  `index.css` shim gained the ui-v2 shared vars (`--v2-shadow-*`, `--idle`,
  `--accent-bg`, `--p`) so the per-file token-cascade gate resolves them.

### Tranche 1d (2026-07-07) — pyramid · communication-center (contract-ready remainder)
- **`pyramid`** (contract-ready) — kit pyramid.jsx (309 lines) + pyramid-analytics.jsx
  (114 lines) ported: type selector, dashboard (progress ring + risk + phases + next
  actions), work breakdown with task sheet, analytics (resource allocation + document
  coverage matrix + critical path), global submissions browser. Live API binding:
  `useLive('/api/v1/pyramids/:type', PY_PYRAMID)`, types, global configs. Fixture:
  8 submission types, 9 roles, 5-status vocab, 4-risk vocab, BX-204 NDA with 7 phases
  and 23 tasks. Registered in SURFACE_VIEWS.
- **`communication-center`** (contract-ready) — kit communication-center.jsx (394 lines)
  ported: the regulated FDA↔client loop hub. Four tabs: FDA loop (submission lifecycle
  states, CRL response countdown with days counter, deficiency gap analysis with
  section-linked tasks), Agency inbox (communications with urgency/response tracking,
  triage/advance workflow), Meetings & commitments (HA interactions, PMR/PMC/REMS),
  Authority profiles (channel/transport/validation/ack). Live API binding:
  `useLive('/api/communication-center/projects/:pid/agency-communications', CC_COMMS)`.
  Log-communication form uses the shared C2CForm (kit data-entry.jsx, ported as a
  shared component for reuse across 15+ surfaces). RotateCcw icon added to the icon
  vocabulary.
- **C2CForm** — kit data-entry.jsx (the governed data-entry drawer) ported as a shared
  typed component (`C2CForm.tsx`): right-side panel with typed field schema (text /
  textarea / select / seg / date / number / password), required-field validation,
  Part 11 governed note. Used by communication-center and 14 other kit surfaces that
  will port in subsequent tranches.

### Tranche 1e (2026-07-07) — project-home · projects (Home2.jsx)
- **`project-home`** (full surface) — kit Home2.jsx (1694 lines, lines 1–1441) ported:
  the project workspace dashboard. Sub-components: ProjectTasks (kanban board +
  critical path + schedule goals with Ring progress), TMFPanel (eTMF zone status via
  gap global `window.ETMF_DATA`), GrantsPanel (award milestones + subaward monitoring
  via gap global `window.GRANT_DATA`), ProjectMeetings (HA meeting log with questions
  + commitments), ProjectSubmissions (submission pipeline + agency gateways via gap
  globals `window.SUBMISSION_PIPELINE/GATEWAYS/SUBMISSIONS`), ProjectVault (tree-based
  document vault with file-type tone chips + search), StageTracker + StagePanel
  (lifecycle stage navigation with toolkit). All window globals null-safe with default
  fallbacks. Orchestration embed intentionally skipped (gap + circular dep avoidance).
  `SampleTag sample={true}` at top. Registered in SURFACE_VIEWS as `full: true`.
- **`projects`** — kit Home2.jsx lines 1443–1694 ported: the portfolio-level project
  list with health metrics, workstream/status filtering, grid/list toggle, and the
  NewProjectWizard (3-step: choose template → configure → review & create). Wizard
  uses gap globals: `window.RegistryPicker`, `window.SEGMENT_CONTEXT`,
  `window.getSubmissionTypeContext`, `window.REG_TA_GROUPS/REG_TA/REG_PATHWAYS/
  REG_TEMPLATES` — all null-safe with "Loading registry..." fallback. Inter-surface
  navigation via `window.C2C_PROJECT` + `onNav('project-home')`. Registered in
  SURFACE_VIEWS.
- **Fixture file rename** — `project-home-data.ts` → `project-home-data.tsx` (the
  kit's `Ring` SVG component uses JSX; `.ts` extension caused TS parse errors).

### Ported so far (9 surfaces + honest scaffold + C2CForm shared component)
`home` · `global-ri` (live) · `intelligence-catalog` · `coverage` (live) ·
`submission-center` · `pyramid` · `communication-center` · `project-home` ·
`projects` — all verified by typecheck. *(This was the tranche-1 snapshot; the
full set has since landed — see the 2026-07-14 update below.)*

### Tranche order from here
Routes-ready families per the kit load order (`app/index.html`) → kit-only/planned
on fixtures.

### Update 2026-07-14 — all surfaces installed across all kits (render-verified)
The surface port loop is complete. Every id in the surface registry
(`shared/constants/ui-surface-registry.ts` + `.ui-v2.ts`), minus the five
non-surface infrastructure ids (`auth-session`, `tenant-org`, `feature-flags`,
`ana-rail`, `esign-modal`), resolves to a real `SURFACE_VIEWS` component — **0
scaffold fallbacks**. Coverage is 100% in every kit:

`home` 4/4 · `mdx` 21/21 · `authoring` 6/6 · `biopharma` 8/8 · `intelligence`
3/3 · `risk` 3/3 · `pdev` 2/2 · `submission` 1/1 · `ectd_coauthor` 1/1 · `cmc`
1/1 · `tasking` 1/1 · `labeling` 1/1 · kit-agnostic (`core`) 29/29.

**Operational proof (CI-enforced):**
`client/src/concept2cure/v2/__tests__/surfaceRender.test.tsx` mounts every
`SURFACE_VIEWS` surface plus the home hub under the live provider tree
(`QueryClient` + `AuthProvider` + `ProjectProvider`) and asserts each renders
without throwing (99 cases), plus a per-kit assertion so no kit can silently
regress to scaffolds. Runs in the CI `Test` job.

**Cleanup:** removed the dead `surfaces/Mdx.tsx` (`MdxFrame` iframe) —
superseded by the native `DeviceWorkstream` surface to which the
`device-workstream`/`device-510k`/`device-cer`/`device-diagnostics` ids
resolve; it had zero references (no parallel old/new path).

**Still fixture-backed (not a coverage gap):** surfaces installed and rendering
still degrade to the `Sample data` fixture where their live endpoint isn't
wired yet — the honest `live ?? fixture` path. Turning each fixture shell live
against its real endpoint is the remaining backend-wire work, tracked below,
independent of surface installation.

### Update 2026-07-14b — live-data wiring (fail-closed) for the fixture surfaces
`dataConnect.tsx` gains `useLiveList(path, fixture)` + `matchesShape`: it
attempts the live GET and uses the response **only when it structurally
matches the fixture shape**, otherwise keeps the fixture with `sample:true`.
Fail-closed by design — a backend that returns a partial/different shape than
the surface displays (verified real: `GET /api/nonclinical/studies` returns DB
columns without the `finding`/`dur`/`cls`/`send` fields the surface renders)
never shows degraded data as "Live"; the honest pill stays until the endpoint
returns the full display contract.

Wired the primary list of the surfaces with a confirmed single primary list +
read endpoint, driving each `SampleTag` from the live flag:
- `nonclinical` → `GET /api/nonclinical/studies`
- `risk` → `GET /api/mdx/risk-items` (write path already existed)
- `labeling` → `GET /api/mdx/labeling/1/translations` (write path already existed)
- `pdev` — already wired live (`sample={!isLive}`) before this change.

**Still on honest fixtures — composite dashboards (per-panel backend work):**
`biopharma`, `pediatric`, `orphan`, `lifecycle-mgmt`, `clinical-ops` are
multi-panel surfaces with many small inline fixtures and static per-`SpCard`
`sample` chips (no single primary list / top pill). Wiring them truly live is
per-panel work that needs each panel's read endpoint confirmed and the running
backend to verify the rendered shape — deliberately not blind-wired to guessed
endpoints. `training` + `change-assessment` remain blocked on unbuilt backends
(`/api/enablement`, `/api/change-assessment`).

### Local verification harness (for the backend track)
Standing up the dev server for browser verification surfaced pre-existing,
UI-independent defects, now captured as backend work:
- **dev boot** — ESM `__dirname` + extensionless dir-ambiguous import (fixed in
  PR #1010).
- **schema drift** — `users` table missing `email_otp_*` columns vs the drizzle
  schema (`ensureAuthTables()` adds them); the `audit` schema must exist before
  first boot or the tamper-proof audit log 500s dev-login; base numbered
  migrations (0000–0004) weren't applied by the c2c migration runner alone.
- **request kernel** — 403s browser module requests carrying a `127.0.0.1`
  Origin; `localhost` is allow-listed. (Verification uses `localhost`.)

## Backend asks (parallel track — from the kit runbook; UI renders these as honest gaps)
1. DMS cross-repo search REST mount (`searchConnectedRepositories` →
   proposed `/api/knowledge-base/search-connectors`)
2. Authoring-outcome rollup endpoint (program-level drafts/acceptance/latency)
3. GAMP 5 validation-kit artifacts self-serve
4. EUDAMED M2M + EU IDMP/xEVMPD data models
5. Config decisions: `ENABLE_HAQ_MANAGER_STATIC_DATA` for GA · eTMF
   double-mount precedence (`etmf.routes` vs `etmf` — first match wins)
6. INSTALL §5: `POST /api/esignature/sign` meaning-enum validator
