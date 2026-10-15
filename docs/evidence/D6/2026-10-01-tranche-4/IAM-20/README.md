# IAM-20 — the AnA platform controller is a second door to organisation configuration

**Found** 2026-10-01 by the adversarial review of P1-41 (and again by the P0-12 review). **Severity** High:
any member could change organisation-wide configuration.

**What was wrong.** `server/routes/ana-platform-control.ts`, mounted at `/api/ana/platform`
(`server/bootstrap/register-inline-routes.ts`), sits behind the session gate alone. Its writes —
`PATCH /settings`, `POST /modules/toggle`, `POST /projects`, `PATCH /projects/:id`, `PATCH /ai-config`,
`PATCH /compliance`, `POST /onboard`, and `POST /execute`, which dispatches any of them — change the same
`organizations.settings` that `/api/tenant-config` lets only organisation admins change (and, since P1-41,
audits). No client calls these routes; AnA's agentic layer was their intended caller.

**What is true now.** Every non-read method in the router passes `requireRole('owner', 'admin')` first (the
role `requireRole` reads from the membership on each request, P1-4). A member gets 403 and the controller does
not run; an admin's write and a member's read are unchanged.

| Check | Red | Green |
|---|---|---|
| `server/__tests__/routes/ana-platform-control.test.ts`, a member on each of the eight writes | 8 failed: the controller ran for a member (`red/member-writes.txt`) | 12/12 (`green/member-writes.txt`) |

**Still open (registered).** The controller's own audit records key names only, after commit, best-effort
(the reviewer's DP-58 note); converging these writes onto tenant-config's audited `writeTenantSettings` is the
zero-duplication end state.
