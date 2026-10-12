# `servedModelsOf` answers a malformed record with a verdict, not a fault

**Found by an adversarial verifier reviewing round 15's plans — against code
this same round had just committed.** Recorded here because that is the point of
running them, and because the finding was correct.

## Why it matters now, when it did not before

`servedModelsOf` used to be read only on display paths: the live stream status
and a reviewer's rail. Round 15 made it **load-bearing on a write path** — the
three server doors of SEC-A-7 read it through `servedModelsForTurn` to decide
whether RULE 2 admits a document's prose.

`authoring-record.ts`'s own comments say that path must not fault: an unhandled
throw there is a 500 instead of a recorded refusal, and inside a transaction a
failed statement aborts the very write being checked. So the same function, at
the same quality, became something it had not been before.

## What was wrong

`model.calls ?? []` is not an array check, and three shapes got through:

| Body | Before |
|---|---|
| `{ calls: 'anthropic' }` | a **string has a length**, so it was iterated character by character and **invented** `{provider: null, model: null}` — an author nothing served |
| `{ calls: { length: 2 } }` | **TypeError: named is not iterable** |
| `{ calls: [null] }` | **TypeError: Cannot read properties of null** |

A record body is written by our own writer and hash-checked by a table CHECK, so
these mean a corrupt or hand-written row. The point is not that they are likely.
It is that the answer to one must be a verdict the doors can refuse on.

Note the direction, because it is the saving grace and not a defence: an
invented `{provider: null, model: null}` author is **unqualified**, so a door
reading it refuses. The bug was never fail-open. A throw, though, is not a
verdict at all.

## What changed

`Array.isArray(model.calls)`, and non-object elements are skipped. An unusable
list falls back to the one model the turn names — dropping to `[]` there would
make the doors refuse a turn whose record can still speak for itself.

A `null` element is **skipped**, not recorded as an unknown author: a null in
the list is not evidence that some model served the turn, where
`{provider: 'anthropic'}` is. That distinction is the documented case and it
still works — it passed before and after.

## Proof

- `red.txt` — 3 of 9 failed, one of them the real throw; reproduced standalone
  on the function's exact logic first.
- `green.txt` — 9/9; 31/31 across the suites that read it, including both new
  SEC-A-7 suites; 40/40 across every `turn-record*` suite.
- `mutants/` — four mutants, all killed: the array guard dropped; the
  element guard dropped; the element guard weakened to `!c`; and the fallback
  to the turn's own model dropped.
