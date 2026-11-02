# MDX journey M8: Labeling's empty state renders the action it describes

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M8. Plan: F1.

## What already exists (RULE 3)

- **The screen.** `client/src/concept2cure/v2/surfaces/Labeling.tsx` reads the open project's labeling document
  (`GET /api/mdx/labeling?program_id=`), then its translations and symbols. Its write controls are offered only to a
  role that can write (`canGovernedWrite`, `labelingViewerHidesWrites.test.tsx`).
- **The creators.** `POST /api/mdx/labeling` (`server/routes/mdx-labeling.ts`) creates a draft record, admits the
  project and records the creator. AnA's `create_labeling_document` (`server/services/ana/AnaToolExecutor.ts`) does the
  same through the conversation. It is in launch scope (`server/services/ana/ana-launch-scope.inventory.json`) and
  takes the project only from its `program_id` input. No client code calls either.
- **The contract.** `EmptyState` (`client/src/concept2cure/v2/dataConnect.tsx`) "retires … the PASSIVE INSTRUCTION
  … If the fix is an action, render the action." It takes `action: { label, onAct }`.

## The defect

With no labeling document, the screen said "Create a device IFU, package insert, or patient label to author its
symbols, UDI, translations and warnings here." and offered nothing to click. AnA was told "Create a labeling document
for a device", whatever the user's role, and without the project it would have to file it under.

## The change

- The empty state's action, for a role that can write, is **Ask AnA to start it**. It sends: "Start the labeling
  document for this project. Ask me which kind it is (…) and its language, then create it." The kind and the
  language are the user's to say. A viewer is offered no start, and is told "Your role can read labeling, not start
  it."
- AnA is told the same: for a writer, the one action, with the project's id, because the tool takes the project only
  from its input. For a viewer, no action.
- RULE 4: no per-type create button and no new control. The door is the conversation, as the screen's existing Ask
  AnA control is.

## Proof

`client/src/concept2cure/v2/__tests__/labelingEmptyStateHasItsAction.test.tsx`: red before on all four cases
(`red.txt`). Green after, beside the screen's three existing Labeling suites (`green.txt`, 31 cases).

## Not done here

- The screen was not opened in the running app for this change (slice 5 walks the journey).
- `create_labeling_document` writes `program_id` without the project admission `POST /api/mdx/labeling` makes. A
  database key refuses another organization's project; a deleted one is not refused. The handler is in
  `AnaToolExecutor.ts`, which the filing-types lane holds, and this is recorded for it in COORDINATION.md.
