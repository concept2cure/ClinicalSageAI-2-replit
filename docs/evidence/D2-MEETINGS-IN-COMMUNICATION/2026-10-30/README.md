# Communication records and moves agency meetings, on the governed record, only where the person may act

Row: D2 (W1). This is the precondition of P-39 step 4c (`docs/LAUNCH_DEFINITION_OF_DONE.md`): meeting minutes
converge onto `ha_interactions` once Communication records meetings. Veeva RIM basics name this capability:
health-authority interactions.

## What already exists

| Piece | Path | Before this change |
|---|---|---|
| Meeting record | `ha_interactions` (`migrations/20260610_ha_interactions_commitments.sql`, on the applier) | Organisation and optional submission keys, type, agency, status, dates. |
| Governed writes | `POST /api/ha-interactions/interactions`, `PATCH /interactions/:id/status` (`server/routes/ha-interactions.ts`) | A reason and the ledger in one transaction, plus the org editor gate. |
| Service | `createInteractionTx`, `updateInteractionStatusTx`, `listInteractions` (`server/services/ha-interactions/ha-service.ts`) | Also called by AnA `create_ha_interaction`, which is in launch scope. |
| Client | Communication's Meetings tab (`CommunicationCenter.tsx`) | A read-only, organisation-wide list. No way to record or move a meeting. |
| Agency Meetings | `AgencyMeetings.tsx`, `c2c_agency_meetings` | Outside launch scope; its route is refused in production. |

### Defects found in the existing path

1. **Program-blind list.** The list returned every meeting in the organisation, on the shared pool. A member saw the
   titles of meetings on private programs they cannot open.
2. **Unchecked submission.** `submissionId` was not checked against the organisation. The foreign key alone admits
   any submission's id, another tenant's included, from both the route and AnA.
3. **Program-blind writes.** Any org editor could record or move a meeting on any program.
4. **Free status moves.** Any status could move to any other: closed back to planned, or planned straight to minutes
   received. The dates were unvalidated strings.

## What changed

- **One lifecycle**, in `shared/regulatory/ha-interaction-lifecycle.ts`:
  - planned → requested, scheduled or cancelled;
  - requested → scheduled or cancelled;
  - scheduled → held or cancelled;
  - held → minutes received or closed;
  - minutes received → closed.

  Closed and cancelled are final. Scheduled, held and minutes received each record their date. The server enforces
  it under lock (`updateInteractionStatusTx`: `INVALID_STATE` 409, missing date `BAD_INPUT` 400), and the form offers
  only these moves.
- **Same-organisation submission**, in `createInteractionTx`. This covers the route and AnA.
- **Write admission** (`admitSubmissionWrite`). Recording or moving a meeting on a submission requires write
  admission to that submission's project (`requireProjectAdmission(req, projectId, true)`). The refusal is answered,
  and nothing is recorded.
- **Scoped list.** `GET /interactions` binds the reader's verified program scope
  (`getCurrentAccessibleProgramScope`) in SQL. It lists meetings that name no submission and meetings on programs the
  reader may open, and no others. The list runs on the request's tenant-pinned client.
- **Dates** are `YYYY-MM-DD` or refused.
- **Communication** gains "Record a meeting" and, on each meeting that can still move, "Move". The forms live in
  `client/src/concept2cure/v2/surfaces/HaMeetings.tsx`. Each takes a reason. A meeting recorded from a project can
  name one of that project's submissions.

## Proof

- `green.txt`: 11 tests pass:
  - `haMeetingMove.test.tsx`: the form's options are the lifecycle's, and the date is sent under its key;
  - `meeting-lifecycle.pglite.test.ts`: the real DDL, another tenant's submission refused, the one-way moves, no
    reopening, and the scoped list;
  - `ha-interactions-meeting-admission.test.ts`: a refused admission records nothing, an admitted one records, and a
    foreign submission or a non-date is refused;
  - the error-containment suite.
- **Mutations**, each restored afterwards:
  - `mutation-lifecycle-open.txt`: with the lifecycle refusal disabled, the one-way case fails.
  - `mutation-no-admission.txt`: with the admission call removed, the refusal and foreign-submission cases fail.
- Gates: `ci:typecheck:no-regression` reported 0 errors. `ci:launch-scope-api`, `ci:sql-interpolation`,
  `ci:server-error-leaks`, `ci:surface-text-ramp` and the ESLint ratchet pass, and ESLint finds nothing in the new
  files.

## Next (P-39 step 4c)

- A meeting's minutes are recorded as an inbox letter (`source_type` `meeting_minutes`) linked to the meeting. Its
  agreements and commitments become that letter's questions and `regulatory_commitments` (`meeting_commitment`).
- `c2c_agency_meetings` and the Agency Meetings surface then retire.
