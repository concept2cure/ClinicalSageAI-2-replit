# W1 / D2 — complete personal in-app alert setup

## What already exists

- `client/src/concept2cure/v2/NotificationPreferences.tsx`: existing inbox preferences dialog. Uses the canonical category labels and subscription API; its guard checks key presence, not boolean values or duplicate categories, and any 2xx write invokes `onSaved` without confirming the stored record.
- `client/src/concept2cure/v2/TaskTray.tsx`: authenticated user/organization-owned inbox and unread badge. Opens the existing preference dialog; local saved callback refreshes its counts. No cross-host preference refresh exists yet.
- `client/src/concept2cure/v2/AccountPanel.tsx` and `surfaces/OnboardingSecurity.tsx`: existing Account drawer and onboarding handoff; their descriptions are extended to name the reachable alert choices.
- `client/src/concept2cure/v2/AccountOnboardingSettings.tsx`: canonical Account setup for invitations, workspace switching and reporting role, plus a collapsible company-documents section. It has no notification settings entry.
- `server/routes/mdx-notifications.ts`: authenticated, request-client-bound GET subscriptions and PUT one category, with organization and actor from trusted request context. PUT returns the stored row, including organization_id/user_id/category/in_app_enabled. External email/push enablement is refused.
- `server/services/notifications/notification-service.ts`: live membership/audience and category preference filtering. Missing preferences default to in-app enabled; changes affect inbox reads and unread counts.
- `shared/constants/notifications.ts`: canonical category vocabulary and labels, including categories restricted to server-side producers.
- `client/src/utils/authToken.ts`: canonical `capturedActorHeaders` pins bearer credentials to the captured actor/organization; use it rather than invent another identity check.
- `client/src/concept2cure/v2/dataConnect.tsx`: canonical response-envelope and real-data helpers. Its generic list hook does not accept captured actor headers; the existing preference owner needs a bounded, actor-owned request lifecycle using the same API client.
- `client/src/concept2cure/v2/apiCall.ts` and `client/src/lib/queryClient.ts`: existing transport, HTTP error interpretation and redaction. Keep these canonical transport semantics.
- `server/routes/users.ts` legacy `/me/notifications` and `notification_preferences`: separate personal settings with no active consumers for their email/sound/digest keys. Do not revive these inert controls or create another preference store.

Searches: notification preferences/subscriptions/category and refresh callers across client/server/shared; Account and TaskTray owners; `git log --all --diff-filter=D -- '*NotificationPrefer*' '*notification*subscr*'` (no matching deleted implementation found in available history). Existing category preferences are reached and completed, not rebuilt beside another store.

## Design

Extend the existing preference component into one controls implementation shared by its existing dialog and a collapsible Account section. Read and write with captured actor headers; discard obsolete replies and prohibit stale-actor writes. Require real booleans, known unique categories, and a saved row matching the requested actor, organization, category and value before acknowledging success. Preserve server defaults only after a valid empty read. Recover uncertain writes with readback, not automatic mutation retry. Notify the existing TaskTray to refresh counts after current-owner preference changes from either home. Keep its existing scoped ownership checks and canonical styling. No new backend capability, schema, delivery channel or dependency.

## Verification

Local verification is recorded below. Hosted CI and staging are separate release gates.

## Results and verification limits

- `safety-red.txt` and its full `safety-red.txt.gz` log: all six initial safety checks fail on the original panel, covering invalid/ambiguous reads, unconfirmed successful writes, stale-organization writes and late acknowledgements after account changes.
- `regressions.txt`: 142 checks pass across 15 suites, including Account-to-inbox badge refresh, recipient ownership, duplicate/pending and unmount behavior, existing Account security/onboarding, generic API/data helpers and the notification service's existing PGlite recipient-isolation suite.
- The canonical `liveGetOrNull` and `apiCall` helpers gained optional captured headers. Existing calls keep their original signatures and transport behavior; no parallel request convention was added.
- `browser-check.json` and four screenshots: actual AccountPanel, AccountOnboardingSettings, TaskTray and preference controls with canonical CSS, a synthetic auth-service adapter and API replies. The actual captured-header helper reads synthetic JWT claims. At 1440px/390px in light/dark, confirmed saves update the unread badge, preserve focus, and refuse an attempted write after actor claims change. No page errors, overflow or preference persistence in browser storage. This is component integration evidence, not a hosted authenticated journey.
- `build.txt`: production client/server/audit-verifier build passes; existing chunk-size warnings remain. `typecheck.txt` records the full-program zero-error check; final pre-push checks also cover subsequent focus preservation.
- `lint.txt`: only the existing TaskTrayOwner complexity warning. No lint/type/security baseline was widened.

The backend subscription routes, live role/audience filtering and unsupported external-delivery policy remain unchanged. The legacy personal notification-preferences table is not used by these controls. Hosted CI and staging for the preceding revision remain pending separately from local verification.

## Verification after shared-branch merge

Merged upstream `2fd07ac807292c4221468067eaf6807146cfc3a0` into the implementation at `4286f0fe3`. `merged-regressions.txt` records 156 passing checks and one existing notification-tool dynamic-import timeout at 10 seconds; `merged-timeout-recheck.txt` records all four checks in that suite passing on rerun without code or timeout changes (the import check took 9.075 seconds). `merged-build.txt` passes all production build targets. Refreshed browser artifacts pass all four viewport/theme cases. `prepush.txt` records every normal gate passing, including the full-program zero-error typecheck. No hosted deployment is established by these local checks.

The first normal push passed every gate (including zero-error typecheck) but was refused because the shared remote advanced. Merged `01dbd4eb3` at `9612fcd1e` without conflicts or changes to Account/notification owners or shared transport. Its design updates concern dossier tracking in Author. `final-merge-tests.txt`: all 55 Account/notification checks in four suites pass; `final-merge-build.txt`: production client/server/verifier build passes.

A second push also passed every gate with zero type errors, then lost the shared-ref race to `1f6a8bf7c`. That update changes legacy MDX routing and navigation, with no overlap in Account/notification owners. Merged without conflicts. `routing-merge-tests.txt` records all 89 tests across eight suites passing, including the incoming routing and Account alert checks; `routing-merge-build.txt` passes production build targets.
