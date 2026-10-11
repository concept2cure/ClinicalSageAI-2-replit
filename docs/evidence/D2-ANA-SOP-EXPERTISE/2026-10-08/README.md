# D2 — AnA's SOP expertise: the regulation in force, by clause, for the product the SOP governs (2026-10-08)

Lane `…session_01SuVLo2`. Founder-directed, 2026-10-08: *"enhance her acumen, intelligence, and abilities across the board … protocols, SOPs, IND documentation, BLA"*. The wider document-intelligence lane (`…017d4r3C`) owns the CTD and lifecycle record. SOPs were outside what it had reached, so this slice builds on its QMSR crosswalk additively.

## Before (measured at `7de37444`)

**`generate_sop`** (`server/services/sop-generator.ts`):
- **No product type.** A device manufacturer's CAPA SOP cited 21 CFR 210/211 (drug CGMP). It never cited ISO 13485:2016 or the QMSR, which has been in force since 2026-02-02.
- **No clause-level requirements.** No SOP said which clauses its procedure answers.
- **Missing topics.** Complaint handling and management review did not exist.

**Nothing reviewed an SOP.** AnA could write one but not read a client's back against what its topic requires.

**The SOP question flow** (`intelligence-questions/flows/sop-development*.ts`) told clients:

| Cited | Problem | Now |
|---|---|---|
| 21 CFR 820.25 (device training) | Removed by the QMSR | ISO 13485:2016 §6.2 under the QMSR, formerly 820.25 |
| 21 CFR 820.40 (device change control) | Removed | ISO 13485:2016 §4.1.4 / §7.3.9, formerly 820.40 / 820.30(i) |
| 21 CFR 820.90 (device CAPA) | Removed, and it was nonconforming product, never CAPA | ISO 13485:2016 §8.5.2 / §8.5.3, formerly 820.100 |
| 21 CFR 820.30 / "Design History File" | Removed; the QMSR does not use the term | ISO 13485:2016 §7.3 / §7.3.10, formerly 820.30 |
| ICH Q10 §3.2.4 (change management) | Change management is §3.2.3 | §3.2.3 |
| ICH Q10 §3.2.5 (periodic review) | No such section | ISO 13485:2016 §4.2.4(b) for devices; a fixed review cycle for drugs is industry practice, and is said to be |
| EU GMP Annex 15 (training competence) | Annex 15 is qualification and validation | EU GMP Chapter 2 (Personnel) |
| 21 CFR 211.186 (document control) | Master production records | 211.100(a) and 211.180 |

## After

### `shared/regulatory/sop-requirements.ts` (new)

The one record of what an SOP must address. It covers:
- **Topics:** CAPA, deviation, complaint handling, document control, training, supplier qualification, internal audit, management review and change control.
- **Product types:** drug, biologic and device.

**Every requirement carries a `RegulatoryBasis`:**
- **Devices.** The governing citation comes from `qmsr-crosswalk.ts` (`citeQms`), so it follows the effective date. Before 2026-02-02 a device SOP is cited to the QSR section then in force.
- **ISO subclauses** are `recall`. They come from the standard, not a regulator page.
- **CFR and ICH citations** are `recall` too: eCFR and ich.org were not reachable from this environment (egress policy), so no wording was checked against the regulator's text. The reader is told so (`basisLabel`).
- **Practices no regulation states** (deviation classes, a fixed document review cycle) are `platform-convention`, never a citation.

**The record also holds dated facts:**
- the BPDR 45-calendar-day window (21 CFR 600.14);
- the field alert's 3 working days (21 CFR 314.81(b)(1));
- MDR 30 calendar days or 5 work days;
- under the QMSR, FDA may review management review and internal audit reports, which the QSR exempted (formerly 820.180(c)).

### What reads it

