# P-48: Quality reaches its CAPA, nonconformance, supplier, internal audit and management review records

Row: D2 (launch catalog). Decision: P-48 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, under the founder's direction of
2026-10-29 to offer what Veeva QMS Basics offers a biotech.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Routes | `server/routes/mdx-qms.ts` (`/qms/nonconforming`, `/qms/suppliers`, `/qms/internal-audits`, `/qms/management-reviews`) | List, create and update, tenant-scoped. Writes need editor access, and each one records its audit row (`mdx.qms.nonconforming.create`/`.disposition`, `mdx.qms.supplier.qualify`/`.update`, `mdx.qms.internal_audit.create`/`.update`, `mdx.qms.management_review.signoff`). | No client called them. |
| Tables | `migrations/20260511_qms_and_labeling.sql` (in `C2C_MIGRATION_FILES`) | `qms_nonconforming_products`, `qms_suppliers`, `qms_internal_audits`, `qms_management_reviews`, each with `organization_id integer NOT NULL`. | — |
| Launch gate | `server/services/entitlements/launch-scope-api.ts` | Refused the four paths in production as "HIDDEN APP". | — |
| Quality shell | `client/src/concept2cure/quality/App.tsx` | Had two tabs: the SOP register and Change control. | Did not reach the four records. |
| CAPA | `server/routes/capa-mdr.ts`, `server/services/capa-mdr/` (state machine), `migrations/20260504_capa_mdr.sql` | The CAPA register: per project, a lifecycle state machine, action items, and governed audit rows. Claimed only by the hidden `device-postmarket` surface. | Nothing in Quality reached it. |

Searches run: `qms_suppliers|qms_internal_audits|qms_management_reviews|qms_nonconforming_products` across migrations,
server and client; `nonconform|supplier|internal-audit|management-review` in `client/src/concept2cure/**`; `/capa` in
`server/routes`.

## What changed

- `client/src/concept2cure/quality/QmsRecords.tsx` adds one register component with four configurations. Each register:
  - shows a list of records, counts taken from the rows shown, and a create drawer;
  - takes the row update the server has: a nonconformance's disposition with its rationale (at least
    `GOVERNED_REASON_MIN` characters), a supplier's approval and audit dates (only changed fields are sent), or an
    audit's status, dates and findings (a closed audit needs its completion date);
  - shows a failed read as a failure, never as an empty register.
- Supporting modules:
  - `qmsRecordData.ts` holds the row types, the labels from the server's enums, and the writes;
  - `qmsWrites.ts` gives `qmsWrite` a PATCH, so one envelope and refusal path covers every QMS write;
  - `Kpi.tsx` is the tile, moved out of `ChangeControl.tsx` so it can be shared.
- `App.tsx` has four new tabs. AnA's `quality.open-tab` takes the new ids (`shared/navigation/surface-actions.ts`) and
  refuses an unknown one by name, where before it opened the SOP register.
- `launch-scope-api.ts`: the four HIDDEN APP entries are removed. The quality surface's `/api/mdx/qms` claim covers them.
- CAPA, the second commit:
  - The quality surface also claims `/api/capa-mdr/capa` (`ui-surface-registry.ui-v2.ts`).
  - The CAPA tab lists what the caller can see across projects. "Raise CAPA" works in the open project and refuses
    when none is open.
  - "Advance" offers exactly the moves in `shared/constants/capa-lifecycle.ts`, now the server state machine's own
    map. A move needs a reason, and a close needs the effectiveness check result.
  - "Add action" adds an action item.

## Proof

- `npx vitest run client/src/concept2cure/quality/__tests__/QmsRecords.test.tsx`: 4 of 4 pass.
  - A nonconformance lists. A short rationale is refused and nothing is sent. A full rationale sends
    `PATCH /api/mdx/qms/nonconforming/4/disposition` with the disposition and rationale, and the register confirms.
  - A failed supplier read renders "The suppliers register could not be read", not "No suppliers recorded yet".
  - A CAPA in effectiveness check is offered only its three server moves. A close without the effectiveness result is
    refused and nothing is sent. With the result, the screen sends `POST /api/capa-mdr/capa/:id/transition`.
  - "Raise CAPA" with no project open is refused and nothing is sent.
- **Shown failing first:**
  - With the rationale guard removed, the first case fails (1 failed, 1 passed). Restored, both pass.
  - With the effectiveness guard removed, the CAPA case fails (1 failed, 3 passed). Restored, all four pass.
- `npx vitest run server/services/capa-mdr`: 42 of 42 pass with the moved lifecycle map.
- `npm run ci:launch-scope-api` reports 538 API paths named by launch and shell screens, none refused.

## Owed

- A CAPA's action items: they are added here, but moving them (in progress, done) and the CAPA's detail view are owed.
- A management review's actions: the table counts open and closed actions, but no route records an action yet.
- Staging screenshots with D1.
