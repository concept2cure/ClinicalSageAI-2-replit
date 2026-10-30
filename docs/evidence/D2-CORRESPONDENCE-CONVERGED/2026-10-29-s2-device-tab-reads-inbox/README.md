# P-39 step 3, S2: a device project's letters are the project inbox's, answered in Communication

Row: D2 (W1). This is slice S2 of `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`. That file's "What already
exists" section maps the family and the inbox. S1, the project scoping, landed first
(`../2026-10-29-s1-project-scope/`).

## Before

- **The device Correspondence tab** read `c2c_correspondence` through `/api/regulatory-correspondence`. It is a store no
  browser client writes and that Communication does not show. So a device project's letters were not the letters its
  team recorded in Communication.
- **The tab's "Draft response with AnA"** opened the AnaDrafter (`mdx/components/AnaDrafter.tsx`), a second response
  screen.
  - Its Send was disabled, and its draft was never saved.
  - It sat beside Communication's questions, responses and signed approvals (`AgencyResponses.tsx`), the platform's
    one governed response flow.
- **"Assign" and "Mark closed"** had no handler.

## What changed

- **The tab reads the inbox.**
  - `programTabsService.getCorrespondence` reads
    `GET /api/concept2cure/projects/:projectId/agency-communications`, the canonical store.
  - That route takes the program id the device screens hold, and admits the reader to its project (`router.param`
    in `communication-center.ts`).
  - `adaptCorrespondence` maps its rows. It fills in nothing the record does not carry: no sender, no subject.
- **A letter is answered where every letter is.**
  - The detail's one action is "Respond in Communication".
  - It calls the host's `openLetter`, which calls `openLetterInCommunication`, the same hand-off CMC / Module 3 uses
    (P-38).
  - That opens the letter on its record, where its questions are recorded and each response is drafted, approved by
    signature and packaged.
  - `MdxSurfaceHost` passes it through the four device surfaces into `PathwayPanes`.
- **Deleted**, with this record:
  - `mdx/components/AnaDrafter.tsx`, `mdx/data/correspondenceDetail.ts` and `mdx/drafter.css` (188 rules, all its
    own);
  - `useCorrespondenceDetail` and `useReviewIssue` (which had no consumer);
  - `programTabsService.getCorrespondenceDetail` and `reviewIssue`;
  - `mdx/__tests__/anaDrafterNoFabrication.test.tsx`;
  - the honesty contract's AnaDrafter block.
- **The text ramps are regenerated** (`ci:surface-text-ramp`).
  - The mdx ramp loses the drafter's rules.
  - The v2 ramp was already stale on trunk: `review-decision.css` had been added without regenerating it. It now
    matches.

## Deletion record (working agreement)

- **History search:** `git log --all --diff-filter=D -- '*Drafter*' '*drafter*'` returns nothing. No earlier drafter
  was deleted, and this deletion is recorded here.
- **The file that now delivers the user outcome:** `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx`, inside
  Communication's inbox.
  - The outcome is "answer this agency letter": record its questions, draft each response, have it approved by
    signature, and assemble the package.
  - It is reached from the device tab through `openLetterInCommunication`.
- **The tests that prove it is reachable:**
  - `tests/concept2cure/mdx-pathway-panes-smoke.test.tsx`, "renders live audit / correspondence / approvals". The tab
    lists the inbox's letter, "Respond in Communication" opens `ace_live1`, and no call reaches
    `/api/regulatory-correspondence`.
  - `client/src/concept2cure/v2/__tests__/communicationOpensLetter.test.tsx`, which pins that a letter link opens that letter in Communication.

## Proof

- **Mutation:** pointing `getCorrespondence` back at `/api/regulatory-correspondence/correspondence` fails the
  live-wiring case. Restoring the inbox read makes it pass.
- **Passing:**
  - `PathwayPanes.tabCounts.test.tsx`, with its stub moved to the inbox path;
  - `surface-honesty.contract.test.ts`;
  - `mdxKeyboardReachable.test.tsx`;
  - `launch-scope-device-features.test.ts`, under the production gate, which serves the inbox call;
  - `surfaceHostRenders.test.tsx`;
  - `shell-kit-lazy.test.ts`.
- **Not this change's:** `mdx-pathway-panes-smoke.test.tsx` "async-seeds the Files tree + drawer from the
  c2c/documents backend" fails on trunk before this change too (checked with the change stashed).

## Next

S3: AnA's `correspondence.ingest` records the letter through the inbox's governed create.
