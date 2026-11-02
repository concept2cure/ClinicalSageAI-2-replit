# S4: the application user fee asked as positions, and an orphan exemption judged against the designation

Package **S4**, 2026-11-02. This follows on from the orphan-designation change in
[`../2026-11-02-orphan/README.md`](../2026-11-02-orphan/README.md). That change left one
item open: the NDA node's own critical check still fired on an exempt orphan
application's honest "not paid".

Founder directive of 2026-10-12: questions offer positions, each with what it commits
the programme to, and an Other. AnA pushes back when the data do not support a claim.

The work is a completion. It completes the NDA's fee question
(`flows/nda-submission.ts`) and converges the BLA's onto it.

## What already exists

The questions, before this change:

- **NDA.** `flows/nda-submission.ts` `user_fee_paid` was a yes/no, "PDUFA User Fee
  Paid", required. Two things read it:
  - the goal-date gate (`pdufa_goal_date` visibleWhen `eq true`);
  - the node's issue check `pdufa_fee_not_paid` (`eq false`, critical).
- **BLA.** `flows/bla-submission.ts` `user_fee_paid` was the same yes/no, with the same
  two readers (`user_fee_not_paid`, critical). It asked a 351(k) biosimilar about PDUFA,
  whose fees a biosimilar does not pay.

The war game, before this change:

- **NDA.** `war-game/auditors/nda-auditor.ts` `no_pdufa_user_fee` read `isYes`. After
  the orphan change it read the designation on an unpaid fee.
- **BLA.** `war-game/auditors/bla-auditor.ts` `user_fee_not_paid` read only an explicit
  no.

The orphan vocabulary already gives the fee consequence of each designation reading:
`flows/ind-submission-orphan-designation.ts` `orphanFeeStanding` and `ORPHAN_FEE_NOTE`.

Elsewhere, read and not changed:

- `server/services/global-ri/regional-module1-requirements.ts` `us_user_fee` (Module 1.1
  cover sheet);
- `server/services/ectd/controlled-vocab/cv-v4-data.ts` (Form FDA 3792, the BsUFA cover
  sheet, form type 8);
- `server/services/regulatory-precedent-intelligence/rtf-trigger-service.ts`
  'user_fee';
- the eSTAR and pre-STAR mappers. These hold the MDUFA cover sheet. Device fees are not
  asked by any interview this change touches.

Searches run: `user_fee`, `pdufa_fee`, `fee_paid`, `user_fees`, `bsufa` over `server`,
`shared`, `client` and `tests`.

## What changed

- **One vocabulary.** `flows/nda-submission-user-fee.ts` is a split from
  `nda-submission.ts` under RULE 6. It offers four positions, plus the person's own
  words:

  | Position | Commits the programme to | Authority |
  |---|---|---|
  | Paid, or paid with the submission | the cover sheet: Form FDA 3397 for PDUFA, Form FDA 3792 for BsUFA | §736(a)(1), (e); §744H for a 351(k) (recall) |
  | Exempt as an orphan-designated drug | holds only with a granted designation and no non-orphan indication; claimed on the cover sheet, not requested as a waiver; not available to a 351(k) | §736(a)(1)(F); §526 |
  | Waived or reduced by FDA | a decided request on the statute's grounds; a pending request is not a waiver | §736(d) |
  | Not yet paid | the application is not accepted for filing | §736(e) |

  A saved `true` reads as paid and a saved `false` as not paid, which is what the
  yes/no asked.
- **Both questions ask from that list.** The BLA question is now labelled for PDUFA, or
  BsUFA for a 351(k) biosimilar. Both goal-date gates are one predicate,
  `FEE_SETTLED`. Both node checks are critical on "not yet paid" only. Their messages
  say to choose the exemption where it holds.
- **One judgement, `userFeeVerdictOf`.** It returns one of four verdicts:
  - settled;
  - an exemption a 351(k) cannot have;
  - an exemption without a grant;
  - an exemption the interview cannot confirm.

  Three things read it:
  - **The interview** pushes back with a new cross-node rule,
    `xn_fee_exemption_unsupported`, for the NDA and the BLA. It is a warning where the
    claim does not hold and info where it cannot be confirmed. The rule is split into
    `cross-node-rules-user-fee.ts`, like the shelf-life rule, to keep
    `cross-node-rules.ts` under its line limit.
  - **The NDA war game.** A supported exemption is no finding. An unsupported one is
    critical, or a warning where it is unconfirmed.
  - **The BLA war game.** An exemption claimed on a 351(k) application, or claimed
    without a grant, is a warning. A supported 351(a) exemption is no finding.

## The measurement

`__tests__/one-user-fee-vocabulary.test.ts` has 35 cases:

- the positions are offered in both interviews, and the BLA's label names BsUFA;
- the gate and the reader agree on 19 values: the positions, Other, the legacy yes/no
  spellings, blanks and near-misses;
- the node's critical check fires on "not yet paid" and on nothing else;
- the pushback rule is silent on a granted designation;
- it is a warning on one requested, planned, refused, not requested or `not_applicable`;
- it is info when the designation is unstated or is a saved bare "yes";
- it is a warning on a 351(k) application even with a grant;
- it is silent where no exemption is claimed;
- the war game agrees, case by case.

Each check was shown failing on the defect it exists for:

| Reintroduced | Fails |
|---|---|
| The NDA node check back on `eq false` | "the node's own critical" (1) |
| The goal-date gate reading only a yes | gate/reader on paid, exempt, waived (3) |
| An orphan exemption taken at its word | pushback and war-game cases (5) |
| A biosimilar allowed the orphan exemption | the 351(k) cases (2) |
| The BLA's old yes/no | "offers the positions", "names BsUFA" (2) |

The orphan test's "no other list offers an orphan value" gate failed on this change
until the two `user_fee_paid=orphan_exempt` positions were named in it. Each carries its
reason.

Gates:

- the interview and war-game suites (`server/services/ana/intelligence-questions`,
  `tests/ana-intelligence`), all passing;
- `typecheck:fast`: OK;
- ESLint on every changed file: no file gained a warning.

## Deferred, with reasons

- **BsUFA's own waiver and fee section numbers.** They are marked (recall). No
  interview yet asks a biosimilar's BsUFA programme fees.
- **Device user fees (MDUFA).** No device interview asks a fee position yet.
