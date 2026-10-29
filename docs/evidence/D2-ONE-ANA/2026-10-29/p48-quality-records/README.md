# P-48: Quality reaches its nonconformance, supplier, internal audit and management review records

Row: D2 (launch catalog). Decision: P-48 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, under the founder's direction of
2026-10-29 to offer what Veeva QMS Basics offers a biotech.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Routes | `server/routes/mdx-qms.ts` (`/qms/nonconforming`, `/qms/suppliers`, `/qms/internal-audits`, `/qms/management-reviews`) | List, create and update, tenant-scoped. Writes need editor access, and each one records its audit row (`mdx.qms.nonconforming.create`/`.disposition`, `mdx.qms.supplier.qualify`/`.update`, `mdx.qms.internal_audit.create`/`.update`, `mdx.qms.management_review.signoff`). | No client called them. |
| Tables | `migrations/20260511_qms_and_labeling.sql` (in `C2C_MIGRATION_FILES`) | `qms_nonconforming_products`, `qms_suppliers`, `qms_internal_audits`, `qms_management_reviews`, each with `organization_id integer NOT NULL`. | — |
| Launch gate | `server/services/entitlements/launch-scope-api.ts` | Refused the four paths in production as "HIDDEN APP". | — |
| Quality shell | `client/src/concept2cure/quality/App.tsx` | Had two tabs: the SOP register and Change control. | Did not reach the four records. |
| CAPA | `server/routes/capa-mdr.ts`, `migrations/20260504_capa_mdr.sql` | A CAPA register exists. Change control links to a CAPA by reference. | Quality does not reach it. That is the next slice. |

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

## Proof

- `npx vitest run client/src/concept2cure/quality/__tests__/QmsRecords.test.tsx`: 2 of 2 pass.
  - A nonconformance lists. A short rationale is refused and nothing is sent. A full rationale sends
    `PATCH /api/mdx/qms/nonconforming/4/disposition` with the disposition and rationale, and the register confirms.
  - A failed supplier read renders "The suppliers register could not be read", not "No suppliers recorded yet".
- **Shown failing first:** with the rationale guard removed, the first case fails (1 failed, 1 passed). Restored, both pass.
- `npm run ci:launch-scope-api` reports 536 API paths named by launch and shell screens, none refused.

## Owed

- CAPA register in Quality: reach `server/routes/capa-mdr.ts`.
- A management review's actions: the table counts open and closed actions, but no route records an action yet.
- Staging screenshots with D1.
