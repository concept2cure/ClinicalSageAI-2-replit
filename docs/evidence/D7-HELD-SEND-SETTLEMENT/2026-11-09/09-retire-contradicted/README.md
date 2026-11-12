# P-92 §10.5 B: a release that FDA's verified receipt contradicts keeps the sequence

The coordinating session's ruling 4 (2026-11-09): this repair lands first and alone, under F1, red-first in
`sequence-retirement.pglite.test.ts`. The design is §10.5 B of
`docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md` (on trunk at `621a046eb4`).

## The defect

P-108 1(c): while FDA's verified answer contradicts a signed settlement, resends are refused. C1 holds the resend
(`releasedSendReceivedRefusal`, `fda-esg-receipts.ts`). But P-86's check 3 (`boundProductionSend`,
`filed-sequence-baseline.ts`) excluded every transmittal whose settlement was `not-received`, whether or not FDA's
verified receipt was kept beside it. So:
1. a production send is released as not received;
2. FDA's signed MDN shows it received, and is kept with `contradicts: 'not-received'`;
3. P-86 retires the sequence and frees the number FDA holds.

## What already exists (RULE 3)

- `boundProductionSend` (check 3) and its fallback, check 4, in `server/services/submission-service/filed-sequence-baseline.ts`.
  They were extended by C1 (P-108 2(a)) to excuse a release.
- `releasedSendReceivedRefusal` (`server/services/submission-gateways/fda-esg-receipts.ts`) already asks the question
  this repair needs: is there a verified `as2ReceiptHistory` entry with `contradicts: 'not-received'`? Check 3 asks the
  same question in the same SQL shape. No new reader or helper is added.
- `keptRefusal` and `retirementRefusal` give the act and its precheck one sentence each. The new sentence is one branch
  in `keptRefusal`, so the act, the precheck and check 5's naming of a later sequence all say it.

## The change

- **Check 3** excuses a release only while no verified entry of that transmittal's `as2ReceiptHistory` carries
  `contradicts: 'not-received'`. It also reads whether the row it found is such a release (`receivedAfterRelease`).
- **The sentence**, in words: "FDA's signed receipt shows it received sequence NNNN's send of DATE UTC, which was
  released as not received, so it cannot be retired. Contact FDA before anything else is done with it." Check 5 names
  it as "FDA's signed receipt shows it received a send of it".
- **A departure from §10.5 B.** The design said "checks 3 and 4". Check 4 is not changed. For a release, check 3 now
  finds the contradicted transmittal first, so check 4 is never reached for it. A settlement needs a bound transmittal
  (E2), and the contradiction is kept on that transmittal, so no case can reach check 4 with a contradicted release; a
  change there would be code no test can reach.

## Proof

- **The scratchpad proof** (`red-scratchpad-proof.txt`): before any edit, a test kept outside the repository ran
  against `f71ca16bb4`'s code. On both grounds of a release, the precheck cleared, the act retired, and `deleted_at` was
  set.
- **Red** (`red.txt`): the four new cases on the unchanged code. The two that the defect breaks fail; the two guards
  pass (a release with no receipt kept, and one whose kept entry is not verified, are still retired).
- **Green** (`green.txt`): the new cases and every suite that reads P-86's rule or the release, 10 files, 155 of 155:
  the retirement act, the rules, the route, AnA's refusal, the filed baseline, the removal guard, the held-send
  settlement, the resend hold, the receipt path and the client's retire tests.
- **Mutations** (`mutations/`, driver `p92-b-mutations.py` with `cmut2.py`): six, each applied alone and restored by
  SHA-256, each red on its own case:

  | Mutation | Red on |
  |---|---|
  | B1 the contradiction ignored | the act and precheck case, and the later-sequence case |
  | B2 an unverified entry keeps it | the unverified guard |
  | B3 the wrong pair (`contradicts: 'received'`) | the act and precheck case |
  | B4 the sentence dropped | the act and precheck case |
  | B5 the flag not read | the act and precheck case, and the later-sequence case |
  | B6 every release keeps it | both guards |

- **Gates:** ESLint shows 0 warnings on both files, before and after; the typecheck gate and the plan gate are recorded
  in the commit.
