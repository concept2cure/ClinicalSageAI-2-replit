# D2 — AnA drafts a clinical protocol in chat to the ICH M11 structure (2026-10-15)

Lane `…session_01SuVLo2`.

**Before.** Measured at the second IB slice: asking AnA to "draft a phase 1 protocol" selected `ind_phase1_protocol` (`server/services/ana-ri/document-templates.ts`). That template told the model it must use ten headings of its own. Its numbering diverged from ICH M11 at section 5, so its 7 was Assessments and its 10 References, where M11's 8 is Trial Assessments, 10 is Statistical Considerations and 14 is References. It had no M11 front matter and no sections for discontinuation, adverse events, oversight or glossary. The open-document brief, `get_document_template` and the Projects blueprint give the M11 outline, `shared/regulatory/protocol-m11.ts`. `red/chat-protocol-m11.txt`: 3 of 3 red.

**After.** The chat template's sections are the M11 front matter and level-1 headings, in order, from the record. Its references lead with the M11 basis. The phase 1 drafting guidance and word ranges are kept, keyed by M11 heading:
- dose escalation, sentinel dosing and the DLT window go under 4 Trial Design;
- DLT definitions and IND safety reporting go under 9 Adverse Events;
- the study size and the MTD method go under 10 Statistical Considerations;
- stopping rules go under 7 Discontinuation.

`green/chat-protocol-m11.txt`: 3/3. The 24 suites that load the chat templates or `orchestrate()` pass, 903 of 903. Typecheck shows 0 errors, and the lint ratchet against origin is clean.

**Not done.** Chat drafting uses the M11 level-1 headings only. The level-2 headings (1.1 Protocol Synopsis and so on) reach AnA through the open-document brief and `get_document_template`.

## Follow-up the same day: the medical-writing advisor, and a long M11 heading

**The advisor's protocol structure.** The medical-writing advisor (`medical-writing.ts`) listed a protocol as thirteen headings of its own. It now lists the ICH M11 level-1 headings from the record, and it names ICH M11 and E6(R3) Appendix B among the governing standards. `red/medical-writing-protocol.txt`: 1 of 1 red.

**A defect found by doing that.** `reviewMedicalWriting` detected headings through `extractHeadingOutline` (`document-search-core.ts`), which skipped every line over 120 characters. M11 §9, "Adverse events, serious adverse events, product complaints, pregnancy and postpartum information, and special safety situations", is about 130 characters, so a complete M11 draft would always be reported as missing §9. Numbered and all-caps lines keep the 120-character cap, because a line that long is usually a sentence. Explicit markdown headings may now run to 200 characters. `red/m11-long-heading.txt`: 1 of 1 red, with only the extractor fix held back.

`green/chat-protocol-m11.txt`: 5/5. The 36 suites that load the extractor, passage search or medical writing pass, 511 of 511.
