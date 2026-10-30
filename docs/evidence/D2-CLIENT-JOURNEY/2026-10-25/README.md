# D2 — The client's way in (pass 1)

Launch row D2. Design and What already exists: `docs/design/CLIENT_JOURNEY_2026-10-25.md`. Decision: P-47 in
`docs/LAUNCH_DEFINITION_OF_DONE.md`. Canonical branch `concept2cure-v2`, baseline `1595d6dc`.

## How this was observed

A local install provisioned from empty (`npm run db:provision`, PostgreSQL 16 with pgvector), an organisation
and admin from `scripts/seed-admin.mjs`, the server under `RLS_ENFORCE=on` as `app_service`, and a fresh
Chromium session (no stored preferences) driven by Playwright through the founder's path: sign in, Home, start a
project, Projects, a project, the catalog. One IND project was created through the real wizard. No AI provider
key was set, so AnA does not answer; nothing below depends on it.

## Before (`before/`)

| File | What it shows |
| --- | --- |
| `home.png` | Home after sign-in: a chat page; AnA run controls open in the composer; four starters; four shortcuts. The rail is a strip of twelve unlabelled icons. |
| `new-project-from-home.png` | "Start a new … project" replaces the screen with the wizard: 43 filing types in grey cards, most tagged "Author documents for this market". |
| `home-program-journey-empty.png` | Home's "Program journey" shortcut: "No program journey data yet", for an organisation with a project. |
| `workflows-catalog.png` | "Workflows": 87 features as cards with a tier and an Open button (37 under seven work areas, 50 under "Additional capabilities"). |
| `project-opens-on-author.png` | A new project opens on Author, the second of its five steps. |

## After (`after/`)

| File | What it shows |
| --- | --- |
| `home.png` | Your projects (each opens its Project home), Your tasks, Ask AnA, Recent conversations. Rail open: Home, Projects, Tasks, Communication, Vault; *Work areas*: CMC / Module 3, Quality, Reporting & analytics. |
| `home-ana-settings-open.png` | AnA's run controls behind "AnA settings", unchanged in behaviour. |
| `account-menu-plan-and-features.png` | The catalog as "Plan & features", for an organisation administrator. |
| `plan-and-features.png` | The catalog page under its new title; content and switches unchanged. |
| `new-project-built-here-first.png` | The wizard leads with the 8 Pharma & Biotech filings built and validated here. |
| `new-project-more-filing-types.png` | The rest, one press away, under "More filing types". |
| `rail-collapsed-work-areas-rule.png` | Collapsed by choice: the work areas stay a separate group. |
| `home-phone-390.png` | 390 px: no horizontal scroll; project names and Send fit. |

Browser run: no page errors; `document.documentElement.scrollWidth <= innerWidth` at 390 px.

## Tests: shown failing first (`red/`)

- `red/new-tests-against-unchanged-source.txt`: the new and amended tests run against the source at the baseline
  (tests at this change, source files checked out from `HEAD`): **61 failed**, including every rail, account menu,
  Home, rail-default, catalog-title and Home-never-opens-the-catalog test.
- `red/picker-tests-against-unchanged-picker.txt`: the picker's "leads with what is built here" test fails against
  the baseline picker. Its two companions (a chosen filing is never hidden; a search lists everything) pass
  against both: they guard the new disclosure, and the baseline had none to guard.

## Tests: green

`green-summary.txt` (every test name and result in `green-full.txt.gz`): the 110 test files that import the changed modules or name the changed
labels, at this change. The only failures are the 11 below, which fail identically at the baseline.

## Pre-existing failures (`preexisting-failures-on-HEAD.txt`)

Run at the baseline with this change stashed: 11 failures in 6 files (`anaActionChips`, `engineChoices` (the
conversation's pill), `runPolicySwitch` (the conversation's foot: an `authService` mock missing an export),
`anaDrivesScreens`, `authoringDraftTermination`, `navTargets` (`TaskAssignmentControls.tsx`)). None touches a
file this change edits. Not fixed here.

## Gates

`ci:launch-scope`, `ci:check-phantom-tokens`, `ci:design-system`, `ci:check-shell-css-collisions`,
`ci:surface-text-ramp` (regenerated), `ci:undefined-css-classes`, `check:catalog-copy`, `ci:fixture-fallback`,
`ci:fabricated-identity`, `audit:ui-authority` (47/47; two of its failures predated this change: the deleted
`CapabilityBrowser` still registered as active, and the account menu destination still named "Apps catalog"),
`npm run typecheck`, ESLint on every changed file (0 errors), and the pre-push hook.

## Not observed

Staging and production. The founder's own browser holds a stored preference written under the old rail
default; it is re-read once to the open default (`railDefault`), pinned by `liveDriveDefaults.test.tsx`, and
not observed in that browser.
