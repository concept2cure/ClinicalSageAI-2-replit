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
| 3 | Surface port loop (~95 surfaces, 5-layer model, contract-ready first) | ⏳ after registry-diff sign-off |
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

## Backend asks (parallel track — from the kit runbook; UI renders these as honest gaps)
1. DMS cross-repo search REST mount (`searchConnectedRepositories` →
   proposed `/api/knowledge-base/search-connectors`)
2. Authoring-outcome rollup endpoint (program-level drafts/acceptance/latency)
3. GAMP 5 validation-kit artifacts self-serve
4. EUDAMED M2M + EU IDMP/xEVMPD data models
5. Config decisions: `ENABLE_HAQ_MANAGER_STATIC_DATA` for GA · eTMF
   double-mount precedence (`etmf.routes` vs `etmf` — first match wins)
6. INSTALL §5: `POST /api/esignature/sign` meaning-enum validator
