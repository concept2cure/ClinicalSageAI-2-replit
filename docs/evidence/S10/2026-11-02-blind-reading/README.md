# Blind second reading of S10's letter-question list (2026-11-02)

## What this is

This is the blind second reading that S10's design §9 item 11 requires. It reads the 177 questions that the RIM session's
reader listed for 49 agency letters, from the package in
[`../2026-11-02-blind-reading-package/`](../2026-11-02-blind-reading-package/).

- **How it was read.** The 49 letters were split into three groups. In each group, two readers (A and B) read
  independently, and an adjudicator read both readings, every letter and every slice.
- **Blind.** Nobody in this reading saw the RIM session's own reading. The package holds no family, cut or verdict
  from it. No reader saw the other reader's file, or any other group's file.
- **No comparison here.** This folder does not compare its answers with the RIM session's reading. The RIM session does
  that comparison.
- **Evidence only.** No code changed.

## What already exists

- **The package:** `docs/evidence/S10/2026-11-02-blind-reading-package/`, committed in `a0b2b6701`. It holds the
  49 letters, `questions.json`, the reader questions (A), (B) and (C), and a sha256 table.
- **The splitter whose list this reads:** `shared/agency/letter-questions.ts`, from G3 commit `7f5a68c14`. The Agency
  inbox uses it to propose a letter's numbered questions.
- Before this folder, no other reading of the list was filed under `docs/evidence/S10/`.

## The package it read

| | |
|---|---|
| Path | `docs/evidence/S10/2026-11-02-blind-reading-package` |
| Commit | `a0b2b6701` |
| `questions.json` sha256 | `57964e3ab70e858e977c73fd48014369bb16cd341efdcf5acc2b2da6dcd27937` |
| Letters | 49 synthetic letters, L01 to L49, as the data room stores them |
| Questions | 177, n = 1 to 177 |

Every reader and every adjudicator checked the sha256 of `questions.json`, and the sha256 and UTF-16 length of every
letter in their group, before reading. All of them matched.

## Method

| Group | Letters | Questions | Readers | Adjudicator |
|---|---|---:|---|---|
| g1 | L01 to L17 | 63 (n1 to n63) | A and B, independent | read both readings, every letter and all 63 slices |
| g2 | L18 to L33 | 44 (n64 to n107) | A and B, independent | read both readings, every letter and all 44 slices |
| g3 | L34 to L49 | 70 (n108 to n177) | A and B, independent | read both readings, every letter and all 70 slices |

- **The reader questions.** Each reader answered the package README's questions:
  - **(A)** for every question: would a regulatory reader record this as one of the letter's questions?
  - **(B)** for every question: can one contiguous span hold exactly the agency's words, with nothing else inside it?
  - **(C)** for every letter: is a question missing from the list?
- **Reading a question.** A question's words are the letter file sliced at its UTF-16 `[start, end)`. Lines are 1-based,
  split on LF.
- **What counts as foreign content.** Ordinary line breaks, and the empty paragraphs of `.docx` text, are whitespace
  between a question's words. Page furniture (page numbers, page markers, Reference ID lines, running headers and
  footers, letterhead), headings, control characters such as U+000C, and the sponsor's text are foreign content.
- **Adjudication.** Where both readers agreed, the adjudicator still read the slice against its letter. That covers all
  177 questions, and no case was found where both readers were wrong. Where the readers differed, the adjudicator
  settled it and recorded why (`disagreements.json`). Each missing item was given an exact span and checked to be clean.
- **Merge checks, run when this folder was built:**
  - Every `agreed` answer equals both readers' answers in `raw/`.
  - Every `adjudicated` answer is one where the readers differed.
  - The counts recomputed from the merged list equal each adjudicator's own counts.
  - Each missing item, re-sliced from its letter, starts with its first words and holds no control character or page
    furniture.
- **A mechanical cross-check.** This is a check, not a reading. It looked for page-furniture strings and control
  characters inside each slice:
  - They appear inside all 17 spans whose (B) "no" is for page furniture or a control character.
  - They appear inside none of the 148 (B) "yes" spans.
  - The other 12 (B) "no" spans are the meeting questions, which are wholly the sponsor's text.

## Counts

### Totals

