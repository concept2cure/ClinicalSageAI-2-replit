# Two honest-state fixes on screen: the engineering refusal and the card's home line (D2, 2026-10-29)

1. The device engineering screen says why it shows nothing when the route refuses the project. A 404 means
   the project isn't one this organization can see. A 503 means it couldn't be checked, so nothing was shown.
   This is the last "Not done" item of `small-honest-state-fixes/` (ad0b119b).
2. The readiness card's home line (`pj-dossier-home`) opens the home filing's editing copy, through the same
   door as a market's line. This is the first "Not done" item of `f3-module-rows/` part C (3a6d31f6).

Both complete existing code. Neither adds a surface, a route or a read. Working tree over `96537cfe`.

## What already exists

Searches run, in `client/src`, `server/` and `tests/`:

- `VERIFICATION_UNAVAILABLE` and `Project not found`;
- `could not be checked`, `not found in your organization`, `can see` and `this organization`;
- parsers of useFetchJson's line: `HTTP\s+(\d{3})`, `statusOf(`;
- `useEngineering`, `/api/mdx/engineering`, `admitProject`, `pj-dossier-home`, `MarketCopy`, `noCopyWords`,
  `copyFor`, `filingCopyIn`, `editingCopyOf` and `DossierReadinessCard`;
- every test that mounts the engineering screen, Project home, `ProjectSide` or the card.

Deleted history: `git log --all --diff-filter=D` on `*efusal*`, `*Refused*`, `*admitProject*`,
`*EngineeringSurface*`, `*useEngineering*`, `*HomeCopy*`, `*MarketCopy*`, `*DossierReadiness*` and `*editingCopy*`
finds nothing. `-S'pj-dossier-home'` and `-S'Project not found'` (over the mdx tree) find no deletion.

**Fix 1, the engineering refusal.**

- `server/lib/admit-project.ts` answers in two ways.
  - 404 `{"error":"Project not found"}` (`notFoundInTenant`): the organization does not own the project.
  - 503 `{"error":"VERIFICATION_UNAVAILABLE","message":"The project ownership check could not be run. …"}`
    (`respondVerificationUnavailable`): the check could not run.
  - Either way nothing is read. `server/routes/mdx-engineering.ts:161` calls it (ad0b119b), and it is the route's
    only 404.
- `mdx/hooks/useFetchJson.ts:143-147` turns any non-OK answer into one line: `HTTP <status>: <body, cut at 200>`.
- `mdx/hooks/useEngineering.ts` passed that line to all seven panel states as `error`.
- `mdx/surfaces/EngineeringSurface.tsx` drew each `DataGate`'s `ErrorState`: "Could not load <label>" with "Try
  again".
- `v2/dataConnect.tsx:527` `ErrorState` runs its message through `redactInternals` (`lib/queryClient.ts:117`), which
  drops any string that begins `HTTP <status>` (`queryClient.ts:95`). So the transport line was never on screen.
  The earlier README's "`HTTP 503: …` followed by the start of the JSON body" is not what the screen drew.
- What it drew, on a 404 and a 503 alike, is in `red-engineering.txt`: "Could not load engineering metrics",
  "Could not load engineering documents", "Not counted until the risk file is read" and "Could not load blocker
  sources", each failure with "Try again". It said neither fact, and a retry cannot change a 404.
- The sibling screens that ca88fa26 reached word both refusals as an ordinary failed read:
  - Pre-Sub: `PreSubManager.tsx:559`, "Could not load your Q-Submissions";
  - UDI: `UdiSurface.tsx`, each `DataGate`, "Could not load …";
  - labeling: `Labeling.tsx:510`, "Couldn't load the labeling document";
  - human factors: `HumanFactors.tsx:501`, "Couldn't load the HFE/UE file".

  None of them tells a 404 from a 503. So no sibling wording for these two refusals existed to reuse.
- The nearest helper is `mdx/hooks/useEstarOfficialFields.ts:150-179`, `describeOfficialFieldsError`.
  - It reads useFetchJson's line by its `HTTP <status>` prefix and its `"error":"<CODE>"` token, and never parses
    the cut body.
  - A 404 becomes "This project was not found in your organization". `OfficialEstarPanel.tsx:407` offers no "Try
    again" on a 404.
  - Its other answers are the eSTAR field list's own (a 422, "The field list could not be loaded"), so it is not
    called here. Its method is followed: status prefix plus error token, and no retry on a 404.
- `v2/programAction.ts`: `openPrograms` and `OPEN_PROGRAM_LABEL` ("Choose or create a project"), the product's one
  way to another project. `DataGate`'s idle state uses it.
- `ErrorState`'s `retryLabel` already carries a way out that is not a retry: `TaskAssignmentControls.tsx:50` ("Close
  assignment") and `Projects.tsx:1009` ("Choose another filing").

