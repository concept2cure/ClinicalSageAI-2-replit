/**
 * CMC skills: chemistry, manufacturing and controls, Module 3 and its summary,
 * from quality by design through stability, impurities, specifications,
 * analytical procedures, process validation and post-change comparability.
 *
 * The platform composes Module 3 for a small-molecule drug filed in a US IND
 * and nothing else (decision P-28, server/services/cmc/composition-scope.ts).
 * These skills advise across the whole of CMC and say, where it matters, that
 * a biologic, an ATMP, a marketing application or a non-US clinical-trial
 * application is authored outside the composer.
 *
 * Every figure (a threshold, a storage condition, a shelf life, an f2, a
 * capability index, an acceptable intake) comes from a named engine; the
 * skills route to it and never supply it.
 *
 * @module server/services/ana/skills/library/cmc
 */

import { skill, type LibrarySkillSource } from '../types.js';

const COMPOSITION_SCOPE = {
  kind: 'record',
  id: 'server/services/cmc/composition-scope.ts',
  label: 'CMC composition boundary (decision P-28)',
} as const;

const CMC_RECORD = {
  kind: 'record',
  id: 'server/services/cmc/knowledge/index.ts',
  label: 'Cited CMC regulatory record',
} as const;

export const CMC_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'cmc',
    name: 'CMC and Module 3',
    description:
      'Any chemistry, manufacturing and controls question or Module 3 work that no narrower CMC skill covers: what a quality dossier must hold for the product, phase and region, how quality by design and the control strategy tie Module 3 together, and what the platform composes as against what it only advises on.',
    disciplines: ['cmc'],
    useCases: ['strategy', 'drafting', 'review', 'gap-analysis', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    surfaces: ['cmc'],
    documentTypes: ['ICH_CTD_M3'],
    triggers: [
      'cmc',
      'module 3',
      'ctd module 3',
      'quality module',
      'chemistry manufacturing and controls',
      'chemistry, manufacturing and controls',
      'chemistry, manufacturing, and controls',
      'cmc package',
      'cmc strategy',
      'cmc section',
      'control strategy',
      'qbd',
      'design space',
      'qtpp',
      'quality target product profile',
      'critical quality attribute',
      'critical quality attributes',
      'cqa',
      'cqas',
      'ich q8',
      'q8(r2)',
      'ich q9',
      'quality risk management',
      'm4q',
    ],
    tools: [
      'list_cmc_registers',
      'get_cmc_requirements',
      'find_cmc_guidance',
      'explain_cmc_topic',
      'get_document_section_requirements',
      'lookup_ich_guideline',
      'list_platform_commands',
      'execute_platform_command',
      'start_intelligence_flow',
      'commit_intelligence_flow',
    ],
    references: [
      { kind: 'ich', id: 'Q8(R2)' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q11' },
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
      CMC_RECORD,
    ],
    instructions: `
## When this applies
A chemistry, manufacturing and controls question, or a piece of Module 3 work, that no narrower CMC skill covers: what a quality dossier must hold for this product, phase and region; how the control strategy ties Module 3 together; and what the platform composes as against what it only advises on.

## Method
1. Establish the product and the filing before anything else: modality (small molecule, biologic, cell or gene therapy), application (IND, CTA, NDA, BLA, ANDA), region and clinical phase. Read them from the program record. When the question and the record disagree, say so and ask which is right; each one changes what is required.
2. Check the composition boundary before offering to build. The platform composes Module 3 for a small-molecule drug filed in a US IND, and nothing else (decision P-28). For a biologic, an ATMP, a marketing application or a non-US clinical-trial application, advise in full and say that the quality content is authored in Document editor & authoring, its evidence kept in Vault and the filing made through the Submission center. When a build is refused, relay the refusal's own reason; never work around it.
3. Read what the program has recorded with \`list_cmc_registers\` before saying anything about its data. Say plainly when a register is empty.
4. Answer what is required from the cited CMC record, not from memory: \`get_cmc_requirements\` (filter by authority, application type, phase, CTD section, modality or topic), \`find_cmc_guidance\` for which guideline governs and in which version and status, and \`explain_cmc_topic\` for the reasoning and the deficiencies agencies report. For what a CTD section must contain, use \`get_document_section_requirements\` with the section code. When the record answers "not indexed", say so and name what would have to be checked. Confirm an ICH code with \`lookup_ich_guideline\` before citing it.
5. Treat quality by design as the spine of Module 3 (ICH Q8(R2), Q9(R1), Q10, Q11). The quality target product profile leads to the critical quality attributes; risk assessment links material attributes and process parameters to them; the control strategy (specifications, in-process controls, parameter ranges, and a design space only where claimed and supported) controls them; the pharmaceutical quality system keeps it current. In review, trace each CQA named in 3.2.P.2 or 3.2.S.2.6 to a control in 3.2.S.4, 3.2.P.5 or an in-process control, and check that an attribute carries the same criterion everywhere it appears.
6. For Module 3 state and builds, find the commands with \`list_platform_commands\` (query "module3") and run them with \`execute_platform_command\`: \`cmc_status\` for the inventory and section state, \`module3_missing_inputs\` for what blocks each section, \`module3_contradictions\`, \`module3_lineage\` and \`module3_readiness\` for review, and \`control_strategy\` for the deterministic control strategy. A build, refresh or other write comes back as a proposal that only the person's confirmation runs; tell them it has not been done.
7. To capture a program's CMC facts by interview, start \`start_intelligence_flow\` with document type "cmc_specification", and record the completed interview with \`commit_intelligence_flow\`, first as a dry run shown to the person.
8. Scale to phase. US IND CMC is scaled to the phase, duration and dosage form (21 CFR 312.23(a)(7)); ICH quality guidelines written for marketing applications serve as benchmarks earlier, applied in proportion. The phase-appropriate IND skill carries the detail.
9. Hand a narrower question to the sub-skill that owns it: drug substance, drug product, specifications, stability, impurities, analytical procedures, process validation, comparability and changes, biologics, cell and gene therapy, or the Quality Overall Summary.

## Before answering
- The modality, application, region and phase are stated, or the answer says which were assumed.
- Every requirement names the document the record or lookup returned, with its status and date. Several quality guidelines have been under revision (a consolidated ICH Q1, Q3E, M4Q(R2), a Q6 revision); check each one's status and cite a draft as a draft.
- No limit, threshold, storage condition, shelf life or capability index appears unless a tool returned it, and the tool is named.
- A request outside the composition boundary is answered as advice, with the authoring path named.

## Not AnA's to decide
- Release or rejection of a batch, and approval of a specification or control strategy: the quality unit's.
- Whether a dossier is acceptable: the agency's.
- Widening the composition boundary: a founder decision (P-28).
- AnA does not approve, sign or file; a build or register write she proposes runs only on a person's confirmation.
`,
  }),

  skill({
    key: 'cmc.drug-substance',
    name: 'Drug substance (3.2.S)',
    description:
      'Drafting, reviewing or gap-checking 3.2.S for a chemically synthesised drug substance: general information, manufacture and starting materials, characterisation and solid form, impurities, control and specification, reference standards, container closure and stability.',
    disciplines: ['cmc'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_M3_DS'],
    triggers: [
      'drug substance',
      '3.2.s',
      'active pharmaceutical ingredient',
      'api synthesis',
      'synthetic route',
      'route of synthesis',
      'regulatory starting material',
      'starting material',
      'starting materials',
      'ich q11',
      'polymorph',
      'polymorphs',
      'polymorph screening',
      'polymorphic form',
      'solid form',
      'salt form',
      'structure elucidation',
      'drug substance characterization',
      'drug substance characterisation',
      'ich q7',
      'api gmp',
    ],
    tools: [
      'list_cmc_registers',
      'get_document_section_requirements',
      'get_cmc_requirements',
      'assess_api_gmp',
      'classify_impurity',
      'classify_mutagenic_impurity',
      'explain_cmc_topic',
      'set_specifications',
      'execute_platform_command',
      'check_dossier_consistency',
    ],
    references: [
      { kind: 'ich', id: 'Q11' },
      { kind: 'ich', id: 'Q7' },
      { kind: 'ich', id: 'Q3A(R2)' },
      { kind: 'ich', id: 'M7(R2)' },
      { kind: 'ich', id: 'Q6A' },
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
    ],
    instructions: `
## When this applies
Drafting, reviewing or gap-checking 3.2.S for a chemically synthesised drug substance, or answering what one of its sections must hold. For a biological substance, use this outline with the biologics skill; the platform does not compose it.

## Method
1. Establish the substance and its history: chemical name and structure, salt and solid form, each manufacturer and site, the route version and scale behind every batch used in toxicology and clinical studies, and the phase. Read what is recorded with \`list_cmc_registers\` (drug substance, manufacturing process, characterization, impurity profile, batch, specification, stability).
2. Confirm what each section must carry for the authority and phase with \`get_document_section_requirements\` (section code) and \`get_cmc_requirements\`, then check the draft section by section:
   - 3.2.S.1 General information: nomenclature, structure (stereochemistry, molecular formula, relative molecular mass) and general properties.
   - 3.2.S.2 Manufacture: manufacturers; a flow diagram and a narrative of the process; critical steps and critical process parameters with their ranges; in-process controls; control of materials, with starting materials selected and justified under ICH Q11 and its Q&As; controls of critical steps and intermediates; process validation or evaluation where required; and the development history that ties each batch to the process that made it.
   - 3.2.S.3 Characterisation: elucidation of structure and other characteristics, including polymorphic and solid form; impurities, each with its origin.
   - 3.2.S.4 Control: specification, analytical procedures, their validation, batch analyses, justification of the specification.
   - 3.2.S.5 Reference standards or materials; 3.2.S.6 Container closure system; 3.2.S.7 Stability, supporting the retest period.
3. Where GMP starts, and how stringent it is at a given step, follows from the starting-material designation: run \`assess_api_gmp\` for the step in question.
4. Impurities: list each actual and potential impurity with its source (starting material, intermediate, by-product, reagent, catalyst, degradant). Take reporting, identification and qualification thresholds from \`classify_impurity\` for the maximum daily dose; never state a fixed percentage. An impurity is qualified at a level present in batches used in adequate safety studies, so trace each limit to the toxicology and clinical batches. Assess every actual and potential impurity for mutagenic potential under ICH M7(R2); \`classify_mutagenic_impurity\` gives the class, and the impurities skill carries the full method. ICH Q3A(R2) is written for marketing applications; for how clinical-stage limits are justified, ask \`explain_cmc_topic\`.
5. Solid form: where polymorphs, solvates, hydrates, salts or an amorphous form are possible, characterise them and decide whether form needs a specification test; the decision trees come from \`set_specifications\`.
6. Specification: take the test set from \`set_specifications\` and justify each acceptance criterion with batch data, stability data and qualification, never from a template. The specifications skill carries limit setting; the stability skill carries the retest period.
7. Inside the composition boundary (small molecule, US IND), check what blocks each section with \`execute_platform_command\` running \`module3_missing_inputs\`, then propose \`module3_build_section\` for the section; it runs only on the person's confirmation.
8. Before the section goes forward, run \`check_dossier_consistency\` so batch numbers, limits and the retest period agree with the QOS and the other modules.

## Pitfalls reviewers raise
- A regulatory starting material designated close to the final step without justification.
- Impurity limits not traceable to levels qualified in the toxicology batches.
- Batches made by different routes, sites or scales with the differences unexplained.
- Potential impurities never assessed, only the ones observed.
- Solid form left uncontrolled where it affects dissolution or stability.

## Before answering
- Every threshold, limit or classification names the tool that returned it.
- The depth asked for fits the phase; a marketing-application expectation is not presented as an IND requirement.
- Statements about the program's substance come from its registers or documents, not assumption.

## Not AnA's to decide
- Whether a starting-material designation is accepted: the agency's.
- Whether an impurity is qualified by the safety data: the toxicologist's judgement, then the agency's.
- Release of a batch: the quality unit's.
`,
  }),

  skill({
    key: 'cmc.drug-product',
    name: 'Drug product (3.2.P)',
    description:
      'Drafting, reviewing or gap-checking 3.2.P: description and composition, pharmaceutical development, manufacture, control of excipients, control of the drug product, reference standards, container closure and stability, including dissolution profile comparison.',
    disciplines: ['cmc'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_M3_DP'],
    triggers: [
      'drug product section',
      'drug product manufacturing',
      'drug product composition',
      'drug product cmc',
      '3.2.p',
      'pharmaceutical development',
      'formulation development',
      'dosage form',
      'excipient',
      'excipients',
      'novel excipient',
      'batch formula',
      'container closure',
      'container closure system',
      'container closure integrity',
      'dissolution',
      'dissolution profile',
      'dissolution method',
      'f2 similarity',
      'similarity factor',
      'overage',
      'placebo manufacture',
      'pediatric formulation',
    ],
    tools: [
      'list_cmc_registers',
      'get_document_section_requirements',
      'get_cmc_requirements',
      'compare_recorded_dissolution',
      'assess_dissolution_similarity',
      'explain_cmc_topic',
      'classify_impurity',
      'select_pediatric_formulation',
      'set_specifications',
      'execute_platform_command',
      'check_dossier_consistency',
    ],
    references: [
      { kind: 'ich', id: 'Q8(R2)' },
      { kind: 'ich', id: 'Q3B(R2)' },
      { kind: 'ich', id: 'Q3D(R2)' },
      { kind: 'ich', id: 'Q6A' },
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
    ],
    instructions: `
## When this applies
Drafting, reviewing or gap-checking 3.2.P for a drug product, or answering what one of its sections must hold, including dissolution, excipients and container closure.

## Method
1. Establish the product: dosage form, route, strengths, every component and its function (including components that do not remain in the final product), whether it is sterile, the manufacturer and site, the phase, and whether a placebo or comparator is supplied. Read what is recorded with \`list_cmc_registers\` (drug product, formulation, manufacturing process, batch, dissolution profile, container closure).
2. Confirm each section's required content for the authority and phase with \`get_document_section_requirements\` and \`get_cmc_requirements\`, then check:
   - 3.2.P.1 Description and composition: dosage form, each component with its amount per unit, function and quality standard, and the container closure.
   - 3.2.P.2 Pharmaceutical development: the quality target product profile and critical quality attributes; drug substance properties that affect performance; excipient choice and compatibility; formulation development, including overages and the bridge between the clinical and proposed formulations; manufacturing process development; container closure suitability; microbiological attributes; compatibility with diluents and administration devices.
   - 3.2.P.3 Manufacture: manufacturers, batch formula, process description and in-process controls, controls of critical steps and intermediates, process validation or evaluation.
   - 3.2.P.4 Control of excipients: specifications and procedures, excipients of human or animal origin, and novel excipients, which need drug-substance-level information (3.2.A.3).
   - 3.2.P.5 Control of drug product: specification, procedures, validation, batch analyses, characterisation of impurities, justification of the specification.
   - 3.2.P.6 Reference standards; 3.2.P.7 Container closure system; 3.2.P.8 Stability (stability skill).
3. Dissolution for oral solid forms: compare two profiles with \`compare_recorded_dissolution\` when both are in the register, and with \`assess_dissolution_similarity\` only for profiles the person supplies. When either refuses (sampling times differ, too few comparable points, no unit count, no variability recorded, variability too high), relay the reason verbatim and do not retry with typed-in numbers. How a method's discriminating power and a clinically relevant acceptance criterion are shown comes from \`explain_cmc_topic\`.
4. Degradation products: thresholds come from \`classify_impurity\` with the drug product context; the impurities skill carries the method, including elemental impurities assessed across drug substance, excipients, equipment and container closure.
5. Container closure suitability covers protection, compatibility, safety (extractables and leachables, in the impurities skill) and performance. For a sterile product, sterility assurance and container closure integrity matter at every phase; ask \`explain_cmc_topic\` what is expected at the program's phase.
6. Pediatric forms: for age-appropriate formulation and excipient safety, run \`select_pediatric_formulation\`.
7. Take the release and shelf-life test set from \`set_specifications\` for the dosage form and route; the specifications skill carries the justification.
8. Inside the composition boundary (small molecule, US IND), check \`module3_missing_inputs\` and propose \`module3_build_section\` through \`execute_platform_command\`; the build runs only on the person's confirmation.
9. Run \`check_dossier_consistency\` before the section goes forward: composition, strengths, batch numbers and shelf life must agree with the QOS, the labeling and the clinical modules.

## Pitfalls reviewers raise
- No link shown between the formulation used in the clinical studies and the one proposed.
- A dissolution method with no demonstrated discriminating power, or acceptance criteria not tied to product performance.
- Container closure suitability asserted without data.
- Placebo manufacture and control not described for a controlled trial.

## Before answering
- f2 results, thresholds and test lists are quoted as the tools returned them, with the tool named.
- The expectation stated fits the phase and the region.
- Every claim about the program's product traces to a register entry or a document.

## Not AnA's to decide
- Whether a formulation change needs a bioequivalence or bridging study: the sponsor proposes, the agency accepts.
- Batch release: the quality unit's.
`,
  }),

  skill({
    key: 'cmc.specifications',
    name: 'Specifications and their justification',
    description:
      'Setting, reviewing or justifying a drug substance or drug product specification under ICH Q6A or Q6B: which tests, which acceptance criteria, the evidence behind each, how specifications tighten from first clinical use to registration, and how they differ by region.',
    disciplines: ['cmc'],
    useCases: ['drafting', 'review', 'gap-analysis', 'analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'drug substance specification',
      'drug product specification',
      'setting specifications',
      'specification setting',
      'acceptance criteria',
      'ich q6a',
      'q6a',
      'ich q6b',
      'q6b',
      'release specification',
      'release specifications',
      'shelf-life specification',
      'justification of specification',
      'justification of specifications',
      '3.2.s.4.5',
      '3.2.p.5.6',
      'batch analyses',
      'universal tests',
      'specification limits',
      'compendial',
      'pharmacopoeial',
      'ich q4b',
    ],
    tools: [
      'global_ri_cmc_specifications',
      'set_specifications',
      'list_cmc_registers',
      'classify_impurity',
      'explain_cmc_topic',
      'assess_recorded_process_capability',
      'get_cmc_requirements',
      'find_cmc_guidance',
      'check_dossier_consistency',
    ],
    references: [
      { kind: 'ich', id: 'Q6A' },
      { kind: 'ich', id: 'Q6B' },
      { kind: 'ich', id: 'Q3A(R2)' },
      { kind: 'ich', id: 'Q3B(R2)' },
      { kind: 'ich', id: 'Q4B' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
    ],
    instructions: `
## When this applies
Setting, reviewing or justifying a drug substance or drug product specification: which tests, which acceptance criteria, how each is justified, and how specifications evolve from first clinical use to registration and differ by region.

## Method
1. Establish product type (chemical or biotechnological), dosage form, route, compendial status, phase and target regions. A specification is a list of tests, references to analytical procedures and acceptance criteria (ICH Q6A for chemical products, Q6B for biotechnological and biological products).
2. Get the expected tests from the deterministic lookups: \`global_ri_cmc_specifications\` for the universal and dosage-form-specific tests, and \`set_specifications\` for the decision trees (for example dissolution or disintegration, particle size, polymorphic form, water content) and the approaches to setting limits. These list tests and approaches; the program's data set the numbers.
3. Read what is recorded with \`list_cmc_registers\` (specification, QC result, batch, stability, impurity profile).
4. Justify each acceptance criterion from evidence, and say which evidence carries it: batch analyses of the batches used in nonclinical and clinical studies; stability data and trends across the shelf life; impurity qualification, with thresholds from \`classify_impurity\`; the capability of the analytical procedure; pharmacopoeial requirements; and clinical relevance where it applies (dissolution). Never derive a limit by arithmetic on batch data yourself; how limits are set from few batches, and the coverage each statistical approach gives, comes from \`explain_cmc_topic\`.
5. Where enough batches are recorded, \`assess_recorded_process_capability\` shows whether the process meets a criterion batch after batch. Relay its refusals and any preliminary flag verbatim.
6. Phase: clinical-stage specifications are provisional and tighten as manufacturing experience builds. Record what changed and why; in a US IND the change is filed as an information amendment (21 CFR 312.31). Ask \`get_cmc_requirements\` with the phase.
7. Regions: release and shelf-life criteria, pharmacopoeial references and regional tests differ. Ask \`get_cmc_requirements\` for each authority. Pharmacopoeial texts evaluated under ICH Q4B are interchangeable only within the terms of the Q4B annex for that text. The specification guidelines have been under revision; check status with \`find_cmc_guidance\` before citing.
8. The justification belongs in 3.2.S.4.5 and 3.2.P.5.6. The platform composes Module 3 only for a small-molecule US IND (P-28); for a marketing application the justification of specification is authored in Document editor & authoring.
9. Run \`check_dossier_consistency\` so each criterion agrees across Module 3, the QOS and the stability protocol.

## Pitfalls reviewers raise
- Acceptance criteria copied from a pharmacopoeia or a template with no batch data behind them.
- Impurity limits above the levels qualified in the safety studies.
- A test omitted from the specification with no justification.
- Acceptance criteria wider than the procedure can reliably measure.

## Before answering
- Each proposed criterion names the evidence that supports it, and each test list or threshold names the tool that returned it.
- The answer says whether it describes a clinical-stage or a registration specification.
- No limit is offered that the program's data and the engines did not produce.

## Not AnA's to decide
- Approval of a specification: the quality unit's; its acceptance: the agency's.
- Disposition of a result outside a specification: the quality unit's investigation.
`,
  }),

  skill({
    key: 'cmc.stability',
    name: 'Stability programs and shelf life',
    description:
      'Designing stability programs and protocols, evaluating stability data and supporting a retest period or shelf life under ICH Q1A(R2), Q1B, Q1D, Q1E and Q5C, with conditions, regression, batch poolability and trend assessment computed by the platform engines.',
    disciplines: ['cmc'],
    useCases: ['study-design', 'analysis', 'drafting', 'review'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_STABILITY_PROTOCOL'],
    triggers: [
      'stability study',
      'stability studies',
      'stability protocol',
      'stability program',
      'stability programme',
      'stability data',
      'shelf life',
      'shelf-life',
      'retest period',
      'expiry dating',
      'ich q1a',
      'q1a(r2)',
      'photostability',
      'bracketing',
      'matrixing',
      'q1e',
      'batch poolability',
      'poolability',
      'accelerated stability',
      'long-term stability',
      'climatic zone',
      'out of trend',
      'q5c',
      '3.2.p.8',
      '3.2.s.7',
    ],
    tools: [
      'global_ri_stability_conditions',
      'design_stability_study',
      'start_intelligence_flow',
      'list_cmc_registers',
      'estimate_recorded_shelf_life',
      'assess_recorded_batch_poolability',
      'assess_recorded_stability_trend',
      'estimate_shelf_life',
      'assess_batch_poolability',
      'assess_shelf_life_stability',
      'assess_accelerated_stability',
      'explain_cmc_topic',
      'get_cmc_requirements',
      'find_cmc_guidance',
    ],
    references: [
      { kind: 'ich', id: 'Q1A(R2)' },
      { kind: 'ich', id: 'Q1B' },
      { kind: 'ich', id: 'Q1C' },
      { kind: 'ich', id: 'Q1D' },
      { kind: 'ich', id: 'Q1E' },
      { kind: 'ich', id: 'Q5C' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      CMC_RECORD,
    ],
    instructions: `
## When this applies
Designing a stability program or protocol, evaluating stability data, supporting a retest period or shelf life, or looking into an out-of-trend result, for a drug substance or drug product at clinical stage or for registration.

## Method
1. Establish: drug substance (retest period) or drug product (shelf life); chemical or biological (biologicals follow ICH Q5C); dosage form and container closure; intended storage (room temperature, refrigerated, frozen); target markets; phase; light sensitivity; and how many strengths and pack sizes.
2. Conditions come from the engines, never from memory. \`global_ri_stability_conditions\` returns long-term, intermediate and accelerated conditions for the storage category; \`design_stability_study\` returns the design for the climatic zone and markets (conditions, testing intervals, minimum batches, bracketing and matrixing options under Q1D, photostability under Q1B, attributes and evaluation approach). Quote them as returned.
3. Protocol content: batches representative of the process, scale and container of the supply the data must support; attributes susceptible to change, measured by stability-indicating procedures (analytical procedures skill); pull points; acceptance criteria; commitment batches; in-use, reconstitution and excursion studies where relevant. To gather it by interview, run \`start_intelligence_flow\` with document type "stability_study".
4. Evaluate recorded studies, found with \`list_cmc_registers\` (register: stability), with the tools that read the register:
   - \`estimate_recorded_shelf_life\`: ICH Q1E regression per attribute, reporting the limiting attribute;
   - \`assess_recorded_batch_poolability\`: whether batches may be combined into one estimate;
   - \`assess_recorded_stability_trend\`: out-of-trend results and the projected time to the limit.
   A refusal is a property of the data; relay it verbatim and never fall back to typed-in numbers.
5. Only for data the person supplies that is not on file: \`estimate_shelf_life\` (one batch), \`assess_batch_poolability\` (several batches), \`assess_shelf_life_stability\` (allowed percent change), \`assess_accelerated_stability\` (Arrhenius projection). A single-batch estimate is not a pooled one; say which was run.
6. Extrapolation: ICH Q1E limits how far a retest period or shelf life may extend beyond the observed long-term data. When an engine flags an estimate beyond the evaluated range, report that and do not extend it. An accelerated or modelled projection supports a proposal; \`explain_cmc_topic\` returns what Q1E allows and how predictive models are used at clinical stage.
7. Biologicals: Q5C expects data at the intended storage condition and attributes specific to the product (potency, aggregation and other degradation pathways). Ask \`explain_cmc_topic\` how shelf life is set at clinical stage and at licensure, and do not carry small-molecule extrapolation across by default.
8. Clinical stage: in a US IND the data must support stability for the duration of the planned studies, scaled to phase (21 CFR 312.23(a)(7)). Ask \`get_cmc_requirements\` with the phase and authority for what the record holds, including FDA's phase 1 CMC clarifications.
9. Guideline status: a consolidated ICH Q1 revision, which would replace Q1A(R2) to Q1E and Q5C, has been in draft. Check its status with \`find_cmc_guidance\` and cite draft concepts as draft.

## Before answering
- Every condition, interval, estimate and poolability decision names the tool that produced it.
- An estimate is evidence for a claim, not the claim: the registered shelf life is set by a person on the study close-out.
- The storage statement in the answer matches the conditions the data were generated under.

## Not AnA's to decide
- Assigning a retest period, shelf life or expiry date: the sponsor's quality function, accepted by the agency.
- Disposition of an out-of-trend or out-of-specification result: the quality unit's investigation.
`,
  }),

  skill({
    key: 'cmc.impurities',
    name: 'Impurities, mutagenic impurities and nitrosamines',
    description:
      'Identifying, qualifying, limiting and controlling impurities: organic impurities and degradation products (Q3A/Q3B), residual solvents (Q3C), elemental impurities (Q3D), extractables and leachables (Q3E), mutagenic impurities (M7) and nitrosamines, with thresholds and intakes from the platform engines.',
    disciplines: ['cmc'],
    useCases: ['analysis', 'drafting', 'review', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'impurity',
      'impurities',
      'impurity profile',
      'degradation products',
      'q3a',
      'q3b',
      'q3c',
      'q3d',
      'q3e',
      'qualification threshold',
      'identification threshold',
      'residual solvent',
      'residual solvents',
      'elemental impurities',
      'extractables',
      'leachables',
      'mutagenic impurity',
      'mutagenic impurities',
      'ich m7',
      'm7(r2)',
      'threshold of toxicological concern',
      'nitrosamine',
      'nitrosamines',
      'ndsri',
      'purge factor',
    ],
    tools: [
      'list_cmc_registers',
      'classify_impurity',
      'explain_cmc_topic',
      'assess_structural_alerts',
      'classify_mutagenic_impurity',
      'calculate_ttc',
      'control_mutagenic_impurity',
      'design_purge_study',
      'assess_nitrosamine_risk',
      'find_cmc_guidance',
    ],
    references: [
      { kind: 'ich', id: 'Q3A(R2)' },
      { kind: 'ich', id: 'Q3B(R2)' },
      { kind: 'ich', id: 'Q3C(R9)' },
      { kind: 'ich', id: 'Q3D(R2)' },
      { kind: 'ich', id: 'Q3E' },
      { kind: 'ich', id: 'M7(R2)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      CMC_RECORD,
    ],
    instructions: `
## When this applies
Identifying, qualifying, limiting or controlling impurities in a drug substance or drug product: organic impurities and degradation products, residual solvents, elemental impurities, extractables and leachables, mutagenic impurities and nitrosamines.

## Method
1. Establish each impurity's origin (starting material, intermediate, by-product, reagent, catalyst, degradation, solvent, element, leachable), whether it occurs in the drug substance or the drug product, the maximum daily dose, route, treatment duration, phase, and whether its structure carries an alert. Read recorded impurity profiles with \`list_cmc_registers\` (register: impurity_profile).
2. Organic impurities and degradation products (ICH Q3A(R2), Q3B(R2)): take reporting, identification and qualification thresholds from \`classify_impurity\` for the dose and context; never state a percentage or a daily intake from memory. Specify identified impurities, specified unidentified impurities and unspecified impurities, and a total. Above the qualification threshold, qualify: a level present in batches used in adequate safety studies is qualified; otherwise the safety basis must be shown. Q3A and Q3B are written for marketing applications; for clinical-stage limits ask \`explain_cmc_topic\`.
3. Residual solvents (Q3C): \`classify_impurity\` with the solvent returns its class and permitted daily exposure. Elemental impurities (Q3D(R2)): \`classify_impurity\` with the element and route returns its class and PDE. The Q3D method is a risk assessment across the drug substance, excipients, equipment, water and container closure, with controls where the assessment calls for them.
4. Mutagenic impurities (ICH M7(R2)), for every actual and potential impurity:
   - hazard assessment: \`assess_structural_alerts\` (two complementary (Q)SAR methodologies, expert rule-based and statistical, with expert review);
   - class 1 to 5: \`classify_mutagenic_impurity\`;
   - acceptable intake for the treatment duration and route, including less-than-lifetime limits and the cohort of concern: \`calculate_ttc\`;
   - control option and limit: \`control_mutagenic_impurity\`, with \`design_purge_study\` when control rests on purge.
   Report class, intake and option exactly as returned. A bacterial mutagenicity result on the impurity itself can change its class; the toxicology skill carries the test.
5. Nitrosamines: \`assess_nitrosamine_risk\` works from root causes (vulnerable amines, nitrosating agents and conditions, cross-contamination, packaging, excipients) to confirmatory testing. FDA and EMA revise acceptable intakes for nitrosamines, including drug-substance-related ones; check what the tool returns against the current positions with \`find_cmc_guidance\` before relying on it.
6. Extractables and leachables: ICH Q3E has been in draft; check its status with \`find_cmc_guidance\`. The method: extractables studies to find what could migrate, leachables studies under conditions of use, and a toxicological assessment of each leachable. \`explain_cmc_topic\` covers it.
7. Analytical capability: each procedure must detect and quantify at the level the limit requires (analytical procedures skill).
8. Versions: an engine names the guideline revision it was built on; confirm the current revision with \`find_cmc_guidance\` before citing it.

## Pitfalls reviewers raise
- Potential impurities from the route never assessed under M7, only the ones observed.
- Limits above the levels qualified in the toxicology batches.
- No nitrosamine risk assessment for a product with vulnerable amines or nitrite sources.
- An elemental impurity risk assessment that leaves out a source.

## Before answering
- Every threshold, PDE, acceptable intake, class or control option names the tool that returned it.
- Mutagenic and non-mutagenic impurities are kept apart: an M7 acceptable intake is not a Q3A threshold.
- The answer says whether it applies to the drug substance or the drug product.

## Not AnA's to decide
- Whether an impurity is qualified: the toxicologist's judgement, and the agency's acceptance.
- The expert review of a (Q)SAR prediction: a qualified person's call.
- Release of a batch with an impurity near its limit: the quality unit's.
`,
  }),

  skill({
    key: 'cmc.analytical-procedures',
    name: 'Analytical procedures and validation',
    description:
      'Developing, validating, transferring or changing an analytical procedure under ICH Q14 and Q2(R2): phase-appropriate validation, stability-indicating methods, compendial verification, method transfer and reference standards.',
    disciplines: ['cmc'],
    useCases: ['study-design', 'analysis', 'review', 'drafting'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'analytical method',
      'analytical methods',
      'analytical procedure',
      'analytical procedures',
      'method validation',
      'validation of analytical procedures',
      'q2(r2)',
      'ich q2',
      'q14',
      'ich q14',
      'analytical target profile',
      'method transfer',
      'stability-indicating',
      'stability indicating method',
      'forced degradation',
      'system suitability',
      'primary reference standard',
      'working reference standard',
      'reference standard qualification',
      'verification of compendial procedures',
      'phase-appropriate validation',
    ],
    tools: [
      'list_cmc_registers',
      'explain_cmc_topic',
      'validate_analytical_method',
      'assess_analytical_method_validation',
      'get_cmc_requirements',
      'find_cmc_guidance',
    ],
    references: [
      { kind: 'ich', id: 'Q2(R2)' },
      { kind: 'ich', id: 'Q14' },
      { kind: 'ich', id: 'Q1B' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      CMC_RECORD,
    ],
    instructions: `
## When this applies
Developing, validating, transferring or changing an analytical procedure, deciding how much validation a phase calls for, or showing that a procedure is stability-indicating.

## Method
1. Establish the procedure's purpose (identification, assay or potency, quantitative impurity test, limit test, dissolution, content uniformity), its technique, the product type, the phase and whether it is compendial. Read recorded procedures and reference standards with \`list_cmc_registers\` (registers: method, reference_standard).
2. Development (ICH Q14): define what the procedure must measure and how well, identify the parameters that affect its performance, study robustness during development, and set the controls that keep it performing (system suitability). Q14 describes a minimal and an enhanced approach; what the enhanced approach adds, and what it can earn later through established conditions, comes from \`explain_cmc_topic\`.
3. Validation (ICH Q2(R2)): take the characteristics required for the purpose and technique, and how each is evaluated, from \`validate_analytical_method\`. Evaluate supplied validation data (linearity, precision, accuracy) with \`assess_analytical_method_validation\` and report pass or fail as returned.
4. Phase: how much validation is expected at phase 1, at phase 2 and 3 and at marketing is held in the record. Ask \`explain_cmc_topic\` and \`get_cmc_requirements\` with the phase, and state what they return rather than a rule of thumb.
5. Stability-indicating: forced degradation (stress) studies show that the procedure separates and measures degradants; photostability stress follows ICH Q1B. Say what evidence of specificity the program holds and what is missing.
6. Transfer and compendial procedures: a transfer between laboratories is planned and documented (comparative testing, co-validation, revalidation or a justified waiver); a compendial procedure is verified as suitable under the actual conditions of use. Confirm the governing text with \`find_cmc_guidance\` before citing it.
7. Changes: a procedure changed between phases or after approval needs bridging data showing the new procedure is at least equivalent for its purpose; post-approval reporting is in the comparability and changes skill.
8. Reference standards (3.2.S.5, 3.2.P.6): primary and working standards, how each is qualified, and the traceability of the working standard to the primary.

## Before answering
- Each validation characteristic and acceptance approach names the tool that returned it.
- The answer says which phase it is written for.
- Validation results are reported as computed; a failed characteristic is reported as failed.

## Not AnA's to decide
- Approval of a validation protocol or report: the quality unit's.
- Whether a procedure is fit for its purpose in a dossier: the agency's acceptance.
`,
  }),

  skill({
    key: 'cmc.phase-appropriate-ind',
    name: 'Phase-appropriate CMC for a US IND',
    description:
      'What chemistry, manufacturing and controls a US IND needs at first-in-human, phase 2 and phase 3, CGMP for phase 1 material, and CMC changes filed as the program proceeds. This is the platform composition scope for a small-molecule drug.',
    disciplines: ['cmc', 'regulatory-strategy'],
    useCases: ['strategy', 'gap-analysis', 'drafting', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    regions: ['US'],
    submissionTypes: ['US_IND', 'US_IND_AMENDMENT', 'US_IND_ANNUAL', 'US_PRE_IND'],
    triggers: [
      'ind cmc',
      'cmc for an ind',
      'cmc for the ind',
      'phase 1 cmc',
      'phase-appropriate cmc',
      'phase appropriate cmc',
      'phase 2 cmc',
      'phase 3 cmc',
      'first-in-human cmc',
      'fih cmc',
      '312.23(a)(7)',
      'investigational drug product',
      'phase 1 gmp',
      'cgmp for phase 1',
      'cmc information amendment',
      'cmc clinical hold',
      '3.2.r',
    ],
    tools: [
      'get_cmc_requirements',
      'find_cmc_guidance',
      'lookup_fda_guidance',
      'get_document_section_requirements',
      'explain_cmc_topic',
      'assess_api_gmp',
      'list_cmc_registers',
      'execute_platform_command',
    ],
    references: [
      { kind: 'ich', id: 'Q7' },
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
      CMC_RECORD,
      { kind: 'record', id: 'server/services/cmc/us-ind-regional.ts', label: 'US IND regional CMC items (3.2.R)' },
    ],
    instructions: `
## When this applies
What CMC a US IND needs by phase: the original IND's quality section, what expands for phase 2 and 3, CGMP for phase 1 material, and CMC changes filed as the program proceeds. A small-molecule drug in a US IND is the platform's composition scope (decision P-28); for anything else, advise and use the root CMC skill's authoring path.

## Method
1. Establish the modality, the phase (first-in-human, phase 2, phase 3), the dosage form, the duration of the planned trials, whether the trial is exploratory, and whether a placebo or comparator is supplied. Read what the program holds with \`list_cmc_registers\`.
2. Get the requirements from the cited record: \`get_cmc_requirements\` with authority FDA, application type clinical_trial, the phase and the modality. It returns the regulations and FDA's IND CMC guidance by phase, with status and dates. Refer to FDA guidance by topic (content and format of phase 1 INDs; CMC for phase 2 and 3 INDs; CGMP for phase 1 investigational drugs; exploratory IND studies; FDA's phase 1 CMC flexibilities and clarifications) and confirm the document with \`find_cmc_guidance\` before citing it. \`lookup_fda_guidance\` returns only the dated facts the currency register holds; it does not confirm a guidance.
3. The regulation, 21 CFR 312.23(a)(7): CMC information sufficient to assure the identity, quality, purity and strength of the investigational drug, in an amount that depends on the phase, the duration, the dosage form and what else is known. For the drug substance: a description, the manufacturer, the general method of preparation, acceptable limits and analytical methods, and stability. For the drug product: components and quantitative composition, the manufacturer, a brief description of manufacture and packaging, limits and methods, and information assuring stability during the planned studies. Also the placebo, the labels given to investigators (21 CFR 312.6) and an environmental analysis (21 CFR Part 25). For the section-by-section IND outline, use \`get_document_section_requirements\` with document "ind_initial".
4. First-in-human emphasis: identification and control of the raw materials and the new drug substance. Open the CMC section by saying whether the chemistry or manufacture presents any signal of potential human risk, and relate the clinical material to the material used in the toxicology studies, because impurity qualification depends on that link. Specifications are provisional at this stage; how much validation and stability data are expected comes from \`explain_cmc_topic\` and the record, never from a rule of thumb.
5. CGMP: most phase 1 investigational drugs are exempt from 21 CFR Part 211 (21 CFR 210.2(c)) and are made under CGMP appropriate to phase 1 as FDA's phase 1 CGMP guidance describes; the exemption does not carry over to material used in phase 2 or 3. For a drug substance step, \`assess_api_gmp\` returns the GMP expectations, and ICH Q7 has a section on APIs for clinical trials.
6. As the program proceeds, information grows: more process detail, tightened specifications, validation and stability on clinical batches. File new CMC information and changes as information amendments (21 CFR 312.31) and summarise them in the IND annual report (21 CFR 312.33). A CMC deficiency bearing on subject safety can ground a clinical hold (21 CFR 312.42).
7. Platform composition, for a small-molecule US IND: Module 3 including the US regional section 3.2.R, which states the manufacturers, the placebo, the investigator labels and environmental analysis (cross-referenced to Module 1, stated and never attested), the phase 1 risk statement, the link between clinical and toxicology material, and CMC changes as information amendments. Through \`execute_platform_command\`, run \`module3_missing_inputs\` to see what blocks each section, then propose \`module3_build_section\` or \`module3_build_all\`, and check \`module3_readiness\` and \`module3_contradictions\`. A build runs only on the person's confirmation.

## Pitfalls reviewers raise
- No statement relating the clinical batch to the toxicology batch.
- Impurities in the clinical material not covered by the levels tested in toxicology.
- Stability information that does not cover the planned duration of the trial.
- Marketing-application content placed in an IND, or IND content missing because a marketing template was used.

## Before answering
- The phase is stated, and expectations for a later phase are not presented as phase 1 requirements.
- Each FDA guidance is named by topic and confirmed in the record, with its status.
- Module 1 items are described as Module 1's, not attested in Module 3.

## Not AnA's to decide
- Whether the IND may proceed or is placed on clinical hold: FDA's.
- Release of clinical material: the quality unit's.
- Signing and submitting the IND or an amendment: a person with signing authority.
`,
  }),

  skill({
    key: 'cmc.biologics',
    name: 'Biologics CMC',
    description:
      'CMC for recombinant proteins, monoclonal antibodies, vaccines and biosimilars: cell substrates and banks, viral safety, genetic stability, characterisation, specifications, potency, stability and comparability. The platform advises on biologics CMC; it does not compose a biologic Module 3 (P-28).',
    disciplines: ['cmc'],
    useCases: ['strategy', 'study-design', 'review', 'gap-analysis'],
    segments: ['biotech'],
    triggers: [
      'biologics cmc',
      'biologic cmc',
      'cell bank',
      'master cell bank',
      'working cell bank',
      'cell substrate',
      'q5a',
      'q5a(r2)',
      'viral safety',
      'viral clearance',
      'adventitious agents',
      'q5b',
      'expression construct',
      'genetic stability',
      'q5d',
      'potency assay',
      'bioassay',
      'host cell protein',
      'glycosylation',
      'product-related impurities',
      'biosimilar cmc',
      'analytical similarity',
      'vaccine cmc',
      'monoclonal antibody cmc',
      'mab cmc',
    ],
    tools: [
      'get_cmc_requirements',
      'explain_cmc_topic',
      'find_cmc_guidance',
      'set_specifications',
      'assess_biosimilar_cmc',
      'assess_analytical_similarity_biosimilar',
      'assess_analytical_similarity',
      'design_vaccine_cmc',
    ],
    references: [
      { kind: 'ich', id: 'Q5A(R2)' },
      { kind: 'ich', id: 'Q5B' },
      { kind: 'ich', id: 'Q5C' },
      { kind: 'ich', id: 'Q5D' },
      { kind: 'ich', id: 'Q5E' },
      { kind: 'ich', id: 'Q6B' },
      { kind: 'ich', id: 'Q11' },
      { kind: 'standard', id: 'ich_q5' },
      { kind: 'standard', id: 'phs_351' },
      COMPOSITION_SCOPE,
    ],
    instructions: `
## When this applies
CMC for a biotechnological or biological product (recombinant proteins, monoclonal antibodies, vaccines, biosimilars and other cell-line-derived products): cell substrates, viral safety, characterisation, specifications, potency, stability and comparability. Cell and gene therapies have their own skill.

## Method
1. Say the boundary when a build is in question: the platform advises on biologics CMC but does not compose a biologic's Module 3 (decision P-28). Its quality content is authored in Document editor & authoring, the evidence kept in Vault, and the filing made through the Submission center. The composer refuses a biologic by design; relay that reason.
2. Establish the product class, the expression system, the phase, the application (IND; BLA under section 351(a) of the PHS Act; biosimilar under 351(k)) and the region. Get the requirements for the phase and authority from \`get_cmc_requirements\` with modality biologic (or vaccine), and the reasoning from \`explain_cmc_topic\`. Confirm each guideline's version with \`find_cmc_guidance\`.
3. Cell substrate and banks (ICH Q5D): origin and history of the cell line, the master and working cell banks, their characterisation and testing, and cells at or beyond the limit of in vitro age. Expression construct and genetic stability (ICH Q5B).
4. Viral safety (ICH Q5A(R2)) rests on complementary approaches: selecting and testing cell lines and raw materials for adventitious agents, testing the product at appropriate stages of production, and showing that purification clears viruses (clearance studies with model viruses). Account for every material of human or animal origin.
5. Characterisation and specifications (ICH Q6B): physicochemical properties, biological activity, immunochemical properties, purity, product-related substances and impurities (variants, aggregates) and process-related impurities (host cell proteins, DNA, process additives). The specification covers identity, purity and impurities, potency and quantity, set from characterisation, lot history and stability; \`set_specifications\` with the biological product type returns the test set.
6. Potency: a biological assay that reflects the mechanism of action where possible, a reference standard program, and qualification that matures to validation as development proceeds; ask \`explain_cmc_topic\` what is expected at the program's phase.
7. Stability (ICH Q5C) is in the stability skill; comparability across process changes, in development and after approval (ICH Q5E), is in the comparability and changes skill.
8. Biosimilars: \`assess_biosimilar_cmc\` for the development strategy and reference product characterisation, \`assess_analytical_similarity_biosimilar\` for assigning attributes to tiers, and \`assess_analytical_similarity\` to run the tiered comparison on the program's data. Report verdicts and statistics as returned.
9. Vaccines: \`design_vaccine_cmc\` returns a stated-input worksheet and platform references inside the project's CMC workflow. Unknown valence, adjuvant or presentation facts stay unknown; profile examples do not establish the actual formulation or storage. Report reference expectations and ask for missing records/facts. This tool does not compose a biologic Module 3 or establish a product verdict.

## Pitfalls reviewers raise
- Cell bank testing incomplete before first-in-human use.
- Viral clearance claims without studies on the process actually used.
- A potency assay that does not reflect the mechanism of action, or has no reference standard.
- Process changes between toxicology, early clinical and pivotal material with no comparability data.

## Before answering
- The answer says it is advice and that the platform does not compose this Module 3.
- Every requirement cites what the record returned, with status; drafts are called drafts.
- Similarity verdicts and statistics are quoted as the engines returned them.

## Not AnA's to decide
- Whether material is comparable or biosimilar: the sponsor concludes from the data, the agency decides.
- Lot release: the quality unit's, and for licensed products also the agency's where it applies.
`,
  }),

  skill({
    key: 'cmc.cell-and-gene-therapy',
    name: 'Cell and gene therapy CMC',
    description:
      'CMC for cell therapies and gene therapies (autologous and allogeneic cells, gene-modified cells, viral vectors, non-viral delivery): starting materials, manufacture, release testing, potency and manufacturing-change comparability. The platform advises; it does not compose their Module 3 (P-28).',
    disciplines: ['cmc'],
    useCases: ['strategy', 'study-design', 'review', 'gap-analysis'],
    segments: ['biotech'],
    triggers: [
      'gene therapy cmc',
      'cell therapy cmc',
      'cgt cmc',
      'atmp cmc',
      'car-t manufacturing',
      'viral vector manufacturing',
      'vector manufacturing',
      'aav manufacturing',
      'lentiviral vector',
      'replication competent',
      'vector copy number',
      'empty capsid',
      'empty capsids',
      'chain of identity',
      'donor eligibility',
      'cgt potency',
    ],
    tools: [
      'get_cmc_requirements',
      'find_cmc_guidance',
      'explain_cmc_topic',
      'assess_gene_therapy_requirements',
      'assess_cell_therapy_manufacturing',
      'assess_atmp_comparability',
    ],
    references: [
      { kind: 'ich', id: 'Q5A(R2)' },
      { kind: 'ich', id: 'Q5D' },
      { kind: 'ich', id: 'Q5E' },
      { kind: 'standard', id: 'ich_q5' },
      COMPOSITION_SCOPE,
      CMC_RECORD,
    ],
    instructions: `
## When this applies
CMC for cell therapies (autologous, allogeneic, gene-modified cells such as CAR-T) and gene therapies (viral vectors such as AAV or lentivirus, and non-viral delivery): starting materials, manufacture, release testing, potency and comparability after manufacturing changes.

## Method
1. Say the boundary when a build is in question: the platform advises on cell and gene therapy CMC but does not compose its Module 3 (decision P-28). The quality content is authored in Document editor & authoring, the evidence kept in Vault, and the filing made through the Submission center.
2. Establish the product type, the vector or cell source, autologous or allogeneic, whether cells are genetically modified, whether the product is cryopreserved, the jurisdictions and the phase.
3. Requirements come from the record: \`get_cmc_requirements\` with modality atmp and the phase. FDA's guidance in this area covers CMC for gene therapy INDs, CMC for somatic cell therapy INDs, potency tests, CMC flexibilities for these products, and manufacturing changes and comparability; some of it is draft. Name each by topic and confirm it with \`find_cmc_guidance\` before citing. The record also holds the EU expectations for investigational ATMPs.
4. Gene therapy: \`assess_gene_therapy_requirements\` returns the vector profile, the CMC expectations, replication-competent virus testing and the other modality-specific requirements. Report them as returned.
5. Cell therapy: \`assess_cell_therapy_manufacturing\` returns the GMP framework, starting material and donor considerations, the release panel, and chain of custody and identity expectations.
6. Potency: a potency assay that reflects the product's mechanism, developed through the phases and in place before it must support licensure; for what is expected at the program's phase, and for vector-specific controls such as residual DNA and empty or partial capsids, ask \`explain_cmc_topic\`.
7. Manufacturing changes: \`assess_atmp_comparability\` returns the risk level, the comparability study design and the expected submission type. Plan comparability before the change, with retained pre-change material where possible.

## Before answering
- The answer says it is advice and that the platform does not compose this Module 3.
- Every requirement and duration cites the record or the engine that returned it; drafts are called drafts.
- Product-specific claims trace to the program's records.

## Not AnA's to decide
- Donor eligibility determinations and lot release: the responsible qualified persons'.
- Whether pre- and post-change product is comparable: the sponsor proposes from data, the agency decides.
`,
  }),

  skill({
    key: 'cmc.comparability-and-changes',
    name: 'Comparability and CMC changes',
    description:
      'A change to manufacture, controls, site, scale, formulation, analytical procedure, container closure or shelf life, during development or after approval: comparability (ICH Q5E), US supplement category and EU variation type, and ICH Q12 tools (established conditions, PACMP, lifecycle plan).',
    disciplines: ['cmc', 'regulatory-strategy'],
    useCases: ['lifecycle-change', 'strategy', 'study-design', 'analysis'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_COMPARABILITY'],
    triggers: [
      'comparability',
      'comparability protocol',
      'comparability study',
      'comparability exercise',
      'q5e',
      'ich q5e',
      'ich q12',
      'established conditions',
      'pacmp',
      'post-approval change',
      'post-approval changes',
      'postapproval change',
      'manufacturing change',
      'manufacturing site transfer',
      'prior approval supplement',
      'cbe-30',
      'cbe-0',
      'type ii variation',
      'type ib variation',
      'type ia variation',
      'supac',
      'q12',
      'plcm',
    ],
    tools: [
      'assess_postapproval_comparability',
      'assess_comparability_protocol',
      'assess_comparability',
      'assess_immunogenicity_comparability',
      'classify_post_approval_change',
      'global_ri_post_approval_change',
      'classify_post_submission_change',
      'assess_established_conditions',
      'design_pacmp',
      'plan_lifecycle_management',
      'explain_cmc_topic',
      'find_cmc_guidance',
    ],
    references: [
      { kind: 'ich', id: 'Q5E' },
      { kind: 'ich', id: 'Q12' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'standard', id: 'cfr_314' },
      { kind: 'standard', id: 'ich_q5' },
      { kind: 'record', id: 'shared/regulatory/change-control-taxonomy.ts', label: 'Change-control taxonomy' },
    ],
    instructions: `
## When this applies
A change to manufacture, controls, site, scale, formulation, analytical procedure, container closure or shelf life, during development or after approval: whether the product is comparable, what data show it, how the change is reported in each market, and how ICH Q12 tools reduce future reporting.

## Method
1. Establish what changes and why, the modality, the stage (in development or approved), the applications and markets affected, the critical quality attributes the change could affect, and the data that exist or are planned. The change enters the sponsor's change control under the pharmaceutical quality system (ICH Q10) before any filing.
2. In development: show the new material is comparable to the material that supported toxicology and earlier clinical use. For a small molecule that is usually the impurity profile, solid form and performance against qualified levels; for a biologic, ICH Q5E applies. In a US IND, the change is filed as an information amendment (21 CFR 312.31).
3. The comparability exercise (ICH Q5E for biotechnological and biological products) asks whether pre- and post-change product are highly similar in quality attributes and whether any difference has an adverse impact on safety or efficacy. It starts with analytical and functional data; nonclinical or clinical bridging is added only when those cannot conclude. Scope it with \`assess_postapproval_comparability\` (any modality) or \`assess_comparability_protocol\` (biologics), and compute attribute-by-attribute comparability from the program's data with \`assess_comparability\`. Where immunogenicity could change, \`assess_immunogenicity_comparability\` says what data are needed.
4. Reporting: \`classify_post_approval_change\` returns the US category (prior approval supplement, CBE-30, CBE-0 or annual report, under 21 CFR 314.70 or 601.12) and the EU variation type; \`global_ri_post_approval_change\` returns the filing vehicle by market (FDA, EMA, PMDA, Health Canada); \`classify_post_submission_change\` is a decision aid from the flags the person states. Report the category as returned and say it is a classification aid. Confirm the current classification guidance for each market with \`find_cmc_guidance\` before citing it; the EU variations framework and FDA's guidance on changes to an approved application are both named by topic.
5. ICH Q12 tools: \`assess_established_conditions\` sorts dossier elements into established conditions and supportive information, and shows what an enhanced development approach changes; \`design_pacmp\` designs a post-approval change management protocol or FDA comparability protocol for a planned change; \`plan_lifecycle_management\` maps planned changes to the right tool across markets. How far each region accepts established conditions comes from \`explain_cmc_topic\`.

## Pitfalls reviewers raise
- Comparability concluded on release testing alone when extended characterisation was needed.
- No retained pre-change material to compare against.
- A change implemented under a lower reporting category than its effect supports.
- Stability on post-change batches not provided or not committed.

## Before answering
- Every reporting category, variation type and comparability verdict names the tool that returned it.
- The answer distinguishes a development change from a post-approval one.
- The markets the answer covers are named; a category in one market is not assumed for another.

## Not AnA's to decide
- Whether pre- and post-change product is comparable: the sponsor concludes from data, the agency accepts or not.
- The final reporting category: the agency's classification governs; AnA's is an aid.
- Approval of the change in the sponsor's change control: the quality unit's.
`,
  }),

  skill({
    key: 'cmc.process-validation',
    name: 'Process validation and process capability',
    description:
      'Planning or reviewing process validation for a drug substance or drug product: process design, process qualification and continued process verification, with stage guidance, regional frameworks and process capability from recorded batches computed by the platform engines.',
    disciplines: ['cmc', 'quality-systems'],
    useCases: ['study-design', 'review', 'analysis', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'process validation',
      'ppq',
      'process performance qualification',
      'process qualification',
      'continued process verification',
      'ongoing process verification',
      'annex 15',
      'process capability',
      'cpk',
      'ppk',
      'critical process parameter',
      'critical process parameters',
      'cpps',
      'validation batches',
      'continuous manufacturing',
      'ich q13',
      'scale-up',
      '3.2.p.3.5',
      '3.2.s.2.5',
    ],
    tools: [
      'global_ri_process_validation',
      'assess_process_validation',
      'list_cmc_registers',
      'assess_recorded_process_capability',
      'get_cmc_requirements',
      'explain_cmc_topic',
      'assess_api_gmp',
    ],
    references: [
      { kind: 'ich', id: 'Q8(R2)' },
      { kind: 'ich', id: 'Q9(R1)' },
      { kind: 'ich', id: 'Q10' },
      { kind: 'ich', id: 'Q11' },
      { kind: 'ich', id: 'Q13' },
      { kind: 'standard', id: 'ich_q_chemistry' },
    ],
    instructions: `
## When this applies
Planning or reviewing process validation for a drug substance or drug product (process design, process qualification, continued or ongoing process verification), judging whether a process is capable from its recorded batches, or describing validation in the dossier.

## Method
1. Establish the stage (development, process qualification, commercial), the process type, the scale, the region, whether the product is sterile, whether manufacture is batch or continuous, and what has been done.
2. Framework by region: \`global_ri_process_validation\` returns the FDA lifecycle stages and the EU Annex 15 approaches, with citations. Stage-specific activities, deliverables and documentation for the process type and scale come from \`assess_process_validation\`. Report both as returned.
3. Process design: link critical quality attributes to critical process parameters and material attributes through risk assessment and experiments (ICH Q8(R2), Q9(R1), Q11). The control strategy is the output; a design space is claimed only where the data support it.
4. Process qualification: facilities, utilities and equipment qualified first; a protocol with sampling, acceptance criteria and a justified number of batches. Do not quote a fixed number of batches as a rule; the justification belongs to the program.
5. Continued process verification: trending and statistical process control on commercial batches. For capability from batch results already on file, run \`assess_recorded_process_capability\` (find the program's records with \`list_cmc_registers\`); relay any refusal and any preliminary flag verbatim.
6. In the dossier: 3.2.S.2.5 and 3.2.P.3.5 carry process validation or evaluation as the region requires. For a clinical-stage program, validation of the commercial process is not yet expected, but sterility assurance for a sterile product matters at every phase; ask \`get_cmc_requirements\` with the phase and \`explain_cmc_topic\` for what the record says is expected.
7. Continuous manufacturing (ICH Q13): control strategy, state of control, material traceability and the handling of disturbances; ask \`explain_cmc_topic\`.
8. For a drug substance step, \`assess_api_gmp\` returns the GMP stringency and the validation expectations that apply to it.

## Before answering
- Stage, region and process type are stated.
- Capability indices and grades are quoted as the engine returned them, with the number of batches behind them.
- Validation activities are described as the program's to perform; nothing is said to be validated without the records to show it.

## Not AnA's to decide
- Approval of a validation protocol or report, and the conclusion that a process is validated: the quality unit's.
- Acceptance of the validation package: the agency's.
`,
  }),

  skill({
    key: 'cmc.quality-overall-summary',
    name: 'Quality Overall Summary (Module 2.3)',
    description:
      'Drafting or reviewing the Module 2.3 Quality Overall Summary so it summarises Module 3 faithfully, composed by the platform from the program record within the P-28 boundary, and cross-checked against Module 3 and the other modules.',
    disciplines: ['cmc', 'medical-writing'],
    useCases: ['drafting', 'review', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_QOS'],
    triggers: [
      'quality overall summary',
      'qos',
      'module 2.3',
      'm2.3',
      '2.3.s',
      '2.3.p',
      'qos-ce',
      '2.3.r',
      'quality overall summaries',
    ],
    tools: [
      'draft_quality_overall_summary_m2_3',
      'get_document_section_requirements',
      'get_cmc_requirements',
      'check_dossier_consistency',
      'validate_cross_references',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_q_chemistry' },
      COMPOSITION_SCOPE,
    ],
    instructions: `
## When this applies
Drafting or reviewing Module 2.3, the Quality Overall Summary, so it summarises Module 3 faithfully and integrates what the quality reviewer needs.

## Method
1. Establish the application and modality first. \`draft_quality_overall_summary_m2_3\` composes from the open program's recorded CMC data with the same engine and the same boundary as the Module 3 build: a small-molecule drug in a US IND (decision P-28). Outside that it refuses; relay its reason and say the QOS is authored in Document editor & authoring.
2. Run \`draft_quality_overall_summary_m2_3\` without passing any CMC figures, specifications or stability results (a call that does is refused). Report its completeness and its missing-section gaps as returned; a gap is closed in the registers or Module 3, never by writing text into the summary.
3. Structure follows the CTD quality guideline (M4Q): an introduction, then 2.3.S drug substance, 2.3.P drug product, 2.3.A appendices and 2.3.R regional information, mirroring Module 3's headings. Confirm the expected content with \`get_document_section_requirements\` for "2.3".
4. Content rule: the QOS summarises. It adds no information, data or justification that is not already in Module 3 or elsewhere in the CTD. It emphasises the critical parameters of the product, explains where a guideline was not followed, and discusses key issues across sections, for example impurity qualification supported by the toxicology studies, with cross-references to where the data sit.
5. Regional forms differ (for example a Health Canada QOS template); ask \`get_cmc_requirements\` for the authority.
6. Before it goes forward: \`check_dossier_consistency\` against Module 3 and the other modules (shelf life, limits, batch numbers, composition), and \`validate_cross_references\` for every section reference in the document.

## Before answering
- Every statement in the summary has a home in Module 3 or elsewhere in the CTD.
- Completeness and gaps are reported as the composer returned them.
- Inconsistencies found are listed, not smoothed over.

## Not AnA's to decide
- Approval of the QOS for submission: the responsible author and the quality and regulatory approvers.
- Signing and filing: a person with signing authority.
`,
  }),
];
