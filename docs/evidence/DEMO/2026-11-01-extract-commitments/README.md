# Extract commitments: seeded for the demo and used in the running app

2026-11-01 · package DATA (`docs/design/one-design-plan.json`) · finishes `scripts/demo/launch-demo/packs/lumen.mjs`

The founder's "extract commitments" (P-81, P-84) reads the postmarketing requirements and commitments in an
agency letter, without a model, and proposes each one for a person to record, with a reason, in the commitments
register. It was built in ff7fc490b7, but no demo project had a letter to read. This change seeds one through the
app's own APIs and walks the feature in the running app at `http://127.0.0.1:5000` (CLAUDE.md RULE 4).

## What already exists

Searched: `scripts/demo/launch-demo/**` for `agency-communications`, `chat/upload`, `commitments`, `cre_source`
(no hits: no pack seeded a letter, a data-room source or an agency communication). Then the feature and its write
paths:

| Piece | Path | What it does |
|---|---|---|
| Parser | `shared/agency/letter-commitments.ts` | `splitLetterCommitments`: an FDA approval letter's PMRs (505(o), PREA, accelerated approval) and PMCs (506B, not 506B), verbatim, with schedule and due date. Test layout: `shared/agency/__tests__/letter-commitments.test.ts`. |
| Questions parser (G3) | `shared/agency/letter-questions.ts` | `splitLetterQuestions`: a letter's numbered questions. |
| Read | `server/services/agency-responses/letter-question-proposals.ts` | `readLetterCommitmentProposals`: reads the letter's linked data-room source (`cre_evidence_sources.extracted_text`, linked as `cre_source:<id>`), proposes each commitment with `recordBasis`, and marks one already recorded. |
| Routes | `server/routes/c2c/agency-responses.ts` | `GET …/agency-communications/:eventId/commitment-proposals`, `POST …/agency-communications/:eventId/commitments` (governed, with a reason). |
| Screen | `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` (`LetterCommitmentProposals`), in `AgencyResponses.tsx` | "The letter imposes N commitments…", a Record button per commitment opening a form filled from the letter. |
| Letter upload | `server/routes/chat/upload.ts` (`POST /api/chat/upload`, used by `useChatUpload.ts` and Respond's "Add the agency's letter") | Stores the file, records one data-room source in the project, and reads its text before answering (`dataRoom.readable`). |
| Inbox write | `server/routes/c2c/communication-center.ts` (`POST /projects/:projectId/agency-communications`) | Logs the communication; `refuseForeignLetterSources` checks each `cre_source:<id>` is this project's source. |
| Demo seed | `scripts/demo/launch-demo/seed.mjs`, `lib.mjs`, `packs/*.mjs` | Writes through the product's APIs as a signed-in user, idempotent by title, manifest per pack. |

Nothing new was built. The seed calls the two writes Respond itself makes (upload, then log), in the existing
helper module `packs/work-areas.mjs`.

## What was seeded

Both letters are fictional and say so in their title and at their head and foot. Neither was issued by FDA, and no
real person is named. LMN-201 is not approved and no Lumen Bioscience authorization is represented: the approval
letter is addressed to the demonstration's fictional sponsor. Each letter is a plain-text file with fixed dates,
so its bytes and checksum are the same on every run. The file name is the source's title, so it is ASCII.

| Project | Data-room source | Agency communication | What the inbox reads in it |
|---|---|---|---|
| `[Demo · Lumen] LMN-201` (`94223e96-…`) | 157 · `[Demo] FDA approval letter (fictional) - LMN-201 BLA 761901.txt` | `ace_1793510204507_ca0d5511` · "FDA approval letter (fictional demo), BLA 761901" · class `approval_letter`, no response required, open | 4 commitments: 4710-1 and 4710-2 (PMR, FDCA 505(o)(3), due 2030-06-30 and 2030-03-31), 4710-3 (PMR, PREA (FDCA 505B), due 2030-06-30), 4710-4 (PMC, FDCA 506B, due 2027-12-31); 0 questions |
| `[Demo · Biotech] C2C-101` (`42d5dcc0-…`) | 158 · `[Demo] FDA information request (fictional) - IND C2C-101.txt` | `ace_1793510248567_33ddc992` · "FDA information request (fictional demo), IND C2C-101" · class `information_request`, response required | 3 numbered questions; 0 commitments |

How (`ensureAgencyLetter`, `packs/work-areas.mjs`):

1. Find the source by title in `GET /api/c2c/projects/:id/sources`, or upload it through `POST /api/chat/upload`
   with the project's id. The step fails unless the answer names a source and `dataRoom.readable` is true (the
   text was read; `processing.status` answered `completed`).
