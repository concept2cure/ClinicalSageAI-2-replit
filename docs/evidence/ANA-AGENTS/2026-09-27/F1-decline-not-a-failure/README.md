# F1: a person's "no" is not a failure for AnA to work around

**Row:** 74 (founder-directed; moves no D-row). **Found by:** the end-to-end
capture (`../E2E-stand-in/`, finding F1). **Session:** `…019ZvHmh`.

## What was wrong

After a person declined a governed action, the stream filed the decline as an
ordinary tool error (`stream.ts`, `toolStatus = approval.ok ? 'success' : 'error'`),
and round failures excluded only `cancelled`. So:

- the next model call carried *"[Adaptation note] 1 of 1 tool call failed this
  round: … try an alternative tool"*: AnA was told to find another way to do
  what a person had just refused;
- the person was shown *"AnA couldn't finish saving the document…"*, which
  says AnA failed, not that they said no.

In a regulated product that is a human-oversight defect: a refusal must end
the attempt, not invite a workaround.

## The change (`server/routes/ana-ri/stream.ts`)

Every result out of the approval gate now says whether it was **held back**:
not authorised by a person. That covers a decline, no answer within the
window, a dropped connection, a run that could not be held to ask, no
controllable run, and an act only a person may take (`REFUSED`). A held-back
step:

- is not in the adaptation note;
- is shown to the person in their terms: *"You declined saving …, so it did
  not run."*, or *"… did not run: it needs a person's authorisation (reason)."*

It is still recorded as an unsuccessful step, in the trace, the turn record
and the tool result the model reads, which already says `retry: false`.

Two outcomes are still failures to adapt to: an action a person **approved**
that then errored, and a call too unreadable to put to anyone (AnA can
re-issue it with its arguments spelled out).

## Proof

| Stage | File | Result |
|---|---|---|
| New route test against the code before the change | `red.txt` | 3 failed / 1 passed. The note was sent; the message read "couldn't finish"; an unanswered approval was also sent as a failure. The control (approved then failed) passed. |
| With the change | `green.txt` | 4/4 |
| Mutations | `mutations.txt` | 4/4 red: exclusion removed; decline not marked; message not changed; and the overcorrection of marking approved-then-failed as held back (it would hide a real error). |
| Neighbours (all stream-route suites, governed-write and agentic-loop suites, the activity UI) | `neighbours.txt` | 464/465. The one failure, `governed-reason-not-invented.test.ts` ("registered tools the scan never read"), fails identically with trunk's own `stream.ts` (checked by swapping it in); it is pre-existing and handed on. |
| `tsc --noEmit` | — | 0 errors |
| Lint ratchet | — | no file changed its warning count |

## Lane disclosure

`stream.ts` was changed within 24 hours by `ef70b10f4` (the answer-check lane).
F1's hunks are in the approval gate and the round-failure block, away from
theirs. The harness (`support/stream-route-harness.ts`) gains one field,
`approvalDecision`; it is this lane's file.