**Fix 2, the home line.**

- `v2/surfaces/ProjectDossier.tsx` `DossierReadinessCard`. The home line was
  `<p data-testid="pj-dossier-home">{figureLine(d.home)}</p>`, words only.
- `MarketCopy` (3a6d31f6) is a market line's door. With one copy, "Open {title}". Otherwise `noCopyWords(true, …)`.
- `noCopyWords(forMarket, copy)` already has the home words: "No editing copy of this filing yet."
- `ProjectHome.tsx:1342` `filingCopyIn(docs)` is `copyFor`, the lookup Module completion's rows use.
  `ProjectSide.tsx` passes `copyFor` and `onOpenDoc` to the card, and `editor/editingCopy.ts` `editingCopyOf` decides
  the answer.
- What the home figure counts: `server/services/c2c/dossier-read.ts:209` `homeFigure` counts the sections of every
  document that is not an added market's.
  - That covers the home applications and the home document-class documents (an IND safety report, say).
  - Each has rows with `agency: null` (`moduleRows(d, …, null)` and `documentRow`), and the card's review and draft
    totals already read exactly those rows.
  - `markets[]` with `scope: 'home'` lists home applications only, so it is not the set the figure counts.
  - The server already allows for several home documents (`TWO_HOMES_REASON`).

## Fix 1: the refusal, in words

- `useEngineering.ts`:
  - `ProjectRefusal` is `'not-visible' | 'unchecked'`.
  - `projectRefusalOf(error)` reads useFetchJson's line by status and body. 404 with `"error":"Project not found"`
    is `not-visible`. 503 with `"error":"VERIFICATION_UNAVAILABLE"` is `unchecked`. Every other failure is null, a
    404 or 503 from anywhere else included.
  - The hook returns it as `refusal`. The panel states are unchanged, so they are still `error`, never empty.
- `EngineeringSurface.tsx`: when `refusal` is set, the screen draws its header and one `ErrorState`
  (`eng-project-refused`, `role="alert"`), and no panel.

| Refusal | Title | Message | Way out |
| --- | --- | --- | --- |
| 404 | This project isn't one this organization can see | Nothing was read for it, so no engineering record is shown. | "Choose or create a project" (`openPrograms`) |
| 503 | This project couldn't be checked, so nothing was shown | Whether this organization can see the project could not be checked, so no engineering record was read. This says nothing about the project. | "Try again" (`refresh`) |

The header was moved into a `header` const so that both returns draw it, unchanged. No class is new.

## Fix 2: the home line opens the home filing

- `MarketCopy` takes `forMarket`.
  - For a market's line it keeps its words and its test id, `pj-dossier-market-copy`.
  - For the home line it uses the home words and the test id `pj-dossier-home-copy`. There is one door and one
    set of words for both lines.
- `HomeCopy` chooses by the documents the home figure counts, which are the home rows' documents:
  - **one**: `MarketCopy` with that document's copy, named "the editing copy for the home filing", opened whole
    (`onOpen(doc, null)`). With no copy, several copies, or the documents reading or unread, it shows
    `noCopyWords(false, …)` and no button.
  - **several**: "This figure counts N home documents, so none is opened from here." This is the one new
    sentence, modelled on the several-copies wording. No one copy is the figure's, and each document still opens
    from its own rows.
  - **none**: nothing is added. The figure line already says "No governed sections to count yet." or gives the
    store's reason.
- The home line is now a `<div data-testid="pj-dossier-home">` holding the same `<p className="pj-card-note">` and
  the door. The button reuses `btn ghost pj-mkt-btn`.
- The home rows are read once, for the review and draft totals and for the door.

Tests:

- `projectHomeDocuments.test.tsx`:
  - 6 new cases: one copy opens whole and is never a market's; no copy; two copies; a failed read; reading; and a
    figure over two home documents.
  - Three existing row counts now count only the module rows (`rowsSaying`), at the same numbers (4, 4, 5). The
    card's home line now says the same words of the same filing, and its own cases cover it.
- `projectDossierDetails.test.tsx`: 1 new case. The card asks `copyFor` for the one home document. With no home
  document it has no door and no copy words.

## Red, green, mutations

Run with `timeout 240 npx vitest run --config vitest.config.ts <file>`, one file at a time. For each mutation the
file was copied, changed by one exact replacement, tested, and restored from the copy. The sha256 matched every
time (shown at the foot of each file).

