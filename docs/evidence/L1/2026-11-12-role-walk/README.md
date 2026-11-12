# L1 — the account and administration screens, walked as each role (2026-11-12)

The security lane's part of the GA walk (agreed with the lead session, `011Dpx…`): what each organization role can
open or do on the administration screens that it should not, and errors shown in developer words.

## What was run

The running app on the database of `../2026-11-11-ga-walk/` (install-fresh, 470 migrations, GA demo seed),
`RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`. Signed in through the sign-in page as each of the seed's people:
administrator (`jm.smith`), manager (`sarah.chen`), member (`emily.watson`) and a team member whose organization
role was set to `viewer` for the walk. Each role's own session token was then used for 26 administration reads.

## What already exists

Every screen and route walked exists: Admin console (`AdminAccess.tsx`, `AdminSurfaces.tsx`), Audit trail,
Enterprise identity (`IdentityConsole.tsx`), Licensing, `organizations-routes.ts`, `tenant-settings-writer.ts`.
Nothing was added.

## The read matrix (26 GETs × 4 roles)

| Read | Administrator | Manager | Member | Viewer |
|---|---|---|---|---|
| Platform administration (`/api/admin/master/*`, access grants, SCIM tenants and allowlist, business export; 9 reads) | 403 | 403 | 403 | 403 |
| Another organization's settings (`/api/organizations/1/settings`) | 403 | 403 | 403 | 403 |
| AI placement policy, AnA skill usage, API keys | 200 | 403 | 403 | 403 |
| Audit trail ledger, access-review and sign-in reports, periodic reviews | 200 | 200 (cannot sign a review) | 403 | 403 |
| Report catalogue (`/api/audit/reports`) | 200, can run | 200, can run | 200, cannot run | 200, cannot run |
| Gateway accounts | 200 | 200 | 200 | 200 (no credential in the body: `credentialsConfigured` only) |
| Organization settings | 200 | 200 | 200 | 200 — **finding 1** |

Writes checked on the way: a viewer's `POST /api/c2c/projects` is refused 403 "Your current role cannot create a
project. Nothing was changed."; a viewer's Vault folder write 403 (see the earlier walk).

## Found and fixed (each red first, each re-walked)

1. **Organization settings returned stored credentials and the network allowlist to every role.**
   `GET /api/organizations/:id/settings` answered with the whole settings object less three internal keys, so an
   integration's API key, webhook URL or client secret, and `security.ipWhitelist`, were readable by a member or a
   viewer (and by AnA's settings read). `generalSettingsView` now withholds every stored credential from every
   reader (`webhookUrl: ""`, `webhookUrlConfigured: true`), and a reader who is not an administrator gets no
   `integrations` section and no allowlist. The write no longer echoes a credential it stored.
   Walked: a webhook stored as the administrator reads back withheld; the viewer sees neither section.
   Test: `organizations-profile-settings.test.ts`. Commit `c531350079`.
2. **A refused audit trail read "0 entries".** A member or viewer was told the trail is not available to their
   role under a heading that said "0 entries — hash-chained — append-only", and was offered "Export signed bundle".
   A count is now stated only for a trail that was read, and the export is not offered to a role refused the read.
   Screenshot: `audit-trail-as-member.png`. Test: `auditTrailEventChainVerdict.test.tsx`.
3. **Admin console offered "Invite member" to an account that is not an administrator.** Not offered once the read
   is refused. Test: `adminAccessNoFixtures.test.tsx`.
4. **Enterprise identity's refusal named roles in identifiers** ("requires the super_admin or platform_admin
   role"). It says "managed by platform administrators". Test: `identityConsole.test.tsx`.

## Sign-in, walked on the sign-in page

| Case | What the person reads | Notes |
|---|---|---|
| Wrong password for a real account | "Incorrect email or password. If you were invited and have not set a password yet, open the link in your invitation or reset your password." | |
| An address with no account | The same sentence | No account enumeration from the refusal |
| Not an email address | "Enter a valid email address." | |
| Five wrong passwords, then a sixth | "Account temporarily locked due to too many failed attempts. Try again later." | The right password is refused while locked. The locked sentence is shown only for an account that exists, so it does confirm one; that is the usual trade for telling a real person why they cannot sign in, and is left as it is |

## Reviewed, not a defect

- **The sign-in token carries `organizationId` (and on some paths `userId`) as strings** (`authEnterprise.ts`).
  Both live verifiers parse the claim strictly (`parseFiniteInt`, digits only) and re-read the membership and its
  role from `organization_users` on every request (`server/auth.ts` 234–310; `server/middleware/auth.ts`
  `admitLiveSession` → `enforceOrgMembership` → `applyOrganizationRole`). The socket server and the MCP token
  reader parse to a positive integer too. `optionalAuth`, which attaches the claim without the membership read,
  has no caller.
- **Session reads per page open:** measured here in the development build, a page open reads `/api/users/me` twice
  and `/api/organizations/:id` twice (React's development double mount), not six times. Not reproduced; left with
  the lead's release-shaped run.

## For other lanes (not changed here)

- **Home shows "New project" to a viewer**; the server refuses the create with a clear sentence. The button belongs
  to the project page's lane (`01QoxbLcnW…`).

## Not walked

Sign-in with a second factor, password reset and invitation links (no mail transport here), SSO and SCIM provisioning (no identity provider here; development sign-in skips the
second factor and says so on the audit trail), session expiry, and the platform-administrator screens (no platform
administrator in the seed). 390 px and dark theme.
