# What changed in this round's own design, and on what evidence

The first design of this increment refused the **attribution** and not the
save. It was built, it passed 19 cases, and it was wrong. Five adversarial
reviews were run against it before it was committed; four of their findings
survived checking, and the design was rebuilt. The record of that is here
because the first design's reasoning is the kind that looks careful and is not.

## What was claimed, and what the code said

**Claim (mine): "a 403 destroys the claim, so the refusal would manufacture the
laundering it exists to prevent."**

The premise was true: `takeAcceptedAuthors` / `takeAcceptedInsertions` emptied
the store before the PATCH and nothing restored it. The conclusion did not
follow, for two reasons I had not checked.

- Five refusals **already shipped** on this door after that clear — a frozen
  document, no edit permission, a 409 collision, an unuploaded figure, a
  lineage failure. If the argument held it would forbid those too. The loss was
  a live defect, not a cost the new refusal introduced.
- The accept itself already files a verified decision record naming the turn
  and its served models (`tracked-change-decisions` →
  `resolveTurnRecordSources`), so the attribution evidence never rested on the
  save in the first place.

The fix was to stop destroying the claim, which is now its own change with its
own failing test (`authoringClaimSurvivesRefusedSave.test.tsx`).

**Claim (mine, implicit): "strip-and-disclose is the honest answer in every
case."**

It is the honest answer where the server cannot tell. Where it has checked the
record, the words and the models, recording the clause as a named person's own
assertion is a falsification the server chose. The verifier's own stated reasons
for not refusing an unverified claim are both reasons about not knowing, and I
had transplanted them to the case where the server knows.

**The consequence I had not computed.** All 16 approved-model entries are
`pq: 'pending'`, and RULE 2 admits only a PASSED PQ in production. So in
production the credited bucket is empty by construction: under the first design
every verified AnA claim would have been stripped, the revision would have
recorded `human-edit`, the filing `draft_source` NULL, and the lineage would
have written every clause as the actor's own — platform-wide. I knew the PQ
fact and did not apply it to the design.

**The write order.** `AuthorLineageResult.clausesInAcceptedText` carries a
written contract: "A caller that says a save accepted a machine's text says it
only when this is above zero". The first design derived the contributors from
the claims instead, so a verified claim of ONE WORD would have set the
revision's origin to `ai-draft-accept`, the filing's `draft_source` to `'ana'`
and the snapshot trigger's `author_kind` to `'ana'` for a save in which the
lineage credited the machine with nothing — the defect the sibling door was
corrected for in round 3. The save door was also the only one of three in this
file that wrote its revision before running the gate.

**The gate this round itself had landed.** The first design broke
`authoring-section-commits-to-filing.contract.test.ts` — round 15's own revert
cases — because its `saveAsAna` fixture sent a claim with no turn record. That
was the design telling the truth about itself: the fixture was the old,
unchecked shape. It now seeds a real turn record, so the contract exercises the
whole path.

## What survived

The distinction between "cannot tell" and "has checked", and the disclosure on
both sides of it. The first design's one verdict for both channels survived
too, with the derivation corrected.
