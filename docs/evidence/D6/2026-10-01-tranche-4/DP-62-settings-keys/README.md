# DP-62 — settings writes keep what they do not manage

Found 2026-10-01 by the review of P1-41. `POST /api/tenant-config/:id/settings/reset` replaced the whole settings
object with the tier defaults, erasing `anaToolPolicy` (the organisation's switch-off list for AnA tools: a reset
re-enabled every tool it had turned off) and `security.maxConcurrentSessions` (read by `session-inactivity.ts`). The
whole-settings PATCH replaced each named section, dropping every field the body did not send.

Now one helper, `overlaySettings`, lays the new values over the stored ones (recursing where both hold an object, keeping
any key the write does not name). A reset restores what the tier defaults define; a PATCH merges field by field. The
P1-41 audit test had encoded the defect (it listed `requireQmpForAllProjects` as changed because the section was
replaced whole); its expectation is corrected.

| Check | Red | Green |
|---|---|---|
| `tenant-config-audit.test.ts`, "settings writes keep what they do not manage" (reset; one-field PATCH) | 2 failed: the policy and the session limit erased (`red/tenant-config.txt`) | 10/10; with the security contract suites 421/421; `admin-change-audit` and `organizations-writes` dbtests 15/15 (`green/tenant-config.txt`) |
