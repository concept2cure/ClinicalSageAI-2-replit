# D-29-C — the approver is told which sections their signature did not cover

Rows **D5** and **D1**. Decision **P-29**
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`). Round 17.

## What was wrong

`approveBoundFilingSections` moves a bound filing section to `approved` only
when its filed text is exactly the text signed, and reports every key it could
not move in `notApproved`. `POST /api/authoring/docs/:docId/e-sign` sends that
on as `filingApproval`.

The client dropped it. `postAuthoringSignature` typed the response as
`{ documentHash, signedAt }`, and the confirmation read:

> Document signed (approver) — approved and frozen

**unconditionally.** So an approver whose signature left sections unapproved in
the filing saw an unqualified green confirmation and was never told. The person
carrying the §11.10(e) responsibility was the one person not informed, about
the gate that makes P-29.1 true.

## The change

- The response's `filingApproval.notApproved` is read, blank keys dropped.
- `signedToast` says "approved and frozen" **only** when the approval covered
  every bound section, and otherwise qualifies it with a count.
- A persistent `RefusalNote` names the sections and the remedy — persistent
  rather than a toast, because the approver has to be able to act on the keys
  after the confirmation has gone.

Two extractions came with it, both genuine de-duplication rather than lint
relief: `signedManifest` (the freeze and the signature built the same object,
differing only in what they call the timestamp) and `signedToast`. The
component is shorter than before and its warning count matches trunk.

## Red before green — and the first red was not good enough

Exporting three internals (`postAuthoringSignature`, `signedToast`,
`notApprovedNote`) was necessary for the red to exist at all: neither the
dropped field nor the unconditional sentence had a seam a test could hold,
which is part of why the defect survived.

The first red, against the component as it was, said only:

```
→ postAuthoringSignature is not a function
→ signedToast is not a function
```

That proves the seam was absent, not that the behaviour was wrong, so it was
not accepted. The old function was then exported in a throwaway probe and the
transport cases run against it:

```
× carries the sections the approval did not cover
  → expected undefined to deeply equal [ '2.5', '3.2.S' ]
× reports none when the approval covered every bound section
  → expected undefined to deeply equal []
× reports none, not undefined, when the server sends no filing approval at all
  → expected undefined to deeply equal []
× drops an empty key rather than naming a blank section
  → expected undefined to deeply equal [ '2.5' ]
```

`undefined` where the keys belong: the field was dropped. That is the red.
After: 9 passed.

## A correction to the decision document

An earlier revision of D-29-C said the component "no longer exists". It does —
at `client/src/concept2cure/v2/surfaces/`, not `v2/editor/` where I looked. The
substantive claim (no client file read the field) was correct, and the review
dimension that originally cited `AuthoringFilingBar.tsx:176-182` as discarding
it was right about the file as well as the defect. Corrected in place.

## Attributed, not fixed

`client/src/concept2cure/quality/__tests__/ControlledDocumentWorkbench.integration.test.tsx`
fails 3 of 3, identically with this change stashed
(`expected undefined to be 'textbox'`). Trunk red; handed on.
