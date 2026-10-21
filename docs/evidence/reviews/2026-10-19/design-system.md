# Design-system lens, weekly periodic review 2026-10-19

**Subject:** `e1f3fd425` (2026-10-17, parent `4b0e3ff1e`). **HEAD reviewed:** `9795a1e1e` on `concept2cure-v2`. Read-only throughout: no `--write-baseline`, and `git status` was clean before and after, so there was nothing to restore under `docs/reports/`.

**Result.** At HEAD every gate is green. At the landing commit itself, two design gates were red (`ci:check-css-selector-shadowing` and `ci:surface-text-ramp`). Both were fixed on 2026-10-18 by other sessions. The gates cannot see most of what is wrong with the code. I found one regression on a launch surface, a block of dead and leaking CSS, and 19 unstyled controls that render as plain text or invisible fields.

## 1. Gates

Columns after the first come from running the real gate scripts against exported copies of each revision under the scratchpad. The "2026-10-08" column is from that review's own report, except phantom tokens, which I re-ran at `373c9af51`.

| Gate | 2026-10-08 | Parent `4b0e3ff1e` | Landing `e1f3fd425` | **HEAD** |
|---|---|---|---|---|
| `ci:design-system` | OK | OK | OK | **OK** (icon library, spring motion and `<style>` only) |
| `ci:token-contrast` | 131 pairs, 15 exceptions | same | same | **131 pairs, 15 documented exceptions held** |
| `ci:check-phantom-tokens` | 9 tokens / 53 sites | 9 / 53 | 9 / 53 | **9 / 55 (baseline 9), OK** |
| `ci:check-chip-tones` | 155 | 170 | 170 | **170 literal uses, all 28 resolve** |
| `ci:token-cascade` | 39 stylesheets | 41 | 41 | **PASS, 42 stylesheets** |
| `ci:check-css-selector-shadowing` | 42 / 19 known | 44 / 18 known, 0 new | **FAIL: 1 new** | **OK, 45 stylesheets, 18 known, 0 new** |
| `ci:check-orphaned-stylesheets` | 46 / 0 | 48 / 0 | 48 / 0 | **49 imported / 0 orphaned (baseline 0)** |
| `ci:launch-scope` | pass | 7 apps, 33 surfaces, 13 modules, 28 files | identical | **identical, passes** |
| `ci:launch-scope-api` | pass | not run | not run | **416 API paths, none refused** |
| `ci:surface-text-ramp` (the text-ramp gate) | not run | OK | **FAIL: v2 sheet stale** | **OK, 3 sheets match (green now)** |

**Attribution of the deltas**
- **Landing's own delta:** zero on token-contrast, phantom tokens, chip tones, token-cascade, orphaned stylesheets and `launch-scope`.
- **Stylesheet counts (+3 across three gates):** all three were added by other commits.
  - `discovery-onboarding.css` came in via `0f34e50cd` and `review-decision.css` via `404e94efc`, both before the landing.
  - `company-documents.css` came in via `68b3dd627` after the landing.
  - The landing modified three CSS files and added none.
- **Phantom sites 53 to 55:** `68b3dd627` added one line, `company-documents.css:37`, with two `var(--danger, #b84141)` uses. The gate only ratchets token names, so it stayed green. This is not the landing.
- **Shadowing red at the landing:** the landing re-added `.qms-shell button:disabled` (`quality/app.css:68`) when an identical rule already existed at line 190. `48ff2fda7` removed the duplicate on 2026-10-18.
- **Ramp red at the landing:** the checked-in v2 ramp was stale by exactly three selectors: `.qms-dialog input`, `.qms-dialog select`, `.qms-dialog textarea`. Those are the landing's own new rule. The regeneration that absorbed them (`d66804668`, 2026-10-18 18:39 UTC, about 19.6 hours after the landing) names only the unrelated "Company documents sheet". `8c5b31bc7` was a separate `.cc-q` fix.

