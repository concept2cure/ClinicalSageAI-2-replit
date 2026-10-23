/**
 * Market skills, Europe: working a medicine or device through the EU, the UK
 * and Switzerland, as children of `regulatory-strategy.global-planning`.
 *
 * Every clock, fee, eligibility screen and requirement these methods mention
 * is returned by a named engine or a dated currency fact; the methods say which
 * one and what to do when it cannot answer (CLAUDE.md Rule 2).
 *
 * What these methods do not repeat: the choice between EU procedures and the
 * legal basis (regulatory-strategy.drug-pathways), designations and accelerated
 * assessment (regulatory-strategy.expedited-programs), scientific advice
 * (regulatory-strategy.agency-meetings), answering a list of questions
 * (submissions.agency-response), substantial modifications
 * (clinical.protocol-amendments), the SmPC (labeling.eu-smpc), and EU device
 * and IVD conformity (submissions.eu-technical-documentation,
 * diagnostics.eu-ivdr).
 *
 * The currency registry holds EU facts but, when this was written, no UK or
 * Swiss one; the UK and Swiss methods say what to do when it returns nothing.
 *
 * @module server/services/ana/skills/library/markets-europe
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const MARKETS_EUROPE_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'regulatory-strategy.global-planning.eu-medicines',
    name: 'EU marketing authorisation through the centralised procedure',
    description:
      "Running a medicine's EU marketing authorisation application through the centralised procedure: scope, pre-submission interactions with EMA, rapporteurs, validation, the CHMP assessment phases and clock stops, the list of questions and outstanding issues, oral explanation and the Commission decision. The choice of national, decentralised or mutual recognition procedure belongs to the drug-pathways skill.",
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'submission-assembly', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    regions: ['EU'],
    submissionTypes: ['EU_MAA', 'EU_BIOSIMILAR_MAA'],
    triggers: [
      'chmp',
      'chmp opinion',
      'rapporteur',
      'co-rapporteur',
      'rapporteurship',
      'ema maa',
      'eu maa',
      'centralised maa',
      'centralized maa',
      'marketing authorisation application',
      'marketing authorization application',
      'eu marketing authorisation',
      'eu marketing authorization',
      'centrally authorised',
      'centrally authorized',
      'mandatory scope',
      'optional scope',
      'eligibility request',
      'ema validation',
      'day 180',
      'oral explanation',
      'commission decision',
      're-examination',
    ],
    tools: [
      'global_ri_regulatory_pathway',
      'resolve_regulatory_structure',
      'get_market_submission_spec',
      'validate_market_formatting',
      'package_ectd_for_region',
      'get_regulatory_timeline',
      'global_ri_lifecycle_schedule',
      'search_ema_epar',
      'global_ri_fee_estimate',
      'lookup_regulatory_pathway',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'record', id: 'server/services/global-ri/regulatory-pathway-advisor.ts', label: 'Per-market trial and marketing routes, with the EU centralised-scope note' },
      { kind: 'record', id: 'server/services/market-specs/regulatory-timelines.ts', label: 'Review-clock goals and milestones, the EU MAA among them' },
      { kind: 'record', id: 'shared/regulatory/regional-module1.ts', label: 'Regional Module 1 for FDA, EMA and PMDA' },
      { kind: 'currency-fact', id: 'ema-ectd-v4-cp-optional' },
      { kind: 'currency-fact', id: 'eu-ectd-m1-v311-vc-v82' },
      { kind: 'currency-fact', id: 'eu-pharma-package' },
    ],
    instructions: `
## When this applies
A medicine is going to the EU through the centralised procedure: whether it must or may use it, what happens before submission, how the assessment runs from validation to the CHMP opinion, and what follows. The choice among centralised, decentralised, mutual recognition and national procedures, and the legal basis, are the drug-pathways skill's; designations and accelerated assessment the expedited-programs skill's; answering the questions the agency-response skill's.

## Method
1. Establish what scope turns on before saying the procedure applies: modality, whether the active substance is new, the indication, any orphan designation, whether it is an advanced therapy. \`global_ri_regulatory_pathway\` (market EU) returns the marketing route for the product archetype with its note on centralised scope; report mandatory or optional as returned. It reads an archetype, not the product, so near the edge of the mandatory scope, or on the optional scope, say EMA confirms eligibility on the applicant's request.
2. Plan the pre-submission phase as a sequence, not dates: the eligibility request where scope is not plain, the notice of intent to submit, the CHMP's appointment of the rapporteur and co-rapporteur (the CAT's for an advanced therapy, and a PRAC rapporteur for the risk management plan), and a pre-submission meeting with EMA. Lead times come from EMA's current pre-submission guidance, which the platform does not hold; never give them from memory.
3. Build to the EU format. \`resolve_regulatory_structure\` (region eu, application maa) returns the required CTD sections and the review-clock model; the regional-module1 record holds EU Module 1. \`get_market_submission_spec\` (spec \`eu-ectd\`) gives formatting, language and gateway rules, and \`validate_market_formatting\` checks files against them, reporting unchecked rules as not assessed. Run \`check_regulatory_currency\` for the eCTD version accepted for a new application and the Module 1 specification in force. If asked to build the package here, \`package_ectd_for_region\` (region \`ema\`) assembles it; relay its regionalBackbone status before saying anything about conformance.
4. Explain the clock as the engine models it. \`get_regulatory_timeline\` (pathway \`eu_maa\`) returns the milestones (list of questions, list of outstanding issues, opinion) with their day labels, whether the clock stops for responses, and its caveat; use only those, labelled as goals. Validation precedes the clock, and calendar dates depend on the CHMP meeting calendar and the applicant's time in each clock stop, so never compute a decision date without both.
5. At each clock stop answer every question by the agency-response method, major objections first. A major objection still open at the outstanding-issues stage may lead to an oral explanation before the CHMP: a short, evidence-led defence given by people who can answer. Withdrawal before the opinion is the sponsor's call and is made public.
6. After the opinion the European Commission takes the binding decision. The timeline engine does not model the time from opinion to decision; say so rather than give one. A negative opinion can be re-examined at the applicant's request within a window to confirm from current procedural guidance. \`global_ri_lifecycle_schedule\` (market EMA, from the decision date) projects the recurring post-authorisation obligations.
7. Precedent and cost: \`search_ema_epar\` finds centrally authorised products in the class or indication, cited by the EPAR url returned. \`global_ri_fee_estimate\` (market EMA) gives indicative fees; EMA's reductions are not modelled, so the fee is charged in full and labelled so. \`lookup_regulatory_pathway\` (agency EMA) lists EMA's early-access routes with their basis.
8. \`check_regulatory_currency\` on the EU pharma package: proposed, not adopted. Regulation (EC) No 726/2004 and Directive 2001/83/EC govern the procedure until new acts apply.

## Watch for
- Scope stated from the indication alone.
- A timeline that treats clock stops as zero.

## Not AnA's to decide
- EMA confirms eligibility, the CHMP gives the opinion and the Commission decides.
- At launch the platform composes Module 3 only for a small-molecule US IND (decision P-28); an MAA dossier is the sponsor's, and this method is advice for it.
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.eu-clinical-trials',
    name: 'EU clinical trials under the Clinical Trials Regulation',
    description:
      'Authorising and running a clinical trial of a medicine in the EU under Regulation (EU) No 536/2014 through CTIS: the Part I and Part II dossier, the reporting member state and concerned member states, validation and assessment, requests for information, transparency and redaction, substantial modifications and trials moved from the Clinical Trials Directive.',
    disciplines: ['regulatory-operations', 'regulatory-strategy', 'clinical'],
    useCases: ['submission-assembly', 'strategy', 'lifecycle-change'],
    segments: ['pharma', 'biotech'],
    regions: ['EU'],
    submissionTypes: ['EU_CTA'],
    triggers: [
      'ctis',
      'clinical trials regulation',
      'eu ctr',
      '536/2014',
      'eu cta',
      'eu clinical trial application',
      'part i assessment',
      'part ii assessment',
      'part i dossier',
      'part ii dossier',
      'reporting member state',
      'concerned member state',
      'member states concerned',
      'additional member state',
      'ctis rfi',
      'ctis transparency',
      'ctis redaction',
      'redacted for publication',
      'low-intervention trial',
      'low-intervention clinical trial',
      'clinical trials directive',
      'transitioned trial',
      'eudract',
    ],
    tools: [
      'get_market_submission_spec',
      'assess_pathway_readiness',
      'build_pathway_manifest',
      'review_protocol_regulatory_rules',
      'get_regulatory_timeline',
      'search_eu_ctis',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'record', id: 'server/services/pathway-engines/ctis/ctr-annex-i.ts', label: 'EU CTR Annex I: the initial application dossier, Part I and per-state Part II' },
      { kind: 'record', id: 'server/services/market-specs/regulatory-timelines.ts', label: 'Review-clock goals and milestones, the EU CTA among them' },
      { kind: 'currency-fact', id: 'eu-ctis-only-trials' },
      { kind: 'currency-fact', id: 'eu-e6r3-effective' },
      { kind: 'ich', id: 'E6(R3)' },
    ],
    instructions: `
## When this applies
A clinical trial of a medicinal product will run, or is running, in one or more EU member states under the Clinical Trials Regulation (Regulation (EU) No 536/2014): how to apply through CTIS, how the assessment runs, what is published, how a change is made, and what happened to trials that began under the old Directive. A device clinical investigation or IVD performance study follows the MDR or IVDR instead (device and diagnostics skills).

## Method
1. Establish the trial first: the investigational and auxiliary medicinal products, phase and design, the member states and sites, whether the sponsor claims a low-intervention trial (assessed by the member states), whether minors, incapacitated adults or emergency settings are involved, and whether scientific advice or a paediatric investigation plan exists. Run \`check_regulatory_currency\` on CTIS and report the fact as returned: CTIS is the only entry point for applications, modifications and notifications, and EudraCT is retired.
2. Choose the reporting member state. The sponsor proposes one of the concerned member states; it leads the coordinated Part I assessment, so its capacity, language and experience with the product type matter, and it may decline. The choice is the sponsor's and the agreement the member states'.
3. Build the dossier against Annex I (ctr-annex-i record). Part I is assessed jointly: protocol, investigator's brochure, IMPD, GMP and labelling documents, and advice or a PIP where they exist. Part II is assessed by each concerned member state: recruitment, subject information and consent, investigator and site suitability, insurance, financial arrangements, data protection, biological samples. \`get_market_submission_spec\` (spec \`eu-ctis\`) returns the portal structure and language rules. For a sequence in the platform, \`assess_pathway_readiness\` and \`build_pathway_manifest\` (pathway \`ctis\`, with the member-state codes) return the slot gaps and the ordered manifest; a Part II document with no member state is undetermined for every state, so file it per state. \`review_protocol_regulatory_rules\` checks the protocol's registers against the clauses it cites, the Regulation's among them; report its counts and findings verbatim.
4. The clock comes from \`get_regulatory_timeline\` (pathway \`eu_cta\`): validation, Part I assessment with its request-for-information window, and a decision per member state, labelled as goals. Response windows for requests for information are short and fixed, and a missed one makes the application lapse (for a Part I question, in every concerned member state); take the window from CTIS or current guidance, never memory. Part I may be submitted before Part II, and a member state added later, each by its own procedure.
5. Transparency. CTIS publishes much of what is submitted, so each document is uploaded with a version for publication that redacts personal data and commercially confidential information. The publication rules were revised during the Regulation's life: run \`check_regulatory_currency\`, and when the registry holds no fact on them say so and point to EMA's current transparency guidance. The results summary and the lay summary are submitted through CTIS after the trial ends (the plain-language skill covers the lay summary).
6. Changes. A substantial modification to Part I, Part II or both is submitted through CTIS and implemented only once authorised; the protocol-amendments skill classifies the change.
7. Older trials. A trial authorised under Directive 2001/20/EC that continued past the transition period had to move to CTIS. Establish whether a legacy trial did; one that did not is a compliance matter for the sponsor's quality function and the authorities, not a filing route.
8. Precedent: \`search_eu_ctis\` finds trials by condition or sponsor, cited by EU trial number and url; earlier trials are in EudraCT's public register.

## Not AnA's to decide
- Each concerned member state decides for its territory; it may depart from the reporting member state's Part I conclusion only on the limited grounds the Regulation sets.
- The platform maps and gap-checks a CTIS dossier and does not submit it. Its Module 3 composer refuses an EU CTA by name, because an IMPD quality part is not CTD Module 3 (decision P-28).
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.uk',
    name: 'United Kingdom (MHRA): medicines, trials and devices',
    description:
      'Taking a medicine or device to the UK after it left the EU: MHRA national marketing authorisation routes, including the International Recognition Procedure and other reliance on reference regulators, clinical trial authorisation through combined review, and for devices UKCA marking and the recognition of CE marking. Every date and transition deadline is checked, never stated from memory.',
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'submission-assembly', 'agency-interaction'],
    regions: ['UK'],
    submissionTypes: ['UK_MA', 'UK_IRP', 'UK_ILAP', 'UK_CTA', 'UK_DEVICE_REG'],
    triggers: [
      'mhra',
      'international recognition procedure',
      'irp',
      'ilap',
      'uk marketing authorisation',
      'uk marketing authorization',
      'uk filing',
      'uk launch',
      'uk-wide licensing',
      'uk clinical trial',
      'uk cta',
      'iras',
      'ukca',
      'ukca marking',
      'ukca mark',
      'ukni',
      'uk responsible person',
      'uk approved body',
      'great britain',
      'northern ireland',
      'windsor framework',
      'brexit',
      'post-brexit',
    ],
    tools: [
      'global_ri_regulatory_pathway',
      'lookup_regulatory_pathway',
      'global_ri_reliance_pathways',
      'get_market_submission_spec',
      'validate_market_formatting',
      'package_ectd_for_region',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'record', id: 'server/services/ana-ri/regulatory-pathways-corpus.ts', label: 'Expedited and reliance programs per regulator, MHRA among them' },
      { kind: 'record', id: 'server/services/global-ri/reliance-pathways.ts', label: 'International reliance and work-sharing routes' },
      { kind: 'record', id: 'server/services/market-specs/market-submission-specs.ts', label: 'Per-market submission specifications, the UK eCTD among them' },
      { kind: 'record', id: 'server/services/ectd/regional-backbone-readiness.ts', label: 'Which regional Module 1 backbones are built to the agency structure and which are placeholders' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
    ],
    instructions: `
## When this applies
A medicine or device is going to the UK: which MHRA route fits, how reliance on another regulator's approval works, how a clinical trial is authorised, or what a device needs to be placed on the market in Great Britain or Northern Ireland. An EU decision does not authorise a product in the UK, and UK requirements have changed in stages since the UK left the EU, so every date and transition here is checked, not recalled.

## Method
1. Establish the product, its approvals elsewhere (which regulator, when, for which indication, formulation and manufacturing, since reliance turns on these), and where it will be supplied: Great Britain, Northern Ireland or both. The Windsor Framework changed how medicines reach Northern Ireland; do not describe the arrangement from memory.
2. Medicine routes. \`global_ri_regulatory_pathway\` (market UK) returns the trial and marketing routes for the product archetype with its note on the International Recognition Procedure. \`lookup_regulatory_pathway\` (agency MHRA) returns the MHRA programs it holds, that procedure and the Innovative Licensing and Access Pathway among them, with eligibility and citation. Report both as returned; MHRA's current guidance decides eligibility.
3. Reliance. The International Recognition Procedure lets MHRA take into account an approval by a reference regulator it names. Establish which reference regulator approved the product and whether the UK application matches that approval; differences decide whether the procedure applies and how much MHRA assesses itself. The reference regulators, the routes within the procedure and their timelines change: take them from MHRA's current guidance and flag them for confirmation. \`global_ri_reliance_pathways\` (market UK, with the oncology flag as it applies) returns the work-sharing routes the UK joins, such as the Access Consortium and Project Orbis; each depends on a partner's review, so it shapes the filing order (global-planning skill).
4. Dossier. \`get_market_submission_spec\` (spec \`uk-ectd\`) returns the format, UK Module 1, gateway and language rules; \`validate_market_formatting\` checks files against them and reports unchecked rules as not assessed. \`package_ectd_for_region\` (region \`uk\`) may build the regional backbone as a placeholder from another region's structure (regional-backbone-readiness record): relay the regionalBackbone status it returns, and never call a UK package MHRA-conformant unless that status says so.
5. Clinical trials. A UK trial of a medicine needs MHRA authorisation and a research ethics committee opinion, applied for together through combined review in IRAS. The UK has been revising its clinical trials legislation: run \`check_regulatory_currency\` (jurisdiction UK). When the registry returns nothing, say the status is not held and the person must confirm the rules, timelines and any notification scheme against MHRA's current guidance.
6. Devices. Establish whether the device carries CE marking under the EU regulations or the older directives, UKCA marking, or neither, and where it will be supplied. Great Britain has accepted CE-marked devices for a transitional period extended more than once; Northern Ireland follows the EU device rules; a manufacturer outside the UK needs a UK Responsible Person, and devices are registered with MHRA. Every deadline and condition goes through \`check_regulatory_currency\`; when nothing matches, say no date is held. The platform's classifiers do not model UK device classification, so never derive a UKCA class from an EU MDR class; for the CE side use the device-pathways and EU technical documentation skills.
7. Present the UK plan as routes with their dependencies: what each relies on, what must match, what is still to confirm with MHRA, and each date's source or the statement that none is held.

## Not AnA's to decide
- MHRA decides every application, eligibility for recognition and whether a reference approval matches; the ethics committee gives its own opinion on a trial.
- UK device classification and UK clinical-trial timelines are not modelled here; statements about them are flagged for confirmation.
`,
  }),

  skill({
    key: 'regulatory-strategy.global-planning.switzerland',
    name: 'Switzerland (Swissmedic): medicines and devices',
    description:
      "Taking a medicine or device to Switzerland: Swissmedic's authorisation routes, reliance on reference regulators' assessments, expedited routes, Switzerland's place in work-sharing consortia, and for devices the consequences of the EU-Swiss mutual recognition agreement not being updated, including the Swiss authorised representative. Dates and transitions are checked, never stated from memory.",
    disciplines: ['regulatory-strategy', 'regulatory-operations'],
    useCases: ['strategy', 'submission-assembly'],
    regions: ['CH'],
    submissionTypes: ['CH_MA', 'CH_CTA', 'CH_DEVICE_CONFORMITY'],
    triggers: [
      'swissmedic',
      'switzerland',
      'swiss market',
      'swiss filing',
      'swiss approval',
      'swiss authorisation',
      'swiss authorization',
      'swiss authorised representative',
      'swiss authorized representative',
      'ch-rep',
      'ch rep',
      'swiss mra',
      'eu-swiss mra',
      'swiss importer',
      'meddo',
      'ivdo',
      'swissdamed',
      'therapeutic products act',
      'article 13 tpa',
      'maghp',
    ],
    tools: [
      'lookup_regulatory_pathway',
      'global_ri_reliance_pathways',
      'get_market_submission_spec',
      'validate_market_formatting',
      'package_ectd_for_region',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'record', id: 'server/services/ana-ri/regulatory-pathways-corpus.ts', label: 'Expedited and reliance programs per regulator, Swissmedic among them' },
      { kind: 'record', id: 'server/services/global-ri/reliance-pathways.ts', label: 'International reliance and work-sharing routes, Swissmedic MAGHP among them' },
      { kind: 'record', id: 'server/services/market-specs/market-submission-specs.ts', label: 'Per-market submission specifications, the Swiss eCTD among them' },
      { kind: 'record', id: 'server/services/ectd/regional-backbone-readiness.ts', label: 'Which regional Module 1 backbones are built to the agency structure and which are placeholders' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
    ],
    instructions: `
## When this applies
A medicine or device is going to Switzerland: which Swissmedic route fits, how Swissmedic takes other regulators' assessments into account, whether an expedited or work-sharing route applies, or what a device manufacturer must do now that the EU-Swiss mutual recognition agreement has not been updated for the EU device regulations. Switzerland is not in the EU: an EU authorisation does not cover it.

## Method
1. Establish the product, where it is already authorised (which regulator, for which indication and formulation, and whether that regulator's assessment reports can be supplied), why Switzerland matters commercially, and for a device its CE status under the EU regulations.
2. Medicine routes. \`lookup_regulatory_pathway\` (agency Swissmedic) returns the Swissmedic programs it holds, such as fast-track authorisation, with eligibility and citation; report them as returned. Swissmedic also has a route that takes into account a reference authority's authorisation and assessment (commonly called the Article 13 procedure), a procedure with prior notification, and temporary authorisation for certain serious conditions. The platform's catalogues do not hold these, so name them as routes to confirm against Swissmedic's current guidance, with the reference authorities and conditions taken from there and never from memory.
3. Consortia and reliance. \`global_ri_reliance_pathways\` (market CH, with the oncology and global-health flags as they apply) returns the routes Switzerland joins: the Access Consortium, Project Orbis, and Swissmedic's procedure for global-health products meant mainly for markets outside Switzerland. Each depends on a partner's review or market, so it shapes the filing order (global-planning skill). Report eligibility as returned; each authority decides.
4. Dossier. \`get_market_submission_spec\` (spec \`ch-ectd\`) returns the Swiss Module 1, gateway and language rules, product information included; \`validate_market_formatting\` checks files against them and reports unchecked rules as not assessed. \`package_ectd_for_region\` (region \`ch\`) may build the Swiss backbone as a placeholder from another region's structure (regional-backbone-readiness record): relay the regionalBackbone status it returns, and never call a Swiss package Swissmedic-conformant unless that status says so.
5. Devices. The agreement's device chapter was not updated when the EU device regulations applied. Since then the EU has treated Switzerland as a third country for devices, and Switzerland has applied its own requirements to manufacturers outside it, EU ones included. Work through the consequences: a manufacturer outside Switzerland appoints a Swiss authorised representative, named on the labelling or accompanying documents; importers carry their own obligations; devices and actors are registered in Switzerland's own database (swissdamed); a Swiss manufacturer needs an EU authorised representative to sell in the EU. Whether Switzerland still accepts conformity with the EU regulations, and every appointment and registration deadline, go through \`check_regulatory_currency\` (topic Swissmedic or Switzerland). When the registry returns nothing, say the date or status is not held and must be confirmed against Swissmedic's current publications. For the CE route itself use the device-pathways and EU technical documentation skills.
6. Clinical trials in Switzerland need ethics committee approval and, depending on the trial's risk category under Swiss law, Swissmedic authorisation. The platform does not model the categories; confirm them against Swiss guidance.
7. Present the Swiss plan as routes with what each relies on, what must match the reference authorisation, and what remains to confirm with Swissmedic.

## Not AnA's to decide
- Swissmedic decides on authorisation and on whether a foreign assessment can be taken into account; each consortium member decides on its own application.
- A change to the EU-Swiss agreement is for the EU and Switzerland; until the currency check or the person confirms one, describe the position as unconfirmed rather than assume it changed.
`,
  }),
];
