# AnA is told when a step returned nothing usable

Round 5 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes TP-RL-4
(medium) from round 1's map (`../../2026-10-04/map-findings.md`).

## What was wrong

The agentic loop counted a step as failed only when its handler threw or
refused (`{ error }`, `tool-trace.ts` `refusalOf`). These all answered as
successes:

- a search that found nothing;
- a service that could not be reached;
- a tool that needs input it was not given.

The round wrote no adaptation note, and the model went on to its answer with
nothing telling it those steps returned nothing usable. The tools do say so
themselves. In `AnaToolExecutor.ts`:

- 90 handlers answer `status: 'needs_parameters'`;
- 8 answer `'unavailable'`, 4 `'lookup_failed'` and 13 `'not_found'`;
- the PubMed outage envelope says "PubMed API unavailable — use manual search";
- a search with no hits returns a count of 0 or an empty result list.

Some tools say it in other ways:

- the three CMC record lookups trunk added today (`cmc-knowledge-tools.ts`)
  answer `found: 0`;
- the vault passage search answers `passages: []`;
- the project search answers in a sentence of its own, "No matching passages
  were found in this project's knowledge…".

## What changed

| Where | What |
|---|---|
| `server/services/ana/tool-outcome.ts` (new) | **`shortfallOf`** reads only the signals a tool gives about itself: a declared status, `unavailable: true`, an outage envelope's own words, a count of 0 (`found: 0` included), an empty result list (`passages` included), or a plain-text result that is wholly the tool's own "No … found" or "No query provided" sentence.<br>Three things are never shortfalls:<br>• a result with records in any top-level list, under any name;<br>• a sentence that is a finding ("No issues found") or longer than 400 characters;<br>• a refusal, which stays on the failure path.<br>**`buildShortfallNote`** names each such step with the tool's own words, and tells the model not to present what it did not return as found. It may vary the input, try another source, ask the person, or say plainly what could not be found. |
| `server/routes/ana-ri/stream.ts` | **The round's note is the failure note and then this one.** It rides the next model turn beside the round's results. This is one insertion at a line `git blame` dates to 2026-09-22. `agentic-loop.ts`'s `buildAdaptationNote` is unchanged: it is inside other lanes' 24-hour windows (`bbb074c1b`, `25ac4d226`). |

The person's work panel is unchanged: a step that returned nothing still shows
as a step that ran. Showing "no results" there needs a client field. That is
next, not here.

## Proof

- **Red first.**
  - `red.txt`: the module is missing, and the follow-up call gets no note for
    a search with no hits. The case where every step returned something
    passes; it is the negative control.
  - `red-trunk-shapes.txt`: the shapes found by reading trunk's new tools
    before filing. These are `found: 0`, `passages: []`, the project search's
    sentences, and records under a field the reader did not list. Each was
    pinned and seen failing against the first version of the reader. The
    finding/analysis case passed there; its red is its mutants (T17, T18).
- **Green.** `green.txt`: 257 tests in 19 files. That is round 5's two
  suites, every stream-route suite, and every suite of the agentic loop and
  the tool trace.
- **Related suites.** `related.txt`: 6,206 tests passing. The two failing
  files are round 4's two, neither of them this round's:
  - the ESG transport suite, which is environmental;
  - the registry scan handed on as board item 24.
- **Mutants.** `mutants/summary.txt`: 19 of 19 killed.
  - Two of them would have survived the first tests: a count of 0 with no
    list (T07), and a refusal with an empty list (T09). Their cases were
    pinned before the run.
  - T13–T19 revert the trunk-shape rules one at a time.
- **Lint.** `lint.txt`: the new files have no warnings, and `stream.ts` stays
  at trunk's 24.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`stream.ts` was inside row 100's 24-hour window (`3310d6c62`, 2026-10-04
21:26). This round's hunk is additive, at a line blamed to 2026-09-22. None of
row 100's lines changed.
