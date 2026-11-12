# F1: a rail work area opens on the most recent project, in a browser that never opened one (2026-11-09)

**Found by** the founder, during the client demo on 2026-11-09. Clicking **CMC / Module 3** on the rail landed on
Projects; Vault "did the same". The founder's words: "Why aren't these left rails bringing me to the right area?"

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/shellProject.ts` `reopenLastProject()`.** When no project is open, it reopens the last
  project this account opened. The project is remembered in localStorage under `c2c.last-project`, keyed to the
  signed-in account. A browser that never opened a project has nothing remembered, so the function returns false.
- **`client/src/concept2cure/v2/Shell.tsx` `Rail` `open`** (b3c323ed8d, F1, today) and **`V2App.tsx` `nav`** both call
  `reopenLastProject()` before routing a project screen. If it returns false, `routing.ts` `destinationFor` sends
  the screen to Projects with "Open a project to see its …".
- **`Shell.tsx` `RailRecents`.** Already reads `/api/c2c/projects?limit=3` (this account's projects,
  newest-updated first) and lists them under Recents. It mounts only while the rail is expanded.
- **`client/src/concept2cure/v2/paletteProjects.ts` `openPaletteProject`.** Turns a listed project into the shell's
  open project inline.
- **fb9562f399 (F1, today)** made Biostatistics organisation-wide. CMC stays project-scoped
  (`railOpensWithoutProject.test.ts`). That is unchanged here.

Nothing new is added: no route, read, table or screen.

## Measured first: trunk 1c40666f28, a browser signed in that never opened a project

`rail86.cjs` signs in once, then opens a fresh context per entry from that state and clicks it on the rail from
Home (`rail86-before.json`, `before-cmc.png`, `before-vault.png`):

| Rail entry | Lands on |
|---|---|
| CMC / Module 3 | **Projects**, "Open a project to see its CMC / Module 3." |
| Submission Center | **Projects**, "Open a project to see its Submission Center." |
| Vault | Vault, with its own chooser, "Choose a project's Vault … Open one below" |
| Risk-based monitoring | Risk-based monitoring, with its own chooser, "Choose a project for risk-based monitoring" |
| Quality | Quality system |
| Biostatistics | Biostatistics |

The Vault and risk-based monitoring choosers are each screen's own empty state, a list of projects. That is the
likeliest reading of "Vault brings me to Projects". Both targets are organisation-wide by design: the Vault lists the
governed documents across projects, and risk-based monitoring says "Another project is never opened automatically".
They are not changed here.

## The change

| Part | Now |
|---|---|
| `shellProject.ts` | `noteRecentProject(project)` keeps the most recent project the rail lists, in memory only, keyed to the account signed in when it was noted. `clearShellProject()` (the tenant switch) forgets it. `reopenLastProject()` reopens the remembered project first, then this one. |
| `Shell.tsx` | The rail reads its recent projects itself (`useRailRecentProjects`), collapsed or not. It notes the first project and passes the list to `RailRecents`. Same route, same single read. |
| `paletteProjects.ts` | `shellProjectOfPalette` names the listed-project → shell-project conversion once. `openPaletteProject` and the rail both use it. |

Noting a project never opens it. A project opens only when a project screen is chosen with none open. The shell
then names it in the breadcrumb and the back link, and each screen still admits it on the server.

## Red, then green

- **Red** (`red-fallback-off.txt`). The same tree with only the fallback removed from `reopenLastProject`: 2 failing.
  - `railOpensWithoutProject` › "with nothing remembered, reopens the most recent project the rail lists";
  - `shellNav` › "with no project ever opened, CMC opens on the most recent project the rail lists" ("CMC landed on
    Projects: nothing was reopened").
- **Red** (`red-tenant-switch.txt`). Without the forget in `clearShellProject`: "never reopens a recent project noted
  for another account, or after a tenant switch" fails.
- **Green.** Both suites pass, 45 of 45. Every suite that reads the shell project, the palette or the rail passes:
  149 files, 2261 of 2261.
- **Lint.** ESLint warnings per file equal trunk's (Shell.tsx 5 and 5; the others 0).

## In the running app

`rail86-after.json`, `after-cmc.png` and `after-submission-center.png`. Same stack and same fresh-browser steps,
with this tree's five client files:

| Rail entry | Lands on |
|---|---|
| CMC / Module 3 | `/concept2cure/cmc?program=77c7f5cf…`, **CMC / Module 3** on "[Demo · Lumen] LMN-401", the first project under Recents. The breadcrumb reads "LMN-401 › CMC / Module 3". |
| Submission Center | `/concept2cure/submission-center?program=77c7f5cf…`, **Submission Center** on the same project |
| Vault, Risk-based monitoring, Quality, Biostatistics | Unchanged |

No API response at or above 400 on any stop.

**Seen, not changed:**
- **Biostatistics with no project open.** It reads "Statistical documents persisted for this project appear here".
  That is F1's screen after fb9562f399.
- **The project the work area opens on is the most recently updated one.** The rail lists it first, so it is the one
  in front of the person.
