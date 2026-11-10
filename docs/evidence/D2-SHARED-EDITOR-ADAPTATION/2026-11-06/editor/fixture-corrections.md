# Corrected test expectations

First post-change attempt: pinned-header outline assertion expected exactly two apiRequest arguments. The native live read supplies extra options/AbortSignal; the assertion now matches method/path without rejecting those arguments. This was a test assertion mistake, not a product defect.

First post-change attempt: numeric ambiguity requested exact code 1 alongside 01, so the exact-code match correctly won. The ambiguity test now requests 1.0 against 1 and 01, proving numeric aliases only after no exact match. This was a test expectation mistake, not a product defect.

The first post-change attempt reported 2 failed and 57 passed. That diagnostic log was superseded by the final completed GREEN log; it is not filed as a production RED receipt. The final eight-suite run completed with 119 passed.
