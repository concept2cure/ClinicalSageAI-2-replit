# DP-73: the organisation settings door writes through the one settings writer

Date: 2026-10-01. Lane: D6 (security tranche 4). The P1-49 verifier's residual R7 (its README called it "DP-69";
the register renumbered it DP-73 because P1-25 had taken that id). Re-read at head before it was fixed.

## What was wrong

`PATCH /api/organizations/:id/settings` (`server/routes/organizations-routes.ts`) was a second writer of
`organizations.settings` beside `services/tenant/tenant-settings-writer.ts`, which the tenant-config routes, the AnA
platform controller and the tool-policy door all use since P1-49 and R7:

- it replaced whole sections (`{ ...current, ...update }`), so a body naming `security` erased
  `security.maxConcurrentSessions` and any other key it did not repeat (the DP-62 class the writer's `overlaySettings`
  closed for tenant-config);
- it recorded `data_modify` with the section names only, after the change had committed, through `recordAuditRow`:
  a refused row left the change in place (WO-16C's "the change stands"), and the record carried no changed fields.

Reproduced on PostgreSQL (`red/organizations-writes.dbtest.txt`): no `tenant_settings_changed` row with the reason;
with the row refused the door answered 200 and the setting was changed; a partial `security` section erased
`maxConcurrentSessions`.

## Decision (product owner and CSO)

One settings writer, one rule. A settings change and its record commit together, as at tenant-config since P1-41:
this door no longer lets a change stand without its record. The profile door (`PATCH /:id/profile`) keeps WO-16C's
"the change stands, and the answer says the row is missing"; it is not a settings write.

## What changed

- `server/routes/organizations-routes.ts`: the door calls `writeTenantSettings` (`action: tenant_settings_changed`,
  the update laid over the stored settings with `overlaySettings`, the body's sections, the reason). No such
  organisation is a 404; a change to the connector for Claude is refused (403) by the early check and by the writer;
  any other failure is a 500 saying nothing was changed, with no store text. `auditTrail` is
  `{ persisted: true, chained: true }`, since the row committed with the change.
- `server/services/tenant/tenant-settings-writer.ts`: `SettingsWrite.reason`, written to the row's reason column.
- `server/services/audit/compliance-reports/queries/administrative-changes.ts`: the comment says which writer this
  door now uses; the report already selects `tenant_settings_changed`, and still reads the older `data_modify` rows.

## Tests

| Test | Red (head) | Green |
|---|---|---|
| `server/routes/__tests__/organizations-profile-settings.test.ts` (18): the door asks the writer for `tenant_settings_changed` with its reason and sections; the change is laid over the stored settings (a key the body does not name survives); no second, best-effort row; the bare body records no reason; no such organisation is a 404; the writer's connector refusal is a 403; a refused record is a 500 with nothing claimed. The two WO-16C settings cases, which pinned the old after-commit answer, are replaced by these | `red/organizations-profile-settings.txt`: 4 failed | `green/organizations-profile-settings.txt`: 18 passed |
| `tests/db/organizations-writes.dbtest.ts` (9), as `app_service` with RLS on behind the real auth boundary: one chained `tenant_settings_changed` row with the reason; a refused row leaves the setting unchanged; a partial `security` section keeps `maxConcurrentSessions` | `red/organizations-writes.dbtest.txt`: 3 failed | `green/organizations-writes.dbtest.txt`: 9 passed |

Neighbours: `green/neighbour-units.txt` (every unit suite naming the writer, tenant-config, the organisations routes,
the administrative-changes report, the tool-policy door or the platform controller; 212 passed) and
`green/neighbour-dbtests.txt` (`mcp-connector-enablement`, `role-config-change-audit`, `compliance-reports`,
`memberships`; 76 passed). ESLint: `organizations-routes.ts` 2 warnings at head, 1 now.

## What remains

- With this, every door the P1-49 review named records its change in the change's own transaction (P1-49
  `0adb1b3e`, R7 `7801f411`, DP-75 `2ee14691`, this change). A door found later is DP-58's.
- A client that relied on replacing a whole section to drop a key now sets that key to `null`. The only shipped
  caller (`AdminSurfaces.tsx`, the translation policy) sends the whole section and drops nothing.