**Extra gates I ran (not in the brief)**
- Pass: `ci:undefined-css-classes` (2 reviewed exceptions), `ci:class-vocabulary` (5,229 files), `ci:check-shell-css-collisions` (22, baseline 22), `ci:frozen-theme-aliases`.
- Could not run: `ci:component-class-coverage` needs `npm run build` (exit 2, not a code failure).

**Registry integrity**
- The landing changed `ui-surface-registry.ts` and `ui-surface-registry.ui-v2.ts` (`notes` and `apiPrefixes`) and did not touch `surfaceViews.ts`. No surface id was added or removed.
- The new CSR prefixes it added match the endpoints `CsrSourceInputControls` and `CsrNarrativeReadiness` actually call.
- `ci:launch-scope` was green at parent, landing and HEAD with identical counts, so registry and `SURFACE_VIEWS` alignment is not at risk from this change.

**Prior items**
- 2026-09-28's G2 (raw-hex module palette) was already fixed by 2026-10-08.
- 2026-10-08's DS-1 (two stale shadowing-baseline entries) is closed: `42ebfc7a6` on 2026-10-15 deleted them, and the gate prints no stale notice.
- DS-2 (Reporting inline styles) is outside the 48 files and was not re-verified.

## 2. Findings

Severity is the design-system lens only. CONFIRMED means the cascade or code proves it, or real pixels corroborate it. PLAUSIBLE means inferred from the CSS and not rendered. I had no browser, so no finding is a rendered measurement unless I say a screenshot corroborates it.

### F1. The protocol selectors lost their styling in the replacement. Medium, launch surface (Authoring, protocol-dev). Introduced by landing. CONFIRMED (render inferred).
- **Where:** `ProtocolDevSelection.tsx:60,64`.
- **What a user sees:** the "Protocol scope" and "Protocol" selects, the only way to switch protocols and scope, have no border or background.
- **Why:** the old `ProtocolPicker` was live at the parent (`ProtocolDev.tsx:323` in that revision). It was styled by `.pde-picker select` (`protocol-dev-editing.css:39`, border `--border-control`). The new bar sits in `.pde-note > .pde-actions`, and no rule styles a select there. The shell reset `.c2c-v2 select{background:transparent;border:0}` (`app-v2.css:83`) wins. The old rule is now dead.

### F2. 19 bare controls that the shell reset renders as plain text or invisible fields. Medium. Introduced by landing. CONFIRMED by cascade; render inferred. The v2 shell has no shared Button or Input, which is the systemic cause.
- **The rule:** `.c2c-v2 button{background:none;border:0;padding:0}` and `.c2c-v2 input,textarea,select{background:transparent;border:0}` (`app-v2.css:81-83`). The shell comment says `.c2c-input` is "the class every surface uses".
- **What a user sees:** buttons read as ordinary words, text fields have no visible box, and clinical tables have no cell padding or borders. No `.c2c-v2 table`, `th` or `td` rule exists. The Tailwind 4.2.2 preflight is loaded via `index.css:86`, and I read `node_modules/tailwindcss/preflight.css`.
- **The 19 (HEAD lines, from a TypeScript AST scan with `git blame` attribution):**
  - **Buttons (10):**
    - `CsrSourceInputControls.tsx` lines 68, 69, 163, 164, 165, 188, 210
    - `CsrNarrativeReadiness.tsx:59`
    - `OrchestratorRunControls.tsx:155`
    - `NotificationPreferences.tsx:28`
  - **Selects (5):** `BlaAssessmentWorkbench.tsx:113`, `IvdAssessmentWorkbench.tsx:119`, `CsrSourceInputControls.tsx:183`, and `ProtocolDevSelection.tsx:60,64`. The last two are also F1.
  - **Text input (1):** `As2ReceiptUpload.tsx:57` (Content-Type), which has no visible box.
  - **Table (1):** `CsrSourceInputControls.tsx:60` (up to eight clinical tables).
  - **`<pre>` (2):** `AssessmentWorkbenchKit.tsx:38` and `CsrSourceInputControls.tsx:168`.
