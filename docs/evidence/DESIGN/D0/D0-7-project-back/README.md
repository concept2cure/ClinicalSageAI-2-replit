# D0-7: one shared "back to the project" link

**Package:** D0, Foundations (`Plan: D0`). **Step:** the shared `ProjectBack` the coordination file names
(`.design/claude-convergence/COORDINATION.md`, "the shared `ProjectBack`"). It converges the back link of D5 §WA.4.2
rule 2 (`.design/claude-convergence/D5.md:233–239`) into one component in D0's existing shared UI file.
**Read at:** `a7e9f2e6b` on `concept2cure-v2`, 2026-11-02. The owner files below were read there; their line numbers
are as of that commit. The gates ran at `620a844ca`, which changes only `commcenter-v2.css`.
**Files changed:**
- `client/src/concept2cure/v2/dataConnect.tsx`: one export, `ProjectBack`, and one import, `useShellProject`.
- `client/src/concept2cure/v2/__tests__/projectBack.test.tsx`: the new test.
- `tests/ops/ui-read-recovery.test.mjs`: one stub line in its module loader (see "Tests and gates").
- This folder.

Nothing else is changed. No owner file is edited: each owner converges in its own lane, using the replacement written
out below. The reviewing session commits (see "Review").

## What already exists (RULE 3)

Searches run, at `a7e9f2e6b`:
- `grep -rn 'pj-back\|CmBack\|ProjectBack' client/src` (TSX, TS, CSS);
- `grep -rn "I\.left" client/src/concept2cure` (every left-arrow link);
- `grep -rn "'project-home'" client/src/concept2cure/v2` (every navigation to the project);
- `grep -rln "BackLink\|BackButton\|ProjectBack" client/src` (no component by any of these names);
- `git log --all -S 'ProjectBack' -- client/src/concept2cure/v2` and
  `git log --all --diff-filter=D --name-only -- 'client/**/*Back*'` (history);
- `grep -rn 'leaveGuard\|registerSurfaceLeaveGuard\|surfaceLeaveRefusal' client/src/concept2cure/v2` (leave guards).

### The copies: five, not four

The step named four copies. The search found **four copies of the project back link and a fifth** in
`Biostatistics.tsx`. It found one more `.pj-back` in `ProjectHome.tsx` that is **not** a copy: it leaves the project
for the portfolio.

