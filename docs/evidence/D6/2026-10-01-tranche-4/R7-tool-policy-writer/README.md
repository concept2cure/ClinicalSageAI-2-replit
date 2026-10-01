# R7 — the AnA tool-policy door writes through the one settings writer

Found by the IAM-25 agent (P1-47 lane), 2026-10-01. `PUT /api/ana-tool-policy` (`server/routes/ana-tool-policy.ts`)
read the whole `organizations.settings` object with no lock, set `anaToolPolicy` on it, and wrote the whole object
back, then recorded the change after commit (`recordAuditRow`). A setting changed between the read and the write — the
connector for Claude switched off, a session limit lowered — was reverted with no record; the connector protection of
the shared writer (`ConnectorSettingRefusedError`) never ran on this door. DP-58 class (role and configuration changes
recorded in their own transaction).

Change: the PUT calls `writeTenantSettings` (`server/services/tenant/tenant-settings-writer.ts`): the stored settings
read under a row lock, the policy overlaid in one transaction with the chained audit row. The action keeps its name,
`ana_tool_policy.update`, which `audit.explain` reads; `anaToolPolicy` joins the writer's value-audited sections, so the
row carries the policy before and after as this door's own row did.

- `red/ana-tool-policy.txt`: 2 of 14 failing on the unchanged route (the writer was never called; the route issued its
  own `UPDATE organizations`).
- `green/ana-tool-policy.txt`: 14/14; neighbours (tenant-config, AnA platform control, command RBAC, MDX policy) 329/329;
  PostgreSQL `role-config-change-audit` and `mcp-connector-enablement` 47/47.