2. Find the communication whose `linkedArtifactIds` holds `cre_source:<id>`, or log it through
   `POST /api/concept2cure/projects/:id/agency-communications`.
3. Read the inbox's own `question-proposals` and `commitment-proposals` for it. The step fails unless every
   source reads `read` and the questions and commitment numbers are the ones the letter's content declares
   (`expect`).

The letters are `APPROVAL_LETTER` in `packs/lumen-content.mjs` and `BIOTECH_IR_LETTER` in
`packs/biotech-work-content.mjs`. Runs, against the dev stack:

```
node scripts/demo/launch-demo/seed.mjs --pack lumen   --base-url http://127.0.0.1:5000 --email jm.smith@concept2cure.pro
  … uploaded 157 (text read: completed) · logged ace_1793510204507_ca0d5511 · 0 questions, 4 commitments proposed
  ⇒ lumen pack: created 2, found 35
(second run)  ⇒ lumen pack: created 0, found 37
node scripts/demo/launch-demo/seed.mjs --pack biotech --base-url http://127.0.0.1:5000 --email jm.smith@concept2cure.pro
  … uploaded 158 (text read: completed) · logged ace_1793510248567_33ddc992 · 3 questions, 0 commitments proposed
  ⇒ biotech pack: created 2, found 196
```

Manifests: `../lumen/manifest.json` (`records.approvalLetter`), `../biotech/manifest.json`
(`records.informationRequest`).

A seed defect was fixed on the way, in the same file. `ensurePlanDocuments` read `GET /api/authoring/docs` through
`rowsOf`, which did not know that route's `documents` key, so every run started each Plan deliverable again. LMN-201
holds 3 copies of each of its 4. Now it reads "0 started, 4 already started". The existing copies were left as they
are: the seed has no delete path.

## The walk, in the running app

`walk.cjs` here is the walk, with Playwright against `http://127.0.0.1:5000`. It does one dev-login, stored in
local and session storage as the client stores it. From there it goes where a person goes, and asserts each step.
The step logs are `walk.json` (the full run) and `walk-narrow.json` (`--narrow-only`: the form opened and
cancelled, the 390-wide view, and the C2C-101 questions; it records nothing). No API call failed and no console
error was logged in either run.

