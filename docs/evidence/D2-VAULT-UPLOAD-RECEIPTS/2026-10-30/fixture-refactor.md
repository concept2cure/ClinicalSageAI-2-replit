# Existing Vault test fixture maintenance

D2 / W2, 2026-10-30. Applied after the approved `contract-review.md`, limited to
existing tests. No production, shared fixture module, new test suite, runner,
compiler or Git action was changed or executed by this worker or its child.

## What already exists

The tests already exercise the real `useVaultUpload` hook/transport and Vault
staging, manifest, check-in and document-opening lifecycles. Their positive
ingest replies often omitted fields always supplied by `vault-ingest.ts` and
`vault-ingest-types.ts`. Those replies are completed locally; the existing
transport fake and shared Vault fixtures are untouched.

## Fixture changes

- `useVaultUpload.test.tsx`: complete the existing success helper and individual
  201/200 replies with valid UUIDs, the exact program, stored title/version and
  consistent filing. The 200 replies retain full typed unchanged/changes/differs
  data. The missing-ID reply deliberately still omits ID while supplying the
  other required fields.
- `vaultUploadStaging.test.tsx`: complete only successful receipt bodies, keeping
  the explicit pending extraction value and each placed/unfiled outcome.
- `vaultUploadManifestPanel.test.tsx`: complete its existing success response
  from the request's title/folder, with explicit valid IDs and exact program.
- `vaultCheckInVersion.test.tsx`: complete the two assigned-version 201 receipts;
  version, conflict and check-in lifecycle assertions remain intact.
- `vaultOpensUploadedDocument.test.tsx`: complete the three positive receipts;
  its intentional missing-ID receipt remains invalid.
- `vaultUploadReview.test.tsx`, `vaultSurface.test.tsx` and
  `documentIntakeFormats.test.ts` have no successful ingest response fixtures
  requiring maintenance and remain unchanged.

## Intentional assertion updates

Only these expectations changed:

1. The hook's two already-recorded copy regexes now require the approved neutral
   `Already in the Vault with these bytes:` wording. Existing metadata/filing
   difference guidance and absence of auto-filing copy are still asserted.
2. The hook's mixed identity case no longer includes `no-id.pdf` in `succeeded`
   and additionally requires its unknown failure. Its recorded IDs remain an
   exact ordered array, now using the valid UUIDs returned by the completed
   positive fixtures instead of the old `doc-new`/`doc-held` placeholder IDs.
3. The existing missing-ID Vault-opening case awaits unknown status rather than
   stored status and requires no guessed uploaded row. Its original document
   remains open and the existing no-missing-target/no-navigation checks remain.

All other assertions, refusal/conflict/unknown inputs, upload progress, retry,
accessibility, manifest and multipart/authentication controls are preserved.
No invalid receipt was silently repaired into success. Files are frozen for
root's executed qualification; this note claims no test result.
