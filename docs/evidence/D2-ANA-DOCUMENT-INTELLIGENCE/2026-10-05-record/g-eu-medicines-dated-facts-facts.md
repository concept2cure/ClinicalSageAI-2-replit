# g-eu-medicines-dated-facts: the regulatory facts this step relies on

Checked 2026-10-05 with WebSearch. WebFetch to regulator hosts is blocked in
this environment, so no page was opened in full. "Regulator text" below means
the wording appeared in a search result served from the regulator's (or EU
institution's) own host, at the URL given. "Secondary" means a law firm, trade
press or vendor page. "Recall" means neither.

## ICH E6(R3) in the EU (facts `eu-e6r3-effective`, `eu-e6r3-annex2-effective`)

| Fact | Basis | Source |
|---|---|---|
| ICH E6(R3) Principles and Annex 1 became effective (in the EU) on 23 July 2025. | regulator text | https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline |
| Annex 2 reached Step 4 on ICH adoption, 3 June 2026, was adopted by the CHMP on 25 June 2026, and comes into effect on 15 January 2027. | regulator text | the same EMA page, and https://www.ema.europa.eu/en/documents/scientific-guideline/ich-e6r3-guideline-good-clinical-practice-annex-2-step-5_en.pdf |
| Annex 2's EMA reference is EMA/CHMP/ICH/495903/2024, legal effective date 15/01/2027. | regulator text | the same EMA page |
| ICH Step 4 dates 2025-01-06 (Principles + Annex 1) and 2026-06-03 (Annex 2). | unchanged existing facts (`ich-e6r3-gcp-step4`, `ich-e6r3-annex2-step4`); Annex 2's agrees with the EMA text above | — |

The ICH facts stay ICH Step 4 facts. Only their notes change: they now say
Step 4 is ICH adoption, that regional effect differs, and they name the EU fact.
`supersedes: 'E6(R2)'` stays on the ICH fact only.

## EMA eCTD v4.0 (fact `ema-ectd-v4-cp-optional`)

| Fact | Basis | Source |
|---|---|---|
| Optional use of eCTD v4.0 for new centrally authorised product (CAP) MAAs went live on 22 December 2025; eCTD v3.2.2 continues to be accepted. | regulator text | https://ec.europa.eu/newsroom/ema/items/918307/en (EMA newsroom) |
| Applicants must contact ectd4consultation@ema.europa.eu before any eCTD v4.0 submission. | regulator text | the same newsroom item |
| v4.0 use is strongly recommended from Q1 2027, and mandatory for new CAP MAAs from Q1 2028. | **recall / secondary — NOT regulator text.** Re-checked 2026-10-11: the fact's own `sourceUrl` (EMA newsroom 918307) says only that mandatory use for CAPs is *planned from 2027*; it does not carry the Q1 2027 / Q1 2028 split. That split was seen only in vendor write-ups, and the search summary never said which EMA-hosted page carried it. Downgraded from "regulator text, as a plan" on 2026-10-11 because an unidentified page cannot support a regulator-text basis (`basisProblems` requires a named regulator-host URL plus a check date). | Candidates, neither confirmed to carry the wording: https://www.ema.europa.eu/en/documents/other/ectd-v40-eursnext-roadmap_en.pdf and https://esubmission.ema.europa.eu/eCTD%20NMV/eCTD.html. **Owed:** read the roadmap PDF once `ema.europa.eu` is reachable, and either cite it or drop the quarters. |

The encoded fact does not overstate this: its note calls the quarters "planned
quarters, not adopted dates" and ends "Do not tell an EU sponsor v4.0 is
required today." The `effectiveDate` carries only the 2025-12-22 optional-use
date, which **is** regulator text; no second dated fact was minted for a
planned quarter.

The mandatory date is a planned quarter, not a day. It is in the fact's note,
worded "planned", and is not minted as a second dated fact.

## EU M1 v3.1.1 and validation criteria v8.2 (fact `eu-ectd-m1-v311-vc-v82`)

| Fact | Basis | Source |
|---|---|---|
| The new eCTD validation criteria (v8.2) and the EU M1 specification v3.1.1 are mandatory for eCTD submissions after 1 December 2025. | regulator text (a national competent authority, BfArM) | https://www.bfarm.de/EN/Medicinal-products/Licensing/Issues-relevant-for-licensing/eSubmission/eSubmission_eCTD_EU_Module_1_validation_criteria.html |
| Both were accepted from 1 October 2025, alongside v3.1 / v8.1, until 30 November 2025. | **secondary** (vendor pages: extedo, asphalion, starodub). Used only in the note, and it agrees with the BfArM mandatory date. | — |
| The specification and criteria are published on EMA's eSubmission site. | regulator-hosted (esubmission.ema.europa.eu/eumodule1/index.htm appeared in the results; its content was not shown) | — |

The fact's `supersedes` is 'EU M1 v3.1 / validation criteria v8.1'. "EU M1
v3.1.1" is an alias, so a citation of v3.1.1 is never read as v3.1.

## The pharma package (fact `eu-pharma-package`)

