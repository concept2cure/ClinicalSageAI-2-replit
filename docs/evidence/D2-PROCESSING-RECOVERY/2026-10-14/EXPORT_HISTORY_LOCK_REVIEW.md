# Export-history lock review: bounded follow-up

14 October 2026. Read-only code review for the disposition confirmation addendum. No application edits, PostgreSQL commands or new test execution occurred in this review. References describe the inspected code before the lead-assigned history SHARE-lock addendum.

**A canonical new qualifying filing receipt shares withdrawal's program advisory lock. Document `FOR UPDATE` and the current impact-table SHARE reservations alone do not establish that serialization. A direct receipt deletion remains outside that program lock, and the filing writer's repeatable-read reverse-wait admission is a separately open, unreproduced static risk.**

## Exact writers and relevance

The bounded exact-name search found two SQL INSERT definitions in server code. The canonical helper has two callers. Other functions named `logExport` in `documentExportService.ts` and `audit/auditLogger.ts` write audit events, not this table.

| Writer | Metadata read by disposition impact | Reservation |
| --- | --- | --- |
| `authoring-export.ts:667–684`, called by `authoring-file-to-vault.ts:293–302` | Top-level `filedToVault: true`, Vault ID, artifact hash, program and validated original import identity. This can qualify. | `recordFiling` begins REPEATABLE READ at line 255, reserves saved sources at 257, takes document `FOR UPDATE NOWAIT` at 259 and section-table SHARE at 268; receipt and audit commit together at 325. |
| Same helper, called by `authoring.router.ts:6700–6711` | Only top-level options/export ID/artifact hash/rendering. No `filedToVault`, Vault ID or program. Client options stay nested. This cannot satisfy the filed-rendition predicate. | Source-linked renditions use `withSavedDraftSourceReservation` at 6675; ordinary manual renditions may use the pool directly. This distinction does not create a qualifying filed receipt. |
| `ana-ri/command-executor.ts:3654–3658` | INSERT columns are only document ID, export type, exporter and time. Metadata and tenant ID are omitted; the declared schema gives metadata no default (`20260730_authoring_runtime_ddl.sql:89–102`). This row cannot satisfy top-level `filedToVault = true`. | Direct pool statement, no visible reservation in this writer. Its broader authorization/behavior is outside this review. |

`impact.ts:98–110` observes distinct filed renditions only when the receipt, authoring document, Vault version and original reference all name the requested program; tenant and hash must also match. An unrelated/generic export-history INSERT does not change this observed fingerprint merely by entering the table.

## Relevant INSERT serialization

`draft-source-references.ts:139–151` takes the disposition program advisory lock before source verification. `savedSourceSelection` selects a validated import's program at 100–106. `savedImportSource` rejects malformed or mismatched program/identity at `import-source-references.ts:35–45`. `program-lock.ts:5–7` keys the lock by organization and lowercase program UUID, matching withdrawal's call in `service.ts:93`.

Consequently a new receipt satisfying the current impact predicate cannot commit **while** withdrawal owns that same advisory lock. The document lock is not an alternative proof: `SELECT FOR UPDATE` acquires a ROW SHARE table lock compatible with SHARE, `recordFiling` does not update the document, and the receipt schema has no document foreign key. Source-row `FOR SHARE` and section-table SHARE are likewise compatible with withdrawal's SHARE table reservations.

## DELETE stability and addendum limit

`authoring.router.ts:5926–5949` reads then directly deletes an export-history row through the pool, with no program reservation or document update; the audit write follows at 5952. Deleting the last qualifying receipt for a rendition can change `filedImportRenditions`' count/fingerprint after its read. The inspected `IMPACT_TABLES` list (`service.ts:16–22`) omitted export history. The lead assigned its SHARE reservation to the disposition/PostgreSQL owner; no such edit is made here.

A deletion after the read may conservatively retain a blocker, but it still defeats the claimed stable impact snapshot. A history SHARE reservation addresses mutations during confirmation. It does not make history append-only or qualify the lineage consequences of a later authorized deletion.

## Separately open: reverse wait

This is **static reasoning, not a reproduced race or a newly established live exploit**. `recordFiling` begins REPEATABLE READ before the program-lock SELECT. That SELECT can establish a transaction snapshot before waiting. If withdrawal commits while it waits, later eligibility reads (`import-source-references.ts:61–68`) may still see the pre-withdrawal disposition set. Withdrawal inserts a disposition without updating the original source row (`service.ts:40–41`), so source `FOR SHARE` alone does not necessarily force a serialization error. A subsequent receipt INSERT could then commit after withdrawal using stale admission.

The lead's READ COMMITTED **withdrawal** change resolves its pre-wait impact-snapshot issue, but does not itself change this writer's REPEATABLE READ admission. A focused independent-connection fixture for the reverse direction and a separately contracted writer repair are still required before claiming both directions qualified. No additional export-path change is proposed or implemented in this slice.