| | |
|---|---|
| Questions | 177 |
| (A) | 165 yes, 0 no, 12 unsure |
| (B) | 148 yes, 29 no |
| (C) missing | 11 |
| Reader disagreements | 10: 1 on (B), 9 on (C) (7 where the item starts, 2 where it is) |
| Agreed spots where both readers were wrong | 0 of 177 checked |

### By group

| Group | Questions | (A) yes / no / unsure | (B) yes / no | Missing | Disagreements |
|---|---:|---|---|---:|---:|
| g1 (L01 to L17) | 63 | 63 / 0 / 0 | 57 / 6 | 0 | 0 |
| g2 (L18 to L33) | 44 | 44 / 0 / 0 | 38 / 6 | 0 | 1 |
| g3 (L34 to L49) | 70 | 58 / 0 / 12 | 53 / 17 | 11 | 9 |

### By letter family

A family is taken from the letter's file name where the name shows it. Where it does not, the family comes from the
letter's title line, such as "INFORMATION REQUEST", or from its opening lines, such as EMA's "Quality aspects / Major
objections" or a 510(k) request. The per-letter table below says which one applied to each letter.

Eleven letters show no family in their name or title, and are counted as untitled request lists. One of them is L19:
its name says "fda" but not what kind of letter it is.

| Family | Letters | Questions | (A) yes / no / unsure | (B) yes / no | Missing |
|---|---|---:|---|---|---:|
| FDA Information Request | L01, L03, L04, L05, L18, L22, L26, L27, L29, L32, L33, L34, L38, L39, L40, L41 | 63 | 63 / 0 / 0 | 56 / 7 | 0 |
| FDA Information Request with a DMF list | L08, L09 | 6 | 6 / 0 / 0 | 6 / 0 | 0 |
| FDA Advice/Information Request letter | L46 | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| FDA clinical hold | L42 | 5 | 5 / 0 / 0 | 4 / 1 | 0 |
| FDA Complete Response Letter | L16, L17, L43, L44 | 22 | 22 / 0 / 0 | 19 / 3 | 2 |
| CDRH Additional Information (510(k)) | L02, L31, L48 | 10 | 10 / 0 / 0 | 8 / 2 | 0 |
| CDRH De Novo deficiency letter | L07 | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| EMA list of questions / assessment report | L06, L10, L11, L12, L13, L14 | 23 | 23 / 0 / 0 | 22 / 1 | 0 |
| FDA/CBER meeting preliminary comments and minutes | L45, L47, L49 | 12 | 0 / 0 / 12 | 0 / 12 | 9 |
| PMDA inquiry | L30 | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| Untitled request list (no family in name or title) | L15, L19, L20, L21, L23, L24, L25, L28, L35, L36, L37 | 26 | 26 / 0 / 0 | 24 / 2 | 0 |
| **All** | **49 letters** | **177** | **165 / 0 / 12** | **148 / 29** | **11** |

### By letter

