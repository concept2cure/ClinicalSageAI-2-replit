## Lane: Frontend & UX

Cold, read-only audit of branch state `92ccdba1`. Scratch scripts are in `<scratch>/frontend/`. All file paths are relative to the repo root.

### Readiness score: 5/10
- **Why it isn't lower:** engineering discipline on honest states, accessibility semantics, microcopy and route-level code splitting is well above industry norm.
- **Why it isn't higher:**
  - Self-serve signup cannot complete (UX-01).
  - The navigation does not match the six-app launch catalog, and many visible affordances dead-end on "not in this release".
  - `<html lang>` is set to the browser's language while the app is English-only (WCAG 3.1.1 failure).
  - Plan cards advertise features outside the catalog.
  - About 2,400 native nested CSS rules ship without transpilation (browser-support risk).
  - Spacing and type are not tokenised; there is no component registry.
  - End-to-end tests are thin.

**First 30 minutes demo score:**
- Self-serve fresh org: **2/10**. The trial stops at the email-verification link.
- Sales-provisioned (invited) org: **5/10**.
  - Calm, honest Home and a strong editor.
  - But: an icon-only rail with no Authoring, QMS or Submission Readiness entries, and an empty "Science & intelligence" header.
  - Picking the default "Biotech & Pharma" domain lands on "IND checklist: not in this release".
  - 42 of 57 entries in "Browse all capabilities" are locked.

### What is genuinely strong (keep)
- **Honest-state primitives:** `client/src/concept2cure/v2/dataConnect.tsx`
  - `useLiveData` separates empty from error (:349–391).
  - `ErrorState` (:489) redacts internals, is `role="alert"` and carries a correlation ID.
  - `EmptyState` (:594) defines a four-part contract.
  - `TaskTray.tsx:120–127` shows "?" rather than 0 when a count read fails.
  - Optimistic SoA toggle rolls back on refusal (`ProtocolDevSoa.tsx:95–100`).
  - Save-conflict (409) copy is clear (`editor/DocumentWorkbench.tsx:2243`).
  - AnA refusal copy is precise (`components/ana/useAnaChat.ts:342–354`).
- **Sample fixtures cannot render in production:** `mdx/lib/sampleMode.ts:34–40` checks `import.meta.env.PROD`; `useSampleRows` applies the gate.
  - Records-style fixtures were removed from `v2/fixtures`; what remains there is mostly vocabularies and types.
- **Launch scope is decided by the server, not hidden client-side only:**
  - `shared/constants/launch-scope.ts` is the single list.
  - `server/services/entitlements/navigation-entitlements.ts:262` `applyLaunchScope` overlays it on nav verdicts.
  - `launch-scope.ts:25–28`: enforcement defaults ON in production and refuses to boot on a bad value.
  - An API gate exists (`launch-scope-api.ts`).
  - On the client, the rail hides locked entries (`Shell.tsx:221–228`) and `LaunchScopeGate.tsx` covers deep links.
- **Code splitting:** all 122 `SURFACE_VIEWS` entries are lazy chunks (`surfaceViews.ts:240–356`).
- **Accessibility craft:**
  - `useDialog.ts` implements a real focus trap with focus restore.
  - Locked nav items stay focusable and carry the reason in their accessible name (`Shell.tsx:240–262`).
  - The `a11ySemantics.test.tsx` accessible-name ratchet runs in CI.
  - Status tokens are tuned: success, warning and error on their muted fills each measure ≥4.54:1 (computed); focus ring uses `--accent-main-200` at 4.98:1.
  - Reduced-motion rules exist in the shell CSS.
- **Colour tokenisation:** 51 hex literals against 3,203 `var(--…)` in the 345 KB `app-v2.css`; 0 hex string literals in TSX.
- **Microcopy discipline:** a scan of all non-test TSX found 0 emoji and 0 exclamation marks in UI strings. The only pictographs are the ✻ brand mark and aria-hidden ✓/✕ glyphs.
- **Client tests:** 342 files, 2,739 tests, about 8,300 `expect` calls. 285 files render components and 187 use user events; there are 0 snapshots.
- **Editor** (`v2/editor/RichSectionEditor.tsx`, TipTap 3):
  - Tables with captions, cross-references, citations, anchored comments.
  - Text suggestions (track changes), find/replace, symbols, images.
  - A round-trip fidelity gate (fails closed to source mode), a crash cache, and 409 optimistic concurrency.

