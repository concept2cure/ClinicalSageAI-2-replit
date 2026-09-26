# P1-36 — `POST /api/audit/signatures` wrote an `audit_events` row on the tenant guard alone (DP-38, Low–Medium)

**Row:** D5/D6. **Finding:** `docs/evidence/reviews/2026-09-26/security.md` §3 DP-38, registered in
`docs/security/SECURITY_AUDIT_2026-09-24.md`. **Plan item:** P1-36. **Parent closure:** P1-20 (`../P1-20/`).

## What was wrong

`server/routes/audit-trail-routes.ts:469-513` (at HEAD `7fbe51c5`): the handler for `POST /audit/signatures` ran
`requireAuthedOrgId` (`:471-472`) and then read the body. Every other write in the file has gated on
`requireAuditRecorder` (`server/services/audit/audit-api-authority.ts:77-84`: owner, admin, manager or a platform
administrator) since P1-20 — `POST /audit/events` at `:303`, `POST /audit/events/batch` at `:366`. So any member of
the organisation, a viewer included, could insert a `signature.create` row into `audit_events` with
`regulatory_significant = true`, `gxp_relevant = true`, and a body-supplied `entityType`, `entityId`, `meaning`,
`reason` and `metadata`. The row is labelled non-authoritative, the forgery guard refuses a claimed `signed` status,
and `signed_by` is the principal — so it was never a binding-signature vector — but it was a compliance-record write
outside the role the P1-20 policy text names ("recording an audit event by hand is an administrative act").

## What is true now

`server/routes/audit-trail-routes.ts:480`: `if (!requireAuditRecorder(req, res)) return;` immediately after the tenant
guard and before the body is read, exactly as the two sibling writes do. A viewer, a `user` or a member is answered
403 `AUDIT_WRITE_RESTRICTED` and no `INSERT` runs; the refusal is the role's, so a viewer claiming `signed` meets the
recorder gate, not the forgery guard. An owner, admin or manager still records the marker (201, `authoritative:false`,
one `signature.create` row with `'unverified'` in the SQL literal), and the forgery guard still refuses an owner who
claims `signed`. The route's header comment says why the gate is there (`:469-475`).

No other write in the two files lacks the gate:

| Route | Writes `audit_events`? | Gate |
|---|---|---|
| `POST /audit/events` (`:299`) | yes | `requireAuditRecorder` `:303` (P1-20) |
| `POST /audit/events/batch` (`:355`) | yes | `requireAuditRecorder` `:366` (P1-20) |
| `POST /audit/signatures` (`:476`) | yes | `requireAuditRecorder` `:480` (**this item**) |
| `POST /audit/export/verify` (`:722`) | no — pure verification of a caller-supplied bundle | none needed for a write; see open items |
| `POST /audit/chain-monitor/check` (`:783`) | not a client-recorded event — runs the server's own integrity scan, whose own writer records `audit.chain_integrity_failure` on a break | none; see open items |
| `POST /audit/bulk-delete` (`:795`) | no — always 403 | — |
| `GET /api/audit-trail/ledger` (`audit-trail-ledger.routes.ts`) | no — read only; the file has no write | `requireAuditReader` |

## Evidence

| | File | Result |
|---|---|---|
| red | `red/signatures-before-fix.txt` | HEAD `7fbe51c5`, route unchanged, the P1-36 cases added to the P1-20 suite: **4 failed / 20 passed**. `viewer`, `user` and `member` each got **201** (`expected 201 to be 403`) and a row was written; the viewer claiming `signed` was answered by the forgery guard (`FORGERY_REJECTED`), i.e. the body was read before any role check. The owner/admin/manager success cases and the owner forgery case passed before and after. |
| green | `green/signatures-after-fix.txt` | **52 / 52** across `audit-trail-read-gate.test.ts` (24), the tenant-isolation audit contract, the export tenant-scope suite and the ledger routes suite. The contract suite's manager fixture and its "write endpoints 403 without an authenticated org" case are unchanged and still pass. |
| gates | `green/gates.txt` | `ci:server-error-leaks` OK (145 baselined sites across 89 files; no file gained one); `check:security-patterns` 0 violations across 2,854 files. |
| lint | (this README) | `server/routes/audit-trail-routes.ts` 10 warnings at HEAD → 10 now (0 errors); `audit-trail-read-gate.test.ts` 0 → 0. |

Test: `server/routes/__tests__/audit-trail-read-gate.test.ts`, block `recording a signature marker (DP-38, P1-36)`
— eight cases beside the P1-20 cases they mirror, the real router over the suite's pool double. `afterEach` now
also clears the pool double's `query` call record so a case can count the `INSERT`s it caused.

## Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/routes/__tests__/audit-trail-read-gate.test.ts \
  server/__tests__/security/tenant-isolation-audit-trail.contract.test.ts \
  server/routes/__tests__/audit-export-tenant-scope.test.ts \
  server/routes/__tests__/audit-trail-ledger.routes.test.ts
npm run ci:server-error-leaks
npm run check:security-patterns
```

To see the red again: remove line 480 of `server/routes/audit-trail-routes.ts` and run the first command; the four
refusal cases fail with `expected 201 to be 403`.

## Left open (observed in the sweep, outside this item)

- `POST /audit/chain-monitor/check` and `GET /audit/chain-monitor/status` (`audit-trail-routes.ts:756-791`) have
  neither the tenant guard nor a role gate: any authenticated caller on the `/api` mount can start the estate-wide
  chain scan on demand and read its status. The scan is the server's own writer and not a client-recorded event, so
  it is not the class DP-38 names, and the right gate is a platform-administrator one rather than the tenant
  recorder's; it is recorded here for the register rather than changed in passing.
- `POST /audit/export/verify` (`:722`) verifies a caller-supplied bundle against the server's export key with no
  guard of its own beyond the mount; it writes nothing. P1-19b (export key id, own secret) is the item that touches
  that verifier.
- No first-party client posts to `/api/audit/signatures` (`grep -rn "audit/signatures" client server` finds only the
  route, its tests and the route inventory in `server/__tests__/routes/smoke.test.ts`); no user-facing path changed.
