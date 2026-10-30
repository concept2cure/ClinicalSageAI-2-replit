# Vault UI fixture synchronization

Root's first green cohort reported 93 passing cases and one failure in the new Vault UI suite's deliberate check-in retry. The retained document and its new version share the same title. The helper's title wait could therefore finish while the previous version was still selected, before the refreshed row's asynchronous selection completed. Root and the independent reviewer identified this fixture timing issue.

Root authorized one synchronization change in `vaultUploadReceiptFlow.test.tsx`: wrap the existing exact `data-on=true` selected-row assertion in `waitFor`. The title expectation, UUID-specific versions request, missing-target assertion, new-version text, removed check-in offer, retained File identity and exact read counts remain unchanged. The five test cases and all production code remain unchanged by this correction.

The test author ran no tests, compiler, browser or Git commands. Root owns rerunning the suite and complete cohort; this note claims no new execution result.
