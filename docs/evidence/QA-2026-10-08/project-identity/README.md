# Project identity on launch-catalog screens — QA 2026-10-08 (j1, j5)

Before: port 5078 (code before these fixes; client captures in `before/` were taken before any edit).
After: a private instance on port 5079 running this working tree, same QA database, signed in as a member
(lisa.johnson) through the real form. No passwords or tokens are in this folder.

| Finding | Before | After |
|---|---|---|
| Plan / Review stage panels never load | `before/screens/01..04` ("isn't wired" / "aren't wired"); `before/api-5078.txt` (UUID → 400) | `after/walk.json` HLV-333: schedule and work read by UUID (200), "No schedule generated", "No tasks or approvals on this program"; BX-256 (no anchor): 404 → "This program has no schedule record" / "no task record" |
| Deep link / new tab shows "No project selected" | `before/screens/05-deeplink-new-tab.txt` | `after/walk.json` `copiedUrl` carries `?program=`; a new tab on it opens HLV-333 (`after/screens/05`) |
| Vault "1 document" for a project with no files | `before/screens/06-vault-hlv.txt` | header "1 authored document · 0 uploaded files"; folder count labelled "0 of 72 settled — approved, final or reviewed" |
| Review screen shows other programs' items | QA run3 `07-a2-Review-approval` (BX-204 threads under BX-256) | board and inbox read `programId=` of the open program by default (`after/walk.json` `review`) |
| Reporting & analytics names another program | `before/api-5078.txt` (lead C2C-001) | HLV-333 leads; BX-256 "has no readiness or reports here yet"; no C2C-001 (`after/walk.json`) |
| AnA relational overlay NaN | `before/server-5078-nan-lines.log` (overlay + project_intelligence_profiles, params NaN) | `after/ana-turn.json`: one turn on each program, zero NaN lines |

Red and green test output: `tests/red-*.txt`, `tests/green-*.txt`; ESLint parity per file: `tests/lint-counts.txt`.

Not verified in a browser: the review-thread inbox filter (threads in the QA database are assigned only to
accounts reserved for the QA walkers); a signed-out link through sign-in (`after/private.json`: the login URL now
carries the program, but the sign-in form lands on /concept2cure for every returnTo — see the fixer's report).
