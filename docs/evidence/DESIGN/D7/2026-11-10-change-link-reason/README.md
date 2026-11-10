# A record linked to a change past proposal says why, and the audit row keeps how it relates (F1, 2026-11-10)

Package **F1** (repairs). This answers the last finding of the Quality review of 2026-11-10 on the change-edit repair
(`../2026-11-10-change-edit-reason/`).

- `POST /api/mdx/qms/changes/:id/links` adds a cross-reference (a deviation, CAPA, validation, document, supplier
  …) to any change that is not closed, cancelled or rejected.
- Adding one to a change under assessment, or one already approved, changes that change's record.
- Nothing asked why. The audit row kept the record type and reference only: not how the record relates, and not the
  note the route already accepts.
- Removing a link already requires a reason (MR-12 Stage 8).

The finding had a second half: "the change edit's audit row should be in the same transaction". It needed no change:
- The audit writer's documented design (`recordAuditRow`, `server/services/audit/audit-write-outcome.ts`) keeps an
  ordinary edit's row beside the committed write. It puts a row inside the business transaction only for a signed act,
  such as the change's approval, which this repair does not touch.
- A lost row is never silent. The route reports `meta.auditTrail`. The client transport (`findUnpersistedAuditRow`,
  `client/src/lib/queryClient.ts`) reads it on every `apiRequest` write and raises the product's notice that the
  write completed but is not in the audit trail (`GlobalMutationErrors.tsx`).

## What already exists

- **The route**: `POST /qms/changes/:id/links` (`server/routes/mdx-qms.ts`).
  - It reads the change first (`getChange`) and validates the body (`linkCreate`: `linkType`, `linkedRef`,
    `linkedLabel`, `linkedId`, `relationship`, `note`).
  - It writes through `addLink` (`server/services/qms/changeControl.service.ts`), which stores `relationship`
    (default `references`) and `note`.
- **The reason rule**: `governedReason` (`server/routes/governed-reason.ts`), at least 8 characters. Removing a link
  already uses it.
- **The drawer**: "Link a record" (`quality/ChangeLinkForm.tsx`, C2CForm), opened from a change's More.
- **The write**: `linkQmsChange` (`quality/qmsWrites.ts`). It already sends `note` when given.

Nothing new: no route, table or screen.

## What changed

| | Before | After |
|---|---|---|
| A link to a change past proposal, without a reason | added | 422 "This change is under assessment, so a link states why it is added (a reason of at least 8 characters). Nothing was linked." (the change's state is named). Nothing further is read or written |
| A link to a proposed change | added | added. A reason may be given and is kept |
| The link's audit row | `{ linkType, linkedRef }` | `reason` (the note), and `details: { linkType, linkedRef, relationship, note }`. The relationship is the one stored, `references` by default |
| The drawer | Record type, How it relates, Reference, Short description | and **"Why it is linked"**: "Recorded on the change's audit trail with the link." Required once the change is past proposal: "Required once a change is past proposal. At least 8 characters." |

`mdx-qms.ts` stays at 1,499 lines. The new refusal took three lines, and one route comment and the audit call gave
three back. Its single size warning is unchanged.

## Tests

- `server/routes/__tests__/qms-changes.test.ts`:
  - a change under assessment refuses a link whose reason is too short: 422 with the sentence, one read only, and no
    audit row;
  - an approved change's link records its reason, relationship and note;
  - a proposed change's link needs no reason, and records `relationship: 'references'` and `note: null`.
- `quality/__tests__/ChangeLinkForm.test.tsx`: past proposal, the drawer does not submit without "Why it is linked".
  It marks the field invalid, and sends the trimmed reason as `note`.
- `quality/__tests__/qmsGovernedActions.test.tsx`: linking from the change log (a change under assessment) sends the
  reason.

`red.txt`: the five cases fail before the change. `green.txt`: Quality's suites, the change routes and the change
service on Postgres, 30 files and 461 tests.

## Walked in the running app

`w31-change-link-reason.cjs` (`shots/w31-change-link-reason.log.json`) ran as the approver, with no page errors. Its
one API error is the 422 the walk asks for.

1. **The drawer** (`shots/w31-link-reason-1440.png`).
   - In the change log, More → "Link a record" on CC-C9-268139 (under assessment) shows "Why it is linked",
     required.
   - "Link record" with a reference and no reason kept the drawer open, with the field marked invalid and "Complete
     the required field: Why it is linked".
   - With the reason it linked: "VP-W31-49398 was linked to CC-C9-268139."
2. **Through the route.**
   - CC-SIGN-873701 (approved) without a reason answered 422: "This change is approved, so a link states why it is
     added (a reason of at least 8 characters). Nothing was linked."
   - A change the walk raised (proposed) took a link without a reason: 201, with audit trail
     `{ persisted: true, chained: true }`.
3. **The persisted audit rows** (`shots/w31-audit-rows.json`, read from `audit_logs` by `w31-audit-rows.cjs`, which
   prints no connection detail).
   - The drawer's link: `reason` "The validation protocol this change is assessed against.", and details with
     `relationship: 'references'` and the same `note`.
   - The proposed change's link: `reason` null, `note` null, `relationship: 'references'`.

Run it from this folder with `NODE_PATH=$(npm root -g) node w31-change-link-reason.cjs`, then
`node w31-audit-rows.cjs shots/w31-change-link-reason.log.json` with `DATABASE_URL` set and the repository's
`node_modules` on `NODE_PATH`. It needs `WALK_PASSWORD` and a running server.

## Still open

- A change's `assessed_by` is set to whoever saves any edit, even one that changes only the target date. The edit's
  audit row records exactly which fields changed and by whom, so the trail is accurate. The column's meaning, "who
  assessed the risk and impact", is not, and is left as a finding.
