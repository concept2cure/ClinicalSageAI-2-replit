# W1 / D2 — expand ownership to connected Account reads and workspace selection

## What already exists

- `client/src/concept2cure/v2/reportingPersona.ts`: canonical identity-scoped query cache and catalog personalization; preserves explicit filters. Its query uses ambient credentials and does not consume query cancellation or reject a replaced bearer after decoding.
- `client/src/concept2cure/v2/OrganizationSwitcher.tsx`: Account membership selector and explicit session-rotation ceremony. Existing unsaved-work reservation, verified token adoption, spent-session recovery and replacement-login preservation remain owners. Membership GET uses an ambient generic hook; rotation POST also uses ambient credentials after checking only the auth-user snapshot.
- `client/src/utils/authToken.ts`: canonical captured-actor headers validate bearer claims against numeric user/organization, then pin headers. Server verifies actual authority.
- `client/src/lib/queryClient.ts` and `dataConnect.tsx`: canonical transport, redaction, scoped cache and guarded `liveGetOrNull` with optional captured headers.
- `AccountOnboardingSettings.tsx` and `NotificationPreferences.tsx`: existing personal setup/alert owners already pin their request credentials and suppress stale saves. No replacement UI or cache is needed.
- `surfaces/company-documents/companySession.ts`: existing canonical company-session and visit leases, including revision guards and unmount retirement. Preserve this owner and test the existing Account entry.
- `switchOrganization.ts` and `OrganizationAccess.tsx`: separate existing organization-invitations entry and rotation helper. They are identified for further reconciliation; this bounded expansion does not claim to audit every organization-access door.
- AuthService session adoption and server select-organization endpoint remain the authority for minted replacement sessions; this work must preserve the existing rotation ceremony and never automatically retry it.

Searches: persona/reporting-role/catalog/cache, organization membership/select/switch routes and consumers, captured headers and company-session leases. Deletion history searched for `*report*Persona*` and `*OrganizationSwitch*`; no replacement for these active owners was found. The accepted client-journey IA retains Account and organization administration in their existing homes.

## Design

Extend the canonical persona query to pin actor headers, consume query cancellation, and recheck bearer/account ownership after transport and JSON decoding before returning cacheable data. Keep cache keys and explicit user filters. Extend Account's existing membership reader with a bounded captured-owner lifecycle and explicit error states; pass pinned source-account headers to its existing rotation POST. Keep session adoption, unsaved-work reservations and replacement-session protection unchanged. No new navigation, backend contract, schema, dependency or security baseline.

## Verification

- `safety-red.txt` and full compressed log: seven negative checks fail against the original owners, with three existing positive paths passing. `cache-red.txt` separately proves the retained-cache display defect before its render-time fix.
- `regressions.txt`: all 126 checks across 11 suites pass. Includes reporting defaults/explicit overrides, Account cache integration, real AuthService verified session adoption, dirty-editor reservation and unrelated replacement-sign-in protection, prior Account ownership and alert guards, plus existing company-session boundaries and capability-controlled Account entry.
- The organization-switch test source token is now a synthetic JWT with the expected source actor claims; destination-session verification still uses the actual AuthService probe. The reporting integration test asserts the pinned source headers.
- `build.txt`: production client/server/audit verifier build passes, with existing chunk warnings. `lint.txt`: no errors or warnings in changed TypeScript files. The first full-program typecheck identified five instances of the required `DataState.empty` field missing from the new membership read states. These are corrected: loading/errors are not empty, and only a successful zero-membership reply is empty. `prepush.txt` records the corrected full-program zero-error typecheck and all normal gates passing on published implementation `b3a46cdf7f4522a898ffb7fe9035a5a6a0639d06`; no baseline was widened.
- `browser-check.json` and four screenshots: twelve normal/late-profile/late-membership flows across 1440px/390px in light/dark. Actual Account owners, persona query, canonical transport/cache and captured headers. Normal Account saves update the shared cache. Source headers match on reads and writes. A stale source cannot rotate, late reads are withheld, and there are no page errors or overflow. Synthetic auth adapter, JWTs and replies are explicit seams. A deliberate 403 tests workspace refusal; actual credential adoption is proved in the AuthService regression suite. This is not hosted-authentication evidence.
- The initial browser refusal seam omitted JSON content type, so the canonical transport correctly rendered its generic 403 message. Correcting the harness header resolved that expectation failure without product changes.

Remaining: normal publication gates and hosted CI/security/browser/staging verdicts. Company-session leases remain their existing owner. The separate OrganizationAccess/switchOrganization path is identified, not declared fully reconciled by this batch. No backend scope, schema, dependency or navigation change.

## Shared-branch integration

Merged upstream `8d26d9127` into the implementation at `91506b8e0` without conflicts. Incoming project-creation retirement and its ownership gate do not overlap these Account/reporting owners; `package.json` only adds CI script entries. `merged-regressions.txt` repeats all 126 tests successfully, `merged-build.txt` passes all production targets, and refreshed browser artifacts repeat all twelve flows on the merged source. `corrected-controls.txt` records the 65 focused checks after the DataState field correction. The subsequent normal push gates passed, including the full zero-error typecheck.
