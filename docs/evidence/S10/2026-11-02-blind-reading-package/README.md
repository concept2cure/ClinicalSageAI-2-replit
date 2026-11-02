# Blind second reading of S10's reader list: the package (2026-11-02)

This is the input for the blind second reading the coordinating session (`01JbQU…`) runs for S10, the G3 letter-question
splitter. It has two independent readers and an adjudicator, and its readings are filed beside this directory. It
replaces the RIM session's (`011e42…`) single reading as the per-family floor in S10's evidence, as the S10 design's §9
item 11 requires.

## What is here

- **`letters/`**: 49 letters, one file each.
  - Each file is exactly the text the data room stores for that letter, decoded as UTF-8.
  - The text comes from trunk's `extractCapture`, run on `b4bd7a877`, through the S10 oracle's loader, the way
    `GET …/question-proposals` reads a letter.
  - Every letter is **synthetic**. The RIM session's red team wrote them from public FDA and EMA template wording:
    Information Request, clinical hold, Complete Response, Advice and CDRH Additional Information letters, meeting
    minutes, and an EMA list of questions. No real application, product or person is in them; numbers such as
    `IND 123456` are placeholders.
  - Control and invisible characters (form feed, vertical tab, no-break space, zero-width marks and others) are part of
    the stored text and are kept as they are.
- **`questions.json`**: the letter list, with each letter's source fixture, how it was extracted, a sha256, its UTF-16
  length, code points and lines. It also holds the 177 questions the RIM session's reader listed. Each question has:
  - its letter;
  - the agency's own reference;
  - its line range;
  - **[start, end)** offsets: JavaScript string (UTF-16) indices into the letter file decoded as UTF-8, plus the same
    positions in code points;
  - its first and last words.
- **No judgement of the RIM session is included.** There is no family, no cut and no verdict. The reader list's own
  `cut` column, and the prototype's output, are deliberately left out.

## The reader questions

For each question in `questions.json`:

- **(A)** Would a regulatory reader record this as one of the letter's questions? Answer yes, no or unsure, with a
  reason when not yes.
- **(B)** Can **one contiguous span** of the stored text hold exactly the agency's words of this question, with
  nothing inside it that is not the question's words? Things that do not belong include page furniture (a page number,
  a Reference ID line, a running header or footer, letterhead), a heading, a control character, another question and
  the sponsor's text. Answer yes or no; if no, say what is inside, by line.

For each letter:

- **(C)** List any question a reader would record that is missing from the list, by line and first words.

The adjudicator records each disagreement between the two readers, and how it was settled.

## How to check it

