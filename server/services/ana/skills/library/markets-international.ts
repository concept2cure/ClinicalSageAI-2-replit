/**
 * Market skills, Asia-Pacific and the Americas outside the US: Japan, China,
 * South Korea, Canada, Australia, Brazil, India and Singapore, as children of
 * `regulatory-strategy.global-planning`.
 *
 * Every clock, fee, eligibility screen and requirement these methods mention
 * is returned by a named engine or a dated currency fact; the methods say which
 * one and what to do when it cannot answer (CLAUDE.md Rule 2).
 *
 * Engine coverage differs by market, and each method says so rather than
 * filling the gap: the per-market pathway engine and the strategy brief cover
 * Japan, Canada and Australia; the pathway comparison adds China, South Korea
 * and Brazil; the device market advisors cover all eight; India's and
 * Singapore's medicine routes are modelled by no engine.
 *
 * @module server/services/ana/skills/library/markets-international
 */

import { skill, type LibrarySkillSource } from '../types.js';

const MARKET_REGISTRY = {
  kind: 'record',
  id: 'server/services/global-markets/market-registry.ts',
  label: 'Device and IVD market registry: classes, routes, local holder and readiness elements per market',
} as const;

const PATHWAY_KNOWLEDGE = {
  kind: 'record',
  id: 'server/services/regulatory-strategy/regulatory-strategy-knowledge.ts',
  label: 'Global pathway registry behind the pathway comparison: authority, application type, timelines and data differences per market',
} as const;

const PATHWAY_ADVISOR = {
  kind: 'record',
  id: 'server/services/global-ri/regulatory-pathway-advisor.ts',
  label: 'Trial authorisation and marketing application routes per market (US, EU, JP, CA, UK, AU)',
} as const;

const PROGRAMS_CORPUS = {
  kind: 'record',
  id: 'server/services/ana-ri/regulatory-pathways-corpus.ts',
  label: 'Expedited and early-access programs by agency, with eligibility and basis',
} as const;

const RELIANCE_CATALOG = {
  kind: 'record',
  id: 'server/services/global-ri/reliance-pathways.ts',
  label: 'Reliance and work-sharing catalog: Project Orbis, Access Consortium, ASEAN joint assessment and others',
} as const;

