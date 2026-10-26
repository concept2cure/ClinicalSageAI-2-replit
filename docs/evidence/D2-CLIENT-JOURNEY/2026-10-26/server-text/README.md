# D2: the server's half of decision 12 ("program" → "project" in what a client reads)

The client's half is `../wording-sweep/` and `../wording-sweep-2/`. This is the server's: messages, refusals and
labels a client reads on a screen in the release, word for word.

## What already exists

- A discovery pass read 1,068 server strings containing "program" or "programme".
- This pass took the 357 that are shown to a client verbatim, on a screen in the release, and are not domain terms.
  Domain terms keep their wording: the FDA Q-Submission Program, expedited, pediatric, stability and qualification
  programmes, "Program management".
- Excluded:
  - `server/routes/ectd-compile.ts`, which the RIM session owns;
  - the regulatory pyramids' knowledge text.
- Not in this pass, each needing its own decision:
  - AnA tool results (126 strings);
  - AnA's prompt text;
  - document content.

## What changed

- Five editors worked disjoint file partitions (`sweep-result.json`, with every change before and after).
- 295 strings were changed and 47 left as they were, each with a reason. Most of those are an AnA tool parameter
  name the model needs to correct its call, or a database column name in a developer note.
- "Tracking record" names the integer projects row; "Filing type" names a filing's type.
- Logic, identifiers, routes and columns are unchanged.

## Tests

- **Red (`red/`).** Each editor updated the tests that pinned old wording (61 pins). It ran those pin files against
  the old source in a `git archive HEAD` copy, where each fails on exactly the pinned assertion, quoting the old text.
  The four that stay green pin fixture text only.
- **Affected sets.** Each editor ran every test file that imports a changed file, in the tree and at HEAD: 796
  file runs.
  - Every file failing in the tree also fails at HEAD, with the same tests. The causes are recorded per file in
    `sweep-result.json`: missing PDF fonts in this container, PGlite fixtures without `company_legal_registry`, import
    timeouts under load, and existing route failures.
  - Two exceptions crossed partitions. The pins at `tests/golden-journeys/cer-eu-mdr.journey.test.ts:387` and
    `tests/routes/estar-official-pdf.test.ts:864` read another partition's message. Both were updated, and both files
    pass (47 tests).
- **Not run.** The two independent verifiers did not run: the session's agent limit was reached. What stands in
  their place is the per-partition comparison above and the pre-push gates.
