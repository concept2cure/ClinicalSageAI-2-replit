# All of CMC, what the market is doing, and the roadmap that follows

**Package:** S7 (CMC / Module 3). **Date:** 2026-11-09.
**Asked by the founder, this session:** *"All possible CMC data and tests and studies and needs and more across all
of chemical, manufacturing and controls; must be part of this special module. Using all types of AI and machine
learn and testing and I want you to study what all advanced current market offerings are doing in this exact space
and add that to their roadmap for cmc — study external. And I think there should be a sub-project management
feature dedicated just for cmc but connected to the parent project management module."*

This is the study. The decision it asks for is recorded as **P-113** in `docs/LAUNCH_DEFINITION_OF_DONE.md`; the
roadmap rows are in `docs/design/ONE_DESIGN_PLAN.md`. Nothing is built here.

---

## 1. What already exists (RULE 3), counted by path

Not a summary — the inventory, because the roadmap below is a set of *completions* and must not propose anything
that is already here.

**57 services** in `server/services/cmc/`, **12 route modules** in `server/api/cmc/`, plus
`server/services/cmc-write-through.ts`, `cmc-module3-compiler.ts`, `cmc-impact-contradiction-engine.ts` and
`module3Composer.ts`.

### The 19 canonical record kinds (`CMC_SOURCE_TYPES`, `module3Composer.ts:51`)

`drug_substance`, `drug_product`, `specification`, `method`, `stability`, `batch`, `change_control`,
`comparability`, `manufacturing_process`, `characterization`, `reference_standard`, `container_closure`,
`excipient`, `process_validation`, `raw_material_spec`, `impurity_profile`, `dissolution_profile`,
`formulation_record`, `qc_result`.

### The nine signed registers (`services/cmc/signed-record.ts`)

`container-closures`, `reference-standards`, `impurity-profiles`, `characterization-studies`,
`manufacturing-processes`, `analytical-methods`, `process-validation`, `comparability-studies`,
`stability-studies` — each with a §11.50 ceremony, a chained audit row, and (since P-110) an outcome.

### The engines, by path — all deterministic, which RULE 2 requires

| Capability | Path |
|---|---|
| Module 3 composition, 15 sections (3.2.S.1–7, 3.2.P.1–8) | `module3Composer.ts`, `cmc/module3-compile.ts` |
| Section lineage and drift from it, not from a flag | `cmc/section-drift.ts`, `cmc_section_lineage` |
| ICH Q1E shelf life, poolability, two-sided | `cmc/ich-compliance-q1e.ts`, `shelf-life-poolability.ts`, `shelf-life.ts` |
| ICH Q2(R2) analytical validation | `cmc/ich-compliance-q2.ts` |
| ICH Q3A / M7 impurities and their qualification | `cmc/impurity-assessment.ts` |
| Process capability (Cpk/Ppk) from recorded batches | `cmc/process-capability.ts`, `recorded-capability.ts` |
| Stability trending and out-of-trend | `cmc/stability-trending.ts`, `recorded-stability.ts` |
| Dissolution comparison (f2) | `cmc/dissolution-comparison.ts` |
| SUPAC change classification | `cmc/supac-classifier.ts` |
| QbD: CQA / CPP analysis and control strategy | `cmc/qbd-analyzer.ts`, `control-strategy-generator.ts` |
| Contradictions across registers, with a lifecycle and tasks | `cmc-impact-contradiction-engine.ts`, `cmc/contradiction-*.ts` |
| The final-export gate | `cmc/final-export-gate.ts` |
| 2.3 Quality Overall Summary sharing Module 3's atoms | `services/m2-summary-builders.ts` |
| US IND regional reading | `cmc/us-ind-regional.ts` |
| Composition boundary (P-28, P-110) | `cmc/composition-scope.ts`, `substance-modality.ts` |
| Deliverables mapped downstream (P-83) | `cmc/section-drift.ts` `projectDeliverableFeeds` |

**This is a strong base.** On the measures the market sells — specification control, stability with Q1E, batch
analyses, process capability, change classification, cross-document consistency, and a signed audit trail — the
module is at or ahead of what the vendor material below describes.

### Two things the inventory shows that the roadmap turns on

1. **CQAs and CPPs are inferred, not recorded.** `analyzeQbdFromSources` derives `CqaItem` / `CppItem` from the
   specification, impurity, characterization and process records at read time. **QTPP does not exist anywhere** —
   it is not in `shared/schema.ts`, not a source type, not a register. A derived CQA cannot be versioned, owned,
   risk-assessed or signed, and the control strategy therefore has no governed object at its centre.