| # | Step | Result | Screenshot (1440×900 unless said) |
|---|---|---|---|
| 1 | Projects, search "LMN-201" | the `[Demo · Lumen] LMN-201` card is listed | `screenshots/01-projects-lmn201.png` |
| 2 | Open it | Project home on `?program=94223e96-…`; the top bar reads LMN-201 | `screenshots/02-project-home.png` |
| 3 | Rail → Communication | Agency inbox · 1: "FDA approval letter (fictional demo), BLA 761901", official correspondence, open, "letter in the data room" | `screenshots/03-agency-inbox.png` |
| 4 | Questions & responses | "The letter imposes 4 commitments, found in its text without AI. Check each against the letter, then record it with a reason. It is then tracked with its due date." The 4 are 4710-1 to 4710-4, each with its kind, basis and due date. | `screenshots/04-commitments-proposed.png` |
| 5 | Record → the form | Filled from the letter: type PMC, the letter's words, due 2027-12-31, basis `FDCA 506B · 4710-4`; the reason is empty. Shown for 4710-4, opened and **cancelled** (`--narrow-only`) so that one commitment is left for the live demo. The full run checked the same for 4710-3: PMR, its words, 2030-06-30, `PREA (FDCA 505B) · 4710-3`. **The basis is filled** (`recordBasis`, ff7fc490b7). | `screenshots/05-record-form-filled.png` |
| 6 | Give a reason, Record commitment | Reason "Recording 4710-3 from the fictional demo approval letter (BLA 761901) for tracking."; `POST …/commitments` answered 201, commitment 3 | `screenshots/06-record-form-reason.png` |
| 7 | Back on the letter | 4710-3 reads **Recorded**; toast "Commitment 4710-3 recorded from the letter. It is listed under Meetings & commitments with its due date." | `screenshots/07-recorded.png` |
| 8a | Meetings & commitments, without reloading | 4710-3 is listed (see finding 1 for the first run) | `screenshots/08a-register-before-reread.png` |
| 8b | Same, after a reload | "PMR · Conduct a pharmacokinetic … · PREA (FDCA 505B) · 4710-3 · due 2030-06-30 · Open · Record fulfilment" | `screenshots/08b-register-after-reread.png` |
| 9 | The letter at **390 wide**, loaded fresh | No horizontal overflow, but each commitment's words get a **0 px** column (finding 2) | `screenshots/09-mobile-390-commitments.png` |
| 10 | C2C-101 → Communication → the information request → Questions & responses | "In the letter: 3 numbered questions, found in its text without AI." with 1, 2, 3 and a Record button for each (G3) | `screenshots/10-biotech-ir-questions.png` |

The walk ran three times in full. Each full run records one commitment: a governed write that cannot be undone.

- **Run 1.** Steps 1–7 passed and recorded 4710-1 (commitment 1). Step 8 then found "No regulatory commitments
  yet" under Meetings & commitments (finding 1). Its screenshot was replaced by the later runs. After that the
  5000 server stopped; it was not restarted from this session.
- **Run 2**, once the server was back. Recorded 4710-2 (commitment 2), which was now listed without a reload: a fix
  by another session was in the working tree. The run stopped at 390 wide, because resizing a live desktop page
  leaves the rail open as a drawer over the content. The walk now reloads at 390, as a phone loads the page; on a
  fresh load the rail is the 56 px icon rail.
- **Run 3** passed end to end and recorded 4710-3 (commitment 3).
- The `--narrow-only` run re-shot steps 5 and 9 and wrote nothing.

The register now holds 4710-1, 4710-2 and 4710-3, all open, from `ace_1793510204507_ca0d5511`
(`GET /api/concept2cure/projects/94223e96-…/commitments`: total 3, overdue 0). 4710-4 is unrecorded, for the
founder to record in the demo. A further full run would record it.

## Findings

Line numbers are at HEAD. For the agency files that is ff7fc490b7, their last commit.

1. **The register did not re-read after a commitment was recorded from the letter.** The toast said it was listed
   there. `AgencyResponses.tsx` `recordLetterCommitment` (at ff7fc490b7, lines 471–493) called only its own
   `reload()`. `recordCommitment` (447–469), for a commitment made in a question's answer, did the same. The
   register is read by `CommunicationCenter.tsx:279-281`, keyed on `commitVersion`, which only that screen's own
   record (`:304`) and fulfil (`:888`) bumped. Seen in run 1. An uncommitted change by another session, in
   `AgencyInbox.tsx`, `AgencyResponses.tsx` and `CommunicationCenter.tsx`, adds `onCommitmentRecorded` to bump
   `commitVersion`. Runs 2 and 3 show it working (screenshot 08a). It is not part of this commit.