### Surface inventory

**Shell and app entry points**

| Route (`/concept2cure/<id>`) | Launch | Reachable in prod | How it is reached / gated | State quality |
|---|---|---|---|---|
| `home` (bare `/concept2cure`) | shell | yes | Landing page. No rail entry; the only way back is clicking a Client category (`V2App.tsx:902`) | honest (lead program: loading / error / empty) |
| `projects` | Projects | yes | Rail "Project management" | honest (loading, error with retry, empty, filter-empty) |
| `project-home`, `program-journey` | Projects | yes | In-surface links | journey honest; project-home not inspected (UNVERIFIED) |
| `filings-catalog` | Projects | yes | Hidden from nav; ⌘K and links only | UNVERIFIED; 0 client tests |
| `tasks` | Projects | yes | Two rail entries: "Tasking" and "My Tasks" | honest |
| `vault` | Vault | yes | Rail | partial (no-program empty state has no CTA) |
| `artifacts-center` | Vault | yes | Rail | UNVERIFIED |
| `document-authoring` | Authoring | yes | Only the logo and the mislabelled "Recent Documents" | honest; strong editor |
| `template-library`, `review`, `regulatory-workspace` | Authoring | yes | Hidden from nav; ⌘K / Apps / links only | review honest; others UNVERIFIED |
| `protocol-dev` | Authoring | yes | No rail entry | honest |
| `submission-center` | Submission Center | yes | Rail | honest; keyboard gap (UX-12) |
| `dossier-map`, `ectd-compile`, `ectd-coauthor`, `ectd-publishing`, `gateway-transmittals` | Submission Center | yes | No rail entries | honest; no-program empty states lack CTA |
| `dispatch-readiness` | Submission Readiness | yes | **No rail entry** | honest; no CTA |
| `quality`, `qmp` | QMS | yes | **No rail entry**; `quality` is in NAV_HIDDEN | honest (sample-gated); quality renders its own top bar under the shell top bar |
| AnA and admin shell surfaces: `apps`, `conversation-thread`, `ana-command`, `ana-memory`, `audit-trail`, `part11-console`, `admin-console`, `setup`, `onboarding`, `billing`, `usage`, `licensing`, `access-requests`, `identity-console` | shell | yes | Rail Explore section / account menu | sampled honest |

**Out-of-scope surfaces**

| Route (`/concept2cure/<id>`) | Launch | Reachable in prod | How it is reached / gated | State quality |
|---|---|---|---|---|
| 84 registrations: device ×16, pdev ×8, cmc, rbm, crl-library, `insights`, global-ri, pv-cockpit, nda/maa, … | no | chrome yes, content no | Rail hides them. Still reachable as dead ends from Home quick actions, Capability browser, domain switcher, account menu ("Codebase coverage") and ⌘K search (shown locked). Deep link shows the LaunchScopeGate panel. APIs refused server-side. **Fail-open on the client** if the verdict fetch fails (`navEntitlements.tsx:16–21`) | n/a |
| Unknown id | — | yes | Renders the developer `KitSurfaceScaffold` | poor (UX-15) |

### Findings

**UX-01 · P0 · Email-verification link is swallowed by the protected shell, so self-serve signup can never complete**
- **Evidence:**
  - `router/ZenRouter.tsx:172–179`: the auth-route regex is `(login|signup|password-reset)`; `verify-email` is not in it.
  - I ran that regex under `node`: `/concept2cure/verify-email` gives `authRoute=false v2Owns(protected)=true`.
  - The protected route redirects to `/login?returnTo=…` (`ZenRouter.tsx:89–94`) and drops the `#token` fragment. The link is built as `server/services/email-verification.ts:64` `…/verify-email#token=`.
  - Signup opens no session when verification is required (`server/routes/auth.ts:1102–1122`), and login refuses with 403 `AUTH_EMAIL_UNVERIFIED` (`auth.ts:492–506`).
  - The login page's "verify" button (`Concept2CureLogin.tsx:462–463`) sends the user back into the same loop.
  - Verification is required whenever dev-auth is off (`auth.ts:898`). The CI Playwright suite runs with dev-auth, so it cannot catch this.
