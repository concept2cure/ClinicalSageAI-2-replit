# g-study-data-trc-requirements — regulatory facts relied on (2026-10-05)

FDA hosts (fda.gov) are refused by this environment's egress policy, so no
document was opened. "Regulator text (search)" below means the passage was read
in web-search results quoting an FDA-hosted document on 2026-10-05, not in the
document itself. Everything else is labelled recall.

| # | Fact | Basis | Source / checked | Where used |
|---|---|---|---|---|
| F1 | eCTD validation 1734: a dataset named ts.xpt with information on the study start date must be present for each study in the required sections. High severity. | Regulator text (search) | https://www.fda.gov/media/135247/download, https://www.fda.gov/media/124698/download (2026-10-05) | `TRC_1734_NO_TS`, `TRC_1734_SSTDTC` |
| F2 | eCTD validation 1736: SDTM needs a DM dataset and define.xml (Module 5); SEND needs DM and define.xml (Module 4); ADaM needs an ADSL dataset and define.xml. | Regulator text (search) | https://www.fda.gov/media/124698/download, https://www.fda.gov/media/135246/download (2026-10-05) | `TRC_1736_NO_DM`, `TRC_1736_NO_ADSL`, `TRC_1736_DEFINE_SDTM`, `TRC_1736_DEFINE_ADAM` |
| F3 | The study start date is TSPARMCD SSTDTC for a clinical study and STSTDTC for a nonclinical one, in ISO 8601 yyyy-mm-dd at minimum; the TS check also covers STUDYID matching the STF and the date being provided (or TSVALNF = NA) in a valid format. | Regulator text (search) | https://www.fda.gov/media/135247/download, https://www.fda.gov/media/169452/download (2026-10-05) | `TRC_1734_SSTDTC` checks SSTDTC presence only; format and STF match are stated as not checked |
| F4 | FDA accepts a "simplified ts.xpt" (STUDYID, TSPARMCD, TSVAL, TSVALNF) to obtain the study start date for studies that started before the study-data requirements applied. | Regulator text (search) | https://www.fda.gov/media/169452/download, https://www.fda.gov/media/135247/download (2026-10-05) | TS spec enforces only STUDYID and TSPARMCD |
| F5 | eCTD validation 1789 is the STF check (a file in a study section without a Study Tagging File), high severity from 2021-09-15, and is a separate rule from 1734. | Regulator text (search) | https://www.fda.gov/media/87056/download, https://www.fda.gov/media/160957/download (2026-10-05) | Start date is keyed to 1734, not 1789 (see Discrepancy). Re-checked 2026-10-05 by the resuming implementer: search results quoting https://www.fda.gov/media/160970/download and https://www.fda.gov/media/135247/download state that 1789 fires when "a file has been submitted in a study section without providing an STF file" and has different expectations from 1734, 1735 and 1736. |
| F6 | SDTM-IG v3.4 TS Core designations: STUDYID, DOMAIN, TSSEQ, TSPARMCD, TSPARM Req; TSVAL, TSVALCD, TSVCDREF, TSVCDVER Exp; TSGRPID, TSVALNF Perm. | Recall | Not checked against CDISC text | TS spec cores; DOMAIN, TSSEQ, TSPARM carry `presenceEnforced: false` |
| F7 | The SDTM-IG v3.4 domain list in `SDTM_KNOWN_DOMAINS` (special-purpose, interventions, events, findings, trial design, RELREC, SUPPQUAL). | Recall | Not checked against CDISC text | Known-but-unspecified domains report NOT_CONFORMANCE_CHECKED; a code not in the list stays UNKNOWN_DOMAIN, so an omission fails closed |
| F8 | FDA's Study Data Technical Conformance Guide expects analysis datasets to be submitted with the tabulation datasets they trace to. | Recall | `recall(...)` basis in code | `ADAM_WITHOUT_SDTM` note (advisory; does not decide readiness) |

## Discrepancy with the plan

The plan and the verifier keyed a missing study start date to "1789(C)/1734",
citing FDA presentation snippets. The 2026-10-05 search results describe 1789 as
the Study Tagging File check and attribute the ts.xpt start date to 1734 (F1,
F5). The code therefore keys the start date to criterion `1734`
(`TRC_1734_SSTDTC`), and `TrcCriterion` is `'1734' | '1736'` only. If the
1789 FDA text is read and does cover the TS start date, adding `'1789'` is a
one-line change.

## Requirement basis

Every requirement carries `FDA_STUDY_DATA_TRC` from
`server/services/ind/ctd/regulatory-basis.ts` (regulator-text, checked
2026-10-04 by g-basis-constants-one-home); no local copy was declared.
