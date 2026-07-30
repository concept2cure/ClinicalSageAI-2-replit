# Part 11 Immutability — Record-Class Policy

Status: **PROPOSED — awaiting compliance sign-off** (this document resolves
ledger C-22's open decision once approved; until then the shipped narrow HTTP
guard remains, and the broad-surface unit test stays skipped with a pointer
here).

Date: 2026-07-30 (auth / identity / e-signature / release-signing audit)

## Why this document exists

The codebase carried two committed test files that encode **contradictory**
immutable surfaces (ledger C-22):

- `server/startup/__tests__/middleware.guards.test.ts` (skipped assertion)
  wants the whole `/api/audit` namespace **and** `/api/esignature` records
  immutable over HTTP;
- `server/startup/__tests__/audit-chain-wiring.test.ts` requires
  `DELETE /api/audit/events-archive/:id` to succeed and
  `/api/audit/bulk-delete-preview` to stay mutable.

No route-pattern set satisfies both, because the disagreement is not about
route patterns — it is about **record classes**. "Which paths are protected"
must derive from "which records can ever change", not the other way round.

## The record-class table

| Record family                                   | Class                     | Policy |
| ----------------------------------------------- | ------------------------- | ------ |
| Final electronic signature (`electronic_signatures`) | Immutable            | No UPDATE, no DELETE. Correction = insert a superseding row; the old row's `superseded_by` is a **write-once** pointer (NULL → id, never re-pointed, never cleared). Enforced at the database (see below). |
| Signed object/version binding (`bound_payload_digest`, `version_id`, `document_id` on the signature row) | Immutable | Written at INSERT, never after. The post-insert UPDATE the sign-release route used to perform was removed 2026-07-30. |
| Signature verification evidence (`signature_hash`, `signature_manifest`, `authentication_*`) | Immutable | Same row, same rule. |
| Audit event (`device_audit_trail`, `audit_logs`) | Append-only               | No UPDATE, no DELETE, ever. Corrections are new events. `device_audit_trail` is enforced at the database (see below). |
| Orchestrator step event (`submission_orchestrator_steps`) | Append-only     | New status = new event row. NOTE: the current FK is `ON DELETE CASCADE` from runs — acceptable only while runs themselves are never deleted; a future change should replace the cascade with RESTRICT. |
| Draft telemetry / working notes                 | Retention-controlled      | Deletable under a retention schedule, never silently. |
| Exported audit report (generated artifacts)     | Regenerable               | Deletable — the underlying events are the record, the export is a view. |
| Preview / dry-run records (`bulk-delete-preview` etc.) | Mutable            | Previews compute what WOULD happen; they are not records. |
| Archive index (`/api/audit/events-archive/:id`) | Controlled administration | The archive INDEX entry may be administratively removed; the archived underlying events may not. This is why `DELETE /api/audit/events-archive/:id` is legitimately mutable while `/api/audit/events` is not. |
| Archived underlying event                       | Immutable                 | Same as any audit event. |

## Enforcement layers

1. **Database (authoritative):**
   `db/migrations/20260730_esign_audit_db_level_immutability.sql`
   - `electronic_signatures`: trigger refuses DELETE and any UPDATE except
     the write-once `superseded_by` transition (+ `updated_at` bookkeeping).
   - `device_audit_trail`: trigger refuses UPDATE and DELETE outright.
   - Proven by `tests/schema-contract/esig-audit-immutability.contract.test.ts`.
   The database layer is the floor: HTTP-layer gaps can no longer reach the
   records themselves.

2. **HTTP (defense in depth):** `applyImmutabilityPolicy` in
   `server/startup/middleware.ts` keeps the integration-validated narrow
   surface (`/api/audit/events`, `/api/audit/bulk-delete`). Once this policy
   is approved, the HTTP surface should be re-derived from the table above:
   protect by record class served, not by name-pattern breadth. The archive
   index and preview routes stay mutable **by classification**, which
   dissolves the C-22 contradiction rather than arbitrating it.

3. **Application:** signature rows are complete at INSERT
   (`part11ComplianceService.createElectronicSignature` receives
   `organizationId` and, for release signatures, the orchestrator's
   `boundPayloadDigest` up front). No code path performs UPDATE or DELETE
   against either protected table — verified by grep at the time of this
   change and now enforced by the triggers regardless.

## What approval of this document implies

- Un-skip and REWRITE the broad-surface assertion in
  `middleware.guards.test.ts` to match the classified surface (esignature
  records: immutable; audit events: immutable; archive index + previews:
  mutable) instead of the whole-namespace blanket it currently encodes.
- Replace `ON DELETE CASCADE` on `submission_orchestrator_steps` with
  `RESTRICT` in a follow-up migration.
- Extend database-level enforcement to the remaining append-only stores
  (`audit_logs`, orchestrator step events) after write-path review.