- **A second idiom inside one panel:** the `OrchestratorRunControls` card mounts three components. The orchestrator toolbar uses `nda-open` buttons and a `c2c-input` select. `CsrNarrativeReadiness` uses `nda-open` buttons but a bare Retry button. `CsrSourceInputControls` is almost entirely bare.
- **Why no gate fired:** `ci:undefined-css-classes` only sees class names, and these elements have none.
- **Retracted claim:** I first thought bare headings were flattened. They are not: `colors_and_type.css:568-590` styles `h1` to `h4`.

### F3. `admin-access.css:200-207` is mostly dead CSS, and part of it leaks. Medium. Introduced by landing. CONFIRMED (layout effect inferred).
- **Dead rules:** `.adm-key-create` is a class on two buttons (`AdminAccess.tsx:589`, `AdminPlatformGrants.tsx:108`), so six descendant rules (`form`, `fieldset`, `input`, `label`) can never match. A button cannot contain a form. `.adm-key-secret` has no consumer, because the secret renders as `<input className="de-input mono">`.
- **What a user sees:** the live part is `.adm-key-create{margin-block:12px}`, so the "Create API key" and "Grant platform access" buttons gain 12px block margins in a baseline-aligned flex header. The `.adm-key-actions` redeclaration is shadowed by `.adm-access .adm-key-actions` at line 77, and the gate cannot see that because the selector paths differ.
- **Convention break:** it is the only unscoped, px-literal block in the file; the rules it duplicates at lines 72-80 are tokenized and `.adm-access`-scoped.
- **Fix:** delete the block.

### F4. The new QMS dialogs have two defects, and the landing's reset edit is a no-op. Medium, launch surface (QMS). Introduced by landing. CONFIRMED by cascade; one point corroborated by screenshot.
- **The edit:** `quality/app.css:10` lowers the reset from `.qms-shell button` (0,1,1) to `:where()` form (0,1,0). QMS is only mounted inside `.c2c-v2` (`V2App.tsx:1196`), and `.c2c-v2 button` (0,1,1) is still in force. A PostCSS specificity pass found 12 single-class QMS button rules that stay overridden: `.qms-btn`, `.qms-tab`, `.qms-chip`, `.qms-tpl-card`, `.qms-link`, `.qms-num`, `.qms-review-row`, `.qms-tb-btn`, `.qcc-node`, `.qcc-offramp`, `.qcc-linkcount`, `.qcc-link`.
- **Corroboration:** the pre-landing screenshot `docs/evidence/DEMO/biotech/screenshots/09-quality-sop-register.png` (2026-09-29, full shell) shows the primary "+ New controlled document" text flush to its edge and the Effective/Under review chips as bare text.
- **What a user sees:** the new dialogs' footer buttons (`qms-btn ghost` and `primary`, `ControlledDocumentDialogs.tsx:113,137`) get zero padding. The older `.qms-training-dialog` avoided this with a three-class override.
- **Control boundary (SF-1 rule):** `.qms-dialog input,select,textarea` (`app.css:60`) use `1px solid var(--bg-200)`. Contrast is 1.19:1 light and 1.39:1 dark, against the 3:1 `--border-control` rule that `cba7b56d5` migrated to. `ci:token-contrast` does not check selector-level borders.

### F5. `--muted` is used as a text colour in four places. Medium, launch surface (Gateway transmittals). Predates the landing. CONFIRMED.
- **Where:** `GatewayTransmittals.tsx:148, 471, 472, 521`. There were 4 uses at the parent and 4 after the landing.
- **What a user sees:** sequence number, gateway account line and the §11.50 "signed · meaning:" line are effectively invisible. `--muted` is a surface tint (`#eee5d0` light, `#1f1f1d` dark). Contrast is 1.19:1 on `#faf9f5` and 1.09:1 on dark `#262624`.
- **Origin:** introduced 2026-10-01 (`78c77e0c2`, `723395ed4`, `cea1f4450`). The landing carried line 521 through its refactor into `TransmittalSignatureCell`.
- **Fix:** use `--muted-foreground` or `--text-300`.
- **Other lens:** this one deserves a Part 11 look.

