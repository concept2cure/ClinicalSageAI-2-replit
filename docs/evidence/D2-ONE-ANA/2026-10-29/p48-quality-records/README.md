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
| QC deviations, OOS | `server/routes/qc.routes.ts` (`/deviations`, `/oos-investigations`), `server/storage.ts:1495` | A stub. Reads return nothing, and every write throws `NOT_IMPLEMENTED` (an honest 501). No table exists behind it. | It is not a deviation register, so the Nonconformances tab does not duplicate it. Converging or deleting these stub routes is owed. |
| CAPA | `server/routes/capa-mdr.ts`, `server/services/capa-mdr/` (state machine), `migrations/20260504_capa_mdr.sql` | The CAPA register: per project, a lifecycle state machine, action items, and governed audit rows. Claimed by `device-postmarket`, a Projects launch surface for device projects since 2026-10-23 (not hidden, as this README first said). | Nothing in Quality reached it. |

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
- Raise CAPA from a record, the third commit. A nonconformance, or an internal audit that has started, carries "Raise
  CAPA". The CAPA drawer opens with the record's title, source and problem filled in, and the record is sent as the
  CAPA's `sourceRefs` entry (`{ kind, id, label }`, shared/schema/capa-mdr.ts). The CAPA register's Source column names
  the record.
- CAPA action items, the fourth commit. A CAPA's number opens its action items (`CapaActions.tsx`, read from
  `GET /api/capa-mdr/capa/:id`). Each item offers only the moves in `ACTION_TRANSITIONS`, which now also moves to
  `shared/constants/capa-lifecycle.ts`. Done needs the evidence of completion, sent as `evidenceRefs`; blocked and
  cancelled need a reason. A close now records the effectiveness check in the documented shape (`{ outcome, narrative }`)
  instead of `{ summary }`.

- Change control links to real records, the fifth change. "Link a record" (`ChangeLinkForm.tsx`, extracted from `ChangeControl.tsx`) lists the organisation's own records for three types:
  - for a deviation, the nonconformance register;
  - for a CAPA, the CAPA register;
  - for a supplier, the supplier register.

  The reference and description are taken from the pick, shown read-only, and sent. Until now a link was free text, so a change's deviation or CAPA link named nothing the platform could resolve. A register that could not be read says so, and the typed reference stays available. The other link types keep the typed reference. `listOf` moves to the pure `qmsList.ts`, so the registers and the picker share it without the change hooks.

## Proof

- `npx vitest run client/src/concept2cure/quality/__tests__/QmsRecords.test.tsx`: 6 of 6 pass.
  - A nonconformance lists. A short rationale is refused and nothing is sent. A full rationale sends
    `PATCH /api/mdx/qms/nonconforming/4/disposition` with the disposition and rationale, and the register confirms.
  - A failed supplier read renders "The suppliers register could not be read", not "No suppliers recorded yet".
  - A CAPA in effectiveness check is offered only its three server moves. A close without the effectiveness result is
    refused and nothing is sent. With the result, the screen sends `POST /api/capa-mdr/capa/:id/transition`.
  - "Raise CAPA" with no project open is refused and nothing is sent.
  - "Raise CAPA" from NC-2026-004 sends `POST /api/capa-mdr/capa` with the open project and
    `sourceRefs: [{ kind: 'qms_nonconforming_product', id: '4', label: 'NC-2026-004' }]`.
  - An action in progress is offered Done, Blocked and Cancelled, never Planned. Done with blank evidence sends
    nothing. With evidence, the screen sends `POST /api/capa-mdr/capa/actions/a1/transition` with `evidenceRefs`.
- **Shown failing first:**
  - With the rationale guard removed, the first case fails (1 failed, 1 passed). Restored, both pass.
  - With the effectiveness guard removed, the CAPA case fails (1 failed, 3 passed). Restored, all four pass.
  - With the evidence requirement removed from the Done drawer, the action case fails (1 failed, 5 passed). Restored,
    all six pass.
- `npx vitest run server/services/capa-mdr`: 42 of 42 pass with the moved lifecycle map.
- `ChangeLinkForm.test.tsx` passes 2 of 2:
  - a CAPA picked from the register is sent with its own number and title;
  - a failed register read is said, and the typed reference is kept.
  - **Shown failing first:** with the reference's `derive` removed, the first case fails.
- `npm run ci:launch-scope-api` reports 538 API paths named by launch and shell screens, none refused.

## Owed

- A nonconformance's `capa_linked` flag is not set when a CAPA is raised from it (no route writes it). The CAPA's
  `sourceRefs` carries the link.
- A management review's actions: the table counts open and closed actions, but no route records an action yet.
- Staging screenshots with D1.
