/**
 * Transplantation (Solid Organ and Hematopoietic Cell Transplantation) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/transplant
 */
import type { TherapeuticAreaProfile } from './types.js';

export const transplantProfile: TherapeuticAreaProfile = {
  "id": "transplant",
  "displayName": "Transplantation (Solid Organ and Hematopoietic Cell Transplantation)",
  "description": "Regulatory profile for immunosuppressive and transplant-supportive product development covering solid organ transplantation (kidney, liver, heart, lung) and hematopoietic cell transplantation (HCT), including induction and maintenance immunosuppression, treatment and prevention of acute cellular and antibody-mediated rejection, chronic allograft dysfunction, graft-versus-host disease prophylaxis and treatment, transplant-related infections (CMV, BK, EBV/PTLD), organ preservation and machine perfusion, and desensitization. FDA review is primarily in CDER's Division of Transplant and Ophthalmology Products (and OTAT/OTP for cell-based products); EMA guidance is set by CHMP's immunosuppression guideline. The area is characterized by small, heterogeneous populations, mandatory background immunosuppression, composite efficacy endpoints, registry-based long-term follow-up (SRTR/OPTN, CIBMTR, EBMT), and a benefit-risk calculus dominated by infection and malignancy.",
  "contextRules": [
    {
      "id": "tx-background-regimen",
      "scope": "section",
      "instruction": "Describe the complete background immunosuppression regimen with the same precision as the investigational product: induction agent and dose, calcineurin inhibitor with target trough ranges and the assay used, antimetabolite dose, corticosteroid taper schedule, and the protocol rules for dose modification. Explain how the investigational agent is positioned (add-on, substitution, or CNI-sparing/minimization), and demonstrate that the control arm regimen reflects contemporary standard of care in the regions where the trial was conducted. Any imbalance in background immunosuppression exposure between arms must be quantified and discussed as a confounder.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "background immunosuppression",
        "calcineurin inhibitor",
        "trough level",
        "induction therapy",
        "steroid taper",
        "CNI-sparing",
        "standard of care",
        "concomitant immunosuppression"
      ],
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "id": "tx-rejection-adjudication",
      "scope": "section",
      "instruction": "Define rejection endpoints on protocol biopsy and for-cause biopsy with central, blinded pathology adjudication using the current Banff classification (specify the Banff version and lesion score thresholds) for solid organ, or the MAGIC/NIH consensus criteria for acute and chronic GVHD. Report biopsy-proven acute rejection with severity grading, antibody-mediated rejection with the required donor-specific antibody and C4d/molecular criteria, and the proportion of clinically suspected but biopsy-negative events. Include protocol-biopsy completion rates and handle missing biopsies as pre-specified.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "biopsy-proven acute rejection",
        "Banff",
        "antibody-mediated rejection",
        "C4d",
        "donor-specific antibody",
        "protocol biopsy",
        "central pathology",
        "MAGIC criteria",
        "NIH consensus"
      ],
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "id": "tx-composite-endpoint",
      "scope": "section",
      "instruction": "Pre-specify the composite efficacy failure endpoint and analyze each component separately: for kidney transplantation the standard composite is biopsy-proven acute rejection, graft loss, death, and loss to follow-up at 12 months, with 24- and 36-month follow-up for durability. Report the composite, each component, and the number of subjects contributing each component, and demonstrate that the treatment effect is not driven solely by the loss-to-follow-up component. Provide eGFR (by a stated equation) at pre-specified timepoints and the slope analysis as a supportive measure of graft function.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "composite endpoint",
        "efficacy failure",
        "graft loss",
        "death-censored graft survival",
        "loss to follow-up",
        "eGFR slope",
        "MDRD",
        "CKD-EPI"
      ],
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "id": "tx-infection-malignancy-safety",
      "scope": "section",
      "instruction": "Present infection and malignancy as pre-specified safety topics of special interest with exposure-adjusted incidence rates and comparator context: CMV infection and disease (by viral load threshold and end-organ disease definitions, with prophylaxis versus pre-emptive strategy documented), BK viremia and nephropathy, EBV viremia and post-transplant lymphoproliferative disorder stratified by donor/recipient EBV serostatus, invasive fungal disease, serious bacterial infection, and all malignancies including non-melanoma skin cancer reported separately. Also address neutropenia/cytopenias, nephrotoxicity, new-onset diabetes after transplantation, and, for products acting on lymphocytes, immunogenicity and cytokine release.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "CMV",
        "BK virus",
        "PTLD",
        "EBV serostatus",
        "invasive fungal",
        "malignancy",
        "NODAT",
        "new-onset diabetes",
        "opportunistic infection",
        "exposure-adjusted"
      ],
      "guidanceRef": "FDA-2019-D-1141"
    },
    {
      "id": "tx-immunogenicity-biologics",
      "scope": "section",
      "instruction": "For biologic immunosuppressants and cell-based products, provide a tiered anti-drug antibody assessment (screening, confirmatory, titer, neutralizing) with validated assays, drug tolerance and target interference characterized, and the impact of ADA on PK, pharmacodynamics (e.g., receptor occupancy, lymphocyte subset depletion and repopulation), efficacy and safety. For depleting agents, report the depletion kinetics and reconstitution profile by lymphocyte subset, since reconstitution timing drives both rejection and infection risk.",
      "severity": "major",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "anti-drug antibody",
        "neutralizing antibody",
        "drug tolerance",
        "receptor occupancy",
        "lymphocyte depletion",
        "reconstitution",
        "immunophenotyping"
      ],
      "guidanceRef": "FDA-2019-D-1141"
    },
    {
      "id": "tx-pk-in-transplant",
      "scope": "section",
      "instruction": "Address transplant-specific PK: drug-drug interactions with calcineurin inhibitors, mTOR inhibitors, azole antifungals, and CMV antivirals (CYP3A4/5 and P-gp based), the effect of CYP3A5 genotype where relevant, the impact of graft function recovery and delayed graft function on clearance, dialysis and hepatic impairment, and therapeutic drug monitoring recommendations including the assay method and the target ranges proposed for labeling. For HCT, address the effects of mucositis, altered volume of distribution and conditioning regimen on exposure.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "drug-drug interaction",
        "CYP3A5",
        "therapeutic drug monitoring",
        "trough concentration",
        "delayed graft function",
        "azole interaction",
        "dialysis",
        "conditioning regimen"
      ],
      "guidanceRef": "FDA-2020-D-0093"
    },
    {
      "id": "tx-pediatric",
      "scope": "module",
      "instruction": "Address the pediatric transplant population explicitly: pediatric transplant recipients are a recognized subgroup with distinct PK (higher weight-normalized clearance), distinct rejection and PTLD risk (EBV-naive recipients), growth and neurodevelopmental considerations, and adherence issues in adolescence. Justify extrapolation of efficacy from adults where the disease process and exposure-response are similar, and describe age-appropriate formulations and the PSP/PIP commitments including long-term growth follow-up.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "pediatric transplant",
        "EBV-naive",
        "growth",
        "adherence",
        "extrapolation",
        "age-appropriate formulation",
        "PSP",
        "PIP"
      ],
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "id": "tx-long-term-followup",
      "scope": "section",
      "instruction": "Propose long-term follow-up appropriate to the modality: for small-molecule and biologic immunosuppressants, at least 3-5 years of graft and patient survival, malignancy and infection surveillance, ideally leveraging SRTR/OPTN or CIBMTR/EBMT registry linkage; for gene-modified or cell-based products, follow the 15-year long-term follow-up expectation with the specified assessment schedule. Describe the risk management approach for infection and malignancy, including any REMS or EU additional risk minimization measures.",
      "severity": "major",
      "appliesTo": "1.14",
      "triggerKeywords": [
        "long-term follow-up",
        "registry linkage",
        "SRTR",
        "OPTN",
        "CIBMTR",
        "EBMT",
        "15-year follow-up",
        "REMS",
        "risk minimization"
      ],
      "guidanceRef": "FDA-2018-D-2173"
    },
    {
      "id": "tx-donor-and-organ-factors",
      "scope": "always",
      "instruction": "Report and stratify by the donor and organ factors that dominate transplant outcomes: donor type (living versus deceased, donation after circulatory versus brain death), extended-criteria/kidney donor profile index, cold ischemia time, HLA mismatch, panel-reactive antibody and pre-existing donor-specific antibodies, delayed graft function, and for HCT the donor source (matched related, matched unrelated, haploidentical, cord), conditioning intensity and GVHD prophylaxis platform. Randomization stratification and pre-specified subgroup analyses must reflect these factors, and any imbalance must be quantified.",
      "severity": "critical",
      "triggerKeywords": [
        "cold ischemia time",
        "delayed graft function",
        "HLA mismatch",
        "panel reactive antibody",
        "donor-specific antibody",
        "KDPI",
        "haploidentical",
        "conditioning intensity",
        "GVHD prophylaxis"
      ]
    }
  ],
  "riskFactors": [
    "Small, heterogeneous populations with strong center effects, making randomized trials sensitive to imbalance in donor/recipient risk factors and to differences in local immunosuppression practice.",
    "Mandatory background immunosuppression that dilutes or confounds the investigational agent's effect, particularly in add-on designs, and creates dose-modification confounding when the background agent is titrated to trough.",
    "Composite endpoints driven disproportionately by loss to follow-up or by biopsy ascertainment differences between arms rather than by true rejection or graft loss.",
    "Infection and malignancy risk that scales with the degree of immunosuppression, so an efficacy gain in rejection can be offset by an unacceptable safety trade-off; PTLD in EBV-seronegative recipients has previously driven boxed warnings and restricted labeling.",
    "Trials that succeed on short-term rejection but fail to show, or are not designed to show, preservation of long-term graft function — regulators increasingly focus on eGFR slope and death-censored graft survival.",
    "For CNI-sparing or withdrawal strategies, late acute rejection and de novo donor-specific antibody development appearing after the primary endpoint window.",
    "GVHD programs with non-standardized response criteria across studies, unadjudicated organ staging, and failure to account for competing risks (relapse, non-relapse mortality) in the analysis.",
    "Cell and gene therapy transplant products with manufacturing comparability issues across sites, potency assays that do not reflect mechanism, and the added burden of long-term follow-up and replication-competent-vector testing.",
    "Reliance on registry or historical external controls without addressing selection bias, era effects, and differences in supportive care.",
    "Under-powered pediatric cohorts and pediatric commitments that cannot be met because of limited transplant volume.",
    "Drug-drug interactions with azole antifungals and CMV antivirals that are common in this population and can produce toxic or subtherapeutic exposures if not characterized and labeled."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.5",
      "patterns": [
        "background regimen not described",
        "trough levels not reported",
        "control arm not standard of care",
        "cni exposure imbalance",
        "induction not standardized",
        "steroid taper not specified"
      ],
      "description": "Background immunosuppression regimen incompletely described or not comparable between arms; the control regimen does not reflect contemporary standard of care, or CNI trough exposure differs materially between arms without discussion.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "no central pathology adjudication",
        "banff version not specified",
        "amr criteria incomplete",
        "dsa not measured",
        "c4d not reported",
        "protocol biopsy completion low",
        "biopsy-negative events not reported"
      ],
      "description": "Rejection endpoints not centrally adjudicated, Banff version unstated or mixed across the program, antibody-mediated rejection criteria incomplete (no DSA or C4d/molecular data), or protocol-biopsy completion too low to interpret the endpoint.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "components not analyzed separately",
        "loss to follow-up drives composite",
        "egfr slope not provided",
        "death-censored graft survival missing",
        "no 24-month data",
        "competing risk not addressed"
      ],
      "description": "Composite endpoint reported without component-level analysis, loss to follow-up driving the result, or graft function reported only as a single timepoint eGFR without slope or death-censored graft survival.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/EWP/263148/2008"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "infections not exposure-adjusted",
        "cmv definition not stated",
        "bk viremia not monitored",
        "ptld not stratified by serostatus",
        "malignancy pooled",
        "prophylaxis strategy not documented"
      ],
      "description": "Infection and malignancy analyses not pre-specified as topics of special interest, not exposure-adjusted, or not stratified by EBV/CMV serostatus and prophylaxis strategy; non-melanoma skin cancer pooled with other malignancies.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-2019-D-1141"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "neutralizing assay not developed",
        "drug tolerance not established",
        "ada impact not analyzed",
        "reconstitution kinetics missing",
        "receptor occupancy not measured"
      ],
      "description": "Immunogenicity package for biologics incomplete: no neutralizing antibody assay, drug tolerance not characterized, or ADA impact on PK/PD, efficacy and safety not analyzed; for depleting agents, no lymphocyte reconstitution data.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2019-D-1141"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "ddi with calcineurin inhibitor not studied",
        "azole interaction not evaluated",
        "delayed graft function pk not",
        "dialysis clearance unknown",
        "tdm target not justified",
        "cyp3a5 genotype not assessed"
      ],
      "description": "Transplant-relevant drug-drug interaction and special-population PK missing: interactions with CNIs, mTOR inhibitors, azoles or CMV antivirals not studied; delayed graft function, dialysis, or hepatic impairment not characterized; TDM targets not justified.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2020-D-0093"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "randomization not stratified",
        "baseline imbalance in donor type",
        "cold ischemia not reported",
        "pra not collected",
        "conditioning intensity not stratified",
        "center effect not addressed"
      ],
      "description": "Randomization not stratified by the dominant prognostic factors (donor type, cold ischemia time, HLA mismatch/PRA, delayed graft function, conditioning intensity, donor source), leading to baseline imbalance that undermines the primary comparison.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E9"
    },
    {
      "ctdSection": "1.14",
      "patterns": [
        "no long-term follow-up plan",
        "registry linkage not proposed",
        "15-year follow-up missing",
        "malignancy surveillance not planned",
        "rems not addressed"
      ],
      "description": "Long-term follow-up plan inadequate for the modality: no multi-year graft/patient survival commitment, no registry linkage, or, for gene-modified cell products, no 15-year long-term follow-up protocol.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2018-D-2173"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "gvhd response criteria non-standard",
        "nih consensus not applied",
        "magic grading not used",
        "competing risk not modeled",
        "relapse not reported",
        "non-relapse mortality missing"
      ],
      "description": "GVHD programs using non-standard or study-specific response criteria, failing to apply NIH consensus (chronic) or MAGIC/consensus grading (acute), or not accounting for competing risks of relapse and non-relapse mortality.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2016-D-0578"
    },
    {
      "ctdSection": "3.2.P.5",
      "patterns": [
        "potency assay not mechanism-based",
        "comparability across sites not shown",
        "cryopreservation stability missing",
        "thaw procedure not validated",
        "cell viability specification not justified"
      ],
      "description": "For cell-based transplant products, potency assay not linked to mechanism of action, comparability across manufacturing sites/scales not demonstrated, or shipping/thaw and administration controls not validated.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q5E"
    }
  ],
  "guidanceRefs": [
    {
      "code": "EMA/CHMP/EWP/263148/2008",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Immunosuppressants for Solid Organ Transplantation",
      "why": "The primary efficacy guideline for solid organ transplant programs — defines the composite efficacy failure endpoint, biopsy-proven acute rejection with Banff grading, graft function assessment, trial duration, comparator selection and the handling of background immunosuppression."
    },
    {
      "code": "FDA-2019-D-1141",
      "authority": "FDA",
      "title": "Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection (Guidance for Industry)",
      "why": "Defines the tiered ADA testing strategy, assay validation including drug tolerance, and the clinical correlation analyses required for biologic immunosuppressants and depleting antibodies used in transplantation."
    },
    {
      "code": "FDA-2018-D-2173",
      "authority": "FDA",
      "title": "Long Term Follow-Up After Administration of Human Gene Therapy Products (Guidance for Industry)",
      "why": "Sets the duration and content of long-term follow-up for gene-modified cellular products used in the transplant setting, including delayed adverse event and malignancy surveillance expectations."
    },
    {
      "code": "FDA-2020-D-0093",
      "authority": "FDA",
      "title": "Clinical Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions (Guidance for Industry)",
      "why": "Framework for the CYP3A4/5 and P-gp interaction studies that are unavoidable in transplant given concomitant calcineurin inhibitors, mTOR inhibitors, azole antifungals and CMV antivirals, and for the labeling of dose adjustments."
    },
    {
      "code": "FDA-2016-D-0578",
      "authority": "FDA",
      "title": "Considerations for the Development of Chimeric Antigen Receptor (CAR) T Cell Products and related CBER guidance on cellular therapy for hematologic malignancy and GVHD",
      "why": "Provides CBER's expectations for cellular products used in and after hematopoietic cell transplantation — manufacturing, potency, patient monitoring for cytokine release and neurotoxicity, and long-term follow-up."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials — Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Required framework for defining the estimand in transplant trials where intercurrent events (graft loss, death, immunosuppression changes, retransplant, loss to follow-up) are frequent and definitional."
    },
    {
      "code": "ICH E10",
      "authority": "ICH",
      "title": "Choice of Control Group and Related Issues in Clinical Trials",
      "why": "Governs the justification of active-control non-inferiority designs and the limited circumstances in which external or historical controls are acceptable in transplantation, where placebo control is generally unethical."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Supports pediatric extrapolation, dosing and formulation strategy, and the long-term growth and development follow-up commitments for pediatric transplant recipients."
    },
    {
      "code": "ICH E2E",
      "authority": "ICH",
      "title": "Pharmacovigilance Planning",
      "why": "Basis for the safety specification and pharmacovigilance plan addressing infection and malignancy risks that characterize chronic immunosuppression, including registry-based surveillance."
    },
    {
      "code": "ICH Q5E",
      "authority": "ICH",
      "title": "Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process",
      "why": "Applies to biologic and cell-based transplant products when manufacturing scale, site or process changes between clinical and commercial supply — a common cause of late-stage delay."
    }
  ],
  "reviewerExpectations": [
    "A precise, verifiable description of the entire immunosuppression context — induction, maintenance, target troughs, taper — with evidence that the control regimen is contemporary standard of care and that exposure was comparable between arms.",
    "Centrally adjudicated, Banff-graded biopsy-proven rejection with the Banff version stated, complete antibody-mediated rejection workup including donor-specific antibodies, and high protocol-biopsy completion rates.",
    "Component-level analysis of the composite endpoint, with explicit demonstration that the treatment effect is not an artifact of differential loss to follow-up or differential biopsy ascertainment.",
    "Graft function characterized beyond a single timepoint: eGFR by a stated equation at multiple timepoints, eGFR slope, and death-censored graft survival, with follow-up to at least 24-36 months for maintenance immunosuppressants.",
    "Infection and malignancy analyzed as pre-specified topics of special interest with exposure-adjusted rates, serostatus stratification (CMV D/R, EBV D/R), documented prophylaxis strategy, and separate reporting of PTLD and non-melanoma skin cancer.",
    "Explicit benefit-risk framing that weighs rejection reduction against the infection and malignancy burden, and states the net position for the specific organ and population.",
    "Complete transplant-relevant DDI characterization and a labeled therapeutic drug monitoring strategy where the product requires one, including the assay method.",
    "Randomization stratified by the dominant donor/recipient prognostic factors, with pre-specified subgroup analyses by those factors and an assessment of center effects.",
    "For GVHD programs, use of NIH consensus (chronic) and standardized acute grading with competing-risk analyses that report relapse and non-relapse mortality alongside the response endpoint.",
    "A concrete long-term follow-up and pharmacovigilance plan, including registry linkage where feasible, and, for gene-modified cell products, a 15-year follow-up protocol."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Widely applicable — most individual organ transplant indications, antibody-mediated rejection, desensitization of highly sensitized candidates, chronic lung allograft dysfunction, and steroid-refractory GVHD fall under the US 200,000-patient threshold.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Orphan designation supports smaller, more focused programs and may permit greater reliance on registry or natural-history comparators, but the sponsor must still pre-specify the population and endpoint and address confounding by background immunosuppression."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Relevant where preliminary clinical evidence shows substantial improvement over available therapy for a serious transplant condition — for example steroid-refractory acute GVHD, chronic antibody-mediated rejection, or desensitization enabling transplantation of highly sensitized candidates who otherwise have no option.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect intensive Agency engagement on endpoint definition and adjudication; because these populations are small, reviewers focus heavily on the adequacy of the control and the robustness of the response definition."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for products addressing serious transplant conditions with unmet need, including refractory rejection, transplant-associated thrombotic microangiopathy, and post-transplant viral infections lacking effective therapy.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Rolling submission is useful because long-term graft-survival follow-up accrues slowly; sponsors should agree in advance which follow-up data may arrive after the initial submission components."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Applicable where an intermediate endpoint reasonably likely to predict clinical benefit is available — for example overall response at a defined timepoint in steroid-refractory GVHD, or reduction in donor-specific antibody with histologic improvement in antibody-mediated rejection.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Requires a confirmatory trial designed and ideally underway at approval; the surrogate's link to graft or patient survival must be argued from published evidence, and the withdrawal procedures for accelerated approval now apply."
    },
    {
      "pathway": "rmat",
      "applicability": "Regenerative Medicine Advanced Therapy designation applies to cell-based and tissue-engineered transplant products — regulatory T-cell therapies for tolerance induction, mesenchymal stromal cells for GVHD, and engineered cellular grafts — intended to treat a serious condition with preliminary clinical evidence of potential to address unmet need.",
      "impactedSections": [
        "2.5",
        "3.2.P.5",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "RMAT brings early and frequent interaction including on manufacturing; potency assay development and comparability across manufacturing changes are typically the critical path, and long-term follow-up obligations apply."
    },
    {
      "pathway": "priority_review",
      "applicability": "Granted where the product would significantly improve safety or effectiveness in a serious transplant condition; commonly paired with orphan designation in this area.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "The shortened clock puts pressure on the completeness of the long-term safety dataset; sponsors should have the infection/malignancy integrated analyses and the pharmacovigilance plan finalized at submission."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand per ICH E9(R1) with explicit intercurrent-event strategies for the events that dominate transplant trials: graft loss, death, retransplantation, treatment discontinuation, protocol-mandated immunosuppression changes, and loss to follow-up — the composite (while-alive-with-functioning-graft) and treatment-policy strategies give materially different answers and must be chosen prospectively.",
    "Justify non-inferiority margins for active-controlled trials using the historical effect of the control regimen; because placebo-controlled data are largely unavailable and historical rejection rates have fallen substantially over time, the constancy assumption is weak and margins must be conservative and pre-agreed (commonly 10 percentage points on the 12-month composite in kidney transplantation).",
    "Analyze the composite endpoint and each component with pre-specified rules, and pre-specify sensitivity analyses in which subjects lost to follow-up are handled alternatively (excluded, imputed as failures, imputed as successes) to show the conclusion is not an artifact of ascertainment.",
    "Use competing-risk methods (cause-specific hazards and subdistribution/Fine-Gray) for endpoints where death, relapse or graft loss preclude the event of interest — this is mandatory for GVHD (relapse and non-relapse mortality) and for death-censored graft survival interpretation.",
    "Model eGFR longitudinally with a mixed-effects model that separates acute post-transplant recovery from the chronic slope, pre-specify the equation (CKD-EPI or MDRD) and the handling of dialysis/graft-loss values (typically eGFR set to zero or the subject censored, stated in advance), and treat slope as a supportive rather than confirmatory endpoint unless prospectively agreed.",
    "Stratify randomization by center and by the dominant prognostic factors (donor type, cold ischemia time, HLA mismatch/PRA, delayed graft function, conditioning intensity, donor source) and pre-specify whether the primary analysis is stratified accordingly; assess center effects but avoid post hoc center exclusion.",
    "Control multiplicity across the composite, its components, graft function, and any key safety claims with a pre-specified hierarchical testing sequence; treat subgroup analyses by organ, serostatus and sensitization as descriptive with confidence intervals.",
    "Pre-specify interim analyses with alpha spending and an independent data monitoring committee empowered to stop for safety — infection and malignancy imbalances in immunosuppression trials are the classic reason for early termination, and stopping rules should be defined for these specifically.",
    "When external or registry controls are unavoidable (rare indications, desensitization), pre-specify the data source, the eligibility mapping, the covariates for propensity or matching adjustment, era restrictions, and quantitative bias analysis for unmeasured confounding, per ICH E10 principles."
  ],
  "endpointConsiderations": [
    "Kidney transplantation composite efficacy failure at 12 months (biopsy-proven acute rejection, graft loss, death, loss to follow-up) is the established primary endpoint; caveat is that the loss-to-follow-up component can drive the result and that falling contemporary rejection rates shrink the detectable effect and complicate NI margin justification.",
    "Biopsy-proven acute rejection with Banff grading, requiring central blinded pathology; caveat is that protocol-biopsy versus for-cause-biopsy strategies produce very different event rates, and subclinical rejection detected on protocol biopsy has uncertain regulatory standing as a standalone endpoint.",
    "Antibody-mediated rejection defined by histologic evidence, microvascular inflammation, C4d and/or validated molecular signature, plus circulating donor-specific antibody; caveat is that criteria have changed across Banff iterations, so the version and the DSA assay (single-antigen bead MFI thresholds) must be fixed prospectively.",
    "Death-censored graft survival and patient survival are the clinically definitive endpoints; caveat is that event rates are low within a 1-3 year trial, making them impractical as primary endpoints without very large samples or registry follow-up.",
    "eGFR at 12/24/36 months and eGFR slope as a measure of graft function preservation; caveat is dependence on the estimating equation, the handling of graft-loss values, and the confounding effect of calcineurin-inhibitor nephrotoxicity in the control arm.",
    "De novo donor-specific antibody development as an intermediate marker of immunologic risk; caveat is that it is not accepted as a standalone approval endpoint and its assay thresholds are not standardized across laboratories.",
    "Acute GVHD: overall response rate (complete plus partial response) at day 28 with response maintained at day 56, using standardized organ staging and grading; caveat is that response is reversible, must be assessed alongside steroid dose, and requires competing-risk analysis with relapse and non-relapse mortality.",
    "Chronic GVHD: NIH consensus response criteria and failure-free survival (absence of relapse, non-relapse mortality and addition of new systemic therapy); caveat is that organ scoring is subjective and patient-reported outcome instruments (Lee symptom scale) should accompany clinician-assessed response.",
    "Post-transplant CMV: CMV disease and clinically significant CMV infection (viremia triggering pre-emptive treatment) at a defined week; caveat is dependence on the viral load assay calibrated to the WHO international standard and the local threshold for pre-emptive therapy, which must be protocol-fixed.",
    "For organ preservation and machine perfusion products, delayed graft function (dialysis requirement in the first week) and primary graft dysfunction are the standard endpoints; caveat is heavy dependence on local dialysis practice, which should be protocol-defined and centrally reviewed."
  ],
  "retrievalKeywords": [
    "solid organ transplantation",
    "kidney transplant",
    "liver transplant",
    "heart transplant",
    "lung transplant",
    "hematopoietic cell transplantation",
    "immunosuppression",
    "calcineurin inhibitor",
    "tacrolimus trough",
    "mycophenolate",
    "mtor inhibitor",
    "induction therapy",
    "biopsy-proven acute rejection",
    "banff classification",
    "antibody-mediated rejection",
    "c4d",
    "donor-specific antibody",
    "panel reactive antibody",
    "desensitization",
    "delayed graft function",
    "cold ischemia time",
    "death-censored graft survival",
    "egfr slope",
    "composite efficacy failure",
    "graft-versus-host disease",
    "nih consensus criteria",
    "magic grading",
    "steroid-refractory gvhd",
    "failure-free survival",
    "non-relapse mortality",
    "competing risk",
    "cmv viremia",
    "bk nephropathy",
    "ebv ptld",
    "post-transplant lymphoproliferative disorder",
    "new-onset diabetes after transplantation",
    "machine perfusion",
    "primary graft dysfunction",
    "chronic lung allograft dysfunction",
    "regulatory t cell therapy",
    "mesenchymal stromal cell",
    "srtr optn",
    "cibmtr",
    "long-term follow-up"
  ]
};

export default transplantProfile;
