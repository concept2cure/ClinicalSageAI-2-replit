# A change record is read and assessed in its row, and read inside the approval ceremony (C9, 2026-11-10)

Package **D7**. This is sweep item C9, finding change-1.

An approver signs a change's content. The approval digest (`computeQmsChangeContentDigest`,
`server/services/qms/change-approval-signature.ts`) binds:

- the title, the description, the type, the classification and the risk;
- the reason, the impact assessment and the implementation plan;
- the target date.

The change log showed almost none of it:
- The row opened onto its linked records alone.
- The impact assessment and the implementation plan were never read from the server.
- The raise form could not record them.
- Nothing in the log could edit them.
- The signature dialog named only the change's number and title.

So an approver signed a record they could not read in the product.

## What already exists

- **The server.**
  - The register read (`GET /api/mdx/qms/changes`) returns `impact_assessment`, `implementation_plan`, `risk_level`
    and `proposed_by`. Nothing on the client read the first two.
  - `PATCH /api/mdx/qms/changes/:id` edits the assessment. Since F1 today
    (`docs/evidence/DESIGN/D7/2026-11-10-change-content-fixed/`), it edits only while the change is proposed or under
    assessment and refuses after that.
  - `POST /api/mdx/qms/changes` already takes the risk, the impact assessment and the implementation plan.
- **The client.**
  - `C2CForm` is the one drawer form, with field defaults.
  - `EsignModal`:
    - `renderMeaningDetails` shows governed context inside the ceremony, before signing. The learning review already
      used it.
    - `signedRows` adds rows to the manifest after signing.
  - `ChangeControl.tsx` holds the log, its drawers and its approval. The record's display is split out of it into
    `ChangeRecordDetail.tsx`, in the same folder (RULE 6: split, don't add).
  - `changeData.ts`, `changeHooks.ts` and `qmsWrites.ts` hold the change's type, its adapter and its writes.

Nothing new: no route, table, screen or component beyond the split.

## What changed

| | Before | After |
|---|---|---|
| The row's detail | Linked records only, as bordered cards with type-coloured icons and an accent hover | The record, as a definition list: current state to proposed state, reason, risk, impact assessment, implementation plan. A field not yet filled says "Not recorded yet." Then the linked records, as a plain list. |
| Assessing | not possible in the product | **Edit assessment**, under the row's More, while the change is proposed or under assessment. It opens the drawer with the recorded risk, impact assessment, implementation plan and target date filled in. It saves through `PATCH /changes/:id` (`updateQmsChange` in `qmsWrites.ts`). Past assessment it is not offered, and the server refuses it. |
| Raising | number, title, type, classification, description, reason, target | The same, plus risk, impact assessment and implementation plan, which the create route already took |
| The signature dialog | the change's number and title | **"What you approve"**: the record's fields, inside the ceremony, before the reason and password. After signing, the manifest records the classification, the record's fields and the target date. |
| Dead code | `LINK_TYPE_ICON`, `linkIcon`, the link-card and type-colour CSS | deleted |

The approver reads exactly the words the row shows, because both render through `changeRecordRows`.

## Tests

- `ChangeControl.test.tsx`:
  - expanding a change shows its five record fields and their values before its links;
  - the More of a change under assessment holds "Edit assessment";
  - a closed change's More does not.
- `qmsGovernedActions.test.tsx`: Edit assessment opens with the recorded assessment and saves it through
  `PATCH /api/mdx/qms/changes/1` with the four fields.
- `ChangeControlApproval.test.tsx`: the signature dialog shows "What you approve", with the impact assessment and the
  implementation plan.
- `changeRows.ts`: the fixture carries the assessment, as the register read does.

`red.txt`: these four cases fail against the code before C9. `green.txt`: Quality's suites and AnA's wave-4 suite,
29 files and 349 tests.

## Walked in the running app

The server ran with `RLS_ENFORCE=on`, signer mode `dev`, and real logins for the author and the approver.

`w15-change-record.cjs` (log: `w15-change-record.log.json`):

1. The author raises a change through the form, with its description, reason, risk (Medium), impact assessment and
   plan. Expanding the row shows all five fields.
2. The author edits the assessment: More, then Edit assessment. The drawer opens filled in (`shots/w15-assess-1440.png`).
   The toast says "The assessment of CC-C9-… was saved." The row shows the new plan.
3. The change moves to under assessment.
4. The approver opens Approve. The ceremony shows **"What you approve"**, with the five fields as edited
   (`shots/w15-approve-dialog-1440.png`). The approver signs there with a reason and a password. The manifest records
   the classification, the five fields and the target date (`shots/w15-signed-1440.png`).
5. Approved, the row's More offers Link a record and Ask AnA, and no Edit assessment. A direct `PATCH` answers 409:
   "This change is approved, so its content is fixed: it is what its approval signed. Nothing was saved.", and the
   stored plan is the one signed.

`w13-detail-390.cjs`: at 390 the record reads in one column. It stays inside the section while the table scrolls 300 px
(`shots/w13-detail-390.png`), and the page does not scroll sideways.

## Next

An editor's `PATCH` could still land between the approver opening the dialog and signing. The approver would then
sign content they did not read. The approval route takes no expected revision; the 2026-11-10 review of F1 named this
gap (`../2026-11-10-change-content-fixed/review.json`, design lens). Binding the approval to the revision the dialog
showed is the next repair.

## Files

The walks are `w15-change-record.cjs` and `w13-detail-390.cjs`, with `lib.cjs`. Run them from this folder with
`NODE_PATH=$(npm root -g) node <walk>.cjs`. They need `WALK_PASSWORD` and a running server.