| Path at `a7e9f2e6b` | What it renders | When it renders | Project read | Owner (lane) |
|---|---|---|---|---|
| `surfaces/CmcModule.tsx:633–646` (`CmBack`), used at `:3325` | `<button type="button" className="pj-back" onClick={() => nav?.('project-home')}>{I.left} {project.title ?? 'Project'}</button>` | `useShellProject()` is non-null; otherwise `null` | `useShellProject()` (reactive) | CMC session (`01GJidg5…`), D5 |
| `surfaces/Vault.tsx:2970–2975`, its words from `:1281–1282` | the same markup, with `onNav?.('project-home')` and `shellProject?.title ?? 'Project'` | `projectId` is truthy (`currentProjectId()`, `:252–256`, which is `readShellProject()`'s id) | `readShellProject()` for the condition, `useShellProject()` for the words | Vault, D6 (L8) |
| `surfaces/Insights.tsx:1641–1644` (`ReportingHead`) | the same markup, on one line | `useShellProject()` is non-null | `useShellProject()` | Reporting session (`011HLkY…`), D7-D (L11) |
| `surfaces/Biostatistics.tsx:915–919` | the same markup | `program` is non-null | `readShellProject()` at `:532`, **not reactive**: a project opened after this screen mounted does not show its link until something else re-renders the screen | CMC session (`01GJidg5…`), D5-3/D5-4 |
| `surfaces/ProjectHome.tsx:1973` | `<button className="pj-back" onClick={() => onNav('projects')}>{I.left} All projects</button>` | always | — | not a copy: it is the project page's way **out** to Projects, and `projectHomeSettingsHonesty.test.tsx:128–142` pins that every leaver says "All projects". It stays as it is. |

The four project copies are one behaviour. `readShellProject()` is non-null exactly when `useShellProject()` is,
because the hook's snapshot is `readShellProject()` (`shellProject.ts:348–354`). The only differences are
Biostatistics' non-reactive read and the prop's name (`nav` in `CmBack`, `onNav` elsewhere). **The best of them is
`CmBack`.** It is already a component, reads the project reactively, sets `type="button"`, renders nothing with no
project open, and carries the comment that says why.

### What each piece does today

- **The markup contract** is D5 §WA.4.2 rule 2 (`D5.md:233–239`): only where the area is project-scoped and a project
  is open (`useShellProject()` non-null), `{I.left} {project.title ?? 'Project'}`, `onNav?.('project-home')`. D6
  (`D6.md:270`, `:278`, `:428`, `:500`) and D7 (`D7.md:131`) prescribe the same link for Communication, Vault and
  Submission Center. Each of those would have been a sixth and seventh copy.
- **The style** is `styles/app-v2.css:1247–1249` (`.pj-back`: inline-flex, 6px gap, 12px, `--text-400`, 14px bottom
  margin; hover `--text-100`) and `:3888` (`[data-work-area] > .pj-back{margin:0 0 12px}`). The focus ring is the
  global `.c2c-v2 button:focus-visible` at `:105`. Not changed here. Two observations for whoever holds
  `app-v2.css`: `:1249`'s `.pj-back .ico` matches nothing, because `I.left` renders a Lucide `<svg>` with no `ico`
  class; and D3 §4.12 (`D3.md:573–575`) restyles `.pj-back` to 13px `--text-300` with a 16px icon. Both are D3's,
  not this step's. `--text-400` on `.main`'s `--bg-000` (`:1667`) is the one pairing D0.md §3 allows, so today's
  colour passes.
- **The icon** is `I.left` (`icons.tsx:231`). Every icon is rendered `aria-hidden="true" focusable="false"`
  (`icons.tsx:133–134`), so the button's accessible name is the project's title alone.
- **The project.** `shellProject.ts` is the one channel for the open project: `useShellProject()` (`:352`),
  `readShellProject()` (`:365`), `publishShellProject()` (`:109`), `clearShellProject()` (`:189`).
- **"With the program id."** No copy passes an id, and none can: `SurfaceViewProps.onNav` is `(id: string) => void`
  (`surfaceViews.ts:80`). The program travels on the shell channel (`window.C2C_PROJECT`), which Project home reads;
  `useShellProjectInUrl` (`shellProject.ts:305`) writes `?program=<uuid>` onto the URL. So `onNav('project-home')`
  already reaches the open program's home, and `ProjectBack` does the same.
- **A leave guard.** `navParams.ts:135–162` has `registerSurfaceLeaveGuard` and `surfaceLeaveRefusal`. **No copy
  uses one.** Only `TaskTray.tsx:153`, `notificationNavigation.ts:25`, `TaskBoard.tsx:429, 465` and
  `ProtocolDevSelection.tsx:61` ask it; the rail does not. `ProjectBack` adds none (RULE 6: the same behaviour as
  the copies and the rail). It would be a no-op in practice: the guards are registered by the editor
  (`DocumentWorkbench.tsx:2722`, `useAuthoringAssemblyBuild.ts:302`, `authoringCreationRecovery.ts:36`) and
  `TaskBoard`, none of which renders this link, and an open dialog is modal over the link.
- **Related links that are not copies**, left to their owners: `ConversationThread.tsx:1915`, `.ct-back`
  (`app-v2.css:2789–2791`), "{I.left} Project" with no project condition; `ClientPortal.tsx:128`, `.cp-ctx-back`;
  `Etmf.tsx:463`, a `.btn ghost` "Open in Project management"; `Rbm.tsx:328`, the link card D5 retires in favour of
  the back link.
- **D0's shared UI file** is `dataConnect.tsx`. It already exports the shared `EmptyState` and `ErrorState`, and
  imports `I` from `./icons`. It did not import `shellProject.ts`, and `shellProject.ts` does not import it
  (`shellProject.ts:39–40`), so the new import makes no cycle.
- **Tests that pin the copies:** `vaultWorkArea.test.tsx:84–89` (Vault's `:scope > .pj-back`, its words and
  `onNav('project-home')`); `cmcWorkAreaReach.test.ts:136` (the source order `'<CmBack'`, then the `h1`);
  `projectHomeSettingsHonesty.test.tsx:128–142` (ProjectHome's "All projects"). No test pins Insights' or
  Biostatistics' link.
- **History.** No commit on any branch ever added or removed the text `ProjectBack` under
  `client/src/concept2cure/v2` (`git log --all -S`, no result). The only `*Back*` file ever deleted under `client/` is
  `components/common/WelcomeBackScreen.tsx` (`e5a74a4df`, the legacy dead-code removal), which is a welcome screen,
  not a back link.

## What changes

`dataConnect.tsx` exports `ProjectBack`:

```tsx
export function ProjectBack({ onNav }: { onNav?: (id: string) => void }) {
  const project = useShellProject();
  if (!project) return null;
  return (
    <button type="button" className="pj-back" onClick={() => onNav?.('project-home')}>
      {I.left} {String(project.title ?? '').trim() || 'Project'}
    </button>
  );
}
```

It is `CmBack` with the prop named as every surface names it (`onNav`). One deliberate difference from all four
copies: a blank title (`''` or spaces) falls back to "Project", as a missing one already did. With `??`, a project
published with an empty title rendered a button whose only content was a hidden arrow: a control with no name
(WCAG 4.1.2).

The title is read as `String(project.title ?? '')`, the way the channel's own `shellProgramName`
(`shellProject.ts:406–414`) reads every field. The builder's first version called `project.title?.trim()`, which the
review changed: `window.C2C_PROJECT` is loosely typed, and `readMirror` restores it from session storage checking only
its id, so a title that is not a string would have thrown `TypeError: project.title?.trim is not a function` and
taken the whole work area down, where every copy rendered it. The tenth case pins this
(`red/projectBack-m6-title-not-string.txt`).

## What each owner replaces (each in its own lane; not done here)

Each replacement is the import plus one element. The markup, the condition and the click are unchanged, so every
existing test of these screens keeps passing, except the one source-order case named under CMC.

**1. CMC, `surfaces/CmcModule.tsx` (CMC session, D5).**
- `:12` becomes `import { EmptyState, liveGetOrNull, ProjectBack, useLiveData, useLiveRows } from '../dataConnect';`
- Delete `:5`, `import { useShellProject } from '../shellProject';`. Its only use is `CmBack` (`:639`).
- Delete `:633–646`, the comment and `function CmBack`.
- `:3325`, `<CmBack nav={onNav} />`, becomes `<ProjectBack onNav={onNav} />`.
- `:550`, the comment "the `.pj-back` link at the top of this page", may name `ProjectBack`.
- `__tests__/cmcWorkAreaReach.test.ts:136`: the first entry of `order`, `'<CmBack'`, becomes `'<ProjectBack'`.

**2. Vault, `surfaces/Vault.tsx` (D6, L8).**
- `:42` becomes `import { useLiveData, EmptyState, ProjectBack } from '../dataConnect';`
- `:88` becomes `import { readShellProject } from '../shellProject';`. `useShellProject`'s only use is `:1282`.
- Delete `:1281–1282`, the comment and `const shellProject = useShellProject();`.
- `:2971–2975`, the `{projectId ? (<button …>…</button>) : null}` block, becomes `<ProjectBack onNav={onNav} />`.
  Keep `:2970`'s comment.
- `vaultWorkArea.test.tsx:84–89` passes unchanged.

**3. Reporting & analytics, `surfaces/Insights.tsx`, `ReportingHead` (Reporting session, D7-D, L11).**
- `:4` becomes `import { useLiveData, EmptyState, ErrorState, ProjectBack } from '../dataConnect';`
- Delete `:1641`, `const project = useShellProject();`. Keep `useShellProject` in `:16`'s import, for `:1675`.
- `:1644`, `{project && <button type="button" className="pj-back" …>…</button>}`, becomes
  `<ProjectBack onNav={onNav} />`.

**4. Biostatistics, `surfaces/Biostatistics.tsx` (CMC session, D5-3/D5-4).**
- `:4` becomes `import { useLiveRows, EmptyState, ProjectBack } from '../dataConnect';`
- `:915–919`, the `{program && (<button …>…</button>)}` block, becomes `<ProjectBack onNav={onNav} />`.
- `program` (`:532`) stays: the screen reads it for its own data. The link now follows the shell channel, so it
  appears when a project is opened after the screen mounted.

**5. `surfaces/ProjectHome.tsx:1973` stays.** It goes to Projects, not to the project, and `ProjectBack` must not
replace it.

**Screens not built yet.** D6's Communication back link (`D6.md:270`, `:278`) and D7's Submission Center back link
(`D7.md:131`) take `<ProjectBack onNav={onNav} />`, not a sixth copy.

## Tests and gates

Every run's full output is in `red/` or `green/`. Vitest ran with `--maxWorkers=1`. No dev server or browser was
started.

### The new test: `client/src/concept2cure/v2/__tests__/projectBack.test.tsx`, 10 cases

- With no project open, nothing renders.
- With a project open:
  - it is a `.pj-back` with `type="button"`;
  - its name is the project's title;
  - its first child is the arrow, which has `aria-hidden="true"`.
- With the title missing, empty or blank, the name is "Project". These are three cases.
- With a title that is not a string (`42`), the name is "42", as the copies rendered it, and nothing throws.
- A click calls `onNav('project-home')` once.
- From the keyboard:
  - Tab moves from the control before it to the link;
  - Enter calls `onNav('project-home')`;
  - Space calls it again.
- It follows the shell channel. Opening a project after mount shows the link, and closing the project removes it.
- With no `onNav`, a click throws nothing.

**Red, with no component yet** (`red/projectBack.txt`, the first 9 cases). All 9 cases fail with "Element type is invalid … got:
undefined", because `ProjectBack` is not exported yet.

**Red, with five defects planted one at a time** (`red/projectBack-m*.txt`). The script swapped one text in
`dataConnect.tsx`, ran the test, and put the file back. The file's md5 was the same before and after the runs.

| Mutant | What was planted | Cases that turned red |
|---|---|---|
| `m1-title-nullish` | The copies' `?? 'Project'` | The empty-title and blank-title cases (2) |
| `m2-not-reactive` | Biostatistics' `readShellProject()` in place of the hook | The shell-channel case (1) |
| `m3-wrong-destination` | `onNav('projects')` | The click case and the keyboard case (2) |
| `m4-no-type` | No `type="button"` | The markup case (1) |
| `m5-dead-link` | Renders with no project open | The no-project case and the shell-channel case (2) |
| `m6-title-not-string` | The builder's `project.title?.trim()` (added in review) | The non-string title case (1): `TypeError: project.title?.trim is not a function` |

**Green** (`green/projectBack.txt`). All 10 cases pass.

### Gates

| Gate | Result | File |
|---|---|---|
| The three D0 guards (`foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`) | 3 + 17 + 33 cases, all pass | `green/readers-and-guards.txt` |
| `npm run --silent ci:undefined-css-classes` | exit 0. Every static className in v2 is defined, with 2 reviewed exceptions. | `green/ci-undefined-css-classes.txt` |
| `npm run --silent ci:token-contrast` | exit 0. 131 pairs; 15 documented exceptions held. | `green/ci-token-contrast.txt` |
| `npx eslint` on `dataConnect.tsx`, `projectBack.test.tsx`, `ui-read-recovery.test.mjs` | 0 errors. The first two are clean. The `.mjs` has 4 warnings: `prefer-const`, `no-undef` ×2, `no-unused-vars`. HEAD's version, linted the same way, has the same 4, two lines higher. **No new warning.** | `green/eslint.txt` |
| Every test under `client/src` and `tests` that names `dataConnect` or `projectBack`: 36 vitest files, plus the 3 guards | 38 files pass. 1 fails: `runPolicySwitch.test.tsx`, 5 cases. **This failure was there before the change.** With HEAD's `dataConnect.tsx` swapped back in, the same 5 cases fail with the same error: "No `authService` export is defined on the `@/services/portal/authService` mock". That test's mock is missing an export, which is not in this lane. | `green/readers-and-guards.txt`, `green/runPolicySwitch-at-head-without-this-change.txt` |
| The node-test reader, `node --test tests/ops/ui-read-recovery.test.mjs` | **This change first turned it red: 0/48** (`red/ui-read-recovery-new-import-unstubbed.txt`). At HEAD it passes 48/48, measured in a `git archive` export of HEAD via `C2C_UI_TEST_ROOT` (`green/ui-read-recovery-at-head.txt`). The cause is in the test's loader. It transpiles `dataConnect.tsx` itself, stubs `./icons`, and resolves any other relative import as `<path>.ts`. The new `./shellProject` import pulls in `fixtures/project-home-data.tsx`, so the loader fails with ENOENT. **Fix:** the loader stubs `./shellProject` as `{ useShellProject: () => null }`. That is one line, the same treatment as `./icons`. Its cases drive the reads and never render the link. **Then 48/48.** | `green/ui-read-recovery.txt` |
| Tests that mock `./shellProject` (`taskBoardTrackedFiling`, `anaActionChips`, `taskBoardEveryStore`), plus the tests of the four copies' screens (`vaultWorkArea`, `cmcWorkAreaReach`, `reportingContextIntegrity`) | 6 files, 70/70 pass | `green/shellProject-mockers-and-owner-screens.txt` |
| `tsc` on `dataConnect.tsx` and `projectBack.test.tsx` with the repo tsconfig (files only) | No error in either file. The 6 errors reported are in `shellProject.ts`, which is unchanged. Its `window.C2C_PROJECT` and `window.C2C` are declared in `ProjectHome.tsx:68–77`, outside the partial program. The full `npm run typecheck` needs a 24 GB heap and was not run. | `green/tsc-isolated.txt` |

**Not covered here.** I did not open the link in the running app (RULE 4's last item). No screen renders
`ProjectBack` until an owner converges onto it, and each copy already renders the same markup. The first owner to
converge opens its screen at 1440 and 390, in light and dark, and files that evidence with its own change.

### Review

A second session re-checked the builder's claims at `c4f8597c2` (2026-11-02): the four copies and Biostatistics' fifth
at the lines named above; the owner replacements' import lines (`CmcModule.tsx:5, :12`, `Vault.tsx:42, :88`,
`Insights.tsx:4, :16, :1675`, `Biostatistics.tsx:4, :532`); HEAD's `dataConnect.tsx` exports no `ProjectBack`, so
the test is red there; the three D0 guards, both CSS gates, `ci:error-envelope` (it reads `dataConnect.tsx`), eslint
(no new warning) and the node reader (48/48). Every `dataConnect` reader re-ran after the fix: 38 of 39 files pass,
and the one failure is `runPolicySwitch.test.tsx`'s `authService` mock, unchanged. One defect was found and fixed:
the non-string title, under "What changes".

### What the reviewer commits

The paths are `client/src/concept2cure/v2/dataConnect.tsx`,
`client/src/concept2cure/v2/__tests__/projectBack.test.tsx`, `tests/ops/ui-read-recovery.test.mjs` and
`docs/evidence/DESIGN/D0/D0-7-project-back/`. The trailers are `Plan: D0` and
`Completes: client/src/concept2cure/v2/dataConnect.tsx`. The working tree also holds `Projects.tsx`,
`newProjectWizardLook.test.tsx` and `docs/evidence/DESIGN/D2/D2-2/`, which are D2-2's and not part of this step.

## 2026-11-02: a project opened from a link has only its id

Reporting's running-app pass (`docs/evidence/DESIGN/D7/2026-11-02-reporting/`, finding 1) found that a
project opened from `?program=<id>` reaches the shell as `{ id }`. `restoreShellProject` rehydrates the id
only, so the link read "Project". The same is true on every screen that uses the shared link (CMC, Vault,
Project home and Reporting), and it was true of each hand-drawn copy before it.

`ProjectBack` now takes an optional `name`, the screen's own read of the project. Its label is the first
non-blank of these, each read as `String(v ?? '').trim()`:
1. the shell's `title`;
2. `name`;
3. the shell's `product`;
4. the shell's `code`;
5. "Project".

The shell's title still wins, because the shell names the project that is open now.

- **Red:** `__tests__/projectBack.test.tsx` gained two cases, and both failed against the old component
  ("Unable to find … name "BX-301 Phase 2"" and "… "anti-IL-23p19 mAb"").
- **Green:** 12/12. ESLint shows no warnings in either file, before or after.

Reporting passes its own `p.label` when it switches `ReportingHead` over; its `insightsOpenProgram` case
is the gate. Vault has no read of the project's name of its own, so it keeps the shell's fields.