- **Impact:** every prospect who self-registers is locked out. It looks broken on minute 1.
- **Fix:** add `verify-email` to the auth-route regex (ideally a shared list of public auth paths). Add a Playwright test with verification required, using a captured mailbox.
- **Effort:** S. **Dependencies:** a mail-capture environment for the test.

**UX-02 · P1 · Primary navigation does not reflect the six launch apps**
- **Evidence** (rail sources `v2/registryModel.ts:93–125`; mapping computed by script):
  - Authoring is reached only via the logo and "Recent Documents", which actually opens the document list.
  - Submission Readiness (`dispatch-readiness`), QMS (`quality`, `qmp`), Review, Templates and eCTD compile have no rail entry.
  - The "Science & intelligence" header always renders (`Shell.tsx:330–333`), but all three of its items (cmc, rbm, crl-library) are launch-locked, so production shows an empty section. `insights` in the Workspace group silently disappears.
  - There is no Home entry.
  - `tasks` appears twice ("Tasking" and "My Tasks").
  - Labels disagree with the registry: "Project management" vs "Projects"; "Artifacts Center" in Title Case against the sentence-case rule.
  - The "Client categories" selector (5 segments, including device categories for a biotech tenant) sits above the workspace entries.
  - The rail is icon-only by default (`V2App.tsx` `DEFAULT_PREFS.railCollapsed: true`).
- **Impact:** a reviewer cannot find half the purchased product; demos depend on ⌘K or AnA.
- **Fix:** a launch-scoped rail with Home, Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS, then AnA and Admin. Render section headers only when they have items. Put the segment control in Settings. Default the rail to expanded on first run.
- **Effort:** S–M. **Dependencies:** founder IA decision.

**UX-03 · P1 · Many visible affordances route into launch-locked dead ends**
- **Evidence:**
  - **Home quick actions** (`registryModel.ts:776–841`, rendered at `surfaces/Surfaces.tsx:228–236`):
    - Medtech: 6 of 6 locked. Diagnostics: 4 of 4. CRO: 2 of 4. Health systems: 1 of 4. Biopharma: 1 of 4 ("CMC Module 3").
    - Biopharma's "Submission readiness" button actually opens `submission-center`.
  - **"Browse all capabilities"** (`CapabilityBrowser.tsx:41–61`) has no scope filter. Locked counts: biopharma 42 of 57, medtech 35 of 48, CRO 17 of 28.
  - **Top-bar domain switcher** (`V2App.tsx:1186–1190`) navigates to each segment's `defaultSurface` (`registryModel.ts:172, 189, 212, 231`). Medtech, diagnostics, **Biotech & Pharma (`ind-checklist`)** and CRO all land on "not in this release".
  - **Account menu** offers "Codebase coverage", an internal tool (`Shell.tsx:212`).
  - **⌘K** "Jump to" and search list locked rows.
  - **Copy:** `SubmissionCenter.tsx:1158` tells users to use "the 510(k) surface".
  - Every one of these ends on "This app is built but is not part of the current release" (`navEntitlements.tsx`, around line 333).
- **Impact:** in a trial the product feels half-finished.
- **Fix:** add one `isReachableInScope(id)` filter applied to every navigation source (quick actions, capability browser, segment `defaultSurface`, account menu, ⌘K). Add a test that enumerates every nav source against `LAUNCH_SURFACE_IDS`.
- **Effort:** M. **Dependencies:** UX-02.

