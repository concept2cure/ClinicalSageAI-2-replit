# W1 — the shell's chrome: where you are, and only controls that work (2026-09-28)

**Row:** D2, the launch surfaces as a user meets them. The shell is on every one of them.
**Findings closed:** 44, 128, 130, 131, 132, 134, 135, 136, 137 and 139 from the
2026-09-23 surface-truth sweep (`../2026-09-23-surface-truth/README.md`). These
were the ten layout and wording items left open there.
**Tests:** `client/src/concept2cure/v2/__tests__/shellChromeTruth.test.tsx` (17 tests) and
`appsCatalogEntitlement.test.tsx` (the finding-44 case rewritten).

## What a user saw, and what they see now

| # | Before | After | Where |
|---|---|---|---|
| 128 | The breadcrumb read "Concept2Cure.RI › Biotech & Pharma › 510(k) workbench" on about 100 surfaces, including Projects, Vault, Authoring, Submission Center and every device workbench. The breadcrumb defaulted a surface missing from the group map to `biopharma`, while the rail's own listing defaulted the same surface to *both* categories. | One function, `navGroupOf`, answers for both. `breadcrumbTierOf` names a category only when the surface belongs to exactly one, and "Admin" for an admin surface. It never repeats the surface's own name. The ⌘K palette hint had the same fallback and now uses the same function. | `registryModel.ts`, `Shell.tsx` |
| 130 | The rail highlighted only the chosen client category. The open surface carried `aria-current="page"`, which no CSS rule styled. The category carried `aria-current="true"`, which was styled as the current page. | The open surface gets the fill and the left bar. The category is a setting, so it uses `aria-pressed` with an inset ring: a shape as well as a colour, and never the current-page bar. | `Shell.tsx`, `app-v2.css` |
| 131 | The org "switcher" was a button with a chevron, no handler, and the tooltip "switcher lands with the auth flow phase". | A label with the org name in its tooltip, and no chevron or hover state. A session's token carries one org; there is no switch to offer until the server has one. | `Shell.tsx` |
| 132 | The Help "?" button had no handler. | It goes where the account menu's "Get help" goes, through one shared constant. | `Shell.tsx` |
| 134 | At 1440px with AnA open, the page name was gone ("Concept2Cure.RI › Biotech & Ph"), and the org name wrapped onto two lines. | The header gives way in priority order. First the search label and the root crumb (which repeats the logo) drop out. Then the org name, and then the path crumbs, ellipsize. The page name gives way last. See the sweep below. | `app-v2.css` |
| 135 | The collapsed rail (the default) squashed the brand mark to 5×24px. That mark is also the Document workspace button, so the click target was 5px wide. | Collapsed, the mark keeps the top of the rail and the toggle moves to the foot. | `Shell.tsx`, `app-v2.css` |
| 136 | A floating button, fixed bottom-right on every screen, covered the editor's AnA **Send** button and the side panels of Conversation and Risk-based monitoring. | Removed. See "What was removed" below. | `CollabLauncher.tsx`, `app-v2.css` |
| 137 | The auto-assign note rendered as three side-by-side columns. | One sentence beside its icon. | `CollabLauncher.tsx` |
| 139 | The Task form showed "FROM projects", "stamped as `sourceEntityType: portfolio`", both "Medical Device" and "MedicalDevice", both "Protocol Design" and "ProtocolDesign", "general", and lowercase priorities. | "FROM Projects · Linked to this portfolio". One option per module, with the server's spelling as the value (what `unifiedTaskService` switches on) and a human label. Priorities read Low, Medium, High, Critical. | `CollabLauncher.tsx`, `fixtures/collab-data.ts` |
| 44 | The Apps catalog drew a lock on all 87 modules with no Open button, saying "Included in your plan. Not switched on for this organization." The rail beside it opened every one of them. | The server has one rule. A module the plan includes needs no subscription row: `decideNavEntitlement` answers `included` (entitled), and `canAccessModule` admits it. The card read `isEnabled`, which is false whenever no row exists. It now reads its own verdict: open exactly when there is no lock. Live result: 87 cards, 0 locked, 87 Open buttons. The Setup → Modules list had the same defect and uses the same rule. | `AdminSurfaces.tsx` |

## What was removed, and what replaces it

The floating launcher (`.cl-fab`) is gone. Every entry in its menu is one click away in the header on every surface:

- **New task:** the header's **Task** button (`Shell.tsx` TopBar, `.tb-task` → `C2C.open('task')`).
- **Collaborate:** the header's message button (`aria-label="Collaborate"` → `C2C.open('collab')`).
- **Open task board:** the task tray's board link (`TaskTray.tsx`, `.tt-foot` → `tasks`).
- **⌘⇧T** still opens New task.

Proven reachable by `shellChromeTruth.test.tsx`: "the header's Task and Collaborate buttons open it — the path that replaced the floating button". The check was also made to fail: with the Task handler mutated to do nothing, that test fails.

The launcher's modal, its event, its store and the ⌘⇧T shortcut are unchanged.

## Shown failing first

[`fail-before.txt`](fail-before.txt):

- Shell chrome: the test file was run against the previous `Shell.tsx`, `registryModel.ts`, `CollabLauncher.tsx`, `collab-data.ts` and `app-v2.css`. 15 of 16 tests failed. The one that passed is the over-correction guard: the expanded rail keeps its toggle at the top. All 16 pass on the fix. The 17th test, the reachability test above, was added later and was shown failing by mutation.
- Apps catalog: 1 of 9 failed against the previous `AdminSurfaces.tsx` (the finding-44 case), and 9 of 9 pass on the fix.

## Live, on the running app

The demo organization, signed in as its admin, driven by headless Chromium.

- **Header fit** ([`header-fit-sweep.json`](header-fit-sweep.json), `after/header-ana-*.png`). Three surfaces, including the two longest names ("Product development (PDEV → IND)" and "Enterprise identity (SSO / SCIM)"), measured by rendered text width against box width:
  - AnA closed at 1920, 1440, 1280 and 1024px: the page name fits whole everywhere.
  - AnA open at 1920, 1600, 1440 and 1280px: the page name fits whole everywhere.
  - AnA open at 1100px (about 660px of header): long names ellipsize.
  - No run overflowed the header.
- **Task modal and Help** ([`live-checks.json`](live-checks.json)). The modal reads "FROM Projects · Linked to this portfolio" and offers 19 modules, once each, with server values. Help lands on `/concept2cure/conversation-thread`.
- **Apps catalog:** 87 cards, 0 locked, 87 Open buttons.

## Gates

- `vitest client/src/concept2cure/`: 432 files, 4,693 tests passed.
- `tsc`: 0 errors.
- ESLint ratchet: −2 warnings.
- `npm run build`, then: `ci:component-class-coverage`, `ci:surface-text-ramp` (regenerated), `ci:check-shell-css-collisions`, `ci:design-system`, `ci:empty-state-honesty`, `ci:launch-scope`, `ci:fixture-fallback`, `ci:check-test-imports` and `ci:untracked-imports`, all OK.

## Seen, not fixed here

The Task form's **Assign to** row shows two chips reading "JM Smith". These are two real accounts in the demo organization with the same display name, and nothing tells them apart. That is a roster-display change (show the address when names collide), not part of these findings.
