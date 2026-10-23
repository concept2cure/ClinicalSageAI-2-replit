# D2: an agency letter names the submission it concerns (2026-10-22)

Gap 6, work item 5 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Fix the
correspondence link: validate it and send it". A fix to an existing column
and route, not a new capability. Launch row **D2** (Submission Center, whose
Communication Center and Respond carry the agency inbox).

## What already exists

- **The column.** `concept2cure_agency_communications.linked_submission_id`
  (text). `POST /api/concept2cure/projects/:projectId/agency-communications`
  (`server/routes/c2c/communication-center.ts`) stored whatever string the
  client sent, and the GET returned it. Nothing checked that it named a
  submission, let alone one of this project's.
- **No sender.** Neither Communication Center's log form (`CommunicationCenter.tsx`)
  nor Respond's letter upload (`ProjectRespond.tsx`, `uploadedLetterCommunication`)
  sent it. `useAgencyInbox.log` (`AgencyInbox.tsx`), the one writer both use,
  had no field for it.
- **The rule to mirror.** `refuseForeignLetterSources` (same file) already checks
  a letter's data-room source: the same organisation, scoped to the program
  the project anchors (`projects.regulatory_program_id`). The submission check
  follows it.
- **The canonical submission.** `submissions` (with `program_id`), the store
  Submission Center, the dispatch gate and commitment fulfilment
  (`server/services/ha-interactions/commitment-fulfilment.ts`) read.
  `GET /api/submissions?programId=` (`server/routes/submissions.ts`), read
  through `programSubmissionsPath` (`programSequence.ts`), is the client's
  scoped list. Respond already holds it as `markets`.
- **Not used.** `concept2cure_submission_center_items` (the same router's
  work-item list) and the MDX-only `c2c_correspondence` / `c2c_submissions`
  model are not the Submission Center's submissions. Neither is linked to.
- **Already linked elsewhere.** Commitment fulfilment signs a
  commitment-to-sequence link. This change does not touch it.

- **Deleted, none a checked link.**
  - `server/routes/concept2cure-communication-center.ts` (deleted in
    `fb4fbde3b`) was a dead copy of this route, with the same unchecked text.
  - `RegulatoryCommunicationsHub.tsx` (deleted in `8ba28dc0d`) took a typed-in
    submission id for the also-deleted `/api/regulatory-correspondence` API.
  - `CorrespondenceManagement.tsx` (`7a144fd1e`), the workspace
    `CommunicationCenter.tsx` (`2776a04a3`) and `useCommunicationCenterData.ts`
    (`e5a74a4df`) sent no submission link.

Searches run: `linked_submission_id` and `linkedSubmissionId` across `server/`,
`client/src`, `shared/` and `migrations/`; `FROM submissions` in `server/routes`;
`programSubmissionsPath`; and `git log --all --diff-filter=D` on
`*Correspondence*`, `*correspondence*`, `*CommunicationCenter*` and
`*communication-center*`. Each deleted file was read at its parent commit for a
submission field.

## The change

- **Server.** `resolveLinkedSubmission` accepts a link only to a live submission
  of this organisation in the project's program. Anything else is refused with
  400 and nothing is written: free text, another program's submission, another
  organisation's, a removed one, an id that does not exist. An empty choice
  means no submission. The POST returns the submission it names. The GET reads
  `linkedSubmission` back through the same rule, so a value stored before this
  check returns as itself with `linkedSubmission: null`. That covers free text,
  another program's id and a removed submission. No schema change.
- **Communication Center.** The log form has an optional "Submission it
  concerns" field. It lists the project's submissions while the form is open,
  and says when they could not be read. The inbox card shows "concerns
  ONC-221 IND (IND, FDA)", or says that the stored submission is not one of
  this project's.
- **Respond.** The letter step asks which submission the letter concerns.
  - If the project has one submission, it is preselected and can be changed.
  - If it has several, none is linked until the person picks one.
  - "Not linked to a submission" is always offered.
  - The same choice sets the market the response sequence starts in.
    `submissionLabel` replaces Respond's own `marketLabel`.

## Evidence

| File | What it shows |
|---|---|
| `01-red-db.txt` | On trunk `d4be3c13f`, the route stores every one of these with 200 and reads back no submission. |
| `02-green-db.txt` | With the change, real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), 8/8. |
| `03-red-route.txt` | The route cases on trunk: no refusal, no lookup rule, no `linkedSubmission`. |
| `04-green-route.txt` | The route suites, including the PGlite advance and CMC-question suites, 48/48. |
| `05-red-client.txt` | Communication Center and Respond on trunk: no field, nothing sent, no card text. |
| `06-mutation-db.txt` | The POST lookup scoped to the organisation only: the other-program case goes red, alone. |
| `07-mutation-read-db.txt` | The GET join scoped to the organisation only: the stored other-program id case goes red, alone. |
| `08-neighbours-db.txt` | Commitment fulfilment, agency responses and CMC questions, which post letters through the same router, 110/110. |
| `09-green-client.txt` | Every client suite importing the changed surfaces: 321/322. |

The one failure in `09`, `anaDrivesWave5.test.tsx` (CmcModule pane), fails
identically with these client files reverted to trunk. It is not this change.

## What remains

- A project with no program is refused by project admission (404) before this
  is read, so it has no case here.
- AnA's "Draft response" request does not yet name the letter's submission.
- Gap 6 items 1-4 (the cumulative filed-state view and the IND diff routes) are
  untouched.