**UX-04 · P1 · `<html lang>` follows the browser language on an English-only app (WCAG 3.1.1); 18-language switcher is misleading**
- **Evidence:**
  - `client/src/i18n/index.ts`: detection order is localStorage then navigator; `applyDocumentLanguage` sets `lang` and `dir`.
  - Locales cover only 167 keys (auth 126, common 31, home 6, settings 4), all 17 non-English languages at 100%.
  - `useTranslation` is used in 6 files, **0 of 178** v2 TSX files.
  - The `LanguageSwitcher` appears only on the auth pages.
- **Impact:** every user with a German, French or Japanese browser gets `lang="de"` (etc.) on English content, so screen readers mispronounce everything. That will fail a VPAT review, and the switcher implies a localisation that doesn't exist.
- **Fix:** pin `lang="en"` and remove the switcher until launch surfaces are externalised. Alternatively commit to i18n of the launch surfaces (XL).
- **Effort:** S (pin) / XL (translate).

**UX-05 · P1 · Plan and pricing cards misstate the offer**
- **Evidence:**
  - Pricing is duplicated in two client files: `v2/fixtures/licensing.ts:69–90` and `v2/fixtures/onboarding-data.ts:21–55`. It also lives server-side in `server/services/billing.ts`. All three copies are currently equal.
  - Rendered at `LicensingSurface.tsx:447–499` and in the onboarding wizard.
  - Feature lists advertise "510(k) Module", "CER Generation", "Biostatistics Module", "Custom AI Models", "On-Prem Option" and "SLA Guarantee". The first three are outside the launch catalog; "Custom AI Models" conflicts with CLAUDE.md Rule 2.
  - Professional ($399/user) is priced below Standard ($459/user); the server comment explains it as a "5+ users" effective price.
- **Impact:** a contractual-representation risk in regulated procurement.
- **Fix:** render from `GET /api/billing/pricing`, delete both client copies, and have the founder supply catalog-true feature lists and a coherent price ladder.
- **Effort:** S–M. **Dependencies:** founder.

**UX-06 · P1 · Native CSS nesting ships untranspiled (browser support)**
- **Evidence:**
  - `postcss.parse` counted 2,443 nested rules across 10 sheets, including `authoring-v2` (288, the editor layout), `misc-surfaces-v2` (387, Vault), `ectd-v2` (175) and `research-v2` (386).
  - Build target is `es2022` (`vite.config.ts:76`) with no `cssTarget`.
  - `@tailwindcss/postcss` 4.2.2 skips files with no Tailwind at-rules (checked in `dist/index.js`); none of these sheets has one.
  - I ran `esbuild.transformSync` with target `es2022`: nesting is kept. With target chrome107/safari16 it is lowered.
  - Runtime not observed (UNVERIFIED). Ask the build auditor to grep the built CSS for `.c2c-v2{.`.
- **Impact:** Chrome/Edge before 112 (for example Edge 109 in pharma VDI or Windows Server 2012 images), Safari before 16.5 and Firefox before 117 would lose editor, Vault and eCTD layout.
- **Fix:** set `build.cssTarget` to the supported browser list, add a CI check that built CSS contains no nested rules, and publish a browser matrix.
- **Effort:** S.

**UX-07 · P2 · Home ignores the tenant's client type**
- **Evidence:** Home receives `segment={prefs.segment}` (`V2App.tsx:1049`), which defaults to `'biopharma'`. The tenant's `clientType` feeds only the AnA welcome (`:1083`), and that welcome sits in the rail, which is closed by default.
- **Impact:** a medtech or CRO tenant's first screen says "Biotech & Pharma".
- **Fix:** seed `segment` from the org's `clientType` when no preference is stored.
- **Effort:** S.

**UX-08 · P2 · "Open a program" empty states with no action; project/program terminology split**
- **Evidence:**
  - No CTA on: `Vault.tsx:1276`, `DossierMap.tsx:183`, `EctdCompile.tsx:1161`, `DispatchReadiness.tsx:484`. The `OPEN_PROGRAM_EVENT` handler that would provide one already exists (`V2App.tsx:935–948`).
  - The Vault copy says "from Projects or Project management", which are the same thing.
  - UI strings use "program" 702 times and "project" 654 times.
- **Fix:** pass `action={openProgramAction}` on these empty states and pick one noun.
- **Effort:** S.