| Letter | Source fixture | Family | Shown by | Questions | (A) yes / no / unsure | (B) yes / no | Missing |
|---|---|---|---|---:|---|---|---:|
| L01 | `fixtures/agency-name-above-page-number.txt` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 2 / 1 | 0 |
| L02 | `fixtures/cdrh-ai.pdf` | CDRH Additional Information (510(k)) | name | 4 | 4 / 0 / 0 | 3 / 1 | 0 |
| L03 | `fixtures/closer-in-question-lines.docx` | FDA Information Request | title line | 4 | 4 / 0 / 0 | 4 / 0 | 0 |
| L04 | `fixtures/closer-in-question-lines.txt` | FDA Information Request | title line | 4 | 4 / 0 / 0 | 4 / 0 | 0 |
| L05 | `fixtures/closer-in-question.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L06 | `fixtures/control-in-heading.docx` | EMA list of questions / assessment report | opening lines | 2 | 2 / 0 / 0 | 2 / 0 | 0 |
| L07 | `fixtures/de-novo.pdf` | CDRH De Novo deficiency letter | name | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| L08 | `fixtures/dmf-at-page-foot.pdf` | FDA Information Request with a DMF list | name | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L09 | `fixtures/dmf-list.pdf` | FDA Information Request with a DMF list | name | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L10 | `fixtures/ema-aspect-per-page.pdf` | EMA list of questions / assessment report | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L11 | `fixtures/ema-loq.docx` | EMA list of questions / assessment report | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L12 | `fixtures/ema-loq.pdf` | EMA list of questions / assessment report | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L13 | `fixtures/ema-reference-at-foot.txt` | EMA list of questions / assessment report | name | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| L14 | `fixtures/ema-restart-after-list.docx` | EMA list of questions / assessment report | name | 4 | 4 / 0 / 0 | 4 / 0 | 0 |
| L15 | `fixtures/enclosures-after-sign-off.txt` | Untitled request list | none | 2 | 2 / 0 / 0 | 2 / 0 | 0 |
| L16 | `fixtures/fda-crl-continuous.pdf` | FDA Complete Response Letter | name | 6 | 6 / 0 / 0 | 5 / 1 | 0 |
| L17 | `fixtures/fda-crl.pdf` | FDA Complete Response Letter | name | 6 | 6 / 0 / 0 | 5 / 1 | 0 |
| L18 | `fixtures/fda-ir.pdf` | FDA Information Request | name | 4 | 4 / 0 / 0 | 3 / 1 | 0 |
| L19 | `fixtures/fda-restart-after-lots.docx` | Untitled request list | none | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L20 | `fixtures/form-feed-in-question.txt` | Untitled request list | none | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| L21 | `fixtures/form-feed-joined.txt` | Untitled request list | none | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| L22 | `fixtures/heading-opens-page.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L23 | `fixtures/kind-regards-in-question.txt` | Untitled request list | none | 2 | 2 / 0 / 0 | 2 / 0 | 0 |
| L24 | `fixtures/last-question-two-sentences.txt` | Untitled request list | none | 2 | 2 / 0 / 0 | 2 / 0 | 0 |
| L25 | `fixtures/lead-in-between.docx` | Untitled request list | none | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L26 | `fixtures/letterhead-at-page-foot.pdf` | FDA Information Request | title line | 2 | 2 / 0 / 0 | 1 / 1 | 0 |
| L27 | `fixtures/lot-list.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L28 | `fixtures/outer-single-question.txt` | Untitled request list | none | 1 | 1 / 0 / 0 | 1 / 0 | 0 |
| L29 | `fixtures/please-clarify.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L30 | `fixtures/pmda-inquiry.docx` | PMDA inquiry | name | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L31 | `fixtures/predicates.docx` | CDRH Additional Information (510(k)) | opening lines | 2 | 2 / 0 / 0 | 2 / 0 | 0 |
| L32 | `fixtures/regards-wrapped.pdf` | FDA Information Request | title line | 6 | 6 / 0 / 0 | 6 / 0 | 0 |
| L33 | `fixtures/table-at-page-foot.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 1 / 2 | 0 |
| L34 | `fixtures/unmarked-header.pdf` | FDA Information Request | title line | 3 | 3 / 0 / 0 | 2 / 1 | 0 |
| L35 | `fixtures/wrapped-lead-in.docx` | Untitled request list | none | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L36 | `r1-real-forms/probe-tabs.pdf` | Untitled request list | none | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L37 | `r1-real-forms/probe-tabs.stored.txt` | Untitled request list | none | 3 | 3 / 0 / 0 | 3 / 0 | 0 |
| L38 | `r1-real-forms/rf01-fda-ir-cmc.pdf` | FDA Information Request | name | 7 | 7 / 0 / 0 | 6 / 1 | 0 |
| L39 | `r1-real-forms/rf02-fda-ir-cmc-subheadings.docx` | FDA Information Request | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L40 | `r1-real-forms/rf02-fda-ir-cmc-subheadings.pdf` | FDA Information Request | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L41 | `r1-real-forms/rf02-fda-ir-cmc-subheadings.txt` | FDA Information Request | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L42 | `r1-real-forms/rf03-clinical-hold.pdf` | FDA clinical hold | name | 5 | 5 / 0 / 0 | 4 / 1 | 0 |
| L43 | `r1-real-forms/rf04-crl.pdf` | FDA Complete Response Letter | name | 5 | 5 / 0 / 0 | 4 / 1 | 1 |
| L44 | `r1-real-forms/rf05-crl-pq-heading-pair.pdf` | FDA Complete Response Letter | name | 5 | 5 / 0 / 0 | 5 / 0 | 1 |
| L45 | `r1-real-forms/rf06-preind-prelim.pdf` | FDA/CBER meeting preliminary comments and minutes | name | 4 | 0 / 0 / 4 | 0 / 4 | 3 |
| L46 | `r1-real-forms/rf07-advice-letter.pdf` | FDA Advice/Information Request letter | name | 5 | 5 / 0 / 0 | 5 / 0 | 0 |
| L47 | `r1-real-forms/rf08-preind-minutes.pdf` | FDA/CBER meeting preliminary comments and minutes | name | 4 | 0 / 0 / 4 | 0 / 4 | 3 |
| L48 | `r1-real-forms/rf09-cdrh-ai.pdf` | CDRH Additional Information (510(k)) | name | 4 | 4 / 0 / 0 | 3 / 1 | 0 |
| L49 | `r1-real-forms/rf10-cber-minutes-cber-response.pdf` | FDA/CBER meeting preliminary comments and minutes | name | 4 | 0 / 0 / 4 | 0 / 4 | 3 |

## Every (A) "no" or "unsure"

None of the 177 questions was answered "no" on (A). Twelve were answered "unsure", and both g3 readers agreed on all
twelve. They are the sponsor's own meeting questions as the agency's document reprints them:

| n | Letter | Ref | Lines | Reason |
|---:|---|---|---|---|
| 157 | L45 (preliminary comments) | Question 1 | 53-54 | The span is the sponsor's question. The agency's words are its response (lines 55-56). |
| 158 | L45 | Question 2 | 57-58 | The span is the sponsor's question. The agency's words are its response (lines 59-62). |
| 159 | L45 | Question 3 | 70-72 | The span is the sponsor's question. The agency's words are its response (lines 73-75). |
| 160 | L45 | Question 4 | 76-77 | The span is the sponsor's question. The agency's response, "We agree, consistent with ICH S9.", asks nothing. |
| 166 | L47 (minutes) | Question 1 | 28-29 | The span is the sponsor's question. The agency's words are its response (lines 30-31). |
| 167 | L47 | Question 2 | 33-34 | The span is the sponsor's question. The agency's words are its response (lines 41-44). |
| 168 | L47 | Question 3 | 48-50 | The span is the sponsor's question. The agency's words are its response (lines 51-52). |
| 169 | L47 | Question 4 | 54-55 | The span is the sponsor's question. The agency's answer is a bare agreement, and the minutes record no discussion. |
| 174 | L49 (CBER minutes) | Question 1 | 28-29 | The span is the sponsor's question. The agency's words are the CBER Response (lines 30-31). |
| 175 | L49 | Question 2 | 33-34 | The span is the sponsor's question. The agency's words are the CBER Response (lines 41-44). |
| 176 | L49 | Question 3 | 48-50 | The span is the sponsor's question. The agency's words are the CBER Response (lines 51-52). |
| 177 | L49 | Question 4 | 54-55 | The span is the sponsor's question. The CBER Response is a bare agreement. |

The unsure is about the unit. A reader may record a meeting question by its number, but the agency's words, and any
request in them, are in the response that follows the span, not in the span. Where a response asks for something, it
is listed below under missing.

## Every (B) "no"

There are 29. In 17 of them, page furniture or a control character sits inside the question. In the other 12, the span
is wholly the sponsor's text. Line numbers are within the letter.

### Page furniture or a control character inside the question (17)

| n | Letter | Ref | Lines | What is inside |
|---:|---|---|---|---|
| 2 | L01 | 2 | 4-7 | Line 6, "Page 1\fPage 2": two page numbers and a form feed (U+000C). Line 5, "Food and Drug Administration", is the question's own words. |
| 5 | L02 | A2 | 11-22 | Lines 13-21: the FDA letterhead footer (address, www.fda.gov), the "-- 1 of 2 --" page marker, the running header "K201234 - Example Devices, Inc." and "Page 2". |
| 21 | L07 | A1 | 5-15 | Lines 6-14: the FDA letterhead footer, the "-- 1 of 2 --" page marker, the running header "DEN230045 - Example Devices, Inc." and "Page 2". |
| 44 | L13 | 1 | 7-16 | Lines 9-15: the "Assessment report / EMA/CHMP/123456/2026 / Page 1/2" footer, a form feed (U+000C) and the page-2 header. Line 8, "EMA/CHMP/ICH/279/1995", is the guideline the question cites, so it is the question's words. |
| 56 | L16 | 5 | 25-33 | Lines 26-32: "Reference ID: 4987654", the "-- 2 of 3 --" page marker, the running headers "NDA 212345" and "Example Pharma Inc. Examplinib tablets", and "Page 3". |
| 62 | L17 | 2 | 25-33 | Lines 26-32: the same as n56. |
| 66 | L18 | 3 | 15-22 | Lines 16-21: "Reference ID: 5123456", the "-- 1 of 2 --" page marker, the running header "IND 123456" and "Page 2". |
| 71 | L20 | 1 | 2-3 | A form feed (U+000C) at the start of line 3, between "registration" and "batches". |
| 73 | L21 | 1 | 2 | A form feed (U+000C) on line 2 that joins "registration" and "batches". |
| 85 | L26 | 1 | 4-9 | Line 7: the "-- 1 of 2 --" page marker. Line 5, "Food and Drug Administration", is the question's own words. |
| 105 | L33 | 1 | 7-13 | Lines 9-12: "Reference ID: 5123456" and the "-- 1 of 3 --" page marker. "Table 2" (line 8) is the question's words. |
| 106 | L33 | 2 | 14-20 | Lines 16-19: "Reference ID: 5123456" and the "-- 2 of 3 --" page marker. "Table 5" (line 15) is the question's words. |
| 109 | L34 | 2 | 4-9 | Lines 5-8: the "-- 1 of 2 --" page marker (line 6) and an unmarked running header, "CONFIDENTIAL" (line 8). |
| 122 | L38 | 3 | 27-35 | Lines 29-34: "Reference ID: 5498765", the "-- 1 of 3 --" page marker, the running header "IND 145678" and "Page 2". |
| 142 | L42 | 1 | 25-35 | Lines 28-33: "Reference ID: 5512345", the "-- 1 of 2 --" page marker, the running header "IND 152233" and "Page 2". These lines sit between the hold deficiency and the words that cure it. |
| 148 | L43 | 2 | 25-35 | Lines 28-33: "Reference ID: 5623456", the "-- 1 of 3 --" page marker, the running header "NDA 219876" and "Page 2". These lines sit between the deficiency and its "Recommendation:". |
| 171 | L48 | 2 | 22-37 | Lines 26-34: the FDA letterhead footer (address, www.fda.gov), the "-- 1 of 2 --" page marker, the running header "K261234 - Jane Doe" and "Page 2". These lines sit between the lead-in and sub-items a. to c. |

### The span is wholly the sponsor's text (12)

These are the questions n157-160 (L45), n166-169 (L47) and n174-177 (L49) listed above. Each span holds only the
sponsor's meeting question, so it holds none of the agency's words. A span that took in the question and its response
would also hold the sponsor's text and the response label. For n167 and n175 it would also hold page furniture
(lines 35-40). None of these spans has page furniture or a control character inside it.

### One (B) answer the readers differed on: n76 (L22, ref 2), settled "yes"

The question ends "for the" on line 9. Page 2 opens, after its page furniture (lines 10-15), with "Drug Product" on
line 16.

- Reader A said "no". To reach "Drug Product" the span must take in the furniture, and if line 16 is a heading, the
  question has no ending in the stored text.
- Reader B said "yes", reading line 16 as a heading.
- The adjudicator settled "yes". Line 16 is a heading:
  - it stands on its own line, in title case, where the letter's body text writes "drug substance" in lower case;
  - it has no full stop, where items 1 and 3 each end with one;
  - it sits directly above the drug-product item 3;
  - the source fixture is named `heading-opens-page`.

  So span [253, 319) holds every stored word of question 2 and nothing else.

The question is cut off in the letter as it is stored, and a response preparer should flag it.

## Every missing question (C)

There are 11, all in g3. Neither g1 nor g2 found a missing question. Each item below has an exact clean span in
`missing.json`. For the meeting items, the span starts after the "FDA Response to Question N:" or "CBER Response:"
label.

| Letter | Lines | Span | First words | Listed by | Note |
|---|---|---|---|---|---|
| L43 (CRL) | 59-61 | [2765, 3049] | "When you respond to the above deficiencies, include a safety update" | A and B | The SAFETY UPDATE request. It is unnumbered template wording, but a resubmission must answer it. |
| L44 (CRL) | 59-61 | [2765, 3049] | "When you respond to the above deficiencies, include a safety update" | A and B | The same as L43. |
| L45 (prelim) | 55-56 | [2169, 2324] | "We generally agree. However, include a test for residual solvents" | A and B | The agency's request for meeting Question 1. Its start was settled (C:L45:55). |
| L45 | 59-62 | [2495, 2704] | "Yes, your proposal appears reasonable. Provide the following in the IND:" | A and B | The agency's request for meeting Question 2, with sub-items 1. and 2. Its start was settled (C:L45:59). |
| L45 | 73-75 | [3018, 3253] | "No. The rationale for the starting dose based on the HNSTD in dogs is" | A and B | The agency's finding and request for meeting Question 3. Reader A started at line 74. Settled at 73, so the finding stays with its request (C:L45:73). |
| L47 (minutes) | 30-31 | [1392, 1547] | "We generally agree. However, include a test for residual solvents" | A and B | The agency's request for meeting Question 1 (C:L47:30). |
| L47 | 41-44 | [1796, 2005] | "Yes, your proposal appears reasonable. Provide the following in the IND:" | A and B | The agency's request for meeting Question 2. Action item 2 (line 66) restates it (C:L47:41). |
| L47 | 51-52 | [2420, 2538] | "No. The rationale for the starting dose based on the HNSTD in dogs is" | B | The agency's deficiency for meeting Question 3. Reader A chose action item 1 (line 65) instead. Settled at line 51 (C:L47:Q3). |
| L49 (CBER minutes) | 30-31 | [1384, 1539] | "We generally agree. However, include a test for residual solvents" | A and B | The CBER Response to meeting Question 1 (C:L49:30). |
| L49 | 41-44 | [1775, 1984] | "Yes, your proposal appears reasonable. Provide the following in the IND:" | A and B | The CBER Response to meeting Question 2. Action item 2 (line 66) restates it (C:L49:41). |
| L49 | 51-52 | [2386, 2504] | "No. The rationale for the starting dose based on the HNSTD in dogs is" | B | The CBER Response to meeting Question 3. Reader A chose action item 1 (line 65) instead. Settled at line 51 (C:L49:Q3). |

Two items were rejected: L47 line 65 and L49 line 65, both listed by Reader A only. Action item 1 there is the
sponsor's commitment, and it restates the line-51 obligation. Both readers likewise treated action item 2 (line 66) as
a restatement of the line-41 request.

Nine of the 11 are the agency's responses to the meeting questions in L45, L47 and L49. Each is the agency's half of an
item that the list records only by the sponsor's question (see the 12 unsure above).

## Disagreements

There were 10, all settled by the adjudicator. Each one's reason is in `disagreements.json`.

| Id | Group | Kind | Settled |
|---|---|---|---|
| Q76 | g2 | (B) | yes. Line 16 is a heading (see above). |
| C:L45:55, C:L45:59, C:L47:30, C:L47:41, C:L49:30, C:L49:41 | g3 | (C) start, same line | Reader A started at the request, and Reader B at the response label. Settled after the label, keeping the agency's opening words that the request depends on. |
| C:L45:73 | g3 | (C) start | Line 73. Reader A said 74. |
| C:L47:Q3, C:L49:Q3 | g3 | (C) location | Line 51, the agency's deficiency. Reader A chose action item 1 (line 65), which restates it. |

g1's readers agreed on every answer, and neither listed a missing question.

## Files

| File | What it holds |
|---|---|
| `readings.json` | All 177 questions, merged. Each has `id` (questions.json n), `letter`, `ref`, `lines`, `span`, `group`, the settled `A` and `B`, `B_inside`, each reader's own (A) and (B), `settled_by` (`agreed` or `adjudicated`) and the adjudicator's `reason`. It also holds the totals, and each group's adjudication method and spot-check list. |
| `missing.json` | The 11 missing questions. Each has its line, span, first words, the sliced text, who listed it and why. Also the two rejected candidates, and g1's and g2's notes on what is not a question. |
| `disagreements.json` | The 10 reader disagreements. Each has both readers' answers, the settlement and the reason. |
| `raw/g1-A.json` … `raw/g3-B.json` | The six reader files, unchanged. |
