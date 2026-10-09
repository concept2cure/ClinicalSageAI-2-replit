# S0: two calls of one tool in one step no longer swap their results

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row). **Commit:** `97465528b`. **Session:** `…019ZvHmh`.
**Recorded:** 2026-09-28, against HEAD `85cb5654b`. The fix shipped without
filed evidence, and this folder corrects that.

## What was wrong

The server runs one step's tool calls concurrently and writes their results
in call order: `mapWithConcurrency` fills `results[i]` by input index, and
`stream.ts` loops over that array. The client paired each result with the
**most recent** running call of the same name. First-in results matched
last-in, so two same-named calls in one step swapped every time, with no race
needed. AnA searches for X and for Y, and the transcript shows X's results
under the Y query. With three calls, the first and last swap.

The result kept on each row is there "so a reviewer can see exactly what this
step returned". Shown against the wrong input, it is an audit record that says
something false about what AnA did.

## Proof

| Stage | File | Result |
|---|---|---|
| The committed test file, against HEAD with `97465528b`'s source change reverse-applied (`useAnaChat.ts`, `useAnaChat.types.ts`, `stream.ts`, `server-tool-steps.ts`) | `red.txt` | 8 failed / 2 passed. Two calls: `{ asked: 'X', got: 'Y' }`. Three calls: `{ asked: 'A', got: 'C' }`. All three carriage checks fail |
| HEAD, unmodified | `green.txt` | 10/10 |
| The no-id fallback's step confinement removed | `mutation-step-confinement.txt` | 1 failed: a call an earlier step left running took a later step's result (`expected 'running' to be 'success'`) |

On the old code, two tests pass by construction: "every call settles", and
the step-confinement case. Both guard the new fallback, and the second is
shown failing in `mutation-step-confinement.txt`.