**UX-09 · P2 · Error states can't tell permission-denied from not-found from server error**
- **Evidence:**
  - `ListState` drops the HTTP status (`dataConnect.tsx:393–404`).
  - Error strings look like `HTTP 403 /api/…`, and `redactInternals` blanks anything matching `/\/api\//` (`lib/queryClient.ts:73`). A 403, 404 and 500 therefore render the same title with a "Try again" button that cannot fix a 403.
  - 13 sites pass `hint={x.error}`.
  - `Projects.tsx:1288` `hint={live.error || "…"}` never shows its friendly fallback.
  - `Vault.tsx` (`vaultReadFailure(status)`) is the correct pattern to copy.
- **Fix:** carry the status through and give 401/403/404/5xx their own copy; offer no retry on 403.
- **Effort:** S–M.

**UX-10 · P2 · Hand-rolled data layer: no caching, no refetch, partial global error coverage**
- **Evidence:**
  - About 190 `useLiveData`/`useLiveRows` call sites against 8 `useQuery` and 16 `useMutation`.
  - There is no cache, no dedupe and no refetch-on-focus, so lists go stale when a colleague changes something until the surface is remounted.
  - `GlobalMutationErrors.tsx` only hears TanStack `useMutation` failures (`lib/queryClient.ts:526–538`). About 208 `apiRequest` and 41 `liveMutateOrNull` writes rely on their own handling; the sample I checked did handle errors.
- **Fix:** reimplement `useLiveData` on top of TanStack Query, keeping its API; invalidate after writes.
- **Effort:** L.