2. **At 390 wide a commitment's words are 0 px wide**, one character per line (screenshot 09; `textColumnsPx:
   [0,0,0,0]` in `walk-narrow.json`). `.cc-q-proposal` is a one-line flex row
   (`client/src/concept2cure/v2/styles/commcenter-v2.css:154`) made for a question's number, words and button. The
   commitment row adds a fourth item, the kind, basis and due date
   (`client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx:143`). The words' span is `flex:1;
   min-width:0; overflow-wrap:anywhere` (`commcenter-v2.css:155`), so it is the one that gives up all its width.
   Not fixed here: the styles are another session's lane.
3. The inbox card shows the received date as a raw ISO timestamp, "received 2026-11-01T05:16:44.507Z"
   (`AgencyInbox.tsx:393`). It shows the visibility tier as its enum, "Shared Client C2c" (`AgencyInbox.tsx:432`).
4. The register shows the due date as ISO, "due 2030-06-30" (`CommitmentRow.tsx:246`). A commitment recorded from a
   letter does not name its letter: the "made in the answer to … of <letter>" clause is written only when
   `source_question_id` is set (`CommitmentRow.tsx:248`).
5. On an approval letter, which asks no questions, the panel still says "No numbered questions were found in the
   letter's text. Record each question by hand." (`LetterQuestionProposals.tsx:63`) and "No questions are recorded
   on this letter…" (`AgencyResponses.tsx:691`).
6. The half-width Regulatory basis field cuts off the agency's number in a longer basis: "PREA (FDCA 505B) · 471"
   (screenshot 06). The value is complete.
7. A link opened in a fresh tab (`/concept2cure/communication-center?program=<uuid>`) shows the LMN-201 inbox,
   while the top bar reads "Open project". `restoreShellProject` restores the id only (`shellProject.ts:235`), and
   `Shell.tsx:676` falls back to "Open project" with no name.
8. Seed-side, pre-existing: `scripts/demo/launch-demo/demo-recovery.test.mjs` fails 35/35 at HEAD as well as with
   this change. Its fixture copies only `lib.mjs`, `seed.mjs` and `packs/biotech.mjs` (lines 31–32), and
   `biotech.mjs` imports seven other pack modules (`Cannot find module …/biotech-work-content.mjs`). This change
   adds no import that HEAD's `biotech.mjs` did not already have.

## Resolved

Re-landed on `concept2cure-v2` on 2026-11-04, after this session reconciled onto trunk; each fix has a test that fails on the old code.

| # | Defect | Fixed in |
|---|---|---|
| 1 | Meetings & commitments did not list a commitment recorded from a letter until re-read | `d9edfb1da3`: `onCommitmentRecorded` from `AgencyResponses` through the inbox to Communication's register version |
| 2 | At 390 wide each commitment's text was 0px wide | The F1 phone-width commit beside this one: `.cc-q-proposal` wraps and the text keeps a 16ch minimum. Re-shot: `screenshots/09-mobile-390-commitments.png` |
| 3 | Received date as a raw ISO instant; visibility tier "shared client c2c" | `ee7c051bca`: "received Oct 12, 2026"; "Your team and Concept2Cure" |
| 4 | Commitment rows "due 2030-06-30", and no word of the letter they came from | `ee7c051bca`: "due Jun 30, 2030 · recorded from Approval letter" |
| 5 | A letter that asks nothing told to record its questions by hand | `ee7c051bca`: it says it needs no response; the hint is on letters that owe one |
| 6 | The half-width basis field cut off "PREA (FDCA 505B) · 471…" | `ee7c051bca`: basis on a full row in both forms |
| 7 | A link opened in a fresh tab: the top bar had no name for the project | `7a1ee8fec7`: the top bar names the project in the shell's channel on whichever screen the link opened |
| 8 | `demo-recovery.test.mjs` failed 35/35 | On trunk from another session before this one re-landed |

The re-shoot (`walk.cjs --narrow-only`) records nothing; `walk-narrow.json` is its output.