2. **No composed section outside 3.2.S and 3.2.P.** The composer builds 15 sections. There is no **3.2.A.1**
   (facilities and equipment), **3.2.A.2** (adventitious agents — the modality classifier feeds the *judgement*
   but no section is composed), **3.2.A.3** (novel excipients, although `materialSpec` records
   `novelExcipient` and `novelExcipientJustification`), and no **3.2.R** regional section, although
   `us-ind-regional.ts` reads the regional fields.

---

## 2. The external study

**A standing caution on the evidence.** Almost every source below is vendor marketing, a vendor-authored
comparison, or a consultancy blog. Where a number is a vendor claim I say so. Two things are *not* vendor claims
and matter more than the rest: FDA's PQ/CMC data standards and ICH M4Q(R2).

### 2a. The two regulatory facts that should shape the roadmap

**FDA PQ/CMC — structured Module 3, and its Phase 1 domains are our registers.** FDA's Pharmaceutical Quality /
CMC programme is building HL7 FHIR standards so Module 3 and 2.3 content is submitted as *computable elements*
rather than prose. Its **Phase 1 domains are Drug Product, Drug Substance, Quality Specification, Batch Analysis
and Stability**, with batch analysis mapping to 3.2.S.4.4 / 3.2.P.5.4 and stability to 3.2.S.7.3 / 3.2.P.8.3. An
Implementation Guide is published (STU1) with STU2 planned. It is **not yet an operational requirement** — FDA has
a formal process for announcing acceptance of a format.

Those five domains are, almost exactly, this module's five strongest registers. That is the single highest-leverage
alignment available: the registers already hold the data as records with lineage, so the work is a *mapping*, not a
data project. The competitors described below mostly hold Module 3 as documents and are drafting prose into them.

**ICH M4Q(R2) — Module 3 becomes a data repository and 2.3 becomes the summary.** Published by FDA as a January
2026 **draft** (Level 1, not for implementation); ICH Step 4 adoption is reported as targeted for 2027, with
sources disagreeing between June and mid-2027. The reported shape: every component described by a uniform
**Description – Manufacture – Control – Storage** template, Module 3 holding supporting data, and **2.3 becoming the
central summary with 2.3.1–2.3.6**. One source says 2.3.2 would require the QTPP and CQAs listed together with how
each control-strategy element contributes.

If that holds, two things follow for us: the composer's section-per-CTD-node shape needs a second, DMCS-shaped
projection, and **QTPP/CQA-as-records stops being a nice-to-have and becomes a filing requirement**. Both are draft,
so neither should be built against yet — but neither should be designed against either.

### 2b. What the market is selling

| Vendor / group | What they do in this exact space | How we compare |
|---|---|---|
| **QbDVision** (Digital CMC) | QTPP, CQAs, specifications, risk, justification and control strategy as one connected, versioned environment; CQA control-strategy reports; **risk maps colour-coded by Cpk computed from selected batch data**; digital tech transfer; a REST API; "AI-ready CMC infrastructure" | The closest competitor to what this module is. We **compute Cpk deterministically already** and they colour a risk map with it. Their advantage is real and structural: the QTPP/CQA *record*. Ours is the signed-act governance layer and the lineage-derived drift, which their material does not describe |
| **Weave Bio** | CTD Modules 1, 2, 3, 5 authoring, review, publishing, plus a **HAQ Manager** for health-authority questions | We have `services/ha-interactions/commitment-fulfilment.ts`; an HAQ surface is the Submission Center lane's, not CMC's |
| **DDi (Ddismart)** | An **Authoring Agent** and a **QC Agent** for AI drafting and cross-document consistency | Our contradiction sweep is deterministic and register-wide, which is stronger than a document-text QC pass. Their drafting agent is the half we do with AnA |
| **Assyro, Botminds, Numantra, Asthra, Sanai, AlphaLife (AuroraPrime), Celegence** | AI drafting of 3.2.S / 3.2.P from batch, LIMS and stability data; Module 3 cross-check | Same half. One vendor claims 14× drafting speed and one reports a Kenvue case cutting drafting from hours to minutes — **both vendor claims**. None of the sources shows Part 11 validation or submission acceptance |
| **Veeva Vault RIM / Quality** | Submissions content plan mirroring the CTD hierarchy, expected-vs-actual document matching, collaborative authoring with redlines; 26R1 added a Quality→RIM **Materials Product Data** transfer; **AI agents for regulatory are reported as planned for August 2026** | Veeva holds Module 3 as *documents in a content plan*. We hold it as *records that compose a section*. That is the Veeva-parity argument for Vault (P-79) rather than for CMC |
| **CPV platforms**: Merck **Bio4C ProcessPad**, **AmpleLogic**, **ValGenesis iCPV** | Automated Cp/Cpk/Pp/Ppk, CPV reporting, **APQR/PQR in the same platform**, alerting, and MES/LIMS integration to pull batch data automatically | We compute capability and trend stability. We have **no APQR/PQR output** and **no MES/LIMS inbound integration**. A source notes Cpk cannot be estimated for non-normal data and Ppk on percentiles is used instead — worth checking our own engine against |
| **Rockwell + the Digital CMC Consortium** (announced October 2026) | A pre-competitive group on digital CMC standards; **first focus is digital tech transfer between sponsors and CDMOs**, then knowledge management, authoring, digital twins and AI | Tech transfer is a real gap here and an industry-wide one. Worth watching rather than chasing |
| **Formulation ML**: BASF **ZoomLab**, Schrödinger, CARES/A*STAR digital twin (reported as being commercialised through 2026) | ML-supported formulation and mechanistic stability modelling | Out of scope under RULE 2 and P-28: these predict science, not filings |

