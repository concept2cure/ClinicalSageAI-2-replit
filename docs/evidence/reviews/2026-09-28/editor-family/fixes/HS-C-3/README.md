# HS-C-3: a design-derivation read that failed was drawn as five empty buckets

Periodic review 2026-09-28, editor family, honest-state lens (medium,
confirmed by its verifier).

The Design derivation tab defaulted every bucket to [] when the body did
not carry it, so {}, an envelope, an error on a 200, or a null bucket was
drawn as five "Nothing in this bucket." panels: nothing proposed,
conflicting or incomplete, from a read that failed. The enveloped case hid
a real proposed path. The bind drawer did the same with the design list,
including an HTML page on a 200, and told the author the organisation had
no persisted study design.

- asDerivation returns nothing unless all five buckets are arrays; the read
  and the post-apply refresh report a failure instead. Five empty arrays
  still draw five empty buckets.
- The design list must be an array of rows that carry a study id;
  otherwise the drawer says the store could not be read. An empty list
  still says there is no design.

Failing first: 8 cases in protocolDevDerivation.test.tsx, 7 in
protocolStudyDesignTab.test.tsx.
- Before: 13 failed; the 2 honest-empty guards passed.
- After: 33 of 33.
- Five mutants, each caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.

## Not done here
The unbound branch (`res.status === 409`) in the derivation tab is dead code: `apiRequest` throws on every non-OK status but 401, and the route has two different `INVALID_STATE` 409s. A fix must branch on the error's code or message, not the status.
