# R1 · Reach: a record linked to a change can be removed from it, with its reason (2026-11-12)

Package **R1** (reach). Found by matching every Quality route against the client's API paths (67 routes in
`server/routes/mdx-qms*.ts`). One write had no caller in any screen:

- `DELETE /api/mdx/qms/changes/:id/links/:linkId` removes a link from a change, with a required reason.
- A link added to the wrong change stayed in that change's list. Nothing on screen could take it off.

The P-122 inventory (`docs/evidence/DESIGN/P-122/inventory/qms-reporting-device.md` §3) did not list it.

## What already exists

- **The route and its service**: `server/routes/mdx-qms.ts` and `removeLink`
  (`server/services/qms/changeControl.service.ts`, MR-12 Stage 8).
  - The link is kept, stamped with who removed it, when and why. No reader lists it again.
  - It answers 422 without a reason of 8 characters, and 404 when it is not a standing link of an open change.
  - It refuses a closed, cancelled or rejected change, as `addLink` does.
  - Its audit row named the link by its id only.
- **The change's record in its row**: `client/src/concept2cure/quality/ChangeRecordDetail.tsx` (C9): the
  assessment, then the linked records as a plain list.
- **The link's reason**: `note`, stored with the link and required past proposal since `979554ff6`. The register read
  returns it (`ChangeLink.note`), and no screen showed it.
- **The write helper**: `qmsWrite('DELETE', …)` (`quality/qmsWrites.ts`) already carries a reason in a JSON body.
- **The drawer**: `C2CForm`, as "Link a record" and "Advance" use.

Nothing new: no screen, route, mount or table.

## What changed

| | Before | After |
|---|---|---|
| A linked record, in the change's row | its reference, how it relates, its type | and **Remove**, and under it **why it was linked** when a reason was recorded |
| Remove | no screen | a drawer, "Remove VP-7 from CC-2026-014": "Reason for removing it", required, at least 8 characters. "The link is kept on the record as removed, with your name, the time and this reason." |
| The removal's audit row | `{ linkId, reason }` | `reason`, and `{ linkId, linkType, linkedRef, reason }`: which record it was, since an id says nothing once the link is off the list |
| A closed, cancelled or rejected change | offered "Link a record", which the server refuses | offers neither a link nor a removal (`takesLinks`, `quality/changeData.ts`, the server's rule) |
| The empty list's hint | "(More, then Link a record)" | "…, with Link a record."; none on a change that takes no link |

`mdx-qms.ts` stays at 1,499 lines.

## Tests

- `server/routes/__tests__/qms-changes.test.ts`:
  - the removal answers 200 and records which record it was and why;
  - 422 without a reason, with nothing read or written;
  - 404 for a link that is not standing, with no audit row.
- `server/services/qms/__tests__/changeControl.pglite.integration.test.ts` (real Postgres): `removeLink` returns the
  removed record's type and reference; null the second time, and null after closure.
- `client/src/concept2cure/quality/__tests__/qmsGovernedActions.test.tsx`:
  - Remove sends nothing without a reason, then `DELETE /changes/1/links/11` with it;
  - a link's reason is shown, and no Remove is offered where the change takes none.
- `client/src/concept2cure/quality/__tests__/ChangeControl.test.tsx`: a closed change offers no "Link a record".

`red.txt`: the six cases fail before the change. `green.txt`: the change routes, the change service on Postgres and
Quality's suites, 33 files and 498 tests. `ci:sql-interpolation` passes, and the service gains no lint warning.

## Walked in the running app

`w40-remove-link.cjs` (`shots/w40-remove-link.log.json`) ran as the approver, with no page error and no failed
request.

1. The walk linked a record of its own (VP-W40-88070) to a proposed change, CC-W31-451228, through the route.
2. **The change's row** (`shots/w40-linked-records-1440.png`): "VP-W40-88070 · Walk 40 validation protocol ·
   References · Validation", with Remove.
3. **Remove** (`shots/w40-remove-link-1440.png`).
   - "Remove link" with no reason kept the drawer open, the field marked invalid.
   - With the reason: "VP-W40-88070 was removed from CC-W31-451228's linked records."
   - The row's count went to "0 linked records", and the list to "No linked records yet."
4. **Why it was linked** (`shots/w40-why-linked-1440.png`). CC-C9-268139's link shows "The validation protocol this
   change is assessed against." under it.
5. **A cancelled change** (the walk raised one and cancelled it through its lifecycle): its row offers "Ask AnA"
   only, and its record says "No linked records."
6. **The persisted rows** (`shots/w40-audit-rows.json`, read by `w40-audit-rows.cjs`, which prints no connection
   detail).
   - `audit_logs`: `mdx.qms.change.unlink`, with the reason, `linkType: 'validation'` and
     `linkedRef: 'VP-W40-88070'`.
   - `qms_change_links`: the link is kept, with `removed: true`, who removed it and the reason.

Run it from this folder with `NODE_PATH=$(npm root -g) node w40-remove-link.cjs`, then
`node w40-audit-rows.cjs shots/w40-remove-link.log.json` with `DATABASE_URL` set and the repository's `node_modules`
on `NODE_PATH`. It needs `WALK_PASSWORD` and a running server.

## The rest of the route match

- Every other Quality write has a caller. The one exception is `DELETE /qms/changes/:id`, which no screen offers on
  purpose: a change raised in error is cancelled through its lifecycle, with a reason (`ea718c177`).
- In `server/routes/capa-mdr.ts`, the complaint and MDR transitions are called by the Complaints and MDR tab
  (`d3db227c1`) through a path built from a variable, which a literal match misses.
  `GET /complaints/:id` and `GET /mdr-events/:id` have no caller: the registers read the lists.
