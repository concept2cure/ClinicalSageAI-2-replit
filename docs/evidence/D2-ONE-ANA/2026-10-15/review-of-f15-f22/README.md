# Review of F15 and F22: the findings, and what was done with each

Launch row **D2**. On 2026-10-15 four read-only lenses reviewed what landed that day: F15 (Respond), F22a (Add a market), item 6 (a market not offered) and the shared history view.
- **Security** (the add-market route and service): no defect; three hardening items.
- **Part 11 and honest state:** two must-fix items, three should-fix.
- **Accessibility and copy:** no blocker; advisories.
- **Plan for F22b:** the next slice.

## Done here

| Finding | Lens | Change |
|---|---|---|
| A project with no filing of its own could get a market, after which the home scaffold (which skips a project holding any document) would never write the filing | Security | `add-project-market.ts` refuses with 409 `NO_HOME_FILING` |
| An archived project accepted a market | Security | The route refuses with 409 `PROJECT_ARCHIVED` before anything is attempted |
| Someone who may not change the project filled in the form, then met a 403 | Part 11 (must) | `GET /api/c2c/projects/:id` returns `canChange`, by the decision the writes take (`mayChangeProgram`, extracted from `allowProgramMutation`). Project home's "Add a market" is disabled and says who may add one. The drawer says so before it is filled. A 403 reads "only this project's lead or an organization manager can add a market to it" |
| The reason was not shown back | Part 11 (must) | The notice reads: "Market added to the project — MAA · EU (EMA). Recorded on the project with your reason: …" |
| The add's consequence was not stated | Part 11 | The reason field is "Reason for adding this market", and its description states what the add writes |
| The draft's question numbers and dates were guarded only by a prompt instruction | Part 11 | Respond tells the person to check every question number and due date against the letter. AnA consumes and clears the pin after the turn (`useAnaChat.ts:1665-1676`), so a stale pin cannot carry into a later draft |
| A disabled upload button dropped focus to the page | Accessibility | `aria-disabled`, ignoring the click while uploading |
| The Respond steps had no headings, and loading lines announced as status | Accessibility | `h3` step titles; loading lines are plain text; failures stay `role="alert"` |
| The history view's hash was readable only on hover; no list semantics; decorative dot | Accessibility | The full hash is in screen-reader text, entries are a list, the dot is `aria-hidden`, and "History" is a heading |
| A region the server does not offer could be preselected | Accessibility | It is never preselected |
| Copy | Accessibility | "Choose the letter file"; "then place the answer into filing" |

## Left, with the reason

- **The binding filtering on `filing_scope='home'` (Security, low).** The binding contract suite builds its schema from the 20260528 file alone, so a query naming the column would fail there. The agency filter holds the same line: a market's own pack is required (no fallback), so a market document never carries the home agency or a fallback.
- **A project-level history view for the market add (Part 11, should).** The add's audit row is a `project:` record. Showing it in context needs a project history surface, which is a slice of its own.
- **The shared form's live region (Accessibility, advisory).** Moving `aria-live` onto the changing part of a field's description changes `C2CForm` for every form, so it is left for one pass across them.
- **The verdict's wording ("verified — N rows", "has a break").** It is pinned by the Vault's suite and unchanged from the Vault's view.
- **Length caps on the add's strings; a second door to `createSubmissionTx`** (AnA, IRB, intake) without the market check. These existed before this change and are recorded for the security register.

## Red, then green

- `red/server-red.txt`: 4 of 16 fail before: no home filing, archived, and `canChange` for the lead and for another member.
- `red/client-red.txt`: 4 of 21 fail before: the reason shown back, the Respond steps, "Add a market" for someone who may not, and the history's hash and list.
- `green/vitest.txt`: those suites, plus Submission Center, Vault, Project home and New submission.
- Typecheck: 0 errors. Gates green. No lint count changed.
