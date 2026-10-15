# D2 — AnA drafts a PBRER in chat to the ICH E2C(R2) structure (2026-10-15)

Lane `…session_01SuVLo2`.

**Before.** Measured at `c30e1d490`: "draft a PBRER" selected `psur_pbrer` in `server/services/ana-ri/document-templates.ts`. It told the model it must use sixteen headings that:
- dropped E2C(R2) §13 Lack of efficacy in controlled clinical trials, §14 Late-breaking information and §15 Overview of signals;
- renumbered everything after §12, so its 13 was "Characterization of Risks";
- titled §4 "Reference Product Information" and §12 "Other PBRER Information".

The library outline (market-specs `pbrer`, E2C(R2) §1–§19) is what the open-document brief and `get_document_template` give. A comparison of every chat template against its library outline found this to be the one other structural divergence. The CMC, clinical overview and DSUR templates already match.

`red/chat-pbrer-e2c.txt`: 2 of 2 red.

**After.** The chat template's sections are the nineteen E2C(R2) headings from the library, in order, and its references lead with the library basis. Drafting guidance and word ranges are kept, keyed by E2C(R2) number. Risk characterisation moves to §16 Signal and risk evaluation.

`green/chat-pbrer-e2c.txt`: 2/2. The 48 suites that load the chat templates or PBRER/PSUR code pass, 991 of 991. Typecheck shows 0 errors, and the lint ratchet against origin is clean.

**Recorded, not changed.** The library's E2C(R2) outline is itself an interim hand copy; its own comment says so. Its clinical overview lacks M4E 2.5.7 Literature References, which the chat template has. That file was changed by another author within 24 hours of this commit.
