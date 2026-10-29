# A change-control link names a real record, and a removed link is kept

Row: D2 (W1), workstream MR-12, Stage 8, change-control half (CAT2-25). The controlled-copy half (CAT2-24) is not part
of this change.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Link service | `addLink` / `removeLink` / `listLinks` / `listLinksForChanges`, `server/services/qms/changeControl.service.ts` | Inserted, listed and deleted `qms_change_links` rows. | `addLink` accepted any reference: a deviation link could name a deviation that does not exist, or another organisation's. `removeLink` ran `DELETE`, so what a change had been linked to, and who unlinked it, was gone. |
| Routes | `POST` / `DELETE /api/mdx/qms/changes/:id/links[/:linkId]`, `server/routes/mdx-qms.ts` | Called the service and wrote an audit row after it. | The DELETE took no reason. |
| AnA | `qms_change_link`, `AnaToolExecutor.ts` | Calls the same `addLink`. | — |
| Client | `ChangeLinkForm.tsx` | Since 2026-10-29, picks deviations, CAPAs and suppliers from their registers. | Never removes a link: the DELETE has no client caller. |
| Registers | `qc_deviations` (P-57), `capa_records` (scoped through `regulatory_programs`), `qms_suppliers`, `qms_documents` | Hold each type's records. | — |

Searches run:
- `qms_change_links` across `server/`, `shared/` and `scripts/`;
- `addLink` and `removeLink` across `server/` and `client/`.

## What changed

- **A link names a record.**
  - `addLink` refuses (`ChangeLinkRefusedError`, `CHANGE_LINK_TARGET_NOT_FOUND`, 422 on the route) a deviation, CAPA or
    supplier that this organisation has not recorded, by its number or code.
  - It also refuses a document link whose id is not this organisation's live document.
  - Validation, risk and other links keep their typed reference: the platform holds no register for them.
  - The route and AnA share the check, because both call `addLink`.
- **A removed link is kept.**
  - `removeLink` stamps `removed_at`, `removed_by` and `removal_reason`, and refuses a link already removed.
  - The DELETE route requires the person's reason (`governedReason`), and its audit row carries it.
  - Both readers filter `removed_at IS NULL`, so no code path hard-deletes a link.
  - The columns are added by amending the creating migration in place
    (`db/migrations/20260724_qms_change_control_store.sql`, `ADD COLUMN IF NOT EXISTS`, dated note), as RULE 1 requires.

## Proof

- **`server/services/qms/__tests__/changeControl.pglite.integration.test.ts`**, "links only a record of this
  organisation, and keeps a removed link with who removed it and why":
  - refused: an unrecorded CAPA, another organisation's CAPA, an unrecorded deviation, and a foreign document id;
  - linked: this organisation's CAPA, deviation and supplier, and a typed validation reference;
  - after a removal, both readers list three links, the row keeps `removed_by` 11 and the reason, and a second removal
    returns false.
- **`server/routes/__tests__/qms-changes.test.ts`:** a 422 `CHANGE_LINK_TARGET_NOT_FOUND`, with no INSERT.
- **`server/services/ana/__tests__/qms-change-tools.test.ts`:** AnA's link to an unrecorded deviation is refused, and
  nothing is linked.
- **Mutation:** skipping `refuseUnresolvedTarget` fails the pglite case. Restoring it makes it pass.
