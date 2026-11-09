# This session's work, aligned to the one design plan — 2026-11-01

**Session:** "Biotech FDA filing types build-out" (`session_011Fyq3hXwhNNFu8ihPmBuWc`).
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` and its ledger `docs/design/one-design-plan.json` (CLAUDE.md RULE 5 and
RULE 6). The relevant decisions are P-55 and P-78 to P-84 (`docs/LAUNCH_DEFINITION_OF_DONE.md`), and the program study
`docs/design/THE_PROGRAM_2026-11-01.md`.
**Asked by the founder:** "Align your assigned work to this new plan."

This session was assigned three programs:
1. **Filing types and their templates.** "The full correct template, ability to organize, build, customize and
   complete all IND, BLA, CSR, CTD …"
2. **One implementation of CTD authoring.** "One is all we must ever have … delete old trash too."
   `../2026-10-18/cleanup/inventory-plan.md`.
3. **The Rule 2 audit.** No AnA tool or route composes from figures the model supplies.
   `docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md`.

The status of every slice below was re-checked against HEAD (`d914c2618`) on 2026-11-01. Three read-only surveyors
did it, each re-checked by an adversarial critic. Their raw output is `rebaseline-2026-11-01.json`.

## What the plan changes for this work

- **Every commit names an open package and stays inside its files.** It carries `Plan: <ID>` and
  `Completes: <existing path>`. `ci:one-design-plan` checks both in pre-push, with no bypass. One package per commit:
  a slice that spans packages is split, or goes under F1.
- **Nothing new (RULE 6).** None of the remaining work needs a new route file, service, table, screen, mount or AnA
  tool.
- **Deleting an unreached capability is the founder's (R1).** A capability with no UI caller is reached, or retired by
  a founder decision.
  - A convergence still deletes its duplicate in the same change. That is finishing, not retiring.
  - A served route that fabricates is repaired under F1 by making it refuse. Deleting it is R1's, coordinated with
    the R1 session (`01QoxbLdKp…`, `docs/evidence/DESIGN/R1/`), which already lists those handlers.
- **The project is the program (P-82, P-83).** "Writing workstreams are sections of the filing project. Work projects
  are projects of their own." See the conflict under 3b below.

## Founder decisions: P-55 decided the memo

P-55 decided all 22 rows of `../2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md` as each row recommends. That
includes:
- R-1: 2.4/2.6 read `nonclinical_studies`, counting `in_reporting` for an IND;
- F-B: a conditional heading may be recorded not applicable, with a reason and a signature;
- F-A: 2.6's tabulated summaries are a preparation worksheet;
- R-2: calculators over stated inputs stay, labelled;
- F-D: no standalone QOS, drug substance or drug product project;
- R-7: the PMA "Generate Document" is withheld until a PMA record path exists;
- FD-6, FD-10, FD-11 and FD-12.

**One question this session cannot settle.** P-55 approved 3b's author-only component class projects (a 2.5 or 2.4
project of its own). P-83, decided later on 2026-11-01, says the writing workstreams, the Module 2 summaries among
them, "stay sections of the filing project". Building 3b slices 5–7 would follow P-55 and contradict P-83. They wait
for the founder to say which holds. Slices 3 and 4 are valid under both.

## The mapping

### 1. Filing types and their templates

| Work | Status on HEAD | Package |
|---|---|---|
| Increments 1, 2a–2d, 3a | done before 10-26 | — |
| 3b Slices 1 and 2 (the 2.5/2.7 composers read the open project's CSRs; 2.4/2.6 refuse model-written studies) | done | — |
| 3b Slice 3: a class project never becomes an application | done: the readiness digest (`9c05a6ac8`), both creators (RIM, `63e51b02e`) and the eCTD doors (RIM, `61ab17676`) | F1 |
| 3b Slice 4: the "not offered" reason names where the QOS, 3.2.S and 3.2.P are written (`reasonByFiling`) | done: the server half (`b0bba18e6`) and the picker's lookup (`bfa9c6869`) | F1 (S5's globs are root-anchored and do not match `server/services/regulatory/`) |
| 3b Slices 5–7: the author-only 2.5/2.4/2.7/2.6 class packs | open; **wait on the founder (P-55 vs P-83)** | — |
| 3b Slice 8 | follows 5 | — |
| Module 1 for each region (US, EU, Japan, Canada, Australia) | open; regional depth is uneven (plan §1a step 7) | S5 |
| Organise, build, customise and complete a filing | open | S11 (the pyramid becomes the project's work breakdown, with owners, due dates and a content plan per leaf, P-82) and D4 (outline organise/customise in the one editor) |
| F-B "not applicable" for a conditional heading | decided (P-55); not built | D4 / S11 |

### 2. One implementation of CTD authoring (66 slices)

| Kind | Slices | Status | Package |
|---|---|---|---|
| Done | S01–S07 and C4a–c (this session) | 7 done | — |
| Convergences onto the one ICH M2–M5 record (headings, titles, outlines, blueprints) | S24, S25, S31–S42, S44, S46–S57 | open (S44 partial) | The package owning each file: `server/services/market-specs/**` and `services/regulatory/**` S11; `server/services/ectd/**` and `shared/regulatory/**` S5; `server/services/ana/**` S4; `server/services/csr/**` S3; the editor D4 (the UI session's) |
| Gates that hold the record as the one source | S08, S31, S60 | open | F1 |
| Deletions of unreached routes and modules | S05b, S09–S23, S26–S29, GF-1–GF-5 | open | **R1, founder retirement.** Where a route is served and fabricates (S09 `POST /api/v1/drafting/start_task`, S11 `/api/ai`'s invented compliance score), F1 first makes it refuse |
| Blocked | GF-6 | R1's retirement decision, or the connector owner | — |
| Superseded | 1 | — | — |

The client surfaces among the convergences (S30, S53 and the UI half of S28) are sent to the UI session before any
change (plan §4.6).

### 3. The Rule 2 audit (34 slices)

| Slice | Status on HEAD | Package |
|---|---|---|
| S1, S2, S3 and their reviews | done (this session; S3's review fixes in `dd60c6e12`) | — |
| S4, S5-0, S5a COA/pediatric/vaccine | done (another session, 10-26) | — |
| **S6b**: `generate_document` writes no regulated document from model text | **done in this push** (`5a89ccdcc`, with the device prompt in `d012d848b`) | S4, then F1 |
| S6: converge `plan_ind_module_authoring` onto the record-composed 2.5/2.7 tools | open; it shares files with S6b, so it comes straight after | S4 |
| S5a dose optimisation, RWE, pharmacovigilance | open | F1 (pharmacovigilance engines may go under S3) |
| S5b, S5c, S5d: the omitted-boolean audit over the IVD, digital-health, device, GCP, GMP and orphan engines | open | F1 |
| S7: converge `assess_benefit_risk` onto `assess_benefit_risk_balance` | open | F1 |
| S8: the effects table from the approved CSR source | open | S4 / S3 |
| S9: safety narratives from the CSR source | partial; the remainder is in the CSR lane (`csr/narrative-subject-facts.ts`) | S3, coordinated with the CSR lane |
| S10, S11a, S11b: device post-market and premarket from the program | open | F1 |
| S12 (cover letter, 510(k) summary, declaration of conformity, output confidence, biowaiver, SPL) | open. The re-check corrected the design: no deployed record holds a Basic UDI-DI, and `honesty-envelope.ts` has no other caller | F1 / S4 |
| S13: the dead request-body routes, and regenerate | open | **R1, founder retirement**, coordinated with R1's inventory |
| S14a–e: nonclinical records | R-1 decided; production value waits on a writer the catalog can reach (P-83's nonclinical work project) | S12 / S4 |

## What this session does next, in order

1. Push S6b (S4, F1) and this record (L1).
2. Rule 2 **S6** (S4): converge `plan_ind_module_authoring` onto `draft_clinical_overview_m2_5` and
   `draft_clinical_summary_m2_7`.
3. Rule 2 **S5a**, the three remaining families (F1, or S3 for pharmacovigilance):
   - pharmacovigilance, where omitted seriousness or region decide the 7- and 15-day clocks;
   - dose optimisation, where an omitted `doseSelectedByMtdAlone` grants a "met" pillar;
   - RWE.
4. 3b **Slice 4** (S5) and the server half of **Slice 3** (F1).
5. Rule 2 **S7**, **S8**, **S10–S12** (F1/S4). The cleanup convergences follow (S32 first, then S31 and S33–S57),
   each under the package owning its files.

Each slice goes red first. Each files "What already exists" and gets an adversarial review before the next starts.
Each commit carries `Plan:` and `Completes:`.

For the founder:
- 3b slices 5–7: P-55 or P-83?
- The R1 retirements: the cleanup deletions above and Rule 2 S13.
