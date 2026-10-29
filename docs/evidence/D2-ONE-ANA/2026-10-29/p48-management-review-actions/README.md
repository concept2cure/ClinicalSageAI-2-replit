# P-48 / G9: a management review records its actions and closes them

Row: D2 (W1). This is slice G9 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`.

## What already exists

- **Table.** `qms_management_reviews` (`migrations/20260511_qms_and_labeling.sql`) holds `outputs` (jsonb) and two
  stored counts, `open_action_count` and `closed_action_count`. Nothing wrote either count.
- **Routes.** `GET` and `POST /api/mdx/qms/management-reviews` (`server/routes/mdx-qms.ts`). There was no route for a
  review's actions.
- **Screen.** The Management reviews tab (`client/src/concept2cure/quality/QmsRecords.tsx`, P-48) lists reviews and
  records one. Raise CAPA from a review (`c1d46c86c`) covers an action that needs a CAPA.

## What changed

**Server.** Two editor-gated routes, each recording its audit row:

- `POST /api/mdx/qms/management-reviews/:id/actions` appends `{ n, description, owner, dueDate, state: 'open', recordedBy, recordedAt }` to `outputs.actions`. It does this in one UPDATE that also raises `open_action_count`. Under the row lock, a concurrent second action takes the next number.
- `POST /api/mdx/qms/management-reviews/:id/actions/:n/close` takes a closure note (`governedReason`, at least 8 characters). It closes the open action numbered `n` and moves both counts in the same UPDATE.
  - Every reference is to the locked row, so a concurrent close updates nothing.
  - A second close, a missing number or another tenant's review returns a 404.

No table or column is added (RULE 1).

**Client.**

- The tab shows an Actions column ("1 open · 0 closed") and an Open actions KPI.
- "Add action" records an action.
- The review's period opens its actions (`ReviewActions.tsx`), where Close takes the closure note.

## Proof

- **SQL on a real engine.** PGlite ran both statements as written in `mdx-qms.ts`:
  - two adds are numbered 1 and 2, with 2 open and 0 closed;
  - closing action 1 gives 1 open and 1 closed, and `decisions` is kept;
  - closing it again, closing it as another tenant, and closing a missing number each update 0 rows.
- `server/routes/__tests__/qms-governed-writes-audited.test.ts` gains both routes and passes 16 of 16.
  - **Shown failing first:** with the close route's audit row removed, its two cases fail (2 failed, 14 passed). Restored, all pass.
- `client/src/concept2cure/quality/__tests__/QmsRecords.test.tsx` gains one case and passes 7 of 7. A short closure note sends nothing, and a full one sends `POST …/management-reviews/3/actions/1/close`.
- Gates: `ci:json-operator-types`, `ci:sql-interpolation`, `ci:discarded-audit-write` and `ci:launch-scope-api` (540 paths, none refused) pass.
