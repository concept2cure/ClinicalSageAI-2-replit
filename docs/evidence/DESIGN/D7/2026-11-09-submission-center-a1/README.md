# D7-A1: Submission Center on the work-area pattern, walked in the running app (2026-11-09)

**Package:** D7 (step D7-A1, `.design/claude-convergence/D7.md` §A.4 steps 1–7). **Lane:** L9 (D7-A1, D7-A2), held by
RIM system build-out (`011e42…`); the coordinating session confirmed the lane and the order on 2026-11-09 (D7-A1, then
D7-A2, then P-86 C3). **File list sent before the first edit.** The spec was written at `6ffca88a09`; every step was
re-anchored on today's tree, and D0 §8.6's one page frame (`35f5fb4747`, `31e8de243a`) was already on it.

## What already exists (RULE 3)

Nothing here is new; every piece is an existing one, placed:
- the work-area pattern and its placement rules: `styles/app-v2.css` ("Work-area page pattern", D5 §WA.4.1), used by
  Biostatistics, CMC, Reporting & analytics and Audit & compliance reports;
- the page frame: `.sp` (Submission Center's own scroll box, `journey-v2.css:271`), with D0's paddings;
- the header primitives `.ph`, `.ph-title`, `.ph-sub`, `.ph-acts`; the starter row `.sp-starters[data-layout="row"]`;
  the back link `ProjectBack` (`dataConnect.tsx`); the tab primitive `.tabs`/`.tab`; the typographic section
  `.pj-sec`/`.pj-sec-h`;
- the handlers the header's actions call: the IND forms door (`stashNavParamsForTarget('ind-checklist', …)`, P-32), the
  compile door (`stashNavParamsForTarget('ectd-compile', { sequenceId })`, FILING_SPINE.md F14, the same one Dispatch
  offers), and `setNewOpen(true)` with its disabled rule and title;
- the honest-state discriminator `assessmentStateFor` (`assessmentState.ts`), which the deleted AnswerLead read.

## The change (`SubmissionCenter.tsx`, `coverage-v2.css`, `submission-v2.css`, `app-v2.css`)

1. Root `sp sc-page` with `data-work-area="submission-center"`, and the shared back link.
2. Header: the "Submission" eyebrow goes; `.ph` with the title and **one sentence of state**: "IND · FDA (US),
   planning. 1 sequence: 0000, assembling." It reads the sequences through `assessmentStateFor`, so while they load it
   says "Loading its sequences…", on a failed read "Its sequences could not be read.", and only on a settled empty
   read "No sequence yet." With no submission: "Plan, build, validate and dispatch each market's eCTD sequences."
   ("v3.2.2" dropped: the area files 3.2.2 and previews 4.0.) `.ph-acts`: **Forms and letters** (US IND only),
   **Compile & export** (a working sequence), **New submission** (the one primary).
3. The submission picker leaves the header for the context row `.sc-context` under the starters, labelled
   "Submission". The scope sentence becomes the back link (whose submissions) and a ghost toggle: "Show the
   organization's submissions" (with "(N more)" when the server sends the count) / "Show this project's submissions".
4. The AnswerLead goes. Starters: "Where does this submission stand?", "What blocks dispatch?", "Plan the next
   sequence". Its action is the Planner and Sequences tabs.
5. The IND forms note goes; its door is the header's "Forms and letters" (its title names the 1571, the cover letter
   and the LOA).
6. Tabs are `.tabs`/`.tab`. `.sc-ws` had no use left, so the retired-name ratchet required its alias out of the tab
   primitive's selectors (six in `app-v2.css`), and `.sc-wsbar` (no use either) left the tab-row alias.
7. Submissions: a `.pj-sec` with an `h2` and its count; "+ New submission" goes (the header's primary); Status and
   Stage are one "Status" column, the stage said after the chip only when it differs (they are different fields,
   `status` and `lifecycle_stage`); the "Project X" fragment goes when the list is the open project's. The table keeps
   its scroller at a phone's width (`.sc-tbl`, beside the old card's rule in `submission-v2.css`).

