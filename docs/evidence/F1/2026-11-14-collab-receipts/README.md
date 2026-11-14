# F1: verify collaboration message and optional task receipts — 2026-11-14

W1, launch D2; repair existing delivered-message honesty on canonical 0e6b15b10. The user confirms AnA works in their live Codespace. This local fixture's provider absence is not evidence about their Codespace; no provider or credentials work is in scope.

## What already exists

- `client/src/concept2cure/v2/surfaces/CollabLauncher.tsx` owns the existing QuickTask and Collaborate intake, one C2C projection and one modal. Published source5341d14cb guards exact UI visits, preserves same-account submitted chains and distinguishes unknown QuickTask acknowledgements using `acknowledgedTask`, `taskCreateRefused` and the shared `errorCodeOf`. The Collaborate branch still treats any HTTP success as a confirmed message without reading its receipt; its optional-task branch accepts any truthy taskId. Audit these existing branches; do not replace them.
- `server/routes/taskManagement.routes.ts` POST `/messages` persists a notification through `server/services/notifications/notification-service.ts` and returns `{success:true,data:{id}}` only after the write. Generic failures are500 and validation/recipient refusals are4xx. Its POST `/tasks` returns the saved task row; OUTCOME_UNKNOWN and AUDIT_WRITE_FAILED have existing explicit meanings. These backends and schemas stay unchanged.
- Existing `collabMessageReceipt.test.tsx` covers optional-task failure, lost acknowledgements and no automatic message resend. `collabIntakeLifetime.test.tsx`, `collabTaskOutcome.test.tsx`, `collabDirectoryContext.test.tsx`, `collabTaskOpenProject.test.tsx` and `collabAutoAssignHonesty.test.tsx` preserve accepted lifecycle/account/project/assignment behavior. Extend receipt regression coverage in the existing test file or a focused test split beside it.
- Canonical request errors and code extraction live in `client/src/lib/queryClient.ts` / `apiErrorCode.ts`. Existing persisted message identity is the numeric mdx_notifications.id from migrations/20260510_notifications_and_clinical.sql; notification-service.requiredNumber admits safe integers >=0. Validate that actual service contract rather than using the unrelated legacy shared notifications table, inventing an identity or a delivery service.
- Tasks and Communication already have standard rail entries. `TaskBoard.tsx`, `TaskTray.tsx`, `CommunicationCenter.tsx`, S12 project mapping and held agency/authoring screens remain untouched.

Discovery searched message/send/notification/task receipt names across launcher, tests, route, service, schema and migration paths, plus git deleted history. The only deleted same-name match is obsolete `client/src/services/taskManagementService.js` (46044c426); current route/service are live and retained. No deeper AGENTS.md exists under client/server/shared. F1 is open with paths ** and no approved addition is needed.

## Bounded proof

Two read-only/test-only audits split message acknowledgement and optional-task receipt contracts. Reproduce concrete failures with fictional responses before one source owner edits the existing launcher. Preserve RED snapshots and normal controls, then run focused/adjacent tests, controlled browser checks and normal canonical hooks. No real outbound message, provider call, route, service, screen, model or dependency is added.

## Confirmed baseline breaks

Message regression25 cases: fifteen failures and ten passing controls, including all seven prior cases and the service's valid numeric0 identity. Optional-task regression20 cases: eight failures and twelve controls. All run against unchanged launcher SHA-25612e7a47b6927224d218245e65e091d5c654fe05e093d20ac272feb0fbc4d53cd before source edits. They reproduce false sent confirmation, optional-task continuation without a receipt, malformed task projection, inconsistent returned audit rollback and lost unknown-code precedence. Controlled real-UI RED independently reproduces two failures with fictional API responses; no message/task mutation is forwarded.

The first implementation test run exposed an overbroad new assertion: “message was sent” also matched the honest question “Whether your message was sent is unknown.” That assertion was corrected, the exact original source was replayed, and the corrected test again produced fifteen failures/ten controls before restoring the exact implementation. Original RED, corrected RED and the first assertion-failure log are retained separately. No product change was made to accommodate the assertion.

## What already exists — discovered shell verification fixture

`client/src/concept2cure/v2/__tests__/shellChromeTruth.test.tsx` tests the existing header/rail/task launcher, but its complete authService module replacement exports only useAuth. The real launcher now needs the existing authService export; six tests fail before rendering. No coordination entry holds this test. `riskAndDialogA11y.test.tsx` also imports the launcher and passes. Repair only the shell test mock by retaining actual exports and its existing useAuth override, as the adjacent auth fixtures already do. Prove the same six failures against the unmodified canonical source before changing the test; production authentication and shell code stay unchanged.

## Completion and verification

Existing launcher repaired in place. A message needs an actual service-valid notification receipt before it is marked sent or its optional task is attempted. Malformed/truncated/contradictory responses remain unknown; the draft stays visible and cannot automatically resend. The task half reuses the same task receipt/refusal checks as QuickTask, with no fabricated task row or lost confirmed-message state. The new body await rechecks the existing account owner while accepting ordinary bearer refresh. No task project mapping, UI visit guard, backend or provider configuration changes.

Final focused/adjacent97/97 across seven suites, plus23/23 shell/accessibility across two distinct suites. `verification.json` records final source/test hashes; `green.txt.gz` and `shell-and-accessibility-green.txt.gz` retain logs. Lint has no errors or warning growth; launcher retains eight existing warnings, receipt tests/browser runner have zero warnings. Independent functional review approves the bounded patch. Shell fixture correction retains real module exports and changes no production authentication behavior.

The actual local browser independently reruns both failing scenarios GREEN on the final functional source: an invalid message receipt performs one message request and zero task requests; an invalid optional-task receipt preserves the confirmed message with one request of each type. Both hold unknown state, block repeats and project zero task rows. No page errors. Directory/message/task responses are intercepted and other mutations/external network requests blocked. This proves client acknowledgement/admission behavior, not persistence of those synthetic responses or backend exactly-once delivery. The real backend contract is read, unchanged.

The user reports AnA working in their running Codespace. This repair does not alter that provider setup or claim this private local fixture represents it. There are no provider calls, real message/task writes, hosted-Codespace changes or clinical qualification claims. Publication uses the sole canonical branch with all normal lint/typecheck hooks; local app is stopped during those checks and restarted at the accepted commit.

## Canonical integration

Source1d63157ca passed all89 normal CI lint gates and the full compiler (zero errors). The first push lost a remote-ref race; its actual gate/refusal log is retained. Latest canonical3692f44ad adds disjoint CSR writing, peer/gateway and Quality audit-task repairs, with no client/config/package changes against this work's base. Normal merge preserves them and both journal entries. Frozen launcher/receipt-test hashes remain exact after merge. The retry runs all normal hooks on the integrated tree; no source fix or gate bypass is needed.
