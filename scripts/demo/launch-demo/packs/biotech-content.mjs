/**
 * launch-demo/packs/biotech-content.mjs — the BIOTECH demo story: every name,
 * document body, protocol element and SOP the pack seeds. Content only; the
 * API calls live in biotech.mjs and its siblings.
 *
 * PROVENANCE. Written by the pack's author as a regulatory subject-matter expert
 * for demonstration. Seeded demo content: no AI provider is configured and
 * nothing here was model-drafted. The sponsor, molecule, study, people and
 * numbers are fictional.
 */
import { demoTitle, findDemo } from '../lib.mjs';

export const PACK = 'biotech';
export const T = (name) => demoTitle(PACK, name);
/** The row whose `title` is this pack's demo title for `name`, or null. */
export const findDemoByTitle = (rows, name) => findDemo(rows, PACK, name, 'title');
export const PROVENANCE =
  'Seeded demonstration content authored for the Concept2Cure launch demo (fictional sponsor, molecule, study and people). Not model-drafted: no AI provider is configured.';

export const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
export const today = () => inDays(0);
/* ───────────────────────── The story (all fictional) ───────────────────────── */

export const MOLECULE = 'C2C-101';
export const PROGRAM_NAME = 'C2C-101 anti-IL-23p19 mAb — plaque psoriasis (IND)';
export const PRODUCT_NAME = 'C2C-101 (anti-IL-23p19 monoclonal antibody, fictional)';
export const INDICATION = 'Moderate-to-severe plaque psoriasis in adults';
export const STUDY = 'C2C-101-201';