**Departures, told to the coordinator before the edit:** the Sequence select joins the context row in D7-A2 (its step
8 removes it from each workspace); the toggle keeps the count the old sentence gave; step 7's device-filings rule had
already landed with B4 (`useDeviceFilingsShown`).

## Proof

- **Running app** (`found/`, `capture.cjs`, `probes.json`): the tree at this commit's parent plus these edits, served
  by `tsx server/index.ts` on 5100 (`NODE_ENV=development`, `ALLOW_DEV_AUTH=1`, `RLS_ENFORCE=on`,
  `LAUNCH_SCOPE_ENFORCE=on`) over a throwaway database provisioned as CI's job provisions it (`install-fresh.mjs`, then
  `deploy-migrate.mjs`), one fictional account made by `scripts/seed-admin.mjs`, and the biotech demo pack seeded
  through the product's API (`scripts/demo/launch-demo/seed.mjs --pack biotech`, 234 records; the pack's manifest in
  the tree was restored, not committed). Playwright Chromium at 1440×900 and 390×844 (mobile), light and dark, on the
  project "[Demo · Biotech] C2C-101 …":
  - every capture: no page overflow (`#c2c-page` and the document, 0), no script error, one column;
  - one orange fill on the page (New submission); the Sequences tab shows two, the second inside the tab's own body,
    which is D7-A2's;
  - the state sentence "IND · FDA (US), planning. 1 sequence: 0000, assembling."; on the organization view the
    selected submission (C2C-201, which has none) reads "No sequence yet.";
  - the toggle relabels and returns; the server's scoped read (`GET /api/submissions?programId=`) sends no count, so
    the label carries none, as the old sentence did;
  - "Forms and letters" opens the IND screen on this submission; "Compile & export" opens the compile screen;
  - at 390 the starter row scrolls sideways, as the pattern's phone rule says (`app-v2.css`, the `[data-work-area] >
    .sp-starters` rule under `max-width: 640px`), and the Submissions table scrolls inside the page.
- **Tests:** the whole v2 client suite, 10,611 pass in 947 files. Two fail, and both fail the same way on trunk without
  this change (`bc7ffda39`): DeepResearch's credential drawer (`anaDrivesWave4`) and the Vault and documents
  descriptions in `shared/navigation/surface-actions.ts` saying "program" (`clientCopyNoProgram`); neither file is
  touched here, and the coordinating session is told. Typecheck 0 errors (12 GB heap). The cases that pinned the old
  layout were moved to the new places, with the same property each pinned:
  - `submissionCenterHonesty`: finding 2 ("an unknown count is not a known zero") now pins the header sentence;
  - `submissionCenterOpenProject`: the scope is said by the back link and the toggle, the count in its label, and
    AnA's miss sentence names the toggle by its new label;
  - `submissionRequiredDeliverables`: "no governed act on this tab" leaves AnA's starters out (they ask, they do not act);
  - the rest wait on the header sentence, the tab, or the new labels instead of the AnswerLead.
  - `foundationsRetiredRatchet` (`sc-ws` at 0) and `d0Focus` (five of the review's six items) follow the alias's removal.
- **Gates:** css-selector-shadowing, phantom-tokens, shell-css-collisions, design-system, internals-in-copy,
  one-product, surface-text-ramp, token-cascade, undefined-css-classes, ana-surface-context: all OK. ESLint:
  `SubmissionCenter.tsx` 5 = 5.

## Seen, not changed here

- The Submissions table's project column is narrow at 390 (the title wraps a word to a line); the table scrolls. A
  column width is a table-layout change, not one of A1's steps.
- `.sc-ws-badge` (`coverage-v2.css:528`) has no use in any component; left for the stylesheet's owner.
- The scoped submissions read sends no `notOffered`; the count is shown when it does.
