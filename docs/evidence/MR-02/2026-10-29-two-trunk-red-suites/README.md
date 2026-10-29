# Trunk green: two suites red on trunk, fixed where each now stands (2026-10-29)

Found while running the QMS regression for the periodic-review reminders (`../../MR-12/2026-10-29-periodic-review-reminders/`). Both fail on trunk `86473731a` with no change applied (`01-red.txt`). Neither is a product defect. Each test had not followed a deliberate change to the code it measures.

## `client/src/concept2cure/quality/__tests__/ControlledDocumentWorkbench.integration.test.tsx` (3 of 3)

- **Since `a85d6885d`** (2026-10-26, mixed manual and AnA document assembly), the editor reads its editing copy in the program's scope: `/api/authoring/docs/:id?programId=…` and `/sections?programId=…`.
- The other workbench suites were updated then (`workbenchAssemblyBuild.testSupport.ts` `SECTIONS_READ`). This one was not.
- Its mock answered only the unscoped URLs. Neither read was served, so the editor never mounted: no textbox, no read-only decision, and no canvas.
- **Fixed:** the mock answers the program-scoped URLs, exactly. An unscoped read of a controlled document's copy is no longer served, so the suite now holds the contract rather than ignoring it.

## `server/services/part11/__tests__/one-signing-authority-policy.test.ts` (1 of 5)

- The P-27 policy names every file that may call `isSigningAuthorized` outside the gate, each with a reason.
- The document's act gates (`roleGates`: what the editor offers, with the role named) moved from `server/routes/authoring.router.ts`, which now calls it 0 times, into `server/services/authoring/authoring-document-read.ts`.
- The allowance did not move with them.
- **Fixed:** the allowance moves to the file that holds the call, for the same displayed purpose. The signing routes still refuse through `checkSigningAuthority`. No call was added.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Trunk, no change: 4 of 8 fail across the two suites. |
| `02-green.txt` | With the two test-contract fixes: 8 of 8. |