### 2c. What the published ML work actually supports

- **Pre-submission deficiency prediction.** A 2026 Cureus technical report proposes an ML framework that flags CMC
  deficiency risk before submission: an NLP layer extracting stability duration, impurity limits and
  specifications, and an ML layer estimating deficiency probability. It is **a conceptual design, not a validated
  system**.
- **Stability monitoring.** An analysis cited by IntuitionLabs describes ML flagging early degradation trends,
  validated retrospectively against human decisions. I could not verify it against the original.
- **Beyond-use dating.** A 2025 open-access paper (Smart Formulation, KNIME) predicts beyond-use dates — trained on
  **53 data points**. Honest, and far too small to carry a filing.
- **Where the evidence is thin.** Production stability prediction and process capability linked to a CMC platform.
  Most of what exists is vendor-authored or conceptual.

**The reading for us:** the defensible AI/ML work in CMC today is in *reading* and *narrating*, and in *flagging for
a human*. Not in producing a number that reaches a filing. That is RULE 2 already — *"numbers, verdicts and
governed content come from deterministic engines; the model narrates. A tool that asks a model for a figure is a
defect."* The market's own evidence base agrees with the rule.

---

## 3. The gap: CMC data, tests and studies this module does not hold

Ordered by regulatory consequence, each with the existing file it would extend.

| # | Missing | Why it matters | Where it belongs |
|---|---|---|---|
| 1 | **Facilities, equipment and manufacturing sites** | Every 3.2.S.2.1 and 3.2.P.3.1 names manufacturers, and 3.2.A.1 is a CTD section. No record holds a site, its address, its licence, its GMP status or its inspection history. `us-ind-regional.ts` reads a `manufacturingSite` *string* | a register + source type; **3.2.A.1 composed** |
| 2 | **Nitrosamine risk assessment** | A named, dated, enforced requirement since 2018; a filing without it is deficient | `cmc/impurity-assessment.ts` (its own assessment kind) |
| 3 | **ICH Q3D elemental impurity risk assessment** | Required for every drug product; a distinct methodology from Q3A | `cmc/impurity-assessment.ts` |
| 4 | **ICH Q3C residual solvents** | Class 1/2/3 limits and the PDE calculation | `cmc/impurity-assessment.ts` |
| 5 | **Microbiological attributes and sterility assurance** | 3.2.P.2.5 and 3.2.P.5; bioburden, endotoxin, container-closure integrity as *results* (`container_closure` records `integrityTesting` as a field, not a study) | specification + a study kind |
| 6 | **Photostability (ICH Q1B), in-use and reconstitution stability, stability commitments** | Q1B is a separate study; in-use stability sets the label's "use within"; the post-approval commitment protocol is filed | `cmc/stability-source.ts`, the stability register's study type |
| 7 | **Method transfer and co-validation** | `METHOD_VALIDATED` already honours `transferred`, so the gate can be satisfied by a status with no study behind it | `cmc/analytical-method-source.ts` + the method register |
| 8 | **QTPP, CQA and CPP as records** | See §1. Without them the control strategy has no governed object, and M4Q(R2)'s 2.3.2 may require them listed | `cmc/qbd-analyzer.ts` reads them instead of deriving them |
| 9 | **Established conditions and PACMP (ICH Q12)** | The post-approval change framework. `supac-classifier.ts` classifies a change; nothing records what was *filed* as an established condition | `cmc/supac-classifier.ts`, `cmc-change-control-service.ts` |
| 10 | **APQR / PQR** | An annual GMP obligation every CPV platform sells. We hold every input: batches, QC results, OOS, stability, changes, capability | a report over the existing engines, not a new register |
| 11 | **Supplier and material qualification** | `raw_material_spec` records a specification; nothing records the supplier's qualified status, audit date or approved-source list | the material-spec register |
| 12 | **Extractables and leachables as studies** | `container_closure` records `extractablesLeachables` as a field | the container-closure register |
| 13 | **OOS / OOT investigation lifecycle** | A QC result is recorded `fail`; the investigation that resolves it is not | `cmc/contradiction-lifecycle.ts` (the pattern exists) |
| 14 | **Cleaning validation, shipping and transport validation** | Both are filed in 3.2.P.3.5 / regional | `process_validation`, as validation kinds |
| 15 | **Batch genealogy** | Which substance lot made which product batch — asked in every inspection | the batch register |
| 16 | **3.2.A.2, 3.2.A.3 and 3.2.R composed** | The judgements exist (`substance-modality.ts`, `novelExcipient`, `us-ind-regional.ts`); no section is composed from them | `module3Composer.ts` |

