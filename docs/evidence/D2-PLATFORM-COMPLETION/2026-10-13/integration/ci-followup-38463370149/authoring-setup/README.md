# Five remaining authoring CI setup failures

Only the five existing tests named in `manifest.json` changed. No production
implementation, baseline, dependency or signing control changed.

`setup-red.txt` records the current-tree reproduction: five files failed before
their assertions could run. Four membership mocks omitted `requireEditorAccess`,
which is now required to register the canonical source importer; the saved-source
export fixture recreated history already provided by its shared harness.
The mocks now expose that existing explicit middleware seam. The real JWT gate
and each test's signing, source, hash and refusal assertions remain in place.

After that setup correction, `projection-prerequisites-red.txt` records five
actual failures: three allowed-figure saves lacked the parent's current
reservation projection, and two valid source-linked exports could not inspect
immutable CREATE receipts because their audit table was absent. The figure
fixture now models the existing child-to-parent read, editable parent and exact
one-row reservation receipt. Its positive test additionally verifies that the
parent is reserved before the section write. The saved-source fixture applies
the real `20260725_authoring_audit_trail.sql` migration, including its append-only
triggers, rather than bypassing that governance read.

Final result: **5 files / 41 tests passed, 0 failed, 0 skipped**, exit 0 in
29.63 seconds. ESLint: **0 errors, 0 warnings**. The tests retain malicious image
refusals and no-write assertions, legitimate figure round trips, absence versus
completion of approval workflows, approved/frozen snapshot and signature digest
binding, draft export refusal, delivered artifact hash, and persisted source
withdrawal/noncurrent/extraction/malformed-group refusal before audit/history.

These tests deliberately expose policy/signing/audit seams and, for saved-source
SQL, use isolated PGlite. They establish their scoped behavior; the separate
native runtime-role evidence establishes actual local RLS and signing ceremony
behavior. Neither is production qualification or scientific/model validation.
