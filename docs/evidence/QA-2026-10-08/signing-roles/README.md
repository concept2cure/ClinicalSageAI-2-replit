# P-18 — signing authority is assigned, by role, to named people

Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-18 (2026-10-08). An administrator assigns `approver` and
`reviewer` in Admin and access, with a reason, like every membership change. An approver may do everything a
manager may, and sign; a reviewer may do everything a member may, and sign. The signing policy
(`server/services/part11/signing-authority.ts`: admin, approver, reviewer; `ESIGNATURE_SIGNING_ROLES`) is
unchanged: a manager still does not sign.

## The one rule

`shared/constants/org-roles.ts` (new): `ROLE_EXTENDS` (approver → manager, reviewer → member),
`ASSIGNABLE_ORG_ROLES`, `rolesHeldBy(role)`, `withExtendingRoles(list)`. Every allow-list that admits
`manager` or `member` is built through it instead of naming the signing roles by hand. It only widens a
signing role; nothing widens a manager or a member.

| Site | Before | Now |
|---|---|---|
| `server/routes/tenant-users.ts` create and role-change zod enums | admin, manager, member, viewer | `ASSIGNABLE_ORG_ROLES` (adds approver, reviewer); the reason requirement and audit row are unchanged |
| `server/middleware/orgMembership.ts` `GOVERNED_WRITE_ROLES` (also read by `editor-role.ts`, `vault-write-authority.ts`, `protocol-reviews-service.ts`, `AnaToolExecutor`, the IVDR drift guard, `sessionPermissions`) | admin, manager, member, owner, super_admin | + approver, reviewer |
| `shared/constants/permissions.ts` `REPORT_FINALIZE_ROLES` (report-os finalize guard and the session's `report:finalize`) | owner, admin, manager | + approver (finalize still also needs `isSigningAuthorized`) |
| `server/middleware/auth.ts` `expandRoleClaims` (functional grants: regulatory-author) and `requireRole` (every `requireRole(…'manager'…)`, e.g. report-os deliveries) | exact role match | a signing role satisfies a guard that admits the role it extends |
| `server/services/roleBasedAccess.ts` `ROLE_HIERARCHY` (AnA command `minRole`, privacy admin) | no entry → below viewer | approver at manager, reviewer at member |
| `server/services/governance/permissions.ts` `DEFAULT_POLICY` | approver: view, review, approve, sign; reviewer: view, review | approver: manager's actions + sign; reviewer: member's actions + sign |
| `server/services/audit/audit-api-authority.ts` `AUDIT_READER_ROLES` (also legal holds) | owner, admin, manager | + approver |
| `server/services/audit/compliance-reports/queries/access-review.ts` `PRIVILEGED_ORG_ROLES` | owner, admin, manager | + approver |
| `server/services/c2c/program-access.ts`, `server/services/project-sharing-access.ts` `ORG_MANAGE_ROLES` | admin, super_admin, owner, manager | + approver |
| `server/routes/global-compliance.ts` elevated privacy access | admin, manager, owner, dpo, privacy_officer | + approver |
| `server/routes/tenant-ctq-factors.ts` read checks (two) | chained `!==` over five roles | one set, + approver, reviewer |
| `server/bootstrap/register-regulatory-routes.ts` IVDR permissions | approver/reviewer fell to contributor via the drift guard | approver = manager (full), reviewer = member (contributor) |
| `server/routes/audit-compliance-reports.ts` `AUDIT_REPORT_READERS` sentence | "owners, admins and managers" | "owners, admins, managers and approvers" |
| `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx` `AUTHOR_ROLES` | an approver's session (`['approver','user']`) was told "Your role does not send, review or approve documents" | `withExtendingRoles` |
| `client/.../AdminMemberActions.tsx` `ROLE_OPTIONS` (drawer) and `AdminAccess.tsx` invite form | Admin, Manager, Member, Viewer (invite form: lowercase raw values) | Admin, Approver, Manager, Reviewer, Member, Viewer, with a note on what the signing roles are |
| `server/routes/c2c/reviews.ts` | already mapped approver → lead, reviewer → review | unchanged |

Not changed, needs its owner: `server/routes/authoring.router.ts:5760` `DOCUMENT_DELETE_ROLES`
(owner, admin, manager) — an authoring file this session may not edit. One line:
`new Set(withExtendingRoles(['owner', 'admin', 'manager']))` with
`import { withExtendingRoles } from '../../shared/constants/org-roles'`; its refusal sentence names "owner,
admin or manager". Until then an approver cannot delete an authoring document a manager can.

Not changed, on purpose: `server/routes/scim.ts` `VALID_ROLES` is the SCIM Groups vocabulary an identity
provider maps, not an authorization list; exposing approver/reviewer as SCIM groups is a separate decision.
`WorkflowService` `approverIds` is workflow configuration, not a role gate.

## Evidence

| | |
|---|---|
| Red | `red/p18-roles.txt` (rule present, sites unwired: 9 of 13 failing), `red/p18-assignment.txt` (old enums: 4 of 5 failing), `red/p18-client.txt` (4 failing), `red/p18-roles-before-helper.txt` (module missing) |
| Green | `green/p18-related-suites.txt` — 166 files, 2025 passing; the one failure is `tests/golden-journeys/drug-nda-ectd.journey.test.ts` (422 Module 1 required sections), from the Submission Center validation files other sessions are editing (`validation-rule-corpus.ts`, `submission-service.ts`), not roles |
| Browser (5078) | `browser/r06-signing-roles-3.json`, `browser/0*-r06-*`: invite form and drawer offer the six roles; no reason → "Complete the required field: Reason for the change"; `qa-onboard-3` as member: permissions `governed:write`; as approver: `governed:write`, `report:finalize`; as reviewer: `governed:write` |
| Audit rows (read-only) | `browser/audit-rows-user36.txt`: member → approver and approver → reviewer, actor 1, each with its reason |

Pinned tests updated to the decision (intent kept): `tests/routes/510k-device-routes.test.ts` (reviewer moved
from "refused" to "succeeds", approver added), `server/middleware/__tests__/role-claims.test.ts` (the
grantable vocabulary is `ASSIGNABLE_ORG_ROLES`), `server/routes/__tests__/audit-compliance-reports.test.ts`
(readers sentence).

Not verified live: an approver applying a signature through a ceremony (password + second factor). The
session's `report:finalize` is derived only when `isSigningAuthorized(role)` holds, and the route tests cover
the policy.
