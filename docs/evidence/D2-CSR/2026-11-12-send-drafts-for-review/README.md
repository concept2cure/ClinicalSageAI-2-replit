# D2: every draft of a CSR build sent for review in one act (2026-11-12)

Launch row D2, ledger package L1. The founder, 2026-11-11: *"focus entirely on getting what we built surfaces
correctly on the UI and working for GA."* Found walking the Lumen LMN-201 report toward its filing.

## What a person met

A CSR build drafts 69 of the 119 ICH E3 headings. Before a heading can enter the document, the person who started
the build sends it for review and a second person approves it. Sending was one click per heading: 69 clicks that
decide nothing.

## What already exists (RULE 3)

Nothing new was built: no route, service or table. The act sends the row's own decision, once per heading.

| Path | What it does today | What it did not |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` `CsrHeadingReview` | The build's section review: per heading, Send for review, Read saved section text, Approve (only after the exact saved text was read), Send back | Offered no way to send more than one heading |
| `POST /api/csr/jobs/:jobId/sections/:sectionNumber/review` (`server/routes/csr-jobs.ts`, `services/csr/csr-section-review.ts`) | One decision on one heading, bound to that heading's saved text by its hash; refuses template text with data missing; refuses the build's requester as approver | Unchanged |
| `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` `BuildOnCard` | Hosts the review in the CSR document's "Build from the study's data"; empties and re-reads the list after a review decision | Held nothing a review said across that re-read |

Searches run: `Send for review`, `decision: 'submit'`, `sections/.*review`, `bulk`, `all drafts` across
`client/src/concept2cure` and `server/routes`, `server/services/csr`.

## What changed

- `CsrHeadingReview` offers **Send N drafts for review** when more than one draft waits. It sends the same decision
  the row's button does, once per heading, bound to that heading's saved text, in report order.
- It leaves alone: template text with data missing, a heading whose saved text failed its hash, and headings already
  in review or approved.
- It stops at the first heading the server refuses, and says how many were sent, which was not, and why.
- **Approval is unchanged: one heading at a time, by a second person, after reading the exact saved text.** Sending
  is not a judgement on the text; approving is.
- The build section holds what the act said (`CsrRunBuilds.tsx`), because it empties and re-reads the list after a
  review decision.

## Tests: red first, then green

- `__tests__/csrBuildProgress.test.tsx`, three cases on the bare component. **Red:** no such button. **Green:** the
  exact two requests for two sendable drafts among six rows; the stop at a refusal with its sentence; no bulk act
  for a single draft.
- **Then the running app showed what those cases could not** (below), and `__tests__/csrSendDrafts.test.tsx` was
  written against the host. **Red:** after the list was read again, no line said what had been sent, and a refusal
  part of the way raised no alert at all. **Green:** 2 of 2.
- **A third red, from the full set:** the first version exported a small component for the line, and
  `csrRunBuildsScope.test.tsx`, which replaces that module with a stand-in, failed 4 of 5. The host now renders the
  line itself and imports only a type.
- Every test file that mounts these screens: 15 files, 139 tests. Neither source file gained a lint warning. A
  targeted `tsc` reports nothing.

One existing case in `csrBuildProgress.test.tsx` ("does not block the document CSR source picker…", over
`editor/StudyDataBuild.tsx`, another lane's file) failed once when two test files ran side by side and passed alone
twice. It waits on a timing this change does not touch. It is recorded here, not changed.

## Opened in the running app, twice

The stack as a Codespace builds it, in the Lumen account, as the Lumen lead, on the LMN-201 report.
`send-drafts.cjs` is the walk.

1. **First use (build 16, 65 drafts).** All 65 were sent, each answered 200, in about two seconds
   (`csr_section_outputs`: 65 `in_review`). **The screen said nothing**: the build section emptied and re-read the
   list, and the review that held the sentence was taken down with it. This is the defect the host now fixes.
2. **Second use, after the fix (build 18, 69 drafts; `send.json`, `before.jpg`, `after.jpg`).** "Send 69 drafts for
   review" → "69 headings were sent for review." in 2 seconds; 69 rows read "In review"; the act is no longer
   offered; no failed request, no console error.
3. **Third use, on the code as committed (build 17, 69 drafts; `send-final.json`).** The same result.

## Found on the way, not fixed here

- **The build section opens on the newest build, not the one the document imports from.** The Lumen report holds
  sections imported from build 16; the section opens on build 18. A person who reviews build 18's headings is
  refused at the import ("A document takes its imported sections from one build"), after the work. The section
  should open on the build the document is bound to and say so. Next in this lane.
- **A walk harness started the app without the demo-person list**, so "Demo access" signed into the development
  organisation, which holds a report of the same title. Not a product defect; the walks here start the app with
  `.devcontainer/post-start.sh`.

## Limits, stated

- **Approving 69 headings is still 69 readings by a second person.** That is the control, not a defect.
- **The headings sent in these walks were drafted by the stand-in provider**, not by a model.