### F6. Smaller items. Low, all introduced by landing unless stated.
- **Dead CSS left by deletions.** The deleted change simulator left `.cm-mkt`, `.cm-mkt-opt` and `.cm-change-out` (`journey-v2.css:376-378` and others), with 0 TSX consumers. The deleted `ProtocolPicker` left `.pde-picker` and `.pde-picker-count`. Replace-or-Delete says the CSS goes in the same change. CONFIRMED.
- **`btn ghost small` leaks the uppercase label class.** `.btn.small` is defined only under `.adm-access` (`admin-access.css:39`). Elsewhere `small` resolves to the canonical global "tiny uppercase label" class (`colors_and_type.css:613`). The landing added five uses: `OrganizationAccess.tsx` (4) and `TaskTray.tsx:349`. A real 2026-10-14 screenshot (`D2-CLIENT-ONBOARDING/.../authoring-access-light.png`) shows the same class pair rendering "RELOAD ACCESS" in full-size uppercase buttons. In the tray it sits inside the already-uppercase group head. CONFIRMED. The pattern is pre-existing in 12 files.
- **IVD workbench has no padding.** `IvdAssessmentWorkbench.tsx:101` uses `reg-card` without `reg-pad`, and `.reg-card` has no padding (`app-v2.css:501-502`). The BLA workbench is a `reg-card` nested in `NdaCockpit.tsx:755`'s `reg-card`, so the tab shows a box inside a box. CONFIRMED by CSS.
- **Modal shadow and scrim bypass the shell token.** `quality/app.css:56` has `rgb(0 0 0 / 20%)` shadow and `rgb(0 0 0 / 45%)` scrim. The shell's sanctioned warm modal token is `--v2-shadow-lg` (`app-v2.css:44`, "≤ .14 alpha"). The file's older dialog (`.qms-training-*`) is tokenized (29 `--space-*` lines versus 0 in the landing's block). CONFIRMED.
- **Org invitations badge.** `OrganizationAccess.tsx` renders the invitation count as a bare `<span>` at 17px. TaskTray's bell uses `.tt-badge` (`TaskTray.tsx:165`). Two count idioms in one top bar. CONFIRMED.
- **Mismatched buttons.** `ConversationFilesAdopt.tsx:128` keeps an inline `fontSize:12, padding:'4px 12px'` on "Add to this project", and the new "Check Data Room" button beside it has neither. CONFIRMED.
- **Error and notice text without tone.** The landing added 30 `role="alert"` elements. 20 have no className, 6 have neutral note classes, and 4 carry a warn or refusal tone (`sp-tone-warn`, `pde-refusal`). CONFIRMED by count.
- **Inline styles.** Net +18 `style={{` objects in the 48 files (27 gross, minus 9 removed from `CmcModule`). Across the v2 tree the count went from 2,130 to 2,149. The "about 1,461" baseline in the brief is stale. The largest additions are `CmcVariationAssessment.tsx` (6), `CmcRegisterLinks.tsx` (5) and `CsrSourceInputControls.tsx` (4).
- **JSON viewer copied twice with different heights.** `AssessmentWorkbenchKit.tsx:38` uses `maxHeight:420` and `CsrSourceInputControls.tsx:168` uses `350`. Two classed viewers already exist (`CmcModule3Build.tsx:763`, `PrecedentEngine.tsx:790`).
- **Drawer scaffold copied.** `NotificationPreferences.tsx` and `OrganizationAccess.tsx` each hand-assemble the `tt-scrim/tt-panel` scaffold (3 files now). Advisory; v2 has no shared Drawer.

### F7. Checks that came back clean
- **Hex and Tailwind:** no hex colours and no Tailwind arbitrary values on added lines.
- **Tokens:** all 13 distinct `var(--…)` names on added lines are declared repo-wide, including fallback-less uses, so there are no phantoms from the landing.
- **Dark mode:** every colour token the new CSS reads has a dark counterpart.
- **Icons:** the shared `I` map only, no inline SVG, no new icon library.
- **Auth CSS:** `ssoSection` has a consumer (`OrganizationSso.tsx:45`) and its px style matches that module (41 raw-px lines, 0 `--space-*`).
- **Reuse:** shared primitives are widely reused. `C2CForm` appears in 16 of the 48 files, `EmptyState` in 18, `EsignModal` in 5, `useDialog` in 5. As expected, `client/src/components/ui/` is imported 0 times from v2.
- **Convergence:** the landing replaced rather than added. The simulator was deleted, and `CmcVariationAssessment` and `OrganizationAccess` are extensions. No new `SURFACE_VIEWS` entry.

### F8. Pointers outside my lens (flagged, not assessed)
- **Rule 2:** `BlaAssessmentWorkbench` (124 lines), `IvdAssessmentWorkbench` (140) and `AssessmentWorkbenchKit` (39) live in `nda-cockpit` and `ivd-completeness`. `isLaunchSurface` returns false for both, so this is new capability inside non-launch surfaces.
- **Deletion rule:** the change simulator's replacement, `CmcVariationAssessment`, is shown only when `launchScopeEnforced === false`, so it is unreachable at launch (`CmcModule.tsx`, the `CmChange` branch). CLAUDE.md's deletion rule requires a reachable replacement.
- **Test and evidence gap:** the landing added 26 jsdom test files in `v2/__tests__/` and no screenshot. None asserts any rendered style, which is why F1 to F5 passed. Every UI finding above came from reading CSS.
- **Selection cue:** a linked task or transmittal row has no styled selected state (`data-work-target` and `transmittal-row-*` have no CSS). The row is moved to the top and focused, so the cue is positional only. PLAUSIBLE, advisory.

## 3. Exact coverage

**Read in full as diffs:**
- All 48 files in `scope-client.txt`, via `git show e1f3fd425 -- <file>` (2,565 lines added and 657 removed across 51 files with the 3 CSS).
- The three CSS files: `concept2cure-auth/styles.module.css`, `quality/app.css`, `v2/styles/admin-access.css`.
- I also read `quality/ControlledDocumentDialogs.tsx` (outside the 48) because it consumes the new QMS CSS.

**Machine-checked:**
- Phantom tokens, shadowing, ramp, token-cascade, chip-tones, orphaned stylesheets and `launch-scope` re-run on exported parent and landing trees. The shadowing and ramp results at the landing are real runs, not inference.
- `ci:launch-scope-api` at HEAD only.
- A TypeScript AST scan with `git blame` attribution of the 48 files, a `postcss`/`postcss-selector-parser` specificity pass over `quality/app.css` before and after, and contrast arithmetic.
- Rendered evidence is existing screenshots only (2026-09-29 and 2026-10-14). I rendered nothing.

**Not covered:**
- 136 other client files changed by the landing: 78 tests, about 55 non-test files (the other `quality/` components, `OrganizationSso.tsx`, `Concept2CureLogin.tsx`, `EsignModal.tsx`, the mdx surfaces, `v2/editor/*`), plus 3 CSS files, which I reviewed separately.
- The other 1,100-plus landing files (server, shared, db, CI).
- Reporting surfaces and DS-2.
- Any browser rendering, so every visual consequence above except the ones tied to a screenshot is inferred from the cascade.
- Blame attribution is a lower bound: lines later touched by other commits are excluded. The inline-style delta uses before/after file counts instead.

**Key files:**
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/styles/app-v2.css`
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/quality/app.css`
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/styles/admin-access.css`
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/ProtocolDevSelection.tsx`
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/CsrSourceInputControls.tsx`
- `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`

Scratch outputs, including the AST scan JSON, are under `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/df678b90-6e5c-570f-95c8-b0431c63411d/scratchpad/`, for example `.../scratchpad/jsx-scan.json`.
