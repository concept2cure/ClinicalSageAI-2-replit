# Active backend and v2 UI inventory — 2026-10-14

Workstream: D2 / W1, completing existing client onboarding and exposing existing
administration capabilities. This is a source-level capability and ownership
inventory, not evidence of a production deployment or live mount smoke test.

## How the active product was identified

- Read root `AGENTS.md`, `CLAUDE.md`, `docs/LAUNCH_DEFINITION_OF_DONE.md`, and
  `shared/constants/launch-scope.ts`.
- Followed `server/startup/routes.ts` into the platform, tenant, document,
  project, and admin bootstrap registrars. A route file without a current
  registrar reference was not treated as deployed.
- Used `client/src/concept2cure/v2/surfaceViews.ts` as the rendering authority.
  The active `admin-console` renders `AdminAccess`, **not** the earlier
  `AdminSurfaces.AdminConsole` export. A caller only in that earlier export
  does not establish a reachable UI affordance.
- Checked the pure `launchScopeApiVerdict` against the current prefix registry.
  See `api-scope-classification.txt`. A mounted route classified `unmapped` or
  `out-of-scope` is refused under the production launch boundary and was not
  proposed as a new customer capability.
- Searched client callers while excluding tests. Existing comments describing
  a past missing caller were not treated as evidence that it is still missing.

## Onboarding and administration gaps found

| Priority | Existing mounted capability | UI at start of this work | Ownership / resulting work |
| --- | --- | --- | --- |
| 1 | Existing wizard organization/plan/member setup; governed organization settings store | The wizard did not collect the requested client/project discovery context. There was no canonical persisted discovery questionnaire API. | Added canonical `GET/PATCH /api/onboarding/discovery`, adaptive `DiscoveryQuestions`, explicit save/resume/completion, and reviewed reuse in New Project configuration. Discovery uses the governed settings writer and deterministic contract; it does not grant access, change billing or authorize AI dispatch. See `discovery-backend.md` and the root UI evidence. |
| 1 | `GET /api/tenant-users/invitations/mine`; `POST /invitations/:id/accept`, `/decline` | No client caller. An existing account invited to another organization could not respond in the v2 product. | Implemented in `AccountOnboardingSettings`: pending invitation inbox with accept/decline and confirmation. The inbox names the organization and refuses unnamed acceptance. Membership uses the atomic/quota-checked backend; consent changes commit with their chained audit row. Acceptance refreshes the workspace picker, while switching remains explicit. See `account-self-service.md`. |
| 1 | `POST /api/tenant-users` returns invitation delivery (`email`, `link`, `failed`), setup URL and expiry | Wizard counted every successful HTTP response as an invite sent and discarded the delivery answer. Link delivery and failure could leave the invitee unable to sign in. | The wizard and admin invitation/reissue paths use one confirmed-outcome contract and expose explicit setup-link handover that survives roster reloads; an arbitrary 2xx response does not imply email delivery. Setup links are credentials and stay out of persistence / AnA context. |
| 1 | Membership-filtered `GET /api/organizations`; `POST /api/auth/enterprise/select-organization` | No active account-panel organization switch. Accepting a cross-org invitation did not itself open the newly joined workspace. | Personal setup workstream adds `OrganizationSwitcher`, probes the rotated session and clears the old shell/cache before opening the new organization's Projects screen. |
| 1 | `GET/PUT /api/users/me/persona` | No client caller. The canonical reporting persona on the current organization membership could not be selected. | Implemented in the account panel and reporting catalog initialization using the canonical persona vocabulary. Persona is personalization, never a role grant. See `account-self-service.md`. |
| 1 | `POST /api/api-keys` | Active AdminAccess listed and revoked keys, but had no create control. A mint form existed only in the unmounted earlier AdminConsole. | Implemented in active AdminAccess: read-only scopes, expiry, request limit, required reason, one-time secret drawer. Creation and revocation now commit atomically with the chained audit row. |
| 2 | `GET/PATCH /api/users/me/notifications` | No client caller. Existing mentions, approval, compliance, digest, toast, sound and timezone preferences can be stored. | Deferred as incomplete backend behavior: the personal setup audit found no consumer of these preferences. Adding controls would persist inert choices. Implement the actual delivery/notification consumers before exposing preferences. |
| 2 | `GET/POST /api/vault/legal-holds`; `POST /:id/lift` | No v2 caller to list/place/lift holds. Setup already edited the retention period, and document disposition previews displayed hold counts. | Implemented as `LegalHoldsCard` beside retention in Setup: named tenant-scoped project/document targets, active/all holds, governed create/lift reasons, typed lift confirmation, atomic audit, ownership read-failure handling. Existing manager authority preserved. See `legal-holds.md` (60 targeted checks). |
| 2 | `GET/POST/DELETE /api/authoring/docs/:docId/permissions` | No v2 caller. Owner/admin-controlled reviewer/approver/document access grants existed on the server; grant audit recording was not transactional. | Implemented through the canonical editor's Access toolbar → `DocumentPermissionsPanel`. Target choices are actual organization members and document sections. Canonical routes now enforce reasons, future expiry, target membership/email, locked owner/admin authority, same-transaction chained audit, and final document-owner preservation. See `authoring-document-access.md`; component/route/workbench shadow checks and canonical DDL checks were run by that workstream. |
| 2 | `GET/POST/DELETE /api/admin/access/grants` | Only the earlier unmounted AdminConsole had direct callers. Active AdminAccess's Roles + scopes tab exposed org role summaries. | Implemented as `AdminPlatformGrants` in the active Roles + scopes tab. Controls appear only after a successful platform-gated read. Grantable choices come from the server's verified business standing, and mutation requires a governed form/reason. A revocation whose audit record is missing is reported truthfully under the existing withdrawal policy. |
| 3 | `GET /api/api-keys/:id/usage` | No active v2 caller. Key list showed last use but not the backend's request count / full status. | Implemented in the active key table through `AdminApiKeyUsage`: explicit Usage action, numeric id, server count/status/last-use, errors never rendered as zero. |
| 3 | `GET/PUT /api/users/me/preferences` | No v2 caller for display (`density`, `railGroups`, `dockOpen`), translation (`txw*`) or the earlier `onboardingComplete` keys. No active v2 consumer of these keys was found. | Deferred as incomplete behavior. Adding controls that only persist keys would not implement their effect. The new discovery flow has its own canonical persisted completion state; organization translation policy already has a Setup form. |
| 3 | Tenant config `GET/PATCH /:tenantId/settings`, section PATCH, and reset | The general settings API has no direct active caller; the dedicated Claude connector endpoint already has a UI. Setup writes the canonical governed organization profile/settings endpoint. | Partial backend overlap, not a reason to create another generic settings editor. Verify which specific controls are consumed before exposing them. Server-enforced security flags must remain read-only facts. |

