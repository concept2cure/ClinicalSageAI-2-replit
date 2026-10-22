# Independent integration review — 2026-10-14

Reviewed the current working tree on `concept2cure-v2`, concentrating on package-run selection and signing, exact notification destinations, task handoffs, and asynchronous navigation. This is scoped integration evidence; it does not qualify a deployed environment or live agency transport.

Four additional P2 defects were identified and repaired during this review:

| Trigger | Prior consequence | Current remedy |
| --- | --- | --- |
| Saved-run discovery failed; its retry button was clicked during signing or another pending package write | Discovery refresh cleared the modal and write fence | Retry is disabled while the ceremony/write is active; discovery refresh no longer resets interaction state |
| A pending notification target resolved after the actual shared signature modal opened | The modal did not register with the global ceremony channel, so navigation could replace its program/screen | The real `EsignModal` registers while open and releases its registration on close/unmount |
| An AnA navigation or operation was queued before a governed form opened | Live Drive checked launch access but did not recheck form ownership when the queued move applied | `V2App` refuses the move at application and reports the refusal to its original turn; an operation already running keeps its own result |
| An AnA navigation applied after the native editor became dirty | The move could publish another program without consulting the editor's unsaved-work guard | Navigation dispatches the existing cancellable `beforeunload` guard before changing program/screen; a fresh move works after explicit save |

The retry regression failed before its remedy. Actual mounted-shell tests failed before the Live Drive ceremony and dirty-editor remedies. Tests use the real shared signature modal, real `V2App`/queue, and real `RichSectionEditor`; stream, reauthentication, and persistence calls are controlled seams. The notification resolver tests execute its actual SQL and routes against PGlite. No live provider or agency calls are made.

Evidence:

- [Package discovery retry before remedy](independent-package-retry-red.txt).
- [Live Drive ceremony before remedy](independent-drive-ceremony-red.txt).
- [Live Drive native dirty editor before remedy](independent-drive-dirty-red.txt).
- [Package controls, shared ceremony, mounted shell, and native unsaved-work checks](independent-controls-final-green.txt): 42 tests across 4 files pass. Existing native editor tests emit nonfatal React `act` warnings.
- [Recipient-to-record resolver, task recovery, notification handoff, and Authoring leave decisions](independent-record-navigation-green.txt): 49 tests across 5 files pass; 3 overlap with the preceding run.
- [Exact Gateway, Submission Center sequence, and Authoring destinations](independent-exact-destinations-green.txt): 28 tests across 3 files pass. Together these runs cover 116 distinct tests in 11 files.
- [Scoped lint](independent-review-lint.txt): no errors; existing shell complexity/size warnings and a test-file size warning remain.

After these remedies, no additional confirmed P1/P2 was found within the reviewed package selection/signing and exact-record navigation paths. This statement covers the reviewed code and tests, not every repository subsystem.

Incomplete semantics remain explicit: first-study CSR generation still needs a verified adapter for clinical observations and study details; completed summaries are reusable inputs, not proof that raw tabulations exist. Unsupported legacy notification/resource references and the legacy filing-to-submission task bridge are refused instead of guessing an owning record. Those limits remain open in the remediation ledger. Live agency UAT and production configuration are outside this local integration proof.

Production changes from the initial UI review are confined to `client/src/concept2cure/v2/V2App.tsx`. The lead implemented the package retry and shared-modal registration remedies. Regression additions are in `ectdCompileContinuation.test.tsx`, `liveDriveShell.test.tsx`, and `notificationSharedSignature.test.tsx`. A subsequent compiled production boot investigation and CSR single-section source correction are documented separately in [production-boot-cycle.md](production-boot-cycle.md).
