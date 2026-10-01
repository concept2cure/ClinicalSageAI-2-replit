# P1-47: the connector for Claude, enabled per organisation by its owner or administrator

(The administrator was added by the product owner's decision of 2026-10-01, IAM-25. See the last section.)

Plan item P1-47 (ADR-0014 §10; launch row D8; audit IAM-02 follow-on). Product decision P-2
(`docs/LAUNCH_DEFINITION_OF_DONE.md`, "Product decisions, 2026-10-01") turns the connector on for the
deployment (`MCP_ENABLED=true`, Claude's origins only). This item adds the organisation's own switch:
the customer, not the vendor, opens the path.

Date: 2026-10-01. Base: `0812a990` plus the shared working tree (P0-4b, P1-49 and others in flight).

## What was wrong

Any organisation's members could use the connector as soon as the deployment mounted it. Nothing in
the organisation's settings could stop it, and no one in the organisation decided to open it:

- `POST /oauth/consent` issued an authorization code to any member (red: `consent POST` cases, 302).
- `/mcp` admitted a connector token and a first-party session for any organisation (red: 200).
- Both `/token` exchanges minted new tokens for any organisation (red: the refresh resolved).
- An organisation's settings read that failed was reported at consent as a bad sign-in (401), not
  as an outage (red: "answers 503 ... cannot be read" got 401).
- There was no door to turn it on or off: `GET`/`PUT /api/tenant-config/:id/claude-connector` were 404.
- Two general settings doors stored `claudeConnector` for an administrator: `PATCH
  /api/organizations/:id/settings` (red dbtest, 200 and stored) and `PATCH /api/ana/platform/settings`
  (found by this item's dbtest, see Residual R1). `PATCH /api/tenant-config/:id/settings` answered
  200 and silently dropped the key.

## What changed

| File | Change |
|---|---|
| `server/mcp/auth/connector-enablement.ts` (new) | The one rule: `claudeConnectorEnabled(settings)` is true only for `claudeConnector: { enabled: true }` (absent, `false`, `"true"`, a bare `true` are all off); `namesClaudeConnector(patch)`; the three refusal sentences. No I/O, so the route and the connector share it without importing each other. |
| `server/mcp/auth/platform-token.ts` | `verifyPlatformBearer` (the one verifier, for `/mcp` and consent) reads the membership and the setting together, on every call. Off → `ConnectorNotEnabledError` (an `InvalidTokenError`: `/mcp` answers 401 `invalid_token` with the reason). A read that fails → `ServerError` ("The organisation could not be checked"), never a pass. New export `findGrantMembership` for the `/token` exchanges: off → `InvalidGrantError` with the reason, read failure → `ServerError`. |
| `server/mcp/auth/consent.ts` | `ConnectorNotEnabledError` → 403 `access_denied` with the reason; no code is issued. |
| `server/mcp/auth/provider.ts` (P0-4b's file) | **One call**, as the item allows: `liveGrantorMembership` calls `findGrantMembership` instead of `store.findMembership` (plus the import). It runs before the refresh rotation, so a refused grant is left as it was and turning the connector back on restores it. P0-4b's own edits in this file are theirs; the P1-47 lines are the import on line 36 and lines 193–195. |
| `server/mcp/auth/store.ts`, `server/mcp/index.ts` | Comments only: where the setting arrives, and how the two switches compose. |
| `server/routes/tenant-config.ts` | The owner-only guard and its door. `GET /:tenantId/claude-connector` (any member of the organisation: `{ connector: { enabled, canChange } }`). `PUT /:tenantId/claude-connector` (`{ enabled: boolean }`, strict): the organisation's **owner** only; an administrator, platform staff and another organisation's owner get 403. It writes through the one audited settings writer, so the setting and its chained `tenant_settings_changed` row commit or roll back together. `PATCH /:tenantId/settings` naming `claudeConnector` → 403. `PATCH /settings/:section` does not know the section (400); a reset keeps the stored value. |
| `server/services/tenant/tenant-settings-writer.ts` (P1-49's file) | **One entry**, `VALUE_AUDITED.claudeConnector = ['enabled']`, so the audit row carries the value before and after. P1-49's README (R2) assigns this entry to P1-47; it is the "schema key" the item names, which moved out of `tenant-config.ts` with the writer. P1-49's other lines in this file are unchanged. |
| `client/src/concept2cure/v2/surfaces/ClaudeConnectorSetting.tsx` (new), `AdminAccess.tsx` | Admin → Settings shows "Connector for Claude" for every member. The owner (the server's `canChange`) gets a switch with a confirm step; anyone else sees On/Off and "Only the organisation's owner can change this." A failed or unrecognised read is "Could not be read", never "Off". A refused change says it was not changed. After a change the setting is read again. AdminAccess gains one import and one render line. |
| `docs/adr/0014-launch-security-and-data-protection-decisions.md` §10 | One sentence: how the organisation switch composes with P-2. |

**Live, no cache.** The item points at `orgMembership.ts`'s cache-and-fail-closed pattern. The setting
arrives on the organisation row that `findMembership` already joins on every connector request,
uncached, so a cache could only make the check less current. The fail-closed half applies: a read
that fails refuses (500 at `/mcp`, 503 at consent, `server_error` at `/token`).

**Fixtures now enabled** (happy paths that need the connector on; each carries a comment naming P1-47):
`server/mcp/__tests__/mcp-standing-unreadable.test.ts` (the mocked membership's
`organizationSettings`), `mcp-connector.dbtest.ts`, `mcp-consent-delegated.dbtest.ts`,
`mcp-account-standing.dbtest.ts` (the seeded organisation's `settings`; in the last, which P0-4b is
also editing, only the `INSERT INTO organizations` statement changed). Also
`mcp-connector-enablement.test.ts`: the mocked grant rows gained `issuedAt`, which
`liveGrantorMembership` reads (the red was taken before that read existed).

## Tests: red and green

| Test | Red (unfixed code) | Green |
|---|---|---|
| `server/mcp/__tests__/mcp-connector-enablement.test.ts` | `red/mcp-connector-enablement.test.txt`: 16 failed / 3 passed (the 3 are the enabled controls) | `green/…test.txt`: 19/19 |
| same, after the `issuedAt` fixture fix | `red/mcp-connector-enablement.test.token-mutant.txt`: `findGrantMembership`'s check disabled, so the two `/token` "not enabled" cases fail and nothing else does | — |
| `server/routes/__tests__/tenant-config-claude-connector.test.ts` | `red/tenant-config-claude-connector.test.txt`: 19 failed / 4 passed (null body, the control, the section door, the reset already held) | `green/…test.txt`: 23/23 |
| `server/mcp/__tests__/mcp-connector-enablement.dbtest.ts` (PostgreSQL, NOBYPASSRLS runtime role, RLS on) | `red/mcp-connector-enablement.dbtest.txt`: 13 failed / 5 passed | `green/…dbtest.txt`: 19 passed, **2 failed: Residuals R1 and R2** |
| `client/src/concept2cure/v2/__tests__/claudeConnectorSetting.test.tsx` | `red/claudeConnectorSetting.test.txt`: AdminAccess without the render line; 6/6 fail on the missing setting (the Settings tab renders) | `green/claudeConnectorSetting.test.txt`: 6/6, with `adminAccessHonesty` and `adminAccessNoFixtures` (20/20) |

The dbtest was restructured. The two doors outside tenant-config moved to a final describe, each
after a control showing the door is open to the administrator, so their failure cannot cascade. The
seeded organisation has an active subscription so the AnA door's paid-access check does not refuse
first.

Neighbours:
- `green/neighbours-unit.txt`: 131/132. The one failure is
  `review-round-1.test.ts › the SCIM group handler is where the test thinks it is`, which is P1-49's
  residual R1 (a regex on `scim.ts`) and unrelated to this change.
- `green/neighbours-db.txt`: 113/113. These are the four MCP dbtests,
  `delegated-credential-scope`, `admin-change-audit`, `compliance-reports`, `organizations-writes` and
  `role-config-change-audit`.

## Gates (`gates/`)

| Gate | Result |
|---|---|
| ESLint, all 18 changed files | 0 errors. 0 new warnings: AdminAccess.tsx has the same 5 warnings as HEAD (rules and lines unchanged); every other file is clean. |
| `check:security-patterns` | 0 violations |
| `ci:server-error-leaks` | OK, no file gained a site |
| `ci:sign-ceremony` | OK |
| `ci:unreferenced-modules` | 82 (baseline 82) |
| `ci:untracked-imports` | Nothing committed yet, so it checked nothing. `--all` lists `connector-enablement.ts` and `ClaudeConnectorSetting.tsx` as imported but untracked: commit them with their importers. |
| `ci:launch-scope-api` | **FAILS**: `[unmapped] /api/tenant-config/:p/claude-connector called by admin-console`. See Residual R3. |

No migration: the setting is a key in the existing `organizations.settings`.

## What remains

- **R1: AnA platform controller. Closed** (P1-49 fix round; confirmed by `iam-25/green/mcp-connector-enablement.dbtest.txt`:
  the administrator naming the key gets 403, nothing stored). Original finding: (`server/services/ana-platform-controller.ts`, P1-49's lane). An
  administrator turns the connector on with `PATCH /api/ana/platform/settings {"claudeConnector":{"enabled":true}}`.
  The same applies to `/ai-config` and `/execute` (category `settings`), which also reach
  `updateSettings`. Proven: green dbtest, 200, stored. Exact change, in `updateSettings` after the
  `const named = …` line:
  ```ts
  if (namesClaudeConnector(named)) {
    return { success: false, action: 'update_settings', error: CONNECTOR_NOT_A_GENERAL_SETTING };
  }
  ```
  with `import { CONNECTOR_NOT_A_GENERAL_SETTING, namesClaudeConnector } from '../mcp/auth/connector-enablement';`.
  The route already maps `success: false` to 403.
- **R2: organizations settings door. Closed** (P1-49 fix round; confirmed by `iam-25/green/mcp-connector-enablement.dbtest.txt`:
  the administrator naming the key gets 403, nothing stored). Original finding: (`server/routes/organizations-routes.ts`). An administrator turns
  it on with `PATCH /api/organizations/:id/settings {"settings":{"claudeConnector":{"enabled":true}},"reason":"…"}`.
  Proven: red and green dbtest, 200, stored. Exact change, after the "non-empty object" check:
  ```ts
  if (namesClaudeConnector(settingsUpdate)) {
    return res.status(403).json({ success: false, error: CONNECTOR_NOT_A_GENERAL_SETTING });
  }
  ```
  with the same import (`'../mcp/auth/connector-enablement'`). This door is also a second settings
  writer, beside the shared one: it is not chained, it records section names only, and it replaces
  sections whole. Moving it onto `writeTenantSettings` is the zero-duplication fix, beyond this item.
  Until R1 and R2 land, "an administrator is refused" holds only for tenant-config's doors.
- **R3: launch scope. Closed** (INF-35, control tower decision 2026-10-01; see the last section). Original finding:
  (`shared/constants/ui-surface-registry.ui-v2.ts`). Add `'/api/tenant-config'`
  to the `admin-console` entry's `apiPrefixes`, with a dated comment. Production refuses an unmapped
  path (`LAUNCH_SCOPE_API_UNATTRIBUTED` unset = enforce), so until this lands the owner's door is
  refused in production. No organisation can turn the connector on there, and the connector stays
  closed for everyone (it fails closed, not open). The prefix matcher works on whole segments, so this
  also makes tenant-config's other routes reachable in production. They are admin-gated and audited
  through the one writer, but that decision belongs to the control tower.
- The two red dbtest cases (R1, R2) flip to green when those lines land; they are kept red on purpose.
- Committing: `provider.ts` holds P0-4b hunks beside the P1-47 lines, and `tenant-settings-writer.ts` is
  P1-49's new file with one P1-47 entry. Stage per item.

## Fix round (2026-10-01): IAM-24, IAM-25, INF-35

The verifier sent back three findings. Base: HEAD `0812a990` plus the shared working tree, which now
includes P1-49's fix round. That round added `namesClaudeConnector` refusals to
`AnaPlatformController.updateSettings` and to `PATCH /api/organizations/:id/settings`, in P1-49's files.
New evidence is under `red/fix-round/`, `green/fix-round/` and `gates/fix-round/`. This section replaces
R1, R2 and R3 in "What remains" above.

| Finding | Outcome |
|---|---|
| IAM-24: settings doors outside tenant-config let an administrator turn the connector on | **Fixed.** The refusal now sits in the one settings writer, so it does not depend on each door. |
| IAM-25: no product path makes anyone the owner, so no one can turn it on | **Reproduced. Blocked on a product decision.** It fails closed. The decision now changes one constant. |
| INF-35: `ci:launch-scope-api` fails, and production refuses the owner's door | **Not fixed here.** It needs the control tower's decision on a file this item does not own. The exact line is given, with a run showing it clears the gate. |

### IAM-24: the writer refuses, not only each door

**What was wrong at the start of this round.** P1-49's per-door refusals made R1 and R2 pass: in
`red/fix-round/mcp-connector-enablement.dbtest.txt`, both of those cases pass. But the shared writer
still accepted a connector change from any caller. The new probe door writes through
`writeTenantSettings` and has no check of its own, as a door added later might not. On real PostgreSQL,
as the runtime role with RLS enforced, an administrator used that door to turn the connector on. The
change was recorded, and the member's connector token then **opened `/mcp`**. The red run shows
`status 200, stored {enabled:true}, recorded 1, mcp 200`.

**What changed.**

| File | Change |
|---|---|
| `server/mcp/auth/connector-enablement.ts` | `claudeConnectorChanged(before, after)` is true for any change to the stored setting: on, off, null, or the key removed. `ConnectorSettingRefusedError` has code `CLAUDE_CONNECTOR_OWN_DOOR`, `statusCode` 403 and the message `CONNECTOR_NOT_A_GENERAL_SETTING`. The header now describes the enforcement accurately: one door, enforced in the writer. The organizations door does not use the writer, so it relies on its own check. |
| `server/services/tenant/tenant-settings-writer.ts` (P1-49's file; their README's R2 names "one refusal in the shared writer" as the fix) | `SettingsWrite.connectorDoor?: true` (lines 82–87). After reading the row under its lock, `writeTenantSettings` throws `ConnectorSettingRefusedError` when a write without the flag would change `claudeConnector`. This happens before the UPDATE (lines 113–121). The catch rolls back, so nothing is written or recorded. Import on line 22. P1-49's other lines are unchanged. |
| `server/routes/tenant-config.ts` | The connector's `PUT` passes `connectorDoor: true` (line 492). It is the only caller that does. |

**What the writer now covers.** Every write to `organizations.settings` that goes through
`writeTenantSettings` is covered. That means tenant-config's PATCH `/settings`, `/settings/:section` and
reset, and every AnA controller write: `updateSettings`, `toggleModule`, `configureAI`,
`setComplianceDefaults`, `onboardOrganization` and `executeAction`. `PATCH /api/organizations/:id/settings`
does not go through the writer (DP-69). It is covered only by its own `namesClaudeConnector` check (P1-49
fix round), which the dbtest proves: 403, nothing stored. Moving it onto the writer is still open (R5 below).

**Claims.** The `connector-enablement.ts` header now states what holds. The client's "Only the
organisation's owner can change this." is now true at the server, so it is unchanged.

| Test | Red (unfixed writer) | Green |
|---|---|---|
| `server/routes/__tests__/tenant-config-claude-connector.test.ts`, new describe "the one settings writer refuses …" (a probe door through the real writer; on, off, null, and removed by a whole-object replace; plus two controls) | `red/fix-round/tenant-config-claude-connector.writer-chokepoint.txt`: 4 failed, 25 passed (the 2 controls pass) | `green/fix-round/unit-connector.txt`: 29/29, plus `mcp-connector-enablement.test` 19/19 |
| `server/mcp/__tests__/mcp-connector-enablement.dbtest.ts`, probe door control and refusal (PostgreSQL, NOBYPASSRLS runtime role, RLS on) | `red/fix-round/mcp-connector-enablement.dbtest.txt`: the probe refusal fails (200, stored, recorded, `/mcp` 200). The AnA and organizations cases pass because of P1-49's per-door lines. | `green/fix-round/mcp-connector-enablement.dbtest.txt`: 24 passed, 1 expected fail (IAM-25, below) |

### IAM-25: who opens the connector. Reproduced, and blocked on the product's decision

**Reproduced on PostgreSQL** through production's own sign-up and e-mail verification
(`registerPlatformRoutes`, as `tests/db/memberships.dbtest.ts` mounts them):

- The organisation is created with one membership, its creator's, with role **`admin`**.
- That creator reads `canChange: false`, and their `PUT {enabled:true}` returns **403**.

See `red/fix-round/mcp-connector-enablement.dbtest.txt`, the "IAM-25 (open)" case. Nothing in the product
writes `owner` to `organization_users.role`:

- Sign-up (`server/routes/auth.ts:1007-1011`) and first-run setup (`server/routes/setup.ts:191`) write `admin`.
- `tenant-users` (`:31`, `:45`) and SCIM (`scim.ts:70`) assign admin, manager, member or viewer.
- SSO assigns `member`.

The earlier rounds' dbtests passed only because they plant an `owner` row through the table owner's pool.

**What this round changed. It takes no decision:**

- **One predicate.** `connector-enablement.ts` now has `CONNECTOR_OPENER_ROLE` (line 49, `'owner'`) and
  `mayChangeClaudeConnector(role)`. Both of tenant-config's checks read it: `canChange` at line 465 and the
  `PUT` guard at line 479. Decision (b) below is therefore that one constant, plus copy and the ADR.
- **The member-facing sentence no longer claims what is false.** `CONNECTOR_NOT_ENABLED` is shown at
  consent, `/mcp` and `/token`. It said "The organisation's owner can turn it on in the organisation's
  settings." Today no one holds that role, and production refuses the door (INF-35). It now reads "The
  connector for Claude is not enabled for this organisation." `CONNECTOR_NOT_A_GENERAL_SETTING` now
  states the rule instead of a capability: "It has a setting of its own, which only the organisation's
  owner can change."
- **The acceptance test for the decision**, in the dbtest's last describe:
  - A plain `it` asserts the facts: sign-up and verification succeed, one membership, role `admin`.
  - `it.fails('IAM-25 (open): that creator is told they can change it, and turns it on')` fails today.
    Either decision makes its body pass, and `it.fails` then turns red until it becomes `it`. This was
    shown, not assumed. In `red/fix-round/mcp-connector-enablement.dbtest.iam25-opener-admin-mutant.txt`,
    `CONNECTOR_OPENER_ROLE = 'admin'` gives "Expect test to fail". The mutant was reverted at once and
    the file restored byte for byte.

**Deliberately unchanged:**

- ADR-0014 §10. Its decision text, "An organization's owner enables it", is the founder's, and the
  decision stands until the product changes it. Decision (b) amends it.
- The client copy. It states the rule.

**The decision (product owner).** Either option fixes IAM-25; the acceptance test passes under both.

- **(a) The product provisions an organisation owner.**
  - Sign-up (`auth.ts:1007-1011`, and the `role: 'admin'` claim and scope at `:1057` and `:1134`) and
    setup (`setup.ts:191`) give the creator `owner`.
  - Add `'owner'` to tenant-users' enums (`:31`, `:45`), with a transfer flow: only an owner makes an
    owner, and the last owner cannot be demoted or removed.
  - Decide whether SCIM may assign it.
  - Every admin-only check must treat `owner` as at least `admin`. That includes `tenant-config.ts:248,307,374`,
    about 24 `=== 'admin'` sites and 11 `requireRole(…'admin'…)` sites in `server/`. Some already admit
    `owner`: `tenant-users.ts:99`, `organizations-routes.ts:72`, `ana-platform-control.ts:48`.
  - Existing organisations each need an owner. That is an idempotent migration under Rule 1, for example
    the earliest admin where no owner exists.
  - The P1-2b authenticator requirement already names owners.
  - Nothing in P1-47 changes.
- **(b) The administrator opens it.**
  - Set `CONNECTOR_OPENER_ROLE = 'admin'`.
  - Change "owner" to "administrator" in `CONNECTOR_OWNER_ONLY`, `CONNECTOR_NOT_A_GENERAL_SETTING` and
    `ClaudeConnectorSetting.tsx:52,118`, and amend ADR-0014 §10's decision sentence.
  - In the tests, the PUT caller becomes `admin` and the refused roles become manager, member, viewer,
    staff and another organisation's admin. The dbtest's admin-refusal cases move to a manager, and the
    `it.fails` becomes `it`.
  - The AnA and organizations doors are admin-gated too. They still refuse the key by name, and the
    writer keeps the connector's own audited door the only one that changes it.

Until one of these lands, the connector stays closed for every organisation. That fails closed.

### INF-35: the launch-scope gate. The exact line, proven, for the control tower

`npm run ci:launch-scope-api` still fails (`gates/fix-round/ci:launch-scope-api.txt`) with exactly this
item's path, `[unmapped] /api/tenant-config/:p/claude-connector called by admin-console`. With
`LAUNCH_SCOPE_API_UNATTRIBUTED` unset, production refuses that path. The fix is in
`shared/constants/ui-surface-registry.ui-v2.ts`, which this item does not own. Making it opens more
than the connector in production, so it is the control tower's decision.

**The exact change**, on the `admin-console` entry (around line 1325):

```ts
    // '/api/tenant-config' (2026-10-01, P1-47): Admin → Settings reads and changes the
    // connector for Claude (ClaudeConnectorSetting.tsx). Whole-segment match, so tenant-config's
    // settings routes are reachable in production too (admin-gated, audited through the one writer).
    apiPrefixes: ['/api/admin/access', '/api/admin/scim-tenants', '/api/api-keys', '/api/setup', '/api/tenant-users', '/api/mdx/admin', '/api/tenant-config'],
```

**Proof that it clears the gate.** `gates/fix-round/inf35-launch-scope-with-registry-line.txt` runs the
gate's own `checkLaunchScopeApi` twice in one process. The registry as it is gives 1 violation. With the
line added in memory gives **0 violations**. The registry file was not edited.

**What else it opens.** The same run shows `/api/tenant-config/:id/settings` and `/settings/reset` moving
from `unmapped` to `launch`. The routes the prefix makes reachable in production are:

- `GET /:id/settings`
- `PATCH /:id/settings`, admin or super_admin
- `POST /:id/settings/reset`, admin or super_admin
- `PATCH /:id/settings/:section`, admin or super_admin
- `GET` and `PUT /:id/claude-connector`

Every write goes through the one audited writer.

**Alternatives that avoid widening `/api/tenant-config`:**

- Mount the connector door under `/api/organizations`, which is on `LAUNCH_PLATFORM_API`. That puts it in
  `organizations-routes.ts`, beside that file's unchained settings writer.
- Mount it under `/api/admin/…`, which is `NEVER_GATED`. That needs a new mount in `server/bootstrap/`.

Both change files this item does not own, and both move the door, the client and the tests.

**For the commit.** `ClaudeConnectorSetting.tsx` is what makes the gate fail. Committing it without
the registry line turns CI's launch-scope step red (`.github/workflows/ci.yml:346`). The step is not
in pre-push.

### Suites and gates, this round

- Unit, `green/fix-round/neighbours-unit.txt`: **202/202**, in 17 files. These are the first round's
  12 files, the two connector suites, the client connector test, `adminAccessHonesty` and
  `adminAccessNoFixtures`. `review-round-1` now passes, since P1-49 closed its own residual.
- Database, `green/fix-round/neighbours-db.txt`: **131/131**, in 9 files. These are the first round's
  8 files plus `tests/db/memberships.dbtest.ts`.
- ESLint, all 18 item files (`gates/fix-round/eslint.txt`): 0 errors. The only warnings are
  `AdminAccess.tsx`'s 5, the same rules HEAD has. The dbtest crossed `max-lines` (520) with the new
  cases, so it was compacted: one `sessionFor` helper, a shorter cleanup list and shorter expects, with
  no assertion changed. Green was re-run after the compaction.
- `check:security-patterns`: 0 violations.
- `ci:server-error-leaks`: OK.
- `ci:sign-ceremony`: OK.
- `ci:unreferenced-modules`: 82, the baseline.
- `ci:untracked-imports`: nothing committed yet.
- `ci:launch-scope-api`: **fails**, INF-35 above.
- `ci:untracked-imports --all`: lists, among others, `organizations-routes.ts:13`,
  `ana-platform-controller.ts:41` and `tenant-config.ts:30` importing `connector-enablement.ts`. The first
  two are **P1-49's** fix-round lines. `tenant-settings-writer.ts` (untracked) now imports it as well.
  **`server/mcp/auth/connector-enablement.ts` must be committed with or before P1-49's commit.**
- No migration.

### What remains after the fix round

- **R3 → INF-35**: **closed**, the registry line (see the last section).
- **IAM-25**: **closed**, decision (b), the administrator (see the last section).
- **R5 (DP-69)**: `PATCH /api/organizations/:id/settings` writes `organizations.settings` without the shared
  writer. It has no row lock, its audit row is written after the UPDATE, and it is unchained. For the
  connector it depends on its own name check alone. Moving it onto `writeTenantSettings` would bring it
  under the writer's refusal; that belongs to that file's owner.
- **R6 (minor)**: if an AnA route that lacked its own name check ever reached the writer's refusal, it
  would answer 500 "The settings could not be saved." (`ana-platform-control.ts` `notSaved`), not 403.
  The setting fails closed, but the status is wrong. One branch on `ConnectorSettingRefusedError` in
  that route's catch would fix it. All of its paths today refuse by name first, with 403.
- **Staging**:
  - `tenant-settings-writer.ts` is P1-49's file. It holds two P1-47 hunks: the `VALUE_AUDITED` entry
    and the `connectorDoor` refusal with its import.
  - `provider.ts` holds P0-4b hunks beside P1-47's.
  - `connector-enablement.ts` precedes P1-49's commit.

## IAM-25 and INF-35 (control tower decision)

Date: 2026-10-01. Base: HEAD `f8d40474` plus the shared working tree. Evidence is under `iam-25/`
(`red/`, `green/`, `gates/`).

**The decision (product owner, 2026-10-01).** Each organisation's **owner or administrator** turns the
connector for Claude on or off. No product path writes `owner` to `organization_users.role`, because
sign-up and setup write `admin`. So with the owner alone, no organisation could ever turn it on. The
customer's administrator is the customer's highest in-product role, so the customer still decides. This
is option (b) in the fix round above. `owner` stays on the list, so an owner the platform provisions, if
one ever exists, is not locked out.

**INF-35 (control tower).** `'/api/tenant-config'` is added to the `admin-console` entry's `apiPrefixes`.
The organisation settings API belongs to the admin console. It is admin-gated and audited through the
shared writer.

Unchanged:
- There is still one door, `PUT /api/tenant-config/:tenantId/claude-connector`, audited through
  `tenant-settings-writer.ts` (`connectorDoor: true`).
- Every general settings door still refuses a body that names the key, with 403, whatever the caller's
  role: tenant-config `PATCH /settings`, the AnA controller's `updateSettings`, and
  `PATCH /api/organizations/:id/settings`.
- The writer still refuses every other change.

### What changed

| File | Change |
|---|---|
| `server/mcp/auth/connector-enablement.ts` | `CONNECTOR_OPENER_ROLE = 'owner'` is replaced by `CONNECTOR_OPENER_ROLES = ['owner', 'admin']` (frozen). `mayChangeClaudeConnector` admits a string on that list, compared exactly, as `requireRole` compares roles. `CONNECTOR_OWNER_ONLY` is renamed `CONNECTOR_OPENER_ONLY`: "Only the organisation's owner or administrator can turn the connector for Claude on or off." `CONNECTOR_NOT_A_GENERAL_SETTING` now ends "…which only the organisation's owner or administrator can change." The header's "Who opens it" paragraph states the decision and its reason. |
| `server/routes/tenant-config.ts` | The import rename, the PUT's 403 body, and the comments: the route block, the PATCH `/settings` refusal ("whoever asks") and the body schema. The only logic change is the predicate above. |
| `client/src/concept2cure/v2/surfaces/ClaudeConnectorSetting.tsx` | It already took `canChange` from the server (`GET …/claude-connector`) and decided nothing itself. Only the copy changed: "Only the organisation's owner or administrator can change this." and the 403 note "The setting was not changed. Only the organisation's owner or administrator can change it." |
| `shared/constants/ui-surface-registry.ui-v2.ts` | `'/api/tenant-config'` on `admin-console`, with a dated comment (INF-35). |
| `docs/adr/0014-launch-security-and-data-protection-decisions.md` §10 | "An organization's owner or administrator enables it", plus one sentence giving the reason: there is no separate owner role in `organization_users`, and the administrator is the customer's highest role. The P-2 sentence is kept, and its closing clause now says "owner or administrator". |
| Tests | `tenant-config-claude-connector.test.ts`, `mcp-connector-enablement.dbtest.ts` and `claudeConnectorSetting.test.tsx` were updated to the decision **before** the code (below). `mcp-connector-enablement.test.ts` does not pin the role; only its header comment changed. |

### Tests: red and green

| Test | Red (tests updated, code unchanged) | Green |
|---|---|---|
| `server/routes/__tests__/tenant-config-claude-connector.test.ts` | `iam-25/red/…test.txt`: **14 failed / 21 passed** | `iam-25/green/unit-connector.txt`: **35/35** |
| `client/src/concept2cure/v2/__tests__/claudeConnectorSetting.test.tsx` | `iam-25/red/claudeConnectorSetting.test.txt`: **2 failed / 4 passed** (the two copy assertions) | same file: **6/6** |
| `server/mcp/__tests__/mcp-connector-enablement.test.ts` | not applicable (header comment only) | same file: **19/19** |
| `server/mcp/__tests__/mcp-connector-enablement.dbtest.ts` (PostgreSQL, NOBYPASSRLS runtime role, RLS on) | `iam-25/red/…dbtest.txt`: **7 failed / 20 passed** | `iam-25/green/…dbtest.txt`: **27/27** |
| `npm run -s ci:launch-scope-api` | `iam-25/red/ci-launch-scope-api.txt`: exit 1, `[unmapped] /api/tenant-config/:p/claude-connector called by admin-console` | `iam-25/gates/ci:launch-scope-api.txt`: exit 0, "284 API paths … none refused" |

**The unit route test's 14 reds:**
- The administrator's read: `canChange` true. 2 cases.
- The administrator's PUT: enable, disable, three malformed bodies, and the audit rollback. 6 cases. On the
  unchanged code the role check answers 403 before the body check, so the malformed bodies fail as well.
- Six refusals (manager, member, viewer, super_admin, and another organisation's administrator and owner).
  They still answered 403, but the message did not name the administrator. 6 cases.

**Passing on red, as they should:**
- The owner's read and PUT.
- The manager, member and viewer reads.
- The general doors refusing the key for admin, owner, super_admin and member.
- The writer chokepoint.

**The dbtest's 7 reds:**
- Direct:
  - the administrator's `canChange`
  - the administrator's PUT, 403
  - the sign-up creator (an `admin` through production sign-up and verification) opening it
- Following from the refused PUT:
  - the token admitted
  - a member's consent
  - the disable
  - the refresh token at `/token`

**Passing on red, as they should:**
- A manager, a member and another organisation's administrator are refused at the PUT. The 403 is
  checked to be the connector door's own, not the boundary's.
- The administrator is refused by every general door, and nothing is stored: tenant-config
  `PATCH /settings`, `PATCH /settings/claudeConnector`, AnA `PATCH /api/ana/platform/settings`,
  `PATCH /api/organizations/:id/settings`, and the probe through the writer.

**How the dbtest was restructured:**
- It seeds `admin`, `manager` and `member` in the organisation, plus an `admin` of a second
  organisation. It no longer plants an `owner` row, which no product path writes; the unit test covers
  the owner.
- The cases for the doors outside tenant-config now compare the stored setting before and after, not a
  fixed `{enabled:false}`. Each one fails only on its own door.
- The IAM-25 `it.fails` became `it`.
- After the red run, the file was compacted under `max-lines` (500): an `insertOrg` helper and one-line
  expects. No assertion changed, and both green runs came after the compaction.

**R1 and R2 are closed.** In `iam-25/green/mcp-connector-enablement.dbtest.txt`, the administrator who now
legitimately holds the connector's own door names the key at `PATCH /api/ana/platform/settings` (R1) and
at `PATCH /api/organizations/:id/settings` (R2). Each gets 403, nothing is stored and the token is still
refused. Both doors' controls (another setting, 200) pass, as the P1-49 fix round reported.
`tests/db/role-config-change-audit.dbtest.ts` covers the same refusals through `/ai-config`, `/execute`
(settings and ai_config) and the bare organizations body (20/20 below).

**Neighbours:**
- `iam-25/green/neighbours-unit.txt`: **188/188**, in 16 files:
  - `server/mcp/__tests__/*` (unit, 6 files)
  - `tenant-config-audit` and `tenant-config-claude-connector`
  - `ana-platform-control`
  - the registry readers: `launch-scope-api-gate`, `ana-launch-scope`, `surfaceRouting` and
    `moduleCatalogReconciliation`
  - `adminAccessHonesty`, `adminAccessNoFixtures` and `claudeConnectorSetting`
- `iam-25/green/neighbours-db.txt`: **84/84**, in 5 files:
  - `mcp-connector` 11
  - `mcp-consent-delegated` 10
  - `mcp-connector-enablement` 27
  - `mcp-account-standing` 16
  - `role-config-change-audit` 20

### Gates (`iam-25/gates/`)

| Gate | Result |
|---|---|
| ESLint, the 8 changed code files | 0 errors. 1 warning, the registry's `max-lines` (1277), which it had before (both runs are in the file). **0 new warnings.** |
| `check:security-patterns` | 0 violations (2977 files) |
| `ci:launch-scope-api` | **OK**: 284 paths, none refused (`{"launch":237,"never-gated":45,"infrastructure":2}`) |
| `ci:launch-scope-api:selftest` | PASSED |
| `ci:launch-scope` | OK |
| `ci:untracked-imports` | OK (64 files) |
| `ci:untracked-imports --all` | exit 1, as before: `connector-enablement.ts`, `ClaudeConnectorSetting.tsx` and `tenant-settings-writer.ts` are still untracked, along with older unrelated entries. Commit them with their importers. |
| `tsc`, narrowed to the changed files (`tsc-targeted.txt`) | Only environmental errors: this container has no `@types/jsonwebtoken`, and vite's ambient types are outside the narrowed include. None is on a changed line. The full `npm run typecheck` was not run here because it needs 24 GB. |

### What remains

- **R5 (DP-69)** and **R6** above: unchanged.
- **R7 (new, found this round; not in this item's files).** `server/routes/ana-tool-policy.ts:82-95`
  reads the whole `organizations.settings` with no lock, sets `anaToolPolicy` and writes the whole
  object back. If the connector's door commits between that read and that write, the write puts back
  the connector value it read. No connector audit row is written for that revert, so a connector turned
  off can come back on (fail-open). It needs a race, so it is unlikely, but it is real. The fix is the
  zero-duplication one: move that write onto `writeTenantSettings`, which locks the row and would refuse
  the change. That belongs to the file's owner.
- **What INF-35 opens in production.** All of `/api/tenant-config` is now attributed to the launch scope,
  not only the connector door:
  - `GET /:id/settings`: own organisation; `super_admin` any.
  - `PATCH /:id/settings`, `POST /:id/settings/reset` and `PATCH /:id/settings/:section`: `admin` or
    `super_admin`, every write through the one audited writer.
  - `GET` and `PUT /:id/claude-connector`.

  The control tower accepted this.
- The role that now opens the connector is one ADR-0014 §4 (P1-2b) requires an authenticator for.
  Whether P1-2b is enforced is outside this item.
- **Staging.**
  - Untracked: `connector-enablement.ts`, `ClaudeConnectorSetting.tsx`, the three connector test files
    and `tenant-settings-writer.ts`.
  - Tracked and modified by this round: `tenant-config.ts`, `ui-surface-registry.ui-v2.ts` and
    ADR-0014.
  - The registry line and `ClaudeConnectorSetting.tsx` should land in the same commit, or CI's
    launch-scope step goes red.