/** The six vault documents: real multi-page PDFs, each filed into its CTD module and placed as an eCTD leaf. */
export const VAULT_DOCS = [
  {
    key: 'ib',
    name: "Investigator's Brochure C2C-101 v3.0",
    query: "Investigator's Brochure C2C-101",
    documentType: 'IB',
    folderId: 'module-1',
    sectionCode: 'm1.14.4.1',
    leafTitle: "Investigator's Brochure v3.0",
    pdf: {
      subtitle: `Edition 3.0 — ${MOLECULE}, humanized IgG1 anti-IL-23p19 monoclonal antibody — Concept2Cure Therapeutics (fictional)`,
      sections: [
        { heading: '1. Summary', paragraphs: [
          `${MOLECULE} is a humanized immunoglobulin G1 (IgG1) monoclonal antibody that binds with high affinity to the p19 subunit of human interleukin-23 (IL-23) and prevents IL-23 from engaging its receptor complex on Th17 and innate lymphoid cells. Selective neutralisation of IL-23 interrupts the IL-23/IL-17 axis that drives keratinocyte hyperproliferation and dermal inflammation in plaque psoriasis without affecting IL-12-dependent Th1 responses.`,
          `This edition (3.0) incorporates the completed 26-week cynomolgus monkey toxicology study, the Phase 1 single- and multiple-ascending-dose study C2C-101-101 in healthy volunteers, and the updated reference safety information. It supersedes edition 2.0 in its entirety.`,
        ] },
        { heading: '2. Physical, Chemical and Pharmaceutical Properties and Formulation', paragraphs: [
          `${MOLECULE} is expressed in a Chinese hamster ovary (CHO) cell line and purified by protein A affinity chromatography followed by two polishing steps and viral filtration. The drug product is a sterile, preservative-free solution for subcutaneous injection supplied at 100 mg/mL in a 1 mL single-use pre-filled syringe (histidine 10 mM, sucrose 8 %, polysorbate 80 0.02 %, pH 6.0). Storage is at 2–8 °C protected from light; a single excursion to 25 °C for up to 7 days is supported by stability data.`,
        ] },
        { heading: '3. Nonclinical Studies', paragraphs: [
          `Pharmacology. ${MOLECULE} bound human and cynomolgus IL-23 with KD values of 9 pM and 14 pM and neutralised IL-23-induced IL-17A release from human PBMC with an IC50 of 41 pM. It did not bind IL-12 or the p40 subunit. In an imiquimod-induced psoriasiform dermatitis model in human IL-23-knock-in mice, weekly subcutaneous dosing reduced ear thickness and epidermal IL-17A/F transcript levels in a dose-dependent manner.`,
          `Pharmacokinetics. In cynomolgus monkeys the terminal half-life was 14–18 days after subcutaneous dosing with bioavailability of approximately 70 %. Exposure increased dose-proportionally between 10 and 100 mg/kg; anti-drug antibodies were detected in 2 of 24 animals and had no measurable effect on exposure.`,
          `Toxicology. A 4-week and a 26-week repeat-dose study in cynomolgus monkeys (up to 100 mg/kg/week subcutaneous) identified no adverse findings; the no-observed-adverse-effect level (NOAEL) was the highest dose tested. Tissue cross-reactivity in human and monkey panels was confined to expected lymphoid tissue. No genotoxicity, carcinogenicity or reproductive toxicity studies have been conducted, consistent with ICH S6(R1) for this class.`,
        ] },
        { heading: '4. Effects in Humans', paragraphs: [
          `Study C2C-101-101 (single and multiple ascending dose, 64 healthy volunteers, doses 30–300 mg subcutaneous) showed dose-proportional exposure, a mean terminal half-life of 21 days, and no serious adverse events. The most frequent treatment-emergent adverse events were injection-site erythema (12 %), headache (9 %) and nasopharyngitis (8 %). No clinically significant laboratory, vital-sign or ECG changes were observed. Treatment-emergent anti-drug antibodies occurred in 4 of 48 active-treated subjects, none neutralising.`,
        ] },
        { heading: '5. Summary of Data and Guidance for the Investigator', paragraphs: [
          `The available data support subcutaneous dosing of 100 mg and 200 mg at Weeks 0 and 4 and every 8 weeks thereafter in adults with moderate-to-severe plaque psoriasis. Investigators should screen for latent tuberculosis and active infection before dosing, withhold dosing during clinically significant infection, and report any suspected serious infection, hypersensitivity reaction or new malignancy as an adverse event of special interest within 24 hours. Live vaccines should be avoided during the study and for 12 weeks after the last dose.`,
          `Reference safety information (RSI) for expectedness assessment is listed in Section 6 of this Brochure. No adverse reaction is currently considered expected for the purposes of expedited reporting.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
  {
    key: 'protocol',
    name: `Protocol ${STUDY} v1.0 — Phase 2, randomized, placebo-controlled`,
    query: `Protocol ${STUDY} v1.0`,
    documentType: 'PROTOCOL',
    folderId: 'module-5',
    sectionCode: 'm5.3.5.1',
    leafTitle: `Protocol ${STUDY} v1.0`,
    pdf: {
      subtitle: `A Phase 2, Randomized, Double-Blind, Placebo-Controlled, Dose-Ranging Study of ${MOLECULE} in Adults with Moderate-to-Severe Plaque Psoriasis — Version 1.0`,
      sections: [
        { heading: '1. Synopsis', paragraphs: [
          `Objective. To evaluate the efficacy, safety and pharmacokinetics of two subcutaneous dose regimens of ${MOLECULE} compared with placebo over 16 weeks in adults with moderate-to-severe plaque psoriasis.`,
          `Design. Multicentre, randomized (1:1:1), double-blind, placebo-controlled, parallel-group study. Approximately 180 participants will be randomized to ${MOLECULE} 100 mg, ${MOLECULE} 200 mg, or placebo administered subcutaneously at Weeks 0 and 4 and then every 8 weeks. The primary endpoint is assessed at Week 16; participants then enter a 36-week open-label extension (reported separately).`,
          `Primary endpoint. Proportion of participants achieving a 75 % improvement from baseline in Psoriasis Area and Severity Index (PASI 75) at Week 16.`,
        ] },
        { heading: '2. Background and Rationale', paragraphs: [
          `Plaque psoriasis is a chronic immune-mediated disease affecting approximately 2–3 % of adults; moderate-to-severe disease (body surface area ≥ 10 %, PASI ≥ 12, static Physician Global Assessment ≥ 3) impairs quality of life and carries cardiometabolic comorbidity. IL-23 is the upstream cytokine that maintains pathogenic Th17 cells in psoriatic skin. Selective p19 inhibition has an established mechanism in this indication; ${MOLECULE} is differentiated by a longer half-life supporting every-8-week maintenance dosing and by a formulation intended for self-administration.`,
        ] },
        { heading: '3. Objectives and Endpoints', paragraphs: [
          `Primary: PASI 75 response at Week 16 (each active arm vs placebo). Key secondary: sPGA 0/1 at Week 16; PASI 90 at Week 16; PASI 100 at Week 16; change from baseline in DLQI at Week 16. Safety: treatment-emergent adverse events, adverse events of special interest, laboratory parameters, vital signs, ECG, immunogenicity. Pharmacokinetic: serum trough concentrations at Weeks 4, 8, 12 and 16; exploratory exposure–response.`,
        ] },
        { heading: '4. Study Population', paragraphs: [
          `Adults 18–75 years with a diagnosis of chronic plaque psoriasis for at least 6 months, PASI ≥ 12, BSA ≥ 10 % and sPGA ≥ 3 at screening and baseline, who are candidates for systemic therapy or phototherapy. Key exclusions: non-plaque or drug-induced psoriasis, prior exposure to an IL-23 or IL-17 inhibitor, active or latent untreated tuberculosis, clinically significant infection within 4 weeks, malignancy within 5 years (excluding adequately treated non-melanoma skin cancer or carcinoma in situ of the cervix), live vaccine within 12 weeks, and pregnancy or lactation. The full criteria are in Section 5 and are mirrored in the protocol-development record.`,
        ] },
        { heading: '5. Study Treatments', paragraphs: [
          `${MOLECULE} 100 mg/mL solution for subcutaneous injection in a single-use pre-filled syringe, or matching placebo, administered by trained site staff at Weeks 0, 4 and 12. Blinding is maintained by identical presentation; an unblinded pharmacist prepares the assigned kit. Randomization is stratified by body weight (≤ 90 kg, > 90 kg) and prior biologic exposure (yes/no) through an interactive response system.`,
        ] },
        { heading: '6. Schedule of Assessments', paragraphs: [
          `Visits: Screening (Day −28 to −1), Baseline/Week 0, Week 2, Week 4, Week 8, Week 12, Week 16 (primary endpoint and end of treatment), and a safety Follow-up 8 weeks after the last dose for participants not entering the extension. PASI, sPGA and BSA are assessed at every visit by a trained assessor blinded to treatment; DLQI at Baseline, Week 8 and Week 16; PK and immunogenicity samples pre-dose at Weeks 4, 8, 12 and 16; safety laboratory tests at Screening, Weeks 4, 8, 12 and 16; ECG at Screening and Week 16; pregnancy test at every visit for participants of child-bearing potential.`,
        ] },
        { heading: '7. Safety Reporting', paragraphs: [
          `Adverse events are collected from informed consent through the last study contact. Serious adverse events are reported to the sponsor within 24 hours of awareness. Adverse events of special interest — serious infections, opportunistic infections, hypersensitivity, malignancy and major adverse cardiovascular events — are reported on the same timeline with a targeted questionnaire. An independent Data Monitoring Committee reviews unblinded safety data after 60 and 120 participants have completed Week 4.`,
        ] },
        { heading: '8. Statistical Considerations', paragraphs: [
          `Sample size. Assuming PASI 75 response rates of 65 % (200 mg), 55 % (100 mg) and 8 % (placebo) at Week 16, 55 participants per arm provide more than 90 % power at a two-sided alpha of 0.025 per comparison to detect each active arm versus placebo; 60 per arm (180 total) allows for 8 % non-evaluable participants. Primary analysis: Cochran–Mantel–Haenszel test stratified by the randomization strata on the intent-to-treat population with non-responder imputation for missing data. Multiplicity: a fixed-sequence procedure tests 200 mg then 100 mg for the primary endpoint, then the key secondary endpoints in the order listed.`,
        ] },
        { heading: '9. Ethics and Regulatory', paragraphs: [
          `The study will be conducted in accordance with ICH E6(R3), the Declaration of Helsinki and 21 CFR Parts 50, 56 and 312. Written informed consent will be obtained before any study procedure. The protocol, consent form and Investigator's Brochure will be approved by an institutional review board at each site before enrolment.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
  {
    key: 'sap',
    name: `Statistical Analysis Plan ${STUDY} v1.0`,
    query: `Statistical Analysis Plan ${STUDY}`,
    documentType: 'SAP',
    folderId: 'module-5',
    sectionCode: 'm5.3.5.1',
    leafTitle: `Statistical Analysis Plan ${STUDY} v1.0`,
    pdf: {
      subtitle: `Statistical Analysis Plan for Protocol ${STUDY} Version 1.0 — Concept2Cure Therapeutics (fictional)`,
      sections: [
        { heading: '1. Introduction', paragraphs: [
          `This Statistical Analysis Plan (SAP) describes the planned analyses for the 16-week double-blind period of Study ${STUDY}. It is written in accordance with ICH E9 and ICH E9(R1) and is finalised before unblinding. Deviations from the protocol-specified analyses are documented in Section 9 with their rationale.`,
        ] },
        { heading: '2. Estimands', paragraphs: [
          `Primary estimand. Population: adults with moderate-to-severe plaque psoriasis as defined by the eligibility criteria. Treatment: ${MOLECULE} 100 mg or 200 mg versus placebo as randomized. Variable: PASI 75 response at Week 16. Intercurrent events: discontinuation of study treatment for any reason and use of prohibited psoriasis therapy are handled with a composite strategy (participants are counted as non-responders). Population-level summary: difference in response proportions with a 95 % confidence interval.`,
        ] },
        { heading: '3. Analysis Populations', paragraphs: [
          `Intent-to-treat (ITT): all randomized participants, analysed as randomized. Safety: all participants who received at least one dose, analysed by treatment received. Per-protocol: ITT participants without major protocol deviations affecting the primary endpoint, defined before unblinding. Pharmacokinetic: participants with at least one evaluable post-dose concentration.`,
        ] },
        { heading: '4. Primary Analysis', paragraphs: [
          `PASI 75 at Week 16 is compared between each ${MOLECULE} arm and placebo with a Cochran–Mantel–Haenszel test stratified by body weight category and prior biologic exposure. Missing Week 16 assessments are imputed as non-response. The treatment difference and its 95 % CI are estimated by the stratified Miettinen–Nurminen method. Sensitivity analyses: (a) multiple imputation under missing-at-random; (b) tipping-point analysis; (c) per-protocol population.`,
        ] },
        { heading: '5. Multiplicity', paragraphs: [
          `Family-wise type I error is controlled at 0.05 (two-sided) with a fixed-sequence hierarchy: primary endpoint 200 mg vs placebo, then 100 mg vs placebo, then key secondary endpoints in the order sPGA 0/1, PASI 90, PASI 100 and DLQI change, each tested at the 200 mg then 100 mg level. Testing stops at the first non-significant result; subsequent results are descriptive.`,
        ] },
        { heading: '6. Secondary and Exploratory Analyses', paragraphs: [
          `Binary endpoints are analysed as for the primary endpoint. Change from baseline in DLQI is analysed with a mixed model for repeated measures with treatment, visit, treatment-by-visit interaction, stratification factors and baseline as covariates and an unstructured covariance. Time to PASI 75 is summarised by Kaplan–Meier estimates. Exposure–response is explored with logistic regression of Week 16 response on observed trough concentration.`,
        ] },
        { heading: '7. Safety Analyses', paragraphs: [
          `Treatment-emergent adverse events are coded with MedDRA and summarised by system organ class and preferred term with participant incidence and exposure-adjusted incidence rates. Laboratory, vital-sign and ECG data are summarised by shift tables and descriptive statistics. Immunogenicity is summarised as treatment-emergent anti-drug antibody incidence and neutralising antibody incidence with their relationship to exposure and injection-site reactions.`,
        ] },
        { heading: '8. Interim Analysis and Data Monitoring', paragraphs: [
          `No efficacy interim analysis is planned. The independent Data Monitoring Committee reviews unblinded safety data at two pre-specified points; no alpha is spent because no efficacy stopping rule applies.`,
        ] },
        { heading: '9. Changes from the Protocol', paragraphs: [
          `None at Version 1.0. Any change will be recorded here with its rationale and date before database lock.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
  {
    key: 'cmc',
    name: 'CMC Quality Summary (3.2.S / 3.2.P overview) — C2C-101',
    query: 'CMC Quality Summary',
    documentType: 'MODULE_2',
    folderId: 'module-2',
    sectionCode: 'm2.3',
    leafTitle: 'Quality Overall Summary — C2C-101',
    pdf: {
      subtitle: `Quality Overall Summary for the Original IND — ${MOLECULE} drug substance and drug product — Concept2Cure Therapeutics (fictional)`,
      sections: [
        { heading: '2.3.S Drug Substance', paragraphs: [
          `General information. ${MOLECULE} is a humanized IgG1κ monoclonal antibody (approximately 147 kDa) with a single N-linked glycosylation site at Asn297 of each heavy chain. Two point mutations in the Fc region (L234A/L235A) attenuate Fcγ receptor binding.`,
          `Manufacture. The drug substance is produced by fed-batch culture of a CHO-K1 derived cell line in a 2,000 L single-use bioreactor, harvested by depth filtration, and purified by protein A chromatography, low-pH viral inactivation, cation- and anion-exchange polishing, viral filtration and ultrafiltration/diafiltration into formulation buffer. Three consecutive conformance batches at the clinical scale met all in-process controls and release specifications. Critical process parameters and their proven acceptable ranges are tabulated in 3.2.S.2.4.`,
          `Characterisation. Primary structure was confirmed by peptide mapping with mass spectrometry; the major glycoforms are G0F and G1F. Charge variants (acidic 18 %, main 71 %, basic 11 %) and size variants (monomer ≥ 98.5 % by SE-HPLC) are consistent across batches. Potency is measured by an IL-23-dependent reporter-gene bioassay reported relative to the in-house reference standard.`,
          `Control of drug substance. Release specifications cover identity (peptide map), purity (SE-HPLC, CE-SDS, icIEF), potency (bioassay 70–130 % of reference), quantity (A280), safety (endotoxin, bioburden) and process-related impurities (host-cell protein ≤ 100 ng/mg, host-cell DNA ≤ 10 pg/mg, residual protein A ≤ 5 ng/mg). Analytical procedures are qualified for Phase 2; full validation is planned before pivotal studies.`,
          `Stability. Drug substance stored at −70 °C in single-use bags is stable for 24 months on real-time data (three batches, 18 months completed, extrapolated per ICH Q5C); the proposed shelf life for this IND is 18 months.`,
        ] },
        { heading: '2.3.P Drug Product', paragraphs: [
          `Description and composition. ${MOLECULE} injection, 100 mg/mL, is supplied in a 1 mL Type I glass pre-filled syringe with a fluoropolymer-coated bromobutyl plunger stopper. Each syringe delivers 100 mg in 1.0 mL. Excipients: L-histidine, sucrose, polysorbate 80, water for injection.`,
          `Manufacture. Drug substance is thawed, pooled, sterile-filtered through two 0.2 µm filters and aseptically filled at a contract manufacturing site under an approved aseptic process validated by three media fills. Filled syringes are 100 % visually inspected and labelled for the clinical supply.`,
          `Control of drug product. Release specifications include appearance, pH (5.7–6.3), osmolality, protein concentration, purity, potency, sub-visible particles (USP <788>), sterility, endotoxin and extractable volume.`,
          `Stability. Drug product at 2–8 °C is stable for 18 months on real-time data (12 months completed); the proposed clinical shelf life is 12 months with re-test extension on emerging data. An in-use study supports 7 days at 25 °C.`,
        ] },
        { heading: 'Comparability', paragraphs: [
          `The Phase 1 material was manufactured at 500 L scale. Analytical comparability between the 500 L and 2,000 L processes was demonstrated by side-by-side release testing, extended characterisation and forced-degradation studies; no differences of potential clinical relevance were identified.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
  {
    key: 'tox',
    name: 'Nonclinical Toxicology Summary — C2C-101',
    query: 'Nonclinical Toxicology Summary',
    documentType: 'MODULE_2',
    folderId: 'module-2',
    sectionCode: 'm2.6.6',
    leafTitle: 'Toxicology Written Summary — C2C-101',
    pdf: {
      subtitle: `Module 2.6.6 Toxicology Written Summary — ${MOLECULE} — Concept2Cure Therapeutics (fictional)`,
      sections: [
        { heading: '1. Brief Summary', paragraphs: [
          `The nonclinical safety programme for ${MOLECULE} follows ICH S6(R1) for a biotechnology-derived product with a single pharmacologically relevant species (cynomolgus monkey). Studies comprised a 4-week dose-range-finding study, a 26-week repeat-dose GLP study with a 12-week recovery period, tissue cross-reactivity in human and monkey tissues, and in vitro cytokine release. All pivotal studies were conducted under Good Laboratory Practice.`,
        ] },
        { heading: '2. Repeat-Dose Toxicity', paragraphs: [
          `26-week study. Cynomolgus monkeys (5/sex/group) received ${MOLECULE} subcutaneously once weekly at 0, 10, 30 or 100 mg/kg. There were no treatment-related deaths, clinical signs, or changes in body weight, food consumption, ophthalmology, ECG, clinical pathology, immunophenotyping, or organ weights. Microscopic findings were limited to minimal injection-site inflammation present also in controls. Exposure at the NOAEL (100 mg/kg/week) exceeded the anticipated human exposure at 200 mg every 8 weeks by approximately 45-fold on an AUC basis. Anti-drug antibodies were detected in 3 of 30 treated animals without loss of exposure.`,
        ] },
        { heading: '3. Safety Pharmacology', paragraphs: [
          `Cardiovascular, respiratory and neurological endpoints were incorporated into the 26-week study per ICH S7A. No effects on heart rate, blood pressure, QTc interval, respiratory rate or neurological examination were observed at any dose.`,
        ] },
        { heading: '4. Immunotoxicity', paragraphs: [
          `T-cell-dependent antibody response to keyhole limpet haemocyanin was unaffected at all doses. Peripheral lymphocyte subsets and serum immunoglobulins were within historical control ranges. In vitro cytokine release in human whole blood (wet-coated and soluble formats) showed no release above the isotype control.`,
        ] },
        { heading: '5. Tissue Cross-Reactivity', paragraphs: [
          `Immunohistochemical staining of a full panel of human and cynomolgus tissues with biotinylated ${MOLECULE} showed membrane and cytoplasmic staining of mononuclear cells in lymphoid tissues and inflamed skin, consistent with the expected distribution of IL-23-producing cells. No unexpected staining was observed.`,
        ] },
        { heading: '6. Genotoxicity, Carcinogenicity and Reproductive Toxicity', paragraphs: [
          `Not conducted, consistent with ICH S6(R1) for a monoclonal antibody. An enhanced pre- and postnatal development study in cynomolgus monkeys is planned before Phase 3 to support inclusion of women of child-bearing potential without the contraception restrictions applied in this protocol.`,
        ] },
        { heading: '7. Integrated Assessment', paragraphs: [
          `The nonclinical data identify no target organ of toxicity and support the proposed clinical doses and duration. The principal anticipated clinical risk is that of the pharmacological class — an increased susceptibility to infection — which is addressed by the protocol's screening, monitoring and dose-withholding rules.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
  {
    key: 'preind',
    name: 'Pre-IND Meeting Minutes — C2C-101 (Type B)',
    query: 'Pre-IND Meeting Minutes',
    documentType: 'CORRESPONDENCE',
    folderId: 'module-1',
    sectionCode: 'm1.6.3',
    leafTitle: 'Pre-IND meeting minutes (Type B)',
    pdf: {
      subtitle: `Sponsor minutes of the Type B pre-IND meeting for ${MOLECULE} — Concept2Cure Therapeutics (fictional). Fictional exercise: no agency was consulted.`,
      sections: [
        { heading: 'Meeting Details', paragraphs: [
          `Meeting type: Type B (pre-IND), written response only. Product: ${MOLECULE}, humanized anti-IL-23p19 IgG1 monoclonal antibody. Proposed indication: ${INDICATION.toLowerCase()}. Sponsor: Concept2Cure Therapeutics (fictional). These minutes record the sponsor's understanding of the written responses and were prepared for the demonstration only.`,
        ] },
        { heading: 'Question 1 — Nonclinical package', paragraphs: [
          `Sponsor question: Does the Agency agree that the 26-week cynomolgus repeat-dose study, together with the 4-week study, tissue cross-reactivity and cytokine release assessment, is sufficient to support a 16-week Phase 2 study with a 36-week extension? Response (as understood): The proposed package appears adequate to support the proposed duration. The sponsor should ensure that the duration of clinical dosing does not exceed the duration supported by the chronic toxicology study and should provide the full study report in Module 4.`,
        ] },
        { heading: 'Question 2 — Starting dose and regimen', paragraphs: [
          `Sponsor question: Does the Agency agree with the proposed Phase 2 doses of 100 mg and 200 mg at Weeks 0 and 4 and every 8 weeks thereafter? Response (as understood): The dose selection rationale based on receptor occupancy modelling and Phase 1 exposure appears reasonable. The sponsor should justify the maintenance interval with trough-concentration data and consider collecting PK at additional time points to characterise the exposure–response relationship.`,
        ] },
        { heading: 'Question 3 — Primary endpoint', paragraphs: [
          `Sponsor question: Does the Agency agree that PASI 75 at Week 16 is an acceptable primary endpoint for the Phase 2 study? Response (as understood): PASI 75 at Week 16 is acceptable for a dose-ranging study. For registrational studies the co-primary endpoints of PASI 75 and sPGA 0/1 at Week 16 should be planned, and the sponsor should discuss the statistical hierarchy in the SAP.`,
        ] },
        { heading: 'Question 4 — CMC', paragraphs: [
          `Sponsor question: Is the proposed comparability approach between the 500 L Phase 1 process and the 2,000 L Phase 2 process acceptable? Response (as understood): The approach is generally consistent with ICH Q5E. Release and extended characterisation data for the Phase 2 conformance batches should be provided in Module 3 with the IND.`,
        ] },
        { heading: 'Action Items', paragraphs: [
          `1. Include the full 26-week toxicology report in Module 4 (owner: Nonclinical). 2. Add PK sampling at Week 2 (owner: Clinical Pharmacology) — implemented in Protocol v1.0. 3. Provide comparability data in 3.2.S.2.6 (owner: CMC). 4. Describe the fixed-sequence multiplicity procedure in the SAP (owner: Biostatistics) — implemented in SAP v1.0.`,
        ] },
        { heading: 'Provenance', paragraphs: [PROVENANCE] },
      ],
    },
  },
];

/** Authoring documents: real section prose. */
export const AUTHORING_DOCS = [
  {
    key: 'synopsis',
    name: `Protocol Synopsis ${STUDY}`,
    module: 'M5',
    role: 'frozen-signed',
    sections: [
      { code: 'S.1', title: 'Objectives', content: `<p><strong>Primary objective.</strong> To evaluate the efficacy of two subcutaneous dose regimens of ${MOLECULE} compared with placebo in adults with moderate-to-severe plaque psoriasis, measured as PASI 75 response at Week 16.</p><p><strong>Secondary objectives.</strong> To evaluate sPGA 0/1, PASI 90, PASI 100 and change in DLQI at Week 16; to characterise the safety, tolerability, pharmacokinetics and immunogenicity of ${MOLECULE} over 16 weeks; and to explore the exposure–response relationship supporting Phase 3 dose selection.</p>` },
      { code: 'S.2', title: 'Study design', content: `<p>Study ${STUDY} is a multicentre, randomized (1:1:1), double-blind, placebo-controlled, parallel-group, dose-ranging study. Approximately 180 participants will receive ${MOLECULE} 100 mg, ${MOLECULE} 200 mg or placebo subcutaneously at Weeks 0 and 4 and then every 8 weeks. The double-blind period ends at Week 16; participants may enter a 36-week open-label extension. Randomization is stratified by body weight (≤ 90 kg / &gt; 90 kg) and prior biologic exposure.</p>` },
      { code: 'S.3', title: 'Study population', content: `<p>Adults aged 18 to 75 years with chronic plaque psoriasis for at least 6 months, PASI ≥ 12, body surface area ≥ 10 % and sPGA ≥ 3 at screening and baseline, who are candidates for systemic therapy or phototherapy. Participants with prior IL-23 or IL-17 inhibitor exposure, untreated latent tuberculosis, clinically significant infection, or malignancy within 5 years are excluded. The complete inclusion and exclusion criteria are maintained in the protocol-development record for ${STUDY}.</p>` },
      { code: 'S.4', title: 'Endpoints', content: `<p><strong>Primary.</strong> Proportion of participants achieving PASI 75 at Week 16.</p><p><strong>Key secondary (hierarchical).</strong> sPGA 0/1 at Week 16; PASI 90 at Week 16; PASI 100 at Week 16; change from baseline in DLQI at Week 16.</p><p><strong>Safety.</strong> Treatment-emergent adverse events and adverse events of special interest (serious infection, opportunistic infection, hypersensitivity, malignancy, MACE), laboratory parameters, vital signs, ECG and anti-drug antibodies.</p><p><strong>Pharmacokinetic.</strong> Serum trough concentrations at Weeks 2, 4, 8, 12 and 16.</p>` },
      { code: 'S.5', title: 'Sample size rationale', content: `<p>Assuming Week 16 PASI 75 response rates of 65 % for 200 mg, 55 % for 100 mg and 8 % for placebo, 55 participants per arm provide more than 90 % power to detect each active arm versus placebo at a two-sided alpha of 0.025 per comparison (chi-square test, no continuity correction). Allowing for 8 % of participants being non-evaluable, 60 participants per arm (180 in total) will be randomized. The placebo response assumption is drawn from published Phase 2 and Phase 3 studies of IL-23 inhibitors in this population; the active-arm assumptions are conservative relative to the class.</p>` },
      { code: 'S.6', title: 'Statistical methods', content: `<p>The primary endpoint is analysed on the intent-to-treat population with non-responder imputation using a Cochran–Mantel–Haenszel test stratified by the randomization factors. Family-wise type I error is controlled with a fixed-sequence procedure (200 mg then 100 mg for the primary endpoint, then the key secondary endpoints in the order listed). Continuous endpoints use a mixed model for repeated measures. Full details are in the Statistical Analysis Plan ${STUDY} v1.0 filed in the Vault.</p>` },
    ],
    comments: [
      { sectionCode: 'S.5', body: 'Please confirm the placebo PASI 75 assumption of 8 % against the two most recent Phase 3 IL-23 programmes; 5–10 % is the published range and 8 % sits in the middle.', resolution: 'Confirmed against the published range (5–10 %); 8 % retained and the source studies are cited in the SAP §4.' },
      { sectionCode: 'S.2', body: 'Stratification by prior biologic exposure: the protocol body says "prior biologic" but the IRT specification says "prior IL-17/IL-23". Align before freeze.', resolution: 'Aligned to "prior biologic exposure (any)" in the protocol, synopsis and IRT specification v1.1.' },
    ],
  },
  {
    key: 'clinical-overview',
    name: 'Module 2.5 Clinical Overview — C2C-101',
    module: 'M2',
    role: 'in-review',
    sections: [
      { code: '2.5.1', title: 'Product Development Rationale', content: `<p>${MOLECULE} is a humanized IgG1 monoclonal antibody that selectively neutralises the p19 subunit of interleukin-23, the cytokine that sustains pathogenic Th17 cells in psoriatic plaques. Selective p19 inhibition has demonstrated high rates of skin clearance with a favourable safety profile in this indication. ${MOLECULE} is being developed to offer every-8-week maintenance dosing from a self-administered pre-filled syringe, supported by a terminal half-life of approximately 21 days observed in Phase 1. The initial indication is ${INDICATION.toLowerCase()}; psoriatic arthritis and Crohn's disease are under evaluation for later development.</p>` },
      { code: '2.5.2', title: 'Overview of Biopharmaceutics', content: `<p>${MOLECULE} is administered subcutaneously as a 100 mg/mL solution. Absolute bioavailability has not been determined in humans; in cynomolgus monkeys it was approximately 70 %. The Phase 2 material (2,000 L process) is analytically comparable to the Phase 1 material (500 L process) as summarised in Module 2.3; no clinical bridging study is considered necessary at this stage.</p>` },
      { code: '2.5.3', title: 'Overview of Clinical Pharmacology', content: `<p>Study C2C-101-101 (single and multiple ascending dose in 64 healthy volunteers) showed dose-proportional exposure from 30 mg to 300 mg, a median time to maximum concentration of 5 days, a mean terminal half-life of 21 days and low inter-subject variability (CV 28 % for AUC). Steady state was reached after the second dose. Serum IL-23-dependent IL-17A suppression was maximal at concentrations above 2 µg/mL, which the 100 mg and 200 mg every-8-week regimens are predicted to maintain at trough in more than 90 % of participants. Treatment-emergent anti-drug antibodies occurred in 4 of 48 active-treated subjects with no effect on exposure.</p>` },
      { code: '2.5.4', title: 'Overview of Efficacy', content: `<p>No efficacy data are available for ${MOLECULE} in patients. Study ${STUDY} (Phase 2, randomized, double-blind, placebo-controlled, 180 participants) is designed to establish proof of concept and to select the Phase 3 dose using PASI 75 at Week 16 as the primary endpoint, with sPGA 0/1, PASI 90, PASI 100 and DLQI as key secondary endpoints. The design, endpoints and analysis are consistent with the Agency's written responses at the pre-IND meeting.</p>` },
      { code: '2.5.5', title: 'Overview of Safety', content: `<p>In Study C2C-101-101, ${MOLECULE} was well tolerated up to 300 mg. There were no deaths, serious adverse events or discontinuations for adverse events. The most frequent treatment-emergent adverse events were injection-site erythema (12 %), headache (9 %) and nasopharyngitis (8 %); all were mild. No clinically significant laboratory, vital-sign or ECG findings were observed. The principal anticipated risk of the class is an increased susceptibility to infection; Study ${STUDY} therefore screens for tuberculosis and active infection, withholds dosing during clinically significant infection, and collects adverse events of special interest with targeted questionnaires under independent Data Monitoring Committee oversight.</p>` },
      { code: '2.5.6', title: 'Benefits and Risks Conclusions', content: `<p>The nonclinical and Phase 1 data identify no target organ toxicity and show predictable pharmacokinetics supporting the proposed regimens. Against the established benefit of selective IL-23 inhibition in moderate-to-severe plaque psoriasis, the risks of ${MOLECULE} are those of the class and are managed by the protocol's eligibility criteria, monitoring plan and stopping rules. The benefit–risk balance supports initiation of Study ${STUDY} under this IND.</p>` },
    ],
    comments: [],
  },
  {
    key: 'ib-summary',
    name: "IB Summary of Data and Guidance for the Investigator — C2C-101",
    module: 'M1',
    role: 'draft-open-comment',
    sections: [
      { code: '7.1', title: 'Summary of nonclinical data', content: `<p>${MOLECULE} binds human IL-23 p19 with picomolar affinity and neutralises IL-23 signalling without affecting IL-12. Repeat-dose toxicology in cynomolgus monkeys for up to 26 weeks at doses up to 100 mg/kg/week identified no adverse findings; the NOAEL was the highest dose tested and provides an exposure margin of approximately 45-fold over the highest proposed clinical dose. Tissue cross-reactivity was confined to lymphoid tissue. No genotoxicity, carcinogenicity or reproductive toxicity studies have been conducted, consistent with ICH S6(R1).</p>` },
      { code: '7.2', title: 'Summary of clinical data', content: `<p>Sixty-four healthy volunteers received ${MOLECULE} or placebo in Study C2C-101-101. Exposure was dose-proportional with a half-life of approximately 21 days. No serious adverse events occurred. Injection-site erythema, headache and nasopharyngitis were the most frequent adverse events and were mild. Treatment-emergent anti-drug antibodies were infrequent and non-neutralising.</p>` },
      { code: '7.3', title: 'Guidance for the investigator', content: `<p>Screen every participant for latent tuberculosis (interferon-gamma release assay) and for active infection before the first dose. Withhold dosing during any clinically significant infection and resume only after resolution. Report serious infections, opportunistic infections, hypersensitivity reactions, malignancies and major adverse cardiovascular events as adverse events of special interest within 24 hours. Do not administer live vaccines during the study or within 12 weeks after the last dose. Manage injection-site reactions symptomatically; no dose modification is required.</p>` },
      { code: '7.4', title: 'Reference safety information', content: `<p>No adverse reaction is currently listed as expected for ${MOLECULE}. All serious adverse reactions are therefore unexpected for the purposes of expedited reporting under 21 CFR 312.32 until this section is revised.</p>` },
    ],
    comments: [
      { sectionCode: '7.3', body: 'Medical monitor: add explicit guidance on hepatitis B and C screening — the protocol requires it but this section only mentions tuberculosis. Leave open until the medical writer confirms wording with Pharmacovigilance.', resolution: null },
    ],
  },
];

/** Protocol-development record for the Phase 2 study. */
export const PROTOCOL = {
  name: `Protocol ${STUDY} — Phase 2 dose-ranging study of ${MOLECULE} in plaque psoriasis`,
  synopsis: `A Phase 2, randomized, double-blind, placebo-controlled, dose-ranging study of ${MOLECULE} 100 mg and 200 mg subcutaneous versus placebo at Weeks 0 and 4 and every 8 weeks thereafter in approximately 180 adults with moderate-to-severe plaque psoriasis. Primary endpoint: PASI 75 at Week 16.`,
  sections: {
    synopsis: `A Phase 2, randomized, double-blind, placebo-controlled, dose-ranging study of ${MOLECULE} in adults with moderate-to-severe plaque psoriasis. 180 participants, three arms (100 mg, 200 mg, placebo), 16-week double-blind period followed by a 36-week open-label extension. Primary endpoint PASI 75 at Week 16.`,
    background: `Plaque psoriasis affects 2–3 % of adults. IL-23 is the upstream cytokine sustaining pathogenic Th17 cells in psoriatic plaques; selective p19 inhibition has an established mechanism in this indication. ${MOLECULE} is differentiated by a 21-day half-life supporting every-8-week maintenance dosing from a self-administered pre-filled syringe.`,
    objectives: `Primary: PASI 75 at Week 16 (each active arm vs placebo). Key secondary: sPGA 0/1, PASI 90, PASI 100 and DLQI change at Week 16. Safety, PK and immunogenicity throughout. The structured objectives table below is the controlled list.`,
    design: `Multicentre, randomized 1:1:1, double-blind, placebo-controlled, parallel-group. Stratified by body weight (≤ 90 kg / > 90 kg) and prior biologic exposure. Dosing at Weeks 0, 4 and 12 by site staff; primary endpoint at Week 16; optional 36-week open-label extension.`,
    population: `Adults 18–75 with chronic plaque psoriasis ≥ 6 months, PASI ≥ 12, BSA ≥ 10 %, sPGA ≥ 3, candidates for systemic therapy or phototherapy. See the structured inclusion and exclusion criteria.`,
    intervention: `${MOLECULE} 100 mg or 200 mg (100 mg/mL pre-filled syringe; two injections for the 200 mg arm) or matching placebo subcutaneously at Weeks 0, 4 and 12. Blinded presentation; unblinded pharmacist prepares kits; interactive response system assigns treatment.`,
    assessments: `See the schedule of assessments: PASI/sPGA/BSA at every visit, DLQI at Baseline, Week 8 and Week 16, PK and ADA pre-dose at Weeks 2, 4, 8, 12 and 16, safety laboratory at Screening and Weeks 4, 8, 12 and 16, ECG at Screening and Week 16.`,
    safety: `AEs from consent to last contact; SAEs to sponsor within 24 hours; AESIs (serious infection, opportunistic infection, hypersensitivity, malignancy, MACE) with targeted questionnaires. Independent DMC reviews after 60 and 120 participants complete Week 4. Dose withheld during clinically significant infection.`,
    statistics: `180 participants (60/arm) give > 90 % power for each active arm vs placebo assuming 65 % / 55 % / 8 % PASI 75 at alpha 0.025 two-sided. CMH test stratified by randomization factors, ITT with non-responder imputation; fixed-sequence multiplicity; MMRM for continuous endpoints. Full detail in SAP v1.0.`,
    ethics: `ICH E6(R3), Declaration of Helsinki, 21 CFR 50/56/312. IRB approval at every site before enrolment; written informed consent before any procedure; participants of child-bearing potential use highly effective contraception through 12 weeks after the last dose.`,
  },
  objectives: [
    { objectiveType: 'primary', objective: `Evaluate the efficacy of ${MOLECULE} 100 mg and 200 mg versus placebo in adults with moderate-to-severe plaque psoriasis`, endpoint: 'Proportion of participants achieving PASI 75', timepoint: 'Week 16' },
    { objectiveType: 'secondary', objective: 'Evaluate the effect on physician-assessed global severity', endpoint: 'Proportion achieving sPGA 0 or 1', timepoint: 'Week 16' },
    { objectiveType: 'secondary', objective: 'Evaluate higher levels of skin clearance', endpoint: 'Proportion achieving PASI 90 and PASI 100', timepoint: 'Week 16' },
    { objectiveType: 'secondary', objective: 'Evaluate the effect on health-related quality of life', endpoint: 'Change from baseline in DLQI', timepoint: 'Week 16' },
    { objectiveType: 'secondary', objective: `Characterise the safety and tolerability of ${MOLECULE}`, endpoint: 'TEAEs, AESIs, laboratory, vital signs, ECG, immunogenicity', timepoint: 'Through Week 16 and follow-up' },
    { objectiveType: 'exploratory', objective: 'Characterise the exposure–response relationship to inform Phase 3 dose selection', endpoint: 'Serum trough concentration versus PASI 75 response', timepoint: 'Weeks 2, 4, 8, 12, 16' },
  ],
  inclusion: [
    'Adult aged 18 to 75 years inclusive at the time of signing informed consent',
    'Diagnosis of chronic plaque psoriasis for at least 6 months before baseline',
    'PASI score of 12 or greater at screening and at baseline',
    'Body surface area involvement of 10 % or greater at screening and at baseline',
    'Static Physician Global Assessment score of 3 or greater at screening and at baseline',
    'Candidate for systemic therapy or phototherapy in the investigator\'s judgement',
    'Negative or adequately treated latent tuberculosis (interferon-gamma release assay) at screening',
    'Participants of child-bearing potential agree to use a highly effective method of contraception through 12 weeks after the last dose',
  ],
  exclusion: [
    'Non-plaque forms of psoriasis (guttate, erythrodermic, pustular) or drug-induced psoriasis',
    'Prior exposure to any IL-23 p19 or IL-17 pathway inhibitor',
    'Active tuberculosis, or latent tuberculosis not adequately treated before the first dose',
    'Clinically significant infection within 4 weeks before baseline, or history of recurrent serious infection',
    'Malignancy within 5 years, except adequately treated non-melanoma skin cancer or carcinoma in situ of the cervix',
    'Receipt of a live or live-attenuated vaccine within 12 weeks before baseline',
    'Use of biologic psoriasis therapy within 12 weeks (or 5 half-lives, whichever is longer) or of conventional systemic therapy or phototherapy within 4 weeks before baseline',
    'Pregnant or breastfeeding, or planning pregnancy during the study',
  ],
  visits: [
    { visitName: 'Screening', timepoint: 'Day −28 to Day −1', procedures: ['Informed consent', 'Eligibility review', 'IGRA', 'Safety laboratory', 'ECG', 'PASI/sPGA/BSA'] },
    { visitName: 'Baseline (Week 0)', timepoint: 'Day 1', procedures: ['Randomization', 'Dose 1', 'PASI/sPGA/BSA', 'DLQI', 'Pregnancy test'] },
    { visitName: 'Week 2', timepoint: 'Day 15 ± 2', procedures: ['PASI/sPGA/BSA', 'PK trough', 'AE review'] },
    { visitName: 'Week 4', timepoint: 'Day 29 ± 3', procedures: ['Dose 2', 'PASI/sPGA/BSA', 'PK trough', 'ADA', 'Safety laboratory'] },
    { visitName: 'Week 8', timepoint: 'Day 57 ± 3', procedures: ['PASI/sPGA/BSA', 'DLQI', 'PK trough', 'ADA', 'Safety laboratory'] },
    { visitName: 'Week 12', timepoint: 'Day 85 ± 3', procedures: ['Dose 3', 'PASI/sPGA/BSA', 'PK trough', 'ADA', 'Safety laboratory'] },
    { visitName: 'Week 16 (primary endpoint)', timepoint: 'Day 113 ± 3', procedures: ['PASI/sPGA/BSA', 'DLQI', 'PK trough', 'ADA', 'Safety laboratory', 'ECG'] },
    { visitName: 'End of Treatment', timepoint: 'Week 16 or early discontinuation', procedures: ['PASI/sPGA/BSA', 'Safety laboratory', 'Extension eligibility'] },
    { visitName: 'Safety Follow-up', timepoint: '8 weeks after last dose', procedures: ['AE review', 'Safety laboratory', 'ADA'] },
  ],
  assessments: [
    { name: 'Informed consent and eligibility', category: 'eligibility', visits: ['Screening'] },
    { name: 'PASI, sPGA and BSA (blinded assessor)', category: 'exam', visits: ['Screening', 'Baseline (Week 0)', 'Week 2', 'Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)', 'End of Treatment'] },
    { name: 'DLQI questionnaire', category: 'questionnaire', visits: ['Baseline (Week 0)', 'Week 8', 'Week 16 (primary endpoint)'] },
    { name: 'Study drug administration', category: 'procedure', visits: ['Baseline (Week 0)', 'Week 4', 'Week 12'] },
    { name: 'PK trough sample', category: 'pk', visits: ['Week 2', 'Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)'] },
    { name: 'Anti-drug antibody sample', category: 'lab', visits: ['Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)', 'Safety Follow-up'] },
    { name: 'Safety laboratory (haematology, chemistry, urinalysis)', category: 'lab', visits: ['Screening', 'Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)', 'End of Treatment', 'Safety Follow-up'] },
    { name: '12-lead ECG', category: 'procedure', visits: ['Screening', 'Week 16 (primary endpoint)'] },
    { name: 'Vital signs and weight', category: 'vital_signs', visits: ['Screening', 'Baseline (Week 0)', 'Week 2', 'Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)', 'End of Treatment', 'Safety Follow-up'] },
    { name: 'Adverse event review', category: 'other', visits: ['Baseline (Week 0)', 'Week 2', 'Week 4', 'Week 8', 'Week 12', 'Week 16 (primary endpoint)', 'End of Treatment', 'Safety Follow-up'] },
  ],
  risks: [
    { category: 'participant_safety', description: 'Serious or opportunistic infection secondary to IL-23 inhibition', likelihood: 'possible', impact: 'major', mitigation: 'IGRA and infection screening at entry; dose withheld during clinically significant infection; AESI questionnaire within 24 hours; DMC review at two milestones.', owner: 'Medical Monitor' },
    { category: 'participant_safety', description: 'Hypersensitivity or injection-site reaction to the antibody or excipients', likelihood: 'possible', impact: 'moderate', mitigation: 'Observation for 60 minutes after the first two doses; emergency equipment at site; hypersensitivity reported as an AESI.', owner: 'Principal Investigator' },
    { category: 'data_integrity', description: 'Unblinding of the efficacy assessor through knowledge of injection volume (200 mg requires two injections)', likelihood: 'likely', impact: 'major', mitigation: 'Separate blinded efficacy assessor who does not administer or observe dosing; placebo arm receives two injections; assessor role documented on the delegation log.', owner: 'Clinical Operations Lead' },
    { category: 'operational', description: 'Slow enrolment because of competing IL-23 and IL-17 trials in the same sites', likelihood: 'likely', impact: 'moderate', mitigation: 'Site selection weighted to sites without competing psoriasis studies; enrolment tracked weekly against a 9-month LPI target; contingency sites pre-qualified.', owner: 'Clinical Operations Lead' },
    { category: 'regulatory', description: 'Duration of clinical dosing exceeding the 26-week toxicology coverage if the extension is prolonged', likelihood: 'unlikely', impact: 'major', mitigation: 'Extension capped at 36 weeks (52 weeks total) pending the chronic toxicology amendment; IND amendment planned before any extension.', owner: 'Regulatory Affairs Lead' },
    { category: 'privacy', description: 'Re-identification risk from photographic PASI source documents', likelihood: 'unlikely', impact: 'moderate', mitigation: 'Photographs de-identified at site, stored in the validated imaging system with role-based access; no photographs transmitted by email.', owner: 'Data Manager' },
  ],
  milestones: [
    { name: 'IRB approval at first site', milestoneType: 'protocol_approval', targetDate: inDays(60) },
    { name: 'First participant in (FPI)', milestoneType: 'first_subject', targetDate: inDays(120) },
    { name: 'Last participant in (LPI)', milestoneType: 'last_subject', targetDate: inDays(390) },
    { name: 'Database lock (DBL) — Week 16', milestoneType: 'database_lock', targetDate: inDays(540) },
    { name: 'Clinical study report (CSR) — double-blind period', milestoneType: 'csr', targetDate: inDays(630) },
  ],
  team: [
    { memberName: 'Dr. Ana Reyes-Whitfield (fictional)', role: 'principal_investigator', responsibilities: 'Coordinating investigator; medical oversight of the protocol across sites.' },
    { memberName: 'Dr. Tobias Enwerem (fictional)', role: 'co_investigator', responsibilities: 'Blinded efficacy assessor training and PASI calibration.' },
    { memberName: 'Priya Natarajan, MSc (fictional)', role: 'biostatistician', responsibilities: 'Sample size, SAP, randomization specification and primary analysis.' },
    { memberName: 'Marcus Delacroix (fictional)', role: 'data_manager', responsibilities: 'eCRF design, data validation plan and database lock.' },
    { memberName: 'Helena Sørensen, PharmD (fictional)', role: 'pharmacist', responsibilities: 'Unblinded kit preparation and drug accountability.' },
    { memberName: 'Regulatory Affairs Lead (fictional)', role: 'regulatory', responsibilities: 'IND maintenance, protocol amendments and agency correspondence.' },
  ],
  amendment: {
    title: 'Amendment 1 — add Week 2 PK sampling and align stratification wording',
    amendmentNumber: '01',
    amendmentType: 'minor',
    rationale: 'Implements the pre-IND action item to add a Week 2 pharmacokinetic sample and aligns the prior-biologic stratification wording between the protocol and the IRT specification. No change to eligibility, dosing or the primary endpoint.',
    affectsConsent: false,
    affectsRisk: false,
    change: { sectionRef: '6. Schedule of Assessments', changeDescription: 'Add a pre-dose PK trough sample at Week 2.', previousText: 'PK and immunogenicity samples pre-dose at Weeks 4, 8, 12 and 16.', proposedText: 'PK samples pre-dose at Weeks 2, 4, 8, 12 and 16; immunogenicity samples at Weeks 4, 8, 12 and 16.' },
  },
};

/** QMS controlled documents. */
export const SOPS = [
  {
    key: 'sop-001', docNumber: 'C2C-SOP-001', name: 'SOP-001 Document Control', target: 'effective',
    body: {
      purpose: 'Defines how controlled quality-system documents are created, reviewed, approved, distributed, revised and retired so that only current, approved versions are in use.',
      scope: 'All SOPs, work instructions, forms, specifications and policies issued under the Concept2Cure Therapeutics quality management system, in every function that supports clinical development and regulatory submissions.',
      responsibilities: 'Document owner: drafts and maintains content. Quality Assurance: controls numbering, formatting, review routing and the master list. Approver: an independent qualified person who is not the author (two-person rule). All staff: use only the effective version.',
      procedure: '1. Request a document number from QA. 2. Draft using the current template. 3. Route for functional review; resolve every comment before approval. 4. Approve by electronic signature with meaning, reason and effective date; the approver must differ from the author. 5. Publish to the controlled register; train affected staff before the effective date. 6. Review at least every 2 years or on change; revise through a new major version; retire with a recorded reason.',
      references: '21 CFR Part 11; 21 CFR 312.57; ICH E6(R3) §5; ICH Q10 §3.',
    },
  },
  {
    key: 'sop-002', docNumber: 'C2C-SOP-002', name: 'SOP-002 Change Control', target: 'effective',
    body: {
      purpose: 'Establishes a controlled process to evaluate, approve, implement and verify changes to validated systems, processes, specifications, controlled documents and regulatory filings.',
      scope: 'Planned changes affecting product quality, data integrity, the validated state of computerised systems, or an open regulatory submission. Emergency changes follow the same record with retrospective approval within 5 working days.',
      responsibilities: 'Initiator: raises and describes the change. Impact assessors: Quality, Regulatory, Validation and the process owner. Change board: approves or rejects. QA: verifies implementation and effectiveness and closes the record.',
      procedure: '1. Raise a change request with description, justification and proposed classification. 2. Assess impact on product, process, validation state, documents and filings. 3. Classify minor/major/critical and assign a risk level. 4. Obtain approval before implementation; the approver must differ from the initiator. 5. Implement with linked document revisions, training and validation activities. 6. Verify implementation and effectiveness; close with a recorded outcome.',
      references: 'ICH Q10 §3.2.3; ICH Q9(R1); 21 CFR 314.70 (post-approval changes, for reference); GAMP 5 (2nd edition) Appendix M8.',
    },
  },
  {
    key: 'sop-003', docNumber: 'C2C-SOP-003', name: 'SOP-003 Deviation Management', target: 'in_review',
    body: {
      purpose: 'Defines how departures from approved procedures, protocols, specifications or GxP requirements are recorded, classified, investigated and corrected.',
      scope: 'All GCP, GLP and GMP-related deviations observed by Concept2Cure Therapeutics staff or vendors in the course of clinical development activities.',
      responsibilities: 'Observer: records the deviation within 1 working day. QA: classifies (minor/major/critical) and assigns an investigator. Investigator: root-cause analysis and CAPA proposal. Process owner: implements CAPA. QA: verifies effectiveness and closes.',
      procedure: '1. Record the deviation with date, description and immediate action. 2. Classify and assess impact on participant safety, data integrity and regulatory compliance. 3. Investigate with a structured root-cause method (5-whys or fishbone) within 30 days. 4. Define CAPA with owners and due dates. 5. Verify effectiveness and close; trend deviations quarterly for management review.',
      references: 'ICH E6(R3) §3.15; ICH Q10 §3.2.2; 21 CFR 312.56.',
    },
  },
  {
    key: 'sop-004', docNumber: 'C2C-SOP-004', name: 'SOP-004 Training', target: 'draft',
    body: {
      purpose: 'Ensures every person performing GxP-relevant work is trained on the effective procedures before performing the task and that training is documented and current.',
      scope: 'All employees, contractors and consultants performing tasks under the quality management system.',
      responsibilities: 'Line manager: defines the role-based curriculum. Trainee: completes training before performing the task. QA: maintains the training matrix and reports compliance.',
      procedure: '1. Assign a role-based curriculum on hire and on role change. 2. Train on each effective SOP before its effective date (read-and-understand, classroom or on-the-job as specified). 3. Record training with an electronic acknowledgement bound to the document version. 4. Re-train on every major revision. 5. Report training compliance monthly and at management review.',
      references: 'ICH E6(R3) §2.3; 21 CFR 312.53(c); ICH Q10 §2.2.',
    },
  },
];

export const CHANGE = {
  changeNumber: 'C2C-CC-001',
  title: 'Add Week 2 PK sampling to Protocol C2C-101-201 (Amendment 1)',
  description: 'Implement Protocol Amendment 1: add a pre-dose pharmacokinetic trough sample at Week 2 and align the stratification wording. Affects the protocol, the SAP sampling table, the laboratory manual and the eCRF.',
  changeType: 'document',
  classification: 'minor',
  riskLevel: 'low',
  reason: 'Pre-IND written response recommended additional PK time points to characterise the exposure–response relationship.',
  impactAssessment: 'No change to eligibility, dosing or the primary endpoint. Additional 4 mL blood draw at Week 2 within the total blood volume limit. Laboratory manual and eCRF require revision; no impact on the validated state of the EDC system beyond a configured form.',
  implementationPlan: 'Protocol Amendment 1 v1.1 → IRB submission → laboratory manual v1.1 → eCRF change (configuration only) → site training → effective on IRB approval at each site.',
};
