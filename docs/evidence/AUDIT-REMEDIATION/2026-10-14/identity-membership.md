# F08 / F14 — Recipient consent and organization switching

The canonical shell now exposes Organizations and invitations to every signed-in user. The recipient reads their own pending invitations, sees the inviting organization and offered role, and explicitly accepts or declines through the existing consent endpoints. Acceptance refreshes the inbox and membership list; it never switches the session automatically. Refusals preserve the confirmation and display the server's reason. Inbox polling stops on unmount. The existing recipient-only SQL function and quota/consent writer remain the authority.

An existing-account invite still returns 202 pending consent. It now sends a notification using the existing SMTP service with a link to the authenticated inbox, without a password/reset/acceptance token. If email delivery fails or is unavailable, the durable inbox remains available and the administrator is told no email was confirmed rather than that a password email was sent. SMTP failure does not turn a committed pending invitation into a false creation failure.

The selector reads only the authenticated account's memberships from GET `/api/auth/enterprise/organizations`, including for platform operators; it never uses the operator's cross-tenant management directory. A switch requires confirmation, rejects unsaved native-editor work before rotating the token, calls the existing membership-checked rotation endpoint, and adopts the returned token through the canonical server session probe. Failed adoption ends the spent old session. Success removes old tenant project/client/module selection and refresh-token fallbacks, clears query state, and reloads Projects. It does not discard device drafts, silently reuse an old tenant's project, or trust a role in the switch response. An open governed form blocks opening a competing tenant ceremony.

Evidence at the audited base `920b230`, Node 22.23.3:

- `identity-invitation-red.log`: the actual admin invite flow claimed a password-setup email instead of pending consent (1 regression failure).
- `identity-organization-shell-red.log`: all three original actual-TopBar regressions failed because the control was absent.
- `identity-second-wave-green.log`: current component, membership, consent, delivery, session-selection and entitlement suites pass; see the recorded final count. The additional membership-read contract proves the actor ID is bound from authentication despite a requested `userId=999`, and a missing authenticated actor makes no query.
- `identity-membership-guards-green.log`: 45/45 existing/new session-adoption, membership-reader, signature-tenant and release-boundary tests passed.
- `identity-new-files-lint.log`: new identity modules and regression files lint with no findings. Existing large-file warnings in older admin/auth routes remain. `git diff --check` passes.

The tests use HTTP/auth/mail seams. Existing tenant-user contracts retain recipient-only acceptance/decline checks and cover consented membership behavior. This evidence does not claim a deployed SMTP delivery, real federation, or cross-machine tenant-switch test. No live invitation, commit, push or deployment was performed.

Implementation: `OrganizationAccess.tsx`, `switchOrganization.ts`, `Shell.tsx`, the canonical `shellProject.ts` clearing API, `AdminAccess.tsx`, `authEnterprise.ts`, `tenant-users.ts`, `pending-invitation-delivery.ts`. The recipient inbox is excluded from commercial packaging only; its authenticated recipient authority remains mandatory.
