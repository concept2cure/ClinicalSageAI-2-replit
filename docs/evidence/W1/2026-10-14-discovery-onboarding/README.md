# W1 / D2 — discovery onboarding and setup handoffs

This work improves client onboarding and exposes supported setup actions within
the existing launch catalog. It does not declare hosted-production or all
launch rows complete.

## Canonical implementation after consolidation

A concurrent onboarding implementation landed on `concept2cure-v2` while the
initial checks ran. The final merge retains its richer, revisioned discovery
contract and transaction-bound API-key audit writes. It migrates the additional
invitation-consent, session-policy and SCIM safeguards into the canonical UI.
There is one discovery flow and one API-key creation flow.

| Removed parallel component | Reachable replacement | Reachability / behavior test |
| --- | --- | --- |
| `onboarding/DiscoveryQuestionnaire.tsx`, `DiscoveryReview.tsx`, `discoveryDraft.ts` | `surfaces/Onboarding.tsx`, `DiscoveryQuestions.tsx`, `DiscoveryNextSteps.tsx`, `useOnboardingDiscovery.ts` | `__tests__/onboardingDiscovery.test.tsx`, `useOnboardingDiscovery.test.tsx`, `DiscoveryNextSteps.test.tsx` |
| `onboarding/DiscoveryProjectPrefill.tsx` | `surfaces/Projects.tsx` → `ProjectDiscoveryHandoff.tsx` | `__tests__/projectDiscoveryHandoff.test.tsx` |
| `onboarding/ApiKeyCreate.tsx` | `surfaces/AdminAccess.tsx` → `AdminApiKeyCreate.tsx` | `__tests__/adminApiKeyCreate.test.tsx` |
| `onboarding/InvitationInbox.tsx` | `AccountPanel.tsx` → `AccountOnboardingSettings.tsx` | `__tests__/accountOnboardingSettings.test.tsx` |
| `onboarding/InvitationResults.tsx` | `surfaces/OnboardingInvitations.tsx`, `AdminAccess.tsx` | `__tests__/OnboardingInvitations.test.tsx`, `adminAccessMemberActions.test.tsx`, `adminAccessInvitationOutcome.test.tsx` |
| `onboarding/OnboardingSecurity.tsx` | `surfaces/OnboardingSecurity.tsx`, retaining `onboarding/SessionPolicySetting.tsx` | `__tests__/OnboardingSecurity.test.tsx`, `onboarding/__tests__/SessionPolicySetting.test.tsx` |

The duplicate `onboarding/activationPlan.ts` implementation is also removed;
`surfaces/Onboarding.tsx` remains the single source of its exported activation
mappers, exercised by `onboarding/__tests__/activationPlan.test.ts`.

All client paths above are relative to `client/src/concept2cure/v2/`. Deletion
history was checked before removing the parallel components. The original
nested discovery schema tests are replaced by
`shared/types/__tests__/onboarding-discovery-contract.test.ts` and the server's
`discovery-questionnaire-routes`, `discovery-managed-setting`, and
`discovery-settings.pglite.integration` suites. The canonical discovery write
door is `PATCH /api/onboarding/discovery`; direct general-settings writes are
refused. API-key creation and revocation now roll back if their chained audit
write fails; the earlier best-effort audit behavior is superseded.

The named invitation inbox preserves self-only lookup. Missing organization
names block acceptance. Consent mutations and their chained audit rows commit
together; existing members retain their actual roles. The UI distinguishes
confirmed membership, pending consent, delivered email, private setup links,
refusals and uncertain outcomes. It never counts an arbitrary 2xx response as a
sent invitation. Account workspace switching remains explicit and refreshes the
session and workspace state.

The live session engine and administration UI use the same bounded policy
helpers. Idle timeout and concurrent-session changes are value-audited through
the existing settings writer. SCIM IP-rule creation, updates and deletion retain
platform standing checks and transaction-bound audit records. The existing SCIM
token audit gap is separate from these newly governed IP-rule changes.

## Evidence interpretation

The initial logs, `browser-check.json` and original PNGs record the pre-merge
implementation at local commit `8fbe834`. That focused run passed 369 tests in 37
files, the zero-error TypeScript gate and the production client/server build.
They are retained as historical evidence; final consolidated behavior is covered
by the merge logs and browser evidence recorded below.

The discovery PGlite integration executes real PostgreSQL statements using a
non-superuser role and proves storage, stale-revision refusal and audit-error
rollback. Invitation and SCIM recorder tests exercise real route/scope helpers
and transaction ordering; they do not substitute for production PostgreSQL/RLS
or audit-chain verification. Browser evidence uses actual React components and
canonical CSS with synthetic API replies, at desktop and 390-pixel mobile
widths. It is not production data.

No production deployment or live SMTP, SAML, MFA-provider, SCIM-directory or
external billing configuration is claimed here. SAML settings have no write
endpoint and remain an explicit deployment-administrator handoff. Repository CI
and any hosted release verdict must name the exact final commit.

## Final merge verification

- `merge-regressions-green.txt`: 720 tests passed across 67 suites, including all
  modified/new suites and existing account, administration and project regressions.
  The exact selection is in `merge-test-files.txt`; it ran with Node 22 and
  `xargs -d '\n' npx vitest run < docs/evidence/W1/2026-10-14-discovery-onboarding/merge-test-files.txt`
  from the repository root.
- `merge-reissue-regression-red.txt`: the old admin replacement-link handler fails
  eight of the new retention/refusal checks. The final combined green run includes
  the corrected handler and all 18 member-action tests.
- `merge-typecheck-green.txt`: the full-program zero-error TypeScript gate passes
  after the final invitation callback and fixture changes.
- `merge-build-green.txt`: the production Vite client and bundled server build
  pass. Existing chunk-size warnings remain; no new dependency was introduced.
- `merge-browser-check.json` and five `merge-*.png` images: actual canonical wizard,
  AuthProvider and CSS in Chromium; conditional diagnostic questions, four saved
  revisions, reviewer invitation and visible private-link handover verified.
  Desktop light/dark and 390-pixel mobile checks have no overflow or page errors.

`merge-prepush-ratchet-red.txt` records the function-length warning refused by
pre-push. The handler was split into request/control helpers and the test groups
were split by outcome, without changing the lint baseline or behavior.
`merge-reissue-refactor-green.txt` rechecks all 18 affected tests. TypeScript and
the production build were rerun after that final refactor; the green files above
record the final source.

The canonical branch push runs the repository's pre-push gates. CI and production
release status are distinct from the local verification recorded here.
