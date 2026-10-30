# Drag-and-drop selected-file identity controls

Test-only extension of the existing DossierDrawer, shared Vault upload hook, XHR seam, receipt parser and DossierStore. The completed inventory and approved contract are in `docs/design/DEVICE_ATTACHMENT_IDENTITY_2026-10-30.md`. No production owner or public API is introduced.

`DossierDrawer.dropIdentity.test.tsx` adds three complementary controls without changing the existing input receipt suite:

1. Two distinct same-name dropped File objects have different byte lengths. A complete HTTP201 receipt confirms the first; the second receives the legitimate HTTP409 VERSION_CONTENT_CONFLICT refusal. Only the confirmed file's metadata may appear locally.
2. The identical File object reference occurs twice in one dropped selection. The first receives an affirmative but malformed HTTP201 reply, and only the second receives a complete receipt. Exactly one attachment must appear. This distinguishes selected-index correlation from either a filename Set or a File-object Set.
3. Two distinct same-name selections have identical bytes. A complete created receipt followed by a valid unchanged HTTP200 reupload receipt confirms both selections. This preserves existing all-confirmed/idempotent behavior and does not claim two separately persisted Vault records.

Every control drives the actual `.dd-att-drop` handler and asserts that its browser default is prevented. It verifies exact posted File references in order, program/code, authentication, POST count, credentials, multipart boundary ownership, local attachment count/metadata, and no client-authored activity rows. The explicit shared `ingestReceipt` helper shapes only declared positive replies; malformed bodies remain malformed. No accepted hook result is mocked.

The current drawer does not render `attachUpload.note`; these controls therefore do not claim visible unknown-result/reload guidance. They prove no false attachment or activity and no extra POST. Broader recovery UX, durable attachment linkage and session lifetime retain the main contract's scoped limits.

This worker ran no tests, compiler, lint, build or Git mutation. Root owns fail-first execution, input hashes, qualification and direct publication. The initial expectation is that the two mixed cases fail against the filename-Set implementation while the legitimate all-confirmed case passes.