**UX-11 · P2 · Contrast failures from muted tokens used as text**
- **Evidence** (ratios computed from `design-system/colors_and_type.css`):
  - `--text-500` (#b0aea5) is 2.11:1 on bg-000 and 1.91:1 on bg-100, but is used as a text colour in about 86 rules (43 in `app-v2.css`). Examples: `.gov-audit-note` (:3355), `.tb-empty` (:901), `.pj-card-foot` (:1152), `.art-kind` (:2292), placeholders (:974, :3361).
  - `--text-400` on bg-200 is 3.79:1. The generated ramp re-bases 300/400 on tinted surfaces but not 500.
  - `--accent-main-100` as hover link colour is 2.96:1 (`quality/app.css:87, 120, 143, 245`).
- **Fix:** restrict `--text-500` to disabled and decorative use (stylelint rule); move informative text to 300/400.
- **Effort:** S–M.

**UX-12 · P2 · SPA accessibility gaps**
- **Evidence:**
  - `document.title` never changes: it is a static string in `client/index.html:12` (WCAG 2.4.2).
  - No focus move or announcement on route change, and no skip link.
  - `role="menu"` is used with no arrow-key or Escape handling and no `aria-expanded` on the trigger: account menu (`Shell.tsx:~363`) and client-domain menu (`Shell.tsx:~473`).
  - `SubmissionCenter.tsx:1498`: sequence rows are clickable `<div>`s, so a keyboard user can only select a sequence by pressing a lifecycle-transition button.
  - The `framer-motion` page transition (`ZenRouter.tsx`) ignores reduced-motion.
  - There is no axe-core anywhere, and contrast checks are not in CI.
- **Fix:** add a per-surface title, focus the page `h1` plus a polite live region on navigation, add a skip link, use a proper menu pattern (or drop `role`), add row buttons, and run Playwright with axe over the launch surfaces.
- **Effort:** M.

**UX-13 · P2 · The design system described in the README is not the one in the code**
- **Evidence:**
  - The README (lines 12 and 29–30) cites `client/src/component-registry.ts` with "28 governed components" and bans raw `<button>`/`<input>`. The file does not exist, and the README still names the deleted `ZenApp` as the shell.
  - Actual counts: 1,378 raw `<button>`, 196 `<input>`, 105 `<select>`, 14 uses of `<Button>`.
  - `.storybook/` is configured with 0 stories.
  - Spacing tokens (`--space-*`) are defined but used 0 times in v2 CSS, against 3,916 px literals.
  - 40 distinct font sizes and 0 type-token uses; about 1,000 declarations at 11px or smaller; 2,275 inline `style={{}}`; 579 inline font sizes.
  - There is no antd; radix is used in 5 files.
- **Impact:** inconsistent density and typography; there is no reviewable component catalog to show a buyer's UX or validation team.
- **Fix:** restore a small primitive set (Button, Field, Select, Dialog, Menu, Table, States) with stories; add a type/spacing token ramp; stylelint; migrate launch surfaces first.
- **Effort:** L.

**UX-14 · P2 · Several UI generations still shipped inside one shell**
- **Evidence:**
  - Sub-applications with their own chrome, CSS and icons: the `mdx` device kit (100 files, about 28k lines, own `icons.tsx`, own `DataGate` and sample mode), `pdev` (15 files, own `App.tsx`), and `quality` (own top bar and tab bar under the v2 TopBar, `quality/App.tsx:283`).
  - 4 icon modules, plus lucide-react in 10 files.
  - 5 focus-trap implementations: `useDialog`, `EsignModal`, `GovernedConfirmDialog`, `GovernedActionSignoff`, `VaultPlaceIntoSubmission`.
  - About 72k client lines serve only launch-locked surfaces: 56 surface files (about 39k lines) plus mdx and pdev.
- **Fix:** give quality the shell's top bar and put its tabs in the page header; unify on one icon set and `useDialog`; move out-of-scope kits behind a build-time exclusion.
- **Effort:** M–L.

**UX-15 · P2 · An unknown deep link shows a developer scaffold**
- **Evidence:** `V2App.tsx:1066` falls back to `KitSurfaceScaffold` (`Surfaces.tsx:917–990`), which renders "Kit — design prototype", "Hook — useHome() via apiQueryOptions — ~5 lines" and "Help me install the Home surface".
- **Fix:** an honest not-found panel with a link to Home.
- **Effort:** S.

**UX-16 · P2 · The editor falls short of what Word-based regulatory writers expect**
- **Evidence** (`v2/editor/*`):
  - Missing: footnotes, table of contents, heading auto-numbering, headers/footers, page-layout preview, font size/indent controls, spell-check (0 matches for each).
  - Track changes records only text edits within a paragraph; structural and formatting changes "apply directly and are not tracked" (RichSectionEditor title strings).
  - On a save conflict the user must reload and reapply by hand; there is no compare/merge view (`DocumentWorkbench.tsx:2243–2250`).
  - Live co-editing is compiled off (`flags/featureFlags.ts:74–80`).
- **Fix, prioritised:** track formatting and table changes; footnotes; TOC and numbering; a compare view on conflict; `spellcheck` attribute.
- **Effort:** L–XL.

**UX-17 · P2 · Review "Approve" is not a Part 11 signature but looks like one; model confidence shown to reviewers**
- **Evidence:**
  - `Review.tsx:209–260` uses the `esign-modal` class and a lock icon, while its own text says the decision is "not a 21 CFR §11.50 signature manifestation".
  - `Review.tsx:946–948` shows "NN% confidence" with a traffic-light tone, from the server's `conf` field. Whether that number is deterministic (Rule 2) is UNVERIFIED.
- **Fix:** restyle as a review verdict and link it to the actual signature step; hide the confidence badge unless it comes from a deterministic engine.
- **Effort:** S. **Dependencies:** founder decision on the approval workflow.

**UX-18 · P2 · If the nav-verdict fetch fails, every out-of-scope surface reappears**
- **Evidence:** `navEntitlements.tsx:16–21` ("no verdict, no lock"). A failed or slow `/api/module-subscriptions/navigation` shows all 84 locked surfaces in the rail, ⌘K and deep links; their APIs then return 403.
- **Fix:** because launch scope is a static release fact, apply it client-side from `LAUNCH_SURFACE_IDS` when there is no verdict (licence locks can stay fail-open).
- **Effort:** S.

**UX-19 · P2 · No help or support path**
- **Evidence:** both "Get help" entry points go to the AnA conversation (`Shell.tsx:150, 213, 548`). There are no docs, no support contact and no status page.
- **Fix:** a help menu with docs, support contact and the build stamp (for validation evidence).
- **Effort:** S.

**UX-20 · P2 · End-to-end coverage of golden journeys is thin**
- **Evidence:**
  - CI runs 2 Playwright specs (`.github/workflows/tier5-browser-smoke.yml:98, 105`): an authenticated smoke test (landing and projects render) and `golden-customer-journey.e2e.ts`.
  - The golden journey is mostly `browserApi` POSTs with one UI click ("Artifacts Center", line 261).
  - About 30 other specs in `tests/e2e/` are not run in CI.
  - No UI-driven flow covers create program → Vault upload → author → review → compile → readiness → QMS.
  - `FilingsCatalog` has 0 client tests.
- **Fix:** see WO-11.
- **Effort:** M.

**UX-21 · P3 · Unused dependencies**
- **Evidence:** 9 unused packages in `package.json` (antd, @ant-design/icons, reactflow, d3, recharts, firebase, html2canvas, react-pdf, jspdf), each with 0 imports across the whole repo. 23 of 28 radix packages are unused. The `manualChunks` rules for them are dead code.
- **Impact:** noise in SBOM and CVE scans.
- **Effort:** S.

**UX-22 · P3 · Heavy eager load**
- **Evidence:** the shell eagerly loads about 783 KB of unminified CSS across 8 sheets (`V2App.tsx:70–125`), including `device-v2` and `research-v2`, which only serve out-of-scope kits. `framer-motion` loads on every route via `ZenRouter`.
- **Effort:** S. **Dependencies:** the build auditor's measured sizes.

**UX-23 · P3 · Microcopy lapses**
- First person in UI: `DispatchReadiness.tsx:542` "I cannot clear it…".
- Internal jargon on screen:
  - "surface": `SurfaceScaffold.tsx:32–44`.
  - "tenant": `DocumentWorkbench.tsx:3101`.
  - "MDX": `Projects.tsx:1295`.
  - "spine", "One canonical record.", "A module script dropped on the way in".
- Spelling mix: organisation (28) vs organization (229).
- `fixtures/admin-data.ts:142–150`: "ss11.10(e)", "--" separators, and a hard-coded "142 pure-function regulatory tools".
- "Good morning, there" when the user has no name.
- A "Sales demonstration" script is offered to customers (`shared/navigation/demo-scripts.ts:207`).

**UX-24 · P3 · Dead theme and flag code**
- **Evidence:** the dark theme is maintained but unreachable: nothing sets `prefs.dark` and there is no `prefers-color-scheme` rule. The 31 client feature flags are compile-time constants used at 2 call sites.

**UX-25 · P3 · Example records still ship in the production bundle (not rendered)**
- **Evidence:**
  - `quality/data.ts:147–164` and `mdx/store/dossierStore.ts` seed data (named people such as "Dr. Lee Hartman", "Jordan Chen"). Both are gated by `import.meta.env.PROD`, so they do not render.
  - `dossierStore.ts:42–47` uses example IDs (K-251401, P250048) as root labels for live paths too; these are out-of-scope device surfaces.

### Recommended work orders
1. **WO-1 Fix verify-email and prove signup end-to-end (UX-01).**
   - Goal: a fresh org completes signup → verify → login.
   - Scope: `ZenRouter` public-auth list; e2e with verification required and a mail sink.
   - Acceptance: the Playwright test signs up, opens the captured link and lands on Home; a negative test shows an expired token message.
   - Effort S.
2. **WO-2 Launch-scoped IA (UX-02, UX-03, UX-18).**
   - Scope: rail = Home plus the 6 apps plus AnA/Admin; one `inScope()` filter over quick actions, `CapabilityBrowser`, segment defaults, account menu and ⌘K; client-side launch-scope fallback; relabel.
   - Acceptance: a unit test enumerates every nav source, with 0 ids outside `LAUNCH_SURFACE_IDS`; no empty rail section; each launch app reachable in one click (DOM test).
   - Effort M. Depends on founder IA sign-off.
3. **WO-3 Language honesty (UX-04).**
   - Acceptance: `<html lang="en">` on every surface whatever the browser locale; switcher removed or limited to fully translated scope.
   - Effort S.
4. **WO-4 Server-sourced, catalog-true pricing (UX-05).**
   - Acceptance: 0 client pricing constants (grep gate); cards render from the API; the feature list contains only launch-catalog items; the founder has approved the price ladder.
   - Effort S–M.
5. **WO-5 Browser support matrix and CSS lowering (UX-06).**
   - Acceptance: `build.cssTarget` set; a CI check finds no nested rules in built CSS; Playwright smoke passes on Chromium 109.
   - Effort S.
6. **WO-6 First-run path (UX-07, UX-08).**
   - Scope: seed segment from `clientType`; a first-run checklist on Home (create program → upload → draft → request review); CTAs on every no-program empty state.
   - Acceptance: DOM tests per launch surface show an action button in the no-program state; a medtech tenant's Home shows medtech copy.
   - Effort M.
7. **WO-7 Status-aware error states (UX-09).**
   - Acceptance: tests render 403, 404 and 500 for `useLiveRows` consumers with distinct copy, and no retry on 403.
   - Effort S–M.
8. **WO-8 Accessibility pass for launch (UX-11, UX-12).**
   - Scope: per-surface `document.title`, route focus and announcement, skip link, menu pattern, row keyboard access, restrict `--text-500`, axe-core in Playwright over launch surfaces.
   - Acceptance: 0 serious or critical axe violations; stylelint forbids `color: var(--text-500)` outside disabled/placeholder use.
   - Effort M.
9. **WO-9 Design-system consolidation (UX-13, UX-14).**
   - Scope: primitives with stories; type and spacing ramps; stylelint; QMS on the shell's top bar; one icon set and one dialog hook.
   - Acceptance: launch surfaces have 0 raw `<button>` outside primitives (lint); Storybook ≥ 20 stories; README matches the code.
   - Effort L.
10. **WO-10 TanStack-backed data layer (UX-10).**
    - Acceptance: `useLiveData` keeps its API on top of `useQuery`; refetch-on-focus; invalidation after writes; an `apiRequest` failure reaches `GlobalMutationErrors` when the call site doesn't handle it.
    - Effort L.
11. **WO-11 UI-driven golden-journey e2e in CI (UX-20).**
    - Acceptance: one spec drives the 8-step journey through the UI only, runs per PR and is shown failing on a seeded regression.
    - Effort M. Depends on WO-1.
12. **WO-12 Editor parity for writers (UX-16).**
    - Acceptance: formatting and table changes produce suggestions; footnotes round-trip to DOCX; a 409 conflict shows a diff.
    - Effort L–XL.
13. **WO-13 Not-found and help (UX-15, UX-19).** Effort S.
14. **WO-14 Dependency and eager-CSS hygiene, microcopy sweep (UX-21–UX-23).** Effort S.

### Open questions for the founder
1. Is self-serve signup a launch path, or are all orgs sales-provisioned through invites? This sets UX-01 at P0 or P1.
2. Out-of-scope apps: invisible, or a visible "later" roadmap in the Apps catalog only? Today they surface in Home, Browse, the domain switcher and ⌘K.
3. Should a tenant see or switch to other client categories (device categories for a biotech)?
4. Localisation at launch: which languages, if any?
5. Price ladder (Professional cheaper per user than Standard), plan feature lists, and whether the DTC free "Researcher" tier and the self-serve plan wizard are in scope.
6. Live Drive (AnA moving the user's screen) is ON by default (`V2App.tsx:139–160`). Is that acceptable for GxP customers?
7. The supported browser and VDI matrix.
8. Document-approval workflow: Review verdict vs Part 11 signature. Which one is "approval"?
9. The document mental model: Vault vs Artifacts Center vs Authoring list vs project files. Can this be one home?
10. Ship dark mode or delete it; the brand forms "Concept2Cure.RI" and "AnA" in customer UI; whether Title Case nav labels are intended.