/**
 * Gene & Cell Therapy (CGT / ATMP) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/gene-cell-therapy
 */
import type { TherapeuticAreaProfile } from './types.js';

export const geneCellTherapyProfile: TherapeuticAreaProfile = {
  "id": "gene-cell-therapy",
  "displayName": "Gene & Cell Therapy (CGT / ATMP)",
  "description": "Regulatory authoring profile for in vivo gene therapies (AAV, lentiviral, adenoviral, oncolytic virus, mRNA/LNP-delivered editors), ex vivo genetically modified cell therapies (CAR-T, TCR-T, HSPC gene therapy, genome-edited cells), and unmodified/minimally manipulated cell therapies. Reviewed in the US by CBER Office of Therapeutic Products (OTP) and in the EU by CAT/CHMP under Regulation (EC) No 1394/2007. The dominant review risk in this area is CMC — potency, comparability, and adventitious-agent/vector safety — followed by long-term safety surveillance (insertional oncogenesis, delayed adverse events) and the evidentiary limits of small single-arm trials in rare, often pediatric, populations. Profile drives drafting of Modules 2, 3, 4 and 5 with CGT-specific expectations, and flags the deficiencies most frequently cited in FDA clinical holds, Refuse-to-File actions, CRLs, and EMA Major Objections for ATMPs.",
  "contextRules": [
    {
      "id": "gct-always-product-definition",
      "scope": "always",
      "instruction": "Define the product with full CGT precision on first mention in every module and use that definition verbatim thereafter: vector or cell platform (e.g., recombinant AAV serotype/capsid variant, self-inactivating third-generation lentiviral vector, autologous CD3+ T cells transduced to express a second-generation CD19 CAR with 4-1BB costimulation), transgene/edit and regulatory elements (promoter, polyA, WPRE, codon optimization), route and target tissue, and dose expressed in the platform-appropriate unit (vg/kg or vg/eye for AAV; CAR+ viable T cells/kg with a per-patient cap for CAR-T; CD34+ cells/kg with VCN for HSPC products). Never write 'the gene therapy' or 'the cells' without the qualified descriptor, and never express an AAV dose only in mg or mL.",
      "severity": "major",
      "appliesTo": "all",
      "triggerKeywords": [
        "aav",
        "lentiviral",
        "car-t",
        "transgene",
        "vector genome",
        "dose",
        "vg/kg",
        "cd34+"
      ],
      "guidanceRef": "FDA-GT-CMC-IND-2020"
    },
    {
      "id": "gct-potency-mechanistic-link",
      "scope": "section",
      "instruction": "Present the potency strategy as a potency assurance program, not a single release test: state the proposed mechanism of action, map each MOA step to a measured quality attribute, and justify the release potency assay(s) as quantitative, biologically relevant, and stability-indicating. For AAV/lentiviral products give both a transduction/expression measure and a functional activity measure of the expressed protein; for CAR-T give antigen-specific functional potency (e.g., cytolysis or cytokine release against antigen-positive and antigen-negative targets), not transduction efficiency or CAR-surface expression alone. Include the acceptance-criterion justification tied to clinical lots, the assay qualification/validation status by phase, and the plan and timeline to replace any surrogate or matrix approach before BLA. Explicitly cross-reference the potency matrix in 3.2.P.5.3 and the comparability strategy in 3.2.P.2.",
      "severity": "critical",
      "appliesTo": "3.2.P.5.1",
      "triggerKeywords": [
        "potency",
        "bioassay",
        "mechanism of action",
        "release specification",
        "matrix approach"
      ],
      "guidanceRef": "FDA-CGT-POTENCY-2023"
    },
    {
      "id": "gct-comparability-bridging",
      "scope": "section",
      "instruction": "For every manufacturing change between the clinical lots that generated pivotal data and the intended commercial process (scale, site, vector lot, suspension vs adherent, serum-free conversion, closed-system fill, cryopreservation, analytical method change), provide a pre-specified comparability protocol with statistically justified acceptance criteria on the full CQA panel, side-by-side data on the same analytical methods, and a written risk assessment of residual uncertainty. State explicitly whether clinical bridging data are needed and, if claimed unnecessary, justify with orthogonal analytical evidence. Do not assert comparability on release-testing agreement alone; extended characterization (capsid content, potency, product-related impurities, cell phenotype/function) is expected.",
      "severity": "critical",
      "appliesTo": "3.2.P.2",
      "triggerKeywords": [
        "comparability",
        "process change",
        "scale-up",
        "site transfer",
        "bridging",
        "commercial process"
      ],
      "guidanceRef": "FDA-CGT-COMPARABILITY-2023"
    },
    {
      "id": "gct-adventitious-and-vector-safety",
      "scope": "section",
      "instruction": "Document the full adventitious-agent control strategy across the raw material, cell bank, vector bank, and drug product levels: cell substrate and viral bank qualification (ICH Q5A(R2)/Q5D), donor eligibility for human-derived starting materials, sterility and mycoplasma per 21 CFR 610, endotoxin, and — for retroviral/lentiviral products — replication-competent retrovirus/lentivirus (RCR/RCL) testing on vector supernatant, ex vivo transduced cells, and patients per FDA's RCR guidance. For AAV, address replication-competent AAV and helper virus. State the assay, sensitivity (e.g., stated LOD in infectious units), the amount of material tested, and the disposition rule for a positive result.",
      "severity": "critical",
      "appliesTo": "3.2.A.2",
      "triggerKeywords": [
        "rcr",
        "rcl",
        "replication competent",
        "adventitious",
        "mycoplasma",
        "sterility",
        "cell bank",
        "donor eligibility"
      ],
      "guidanceRef": "FDA-RCR-RCL-2020"
    },
    {
      "id": "gct-nonclinical-biodistribution",
      "scope": "section",
      "instruction": "Summarize biodistribution and persistence as an integrated dataset aligned to ICH S12: matrices sampled (target tissue, liver, spleen, gonads, blood, injection site, and for CNS routes the CSF/brain regions), assay (qPCR/ddPCR for vector DNA plus transgene mRNA/protein where feasible), validated LLOQ, time points spanning peak through clearance, and interpretation of persistence in gonadal tissue with respect to germline transmission risk. Use a pharmacologically relevant species/model and justify it; where no relevant species exists, present the surrogate-product or disease-model strategy and its limitations. Integrate genotoxicity/insertional-oncogenesis assessment for integrating vectors and off-target/on-target-unintended editing assessment for genome-edited products rather than citing standard ICH S2 battery compliance.",
      "severity": "critical",
      "appliesTo": "2.6.6",
      "triggerKeywords": [
        "biodistribution",
        "germline",
        "persistence",
        "qpcr",
        "insertional oncogenesis",
        "off-target",
        "tumorigenicity"
      ],
      "guidanceRef": "ICH-S12"
    },
    {
      "id": "gct-shedding",
      "scope": "section",
      "instruction": "For any virus-based or bacteria-based product (AAV, adenoviral, oncolytic, lentiviral, HSV), include a dedicated shedding section: matrices (blood, urine, saliva/nasal, stool, semen where relevant), sampling schedule until two consecutive negative results, assay distinguishing vector genome detection from infectious/replication-competent virus, and the resulting third-party transmission risk assessment with concrete patient/caregiver precautions that must be reflected in the protocol, the Investigator's Brochure, and labeling. For the EU, cross-reference the GMO environmental risk assessment dossier.",
      "severity": "major",
      "appliesTo": "5.3.3.1",
      "triggerKeywords": [
        "shedding",
        "biosafety",
        "environmental risk",
        "gmo",
        "third party transmission",
        "excretion"
      ],
      "guidanceRef": "FDA-GT-SHEDDING-2015"
    },
    {
      "id": "gct-ltfu-protocol",
      "scope": "section",
      "instruction": "Include a standalone long-term follow-up (LTFU) protocol and describe it in the clinical overview. Default durations: up to 15 years for integrating vectors (retroviral/lentiviral), genome-edited products, and products with evidence of persistence or transformation risk; up to 5 years for AAV and other non-integrating vectors with limited persistence. Specify the delayed adverse events monitored (malignancy, new or worsening autoimmune/hematologic/neurologic disorders, infections related to immune modulation, transgene-related immune responses), the monitoring schedule (typically protocol-based visits for the first 5 years then annual query-based contact), assays retained (VCN, integration-site analysis, replication-competent virus, transgene expression), retention/re-consent strategy, and how the sponsor will capture events in patients who withdraw or transition to registries. State how the LTFU obligation flows into the postmarketing commitment/requirement table and the EU RMP.",
      "severity": "critical",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "long term follow-up",
        "ltfu",
        "15 years",
        "delayed adverse events",
        "registry",
        "integration site"
      ],
      "guidanceRef": "FDA-GT-LTFU-2020"
    },
    {
      "id": "gct-immunogenicity-and-eligibility",
      "scope": "section",
      "instruction": "Address product immunogenicity as a two-sided issue: (a) pre-existing anti-capsid/anti-vector neutralizing antibodies as an eligibility criterion — describe the validated NAb (and total binding antibody) assay, the cut-point derivation, the titer threshold used to exclude patients, the assay used for screening at sites, and the generalizability consequence for the labeled population; and (b) treatment-emergent humoral and cellular responses to capsid, transgene product, and (for CAR/TCR constructs) the receptor itself, with correlation to loss of expression, hepatotoxicity, complement activation/TMA, or loss of persistence. State the redosing position explicitly.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "neutralizing antibody",
        "pre-existing immunity",
        "anti-capsid",
        "immunogenicity",
        "redosing",
        "complement"
      ],
      "guidanceRef": "EMA-GTMP-2018"
    },
    {
      "id": "gct-cart-specific-safety",
      "scope": "section",
      "instruction": "For genetically modified T-cell products, present CRS and ICANS/neurotoxicity using a single stated grading system (ASTCT consensus preferred; if the trial used Lee/CTCAE, provide a mapped re-analysis), with onset, duration, time to resolution, and management (tocilizumab/steroid exposure, ICU/vasopressor use). Separately tabulate prolonged cytopenias, hypogammaglobulinemia and infection, HLH/MAS, secondary malignancies including T-cell malignancies with the investigation performed (clonality, vector-integration analysis), and graft-versus-host disease for allogeneic products. Do not fold these into generic SOC tables.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "crs",
        "cytokine release",
        "icans",
        "neurotoxicity",
        "hlh",
        "secondary malignancy",
        "gvhd",
        "astct"
      ],
      "guidanceRef": "FDA-CART-2024"
    },
    {
      "id": "gct-single-arm-evidence",
      "scope": "section",
      "instruction": "When efficacy rests on single-arm or externally controlled data, build the benefit-risk argument explicitly: state why randomization was infeasible or unethical, characterize the natural history data source (prospective natural history study, registry, run-in period) with its provenance, contemporaneity, and endpoint ascertainment comparability, define the estimand (ICH E9(R1)) including the intercurrent-event strategy for retreatment, rescue therapy, transplant, or death, and quantify sensitivity to unmeasured confounding. State the durability question directly — how long the observed effect has been maintained and what evidence supports persistence beyond the observation window.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "single-arm",
        "external control",
        "natural history",
        "estimand",
        "durability",
        "historical control"
      ],
      "guidanceRef": "FDA-ECT-2023"
    },
    {
      "id": "gct-chain-of-identity",
      "scope": "section",
      "instruction": "For autologous and donor-matched products, describe chain of identity and chain of custody end-to-end: apheresis/collection site qualification, unique identifier linkage from collection through infusion, labeling controls, shipping and cryogenic transport validation with excursion handling, and the documented process for out-of-specification product — who authorizes single-patient release, under what criteria, and how it is reported. Provide the incoming starting-material acceptance criteria and how donor/patient variability (lymphocyte count, prior lymphodepleting or bridging therapy) is controlled.",
      "severity": "major",
      "appliesTo": "3.2.P.3.5",
      "triggerKeywords": [
        "chain of identity",
        "chain of custody",
        "apheresis",
        "out of specification",
        "autologous",
        "cryopreservation",
        "shipping"
      ],
      "guidanceRef": "EMA-ATMP-GMP-PARTIV"
    },
    {
      "id": "gct-module5-dose-escalation",
      "scope": "module",
      "instruction": "Describe first-in-human design features that FDA expects for CGT: staggered enrollment with a defined inter-patient observation interval, a pre-specified DLT window appropriate to the product's kinetics (often 28 days for cell therapies, longer for AAV where hepatotoxicity and complement events are delayed), independent DSMB charter with stopping rules, and the rationale for starting dose derived from the pharmacologically active dose in the relevant model rather than a NOAEL/HED conversion alone. If multiple product versions or constructs were studied in one early-phase trial, justify the design and the comparative interpretability of the arms.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "first in human",
        "staggered",
        "dlt",
        "starting dose",
        "dsmb",
        "dose escalation",
        "multiple versions"
      ],
      "guidanceRef": "FDA-CGT-PRECLIN-2013"
    },
    {
      "id": "gct-pediatric-and-rare",
      "scope": "section",
      "instruction": "Where the population is pediatric and/or ultra-rare, justify the age range and dosing approach (growth-related redosing limitations for non-integrating vectors, timing relative to irreversible disease progression), the assent/consent framework, and the acceptability of the sample size with respect to precision rather than power alone. Provide the pre-specified plan for handling patients treated under expanded access or compassionate use and state whether those data are included in efficacy or safety analyses.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "pediatric",
        "rare disease",
        "ultra-rare",
        "expanded access",
        "natural history",
        "assent"
      ],
      "guidanceRef": "FDA-GT-RARE-2020"
    },
    {
      "id": "gct-device-and-delivery",
      "scope": "section",
      "instruction": "If administration requires a specific delivery device or procedure (subretinal cannula, intracerebral/intrathecal catheter, intramyocardial injection system, closed-system infusion set), describe device compatibility and extractables/leachables, whether the combination is regulated as a combination product or RMAT-associated device, human factors and procedural training, and how procedure-related adverse events are separated from product-related events in the safety analysis.",
      "severity": "major",
      "appliesTo": "3.2.R",
      "triggerKeywords": [
        "delivery device",
        "catheter",
        "subretinal",
        "intrathecal",
        "combination product",
        "extractables"
      ],
      "guidanceRef": "FDA-RMAT-2019"
    }
  ],
  "riskFactors": [
    "Potency assay immaturity: a release potency test that measures transduction or expression but not biological function, or a matrix approach never converted to a validated quantitative assay, is the single most common cause of BLA delay and Complete Response Letters in this area.",
    "Late-stage manufacturing changes: nearly every CGT program changes process scale, site, or vector supplier between pivotal trial and licensure; without a pre-specified comparability protocol this becomes a Major Objection or a request for additional clinical bridging data.",
    "Insertional oncogenesis and secondary malignancy: integrating vectors carry a documented clonal-expansion risk, and FDA's 2024 class-level investigation of T-cell malignancies after BCMA- and CD19-directed CAR-T means every program must have integration-site and clonality surveillance built in.",
    "Delayed and irreversible toxicity: AAV programs face dose-dependent hepatotoxicity, complement activation with thrombotic microangiopathy, DRG toxicity for CNS routes, and fatalities at high systemic doses — a single event can trigger a clinical hold across an entire platform.",
    "Pre-existing immunity narrowing the population: NAb-based exclusion can remove 30-60% of candidates for common AAV serotypes, creating a mismatch between the studied population and the intended label, and a redosing prohibition that limits durability management.",
    "Small, heterogeneous, single-arm datasets: limited N, open-label assessment, and external controls make effect-size estimation fragile and expose the program to reviewer challenge on endpoint objectivity and confounding.",
    "Durability uncertainty: transgene expression can wane (episomal AAV in dividing tissues, loss of CAR-T persistence, declining VCN), and with redosing often unavailable the label claim must be supported by the actual observed follow-up duration.",
    "Starting-material and donor variability for autologous products: prior lines of therapy, lymphopenia, and apheresis quality drive manufacturing failure rates and out-of-specification lots that must be disclosed and reconciled with ITT efficacy analyses.",
    "Supply-chain and GMP inspection readiness: CGT facilities are frequently cited at pre-license inspection for aseptic process controls, environmental monitoring, and data integrity in a manual, open-process environment; an inspection finding blocks approval regardless of clinical data.",
    "Regulatory fragmentation across regions: GMO/environmental risk assessment and hospital-exemption interplay in the EU, the ATMP classification procedure, and differing LTFU expectations mean a US-optimized dossier is rarely EU-ready without additional modules."
  ],
  "commonGaps": [
    {
      "ctdSection": "3.2.P.5.1",
      "patterns": [
        "potency assay not",
        "potency not linked",
        "no functional potency",
        "surrogate potency",
        "matrix approach not justified",
        "potency acceptance criteria not justified",
        "transduction efficiency as potency"
      ],
      "description": "Release potency test does not measure a biologically relevant function tied to the proposed mechanism of action, is not quantitative or stability-indicating, or acceptance criteria are set from a handful of lots without statistical justification. FDA/OTP treats this as an approvability issue, not a post-approval commitment.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-CGT-POTENCY-2023"
    },
    {
      "ctdSection": "3.2.P.2",
      "patterns": [
        "comparability not demonstrated",
        "no comparability protocol",
        "process change after pivotal",
        "acceptance criteria not prespecified",
        "analytical comparability only",
        "no bridging data"
      ],
      "description": "Manufacturing changes between clinical and commercial material are described narratively without a pre-specified comparability protocol, orthogonal extended characterization, or an assessment of whether clinical bridging is required.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-CGT-COMPARABILITY-2023"
    },
    {
      "ctdSection": "3.2.P.5.3",
      "patterns": [
        "empty capsid",
        "full to empty ratio not",
        "residual plasmid dna",
        "residual host cell dna",
        "product-related impurities not characterized",
        "infectious to genome titer",
        "vector aggregation"
      ],
      "description": "Incomplete characterization and control of product-related impurities: empty/partial capsid content, encapsidated residual DNA (plasmid, host-cell, helper), infectious-to-vector-genome-titer ratio, and aggregates lack validated methods and justified limits.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-GT-CMC-IND-2020"
    },
    {
      "ctdSection": "3.2.A.2",
      "patterns": [
        "rcl testing not",
        "rcr testing",
        "replication competent not tested",
        "assay sensitivity not stated",
        "insufficient material tested",
        "helper virus"
      ],
      "description": "Replication-competent retrovirus/lentivirus (or replication-competent AAV / residual helper virus) testing is missing at one or more required stages, or the assay limit of detection and the quantity of material tested are not stated.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-RCR-RCL-2020"
    },
    {
      "ctdSection": "2.6.6",
      "patterns": [
        "biodistribution not",
        "gonadal tissue not sampled",
        "germline transmission not addressed",
        "persistence not characterized",
        "off-target editing not",
        "integration site analysis not"
      ],
      "description": "Nonclinical biodistribution/persistence package omits gonadal sampling and the germline-transmission assessment, uses an unvalidated qPCR method, or — for genome editing products — lacks an unbiased off-target nomination method plus targeted confirmation in the clinically relevant cell type.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-S12"
    },
    {
      "ctdSection": "5.3.3.1",
      "patterns": [
        "shedding not evaluated",
        "no shedding data",
        "shedding sampling incomplete",
        "transmission risk not assessed",
        "infectivity not distinguished"
      ],
      "description": "Shedding assessment is absent or limited to one matrix/one timepoint, does not continue to negativity, or reports vector genome detection without addressing infectivity and third-party transmission precautions.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-GT-SHEDDING-2015"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "ltfu duration insufficient",
        "no long term follow-up protocol",
        "follow-up less than 15 years",
        "delayed adverse events not monitored",
        "no retention plan",
        "withdrawn patients not followed"
      ],
      "description": "Long-term follow-up plan is shorter than the risk profile warrants, lacks a standalone protocol, does not specify delayed adverse events and the assays retained, or has no strategy for patients who withdraw from the parent study.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-GT-LTFU-2020"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "nab assay not validated",
        "cut-point not justified",
        "pre-existing antibody threshold",
        "immunogenicity not characterized",
        "anti-transgene response not"
      ],
      "description": "The neutralizing-antibody eligibility assay used to screen patients is not validated or is different from the assay proposed for commercial use, the exclusion titer is unjustified, or treatment-emergent anti-capsid/anti-transgene responses are not correlated with efficacy loss or hepatotoxicity.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA-GTMP-2018"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "crs grading inconsistent",
        "icans not graded",
        "mixed grading scales",
        "secondary malignancy not investigated",
        "prolonged cytopenia not tabulated",
        "no clonality analysis"
      ],
      "description": "Safety summary mixes Lee/CTCAE/ASTCT grading across studies, buries CRS/ICANS in generic system-organ-class tables, or reports secondary malignancies without the clonality and vector-integration investigation FDA now expects for integrating cell therapies.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-CART-2024"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "external control not justified",
        "natural history comparability",
        "estimand not defined",
        "durability not supported",
        "single-arm without justification",
        "confounding not addressed"
      ],
      "description": "Benefit-risk narrative asserts efficacy from a single-arm study without defining the estimand, justifying the external control's comparability, or bounding the durability claim to the actual observed follow-up.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-ECT-2023"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "manufacturing failures excluded",
        "itt population not defined",
        "out of specification infusions",
        "patients not infused",
        "enrolled versus treated discrepancy"
      ],
      "description": "Efficacy analyses are presented only in the infused population, with enrolled-but-never-infused patients (manufacturing failure, disease progression, death during bridging) omitted rather than reported in an intent-to-treat analysis with attrition accounting.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-CART-2024"
    },
    {
      "ctdSection": "3.2.P.3.5",
      "patterns": [
        "process validation limited",
        "aseptic process not validated",
        "media fill",
        "environmental monitoring",
        "single lot validation",
        "shipping validation missing"
      ],
      "description": "Process validation relies on too few lots for an autologous product, lacks aseptic simulation/media fills representative of the open manipulations, or omits cryogenic shipping and excursion-handling validation.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA-ATMP-GMP-PARTIV"
    },
    {
      "ctdSection": "1.14.1",
      "patterns": [
        "label not supported",
        "population broader than studied",
        "nab screening not in label",
        "redosing not addressed in label",
        "device instructions missing"
      ],
      "description": "Proposed indication is broader than the studied population (e.g., omits the NAb-negative restriction or the age range actually enrolled), or labeling fails to carry the administration procedure, precautions for shedding, and monitoring obligations into the Highlights and Full Prescribing Information.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-GT-CMC-IND-2020"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-GT-CMC-IND-2020",
      "authority": "FDA",
      "title": "Chemistry, Manufacturing, and Control (CMC) Information for Human Gene Therapy Investigational New Drug Applications (IND) — CBER, January 2020",
      "why": "Primary source for the structure and content of Module 3 for gene therapy INDs: vector and cell bank characterization, drug substance/drug product manufacturing description, release testing panel, stability, and container-closure. Sponsors use it to build the CMC narrative that later scales into the BLA."
    },
    {
      "code": "FDA-CGT-POTENCY-2023",
      "authority": "FDA",
      "title": "Potency Assurance for Cellular and Gene Therapy Products — CBER (draft, December 2023; supersedes the 2011 Potency Tests for Cellular and Gene Therapy Products guidance when finalized)",
      "why": "Defines FDA's current risk-based potency assurance framework — MOA mapping, assay selection, matrix approaches, lifecycle validation. Used to design the potency strategy and to defend release acceptance criteria at BLA."
    },
    {
      "code": "FDA-GT-LTFU-2020",
      "authority": "FDA",
      "title": "Long Term Follow-Up After Administration of Human Gene Therapy Products — CBER, January 2020",
      "why": "Sets the risk-based durations (up to 15 years for integrating/gene-edited products, up to 5 years for non-integrating) and the delayed-adverse-event monitoring content that the LTFU protocol, postmarketing commitments, and pharmacovigilance plan must reflect."
    },
    {
      "code": "FDA-GT-SHEDDING-2015",
      "authority": "FDA",
      "title": "Design and Analysis of Shedding Studies for Virus or Bacteria-Based Gene Therapy and Oncolytic Products — CBER, August 2015",
      "why": "Specifies matrices, sampling frequency, assay design (genome detection vs infectivity), and the transmission risk assessment used to derive patient/caregiver precautions and biosafety language in protocols and labeling."
    },
    {
      "code": "FDA-RCR-RCL-2020",
      "authority": "FDA",
      "title": "Testing of Retroviral Vector-Based Human Gene Therapy Products for Replication Competent Retrovirus During Product Manufacture and Patient Follow-up — CBER, January 2020",
      "why": "Defines when and how to test vector supernatant, ex vivo transduced cells, and patients for RCR/RCL, including assay sensitivity and the amount of material to test — a frequent source of information requests."
    },
    {
      "code": "FDA-CART-2024",
      "authority": "FDA",
      "title": "Considerations for the Development of Chimeric Antigen Receptor (CAR) T Cell Products — CBER, January 2024",
      "why": "Consolidated CMC, nonclinical, and clinical expectations specific to CAR T products: starting material control, potency, CRS/ICANS monitoring and grading, secondary malignancy surveillance, and trial design."
    },
    {
      "code": "FDA-GENOME-EDITING-2024",
      "authority": "FDA",
      "title": "Human Gene Therapy Products Incorporating Human Genome Editing — CBER, January 2024",
      "why": "Governs editor design justification, on-target/off-target editing assessment methodology, delivery-platform considerations, and the additional nonclinical and long-term follow-up expectations for edited products."
    },
    {
      "code": "FDA-GT-RARE-2020",
      "authority": "FDA",
      "title": "Human Gene Therapy for Rare Diseases — CBER, January 2020",
      "why": "Addresses natural history study design, endpoint selection and validation in small populations, trial design options (single-arm, randomized withdrawal, crossover), and study population/age considerations for rare-disease gene therapy programs."
    },
    {
      "code": "FDA-CGT-PRECLIN-2013",
      "authority": "FDA",
      "title": "Preclinical Assessment of Investigational Cellular and Gene Therapy Products — CBER, November 2013",
      "why": "Framework for proof-of-concept and toxicology study design, animal model relevance, route/delivery-device replication, starting-dose derivation, and first-in-human design elements such as staggered dosing."
    },
    {
      "code": "FDA-RMAT-2019",
      "authority": "FDA",
      "title": "Expedited Programs for Regenerative Medicine Therapies for Serious Conditions — CBER, February 2019",
      "why": "Defines RMAT eligibility (regenerative medicine therapy, serious condition, preliminary clinical evidence of unmet need), the benefits including early and frequent OTP interaction and eligibility for accelerated approval with surrogate/intermediate endpoints, and the related device-evaluation pathway."
    },
    {
      "code": "FDA-CGT-COMPARABILITY-2023",
      "authority": "FDA",
      "title": "Manufacturing Changes and Comparability for Human Cellular and Gene Therapy Products — CBER (draft, July 2023)",
      "why": "The operative reference for planning process changes across development: risk assessment, comparability protocol content, analytical vs clinical bridging, and reporting categories post-licensure."
    },
    {
      "code": "FDA-ECT-2023",
      "authority": "FDA",
      "title": "Externally Controlled Trials for Drug and Biological Products — CDER/CBER (draft, February 2023)",
      "why": "Standards for using natural history, registry, or historical cohorts as controls: comparability of populations and endpoint ascertainment, data provenance and access, and the analytic and interpretive limitations to disclose in Module 2.5 and 5.3.5.3."
    },
    {
      "code": "ICH-S12",
      "authority": "ICH",
      "title": "ICH S12: Nonclinical Biodistribution Considerations for Gene Therapy Products (Step 4, 2023)",
      "why": "Harmonized expectations for biodistribution study design, matrices, assay validation, timepoints, and interpretation including germline risk — the reference reviewers apply to Module 2.6.6 and 4.2.3."
    },
    {
      "code": "ICH-Q5A-R2",
      "authority": "ICH",
      "title": "ICH Q5A(R2): Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin (2023)",
      "why": "Applied to cell substrates, viral banks, and raw materials used in vector manufacture; the revision addresses new modalities and the limits of viral clearance for products that are themselves viruses."
    },
    {
      "code": "ICH-E9-R1",
      "authority": "ICH",
      "title": "ICH E9(R1): Statistical Principles for Clinical Trials — Addendum on Estimands and Sensitivity Analysis",
      "why": "Used to define the estimand for single-arm and externally controlled CGT trials, particularly intercurrent-event strategies for retreatment, transplant, rescue therapy, and death."
    },
    {
      "code": "EMA-GTMP-2018",
      "authority": "EMA",
      "title": "Guideline on the quality, non-clinical and clinical aspects of gene therapy medicinal products (EMA/CAT/80183/2014)",
      "why": "The EU counterpart to the FDA CMC and clinical guidances; drives CAT expectations on vector characterization, potency, immunogenicity, and clinical follow-up for the MAA."
    },
    {
      "code": "EMA-GMC-2020",
      "authority": "EMA",
      "title": "Guideline on quality, non-clinical and clinical aspects of medicinal products containing genetically modified cells (EMA/CAT/GTWP/671639/2008 Rev.1)",
      "why": "Governs ex vivo modified cell products (CAR-T, HSPC gene therapy) in the EU: starting material and donor requirements, vector-cell combination control, potency, and clinical monitoring."
    },
    {
      "code": "EMA-ATMP-FU-2009",
      "authority": "EMA",
      "title": "Guideline on follow-up of patients administered with gene therapy medicinal products (EMEA/CHMP/GTWP/60436/2007) and Guideline on Safety and Efficacy Follow-up and Risk Management of ATMPs (EMEA/149995/2008 Rev.1)",
      "why": "Defines EU long-term efficacy and safety follow-up and the ATMP-specific risk management plan content, including registries and traceability obligations under Regulation (EC) No 1394/2007."
    },
    {
      "code": "EMA-ATMP-GMP-PARTIV",
      "authority": "EMA",
      "title": "EudraLex Volume 4, Part IV: Good Manufacturing Practice for Advanced Therapy Medicinal Products (2017)",
      "why": "The GMP standard applied to ATMP manufacture in the EU, including risk-based approaches, traceability/chain of identity for autologous products, out-of-specification release, and reconciliation with 21 CFR 1271 and 210/211 expectations in the US."
    },
    {
      "code": "FDA-ORPHAN-SAMENESS-2020",
      "authority": "FDA",
      "title": "Interpreting Sameness of Gene Therapy Products Under the Orphan Drug Regulations — CBER, September 2020",
      "why": "Determines whether a competing gene therapy is the 'same drug' (principal molecular structural features: transgene and vector) for orphan exclusivity purposes — used in orphan designation strategy and exclusivity risk analysis."
    }
  ],
  "reviewerExpectations": [
    "OTP CMC reviewers open with potency: they look for an explicit MOA-to-attribute map, a quantitative and biologically relevant release assay with a validation timeline, and acceptance criteria traceable to the lots that produced the pivotal clinical data — a matrix or surrogate approach with no conversion plan draws an information request or a CRL.",
    "Reviewers reconstruct the lot-to-patient linkage: which specific drug product lots treated which pivotal-trial patients, made by which process version, at which site — and will ask for a comparability bridge wherever the commercial process differs.",
    "Clinical reviewers demand an intent-to-treat accounting for autologous products: how many patients were enrolled, apheresed, had a manufacturing failure or out-of-specification product, died or progressed before infusion, and how each is handled in efficacy and safety analyses.",
    "Safety reviewers expect a single consistent grading system for CRS and ICANS across all studies, time-to-onset and time-to-resolution distributions, and a dedicated presentation of prolonged cytopenias, infections, hypogammaglobulinemia, HLH/MAS, and secondary malignancies with clonality/integration-site investigation.",
    "For AAV programs, reviewers focus on dose-related hepatotoxicity, complement activation and thrombotic microangiopathy, DRG findings for CNS routes, and whether steroid or complement-inhibitor prophylaxis regimens used in the trial are reflected in the proposed label.",
    "Reviewers scrutinize the NAb screening assay actually used at clinical sites versus the commercial companion assay, and will question a label population broader than the screened population.",
    "The LTFU protocol is reviewed as a substantive document, not a placeholder: duration justification, retention strategy, the specific assays retained, and how events in withdrawn or lost-to-follow-up patients will still be captured.",
    "Nonclinical reviewers check that the animal model is pharmacologically relevant to the human construct, that the delivery route and device were replicated, and that biodistribution assays were validated with a stated LLOQ and included gonadal tissue.",
    "Statistical reviewers challenge external controls on endpoint ascertainment comparability and era effects, and will ask for tip-point or quantitative-bias sensitivity analyses rather than a qualitative limitations paragraph.",
    "Pre-license inspection readiness is treated as part of the review: OTP coordinates with the inspection outcome, and aseptic-process, environmental-monitoring, or data-integrity findings at a CGT facility will hold the approval independently of the clinical package.",
    "In the EU, CAT expects the ATMP classification, the GMO environmental risk assessment, the traceability system meeting Article 15 of Regulation 1394/2007, and a registry-based long-term follow-up commitment in the RMP."
  ],
  "pathwayHints": [
    {
      "pathway": "rmat",
      "applicability": "Available to regenerative medicine therapies — cell therapies, therapeutic tissue-engineering products, human cell and tissue products, and combination products using them, plus gene therapies including genetically modified cells that lead to a durable modification of cells or tissues — intended to treat a serious condition, where preliminary clinical evidence indicates potential to address an unmet medical need. Requires at least preliminary clinical data; nonclinical data alone are insufficient.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "2.7.4",
        "5.3.5.1",
        "5.3.5.4"
      ],
      "reviewerNotes": "RMAT confers all Breakthrough Therapy benefits — intensive OTP guidance from Phase 1, organizational commitment including senior managers, rolling review eligibility — plus explicit statutory language on satisfying postapproval requirements through registries, expanded patient follow-up, or additional data collection. Sponsors should use RMAT meetings to lock the potency strategy and the comparability plan early, since RMAT does not lower the CMC bar and CMC is the most common cause of delay. Cite the designation and the agreements reached in Module 1.2 and reference them in 2.5 when justifying the evidentiary package."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "For serious conditions with unmet need where an effect on a surrogate or intermediate clinical endpoint is reasonably likely to predict clinical benefit — heavily used in CGT (e.g., transgene-derived protein activity levels, dystrophin expression, hematologic surrogates, response rate in hematologic malignancies).",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14.1",
        "1.11"
      ],
      "reviewerNotes": "Under FDORA the confirmatory trial should generally be underway at the time of approval; sponsors must present the confirmatory trial design, enrollment status, and milestone schedule in Module 1 and cross-reference in 2.5. The surrogate's biological and epidemiologic linkage to outcome must be argued explicitly with supporting literature, not asserted. Expect the label to be restricted to the surrogate-defined claim and the postmarketing requirement to be enforceable with expedited withdrawal procedures."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Serious condition plus preliminary clinical evidence of substantial improvement over available therapy on a clinically significant endpoint. Relevant where RMAT criteria are not met (e.g., a non-regenerative product) or where the sponsor wants both designations considered.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "For most CGT products RMAT is the better fit because of its postapproval-evidence flexibility; request BTD in parallel only when the product may fall outside the regenerative medicine definition. Both designations require an active plan for manufacturing scale-up because accelerated timelines compress CMC development."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Prevalence under 200,000 in the US (or cost-recovery basis); most CGT indications qualify. EU orphan designation under Regulation (EC) No 141/2000 requires prevalence not more than 5 in 10,000 plus significant benefit over authorized therapies.",
      "impactedSections": [
        "1.2",
        "1.3",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Orphan exclusivity for gene therapy turns on the 'sameness' analysis — principal molecular structural features are the transgene and the vector — so map competitor constructs before relying on exclusivity. EU designation requires maintaining significant benefit at the time of marketing authorization, which must be argued in the MAA with comparative data or a justified indirect comparison."
    },
    {
      "pathway": "fast_track",
      "applicability": "Serious condition and nonclinical or clinical data demonstrating potential to address an unmet need; obtainable earlier than RMAT/BTD because clinical evidence is not required.",
      "impactedSections": [
        "1.2",
        "2.5"
      ],
      "reviewerNotes": "Primarily useful for early rolling-submission eligibility and more frequent meetings during IND; typically superseded by RMAT once preliminary clinical evidence exists. Document the designation and any rolling-review agreement in Module 1.2."
    },
    {
      "pathway": "priority_review",
      "applicability": "Requested at BLA submission where the product would provide a significant improvement in safety or effectiveness; frequently paired with a rare pediatric disease priority review voucher where applicable.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "A six-month goal compresses the window for resolving CMC information requests and for scheduling pre-license inspections of CGT facilities; sponsors should have validation, stability, and comparability packages complete at submission rather than planned as amendments."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME for medicines addressing an unmet need with compelling early clinical (or, for ATMPs, compelling nonclinical plus tolerability) data; ATMPs are eligible to apply at an earlier stage than other products.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "PRIME provides a CHMP/CAT rapporteur appointed early, a kick-off meeting, and enhanced scientific advice; it is the principal EU vehicle for aligning on potency, comparability, and the ERA/GMO submission before MAA. It also supports eligibility for accelerated assessment, though ATMPs rarely retain accelerated assessment through review."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU CMA for seriously debilitating or life-threatening conditions, orphan products, or emergency-use situations where the benefit of immediate availability outweighs the risk of less comprehensive data — commonly used for ATMPs approved on single-arm data.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.4",
        "5.3.5.4"
      ],
      "reviewerNotes": "Requires specific obligations with binding timelines (usually completion of the ongoing or a confirmatory trial plus registry-based long-term follow-up), annual renewal, and a comprehensive RMP. Sponsors should design the LTFU/registry to satisfy both the FDA LTFU commitment and the EU specific obligation with a single data-collection instrument."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand per ICH E9(R1) with explicit intercurrent-event strategies that are genuine in this area: manufacturing failure and non-infusion, bridging or lymphodepleting therapy, retreatment or a second vector administration, stem-cell transplant, initiation of standard-of-care replacement therapy (e.g., factor concentrate), and death. A treatment-policy strategy on the infused population is not the same estimand as an ITT analysis and must not be labeled as such.",
    "Present both the enrolled/leukapheresed (modified ITT) and infused (as-treated) populations for autologous products, with a transparent attrition diagram; the primary efficacy population and its justification must be pre-specified in the SAP, not selected after unblinding.",
    "For externally controlled analyses, pre-specify the control data source, eligibility mapping, and the adjustment method (propensity score with a stated set of prognostic covariates, matching, or regression), report covariate balance diagnostics, and include quantitative bias analysis or tipping-point analysis for unmeasured confounding rather than a qualitative caveat.",
    "Control multiplicity across the primary and key secondary endpoints with a pre-specified hierarchical or gatekeeping procedure, and treat any composite/co-primary structure explicitly; in small single-arm studies, report exact (Clopper-Pearson) confidence intervals for response proportions and avoid inferential claims on unadjusted secondary endpoints.",
    "For time-to-event durability endpoints (duration of response, time to first vaso-occlusive crisis, event-free survival), state the censoring rules for retreatment, transplant, and loss to follow-up, and provide the median follow-up by reverse Kaplan-Meier alongside the estimate — durability claims should not exceed the observed follow-up.",
    "Pre-specify handling of missing data with a plausible primary assumption and sensitivity analyses under alternative missingness mechanisms; with N in the tens, single-imputation or complete-case defaults are inadequate and tipping-point analysis is the expected sensitivity approach.",
    "Justify sample size on precision (expected half-width of the confidence interval around the effect) as well as power where the population is ultra-rare, and document the clinically meaningful threshold used, ideally anchored to natural history or patient-experience data.",
    "Bayesian designs and borrowing from natural-history or adult data are acceptable if the prior, the borrowing mechanism (e.g., commensurate or power prior), the maximum effective sample size borrowed, and the operating characteristics under prior-data conflict are pre-specified and simulated.",
    "For dose-finding and staggered-enrollment safety monitoring, pre-specify the DLT window matched to the toxicity kinetics of the platform, the stopping/hold rules, and the DSMB decision rules; report all interim looks actually performed and any resulting protocol changes.",
    "Pooling across studies for the integrated safety summary requires justification of comparability (product version, process, lymphodepletion regimen, disease setting); report exposure-adjusted incidence rates in addition to crude proportions when follow-up durations differ materially, and present long-term events separately from the acute period.",
    "Pre-specify the analysis of biomarker/surrogate-to-outcome relationships (e.g., transgene protein level versus bleed rate, VCN versus response) as exploratory unless the surrogate is the accelerated-approval basis, in which case the quantitative dose-response and exposure-response modeling supporting the label must be pre-planned."
  ],
  "endpointConsiderations": [
    "Hemophilia A/B gene therapy: annualized bleeding rate (ABR) is the accepted primary clinical endpoint, typically compared to a prospective intra-patient lead-in period on prophylaxis; endogenous factor VIII/IX activity is a supportive/surrogate measure complicated by substantial one-stage versus chromogenic assay discrepancy — report both assays, name the reagent/platform, and address durability of expression, which declines over years for FVIII.",
    "Hemoglobinopathies: transfusion independence (defined as a weighted average hemoglobin at or above a stated threshold for at least 12 consecutive months without transfusion) for transfusion-dependent beta-thalassemia; severe vaso-occlusive crisis freedom over a defined window for sickle cell disease, with a pre-specified adjudicated VOC definition and an adequate pre-treatment observation period to establish baseline frequency.",
    "Inherited retinal disease: functional vision measures such as the multi-luminance mobility test (MLMT), full-field light sensitivity threshold, and BCVA; visual field. Caveats include unblinded assessment, learning effects, and the need for a validated, standardized administration with central reading.",
    "Neuromuscular and neurodegenerative disease: motor-milestone achievement and event-free survival (SMA), CHOP-INTEND, Hammersmith scales, NSAA and timed function tests (DMD), with dystrophin expression by validated Western blot used as an accelerated-approval surrogate whose relationship to function remains contested — quantify with a validated method and disclose assay variability.",
    "Hematologic malignancy cell therapy: overall response rate and complete response rate by an independent review committee using disease-specific criteria (Lugano, IMWG, NCCN/ELN), with duration of response as the key secondary; minimal residual disease negativity is supportive and increasingly used for accelerated approval in multiple myeloma but requires a validated assay, stated sensitivity threshold, and a pre-specified assessment schedule.",
    "Metabolic and enzyme-deficiency disorders: substrate/biomarker reduction (e.g., enzyme activity, storage-substrate levels) as intermediate endpoints, paired with a clinical measure of organ function or a validated functional scale; the biological plausibility chain from biomarker to outcome must be documented for accelerated approval.",
    "Immunodeficiency and HSPC gene therapy: survival free of severe infection, immune reconstitution parameters (T-cell counts, TREC levels, vaccine responses), and freedom from enzyme-replacement or immunoglobulin support, with vector copy number and gene-marking persistence as pharmacodynamic support rather than efficacy endpoints.",
    "Patient-reported and functional outcomes: PROs must be fit-for-purpose for the population and context of use per the FDA PFDD guidance series, with documented content validity in the specific disease, a pre-specified responder definition, and recognition that open-label single-arm designs make PROs vulnerable to expectation bias — they generally support rather than establish benefit.",
    "Pharmacodynamic/exposure measures (vector copy number, transgene mRNA or protein, CAR-T expansion Cmax and AUC, persistence) are essential for dose justification and label but are not efficacy endpoints; pre-specify their assays and the exposure-response analyses that will inform the recommended dose.",
    "Durability is itself an endpoint dimension: for a one-time therapy the label claim depends on maintained effect, so define the durability endpoint (proportion maintaining response at 12/24/36 months, or slope of transgene expression) prospectively and align its follow-up window with the LTFU protocol so the data continue to accrue post-approval.",
    "Avoid unvalidated composite or investigator-defined scales invented for the program; if a novel COA is unavoidable, pursue the FDA COA qualification or a fit-for-purpose discussion at an early meeting and document psychometric performance (reliability, construct validity, ability to detect change, anchor-based meaningful within-patient change) in Module 5.3.5.3."
  ],
  "retrievalKeywords": [
    "gene therapy",
    "cell therapy",
    "atmp",
    "aav",
    "adeno-associated virus",
    "capsid",
    "serotype",
    "lentiviral vector",
    "retroviral vector",
    "self-inactivating",
    "vector genome",
    "vg/kg",
    "vector copy number",
    "transduction efficiency",
    "empty capsid",
    "full to empty ratio",
    "residual plasmid dna",
    "helper virus",
    "replication competent lentivirus",
    "rcl",
    "rcr",
    "potency assay",
    "potency assurance",
    "mechanism of action",
    "comparability protocol",
    "process change",
    "biodistribution",
    "germline transmission",
    "shedding",
    "environmental risk assessment",
    "gmo",
    "insertional oncogenesis",
    "integration site analysis",
    "clonal expansion",
    "genome editing",
    "crispr",
    "off-target editing",
    "base editing",
    "car-t",
    "tcr-t",
    "chimeric antigen receptor",
    "lymphodepletion",
    "apheresis",
    "chain of identity",
    "chain of custody",
    "out of specification",
    "cytokine release syndrome",
    "icans",
    "astct grading",
    "hlh",
    "secondary malignancy",
    "hypogammaglobulinemia",
    "prolonged cytopenia",
    "graft versus host disease",
    "hspc",
    "cd34+",
    "transfusion independence",
    "vaso-occlusive crisis",
    "annualized bleeding rate",
    "factor viii activity",
    "dystrophin expression",
    "mlmt",
    "chop-intend",
    "minimal residual disease",
    "long-term follow-up",
    "15-year follow-up",
    "delayed adverse events",
    "rmat",
    "regenerative medicine advanced therapy",
    "otp",
    "cber",
    "cat",
    "pre-existing neutralizing antibodies",
    "anti-capsid antibody",
    "complement activation",
    "thrombotic microangiopathy",
    "dorsal root ganglia",
    "hepatotoxicity",
    "cryopreservation",
    "21 cfr 1271",
    "donor eligibility",
    "natural history study",
    "external control",
    "accelerated approval surrogate"
  ]
};

export default geneCellTherapyProfile;