| Consumer | What it does now |
|---|---|
| `generate_sop` | Takes `productType`. A device SOP's references are the QMSR and ISO 13485:2016, with the regional device framework (EU MDR Art. 10(9) and EN ISO 13485; MHLW Ordinance No. 169) in place of drug CGMP. It adds a "Requirements this procedure addresses" section, each requirement with its basis. An unstated product type is named as assumed. Complaint handling and management review are new topics. |
| `review_sop_requirements` (new AnA tool) | Logic in `shared/regulatory/sop-review.ts`. Reads a client's SOP sentence by sentence. Each requirement comes back as `addressed` (quoting the sentence) or `not_found`. It is not a compliance verdict, and says so. Register class read; launch scope in; pedigree deterministic registry; the persona's tool guide names it. |
| The SOP question flow | Its citations are corrected (table above). A test holds what it serves to the record's rules: no removed QSR section unless named as "formerly", only ICH Q10 sections that exist, no Annex 15 for training. |

One weakness was found and fixed while building the review. A purpose line that only names "corrective and preventive action" was credited as addressing preventive action. Preventive action now counts only where the wording says how potential nonconformities are found or acted on.

## The fact-check

An independent reviewer checked every citation against its knowledge of the regulations and standards; it had no web access. It confirmed most of them (the ICH Q10 section map, 21 CFR 211, 314, 600, 601, 803, 807 and 814, the QMSR, and the ISO 13485 clauses). It found 14 problems, all fixed before commit:

- **Wrong clause.** The drug management-review inputs are ICH Q10 §3.2.4, not §4.1. Deciding to report a complaint is ISO 13485 §8.2.2(d) (and §8.2.3 is the notifying). Disposition records are §8.3.1. The flow's device SOP-change clause is §4.2.4, not §4.1.4 alone.
- **Overstated.** The quality unit reviews complaints involving a possible failure to meet specifications, not every complaint. 211.198(a) refers to 21 CFR 310.305, while 314.80 is separate. 211.84(d)(2) says "report of analysis". The annual product review covers complaints, recalls and 211.192 investigations, not "CAPA trending". The EU GMP Chapter 9 wording is now the chapter's own. ICH Q10 "expects" document control rather than requiring it.
- **Missing.** Two device management-review inputs (§5.6.2(j) and (k)), and 21 CFR 600–680 among a biologic SOP's references.
- **Contradictory.** The flow told clients most quality systems require review every 2–3 years, beside a reference that says no regulation sets an interval.
- **Truncated.** The 2006 FDA guidance title.

## Red, then green

| Suite | Red on trunk | Green |
|---|---|---|
| `tests/services/sop-expertise.test.ts` | `red/sop-expertise.txt`: **13 of 14**. The device CAPA SOP had no 820.10 or ISO 13485, the drug one no 211.192, the biologic one no 600.14; no requirements section, no topics, no review; the flow's removed sections, Q10 §3.2.5 and Annex 15 were served. The one pass was vacuous (no topics in the placeholder record). | 15/15 |
| `review-sop-requirements-tool.test.ts` (with trunk's AnA tool files) | `red/review-tool.txt`: **4 of 4** (no such tool) | 4/4 |
| `tests/services/sop-generator.test.ts` (existing) | — | 4/4, unchanged |

`green/sop-expertise.txt` covers the three suites: 23/23. The 84 suites that load AnA's tool definitions, the persona's base prompt, the SOP generator or the question flows pass 2,112 of 2,112. Typecheck shows 0 errors, and the lint ratchet shows no file gaining a warning.

## Not done, recorded

- **The citations were not read against the regulator's text.** They are labelled recall wherever shown. Reading 21 CFR 211 and 820 on eCFR, and ICH Q10, would raise them to `regulator-text`.
- **Coverage.** GCP SOPs (monitoring, TMF, SAE reporting under ICH E6(R3)) and EU/Japan drug-GMP clause detail are not modelled.
- **`qms/sopTemplates.ts`** (the QMS catalog's generic skeleton) is still not read by AnA.
- **The QMS document surface sends AnA no document context.** That is the next slice.
