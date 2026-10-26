# D2 decision 12, second sweep, part 1: the shared copy a client reads, and Quality

The first sweep (`../wording-sweep/`) took "program" out of the main client's visible text. Its completeness reader
listed what was left: the device lane (`mdx/`), Quality (`quality/`), the `shared/` constants a client reads, and the
sentences the server sends. This part covers `shared/` and Quality. It also adds the guard the first sweep lacked.
The device lane follows once its slice 0 changes are on trunk. Server text is listed in the first sweep's README.

## What already exists

Every line changes copy that already renders or that AnA already reads (Rule 3). Ids, keys, values and anything
parsed are unchanged: `projects.open-program`, `intelligenceTab` and the onboarding values all stay.

| Path | Who reads it | Before → after |
| --- | --- | --- |
| `shared/navigation/index.ts` `NAVIGATION_TARGETS` | the `@` menu (`appMentions.tsx` shows each description); AnA's `list_app_screens` | The Projects target: "pick or create a regulatory program" → "a project".<br>Reporting: "the program records" → "the project records".<br>The device targets: "program cards", "for the program in context", "diagnostic programs", "device programs" → "project".<br>Dispatch readiness: "the open program" → "the open project". |
| `shared/navigation/surface-actions.ts` `SURFACE_ACTIONS` | AnA's action chips (the label is the chip's text); `list_screen_actions` | "Open a program" → "Open a project". The Projects filter and view descriptions, the task board's "programme" filter and CMC's "program records" tab now say "project". |
| `shared/navigation/demo-scripts.ts` `DEMO_SCRIPTS` | what AnA narrates on a tour | 20 `say` and description lines. `demo-scripts-name-no-seeded-record.test.ts`'s `/empty/i` still holds. |
| `shared/ana/slash-commands.ts` | the composer's `/` menu | `/align`: "Alignment across the project". |
| `shared/types/onboarding-discovery.ts` | onboarding's questions | "Developing our own product / project", "first projects", "multiple projects". "Program management / operations" stays: it names a service line. |
| `shared/constants/notifications.ts` | notification preferences | "Project goal resets". |
| `shared/company-documents.ts` | the refusal under Submission Center's "Another project" card | "Copy this document into the target project’s Vault …". |
| `client/src/concept2cure/quality/ControlledDocumentDialogs.tsx`, `ControlledDocumentTarget.tsx` | Quality's create, revise and recover dialogs | The select's label "Program" → "Project". Its placeholder, its loading, empty and error lines, and both dialog sentences now say "project". |

## The guard

`client/src/concept2cure/v2/__tests__/clientCopyNoProgram.test.ts` scans every one of those constants for
`program(me)(s)`. It scans:
- navigation targets and screen actions, when the screen they open is in the release (resolved through
  `DEEP_LINK_ALIASES`, as the `@` menu and AnA's lock list resolve it);
- slash-command summaries;
- onboarding answers;
- notification labels;
- every demonstration script's description and `say` lines.

Regulatory names that contain the word are allowed: FDA's Q-Submission Program, and expedited, pediatric, stability
and qualification programmes. So is "Program management", a service line. A surface outside the release gets its words
when its slice places it.

## Tests, made to fail first (`red/`)

- **`red/shared-copy-says-program.txt`.** The guard run on the tree before this part's last eight fixes. It failed on
  the Projects and Reporting targets, four screen actions and two tour lines. The first sweep's completeness reader
  had not listed those, so the guard found more than the review.
- **`red/pins-against-head-source.txt`.** The three edited test files, run against `77278f941`'s source. 8 Quality
  tests fail on the label "Project". The 9th failure (Vault search in `anaDrivesScreens`) also fails at HEAD.
- **Affected set.** 77 test files: every test of Quality, plus every test importing a changed shared module. Against
  `77278f941`: 4 failures, the same 4 at HEAD, none new. The four are:
  - three in `ControlledDocumentWorkbench.integration.test.tsx`;
  - the Vault search case of `anaDrivesScreens.test.tsx`.
- **Gates.**
  - `typecheck-no-regression`: 0 errors.
  - `eslint` on the changed files: 0 errors.

## Part 2: the device lane

The device lane's slice 0 changes landed in `62a46933f`, so this part could follow. It covers 102 strings in 37
files under `client/src/concept2cure/mdx/` and `pdev/surfaces/Contradictions.tsx`, and every one of them is visible
or read by AnA:
- the host's surface blurbs, and its AnA summaries for loading, failed and no-project states;
- every "held per program" idle reason;
- the 510(k), PMA, CER, IVD, eSTAR, Software, Vault, Engineering, Post-market and Overview headers and empty states;
- the CER tabs' AnA prompts;
- the eSTAR export recovery lines;
- Validation's "Projects blocked" card (blockers are recorded on tracking records, not linked to projects);
- the Pre-Sub CSV header;
- the device AnA tool palette's group label.

A few strings stay as they are:
- "Pair this diagnostic with a drug programme" (CDx co-development pairs with a drug's whole development programme,
  the domain sense);
- server sentences rendered verbatim (Software's undetermined reason is the server's own; see the server sweep);
- identifiers and ids, as before.

- **Red: `red/device-lane-pins-against-head-source.txt`.** The 9 edited test files, run against `62a46933f`'s source:
  14 tests fail on the old wording. They pin the 404 sentence, "No project selected", "Active projects", "held per
  project", the host's load failure, "select a CER project", "Open a project first", and the triage prompt's
  project id. The 15th failure, PathwayPanes(k510) roots, also fails at HEAD.
- **Affected set.** 103 test files: every device-lane test, plus every test importing a changed file. 1,007 tests
  against `62a46933f`. With the pins updated, 3 failures remain, the same 3 at HEAD:
  - `authoringDraftTermination`;
  - the two PathwayPanes smoke cases.
- **Gates.** typecheck: 0 errors. eslint on the 46 changed files: 0 errors, and no file gained a warning.

## Still to come

- **Server text.** It is listed in `../wording-sweep/README.md`. A full inventory is running.
  `server/routes/ectd-compile.ts` is out of scope here: the RIM session owns it and changes its own strings in its
  eCTD rewrite.
