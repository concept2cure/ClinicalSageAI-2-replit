# G3: the Agency inbox proposes the letter's questions, and a person records each

Row: D2 (W1). Slice G3 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`, a step of P-39 step 3. Its
prerequisite, P-39 step 2 (commitments converged), landed first
(`docs/evidence/D2-COMMITMENTS-CONVERGED/2026-10-29/`), as P-54 orders.
Benchmark: HAQ Manager extraction (V).

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Question store and writer | `agency_communication_questions` (`migrations/20261018b_agency_response_questions.sql`); `POST …/agency-communications/:eventId/questions` (`server/routes/c2c/agency-responses.ts`) | A governed create: the number, the verbatim text and a reason, with a ledger row. | Nothing proposed what to record. A person retyped every question from the letter. |
| The letter | `cre_source:<id>` in the communication's `linked_artifact_ids`, checked on write by `refuseForeignLetterSources` (`communication-center.ts`); its text in `cre_evidence_sources.extracted_text` (`20261008c`) | The letter is in the data room and its text has been read. | Nothing read it for questions. |
| Issue parser | `server/services/regulatory-correspondence/issue-parser.ts` | Classifies a whole letter by keyword. There are two taxonomies: CTD rules for a drug letter and device rules for a device letter. | **It does not split a letter into questions.** It returns one issue per matched category, each carrying the letter's first 280 characters. The plan's "device-scoped" is half right: the device taxonomy is used only for device submissions. |
| Numbered split | `draft_fda_ir_response` (`server/services/ana/AnaToolExecutor.ts`) | Split pasted IR text on numbered lines. | It joined each question into one line and cut it at 1,500 characters, so its output was not verbatim. It accepted "N " with no delimiter, so "10903 New Hampshire Avenue" became question 10903. And it ran only in AnA chat. |
| Model extractors | `crl-ingestion.service.ts`; `/api/c2c/commitments/extract` (now retired) | Model-based extraction. | Not candidates: a model would produce the list (RULE 2). |

Searches run:
- `extract`, `questions`, `split`, `numbered` and `issue-parser` in `server/services/regulatory-correspondence/`,
  `server/services/agency-responses/`, `server/routes/c2c/` and `server/services/ana/`;
- `question-proposals` and `extracted_text` across `server/` and `client/`.

## The design decision the plan left open

The plan named `issue-parser.ts` as the survivor because P-39 keeps "its issue parser … as the inbox's", and asked
whether that parser's split runs without the device taxonomy.

The parser has no split. What it does is classify, and it keeps doing that.

The split is the numbered-question split, which lived in one AnA tool. It moves to
`shared/agency/letter-questions.ts`, becomes verbatim, and is tightened:
- a question needs a delimiter after its number, and each part of the number is at most three digits;
- it ends at the next number, at the letter's closing, or at two blank lines;
- `text === letter.slice(start, end)`.

The inbox proposes from it, and `draft_fda_ir_response` now lists the same questions. That is one splitter, with
zero duplication.

## What changed

- **`shared/agency/letter-questions.ts`**, `splitLetterQuestions`: no model; verbatim; offsets into the text.
- **`server/services/agency-responses/letter-question-proposals.ts`**:
  - reads the letter's linked sources under the same project-scope rule the link was checked against on write;
  - splits each source's read text;
  - marks a proposal whose number is already recorded on the letter.
  - It writes nothing.
- **`GET …/agency-communications/:eventId/question-proposals`**: a read, with the letter's own visibility check.
- **`draft_fda_ir_response`** lists its questions through the shared splitter.
- **`LetterQuestionProposals.tsx`** in the letter's Questions and responses panel:
  - "In the letter: N numbered questions, found in its text without AI".
  - Each question shows its number and words.
  - "Record" opens the existing Record-a-question form filled with them. The person checks it against the letter, adds
    a reason and records it through the existing POST.
  - A file whose text was not read, or that is not this project's, says so.

## Proof

Red at HEAD: there was no proposal path, so the tests below could not import what they test.

- **`shared/agency/__tests__/letter-questions.test.ts`.**
  - A drug IND letter gives exactly its three questions, each the exact slice of the letter.
  - The address line, the date and the closing paragraphs are not questions.
  - "Question N:" and "1.2)" forms are read.
  - A letter with no numbered question, and "10903 New Hampshire Avenue", give nothing.
- **`server/services/agency-responses/__tests__/letter-question-proposals.pglite.test.ts`.**
  - The proposal returns the three questions verbatim, and the row counts are unchanged after it.
  - A question recorded under the same number ("Q2" for "2") is marked recorded.
  - Another project's file is `not-found`, a file with no read text is `no-text`, and neither yields a proposal.
- **`client/src/concept2cure/v2/__tests__/agencyResponsesLetterProposals.test.tsx`.**
  - The panel says "In the letter: 2 numbered questions, found in its text without AI".
  - A recorded one says Recorded and offers no button.
  - "Record question 1 from the letter" opens the Record-a-question form with "1" and the verbatim text, and no
    write request is made.
  - Recording it is the existing governed POST, pinned by its own tests.
- **Mutation.** Restoring the old AnA opener (a space after any number is enough) fails four cases, including the
  street number and the IND letter. Restoring the tightened opener makes them pass.
- **Unchanged.**
  - The existing inbox tests pass: `agencyResponses*`, `projectRespondStage`, `specialist*Interaction` (87).
  - `new-tool-handlers.test.ts` passes on the converged AnA tool.
- **Gates.**
  - `ci:sql-interpolation`: OK.
  - `ci:launch-scope-api`: none refused.
  - ESLint ratchet: net −1.
  - `tsc --noEmit`: no error.

## Not done here

- **P-39 step 3 itself** (the `c2c_correspondence` family converging onto the inbox) is the next step. This slice is
  the part of it that G3 names.
- **Classifying each proposed question** with the issue parser's discipline and CTD section is left out. Its sections
  come from whole-letter keywords, and a person records the section today.
