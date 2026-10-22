/**
 * Regulatory strategy skills: setting a program's regulatory objective and route,
 * drug and device pathway selection, expedited programs, orphan and pediatric
 * obligations, combination products, agency meetings and global planning.
 *
 * Every figure, eligibility screen, class, clock and exclusivity period these
 * methods mention is returned by a named engine; the methods say which one and
 * what to do when it cannot answer (CLAUDE.md Rule 2).
 *
 * @module server/services/ana/skills/library/regulatory-strategy
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const REGULATORY_STRATEGY_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'regulatory-strategy',
    name: 'Regulatory strategy',
    description:
      "Building or testing a program's regulatory strategy: the regulatory objective, pathway options, precedent, risks, agency interactions and the order of filings. Sub-skills cover drug and device pathways, expedited programs, orphan and pediatric, combination products, agency meetings and global planning.",
    disciplines: ['regulatory-strategy'],
    useCases: ['strategy', 'gap-analysis', 'agency-interaction'],
    triggers: [
      'regulatory strategy',
      'regulatory pathway',
      'approval pathway',
      'path to approval',
      'path to market',
      'regulatory roadmap',
      'regulatory plan',
      'development strategy',
      'target product profile',
      'regulatory precedent',
      'regulatory landscape',
      'regulatory risk',
      'premortem',
      'pre-mortem',
      'still in force',
    ],
    tools: [
      'get_biotech_program_status',
      'advise_regulatory_pathway',
      'lookup_regulatory_precedents',
      'compare_submission_against_precedent',
      'assess_regulatory_landscape',
      'check_regulatory_currency',
      'lookup_fda_guidance',
      'scan_project_risks',
      'run_submission_premortem',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/modality.ts', label: 'Modality frame: statute, review centre and pathways per modality' },
      { kind: 'record', id: 'shared/regulatory/pathway-cautions.ts', label: "Cautions a program's own answers raise against a pathway" },
      { kind: 'record', id: 'shared/regulatory/agency-interaction.ts', label: 'Agency interaction and commitment model' },
    ],
    instructions: `
## When this applies
The person is setting or testing a program's regulatory strategy: what the program must achieve with regulators, by which route, in what order, and what could stop it. The sub-skills carry the detail of a pathway, designation, meeting or region; this method holds them together.

## Method
1. Establish the regulatory objective from the program record before anything else: the product and its modality or device type, the intended use or indication, the target markets, the development stage and the next decision the strategy has to inform. Where the record and the question disagree, say which you followed. For a biotech program, \`get_biotech_program_status\` reads where the program stands on the development arc; confirm the phase it infers with the person.
2. Establish what governs the product before naming a route. For a medicine the modality decides the statute and the review centre (modality frame record); for a device the class and the predicate position decide the routes; a combination product has no route until its primary mode of action is settled. The pathway-cautions record holds the contradictions a program's own answers create against a position: raise any that applies instead of offering that route plainly.
3. Lay out the pathway options with \`advise_regulatory_pathway\`: for each, the statutory basis, the evidence it expects and its pitfalls, as the tool returns them. Hand the selection detail to the drug-pathway or device-pathway method.
4. Ground the options in precedent. Run \`lookup_regulatory_precedents\` for comparable decisions, then \`compare_submission_against_precedent\` against the closest match before saying the program is aligned with how a similar case was decided. Use \`assess_regulatory_landscape\` for the competitive, safety and coverage picture. When the corpus is thin, say so; never fill the gap with recollection.
5. Check currency before relying on any rule that has changed recently: eSTAR, eCTD versions, the LDT rule, EU CTIS, the QMSR, ICH E6(R3), the EU pharmaceutical reform. \`check_regulatory_currency\` returns the registry's status and source for each; report it as returned and treat a void, vacated or superseded fact as not in force. Refer to FDA guidance by its topic only. \`lookup_fda_guidance\` returns the dated US facts the registry holds and does not confirm a guidance title, so a guidance the person did not supply is named as needing confirmation.
6. Name the risks to the strategy, each with its source: open project blockers from \`scan_project_risks\`, likely reviewer findings from \`run_submission_premortem\` on draft text (with its confidence and denominator), and the evidence gaps the pathway tools return. A risk with no tool or record behind it is labelled as your judgment.
7. Plan agency interactions and sequencing once the route and its risks are known: which questions need agency agreement, at which meeting, before which investment. The agency-meetings and global-planning methods carry the detail.
8. Present the strategy as decisions with their basis and the open questions: the chosen or candidate route and why, the precedent, the risks and mitigations, the interactions and the sequence. Mark each figure, timeline and eligibility statement with the tool that produced it.

## Before answering
- Every pathway, designation, timeline and exclusivity statement came from a named tool or record, not from memory.
- Facts the program has not stated are listed as missing, not assumed; a tool's "undetermined" or "not assessed" is reported as such.
- Currency was checked for any rule with a dated change.
- When the person is choosing, the options include the less favoured ones with the reason they are less favoured.

## Not AnA's to decide
- The strategy and the choice of route are the sponsor's. Eligibility for a designation, a product's classification and the acceptability of a development plan are the agency's.
- A pre-mortem or precedent comparison is an estimate bounded by its denominator, never a prediction of the agency's action.
`,
  }),

  skill({
    key: 'regulatory-strategy.drug-pathways',
    name: 'Drug and biologic pathway selection',
    description:
      'Choosing the marketing route for a medicine: 505(b)(1), 505(b)(2), 505(j) ANDA, 351(a) BLA or 351(k) biosimilar in the US, and the EU procedure and legal basis (centralised, decentralised, mutual recognition, national), at the level of method.',
    disciplines: ['regulatory-strategy'],
    useCases: ['strategy', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      '505(b)(1)',
      '505(b)(2)',
      '505b2',
      '505(j)',
      'anda',
      'reference listed drug',
      'rld',
      'paragraph iv',
      'suitability petition',
      '351(a)',
      '351(k)',
      'biosimilar pathway',
      'interchangeable',
      'nda or bla',
      'centralised procedure',
      'centralized procedure',
      'decentralised procedure',
      'decentralized procedure',
      'mutual recognition',
      'hybrid application',
      'legal basis',
      'data exclusivity',
      'regulatory exclusivity',
      'loss of exclusivity',
    ],
    tools: [
      'select_atmp_pathway',
      'select_505_pathway',
      'plan_biosimilar_ip_strategy',
      'advise_regulatory_pathway',
      'global_ri_regulatory_pathway',
      'compare_global_pathways',
      'global_ri_exclusivity',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'standard', id: 'cfr_314' },
      { kind: 'standard', id: 'phs_351' },
      { kind: 'record', id: 'shared/regulatory/modality.ts', label: 'Modality frame: statute, review centre and pathways per modality' },
      { kind: 'record', id: 'shared/regulatory/pathway-cautions.ts', label: "Cautions a program's own answers raise against a pathway" },
      { kind: 'currency-fact', id: 'eu-pharma-package' },
    ],
    instructions: `
## When this applies
The question is which application a medicine should be filed under, or what a chosen route commits the program to: the US section 505 and section 351 routes, and the EU procedures and legal bases.

## Method
1. Settle the statute first. Establish the modality from the program record; the modality frame record says which statute governs it and which centre reviews it. A biological product is licensed under section 351 of the PHS Act and a chemically synthesised drug is approved under section 505 of the FD&C Act. Since the 2020 transition of biological products under the BPCIA there is no section 505 route for a product that moved (pathway-cautions record). A combination product is settled by its primary mode of action first (combination-products method). For a cell or gene therapy, \`select_atmp_pathway\` returns the route and the expedited programs per jurisdiction.
2. For a section 505 product, establish the facts the decision turns on before running anything: whether the active ingredient has been approved before, whether there is a reference listed drug, and whether the dosage form, route, indication, combination or formulation differs from it. Run \`select_505_pathway\` with those facts and report its recommendation, alternatives and rationale verbatim. Carry these points of method into the answer:
   - 505(b)(1) rests on investigations the applicant conducted or has a right of reference to.
   - 505(b)(2) relies, for some of what approval needs, on investigations the applicant did not conduct and has no right of reference to (published literature, or FDA's finding for a listed drug). The reliance is stated, and the applicant's own data bridge the proposed product to what is relied on.
   - 505(j) is a duplicate of a reference listed drug shown by bioequivalence; a permitted difference from it may need a suitability petition first.
   - Patent certification and exclusivity questions follow from reliance on a listed drug; the tool's patent and exclusivity output is reported as returned.
3. For a biological product, distinguish a stand-alone 351(a) licence, which carries the full program in its own right, from a 351(k) application that shows biosimilarity, or interchangeability, to a reference product. A sponsor that calls its product biosimilar but files under 351(a) is taking a deliberate position that the application has to state (pathway-cautions record). For biosimilar exclusivity and the patent exchange, run \`plan_biosimilar_ip_strategy\`.
4. For the EU, establish the procedure and the legal basis separately. The procedure (centralised, decentralised, mutual recognition or national) follows from the product's scope: the centralised procedure is mandatory for some product types and optional for others, so check the product against the mandatory scope rather than assuming it. The legal basis (full, generic, hybrid, biosimilar, well-established use, fixed combination, informed consent) follows from what the dossier relies on. \`advise_regulatory_pathway\` returns a route's basis and evidentiary expectations.
5. For a program going to more than one market, \`global_ri_regulatory_pathway\` returns per market the trial authorisation and marketing application routes, and \`compare_global_pathways\` the application types and data-requirement differences side by side. Carry these into the global-planning method.
6. Exclusivity and loss of exclusivity come only from \`global_ri_exclusivity\` (market, product class, orphan and pediatric facts, approval date). Never state a protection period from memory. The EU pharmaceutical reform is proposed and not adopted: run \`check_regulatory_currency\` and say that current EU law governs data and market protection until new acts apply.
7. State the route as a position with its commitments: what the dossier must show, what it relies on, what must be bridged, and the open facts that could change the route.

## Pitfalls reviewers raise
- A 505(b)(2) application that does not identify each listed drug or publication relied on, or does not bridge the proposed product to it.
- A biosimilarity case that leans on clinical studies while the comparative analytical assessment, its foundation, is incomplete.
- An EU application whose stated legal basis does not match what the dossier actually relies on.

## Before answering
- The statute was settled from the modality before any route was named.
- Every route, exclusivity period and patent point is attributed to the tool that returned it.
- Missing facts that would change the route are named and asked for.

## Not AnA's to decide
- Whether a product is a biological product, whether a 505(b)(2) reliance or a suitability petition is acceptable, and whether a biosimilar is interchangeable are FDA's determinations. Eligibility for an EU procedure is decided by EMA or the member states.
- Patent strategy and patent certifications are legal decisions for the sponsor and its counsel.
`,
  }),

  skill({
    key: 'regulatory-strategy.device-pathways',
    name: 'Device and IVD classification and pathway',
    description:
      'Classifying a device or IVD and choosing its premarket route: 510(k), De Novo, PMA, HDE, 510(k) exemption, a 513(g) request or the Breakthrough Devices Program in the US, and the EU MDR or IVDR class and conformity assessment route, at the level of method.',
    disciplines: ['regulatory-strategy', 'device-engineering', 'diagnostics'],
    useCases: ['strategy', 'gap-analysis'],
    segments: ['device', 'ivd'],
    documentTypes: ['US_513G', 'US_BREAKTHROUGH_DEVICE', 'EU_IVDR_CLASSIFICATION'],
    triggers: [
      'device classification',
      'device class',
      'classify the device',
      'device pathway',
      'product code',
      'classification regulation',
      '513(g)',
      'de novo or 510(k)',
      '510(k) or de novo',
      'class i device',
      'class ii device',
      'class iii device',
      '510(k) exempt',
      'exempt device',
      'humanitarian device exemption',
      'humanitarian use device',
      'breakthrough device',
      'breakthrough devices program',
      'mdr classification',
      'ivdr classification',
      'annex viii',
      'classification rule',
      'conformity assessment route',
    ],
    tools: [
      'classify_device',
      'select_device_pathway',
      'lookup_regulatory_precedents',
      'design_device_clinical_evidence',
      'global_ri_device_classification',
      'build_global_device_strategy',
      'check_regulatory_currency',
      'get_regulatory_timeline',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/device-class.ts', label: 'US, MDR and IVDR risk classes, declared and rule-derived' },
      { kind: 'record', id: 'shared/regulatory/pathway-cautions.ts', label: "Cautions a program's own answers raise against a pathway" },
      { kind: 'record', id: 'shared/regulatory/predicate-positions.ts', label: '510(k) predicate strategies and what each commits a submission to' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'currency-fact', id: 'us-ldt-final-rule-void' },
    ],
    instructions: `
## When this applies
The question is what class a device or IVD falls in and which premarket route follows: 510(k), De Novo, PMA, HDE, a 510(k) exemption, a 513(g) request or the Breakthrough Devices Program in the US, and the MDR or IVDR class and conformity assessment route in the EU.

## Method
1. Establish the intended use and indications for use first, in the sponsor's words, then the facts classification turns on: technology, invasiveness and duration of contact, energy delivered, software function, sterility, measuring function, and for an IVD the analyte, specimen and how the result is used. Classification follows intended use, so a changed intended use is a new classification question.
2. US class and pathway. Find the classification regulation and product code for the device type where one exists. The classification regulation also states any exemption and its limitations, so check those before assuming a Class I or II device needs a 510(k). Run \`classify_device\` with framework \`fda\`, and \`select_device_pathway\` with the class, predicate position, novelty, Humanitarian Use Device status and exemption facts. When a deciding fact is missing the tools return "undetermined" with the facts they need: say so and ask for them, and never state a pathway.
3. Hold the route to its entry conditions (pathway-cautions and predicate-positions records):
   - A 510(k) is a comparison with a legally marketed predicate that has the same intended use; with no predicate there is no 510(k).
   - A De Novo has two entry conditions: no legally marketed device to compare to, or a not-substantially-equivalent determination on a 510(k) already filed. It asks FDA to classify the device into Class I or II, with the special controls the sponsor proposes.
   - A Class III device needs premarket approval unless it is a preamendments type, or substantially equivalent to one, for which FDA has not called for PMAs.
   - An HDE needs a Humanitarian Use Device designation first and shows probable benefit rather than effectiveness; take the eligibility facts from \`select_device_pathway\`.
   - Where the class itself is uncertain, a 513(g) request asks FDA for its view of the classification and the requirements that apply.
   - The Breakthrough Devices Program is a designation on top of a route, not a route.
4. Find precedent with \`lookup_regulatory_precedents\` (product code, device name, class) before asserting how FDA has handled a similar device.
5. Whether clinical data, and an IDE, are needed comes from \`design_device_clinical_evidence\`; report a null as not determined, never as not required.
6. EU class. Run \`classify_device\` with framework \`mdr\` or \`ivdr\` (the Annex VIII rules of each regulation). Report the class with the rule that gave it, or say the class is not determined and ask for the missing facts. A sponsor-declared Is, Im or Ir device is a Class I device with a notified body involved for the sterile, measuring or reprocessing aspect only (device-class record). \`global_ri_device_classification\` then returns the conformity assessment route and whether a notified body is required for the class.
7. Across regions, \`build_global_device_strategy\` maps which evidence is shared through recognised standards and which is region-specific. A 510(k) substantial-equivalence argument does not satisfy an MDR clinical evaluation or an IVDR performance evaluation.
8. For an IVD offered as a laboratory test, run \`check_regulatory_currency\`: the 2024 LDT final rule was vacated, so never advise compliance with it. Review-clock anchors come only from \`get_regulatory_timeline\`, labelled as goals, not commitments.

## Before answering
- The class and route each name the tool and rule that gave them, with the tool's caveat that rule wording must be confirmed against the regulation or the FDA classification database.
- No class or pathway is stated where a tool returned undetermined.
- US and EU answers are kept apart; one region's class does not imply the other's.

## Not AnA's to decide
- FDA decides classification, substantial equivalence, De Novo requests and PMAs; in the EU a notified body assesses conformity where the route requires one, and the manufacturer is responsible for the class it applies.
- A 513(g) response, a Breakthrough designation and a Humanitarian Use Device designation are FDA's to give.
`,
  }),

  skill({
    key: 'regulatory-strategy.expedited-programs',
    name: 'Expedited programs',
    description:
      'Whether a medicine may qualify for an expedited program, which to pursue and when: Fast Track, Breakthrough Therapy, RMAT, Accelerated Approval, Priority Review and rolling review in the US; PRIME, accelerated assessment and conditional marketing authorisation in the EU; SAKIGAKE in Japan.',
    disciplines: ['regulatory-strategy'],
    useCases: ['strategy', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    documentTypes: [
      'US_FAST_TRACK',
      'US_BTD',
      'US_RMAT',
      'US_ACCEL_APPROVAL',
      'US_ROLLING',
      'US_PRIORITY_REVIEW',
      'EU_PRIME',
      'EU_ACCEL_ASSESS',
      'JP_SAKIGAKE',
    ],
    triggers: [
      'fast track',
      'breakthrough therapy',
      'breakthrough designation',
      'btd',
      'rmat',
      'accelerated approval',
      'priority review',
      'rolling review',
      'rolling submission',
      'expedited program',
      'expedited pathway',
      'expedited designation',
      'prime scheme',
      'prime designation',
      'prime eligibility',
      'accelerated assessment',
      'conditional marketing authorisation',
      'conditional approval',
      'reasonably likely to predict',
      'confirmatory trial',
      'sakigake',
      'priority review voucher',
    ],
    tools: [
      'assess_expedited_program',
      'global_ri_expedited_programs',
      'assess_pathway_eligibility',
      'advise_special_designation',
      'lookup_regulatory_pathway',
      'assess_rolling_submission',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/special-designations.ts', label: 'Special designations and expedited programs taxonomy' },
    ],
    instructions: `
## When this applies
The question is whether a medicine may qualify for an expedited program, which to pursue and when, or what a designation commits the program to: Fast Track, Breakthrough Therapy, RMAT, Accelerated Approval, Priority Review and rolling review in the US; PRIME, accelerated assessment and conditional marketing authorisation in the EU; SAKIGAKE in Japan.

## Method
1. Establish the facts each program turns on, from the program record and the evidence in hand, before asking whether it qualifies: the condition and whether it is serious or life-threatening, the available therapy, the unmet need, the evidence level (nonclinical only, preliminary clinical, comparative), the endpoint and whether it is a surrogate or intermediate endpoint, the modality (a regenerative medicine therapy for RMAT) and the development phase.
2. Separate the kinds of program, which the special-designations record catalogues: designations requested during development (Fast Track, Breakthrough Therapy, RMAT, PRIME, SAKIGAKE); approval pathways on less complete or surrogate evidence (Accelerated Approval, EU conditional marketing authorisation); and review-stage acceleration (Priority Review, rolling review, EU accelerated assessment). They answer different questions and are not alternatives to one another; the US programs can be held together.
3. Screen eligibility with the engines. \`assess_expedited_program\` returns, for each FDA program, the criteria, rationale, benefits, timing and caveats. \`global_ri_expedited_programs\` screens one region's programs and lists the facts still missing for any it could not assess; an unstated fact is never read as false. \`assess_pathway_eligibility\` checks a single designation criterion by criterion and stays undetermined while any criterion is unanswered. Report each verbatim; a met screen is not a designation.
4. For the substance of a request, \`advise_special_designation\` returns the evidence expected and the common pitfalls for each program. \`lookup_regulatory_pathway\` lists other regulators' programs with their basis; confirm against the agency's current information before relying on one.
5. Rolling review is available only to a product whose designation confers it. When the program has one, \`assess_rolling_submission\` plans the module order and the pre-submission checklist from the sponsor's estimated module completion dates.
6. For Accelerated Approval, establish early how clinical benefit will be confirmed: the confirmatory trial, its status when the application is filed, and the evidence that makes the surrogate or intermediate endpoint reasonably likely to predict clinical benefit. Legislation in 2022 strengthened the confirmatory-trial expectations; take the current requirements from the tool output, not from recollection.
7. Sequence the requests against the development plan: what evidence exists now, which request it supports, and which meeting would test it first (agency-meetings method). A request made before the evidence supports it spends credibility with the review division.

## Pitfalls reviewers raise
- A Breakthrough Therapy request whose clinical evidence does not compare against available therapy, or whose endpoint's clinical significance is not argued.
- An unmet-need argument that ignores therapies approved since the program began.
- Accelerated Approval sought without a confirmatory trial designed, or underway, when the application is filed.

## Before answering
- Every eligibility statement, response time, review clock and benefit came from a named tool or the record, verbatim.
- Facts the tools listed as missing are named and asked for.
- The answer says plainly that an eligibility screen is not the agency's designation.

## Not AnA's to decide
- Designations, Priority Review and Accelerated Approval are granted by FDA; PRIME eligibility, accelerated assessment and conditional marketing authorisation are decided in the EU procedure; SAKIGAKE by Japan's authorities.
- Whether to request a designation, and when, is the sponsor's choice.
`,
  }),

  skill({
    key: 'regulatory-strategy.orphan-and-pediatric',
    name: 'Orphan designation and pediatric obligations',
    description:
      'Orphan designation in the US and EU, rare pediatric disease designation, and pediatric development obligations: PREA and the initial pediatric study plan in the US, the paediatric investigation plan in the EU, waivers, deferrals and Written Requests.',
    disciplines: ['regulatory-strategy', 'clinical'],
    useCases: ['strategy', 'drafting', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['US_ORPHAN', 'EU_ORPHAN'],
    triggers: [
      'orphan designation',
      'orphan drug designation',
      'orphan drug',
      'orphan exclusivity',
      'orphan prevalence',
      'orphan subset',
      'rare pediatric disease',
      'pediatric study plan',
      'initial pediatric study plan',
      'ipsp',
      'prea',
      'paediatric investigation plan',
      'pediatric investigation plan',
      'pip',
      'pdco',
      'pediatric waiver',
      'pediatric deferral',
      'written request',
      'pediatric exclusivity',
      'bpca',
      'significant benefit',
      'puma',
    ],
    tools: [
      'assess_orphan_designation',
      'global_ri_special_designations',
      'advise_special_designation',
      'plan_orphan_drug_designation',
      'search_literature',
      'global_ri_exclusivity',
      'assess_pediatric_requirements',
      'global_ri_pediatric_plan',
      'design_pediatric_investigation',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/special-designations.ts', label: 'Special designations and expedited programs taxonomy' },
      { kind: 'ich', id: 'E11(R1)' },
      { kind: 'currency-fact', id: 'eu-pharma-package' },
    ],
    instructions: `
## When this applies
The program may qualify for orphan designation in the US or EU, or owes pediatric development: a PREA assessment and initial pediatric study plan in the US, a paediatric investigation plan in the EU, or a Written Request the sponsor may choose to answer.

## Method
1. Establish the disease or condition as the agency would define it, then the facts: prevalence in each market with its source and method, seriousness, existing approved therapies, and the product's rationale in the condition. For a subset of a broader disease, the subset must be medically justified by the product's properties, not chosen to fall under a threshold.
2. Screen orphan eligibility with \`assess_orphan_designation\` (FDA and EMA side by side) or \`global_ri_special_designations\` for one market (FDA, EMA or PMDA). Report thresholds, criteria and missing facts as returned; a met screen is not a designation. Where a satisfactory method already exists for the condition in the EU, the application turns on showing significant benefit over it; \`advise_special_designation\` describes that case with its evidence and pitfalls.
3. The designation request comes before the marketing application in both regions, so settle its timing against the filing plan. To draft the FDA request, run \`plan_orphan_drug_designation\` with the product and a source for every prevalence and eligibility claim; \`search_literature\` finds prevalence and natural-history sources. The draft asserts no claim without a cited source and is a draft until reviewed and signed.
4. Orphan exclusivity and any pediatric extension come from \`global_ri_exclusivity\`. The EU pharmaceutical reform would change orphan and pediatric incentives but is proposed and not adopted; state current law.
5. Pediatric obligations. \`assess_pediatric_requirements\` returns the FDA PREA and EU paediatric-regulation obligations, waivers, deferrals and incentives for the program; \`global_ri_pediatric_plan\` returns per market whether a plan is required, its name, its due timing and the next actions. Orphan designation affects whether PREA applies, with an exception for certain molecularly targeted oncology drugs; take the determination from the tools.
6. The regulatory position rests on the plan's outline and its waiver and deferral case, which \`design_pediatric_investigation\` returns with the iPSP or PIP structure and the studies by ICH E11(R1) age group. The plan's clinical content (study design by age group, extrapolation, formulation and dose) is clinical development work and follows the pediatric development method.
7. Rare pediatric disease designation carries a priority review voucher program that has been subject to statutory sunset and reauthorization. Do not state its current status from memory; say it needs confirming against FDA's current information.

## Pitfalls reviewers raise
- Prevalence estimates with no stated method or sources, or an orphan subset that is not medically plausible.
- A waiver or deferral rationale that is not specific to the condition and the age groups.
- A plan that leaves an age-appropriate formulation for younger children unaddressed.

## Before answering
- Every threshold, exclusivity period, incentive and due date came from a named tool, verbatim.
- Each prevalence figure is attributed to its source and never estimated by you.
- US and EU positions are stated separately.

## Not AnA's to decide
- FDA's Office of Orphan Products Development grants US orphan designation; the European Commission grants EU designation on the COMP's opinion. EMA decides on a PIP, waiver or deferral on the PDCO's opinion; an iPSP is agreed with FDA.
- The prevalence figures and the choice of subset are the sponsor's to support.
`,
  }),

  skill({
    key: 'regulatory-strategy.combination-products',
    name: 'Combination products',
    description:
      'Whether a drug, biologic and device product is a combination product, its primary mode of action and lead centre, the Request for Designation, the marketing application, 21 CFR Part 4 cGMP under the QMSR, and the EU Article 117 notified-body opinion.',
    disciplines: ['regulatory-strategy', 'device-engineering'],
    useCases: ['strategy', 'agency-interaction'],
    documentTypes: ['US_RFD', 'EU_MDR_ART117_NBOP'],
    triggers: [
      'combination product',
      'primary mode of action',
      'pmoa',
      'request for designation',
      'rfd',
      'pre-rfd',
      'lead center',
      'office of combination products',
      'drug-device combination',
      'biologic-device combination',
      'co-packaged',
      'cross-labeled',
      'single-entity combination',
      'part 4 cgmp',
      '21 cfr part 4',
      'streamlined approach',
      'article 117',
      'integral drug-device',
      'prefilled syringe',
      'autoinjector',
      'constituent part',
    ],
    tools: [
      'classify_combination_product',
      'assess_combination_product',
      'determine_primary_mode_of_action',
      'select_combination_submission_pathway',
      'plan_combination_cgmp',
      'design_human_factors_study',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'iec_62366_1' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'record', id: 'shared/regulatory/qmsr-crosswalk.ts', label: 'QMSR crosswalk: ISO 13485 clauses and the removed QSR sections' },
      { kind: 'record', id: 'shared/regulatory/pathway-cautions.ts', label: "Cautions a program's own answers raise against a pathway" },
    ],
    instructions: `
## When this applies
A product combines a drug, a biologic or a device, and the question is whether it is a combination product, which centre leads, what a Request for Designation asks, which application carries it, how its cGMP works under 21 CFR Part 4, or how the EU treats the device part.

## Method
1. Establish the constituent parts and how they are put together: one physically or chemically combined entity, parts packaged together, or parts labelled for use together but supplied separately (and whether the other product is approved or investigational). Run \`classify_combination_product\` for the 21 CFR 3.2(e) category, or \`assess_combination_product\` for a first read. A product with only one kind of constituent is not a combination product.
2. Determine the primary mode of action: the single mode of action that provides the most important therapeutic action, the one expected to make the greatest contribution to the overall intended therapeutic effect. Run \`determine_primary_mode_of_action\` with each constituent's mode of action. It returns the PMOA, the lead centre, whether the assignment algorithm had to be used because the PMOA could not be determined with reasonable certainty, and whether a Request for Designation is advisable. Report its rationale as returned.
3. When the PMOA or the lead centre is genuinely uncertain, the route to certainty is FDA's Office of Combination Products: an informal pre-RFD inquiry or a formal Request for Designation. Prepare it to state the product description, each constituent's mode of action, the sponsor's PMOA position with its basis and the centre the sponsor recommends. Never present the lead centre as settled when the engine used the algorithm or recommended an RFD.
4. Choose the application with \`select_combination_submission_pathway\`, after the two steps above: the lead application type, single or separate applications, how the non-lead constituent is reviewed through intercentre consultation, and for the EU the Article 117 notified-body opinion on the device part of an integral drug-device product authorised as a medicine. Until the lead is settled, no route is offered plainly (pathway-cautions record).
5. Plan the quality system with \`plan_combination_cgmp\`. Part 4 lets one base system (drug cGMP or the device quality management system) be used, with the other system's called-out provisions added. The device side is now the QMSR, which incorporates ISO 13485:2016 by reference; the tool resolves the called-out provisions for the date given and shows removed QSR sections only as "formerly" (qmsr-crosswalk record). Report the provisions as returned and never cite a removed QSR section as current. Part 4 also sets postmarketing safety reporting for combination products.
6. The device constituent brings device evidence into the program: design controls, risk management, and human factors for the user interface. \`design_human_factors_study\` plans the usability work.
7. Confirm currency before citing the quality-system basis: \`check_regulatory_currency\` for the QMSR.

## Before answering
- The category, PMOA, lead centre and application each name the engine that returned them.
- Called-out cGMP provisions are cited as the tool resolved them for today's date.
- An uncertain lead centre is stated as uncertain, with the RFD route.

## Not AnA's to decide
- FDA's Office of Combination Products assigns the lead centre; a notified body gives the Article 117 opinion.
- Whether to file a pre-RFD inquiry or an RFD, and which quality-system base to operate, are the sponsor's decisions.
`,
  }),

  skill({
    key: 'regulatory-strategy.agency-meetings',
    name: 'Agency meetings and scientific advice',
    description:
      'Preparing for and following up agency meetings: FDA formal meetings (Type A, B, C, D, INTERACT, pre-IND), device Pre-Submissions and other Q-Submissions, and EMA scientific advice. When to ask, how to frame questions, the briefing package, and the minutes and follow-up.',
    disciplines: ['regulatory-strategy'],
    useCases: ['agency-interaction', 'strategy', 'drafting'],
    documentTypes: [
      'US_PRE_IND',
      'US_TYPE_A_MEETING',
      'US_TYPE_B_MEETING',
      'US_TYPE_C_MEETING',
      'US_QSUB',
      'US_IVD_QSUB',
      'EU_SCIENTIFIC_ADVICE',
      'RI_HA_MEETING',
    ],
    triggers: [
      'pre-ind meeting',
      'pre-ind',
      'type a meeting',
      'type b meeting',
      'type c meeting',
      'type d meeting',
      'interact meeting',
      'end-of-phase 2',
      'eop2',
      'pre-nda meeting',
      'pre-bla meeting',
      'pre-submission',
      'pre-sub',
      'q-sub',
      'q-submission',
      'scientific advice',
      'protocol assistance',
      'briefing package',
      'meeting request',
      'meeting minutes',
      'written response only',
      'fda meeting',
      'agency meeting',
    ],
    tools: [
      'plan_fda_meeting',
      'plan_device_submission',
      'run_submission_premortem',
      'lookup_regulatory_precedents',
      'create_ha_interaction',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/agency-interaction.ts', label: 'Agency interaction and commitment model' },
    ],
    instructions: `
## When this applies
The program needs the agency's view before committing: an FDA formal meeting for a drug or biologic (Type A, B, C, D or INTERACT, including pre-IND, end-of-phase and pre-application meetings), a device Pre-Submission or other Q-Submission, or EMA scientific advice or protocol assistance. Covers when to ask, how to frame the questions, the briefing package and what follows the meeting.

## Method
1. Decide whether a meeting is the right tool. Ask when a decision is expensive to reverse and the agency's view is uncertain: the nonclinical package for first-in-human dosing, the pivotal design and endpoints, a pathway or classification question, the adequacy of a data package before filing. Questions that published guidance already answers, or that ask the agency to design the program, are not meeting questions.
2. Choose the meeting type. For a drug or biologic, \`plan_fda_meeting\` classifies the meeting from the development phase and purpose and returns the request contents, timing, briefing structure and goal timelines; report the type and timings as returned. For a device, the Q-Submission program covers Pre-Submissions and the other Q-Sub types; \`plan_device_submission\` returns a Pre-Submission strategy for the chosen pathway. In the EU, scientific advice is requested from EMA (protocol assistance for a designated orphan medicine), and national competent authorities also give advice.
3. Frame each question so the agency can answer it with agreement or disagreement: state the sponsor's proposal and its basis, then ask "Does the Agency agree that ...". One issue per question, ordered by importance, each tied to the briefing section that supports it. Avoid open questions ("What does FDA recommend?") except where the program genuinely has no position yet.
4. Build the briefing package to support the questions, not to describe the program: the purpose and the questions; product and disease background; the data relevant to each question (nonclinical, clinical, CMC as needed); the sponsor's position on each question with its rationale; appendices holding the data the positions rely on. Every figure in it comes from the program's own reports and the engines that computed them.
5. Stress-test the package before it goes. \`run_submission_premortem\` on the draft text finds what a reviewer is likely to challenge; \`lookup_regulatory_precedents\` finds how comparable programs were handled. Where the evidence is thin, strengthen or narrow the sponsor's position rather than softening the question.
6. When the person asks to record the meeting in the platform, \`create_ha_interaction\` opens it (type, agency, title, objective) as a governed record that the questions and commitments attach to; it is a governed write, so it records the person's reason.
7. After the meeting. For an FDA drug or biologic meeting, FDA issues the official minutes; compare them promptly with the sponsor's own notes and raise any disagreement through FDA's process. For a device Pre-Submission meeting, the sponsor drafts the minutes and sends them to FDA. Turn each agreement and commitment into an action with an owner, and carry the agreements into the documents they affect: the protocol, the development plan, the next submission's cover letter. Preliminary written responses received before a meeting may answer enough to change the agenda or cancel the meeting; decide that deliberately.

## Before answering
- Meeting type, package timing and response goals came from \`plan_fda_meeting\` or the person, not memory.
- Each question states a sponsor position and asks for agreement.
- Advice is described as advice: meeting feedback is not a binding agency decision.

## Not AnA's to decide
- The agency decides whether to grant a meeting, its type and format, and what its minutes record.
- The sponsor decides which questions to ask and whether to follow the advice; only a person with authority sends the request.
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning',
    name: 'Global regulatory planning',
    description:
      'Sequencing filings across regions: the order of markets and what it depends on, reliance and work-sharing routes, and how regions differ in what they require, at the level of method. Covers medicines and devices.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'submission-assembly'],
    triggers: [
      'global strategy',
      'global regulatory strategy',
      'global submission',
      'multi-region',
      'multiregional',
      'ex-us',
      'filing sequence',
      'launch sequence',
      'which market first',
      'reliance pathway',
      'reliance route',
      'project orbis',
      'access consortium',
      'work-sharing',
      'collaborative registration',
      'certificate of pharmaceutical product',
      'ethnic factors',
      'bridging study',
      'mrct',
      'japan filing',
      'china filing',
      'in-country representative',
      'regional differences',
    ],
    tools: [
      'global_ri_strategy_brief',
      'global_ri_regulatory_pathway',
      'compare_global_pathways',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'lookup_ich_guideline',
      'global_ri_reliance_pathways',
      'get_market_submission_spec',
      'resolve_submission_plan',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
      { kind: 'record', id: 'shared/regulatory/regional-module1.ts', label: 'Regional Module 1 for FDA, EMA and PMDA' },
      { kind: 'currency-fact', id: 'eu-ctis-only-trials' },
      { kind: 'currency-fact', id: 'pmda-ectd-v4-mandatory' },
      { kind: 'currency-fact', id: 'eu-pharma-package' },
    ],
    instructions: `
## When this applies
The program will file in more than one market, and the question is the order of filings, which reliance or work-sharing routes apply, and how the regions differ in what they require, at the level of method.

## Method
1. Establish the target markets and why each matters (commercial priority, unmet need, a market whose approval others rely on), the product type, the development phase and the next milestone. A sequence is a business decision informed by regulation; ask for the commercial priorities rather than assuming them.
2. Get the per-market picture from the engines and report each as returned, including what was not assessed:
   - for a medicine, \`global_ri_strategy_brief\` composes per market the recommended pathway, designation screens, expedited programs, recommended agency meetings, Module 1 and labeling checklists, indicative fees, exclusivity and pediatric obligations; \`global_ri_regulatory_pathway\` returns the trial authorisation and marketing application per market; \`compare_global_pathways\` sets the application types, review mechanisms and data-requirement differences side by side;
   - for a device or IVD, \`advise_global_submission_plan\` returns per market the dossier standard, readiness and next action, and \`advise_global_market_strategy\` ranks markets by readiness.
3. Work out the dependencies that decide the order. Some markets rely on a reference agency's approval or on a certificate of pharmaceutical product; some require local clinical data or a bridging argument on ethnic factors (ICH E5(R1)); a multi-regional trial planned under ICH E17 can serve several markets at once. Use \`lookup_ich_guideline\` for both guidelines. Pediatric plans and orphan designations each have their own timing that must sit inside the sequence.
4. Find reliance and work-sharing routes with \`global_ri_reliance_pathways\` (Project Orbis, the Access Consortium, WHO collaborative registration and others, with eligibility). Each depends on a reference agency's review, so it shapes the order.
5. Account for what each region's dossier needs beyond the common modules. Module 1 is regional; the regional-module1 record holds FDA, EMA and PMDA, and other regulators are not modelled there. Each market has its own format, language and gateway rules (\`get_market_submission_spec\`). \`resolve_submission_plan\` returns the regional equivalent application, dossier standard and gateway for the US, EU and Japan, and whether the platform supports building and submitting each.
6. Check what has changed by region with \`check_regulatory_currency\`: EU clinical trial applications go through CTIS only, Japan requires eCTD v4.0 for new applications, and the EU pharmaceutical reform is proposed, not law.
7. Present the plan as a sequence with its logic: each filing, what it depends on, what it unlocks, the open facts, and the risks of the order chosen. Timings are the engines' planning anchors and are labelled as such.

## Before answering
- Every pathway, fee, clock and eligibility statement is attributed to the engine that returned it.
- Regions the engines do not model are named as not modelled, never filled from memory.
- The plan separates what the platform can build from advice for the sponsor's own plan.

## Not AnA's to decide
- The order of markets and the commercial priorities are the sponsor's decisions; each agency decides on its own application and on eligibility for reliance.
- At launch the platform has no multi-region submission planner (decision P-37) and composes CMC Module 3 only for a small-molecule US IND (decision P-28). A global plan is advice for the sponsor's own plan, not a platform record.
`,
  }),
];
