# Device attachment feedback test contract

D2 / W2, 2026-10-30. Test-only authoring at canonical baseline `89b67685e582ff7a6f91487fa0877527f5ab6ea8`. This worker changes only the new caller suite below and this note. No production, existing test, fixture-helper, dependency, Git ref or qualification runner was changed or invoked.

## What already exists

The inventory in `docs/design/DEVICE_ATTACHMENT_FEEDBACK_2026-10-30.md` and the packet README was read before authoring. `DossierDrawer.uploadReceipt.test.tsx` and `DossierDrawer.dropIdentity.test.tsx` already retain 17 real input/drop identity controls; neither file was edited. The existing `useVaultUpload` owns outcome wording, indexed status and receipt authority. `_ingest-xhr-fake.ts` provides the retained actual-XHR seam and explicit `ingestReceipt(form, overrides)` helper. The new suite reuses these; no mock upload hook or second production engine is introduced.

## Frozen candidate

- File: `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadFeedback.test.tsx`
- Lines: 260
- SHA-256: `db38c93ef8c828a722ff824895ab8683d46d588a49cfd7a5c9d6ee1b1c987e8c`
- Declared controls: **14** (nine standalone tests plus three uncertain-result vectors and two valid-result vectors).
- Four describe groups keep each function below the existing length limit. Existing user-event is used; no package changes.

## Controls

1. Known HTTP 409 version-content refusal is visible as an alert with the actual filename/reason, no attachment and no client-authored Activity.
2. Malformed successful JSON envelope remains visibly uncertain, with Reload the Vault/check-before-retry guidance and no false nothing-recorded claim.
3. Explicit HTTP 503 OUTCOME_UNKNOWN keeps the same honest uncertainty and no automatic retry.
4. A lost reply after the existing XHR fake reports all request bytes sent reaches the real shared hook's uncertain-send path.
5. Valid plus refused files display partial confirmation and the actual refused filename, while the store contains only the confirmed selection.
6. Valid plus uncertain files display partial confirmation and an unknown result without turning it into a known refusal.
7. Valid HTTP 201 uses existing Unfiled outcome wording and adds the confirmed metadata without a local audit event.
8. Valid HTTP 200 with unchanged/reupload metadata uses existing already-recorded wording.
9. A deliberate later selection clears its predecessor's alert, shows its own pending state, and publishes its own valid result.
10. Pending feedback is visible; file input and native Choose files button are disabled; extra programmatic input/drop attempts create no second POST.
11. Input/drop/input gestures in one outer act cannot start parallel batches before the pending state repaints; exact request count and original File identity remain one.
12. Native-button Enter and Space activation each invoke the hidden input's real click once, without submitting any upload.
13. A pointer gesture on the retained drop zone opens the hidden chooser once; a call-through spy observes real event bubbling rather than replacing input.click with a no-op.
14. Document/Activity/Attachments tab switches during a pending request retain its busy state and eventual result in the same drawer visit.

Every actual upload asserts exact original File references, request order/count, POST path, project, filename-derived code, bearer and organization headers, multipart Content-Type ownership and credentials. Controlled pending responses are released in finally cleanup even if an early red assertion fails. This prevents a baseline failure from leaving an unresolved artificial request behind. The pending note is selected by its accessible status role and refusal/unknown by alert role, inside the actual dossier dialog. Attachment assertions inspect the real store and row counts; filename occurrences in truthful result text are not mistaken for stored metadata.

## Limits and handoff

No test or lint/build/compiler command was run by this worker. Root owns the red snapshot, observed failure attribution, production change, green run, whole-project gates and publication. The current source has no visible note or native chooser button; observed red counts must come from the root runner, not this authoring note.

The tests import the actual DossierDrawer/shared hook/transport/parser/store. Server replies, metadata reads and selected files are explicit synthetic fixtures. The keyboard test verifies user-event activation and real DOM click dispatch in jsdom; it does not claim an operating-system file dialog or hosted browser/auth acceptance. Network loss is the retained XHR fake's complete-send error seam, not a live proxy outage. Current-owner retirement, account changes and A-B-A tests belong to a separate worker, and no broad session/persistence/agency claim is made here.
