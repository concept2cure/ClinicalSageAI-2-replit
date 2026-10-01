# P1-41 follow-up — a role change revokes the cached membership

Found by the adversarial review of P1-41: the in-product role change (PATCH /api/tenant-users/:org/:user) did not call
`invalidateOrgMembershipCache`, which the removal already did, so a demoted administrator kept the old role for up to
the 60-second cache TTL per instance after the audited change. The PATCH now invalidates after the change commits
(not on an unchanged role, not when the audit write refused the change).

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/tenant-users-audit.test.ts`, "revokes the cached membership once the change commits" | `red/role-change-cache.txt`: nothing invalidated | `green/role-change-cache.txt`: 40/40 with the tenant-users isolation contract |
