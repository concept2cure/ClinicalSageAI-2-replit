/**
 * Device design and engineering skills: design controls under the QMSR, ISO 14971
 * risk management, software and AI, cybersecurity, usability, nonclinical safety
 * testing, 510(k) substantial equivalence, clinical evidence, changes and
 * postmarket duties, unique device identification and establishment
 * registration, and the device constituent of drug-delivery combination products.
 *
 * Every figure, class, pathway and verdict these methods mention comes from the
 * engine named at that step; the methods say what to establish and in which order.
 * Quality-system citations follow the QMSR crosswalk (shared/regulatory/qmsr-crosswalk.ts):
 * since 2026-02-02 design and development is ISO 13485:2016 clause 7.3 via
 * 21 CFR 820.10(c), and 21 CFR 820.30 is named only as "formerly".
 *
 * @module server/services/ana/skills/library/device
 */

import { skill, type LibrarySkillSource } from '../types.js';

const QMSR_CROSSWALK = 'shared/regulatory/qmsr-crosswalk.ts';
const DEVICE_CLASS = 'shared/regulatory/device-class.ts';
const DESIGN_TRACE = 'shared/regulatory/design-controls-trace.ts';

export const DEVICE_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'device',
    name: 'Device design and engineering',
    description:
      'The spine of a medical device or IVD submission: intended use and classification first, then design controls, risk management and verification and validation, mapped to what the reviewer will ask. Use to plan or gap-check a device program as a whole; the sub-skills carry each part.',
    disciplines: ['device-engineering', 'regulatory-strategy'],
    useCases: ['strategy', 'gap-analysis', 'review', 'submission-assembly'],
    segments: ['device', 'ivd'],
    triggers: [
      'medical device',
      'device program',
      'device submission',
      'device development',
      'device engineering',
      'device design',
      'device blueprint',
      'device evidence',
      'evidence modules',
      'verification and validation',
      'device reviewer checklist',
      'eu mdr',
      '2017/745',
      'medical device regulation',
    ],
    tools: [
      'classify_device',
      'select_device_pathway',
      'build_device_blueprint',
      'plan_device_submission',
      'check_regulatory_currency',
      'assess_essential_principles',
      'get_device_reviewer_checklist',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'currency-fact', id: 'fda-estar-510k-mandatory' },
      { kind: 'currency-fact', id: 'fda-estar-denovo-mandatory' },
      { kind: 'record', id: DEVICE_CLASS, label: 'Device and IVD class vocabularies (US, EU MDR, EU IVDR)' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: ISO 13485:2016 clauses and the removed QSR sections' },
    ],
    instructions: `
## When this applies
A medical device or IVD program as a whole: what the submission must contain, which evidence modules apply, and where the gaps are. Each part (design controls, risk management, software, cybersecurity, usability, nonclinical safety testing, substantial equivalence, clinical evidence, changes) has its own skill; this one sets the order.

## Method
1. Establish the intended use and indications for use from the program record, in the sponsor's words. Classification, pathway and every evidence module follow from them; when they are missing or vague, ask before going further.
2. Establish the class and pathway with the engines, not from memory: \`classify_device\` (framework \`fda\`, \`mdr\` or \`ivdr\`) for the class or US pathway from stated facts, and \`select_device_pathway\` for the US premarket route and the EU conformity-assessment route. When an engine returns undetermined with missing facts, say the class or pathway is not determined and ask for those facts. The device-class record holds the vocabularies (US class I to III, the MDR declared classes, IVDR classes A to D); anything outside them is not a class.
3. Build the evidence map with \`build_device_blueprint\` for the submission type, passing what is known about body contact, software, electrical power and sterility so the applicable modules are switched on. Use \`plan_device_submission\` when the person needs the content list and sequence for the chosen pathway.
4. Treat design controls, risk management and verification and validation as one chain: user needs and intended use become design inputs, risk controls become design inputs too, outputs are verified against inputs, and the device is validated against user needs and intended use. Hand each link to its sub-skill.
5. Cite quality-system requirements under the QMSR. Since 2026-02-02, 21 CFR 820 incorporates ISO 13485:2016 by reference (currency fact us-qmsr; confirm with \`check_regulatory_currency\`). Design and development is ISO 13485:2016 clause 7.3, reached through 21 CFR 820.10(c). Take every citation from the QMSR crosswalk; a removed QSR section such as 820.30 is named only as "formerly". When a tool result cites a removed section, restate it through the crosswalk.
6. For the EU, build the general safety and performance requirements matrix with \`assess_essential_principles\`; a row whose device property was not stated is not assessed, never "not applicable".
7. Pre-empt the review with \`get_device_reviewer_checklist\` for the submission type, and use its questions to find what the program has not yet answered.
8. For any FDA guidance the answer leans on, name it by topic and check it with \`lookup_fda_guidance\`; when the lookup does not confirm it, say the guidance needs confirming. eSTAR is mandatory for 510(k) and De Novo submissions (currency facts fda-estar-510k-mandatory and fda-estar-denovo-mandatory).

## Before answering
- The class, pathway and applicable modules came from an engine result, or the answer says they are not determined and what is missing.
- Every quality-system citation is a QMSR and ISO 13485:2016 citation; no removed QSR section is presented as current.
- The answer says which market (US, EU or both) it addresses.
- Figures such as review clocks or sample sizes appear only as an engine returned them.

## Not AnA's to decide
- Classification and pathway are FDA's or the notified body's determination; engine results are decision aids. A 513(g) request or a Pre-Submission is how a sponsor gets FDA's view.
- Whether a design is acceptable and released is the sponsor's decision, through its own design reviews and signatures.
- AnA does not sign, approve or submit anything.
`,
  }),

  skill({
    key: 'device.design-controls',
    name: 'Design controls and traceability',
    description:
      'Design and development under the QMSR (ISO 13485:2016 clause 7.3): planning, inputs, outputs, review, verification, validation, transfer, changes and the design and development files, with the trace from user need to validated device.',
    disciplines: ['device-engineering', 'quality-systems'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['device', 'ivd'],
    documentTypes: ['US_DHF'],
    triggers: [
      'design controls',
      'design control',
      'design inputs',
      'design input',
      'design outputs',
      'design output',
      'design review',
      'design reviews',
      'design verification',
      'design validation',
      'design transfer',
      'design change',
      'design history file',
      'dhf',
      'design and development',
      'design and development file',
      'design and development plan',
      'traceability matrix',
      'trace matrix',
      'user needs',
      'v&v',
      '820.30',
    ],
    tools: [
      'check_regulatory_currency',
      'assess_qms',
      'assess_device_constituent_controls',
      'get_device_reviewer_checklist',
    ],
    references: [
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: ISO 13485:2016 clause 7.3 subclauses and the former 820.30 paragraphs' },
      { kind: 'record', id: DESIGN_TRACE, label: 'Design-controls trace semantics: when a design input counts as verified' },
    ],
    instructions: `
## When this applies
Planning, writing or gap-checking design and development records for a device or IVD: the plan, design inputs and outputs, design reviews, verification and validation, transfer, design changes, and the trace that ties them together.

## Method
1. Cite the requirement correctly before anything else. Under the QMSR (in force since 2026-02-02, currency fact us-qmsr) design and development is ISO 13485:2016 clause 7.3, reached through 21 CFR 820.10(c), which also sets which devices it applies to. Take each subclause from the QMSR crosswalk: planning 7.3.2, inputs 7.3.3, outputs 7.3.4, review 7.3.5, verification 7.3.6, validation 7.3.7, transfer 7.3.8, changes 7.3.9, design and development files 7.3.10. 21 CFR 820.30 is named only as "formerly". The QMSR does not use the terms design history file, device master record or device history record; use them only as the person's own labels for records. When the person's documents still cite the QSR, confirm the status with \`check_regulatory_currency\` and say what the current citation is.
2. Establish the plan: the stages, the reviews at each stage, verification, validation and transfer activities, responsibilities, and the means of traceability. \`assess_qms\` returns the clause structure with auditor questions; pass \`present_clause_ids\` to gap-check a quality system the person describes.
3. Establish design inputs from intended use and user needs (functional, performance, usability and safety requirements), applicable regulatory requirements and standards, and the outputs of risk management. Inputs are reviewed and approved, and each is complete, unambiguous, able to be verified or validated, and not in conflict with another.
4. Establish outputs in a form that can be verified against the inputs: they meet the inputs, give the information purchasing, production and servicing need, contain or reference acceptance criteria, and specify the characteristics essential for safe and proper use.
5. Keep verification and validation apart. Verification shows outputs meet inputs. Validation shows the device meets user needs and intended use, on representative product (initial production units, batches or their equivalents, with the choice recorded), and includes clinical or performance evaluation as regulatory requirements demand; human factors validation belongs here too (human-factors skill). One passing never discharges the other.
6. Build the trace with the platform's rule (design-controls trace record): a design input is fully traced only when an output exists for it and both verification and validation are recorded as passed. A recorded result that is not a pass is in progress; a filled field is not a pass. Report the state per row.
7. Design reviews are recorded with what was reviewed, the participants, and the decisions and actions that followed.
8. Transfer confirms outputs are suitable for manufacturing before they become final production specifications. A design change is assessed for its effect on function, performance, usability, safety, regulatory requirements, product already made or delivered, and risk management, then verified or validated as appropriate and approved before implementation. For a marketed device the same change raises the submission question (changes-and-postmarket skill).
9. For the device constituent of a combination product, \`assess_device_constituent_controls\` lays out the design-control program; restate its 820.30 citations through the QMSR crosswalk.
10. Before a submission, run \`get_device_reviewer_checklist\` for the submission type and check that each design-control question it raises is answered by a record.

## Pitfalls reviewers raise
- Inputs that cannot be verified ("easy to use", "robust") with no measurable criterion.
- Verification evidence offered as validation, or validation on prototypes not shown to represent production.
- Risk controls that never became design inputs, so their verification cannot be traced.

## Before answering
- Every citation is ISO 13485:2016 clause 7.3.x via 21 CFR 820.10(c); 820.30 appears only as "formerly".
- Verification and validation are reported separately, and trace states follow the outcome rule.

## Not AnA's to decide
- Approving inputs, outputs, reviews and changes belongs to the people the sponsor's procedures name; AnA drafts and checks, never signs.
- Whether a quality system conforms is an auditor's or FDA investigator's finding.
`,
  }),

  skill({
    key: 'device.risk-management',
    name: 'Risk management (ISO 14971)',
    description:
      'The ISO 14971:2019 process for a device or IVD: the plan, hazards and hazardous situations, risk estimation and evaluation, risk control, residual and overall residual risk, the risk management review, and production and post-production information. Use to write or gap-check a risk management file.',
    disciplines: ['device-engineering', 'quality-systems'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['device', 'ivd'],
    documentTypes: ['ISO_RMF'],
    triggers: [
      'iso 14971',
      '14971',
      'risk management file',
      'risk management plan',
      'risk management report',
      'hazard analysis',
      'hazardous situation',
      'hazardous situations',
      'risk control measure',
      'risk control measures',
      'residual risk',
      'overall residual risk',
      'risk acceptability',
      'risk acceptability criteria',
      'fmea',
      'dfmea',
      'pfmea',
      'fault tree analysis',
      'risk matrix',
      'post-production information',
      'afap',
      'as far as possible',
      '24971',
      'rmf',
    ],
    tools: [
      'assess_device_evidence_structure',
      'search_device_adverse_events',
      'search_device_recalls',
      'assess_essential_principles',
    ],
    references: [
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
    ],
    instructions: `
## When this applies
Writing, structuring or gap-checking the risk management file for a device or IVD, or answering how a hazard, a risk control or a residual risk is handled under ISO 14971:2019.

## Method
1. Establish the market first, because the risk-acceptability policy differs between jurisdictions. \`assess_device_evidence_structure\` with \`document: 'rmf'\` and the \`jurisdiction\` returns the file's structure and that jurisdiction's acceptability policy, including whether cost may justify stopping risk reduction. Without a jurisdiction it returns no policy, so ask which market the file is for. Pass \`present_section_ids\` to gap-check an existing file.
2. Check the risk management plan: scope and life-cycle phases, responsibilities and authorities, requirements for review, criteria for risk acceptability based on the manufacturer's policy (including when the probability of harm cannot be estimated), the method and criteria for evaluating overall residual risk, verification of risk controls, and how production and post-production information is collected and reviewed. The criteria are the manufacturer's; AnA never supplies numbers for a risk matrix.
3. Risk analysis: intended use and reasonably foreseeable misuse, the characteristics related to safety, then hazards, the sequences of events that lead to hazardous situations, and the harms that may result. Keep hazard, hazardous situation and harm distinct. FMEA and fault tree analysis feed the analysis; a failure-mode table alone is not a hazard analysis. Use-related hazards come from usability engineering (human-factors skill); security threats that can affect safety come from the security risk process (cybersecurity skill).
4. Bring in information on similar devices to inform hazard identification: \`search_device_adverse_events\` (MAUDE) and \`search_device_recalls\` for the device type. Report what each search returned and its scope; an empty result is not evidence that a hazard is absent.
5. Risk estimation and evaluation: each risk is estimated from the probability of occurrence of harm and its severity on the plan's scales, and evaluated against the plan's criteria. Where probability cannot be estimated, the plan's rule for that case applies.
6. Risk control: consider options in the standard's priority order: inherent safety by design and manufacture, then protective measures in the device or the manufacturing process, then information for safety and, where appropriate, training. Verify each control's implementation and its effectiveness, and check whether a control introduces new hazards or changes other risks. Controls become design inputs and their verification sits in the design records.
7. Residual risk: evaluate each residual risk against the criteria. When one is not acceptable and further control is not practicable, a benefit-risk analysis of that risk is needed. Then evaluate the overall residual risk by the plan's method, and disclose significant residual risks in the information for users.
8. Risk management review before release: the plan was carried out, the overall residual risk is acceptable, and methods are in place to collect and review production and post-production information. The report records the conclusion.
9. Production and post-production: complaints, adverse events, trends, published literature and changes in the state of the art are reviewed, and the file is updated when they change an estimate or reveal a new hazard.
10. For an EU file, check the risk rows of the general safety and performance requirements with \`assess_essential_principles\`; a GSPR matrix without a risk management file is not complete.

## Pitfalls reviewers raise
- Acceptability criteria missing, or not tied to the manufacturer's policy.
- Hazards listed without the hazardous situations and harms that connect them.
- Information for safety used as the main control where a design control was practicable.
- Controls shown as implemented but not shown as effective.
- Overall residual risk asserted without the method the plan named.

## Before answering
- No risk score, probability band or acceptability threshold appears unless it came from the person's plan or a tool.
- The answer names the market whose acceptability policy it applied, as the tool returned it.
- Hazard, hazardous situation and harm are not used interchangeably.

## Not AnA's to decide
- Whether a risk, or the overall residual risk, is acceptable is the manufacturer's decision, made by the people its plan names. AnA lays out the analysis.
- The benefit-risk judgment for marketing is the agency's or notified body's.
`,
  }),

  skill({
    key: 'device.software-and-ai',
    name: 'Device software, SaMD and AI-enabled devices',
    description:
      'Software functions and software as a medical device: whether a function is a device, its IMDRF SaMD category, the IEC 62304 life cycle and software safety class, FDA software documentation, AI/ML-enabled devices, good machine learning practice, predetermined change control plans, and the EU AI Act where it applies.',
    disciplines: ['device-engineering'],
    useCases: ['strategy', 'drafting', 'review', 'gap-analysis'],
    segments: ['device', 'ivd'],
    documentTypes: ['US_PCCP'],
    triggers: [
      'samd',
      'software as a medical device',
      'iec 62304',
      '62304',
      'software safety class',
      'documentation level',
      'software function',
      'device software',
      'clinical decision support',
      'cds software',
      'ai/ml',
      'ai-enabled device',
      'machine learning device',
      'predetermined change control plan',
      'pccp',
      'gmlp',
      'good machine learning practice',
      'samd category',
      'locked algorithm',
      'adaptive algorithm',
      'model retraining',
      'ai act',
      'software of unknown provenance',
      'soup',
    ],
    tools: [
      'lookup_fda_guidance',
      'classify_samd',
      'build_device_blueprint',
      'assess_ai_ml_device',
      'assess_gmlp',
      'design_samd_clinical_validation',
      'design_pccp',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'standard', id: 'iec_62304' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'currency-fact', id: 'eu-ai-act-high-risk' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk, for restating design-control citations in tool results' },
    ],
    instructions: `
## When this applies
A device that is or contains software, a software function whose device status is in question, or an AI/ML-enabled device: how the software is classified, its IEC 62304 life cycle, what the submission documents, clinical validation, and how model changes are controlled after authorization.

## Method
1. Establish whether the function is a device. Section 520(o) of the FD&C Act excludes some software functions from the device definition, including certain clinical decision support. FDA's guidances on clinical decision support software and on device software functions explain how FDA applies it; name them by topic and check them with \`lookup_fda_guidance\`, saying when they cannot be confirmed.
2. Establish whether it is software as a medical device (standalone) or software in a device. \`classify_samd\` returns the IMDRF category from the state of the healthcare situation and the significance of the information the software provides. Report the category with its inputs. It is not the US or EU class; any class or pathway it suggests is informational, and the class comes from the device classification method.
3. Establish the IEC 62304 software safety class (A, B or C) from what a software failure could contribute to, after risk controls external to the software, through the risk management process. \`build_device_blueprint\` with its \`software\` facts returns the class and the deliverables expected for it; the class decides which life-cycle activities and documents are required. Identify software of unknown provenance and assess its risks.
4. For a US submission, FDA's guidance on the content of premarket submissions for device software functions sets a documentation level by risk; check it with \`lookup_fda_guidance\` before citing. Software development sits within design controls under the QMSR (ISO 13485:2016 clause 7.3, currency fact us-qmsr); when a tool result cites 21 CFR 820.30, restate it through the QMSR crosswalk.
5. For an AI/ML-enabled device, run \`assess_ai_ml_device\` (locked, adaptive or hybrid behaviour, autonomy, transparency, data representativeness, external validation, monitoring) and \`assess_gmlp\` against the ten good machine learning practice principles. Report each finding as returned; the GMLP score is the tool's rubric, not a regulatory verdict.
6. Clinical evidence for SaMD: \`design_samd_clinical_validation\` structures valid clinical association, analytical (technical) validation and clinical validation, scaled to the IMDRF category. Check that test data are independent of training data, that the reference standard is defensible, and that subgroup performance is reported. Reader-study design belongs to the clinical-evidence skill.
7. Planned model changes: when the sponsor wants to update the model without a new submission for each change, \`design_pccp\` builds the description of modifications, the modification protocol and the impact assessment, and flags changes outside a plan's envelope (a change in intended use, for example) that need a new marketing submission. A PCCP is authorized as part of a marketing submission; changes outside it follow the changes-and-postmarket method.
8. EU: software is classified under the MDR or IVDR rules like any device. An AI system that is a medical device, or a safety component of one, may also fall under the EU AI Act's high-risk requirements. Check the status with \`check_regulatory_currency\` (currency fact eu-ai-act-high-risk), report it with its caveat as returned, and confirm which application date applies to a device AI system against the Regulation's own transitional provisions before stating one.
9. Cybersecurity of connected software is the cybersecurity skill's; usability of the interface is the human-factors skill's.

## Pitfalls reviewers raise
- Intended use and the clinical role of the output described loosely, so the category and the evidence plan cannot be checked.
- Test data not independent of training data, or no external validation.
- Performance reported overall but not for clinically relevant subgroups.
- A PCCP that describes modifications without a protocol and acceptance criteria to verify them.

## Before answering
- The IMDRF category, software safety class, GMLP findings and PCCP envelope come from the tools, with their inputs stated.
- No AI Act date is stated without the currency check and its caveat.
- Device status of a software function is presented as FDA's determination, with the excluding criteria named.

## Not AnA's to decide
- Whether a software function is a device, its class, and whether a PCCP is acceptable are FDA's or the notified body's decisions.
- Acceptance criteria for model performance are the sponsor's, pre-specified and justified; AnA does not supply them.
`,
  }),

  skill({
    key: 'device.cybersecurity',
    name: 'Device cybersecurity',
    description:
      'Cybersecurity for a device or IVD with software: whether it is a cyber device under FD&C Act section 524B, threat modeling, security risk management, the software bill of materials, security testing, and postmarket vulnerability management.',
    disciplines: ['device-engineering'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['device', 'ivd'],
    documentTypes: ['US_CYBERSECURITY'],
    triggers: [
      'cybersecurity',
      'cyber device',
      '524b',
      'section 524b',
      'sbom',
      'software bill of materials',
      'threat model',
      'threat modeling',
      'threat modelling',
      'penetration testing',
      'pen testing',
      'vulnerability management',
      'vulnerability disclosure',
      'coordinated vulnerability disclosure',
      'security risk management',
      'secure product development framework',
      'spdf',
      'tir57',
      'iec 81001-5-1',
      'patch management',
      'security architecture',
      'security updates',
    ],
    tools: ['assess_device_cybersecurity', 'lookup_fda_guidance', 'assess_essential_principles'],
    references: [
      { kind: 'standard', id: 'fdc_524b' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iec_62304' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk, for restating design-control citations in tool results' },
    ],
    instructions: `
## When this applies
A device or IVD that includes software and can connect, directly or through another system, to a network: deciding whether section 524B applies, planning or reviewing the premarket cybersecurity documentation, and setting up postmarket vulnerability management.

## Method
1. Establish whether the device is a cyber device under section 524B of the FD&C Act: it includes software validated, installed or authorized by the sponsor as or in a device, it can connect to the internet, and it has technological characteristics that could be vulnerable to cybersecurity threats. \`assess_device_cybersecurity\` makes that determination from stated facts and returns the obligations it triggers; report its finding and the facts it rested on.
2. For a cyber device the statute requires the submission to include a plan to monitor, identify and address postmarket vulnerabilities and exploits, including coordinated vulnerability disclosure; processes that give reasonable assurance the device and related systems are cybersecure, with postmarket updates and patches; and a software bill of materials covering commercial, open-source and off-the-shelf components. Report the tool's status for each requirement rather than asserting it is met.
3. Whether or not 524B applies, FDA's guidance on cybersecurity in medical devices sets premarket expectations for devices with cybersecurity risk. Name it by topic and check it with \`lookup_fda_guidance\`, saying when it cannot be confirmed. When the tool's citations include 21 CFR 820.30, restate them under the QMSR (ISO 13485:2016 clause 7.3).
4. Security risk management is its own process, linked to ISO 14971 safety risk management but distinct from it: threats and vulnerabilities are assessed for exploitability and impact, and those that could lead to patient harm are carried into the safety risk file. Check that the threat model covers the whole system (device, interfaces, cloud services and update paths), that each security control traces to the threats it addresses, and that testing, including penetration testing, shows the controls work.
5. Software bill of materials: each component is identified with its supplier, version and support status, and known vulnerabilities in components are assessed. The tool returns the elements expected.
6. Labeling and user information: what users need to operate the device securely, and how and when updates reach them.
7. Postmarket: a vulnerability that could cause harm is handled through complaints, CAPA and, where required, correction and reporting (changes-and-postmarket skill). Patches still go through design change control.
8. EU: the MDR and IVDR general safety and performance requirements for software include IT security; the software row of \`assess_essential_principles\` carries it.

## Pitfalls reviewers raise
- A threat model limited to the device, leaving out servers, apps and update infrastructure.
- An SBOM without support status or a vulnerability assessment of its components.
- Security risks assessed only with the safety risk scale, so exploitability is never considered.
- No evidence that security controls were tested.

## Before answering
- The cyber-device determination and per-requirement status come from \`assess_device_cybersecurity\` with its inputs.
- Statutory requirements are described as the statute's, and guidance expectations as guidance, not mixed.

## Not AnA's to decide
- Whether the documentation is adequate is FDA's or the notified body's finding.
- Disclosure of a vulnerability and the decision to patch, correct or recall are the manufacturer's; AnA drafts and analyses.
`,
  }),

  skill({
    key: 'device.human-factors',
    name: 'Human factors and usability engineering',
    description:
      'IEC 62366-1 usability engineering and FDA human factors expectations for a device, an IVD or the device constituent of a combination product: use specification, use-related risk analysis, critical tasks, formative evaluation and summative (validation) testing.',
    disciplines: ['device-engineering'],
    useCases: ['study-design', 'drafting', 'review'],
    triggers: [
      'human factors',
      'usability engineering',
      'usability',
      'iec 62366',
      '62366',
      'use error',
      'use errors',
      'use-related risk analysis',
      'urra',
      'critical task',
      'critical tasks',
      'formative evaluation',
      'formative study',
      'summative validation',
      'summative study',
      'hf validation',
      'human factors validation',
      'use specification',
      'known use problems',
      'simulated use',
      'hfe',
      'task analysis',
      'instructions for use testing',
    ],
    tools: ['design_human_factors_study', 'classify_combination_product', 'lookup_fda_guidance'],
    references: [
      { kind: 'standard', id: 'iec_62366_1' },
      { kind: 'standard', id: 'iso_14971' },
    ],
    instructions: `
## When this applies
Planning or reviewing usability engineering for a device, an IVD used by professional or lay users, or the device constituent of a combination product: the use specification, use-related risk analysis, critical tasks, formative work and the summative (human factors validation) test.

## Method
1. Establish the use specification: intended users, divided into distinct user groups wherever their characteristics could change how they interact with the device; use environments; the user interface, including labeling, instructions for use and training; and the medical indication. Each distinct group needs its own representation in validation.
2. Collect known use problems for similar devices and earlier versions (complaints, adverse event reports, the literature) to seed the analysis.
3. Run the use-related risk analysis: tasks from a task analysis, the use errors possible at each, the hazardous situations and harms that could follow, and the controls. Critical tasks are those where a use error, or failure to perform the task, could cause serious harm, including compromised medical care. The use-related risk analysis is part of the ISO 14971 risk file, not a separate record that can disagree with it.
4. Formative evaluations shape the design: early, iterative, used to find use problems and refine the interface. They do not validate it.
5. The summative (human factors validation) test shows that representative users of each group can perform the critical tasks safely and effectively, in representative use conditions, with production-equivalent devices, the final labeling and the training real users will get. \`design_human_factors_study\` returns the user groups, participants per group, the total, critical-task handling and whether a full summative test is required. Report those as returned, with the inputs used; never supply a participant number from memory.
6. Analyse every use error, close call and difficulty on a critical task for its root cause, using the participants' own accounts, and record the evaluation of the residual use-related risk and any design change and retest it leads to.
7. For a combination product, establish what the product is first with \`classify_combination_product\`. Human factors work focuses on the device constituent and how users handle it with the drug or biologic.
8. FDA's guidance on applying human factors and usability engineering to medical devices, and its guidance on human factors for combination products, set the content expected. Name them by topic and check them with \`lookup_fda_guidance\`, saying when they cannot be confirmed.

## Pitfalls reviewers raise
- Critical tasks not derived from the use-related risk analysis, or the analysis and the risk file disagree.
- Validation participants who are not representative, for example trained beyond what real users receive.
- Use errors on critical tasks attributed to the participant without root-cause analysis.
- Instructions for use and training left out of what was validated.

## Before answering
- Participant numbers and the need for a summative test are those \`design_human_factors_study\` returned.
- Formative and summative work are not conflated.
- Each critical task traces to a use-related hazard and to a validation result.

## Not AnA's to decide
- Whether residual use-related risk is acceptable is the manufacturer's decision; whether the validation is adequate is FDA's or the notified body's.
- The protocol and report are approved by the sponsor's signers; AnA drafts and reviews.
`,
  }),

  skill({
    key: 'device.biocompatibility-and-safety-testing',
    name: 'Biocompatibility, sterilization and electrical safety',
    description:
      'Nonclinical device testing planned through risk management: the ISO 10993-1 biological evaluation, sterilization and sterile packaging validation, and IEC 60601 electrical safety and EMC. The endpoints, governing standards and test categories come from the engines.',
    disciplines: ['device-engineering', 'nonclinical'],
    useCases: ['study-design', 'review', 'gap-analysis'],
    segments: ['device'],
    triggers: [
      'biocompatibility',
      'iso 10993',
      '10993',
      'biological evaluation',
      'biological evaluation plan',
      'cytotoxicity testing',
      'sensitization testing',
      'irritation testing',
      'hemocompatibility',
      'haemocompatibility',
      'chemical characterization',
      'toxicological risk assessment',
      'sterilization validation',
      'sterility assurance level',
      'ethylene oxide',
      'eo residuals',
      'iso 11135',
      'iso 11137',
      'iso 11607',
      'sterile barrier',
      'electrical safety',
      'iec 60601',
      '60601',
      'electromagnetic compatibility',
      'emc testing',
    ],
    tools: [
      'build_device_blueprint',
      'get_biocompatibility_endpoints',
      'lookup_fda_guidance',
      'get_sterilization_requirements',
      'get_electrical_standards',
    ],
    references: [
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iso_13485' },
    ],
    instructions: `
## When this applies
Planning or reviewing the nonclinical safety testing of a device: the biological evaluation of patient-contacting materials, sterilization and sterile packaging, and electrical safety and electromagnetic compatibility.

## Method
1. Establish the device facts the engines need before any test list: the nature and duration of body contact for each component, whether the device is supplied sterile and by which method, and whether it is electrically powered (and whether it has alarms, is used at home or by emergency services, or has closed-loop control or a particular standard). \`build_device_blueprint\` switches each module on from these facts.
2. Biological evaluation is planned and concluded within the ISO 14971 risk management process, not as a fixed test battery. \`get_biocompatibility_endpoints\` returns the ISO 10993-1 endpoints to address for the contact nature and duration; report them as returned. For each endpoint the biological evaluation plan says whether it is addressed by testing, by existing data (material history, chemical characterization with a toxicological risk assessment), or by a written justification. The evaluation covers the finished device as manufactured and sterilized, not raw materials alone, and the biological evaluation report draws the conclusion.
3. FDA's guidance on the use of ISO 10993-1 sets FDA's expectations, which differ from the standard in places; name it by topic and check it with \`lookup_fda_guidance\`.
4. Sterilization: \`get_sterilization_requirements\` returns the governing standard for the method, the sterility assurance level claim, the validation elements and the packaging standard. Check that validation covers the worst-case product and load, that ethylene oxide residuals are addressed when that method is used, and that the sterile barrier system is shown to hold for the claimed shelf life, including after transport. A device the user sterilizes or reprocesses needs validated instructions instead.
5. Electrical safety and EMC: \`get_electrical_standards\` returns the general standard, the collateral standards the facts trigger, the core test categories and reviewer questions, and says when the device is not electrically powered. Essential performance is defined by the manufacturer through risk management and decides what the tests must show. State the edition of each standard the testing used.
6. Tie every result back to the risk file and design verification: each passing test is evidence for a named risk control or design input.

## Pitfalls reviewers raise
- Endpoints left out without a written rationale in the biological evaluation plan.
- Testing on a prototype or raw material that differs from the final device, with no bridging justification.
- Sterilization or packaging validation that does not cover the shelf-life claim.
- Essential performance not defined, so EMC acceptance cannot be judged.

## Before answering
- Endpoints, standards, the sterility assurance level and test categories are as the engines returned them for stated facts; none is supplied from memory.
- A module that does not apply says why (no body contact, not sterile, not powered).

## Not AnA's to decide
- Whether a justification in place of a test is acceptable is the reviewer's judgment; the biological safety conclusion is the sponsor's, signed by its qualified evaluator.
- AnA does not certify conformity to a standard; laboratories report results and the sponsor declares conformity.
`,
  }),

  skill({
    key: 'device.substantial-equivalence',
    name: '510(k) predicates and substantial equivalence',
    description:
      'Choosing a predicate and building the substantial-equivalence argument for a 510(k): the same intended use, technological characteristics compared feature by feature, and the performance data that show differences raise no different questions of safety and effectiveness.',
    disciplines: ['device-engineering', 'regulatory-strategy'],
    useCases: ['strategy', 'drafting', 'review'],
    segments: ['device', 'ivd'],
    regions: ['US'],
    submissionTypes: ['US_510K', 'US_510K_IVD', 'US_510K_MOD'],
    triggers: [
      'substantial equivalence',
      'substantially equivalent',
      'not substantially equivalent',
      'predicate',
      'predicate device',
      'primary predicate',
      'secondary predicate',
      'multiple predicates',
      'split predicate',
      'reference device',
      'predicate comparison',
      'predicate selection',
      'choosing a predicate',
      'predicate recall',
      'technological characteristics',
      'different questions of safety and effectiveness',
      'same intended use',
      'nse letter',
      'k number',
      'se determination',
    ],
    tools: [
      'lookup_regulatory_precedents',
      'analyze_predicate_device',
      'search_device_recalls',
      'lookup_fda_guidance',
      'score_predicate_adequacy',
      'assess_substantial_equivalence',
      'draft_510k_substantial_equivalence',
      'compare_submission_against_precedent',
      'check_regulatory_currency',
    ],
    references: [{ kind: 'currency-fact', id: 'fda-estar-510k-mandatory' }],
    instructions: `
## When this applies
A device or IVD going to market through a 510(k): finding and choosing predicates, building the substantial-equivalence comparison, and deciding what performance data the differences require.

## Method
1. Fix the subject device's intended use and indications for use first; the whole argument is measured against them.
2. Find candidate predicates: legally marketed devices of the same type, from the person's knowledge, the product code, or \`lookup_regulatory_precedents\`. Pull each candidate's clearance record with \`analyze_predicate_device\` (by 510(k) number) and report what the database returned; when it returns nothing, say the record could not be retrieved.
3. Check each candidate's history with \`search_device_recalls\` and report the result, including when nothing was found. A device removed from the market at FDA's initiative, or found adulterated or misbranded by a court, cannot be a predicate. FDA's guidance on best practices for selecting a predicate addresses predicates with design-related recalls or unmitigated safety concerns; confirm its status and content with \`lookup_fda_guidance\` before citing it.
4. Rank candidates with \`score_predicate_adequacy\` from the comparison signals you have read; report the score, band and unknown factors as a screening aid, never as FDA's view.
5. Choose one primary predicate, and justify any additional predicate by the specific characteristic it supports. The subject device must have the same intended use as the predicate. Taking the intended use from one predicate and the technology from another (a split predicate) does not support substantial equivalence. A reference device can support a scientific method or test but is not a predicate.
6. Run the decision with \`assess_substantial_equivalence\`: predicate identified, same intended use, technological characteristics the same or different, whether differences raise different questions of safety and effectiveness, and whether performance data show the device is as safe and effective. Report the determination and its path as returned. An unstated step leaves the result indeterminate; never fill it in.
7. Different indications for use do not by themselves mean a different intended use; whether they change it is FDA's judgment. When the intended use is different, the 510(k) route is not available on that predicate: the options are another predicate with the same intended use, De Novo, or PMA (a pathway question for the device skill).
8. When technological characteristics differ, the differences must not raise different questions of safety and effectiveness, and performance data (bench, biocompatibility, sterility, software, electrical, animal or clinical as needed) must show the device is as safe and effective as the predicate. The tool lists the data the differences call for.
9. Draft the comparison with \`draft_510k_substantial_equivalence\`: a feature-by-feature table (intended use, indications, technology, materials, energy source, performance and the like), each row giving subject, predicate, similarity or difference, and a conclusion that says why any difference raises no different questions, citing the data. Write "substantially equivalent", never "equivalent" alone, and never call the devices identical.
10. For a cleared precedent that resembles this submission, \`compare_submission_against_precedent\` (after \`lookup_regulatory_precedents\`) shows where it aligns and differs.
11. The 510(k) is submitted in eSTAR (currency fact fda-estar-510k-mandatory; confirm with \`check_regulatory_currency\`). FDA's guidance on the 510(k) program and substantial equivalence is named by topic and checked with \`lookup_fda_guidance\`.

## Pitfalls reviewers raise
- No single primary predicate, or additional predicates without a stated reason.
- A difference marked "similar" with no data or rationale behind the conclusion.
- Indications for use broader than the predicate's with no discussion of intended use.

## Before answering
- The determination, predicate score and required data come from the tools; the answer never says FDA will find the device substantially equivalent.
- "Equivalent" appears only as "substantially equivalent".
- Each predicate's recall check is reported.

## Not AnA's to decide
- Substantial equivalence is FDA's determination; AnA prepares the argument and names its gaps.
- The choice of predicate is the sponsor's, and the sponsor signs and submits the 510(k).
`,
  }),

  skill({
    key: 'device.clinical-evidence',
    name: 'Device clinical evidence',
    description:
      'Whether a device needs clinical data and how to generate it: significant-risk determinations and IDEs under 21 CFR Part 812, device study design including Bayesian and reader studies, and the EU clinical evaluation (MDR Article 61 and Annex XIV) with its report and post-market clinical follow-up.',
    disciplines: ['device-engineering', 'clinical'],
    useCases: ['strategy', 'study-design', 'drafting', 'review'],
    segments: ['device'],
    documentTypes: ['EU_CER', 'ISO_CIP'],
    triggers: [
      'clinical evaluation report',
      'clinical evaluation plan',
      'mdr clinical evaluation',
      'cer',
      'investigational device exemption',
      'ide',
      'part 812',
      '21 cfr 812',
      'significant risk device',
      'significant risk study',
      'non-significant risk',
      'sr/nsr',
      'early feasibility study',
      'pivotal device study',
      'iso 14155',
      'clinical investigation plan',
      'pmcf',
      'post-market clinical follow-up',
      'mdr equivalence',
      'objective performance criterion',
      'bayesian device',
      'device clinical data',
      'device clinical investigation',
      'mdr clinical investigation',
    ],
    tools: [
      'design_device_clinical_evidence',
      'design_bayesian_device',
      'design_mrmc_reader_study',
      'lookup_fda_guidance',
      'assess_device_evidence_structure',
      'get_device_reviewer_checklist',
    ],
    references: [
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'iso_14971' },
    ],
    instructions: `
## When this applies
Deciding whether a device needs clinical data, designing the investigation, preparing for an IDE, or writing and gap-checking an EU clinical evaluation plan and report.

## Method
1. Establish whether clinical data are needed, and for which market, with \`design_device_clinical_evidence\` (class, pathway, novelty, implantable or life-sustaining, EU class). When it returns not determined with missing facts, ask for them; never report that clinical data or an IDE are not required on an unstated fact.
2. US investigations are conducted under 21 CFR Part 812. A significant-risk study needs an FDA-approved IDE and IRB approval; a non-significant-risk study proceeds under the abbreviated requirements with IRB approval; some studies are exempt. The IRB makes the first risk determination and FDA's determination is final; a sponsor can ask FDA for one. Informed consent (Part 50) and IRB review (Part 56) apply to significant-risk and non-significant-risk studies alike.
3. Design from the evidence gap: the study answers a question the substantial-equivalence or benefit-risk argument leaves open. Settle the population, the comparator or performance goal and its justified source, endpoints and their clinical meaning, follow-up, and bias control.
4. Size with the engines. For a single-arm study with a Bayesian success rule against a performance goal, \`design_bayesian_device\` finds n from the prior, goal and success threshold the sponsor supplies. For an imaging or AI reader study comparing modalities, \`design_mrmc_reader_study\` gives the power analysis. Report n and operating characteristics as returned; a prior that borrows external data needs its source and weight justified.
5. FDA's guidances on Bayesian statistics in device trials, on significant-risk and non-significant-risk studies, and on early feasibility studies set expectations; name them by topic and check them with \`lookup_fda_guidance\`.
6. The clinical investigation plan follows ISO 14155 for structure and good clinical practice in device investigations.
7. EU clinical evaluation: plan it, identify relevant data (the device's own investigations, the literature, and data on an equivalent device only where equivalence is shown on technical, biological and clinical characteristics), appraise and analyse the data against the general safety and performance requirements and the benefit-risk, and report. Equivalence under the MDR is stricter than a 510(k) predicate comparison, especially for implantable and class III devices, and a substantial-equivalence argument does not by itself make a clinical evaluation. Gap-check the report with \`assess_device_evidence_structure\` (\`document: 'cer'\`, with \`equivalence_claimed\` set) and read the notified body's questions with \`get_device_reviewer_checklist\` for a CER.
8. Post-market clinical follow-up keeps the evaluation current; its plan, or a justification for not having one, is part of the clinical evaluation.

## Pitfalls reviewers raise
- Equivalence claimed without the technical and biological comparison, or without enough access to the other device's data.
- Literature searches with no documented protocol or appraisal.
- Performance goals with no justified source.
- The risk determination for a study not documented.

## Before answering
- Clinical-data and IDE requirements come from the tool or the regulation at part level; sample sizes come from the engines.
- US and EU expectations are kept separate.

## Not AnA's to decide
- The risk determination is the IRB's and finally FDA's; IDE approval is FDA's; the clinical evaluation's adequacy is the notified body's judgment.
- The clinical evaluation report is signed by the sponsor's qualified evaluators, not AnA.
`,
  }),

  skill({
    key: 'device.changes-and-postmarket',
    name: 'Device changes and postmarket obligations',
    description:
      'After a device or IVD is on the market: deciding whether a change needs a new 510(k), a PMA supplement or a documented assessment, how an authorized PCCP bears on it, and the postmarket duties of complaint handling, medical device reporting, corrections and removals, and EU vigilance.',
    disciplines: ['device-engineering', 'quality-systems', 'safety'],
    useCases: ['lifecycle-change', 'gap-analysis', 'drafting'],
    segments: ['device', 'ivd'],
    triggers: [
      'letter to file',
      'new 510(k)',
      'device modification',
      'device change',
      'special 510(k)',
      'pma supplement',
      '180-day supplement',
      'panel-track supplement',
      'real-time supplement',
      '30-day notice',
      'pma annual report',
      'significant change',
      'legacy device',
      'mdcg 2020-3',
      'deciding when to submit',
      'software change',
      'labeling change',
      'change to a cleared device',
      'manufacturer incident report',
      '522 study',
      'section 522',
      'postmarket surveillance study',
    ],
    tools: [
      'lookup_fda_guidance',
      'assess_mdr_reportability',
      'build_postmarket_report',
      'search_device_adverse_events',
      'search_device_recalls',
      'screen_signal_panel',
    ],
    references: [
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: design changes, complaints (21 CFR 820.35) and CAPA' },
    ],
    instructions: `
## When this applies
A device or IVD already on the market: a proposed change to design, labeling, materials, software or manufacturing, and the postmarket duties that follow complaints, adverse events, recalls and trends.

## Method
1. Start every change in design change control (ISO 13485:2016 clause 7.3.9 under the QMSR): what changes, why, its effect on risk, and the verification and validation it needs. The regulatory decision rests on that assessment, so it comes first.
2. 510(k) devices: a new 510(k) is needed when a change could significantly affect safety or effectiveness, or is a major change or modification in intended use (21 CFR 807 subpart E). FDA's guidances on deciding when to submit a 510(k) for a change to an existing device, and for a software change, give the decision questions (labeling; technology, engineering and performance; materials). Name them by topic and check them with \`lookup_fda_guidance\`. No AnA tool computes this decision; work through the questions with the person and say so. When no new 510(k) is needed, the assessment and its supporting verification and validation are documented in the design records (often called a letter to file). When the change is to the manufacturer's own device and its effects can be assessed by well-established methods, a Special 510(k) may be the route.
3. PMA devices: a change affecting safety or effectiveness needs a PMA supplement under 21 CFR Part 814. The vehicle (a panel-track, 180-day or real-time supplement, a special PMA supplement for changes being effected, or a 30-day notice for certain manufacturing changes) depends on the change, and some changes are reported in the annual report instead. FDA's guidance on modifications to PMA devices sets which applies; check it with \`lookup_fda_guidance\`.
4. Authorized PCCP: a modification made as an authorized predetermined change control plan describes does not need a new submission; anything outside the plan does. Read the plan's description of modifications before concluding.
5. EU: planned substantial changes to a certified device or the quality system are notified to the notified body before implementation. For a legacy device relying on transitional provisions, a significant change in design or intended purpose ends that reliance; the MDCG guidance on significant changes (MDCG 2020-3 for the MDR; the IVDR has its own) is named and confirmed before relying on its detail.
6. Complaints: under the QMSR, complaint handling is ISO 13485:2016 clause 8.2.2 with the record content of 21 CFR 820.35; take citations from the QMSR crosswalk. Every complaint is evaluated for whether it must be reported.
7. Reportability: \`assess_mdr_reportability\` triages an event against FDA medical device reporting (21 CFR Part 803) and EU vigilance from the stated harm and event facts; report its finding, the facts it used and any reporting clock it returns. \`build_postmarket_report\` drafts an eMDR, an EU manufacturer incident report or a field safety notice from the fields given and lists missing fields.
8. Corrections, removals and recalls: a correction or removal made to reduce a risk to health is reported under 21 CFR Part 806 unless an exception applies; recalls follow 21 CFR Part 7. In the EU a field safety corrective action is reported through vigilance with a field safety notice.
9. Surveillance: search similar devices' adverse events with \`search_device_adverse_events\` and recalls with \`search_device_recalls\`; when the person has a 2×2 table of report counts, screen for disproportionality with \`screen_signal_panel\`. A disproportionality result is a signal to investigate, not a causal finding. Trends feed CAPA and the risk file and, in the EU, the PMS report or PSUR and trend reporting. Postmarket surveillance studies FDA orders under section 522 follow 21 CFR Part 822.

## Before answering
- The change decision is presented as the sponsor's documented assessment with the guidance questions answered, never as a tool verdict.
- Reportability and any clock come from \`assess_mdr_reportability\`, not memory.
- Complaint and CAPA citations are QMSR and ISO 13485:2016 citations, not removed QSR sections.

## Not AnA's to decide
- Whether a change needs a submission is the manufacturer's documented decision; FDA or the notified body may disagree with it.
- Reporting and recall decisions are the manufacturer's, and FDA classifies recalls. AnA drafts reports; a person with authority submits them.
`,
  }),

  skill({
    key: 'device.udi-and-registration',
    name: 'Unique device identification and establishment registration',
    description:
      'Assigning and maintaining unique device identifiers (device identifier and production identifiers, issuing agencies, when a change needs a new DI, direct marking), submitting UDI data to GUDID and EUDAMED, and US device establishment registration and listing, at method level. Label content is the device labeling skill.',
    disciplines: ['device-engineering', 'regulatory-operations', 'labeling'],
    useCases: ['submission-assembly', 'lifecycle-change', 'gap-analysis', 'drafting'],
    segments: ['device', 'ivd'],
    triggers: [
      'unique device identification',
      'udi system',
      'udi-pi',
      'device identifier',
      'production identifier',
      'gudid submission',
      'gudid record',
      'issuing agency',
      'issuing entity',
      'gtin',
      'direct marking',
      'new udi-di',
      'udi compliance',
      'udi requirements',
      'part 830',
      '21 cfr 830',
      'establishment registration',
      'device establishment registration',
      'device listing',
      'registration and listing',
      'us agent',
    ],
    tools: [
      'validate_udi',
      'lookup_fda_guidance',
      'check_regulatory_currency',
      'search_eudamed',
      'global_search',
      'global_ri_establishment_registration',
    ],
    references: [
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'currency-fact', id: 'eu-eudamed-mandatory' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: 'server/services/market-specs/udi-validator.ts', label: 'UDI carrier validator: GS1 check digit, GTIN-14 and production identifiers' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk: complaint and servicing records that carry the UDI (21 CFR 820.35)' },
      {
        kind: 'record',
        id: 'server/services/global-ri/establishment-registration.ts',
        label: 'Drug establishment registration and listing (21 CFR Part 207) and EU manufacturing authorisation',
      },
    ],
    instructions: `
## When this applies
Giving a device or IVD its unique device identifiers and keeping them right through changes, submitting UDI data to GUDID and EUDAMED, and registering establishments and listing devices with FDA. What a label must carry, and checking a label's carrier, are the device labeling skill's; EU actor registration, the SRN and the technical documentation are the EU technical documentation skill's.

## Method
1. Establish the device and its configurations: models and versions, package levels and quantities, whether it is single use or reprocessed for reuse, implantable, software only, a kit or a combination product's constituent, and its class in each market. Each orderable configuration is a candidate for its own identifier.
2. Structure: a UDI is a device identifier (DI), fixed for the labeler's specific version or model, plus production identifiers (PI) for what varies and appears on the label: lot or batch, serial number, expiry date, manufacture date and, for an HCT/P regulated as a device, its distinct identification code. It is issued under the system of an issuing agency FDA has accredited (21 CFR Part 830) or, in the EU, an issuing entity the Commission designated.
3. Check carriers with \`validate_udi\`: for a GS1 carrier it computes the check digit, validates the GTIN-14 and parses the production identifiers; HIBCC and ICCBBA carriers are detected but not parsed, so say they were not checked. A valid check digit does not show the DI is registered.
4. New DI or not: a change that creates a new version or model, changes the quantity in a package, or changes what the DI record says about the device generally needs a new DI. FDA's guidance on GUDID lists the triggers; confirm it with \`lookup_fda_guidance\` before advising. In the EU the Basic UDI-DI keys the device model in EUDAMED, on certificates and on the declaration of conformity; whether a change needs a new one is assessed against current MDCG guidance.
5. Labels and marking: the UDI appears in plain text and in machine-readable form on the label and on each package level the rules require. A device used more than once and reprocessed between uses carries a permanent direct marking unless an exception applies; stand-alone software shows its UDI as its own provision sets. Confirm the paragraph in 21 CFR Part 801 subpart B before citing it.
6. US compliance: the requirements took effect by device class in phases, and FDA has used enforcement discretion for some classes. Confirm the position for the device's class with \`lookup_fda_guidance\`; never state a compliance date from memory.
7. Databases: the DI record goes to GUDID in the US; UDI and device registration go to EUDAMED in the EU. Run \`check_regulatory_currency\` (fact eu-eudamed-mandatory) for which EUDAMED modules are mandatory and from when, including the legacy-device deadline, and report the fact as returned. \`search_eudamed\` shows how comparable devices are registered, cited by Basic UDI-DI; relay an unavailable status. Search the program's existing UDI records with \`global_search\` before creating new ones.
8. Quality records carry the UDI where the QMSR requires it: complaint and servicing records under 21 CFR 820.35 (QMSR crosswalk).
9. US establishment registration and device listing are governed by 21 CFR Part 807. Establishments whose activities it names (manufacturing, specification development, repackaging, relabeling, reprocessing and initial import, among others) register; which must also list and pay the annual fee is checked against FDA's current instructions, as are timing and fee amounts. Registration is renewed each year, a foreign establishment names a US agent, and a listing ties the device to its premarket submission or exempt classification. Registration is not approval, and presenting it as approval misbrands the device. \`global_ri_establishment_registration\` covers drug establishments (21 CFR Part 207) and EU manufacturing authorisations, not device establishments: use it only for a drug constituent's site, and say so.

## Pitfalls reviewers raise
- One DI used for configurations that differ in model or package quantity.
- GUDID or EUDAMED records that do not match the label or the authorised device.
- Reusable, reprocessed devices with no direct marking and no documented exception.

## Before answering
- Dates, deadlines and fees come from the currency check or FDA's current instructions, never memory.
- A carrier check names the issuing agency and whether the carrier was parsed.

## Not AnA's to decide
- The labeler assigns DIs and keeps database records true; authorities decide exceptions.
- AnA does not submit a GUDID record, an EUDAMED registration or an establishment registration.
`,
  }),

  skill({
    key: 'device.combination-and-drug-delivery',
    name: 'Drug-delivery device constituents',
    description:
      'Engineering the device constituent of a drug-device or biologic-device combination product: design inputs drawn from the drug, essential performance and drug delivery outputs, design verification on aged and transported product, human factors links, and bridging when the delivery device changes. Designation, lead centre and the Part 4 cGMP base are the combination products skill.',
    disciplines: ['device-engineering', 'cmc'],
    useCases: ['study-design', 'drafting', 'review', 'gap-analysis'],
    triggers: [
      'drug delivery device',
      'drug-delivery device',
      'delivery device design',
      'device constituent',
      'essential drug delivery outputs',
      'essential performance requirements',
      'dose accuracy',
      'iso 11608',
      'needle-based injection system',
      'on-body injector',
      'wearable injector',
      'pen injector',
      'injection device',
      'device bridging',
      'break loose force',
      'glide force',
      'activation force',
    ],
    tools: [
      'classify_combination_product',
      'plan_combination_cgmp',
      'assess_device_constituent_controls',
      'check_regulatory_currency',
      'lookup_fda_guidance',
      'design_human_factors_study',
      'assess_essential_principles',
    ],
    references: [
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iec_62366_1' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: QMSR_CROSSWALK, label: 'QMSR crosswalk, for restating 820.30 citations in tool results' },
    ],
    instructions: `
## When this applies
Designing, verifying or changing the device constituent of a drug-device or biologic-device combination product: a prefilled syringe, autoinjector, pen or on-body injector, the device parts of an inhaler, or another delivery system. Whether it is a combination product, its lead centre, the application and the Part 4 cGMP base are the combination products skill's; usability method is the human factors skill's.

## Method
1. Establish the product: the drug or biologic and the properties the device must handle (dose or volume, viscosity across temperature and shelf life, sensitivity to shear or silicone), the primary container, the delivery mechanism, users and use environment, and whether this presentation is used in the pivotal trials or only commercially. Take the combination-product category from the program record, or from \`classify_combination_product\` when it is not settled.
2. Design controls apply to the device constituent whatever the base quality system: under 21 CFR Part 4 a drug-based manufacturer still meets the device provisions the rule calls out. \`plan_combination_cgmp\` returns those provisions for the date given. \`assess_device_constituent_controls\` lays out the constituent's design-control program, including essential performance requirements. Its citations name 21 CFR 820.30: restate them as ISO 13485:2016 clause 7.3 via 21 CFR 820.10(c), with 820.30 only as "formerly", and confirm the QMSR's status with \`check_regulatory_currency\`.
3. Design inputs come from the drug as well as from users and risk: delivered dose and its accuracy, delivery time, needle depth or spray characteristics, user forces, fluid-path compatibility and sterility, and storage and transport conditions. Each input is measurable.
4. Essential performance: identify the device outputs essential to delivering the drug as labeled (for an injector, typically delivered volume, needle extension and injection time; the engine's list is a starting point). FDA has issued guidance on essential drug delivery outputs for devices that deliver drugs and biological products; name it by topic and confirm its status with \`lookup_fda_guidance\`. Each output has a specification, a validated test method and a place in the control strategy, so it is verified at release and across shelf life.
5. Design verification: dose accuracy and function against specification across the conditions of use, after transport, and on product aged to the end of shelf life alongside the drug's stability programme; reliability; and, for needle-based injection systems, the applicable part of the ISO 11608 series, edition stated. Extractables and leachables are a CMC question; biocompatibility, electrical safety and software follow their device skills.
6. Human factors: critical tasks come from the use-related risk analysis, which shares the ISO 14971 risk file with the design. \`design_human_factors_study\` plans formative and summative work for the constituent; report its participant numbers and whether a full summative study is required as returned.
7. Bridging: when the trial presentation differs from the commercial one (vial to prefilled syringe, syringe to autoinjector), plan comparative design verification, human factors on the new interface and, where exposure could differ, a pharmacokinetic comparison with clinical pharmacology. FDA's guidance on bridging for drug-device and biologic-device combination products is named by topic and confirmed. Whether clinical bridging data are needed is agreed with the agency.
8. EU: for an integral product authorised as a medicine, the device part meets the relevant general safety and performance requirements, with a notified body opinion under Article 117 of the MDR. \`assess_essential_principles\` builds the GSPR matrix for the device part. EMA's guideline on quality documentation for medicinal products used with a medical device is named by topic and confirmed before citing.
9. A change to the device constituent after approval goes through design change control and is classified for the drug or biologic application by the change-control method.

## Pitfalls reviewers raise
- Essential performance undefined, or not tied to the labeled dose.
- Device performance verified on new product only, not at end of shelf life or after transport.
- A commercial presentation that differs from the trial device with no bridging rationale.

## Before answering
- Design-control programs, called-out provisions and human factors numbers are engine outputs quoted with their inputs.
- Specifications are the sponsor's; AnA proposes none.

## Not AnA's to decide
- The lead centre, and whether bridging and verification evidence suffice, are the agency's or the notified body's; design approvals are the sponsor's.
`,
  }),
];
