# AnA UI Validation Report — 2026-09-06

**Phase 7–8 of the AnA UI Master Work Order.** Evidence for `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-09-06.md`. Measured in a real browser (Playwright over the pre-installed Chromium 1194) against the Vite dev server on the tree at `874a8a26`, signed in through `POST /api/auth/dev-login`. Raw measurements: `docs/reports/evidence/ana-ui-2026-09-06/*.json`; screenshots referenced below are in the same directory.

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/styles/app-v2.css` | ≤900px: an open AnA rail is a fixed right-side drawer (`min(380px, 92vw)`) over `.ana-scrim`; the grid gives its third column up; desktop rules byte-identical |
| `client/src/concept2cure/v2/V2App.tsx` | renders `.ana-scrim` (tap closes); Escape closes the rail drawer at ≤640px and the AnA drawer at ≤900px |
| `shared/navigation/index.ts` | `communication-center` is a `navigate_to` target |
| `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` | last literal `#d97757` in `v2/` → token |
| `scripts/audit-ui-authority.ts`, `config/ui-surface-registry.json`, `package.json` | the authority audit rewritten for the real shell and wired as `npm run audit:ui-authority` |
| `tests/ui/ana-rail-phone-drawer.test.ts` | pins the drawer rules; failed 4/4 before the rule existed |

**Legacy shell files demoted or removed:** none remained to demote (see the audit §Q2). **Rail, account menu, serif chrome, accent and palette:** unchanged, per the 2026-07-28 product decision.

## Widths and flows tested

Seven widths × eleven surfaces = 77 pages, rail collapsed (the shell's default), AnA rail closed: home, conversation-thread, projects, project-home, communication-center, apps, tasks, submission-center, review, document-authoring, biostatistics. Then the same four surfaces (home, projects, tasks, communication-center) at 834, 768, 430 and 390 with the AnA rail **open**, before and after the fix.

### Full walk — rail closed (`full-walk-metrics.json`)

| Check | Result |
|---|---|
| Pages that rendered the shell (`.c2c-v2.shell`) | 77 / 77 |
| Pages with horizontal overflow (`scrollWidth > viewport`) | 0 |
| Composers rendered outside the viewport | 0 |
| Uncaught page errors | 0 |
| Rail buttons per page | 20 (5 segment toggles + 15 destinations; the flag-gated CRL library is absent in this environment) |
| Grid at 1440 / 390 (rail collapsed, AnA seam) | `56px 1352px 32px` / `56px 302px 32px` |
| Editor and thread (`ownsConversation`) at 1440 / 390 | `56px 1384px 0px` / `56px 334px 0px` — the AnA column is 0, as designed |

Every surface reached its own `<h1>` at every width (Home: greeting; Projects; Project home; Communication center; Apps catalog; Task board; Submission center; Review & approval; Biostatistics; the thread and the editor render no `h1` by design).

### AnA rail open — the defect and the fix (`before-ana-metrics.json`, `after-ana-metrics.json`)

| Width | Before: grid columns | Before: content column | Before: AnA composer | After: grid columns | After: content column | After: AnA drawer |
|---|---|---|---|---|---|---|
| 834 | `56 398 380` | 398px | on screen | `56 778 0` | 778px | 380px fixed drawer over scrim |
| 768 | `56 332 380` | 332px | on screen | `56 712 0` | 712px | 380px drawer |
| 430 | `56 0 380` | **0px** | on screen | `56 374 0` | 374px | 380px drawer |
| 390 | `56 0 380` | **0px** | **off screen** (past the right edge) | `56 334 0` | 334px | 359px drawer (92vw) |

Screenshots: `before-ana-390-tasks.png` (composer's send control cut off at the right edge) vs `after-ana-390-tasks.png` (drawer with scrim, composer whole); `before-ana-430-home.png` vs `after-ana-430-home.png`; `after-ana-768-home.png` (tablet: drawer over the landing composer).

## Flows

| Flow (§18.2) | Proof |
|---|---|
| New general chat in one click | Home composer seeds `conversation-thread` (`Surfaces.tsx:send`); rail composer streams in place (`Shell.tsx:1122`) — both rendered at all seven widths |
| New project chat in one click | `ProjectHome.tsx:832-848` composer → `openThread()`; the project-home surface rendered at all widths (honest "No project selected" with no program in this database) |
| Resume recent chat | `conversation-thread` rendered at all widths; thread history is the surface's own state |
| File attach from composer | real `POST /api/chat/upload` on the rail, thread and home composers (`useChatUpload`); the file input is present in the walk's DOM at every width |
| `@app` invocation | **not present** — the `+` menu sends a message; no mention parser. Escalated (work order E3). |
| Project context visible | TopBar breadcrumb + `readShellProject()`; the walk's breadcrumb text carried the segment and surface on every page |
| Communication Center routes into work | the surface renders (FDA loop, inbox, meetings, profiles); AnA can now `navigate_to` it. It is the agency loop, not the §10.4 inbox/tasks/reviews router — recorded in the work order. |

## Regression (§18.5)

| Check | Result |
|---|---|
| Editor opens | `document-authoring` rendered at all seven widths (`data-editor="true"`, AnA column 0) |
| Artifact lifecycle reachable | `review` ("Review & approval") and `submission-center` rendered at all widths |
| Review reachable | ✓ |
| Submission reachable | ✓ |
| Dead routes | none: every `/concept2cure/<surface>` resolved to its surface; ZenRouter's catch-all redirects the rest |
| Shell escape | none: all 77 pages rendered inside `.c2c-v2.shell` |
| Contract suites | `tests/ui` (one-shell, surface-registry-coverage, token-authority, shell-kit-lazy, ana-rail-phone-drawer), `shared/navigation`, `tests/ci/no-ghost-globals`, `tests/ci/unreferenced-modules` — green |
| Gates | microcopy, catalog-copy, compliance-claims, design-system (no spring/bounce), shell-css-collisions (baseline 22, no new), and the full pre-push set — green on push |

## `config/ui-surface-registry.json`

Created. 7 shell files, 5 nav files, 3 token files, 11 views, 2 hosted former apps, 9 legacy files (all `deleted`, all verified absent), 5 destinations with their reachability. `npm run audit:ui-authority`: 46 checks, 0 failures (shown failing on three findings first — `docs/reports/ui-authority-audit-2026-09-06.md`).

## Remaining gaps, honestly

- **Product landing is not conversation-first** (§10.3): the lifecycle band and capability grid lead; the conversation panel is mid-column. A re-ordering is ~40 lines and is put to the product owner (E1), not done here.
- **No inline `@app` / slash autocomplete** (§10.1). E3.
- **Five composers, not one** (§10.1). E2.
- **IA and typography** (§4, §12): sixteen rail destinations, serif on four chrome classes, terracotta accent on a warm-cream palette — all retained by the 2026-07-28 decision; re-opening is E4.
- **Browser comparison against ChatGPT** was not performed: no reference instance is reachable from this environment. Validation is against the design specification.
- **Database**: the walk ran against an auth-only local schema (Drizzle push fails on this tree's known FK issue; pgvector is not installable here). Every surface therefore rendered its honest empty or failed-read state for project data, which is what these checks needed; it is not a data-path validation.
- **Widths above 640 with the rail expanded** were not walked (the shell defaults to a collapsed rail); the rail's own drawer rule is unchanged from before this pass.
