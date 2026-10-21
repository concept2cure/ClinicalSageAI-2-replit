# Legal workflow verification

## What already exists

The company profile writer (`server/services/company-documents/profile.ts`),
Vault approval and affected-filing readers (`server/services/vault/vault-lifecycle.ts`
and `vault-where-used.ts`), native task sweep and notification service, regional
Module 1 requirements, and canonical submission placement/readiness/assembly
already own these capabilities. Legal lifecycle and requirement checks extend
those paths; library registration alone supplies no approval or agency verdict.
Their focused regressions below exercise those real boundaries.

The existing shared `VaultVersionPicker` in
`client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` now serves company
settings and `surfaces/company-documents/LegalLifecycleEditor.tsx`. The duplicate
`CompanyVaultPicker.tsx` was removed. `companyDocumentReviewTools.test.tsx` retains
retry/pagination coverage on the shared picker; `companyLegalWorkflows.test.tsx`
checks that lifecycle evidence is scoped to the admitted document's program.

## Verification after merging 443 upstream commits

On 2026-10-21, against the resolved working merge of
`8d688686532d676067e8d199010966a5633c10ff` and
`30afd3bd17a90c8de4a44098354d9de3a34cb4bc`,
`post443-native-tests.txt` records **65 passing tests in eight files**. This
fresh run covers legal readiness and saved review identity, lifecycle/evidence
composition, native renewal tasks/notifications, actual saved-requirement
readiness and assembly gates, copied-original ancestry, base Vault validity,
and canonical cross-project and duplicate-placement checks. No production
change or gate mock was made for this verification. Command:

```sh
npx vitest run \
  server/services/company-documents/__tests__/legal-readiness.test.ts \
  server/services/company-documents/__tests__/legal-workflow.test.ts \
  server/services/company-documents/__tests__/legal-renewal.pglite.test.ts \
  server/services/ectd/__tests__/company-legal-requirements.pglite.test.ts \
  server/services/vault/__tests__/company-legal-copy-lineage.pglite.test.ts \
  server/services/vault/__tests__/company-legal-validity.test.ts \
  server/services/submission-service/__tests__/leaf-cross-project.pglite.test.ts \
  server/services/submission-service/__tests__/leaf-section-occupancy.pglite.test.ts \
  --maxWorkers=1
```

After the shared Vault picker owner froze its source,
`post443-ui-tests.txt` records **11 passing tests in two files**:
`companyLegalWorkflows.test.tsx` and `companyDocumentReviewTools.test.tsx`.
These retain explicit revocation, external-evidence wording, null-review display,
filing-bound mapping and stale-filing response refusal, scoped exact-version
selection, accessible letterhead review, real inventory paging/failure recovery,
and same-query retry plus offset paging on the canonical `VaultVersionPicker`.
Command: `npx vitest run client/src/concept2cure/v2/__tests__/companyLegalWorkflows.test.tsx client/src/concept2cure/v2/__tests__/companyDocumentReviewTools.test.tsx --maxWorkers=1`.

## Verification before the upstream merge

Run on 2026-10-18 with Node v22.23.3, against source commit
`5ebfcfd2c595f44eef79917ec199724082338e69`.

- `final-tests.txt`: **164 tests passed in 16 files**. Includes reachable React
  lifecycle/checklist/paged-selector tests, legal review/authority/signature
  evidence, native renewal SQL, saved requirement readiness/assembly enforcement,
  native copied-original lineage, existing Vault validity and withdrawal paths.
  Command: `npx vitest run <the 16 file paths listed below> --maxWorkers=1` after
  sourcing `/workspace/.cloud-setup/activate.sh`.
- `native-lineage-and-withdrawal-tests.txt`: **36 tests passed in three files**,
  including all 14 new native SQL lineage cases, six existing Vault validity
  cases and 16 existing withdrawal cases. The withdrawal fixture records empty
  company settings; it does not bypass the new gate.
- `placement-fixtures.txt`: **14 tests passed in two files** after applying the
  actual legal-registry migration in the existing cross-project and section
  occupancy fixtures. These exercise the native placement gate, including its
  real registry and audit reads. This follow-up changes test fixtures only.
- `null-review-tests.txt`: **32 tests passed in four files** after representing
  unreviewed regional suggestions with null reviewer/time. Regressions verify
  that these remain unresolved, the UI renders the absence explicitly, and a
  saved review records the actual actor and exact server time.
  `null-review-lint.json` records zero warnings/errors across all six changed
  files; `null-review-identity-gate.txt` records the passing fabricated-identity
  gate with no scanner or baseline changes.
- `new-code-lint.json`: **zero errors and zero warnings** across 14 new legal
  module/UI/shared/test files. Existing large legacy files retain their existing
  max-lines/function complexity warnings; no lint suppressions were added.
- `saved-requirements-bypass-redproof.txt`: intentional **failing** test-only
  mutation. `C2C_COMPANY_REQUIREMENTS_REDPROOF=1` bypasses only the new saved
  requirement helper in the test module. The missing-companion regression fails
  at `expected [] to have a length of 1`, demonstrating that removal of this
  canonical gate is detected. No production code or runtime configuration was
  changed for the mutation.

The 16 final files:

```text
client/src/concept2cure/v2/__tests__/companyLegalWorkflows.test.tsx
server/services/company-documents/__tests__/legal-readiness.test.ts
server/services/company-documents/__tests__/legal-renewal.pglite.test.ts
server/services/company-documents/__tests__/legal-workflow.test.ts
server/services/ectd/__tests__/assemble-from-core.audit-outcome.pglite.test.ts
server/services/ectd/__tests__/assemble-from-core.bundle-root.pglite.test.ts
server/services/ectd/__tests__/assemble-from-core.multisource.test.ts
server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts
server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts
server/services/ectd/__tests__/assess-dispatch-readiness.ind-program.pglite.test.ts
server/services/ectd/__tests__/assess-dispatch-readiness.original-ind-module3.pglite.test.ts
server/services/ectd/__tests__/assess-dispatch-readiness.vault-leaf.pglite.test.ts
server/services/ectd/__tests__/company-legal-requirements.pglite.test.ts
server/services/vault/__tests__/company-legal-copy-lineage.pglite.test.ts
server/services/vault/__tests__/company-legal-validity.test.ts
server/services/ectd/__tests__/withdrawal-approval-binding.pglite.test.ts
```

The lineage suite verifies explicit source→copy revocation through canonical
placement and transmission, multiple generations, the unregistered-copy state
after a partial registration response, source invalidity, independent approval,
equal-byte independence, missing/foreign/drifted ancestry, conflicts and cycles,
private-safe refusals, legacy provenance and audit read failure. Public DTO
redaction and immutable registration guards have separate canonical profile and
registry regressions owned by the database integration work.
