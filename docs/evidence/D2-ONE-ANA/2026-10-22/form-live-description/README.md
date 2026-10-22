# A field's changing description is its only live part (2026-10-22)

Row: D2. Left open by the accessibility lens on F15/F22 (`…/2026-10-15/review-of-f15-f22/`): "moving `aria-live` onto the changing part of a field's description changes `C2CForm` for every form, so it is left for one pass across them."

## What already exists

- `C2CForm.tsx` field `descLive`: it made the whole description a polite live region, so a screen reader re-read all of it when one clause changed.
- Four callers used it:
  - `NewSubmissionForm.tsx`: where the default came from, which is fixed, plus the region's statement, which changes;
  - `LegalHoldsCard.tsx`, `CommunicationCenter.tsx` and `AgencyResponses.tsx`: each description is entirely a read state that changes.
- No other live-description mechanism exists in the form. Search: `grep -rn "descLive\|aria-live" client/src/concept2cure/v2/C2CForm.tsx`.

## What changed (one pass across all of them)

- `descStatus` replaces `descLive`: the changing part, after `desc`, in its own polite live span.
- The span is drawn even while empty, so its first change is heard. The field is described by both parts.
- The four callers moved over in the same change (zero duplication: no `descLive` remains).

## Red, then green

- `red/whole-description-live.txt`: the new `c2cFormLiveDescription` test on the pre-change form. 2 of 3 fail.
- `green/form-and-callers.txt`: every suite that renders `C2CForm` or one of the four callers, 33 files. The 2 failures are `protocolReviewerNameReadOnly.test.tsx`, and they fail identically on trunk with this change stashed: another lane's.

The New submission assertion that pinned the whole description as live now pins only the statement as live.

Typecheck clean; the ratchet shows no change. `check:microcopy`, `ci:undefined-css-classes` and `ci:design-system` pass. HawkScan not run: HAWK_API_KEY is not set.
