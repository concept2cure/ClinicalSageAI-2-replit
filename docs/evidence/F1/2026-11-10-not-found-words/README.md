# A record's 404 names the record, in the product's one refusal panel (F1, 2026-11-10)

Package **F1** (repairs). The Quality walks found that a 404 shown through `ErrorState`'s `read` said "This project
was not found in your organization", even when what was not found was a controlled document, a version history or a
CAPA. The cause is the shared classifier's default subject (`describeReadFailure`, `subject = 'this project'`).
`ErrorState` gave its callers no way to name another subject.

Quality worked around it twice with local overrides, in C15 and in D7 (`../../DESIGN/D7/2026-11-10-scope-switch/`).
Each replaced the shared panel's words with its own for a 404. That is a parallel path beside the shared one, so this
change converges both onto the shared panel and deletes them.

## What already exists

- **The classifier**: `readFailureFor` and `describeReadFailure` (`client/src/concept2cure/mdx/hooks/useFetchJson.ts`).
  - It already takes `{ subject }`.
  - The project-scoped reads pass it directly (`v2/projectScopedRead.tsx`, Vault's governed artifacts: "this
    artifact"). Their tests expect "This project …" or their own subject.
- **The panel**: `ErrorState` and `EmptyState tone="error"` (`client/src/concept2cure/v2/dataConnect.tsx`). They take
  `read` and `readWhat`, and say a refused read through `readRefusalWords`, always with the default subject.
- **The two local overrides**:
  - `quality/ControlledDocumentTarget.tsx` (C15): "This controlled document was not found in your organization, so it
    was not opened.";
  - `quality/ControlledDocumentHistory.tsx` (D7, `d9b10b751`): "This document's version history was not found …".

Nothing new: no component or screen. `readSubject` is an optional prop of the existing panel.

## What changed

| | Before | After |
|---|---|---|
| `ErrorState`, `EmptyState` | `read`, `readWhat` | and `readSubject`: what a 404 did not find, when it is a record and not the open project. The default stays the project, so every project-scoped screen reads as before |
| `describeReadFailure('not-found')` when the subject is what was not read | "This controlled document was not found …, so this controlled document was not read." | "…, so it was not read." |
| Version history 404 | a local override: "This document's version history was not found …" | the shared panel: "This controlled document was not found in your organization, so its version history was not read." |
| Notification target 404 | a local override: "…, so it was not opened." | the shared panel: "This controlled document was not found in your organization, so it was not read." |
| A controlled document's editing copy, 404 | "This project was not found …, so this controlled document's editing copy was not read." | "This controlled document was not found …, so its editing copy was not read." |
| A CAPA's action items, 404 | "This project was not found …, so this CAPA's action list was not read." | "This CAPA was not found in your organization, so its action list was not read." |

Each says no Try again, as a 404 cannot be changed by one.

## Tests

- `mdx/hooks/__tests__/useFetchJson.readFailure.test.ts`: the record is named once when it is what was not read.
- `v2/__tests__/errorState.test.tsx`:
  - a 404 with `readSubject` names the record, through `ErrorState` and through `EmptyState tone="error"`;
  - without it, the project is still the subject.
- `quality/__tests__/SopRegisterAuthoring.test.tsx`: the version history's and the notification target's 404 in the
  shared words, with no Try again.

`red.txt`: the four cases fail before the change. `green.txt`: 72 files and 1,007 tests. They are the read
classifier's, the panel's and Quality's suites, and every other suite that asserts the refusal words: labeling,
CMC, human factors, UDI, the Pre-Sub manager, eSTAR and the Vault's artifacts.

## Walked in the running app

`w32-not-found-words.cjs` (`shots/w32-not-found-words.log.json`) ran as the approver, with no page errors. Its API
errors are the 404s the walk itself answers.

- **Version history of QS-SOP-001**, answered 404 (`shots/w32-history-404-1440.png`): "Not found in your
  organization. This controlled document was not found in your organization, so its version history was not read."
  No Try again.
- **CAPA-2026-0101's action items**, answered 404 (`shots/w32-capa-actions-404-1440.png`): "Not found in your
  organization. This CAPA was not found in your organization, so its action list was not read." No Try again.

The notification target's 404 is not walked. It is reached from a task's "Open the controlled document" through the
shell's navigation, which a URL cannot carry. The component test above covers it.

Run it from this folder with `NODE_PATH=$(npm root -g) node w32-not-found-words.cjs`. It needs `WALK_PASSWORD` and a
running server.

## Still open

Any other `ErrorState` whose read is of a record, not of the open project, still says "this project" on a 404 until
its caller passes `readSubject`. The callers that need it are found by `readWhat=` naming a record ("this …",
"its …").