export const MARKETS_INTERNATIONAL_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'regulatory-strategy.global-planning.japan',
    name: 'Japan: PMDA and MHLW',
    description:
      'Planning trials and filings in Japan for medicines and devices: PMDA consultations, the clinical trial notification and J-GCP, the J-NDA, foreign data and bridging under ICH E5(R1), master files and foreign manufacturer accreditation, post-approval changes, and device notification, certification and approval routes.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly', 'lifecycle-change'],
    regions: ['JP'],
    triggers: [
      'japan',
      'japanese',
      'pmda',
      'mhlw',
      'j-nda',
      'jnda',
      'shonin',
      'ninsho',
      'todokede',
      'pmda consultation',
      'j-gcp',
      'japanese phase 1',
      'japanese patients',
      'in-country caretaker',
      'designated mah',
      'foreign manufacturer accreditation',
      'registered certification body',
      'partial change approval',
      're-examination period',
      'drug loss',
      'drug lag',
    ],
    tools: [
      'global_ri_regulatory_pathway',
      'global_ri_strategy_brief',
      'compare_global_pathways',
      'lookup_ich_guideline',
      'check_regulatory_currency',
      'get_market_submission_spec',
      'validate_market_formatting',
      'resolve_submission_plan',
      'global_ri_fee_estimate',
      'global_ri_exclusivity',
      'global_ri_post_approval_change',
      'build_global_device_strategy',
      'advise_global_submission_plan',
      'get_regulatory_timeline',
    ],
    references: [
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
      { kind: 'currency-fact', id: 'pmda-ectd-v4-mandatory' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      { kind: 'record', id: 'shared/regulatory/regional-module1.ts', label: 'Regional Module 1 for FDA, EMA and PMDA' },
      PATHWAY_ADVISOR,
      MARKET_REGISTRY,
      { kind: 'standard', id: 'iso_13485' },
    ],
    instructions: `
## When this applies
The program will run trials in Japan or file there: PMDA consultations, the clinical trial notification and J-GCP, the J-NDA, whether foreign data carry over, master files and foreign sites, a post-approval change, or a device's route. The expedited-programs skill covers SAKIGAKE and conditional approval and the orphan-and-pediatric skill covers Japanese orphan designation; this method holds the Japan route together.

## Method
1. Establish the product, its modality, the stage, where Japan sits in the global sequence, and whether the sponsor has a Japanese entity. PMDA conducts the review and MHLW grants the approval (shonin). A sponsor with no Japanese entity appoints one for each role: an in-country caretaker for trials, and a marketing authorisation holder in Japan or a designated one under the foreign special approval system.
2. Get the route from the engines and report it as returned: \`global_ri_regulatory_pathway\` for the clinical trial notification and the J-NDA; \`global_ri_strategy_brief\` for the per-market brief, including the PMDA meetings it recommends and its Module 1 and labeling checklists; \`compare_global_pathways\` (market japan) for review timelines, data-requirement differences and inspection expectations. Timelines are planning anchors, not commitments.
3. Plan PMDA consultations early. They are fee-based and booked ahead, they cover points such as starting trials in Japan, the end of phase 2 and readiness to file, and their written record is relied on later in review. Confirm the current categories, fees and lead times with PMDA; the agency-meetings skill covers framing questions.
4. Decide how foreign data carry over before Japanese enrolment is planned. ICH E5(R1) frames ethnic sensitivity, the bridging data package and a bridging study; ICH E17 frames Japanese participation in a multi-regional trial; take both from \`lookup_ich_guideline\`. Recent MHLW notices relaxed the expectation of a Japanese phase 1 study before Japanese sites join a multi-regional trial: ask PMDA in a consultation rather than assuming either way. The special-populations skill covers the clinical pharmacology.
5. Settle site and CMC obligations, and name who must act on each: master file registration for a drug substance or excipient (a foreign holder appoints an in-country caretaker), accreditation of each foreign manufacturing site, and the GMP compliance inspection within the review.
6. Format and gateway. \`check_regulatory_currency\` (jurisdiction JP) returns PMDA's eCTD v4.0 fact for new applications with its date and status, and the ICH E6(R3) facts that bear on J-GCP. \`get_market_submission_spec\` holds the "jp-ectd" formatting and language rules (Japanese Module 1 and key summaries) and \`validate_market_formatting\` checks a file list against them. \`resolve_submission_plan\` states whether the platform can build and send a Japanese filing; never describe it as buildable or submittable where it says not. The regional-module1 record holds the JP Module 1 headings.
7. Fees, protection and change: \`global_ri_fee_estimate\` (market PMDA) returns indicative fees; \`global_ri_exclusivity\` (market PMDA) returns the re-examination period, which governs when follow-on products may file; \`global_ri_post_approval_change\` (market PMDA) classifies a change as a partial change approval or a minor change notification.
8. Devices. The class decides the route: notification (todokede), certification by a registered certification body against a certification standard (ninsho), or PMDA review and MHLW approval (shonin). QMS conformity rests on the MHLW QMS ordinance, aligned with ISO 13485; confirm how PMDA will use MDSAP audit reports for the device. \`build_global_device_strategy\` (region pmda) maps shared and Japan-specific evidence, \`advise_global_submission_plan\` (market "jp-pmda") returns the dossier standard, readiness and next action, and \`get_regulatory_timeline\` (pathway pmda_device) returns PMDA's review goals.

## Watch for
- A J-GCP question answered from ICH E6 alone: J-GCP is a ministerial ordinance with Japan-specific duties.
- Japanese translation of Module 1, Module 2 and labeling left out of the timeline.
- A route stated where an engine returned not modelled or not assessed.

## Not AnA's to decide
PMDA and MHLW decide consultations, classification, approval and the re-examination period. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28), so a Japanese Module 3 is the sponsor's.
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.china',
    name: 'China: NMPA and CDE',
    description:
      'Planning trials and filings in China for medicines and devices: clinical trial applications to CDE and its communication meetings, marketing applications and registration categories, acceptance of foreign clinical data, human genetic resources approvals and filings, the overseas holder agent, and device filing or registration by class with registration testing.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['CN'],
    triggers: [
      'china',
      'chinese',
      'nmpa',
      'cmde',
      'hgrac',
      'hgr',
      'human genetic resources',
      'chinese patients',
      'chinese cohort',
      'implied approval',
      'china ind',
      'registration testing',
      'overseas mah',
      'china legal agent',
    ],
    tools: [
      'compare_global_pathways',
      'lookup_ich_guideline',
      'lookup_regulatory_pathway',
      'get_market_submission_spec',
      'package_ectd_for_region',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
      PATHWAY_KNOWLEDGE,
      PROGRAMS_CORPUS,
      MARKET_REGISTRY,
    ],
    instructions: `
## When this applies
The program will enrol patients in China or file with the NMPA: a clinical trial application to CDE, a marketing application, whether global data will be accepted, human genetic resources approvals, or a device's filing or registration. NMPA's breakthrough therapy, conditional approval and priority review programs sit with the expedited-programs skill.

## Method
1. Establish the product, its modality, whether it is approved anywhere, whether Chinese patients are or will be in the pivotal trials, and who will hold the authorisation. An overseas holder designates a legal entity in China to act for it; settle that party early, because it files and carries obligations.
2. Get the China picture from \`compare_global_pathways\` (market china): authority, application type, review timelines, expedited equivalents, conditional approval, data-requirement differences and inspection expectations. Report it as the engine's planning data. The per-market pathway engine and the strategy brief do not model China; say so rather than filling the gap.
3. Clinical trial applications go to CDE under an implied-approval model: the trial may start if CDE raises no objection within the review period. Take the period from the engine output or CDE's current rules. CDE communication meetings (before a first trial, before a pivotal trial and before filing, among others) are where the China plan is tested; the agency-meetings skill covers framing.
4. Foreign data. China accepts foreign clinical data under its guidance on overseas data, judged for ethnic sensitivity under ICH E5(R1); a multi-regional trial with a Chinese cohort is designed under ICH E17. Take both from \`lookup_ich_guideline\`. How many Chinese patients a trial needs is a design question for CDE and the statistics, never a number to state from memory.
5. Human genetic resources. Establish whether the trial collects, uses, stores or exports Chinese human genetic resources (samples, or data derived from them), whether a foreign party is involved (a foreign-controlled entity in China can count as one), and whether samples or data leave China. These facts decide whether an approval, a record-filing or a security review applies, and when relative to trial start. No engine models these rules and the administering authority has changed under institutional reform: state the deciding facts and say the determination needs the current rules and the sponsor's counsel. Personal-information and data-export law may also apply.
6. Marketing application. The registration category depends on the product type (chemical drugs, biological products and traditional Chinese medicines each have their own classification) and on whether the product is marketed abroad; confirm it with CDE. \`get_market_submission_spec\` holds the "cn-ectd" record (Chinese Module 1 and labeling, eCTD being phased in); confirm against CDE's current electronic submission rules. \`package_ectd_for_region\` builds a China package on another region's backbone as a placeholder: read its regional-backbone status and never call it NMPA-conformant.
7. For an expedited route, \`lookup_regulatory_pathway\` (agency NMPA) lists the programs it holds with their basis; confirm against CDE's current procedures.
8. Devices and IVDs: Class I is record-filing and Classes II and III are registered, imported devices with the NMPA itself. Establish the product technical requirements, the registration testing (whether a self-test report is accepted or a qualified institution must test is set by current rules) and the clinical evaluation route (exemption catalogue, comparison with a marketed device of the same type, or clinical data, which may include overseas data). \`advise_global_submission_plan\` (market "cn-nmpa") and \`advise_global_market_strategy\` return dossier elements, readiness, the local agent requirement and blockers.
9. Currency: \`check_regulatory_currency\` may hold no China fact; when it returns none, say so and mark each rule for confirmation against NMPA's current publications.

## Watch for
- Human genetic resources work started after site start-up, which delays the first patient.
- A global design with no Chinese cohort, followed by a late request for local data.
- An engine's review timeline presented as an NMPA commitment.

## Not AnA's to decide
NMPA decides registration category, acceptance of foreign data and approval; the competent authority decides human genetic resources approvals. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.south-korea',
    name: 'South Korea: MFDS',
    description:
      'Planning trials and filings in South Korea for medicines and devices: MFDS IND approval under Korean GCP, the new drug application and the assessment of foreign data under ICH E5(R1), drug master file and overseas site requirements, and device and IVD notification, certification and approval by class with KGMP.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['KR'],
    triggers: [
      'korea',
      'south korea',
      'korean',
      'mfds',
      'kgmp',
      'kdmf',
      'korean gcp',
      'kgcp',
      'bridging data review',
      'korean bridging',
      'korean patients',
      'korea license holder',
      'korean labeling',
      'korean labelling',
    ],
    tools: [
      'compare_global_pathways',
      'lookup_ich_guideline',
      'get_market_submission_spec',
      'package_ectd_for_region',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
      PATHWAY_KNOWLEDGE,
      MARKET_REGISTRY,
      { kind: 'standard', id: 'iso_13485' },
    ],
    instructions: `
## When this applies
The program will run trials in South Korea or file with MFDS: an IND, a new drug application, whether foreign data need a bridging argument, drug master file and site requirements, or a device or IVD route. Korean orphan and expedited designations are read from the engine here and planned with the orphan-and-pediatric and expedited-programs skills.

## Method
1. Establish the product, its modality, its approval status elsewhere, whether Korean patients are in the pivotal trials, and who will hold the Korean licence. A foreign sponsor works through a Korean entity (an importer or licence holder) that files and carries post-approval duties.
2. Get the Korea picture from \`compare_global_pathways\` (market south_korea): authority, application type, standard and expedited review timelines, expedited and conditional programs, the orphan program, data-requirement differences and GMP expectations. Report it as the engine's planning data, and confirm program names and criteria with MFDS, which has added an expedited route for innovative products in recent years. The per-market pathway engine and the strategy brief do not model Korea; say so.
3. Clinical trials need MFDS approval of the IND and approval by each site's IRB under Korean GCP. Establish the phase and whether Korean sites join a multi-regional trial, and plan the two reviews together.
4. Foreign data. MFDS assesses whether foreign clinical data extrapolate to Korean patients under ICH E5(R1), and may ask for a bridging study when ethnic sensitivity is not settled. Build the bridging data package (pharmacokinetics, dose-response and safety in East Asian or Korean participants) and, where possible, plan Korean participation in the multi-regional trial under ICH E17; \`lookup_ich_guideline\` returns both. Ask MFDS early, in a consultation, whether the package is enough. The special-populations skill covers the clinical pharmacology.
5. CMC and sites: confirm whether the drug substance needs registration in MFDS's drug master file system, whether each overseas manufacturing site must be registered and evaluated for GMP, and how MFDS uses inspections by other PIC/S authorities. Name who must act on each.
6. Dossier and format: \`get_market_submission_spec\` holds the "kr-ectd" record (Korean Module 1 and labeling); confirm MFDS's current electronic submission rules before relying on it. \`package_ectd_for_region\` builds a Korean package on another region's backbone as a placeholder: read its regional-backbone status and never call it MFDS-conformant. Korean Module 1 is not in the regional-module1 record.
7. Devices and IVDs fall under separate acts, each with four risk classes. The lower classes are notified or certified; the higher classes need MFDS approval with technical document review and clinical or performance data. KGMP certification of the manufacturer is required separately, and MDSAP or ISO 13485 evidence supports it without replacing the audit. \`advise_global_submission_plan\` (market "kr-mfds") and \`advise_global_market_strategy\` return dossier elements, readiness, the local licence-holder requirement and blockers.
8. Currency: \`check_regulatory_currency\` may hold no Korea fact; when it returns none, say so and mark the point for confirmation against MFDS's current notices.

## Watch for
- Korean patients left out of the global trial, then a bridging study requested at filing.
- Engines that disagree, for example on which authorities take part in a reliance program: report both and flag the difference.
- Korean translation of labeling and Module 1 left out of the timeline.

## Not AnA's to decide
MFDS decides IND approval, whether bridging data suffice, classification, KGMP certification and approval. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.canada',
    name: 'Canada: Health Canada',
    description:
      'Planning trials and filings in Canada for medicines and devices: clinical trial applications, the NDS, SNDS and ANDS, notices of compliance, NOC/c and priority review, the bilingual product monograph, reliance and work-sharing, post-approval changes, and medical device licences by class with the MDSAP requirement.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly', 'lifecycle-change'],
    regions: ['CA'],
    triggers: [
      'canada',
      'canadian',
      'health canada',
      'notice of compliance',
      'noc/c',
      'noc with conditions',
      'new drug submission',
      'nds',
      'snds',
      'ands',
      'pre-cta meeting',
      'pre-nds meeting',
      'canadian cta',
      'product monograph',
      'medical device licence',
      'medical device license',
      'mdel',
      'mdsap certificate',
      'investigational testing authorization',
      'investigational testing authorisation',
      'schedule d',
      'bilingual labelling',
      'bilingual labeling',
    ],
    tools: [
      'global_ri_regulatory_pathway',
      'global_ri_strategy_brief',
      'compare_global_pathways',
      'lookup_regulatory_pathway',
      'global_ri_reliance_pathways',
      'global_ri_fee_estimate',
      'global_ri_post_approval_change',
      'get_market_submission_spec',
      'package_ectd_for_region',
      'advise_global_submission_plan',
      'check_regulatory_currency',
    ],
    references: [PATHWAY_ADVISOR, PROGRAMS_CORPUS, RELIANCE_CATALOG, MARKET_REGISTRY, { kind: 'standard', id: 'iso_13485' }],
    instructions: `
## When this applies
The program will run trials in Canada or file with Health Canada: a clinical trial application, a new drug submission or supplement, a notice of compliance with conditions or priority review, reliance on another regulator's review, a post-approval change, or a medical device licence. The expedited-programs skill places priority review and NOC/c beside other regions' programs.

## Method
1. Establish the product, its modality (a biologic is a Schedule D drug reviewed by the biologics directorate), the stage, its status with other regulators and Canada's place in the sequence.
2. Get the route from the engines and report it as returned: \`global_ri_regulatory_pathway\` for the clinical trial application and the NDS (or ANDS for a generic); \`global_ri_strategy_brief\` for the per-market brief, including meetings and Module 1 and labeling checklists; \`compare_global_pathways\` (market canada) for review timelines, data-requirement differences and GMP expectations.
3. Clinical trials: a drug trial needs a clinical trial application under Division 5 of the Food and Drug Regulations, reviewed against a default period, and research ethics board approval. A pre-CTA meeting is optional and useful for a first trial in a novel area. Take the review period from the engine, and check currency: Health Canada has been modernising its clinical trial regulations.
4. Marketing: an NDS ends in a notice of compliance and an SNDS changes an approved product. NOC/c can follow promising evidence in a serious condition, with confirmatory studies undertaken in writing; priority review is requested before filing, on evidence of substantial benefit. \`lookup_regulatory_pathway\` (agency Health Canada) returns the eligibility and basis it holds for both; a met criterion is a screen, not a decision. A pre-submission meeting before the NDS tests the package.
5. Reliance and work-sharing: \`global_ri_reliance_pathways\` (target market CA, oncology flag where it applies) returns the Access Consortium and Project Orbis with rationale. Each depends on the timing of the reference review, so it shapes the sequence. Health Canada has also been adding provisions to use foreign decisions; confirm with the engine and the currency registry whether such a route applies and is in force before relying on it.
6. Fees and changes: \`global_ri_fee_estimate\` (market HEALTH_CANADA) returns indicative fees, and \`global_ri_post_approval_change\` (market HEALTH_CANADA) classifies a change as an SNDS, a notifiable change or an annual notification. Data protection and patent linkage are not modelled by the exclusivity engine; confirm them against the regulations.
7. Labeling and format: the product monograph and labels are bilingual, English and French. \`get_market_submission_spec\` holds the "ca-ectd" record. \`package_ectd_for_region\` writes a Canadian backbone whose Module 1 is filed flat: read its regional-backbone status, never call the package Health Canada-conformant, and never claim the platform transmitted it.
8. Devices: importers, distributors and manufacturers of Class I devices selling directly need an establishment licence (MDEL). Class II to IV devices need a medical device licence whose application carries a valid MDSAP certificate covering the device, and a clinical study of a Class II to IV device needs an investigational testing authorization. \`advise_global_submission_plan\` (market "ca-health-canada") returns the dossier standard, readiness and next action.
9. Currency: run \`check_regulatory_currency\` (jurisdiction CA) and report what it returns; when it holds no fact for the point, say so and mark it for confirmation.

## Watch for
- An MDSAP certificate whose scope does not cover the device or the manufacturing site.
- NOC/c sought with no confirmatory study planned or underway.
- French text left out of the labeling plan.

## Not AnA's to decide
Health Canada decides eligibility for priority review and NOC/c, device classification and licensing. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.australia',
    name: 'Australia: TGA',
    description:
      'Planning trials and filings in Australia for medicines and devices: the CTN and CTA clinical trial schemes, registration of prescription medicines on the ARTG, comparable overseas regulator reliance routes, priority and provisional determinations, the Australian sponsor, and device inclusion on the ARTG on conformity assessment evidence.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['AU'],
    triggers: [
      'australia',
      'australian',
      'tga',
      'artg',
      'ctn scheme',
      'cta scheme',
      'ctx scheme',
      'comparable overseas regulator',
      'cor-a',
      'cor-b',
      'australian sponsor',
      'priority determination',
      'provisional determination',
      'provisional registration',
      'pre-submission planning form',
      'hrec',
      'conformity assessment evidence',
      'artg inclusion',
      'application audit',
    ],
    tools: [
      'global_ri_regulatory_pathway',
      'global_ri_strategy_brief',
      'compare_global_pathways',
      'lookup_regulatory_pathway',
      'global_ri_reliance_pathways',
      'get_market_submission_spec',
      'package_ectd_for_region',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [PATHWAY_ADVISOR, PROGRAMS_CORPUS, RELIANCE_CATALOG, MARKET_REGISTRY, { kind: 'standard', id: 'iso_13485' }],
    instructions: `
## When this applies
The program will run trials in Australia or seek registration with the TGA: the CTN or CTA scheme, registration of a prescription medicine on the ARTG, reliance on a comparable overseas regulator, a priority or provisional determination, or inclusion of a device. The expedited-programs skill places the determinations beside other regions' programs.

## Method
1. Establish the product, its modality, its approvals and evaluation reports elsewhere, the Australian sponsor (a person or company in Australia holds every ARTG entry and carries its obligations), and Australia's place in the sequence.
2. Get the route from the engines and report it as returned: \`global_ri_regulatory_pathway\` for the trial scheme and ARTG registration, \`global_ri_strategy_brief\` for the per-market brief and its checklists, and \`compare_global_pathways\` (market australia) for review timelines, data-requirement differences and GMP expectations.
3. Clinical trials: under the CTN scheme the sponsor notifies the TGA and the approving HREC reviews the protocol; under the CTA scheme (formerly CTX, a name the engine may still use) the TGA evaluates the trial first. The choice turns on the product's risk and what is known about it: establish those facts, and leave the decision to the sponsor and the HREC.
4. Registration: a prescription medicine starts with pre-submission planning, then the dossier, in ICH CTD format with an Australian Module 1; Product Information and Consumer Medicine Information follow Australian requirements. A priority or provisional determination is applied for before the registration dossier; \`lookup_regulatory_pathway\` (agency TGA) returns the eligibility and basis it holds, and the determination itself is the TGA's.
5. Reliance. The comparable overseas regulator routes (COR-A and COR-B) use another regulator's approval and its unredacted evaluation reports, so the product, indication and manufacturing must match what that regulator assessed. The engine catalog does not hold the COR routes: confirm the current conditions and regulator list with the TGA. \`global_ri_reliance_pathways\` (target market AU, oncology flag where it applies) returns the Access Consortium and Project Orbis with rationale.
6. Format: \`get_market_submission_spec\` holds the "au-ectd" record. \`package_ectd_for_region\` builds an Australian package on another region's backbone as a placeholder: read its regional-backbone status and never call it TGA-conformant. Australian Module 1 is not in the regional-module1 record.
7. Devices and IVDs: inclusion on the ARTG rests on the manufacturer's conformity assessment evidence, either a TGA conformity assessment certificate or evidence from a comparable overseas regulator (EU notified-body certificates and MDSAP among them), with the class under Australian rules. Some applications are subject to an application audit, mandatory for certain higher-risk kinds; confirm whether it applies. \`advise_global_submission_plan\` (market "au-tga") and \`advise_global_market_strategy\` return dossier elements, readiness, the sponsor requirement and blockers.
8. Currency: \`check_regulatory_currency\` may hold no Australian fact; when it returns none, say so and mark each rule for confirmation against the TGA's current guidance. No fee engine covers the TGA.

## Watch for
- A COR application whose product, indication or manufacturing differs from what the overseas regulator approved.
- A CTN chosen without the HREC agreeing that the scheme fits.
- An overseas certificate that has lapsed or does not cover the device's class or variant.

## Not AnA's to decide
The TGA decides determinations, eligibility for a COR route, classification and registration; an HREC approves the trial protocol. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.brazil',
    name: 'Brazil: ANVISA',
    description:
      'Planning clinical research and registration in Brazil for medicines and devices: ANVISA review of trials alongside ethics review, registration of medicines and GMP certification, optimised or reliance routes where they exist, the Brazilian registration holder and Portuguese labeling, and device notification or registration by class.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['BR'],
    triggers: [
      'brazil',
      'brazilian',
      'anvisa',
      'conep',
      'cbpf',
      'b-gmp',
      'inmetro',
      'bula',
      'brazilian registration holder',
      'brazil registration holder',
      'registro',
      'cadastro',
      'optimized analysis',
      'optimised analysis',
      'sworn translation',
    ],
    tools: [
      'compare_global_pathways',
      'lookup_regulatory_pathway',
      'global_ri_reliance_pathways',
      'get_market_submission_spec',
      'package_ectd_for_region',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [PATHWAY_KNOWLEDGE, PROGRAMS_CORPUS, RELIANCE_CATALOG, MARKET_REGISTRY],
    instructions: `
## When this applies
The program will run trials in Brazil or register a medicine or device with ANVISA: review of a clinical development plan, registration of a new medicine and its GMP certification, an optimised or reliance-based review, or a device notification or registration.

## Method
1. Establish the product, its modality, its approval status with other regulators, whether Brazilian sites are in the trials, and the Brazilian registration holder: a company established in Brazil holds the registration and its obligations. ANVISA is an ICH member, and dossiers follow the CTD with Brazilian Module 1 content.
2. Get the Brazil picture from \`compare_global_pathways\` (market brazil): authority, application type, review timelines, expedited and conditional mechanisms, data-requirement differences and GMP expectations. Report it as the engine's planning data. The per-market pathway engine and the strategy brief do not model Brazil; say so.
3. Clinical research: a trial that supports registration is reviewed by ANVISA (the clinical development dossier) and, separately, by the research ethics system (the local committee and, for some studies, the national commission, CONEP). Both the ethics framework and ANVISA's clinical research rules were revised recently: confirm the current routes, documents and clocks, and plan the two reviews together.
4. Registration: establish the registration category; the GMP certificate (CBPF) each manufacturing site needs, which ANVISA grants on its own inspection or on the basis of another authority's; the Portuguese labeling and package insert (bula); and sworn translations of foreign documents. \`get_market_submission_spec\` holds the "br-ectd" record; confirm whether ANVISA currently requires or accepts eCTD for the application type. \`package_ectd_for_region\` builds a Brazilian package on another region's backbone as a placeholder: read its regional-backbone status and never call it ANVISA-conformant.
5. Faster routes. \`lookup_regulatory_pathway\` (agency ANVISA) returns the priority review it holds with its basis. ANVISA has introduced an optimised review that relies on a decision by a foreign authority it recognises as equivalent; \`global_ri_reliance_pathways\` (target market BR, oncology flag where it applies) returns the catalogued programs ANVISA takes part in, such as Project Orbis, and does not model the optimised review. Confirm with the engine whether it covers the case, and otherwise take the scope, the qualifying authorities and the conditions from ANVISA's current rules.
6. Devices and IVDs: four risk classes; the lower classes go by notification (the engine may call it cadastro) and Classes III and IV by registration (registro). Manufacturers of the higher classes need B-GMP certification, for which MDSAP audit reports can be used, and some electromedical equipment needs INMETRO certification. \`advise_global_submission_plan\` (market "br-anvisa") and \`advise_global_market_strategy\` return dossier elements, readiness, the registration holder requirement and blockers.
7. Currency: \`check_regulatory_currency\` may hold no Brazil fact; when it returns none, say so. ANVISA issues its rules as numbered resolutions that are replaced often, so cite a resolution only from an engine or the sponsor's own source.

## Watch for
- GMP certification left until after filing, where it can hold up the registration.
- A reliance route assumed for a product that differs from what the reference authority approved.
- Portuguese text and sworn translations left out of the timeline.

## Not AnA's to decide
ANVISA decides registration, GMP certification and eligibility for any optimised or priority route; the ethics system decides on the protocol. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.india',
    name: 'India: CDSCO',
    description:
      'Planning trials and filings in India for medicines and devices: clinical trial permission and new drug approval under the New Drugs and Clinical Trials Rules, 2019, local clinical data and when it can be waived, Subject Expert Committee review, the Indian agent, and device licensing under the Medical Devices Rules, 2017.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['IN'],
    triggers: [
      'india',
      'indian',
      'cdsco',
      'dcgi',
      'new drugs and clinical trials rules',
      'ndct rules',
      'ndct',
      'subject expert committee',
      'sugam',
      'local trial waiver',
      'local clinical trial waiver',
      'indian patients',
      'indian sites',
      'medical devices rules',
      'indian authorised agent',
      'indian authorized agent',
      'md-14',
      'md-15',
    ],
    tools: [
      'lookup_ich_guideline',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [{ kind: 'ich', id: 'E5(R1)' }, { kind: 'ich', id: 'E17' }, MARKET_REGISTRY, { kind: 'standard', id: 'iso_13485' }],
    instructions: `
## When this applies
The program will run trials in India or seek approval from CDSCO: clinical trial permission, approval of a new drug, whether local clinical data are needed or can be waived, import of a product, or a device licence.

## Method
1. Establish the product, whether it is a new drug in India, its approval status elsewhere, whether Indian patients are in the pivotal trials, and the party in India who will file (an Indian company, or an authorised agent for a foreign manufacturer).
2. Say first what the engines cover. No engine models India's medicine routes: the pathway, comparison and strategy engines do not cover CDSCO. Every route, form, fee and clock comes from the New Drugs and Clinical Trials Rules, 2019 and CDSCO's current notices, and is labelled as not engine-verified. The device advisors do cover India (step 6).
3. Clinical trials need CDSCO permission under the NDCT Rules and approval by an ethics committee registered with CDSCO. CDSCO consults its Subject Expert Committee on new drugs and trials; prepare for questions on the rationale for Indian participation, the sample, the dose and safety monitoring. The rules also set compensation for trial-related injury and other sponsor duties; confirm them for the protocol.
4. Local data. The rules generally expect clinical data in Indian patients for a new drug, and let the licensing authority waive a local trial in defined circumstances, including for some categories of product already approved in countries CDSCO names. Establish the facts a waiver turns on (approvals elsewhere, the product category, the unmet need, data in Asian or Indian participants) and confirm the current list and conditions before planning on one. ICH E5(R1) and ICH E17 frame the scientific case for using foreign or multi-regional data; take both from \`lookup_ich_guideline\`.
5. Approval and import. The new drug application, any accelerated approval provision, the registration and import licences a foreign-made product needs, and post-approval duties (periodic safety reporting and any phase 4 study the approval requires) are all set by the rules and CDSCO notices; take each from them and date it. Applications go through CDSCO's online system (SUGAM). The platform's Indian eCTD package would reuse another region's backbone, so never offer it as conformant.
6. Devices and IVDs: four risk classes (A to D) under the Medical Devices Rules, 2017. A foreign manufacturer's device is imported under a licence held through an Indian authorised agent, with a Device Master File, a Plant Master File and a quality management system, and an investigational device needs clinical investigation permission. Take the class from the Indian classification, not another region's. \`advise_global_submission_plan\` (market "in-cdsco") and \`advise_global_market_strategy\` return dossier elements, readiness, the agent requirement and blockers.
7. Currency: \`check_regulatory_currency\` may hold no India fact; when it returns none, say so. CDSCO changes requirements by notice, so date every requirement you report and mark it for confirmation.

## Watch for
- A local-trial waiver assumed because the drug is approved in the US or EU, without checking its category and conditions.
- Ethics committees that are not registered with CDSCO.
- A device class carried over from another region's rules.

## Not AnA's to decide
CDSCO decides permission, approval and any waiver of local trials, on its expert committee's advice. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.singapore',
    name: 'Singapore: HSA',
    description:
      'Planning trials and registration in Singapore for medicines and devices: the HSA evaluation routes for therapeutic products (full, abridged and verification, the last two relying on reference agencies), clinical trial authorisation and notification, the local registrant, work-sharing, and device registration by class.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'agency-interaction', 'submission-assembly'],
    regions: ['SG'],
    triggers: [
      'singapore',
      'health sciences authority',
      'abridged evaluation',
      'abridged route',
      'verification evaluation',
      'verification route',
      'full evaluation route',
      'local registrant',
      'singapore registrant',
      'asean ctd',
      'actd',
      'asean joint assessment',
      'csdt',
      'dealer licence',
    ],
    tools: [
      'global_ri_reliance_pathways',
      'lookup_ich_guideline',
      'advise_global_submission_plan',
      'advise_global_market_strategy',
      'check_regulatory_currency',
    ],
    references: [{ kind: 'ich', id: 'M4(R4)' }, RELIANCE_CATALOG, MARKET_REGISTRY],
    instructions: `
## When this applies
The program will run trials in Singapore or register a product with the Health Sciences Authority: choosing an evaluation route for a therapeutic product, clinical trial authorisation or notification, the local registrant, work-sharing through a consortium, or device registration.

## Method
1. Establish the product, its approvals with other regulators (which agencies, which indication, and whether the product filed in Singapore is the same in formulation, manufacturing and labeling), whether Singapore sites are in the trials, and the local registrant: a company in Singapore holds the registration and its obligations.
2. Say first what the engines cover. The pathway, comparison and strategy engines do not model Singapore. \`global_ri_reliance_pathways\` (target market SG, with the oncology flag or an ASEAN marker where they apply) returns the Access Consortium, Project Orbis and ASEAN joint assessment with rationale, and the device advisors cover HSA (step 6). Every other route, fee and clock comes from HSA's current guidance and is labelled as not engine-verified.
3. Choose the evaluation route for a therapeutic product: full evaluation, with no prior approval by a reference agency; abridged evaluation, with prior approval by at least one reference agency; or verification evaluation, where the product matches a reference agency's approval and the application meets conditions on timing and sameness. Establish the facts each route turns on, and confirm HSA's current reference agencies and conditions before recommending one. A priority review may apply to a product meeting an unmet need; confirm its criteria with HSA.
4. Dossier: HSA accepts the ICH CTD or the ASEAN CTD, and \`lookup_ich_guideline\` (M4) returns the CTD structure. The registrant files through HSA's online system. A work-sharing route does not replace the national application: each Access Consortium member still grants its own approval.
5. Clinical trials: a trial of a therapeutic product needs HSA authorisation, or a notification for certain lower-risk trials of registered products, plus approval by the institution's review board; some medicinal products fall under a separate certificate route. Establish the product's registration status and the trial's risk, then confirm which route applies.
6. Devices: four risk classes (A to D). Class A is generally exempt from product registration but listed; Classes B to D are registered through routes whose eligibility turns on prior approvals by reference regulators. Importers, wholesalers and manufacturers need dealer's licences. \`advise_global_submission_plan\` (market "sg-hsa") and \`advise_global_market_strategy\` return dossier elements, readiness, the local representative requirement and blockers.
7. Currency: \`check_regulatory_currency\` may hold no Singapore fact; when it returns none, say so and mark each requirement for confirmation against HSA's current guidance.

## Watch for
- A verification route chosen for a product that differs from the reference agency's approval, or that misses the route's timing condition.
- A device route chosen on a reference approval that has since lapsed or changed.
- Fees and review clocks quoted with no engine behind them.

## Not AnA's to decide
HSA decides the evaluation route it accepts, registration and trial authorisation. The platform composes CMC Module 3 only for a small-molecule US IND (decision P-28).
`,
  }),
];