| File | State | Result |
| --- | --- | --- |
| `red-engineering.txt` | head plus the new test | 4 failed, 1 passed. The screen reads "Could not load engineering metrics … Try again" for both refusals, and `projectRefusalOf` does not exist. The one that passes is the case that must not change: any other failure stays a failed read. |
| `green-engineering.txt` | fix | 5 passed |
| `mutation-eng-e1-hook-reports-no-refusal.txt` | `refusal: projectRefusalOf(error)` changed to `refusal: null` | 2 failed: both refusals back to the panels |
| `mutation-eng-e2-404-offered-a-retry.txt` | `refusal === 'unchecked'` changed to `true` | 1 failed: the 404 offers "Try again" |
| `mutation-eng-e3-any-503-is-the-check.txt` | the 503 test drops the `VERIFICATION_UNAVAILABLE` token | 2 failed: another 503 is called an ownership check |
| `mutation-eng-e4-any-404-is-not-visible.txt` | the 404 test drops the `Project not found` body | 1 failed |
| `mutation-eng-e5-screen-ignores-refusal.txt` | `if (live.refusal)` changed to `if (live.refusal && live.loading)` | 2 failed |
| `mutation-eng-e6-refusal-over-the-panels.txt` | the refusal drawn above the panels instead of in their place | 2 failed: "Could not load" and two "Try again" |
| `red-home-line.txt` | head plus the new cases | 6 failed, 26 passed. The home line reads only "0 of 6 sections approved or locked." |
| `green-home-line.txt` | fix | 32 passed |
| `mutation-home-h1-opens-a-markets-copy.txt` | home rows `agency === null` changed to `!== null` | 4 failed: the home line opens EMA's copy |
| `mutation-home-h2-pools-a-markets-document.txt` | the door counts every row's document | 6 failed: the market's document is counted as home |
| `mutation-home-h3-button-over-a-failed-read.txt` | the home line always a button that opens only when there is one copy | 5 failed, among them the failed read: "a button over a failed read" |
| `mutation-home-h4-market-words-on-the-home-line.txt` | `forMarket={false}` changed to `forMarket` | 2 failed: market words on the home line |
| `mutation-home-h5-first-of-several-opens.txt` | `documents.length === 1` changed to `>= 1` | 1 failed: one copy opened for a figure over two |
| `mutation-home-h6-no-document-still-worded.txt` | the no-document branch removed | 1 failed (`projectDossierDetails`) |
| `mutation-home-h7-a-module-rides-along.txt` | the door sends `'M1'` | 2 failed: the home line and a market's line |

## Checks

- `eslint.txt`: plain `npx eslint <file>`, with head read through `git show HEAD:<file> | npx eslint --stdin`. Every
  file is at head's count.
  - The three v2 files have no problems.
  - The mdx tree is in the ignore list, so each mdx file's one warning is "File ignored", at head and now.
  - With `--no-ignore` the mdx files also hold head's count: `useEngineering.ts` 1, `EngineeringSurface.tsx` 6, and
    the new test 0.
- `types.txt`: `tsc -p` with a scratch config that extends the repo's `tsconfig.json`, limited to the repo's `.d.ts`
  files and the changed files.
  - Fix 1: 0 errors.
  - Fix 2: three `styles.module.css` errors in `components/ana/*`, reached through Project home. The same three
    appear at head before any change. None is in these files.
- `node scripts/ci/check-undefined-css-classes.mjs`: OK. No class was added.
- `suites-after.txt`: every client suite that mounts Project home, `ProjectSide`, the card or Module completion
  passes: 44 files, 441 tests. That includes `projectHomeDocuments` 32/32, `projectDossierDetails` 9/9,
  `projectSideNotRead` 1/1 and `projectHomeReadiness` 12/12. `editingCopy` passes 3/3.
  - The engineering suites pass: the new refusal test 5/5, `EngineeringSurface.projectKeyed` 18/18,
    `EngineeringSurface.unreadable` 10/10, `useEngineering.unavailable` 6/6 and `mdx-surfaces-interactive-smoke` 5/5.
  - `design-system-surfaces-smoke` is 5/6. See "Not done".

## Not done

- **The sibling screens** (Pre-Sub, UDI, labeling, human factors) still word both refusals as a failed read.
  `projectRefusalOf` and the words live in the engineering hook and screen. One shared place would be next to
  the line it parses, in `useFetchJson.ts`, read also by `describeOfficialFieldsError`. That is outside this change.
  Until then the `HTTP <status>` prefix pattern is in two files: `useEstarOfficialFields.ts` and `useEngineering.ts`.
- **The 503's reference** is not shown. useFetchJson cuts the body at 200 characters, and the `correlationId` falls
  after the cut.
- **Two comments** still name only the market lines as the card's door: `editor/editingCopy.ts:14` and the header of
  `ProjectSide.tsx`. Both files are outside this change.
- **`tests/concept2cure/design-system-surfaces-smoke.test.tsx`, "UdiSurface renders"**, is red. It mounts `UdiSurface`
  without the `programId` that ca88fa26 made required. It is not this change's, and its two engineering cases pass.