## Existing reachable setup features — preserve these paths

| User outcome | Active v2 component / route | Existing backend contract |
| --- | --- | --- |
| Change password, enroll/remove authenticator, save recovery codes | `AccountPanel`, account menu | Canonical `authService`; `/api/v1/auth/session`, `/password/change`, `/mfa/setup`, `/mfa/enable`, `/mfa/disable`. Password change ends sessions; recovery codes stay in drawer memory. |
| Invite a member; change/remove membership; reissue a setup link | `AdminAccess`, `AdminMemberActions`; `admin-console` | `/api/tenant-users` and org/user membership routes. Refuses self-demotion/removal and removing the final administrator. |
| Configure organization name/type/region and translation policy | `AdminSurfaces.Setup`; `setup` | Governed `/api/organizations/:id/profile`, `/settings`, and `/api/mdx/industry-profile`. |
| Read/set records retention period | `RetentionPeriodCard` within Setup | `/api/vault/legal-holds/retention`; lower-than-minimum changes require the governing rule and reason. |
| SCIM provisioning tokens, token rotation/revocation, source-IP allowlist | `IdentityConsole`; `identity-console` | `/api/admin/scim-tenants`, `/api/admin/scim-ip-allowlist`. Restricted platform endpoints, one-time tokens. IP-rule create/update/delete now use a reason and commit with their chained audit record; the existing token audit gap remains separate. |
| Idle and concurrent-session limits | `SessionPolicySetting` in onboarding and Admin Setup/Security | Governed organization settings writes; UI/runtime share `shared/auth/session-policy.ts`. Both effective policy values are recorded before/after in the settings audit. Existing sessions retain their recorded idle window. |
| SAML metadata/initiation/ACS/logout references | `IdentityConsole` | `/api/auth/sso/saml/*`. Certificates and IdP configuration are deployment-managed; no tenant UI toggle can configure those endpoints. |
| Select agency gateway accounts; enable the connector for Claude | `GatewayAccountsSetting`, `ClaudeConnectorSetting` | `/api/gateway-accounts`, dedicated `/api/tenant-config/:id/claude-connector`. |
| Upload onboarding sources, inspect proposals/provenance, apply reviewed values | `OnboardingIngest`, `OnboardingProposalReview`; `onboarding-ingest` | `/api/onboarding` proposal ingest. Applying a proposal follows the existing governed commit path. |
| License plans, request enterprise onboarding, handle access requests | `Onboarding`, `Licensing`, `AccessRequests`, `MasterLicensing` | Existing checkout / license-request / module-access-request / licensing contracts. CMC remains subject to its professional entitlement even though its surface is in launch scope. |

