/**
 * Labeling skills: product labeling as the summary of the evidence, by format
 * and region: US prescribing information, pregnancy and lactation content, EU
 * SmPC, OTC Drug Facts, device and IVD labeling, and promotional review.
 *
 * @module server/services/ana/skills/library/labeling
 */

import { skill, type LibrarySkillSource } from '../types.js';

const LABELING_KNOWLEDGE = 'server/services/labeling/labeling-intelligence-knowledge.ts';

export const LABELING_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'labeling',
    name: 'Labeling',
    description:
      'How AnA drafts, reviews and changes product labeling in any region: every claim traced to its data, structure taken from the governing format, figures reconciled with the dossier. Format-specific methods sit under this one.',
    disciplines: ['labeling'],
    useCases: ['drafting', 'review', 'gap-analysis', 'lifecycle-change'],
    triggers: [
      'labeling',
      'labelling',
      'product labeling',
      'product label',
      'package insert',
      'label claim',
      'label claims',
      'labeling claim',
      'carton label',
      'container label',
      'carton and container',
      'patient labeling',
      'medication guide',
      'patient package insert',
      'labeling change',
      'labeling supplement',
      'safety labeling change',
      'class labeling',
      'label negotiation',
      'target labeling',
    ],
    tools: [
      'advise_labeling_structure',
      'plan_labeling_authoring',
      'lookup_published_label',
      'search_drug_labels',
      'check_dossier_consistency',
      'classify_post_submission_change',
    ],
    references: [
      { kind: 'record', id: LABELING_KNOWLEDGE, label: 'Labeling knowledge base (PLR, boxed warning, PLLR, SmPC, OTC)' },
      { kind: 'standard', id: 'cfr_314' },
    ],
    instructions: `
## When this applies
Drafting, reviewing or changing product labeling in any region: which section a statement belongs in, how a label claim is supported, how US and EU formats map onto each other, and what a labeling change sets in motion. The format-specific methods are in the sub-skills.

## Method
1. Establish the product, the region or regions, the application or authorisation the labeling sits under, and which piece of labeling is in hand: prescribing information; patient labeling (Medication Guide, patient package insert, instructions for use); carton and container labels; SmPC and package leaflet; OTC Drug Facts; or a device label and IFU. Follow the matching sub-skill for the format.
2. Treat the labeling as the summary of the evidence. List the claims the draft makes (indication and population, dosing, contraindications, warnings, adverse reaction rates, clinical study results) and, for each, the study report, integrated analysis or nonclinical report it rests on. A claim with no source is flagged, not softened into vaguer words.
3. Take the structure from the engines, not from memory. \`advise_labeling_structure\` explains the US PLR or EU QRD section architecture and routes a piece of content to its section, with the US–EU cross-map. \`plan_labeling_authoring\` returns the mandatory section headers (the section guard) for a US or EU label and checks a draft against them.
4. Check what is already published before drafting against it. \`lookup_published_label\` returns the current DailyMed SPL for a US product (setid, version, published date); \`search_drug_labels\` returns the key sections of FDA labels for a reference product, a comparator or a class. Cite the setid and version you relied on.
5. Reconcile the numbers. Every figure in the label (rates, sample sizes, doses, effect estimates) must equal the figure in its source table. Run \`check_dossier_consistency\` on the draft against the project's artifacts and report each divergence it returns. Do not compute, round or re-derive a figure for the label.
6. For a change to approved labeling, say that it is a post-approval change and what drives it (new safety information, a new indication or population, a class labeling request). \`classify_post_submission_change\` suggests a US supplement or EU variation category from the flags you supply. It is a decision aid; the category is the regulatory team's call under 21 CFR 314.70 for an NDA, 21 CFR 601.12 for a BLA, or the EU variations framework.

## Before answering
- Each claim in the draft or the answer names its source, or is marked unsupported.
- Section placement came from a tool or the governing format.
- Figures were checked against their source, not retyped.
- The region and format followed are stated.

## Not AnA's to decide
- The sponsor's labeling committee decides what to propose; the agency negotiates and approves the final text. AnA drafts and checks.
- Whether a finding belongs in labeling at all is a sponsor and agency judgment; AnA sets out the evidence for it.
- AnA never approves, signs or submits labeling.
`,
  }),

  skill({
    key: 'labeling.us-prescribing-information',
    name: 'US prescribing information (PLR format)',
    description:
      'Writing or reviewing a US prescribing information in PLR format under 21 CFR 201.56 and 201.57: Highlights, the Full Prescribing Information, the boxed warning question, and the SPL file that carries the label to FDA.',
    disciplines: ['labeling'],
    useCases: ['drafting', 'review', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    regions: ['US'],
    triggers: [
      'prescribing information',
      'uspi',
      'plr format',
      'physician labeling rule',
      'highlights of prescribing information',
      'full prescribing information',
      'boxed warning',
      'black box warning',
      'warnings and precautions',
      'adverse reactions section',
      'clinical studies section',
      'dosage and administration',
      'structured product labeling',
      'spl',
      'spl xml',
      '201.57',
      '201.56',
      'rld labeling',
    ],
    tools: [
      'assess_plr_structure',
      'assess_boxed_warning',
      'check_dossier_consistency',
      'search_drug_labels',
      'lookup_published_label',
      'generate_spl',
      'validate_spl',
      'validate_spl_structure',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'record', id: LABELING_KNOWLEDGE, label: 'Labeling knowledge base: PLR structure and boxed warning criteria' },
      { kind: 'standard', id: 'cfr_314' },
    ],
    instructions: `
## When this applies
Writing or reviewing a US prescribing information in PLR format (21 CFR 201.56 and 201.57): Highlights, the Full Prescribing Information (FPI) contents and sections, whether a boxed warning is warranted, and the SPL file that carries the label to FDA.

## Method
1. Establish the product type (drug, biologic, biosimilar, generic), the application (NDA, BLA, ANDA or a labeling supplement), the special populations studied, and whether a boxed warning exists or is proposed. Ask for what the program record does not hold.
2. Run \`assess_plr_structure\` with productType and applicationType, and specialPopulations and hasBoxedWarning when known. Take the Highlights items, the FPI sections and subsections and the formatting rules from its result. When hasBoxedWarning was not stated it returns the Highlights boxed warning as undetermined; report it that way, not as not required.
3. Write the FPI from the evidence, section by section: indications from the populations actually studied; dosage from the doses studied and the exposure-response and pharmacokinetic data; adverse reactions from the pooled safety database with the denominators the integrated safety analysis uses; clinical studies from the adequate and well-controlled studies, each figure taken from its CSR or integrated analysis table. Compare the draft's figures with the project's artifacts using \`check_dossier_consistency\`.
4. Write Highlights last, as a summary of the FPI. Each item says what the FPI says and points to its FPI section; a Highlights statement with no FPI counterpart is a defect.
5. For a boxed warning question, run \`assess_boxed_warning\` with the signal type and severity, and the evidence level, risk mitigation and restricted-approval facts when known. It assesses the signal against the criteria in FDA's guidance on the warnings and precautions, contraindications and boxed warning sections. A criterion whose deciding input was not given comes back as not assessed; report it so. Keep sections 4, 5 and 6 consistent with the box.
6. Section 8 subsections 8.1 to 8.3 follow the pregnancy and lactation method. The other specific populations (pediatric, geriatric, renal and hepatic impairment) come from the studies and analyses that address them.
7. Use precedent where it helps: \`search_drug_labels\` for class or comparator wording, \`lookup_published_label\` for the current published version of a label. ANDA labeling follows the reference listed drug's current labeling, with only the differences 21 CFR 314.94 permits; confirm the RLD version with \`lookup_published_label\`.
8. For the SPL, build it from a structured spec with \`generate_spl\` and check the spec with \`validate_spl\`; an SPL XML file the person already has is checked with \`validate_spl_structure\`. These checks are structural only, not FDA's full SPL validation; say so.
9. When the answer depends on an FDA labeling guidance (Highlights, the adverse reactions or clinical studies sections, boxed warnings), name it by topic and confirm it with \`lookup_fda_guidance\` before citing. If the lookup does not return it, say it needs confirming.

## Pitfalls reviewers raise
- Highlights that do not match the FPI.
- FPI sections renumbered or reordered away from the fixed PLR numbering.
- Adverse reaction rates that do not match the integrated safety tables.
- An indication broader than the population studied.
- Secondary or exploratory results presented in section 14 as established.

## Before answering
- Structure and formatting rules came from \`assess_plr_structure\`.
- Every number in the draft traces to a source table.
- Boxed warning criteria are reported as met, not met or not assessed, as the tool returned them.
- SPL validity is described as structural.

## Not AnA's to decide
- FDA decides the approved labeling, including whether a boxed warning is required.
- The sponsor decides what labeling to propose. AnA does not submit labeling or SPL.
`,
  }),

  skill({
    key: 'labeling.pregnancy-and-lactation',
    name: 'Pregnancy and lactation labeling (PLLR)',
    description:
      'Writing or reviewing sections 8.1 Pregnancy, 8.2 Lactation and 8.3 Females and Males of Reproductive Potential of a US prescribing information, and assembling the nonclinical and human data behind them.',
    disciplines: ['labeling', 'nonclinical'],
    useCases: ['drafting', 'review', 'analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'pllr',
      'pregnancy and lactation',
      'pregnancy labeling',
      'lactation labeling',
      'section 8.1',
      'section 8.2',
      'section 8.3',
      'females and males of reproductive potential',
      'pregnancy category',
      'pregnancy exposure registry',
      'pregnancy registry',
      'breast milk',
      'breastfeeding',
      'lactation study',
      'embryo-fetal toxicity',
      'contraception requirements',
    ],
    tools: [
      'project_knowledge_search',
      'assess_pregnancy_lactation_labeling',
      'design_repro_tox_study',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'S5(R3)' },
      { kind: 'record', id: LABELING_KNOWLEDGE, label: 'Labeling knowledge base: pregnancy and lactation labeling' },
    ],
    instructions: `
## When this applies
Writing or reviewing PLLR content: section 8.1 Pregnancy, 8.2 Lactation and 8.3 Females and Males of Reproductive Potential of a US prescribing information, and the data behind them. Legacy pregnancy letter categories are not used.

## Method
1. Inventory the evidence before writing. From the program's records (search them with \`project_knowledge_search\`): the reproductive and developmental toxicity studies with species, doses and findings; toxicokinetic exposure at those doses; human pregnancy data (exposures in trials, registries, published studies); placental transfer; lactation data (milk concentrations, infant exposure, effects on the breastfed infant and on milk production); fertility findings; and whether the mechanism of action implies developmental risk.
2. Run \`assess_pregnancy_lactation_labeling\` with the stated evidence: the animal study findings, whether human pregnancy data exist, placental transfer and milk excretion status, mechanism-based risk, and whether a pregnancy exposure registry exists. Each of these must be stated; ask for what is missing rather than assuming no.
3. 8.1 Pregnancy. The risk summary integrates the human, animal and pharmacologic data into a statement of risk and carries the background-risk statement the rule requires. Clinical considerations cover disease-associated maternal and fetal risk, dose adjustment, and maternal and fetal adverse reactions where data support them. The data subsection describes the human data and the animal data. Animal doses are expressed relative to human exposure using the multiples in the nonclinical study reports; do not calculate them in the conversation. When a pregnancy exposure registry exists, 8.1 says so and how to enrol.
4. 8.2 Lactation: a risk summary (presence of the drug in milk, effects on the breastfed child, effects on milk production), clinical considerations, and data. Where no human lactation data exist, say so plainly.
5. 8.3: pregnancy testing, contraception and infertility statements follow from the developmental and fertility findings and the mechanism. How long contraception continues after the last dose comes from the program's pharmacokinetic and nonclinical data, not from analogy with another product.
6. If a gap in the nonclinical package limits what 8.1 or 8.3 can say, \`design_repro_tox_study\` lays out the ICH S5(R3) study that would fill it. A missing human lactation study may become a postmarketing requirement; that is FDA's decision.
7. Keep the rest of the label consistent: an embryo-fetal toxicity warning in section 5, any contraindication in section 4, patient counseling in section 17, and Highlights.
8. For an EU SmPC the same evidence goes to section 4.6 (fertility, pregnancy and lactation) and section 5.3 (preclinical safety data); follow the SmPC method for wording conventions.
9. Name FDA's guidance on pregnancy and lactation labeling content, and its guidance on clinical lactation studies, by topic, and confirm each with \`lookup_fda_guidance\` before citing it.

## Before answering
- No pregnancy letter category appears.
- Each risk statement names the data it rests on, human or animal.
- Exposure multiples are quoted from study reports, not computed.
- Missing data are stated as missing, never presented as reassurance.

## Not AnA's to decide
- FDA decides the approved 8.1 to 8.3 text and any pregnancy or lactation postmarketing requirement.
- Whether a developmental finding in animals is relevant to humans is a judgment for the sponsor's nonclinical and clinical experts; AnA sets out the evidence.
`,
  }),

  skill({
    key: 'labeling.eu-smpc',
    name: 'EU SmPC and product information',
    description:
      'Drafting or reviewing an EU Summary of Product Characteristics, labelling and package leaflet under QRD template conventions, with content traced to the dossier and consistent across the product information.',
    disciplines: ['labeling'],
    useCases: ['drafting', 'review'],
    segments: ['pharma', 'biotech'],
    regions: ['EU'],
    triggers: [
      'smpc',
      'summary of product characteristics',
      'qrd template',
      'qrd',
      'package leaflet',
      'patient information leaflet',
      'eu product information',
      'product information annexes',
      'undesirable effects',
      'section 4.8',
      'section 4.4',
      'black triangle',
      'additional monitoring',
      'user testing',
      'readability testing',
      'epar',
    ],
    tools: [
      'structure_smpc',
      'advise_labeling_structure',
      'plan_labeling_authoring',
      'search_ema_epar',
      'assess_readability',
    ],
    references: [
      { kind: 'record', id: 'server/services/labeling/smpc-qrd-catalog.ts', label: 'SmPC QRD section catalog' },
      { kind: 'currency-fact', id: 'eu-pharma-package' },
    ],
    instructions: `
## When this applies
Drafting or reviewing an EU Summary of Product Characteristics, labelling or package leaflet under the QRD template conventions, for a centralised, mutual recognition, decentralised or national procedure.

## Method
1. Establish the procedure, the product type (medicinal product, herbal, homeopathic), whether the product is subject to additional monitoring, and the special populations. Run \`structure_smpc\` with them. It returns sections 1 to 10 with their subsections, the standard statements (the black triangle statement for additional monitoring, the statement on reporting suspected adverse reactions) and procedure-specific notes. Its heading wording is recalled, not checked against the EMA text; tell the person to check headings against the current QRD template.
2. Keep the whole product information in view. For a centralised product it is the SmPC (Annex I), Annex II and the labelling and package leaflet (Annex III). A change to one is checked against the others.
3. Fill the clinical sections from the dossier, each statement traceable: 4.1 from the populations studied; 4.2 from the doses studied; 4.3 and 4.4 from the safety evidence and the safety concerns in the RMP; 4.5 from the interaction studies; 4.6 from the reproductive and lactation data; 4.8 as a tabulated list by MedDRA system organ class with the SmPC frequency categories, frequencies taken from the pooled safety data; 5.1 to 5.3 from the pharmacodynamic, clinical efficacy, pharmacokinetic and preclinical data.
4. When a US prescribing information exists, map content across with \`advise_labeling_structure\` (format smpc, or the content to place). Do not convert the US label section by section; the formats differ in content and placement. \`plan_labeling_authoring\` in eu mode returns the QRD section guard and checks a draft against it.
5. For wording precedent, search centrally authorised products of the same class with \`search_ema_epar\` and cite the EPAR url it returns.
6. The package leaflet is written for patients from the SmPC content and reflects consultation with target patient groups (user testing), as Directive 2001/83/EC requires. \`assess_readability\` gives a reading-level indicator; it does not replace user testing.
7. State the legal base relied on. Directive 2001/83/EC and Regulation (EC) No 726/2004 govern; the EU pharma package is a proposal not yet adopted (fact eu-pharma-package), so do not describe its product-information changes as current law.

## Before answering
- Headings and standard statements came from \`structure_smpc\` and are flagged for checking against the current QRD template.
- Section 4.8 frequencies trace to the pooled safety data.
- SmPC, labelling and package leaflet say the same thing.

## Not AnA's to decide
- The wording is agreed in the procedure, with the CHMP and the Commission or with the member states; QRD and linguistic review are theirs.
- Additional monitoring status is set by the regulators, not chosen by the applicant.
`,
  }),

  skill({
    key: 'labeling.otc',
    name: 'OTC Drug Facts labeling',
    description:
      'US over-the-counter drug labeling: the Drug Facts panel under 21 CFR 201.66 for monograph products and OTC products approved under an application, including Rx-to-OTC switches and the consumer studies behind them.',
    disciplines: ['labeling'],
    useCases: ['drafting', 'review', 'strategy'],
    segments: ['pharma'],
    regions: ['US'],
    triggers: [
      'drug facts',
      'drug facts label',
      'drug facts panel',
      'otc label',
      'otc labeling',
      'over-the-counter label',
      'otc monograph',
      'monograph drug',
      'rx-to-otc switch',
      'otc switch',
      'label comprehension study',
      'self-selection study',
      'actual use study',
      '201.66',
    ],
    tools: ['assess_otc_labeling', 'lookup_fda_guidance', 'assess_readability', 'lookup_published_label'],
    references: [
      { kind: 'record', id: LABELING_KNOWLEDGE, label: 'Labeling knowledge base: OTC Drug Facts' },
    ],
    instructions: `
## When this applies
US over-the-counter drug labeling: the Drug Facts panel under 21 CFR 201.66, for a monograph product or an OTC product approved under an NDA or ANDA, including Rx-to-OTC switches.

## Method
1. Establish the route to market. A monograph product must conform to its OTC monograph. Since the CARES Act (2020) OTC monographs are administrative orders under section 505G of the FD&C Act, so confirm the order that governs the category before citing a 21 CFR monograph part. A product approved under an application labels what its application supports.
2. Run \`assess_otc_labeling\` with the category, active ingredients, dosage form and target population. It returns the Drug Facts headings in their required order, the warnings the ingredients and category require, age-tiered directions, format rules and small-package considerations. Its monograph citations are to the 21 CFR parts; tell the person to check them against the current order.
3. Write each heading from permitted content only. Uses come from the monograph or the approved application; warnings include every one the monograph or an ingredient requires; directions follow the age tiers returned. No claim goes beyond what the monograph or application allows.
4. For a switch or a new OTC application, consumer understanding is evidence: label comprehension, self-selection and actual use studies show whether consumers can choose and use the product safely from the label alone. Name FDA's guidance on these studies by topic and confirm it with \`lookup_fda_guidance\` before citing.
5. Check consumer readability with \`assess_readability\`. The score is an indicator; a comprehension study is the evidence.
6. Compare with marketed products in the category through \`lookup_published_label\`, which also carries OTC labels; cite the setid used.
7. Keep advertising separate: FDA regulates OTC drug labeling, and the Federal Trade Commission oversees OTC drug advertising.

## Before answering
- Headings and their order came from \`assess_otc_labeling\`.
- Each use and warning is permitted by the governing monograph or application.
- Monograph citations are marked for checking against the current order.

## Not AnA's to decide
- Whether a product conforms to a monograph, and whether a switch is approvable, are FDA's determinations.
- Final label text and artwork are approved by the sponsor's authorized reviewers.
`,
  }),

  skill({
    key: 'labeling.device-labeling',
    name: 'Device and IVD labeling',
    description:
      'Labels, instructions for use and other labeling for medical devices and IVDs in the US and EU: required elements, symbols, UDI, IVD package insert content, and how labeling traces to the intended use, risk management and usability record.',
    disciplines: ['labeling', 'device-engineering', 'diagnostics'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['device', 'ivd'],
    triggers: [
      'device labeling',
      'device label',
      'instructions for use',
      'ifu',
      'eifu',
      'udi',
      'unique device identifier',
      'udi-di',
      'gudid',
      'iso 15223',
      'label symbols',
      'symbols glossary',
      'part 801',
      '21 cfr 801',
      'part 809',
      'ivd labeling',
      'ivd package insert',
      'rx only',
      'research use only',
      'investigational device label',
    ],
    tools: ['get_device_labeling', 'check_regulatory_currency', 'validate_udi', 'assess_readability'],
    references: [
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iec_62366_1' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'currency-fact', id: 'eu-eudamed-mandatory' },
      { kind: 'currency-fact', id: 'us-ldt-final-rule-void' },
      { kind: 'record', id: 'shared/regulatory/qmsr-crosswalk.ts', label: 'QMSR crosswalk (labeling and packaging controls)' },
    ],
    instructions: `
## When this applies
Labels, instructions for use and other labeling for a medical device or IVD in the US and the EU: the required elements, symbols, UDI, IVD package insert content, and how labeling ties back to the intended use, the risk file and usability.

## Method
1. Establish the device facts (sterile, single use or reusable, implantable, prescription, investigational, expiry, contains a medicinal substance), whether it is an IVD, and the markets. Run \`get_device_labeling\` with every fact stated: it treats an unstated fact as false. It returns the 21 CFR Part 801 label elements, the EU MDR Annex I label and IFU elements, the ISO 15223-1 symbols and reviewer questions.
2. IVDs. In the US, IVD labeling content is set by 21 CFR Part 809: intended use, reagents, specimen, procedure, results, limitations, performance characteristics and the rest of the package insert. Research-use-only and investigational-use-only products carry the statements Part 809 prescribes and make no clinical claim. In the EU, IVDR Annex I Chapter III sets label and IFU content. For a laboratory-developed test, the 2024 LDT final rule was vacated (fact us-ldt-final-rule-void); confirm its status with \`check_regulatory_currency\` and do not apply device labeling requirements to an LDT on the strength of that rule.
3. Investigational devices carry the labeling 21 CFR Part 812 requires; in the EU, a device for clinical investigation follows the MDR's investigation requirements.
4. Trace labeling content to the design record. Indications and contraindications match the cleared or approved intended use. Warnings and precautions trace to the risk management file, where information for safety is a risk control under ISO 14971. IFU steps match the user interface validated under IEC 62366-1. A warning that answers no identified hazard, or a hazard controlled by labeling that the IFU does not mention, is a gap.
5. Symbols: use ISO 15223-1 symbols with their defined meaning. In the US, a symbol used without adjacent explanatory text is allowed only under the conditions 21 CFR Part 801 sets, which include an established standard for the symbol and a symbols glossary; check them before relying on a symbol alone.
6. UDI: check each carrier string with \`validate_udi\` (GS1 check digit and application identifiers; HIBCC and ICCBBA carriers are detected but not parsed). Device identifier data go to GUDID in the US (21 CFR Part 830) and to EUDAMED in the EU. Check EUDAMED's current status with \`check_regulatory_currency\` (fact eu-eudamed-mandatory) rather than quoting a date.
7. Under the QMSR, labeling and packaging controls are 21 CFR 820.45 (formerly 820.120 and 820.130). Cite them that way, never the removed sections as current (fact us-qmsr).
8. For lay-user IFUs, \`assess_readability\` gives a reading-level indicator; usability validation is the evidence that users can follow them.

## Before answering
- The element list came from \`get_device_labeling\` with every fact stated.
- No labeling claim goes beyond the cleared or approved intended use.
- Removed QSR sections appear only as "formerly".

## Not AnA's to decide
- Whether a labeling change alters the intended use and needs a new 510(k), a PMA supplement or notified body review is the manufacturer's regulatory determination, and finally the agency's or notified body's.
- Release of labeling under the quality system is the manufacturer's quality function.
`,
  }),

  skill({
    key: 'labeling.promotional-review',
    name: 'Promotional material review',
    description:
      'Reviewing promotional labeling and advertising before medical, legal and regulatory review: consistency with approved labeling, fair balance, substantiation of each claim, and the region-specific promotion rules.',
    disciplines: ['labeling', 'regulatory-strategy'],
    useCases: ['review'],
    triggers: [
      'promotional review',
      'promotional material',
      'promotional materials',
      'promotional labeling',
      'promotional claim',
      'fair balance',
      'opdp',
      'aplb',
      'form 2253',
      'mlr review',
      'medical legal regulatory',
      'advertising review',
      'direct-to-consumer',
      'dtc advertising',
      'off-label promotion',
      'comparative claim',
      'superiority claim',
      'detail aid',
    ],
    tools: [
      'global_ri_promotional_compliance',
      'lookup_published_label',
      'search_drug_labels',
      'verify_citations',
      'screen_promotional_language',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'record', id: 'server/services/global-ri/promotional-compliance.ts', label: 'Promotion rule sets (FDA, EU)' },
    ],
    instructions: `
## When this applies
Reviewing promotional labeling and advertising (detail aids, websites, journal and broadcast advertising, social media, congress material) for consistency with approved labeling, fair balance and substantiation, before the piece goes to the company's medical, legal and regulatory review.

## Method
1. Establish the claims base: the approved or cleared labeling and indications in the market concerned, the audience (healthcare professionals or consumers), the medium and the region. An investigational product is not promoted: 21 CFR 312.7 prohibits promoting an investigational drug as safe or effective for the use under investigation.
2. Get the region's rule set from \`global_ri_promotional_compliance\` (FDA or EU) and work through each rule with its citation: consistency with the approved labeling; no promotion of unapproved uses; substantial evidence for efficacy claims; fair balance and risk disclosure; submission to FDA on Form FDA 2253 at first use; and, in the EU, the advertising provisions of Directive 2001/83/EC, including the ban on advertising prescription-only medicines to the public.
3. Pull the reference labeling: \`lookup_published_label\` for the current US label (cite setid and version) and \`search_drug_labels\` for its key sections.
4. Go claim by claim. For each: is it within the approved indication, population and dosing; what evidence supports it; does the cited source say what the piece says. Check the references with \`verify_citations\` and report its verdicts. A comparative or superiority claim needs evidence that supports the comparison as worded, normally from head-to-head studies.
5. Run \`screen_promotional_language\` on the copy. It flags superlatives, absolutes, unqualified safety claims, overreach and unsupported comparatives, each with category, severity and a suggested fix. It is a screen, not a judgment; report each flag and what would resolve it.
6. Check fair balance as presented, not only as present: risk information comparable in prominence and readability to the benefit claims, and for broadcast the major statement and adequate provision for the full labeling.
7. Devices and IVDs: claims stay within the cleared or approved indications for use; a claim that changes the intended use can need its own clearance or approval.
8. Name FDA guidance on promotion (for example on communications consistent with labeling, or on presenting risk information) by topic, and confirm it with \`lookup_fda_guidance\` before citing.

## Before answering
- Each claim is mapped to the labeling and to a verified source, or flagged.
- Screening results are reported as flags, not verdicts.
- The region's rules came from the tool, with their citations.

## Not AnA's to decide
- Approval of the piece is the company's medical, legal and regulatory review; AnA prepares that review.
- Whether material is false, misleading or violative is for the regulators (FDA's OPDP or APLB, national competent authorities) and the company's counsel.
`,
  }),
];
