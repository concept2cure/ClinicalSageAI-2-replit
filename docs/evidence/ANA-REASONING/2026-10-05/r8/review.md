# Round 8's plan, refuted before it landed

Two independent agents, read-only, on trunk `28c63cd22`:

- a mapper confirmed FV-missed from source and proposed a fix;
- a skeptic tried to refute the defect, the fix and the hot-file reading.

Each finding below is the skeptic's, with what was done about it.

## The defect

- **It holds, on the live path, and is not fixed.**
  - A figure the model wrote is stored as Key Facts that "should not be
    contradicted".
  - It is put in front of the model for the rest of a long conversation.
  - After seven days it is promoted to active project memory and recalled as
    citable.
- **Two corrections to the map.**
  - On the live stream path the write-back fires once a conversation reaches
    20 messages, not on every answer. The refresh gate counts the history
    window, not the thread.
  - The facts are the summarizer's sentences, not the answers' own.
- **The mitigation, and why it is not enough.** Memory is not a check
  source, so a later answer that repeats the figure is still flagged "not
  found" on its strip. Nothing told the writer why AnA kept insisting.

## The fix as first proposed

| # | Finding | Outcome |
|---|---|---|
| 1 | Unvalidated model JSON broke the new step. A non-string fact made `checkAnswer` throw, and the outer catch dropped the whole row. A string `lockedFacts` was read one character per fact. | **Done.** Only sentences are settled. A field of the wrong shape is empty, and the row is written. Mutants F06 and F11 are killed. |
| 2 | A second reader of the stored check would breach zero duplication. The canonical reader was the client's `readAnswerCheck`. | **Done.** It moved to `shared/ana/answer-check-reader.ts`, the client file re-exports it, and the server adds only the engine pin. Mutant F10 is killed. |
| 3 | Settling only Key Facts leaves the objective, decisions, open questions and next actions as a bypass. The consolidation job promotes those too. | **Done.** Every field either reader uses is settled. Mutants F08 and F09 are killed. |
| 4 | Pooling found claims across the thread recombines two answers' findings ("NCT02222222 reported 45%"). Reproduced against the real engine. | **Done.** One answer's found set must hold every claim. Mutant F03 is killed. |
| 5 | A found claim's text vouches for numbers that were not the claim: the 95 of "HR (95% CI) 0.62". | **Done.** A found figure keeps only its own numbers. Mutant F04 is killed. |
| 6 | The count check alone lets a same-count drift through. | **Done, with a limit.** The found count is checked too, and the engine is pinned by version. The stored text is the checked text. A same-count swap is possible only after an engine change without a version bump, as the module documents. Mutant F07 is killed. |
| 7 | Two planned tests passed on trunk. | **Done.** The threshold guard is a labelled negative control; mutant W01 (read before the gate) kills it. The current-turn test now asserts a not-found fact is withheld, so it is red on trunk. |
| 8 | Undisclosed costs: values the person stated, and figures from an attached PDF. | **Disclosed** in `README.md`. Attributing the person's values is the next decision. |
| 9 | Engine limits: words, proportions, and fabricated agreements. | **Disclosed** in `README.md`. |
| 10 | The evidence path collided with round 6, which was then in flight. | **Filed** under `r8/`. |

## What the review did not refute

- **The client impact.** An invented figure becomes a "fact" for the rest of
  a long conversation. It then becomes project memory recalled as citable in a
  colleague's conversation. That is an ALCOA+ accuracy exposure, and it breaks
  Rule 2.
- **The direction.** The fix is deterministic, on the write side, and reuses
  the engine. It adds no model call, tool or surface.
