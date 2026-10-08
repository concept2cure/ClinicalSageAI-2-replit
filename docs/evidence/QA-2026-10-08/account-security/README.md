# P-25 follow-ups: account security (QA 2026-10-08)

**Decisions:** the four "Follow-up decisions on P-25" in `docs/LAUNCH_DEFINITION_OF_DONE.md` that change code. The
fifth (a person's name stays read-only) needed no change.
**Row:** D6, Security posture. This evidence does not turn D6 green. It closes four findings from the account panel
(`e6fbacf33`, `docs/evidence/QA-2026-10-08/account-panel/`).
**State:** built and tested, red then green. Not committed.

| # | Decision | Red | Green |
|---|---|---|---|
| 1 | `GET /session` names no organisation it cannot read | `01`, `02` | `03` |
| 2 | In production a signer with no authenticator is refused (ADR-0014 P1-2b) | `10`, `17` | `11`, `18`, mutations `12` |
| 3 | Wrong codes at `/mfa/enable` and `/mfa/disable` count per account | `06`, `07` | `08`, mutation `09` |
| 4 | `authService.updateProfile` is removed | `04` | `05` |

Gates, types and lint: `13-gates-and-tsc.txt`, `14-lint.txt`. Wider regression run: `15-regression.txt`. DB suites on
the fresh CI-shaped database: `16-db-suites.txt`. Every touched suite together on the final tree: `19` (13 files, 231
of 231).

| Run | Result |
|---|---|
| Every auth, MFA, e-signature, part11 and signing test file (`15`, 615 files) | 7,865 passed, 52 failed in the first run. 43 were this change (the transmit fixture, corrected, now 46 of 46). The other 9 were two other sessions' in-flight edits; those files pass on the current tree (125 of 125). |
| Sixteen DB suites on `concept2cure-ri_qa_fresh2`, RLS on (`16`) | 229 passed. `sign-in-posture` failed its setup on organisation 92100, which `account-standing` also uses; alone it passes 8 of 8. |
| `ci:sign-ceremony` (and its selftest) | OK, 20 baselined sites as baselined; selftest 19 passed. |
| `ci:untracked-imports` | Checks committed changes only, so nothing here. `--all`, with this change's new files in a temporary index: the same 15 pre-existing findings as without them. |
| Scoped `tsc` (25 files) | No diagnostic in a changed source file. A removed `AUTHENTICATOR_REQUIRED` mapping is reported as TS2741. |
| ESLint | No changed file has more warnings than at HEAD. |

## 1. No invented organisation

**Cause.** `GET /session` started from `let orgName = 'Concept2Cure'` and kept it when the token named no organisation
or the `organizations` row was missing. `/me`, `/mfa/verify` and the two development sign-in paths did the same with
`'Organization'`. The account panel printed the answer as the person's organisation.

**Fix.** One helper in `server/routes/auth.ts`, `recordedOrganizationName(id)`, answers the recorded name or `null`
(no id, no row, or a blank name). `/session`, `/me` and `/mfa/verify` use it; the two development paths answer
`organization?.name?.trim() || null`. A failed read still throws to the route's 500: it is not a missing name.
`AuthUser.organizationName` is now `string | null`.

**Client readers.** Every reader of the field was checked (`grep -rn organizationName client/src`, and the shell):

| Reader | Empty case |
|---|---|
| `AccountPanel.tsx` Profile | Already printed "None on this session" for an empty value. Pinned by a new test; it was green from the start. |
| `authService.setAuth` / `loadStoredAuth` | Write `currentOrganizationName` and `activeOrgSlug` only when the name is truthy. Nothing in `client/src` reads either key. Unchanged. |
| `Shell.tsx` TopBar | Reads `useTenant().currentOrganization.name` (from `/api/tenants`, not `/session`), and fell back to the word **"Organization"** with an "OR" mark. **Changed:** with no name, no organisation chip is drawn. |

**Tests.** `server/routes/__tests__/auth-session-roles.test.ts`: four new cases red (no organisation on the token,
missing row, blank name, `/me` with a missing row), then green, plus a control that the recorded name is answered as
it is. `shellChromeTruth.test.tsx`: the top bar with no organisation, red then green. `accountPanel.test.tsx`: a
session with `organizationName: null` shows "None on this session".

## 2. ADR-0014 P1-2b: an authenticator to sign, in production

**The one place.** Every signing ceremony re-verifies its signer through `reverifySigner`
(`server/services/part11/reverify-signer.ts`), directly or through `verifyReauth` (`server/routes/c2c/actions.ts`),
which wraps it. The rule lives there and nowhere else.

**"Production", fail closed (round 2, the lead's decision 6).** `signerNeedsAuthenticator()` enforces the rule
everywhere except an explicitly declared `development` or `test` `NODE_ENV`, read at each signature: an unset, blank,
misspelled, `staging` or `production` value enforces it. That is the submission bundle guard's rule
(`bundleTrustEnforced`, `server/services/submission-gateways/bundle-namespace.ts`). No new environment variable. The
vitest setups declare `test` (`tests/setup.ts` line 19 and its `beforeAll`; `tests/setup.db.ts` line 71), and the QA
harness requires `development` (`tests/validation/lib/harness.mjs`). Round 1 used `isProductionEnv`
(`NODE_ENV=production` only); `20` → `21` records the change.

**Fix.** Once the password has verified, a signer whose enrolment reads "none" is refused in production:
`403 AUTHENTICATOR_REQUIRED`, "Enrol an authenticator in Account to sign. Nothing was signed." The refusal:

- comes after the password, so it tells someone without the password nothing about the account;
- is not counted against the account (a missing enrolment is not a guess);
- comes before any code is read and before any caller opens a transaction;
- leaves "enrolment unreadable" as it was (`MFA_STATE_UNKNOWN`, fail closed).

The wrappers carry it: `verifyReauth` maps it to `REAUTH_AUTHENTICATOR_REQUIRED`; the domain ceremony
(`governed-signature-ceremony.ts`) words it with the same exported constant; `governed-signed-act.ts` stopped
appending a second "Nothing was signed." to a refusal that already says it.

**Tests (red → green).**

| File | Cases |
|---|---|
| `server/services/part11/__tests__/reverify-signer.test.ts` | Production + no authenticator: refused with the exact body, no code checked, nothing counted. A code sent anyway does not stand in. A wrong password is still a counted wrong password. Production + authenticator: `MFA_TOKEN_REQUIRED` without a code, signs with one. Unreadable enrolment stays `MFA_STATE_UNKNOWN`. Development, test, staging: unchanged. |
| `server/routes/c2c/__tests__/reauth-second-factor.test.ts` | `verifyReauth` in production: `REAUTH_AUTHENTICATOR_REQUIRED`; control in test. |
| `server/routes/__tests__/esignature-sign.test.ts` | `POST /api/esignature/sign` in production: 403 with the exact body, no transaction opened, no audit row; with an authenticator, `MFA_TOKEN_REQUIRED`; control in test: 201. |
| `server/routes/__tests__/protocol-signatures.routes.test.ts` | The domain ceremony names the refusal in the decided words and writes nothing. |
| `tests/db/signer-authenticator-required.dbtest.ts` (new) | On the fresh CI-shaped database, through the real auth gate and `governed-signed-act.ts` (biosketch finalize), runtime role under RLS. Production + no authenticator: 403, no `electronic_signatures` row, no ledger row, record still draft, failure count 0. Production + authenticator, no code: 400, nothing written. Production + authenticator + current code: 201, the row says `password+mfa`, second factor verified. Test environment + no authenticator: 201, `password`. |

At HEAD the DB test's production case signed: 201 and a signature row, with the password alone (`10-…-red.txt`).

**Two clients that would have misread it (`17` → `18`).** The protocol workspace's write layer
(`ProtocolDevWrites.ts`) turned every 401 `REAUTH_*` that was not about the code into "the password was not accepted",
which would be false here: the password was right. It now shows the server's sentence for
`REAUTH_AUTHENTICATOR_REQUIRED` ("Couldn't finalize the protocol — Enrol an authenticator in Account to sign. Nothing
was signed."). The eSTAR filing's `describeFilingRefusal` fell through to "Check the eSTAR you selected"; it now says
"Enrol an authenticator in Account to sign. Nothing was filed and nothing was signed." The Submission Center's own
handling was not touched: another fixer has that file open.

**Mutations (`12`).** The rule moved ahead of the password check: the wrong-password case and the unreadable-enrolment
case fail. The signed-act route appending unconditionally, as at HEAD: the DB test fails on the doubled sentence. Both
files were restored byte-identical.

**One fixture changed for the rule.** `tests/mdx-submission-gateway-transmit-bundle-guard.test.ts` runs the transmit
route under `NODE_ENV=production` to prove that "a fully re-authenticated caller still cannot steer the bytes". Its
operator had no authenticator, so after the change all 43 of its re-authenticated cases stopped at re-authentication
(401 `REAUTH_AUTHENTICATOR_REQUIRED`) and never reached the bundle guard. In production a fully re-authenticated
operator now has an authenticator and sends its code, so the fixture says so (`isMfaEnabled: true`,
`reauth.totp`). 46 of 46 pass. The submission-center fixer owns that area; the edit is the fixture alone.

### Every signing route, and how it reaches `reverifySigner`

Signature-row writers (`persistElectronicSignature`, `persistGovernedSignSignature`, `persistGovernedActionSignature`,
`insertAuthoringSignature`, the raw `INSERT INTO electronic_signatures` / `authoring_signatures`) were listed with
`grep`, and `npm run ci:sign-ceremony:list` lists the ledger `sign` sites. Each route that writes one re-verifies here:

| Route or act | File | Path to the ceremony |
|---|---|---|
| `POST /api/esignature/sign` | `server/routes/esignature.ts` | `reverifySigner` |
| Authoring sign and approval | `server/routes/authoring.router.ts` (`reverifyAuthoringSigner`) | `reverifySigner` |
| Research-administration signed acts: biosketch, grants (3), IRB, IACUC, IBC, committees, coverage analysis, DMSP, effort certification, export control, other support, protocol consent, protocol deviations, research agreements, RIM, BLA workbench, audit/compliance reviews | `server/routes/governed-signed-act.ts` | `reverifySigner` |
| Submission release signature | `server/routes/submission-sign-release.ts` | `reverifySigner` |
| Regulatory document lifecycle (`/api/regulatory/documents`) | `server/routes/document-lifecycle.ts` | `reverifySigner` (production mounts the default; only tests inject) |
| QMS document and change approval | `server/routes/mdx-qms.ts` | `reverifySigner` |
| PCCP approval | `server/routes/pccp.ts` | `reverifySigner` |
| RBM approvals (2) | `server/routes/mdx-rbm.ts` | `reverifySigner` (no signature row: baselined as a known gap) |
| Submission chat apply-rewrite, signed | `server/routes/ana-features.ts` | `reverifySigner` |
| AnA e-signature-tier commands, incl. the FDA ESG transmit | `server/routes/ana-ri/governed-esignature.ts`, then `governed-command-signature.ts` | `reverifySigner` |
| Seal a verified version | `server/routes/ana-ri/seal-verified.ts` | `reverifySigner` |
| Task sign-off | `server/services/tasking/task-signoff.ts` | `reverifySigner` |
| `POST /api/c2c/actions/sign` and the other high-risk commands | `server/routes/c2c/actions.ts` | `verifyReauth` → `reverifySigner` |
| Artifact status with a signed meaning; document lock | `server/routes/c2c/artifacts.ts`, `server/routes/c2c/documents.ts` | `verifyReauth` |
| CMC batch release, specification approval, register qualification, Module 3 approval | `server/api/cmc/*.ts` | `verifyReauth` |
| Financial disclosure certification | `server/routes/financial-disclosures.ts` | `verifyReauth` |
| 510(k) eSTAR filing | `server/routes/510k-estar-routes.ts` | `verifyReauth` |
| Gateway transmit, rollback, technical rejection | `server/routes/mdx-submission-gateway.ts` | `verifyReauth` |
| Protocol finalize and reviewer disposition; report finalize | `governed-signature-ceremony.ts` (from `protocol-signature.ts`, `report-os.ts`) | `verifyReauth` |
| Gateway credential change (not a signature) | `server/routes/gateway-accounts.ts` | `verifyReauth`, so it is covered too |

**Not through the ceremony** (a sweep of every `approve|sign|seal|finaliz|release` route that names neither
`reverifySigner` nor `verifyReauth`). None writes a signature row; each is a route-level decision, not a small change,
because its request carries no credential:

- `POST /api/biostat/sap/:sapVersionId/sign` (`biostatPlatform.ts` → `collaborative-sap-service.signVersion`) stores
  `approvedBy`, `approvedAt`, status `approved` and a **client-supplied** `signatureId` and `method`, with no
  re-verification. It is a signature by its own name. No client caller was found; biostatistics is outside the launch
  catalog. `ci:sign-ceremony` does not see it (Drizzle `.set({ approvedBy })`).
- `POST /api/approval-workflows/:id/approve` (`ApprovalOrchestrator.processApproval`) marks a workflow step approved
  with no ceremony. Its client hook (`useApproveWorkflow`) has no caller.
- Approvals that write no signature and claim none: AI swarm HITL approve, evidence review approve, IVDR claim approve
  and import approve (both already baselined), module-integration approve-step, translation segment approve, HAQ answer
  approve, operating-system assumption and decision approve, and the intelligent-report seal (an integrity seal with a
  justification). `POST /api/audit/signatures` records only an "unverified" marker and refuses "signed";
  `POST /api/grdhe/signatures` answers 410.

## 3. Wrong codes at enrolment count per account

**Cause.** `/mfa/enable` and `/mfa/disable`, on both routers (`/api/auth`, `/api/v1/auth`, and
`/api/auth/enterprise`), had no per-account limiter. Only the per-address failure bucket applied.

**Fix.** The existing limiter, reused (`server/middleware/sign-in-limits.ts`). `signInLimits.secondFactor` and the new
`signInLimits.authenticatorChange` are two doors onto **one** `express-rate-limit` instance, so one account has one
allowance of wrong codes (`SIGN_IN_LIMITS.mfaFailuresPerAccount`, 10 per 15 minutes) whichever door they are typed at.
Each door names the account it counts against:

- `/mfa/verify` and the enterprise `/verify-mfa`: the account the verified challenge names (unchanged);
- the four enrolment doors: the account the request's access token names (`sessionAccountKey`: signature and token
  class verified), and never anything in the body.

**Tests.** `auth-sign-in-limits.test.ts`: wrong codes at `/mfa/enable` and at `/mfa/disable` are refused 429 past the
limit while the next account is not; guesses at `/mfa/verify` and `/mfa/disable` are one count; a session that names
other accounts' challenges in the body is still counted against itself; a right code costs nothing (a control, green
before and after). `authEnterprise-second-factor-lockout.test.ts`: the same for the enterprise doors, each request from
a new address. Red: 4 of 5 new cases (`06`), and the 2 enterprise cases with the limiter taken off those doors (`07`).

**Mutation (`09`).** With the enrolment doors keyed by the body's challenge first, exactly the "whatever challenge the
body names" case fails: a session could move its guesses onto other accounts.

**Round 2.** The enterprise router's enrolment doors were deleted (decision 4 below), and their limiter cases with them
(`07` is the record of round 1). The count now stands on the two remaining enrolment doors, `/api/auth/mfa/enable` and
`/disable` (also mounted at `/api/v1/auth`).

## 4. `authService.updateProfile` removed

It called `PATCH /api/v1/auth/profile`, which the auth router does not serve, and nothing called it
(`grep -rn updateProfile client/src server shared tests` found only its definition). It is not a user-facing capability,
so no replacement is owed. A new contract test, `client/src/services/portal/__tests__/authService-routes-exist.test.ts`,
reads both files. Every `this.api.<verb>(`${this.baseUrl}/…`)` call in the client must be a route registered on
`server/routes/auth.ts`, and the extraction must find every `this.api` call, so a call in an unreadable shape fails
rather than being skipped. Red: `PATCH /profile` (`04`). Green after the removal (`05`). `ApiClient.patch` (private) now
has no caller; `put` and `delete` had none before. They are left in place.

## Round 2 (the lead's decisions of 2026-10-08)

The lead accepted decision 2 (every `verifyReauth` caller is covered; ADR-0014 §4 includes administrators) and deferred
decision 3 (status codes). Four more, each red first:

| # | Decision | Red | Green |
|---|---|---|---|
| 6 | An unset or unknown `NODE_ENV` enforces the rule | `20` | `21` |
| 1 | The server states the signing posture; the dialog and the panel use it | `22`, `24` | `23`, `25` |
| 4 | The enterprise MFA enrolment duplicate is deleted | `26` | `27` |
| 5 | The SAP sign route and the workflow approve route are removed | `28` | `29` |

Callers, history, reachability and gates for 4 and 5: `30`. Lint, types and untracked imports: `31`. Every touched
suite and the DB suites on the final tree: `32` (93 files, 985 of 985; DB 232 of 232 plus `account-standing` 13 of 13).
The wide regression set again: `33` (647 files, 8,191 passed, 0 failed).

**6. Fail closed.** See "Production" above. `reverify-signer.test.ts` now pins both sides: `development`, `test` and
`" Test "` relax the rule; `staging`, `""`, `"   "`, `prod`, `Production` and an unset `NODE_ENV` enforce it.

**1. The posture, stated by the server.**
- `signingPostureOf(account)` in `reverify-signer.ts`, beside the rule, answers
  `{ authenticatorRequired, authenticatorEnrolled }`. It uses `signerNeedsAuthenticator()` and `users.mfa_enabled`, the
  column the ceremony's `isMfaEnabled` reads.
- `/session`, `/me`, `/mfa/verify` and the two development sign-in answers carry it as `signing`.
- **The canonical dialog** is `client/src/concept2cure/_shared/components/EsignModal.tsx`, the shared Part 11 modal
  (13 importers). When it opens it reads the posture (`client/src/concept2cure/_shared/signingPosture.ts`, a plain
  `GET /api/v1/auth/session`). Where one is required and none is enrolled, it shows the target, "Enrol an authenticator
  in Account to sign." and a Close button that takes focus, with no reason, meaning or password field. When the read
  fails or says nothing, the dialog is as before, and the server's refusal stands.
- It reads `/session` itself rather than the AuthProvider's user: about 60 test files mock `authService` without
  `useAuthUser`, and a hook call in the modal would throw in every tree that mounts it.
- **The account panel** shows "Removing it stops you signing." beside the removal form when the server says signing
  needs an authenticator. The new `RemoveForm` component keeps `AuthenticatorSection` under the complexity limit.
- **Signing UIs that do not go through `EsignModal`**, which still learn of the rule only from the server's refusal:
  `components/ana/GovernedActionSignoff.tsx` (AnA governed actions), `v2/surfaces/RbmSurfaces.tsx` (RBM approval
  modal), `mdx/surfaces/pathway/PathwayPanes.tsx` (`ApprovalCard`, through `useElectronicSignature`),
  `mdx/surfaces/EstarFilingPanel.tsx` (eSTAR filing), and the `C2CForm` password fields in `cmcRegisterForms.ts`,
  `CmcModule.tsx` and `GatewayTransmittals.tsx`.

**4. One MFA enrolment implementation.**
- Deleted: `POST /api/auth/enterprise/mfa/{setup,enable,disable}`, with `mfaEnableSchema`, `mfaDisableSchema` and
  `extractJwtUser`, which nothing else used.
- No caller anywhere (`30`). The only mentions were tests, a recorded evidence file, and a fixture string the
  db-test-isolation gate's parser is tested on.
- **Replacement:** `POST /api/auth/mfa/{setup,enable,disable}` (and `/api/v1/auth/mfa/*`, `server/routes/auth.ts`),
  called by `authService.setupMfa`, `enableMfa` and `disableMfa` from the account panel.
- Tests:
  - `authSurfaceSecurity.test.ts`: the three enterprise doors answer 404; the canonical doors' partial-token refusals
    stay.
  - `sign-in-posture.dbtest.ts`: the enterprise door is gone and the enrolled secret untouched. F-26 stays pinned on the
    canonical door by `second-factor-binding.dbtest.ts`.
  - My round-1 enterprise-door limiter cases were removed, and that file is back to HEAD.

**5. Two unsigned approvals removed.**
- **History** (`git log --all --diff-filter=D`, `30`): one deleted file, the Communication Center's Approvals surface
  (`2895218b8`, 2026-08-04). It called `useApproveWorkflow` behind `EsignModal`, a client-side password check with no
  server ceremony. Nothing has reached the route since.
- **Reachability:** no surface reaches either route. `PathwayPanes` reads `/pending` and signs through
  `/api/esignature/sign`; `TaskTray` only reads. The launch-scope API gate refuses `/api/approval-workflows/:id/approve`.
- **Deleted:**
  - `POST /api/biostat/sap/:sapVersionId/sign`, with `CollaborativeSapService.signVersion` and its `SignatureData` type;
  - `POST /api/approval-workflows/:id/approve`;
  - `useApproveWorkflow` and `programTabsService.approveWorkflow`.
- **Tests:**
  - `tests/biostat-sap-sign-route-removed.test.ts` (new). At HEAD it answered 200 and returned the body's signature
    with the version `approved`.
  - `approval-workflow.contract.test.ts`: the happy path is now start → status (`active`, all steps `pending`), plus
    "approve is not a route: 404, and nothing is approved", and the not-assigned check moves to reject.
- **Not removed:**
  - `ApprovalOrchestrator.processApproval`'s approve branch is now reachable from no route; reject still uses the method.
  - `useRejectWorkflow` has no caller either; it was not in the decision.
  - `POST /api/module-integration/approve-step` (`WorkflowService.approveWorkflowStep`) also approves with no ceremony.
- **Gates** (`30`), before and after: `ci:launch-scope`, `ci:launch-scope-api`, `ci:check-route-collisions`,
  `ci:check-client-api-calls`, `ci:audit-route-mounts:no-regression`, `ci:route-ownership-matrix:check`,
  `ci:no-mock-in-prod-routes`, `ci:surface-discoverability`, `ci:sign-ceremony` (+ selftest) and
  `ci:undefined-css-classes` all pass. The orphaned-endpoints ratchet reports 1,063 orphans against its 1,184 threshold.
  `ci:check-client-api-calls` compares prefixes only: restoring the dead approve call still passed it, so the 404 tests
  are the proof.

## Files changed

Source: `server/routes/auth.ts`, `server/routes/authEnterprise.ts`, `server/middleware/sign-in-limits.ts`,
`server/services/part11/reverify-signer.ts`, `server/services/part11/governed-signature-ceremony.ts`,
`server/routes/c2c/actions.ts`, `server/routes/governed-signed-act.ts`, `client/src/services/portal/authService.tsx`,
`client/src/concept2cure/v2/Shell.tsx`, `client/src/concept2cure/v2/surfaces/ProtocolDevWrites.ts`,
`client/src/concept2cure/mdx/hooks/useEstarFiling.ts`. Round 2: `server/routes/approval-workflow.ts`,
`server/routes/biostatPlatform.ts`, `server/services/collaborative-sap-service.ts`,
`client/src/concept2cure/_shared/components/EsignModal.tsx`, `client/src/concept2cure/_shared/signingPosture.ts` (new),
`client/src/concept2cure/v2/AccountPanel.tsx`, `client/src/concept2cure/hooks/useProgramTabs.ts`,
`client/src/concept2cure/services/programTabsService.ts` (and further edits to `auth.ts`, `authEnterprise.ts`,
`reverify-signer.ts`, `authService.tsx`).

Tests: `server/routes/__tests__/auth-session-roles.test.ts`, `auth-sign-in-limits.test.ts`,
`authEnterprise-second-factor-lockout.test.ts`, `esignature-sign.test.ts`, `protocol-signatures.routes.test.ts`,
`server/routes/c2c/__tests__/reauth-second-factor.test.ts`, `server/services/part11/__tests__/reverify-signer.test.ts`,
`client/src/concept2cure/v2/__tests__/accountPanel.test.tsx`, `shellChromeTruth.test.tsx`, `protocolDevWrites.test.ts`,
`client/src/concept2cure/mdx/__tests__/estarFilingRefusal.test.ts`,
`tests/mdx-submission-gateway-transmit-bundle-guard.test.ts` (fixture), and new:
`client/src/services/portal/__tests__/authService-routes-exist.test.ts`, `tests/db/signer-authenticator-required.dbtest.ts`.
Round 2: `server/routes/__tests__/authSurfaceSecurity.test.ts`, `approval-workflow.contract.test.ts`,
`tests/db/sign-in-posture.dbtest.ts`, and new `client/src/concept2cure/_shared/components/__tests__/esignModalSigningPosture.test.tsx`,
`tests/biostat-sap-sign-route-removed.test.ts`. `authEnterprise-second-factor-lockout.test.ts` is back to HEAD.

## Not verified

- A production deployment. "Production" is simulated per request with `vi.stubEnv('NODE_ENV', 'production')`; nothing
  ran with a production configuration end to end.
- Every client signing dialog's rendering of the new refusal. Checked and pinned: `useElectronicSignature` (shows the
  server's `error` verbatim), `ProtocolDevWrites`, `useEstarFiling`. Not changed: the Submission Center
  (`SubmissionCenter.tsx`, `SubmissionSeqWorkspaces.tsx`, open in another fixer's tree), which reads the canonical
  `POST /api/c2c/actions/sign`; that route answers `401 { error: 'REAUTH_AUTHENTICATOR_REQUIRED' }`, a code with no
  sentence. `gateway-accounts.ts` answers this refusal with its fixed "Confirm your password: …" message, which is
  misleading for it.
- The browser. No screen was driven for this change.
- `/mfa/verify` and the development sign-in paths answering `null` are covered by construction (the same helper), not by
  a test of their own.
- A real 429 against a deployed limiter store; only the in-memory store under supertest.

## Decisions

Round 1 listed six. The lead accepted 2, deferred 3, and had 1, 4, 5 and 6 done in round 2 (above). The original text
follows for the record.

1. **The signing dialog learns of the rule only at the end.** `POST /api/esignature/verify-password` answers
   `{ valid, mfaRequired }`, so a production signer with no authenticator types the password, is not asked for a code,
   and is refused at the signature. The pre-check could answer `authenticatorRequired` so the dialog says "Enrol an
   authenticator in Account" first. The account panel likewise says only "Sign-in asks for a code sent to your e-mail"
   when none is set up, and removing the authenticator does not warn that signing stops. The client cannot tell
   production from staging, so either change needs the server to say so.
2. **The rule reaches every `verifyReauth` caller,** including the gateway credential change (administrators) and
   transmit, rollback and technical rejection. That matches ADR-0014 §4 (owners and administrators too), but those
   are not all "signatures" in the panel's words.
3. **Status codes differ by family.** Direct `reverifySigner` routes answer 403. `verifyReauth` routes and the domain
   ceremony answer 401, as they do for every re-authentication refusal. Unifying them changes 14 call sites.
4. **Two MFA enrolment implementations.** `/api/auth/mfa/{setup,enable,disable}` and
   `/api/auth/enterprise/mfa/{setup,enable,disable}` (the second asks for a password to disable and answers 400 for a
   wrong code). No client calls the enterprise doors. Both are limited now; one should be deleted (zero duplication).
5. **`POST /api/biostat/sap/:id/sign`** stores a client-asserted signature with no re-verification, and
   **`POST /api/approval-workflows/:id/approve`** approves with no ceremony. Neither has a client caller. Remove them,
   or route them through the ceremony.
6. **Unset `NODE_ENV`** reads as development here, as `config/environment.ts` treats it, while the submission bundle
   guard treats unset as enforce. A production deploy without `NODE_ENV=production` would not enforce this rule.