**Items 2, 3, 4, 6, 7, 12, 13, 14 and 15 extend existing registers.** Items 1, 8 and 9 need new records, which
RULE 6 reserves for the founder — they are why P-113 exists.

---

## 4. The AI and machine-learning layer, inside RULE 2

RULE 2 draws the line and the market's own evidence base supports it. Five candidates, each named with the
deterministic engine it must defer to:

1. **Document and instrument intake → registers.** Read a CoA, an executed batch record, a stability table or a
   method validation report into the register as *proposed* records a person confirms. This is the largest practical
   win and it is the founder's "data entry points" question. The model proposes; the register's existing refusals
   (P-110's signed outcomes, `refuseUnrecordedFields`, the composition boundary) decide. Extends the existing
   extraction path, not a new one.
2. **"What a reviewer will ask."** The deterministic contradiction sweep already finds internal disagreement. An
   ML layer over a corpus of real deficiency letters would rank *what an assessor is likely to question* — a flag
   with its basis and its corpus, never a verdict. This is the Cureus framework done honestly.
3. **Early degradation and out-of-trend signal.** `stability-trending.ts` is deterministic and stays the authority
   on shelf life. A signal layer may say "this series is moving earlier than the others" and must not say a shelf
   life.
4. **Specification-setting proposals.** From batch history, propose limits with the distribution and the batch
   count shown. `process-capability.ts` keeps the Cpk/Ppk arithmetic. A proposed limit is never a recorded one until
   a person signs it.
5. **Narrative drafting.** Exists (`module3-narrative-builder.ts` + AnA). Market parity, already held, and bound by
   the governance refusal (`module3-narrative-governance-refusal.ts`).

**One correction to adopt from the market study:** a source notes Cpk cannot be estimated for non-normal data and
Ppk on percentiles is used instead. `process-capability.ts` and `recorded-capability.ts` should be read against
that, and if they assume normality without saying so, that is an F1 repair rather than a roadmap item.

---

## 5. The CMC sub-project management the founder asked for

**Already decided, today, as P-111** — *"A CMC or Quality work project manages its own smaller tasks, inside its
own work area"* (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder chose **inside each work area**, not a separate
screen, and routed it to **S12**.

What it says: a CMC work project is a child `projects` row under the program anchor; opening it opens the CMC area
**bound to that work project**; the area shows its Tasks with owner, due date, status and **one level of
subtasks**; the tasks are `unified_tasks` rows filed on the work project itself; they **roll up** into the filing
project's work panel and each person's Tasks rather than forming a second list.

**Owner:** S12, the project-page session (`01FTWcmX…`). **This lane holds the CMC area's screens**, which is the
half that renders the task list inside CMC. So the founder's third point needs no new decision — it needs this
lane to take the CMC half, which the roadmap below schedules.

What P-111 does **not** cover, and the founder's wording may intend: the CMC work project's own schedule —
deliverable dates, dependencies between them, the critical path to the filing date. §7a of
`THE_PROGRAM_2026-11-01.md` asks for "its owner and due date" per deliverable, and
`docs/evidence/S12/2026-11-09-deliverable-feeds/` records why that has nowhere to live: a CMC deliverable is not a
row, it is *the set of records of one source type in one project*. P-113 settles that.

---

## 6. What I recommend against

- **A new CMC screen, card or workspace.** RULE 4. Every item above lands in the existing CMC work area, the one
  editor, or an existing register.
- **ML that produces a filed number.** RULE 2, and the market's own evidence base is weakest exactly there.
- **Building to ICH M4Q(R2) now.** It is a January 2026 draft, not for implementation, with sources disagreeing on
  the 2027 adoption date. Design for it; do not build against it.
- **Chasing the AI-authoring vendors feature for feature.** They are drafting prose into documents. This module's
  structural advantage is that Module 3 composes from governed records with lineage — which is also what FDA's
  PQ/CMC programme is moving toward. Spending the advantage to match a drafting demo would be the wrong trade.
- **Formulation / molecular ML** (ZoomLab, Schrödinger, digital twins). Outside P-28 and outside the spine.

---

## Sources

Regulatory primary and near-primary:
- [FDA PQ/CMC programme](https://www.fda.gov/industry/pharmaceutical-quality-chemistry-manufacturing-controls-pqcmc/pqcmc-and-hl7-fhir) ·
  [PQ/CMC Data Exchange](https://downloads.regulations.gov/FDA-2023-N-1443-0002/content.pdf) ·
  [HL7 BR&R PQ-CMC project](https://confluence.hl7.org/spaces/BRR/pages/58656205/Pharmaceutical+Quality+-+Chemistry+Manufacturing+and+Controls+PQ-CMC+Submissions+to+FDA) ·
  [PQ/CMC IG introduction](https://confluence.hl7.org/download/attachments/220707416/PQCMC%20IG%20intro%20for%20BRR%20IG%20Review%20March%2012%202024.pdf)
- [ICH M4Q(R2) Step 2 consultation slides](https://database.ich.org/sites/default/files/M4Q(R2)_Step%202_Slides%20to%20Accompany%20Consultation_2025_0624_SEC.pdf) ·
  [EMA regulatory perspective (CASSS)](https://www.casss.org/docs/default-source/cmc-strategy-forum-europe/2025-speaker-presentations/tiitso-klara-european-medicines-agency-2025.pdf)

Vendor and market (treat claims as unverified):
- [QbDVision — Digital CMC](https://www.qbdvision.com/digital-cmc/) ·
  [Product definition and management](https://www.qbdvision.com/platform/product-management) ·
  [Digital control strategy release](https://www.qbdvision.com/resources/new-release-digital-control-strategy-for-cmc-operations) ·
  [M4Q(R2) commentary](https://www.qbdvision.com/ich-m4qr2-2025-draft-guideline/)
- [AI CMC authoring comparison, 2026](https://intuitionlabs.ai/articles/ai-cmc-authoring-software-comparison) ·
  [Best AI CMC authoring software](https://www.assyro.com/insights/best-ai-cmc-authoring-software) ·
  [Botminds CMC Module 3](https://www.botminds.ai/solutions/cmc-module-3-authoring) ·
  [Celegence Gen-AI CMC whitepaper](https://www.celegence.com/downloads/enhancing-cmc-module-3-documentation-with-gen-ai-whitepaper/)
- [Veeva Vault 26R2 preview](https://intuitionlabs.ai/articles/veeva-vault-26r2-release-preview) ·
  [Veeva Vault RIM guide](https://intuitionlabs.ai/pdfs/veeva-vault-rim-an-in-depth-guide-complete-faq.pdf)
- [Merck Bio4C ProcessPad](https://www.sigmaaldrich.com/US/en/campaigns/bio4c-processpad) ·
  [CPV technical article](https://www.sigmaaldrich.com/US/en/technical-documents/technical-article/pharmaceutical-and-biopharmaceutical-manufacturing/monoclonal-antibody-manufacturing/continued-process-verification) ·
  [AmpleLogic CPV](https://www.amplelogic.com/products/continued-process-verification) ·
  [ValGenesis CPV FAQs](https://www.valgenesis.com/blog/continued-process-verification-cpv-faqs-for-life-sciences-teams)
- [Rockwell / Digital CMC Consortium launch](https://www.prnewswire.com/news-releases/rockwell-automation-and-industry-leaders-launch-the-digital-cmc-consortium-to-accelerate-digital-transformation-in-pharmaceutical-development-302901891.html) ·
  [Tech transfer guide 2026](https://pharmasource.global/content/tech-transfer-in-pharma-guide-to-technology-transfers-and-key-processes/)

Machine learning:
- [ML framework for predicting CMC regulatory deficiencies (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC13249086/) ·
  [same, PubMed](https://pubmed.ncbi.nlm.nih.gov/42273515/)
- [Smart Formulation: ML beyond-use dating (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12389346/)
- [AI in CMC submissions: process analytics](https://intuitionlabs.ai/articles/ai-cmc-submissions-process-analytics) ·
  [AI in drug product design, 2026 landscape](https://www.pharmaexcipients.com/news/ai-solutions-pharma/)