## Other mounted endpoints that must not be mistaken for missing launch UI

| Capability / path | Why it was not added as a new onboarding surface |
| --- | --- |
| AnA tool policy `/api/ana-tool-policy`; AI placement `/api/ai-placement-policy` | Mounted, but `unmapped` in the current launch classifier. API placement is governance/deployment scope; a questionnaire must not authorize dispatch to a provider. |
| Project charters `/api/charters`; project module bindings `/api/project-modules` | Mounted but `unmapped` in the current classifier, so refused under the production launch boundary. Also use the integer project spine; the active product's program spine is not a blanket substitute for that id. |
| Full tenant export `/api/tenant-export/full` | Mounted but `unmapped`, so refused under the production launch boundary. The current launch compliance surface exposes the attestation contract, not a full export UI. |
| eCTD vocabulary/specification/v4 metadata APIs | `/api/ectd` is launch-attributed. The earlier `PublishingCenter` reader still has API callers, but that surface was deliberately removed from launch on 2026-10-08. Existing official sequence compilation is the active workflow; restoring that reference surface is not an onboarding fix. |
| Stored project rules `/api/project-rules` | Read by active TaskBoard. CRUD/dry-run endpoints exist, but TaskBoard accurately states that no background event source dispatches the stored rules. Exposing a rule-builder alone would not complete automation. |
| Admin security self-test `/api/admin/security-health` | Admin operations endpoint (never package-gated). Returns operational self-test evidence, not configurable tenant MFA/SSO/session policy. Do not turn it into fictitious tenant security settings. |
| Orchestration/inconsistency, training, AnA command/memory, template library, regulatory workspace, co-author/dossier-map/publishing center | Explicitly excluded by `shared/constants/launch-scope.ts` / `docs/SURFACE_DECISIONS_2026-10-08.md`. Presence in `surfaceViews` does not authorize reopening an intentionally excluded capability. |
| Regulatory/manufacturing digital twins, epistemic/causal/federated engines and demo/test routers | Explicit launch exclusions or environment-flagged infrastructure. No production flag was widened. |

## Validation boundary

This inventory checks current source composition and active renderer ownership.
It does not claim that thousands of mounted routes all received individual
runtime requests, or that production credentials/infrastructure are configured.
The previous runtime measurement is
`docs/evidence/D2-API-SCOPE/2026-09-25/stage3-route-inventory.json`; its counts
are historical and were not presented as today's deployed count.

## Subsequent completion — 2026-10-26

The SCIM provisioning-token audit gap noted above is completed by
`server/services/scim-token-policy.ts` and the existing `IdentityConsole`.
Create, rotate, enable/disable and revoke now require a reason and commit with
the chained audit row; rotation/revocation use the existing governed forms.
Unconfirmed outcomes require directory readback, and the administrative-changes
report includes these events. See the [token setup evidence](../../W1/2026-10-26-scim-token-setup/README.md)
for verification and hosted-release limits. This follow-up does not change the
historical scope of the October 14 inventory or imply that deployment-managed
SAML settings and inert personal preferences have acquired working controls.

Personal in-app alert choices are also now reached from Account through the
same controls the inbox uses: `NotificationPreferenceSettings` and the existing
MDX notification-subscriptions API. Actor-bound requests, exact saved-record
confirmation and cross-host inbox count refresh complete that setup handoff.
See the [Account alert setup evidence](../../W1/2026-10-26-account-alert-setup/README.md).
This uses the already-consumed MDX subscription store; it does not expose the
inert email, sound or digest fields in `/api/users/me/notifications` as working
controls.
