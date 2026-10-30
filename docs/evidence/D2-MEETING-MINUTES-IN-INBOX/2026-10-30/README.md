# P-39 step 4c: a meeting's minutes are an inbox letter, named by the meeting

Row: D2 (W1). Decision P-39 step 4 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, as amended 2026-10-30): a meeting's minutes
are an inbox letter (`source_type` `meeting_minutes`) linked to the `ha_interactions` row. Its agreements and
commitments become that letter's questions and `regulatory_commitments`. It follows
`../../D2-MEETINGS-IN-COMMUNICATION/2026-10-30/`, which let Communication record and move meetings.

## What already exists

| Piece | Path | Used here as |
|---|---|---|
| Inbox letter | `concept2cure_agency_communications` (`db/migrations/20260331_communication_center_scaffold.sql`), `source_type` `meeting_minutes` already in the vocabulary | The minutes. |
| The letter's questions, signed answers, commitments | `server/routes/c2c/agency-responses.ts`; `regulatory_commitments` with `meeting_commitment` | The agreements and commitments. Nothing new is built for them. |
| Meeting | `ha_interactions` and its governed status move (`updateInteractionStatusTx`) | Names the letter when the minutes are received. |
| The old minutes | `c2c_agency_meetings.minutes` JSONB | No deployed writer; refused in production. Retired later in this step. |

## What changed

- **`migrations/20261030_ha_interaction_minutes_letter.sql`**, on the applier after `20261029k`:
  - `ha_interactions.minutes_event_id`, a foreign key to the letter's `event_id`, `ON DELETE SET NULL`, so a purged
    letter clears the link and never blocks the purge;
  - additive, with the constraint added only when absent; replayed twice in the test.
- **`refuseMinutesLetter`** (`ha-service.ts`). The move to minutes received may name a letter. The letter must be:
  - in this organisation's inbox;
  - recorded as meeting minutes;
  - in the meeting's own project, its submission's single project anchor.

  Naming a letter on any other move, or on a meeting that names no submission, is refused. The route accepts
  `minutesEventId`, and the move is still admitted by the meeting's project.
- **The list** returns `minutes_event_id` and the meeting's `project_id`. The project is given only when the program
  has exactly one project anchor.
- **Communication.**
  - The move form for a meeting whose minutes can be received offers that project's minutes letters, and only those.
  - When there are none, it says so: log the minutes in the inbox, then name them.
  - A meeting whose minutes are linked offers "Minutes", which opens the letter in Communication when the meeting's
    project is the open one.

## Proof

- `green.txt` (10 tests pass):
  - `meeting-lifecycle.pglite.test.ts`, on the real DDL of both tables and the migration replayed:
    - the right letter is named;
    - an information request, another project's minutes or an unknown letter is refused;
    - a meeting with no submission, or any other move, is refused;
    - a purge clears the link.
  - `haMeetingMove.test.tsx`: only minutes letters are offered, and the chosen one is sent with the move.
- `mutation-other-project-letter.txt`: with the same-project check disabled, the naming case fails. The file was
  then restored.
- Gates:
  - the migration gates pass: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-guard-order` and
    `ci:migration-deploy-path`;
  - `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:launch-scope-api` and the ESLint ratchet pass;
  - `ci:typecheck:no-regression` reported 0 errors.

## Still owed in step 4

`c2c_agency_meetings` and the Agency Meetings surface retire. They are replaced by Communication's meetings (record,
move, minutes) and the IND screen's briefing book in the editor.
