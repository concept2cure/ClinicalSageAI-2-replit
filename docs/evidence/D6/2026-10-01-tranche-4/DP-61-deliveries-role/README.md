# DP-61 — a report delivery carries the finalize tier

Found 2026-10-01 by the adversarial review of P1-44. `POST /api/report-os/deliveries` writes an outbound regulatory
letter (`platform_send`) or records an external export, and sat behind `authMiddleware` alone, while finalize requires
`requireRole(owner, admin, manager)`. Any member could write an outbound letter and its chain row. The route now
carries the same gate. No client calls it.

| Check | Red | Green |
|---|---|---|
| `report-os-delivery-recording.test.ts`, "a member cannot send an outbound letter or record an export" | 201 (`red/deliveries-member.txt`) | 403, nothing written; 40/40 report-os unit cases |
| `tests/db/report-os-delivery-recording.dbtest.ts` (member refused, 403, no letter) and `report-os-tenant-from-session.dbtest.ts` (deliveries now made by a manager of the organisation) | — | 27/27 on PostgreSQL 16 as app_service, RLS on (`green/deliveries-member.txt`) |