- **Each letter file's sha256** is in `questions.json`.
- **`questions.json`'s own sha256** is `57964e3ab70e858e977c73fd48014369bb16cd341efdcf5acc2b2da6dcd27937`.
- **A question's words** are, in Node, `readFileSync(letterFile, 'utf8').slice(start, end)`.
- **Round trip.** The builder (`make-evidence.mts`, kept in the RIM session's scratchpad, not in the repository) read
  every letter back from disk. It confirmed that all 177 slices begin with their first words and end with their last
  words.

| Letter | File | Source fixture | Lines | sha256 |
|---|---|---|---|---|
| L01 | `letters/L01-fixtures_agency-name-above-page-number.txt.txt` | fixtures/agency-name-above-page-number.txt | 9 | `cdc83cf029de04a1…` |
| L02 | `letters/L02-fixtures_cdrh-ai.pdf.txt` | fixtures/cdrh-ai.pdf | 29 | `43bc89cd6670118f…` |
| L03 | `letters/L03-fixtures_closer-in-question-lines.docx.txt` | fixtures/closer-in-question-lines.docx | 23 | `412b3fa2e3b0cb82…` |
| L04 | `letters/L04-fixtures_closer-in-question-lines.txt.txt` | fixtures/closer-in-question-lines.txt | 12 | `f949bcd87ed1e3ac…` |
| L05 | `letters/L05-fixtures_closer-in-question.pdf.txt` | fixtures/closer-in-question.pdf | 21 | `4259d30ac72d173c…` |
| L06 | `letters/L06-fixtures_control-in-heading.docx.txt` | fixtures/control-in-heading.docx | 9 | `db46b41bb32ca405…` |
| L07 | `letters/L07-fixtures_de-novo.pdf.txt` | fixtures/de-novo.pdf | 21 | `8e81e38d5394234c…` |
| L08 | `letters/L08-fixtures_dmf-at-page-foot.pdf.txt` | fixtures/dmf-at-page-foot.pdf | 17 | `ec18a254b4585920…` |
| L09 | `letters/L09-fixtures_dmf-list.pdf.txt` | fixtures/dmf-list.pdf | 20 | `4e07ecbb7a1cd9d0…` |
| L10 | `letters/L10-fixtures_ema-aspect-per-page.pdf.txt` | fixtures/ema-aspect-per-page.pdf | 24 | `caeccb9e0bbcba6a…` |
| L11 | `letters/L11-fixtures_ema-loq.docx.txt` | fixtures/ema-loq.docx | 27 | `b464233f54be5039…` |
| L12 | `letters/L12-fixtures_ema-loq.pdf.txt` | fixtures/ema-loq.pdf | 28 | `50432111f48a632f…` |
| L13 | `letters/L13-fixtures_ema-reference-at-foot.txt.txt` | fixtures/ema-reference-at-foot.txt | 21 | `48b74c24a5fd5052…` |
| L14 | `letters/L14-fixtures_ema-restart-after-list.docx.txt` | fixtures/ema-restart-after-list.docx | 19 | `c97a79a8911ec4aa…` |
| L15 | `letters/L15-fixtures_enclosures-after-sign-off.txt.txt` | fixtures/enclosures-after-sign-off.txt | 10 | `bd2b545c99fd2d18…` |
| L16 | `letters/L16-fixtures_fda-crl-continuous.pdf.txt` | fixtures/fda-crl-continuous.pdf | 41 | `f05c5b3d675e2dac…` |
| L17 | `letters/L17-fixtures_fda-crl.pdf.txt` | fixtures/fda-crl.pdf | 41 | `88ecb8e484121113…` |
| L18 | `letters/L18-fixtures_fda-ir.pdf.txt` | fixtures/fda-ir.pdf | 34 | `f9616ff7a3d9e559…` |
| L19 | `letters/L19-fixtures_fda-restart-after-lots.docx.txt` | fixtures/fda-restart-after-lots.docx | 13 | `3e5e650c3f6f2cf4…` |
| L20 | `letters/L20-fixtures_form-feed-in-question.txt.txt` | fixtures/form-feed-in-question.txt | 5 | `e03f89678c9fffbb…` |
| L21 | `letters/L21-fixtures_form-feed-joined.txt.txt` | fixtures/form-feed-joined.txt | 4 | `fe12840708976119…` |
| L22 | `letters/L22-fixtures_heading-opens-page.pdf.txt` | fixtures/heading-opens-page.pdf | 22 | `1f2130ebb5060cf6…` |
| L23 | `letters/L23-fixtures_kind-regards-in-question.txt.txt` | fixtures/kind-regards-in-question.txt | 6 | `78b3d3e17e99f85c…` |
| L24 | `letters/L24-fixtures_last-question-two-sentences.txt.txt` | fixtures/last-question-two-sentences.txt | 6 | `df7c91303d03c50d…` |
| L25 | `letters/L25-fixtures_lead-in-between.docx.txt` | fixtures/lead-in-between.docx | 9 | `85324ce7c7644260…` |
| L26 | `letters/L26-fixtures_letterhead-at-page-foot.pdf.txt` | fixtures/letterhead-at-page-foot.pdf | 14 | `4766d178a3d4c7e8…` |
| L27 | `letters/L27-fixtures_lot-list.pdf.txt` | fixtures/lot-list.pdf | 16 | `e746456f87da10e0…` |
| L28 | `letters/L28-fixtures_outer-single-question.txt.txt` | fixtures/outer-single-question.txt | 6 | `e12637b0c0cedd4b…` |
| L29 | `letters/L29-fixtures_please-clarify.pdf.txt` | fixtures/please-clarify.pdf | 30 | `5bfacee48d8b1b8a…` |
| L30 | `letters/L30-fixtures_pmda-inquiry.docx.txt` | fixtures/pmda-inquiry.docx | 13 | `7f486e2f008ca1a2…` |
| L31 | `letters/L31-fixtures_predicates.docx.txt` | fixtures/predicates.docx | 17 | `1450dc2f7d748c38…` |
| L32 | `letters/L32-fixtures_regards-wrapped.pdf.txt` | fixtures/regards-wrapped.pdf | 24 | `a1fb9b7764b7d3dc…` |
| L33 | `letters/L33-fixtures_table-at-page-foot.pdf.txt` | fixtures/table-at-page-foot.pdf | 26 | `dcc13e9570976aa6…` |
| L34 | `letters/L34-fixtures_unmarked-header.pdf.txt` | fixtures/unmarked-header.pdf | 13 | `ba2bce06a12eed92…` |
| L35 | `letters/L35-fixtures_wrapped-lead-in.docx.txt` | fixtures/wrapped-lead-in.docx | 9 | `96e74d9ab0c3678f…` |
| L36 | `letters/L36-r1-real-forms_probe-tabs.pdf.txt` | r1-real-forms/probe-tabs.pdf | 10 | `13ea7897a8ddec73…` |
| L37 | `letters/L37-r1-real-forms_probe-tabs.stored.txt.txt` | r1-real-forms/probe-tabs.stored.txt | 10 | `13ea7897a8ddec73…` |
| L38 | `letters/L38-r1-real-forms_rf01-fda-ir-cmc.pdf.txt` | r1-real-forms/rf01-fda-ir-cmc.pdf | 74 | `2058af7278f756b5…` |
| L39 | `letters/L39-r1-real-forms_rf02-fda-ir-cmc-subheadings.docx.txt` | r1-real-forms/rf02-fda-ir-cmc-subheadings.docx | 71 | `ee5f636350d94562…` |
| L40 | `letters/L40-r1-real-forms_rf02-fda-ir-cmc-subheadings.pdf.txt` | r1-real-forms/rf02-fda-ir-cmc-subheadings.pdf | 43 | `181a3c1ea37eb3a5…` |
| L41 | `letters/L41-r1-real-forms_rf02-fda-ir-cmc-subheadings.txt.txt` | r1-real-forms/rf02-fda-ir-cmc-subheadings.txt | 41 | `8e4e52829ba81dd7…` |
| L42 | `letters/L42-r1-real-forms_rf03-clinical-hold.pdf.txt` | r1-real-forms/rf03-clinical-hold.pdf | 65 | `d3a5f18d3c03e672…` |
| L43 | `letters/L43-r1-real-forms_rf04-crl.pdf.txt` | r1-real-forms/rf04-crl.pdf | 81 | `a8dc4c0b0069c8bd…` |
| L44 | `letters/L44-r1-real-forms_rf05-crl-pq-heading-pair.pdf.txt` | r1-real-forms/rf05-crl-pq-heading-pair.pdf | 81 | `2a93c9f1e440a5fc…` |
| L45 | `letters/L45-r1-real-forms_rf06-preind-prelim.pdf.txt` | r1-real-forms/rf06-preind-prelim.pdf | 86 | `15eb1ab332d8b457…` |
| L46 | `letters/L46-r1-real-forms_rf07-advice-letter.pdf.txt` | r1-real-forms/rf07-advice-letter.pdf | 47 | `72262be0049827b7…` |
| L47 | `letters/L47-r1-real-forms_rf08-preind-minutes.pdf.txt` | r1-real-forms/rf08-preind-minutes.pdf | 71 | `e7654c3fb41c609f…` |
| L48 | `letters/L48-r1-real-forms_rf09-cdrh-ai.pdf.txt` | r1-real-forms/rf09-cdrh-ai.pdf | 60 | `48973ab8982b3ad9…` |
| L49 | `letters/L49-r1-real-forms_rf10-cber-minutes-cber-response.pdf.txt` | r1-real-forms/rf10-cber-minutes-cber-response.pdf | 71 | `5676f8127fac9611…` |
