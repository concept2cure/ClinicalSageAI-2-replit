# Review item 7, the last part: the picker's Module 1 labels (2026-10-15)

Row: D2. Source: `.design/filing-spine/DESIGN_REVIEW.md` item 7, left over from F22.

The market statement's short form named the Module 1 shape in the builder's words: "Structured", "Flat" and "Placeholder Module 1". It labels each market row and each New submission region option. A filer asks whether Module 1 sits under the agency's own headings, and the long statement (`MODULE1_DETAIL`) already said so. The short form now says it too, in `server/services/regulatory/market-support.ts` `MODULE1_LABEL`:

| Before | Now |
|---|---|
| Structured Module 1 | Module 1 to the agency's headings |
| Flat Module 1 | Module 1 without the agency's headings |
| Placeholder Module 1 | Module 1 on another region's structure |

- `red/old-labels-pinned.txt`: the label changed and the tests not yet, so 7 tests in the two server suites fail on the old wording. The client suites mock the server's strings; their fixtures now carry the new wording too.
- `green/new-labels.txt`: all 6 suites (68 tests).

`check:microcopy`, `ci:internals-in-copy` and `ci:action-overclaim` pass, and the ratchet shows no change. HawkScan not run: HAWK_API_KEY is not set.