| Fact | Basis | Source |
|---|---|---|
| The Council and the Parliament reached a provisional agreement on 11 December 2025. The agreement then needed endorsement and formal adoption before it enters into force on publication in the Official Journal. | regulator text (EU institution) | https://www.consilium.europa.eu/en/press/press-releases/2025/12/11/pharma-package-council-and-parliament-reach-a-deal-on-new-rules-for-a-fairer-and-more-competitive-eu-pharmaceutical-sector/ |
| Under the agreement: 8 years of data protection plus 1 year of market protection, extendable; a transferable exclusivity voucher for priority antimicrobials. | regulator text (the same press release) | — |
| On 28 September 2026 the Council adopted its **position at first reading** on both acts (Coreper I approved them on 23 September; adopted as A items at the Agriculture and Fisheries Council). This is an early second-reading agreement: the European Parliament must still approve the Council's position at second reading. Neither act is adopted yet. | regulator text for the procedure: Council documents ST-7105/26 (17 September 2026) and the Art. 294(6) TFEU statements of reasons ST-7105-2026-REV-2-ADD-1 and ST-7106-2026-REV-2-ADD-1, seen as search results only. The 23 and 28 September dates are **secondary** (Agence Europe, Cuatrecasas, CMS, Setterwalls). Checked 2026-10-05 (fix round 1). | https://data.consilium.europa.eu/doc/document/ST-7105-2026-REV-2-ADD-1/en/pdf, https://data.consilium.europa.eu/doc/document/ST-7106-2026-REV-2-ADD-1/en/pdf, https://data.consilium.europa.eu/doc/document/ST-7105-2026-INIT/en/pdf |
| The date of the Parliament's second-reading plenary vote. | **secondary, and the sources disagree**: Cuatrecasas gives 19 October 2026; the reviewer's sources (eulawlive, Matheson) indicate November 2026. Not written into the fact, which says only that approval is pending. | — |
| Coreper endorsed the compromise text on 6 March 2026. | secondary (law firms, ECA Academy) | — |
| Both acts enter into force 20 days after Official Journal publication; the Regulation applies, and the Directive must be transposed, 24 months after that. | **secondary** (CMS, Crowell, HSF Kramer). It is **not** written into the fact. | — |
| Official Journal publication. | **not confirmed** as of 2026-10-05. The sources conflict: one ECA headline says "final texts officially published", but that refers to the Council's March compromise texts. | — |
| Current law is Directive 2001/83/EC and Regulation (EC) No 726/2004. | recall (the instruments are named in the Council text as what is being replaced) | — |

What the fact encodes (founder decision 25, DECISIONS.md: a proposal is
stored with status `proposed`, never as in force):

- `status: 'proposed'`, a new `CurrencyStatus` value: not adopted law. The
  package is a proposal until the Parliament approves the Council's position
  and the acts are signed and published.
- `effectiveDate: EFFECTIVE_DATE_NOT_FIXED` (`'not_fixed'`), because no
  official text fixes a date yet.
- `statusAsOf` never promotes it (it promotes only `mandatory_upcoming`), and
  `hasFixedEffectiveDate` is false.
- `severityForStatus('proposed')` is `info`: a proposal imposes no obligation
  and has no date, so it is something to watch, not a change a document must
  reflect.
- `changeRadar` always lists it, whatever the draft date, and sorts it after
  the dated facts of its severity.
- `checkGuidanceFreshness` reports a citation of it `current: false`, with the
  warning "Proposed, not law (EU): current law governs until it is adopted
  and applies", never the "Adopted but not yet in effect" wording.
- The note states: political agreement 2025-12-11; Council first-reading
  position 2026-09-28 under an early second-reading agreement; the
  Parliament's second-reading approval pending; no act adopted or published
  in the Official Journal; Directive 2001/83/EC and Regulation (EC) No
  726/2004 govern.

Re-check when the Parliament votes and when the acts appear in the Official
Journal; only then does the fact become `mandatory_upcoming` with a date.

## EMA IRIS filings (registry `submissionFormat: 'IRIS'`)

| Fact | Basis | Source |
|---|---|---|
| Sponsors use EMA's IRIS platform to submit orphan designation applications and pre- and post-designation activities. EMA will not process submissions outside IRIS. | regulator text | https://www.ema.europa.eu/en/human-regulatory-overview/research-development/orphan-designation-research-development/applying-orphan-designation |
| IRIS is mandatory for initial PIPs, for responses to PDCO requests and for modifications; all types of paediatric applications go through IRIS. | regulator text | https://www.ema.europa.eu/en/documents/regulatory-procedural-guideline/procedural-advice-paediatric-applications_en.pdf |
| Scientific advice and PRIME go through IRIS. | already on record: g-submission-channel-function-facts.md rows 4-5 | — |
| No sponsor-facing machine (API) channel exists for IRIS. | **not established.** The channel therefore stays `unconnected` (tier `no_gateway`). It is **not** `portal_only`, and IRIS is not in PORTAL_ONLY_FORMATS. | — |

## Decisions taken in this step, with reasons

- **IRIS stays `unconnected`, not `portal_only`.** The plan said to add IRIS
  to PORTAL_ONLY_FORMATS. The landed step g-submission-channel-function chose
  `unconnected` on purpose: "this module does not assert that no machine
  channel exists". Nothing read here settles the question. What changed is
  that the registry entry now declares 'IRIS', and the channel function reads
  that declaration instead of a parallel list of ids. Either way, no IRIS
  filing is reported submittable.
- **A not-yet-in-effect citation is still `current: true`.** It names the
  latest text, and its warning says "Adopted but not yet in effect (EU):
  applies from 2027-01-15". A document dated before a future date is not
  called stale.
