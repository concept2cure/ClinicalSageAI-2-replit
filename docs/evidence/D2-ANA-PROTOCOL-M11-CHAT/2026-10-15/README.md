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
