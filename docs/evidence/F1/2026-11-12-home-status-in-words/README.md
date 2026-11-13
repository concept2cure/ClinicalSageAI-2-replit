# Home says a project's status in words, as Projects does

Package F1. Found by the executive-screens map of 2026-11-12 and released to this lane by the coordinating session
("Use the same enumWords Projects.tsx uses; no second mapping").

## What was wrong

Home is the first screen a person opens. Each of its project rows ended with the status as it is stored:
"Biotech · Planning · active", and "on_hold" for a paused project. Projects, one click away, puts the same value
through `enumWords` and reads "Active", "On hold".

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `client/src/concept2cure/v2/surfaces/projectWords.ts` `enumWords` | A stored value as words; the one wording Projects uses (`Projects.tsx:1719`) |
| `client/src/concept2cure/v2/surfaces/HomeSections.tsx` `HomeProjects` | Home's five project rows: client type, stage, status |

## What changed

One line in `HomeSections.tsx`: the row's status goes through `enumWords`. No second mapping. A status that is not
recorded still adds nothing to the line.

## Red, then green

| File | What |
|---|---|
| `01-red-home-status.txt` | The new test before the change: "expected 'Biotech · Planning · active' to be 'Biotech · Planning · Active'" |
| `02-green-home-status.txt` | After: 2 of 2 |
| `03-home-walk.json`, `03-home-1440.png` | Home in the running app, signed in as an administrator: every row ends "· Active"; no console error, no failed request |

Test: `client/src/concept2cure/v2/__tests__/homeProjectStatusInWords.test.tsx`. Home's other suites
(`p122HomeWorkInView`, `homeNoFixtureProgram`, `homeOpenItems`) pass unchanged.

## Seen, not changed

- **`homeStartHere.test.tsx`, "Ask AnA first, then your projects and your open items", is red on trunk** without this
  change (checked with it stashed): the test expects the sections Ask AnA, Your projects, Your open items, and Home
  now also has "Get started". It is another lane's; told to the coordinating session.
- **"Which projects are at risk this week" still names no project on its rows.** It was released with this, as a
  client-only change, but the rows carry the numeric project id (`project_id`, `projectId`) and the Projects list
  carries only the program's id (`project-portfolio.ts` `PROJECT_CARD_SELECT`), so the browser has nothing to match
  them by. It needs one column on the list read, which is a server change and was not released; asked.
