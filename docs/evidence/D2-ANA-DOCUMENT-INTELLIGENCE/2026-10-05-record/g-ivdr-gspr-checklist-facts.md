# g-ivdr-gspr-checklist — facts relied on (F73 part A)

Checked 2026-10-05. EUR-Lex (the regulator host) is egress-blocked here for
fetching; WebSearch returned EUR-Lex result links but no section text. **Every
fact below is therefore `recall`**, corroborated by secondary sources, and the
templates carry `basis.confidence: 'recall'` so `regulatoryBasis` reads
"… (recall — not checked against the regulator's text)". Nothing is promoted
to `regulator-text`.

| # | Fact | Basis | Corroboration (not regulator text) | Re-read owed |
|---|---|---|---|---|
| 1 | IVDR (Regulation (EU) 2017/746) Annex I Chapter I "General requirements" = Sections 1–8 | recall | TÜV SÜD IVDR Annex I page (https://de-mdr-ivdr.tuvsud.com/Annex-I-General-safety-and-performance-requirements-IVDR.html); Beckman IVDR Annex I page (https://www.beckman.com/resources/industry-standards/ivdr/annex-i-global-safety-and-performances-requirements) — via WebSearch extract | EUR-Lex CELEX:02017R0746-20250110 Annex I |
| 2 | IVDR Annex I Chapter II "Requirements regarding performance, design and manufacture" = Sections 9–19 (9 performance characteristics … 19 self-testing / near-patient testing) | recall | TÜV SÜD Chapter II (IVDR) page (https://de-mdr-ivdr.tuvsud.com/Chapter-II-Requirements-regarding-performance-design-and-manufacture.html) — via WebSearch extract | same |
| 3 | IVDR Annex I Chapter III = Section 20 "Label and instructions for use": 20.1 general, 20.2 label, 20.3 sterile packaging, 20.4 IFU | recall | Platform record `label.eu.ivdr-annex-i-ch3` (server/services/ivd-knowledge/regulatory/labeling-rules.ts) cites §20 / §20.2 / §20.4; WebSearch extract of the EUR-Lex result for the Section 20 general requirements (medium, format, legibility); PMC10713655 (IVDR Annex I in pathology) | same |
| 4 | MDR (Regulation (EU) 2017/745) Annex I = Chapter I Sections 1–9, Chapter II Sections 10–22, Chapter III Section 23 (label and IFU) | recall | legislation.gov.uk (UK retained copy, not EU text) lists Annex I Chapter III division 23; Team-NB and third-party pages refer to "Section 23 of Annex I" for labels/IFU — via WebSearch | EUR-Lex CELEX:02017R0745 Annex I |
| 5 | The 20.3 heading wording ("packaging which maintains the sterile condition") and the Chapter II/III heading wordings | recall only | — | same |

## What the code now says, and what it does not

- `gspr_checklist` is MDR-only (`families: ['eu_mdr']`), basis "Regulation (EU) 2017/745 (MDR) Annex I", Ch III "Section 23".
- `ivdr_gspr_checklist` is new (`families: ['eu_ivdr']`), basis "Regulation (EU) 2017/746 (IVDR) Annex I", Ch I §1–8, Ch II §9–19, Ch III §20 (20.2 label, 20.4 IFU).
- A test pins the IVDR checklist's Chapter III section number to the section cited by `label.eu.ivdr-annex-i-ch3`, so the two cannot drift.
- `market-registry.ts` keeps one dossier element `gspr_checklist` for the shared EU market: `requiredDossierElements` is ANDed across MDR and IVDR devices, so listing both template ids would mark an MDR device incomplete for want of an IVDR checklist. A comment there says the element is either regulation's Annex I checklist.

## Not done here (part B)

The IVDR Annex II outline (`eu-ivdr-2017-746-annex-ii-v1.0`, II.6.4 / II.6.5) is
unchanged. Per DECISIONS.md decision 7 it waits for a person to read IVDR Annex II
§6 on EUR-Lex and record the URL and text; seeded outline rows cannot be
corrected in place later (Rule 1).
