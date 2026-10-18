# F17 — The platform-owner grant agrees between navigation and API

The global commercial entitlement gate now calls the same DB-authoritative `resolveMasterAdmin` used by navigation. A verified platform owner gets the same commercial unlock on the API as on the rail. Ordinary organization administrators still require an organization-level module entitlement. The authenticated organization context is preserved.

The release-scope check runs first and still refuses out-of-release capabilities for the owner. The change does not treat tenant `super_admin` role text as a platform grant or widen the selected tenant.

`identity-entitlements-red.log`: the new owner regression failed before remediation (one failure, two existing boundary controls passing). `identity-second-wave-green.log` includes the owner/ordinary/release boundary regression and existing gate, platform-standing and navigation suites after remediation. The first combined run exposed a concurrently added, unclaimed CMC classification path; it was addressed by the CMC owner, and the real-registry scope suite is now green.

The packaging mode remains governed through the existing licensing console; default `off`, with `report` and `enforce` rollout modes. Launch scope remains independent and enforced before that mode. Local test seams do not establish the deployed mode. No external configuration was changed.
