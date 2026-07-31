/**
 * Ophthalmology therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/ophthalmology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const ophthalmologyProfile: TherapeuticAreaProfile = {
  "id": "ophthalmology",
  "displayName": "Ophthalmology",
  "description": "Regulatory profile for drugs, biologics and gene therapies treating ocular disease (nAMD, DME, diabetic retinopathy, geographic atrophy, glaucoma/ocular hypertension, dry eye, uveitis, ocular infection, inherited retinal dystrophies). Development is dominated by locally administered products (topical, intravitreal, suprachoroidal, implants, subretinal gene therapy), reading-center-adjudicated imaging and vision endpoints, and a Module 3 sterility/compatibility package that is as review-critical as the clinical package. Reviewed in the US by CDER's Division of Ophthalmology (with CBER/OTP for gene therapy) and in the EU by CHMP with CAT involvement for ATMPs.",
  "contextRules": [
    {
      "id": "oph-study-eye-designation",
      "scope": "section",
      "instruction": "State explicitly in the Clinical Overview how the study eye was designated (worse-seeing eye, first-eligible eye, prospectively randomized), whether the fellow eye was treated or dosed, and how inter-eye correlation is handled in the primary analysis. Never present pooled per-eye counts as if eyes were independent subjects.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "study eye",
        "fellow eye",
        "bilateral",
        "both eyes",
        "per-eye"
      ],
      "guidanceRef": "ICH-E9R1"
    },
    {
      "id": "oph-bcva-standardization",
      "scope": "section",
      "instruction": "Document the ETDRS/BCVA protocol in each study report: refraction protocol, chart and lighting standards, testing distance, examiner certification and masking, and the responder definitions (>=15-letter and >=10-letter gain, avoidance of >=15-letter loss). Confirm identical methodology across pooled studies before any integrated analysis.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "bcva",
        "etdrs",
        "visual acuity",
        "letters",
        "refraction"
      ],
      "guidanceRef": "FDA-PFDD-COA-2022"
    },
    {
      "id": "oph-reading-center",
      "scope": "section",
      "instruction": "For any imaging-derived endpoint (fundus autofluorescence GA area, DRSS step change, OCT central subfield thickness, angiography), describe the independent reading center, masking, grader certification, adjudication of discordant reads, and image-quality exclusion rules; report the proportion of ungradable images by visit and arm.",
      "severity": "major",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "reading center",
        "fundus autofluorescence",
        "drss",
        "oct",
        "angiography",
        "grading"
      ],
      "guidanceRef": "ICH-E9R1"
    },
    {
      "id": "oph-ocular-safety-dataset",
      "scope": "section",
      "instruction": "Present a dedicated ocular safety section separate from systemic safety: slit-lamp findings, IOP (including post-injection spikes), lens status/cataract progression, dilated fundus findings, intraocular inflammation, endophthalmitis, retinal vasculitis/occlusive events, retinal detachment and RPE tears. Express injection-related events per injection and per patient-year, not only per patient.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "intraocular inflammation",
        "endophthalmitis",
        "iop spike",
        "vasculitis",
        "retinal detachment",
        "slit lamp"
      ],
      "guidanceRef": "FDA-OPHTH-QUALITY-2022"
    },
    {
      "id": "oph-quality-sterility",
      "scope": "module",
      "instruction": "Module 3 for any ophthalmic product must address sterility assurance and aseptic process validation, particulate matter, osmolality, pH, viscosity, preservative identity and antimicrobial effectiveness testing, container closure integrity, extractables/leachables (including silicone oil and tungsten for prefilled syringes), and in-use/multi-dose stability. Justify every excipient against ocular tolerability.",
      "severity": "critical",
      "appliesTo": "3",
      "triggerKeywords": [
        "preservative",
        "benzalkonium",
        "sterility",
        "particulate",
        "silicone oil",
        "extractables",
        "container closure"
      ],
      "guidanceRef": "FDA-OPHTH-QUALITY-2022"
    },
    {
      "id": "oph-nonclinical-route",
      "scope": "section",
      "instruction": "Nonclinical program must use the intended ocular route in a species with a relevant eye (rabbit for topical/anterior; non-human primate for intravitreal/subretinal because of the macula), with ophthalmic examinations, tonometry, ERG and ocular histopathology, plus systemic toxicokinetics to support the systemic exposure section of labeling.",
      "severity": "major",
      "appliesTo": "4.2.3",
      "triggerKeywords": [
        "rabbit",
        "non-human primate",
        "intravitreal toxicology",
        "erg",
        "ocular histopathology"
      ],
      "guidanceRef": "FDA-ALT-ROUTE-2015"
    },
    {
      "id": "oph-systemic-exposure",
      "scope": "section",
      "instruction": "Characterize systemic PK after ocular administration even when exposure is expected to be low; for anti-VEGF agents report free and total systemic drug and systemic VEGF suppression, and link this to the systemic (arterial thromboembolic) safety analysis in 2.7.4.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "systemic exposure",
        "plasma vegf",
        "anti-vegf",
        "ocular pk"
      ],
      "guidanceRef": "ICH-M3R2"
    },
    {
      "id": "oph-gene-therapy-durability",
      "scope": "module",
      "instruction": "For ocular gene therapy, prespecify long-term follow-up (up to 15 years for integrating/latent vectors, minimum 5 years for AAV), immune response monitoring (pre-existing and treatment-emergent anti-capsid antibodies, T-cell responses), shedding data, and surgical-procedure-attributable adverse events reported separately from vector-attributable events.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "aav",
        "subretinal",
        "gene therapy",
        "shedding",
        "long-term follow-up",
        "anti-capsid"
      ],
      "guidanceRef": "FDA-GT-RETINAL-2020"
    }
  ],
  "riskFactors": [
    "Single-arm or externally controlled designs in inherited retinal disease where natural-history variability in visual function is large and unblinded functional testing is prone to learning and motivational effects.",
    "Reliance on anatomic endpoints (GA lesion growth, central subfield thickness) that FDA and CHMP have repeatedly declined to accept as established surrogates for patient-relevant vision outcomes without functional corroboration.",
    "Injection-procedure risk (endophthalmitis, IOP elevation, intraocular inflammation, retinal vasculitis) that can dominate benefit-risk for chronic intravitreal therapy and has triggered post-marketing action in this area.",
    "Preservative-related ocular surface toxicity (notably benzalkonium chloride) in chronic topical therapy, which reviewers weigh against efficacy for glaucoma and dry eye products.",
    "High and durable placebo/vehicle response in dry eye and allergic conjunctivitis, producing failed replication between otherwise identical pivotal trials.",
    "Bilateral disease with fellow-eye treatment creating exposure-attribution and statistical-independence problems, and confounding of systemic safety signals.",
    "Sterility, particulate and container-closure failures that generate CRLs and recalls independent of clinical performance, including compounded and repackaged intravitreal presentations.",
    "Pediatric ophthalmic populations (retinopathy of prematurity, amblyopia, myopia progression) where systemic absorption per kilogram and developmental toxicity risk are materially higher than in adults."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.5",
      "patterns": [
        "study eye not specified",
        "eye selection",
        "which eye",
        "inter-eye correlation",
        "both eyes analyzed"
      ],
      "description": "Study-eye designation rules and handling of inter-eye correlation are not prespecified, so per-eye analyses overstate precision and the primary estimand is ambiguous.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "sign only",
        "symptom only",
        "no replicated",
        "single pivotal",
        "dry eye endpoint"
      ],
      "description": "Dry eye programs demonstrate an effect on a sign or a symptom but not both, or fail to replicate the same endpoint pair across two adequate and well-controlled trials.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-DRYEYE-2020"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "ocular safety not",
        "no slit lamp",
        "iop not monitored",
        "inflammation rate",
        "per injection"
      ],
      "description": "Ocular adverse events are pooled into the general safety table without protocol-specified ophthalmic examinations, without per-injection rates, and without independent adjudication of intraocular inflammation and endophthalmitis.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-OPHTH-QUALITY-2022"
    },
    {
      "ctdSection": "3.2.P.5",
      "patterns": [
        "preservative effectiveness",
        "antimicrobial effectiveness",
        "particulate matter",
        "osmolality",
        "ph specification"
      ],
      "description": "Ophthalmic-specific quality attributes (antimicrobial effectiveness, particulate matter, osmolality, pH, viscosity, in-use stability after first opening) are missing from the specification or lack acceptance-criteria justification.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-OPHTH-QUALITY-2022"
    },
    {
      "ctdSection": "4.2.3",
      "patterns": [
        "no ocular toxicology",
        "systemic route only",
        "no erg",
        "no ophthalmic examination",
        "irritation study"
      ],
      "description": "Nonclinical package supports a systemic route only, lacking ocular-route toxicology in a relevant species with ophthalmic examinations, electroretinography and ocular histopathology.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-ALT-ROUTE-2015"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no ocular pk",
        "vitreous concentration",
        "biodistribution",
        "implant release",
        "duration of effect"
      ],
      "description": "For implants and sustained-release depots, ocular pharmacokinetics and biodistribution are not characterized, so the dosing interval and durability claim are unsupported.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-M3R2"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "pooled across studies",
        "different visual acuity",
        "methodology differed",
        "non-standardized refraction"
      ],
      "description": "Integrated efficacy pools trials that used different visual acuity charts, refraction protocols or grading conventions, undermining the pooled estimate.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-PFDD-COA-2022"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "duration less than 12 months",
        "6-month primary",
        "durability not shown",
        "rescue permitted"
      ],
      "description": "Pivotal duration is too short for a chronic retinal indication (12 months of controlled data is the norm for nAMD/DME) or rescue therapy is permitted without an estimand strategy that preserves interpretability.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no systemic pk",
        "plasma levels not measured",
        "vegf suppression",
        "arterial thromboembolic"
      ],
      "description": "Systemic exposure after ocular dosing is asserted to be negligible without measured data, leaving systemic class risks (e.g., arterial thromboembolic events for anti-VEGF) unquantified for labeling.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-M3R2"
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "no pediatric plan",
        "pediatric deferral",
        "pip not submitted",
        "rop"
      ],
      "description": "Pediatric study plan / PIP is absent or unjustified for conditions with a pediatric population (ROP, uveitis, amblyopia, myopia progression, inherited retinal dystrophy).",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E11R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no device description",
        "instillation technique",
        "human factors",
        "injection procedure"
      ],
      "description": "Administration device and technique (dropper, prefilled syringe, injector, applicator) lack human-factors evaluation in the intended elderly or visually impaired user population.",
      "severity": "minor",
      "prefix": true,
      "guidanceRef": "FDA-OPHTH-QUALITY-2022"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-DRYEYE-2020",
      "authority": "FDA",
      "title": "Dry Eye: Developing Drugs for Treatment (Draft Guidance for Industry, CDER, December 2020)",
      "why": "Sets FDA's expectation that dry eye efficacy be shown on both a sign and a symptom endpoint, with replication across adequate and well-controlled trials; used to justify the endpoint pair, trial duration and environmental-challenge design in Module 2.5 and the protocol synopses."
    },
    {
      "code": "FDA-OPHTH-QUALITY-2022",
      "authority": "FDA",
      "title": "Quality Considerations for Topical Ophthalmic Drug Products (Draft Guidance for Industry, CDER, October 2022)",
      "why": "Primary reference for Module 3 ophthalmic quality attributes - sterility, preservatives and antimicrobial effectiveness, particulate matter, pH, osmolality, viscosity, container closure and in-use stability - and for justifying excipient selection and multi-dose presentations."
    },
    {
      "code": "FDA-GT-RETINAL-2020",
      "authority": "FDA",
      "title": "Human Gene Therapy for Retinal Disorders (Final Guidance for Industry, CBER, January 2020)",
      "why": "Governs subretinal/intravitreal gene therapy programs: vector characterization, surgical delivery, immune monitoring, dose selection, endpoint choice for inherited retinal disease, and long-term follow-up commitments in Modules 4 and 5."
    },
    {
      "code": "FDA-ALT-ROUTE-2015",
      "authority": "FDA",
      "title": "Nonclinical Safety Evaluation of Reformulated Drug Products and Products Intended for Administration by an Alternative Route (Final Guidance, CDER/CBER, October 2015)",
      "why": "Used to scope route-specific ocular toxicology (local tolerance, ocular histopathology, ERG) and to bridge from an existing systemic program to an ocular presentation in Module 4.2.3."
    },
    {
      "code": "FDA-RARE-2019",
      "authority": "FDA",
      "title": "Rare Diseases: Common Issues in Drug Development (Final Guidance for Industry, December 2019)",
      "why": "Framework for natural-history data, endpoint selection and evidentiary flexibility in inherited retinal dystrophies and other rare ocular conditions; cited in 2.5 to support small, well-characterized populations."
    },
    {
      "code": "FDA-ECT-2023",
      "authority": "FDA",
      "title": "Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (Draft Guidance, February 2023)",
      "why": "Applied when a concurrent control is infeasible in rare retinal disease; disciplines the choice of natural-history comparator, outcome ascertainment comparability and bias assessment in 5.3.5.2 and 2.5."
    },
    {
      "code": "FDA-PFDD-COA-2022",
      "authority": "FDA",
      "title": "Patient-Focused Drug Development: Selecting, Developing, or Modifying Fit-for-Purpose Clinical Outcome Assessments (Guidance 3, Draft, June 2022)",
      "why": "Supports the fit-for-purpose case for vision-related PROs (e.g., NEI VFQ-derived instruments) and functional vision measures, including content validity and meaningful within-patient change thresholds in 2.7.3."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Basis for defining the estimand around ocular intercurrent events - rescue anti-VEGF or laser, cataract surgery, IOP-lowering rescue medication, loss of the study eye - and for the sensitivity-analysis strategy in 2.5 and 5.3.5."
    },
    {
      "code": "ICH-M3R2",
      "authority": "ICH",
      "title": "ICH M3(R2) Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals",
      "why": "Determines the nonclinical package and exposure-margin framing that supports first-in-human ocular dosing and the systemic exposure discussion in 2.4 and 2.6."
    },
    {
      "code": "ICH-E11R1",
      "authority": "ICH",
      "title": "ICH E11(R1) Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Frames the pediatric plan for ROP, pediatric uveitis, amblyopia and myopia progression, including extrapolation strategy and age-appropriate vision assessment, in Module 1.9/1.10 and 5.3.5."
    },
    {
      "code": "CPMP-EWP-1279-03",
      "authority": "EMA",
      "title": "Note for Guidance on Clinical Investigation of Medicinal Products in the Treatment of Glaucoma (CPMP/EWP/1279/03)",
      "why": "EU reference for glaucoma/ocular hypertension trial design: diurnal IOP measurement schedules, comparator choice, non-inferiority margins and long-term visual-field safety follow-up."
    },
    {
      "code": "EMA-CAT-80183-2014",
      "authority": "EMA",
      "title": "Guideline on the Quality, Non-clinical and Clinical Aspects of Gene Therapy Medicinal Products (EMA/CAT/80183/2014)",
      "why": "CAT expectations for ocular ATMPs covering vector quality, biodistribution, immunogenicity and long-term efficacy/safety follow-up, aligned with the EU ATMP regulation."
    }
  ],
  "reviewerExpectations": [
    "Explicit, prespecified study-eye rules and a primary analysis that treats the subject (not the eye) as the unit of inference, with a stated approach to fellow-eye treatment and bilateral exposure.",
    "Standardized, masked BCVA refraction protocols with certified examiners, and reading-center adjudication of all imaging endpoints with documented grader masking and reproducibility.",
    "For intravitreal and implant products, injection-level safety accounting: endophthalmitis, intraocular inflammation, retinal vasculitis/occlusion, IOP elevation and RPE tear rates per injection and per patient-year, with independent adjudication.",
    "For glaucoma/OHT, diurnal IOP at multiple clock times across visits with calibrated Goldmann tonometry, masked tonometrists, and non-inferiority conclusions supported at every timepoint rather than only on average.",
    "A Module 3 sterility, preservative and container-closure package that stands on its own, including extractables/leachables and in-use stability for multi-dose and prefilled-syringe presentations.",
    "Measured systemic pharmacokinetics after ocular dosing, linked explicitly to the systemic safety analysis and to Sections 8 and 12 of the label.",
    "For gene and cell therapy, a long-term follow-up protocol with immune monitoring and separation of surgical-procedure risk from product risk.",
    "A pediatric development plan (PSP/PIP) that addresses age-appropriate endpoints and the higher systemic exposure per body weight of ocularly administered drugs in children."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Inherited retinal dystrophies (RPE65-associated, retinitis pigmentosa, Leber hereditary optic neuropathy, Stargardt disease), non-infectious posterior uveitis subsets, neurotrophic keratitis and other low-prevalence ocular conditions.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.2"
      ],
      "reviewerNotes": "Designation does not lower the evidentiary standard; reviewers still expect a credible natural-history dataset, a functionally meaningful endpoint, and prespecified handling of the small-sample multiplicity and eye-level clustering problems."
    },
    {
      "pathway": "rmat",
      "applicability": "Regenerative medicine advanced therapy designation for ocular cell therapies and gene therapies addressing serious retinal degeneration with preliminary clinical evidence of benefit.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "3.2.S",
        "5.3.5.2"
      ],
      "reviewerNotes": "Sponsors should use RMAT interactions to align early on potency assay strategy, comparability across manufacturing changes, and the long-term follow-up plan, since these are the usual causes of late-stage delay in ocular ATMPs."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Programs with preliminary clinical evidence of substantial improvement over available therapy in serious sight-threatening disease, e.g. first therapies for a previously untreatable retinal degeneration.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect rolling review and intensive CMC scrutiny; the compressed timeline makes the ophthalmic sterility and container-closure package the most common critical-path risk."
    },
    {
      "pathway": "priority_review",
      "applicability": "Applications for serious sight-threatening conditions where the product would provide a significant improvement in safety or effectiveness, including reduced injection burden with maintained efficacy.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "A durability or treatment-burden claim must be supported by prespecified, protocol-driven retreatment criteria - not by post hoc counting of injections actually administered."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME support for ocular ATMPs and first-in-class therapies for rare, sight-threatening disease with early clinical evidence of major therapeutic advantage.",
      "impactedSections": [
        "2.5",
        "3.2.S",
        "5.3.5.2"
      ],
      "reviewerNotes": "CAT/CHMP will focus on manufacturing comparability across the accelerated development and on the adequacy of the natural-history control; early scientific advice on endpoints is effectively mandatory."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway for seriously debilitating ocular conditions with unmet need where comprehensive data are not yet available, typically ATMPs for rare retinal disease.",
      "impactedSections": [
        "1.8",
        "2.5",
        "5.3.5.2"
      ],
      "reviewerNotes": "Requires a specific obligation for confirmatory data with realistic recruitment assumptions in a small population; CHMP scrutinizes whether the confirmatory study is genuinely feasible."
    }
  ],
  "statisticalConsiderations": [
    "Define the analysis unit as the subject with one designated study eye; if both eyes contribute, use mixed models or GEE with an eye-level random effect and prespecify the correlation structure - eye-level analyses treating eyes as independent are a standard review criticism.",
    "Specify the estimand for intercurrent events characteristic of the area: rescue anti-VEGF or laser, cataract extraction, added IOP-lowering medication, incisional glaucoma surgery, and vitrectomy; treatment-policy versus composite (treat-as-failure) strategies give materially different conclusions and must be chosen a priori.",
    "Handle missing visual acuity with MMRM or multiple imputation under stated assumptions plus tipping-point analyses; LOCF and single imputation are not acceptable as primary in long retinal trials with informative dropout.",
    "Justify non-inferiority margins empirically: approximately 4 letters for BCVA change in retinal comparisons and, for IOP, a margin of no more than 1.5 mmHg at every timepoint with a tighter bound at the majority of timepoints; document assay sensitivity and constancy.",
    "Use responder analyses alongside mean change (proportion gaining >=15 or >=10 ETDRS letters, proportion avoiding >=15-letter loss) and prespecify the anchor supporting the responder threshold.",
    "For geographic atrophy area, prespecify whether the analysis uses raw or square-root-transformed lesion area, adjust for baseline lesion size and foveal involvement, and provide sensitivity analyses across both scales.",
    "Control multiplicity across co-primary sign/symptom pairs (both must succeed; power accordingly rather than adjusting alpha), across dose arms, across eyes, and across the ordered secondary hierarchy; document the full testing sequence in the SAP.",
    "Prespecify interim analyses and alpha-spending for long geographic-atrophy and glaucoma-progression trials, and state the DMC charter's stopping rules for ocular safety signals such as intraocular inflammation clusters."
  ],
  "endpointConsiderations": [
    "Mean change from baseline in BCVA (ETDRS letters) with companion responder analyses (>=15-letter gain; avoidance of >=15-letter loss) - the established primary for neovascular AMD, DME and retinal vein occlusion, generally over 12 months of controlled data.",
    ">=2-step or >=3-step improvement on the ETDRS Diabetic Retinopathy Severity Scale from centrally graded fundus photographs - accepted for diabetic retinopathy indications; requires reading-center grading and prespecified handling of ungradable images.",
    "Mean diurnal IOP reduction (mmHg) at multiple clock times for glaucoma and ocular hypertension; efficacy is judged at each timepoint, and long-term visual-field and optic-nerve safety follow-up is expected separately.",
    "Dry eye requires a sign endpoint (corneal or conjunctival fluorescein/lissamine staining, Schirmer test) and a symptom endpoint (eye dryness or ocular discomfort score) - both must succeed, and the same pair should replicate across trials.",
    "Growth in geographic atrophy lesion area by fundus autofluorescence is the operative endpoint for GA, but it is an anatomic measure whose relationship to patient-relevant vision remains contested; supportive functional data (low-luminance visual acuity, reading speed, microperimetry) strengthen the benefit-risk narrative.",
    "Functional vision measures for inherited retinal disease - multi-luminance mobility testing, full-field stimulus threshold, microperimetry macular sensitivity - require documented reliability, learning-effect control and masked administration to be credible in an unblinded or single-arm setting.",
    "Anterior chamber cell and flare graded by SUN criteria (typically anterior chamber cell = 0 at a fixed day) for uveitis and postoperative inflammation, with prohibited-medication rules and rescue steroids as prespecified intercurrent events.",
    "Clinical resolution plus microbiological eradication at a fixed test-of-cure visit for bacterial conjunctivitis and keratitis, with pathogen-specific eradication rates and susceptibility data.",
    "Central subfield thickness on OCT and other anatomic measures are appropriate as supportive or dose-finding endpoints; they are not accepted as stand-alone primary evidence of clinical benefit for approval.",
    "Vision-related quality-of-life instruments (NEI VFQ-25 and derivatives) require fit-for-purpose validation in the specific population and a justified meaningful within-patient change threshold before they can support labeling claims."
  ],
  "retrievalKeywords": [
    "best corrected visual acuity",
    "etdrs letters",
    "intravitreal injection",
    "anti-vegf",
    "geographic atrophy",
    "fundus autofluorescence",
    "diabetic retinopathy severity scale",
    "intraocular pressure",
    "diurnal iop",
    "ocular hypertension",
    "corneal fluorescein staining",
    "schirmer test",
    "dry eye disease",
    "non-infectious uveitis",
    "sun criteria anterior chamber cell",
    "endophthalmitis",
    "intraocular inflammation",
    "retinal vasculitis",
    "benzalkonium chloride preservative",
    "antimicrobial effectiveness testing",
    "ophthalmic sterility particulate matter",
    "subretinal gene therapy aav",
    "inherited retinal dystrophy",
    "microperimetry",
    "full-field stimulus threshold",
    "study eye designation",
    "reading center grading",
    "nei vfq-25",
    "retinopathy of prematurity",
    "sustained-release ocular implant"
  ]
};

export default ophthalmologyProfile;
