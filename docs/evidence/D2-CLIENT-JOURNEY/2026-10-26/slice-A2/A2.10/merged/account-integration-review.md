# Concurrent organisation-access compatibility review

Read-only source review of incoming `12417dac0` against qualified A2.10
`49f2f0cb7`, 2026-10-26. Combined regression/build/native qualification is
reported separately by the lead; this note does not reuse incoming results as
proof of the combined source.

## What already exists

Account and the top-bar organization entry already read invitations/memberships
and switch the current session. `switchOrganization.ts` already owns session
rotation, `authService.tsx` owns verified adoption and session ending, and
`authToken.ts` owns captured-actor headers plus canonical memory/storage cleanup.
Incoming work converges these existing utilities: invitation contracts live in
organizationAccessData.ts, and both entry points delegate to the established
switchOrganization helper. No new surface, backend or client store is added.

## Review result

No filing-field, navigation, admission or actor-scope regression was found.
All six incoming implementation files match the incoming revision. Sixteen
filing/guard/actor source owners remain byte-identical to the qualified A2.10
parent, including both reference owners, wizard/Plan/ProjectHome, the canonical
detail serializer and catalogue migrations, accepted programme/anchor access,
requestDb, AnA launch scope/inventory and capturedActorHeaders.

- Membership/invitation reads capture the source user, organisation and bearer;
  retired requests and stale owners cannot publish choices for a new sign-in.
  Decisions retain their read owner through the confirmation form and recheck
  ownership before posting and after each response/JSON boundary.
- Acceptance confirms the actual invitation, organisation, user, accepted
  status and preserved membership role. Unnamed organisations cannot be
  accepted. Invitation acceptance does not itself switch the active workspace.
- The one switch ceremony preserves unload checks and the unsaved-work
  reservation. It verifies the destination user/organisation through AuthService
  before adopting its token, clears old refresh/client/project/cache state and
  navigates to Projects. An unrelated replacement login is neither overwritten
  nor signed out. An uncertain spent source session fails closed while keeping
  its recoverable device text.
- SecureStorage.clear now calls the canonical clearAuthToken, clearing memory
  as well as both storage tiers and legacy bearer keys. The duplicate legacy
  cleanup loop is removed. The captured-actor implementation and the server's
  authentication/authorization remain unchanged.
- Incoming changes affect six client implementation files and five client
  tests. They do not edit the filing identity, reference admission, wizard
  action, canonical creator, server scope, catalogue seed or dispatch/signature
  owners. Existing filing behavior must still be verified after composition.

## Recommended focused qualification

The exact incoming final-regressions.txt contributes 24 suites (its recorded
265 cases). Its subsequent merged-regressions.txt contributes the same suites
plus four existing onboarding/notification suites, for 28 suites (its recorded
299 cases). These are incoming historical counts, not combined acceptance.

The deduplicated 28-suite file list is `/tmp/a210-account-test-files.txt`;
`/tmp/a210-account-final24-test-files.txt` preserves the exact final-log subset.
Every listed path exists. The additional suites are OnboardingSecurity,
notificationPreferenceSafety, notificationPreferences and onboardingDiscovery.
They use normal targeted Vitest under Node 22, with no special database or
compiler configuration. The lead's integration runner combines this list with
the 48-suite A2.10 qualification set, yielding 73 unique suites after three
overlaps; its own result will establish the combined count.
