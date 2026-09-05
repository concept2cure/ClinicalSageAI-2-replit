/**
 * Lifecycle document-type registry — the units a sponsor files or brings to a
 * meeting across the FDA drug lifecycle: Pre-IND / EOP2 / Pre-NDA / Pre-BLA
 * briefing packages, the IND and its amendments, IND safety reports, annual
 * reports / DSUR, the NDA and BLA, ISS/ISE integrated summaries, and
 * post-approval supplements. Each composes type-specific administrative
 * components with references into the shared CTD guidance overlay.
 *
 * GENERATED from a multi-agent authoring pass. Advisory reference structure.
 *
 * @module server/services/ind/ctd/lifecycle-document-types
 */
import type { LifecycleDocumentType } from './types.js';

export const LIFECYCLE_DOCUMENT_TYPES: LifecycleDocumentType[] = [
  {
    "id": "pre_ind_meeting",
    "label": "Pre-IND Meeting Briefing Document (Type B)",
    "category": "meeting",
    "family": "MEETING",
    "agency": "FDA",
    "description": "Briefing package (meeting request plus briefing document) supporting a Pre-IND (Type B) meeting with the reviewing division to align on the adequacy of the nonclinical program, proposed CMC, and the design and safety of the first-in-human clinical protocol before an IND is submitted. The package frames a small number of focused questions and the sponsor's positions, giving the division the basis to agree the development program can proceed to the clinic or to identify gaps that would otherwise draw a clinical hold.",
    "regulatoryBasis": [
      "FDA Guidance for Industry: Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products (Dec 2017)",
      "21 CFR 312.47 (meetings)",
      "21 CFR 312.82 (early consultation / Pre-IND)",
      "21 CFR 312.23 (IND content and format)",
      "PDUFA VII commitment letter (meeting management goals)",
      "ICH M3(R2) (nonclinical safety studies to support human trials)"
    ],
    "components": [
      {
        "code": "MTG-REQ-CL",
        "title": "Meeting Request Letter and Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Formal Type B meeting request that triggers FDA scheduling and travels ahead of (or with) the briefing document. It states the meeting type, product, proposed indication, and the rationale for the meeting.",
        "authoringGuidance": "This letter is read first and determines whether FDA grants the meeting and what format (face-to-face, teleconference, or written response only) is offered, so it must contain every element the 2017 formal-meetings guidance enumerates for a meeting request. The division uses the stated purpose and question list to assign the correct review disciplines (pharm/tox, CMC, clinical, clinical pharmacology, statistics) and to decide whether the meeting is warranted or better handled as written responses. An acceptable request is specific about the product and phase of development, ties each proposed question to the objective, and names the sponsor's requested date range and attendees. Requests that are vague about purpose, omit the preliminary questions, or bundle unrelated products are the most common reasons a meeting is downgraded to written responses or delayed.",
        "keyContentElements": [
          "Product name, established/proper name, and pharmacologic class",
          "Application type and number if any (Pre-IND number once assigned)",
          "Meeting type designation (Type B) and requested format (face-to-face, teleconference, or written responses only)",
          "Proposed indication and stage of development",
          "Brief statement of the purpose and objectives of the meeting",
          "A preliminary list of the numbered questions grouped by discipline",
          "List of sponsor attendees with titles and affiliations, and any requested FDA participants",
          "Suggested dates and times (spanning the applicable response window)",
          "Approximate time needed and a statement of whether the sponsor will provide a briefing document",
          "Regulatory contact name, telephone, and email"
        ],
        "generationPrompt": "Draft a Type B Pre-IND meeting request letter to the reviewing division of FDA for {{SPONSOR}}'s product {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Include product identity, meeting type and requested format, purpose, a preliminary numbered question list grouped by discipline, requested date range, proposed attendees, and confirmation that a briefing document will be provided no later than 30 days before the meeting per the 2017 formal-meetings guidance and 21 CFR 312.47."
      },
      {
        "code": "MTG-AGENDA",
        "title": "Proposed Agenda",
        "required": true,
        "contentType": "list",
        "guidance": "Time-boxed agenda listing the topics and questions to be discussed and the sponsor speaker for each item.",
        "authoringGuidance": "The agenda signals to the division how the sponsor intends to use the limited meeting time and lets the FDA chair confirm the right reviewers attend each segment. A well-built agenda mirrors the numbered questions exactly and allots realistic time, reserving the majority of the hour for discussion rather than sponsor presentation because FDA generally expects the sponsor not to re-present the briefing document. Agendas that schedule long slide presentations, omit named speakers, or list topics that do not map to the written questions read as unfocused and reduce the value of the meeting.",
        "keyContentElements": [
          "Meeting logistics header (date, time, format, dial-in or location)",
          "Introductions and statement of meeting objectives",
          "Ordered list of discussion topics keyed to the numbered questions",
          "Sponsor presenter assigned to each topic",
          "Time allocation per topic totaling the scheduled meeting length",
          "Reserved time for FDA comments and action items / next steps",
          "Note that the sponsor does not intend a formal presentation unless requested"
        ],
        "generationPrompt": "Create a time-boxed Pre-IND meeting agenda for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}, mapping each agenda item to the corresponding numbered FDA question, assigning a sponsor speaker to each, allocating realistic minutes across a 60-minute meeting, and reserving time for FDA discussion and action items."
      },
      {
        "code": "MTG-ATTEND",
        "title": "Sponsor Attendee List",
        "required": true,
        "contentType": "table",
        "guidance": "Table of sponsor and consultant attendees with names, titles, roles, and affiliations, plus any specifically requested FDA attendees.",
        "authoringGuidance": "FDA uses the attendee list to ensure discipline coverage on both sides and to manage the room or teleconference; it is also the record of who represented the sponsor. Each attendee should have a clear reason to be present tied to a discussion topic, and outside consultants or key opinion leaders should be identified as such. Overlong lists dominated by attendees with no speaking role, or the absence of a named regulatory lead and the responsible medical/CMC experts, undercut the credibility of the delegation.",
        "keyContentElements": [
          "Full name of each attendee",
          "Title and functional role (regulatory, clinical, nonclinical, CMC, biostatistics, clin pharm)",
          "Company or institution affiliation",
          "Designation of external consultants / advisors",
          "Identification of the primary sponsor spokesperson and regulatory contact",
          "Any FDA participants specifically requested by discipline"
        ],
        "generationPrompt": "Produce a sponsor attendee table for {{SPONSOR}}'s Pre-IND meeting on {{PRODUCT_NAME}} in {{INDICATION}}, listing name, title, functional role, and affiliation for each attendee, flagging external consultants, and identifying the regulatory lead and primary spokesperson."
      },
      {
        "code": "MTG-BKGD",
        "title": "Product Background and Development Rationale",
        "required": true,
        "contentType": "narrative",
        "guidance": "Concise overview of the product, its mechanism, the target indication and unmet need, and the overall development strategy that sets context for the questions.",
        "authoringGuidance": "This section orients reviewers who may be seeing the program for the first time and establishes the scientific and regulatory rationale for the proposed first-in-human study. It should state the mechanism of action, the disease and population, the unmet medical need, any relevant regulatory designations sought or granted, and a high-level development plan showing how the current questions fit. A reviewer reads this to judge whether the clinical proposal is proportionate to the nonclinical evidence and the seriousness of the disease. Backgrounds that overstate efficacy expectations, omit the regulatory history of the class, or fail to describe the intended patient population invite skepticism about the rest of the package.",
        "keyContentElements": [
          "Product description: modality, structure/composition, and mechanism of action",
          "Proposed indication, target population, and unmet medical need",
          "Summary of relevant class experience and known class risks",
          "Regulatory history (prior interactions, designations such as Orphan/Fast Track/Breakthrough if sought)",
          "Overall clinical development strategy and where the first-in-human study fits",
          "Proposed route of administration, dosing concept, and formulation stage",
          "Statement of any foreign regulatory experience or marketing"
        ],
        "generationPrompt": "Write a product background and development rationale for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} for a Pre-IND meeting: describe modality and mechanism of action, target population and unmet need, relevant class experience and risks, any regulatory designations, and the overall development strategy leading into the proposed {{PHASE}} first-in-human study."
      },
      {
        "code": "MTG-NONCLIN",
        "title": "Nonclinical Pharmacology and Toxicology Summary",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of the nonclinical program supporting first-in-human dosing: primary/secondary pharmacology, safety pharmacology, PK/ADME, and the toxicology package with the proposed human starting dose derivation.",
        "authoringGuidance": "This is the core safety justification a Pre-IND package must carry, and the pharm/tox reviewer reads it to decide whether the proposed clinical starting dose, dose range, and duration are supported and whether the study can proceed without a clinical hold. It must present the pivotal GLP toxicology studies (species, duration, doses, NOAELs, findings) and the human equivalent dose / starting dose calculation, typically via the MABEL or NOAEL-based approach per FDA's dose-selection guidance, with adequate safety margins. Include a table of the toxicology program and a clear line from the most sensitive NOAEL to the proposed human starting dose. Common deficiencies drawing FDA information requests are missing safety pharmacology, non-GLP status of pivotal studies, toxicology durations too short to support the intended dosing duration, inadequate justification of species relevance, and starting-dose calculations that ignore the most sensitive endpoint.",
        "keyContentElements": [
          "Primary and secondary pharmacodynamics summary",
          "Safety pharmacology (cardiovascular/hERG, CNS, respiratory) results",
          "PK/ADME and toxicokinetics summary across species",
          "Pivotal GLP repeat-dose toxicology: species, duration, dose levels, NOAEL, key findings",
          "Genotoxicity and, where applicable, local tolerance / immunogenicity data",
          "Species-selection justification (pharmacologically relevant species)",
          "Human starting dose derivation (NOAEL-to-HED or MABEL) with safety factors",
          "Proposed maximum clinical dose and stopping criteria rationale",
          "GLP compliance statement for pivotal studies",
          "Summary table of the complete nonclinical program",
          "Gaps and studies still ongoing or planned before later phases"
        ],
        "generationPrompt": "Summarize the nonclinical pharmacology and toxicology program supporting first-in-human dosing of {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}. Present primary/secondary and safety pharmacology, PK/ADME, the pivotal GLP toxicology studies as a table (species, duration, doses, NOAEL, findings), and the derivation of the proposed human starting and maximum doses using a NOAEL-to-HED or MABEL approach with safety factors, per ICH M3(R2). Describe where data reside without fabricating specific results."
      },
      {
        "code": "MTG-CMC",
        "title": "Chemistry, Manufacturing, and Controls (CMC) Summary",
        "required": true,
        "contentType": "mixed",
        "guidance": "Overview of drug substance and drug product manufacturing, characterization, specifications, stability, and any CMC questions for the division.",
        "authoringGuidance": "At Pre-IND the CMC section need only support the safety and quality of material for the proposed early study, and the reviewer assesses whether the sponsor can make and control material of adequate quality and stability. It should describe the manufacturing process at a high level, characterization and impurity profile, the proposed release specifications and their justification, stability supporting the study duration, and, for biologics, potency and comparability considerations. Questions here typically concern acceptability of the specification strategy, stability data extent, or comparability plans. Reviewers issue information requests when specifications lack justification, when stability data are insufficient to cover the intended clinical use period, when impurity qualification is not addressed, or when the phase-appropriateness of controls is unclear.",
        "keyContentElements": [
          "Drug substance description, manufacturer, and process overview",
          "Drug product formulation, composition, and container-closure",
          "Characterization and impurity/degradant profile (including elemental impurities where relevant)",
          "Proposed release and stability specifications with justification",
          "Available stability data and proposed shelf life / use period",
          "Potency assay and, for biologics, comparability strategy",
          "Adventitious agent / sterility and endotoxin control as applicable",
          "Phase-appropriate GMP status statement",
          "Specific CMC questions posed to the division"
        ],
        "generationPrompt": "Draft a phase-appropriate CMC summary for {{SPONSOR}}'s {{PRODUCT_NAME}} to support a Pre-IND meeting and the proposed {{PHASE}} study: describe drug substance and drug product manufacturing and control, characterization and impurities, proposed specifications with justification, available stability supporting the study duration, and any comparability or potency considerations. State where data reside and note phase-appropriate GMP; do not invent specific analytical results."
      },
      {
        "code": "MTG-CLIN",
        "title": "Proposed Clinical Development Plan and First-in-Human Protocol Synopsis",
        "required": true,
        "contentType": "mixed",
        "guidance": "Synopsis of the proposed initial clinical protocol (design, population, dose escalation, safety monitoring, endpoints) plus the broader clinical development plan.",
        "authoringGuidance": "The clinical reviewer reads this to judge whether the proposed study protects subject safety and whether the design will generate interpretable data, and it is the section most tied to avoiding a clinical hold under 21 CFR 312.42. It should present the study objectives, population and key eligibility criteria, the dose-escalation scheme and rationale, sentinel dosing and interval/stopping rules, safety monitoring and DSMB plans, and the primary safety and PK/PD endpoints. Provide a protocol synopsis in structured form and connect it to the nonclinical starting-dose derivation. Deficiencies that generate FDA comments include escalation increments that outpace available safety data, absent sentinel dosing or stopping rules for higher-risk agents, eligibility criteria that expose vulnerable subjects, and endpoints that cannot support the stated development objective.",
        "keyContentElements": [
          "Overall clinical development plan and phase sequence",
          "First-in-human study objectives (safety, tolerability, PK, PD)",
          "Study design (SAD/MAD, single vs. multiple ascending dose), population, and key eligibility",
          "Starting dose, planned dose levels, and escalation/decision rules linked to nonclinical data",
          "Sentinel dosing, interval between subjects/cohorts, and stopping/holding rules",
          "Safety monitoring plan, DSMB/SRC role, and adverse-event management",
          "PK/PD sampling and biomarker strategy",
          "Primary and secondary endpoints",
          "Planned sample size and general statistical approach",
          "Protocol synopsis table"
        ],
        "generationPrompt": "Write a proposed clinical development plan and first-in-human protocol synopsis for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Include study objectives, design (e.g., SAD/MAD), population and eligibility, starting dose and escalation/stopping rules tied to the nonclinical NOAEL/MABEL derivation, sentinel dosing, safety monitoring and DSMB plan, PK/PD and endpoints, and a structured protocol synopsis. Present the design and where supporting data live without fabricating results."
      },
      {
        "code": "MTG-QUES",
        "title": "Numbered Questions for FDA with Sponsor Positions",
        "required": true,
        "contentType": "mixed",
        "guidance": "The heart of the package: a numbered list of focused questions, each stating the sponsor's position and the supporting rationale, on which agreement is sought.",
        "authoringGuidance": "FDA prepares preliminary written responses to these exact questions before the meeting, so their wording determines the value of the entire interaction; each question must be answerable, tied to a specific development decision, and preceded by enough context and a clear sponsor position. Group questions by discipline (nonclinical, CMC, clinical, clin pharm/stats), keep them to the number that can be meaningfully discussed, and phrase each so a yes/no or 'do you agree' answer advances the program. The strongest questions state the sponsor's proposal, the rationale and data cited, and then ask the division to confirm agreement. Weak packages ask open-ended or rhetorical questions, seek answers the division cannot give without data not yet available, embed multiple sub-questions that obscure the ask, or fail to state a position so FDA cannot simply agree.",
        "keyContentElements": [
          "Sequentially numbered questions grouped by discipline",
          "Brief context/background preceding each question",
          "Explicit sponsor position or proposal for each question",
          "Supporting rationale and cross-reference to the relevant summary section",
          "A clearly phrased ask (e.g., 'Does the Agency agree...')",
          "Separation of true discussion questions from purely informational items",
          "Nonclinical questions (starting dose, adequacy of tox package)",
          "CMC questions (specifications, stability, comparability adequacy)",
          "Clinical questions (protocol design, escalation, safety monitoring, endpoints)",
          "Regulatory/administrative questions (IND content expectations, meeting follow-up)"
        ],
        "generationPrompt": "Draft the numbered questions for FDA for {{SPONSOR}}'s Pre-IND meeting on {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}, grouped by nonclinical, CMC, clinical, and clinical pharmacology/statistics. For each question provide brief context, an explicit sponsor position/proposal, supporting rationale cross-referenced to the relevant summary section, and a precise ask phrased so FDA can confirm agreement. Keep questions focused and answerable; do not fabricate data underlying the positions."
      }
    ],
    "registryId": "US_PRE_IND",
    "timing": "Requested and held before IND submission; FDA schedules a Type B meeting within 60 days of receipt of the meeting request, with the briefing document due no later than 30 calendar days before the meeting date.",
    "ctdSectionCodes": [
      "2.4",
      "2.5",
      "2.6"
    ],
    "meetingPackage": true
  },
  {
    "id": "end_of_phase_2_meeting",
    "label": "End-of-Phase-2 Meeting Briefing Document (Type B)",
    "category": "meeting",
    "family": "MEETING",
    "agency": "FDA",
    "description": "Briefing package supporting an End-of-Phase-2 (Type B) meeting to reach agreement with FDA on the design of the pivotal Phase 3 program before it begins: the adequacy of Phase 2 data to justify proceeding, the primary and key secondary endpoints, the target population and dose(s), the statistical analysis and success criteria, and any safety database, CMC, and nonclinical requirements needed to support a future marketing application. The package presents Phase 2 efficacy and safety summaries and dose-finding results and poses numbered questions seeking agreement on the pivotal design.",
    "regulatoryBasis": [
      "FDA Guidance for Industry: Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products (Dec 2017)",
      "21 CFR 312.47(b)(1) (end-of-Phase-2 meetings)",
      "21 CFR 312.47 (meetings)",
      "PDUFA VII commitment letter (meeting management goals)",
      "ICH E9 / E9(R1) (statistical principles; estimands and sensitivity analysis)",
      "ICH E8(R1) (general considerations for clinical studies)"
    ],
    "components": [
      {
        "code": "MTG-REQ-CL",
        "title": "Meeting Request Letter and Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Type B end-of-Phase-2 meeting request identifying the product, IND, proposed indication, purpose, and preliminary questions that trigger FDA scheduling.",
        "authoringGuidance": "The request establishes that this is an end-of-Phase-2 meeting under 21 CFR 312.47(b)(1) and sets the disciplines FDA must bring, so it should clearly state that the sponsor seeks agreement on the pivotal Phase 3 design. It must include the IND number, proposed indication, the numbered preliminary questions, and requested format and dates within the Type B window. Because these meetings are decisive for a costly Phase 3, the request should make the objectives concrete. Requests that fail to signal the pivotal-design purpose or omit the preliminary questions risk being scheduled without the right statistical or clinical pharmacology reviewers present.",
        "keyContentElements": [
          "Product name, established name, and pharmacologic class",
          "IND number and proposed indication",
          "Meeting type (Type B, end-of-Phase-2) and requested format",
          "Statement of purpose: agreement on Phase 3 pivotal design and marketing-application requirements",
          "Preliminary numbered questions grouped by discipline",
          "Sponsor attendees and any requested FDA disciplines (esp. biostatistics, clin pharm)",
          "Requested dates within the Type B response window",
          "Confirmation of briefing-document delivery 30 days ahead",
          "Regulatory contact information"
        ],
        "generationPrompt": "Draft an end-of-Phase-2 Type B meeting request for {{SPONSOR}}'s {{PRODUCT_NAME}} (IND number) in {{INDICATION}}, stating the purpose of reaching agreement on the pivotal Phase 3 design and marketing-application requirements, listing preliminary numbered questions by discipline, requesting format and dates within the Type B window, and confirming briefing-document delivery 30 days before the meeting per the 2017 formal-meetings guidance and 21 CFR 312.47(b)(1)."
      },
      {
        "code": "MTG-AGENDA",
        "title": "Proposed Agenda",
        "required": true,
        "contentType": "list",
        "guidance": "Time-boxed agenda mapping discussion topics to the numbered questions and assigning sponsor speakers.",
        "authoringGuidance": "The agenda should prioritize the questions with the greatest development risk (endpoint, population, statistical success criteria) so that discussion time is spent where FDA agreement matters most. It must map one-to-one to the numbered questions, name speakers, and reserve substantial time for FDA discussion rather than sponsor presentation. Agendas that front-load presentation of already-submitted data or fail to leave time for the statistical questions waste the meeting.",
        "keyContentElements": [
          "Logistics header (date, time, format, location/dial-in)",
          "Objectives and introductions",
          "Ordered topics keyed to numbered questions, highest-risk first",
          "Assigned sponsor speaker per topic",
          "Time allocation summing to the meeting length",
          "Reserved time for FDA discussion and action items",
          "Statement that no formal presentation is planned unless requested"
        ],
        "generationPrompt": "Create a time-boxed end-of-Phase-2 meeting agenda for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}, ordering topics from highest development risk (endpoint, population, statistics) downward, mapping each to its numbered question, assigning speakers, allocating minutes, and reserving time for FDA discussion and next steps."
      },
      {
        "code": "MTG-ATTEND",
        "title": "Sponsor Attendee List",
        "required": true,
        "contentType": "table",
        "guidance": "Table of sponsor and consultant attendees with names, titles, roles, and affiliations, plus requested FDA disciplines.",
        "authoringGuidance": "Because Phase 3 design turns on statistics and clinical pharmacology, the attendee list should visibly include the sponsor's biostatistician and clin-pharm lead alongside regulatory and clinical leads. Each attendee should map to an agenda topic, and external experts (e.g., a trial statistician or KOL) should be identified. A delegation missing statistical representation is a common signal that the sponsor is under-prepared for the pivotal-design discussion.",
        "keyContentElements": [
          "Full name of each attendee",
          "Title and functional role (regulatory, clinical, biostatistics, clin pharm, CMC, safety)",
          "Affiliation",
          "Designation of external consultants / KOLs",
          "Primary spokesperson and regulatory contact identified",
          "Requested FDA disciplines (biostatistics, clinical pharmacology, clinical)"
        ],
        "generationPrompt": "Produce a sponsor attendee table for {{SPONSOR}}'s end-of-Phase-2 meeting on {{PRODUCT_NAME}} in {{INDICATION}}, listing name, title, role, and affiliation, ensuring biostatistics and clinical pharmacology leads are included, flagging external experts, and noting requested FDA disciplines."
      },
      {
        "code": "MTG-BKGD",
        "title": "Product Background and Development History",
        "required": true,
        "contentType": "narrative",
        "guidance": "Overview of the product, indication and unmet need, regulatory history, and a summary of the completed and ongoing studies leading to the proposed Phase 3.",
        "authoringGuidance": "This section gives reviewers the development narrative from IND to the current decision point and frames why the proposed Phase 3 design follows from the Phase 2 results. It should recap the mechanism, indication and population, prior FDA interactions and any agreements or designations, and a study inventory showing what has been completed. Reviewers use it to check consistency between prior advice and the current proposal. Backgrounds that omit prior FDA agreements, understate previously identified safety signals, or gloss over failed or discontinued arms undermine trust in the design rationale.",
        "keyContentElements": [
          "Mechanism of action and modality",
          "Proposed indication, population, and unmet medical need",
          "Regulatory history including prior FDA meetings, agreements, and designations",
          "Inventory of completed and ongoing nonclinical and clinical studies",
          "Summary of the Phase 1/Phase 2 experience feeding the Phase 3 decision",
          "Global development and any foreign regulatory status",
          "Overall path to marketing application (NDA/BLA) and target timing"
        ],
        "generationPrompt": "Write a product background and development history for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} for an end-of-Phase-2 meeting: cover mechanism, population and unmet need, regulatory history including prior FDA agreements and designations, an inventory of completed/ongoing studies, and how the Phase 1/2 experience leads into the proposed Phase 3 and eventual marketing application."
      },
      {
        "code": "MTG-EFF",
        "title": "Phase 2 Efficacy and Dose-Finding Summary",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of Phase 2 efficacy results and exposure-response/dose-finding analyses supporting the proposed Phase 3 dose(s) and endpoint.",
        "authoringGuidance": "This section justifies the two design choices FDA scrutinizes most: the dose(s) carried into Phase 3 and the primary endpoint, so it must present the Phase 2 efficacy findings and the dose- and exposure-response analyses transparently. Include the study designs, populations, endpoints, effect estimates with confidence intervals, and the modeling that links exposure to response and supports dose selection. Reviewers read it to judge whether the proposed dose is on the plateau of the exposure-response curve and whether the endpoint is clinically meaningful and adequately powered. Common deficiencies are selecting a single Phase 3 dose without adequate dose-ranging, post-hoc endpoint switching, subgroup-driven claims, and exposure-response analyses that ignore safety at the top of the range.",
        "keyContentElements": [
          "Phase 2 study designs, populations, and endpoints",
          "Efficacy results with point estimates and confidence intervals (results tables)",
          "Dose-response and exposure-response analyses supporting dose selection",
          "Rationale for the proposed Phase 3 dose(s) and regimen",
          "Proposed Phase 3 primary and key secondary endpoints with clinical justification",
          "Biomarker / pharmacodynamic support where relevant",
          "Subgroup and population considerations for Phase 3 enrichment/eligibility",
          "Summary tables of Phase 2 efficacy and PK/PD"
        ],
        "generationPrompt": "Summarize the Phase 2 efficacy and dose-finding evidence for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present study designs, efficacy results with effect estimates and confidence intervals in tables, dose- and exposure-response analyses, the rationale for the proposed Phase 3 dose(s), and the proposed primary/key secondary endpoints with clinical justification. Describe where the data reside and how they support the design without fabricating specific values."
      },
      {
        "code": "MTG-SAFETY",
        "title": "Cumulative Safety Summary and Safety Database Plan",
        "required": true,
        "contentType": "mixed",
        "guidance": "Cumulative safety experience to date and the proposed size and composition of the safety database needed to support a marketing application.",
        "authoringGuidance": "FDA uses this to confirm that identified risks are adequately characterized and that the planned Phase 3 exposure will yield a safety database consistent with ICH E1 expectations for the indication and treatment duration. It should present cumulative exposures, the adverse-event and serious-adverse-event profile, deaths and discontinuations, laboratory and special safety findings, and the planned number of patients and exposure duration. Reviewers issue requests when the planned database is too small for a chronic-use indication, when a signal (e.g., hepatic, cardiac) is not proactively characterized with a monitoring plan, or when long-term exposure numbers are not addressed.",
        "keyContentElements": [
          "Cumulative subject exposure by dose and duration",
          "Adverse-event and serious-adverse-event summary (tables)",
          "Deaths, discontinuations, and dose modifications",
          "Laboratory, ECG, vital-sign, and special safety findings",
          "Adverse events of special interest and any emerging signals",
          "Proposed Phase 3 safety database size and long-term exposure plan (ICH E1 alignment)",
          "Proposed safety monitoring, risk mitigation, and DSMB plan",
          "Summary safety tables"
        ],
        "generationPrompt": "Prepare a cumulative safety summary and safety-database plan for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present cumulative exposure, adverse-event/SAE tables, deaths and discontinuations, special safety findings and any signals, and the proposed Phase 3 safety database size and long-term exposure aligned to ICH E1, with the monitoring and risk-mitigation plan. State where data reside without fabricating specific counts."
      },
      {
        "code": "MTG-STATS",
        "title": "Proposed Phase 3 Design and Statistical Analysis Plan",
        "required": true,
        "contentType": "mixed",
        "guidance": "The proposed pivotal Phase 3 design: objectives, population, comparators, endpoints, estimands, sample size/power, interim analyses, multiplicity control, and success criteria.",
        "authoringGuidance": "This is the section on which end-of-Phase-2 agreement ultimately turns, and the statistical reviewer reads it to judge whether the trial, if positive, would support approval. It must define the estimand for the primary endpoint per ICH E9(R1), the analysis populations, the handling of intercurrent events and missing data, the multiplicity strategy across primary and key secondary endpoints, the sample size and power with assumptions, and any interim/adaptive features and their alpha spending. Provide a design schematic and a synopsis. Deficiencies that draw FDA comment include undefined estimands, inadequate multiplicity control for key secondary claims, optimistic effect-size assumptions unsupported by Phase 2, non-inferiority margins without justification, and unblinded interim looks lacking rigorous alpha control.",
        "keyContentElements": [
          "Trial objectives, hypotheses, and number of pivotal studies proposed",
          "Design (randomized/controlled, blinding, comparator/placebo, duration)",
          "Target population and key eligibility criteria",
          "Primary endpoint and its estimand (treatment effect, intercurrent-event handling) per ICH E9(R1)",
          "Key secondary endpoints and the multiplicity/testing hierarchy",
          "Sample size, power, effect-size and variance assumptions with their source",
          "Missing-data handling and sensitivity analyses",
          "Interim analyses, adaptive features, and alpha-spending / stopping rules",
          "Non-inferiority margin and justification (if applicable)",
          "Definition of trial success and its relationship to the approvability standard",
          "Design schematic and study synopsis"
        ],
        "generationPrompt": "Draft the proposed Phase 3 pivotal design and statistical analysis plan for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: objectives and number of studies, design and comparator, population, primary endpoint with its ICH E9(R1) estimand, key secondary endpoints and multiplicity hierarchy, sample size and power with sourced assumptions, missing-data and sensitivity analyses, any interim/adaptive features with alpha spending, and the definition of trial success. Include a design schematic and synopsis; do not fabricate effect sizes—state their basis."
      },
      {
        "code": "MTG-CMC-NC",
        "title": "CMC and Nonclinical Status and Requirements to Support Registration",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of CMC development status and remaining nonclinical requirements (e.g., carcinogenicity, reproductive toxicology, juvenile studies) needed to support a marketing application.",
        "authoringGuidance": "At end-of-Phase-2 the sponsor should confirm that CMC scale-up/comparability and the remaining nonclinical program are on a path to support registration and the intended labeling, and reviewers use this to flag long-lead studies before Phase 3 locks in. It should state the manufacturing and comparability plan for commercial-scale material, and the status/plans for chronic toxicology, carcinogenicity, reproductive and developmental toxicology, and any special studies driven by the population. Deficiencies include failing to plan carcinogenicity or repro-tox studies on a timeline compatible with filing, ignoring process changes that will require comparability, and not addressing pediatric or special-population nonclinical needs.",
        "keyContentElements": [
          "CMC development status and commercial-scale manufacturing / comparability plan",
          "Drug product formulation to be used in Phase 3 and its bridge to earlier material",
          "Stability strategy to support registration",
          "Status and plan for chronic repeat-dose toxicology",
          "Carcinogenicity assessment plan (ICH S1) and timing",
          "Reproductive and developmental toxicology plan (ICH S5) relative to the population",
          "Juvenile animal or other special nonclinical studies if pediatric development is intended",
          "Any nonclinical or CMC questions for the division"
        ],
        "generationPrompt": "Summarize CMC status and remaining nonclinical requirements for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} to support registration: describe the commercial-scale manufacturing and comparability plan, the Phase 3 formulation and its bridge, stability strategy, and the status/timeline for chronic toxicology, carcinogenicity (ICH S1), reproductive/developmental toxicology (ICH S5), and any special-population studies. Note where data reside and pose any CMC/nonclinical questions; do not fabricate results."
      },
      {
        "code": "MTG-QUES",
        "title": "Numbered Questions for FDA with Sponsor Positions",
        "required": true,
        "contentType": "mixed",
        "guidance": "Numbered questions seeking agreement on the pivotal design elements, each with the sponsor's position and rationale.",
        "authoringGuidance": "FDA prepares preliminary written responses to these questions, and at end-of-Phase-2 the questions should seek explicit agreement on the elements that make a Phase 3 adequate and well-controlled: dose(s), endpoint and estimand, population, statistical success criteria, safety database size, and remaining nonclinical/CMC requirements. Each question must state the sponsor's proposal with supporting Phase 2 evidence and ask the division to confirm agreement. The most valuable questions convert design decisions into 'Does the Agency agree...' asks anchored to data. Weak questions are open-ended ('what does FDA think of...'), bundle multiple decisions, or ask for agreement on a design element without presenting the supporting analysis.",
        "keyContentElements": [
          "Sequentially numbered questions grouped by discipline",
          "Context and sponsor position preceding each question",
          "Cross-reference to the supporting summary section and data",
          "Agreement-seeking phrasing ('Does the Agency agree...')",
          "Clinical questions: Phase 3 dose(s), population, endpoints",
          "Statistical questions: estimand, multiplicity, sample size, success criteria, interim/adaptive features",
          "Safety questions: adequacy of proposed safety database and monitoring",
          "Nonclinical/CMC questions: remaining studies and comparability adequacy",
          "Regulatory questions: expedited-program eligibility, single vs. two pivotal studies, filing expectations",
          "Separation of discussion questions from informational items"
        ],
        "generationPrompt": "Draft the numbered FDA questions for {{SPONSOR}}'s end-of-Phase-2 meeting on {{PRODUCT_NAME}} in {{INDICATION}}, grouped by clinical, statistical, safety, nonclinical/CMC, and regulatory. For each, give context, an explicit sponsor position with Phase 2 support cross-referenced to the relevant section, and an agreement-seeking ask covering dose(s), endpoint/estimand, population, statistical success criteria, safety database size, and remaining studies. Keep each answerable; do not fabricate the underlying data."
      }
    ],
    "timing": "Requested after completion of Phase 2 and before major Phase 3 investment; FDA schedules the Type B meeting within 60 days of the request, with the briefing document due no later than 30 calendar days before the meeting.",
    "ctdSectionCodes": [
      "2.3",
      "2.4",
      "2.5",
      "2.6",
      "2.7"
    ],
    "meetingPackage": true
  },
  {
    "id": "pre_nda_meeting",
    "label": "Pre-NDA Meeting Briefing Document (Type B)",
    "category": "meeting",
    "family": "MEETING",
    "agency": "FDA",
    "description": "Briefing package supporting a Pre-NDA (Type B) meeting to align with FDA on the format, content, and completeness of the planned NDA before submission: the acceptability of the primary efficacy and safety analyses, the integrated summaries of safety and effectiveness, the datasets and their standards, pediatric and post-marketing plans, proposed labeling, and any application-organization or review-facilitation matters. The package draws on the CTD Module 2 summaries and poses numbered questions intended to de-risk the filing and the anticipated review.",
    "regulatoryBasis": [
      "FDA Guidance for Industry: Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products (Dec 2017)",
      "21 CFR 312.47(b)(2) (Other meetings, including pre-NDA / pre-submission meetings)",
      "21 CFR 314.50 (content and format of an NDA)",
      "21 CFR 314.101 (filing / refuse-to-file)",
      "PDUFA VII commitment letter (meeting management and pre-submission activities)",
      "ICH M4 / M4E(R2) (CTD organization and clinical overview)",
      "ICH E3 (clinical study report structure)"
    ],
    "components": [
      {
        "code": "MTG-REQ-CL",
        "title": "Meeting Request Letter and Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Type B Pre-NDA meeting request identifying the product, IND, proposed indication, planned submission timing, purpose, and preliminary questions.",
        "authoringGuidance": "The request should make clear the sponsor seeks agreement on the content and format of the forthcoming NDA and identify the planned submission date so FDA can align its review resources and any rolling-review or expedited-program considerations. It must include IND number, proposed indication, requested format and dates within the Type B window, the preliminary numbered questions, and the attendee list emphasizing statistics and, where relevant, clinical pharmacology. A request that omits the target filing date or fails to flag expedited-program status leads to a meeting scheduled without the right planning context.",
        "keyContentElements": [
          "Product name, established name, and class",
          "IND number and proposed indication(s)",
          "Meeting type (Type B, Pre-NDA) and requested format",
          "Planned NDA submission date and any expedited-program designation",
          "Statement of purpose: agreement on NDA content, format, and review facilitation",
          "Preliminary numbered questions by discipline",
          "Sponsor attendees and requested FDA disciplines",
          "Requested dates within the Type B window",
          "Confirmation of briefing-document delivery 30 days ahead",
          "Regulatory contact information"
        ],
        "generationPrompt": "Draft a Type B Pre-NDA meeting request for {{SPONSOR}}'s {{PRODUCT_NAME}} (IND number) in {{INDICATION}}, stating the purpose of agreeing on NDA content and format, giving the planned submission date and any expedited designation, listing preliminary numbered questions by discipline, requesting format and dates within the Type B window, and confirming briefing-document delivery 30 days before the meeting per the 2017 formal-meetings guidance."
      },
      {
        "code": "MTG-AGENDA",
        "title": "Proposed Agenda",
        "required": true,
        "contentType": "list",
        "guidance": "Time-boxed agenda mapping topics to numbered questions and assigning speakers.",
        "authoringGuidance": "The Pre-NDA agenda should prioritize questions that determine filability and reviewability: adequacy of the primary analyses, the integrated summaries, dataset standards, and labeling/PMR topics. It maps one-to-one to the questions, names speakers, and reserves the bulk of time for FDA discussion. Agendas dominated by re-presentation of pivotal results, rather than the format/content and analysis questions, waste a meeting that FDA intends for pre-submission alignment.",
        "keyContentElements": [
          "Logistics header (date, time, format, location/dial-in)",
          "Objectives and introductions",
          "Ordered topics keyed to numbered questions",
          "Assigned sponsor speaker per topic",
          "Time allocation summing to the meeting length",
          "Reserved time for FDA discussion and action items",
          "Note that no formal presentation is planned unless requested"
        ],
        "generationPrompt": "Create a time-boxed Pre-NDA meeting agenda for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}, prioritizing filability and reviewability topics (primary analyses, integrated summaries, dataset standards, labeling/PMRs), mapping each to its numbered question, assigning speakers, allocating minutes, and reserving time for FDA discussion and next steps."
      },
      {
        "code": "MTG-ATTEND",
        "title": "Sponsor Attendee List",
        "required": true,
        "contentType": "table",
        "guidance": "Table of sponsor and consultant attendees with names, titles, roles, and affiliations, plus requested FDA disciplines.",
        "authoringGuidance": "The delegation should include regulatory, clinical, biostatistics, safety/pharmacovigilance, clinical pharmacology, and CMC leads because a Pre-NDA meeting touches every module of the application. Each attendee should map to an agenda item, and external statistical or medical experts should be flagged. A list missing pharmacovigilance or statistics leadership signals the sponsor is not ready to discuss the integrated summaries or the safety database.",
        "keyContentElements": [
          "Full name of each attendee",
          "Title and functional role (regulatory, clinical, biostatistics, safety/PV, clin pharm, CMC)",
          "Affiliation",
          "External consultants / experts flagged",
          "Primary spokesperson and regulatory contact identified",
          "Requested FDA disciplines"
        ],
        "generationPrompt": "Produce a sponsor attendee table for {{SPONSOR}}'s Pre-NDA meeting on {{PRODUCT_NAME}} in {{INDICATION}}, listing name, title, role, and affiliation across regulatory, clinical, biostatistics, safety/PV, clinical pharmacology, and CMC, flagging external experts, and noting requested FDA disciplines."
      },
      {
        "code": "MTG-BKGD",
        "title": "Product Background and Development History",
        "required": true,
        "contentType": "narrative",
        "guidance": "Overview of the product, indication, regulatory history including prior agreements, and the completed development program supporting the NDA.",
        "authoringGuidance": "This section reminds the review division of the full development arc and, critically, of prior FDA agreements (SPA, end-of-Phase-2, Type C outcomes) that the NDA relies on, so reviewers can confirm the application delivers what was agreed. It should summarize the pivotal trials and their outcomes at a high level, the regulatory designations and prior meeting agreements, and the planned application scope. Reviewers lose confidence when the background contradicts prior agreements, omits a failed study, or misstates the agreed endpoint or population.",
        "keyContentElements": [
          "Mechanism, modality, and proposed indication(s)",
          "Regulatory history: prior meetings, agreements (incl. any SPA), and designations",
          "Inventory of pivotal and supportive studies and their outcomes at a high level",
          "Summary of the evidence of effectiveness supporting the application",
          "Planned NDA scope (indication wording, populations, dosage forms/strengths)",
          "Foreign regulatory status and any approvals",
          "Target submission timing and review-pathway expectations"
        ],
        "generationPrompt": "Write a product background and development history for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} for a Pre-NDA meeting: cover mechanism and indication, regulatory history including prior FDA agreements and designations, an inventory of pivotal/supportive studies and outcomes, the evidence of effectiveness, and the planned NDA scope and target timing."
      },
      {
        "code": "MTG-EFF",
        "title": "Summary of Clinical Efficacy and Integrated Effectiveness",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of the pivotal efficacy results and the planned integrated summary of effectiveness (ISE) approach, including pre-specified primary and key secondary analyses.",
        "authoringGuidance": "This section previews the efficacy evidence and the analytic approach FDA will scrutinize at filing, so it should present the pivotal trial results against the pre-specified primary endpoint and estimand, the key secondary results within the multiplicity hierarchy, and the planned structure of the integrated summary of effectiveness per ICH M4E(R2) (CTD 2.7.3). It should confirm that the analyses match prior agreements and describe any pooling or subgroup approach. Reviewers issue requests when the applicant proposes post-hoc analyses, deviates from the agreed estimand, pools heterogeneous studies without justification, or bases claims on unadjusted secondary endpoints.",
        "keyContentElements": [
          "Pivotal study designs and pre-specified primary analysis (estimand)",
          "Primary efficacy results with effect estimates and confidence intervals (tables)",
          "Key secondary results and the multiplicity/testing hierarchy outcome",
          "Planned structure of the integrated summary of effectiveness (CTD 2.7.3)",
          "Pooling strategy and consistency across studies/subgroups",
          "Durability / maintenance of effect where relevant",
          "Consistency with prior FDA agreements on endpoints and analyses",
          "Summary efficacy tables"
        ],
        "generationPrompt": "Summarize clinical efficacy and the planned integrated summary of effectiveness for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present pivotal designs and the pre-specified primary analysis and estimand, primary and key secondary results in tables, the planned CTD 2.7.3 structure, pooling/subgroup approach, and consistency with prior FDA agreements. Describe where data reside without fabricating specific values."
      },
      {
        "code": "MTG-SAFETY",
        "title": "Summary of Clinical Safety and Integrated Safety Analysis",
        "required": true,
        "contentType": "mixed",
        "guidance": "Overview of the integrated safety analysis (ISS) approach and the cumulative safety findings that will support the NDA and labeling.",
        "authoringGuidance": "FDA uses this to preview the safety database, the pooling strategy for the integrated summary of safety, and how the applicant will characterize important risks in labeling, so it should present cumulative exposure, the AE/SAE profile, deaths and discontinuations, adverse events of special interest, and the planned ISS structure per CTD 2.7.4. It should confirm the safety database meets ICH E1 expectations and describe the approach to adjudicated events and special populations. Deficiencies that draw requests include an ISS pooling strategy that masks study-level signals, inadequate exposure for a chronic indication, unaddressed safety signals, and analyses that do not support the proposed labeling.",
        "keyContentElements": [
          "Cumulative exposure by dose and duration (ICH E1 adequacy statement)",
          "Integrated AE and SAE profile (tables)",
          "Deaths, discontinuations, and dose modifications",
          "Adverse events of special interest and adjudicated events",
          "Laboratory, ECG/QT, and vital-sign findings",
          "Planned integrated summary of safety structure and pooling strategy (CTD 2.7.4)",
          "Special-population safety (hepatic/renal, elderly, pediatric, pregnancy)",
          "Link between safety findings and proposed labeling / risk management",
          "Summary safety tables"
        ],
        "generationPrompt": "Prepare a clinical safety summary and integrated safety analysis plan for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present cumulative exposure and ICH E1 adequacy, integrated AE/SAE tables, deaths and discontinuations, AEs of special interest, lab/QT findings, the planned CTD 2.7.4 pooling strategy, special-population safety, and the link to proposed labeling. State where data reside without fabricating counts."
      },
      {
        "code": "MTG-DATA",
        "title": "Data Standards, Datasets, and Application Format",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of the planned electronic submission format, study data standards (CDISC SDTM/ADaM), define.xml, reviewer's guides, and the CTD organization of the application.",
        "authoringGuidance": "This section is where the applicant confirms the NDA will be technically fileable and reviewable, so it should state the eCTD structure, the CDISC standards versions for tabulation and analysis datasets, the define.xml and analysis data reviewer's guide, the legacy-data conversion approach if any, and the software/analysis reproducibility plan per FDA's technical conformance and Study Data Technical Specifications. Reviewers and the technical staff issue requests (and can drive refuse-to-file) when required standards are absent, datasets are non-conformant, traceability from SDTM to ADaM to results is broken, or the define.xml is incomplete.",
        "keyContentElements": [
          "eCTD structure and CTD module organization of the planned application",
          "CDISC SDTM and ADaM versions and conformance approach",
          "define.xml, Study Data Reviewer's Guide (SDRG), and Analysis Data Reviewer's Guide (ADRG)",
          "Traceability from collected data to analysis results",
          "Handling of legacy / non-standard data and conversions",
          "Software, programs, and reproducibility materials to be provided",
          "Bioanalytical / PK dataset and popPK model submission plan",
          "Any proposed deviations from FDA Study Data Technical Specifications with justification",
          "Application-organization questions for the division"
        ],
        "generationPrompt": "Summarize the planned data standards, datasets, and application format for {{SPONSOR}}'s NDA for {{PRODUCT_NAME}} in {{INDICATION}}: describe the eCTD/CTD organization, CDISC SDTM/ADaM versions and conformance, define.xml, SDRG and ADRG, traceability, legacy-data handling, reproducibility materials, and popPK/PK dataset plan, noting any deviations from FDA Study Data Technical Specifications with justification and posing application-format questions."
      },
      {
        "code": "MTG-PLANS",
        "title": "Pediatric, Post-Marketing, Labeling, and CMC/Facilities Readiness",
        "required": true,
        "contentType": "mixed",
        "guidance": "Overview of the pediatric plan (iPSP/PREA), proposed post-marketing commitments/requirements and any REMS, draft labeling concept, and CMC and facility inspection readiness.",
        "authoringGuidance": "A Pre-NDA meeting is the point to confirm that non-efficacy elements will not delay filing or approval, so this section should state the status of the initial pediatric study plan and any PREA obligations or waivers/deferrals, the anticipated post-marketing requirements/commitments and REMS, the concept for key labeling sections, and the readiness of manufacturing facilities for pre-approval inspection. Reviewers flag problems when the pediatric plan is unresolved, a needed REMS is not proposed, facilities are not inspection-ready, or the labeling concept over-reaches beyond the data. This section prevents surprises in the safety/labeling and OPQ reviews.",
        "keyContentElements": [
          "Pediatric plan status (iPSP/PSP) and PREA deferrals/waivers",
          "Proposed post-marketing requirements and commitments (PMRs/PMCs)",
          "Risk management: whether a REMS is proposed and its elements",
          "Draft labeling concept for indication, dosing, warnings, and key sections",
          "CMC readiness: commercial process validation, specifications, and stability status",
          "Facility readiness for pre-approval inspection (drug substance, drug product, testing sites)",
          "Proprietary name status and any bridging/patient-focused data",
          "Questions on pediatric, PMR/REMS, labeling, or CMC/facility topics"
        ],
        "generationPrompt": "Summarize pediatric, post-marketing, labeling, and CMC/facility readiness for {{SPONSOR}}'s NDA for {{PRODUCT_NAME}} in {{INDICATION}}: state iPSP/PREA status and any deferrals/waivers, anticipated PMRs/PMCs and any REMS, the draft labeling concept for key sections, commercial CMC/validation/stability status, and facility inspection readiness, posing questions on any unresolved items."
      },
      {
        "code": "MTG-QUES",
        "title": "Numbered Questions for FDA with Sponsor Positions",
        "required": true,
        "contentType": "mixed",
        "guidance": "Numbered questions seeking agreement on NDA content, analyses, and format, each with the sponsor's position and rationale.",
        "authoringGuidance": "FDA prepares preliminary written responses, and Pre-NDA questions should confirm that the planned application and its analyses are acceptable and identify anything that could trigger a refuse-to-file or a review deficiency. Each question should state the applicant's proposal (primary analysis, ISS/ISE approach, dataset standards, pediatric/REMS/PMR plan, labeling concept) and ask FDA to confirm agreement or acceptability. The best questions convert filing risks into explicit 'Does the Agency agree...' or 'Does the Agency have concerns with...' asks tied to the summary sections. Weak questions ask FDA to pre-review efficacy conclusions, bundle several decisions, or seek agreement on labeling wording that the data cannot yet support.",
        "keyContentElements": [
          "Sequentially numbered questions grouped by discipline",
          "Context and applicant position preceding each question",
          "Cross-reference to the relevant summary section and CTD module",
          "Agreement/acceptability-seeking phrasing",
          "Efficacy questions: acceptability of primary/key secondary analyses and ISE approach",
          "Safety questions: acceptability of the ISS pooling and safety database",
          "Data-standards questions: dataset conformance and application format",
          "Clinical-pharmacology questions: popPK, exposure-response, and dose justification for labeling",
          "Pediatric / REMS / PMR and labeling questions",
          "CMC and facility-readiness questions",
          "Review-facilitation questions (e.g., rolling review, pre-submission of components)"
        ],
        "generationPrompt": "Draft the numbered FDA questions for {{SPONSOR}}'s Pre-NDA meeting on {{PRODUCT_NAME}} in {{INDICATION}}, grouped by efficacy, safety, data standards/format, clinical pharmacology, pediatric/REMS/PMR/labeling, and CMC/facility. For each, give context, the applicant's proposal cross-referenced to the relevant section and CTD module, and an acceptability/agreement-seeking ask that de-risks filing and review. Keep each answerable; do not fabricate underlying data."
      }
    ],
    "timing": "Requested a few months before planned NDA submission; FDA schedules the Type B meeting within 60 days of the request, with the briefing document due no later than 30 calendar days before the meeting.",
    "ctdSectionCodes": [
      "2.3",
      "2.4",
      "2.5",
      "2.6",
      "2.7"
    ],
    "meetingPackage": true
  },
  {
    "id": "pre_bla_meeting",
    "label": "Pre-BLA Meeting Briefing Document (Type B)",
    "category": "meeting",
    "family": "MEETING",
    "agency": "FDA",
    "description": "Briefing package supporting a Pre-BLA (Type B) meeting to align with FDA on the format, content, and completeness of the planned Biologics License Application before submission, with the biologics-specific emphasis on product characterization and comparability, potency, immunogenicity, manufacturing process validation and facility readiness, and lot-release/stability, alongside the integrated summaries of safety and effectiveness, data standards, and labeling. The package draws on the CTD Module 2 summaries and poses numbered questions to de-risk the filing and review of the BLA.",
    "regulatoryBasis": [
      "FDA Guidance for Industry: Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products (Dec 2017)",
      "21 CFR 312.47 (meetings)",
      "21 CFR 601.2 (BLA submission) and Section 351 of the PHS Act (42 U.S.C. 262)",
      "21 CFR 601.20 (standards for licensing)",
      "PDUFA VII commitment letter (meeting management and pre-submission activities)",
      "ICH M4 / M4E(R2) (CTD organization and clinical overview)",
      "ICH Q5E (comparability of biotechnological/biological products)",
      "ICH Q6B (specifications for biotechnological/biological products)"
    ],
    "components": [
      {
        "code": "MTG-REQ-CL",
        "title": "Meeting Request Letter and Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Type B Pre-BLA meeting request identifying the biological product, IND, proposed indication, planned submission timing, purpose, and preliminary questions.",
        "authoringGuidance": "The request should state that the sponsor seeks agreement on the content and format of the forthcoming BLA and give the planned submission date so the review center (CBER or CDER) aligns resources, including OPQ/product-quality and facility-inspection planning that is central for biologics. It must include the IND number, proposed indication, requested format and dates within the Type B window, the preliminary numbered questions, and an attendee list emphasizing product-quality/manufacturing and statistics. A request that omits the target filing date, the review center context, or the manufacturing focus leads to a meeting scheduled without the right quality reviewers.",
        "keyContentElements": [
          "Product name, proper name, and product class (e.g., mAb, recombinant protein, cell/gene therapy)",
          "IND number and proposed indication(s)",
          "Meeting type (Type B, Pre-BLA) and requested format",
          "Planned BLA submission date and any expedited-program designation",
          "Statement of purpose: agreement on BLA content, format, and quality/review facilitation",
          "Preliminary numbered questions by discipline (with product-quality emphasis)",
          "Sponsor attendees and requested FDA disciplines (incl. product quality/CMC, facilities)",
          "Requested dates within the Type B window",
          "Confirmation of briefing-document delivery 30 days ahead",
          "Regulatory contact information"
        ],
        "generationPrompt": "Draft a Type B Pre-BLA meeting request for {{SPONSOR}}'s biological product {{PRODUCT_NAME}} (IND number) in {{INDICATION}}, stating the purpose of agreeing on BLA content and format, giving the planned submission date and any expedited designation, listing preliminary numbered questions by discipline with a product-quality emphasis, requesting format and dates within the Type B window, and confirming briefing-document delivery 30 days ahead per the 2017 formal-meetings guidance."
      },
      {
        "code": "MTG-AGENDA",
        "title": "Proposed Agenda",
        "required": true,
        "contentType": "list",
        "guidance": "Time-boxed agenda mapping topics to numbered questions and assigning speakers.",
        "authoringGuidance": "The Pre-BLA agenda should give visible weight to the biologics-specific quality topics (comparability, potency, process validation, facility readiness) in addition to the efficacy, safety, and format topics, so the right OPQ reviewers are engaged. It maps one-to-one to the questions, names speakers, and reserves the majority of time for FDA discussion. Agendas that treat CMC/quality as an afterthought, or re-present pivotal efficacy at length, misuse a meeting whose value for biologics lies heavily in the product-quality and inspection-readiness alignment.",
        "keyContentElements": [
          "Logistics header (date, time, format, location/dial-in)",
          "Objectives and introductions",
          "Ordered topics keyed to numbered questions, with product-quality topics prominent",
          "Assigned sponsor speaker per topic",
          "Time allocation summing to the meeting length",
          "Reserved time for FDA discussion and action items",
          "Note that no formal presentation is planned unless requested"
        ],
        "generationPrompt": "Create a time-boxed Pre-BLA meeting agenda for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}, giving prominence to biologics quality topics (comparability, potency, process validation, facility readiness) alongside efficacy, safety, data standards, and labeling, mapping each to its numbered question, assigning speakers, allocating minutes, and reserving time for FDA discussion."
      },
      {
        "code": "MTG-ATTEND",
        "title": "Sponsor Attendee List",
        "required": true,
        "contentType": "table",
        "guidance": "Table of sponsor and consultant attendees with names, titles, roles, and affiliations, plus requested FDA disciplines.",
        "authoringGuidance": "The delegation should include product-quality/CMC and manufacturing/analytical leads prominently, in addition to regulatory, clinical, biostatistics, safety/PV, and clinical pharmacology, because the Pre-BLA meeting is quality-heavy. Each attendee should map to an agenda item, and external analytical or manufacturing experts should be flagged. A list without a manufacturing/quality lead signals the sponsor cannot discuss the comparability, potency, and validation questions that dominate a BLA.",
        "keyContentElements": [
          "Full name of each attendee",
          "Title and functional role (regulatory, product quality/CMC, manufacturing, analytical, clinical, biostatistics, safety/PV, clin pharm)",
          "Affiliation",
          "External consultants / experts flagged",
          "Primary spokesperson and regulatory contact identified",
          "Requested FDA disciplines (incl. product quality and facilities)"
        ],
        "generationPrompt": "Produce a sponsor attendee table for {{SPONSOR}}'s Pre-BLA meeting on {{PRODUCT_NAME}} in {{INDICATION}}, listing name, title, role, and affiliation across product quality/CMC, manufacturing, analytical, regulatory, clinical, biostatistics, safety/PV, and clinical pharmacology, flagging external experts, and noting requested FDA disciplines."
      },
      {
        "code": "MTG-BKGD",
        "title": "Product Background and Development History",
        "required": true,
        "contentType": "narrative",
        "guidance": "Overview of the biological product, indication, regulatory history including prior agreements, and the completed development program supporting the BLA.",
        "authoringGuidance": "This section situates the biologic within its development history and prior FDA agreements and, distinctively for biologics, tracks the manufacturing history and any process changes that create comparability obligations across the clinical program. It should summarize the product and mechanism, the pivotal clinical evidence at a high level, regulatory designations and prior agreements, and the manufacturing evolution from clinical to commercial process. Reviewers lose confidence when the background omits a major process change, contradicts prior agreements, or fails to connect the commercial material to the material used in pivotal trials.",
        "keyContentElements": [
          "Product description (modality, structure/composition) and mechanism of action",
          "Proposed indication(s) and population",
          "Regulatory history: prior meetings, agreements, and designations",
          "Manufacturing history and process changes across development (comparability context)",
          "Inventory of pivotal and supportive studies and outcomes at a high level",
          "Relationship of commercial-process material to pivotal-trial material",
          "Foreign regulatory status and any approvals",
          "Planned BLA scope and target submission timing"
        ],
        "generationPrompt": "Write a product background and development history for {{SPONSOR}}'s biological product {{PRODUCT_NAME}} in {{INDICATION}} for a Pre-BLA meeting: cover product and mechanism, indication, regulatory history and prior agreements, the manufacturing history and process changes across development, the pivotal/supportive study inventory and outcomes, the link between commercial and pivotal material, and the planned BLA scope and timing."
      },
      {
        "code": "MTG-QUAL",
        "title": "Product Quality, Comparability, Potency, and Immunogenicity Summary",
        "required": true,
        "contentType": "mixed",
        "guidance": "Biologics-specific quality summary: characterization, control strategy and specifications, comparability across process changes, potency/bioassay, and immunogenicity assessment.",
        "authoringGuidance": "This is the section that most distinguishes a Pre-BLA from a Pre-NDA package, and OPQ reviewers read it to judge whether the product is well-characterized and controlled and whether comparability across process changes has been demonstrated per ICH Q5E. It should present the characterization and structural/functional data, the control strategy and specifications per ICH Q6B, the potency/bioassay strategy, the comparability protocol and results bridging clinical and commercial material, and the immunogenicity assessment strategy and clinical impact. Deficiencies that draw FDA requests include a comparability package that does not bridge a late process change to pivotal material, an inadequately validated potency assay, specifications not justified by clinical experience, and an immunogenicity strategy that does not link ADA to safety/efficacy.",
        "keyContentElements": [
          "Physicochemical and biological characterization (structure, purity, post-translational modifications)",
          "Control strategy and proposed specifications per ICH Q6B",
          "Potency / relevant bioassay and its validation status",
          "Comparability assessment across process changes per ICH Q5E (protocol and results, clinical-to-commercial bridge)",
          "Impurity and product-related substances/variants profile",
          "Stability program and proposed shelf life / storage",
          "Immunogenicity assessment strategy, assays, and observed ADA impact on safety/efficacy",
          "Reference standard and lot-release strategy",
          "Summary quality tables (specifications, comparability, potency)",
          "Adventitious agent safety / viral clearance as applicable"
        ],
        "generationPrompt": "Summarize product quality, comparability, potency, and immunogenicity for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} for a Pre-BLA meeting: present characterization, the control strategy and specifications per ICH Q6B, the potency/bioassay and its validation, the ICH Q5E comparability package bridging clinical to commercial material, the impurity/variant profile, stability, and the immunogenicity assay strategy and ADA impact. Describe where data reside and use summary tables without fabricating specific results."
      },
      {
        "code": "MTG-MFG",
        "title": "Manufacturing Process, Validation, and Facility Readiness",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of the commercial manufacturing process, process validation/process performance qualification, and readiness of facilities for pre-license inspection.",
        "authoringGuidance": "For a BLA, licensure depends on the manufacturing process and facilities meeting the standards of 21 CFR 601.20, so this section should describe the drug substance and drug product commercial process, the control of critical process parameters and quality attributes, the process validation/PPQ status, and the readiness of each facility (drug substance, drug product, testing, and any contract sites) for pre-license inspection. It should identify the specific facilities and their inspection history. Reviewers flag problems when PPQ is incomplete at the intended filing time, when facilities are not inspection-ready, when the control strategy does not link CPPs to CQAs, or when a critical step is performed at an unnamed or previously non-compliant site.",
        "keyContentElements": [
          "Drug substance and drug product commercial manufacturing process description",
          "Critical process parameters (CPPs) and critical quality attributes (CQAs) and their control",
          "Process validation / PPQ strategy and status (number of lots, acceptance criteria)",
          "In-process controls and hold-time / shipping validation",
          "List of all manufacturing, testing, and packaging facilities with roles",
          "Facility inspection history and pre-license inspection readiness",
          "Contamination control / sterility assurance and, for sterile products, aseptic process validation",
          "Lot-to-lot consistency and batch analysis summary",
          "Manufacturing / facility questions for the division"
        ],
        "generationPrompt": "Summarize the commercial manufacturing process, validation, and facility readiness for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} for a Pre-BLA meeting: describe the drug substance/drug product process, CPPs and CQAs and their control, PPQ strategy and status, in-process controls, the full list of facilities with roles and inspection history, sterility/contamination control, and lot-to-lot consistency, posing manufacturing/facility questions. State where data reside without fabricating results."
      },
      {
        "code": "MTG-EFF",
        "title": "Summary of Clinical Efficacy and Integrated Effectiveness",
        "required": true,
        "contentType": "mixed",
        "guidance": "Summary of pivotal efficacy results and the planned integrated summary of effectiveness, including pre-specified primary and key secondary analyses.",
        "authoringGuidance": "As in a Pre-NDA package, this previews the efficacy evidence and the analytic approach FDA will scrutinize, presenting the pivotal results against the pre-specified primary endpoint and estimand, the key secondary results within the multiplicity hierarchy, and the planned integrated summary of effectiveness per CTD 2.7.3. It must confirm the analyses match prior agreements and, for biologics, that efficacy conclusions rest on material representative of the to-be-marketed product. Reviewers issue requests for post-hoc analyses, deviations from the agreed estimand, unjustified pooling, or efficacy claims resting on non-representative early-process material.",
        "keyContentElements": [
          "Pivotal study designs and pre-specified primary analysis (estimand)",
          "Primary efficacy results with effect estimates and confidence intervals (tables)",
          "Key secondary results and the multiplicity/testing hierarchy outcome",
          "Planned integrated summary of effectiveness structure (CTD 2.7.3)",
          "Pooling strategy and consistency across studies/subgroups",
          "Representativeness of the clinical material to the commercial product",
          "Consistency with prior FDA agreements on endpoints and analyses",
          "Summary efficacy tables"
        ],
        "generationPrompt": "Summarize clinical efficacy and the planned integrated summary of effectiveness for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present pivotal designs and the pre-specified primary analysis and estimand, primary and key secondary results in tables, the planned CTD 2.7.3 structure, pooling/subgroup approach, the representativeness of clinical material to the commercial product, and consistency with prior FDA agreements. Describe where data reside without fabricating values."
      },
      {
        "code": "MTG-SAFETY",
        "title": "Summary of Clinical Safety and Integrated Safety Analysis",
        "required": true,
        "contentType": "mixed",
        "guidance": "Overview of the integrated safety analysis approach and cumulative safety findings, including immunogenicity-related safety, supporting the BLA and labeling.",
        "authoringGuidance": "FDA uses this to preview the safety database and the pooling strategy for the integrated summary of safety and, for biologics, to see immunogenicity-related safety (hypersensitivity, injection/infusion reactions, ADA-associated events) characterized. It should present cumulative exposure, the AE/SAE profile, deaths and discontinuations, adverse events of special interest including immunogenicity-related events, and the planned ISS structure per CTD 2.7.4, confirming ICH E1 adequacy. Deficiencies drawing requests include an ISS that masks study-level signals, inadequate exposure for a chronic indication, immunogenicity-related safety not linked to ADA data, and analyses that do not support the proposed labeling and risk management.",
        "keyContentElements": [
          "Cumulative exposure by dose and duration (ICH E1 adequacy statement)",
          "Integrated AE and SAE profile (tables)",
          "Deaths, discontinuations, and dose modifications",
          "Immunogenicity-related safety (hypersensitivity, infusion reactions, ADA-associated events)",
          "Other adverse events of special interest and adjudicated events",
          "Laboratory, ECG/QT, and vital-sign findings",
          "Planned integrated summary of safety structure and pooling strategy (CTD 2.7.4)",
          "Special-population safety",
          "Link between safety findings and proposed labeling / risk management",
          "Summary safety tables"
        ],
        "generationPrompt": "Prepare a clinical safety summary and integrated safety analysis plan for {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}}: present cumulative exposure and ICH E1 adequacy, integrated AE/SAE tables, deaths and discontinuations, immunogenicity-related and other AEs of special interest, lab/QT findings, the planned CTD 2.7.4 pooling strategy, special-population safety, and the link to labeling and risk management. State where data reside without fabricating counts."
      },
      {
        "code": "MTG-DATA-PLANS",
        "title": "Data Standards, Format, Pediatric, Post-Marketing, and Labeling Readiness",
        "required": true,
        "contentType": "mixed",
        "guidance": "Combined summary of electronic submission format and study data standards, the pediatric plan, proposed post-marketing requirements/commitments and any REMS, and the draft labeling concept.",
        "authoringGuidance": "This section confirms the BLA will be technically fileable and reviewable and that the non-efficacy regulatory obligations are on track, covering the eCTD/CTD organization, CDISC SDTM/ADaM standards with define.xml and reviewer's guides, the iPSP/PREA status, anticipated PMRs/PMCs and any REMS, and the draft labeling concept per the Prescribing Information format. Reviewers flag problems when datasets are non-conformant or traceability is broken (technical refuse-to-file risk), when the pediatric plan is unresolved, when a needed REMS is not proposed, or when the labeling concept exceeds the data. It lets the applicant close out format and obligation questions before submission.",
        "keyContentElements": [
          "eCTD/CTD organization of the planned BLA",
          "CDISC SDTM/ADaM versions, define.xml, SDRG and ADRG, and traceability",
          "Any deviations from FDA Study Data Technical Specifications with justification",
          "Pediatric plan status (iPSP/PSP) and PREA deferrals/waivers",
          "Proposed post-marketing requirements and commitments (PMRs/PMCs)",
          "Risk management: whether a REMS is proposed and its elements",
          "Draft labeling concept for indication, dosing, warnings, and immunogenicity information",
          "Proprietary name status",
          "Questions on data standards/format, pediatric, PMR/REMS, or labeling"
        ],
        "generationPrompt": "Summarize data standards and format plus pediatric, post-marketing, and labeling readiness for {{SPONSOR}}'s BLA for {{PRODUCT_NAME}} in {{INDICATION}}: describe the eCTD/CTD organization, CDISC SDTM/ADaM and define.xml/SDRG/ADRG with traceability and any Study Data Technical Specifications deviations, iPSP/PREA status, anticipated PMRs/PMCs and any REMS, and the draft labeling concept including immunogenicity information, posing questions on unresolved items."
      },
      {
        "code": "MTG-QUES",
        "title": "Numbered Questions for FDA with Sponsor Positions",
        "required": true,
        "contentType": "mixed",
        "guidance": "Numbered questions seeking agreement on BLA content, quality/comparability, analyses, and format, each with the sponsor's position and rationale.",
        "authoringGuidance": "FDA prepares preliminary written responses, and Pre-BLA questions should confirm the planned application, its product-quality package, and its analyses are acceptable and surface anything that could trigger a refuse-to-file or a quality/inspection deficiency. Each question should state the applicant's proposal (comparability approach, potency specification, PPQ timing, primary analysis, ISS/ISE, dataset standards, pediatric/REMS/PMR, labeling) and ask FDA to confirm agreement or acceptability. The strongest questions turn quality and filing risks into explicit 'Does the Agency agree...' asks anchored to the summary sections. Weak questions ask FDA to pre-review efficacy conclusions, bundle several decisions, or seek agreement on a comparability or specification position without presenting the supporting data.",
        "keyContentElements": [
          "Sequentially numbered questions grouped by discipline",
          "Context and applicant position preceding each question",
          "Cross-reference to the relevant summary section and CTD module",
          "Agreement/acceptability-seeking phrasing",
          "Product-quality questions: comparability adequacy, potency specification, stability, immunogenicity strategy",
          "Manufacturing questions: PPQ timing/adequacy and facility inspection readiness",
          "Efficacy questions: acceptability of primary/key secondary analyses and ISE approach",
          "Safety questions: acceptability of the ISS pooling and safety database, immunogenicity safety",
          "Data-standards questions: dataset conformance and application format",
          "Pediatric / REMS / PMR and labeling questions",
          "Review-facilitation questions (e.g., rolling review, pre-submission of components)"
        ],
        "generationPrompt": "Draft the numbered FDA questions for {{SPONSOR}}'s Pre-BLA meeting on {{PRODUCT_NAME}} in {{INDICATION}}, grouped by product quality/comparability, manufacturing/facility, efficacy, safety, data standards/format, and pediatric/REMS/PMR/labeling. For each, give context, the applicant's proposal cross-referenced to the relevant section and CTD module, and an acceptability/agreement-seeking ask that de-risks filing, quality review, and inspection. Keep each answerable; do not fabricate underlying data."
      }
    ],
    "timing": "Requested a few months before planned BLA submission; FDA schedules the Type B meeting within 60 days of the request, with the briefing document due no later than 30 calendar days before the meeting.",
    "ctdSectionCodes": [
      "2.3",
      "2.4",
      "2.5",
      "2.6",
      "2.7"
    ],
    "meetingPackage": true
  },
  {
    "id": "ind_initial",
    "label": "Initial IND Application",
    "category": "application",
    "family": "IND",
    "agency": "FDA",
    "description": "Original Investigational New Drug application submitted under 21 CFR 312.20 to obtain FDA authorization to ship an investigational drug in interstate commerce and administer it to humans. Establishes that the product is reasonably safe to enter clinical testing at the proposed phase, containing administrative forms, an introductory statement and general investigational plan, the Investigator's Brochure, the initial protocol(s), and the supporting chemistry/manufacturing/controls, pharmacology-toxicology, and prior human experience data organized in eCTD/CTD format.",
    "regulatoryBasis": [
      "21 CFR 312.20 (Requirement for an IND)",
      "21 CFR 312.22 (General principles of the IND submission)",
      "21 CFR 312.23 (IND content and format)",
      "21 CFR 312.40 (General requirements for use of an investigational new drug in a clinical investigation)",
      "FDA Guidance for Industry: Content and Format of Investigational New Drug Applications (INDs) for Phase 1 Studies of Drugs, Including Well-Characterized, Therapeutic, Biotechnology-Derived Products (1995)",
      "ICH M4 / M4Q / M4S / M4E (Common Technical Document)",
      "ICH E6(R2) Good Clinical Practice",
      "ICH M3(R2) Nonclinical Safety Studies for the Conduct of Human Clinical Trials"
    ],
    "components": [
      {
        "code": "COVER-LETTER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Administrative transmittal letter identifying the submission as an original IND and orienting the FDA review division.",
        "authoringGuidance": "The cover letter is the first document an FDA regulatory project manager reads and it routes the submission to the correct review division, so it must unambiguously identify the submission type (original IND), the proposed drug, the indication, the development phase, and any pre-IND meeting or prior FDA correspondence by date and reference number. A reviewer uses it to confirm the sponsor's expectations for the 30-day clock and to spot any requested designations (Fast Track, orphan, pediatric plans) or special handling. It should list the sponsor's regulatory contact with direct phone and email so information requests can be issued quickly, and it must not contain new scientific claims that are unsupported by the body of the application. An acceptable cover letter is concise (typically 1–2 pages), factually consistent with Form FDA 1571, and free of promotional language.",
        "keyContentElements": [
          "Statement that the submission is an original Investigational New Drug application under 21 CFR 312.20",
          "Proposed proprietary/established name of the drug and dosage form/route",
          "Proposed indication and clinical development phase (e.g., Phase 1)",
          "Reference to any pre-IND meeting (PIND number, meeting date) and agreements reached",
          "Cross-reference to any related INDs, DMFs, or Master Files being relied upon (with letters of authorization noted)",
          "Sponsor name, address, and the responsible regulatory/scientific contact with phone and email",
          "List of the submission's contents at a high level (forms, IB, protocol, CMC, nonclinical)",
          "Any special requests (e.g., request for comments, waiver requests, expedited-program designations)",
          "eCTD sequence number and submission format statement"
        ],
        "generationPrompt": "Draft an FDA IND cover letter for {{SPONSOR}} transmitting the original Investigational New Drug application for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Identify the submission as an original IND under 21 CFR 312.20, reference any pre-IND meeting outcomes, name the responsible regulatory contact with phone and email, summarize the contents at a high level, and keep the tone factual and non-promotional."
      },
      {
        "code": "FORM-FDA-1571",
        "title": "Form FDA 1571 (Investigational New Drug Application)",
        "required": true,
        "contentType": "form",
        "guidance": "Mandatory administrative cover form for the IND and every subsequent submission to it, per 21 CFR 312.23(a)(1).",
        "authoringGuidance": "Form FDA 1571 is the legal jacket of the IND: it captures the sponsor of record, the IND number (assigned by FDA at receipt for the original), the drug name, the phase(s) of investigation, and a checklist mapping every required content element to its location in the submission. Reviewers rely on the item 11 contents checklist to confirm nothing required by 312.23(a) is missing, so each checked item must correspond to an actual, correctly placed section. The form carries the sponsor's binding commitments in items 12–13, including agreement not to begin investigations until the 30-day period expires, to conduct the study under an IRB compliant with 21 CFR part 56, and to comply with all other 312 requirements; it must be signed by an authorized responsible official or the sponsor's US agent. An acceptable 1571 has internally consistent phase designations, an authorized signature, and a contents checklist that reconciles exactly with the eCTD backbone.",
        "keyContentElements": [
          "Sponsor name, address, and date of submission",
          "IND number (left blank on original; supplied by FDA thereafter)",
          "Name of drug and indication",
          "Phase(s) of clinical investigation to be conducted",
          "Serial number of the submission (0000 for original)",
          "Item 11 contents-of-application checklist mapping each 312.23(a) element to its location",
          "Identification of any contract research organizations and the obligations transferred (with 21 CFR 312.52 statements)",
          "Name and title of the person responsible for monitoring the conduct and progress of the investigations",
          "Name and title of the person responsible for review and evaluation of safety information",
          "Sponsor's dated signature and commitment statements under items 12–13"
        ],
        "generationPrompt": "Complete Form FDA 1571 for {{SPONSOR}}'s original IND for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Populate sponsor identification, serial number 0000, the item 11 contents checklist keyed to the 21 CFR 312.23(a) elements included, the persons responsible for monitoring and for safety review, and the required commitment/signature block; note that the IND number is assigned by FDA."
      },
      {
        "code": "FORM-FDA-1572",
        "title": "Form FDA 1572 (Statement of Investigator)",
        "required": true,
        "contentType": "form",
        "guidance": "Signed commitment of each clinical investigator conducting the protocol, required by 21 CFR 312.23(a)(6)(iii)(b) and 312.53(c).",
        "authoringGuidance": "Form FDA 1572 is the investigator's personal, legally binding agreement to conduct the study in accordance with the protocol, 21 CFR part 312, and IRB requirements, and to personally supervise the investigation. A reviewer checks that the named investigator's qualifications (via the attached CV), the clinical facilities, the clinical laboratories, the IRB of record, and every subinvestigator are completely and accurately listed, because omissions here are a frequent source of information requests and inspection findings. For an initial IND the 1572 is required for each investigator already identified; for as-yet-unnamed sites the sponsor commits on Form 1571 to collect them before those investigators begin. An acceptable 1572 is fully completed (no blank required fields), lists the specific protocol(s) by number/title, and is signed and dated by the investigator personally—not by a delegate.",
        "keyContentElements": [
          "Name and address of the investigator",
          "Education, training, and experience qualifying the investigator (CV attached)",
          "Name and address of any medical school, hospital, or research facility where the investigation will be conducted",
          "Name and address of any clinical laboratory facilities to be used",
          "Name and address of the IRB responsible for review and approval",
          "Names of subinvestigators who will assist in the conduct of the investigation",
          "Name and code number/title of the protocol(s) to be conducted",
          "Commitments to conduct per protocol, part 312, and part 56, and to obtain informed consent per part 50",
          "Investigator's signature and date"
        ],
        "generationPrompt": "Prepare a Form FDA 1572 (Statement of Investigator) template for {{SPONSOR}}'s {{PRODUCT_NAME}} protocol in {{INDICATION}} at {{PHASE}}, showing all required fields: investigator identification and qualifications, clinical and laboratory facilities, IRB of record, subinvestigators, the specific protocol number and title, and the investigator commitment and signature block."
      },
      {
        "code": "FORM-FDA-3674",
        "title": "Form FDA 3674 (Certification of Compliance, ClinicalTrials.gov)",
        "required": true,
        "contentType": "form",
        "guidance": "Certification of compliance with ClinicalTrials.gov registration requirements under Section 402(j) of the PHS Act (FDAAA 801).",
        "authoringGuidance": "Form FDA 3674 certifies to FDA that any applicable clinical trials in the submission are registered (and results reporting is or will be met) at ClinicalTrials.gov, as required by Title VIII of FDAAA (42 U.S.C. 282(j)). For an original IND that includes only a first-in-human Phase 1 study, the sponsor typically checks that the certification requirement does not apply because Phase 1 trials are generally not 'applicable clinical trials'; when applicable controlled trials are included, the NCT number(s) must be provided. Reviewers verify the box selected is consistent with the phase and design of the protocols actually submitted, so the certification must track the protocol content exactly. An acceptable 3674 has one and only one applicable certification option selected, correct NCT numbers where required, and an authorized signature.",
        "keyContentElements": [
          "Identification of the submission (drug, IND, sponsor)",
          "Selection of the applicable certification statement (not-applicable, or registered with NCT number)",
          "NCT number(s) for each applicable clinical trial where registration applies",
          "Basis for a 'requirement does not apply' selection when Phase 1-only",
          "Name and title of the certifying official",
          "Signature and date of the authorized official"
        ],
        "generationPrompt": "Complete Form FDA 3674 for {{SPONSOR}}'s original IND for {{PRODUCT_NAME}} in {{INDICATION}}. Select the certification option consistent with a {{PHASE}} protocol set, provide NCT numbers for any applicable clinical trials, and include the certifying official's signature block; explain the basis if the ClinicalTrials.gov requirement does not apply."
      },
      {
        "code": "TOC",
        "title": "Table of Contents",
        "required": true,
        "contentType": "list",
        "guidance": "Comprehensive table of contents enabling reviewers to locate every required element, per 21 CFR 312.23(a)(2).",
        "authoringGuidance": "The table of contents is the reviewer's navigation map across the entire IND and, in eCTD submissions, is realized through the CTD granularity and hyperlinked backbone rather than a single flat page. It must reconcile precisely with the Form FDA 1571 item 11 contents checklist so that every element required by 312.23(a) is discoverable at its stated location. Misalignment between the TOC/backbone and the actual placed documents is a common cause of technical rejection or delayed review. An acceptable TOC (or eCTD structure) is complete, accurate to the module/section codes, and contains working navigation to each major section (introductory statement, IB, protocols, CMC, pharm-tox, previous human experience).",
        "keyContentElements": [
          "Listing of all administrative forms and their locations",
          "Module 1 regional administrative documents index",
          "Module 2 summaries index (QOS, nonclinical overview/summaries, clinical overview/summaries)",
          "Module 3 Quality (CMC) index",
          "Module 4 Nonclinical study reports index",
          "Module 5 Clinical study reports / protocol index",
          "Cross-reference of each 312.23(a) required element to its CTD location",
          "Consistency check against Form FDA 1571 item 11"
        ],
        "generationPrompt": "Generate the IND table of contents / eCTD backbone map for {{SPONSOR}}'s {{PRODUCT_NAME}} original IND in {{INDICATION}} at {{PHASE}}, listing every 21 CFR 312.23(a) required element with its CTD module/section location and reconciling it to the Form FDA 1571 item 11 contents checklist."
      },
      {
        "code": "INTRO-GIP",
        "title": "Introductory Statement and General Investigational Plan",
        "required": true,
        "contentType": "narrative",
        "guidance": "Concise orientation to the drug and the sponsor's development strategy for the coming year, per 21 CFR 312.23(a)(3).",
        "authoringGuidance": "This section gives the FDA reviewer the strategic frame for the whole application: it names the drug and its pharmacologic class and structure, states the broad objectives and planned duration of clinical investigation, and identifies the indication(s) under study. Under 312.23(a)(3)(iii) it must disclose whether the drug has been withdrawn from investigation or marketing in any country for safety or effectiveness reasons, which reviewers treat as a critical safety-signal disclosure. The general investigational plan looks forward roughly one year—rationale, indication, approach to evaluating the drug, the kinds and duration of studies planned, anticipated patient numbers, and any foreseen safety risks based on toxicology or prior human experience. An acceptable section is brief (a few pages), internally consistent with the protocols and IB, and candid about known risks and any prior withdrawals rather than promotional.",
        "keyContentElements": [
          "Name of the drug, active ingredients, pharmacological class, and structural formula",
          "Formulation and route of administration",
          "Broad objectives and planned duration of the clinical investigation",
          "Description of the indication(s) to be studied",
          "Rationale for the drug and the general approach to evaluating it",
          "Kinds of clinical trials planned in the next 12 months with estimated patient numbers",
          "Anticipated risks based on toxicology data and any prior human experience",
          "Disclosure of any country in which the drug was withdrawn for safety or effectiveness (312.23(a)(3)(iii))",
          "Statement of how the plan for the coming year fits the overall development program"
        ],
        "generationPrompt": "Write the Introductory Statement and General Investigational Plan for {{SPONSOR}}'s IND for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Describe the drug's class, structure, formulation and route; state development objectives, the studies planned over the next 12 months with estimated enrollment, anticipated risks from nonclinical and any human data, and disclose any prior safety/effectiveness withdrawal per 21 CFR 312.23(a)(3)(iii). Keep it concise and non-promotional; do not invent study results."
      },
      {
        "code": "IB",
        "title": "Investigator's Brochure",
        "required": true,
        "contentType": "mixed",
        "guidance": "Compilation of clinical and nonclinical data relevant to the study of the drug in humans, per 21 CFR 312.23(a)(5) and ICH E6(R2) §7.",
        "authoringGuidance": "The Investigator's Brochure equips investigators and IRBs to make a benefit-risk judgment and to manage subjects safely, so it must present the physicochemical, pharmacological, toxicological, pharmacokinetic, and any clinical data in an objective, balanced way that supports the proposed protocol. Reviewers and IRBs use the IB to confirm that the reference safety information, starting dose, dose-escalation rationale, and monitoring are justified by the actual nonclinical and (if any) clinical findings. Under ICH E6(R2) the IB must be reviewed at least annually and updated as significant new information emerges, and its summary of data and guidance for the investigator section should translate the data into practical safety guidance. An acceptable IB is data-driven, internally consistent with the protocol and CMC/pharm-tox sections, clearly identifies the expected adverse reactions that define seriousness/expectedness for safety reporting, and avoids overstating efficacy.",
        "keyContentElements": [
          "Title page, confidentiality statement, and edition/date with version control",
          "Table of contents and summary",
          "Physical, chemical, and pharmaceutical properties and formulation",
          "Nonclinical pharmacology (primary/secondary, safety pharmacology) summary",
          "Nonclinical pharmacokinetics and toxicology (including species, doses, findings, NOAEL)",
          "Effects in humans: PK/PD, safety, and efficacy from any prior clinical experience",
          "Summary of data and guidance for the investigator (benefit-risk, dosing, safety management)",
          "Reference safety information defining expected serious adverse reactions",
          "Marketing experience and any regulatory withdrawals, if applicable",
          "References/bibliography supporting the data presented"
        ],
        "generationPrompt": "Draft an Investigator's Brochure for {{PRODUCT_NAME}} ({{SPONSOR}}) supporting {{PHASE}} investigation in {{INDICATION}}, structured per ICH E6(R2) §7: physicochemical/pharmaceutical properties, nonclinical pharmacology, PK, and toxicology, any human experience, and a Summary of Data and Guidance for the Investigator including the reference safety information. Describe where each data set belongs and what a complete section contains; do not fabricate study results or product facts."
      },
      {
        "code": "PROTOCOL",
        "title": "Clinical Protocol(s)",
        "required": true,
        "contentType": "mixed",
        "guidance": "Full protocol for each planned study, per 21 CFR 312.23(a)(6) and ICH E6(R2), placed in CTD Module 5.3.5.",
        "authoringGuidance": "The protocol is the scientific and operational contract for the study and is the section FDA scrutinizes most for subject safety: it must state objectives, design, subject selection criteria, dosing and dose-modification rules, and the safety monitoring and stopping rules in enough detail for a reviewer to judge whether risks are minimized. For a first-in-human protocol the starting dose justification (e.g., MABEL or NOAEL-based with safety factor per FDA's 2005 estimating-maximum-safe-starting-dose guidance), the dose-escalation scheme, and stopping/pausing criteria receive particular attention. Phase 1 protocols may be less detailed on efficacy but must be complete on eligibility, dosing, monitoring, and adverse-event management; the protocol must align with the IB reference safety information and the informed consent. An acceptable protocol is internally consistent, has unambiguous safety governance (DSMB/SRC where appropriate), defined endpoints, and a schedule of assessments that operationalizes every safety commitment.",
        "keyContentElements": [
          "Protocol title, number, version/date, and phase",
          "Primary and secondary objectives and endpoints",
          "Study design, including control, randomization/blinding, and duration",
          "Inclusion/exclusion criteria and study population",
          "Dosing regimen, route, and dose-modification/escalation rules with starting-dose justification",
          "Schedule of assessments (schedule of activities) and study procedures",
          "Safety monitoring plan, adverse event definitions, and reporting responsibilities",
          "Stopping/pausing rules and data safety monitoring arrangements",
          "Statistical considerations and sample size rationale",
          "Names of all investigators and clinical facilities where known (or commitment to provide)"
        ],
        "generationPrompt": "Write the clinical protocol for {{SPONSOR}}'s {{PHASE}} study of {{PRODUCT_NAME}} in {{INDICATION}}, following ICH E6(R2): objectives/endpoints, design, eligibility, dosing with starting-dose and escalation justification, schedule of assessments, adverse-event and safety monitoring plan with stopping rules, and statistical considerations. Describe required content and where data belong; do not invent results. Ensure alignment with the IB reference safety information."
      },
      {
        "code": "PREV-HUMAN-EXP",
        "title": "Previous Human Experience with the Investigational Drug",
        "required": true,
        "contentType": "narrative",
        "guidance": "Integrated summary of prior human experience and worldwide marketing/regulatory history, per 21 CFR 312.23(a)(9).",
        "authoringGuidance": "This section tells the reviewer what is already known about the drug in humans, integrating prior clinical use, any foreign marketing experience, and safety data across countries so that the benefit-risk assessment reflects all available evidence. When no human experience exists (a true first-in-human program), the section should state that plainly and cross-reference the nonclinical basis for proceeding rather than being omitted. Under 312.23(a)(9)(iii) the sponsor must list any countries where the drug has been marketed and any where it was withdrawn for safety or efficacy reasons, which reviewers treat as a mandatory safety disclosure. An acceptable section is a candid, integrated summary (not a data dump), consistent with the IB and the general investigational plan, and explicit about the source and limitations of any prior human data.",
        "keyContentElements": [
          "Statement of whether the drug has prior human experience (or that this is first-in-human)",
          "Integrated summary of prior clinical PK, safety, and efficacy data, if any",
          "List of countries where the drug is or has been marketed",
          "Any countries where the drug was withdrawn for safety or effectiveness reasons",
          "Relevant published literature and cross-references to full reports in Module 5",
          "Description of the population(s) previously exposed and doses/durations",
          "Known adverse reactions and their management from prior experience",
          "Cross-reference to nonclinical basis when human experience is absent"
        ],
        "generationPrompt": "Summarize previous human experience with {{PRODUCT_NAME}} for {{SPONSOR}}'s IND in {{INDICATION}} at {{PHASE}}, per 21 CFR 312.23(a)(9). Integrate any prior clinical safety/efficacy/PK data, list countries of marketing and any safety/efficacy withdrawals, and cross-reference literature and Module 5 reports; if this is first-in-human, state so and point to the nonclinical basis. Do not fabricate human data."
      }
    ],
    "registryId": "US_IND",
    "timing": "Submit at least 30 calendar days before the sponsor intends to begin the first clinical investigation; the study may not be initiated until the 30-day review period has elapsed without FDA imposing a clinical hold under 21 CFR 312.40(b) and 312.42.",
    "ctdSectionCodes": [
      "1.1",
      "1.2",
      "1.12.14",
      "1.14.4",
      "1.20",
      "2.3",
      "2.4",
      "2.5",
      "2.6",
      "2.7",
      "3.2.S",
      "3.2.P",
      "3.2.A",
      "4.2.1",
      "4.2.2",
      "4.2.3",
      "5.3.5.1",
      "5.3.7"
    ]
  },
  {
    "id": "ind_protocol_amendment",
    "label": "IND Protocol Amendment",
    "category": "amendment",
    "family": "IND",
    "agency": "FDA",
    "description": "Amendment to an existing IND submitting a new protocol or a change to an existing protocol under 21 CFR 312.30. Used to add a new study to the IND, to change an existing protocol in a way that significantly affects subject safety or the scope of the investigation, or to add a new investigator to an existing protocol. The submission provides the protocol or the specific change together with the sponsor's justification and, where required, the relevant supporting information so FDA can assess the impact on subject safety before the change is implemented.",
    "regulatoryBasis": [
      "21 CFR 312.30 (Protocol amendments)",
      "21 CFR 312.23(a)(6) (Protocol content)",
      "21 CFR 312.30(a) (New protocol)",
      "21 CFR 312.30(b) (Changes in a protocol)",
      "21 CFR 312.30(c) (New investigator)",
      "ICH E6(R2) Good Clinical Practice"
    ],
    "components": [
      {
        "code": "COVER-LETTER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal identifying the submission as a protocol amendment under 21 CFR 312.30 and specifying the type.",
        "authoringGuidance": "The cover letter must state the IND number, the serial number, and precisely which category of 312.30 the amendment falls under (new protocol, change in protocol, or new investigator), because that determines how FDA triages it and whether prior implementation is permissible. Reviewers use it to understand at a glance the nature and safety impact of the change and to locate the affected protocol by number and title. It should note whether the change was made to eliminate an immediate hazard (invoking 312.30(b)(2)(ii)) and reference any related prior correspondence or agreements. An acceptable cover letter is specific about the change, cites the correct regulatory basis, and provides the regulatory contact.",
        "keyContentElements": [
          "IND number and serial number",
          "Statement identifying the submission as a protocol amendment under 21 CFR 312.30",
          "Type of amendment: new protocol, change in protocol, or new investigator",
          "Affected protocol number and title",
          "Brief description of the change and its purpose",
          "Whether the change eliminates an immediate hazard (312.30(b)(2)(ii)), if applicable",
          "Cross-reference to related prior submissions/correspondence",
          "Regulatory contact with phone and email"
        ],
        "generationPrompt": "Draft a cover letter for {{SPONSOR}} transmitting an IND protocol amendment for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. State the IND and serial numbers, identify the 21 CFR 312.30 category (new protocol / change in protocol / new investigator), name the affected protocol, describe the change and its purpose, and give the regulatory contact."
      },
      {
        "code": "FORM-FDA-1571",
        "title": "Form FDA 1571",
        "required": true,
        "contentType": "form",
        "guidance": "Required administrative cover form for every submission to the IND, including protocol amendments (21 CFR 312.23(a)(1)).",
        "authoringGuidance": "Every submission to an IND is filed under a Form FDA 1571, and for a protocol amendment the form ties the change to the existing IND number and assigns the next serial number in sequence. The item 11 contents checklist should be marked to reflect that a protocol amendment is enclosed and to point to the amended protocol and any supporting information. Reviewers rely on the 1571 to confirm the sponsor's continuing safety-monitoring and safety-review responsibilities remain assigned. An acceptable 1571 is consistent with the cover letter's amendment type, has the correct IND/serial numbers, and carries an authorized signature.",
        "keyContentElements": [
          "Existing IND number and correct serial number",
          "Sponsor identification and date",
          "Drug name and phase",
          "Item 11 checklist marked for protocol amendment content",
          "Identification of the amended/new protocol location",
          "Persons responsible for monitoring and for safety review",
          "Authorized signature and commitment statements"
        ],
        "generationPrompt": "Complete Form FDA 1571 for {{SPONSOR}}'s protocol amendment to the IND for {{PRODUCT_NAME}} in {{INDICATION}}. Reference the existing IND number, assign the next serial number, mark item 11 for the protocol amendment content, and include the responsible-person and signature blocks."
      },
      {
        "code": "PROTOCOL-OR-CHANGE",
        "title": "New Protocol or Description of Protocol Change",
        "required": true,
        "contentType": "mixed",
        "guidance": "The new protocol in full, or a clear description of the specific change to an existing protocol, per 21 CFR 312.30(a)–(b).",
        "authoringGuidance": "For a new protocol this component is a complete protocol meeting 312.23(a)(6), placed in Module 5.3.5, so a reviewer can assess subject safety for the new study independently. For a change to an existing protocol, the sponsor must clearly describe the change and its rationale and, per 312.30(b)(1), explain any new or increased risk—reviewers focus on changes that significantly affect subject safety, the scope of the investigation, or the scientific quality of the study. A redline or side-by-side showing old versus new language, plus an updated protocol version, makes the change auditable and speeds review. An acceptable submission unambiguously isolates what changed, justifies it with data or clinical rationale, and confirms IRB approval status where required before implementation.",
        "keyContentElements": [
          "Complete new protocol (for 312.30(a)) or clean and redlined amended protocol (for 312.30(b))",
          "Clear statement of exactly what changed and why",
          "Assessment of any new or increased risk to subjects and mitigation",
          "Updated eligibility, dosing, or assessment schedule reflecting the change",
          "Impact on statistical considerations or endpoints, if any",
          "Confirmation of IRB approval status (or plan to obtain it) for the change",
          "Cross-reference to updated IB, informed consent, or safety information as needed",
          "Protocol version number and date"
        ],
        "generationPrompt": "Prepare the protocol-amendment content for {{SPONSOR}}'s {{PRODUCT_NAME}} study in {{INDICATION}} at {{PHASE}}: either a full new protocol per ICH E6(R2)/21 CFR 312.23(a)(6), or a redlined description of the change to an existing protocol per 21 CFR 312.30(b) with rationale and an assessment of any new or increased subject risk. State IRB approval status and cross-reference updated IB/consent. Do not fabricate data."
      },
      {
        "code": "SUPPORTING-INFO",
        "title": "Supporting Information and Safety Justification",
        "required": false,
        "contentType": "mixed",
        "guidance": "Additional technical/clinical information supporting the amendment when the change is driven by new data (312.30(b)(1)).",
        "authoringGuidance": "When a protocol change is prompted by new nonclinical, clinical, or CMC information, this component supplies the supporting data or cross-references so the reviewer can see the basis for the change without hunting through the IND history. It is where the sponsor documents, for example, updated toxicology justifying a higher dose, emerging safety data motivating tighter monitoring, or PK results supporting a revised schedule. Reviewers expect the justification to be proportionate to the safety impact of the change. An acceptable submission cites specific data (with location in Module 4/5) rather than asserting adequacy in the abstract, and is omitted only when the change is genuinely administrative.",
        "keyContentElements": [
          "Summary of the new data motivating the change (nonclinical, clinical, or CMC)",
          "Cross-references to full reports in the relevant CTD modules",
          "Benefit-risk rationale linking the data to the specific change",
          "Any updated Investigator's Brochure or reference safety information",
          "Impact assessment on ongoing subjects, if a study is in progress",
          "Statement that no supporting data are needed, when the change is administrative"
        ],
        "generationPrompt": "Provide the supporting information and safety justification for {{SPONSOR}}'s protocol amendment to {{PRODUCT_NAME}} in {{INDICATION}}, summarizing any new nonclinical/clinical/CMC data behind the change, cross-referencing the full reports in the CTD modules, and giving the benefit-risk rationale. If the change is administrative, state that no supporting data are required. Do not invent data."
      }
    ],
    "registryId": "US_IND_AMENDMENT",
    "timing": "A new protocol may be submitted and its investigation begun once the protocol is submitted to FDA and approved by an IRB (312.30(a)). Changes affecting safety must be submitted before implementation, except that a change intended to eliminate an apparent immediate hazard may be implemented immediately with notification as soon as possible (312.30(b)(2)(ii)). A new investigator must be added within 30 days of being added to the study.",
    "ctdSectionCodes": [
      "5.3.5.1",
      "1.11.3"
    ]
  },
  {
    "id": "ind_information_amendment",
    "label": "IND Information Amendment",
    "category": "amendment",
    "family": "IND",
    "agency": "FDA",
    "description": "Amendment submitting essential information to an IND that is not within the scope of a protocol amendment, IND safety report, or annual report, per 21 CFR 312.31. Typical uses include new toxicology, chemistry/manufacturing, or pharmacology data; a report of the discontinuation of a clinical investigation; and other information the sponsor believes may be important to the drug's safety or the conduct of the investigation. The submission packages the new information with a summary of its significance so FDA can integrate it into the ongoing review of the IND.",
    "regulatoryBasis": [
      "21 CFR 312.31 (Information amendments)",
      "21 CFR 312.31(a) (Types of information)",
      "21 CFR 312.31(b) (Content and format)",
      "21 CFR 312.23 (IND content and format, for referenced technical sections)",
      "ICH M4 (Common Technical Document)"
    ],
    "components": [
      {
        "code": "COVER-LETTER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal identifying the submission as an information amendment under 21 CFR 312.31 and describing the information's nature.",
        "authoringGuidance": "The cover letter identifies the IND and serial numbers and states that the submission is an information amendment under 312.31, specifying the type of information (nonclinical, chemistry, pharmacology, discontinuation of a study, or other). Because information amendments vary widely in safety significance, the letter should tell the reviewer up front whether the information bears on subject safety and whether any action by the sponsor (e.g., protocol change) has been or will be taken. It should reference related submissions and provide the regulatory contact. An acceptable letter is specific about the content type and its significance and cites 312.31 correctly.",
        "keyContentElements": [
          "IND number and serial number",
          "Statement identifying an information amendment under 21 CFR 312.31",
          "Category of information (nonclinical, CMC, pharmacology, study discontinuation, other)",
          "Brief description of the information and its significance to safety or conduct",
          "Any related actions taken or planned (e.g., protocol amendment)",
          "Cross-references to related submissions",
          "Regulatory contact with phone and email"
        ],
        "generationPrompt": "Draft a cover letter for {{SPONSOR}} transmitting an IND information amendment for {{PRODUCT_NAME}} in {{INDICATION}}. Give the IND and serial numbers, identify the 21 CFR 312.31 category of information, summarize its significance to subject safety or study conduct, note any related actions, and provide the regulatory contact."
      },
      {
        "code": "FORM-FDA-1571",
        "title": "Form FDA 1571",
        "required": true,
        "contentType": "form",
        "guidance": "Required administrative cover form for the information amendment (21 CFR 312.23(a)(1)).",
        "authoringGuidance": "The 1571 files the information amendment under the existing IND with the next serial number and, via item 11, directs the reviewer to the technical section(s) supplied. Because information amendments often carry substantive nonclinical or CMC data, the checklist should map precisely to the CTD locations of the new content. Reviewers confirm the safety-monitoring and safety-review responsibilities remain assigned. An acceptable 1571 is consistent with the cover letter, has correct IND/serial numbers, and is signed by an authorized official.",
        "keyContentElements": [
          "Existing IND number and correct serial number",
          "Sponsor identification and date",
          "Drug name and phase",
          "Item 11 checklist marked for the information amendment content",
          "Pointers to the CTD section(s) containing the new information",
          "Persons responsible for monitoring and safety review",
          "Authorized signature"
        ],
        "generationPrompt": "Complete Form FDA 1571 for {{SPONSOR}}'s information amendment to the IND for {{PRODUCT_NAME}} in {{INDICATION}}, referencing the existing IND number, assigning the next serial number, marking item 11 for the information amendment content and its CTD location, and including the signature block."
      },
      {
        "code": "INFO-SUMMARY",
        "title": "Summary of New Information and Its Significance",
        "required": true,
        "contentType": "narrative",
        "guidance": "Narrative summary describing the new information and why it matters, per 21 CFR 312.31(b).",
        "authoringGuidance": "Section 312.31(b) requires the amendment to state in a cover the nature of the amendment and, where the information relates to safety, an assessment of its significance—this summary is that assessment. It orients the reviewer to what is new (e.g., a completed 3-month toxicology study, a manufacturing site change, a chronic tox finding) and interprets its impact on the benefit-risk of the ongoing investigation. Reviewers expect a candid interpretation, including whether the sponsor considers any protocol or IB change warranted. An acceptable summary is concise, data-referenced, and explicit about safety implications rather than a neutral recitation.",
        "keyContentElements": [
          "Concise description of the new information being submitted",
          "The scientific/technical context (why the study or change was done)",
          "Key findings and their interpretation",
          "Assessment of significance to subject safety and study conduct",
          "Whether any protocol, IB, or informed-consent changes are warranted",
          "Cross-references to the full data in the relevant CTD modules",
          "Any planned follow-up actions or additional studies"
        ],
        "generationPrompt": "Write the summary of new information for {{SPONSOR}}'s information amendment on {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}: describe the new nonclinical/CMC/pharmacology information or study discontinuation, interpret its key findings, assess significance to subject safety per 21 CFR 312.31, and state whether protocol/IB changes are warranted, cross-referencing the CTD modules. Do not fabricate findings."
      },
      {
        "code": "TECHNICAL-DATA",
        "title": "Supporting Technical Data (Nonclinical / CMC / Pharmacology)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The actual new technical reports or data, placed in the appropriate CTD module (Module 3, 4, or 5).",
        "authoringGuidance": "This component holds the substantive content of the amendment—full study reports, updated CMC sections, or pharmacology data—formatted to the CTD so it integrates with the existing IND dossier rather than sitting as a loose attachment. For nonclinical data it belongs in Module 4 with the appropriate 4.2 subsection; for chemistry/manufacturing it updates Module 3.2.S/3.2.P; for clinical pharmacology it belongs in Module 5. Reviewers assess these against the same standards as the original IND sections, so completeness, GLP/GMP status, and consistency with prior submissions matter. An acceptable submission places data in the correct CTD location, is complete for the topic, and reconciles with the summary and any related protocol changes.",
        "keyContentElements": [
          "Full nonclinical study report(s) in Module 4 with study design, methods, and results",
          "Updated CMC content in Module 3.2.S/3.2.P where applicable (with change rationale)",
          "Clinical pharmacology data in Module 5 where applicable",
          "GLP/GMP compliance status of the data as relevant",
          "Comparability or impact assessment for manufacturing changes",
          "Consistency check against prior IND submissions",
          "Correct CTD placement and granularity"
        ],
        "generationPrompt": "Assemble the supporting technical data for {{SPONSOR}}'s information amendment on {{PRODUCT_NAME}}: place new nonclinical reports in Module 4, CMC updates in Module 3.2.S/3.2.P with change rationale and comparability, or clinical pharmacology in Module 5 as applicable, noting GLP/GMP status. Describe required content and CTD placement; do not invent study results or product facts."
      }
    ],
    "registryId": "US_IND_AMENDMENT",
    "timing": "Submitted as necessary but, to the extent feasible, not more than every 30 days (21 CFR 312.31(b)). Information important to the safety of the investigation should be submitted promptly rather than batched.",
    "ctdSectionCodes": [
      "3.2.S",
      "3.2.P",
      "4.2.1",
      "4.2.2",
      "4.2.3",
      "5.3.1",
      "5.3.3"
    ]
  },
  {
    "id": "ind_cmc_amendment",
    "label": "IND CMC Information Amendment",
    "category": "amendment",
    "family": "IND",
    "agency": "FDA",
    "description": "Chemistry, Manufacturing, and Controls-specific information amendment to an IND submitted under 21 CFR 312.31, updating Module 3 to reflect new or changed information on the drug substance and drug product. Typical triggers include a new manufacturing site or process, updated specifications or analytical methods, stability updates, a new batch/lot for clinical supply, or a formulation change. The submission provides the revised CMC content together with an assessment of product quality and any impact on subject safety so FDA can confirm the material to be used clinically remains adequately characterized and controlled.",
    "regulatoryBasis": [
      "21 CFR 312.31 (Information amendments)",
      "21 CFR 312.23(a)(7) (Chemistry, manufacturing, and control information)",
      "21 CFR 312.23(a)(7)(i) (Emphasis on identification, safety, and control)",
      "FDA Guidance for Industry: INDs for Phase 2 and Phase 3 Studies — Chemistry, Manufacturing, and Controls Information (2003)",
      "FDA Guidance for Industry: Content and Format of INDs for Phase 1 Studies (1995)",
      "ICH M4Q (CTD Quality)",
      "ICH Q1A(R2) Stability, ICH Q3A/Q3B Impurities, ICH Q6A/Q6B Specifications"
    ],
    "components": [
      {
        "code": "COVER-LETTER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal identifying a CMC information amendment under 21 CFR 312.31 and summarizing the manufacturing change.",
        "authoringGuidance": "The cover letter identifies the IND and serial numbers and states that the submission is a CMC information amendment, briefly naming the change (e.g., new drug substance manufacturer, revised drug product specification, extended stability). Because CMC changes can bear on the quality and safety of the material given to subjects, the letter should flag whether the change affects clinical supply currently in use and whether a comparability assessment is included. It should reference the affected Module 3 sections and the regulatory contact. An acceptable letter is specific about the change and its clinical-supply impact and cites 312.31 correctly.",
        "keyContentElements": [
          "IND number and serial number",
          "Statement identifying a CMC information amendment under 21 CFR 312.31",
          "Concise description of the manufacturing/control change",
          "Whether the change affects clinical material currently in use",
          "Note of any comparability assessment included",
          "Affected Module 3 sections",
          "Regulatory contact with phone and email"
        ],
        "generationPrompt": "Draft a cover letter for {{SPONSOR}} transmitting a CMC information amendment to the IND for {{PRODUCT_NAME}} in {{INDICATION}}. Provide the IND and serial numbers, describe the manufacturing or control change, state whether it affects clinical supply in use, note any comparability assessment, list the affected Module 3 sections, and give the regulatory contact."
      },
      {
        "code": "FORM-FDA-1571",
        "title": "Form FDA 1571",
        "required": true,
        "contentType": "form",
        "guidance": "Required administrative cover form for the CMC amendment (21 CFR 312.23(a)(1)).",
        "authoringGuidance": "The 1571 files the CMC amendment under the existing IND with the next serial number and directs the reviewer, via item 11, to the updated Module 3 content. For CMC amendments the checklist and pointers should isolate the drug substance versus drug product sections affected so the quality reviewer can find the change efficiently. An acceptable 1571 is consistent with the cover letter, has correct IND/serial numbers, and is signed by an authorized official.",
        "keyContentElements": [
          "Existing IND number and correct serial number",
          "Sponsor identification and date",
          "Drug name and phase",
          "Item 11 checklist marked for CMC amendment content",
          "Pointers to affected Module 3.2.S and/or 3.2.P sections",
          "Persons responsible for monitoring and safety review",
          "Authorized signature"
        ],
        "generationPrompt": "Complete Form FDA 1571 for {{SPONSOR}}'s CMC information amendment to the IND for {{PRODUCT_NAME}} in {{INDICATION}}, referencing the existing IND number, assigning the next serial number, marking item 11 for the CMC content and pointing to the affected Module 3.2.S/3.2.P sections, with the signature block."
      },
      {
        "code": "CMC-CHANGE-SUMMARY",
        "title": "Summary of CMC Change and Quality/Safety Impact",
        "required": true,
        "contentType": "narrative",
        "guidance": "Narrative describing the CMC change, its rationale, and its impact on product quality and subject safety.",
        "authoringGuidance": "This summary tells the quality reviewer what changed, why, and what it means for the identity, strength, quality, purity, and potency of the clinical material—the attributes 312.23(a)(7)(i) emphasizes for INDs. It should explicitly address whether the change could introduce a new impurity or degradant, alter the specification, or affect the material already administered to subjects, and it should state the comparability conclusion. Reviewers expect a phase-appropriate assessment: earlier phases tolerate less complete characterization but still require that safety-relevant attributes be controlled. An acceptable summary links the change to specific quality data and gives a clear, justified conclusion that the material remains suitable for clinical use.",
        "keyContentElements": [
          "Description of the change (site, process, formulation, specification, method, or supplier)",
          "Rationale and timing of the change",
          "Affected quality attributes (identity, assay, impurities, potency, etc.)",
          "Comparability assessment between pre- and post-change material",
          "Impact on impurity/degradation profile and specifications",
          "Impact on stability and assigned retest/expiry period",
          "Assessment of any subject-safety impact and whether clinical supply is affected",
          "Conclusion that the material remains suitable for the intended clinical use",
          "Cross-references to the updated Module 3 data"
        ],
        "generationPrompt": "Write the CMC change summary for {{SPONSOR}}'s amendment on {{PRODUCT_NAME}} at {{PHASE}}: describe the manufacturing/control change, the affected quality attributes, the comparability assessment, impacts on impurities/stability/specifications, and any subject-safety impact, concluding whether the material remains suitable for clinical use. Cross-reference Module 3 and keep it phase-appropriate. Do not fabricate product data."
      },
      {
        "code": "MODULE3-UPDATE",
        "title": "Updated Module 3 Quality Content (Drug Substance / Drug Product)",
        "required": true,
        "contentType": "mixed",
        "guidance": "Revised CTD Module 3.2.S and/or 3.2.P sections reflecting the change, with supporting data including specifications, batch analysis, impurity, and stability tables.",
        "authoringGuidance": "This component supplies the actual revised quality documentation—clean and, where helpful, redlined—so the change is fully documented in the dossier and the affected 3.2.S (drug substance) and 3.2.P (drug product) subsections are internally consistent. For a new process or site it includes the manufacturing description, controls, and validation status; for a specification change it includes the new specification with justification and updated method validation; for stability it includes updated data supporting the retest/expiry period. Reviewers hold this content to ICH Q-series expectations (Q1A stability, Q3A/Q3B impurities, Q6A/Q6B specifications) at a phase-appropriate level, and expect the substantiating datasets—pre/post-change specification tables, batch analysis results, impurity/degradant profiles, and stability tables. An acceptable submission places content in the correct 3.2.S/3.2.P subsections, is internally consistent, and includes the batch analysis and stability tables that substantiate the change.",
        "keyContentElements": [
          "Revised 3.2.S drug substance sections affected (manufacture, control of DS, specification, stability)",
          "Revised 3.2.P drug product sections affected (manufacture, control of DP, specification, stability)",
          "Updated specifications with acceptance criteria and justification (ICH Q6A/Q6B)",
          "Analytical procedures and validation/verification for changed methods",
          "Batch analysis data for representative post-change lots",
          "Impurity and degradation data (ICH Q3A/Q3B) reflecting the change",
          "Stability data and protocol supporting retest/expiry (ICH Q1A(R2))",
          "Manufacturing process description and in-process controls where changed",
          "Comparability data package where a significant change is made",
          "Expected reviewer datasets: pre/post-change specification table, batch analysis results, impurity/degradant profile table, and stability tables supporting retest/expiry"
        ],
        "generationPrompt": "Assemble the updated Module 3 quality content for {{SPONSOR}}'s CMC amendment to {{PRODUCT_NAME}}: revise the affected 3.2.S and/or 3.2.P subsections (manufacture, controls, specifications, stability), update specifications and method validation, and include batch analysis, impurity, and stability tables supporting the change per ICH Q1A/Q3A/Q3B/Q6A. Describe required content and CTD placement; do not invent analytical results."
      }
    ],
    "registryId": "US_IND_AMENDMENT",
    "timing": "Submitted as needed, and to the extent feasible not more than every 30 days (21 CFR 312.31(b)); changes that could affect the safety of subjects (e.g., a new impurity, a significant manufacturing change) should be submitted before the affected clinical material is used.",
    "ctdSectionCodes": [
      "3.2.S.2",
      "3.2.S.3",
      "3.2.S.4",
      "3.2.S.7",
      "3.2.P.2",
      "3.2.P.3",
      "3.2.P.5",
      "3.2.P.8",
      "3.2.A"
    ]
  },
  {
    "id": "ind_response_to_clinical_hold",
    "label": "IND Complete Response to Clinical Hold",
    "category": "amendment",
    "family": "IND",
    "agency": "FDA",
    "description": "Sponsor's complete response to a clinical hold issued by FDA on an IND under 21 CFR 312.42, submitted as an information/protocol amendment that addresses every deficiency identified in the clinical hold order. The submission provides a point-by-point response to each hold issue with the supporting data, analyses, or protocol/IB/CMC revisions needed to resolve it, so that FDA can determine within 30 days of receipt of the complete response whether the hold may be lifted and the affected investigation(s) resumed or begun.",
    "regulatoryBasis": [
      "21 CFR 312.42 (Clinical holds and requests for modification)",
      "21 CFR 312.42(a) (General clinical hold authority)",
      "21 CFR 312.42(b) (Grounds for imposition of clinical hold)",
      "21 CFR 312.42(e) (Resumption of a clinical investigation)",
      "21 CFR 312.44 (Termination)",
      "FDA Guidance for Industry: Submitting and Reviewing Complete Responses to Clinical Holds (2000)",
      "ICH M4 (Common Technical Document)"
    ],
    "components": [
      {
        "code": "COVER-LETTER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal identifying the submission as a complete response to a clinical hold under 21 CFR 312.42.",
        "authoringGuidance": "The cover letter must clearly state that the submission is a complete response to the clinical hold, referencing the IND number, the serial number, and the date of FDA's clinical hold letter, because that designation starts the 30-day review clock under 312.42(e). It should assert that the sponsor has addressed all deficiencies identified in the hold order and provide a brief roadmap to where each is answered. Reviewers use the letter to confirm the submission is intended as the complete response (not a partial update) and to locate the point-by-point responses. An acceptable letter is unambiguous about 'complete response' status, references the hold letter precisely, and gives the regulatory contact.",
        "keyContentElements": [
          "IND number and serial number",
          "Explicit statement that this is a complete response to the clinical hold under 21 CFR 312.42",
          "Reference to FDA's clinical hold letter by date",
          "Assertion that all identified deficiencies are addressed",
          "High-level roadmap to the point-by-point responses",
          "Confirmation that the affected investigation remains on hold pending FDA notification",
          "Regulatory contact with phone and email"
        ],
        "generationPrompt": "Draft a cover letter for {{SPONSOR}} transmitting a complete response to a clinical hold on the IND for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. Reference the IND/serial numbers and FDA's clinical hold letter date, state explicitly that this is the complete response addressing all deficiencies under 21 CFR 312.42, provide a roadmap to the responses, and give the regulatory contact."
      },
      {
        "code": "FORM-FDA-1571",
        "title": "Form FDA 1571",
        "required": true,
        "contentType": "form",
        "guidance": "Required administrative cover form for the complete response submission (21 CFR 312.23(a)(1)).",
        "authoringGuidance": "The 1571 files the complete response under the existing IND with the next serial number and, through item 11, points the reviewer to the response document and any revised protocol, IB, or CMC sections. Because the 30-day clock depends on the submission being recognized as a complete response, the 1571 and cover letter must be consistent on that point. An acceptable 1571 has correct IND/serial numbers, item 11 marked for the relevant amended content, and an authorized signature.",
        "keyContentElements": [
          "Existing IND number and correct serial number",
          "Sponsor identification and date",
          "Drug name and phase",
          "Item 11 checklist marked for the response content and any revised sections",
          "Pointers to revised protocol/IB/CMC/nonclinical sections",
          "Persons responsible for monitoring and safety review",
          "Authorized signature"
        ],
        "generationPrompt": "Complete Form FDA 1571 for {{SPONSOR}}'s complete response to a clinical hold on the IND for {{PRODUCT_NAME}} in {{INDICATION}}, referencing the existing IND number, assigning the next serial number, marking item 11 for the response and any revised protocol/IB/CMC/nonclinical content, and including the signature block."
      },
      {
        "code": "POINT-BY-POINT-RESPONSE",
        "title": "Point-by-Point Response to Clinical Hold Issues",
        "required": true,
        "contentType": "mixed",
        "guidance": "Structured response addressing each deficiency in the FDA clinical hold order, per 21 CFR 312.42 and the 2000 complete-response guidance.",
        "authoringGuidance": "This is the core of the submission: it restates each FDA-identified deficiency verbatim and provides the sponsor's response, the supporting rationale, and a pointer to the data or revised documents that resolve it, so a reviewer can check off every hold issue as answered. FDA's 2000 guidance and 312.42(e) make clear the 30-day clock runs only when the response is complete, so leaving any issue unaddressed—or addressing it partially—forfeits the timeline and is the single most common failure. The response must map to the exact grounds for the hold (e.g., unreasonable/significant risk of illness or injury, insufficient information to assess risk, deficient IB, unqualified investigators under 312.42(b)) and demonstrate that each ground no longer applies. An acceptable response is comprehensive, uses the FDA's own issue numbering, cites specific data and revised documents by CTD location, and states affirmatively that all deficiencies are resolved.",
        "keyContentElements": [
          "Verbatim restatement of each FDA clinical hold deficiency, numbered as FDA numbered them",
          "Sponsor's specific response to each deficiency with scientific rationale",
          "Cross-reference to the supporting data or analysis resolving each issue (by CTD location)",
          "Identification of any revised protocol, IB, informed consent, or CMC content and what changed",
          "New nonclinical or clinical analyses generated to address the hold, if any",
          "Explicit statement that each ground for the hold under 312.42(b) has been addressed",
          "Benefit-risk rationale supporting resumption/initiation of the investigation",
          "Confirmation that all identified deficiencies are fully addressed (complete response)"
        ],
        "generationPrompt": "Write the point-by-point response to the clinical hold on {{SPONSOR}}'s IND for {{PRODUCT_NAME}} in {{INDICATION}} at {{PHASE}}. For each FDA-identified deficiency, restate it using FDA's numbering, give the sponsor's response and rationale, cross-reference the supporting data or revised protocol/IB/CMC by CTD location, and show how each ground under 21 CFR 312.42(b) is resolved; conclude that all deficiencies are fully addressed. Describe where data belong; do not fabricate results."
      },
      {
        "code": "REVISED-DOCUMENTS",
        "title": "Revised Protocol / IB / CMC / Nonclinical Documents",
        "required": false,
        "contentType": "mixed",
        "guidance": "Clean and redlined revised documents implementing the changes needed to resolve the hold.",
        "authoringGuidance": "When resolving a hold requires changes to the protocol, Investigator's Brochure, informed consent, or CMC/nonclinical sections, those revised documents are provided here so the corrective actions are auditable and integrated into the dossier. Providing both clean and redlined versions lets the reviewer verify that the changes described in the point-by-point response were actually made and are internally consistent. Reviewers check that the revisions fully implement the sponsor's stated corrective actions—e.g., a revised starting dose, added stopping rules, updated reference safety information, or a new specification. An acceptable submission includes complete revised documents (not just excerpts), version-controlled, that match the corrective actions in the response; it is omitted only when the hold is resolved by data/analysis alone with no document changes.",
        "keyContentElements": [
          "Revised protocol (clean and redlined) implementing safety changes",
          "Updated Investigator's Brochure with revised reference safety information, if changed",
          "Revised informed consent reflecting new risk information, if applicable",
          "Updated CMC (Module 3) sections resolving quality-based hold issues",
          "New or revised nonclinical study reports (Module 4) addressing safety questions",
          "Version numbers and dates for all revised documents",
          "Statement of no document changes when the hold is resolved by data alone"
        ],
        "generationPrompt": "Prepare the revised documents implementing corrective actions for {{SPONSOR}}'s clinical hold response on {{PRODUCT_NAME}}: provide clean and redlined revised protocol, updated IB/reference safety information, revised informed consent, or updated Module 3/Module 4 content as needed to resolve each hold issue, version-controlled and consistent with the point-by-point response. If no document changes are needed, state that the hold is resolved by data/analysis alone. Do not invent study results."
      }
    ],
    "registryId": "US_IND_AMENDMENT",
    "timing": "Submitted after the sponsor has addressed all clinical hold issues. Under 21 CFR 312.42(e) FDA must respond within 30 calendar days of receiving the sponsor's complete response (a submission that addresses all identified deficiencies); the investigation may resume only after FDA notifies the sponsor that the hold is removed.",
    "ctdSectionCodes": [
      "1.11.3",
      "3.2.S",
      "3.2.P",
      "4.2.3",
      "5.3.5.1"
    ]
  },
  {
    "id": "ind_safety_report",
    "label": "IND Safety Report (Expedited 7/15-Day)",
    "category": "safety",
    "family": "IND",
    "agency": "FDA",
    "description": "An expedited safety report submitted to the reviewing division under an active IND to notify FDA (and all participating investigators) of a serious and unexpected suspected adverse reaction, a finding from clinical or nonclinical studies suggesting a significant human risk, or a clinically important increase in the rate of a serious suspected adverse reaction over that listed in the protocol or Investigator Brochure. The trigger for an individual case is a suspected adverse reaction (an adverse event for which there is a reasonable possibility the drug caused the event) that is both serious and unexpected. It is a stand-alone, event-driven administrative submission — not a CTD dossier section — transmitted on a statutory clock.",
    "regulatoryBasis": [
      "21 CFR 312.32 (IND safety reporting)",
      "21 CFR 312.32(a) (definitions: adverse event, suspected adverse reaction, serious, unexpected, life-threatening)",
      "21 CFR 312.32(c)(1) (what to report and when)",
      "21 CFR 312.32(d) (follow-up)",
      "21 CFR 312.55 (Investigator Brochure / informing investigators)",
      "21 CFR 312.64(b) (investigator reporting of adverse events to sponsor)",
      "FDA Guidance for Industry: Safety Reporting Requirements for INDs and BA/BE Studies (December 2012)",
      "FDA Guidance: Safety Assessment for IND Safety Reporting (December 2015, draft)",
      "ICH E2A: Clinical Safety Data Management — Definitions and Standards for Expedited Reporting",
      "ICH E2B(R3): Electronic Transmission of Individual Case Safety Reports"
    ],
    "components": [
      {
        "code": "safety.cover",
        "title": "IND Safety Report Cover Letter / Transmittal (with Form FDA 1571)",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 312.32(c); 21 CFR 312.23(a)(1) (Form FDA 1571); FDA Safety Reporting Guidance (Dec 2012)",
        "authoringGuidance": "The cover letter transmits the expedited report to the reviewing division and orients the reviewer within seconds: it must prominently identify the submission as an IND Safety Report and state which reporting clock is being met (7-day for fatal/life-threatening, 15-day otherwise). An FDA reviewer reads it first to triage severity and to confirm the sponsor made the two required determinations — serious and unexpected, with a reasonable possibility of causal relationship. It is acceptable when it names the specific basis under 312.32(c)(1), records day-zero and the resulting due date, and cross-references prior related reports so the reviewer can see an emerging signal rather than an isolated case. Common deficiencies that draw FDA information requests: failing to state day-zero (making timeliness unverifiable), omitting the reporting category, burying or omitting the causality determination, and inconsistent event characterization between the letter and the attached ICSR.",
        "keyContentElements": [
          "IND number, product name (established/proprietary), and sponsor of record",
          "Explicit heading 'IND Safety Report' and the reporting category invoked (7-day fatal/life-threatening vs 15-day serious unexpected)",
          "Day-zero date (date sponsor first received information qualifying the case) and calculated due date demonstrating timeliness",
          "Submission serial number and cross-reference to related prior IND safety reports (same event term / same signal)",
          "Whether this is an initial report or a follow-up (and follow-up number)",
          "One-line clinical characterization of the reported event(s) with MedDRA Preferred Term(s)",
          "Statement of the source form used (MedWatch 3500A or CIOMS I) and format (paper/eCTD/E2B)",
          "Sponsor safety physician / pharmacovigilance contact name, telephone, and email",
          "Confirmation that participating investigators and IRBs are being notified per 312.32(c)(1) and 312.55"
        ],
        "generationPrompt": "Draft an IND Safety Report cover letter for {{SPONSOR}}'s {{PRODUCT_NAME}} (IND for {{INDICATION}}, {{PHASE}}). Prominently label it an IND Safety Report, state whether the 7-day or 15-day clock applies, and include IND number, day-zero date and due date, serial number, initial-vs-follow-up status, a one-line MedDRA-coded event characterization, the source form used, and the sponsor safety contact. Do not invent case facts — insert bracketed placeholders for event term, dates, and subject identifiers. Confirm investigator/IRB notification per 21 CFR 312.32(c)(1) and 312.55."
      },
      {
        "code": "safety.icsr",
        "title": "Individual Case Safety Report (MedWatch Form FDA 3500A or CIOMS I)",
        "required": true,
        "contentType": "form",
        "guidance": "21 CFR 312.32(c)(1); FDA Safety Reporting Guidance (Dec 2012); ICH E2A; ICH E2B(R3) for electronic submission",
        "authoringGuidance": "The ICSR is the structured case itself — the four minimum-valid-case elements (identifiable patient, identifiable reporter, a suspect drug, and a suspect adverse reaction) plus the full clinical narrative. FDA reviewers read the narrative for a coherent chronology: baseline status, drug exposure with dates and dose, event onset relative to dosing (temporal plausibility), treatment, de-challenge/re-challenge outcome, and outcome/seriousness criterion. A complete 3500A/CIOMS I carries concomitant medications, relevant medical history, relevant lab/diagnostic results with units and reference ranges, and the reporter's and sponsor's causality. Deficiencies that trigger information requests: missing dechallenge/rechallenge information, narratives that omit dose or dates, seriousness criterion not marked, absent or non-coded event terms, and no assessment of confounders (concomitant meds, underlying disease).",
        "keyContentElements": [
          "Four valid-case minimum elements: identifiable patient, identifiable reporter, suspect product, suspect adverse reaction",
          "Which seriousness criterion is met (death, life-threatening, hospitalization/prolongation, disability/incapacity, congenital anomaly, other medically important event)",
          "Suspect drug details: dose, route, regimen, therapy start/stop dates, lot number, indication under study",
          "Event term(s) coded to MedDRA (Preferred Term and, where relevant, Lowest Level Term)",
          "Clinical narrative: chronology of exposure, onset, course, treatment, and outcome",
          "Dechallenge and rechallenge results where available",
          "Relevant medical history, concomitant medications, and relevant test results with units and reference ranges",
          "Reporter causality and sponsor causality assessments",
          "Patient demographics (age, sex, weight) and study/site/subject identifiers (de-identified per privacy rules)",
          "Case status: initial vs follow-up, and receipt/date fields supporting the reporting clock"
        ],
        "generationPrompt": "Structure an ICSR (MedWatch 3500A or CIOMS I) for a suspected adverse reaction to {{SPONSOR}}'s {{PRODUCT_NAME}} in a {{PHASE}} study for {{INDICATION}}. Lay out the four valid-case elements, the seriousness criterion checkboxes, suspect-drug dose/dates/lot, MedDRA-coded event terms, and a chronological clinical narrative template covering exposure, onset, treatment, dechallenge/rechallenge, and outcome. Use bracketed placeholders for all patient-specific facts and lab values — do not fabricate results. Include fields for reporter and sponsor causality."
      },
      {
        "code": "safety.causality",
        "title": "Causality Assessment (Reasonable Possibility Determination)",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 312.32(a) (definitions of 'suspected adverse reaction' and 'reasonable possibility'); 21 CFR 312.32(c)(1)(i); ICH E2A",
        "authoringGuidance": "This section documents the sponsor's determination that there is a reasonable possibility the drug caused the event — the threshold that converts an adverse event into a suspected adverse reaction and thereby triggers expedited reporting. Reviewers scrutinize the reasoning, not just the conclusion: they want the temporal relationship, biological plausibility/mechanism, dechallenge and rechallenge, alternative etiologies (underlying disease, concomitant drugs, procedures), and consistency with the drug's known pharmacology or class effects laid out. An acceptable assessment applies the 312.32 standard explicitly and distinguishes single-case causality from the aggregate judgment required when the individual case alone is uninformative. Deficiencies: asserting 'not related' without addressing temporal plausibility, failing to consider confounders, conflating the reporter's assessment with the sponsor's, and defaulting every case to 'unassessable' to avoid the reporting clock.",
        "keyContentElements": [
          "Explicit statement of the 312.32(a) standard applied ('reasonable possibility that the drug caused the event')",
          "Temporal relationship between drug exposure and event onset",
          "Dechallenge outcome (event abatement on withdrawal) and rechallenge outcome, if any",
          "Biological plausibility / mechanistic rationale and consistency with known pharmacology or class effects",
          "Assessment of alternative etiologies: underlying disease, concomitant medications, procedures, intercurrent illness",
          "Whether prior similar cases exist and how they inform the single-case judgment",
          "Sponsor's causality conclusion distinct from the investigator/reporter's conclusion, with any disagreement reconciled",
          "For events where a single case is uninformative (e.g., events also common in the study population), reference to the aggregate analysis"
        ],
        "generationPrompt": "Draft the causality assessment for a serious adverse event reported in {{SPONSOR}}'s {{PHASE}} study of {{PRODUCT_NAME}} for {{INDICATION}}. Apply the 21 CFR 312.32(a) 'reasonable possibility' standard explicitly and structure the reasoning around temporal relationship, dechallenge/rechallenge, biological plausibility versus known pharmacology, and alternative etiologies (concomitant meds, underlying disease). State the sponsor conclusion separately from the reporter's. Use placeholders for case-specific facts; do not fabricate outcomes."
      },
      {
        "code": "safety.expectedness",
        "title": "Expectedness Assessment Against the Investigator Brochure / Protocol",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 312.32(a) (definition of 'unexpected'); 21 CFR 312.55; ICH E2A (Reference Safety Information)",
        "authoringGuidance": "Expectedness is determined against the Reference Safety Information — the current Investigator Brochure (or the protocol/general investigational plan if no IB is required). An event is unexpected if it is not listed, or is listed but occurs at a greater specificity or severity than described. Reviewers verify that the sponsor cites the exact IB edition/date and the specific listed reaction relied upon, and that specificity/severity upgrades (e.g., 'hepatic failure' when the IB lists only 'transaminase elevation') are correctly classified as unexpected. Acceptable assessments quote the relevant IB language and version. Deficiencies: assessing against an outdated IB, treating class-labeled or literature-known events as 'expected' when they are not in the sponsor's own RSI, and grading severity upgrades as expected — each of which understates the reporting obligation.",
        "keyContentElements": [
          "Identification of the Reference Safety Information used (Investigator Brochure edition and date, or protocol if no IB)",
          "The specific IB-listed reaction(s) compared against the reported event term",
          "Determination of listed vs not-listed, applying the specificity and severity test",
          "Explicit rationale where a listed event is deemed unexpected due to greater specificity or severity",
          "MedDRA term-to-IB-language mapping demonstrating the comparison",
          "Confirmation the RSI version is current and controls at the day-zero date",
          "Conclusion: expected or unexpected, feeding the reporting decision under 312.32(c)",
          "Note of any pending IB update that would change future expectedness classification"
        ],
        "generationPrompt": "Draft the expectedness assessment for an adverse event in {{SPONSOR}}'s development of {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Identify the controlling Investigator Brochure edition/date as Reference Safety Information, compare the MedDRA-coded event term against the specific IB-listed reactions, and apply the specificity-and-severity test to conclude expected vs unexpected. Quote bracketed placeholders for the IB language and event term. Flag whether an IB update is pending."
      },
      {
        "code": "safety.aggregate",
        "title": "Aggregate / Similar-Events and Increased-Rate Analysis",
        "required": false,
        "contentType": "mixed",
        "guidance": "21 CFR 312.32(c)(1)(i)(C) (aggregate analysis of specific events); 21 CFR 312.32(c)(1)(iv) (clinically important increased rate); FDA Safety Assessment for IND Safety Reporting (Dec 2015 draft)",
        "authoringGuidance": "Required when the individual case is uninformative on its own — typically serious events that are anticipated to occur in the study population or disease under study (e.g., disease progression, expected complications) — the sponsor must judge whether the aggregate of accumulating cases indicates the drug caused the events, or whether the observed rate clinically importantly exceeds the expected rate. Reviewers look for a pre-specified safety surveillance plan, comparison of observed versus anticipated (control-arm or historical) rates, and unblinded aggregate review by a party independent of the trial teams where feasible. Acceptable analyses state the denominators, the comparison basis, and the decision rule. Deficiencies: reporting each anticipated serious event as an isolated 15-day case (over-reporting that obscures signals), or conversely never performing the aggregate analysis and missing a rate increase; and failing to describe who performs the unblinded review.",
        "keyContentElements": [
          "The specific serious event(s) under aggregate evaluation and why single cases are uninformative",
          "Observed count and exposure denominator (person-time or number of subjects) for the event",
          "Anticipated/expected rate and its basis (control arm, external control, historical/published rate)",
          "Comparison and the pre-specified threshold or decision rule for a 'clinically important increase'",
          "Description of the safety surveillance / monitoring process and who conducts unblinded aggregate review (e.g., independent group or DMC)",
          "Determination whether the aggregate indicates the drug caused the events (312.32(c)(1)(i)(C)) or a reportable rate increase (312.32(c)(1)(iv))",
          "Blinding-management approach and rationale for any unblinding",
          "Reference to the safety surveillance plan governing the analysis"
        ],
        "generationPrompt": "Draft an aggregate / similar-events analysis for anticipated serious events in {{SPONSOR}}'s {{PHASE}} program for {{PRODUCT_NAME}} in {{INDICATION}}. Structure it around the observed count and exposure denominator, the anticipated rate and its basis (control or historical), a pre-specified decision rule for a clinically important increase, and the unblinded aggregate-review process. State the reporting determination under 21 CFR 312.32(c)(1)(i)(C) or (c)(1)(iv). Use placeholders for all counts and rates; do not fabricate data."
      },
      {
        "code": "safety.followup",
        "title": "Follow-Up Report",
        "required": false,
        "contentType": "mixed",
        "guidance": "21 CFR 312.32(d) (follow-up information); FDA Safety Reporting Guidance (Dec 2012)",
        "authoringGuidance": "A follow-up conveys material new information obtained after the initial report — final outcome, autopsy/pathology results, corrected coding, revised causality or expectedness, or the results of a promised investigation. Reviewers reconcile the follow-up against the initial case and read it for whether the assessment has changed (e.g., a fatal outcome now met, an event now considered related). Acceptable follow-ups clearly flag what changed, preserve version/serial linkage to the initial ICSR, and are submitted within 15 calendar days of the sponsor receiving the new information. Deficiencies: submitting follow-ups without identifying what is new, breaking the linkage to the parent case, and delaying beyond the 15-day clock when the follow-up itself upgrades the case (e.g., non-fatal to fatal).",
        "keyContentElements": [
          "Clear linkage to the initial report (case number, serial number, initial submission date)",
          "Follow-up sequence number and the date new information was received (new day-zero for the 15-day follow-up clock)",
          "Explicit description of what changed since the prior version (outcome, coding, causality, expectedness)",
          "Updated seriousness, causality, and expectedness determinations if altered",
          "New clinical/diagnostic/autopsy information and its impact on the assessment",
          "Statement whether the follow-up changes the reporting category (e.g., upgrade to a 7-day fatal case)",
          "Whether the case is now complete or further follow-up is pending",
          "Confirmation of investigator/IRB notification of the updated information where warranted"
        ],
        "generationPrompt": "Draft a follow-up IND safety report for a case in {{SPONSOR}}'s {{PHASE}} study of {{PRODUCT_NAME}} ({{INDICATION}}). Link it to the initial report, state the date the new information was received, and clearly flag what changed (outcome, coding, causality, or expectedness) and whether the reporting category is upgraded. Update the seriousness/causality/expectedness conclusions accordingly. Use placeholders for case-specific facts; do not fabricate results."
      }
    ],
    "registryId": "US_IND_SR",
    "timing": "7 calendar days (fatal or life-threatening, unexpected, suspected adverse reaction — initial notification, which may be by telephone or fax/electronic) / 15 calendar days (other serious and unexpected suspected adverse reactions; findings from other studies or class; clinically important rate increase). Clock starts on day zero — the day the sponsor first receives information meeting the reporting criteria. Follow-up information is submitted within 15 calendar days of receipt."
  },
  {
    "id": "ind_annual_report",
    "label": "IND Annual Report",
    "category": "periodic",
    "family": "IND",
    "agency": "FDA",
    "description": "A brief annual report of the progress of the investigation submitted to the reviewing division for each active IND. It summarizes the year's clinical and nonclinical progress, the safety experience across all studies conducted under the IND, changes to the general investigational plan, and administrative developments. It is an administrative periodic report, not a CTD dossier. Many sponsors satisfy this obligation with an ICH E2F Development Safety Update Report (DSUR) supplemented by the 312.33 elements the DSUR does not cover.",
    "regulatoryBasis": [
      "21 CFR 312.33 (Annual reports)",
      "21 CFR 312.33(a) (individual study information)",
      "21 CFR 312.33(b) (summary information — adverse experiences, IND safety reports, deaths, dropouts, drug-action findings, preclinical studies, and manufacturing changes)",
      "21 CFR 312.33(c)-(g) (general investigational plan, IB revisions, significant Phase 1 protocol modifications, foreign marketing developments, outstanding business log)",
      "21 CFR 312.23(a)(1) (Form FDA 1571 as transmittal)",
      "FDA Guidance: Providing Postmarketing Periodic Safety Reports in the ICH E2C(R2) Format (for context); ICH E2F where DSUR is used to satisfy 312.33"
    ],
    "components": [
      {
        "code": "annual.transmittal",
        "title": "Transmittal Cover Letter and Form FDA 1571",
        "required": true,
        "contentType": "form",
        "guidance": "21 CFR 312.33; 21 CFR 312.23(a)(1) (Form FDA 1571)",
        "authoringGuidance": "The transmittal identifies the submission as the IND Annual Report, states the IND anniversary/effective date and the reporting period it covers, and confirms timeliness within the 60-day window. Reviewers use it to file the report against the correct IND and to confirm the annual obligation was met. An acceptable transmittal lists the serial number, the reporting-period dates, and an index of the 312.33 elements included (or a note that a DSUR is attached to satisfy specified elements). Deficiencies: ambiguous or missing reporting-period dates, filing under the wrong IND effective date, and no cross-map showing which 312.33 subparts each attachment satisfies.",
        "keyContentElements": [
          "IND number, product name, sponsor, and reviewing division",
          "Explicit label 'IND Annual Report' and the reporting period (from prior anniversary to current anniversary)",
          "IND effective date and confirmation of submission within 60 days of the anniversary",
          "Submission serial number",
          "Index mapping attachments to 21 CFR 312.33(a)-(g) subparts",
          "Statement if an ICH E2F DSUR is attached and which 312.33 elements it satisfies (and which are supplemented)",
          "Completed Form FDA 1571 with sponsor signature and contact information"
        ],
        "generationPrompt": "Draft the transmittal cover letter and Form FDA 1571 header for {{SPONSOR}}'s IND Annual Report for {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Label it clearly, state the IND effective date and the reporting period, confirm the 60-day timing, provide the serial number, and include an index mapping each attachment to 21 CFR 312.33(a)-(g). Note whether a DSUR satisfies part of the obligation. Use bracketed placeholders for the IND number and dates."
      },
      {
        "code": "annual.study_progress",
        "title": "Individual Study Information and Progress",
        "required": true,
        "contentType": "mixed",
        "guidance": "21 CFR 312.33(a) (individual study information)",
        "authoringGuidance": "This provides, for each study conducted under the IND during the reporting period, the title/purpose/protocol number, patient population and total enrollment, the number entered and completed or dropped, and a brief description of available results. Reviewers read it to gauge program momentum and whether studies are proceeding, on hold, or completed, and to reconcile enrollment against the safety summary. An acceptable section is study-by-study, quantitative on enrollment and disposition, and consistent with the safety data. Deficiencies: omitting terminated/completed studies, enrollment numbers that do not reconcile with the death/dropout list, and vague 'ongoing' descriptions with no disposition counts.",
        "keyContentElements": [
          "For each study: title, purpose, protocol identifier, and phase",
          "Patient population and planned enrollment",
          "Number of subjects entered during the period and cumulatively",
          "Number completed, ongoing, or discontinued (with reasons summarized)",
          "Brief statement of any available/interim results, or that data are not yet available",
          "Study status: ongoing, completed, terminated, or on clinical hold",
          "Reconciliation basis for enrollment totals used elsewhere in the report"
        ],
        "generationPrompt": "Draft the individual study information section (21 CFR 312.33(a)) for {{SPONSOR}}'s IND Annual Report on {{PRODUCT_NAME}} in {{INDICATION}}. For each {{PHASE}} study include title, purpose, protocol number, population, planned and actual enrollment, disposition (entered/completed/ongoing/discontinued), status, and a brief results statement or 'not yet available.' Provide a per-study table template with bracketed placeholders for all counts; do not fabricate results."
      },
      {
        "code": "annual.safety_summary",
        "title": "Summary of Safety Information and Most Frequent/Serious Adverse Experiences",
        "required": true,
        "contentType": "mixed",
        "guidance": "21 CFR 312.33(b)(1)-(4) (adverse-experience summary; summary of IND safety reports; list of subjects who died; list of subjects who dropped out in association with an adverse experience)",
        "authoringGuidance": "This is the analytical safety heart of the annual report: a narrative of the most frequent and most serious adverse experiences by body system, a summary of all IND safety reports submitted during the year, a list of subjects who died during participation (with cause) and those who dropped out because of adverse experiences, and any information suggesting a significant risk requiring protocol or IB change. Reviewers read it for emerging signals and to confirm that individual expedited reports aggregate into a coherent safety picture. Acceptable sections tie the death/dropout list to the study progress counts and reference the IB updates that resulted. Deficiencies: death/dropout lists that do not reconcile with enrollment, no summary of the year's expedited reports, and failure to state safety-driven protocol or IB changes.",
        "keyContentElements": [
          "Narrative summary of the most frequent and most serious adverse experiences, organized by body system / MedDRA SOC",
          "Summary of all IND safety reports (7-day/15-day) submitted during the reporting period",
          "List of subjects who died during participation, with cause of death per subject",
          "List of subjects who dropped out in association with an adverse experience",
          "Information suggesting a significant human risk (e.g., new serious signals, class effects, nonclinical findings)",
          "Safety-driven changes made to protocols or the Investigator Brochure during the period",
          "Aggregate exposure context (subjects/person-time) supporting the safety narrative",
          "Reconciliation with individual study disposition counts"
        ],
        "generationPrompt": "Draft the safety summary (21 CFR 312.33(b)(1)-(4)) for {{SPONSOR}}'s IND Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Include a body-system narrative of frequent and serious adverse experiences, a summary of all IND safety reports filed during the year, a subject-level death list with causes, a dropout-for-AE list, and any information suggesting significant risk plus resulting protocol/IB changes. Provide table templates with bracketed placeholders; do not fabricate adverse-event data."
      },
      {
        "code": "annual.ind_changes",
        "title": "Summary of IND Changes, Phase 1 Protocol Modifications, and General Investigational Plan",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 312.33(b)(6) (list of preclinical studies completed or in progress), 312.33(b)(7) (significant manufacturing/microbiological changes), 312.33(e) (significant Phase 1 protocol modifications not previously reported), 312.33(c) (general investigational plan for the coming year)",
        "authoringGuidance": "This section records what changed and what is planned: a list of nonclinical (preclinical) studies completed during the year, significant manufacturing or microbiological changes, any Phase 1 protocol modifications not previously reported under an amendment, and the general investigational plan for the coming year. Reviewers use it to anticipate the program's direction, confirm CMC and nonclinical developments are captured, and check that Phase 1 modifications made without a formal amendment are disclosed here. Acceptable sections are specific about changes and forward-looking about next year's studies. Deficiencies: omitting the coming-year plan, failing to list Phase 1 protocol modifications, and burying significant CMC changes.",
        "keyContentElements": [
          "List of nonclinical (preclinical) studies completed during the reporting period",
          "Significant manufacturing or microbiological changes made during the period",
          "Phase 1 protocol modifications made and not previously reported via amendment",
          "General investigational plan for the coming year (studies planned, populations, objectives)",
          "Any new indications or expanded scope anticipated",
          "Cross-reference to protocol/CMC/information amendments filed during the period",
          "Impact statements linking changes to safety or program strategy where relevant"
        ],
        "generationPrompt": "Draft the IND changes and general investigational plan section (21 CFR 312.33(b)(6), (b)(7), (e), (c)) for {{SPONSOR}}'s IND Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). List completed nonclinical studies, significant manufacturing/microbiological changes, unreported Phase 1 protocol modifications, and the general investigational plan for the coming year. Cross-reference amendments filed during the period. Use bracketed placeholders for specifics; do not fabricate study details."
      },
      {
        "code": "annual.ib_revisions",
        "title": "Investigator Brochure Revisions",
        "required": false,
        "contentType": "narrative",
        "guidance": "21 CFR 312.33(d) (revised IB); 21 CFR 312.55",
        "authoringGuidance": "If the Investigator Brochure was revised during the reporting period, the annual report describes the revisions and appends the revised IB. Reviewers cross-check that safety findings summarized elsewhere in the report drove corresponding Reference Safety Information updates — a mismatch (new serious signal not reflected in the IB) is a red flag. Acceptable sections summarize what changed section-by-section and confirm distribution to investigators. Deficiencies: stating the IB was revised without describing the changes, and safety signals in the report that never reached the IB.",
        "keyContentElements": [
          "Statement of whether the IB was revised during the reporting period",
          "Description of the substantive revisions (safety, pharmacology, clinical, dosing)",
          "Version/edition and date of the revised IB",
          "Linkage between reported safety findings and the corresponding RSI updates",
          "Confirmation the revised IB was distributed to investigators and IRBs",
          "Appended revised Investigator Brochure (or reference to the serial submission)"
        ],
        "generationPrompt": "Draft the Investigator Brochure revisions section (21 CFR 312.33(d)) for {{SPONSOR}}'s IND Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}). State whether the IB was revised, summarize the substantive changes by section, give the edition/date, and tie the changes to the year's safety findings. Confirm distribution to investigators. Use bracketed placeholders; do not fabricate content."
      },
      {
        "code": "annual.admin",
        "title": "Foreign Marketing Developments and Log of Outstanding Business",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 312.33(f) (foreign marketing developments), 312.33(g) (log of outstanding business for which FDA response is requested)",
        "authoringGuidance": "This administrative closing section reports any foreign marketing developments (approvals, withdrawals, or actions taken by a foreign regulatory authority for safety reasons) under 21 CFR 312.33(f), and a log of any outstanding business for which the sponsor requests an FDA response under 312.33(g). (Note: 21 CFR 312.33 has no IRB/Part 56 reporting element — do not assert one.) Reviewers scan foreign regulatory actions for safety-driven withdrawals or restrictions that bear on the US program, and treat the outstanding-business log as the sponsor's explicit request queue. Acceptable sections are specific about foreign actions and their reasons. Deficiencies: omitting a foreign safety-related withdrawal or restriction, and using the outstanding-business log for items that belong in a formal amendment or meeting request.",
        "keyContentElements": [
          "Foreign marketing developments: approvals, withdrawals, or regulatory actions in other countries",
          "Whether any foreign action was taken for safety reasons and its implications for the US program",
          "Log of outstanding business for which an FDA response is specifically requested",
          "Clear scoping so that items requiring a formal amendment or meeting request are routed appropriately",
          "Dates and jurisdictions for each foreign development"
        ],
        "generationPrompt": "Draft the administrative closing section (21 CFR 312.33(f)-(g)) for {{SPONSOR}}'s IND Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}). Cover foreign marketing developments (approvals, withdrawals, safety-related regulatory actions with jurisdictions and dates) and a log of outstanding business for which FDA response is requested. Use bracketed placeholders; do not fabricate regulatory actions."
      }
    ],
    "registryId": "US_IND_ANNUAL",
    "timing": "Within 60 days of the anniversary date on which the IND went into effect (30 days after original submission, i.e., the anniversary of the effective date)."
  },
  {
    "id": "dsur",
    "label": "Development Safety Update Report (DSUR, ICH E2F)",
    "category": "periodic",
    "family": "IND",
    "agency": "FDA",
    "description": "The internationally harmonized annual report on the safety of a drug under clinical development, structured per ICH E2F. It presents a comprehensive, thoughtful annual review and evaluation of accumulated safety information across all studies and indications worldwide during the reporting period, focusing on interventional clinical trials. In the US, a DSUR can be submitted to satisfy the safety-related elements of the 21 CFR 312.33 IND annual report, typically supplemented with the US-specific administrative elements that E2F does not cover. It is an administrative periodic safety report, not a CTD dossier section.",
    "regulatoryBasis": [
      "ICH E2F: Development Safety Update Report (2010)",
      "21 CFR 312.33 (US IND annual report obligation the DSUR may satisfy in part)",
      "21 CFR 312.32 (relationship to expedited IND safety reporting)",
      "FDA Guidance for Industry: E2F Development Safety Update Report (August 2011)",
      "ICH E2A (definitions of serious/unexpected referenced by E2F)",
      "ICH E2B(R3) (electronic ICSR standard for line listings/tabulations)"
    ],
    "components": [
      {
        "code": "dsur.title_exec",
        "title": "Title Page, Executive Summary, and Introduction",
        "required": true,
        "contentType": "narrative",
        "guidance": "ICH E2F Sections 1 (Introduction) and Executive Summary; FDA E2F Guidance (Aug 2011)",
        "authoringGuidance": "The title page states the sponsor, active substance, DIBD, DLP, reporting-period dates, and report number; the executive summary gives the reviewer a stand-alone synopsis of the period's key safety findings and actions; the introduction sets the reporting interval, indications/populations studied, and scope. Reviewers read the executive summary first to judge whether the sponsor identified and acted on the period's important risks. An acceptable opening reconciles DIBD/DLP/period dates and previews the significant findings and the overall benefit-risk conclusion. Deficiencies: DLP/DIBD inconsistency, an executive summary that omits the period's key actions or findings, and scope statements that do not match the trial inventory.",
        "keyContentElements": [
          "Sponsor, active substance/product(s), and report number",
          "DIBD, DLP, and the reporting-period start/end dates",
          "Concise executive summary of key safety findings, actions taken, and overall benefit-risk assessment",
          "Introduction: reporting interval, indications and populations under study, and worldwide development scope",
          "Statement that one DSUR covers all products containing the active substance",
          "Reference to the previous DSUR and reporting continuity",
          "Whether the DSUR is being used to satisfy US 21 CFR 312.33 elements"
        ],
        "generationPrompt": "Draft the DSUR title page, executive summary, and introduction (ICH E2F) for {{SPONSOR}}'s {{PRODUCT_NAME}} developed for {{INDICATION}} ({{PHASE}}). State active substance, DIBD, DLP, and reporting period; summarize the period's key findings, actions, and benefit-risk; and set the development scope. Note if the DSUR satisfies US 312.33 elements. Use bracketed placeholders for dates and findings; do not fabricate safety results."
      },
      {
        "code": "dsur.regulatory_status",
        "title": "Worldwide Marketing Approval Status and Actions Taken for Safety Reasons",
        "required": true,
        "contentType": "mixed",
        "guidance": "ICH E2F Sections 2 (Worldwide Marketing Approval Status), 3 (Actions Taken in the Reporting Period for Safety Reasons), and 4 (Changes to Reference Safety Information)",
        "authoringGuidance": "This block establishes the regulatory backdrop: countries where the drug is under development or approved, and every significant action taken during the period for safety reasons — by the sponsor, regulators, DMCs, or ethics committees (trial suspensions, holds, protocol modifications for safety, dosing restrictions, refusals to approve, withdrawals) — plus any changes to the Reference Safety Information (the IB or its RSI section). Reviewers read this for the sponsor's and other parties' risk-management actions and to see how the RSI evolved. Acceptable sections list each action with date, jurisdiction, and reason, and describe RSI changes precisely. Deficiencies: omitting DMC-driven or foreign-authority actions, and failing to describe RSI changes that follow from the period's findings.",
        "keyContentElements": [
          "List of countries where the drug is under clinical development and where approved for marketing",
          "Significant safety-related actions during the period: trial holds/suspensions, terminations, protocol modifications for safety, dose or population restrictions",
          "Actions taken by regulators, DMCs/DSMBs, ethics committees, and the sponsor, each with date, jurisdiction, and reason",
          "Refusals to approve or marketing withdrawals for safety/efficacy reasons",
          "Changes to the Reference Safety Information (IB / RSI) during the period",
          "Impact of RSI changes on ongoing trials and expectedness assessments",
          "Any communications to investigators (e.g., urgent safety measures / DILI or QT alerts)"
        ],
        "generationPrompt": "Draft the DSUR regulatory-status and safety-actions block (ICH E2F Sections 2-4) for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Provide the worldwide development/approval status, a dated and jurisdiction-tagged list of safety-driven actions (holds, terminations, protocol/dose restrictions) by all parties, and a description of Reference Safety Information changes and their impact. Use bracketed placeholders; do not fabricate regulatory actions."
      },
      {
        "code": "dsur.trial_inventory",
        "title": "Inventory of Clinical Trials and Estimated Cumulative Exposure",
        "required": true,
        "contentType": "table",
        "guidance": "ICH E2F Sections 5 (Inventory of Clinical Trials Ongoing and Completed During the Reporting Period) and 6 (Estimated Cumulative Exposure)",
        "authoringGuidance": "The trial inventory (E2F Appendix line listing) catalogs all interventional trials ongoing or completed in the period; the exposure section gives estimated cumulative subject exposure from clinical trials (by dose, regimen, indication, age, sex, and region where feasible), plus exposure from any marketed use and other sources. Reviewers use exposure denominators to interpret every rate and count elsewhere in the DSUR — without them, the safety analysis is uninterpretable. Acceptable sections provide subjects and, where relevant, person-time, with clearly stated estimation methods. Deficiencies: exposure figures that do not reconcile with the trial inventory, missing denominators for key subgroups, and no method note for how cumulative exposure was estimated.",
        "keyContentElements": [
          "Inventory of all interventional trials ongoing or completed during the period (protocol ID, phase, design, indication, population, status, enrollment)",
          "Estimated cumulative subject exposure in clinical trials over the development program",
          "Exposure broken down by dose, regimen, and duration where feasible",
          "Exposure by demographic subgroup: age, sex, and region/race where available",
          "Exposure from any marketed use and from compassionate/expanded-access or other sources",
          "Method and assumptions used to estimate exposure (subjects vs person-time)",
          "Reconciliation between exposure figures and the trial inventory"
        ],
        "generationPrompt": "Draft the DSUR clinical trial inventory and cumulative exposure section (ICH E2F Sections 5-6) for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Provide a trial-inventory table template (protocol ID, phase, design, indication, population, status, enrollment) and an estimated cumulative-exposure table by dose, duration, age, sex, and region, with a method note. Use bracketed placeholders for all counts; do not fabricate exposure figures."
      },
      {
        "code": "dsur.line_listings",
        "title": "Data in Line Listings and Summary Tabulations",
        "required": true,
        "contentType": "data",
        "guidance": "ICH E2F Section 7 (Data in Line Listings and Summary Tabulations); ICH E2B(R3); ICH E2A",
        "authoringGuidance": "This presents the period's serious adverse event data: a cumulative summary tabulation of serious adverse events from the clinical development program (by MedDRA SOC/PT, treatment arm where unblinding rules allow) and, per regional requirement, line listings of SAEs for the interval. Reviewers scan the summary tabulations for disproportionality across system organ classes and for accumulating serious events. Acceptable sections use consistent MedDRA versioning, state blinding conventions, and reconcile counts with exposure. Deficiencies: mixing MedDRA versions, tabulations that do not reconcile with the exposure denominators, unblinding data prematurely, and omitting the cumulative view in favor of interval-only counts.",
        "keyContentElements": [
          "Cumulative summary tabulation of serious adverse events by MedDRA System Organ Class and Preferred Term",
          "Interval SAE line listings per regional requirement (subject ID, event, seriousness criterion, outcome, causality)",
          "Treatment-arm presentation consistent with blinding-maintenance conventions",
          "Consistent MedDRA version stated and applied throughout",
          "Reconciliation of SAE counts against the cumulative exposure denominators",
          "Distinction between blinded and unblinded data and the rules governing any unblinding",
          "Cross-reference from tabulations to the significant-findings and safety-evaluation sections"
        ],
        "generationPrompt": "Draft the DSUR line listings and summary tabulations section (ICH E2F Section 7) for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Provide a cumulative SAE summary-tabulation template by MedDRA SOC/PT and an interval SAE line-listing template (subject ID, event, seriousness, outcome, causality), stating the MedDRA version and blinding conventions, and reconciling to exposure. Use bracketed placeholders for all data; do not fabricate adverse events."
      },
      {
        "code": "dsur.safety_evaluation",
        "title": "Significant Findings and Overall Safety Assessment",
        "required": true,
        "contentType": "narrative",
        "guidance": "ICH E2F Sections 8 (Significant Findings from Clinical Trials During the Reporting Period), 9 (Safety Findings from Non-interventional Studies), 10 (Other Clinical Trial/Study Safety Information), 11 (Safety Findings from Marketing Experience), 12 (Non-clinical Data), 13 (Literature), 14 (Other DSURs), 15 (Lack of Efficacy), 16 (Region-Specific Information), 17 (Late-Breaking Information), 18 (Overall Safety Assessment)",
        "authoringGuidance": "This is the analytical core: an integrated evaluation of the period's significant clinical-trial findings (completed and interim), non-interventional and marketing data, nonclinical signals, literature, lack-of-efficacy findings with safety implications, region-specific information (e.g., US-specific), late-breaking data after the DLP, and an overall evaluation of the evolving benefit-risk. Reviewers read this to see whether the sponsor synthesized the data into identified/potential risks and missing information and acted appropriately. Acceptable sections evaluate rather than merely list, address each new signal's weight of evidence, and characterize the updated risk profile. Deficiencies: reciting tabulations without evaluation, ignoring literature or nonclinical signals, failing to address region-specific findings, and an overall assessment that does not integrate the individual findings.",
        "keyContentElements": [
          "Evaluation of significant safety findings from clinical trials completed and interim during the period",
          "Safety findings from non-interventional studies, marketed use, nonclinical studies, and the literature",
          "Findings on lack of efficacy that carry safety implications (e.g., in serious/life-threatening indications)",
          "Region-specific information required by any participating region (e.g., US cumulative subjects, serious ADRs)",
          "Late-breaking information received after the DLP but before finalization",
          "Characterization of identified risks, potential risks, and missing information (aligned with any development RMP)",
          "Overall safety evaluation integrating all sources into an updated benefit-risk statement",
          "Impact of findings on the IB/RSI, informed consent, protocols, and ongoing trial conduct"
        ],
        "generationPrompt": "Draft the DSUR significant-findings and overall safety assessment (ICH E2F Sections 8-18) for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Evaluate (do not merely list) clinical-trial, non-interventional, marketing, nonclinical, and literature findings; address lack-of-efficacy safety implications, region-specific US data, and late-breaking information; and integrate everything into identified/potential risks, missing information, and an updated benefit-risk statement. Use bracketed placeholders; do not fabricate findings."
      },
      {
        "code": "dsur.conclusion_appendices",
        "title": "Conclusions and Appendices",
        "required": true,
        "contentType": "mixed",
        "guidance": "ICH E2F Section 19 (Conclusions) and Appendices (contacts, IB/RSI in effect, cumulative tabulations, region-specific tables)",
        "authoringGuidance": "The conclusion summarizes new safety information of greatest importance, its impact on the benefit-risk balance, and the actions the sponsor proposes or has taken; the appendices carry the supporting materials — the RSI/IB in effect at the DLP, cumulative summary tabulations, the trial inventory, and region-specific appendices (e.g., US). Reviewers read the conclusion for the sponsor's forward plan and check that appendices substantiate the narrative. Acceptable conclusions are decisive about whether the benefit-risk remains favorable and what changes are proposed. Deficiencies: a conclusion that does not commit to actions, appendices that omit the controlling RSI/IB, and region-specific appendices missing when a participating region requires them.",
        "keyContentElements": [
          "Summary of the most important new safety information of the period",
          "Statement of the impact on the benefit-risk balance and whether it remains favorable",
          "Actions proposed or taken (protocol/IB/consent changes, risk-minimization, further analyses)",
          "Appendix: Reference Safety Information (IB / RSI section) in effect at the DLP",
          "Appendix: cumulative and interval summary tabulations and trial inventory",
          "Appendix: region-specific information (e.g., US) where required",
          "Appendix: sponsor safety contacts and signatory/qualified person as applicable"
        ],
        "generationPrompt": "Draft the DSUR conclusions and appendix structure (ICH E2F Section 19 and appendices) for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}, {{PHASE}}). Summarize the most important new safety information, state the benefit-risk impact and whether it remains favorable, and commit to proposed/taken actions. List the appendices (RSI/IB in effect at DLP, cumulative tabulations, trial inventory, region-specific US tables, contacts). Use bracketed placeholders; do not fabricate conclusions."
      }
    ],
    "registryId": "ICH_DSUR",
    "timing": "Annually, within 60 calendar days of the Data Lock Point (DLP). The DLP is set to the Development International Birth Date (DIBD) — the anniversary of the first authorization to conduct a clinical trial in any country. One DSUR covers all products containing the active substance held by the sponsor."
  },
  {
    "id": "nda_bla_annual_report",
    "label": "NDA/BLA Post-Approval Annual Report",
    "category": "periodic",
    "family": "NDA",
    "agency": "FDA",
    "description": "The post-approval annual report submitted to the reviewing division for an approved NDA (and, correspondingly, for a licensed BLA), summarizing significant new information about the product from the past year that may affect its safety, effectiveness, or labeling, together with actions the applicant has taken or intends to take as a result. It also reports distribution data, current labeling and labeling changes, CMC changes, nonclinical and clinical data summaries, and the status of postmarketing study commitments and requirements. It is an administrative periodic report transmitted with Form FDA 2252 and is distinct from expedited/periodic adverse-event safety reporting under 21 CFR 314.80.",
    "regulatoryBasis": [
      "21 CFR 314.81(b)(2) (annual report for approved NDAs)",
      "21 CFR 314.81(b)(2)(i)-(x) (specified content: summary, distribution, labeling, CMC, nonclinical, clinical, status of postmarketing studies, etc.)",
      "21 CFR 314.81(b)(2)(vii) & 314.81(b)(2)(viii) (status of postmarketing study commitments and requirements; FDAAA 505(o))",
      "21 CFR 601.12(a) and 601.28 (annual/periodic reporting for licensed biologics / BLAs)",
      "Form FDA 2252 (Transmittal of Periodic Reports for Drugs and Biologics)",
      "21 CFR 314.80 (postmarketing adverse experience reporting — cross-referenced, separate obligation)",
      "FDA Guidance: Providing Postmarketing Periodic Safety Reports in the ICH E2C(R2) Format (PBRER/PADER context)"
    ],
    "components": [
      {
        "code": "annual.2252",
        "title": "Form FDA 2252 Transmittal and Cover Letter",
        "required": true,
        "contentType": "form",
        "guidance": "21 CFR 314.81(b)(2); Form FDA 2252 (Transmittal of Periodic Reports for Drugs and Biologics)",
        "authoringGuidance": "Form FDA 2252 is the required transmittal for the periodic annual report; the accompanying cover letter identifies the application, the approval anniversary, the reporting period, and confirms the 60-day timing. Reviewers use it to log the report against the correct NDA/BLA and to confirm the annual obligation was met. An acceptable transmittal includes the application number, product, reporting-period dates, serial/sequence number, and an index mapping attachments to 314.81(b)(2)(i)-(x). Deficiencies: missing or mislabeled reporting-period dates, wrong application number, and no index tying each attachment to the required content elements.",
        "keyContentElements": [
          "Completed Form FDA 2252 with application number and product identification",
          "NDA/BLA number, proprietary and established names, and approval date",
          "Reporting-period start/end dates and confirmation of submission within 60 days of the approval anniversary",
          "Submission serial/sequence number and eCTD lifecycle references",
          "Index mapping each attachment to 21 CFR 314.81(b)(2)(i)-(x)",
          "Applicant contact information and authorized signatory",
          "Statement of related concurrent submissions (e.g., a PADER/PBRER if applicable)"
        ],
        "generationPrompt": "Draft the Form FDA 2252 transmittal and cover letter for {{SPONSOR}}'s NDA/BLA Annual Report for {{PRODUCT_NAME}} ({{INDICATION}}). Include the application number, approval date, reporting-period dates, confirmation of the 60-day timing, serial number, and an index mapping attachments to 21 CFR 314.81(b)(2)(i)-(x). Use bracketed placeholders for the application number and dates."
      },
      {
        "code": "annual.summary",
        "title": "Summary of Significant New Information and Actions Taken",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 314.81(b)(2)(i) (summary of significant new information from the previous year that might affect safety, effectiveness, or labeling; actions taken or to be taken)",
        "authoringGuidance": "This is the analytical heart of the annual report: a concise narrative of the most significant new information from the reporting year that could affect the product's safety, effectiveness, or labeling, and a statement of what the applicant has done or plans to do in response. Reviewers read it to judge whether the applicant is monitoring the product's benefit-risk in the marketplace and acting on signals. An acceptable summary integrates safety, efficacy, and labeling developments and states concrete actions (label changes proposed, studies initiated, communications issued). Deficiencies: a summary that merely points to attachments without synthesis, omitting known safety signals addressed elsewhere in the year, and failing to state resulting or planned actions.",
        "keyContentElements": [
          "Concise synthesis of significant new safety information from the reporting period",
          "Significant new effectiveness information and any impact on approved use",
          "Information affecting labeling and any resulting or proposed labeling changes",
          "Actions taken by the applicant in response (label revisions, Dear Healthcare Provider letters, study initiation, risk-minimization)",
          "Actions the applicant intends to take and their timeline",
          "Cross-references to the labeling, CMC, nonclinical, and clinical sections that substantiate the summary",
          "Statement of whether any change warrants a supplement (CBE-0, CBE-30, or PAS)"
        ],
        "generationPrompt": "Draft the summary of significant new information (21 CFR 314.81(b)(2)(i)) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}). Synthesize the year's significant safety, effectiveness, and labeling developments and state the actions taken or planned in response, cross-referencing the supporting sections and noting whether a supplement is warranted. Use bracketed placeholders; do not fabricate findings."
      },
      {
        "code": "annual.distribution",
        "title": "Distribution Data",
        "required": true,
        "contentType": "table",
        "guidance": "21 CFR 314.81(b)(2)(ii) (distribution data)",
        "authoringGuidance": "This provides the quantity of the drug distributed during the reporting period, including bulk and finished dosage forms, by National Drug Code, and the authorized period covered. For biologics, comparable lot-distribution information is provided. Reviewers use distribution figures as a denominator for interpreting adverse-event reporting rates and to gauge market exposure. An acceptable section states total quantities by dosage form and NDC with units and the exact period covered. Deficiencies: distribution reported without units or NDC granularity, periods that do not match the reporting interval, and figures that cannot serve as an exposure denominator.",
        "keyContentElements": [
          "Total quantity distributed during the reporting period by National Drug Code (NDC)",
          "Bulk and finished dosage-form quantities with units of measure",
          "Number of dosage units and package sizes distributed",
          "Time period covered by the distribution data (aligned to the reporting interval)",
          "For biologics: lots distributed and lot-release context as applicable",
          "Domestic versus export distribution where relevant",
          "Basis for figures (shipments, sales) and any estimation method"
        ],
        "generationPrompt": "Draft the distribution data section (21 CFR 314.81(b)(2)(ii)) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}}. Provide a table template of quantities distributed by NDC and dosage form with units and package sizes, the exact period covered, and domestic/export split where relevant. Use bracketed placeholders for all quantities; do not fabricate figures."
      },
      {
        "code": "annual.labeling",
        "title": "Current Professional Labeling, Patient Labeling, and Labeling Changes",
        "required": true,
        "contentType": "mixed",
        "guidance": "21 CFR 314.81(b)(2)(iii) (labeling: currently used professional labeling, patient labeling, promotional labeling; and a summary of changes made since the last report)",
        "authoringGuidance": "This section supplies the currently used professional labeling (package insert), patient labeling/Medication Guide, and representative promotional labeling, plus a summary of all labeling changes made during the reporting period (with the mechanism used — CBE, PAS, or annual-reportable editorial change). Reviewers confirm the current labeling on file matches what is marketed and that changes were made through the correct regulatory pathway. An acceptable section clearly distinguishes changes already implemented from those pending and cites the supplement or reporting mechanism for each. Deficiencies: labeling changes reported here that should have been prior-approval supplements, missing Medication Guide/patient labeling, and no clear before/after for changes.",
        "keyContentElements": [
          "Currently used professional labeling (package insert / Prescribing Information)",
          "Currently used patient labeling and Medication Guide, if any",
          "Representative promotional labeling and advertising in use",
          "Summary of all labeling changes made during the reporting period (before/after)",
          "The regulatory mechanism used for each change (CBE-0, CBE-30, PAS, or annual-report editorial)",
          "Confirmation that changes requiring prior approval were submitted as supplements, not merely reported here",
          "Cross-reference to any pending labeling supplements"
        ],
        "generationPrompt": "Draft the labeling section (21 CFR 314.81(b)(2)(iii)) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}). Reference the current professional and patient labeling and representative promotional labeling, and provide a change-log template summarizing each labeling change with before/after and the regulatory mechanism used (CBE/PAS/annual-reportable). Use bracketed placeholders; do not fabricate label content."
      },
      {
        "code": "annual.cmc",
        "title": "Chemistry, Manufacturing, and Controls (CMC) Changes",
        "required": true,
        "contentType": "narrative",
        "guidance": "21 CFR 314.81(b)(2)(iv) (a report of CMC changes made under 314.70 that do not require a supplement, i.e., annual-reportable changes); 21 CFR 314.70; 21 CFR 601.12 for biologics",
        "authoringGuidance": "This reports CMC changes made during the year that qualify as annual-reportable (the lowest-risk tier under 314.70(d) / 601.12(d)) — those not requiring a prior-approval or CBE supplement. Reviewers confirm the applicant correctly classified each change and that none belongs in a higher supplement category. An acceptable section itemizes each change with the affected component/process/specification and confirms the change was validated and consistent with the approved application. Deficiencies: reporting a change here that meets the criteria for a CBE or prior-approval supplement (a misclassification that can trigger compliance action), and vague change descriptions without the affected specification or process.",
        "keyContentElements": [
          "Itemized list of annual-reportable CMC changes made during the period under 314.70(d)/601.12(d)",
          "For each change: the affected component, container/closure, process, or specification",
          "Confirmation each change meets the annual-reportable criteria and does not require a supplement",
          "Statement that changes were made consistent with the approved application and cGMP",
          "Validation/stability support status for each change where applicable",
          "Any editorial or administrative CMC updates",
          "Cross-reference to concurrently filed CBE or prior-approval supplements (if any) so the classification boundary is clear"
        ],
        "generationPrompt": "Draft the CMC changes section (21 CFR 314.81(b)(2)(iv); 314.70) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}}. Itemize annual-reportable CMC changes made during the period, each with the affected component/process/specification, and confirm none requires a supplement. Note validation/stability support and cross-reference any concurrent CBE/PAS supplements. Use bracketed placeholders; do not fabricate manufacturing details."
      },
      {
        "code": "annual.nonclinical_clinical",
        "title": "Nonclinical Laboratory Studies and Clinical Data Summaries",
        "required": true,
        "contentType": "mixed",
        "guidance": "21 CFR 314.81(b)(2)(v) (nonclinical laboratory studies), 314.81(b)(2)(vi) (clinical data — published/unpublished reports, foreign marketing experience, integrated summary of safety where required)",
        "authoringGuidance": "This summarizes new nonclinical laboratory studies (toxicology, carcinogenicity, reproductive) completed during the year, and new clinical data — published and unpublished study reports, safety and effectiveness findings, and relevant foreign marketing experience — bearing on the product. Reviewers read it for new signals that might alter labeling or benefit-risk and to confirm the applicant surveyed the literature and its own studies. An acceptable section states each study's purpose, status, and key safety/efficacy conclusion (or that data are pending), and identifies foreign actions. Deficiencies: omitting relevant published literature, failing to report foreign marketing safety actions, and summaries that do not state the conclusion or its labeling implications.",
        "keyContentElements": [
          "Summary of new nonclinical laboratory studies completed during the period (toxicology, carcinogenicity, reproductive, etc.)",
          "Summary of new clinical data: sponsor studies (completed/ongoing), with population and key findings",
          "Published and unpublished reports of clinical experience pertinent to safety or effectiveness",
          "Relevant foreign marketing experience and any foreign regulatory actions",
          "Whether findings warrant labeling changes or new studies, cross-referenced to the summary section",
          "Status of any required integrated safety analyses",
          "Literature surveillance approach supporting completeness"
        ],
        "generationPrompt": "Draft the nonclinical and clinical data summaries (21 CFR 314.81(b)(2)(v)-(vi)) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}} ({{INDICATION}}). Summarize new nonclinical studies and new clinical data (sponsor studies, literature, foreign marketing experience and actions), stating each study's purpose/status/key conclusion and any labeling implications. Use bracketed placeholders; do not fabricate study results."
      },
      {
        "code": "annual.pmc_pmr_status",
        "title": "Status of Postmarketing Study Commitments and Requirements",
        "required": true,
        "contentType": "mixed",
        "guidance": "21 CFR 314.81(b)(2)(vii) (status of postmarketing study commitments) and 314.81(b)(2)(viii) (status of other postmarketing studies / FDAAA 505(o) requirements); FDAAA Title IX",
        "authoringGuidance": "This reports the status of every postmarketing study commitment (PMC) and postmarketing requirement (PMR, including FDAAA 505(o) required studies and any REMS-related assessments), using the standardized status categories (pending, ongoing, delayed, terminated, submitted, or fulfilled/released). Reviewers track PMR/PMC milestones closely; a missed or unexplained-delayed required study can be a compliance and enforcement matter. An acceptable section gives, per study, the milestone schedule, current status against schedule, and an explanation for any delay. Deficiencies: omitting a PMR, reporting 'ongoing' without milestone dates, and not explaining slippage against the original schedule — each a frequent source of FDA information requests.",
        "keyContentElements": [
          "Complete list of open PMCs and PMRs with unique tracking identifiers",
          "For each: the original milestone schedule (protocol submission, study start, completion, final report submission)",
          "Current status using standardized categories (pending, ongoing, delayed, terminated, submitted, fulfilled)",
          "Status of each milestone against the original schedule with actual/projected dates",
          "Explanation for any delayed or terminated study",
          "FDAAA 505(o) required studies and any REMS assessment status distinguished from voluntary commitments",
          "Statement of any newly established or released commitments during the period"
        ],
        "generationPrompt": "Draft the postmarketing study status section (21 CFR 314.81(b)(2)(vii)-(viii); FDAAA 505(o)) for {{SPONSOR}}'s NDA/BLA Annual Report on {{PRODUCT_NAME}}. Provide a per-study table template listing each PMC/PMR with tracking ID, original milestone schedule, standardized status category, status against schedule, and an explanation for any delay, distinguishing 505(o) required studies from voluntary commitments. Use bracketed placeholders; do not fabricate study statuses."
      }
    ],
    "registryId": "US_NDA_ANNUAL",
    "timing": "Within 60 days of the anniversary date of US approval of the application (the anniversary of the original approval)."
  },
  {
    "id": "nda",
    "label": "New Drug Application (NDA)",
    "category": "application",
    "family": "NDA",
    "agency": "FDA/CDER",
    "description": "A marketing application submitted under section 505(b) of the Federal Food, Drug, and Cosmetic Act and 21 CFR 314.50 requesting FDA approval to market a new drug in the United States. A 505(b)(1) NDA contains full reports of safety and effectiveness generated or owned by the applicant; a 505(b)(2) NDA relies in part on data the applicant does not own (published literature or FDA's prior findings for a listed drug). The application assembles chemistry/manufacturing (Module 3), nonclinical pharmacology-toxicology (Module 4), and clinical (Module 5) data under a CTD structure, supported by Module 1 US regional administrative and labeling documents. Review is governed by PDUFA goal dates and results in Approval, Complete Response, or Refuse-to-File.",
    "regulatoryBasis": [
      "FD&C Act section 505(b)(1) and 505(b)(2)",
      "21 CFR 314.50 (content and format of an NDA)",
      "21 CFR 314.52 / 314.54 (505(b)(2) notice and reliance)",
      "21 CFR 314.101 (filing and RTF)",
      "21 CFR 201.56/201.57 (PLR labeling)",
      "21 CFR 314.81 (postmarketing reports)",
      "ICH M4 (CTD organization)",
      "PDUFA VII commitment letter"
    ],
    "components": [
      {
        "code": "356h",
        "title": "Form FDA 356h - Application to Market a New or Abbreviated New Drug or Biologic",
        "required": true,
        "contentType": "form",
        "guidance": "The signed application form that legally constitutes the NDA, identifying the applicant, product, submission type, and certifying the contents and commitments of the application.",
        "authoringGuidance": "Form FDA 356h is the cover form a reviewer opens first to confirm the application's identity and legal footing. It must correctly state the proposed proprietary and established names, dosage form, strength, route, applicant of record, and the specific submission type (505(b)(1) vs 505(b)(2), original vs resubmission). Reviewers cross-check the checklist of enclosed items against the actual eCTD sections and verify the field-based signature commitments (patent certification, debarment, financial disclosure, GMP/GLP/GCP compliance, and Pediatric Research Equity Act). It is acceptable only when signed by a responsible US official or an authorized US agent for a foreign applicant, with an FEI/DUNS that matches the establishment list. A mismatch between the 356h checkboxes and the assembled submission is a frequent Refuse-to-File and information-request trigger.",
        "keyContentElements": [
          "Proposed proprietary name, established/proper name, dosage form, strength, and route of administration",
          "Application type and submission type (505(b)(1)/505(b)(2); original, amendment, or resubmission)",
          "Applicant name, address, and authorized US agent for foreign applicants",
          "Checklist of application contents mapped to CTD modules 1-5",
          "Certification that studies were conducted under 21 CFR Parts 50, 56, 58, 312",
          "Patent and exclusivity certification statements",
          "Debarment certification under section 306(k)(1)",
          "Financial certification/disclosure statement reference",
          "Pediatric Research Equity Act status statement",
          "Signature, title, date, and telephone/email of the responsible official"
        ],
        "generationPrompt": "Draft the Form FDA 356h narrative fields and accompanying transmittal statements for an original 505(b)(1) NDA for {{PRODUCT_NAME}} indicated for {{INDICATION}}, sponsored by {{SPONSOR}} at development {{PHASE}}. Populate proposed names, dosage form/strength/route placeholders, submission-type selections, and the full set of certification statements (debarment, financial disclosure, patent, PREA), noting each field a signatory must complete and the eCTD location each checklist item maps to."
      },
      {
        "code": "cover-letter",
        "title": "NDA Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "The transmittal letter orienting the FDA review division to the submission, its contents, prior agreements, and any special requests.",
        "authoringGuidance": "The cover letter is the reviewer's orientation to the entire application and sets expectations for the review. It should concisely state the product, indication, submission type, and application number (or request one), and reference the pre-NDA meeting date and any agreements reached (endpoints, statistical analysis plan, ISS/ISE scope). It should flag requested review designations already granted (Fast Track, Breakthrough, Priority Review, Accelerated Approval), any Real-Time Oncology Review or rolling submission components, and cross-reference relevant IND numbers and Type C/pre-submission correspondence. A strong cover letter also lists the regulatory contact, identifies any Agreed Initial Pediatric Study Plan, and states whether a REMS is proposed. Vague letters that omit prior agreements or designation status cause the division to reconstruct history and slow filing.",
        "keyContentElements": [
          "Product name, indication, dosage form/strength, and submission/application type",
          "Cross-reference to IND number(s) and pre-NDA meeting date and minutes",
          "Requested or granted expedited program designations (Fast Track, Breakthrough, Priority Review, Accelerated Approval)",
          "Statement of any Real-Time Oncology Review or rolling review arrangement",
          "Summary of key agreements on endpoints, SAP, and ISS/ISE scope",
          "Proposed REMS status and pediatric plan status",
          "List of any requested meetings or waivers",
          "Regulatory point of contact with direct phone and email",
          "Statement of eCTD sequence and submission format"
        ],
        "generationPrompt": "Write an NDA cover letter from {{SPONSOR}} to the appropriate CDER review division transmitting an original NDA for {{PRODUCT_NAME}} for {{INDICATION}} at {{PHASE}}. Reference the governing IND and pre-NDA meeting, state submission and review-designation status, summarize key agreements on endpoints and integrated summaries, note REMS and pediatric plan status, and provide a regulatory point of contact and eCTD sequence details."
      },
      {
        "code": "toc-index",
        "title": "Comprehensive Table of Contents / eCTD Index",
        "required": true,
        "contentType": "list",
        "guidance": "The navigable index and comprehensive table of contents spanning all five CTD modules that allows a reviewer to locate any section of the application.",
        "authoringGuidance": "The comprehensive index is the map by which every discipline reviewer navigates a multi-thousand-page application, so completeness and hyperlink integrity are load-bearing. It must reflect the eCTD backbone (index.xml / us-regional.xml), provide a granular Module 1 table of contents, and include working bookmarks and hyperlinks to study reports, datasets, and the summaries in Module 2. Reviewers expect leaf-level granularity for clinical study reports (5.3.5.x), CMC drug substance/product sections (3.2.S / 3.2.P), and the ISS/ISE. Acceptability depends on valid eCTD lifecycle operations (new/replace/append) and STF (study tagging file) coherence for datasets. Broken links, missing granularity, or an eCTD technical validation failure will halt the filing clock.",
        "keyContentElements": [
          "eCTD backbone and us-regional.xml consistent with the assembled sequence",
          "Module 1 comprehensive table of contents with hyperlinks",
          "Hyperlinked index to Module 2 summaries (QOS, nonclinical/clinical overviews and summaries)",
          "Leaf-level index to Module 3 CMC sections (3.2.S, 3.2.P, 3.2.A, 3.2.R)",
          "Study tagging files for Module 4 and Module 5 study reports and datasets",
          "Cross-references between ISS/ISE and source study reports",
          "Pagination/bookmark scheme consistent across the submission",
          "eCTD technical validation report confirming zero high-severity errors",
          "Location map for datasets (SDTM/ADaM) and define.xml"
        ],
        "generationPrompt": "Generate a comprehensive CTD table of contents and eCTD navigation index for the {{PRODUCT_NAME}} NDA ({{INDICATION}}, {{SPONSOR}}). Lay out Module 1 US regional items, Module 2 summaries, Module 3 CMC leaf structure (3.2.S/3.2.P), and Module 4/5 study tagging with placeholders for study identifiers, and describe the hyperlink, bookmark, and eCTD validation expectations a reviewer relies on."
      },
      {
        "code": "labeling",
        "title": "Proposed Labeling (PI/PLR, Medication Guide, Container/Carton)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The proposed FDA-regulated labeling including the Prescribing Information in Physician Labeling Rule format, any Medication Guide or patient labeling, and container and carton labels.",
        "authoringGuidance": "Proposed labeling is the ultimate deliverable of the review; every clinical and CMC conclusion must be traceable to a labeling statement. The Prescribing Information must follow the 21 CFR 201.56/201.57 PLR structure with Highlights, Table of Contents, and full prescribing information, and must present only claims supported by adequate and well-controlled data in Module 5. Reviewers read Indications, Dosage and Administration, Warnings and Precautions, and Adverse Reactions against the ISS/ISE and the statistical review, and expect SPL (Structured Product Labeling) format for the electronic version. Patient-directed content (Medication Guide under 21 CFR 208, or PPI) and container/carton labels must be internally consistent and support any REMS. Common deficiencies include claims exceeding the data, missing or misformatted Highlights, inconsistent established pharmacologic class, and adverse-reaction tables that do not reconcile with the ISS.",
        "keyContentElements": [
          "Highlights of Prescribing Information with boxed warning if applicable",
          "Full Prescribing Information in PLR order (Sections 1-17)",
          "Indications and Usage limited to studied populations and endpoints",
          "Dosage and Administration reconciled to clinical pharmacology and trial dosing",
          "Warnings and Precautions and Adverse Reactions traceable to the ISS",
          "Use in Specific Populations reflecting PK, pregnancy (PLLR), and pediatric data",
          "Medication Guide or patient package insert where required by 21 CFR 208",
          "Container and carton labels with established name, strength, and NDC placeholder",
          "SPL-formatted electronic labeling file",
          "Annotated labeling cross-referencing supporting data locations",
          "Clean and annotated (marked) versions"
        ],
        "generationPrompt": "Draft PLR-format Prescribing Information (Highlights plus full sections) and a Medication Guide outline for {{PRODUCT_NAME}} indicated for {{INDICATION}} ({{SPONSOR}}, {{PHASE}}), using placeholders for all quantitative results. Structure sections 1-17 per 21 CFR 201.57, indicate where each claim must trace to Module 5 and the ISS/ISE, and note SPL formatting and annotated-labeling requirements without inventing efficacy or safety numbers."
      },
      {
        "code": "patent-exclusivity",
        "title": "Patent and Exclusivity Information",
        "required": true,
        "contentType": "mixed",
        "guidance": "The patent information for Orange Book listing and any exclusivity claims, including 505(b)(2) patent certifications where the application relies on a listed drug.",
        "authoringGuidance": "This section establishes the intellectual-property and market-exclusivity posture that FDA records in the Orange Book and that governs generic entry. For a 505(b)(1) NDA, the applicant submits patent numbers and expiration dates covering the drug substance, drug product, and approved methods of use on Form FDA 3542/3542a. For a 505(b)(2) NDA, the applicant must additionally provide Paragraph I-IV certifications for each listed patent on the referenced drug and, for Paragraph IV, send statutory notice to the patent owner and NDA holder. Reviewers and the Orange Book staff verify that use codes correspond to labeled indications and that exclusivity claims (NCE, new clinical study three-year, orphan, pediatric, GAIN) are supported. Errors in use-code narratives or missing Paragraph IV notice are common and legally consequential deficiencies.",
        "keyContentElements": [
          "Form FDA 3542a patent information for each drug substance, product, and method-of-use patent",
          "Patent numbers, expiration dates, and submission dates",
          "Use-code narratives matching labeled indications",
          "505(b)(2) patent certifications (Paragraph I-IV) for each listed-drug patent",
          "Paragraph IV notice documentation to patent owner and reference NDA holder",
          "Exclusivity claims (NCE 5-year, 3-year new clinical investigation, orphan, pediatric, GAIN QIDP)",
          "Basis and supporting data location for each exclusivity claim",
          "Reference Listed Drug identity for 505(b)(2) applications",
          "Statement of any patent-term extension under 35 USC 156"
        ],
        "generationPrompt": "Prepare the patent and exclusivity section for the {{PRODUCT_NAME}} NDA ({{INDICATION}}, {{SPONSOR}}). Provide Form 3542a fields with placeholders for patent numbers/expirations and use codes, articulate applicable exclusivity claims (e.g., NCE, 3-year, orphan) with the supporting basis, and, if structured as 505(b)(2), lay out the Paragraph certification options and the Paragraph IV notice obligations."
      },
      {
        "code": "financial-disclosure",
        "title": "Financial Disclosure (Forms FDA 3454 / 3455)",
        "required": true,
        "contentType": "form",
        "guidance": "Certification and disclosure of clinical investigators' financial interests for all covered clinical studies under 21 CFR Part 54.",
        "authoringGuidance": "Financial disclosure lets FDA assess whether investigator financial interests could have biased the pivotal data. Form FDA 3454 certifies the absence of disclosable financial arrangements for covered clinical investigators, while Form FDA 3455 discloses arrangements that exist (equity, proprietary interest, significant payments, compensation tied to outcome) together with the steps taken to minimize bias. The submission must cover every clinical investigator who participated in a covered study contributing to the demonstration of effectiveness, including subinvestigators and their spouses/dependents as required. Reviewers verify that the investigator list reconciles with the clinical study reports and the 1572s, and that any disclosed interest is accompanied by an analysis of its potential impact. Missing investigators, unexplained discrepancies with study-report author lists, and failure to describe bias-mitigation steps are recurring information-request items.",
        "keyContentElements": [
          "Form FDA 3454 certification for investigators with no disclosable interests",
          "Form FDA 3455 disclosure for each investigator with reportable financial interests",
          "Complete list of covered clinical investigators and subinvestigators",
          "Description of each disclosable arrangement (equity, proprietary interest, payments, outcome-based compensation)",
          "Steps taken to minimize potential bias for disclosed interests",
          "Reconciliation of investigator list with study reports and Form FDA 1572s",
          "Certification signed by the applicant's responsible official",
          "Statement of due diligence where information could not be obtained"
        ],
        "generationPrompt": "Create the financial disclosure package (Forms FDA 3454 and 3455) for the pivotal studies supporting the {{PRODUCT_NAME}} NDA ({{INDICATION}}, {{SPONSOR}}). Provide the certification language, a template investigator roster keyed to covered studies, disclosure fields for any reportable interests, and narrative placeholders describing bias-mitigation steps and the reconciliation to clinical study report author lists."
      },
      {
        "code": "debarment-cert",
        "title": "Debarment Certification",
        "required": true,
        "contentType": "narrative",
        "guidance": "The certification required under FD&C Act section 306(k)(1) that no debarred person was used in preparing or developing the application.",
        "authoringGuidance": "The debarment certification is a legal attestation that the application was not prepared with the assistance of any individual debarred under section 306 of the FD&C Act. It must use the statutory language, be signed by a responsible official of the applicant, and, when requested, be accompanied by a list of persons/firms that were involved and could be checked against the debarment list. Reviewers and the Office of Regulatory Policy treat a defective or missing certification as a filing deficiency because it bears on the integrity of the entire submission. Acceptability turns on exact statutory wording and an authorized signature; paraphrased or unsigned certifications are rejected.",
        "keyContentElements": [
          "Statutory certification statement referencing FD&C Act section 306(k)(1)",
          "Affirmation that no debarred individual assisted in preparing the application",
          "Applicant legal name and NDA identifier",
          "Signature and title of a responsible corporate official",
          "Date of certification",
          "List of involved persons/firms if requested by FDA"
        ],
        "generationPrompt": "Draft the debarment certification for the {{PRODUCT_NAME}} NDA submitted by {{SPONSOR}} for {{INDICATION}}, using the exact statutory language of FD&C Act section 306(k)(1), with signature block fields for a responsible official and a note on the optional list of involved parties."
      },
      {
        "code": "user-fee-cover",
        "title": "PDUFA User Fee Cover Sheet (Form FDA 3397)",
        "required": true,
        "contentType": "form",
        "guidance": "The prescription drug user-fee cover sheet identifying the application and the fee status under PDUFA.",
        "authoringGuidance": "The user-fee cover sheet ties the application to payment of the PDUFA program/application fee, without which FDA will not file the NDA. Form FDA 3397 records the payment identification number, fee amount for the fiscal year, and any fee-waiver or exemption claim (e.g., small business, orphan). Reviewers and the user-fee staff confirm the payment has cleared before the 60-day filing determination, so the cover sheet must match the electronic payment record and the fiscal-year fee schedule. Whether the application requires clinical data (which affects the fee) must be stated accurately. Fee discrepancies or unpaid fees place the application on financial hold and stop the review clock.",
        "keyContentElements": [
          "Applicant and product identification consistent with Form 356h",
          "Payment identification number and payment amount for the current fiscal year",
          "Statement of whether the application requires clinical data",
          "Fee category and any waiver, reduction, or exemption claim (small business, orphan)",
          "Cross-reference to the electronic payment record",
          "Applicable PDUFA fiscal-year fee schedule reference",
          "Signature and contact information"
        ],
        "generationPrompt": "Prepare the PDUFA user-fee cover sheet (Form FDA 3397) for the {{PRODUCT_NAME}} NDA from {{SPONSOR}} for {{INDICATION}}. Include fields for payment identification, fee category and current fiscal-year amount placeholder, the clinical-data determination, any waiver/exemption basis, and the reconciliation to the electronic payment record."
      },
      {
        "code": "prea-pediatric",
        "title": "Pediatric Study Plan / PREA Assessment",
        "required": true,
        "contentType": "narrative",
        "guidance": "The pediatric assessment, deferral, or waiver request under the Pediatric Research Equity Act, consistent with the agreed initial Pediatric Study Plan.",
        "authoringGuidance": "This section documents how the applicant meets the Pediatric Research Equity Act obligation to assess safety and effectiveness in relevant pediatric subpopulations for the indication under review. It must present the agreed initial Pediatric Study Plan (iPSP) and any amendments, and either provide the pediatric assessment or justify a deferral (studies to be completed post-approval) or a full/partial waiver (e.g., disease does not occur in children, or studies are impossible/impractical). Reviewers and the Pediatric Review Committee check that the requested action matches the iPSP agreement and that deferral timelines and study designs are specified. For orphan-designated indications the PREA assessment obligation is generally not triggered, which should be stated explicitly. Inconsistency with the iPSP, missing deferral milestones, or an unjustified waiver draws information requests and can affect approvability.",
        "keyContentElements": [
          "Reference to the agreed initial Pediatric Study Plan and any amendments",
          "Pediatric assessment data location or rationale for its absence",
          "Requested action: full assessment, deferral, partial waiver, or full waiver",
          "Justification for any deferral with proposed completion timelines",
          "Justification for any waiver under PREA criteria",
          "Relevant pediatric subpopulations by age and the disease rationale",
          "Statement of orphan-designation impact on PREA applicability",
          "Proposed pediatric study designs, endpoints, and formulations",
          "Cross-reference to labeling Section 8.4 (Pediatric Use)"
        ],
        "generationPrompt": "Draft the PREA pediatric section for the {{PRODUCT_NAME}} NDA ({{INDICATION}}, {{SPONSOR}}, {{PHASE}}). Summarize the agreed iPSP, state the requested action (assessment, deferral, or waiver) with supporting rationale and timelines, identify relevant pediatric age subpopulations, address any orphan-designation impact, and cross-reference the pediatric labeling and post-marketing commitments without fabricating study outcomes."
      },
      {
        "code": "iss",
        "title": "Integrated Summary of Safety (ISS)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The integrated, pooled analysis of safety data across the development program, submitted in Module 5.3.5.3 with a summary in Module 2.7.4.",
        "authoringGuidance": "The ISS is the single most scrutinized safety document in the application because it pools exposure and adverse-event data across studies to detect signals that individual trials underpower. It must define pooling strategies (by dose, population, duration), present total exposure, and analyze deaths, serious adverse events, discontinuations, common adverse reactions, and laboratory/vital-sign/ECG changes, with appropriate subgroup analyses (age, sex, race, renal/hepatic function, intrinsic/extrinsic factors). Reviewers expect the ISS to reconcile exactly with the safety statements in labeling Sections 5 and 6 and with the SDTM/ADaM datasets and define.xml. It should follow ICH E3 conventions for integrated analyses and address any specific safety topics of interest (e.g., cardiovascular, hepatic, malignancy). Common deficiencies include inconsistent pooling rationales, adverse-event tables that do not reconcile with labeling, missing subgroup analyses, and datasets that fail to regenerate the summary tables.",
        "keyContentElements": [
          "Pooling strategy and rationale for study groupings",
          "Extent of exposure (patients, patient-years, dose, duration)",
          "Demographic and baseline characteristics of the pooled safety population",
          "Deaths, serious adverse events, and discontinuations due to adverse events",
          "Common adverse reactions with incidence by treatment arm",
          "Laboratory, vital sign, ECG/QT, and immunogenicity findings as applicable",
          "Subgroup analyses (age, sex, race, organ impairment, intrinsic/extrinsic factors)",
          "Special safety topics of interest and adjudicated events",
          "Drug interaction and overdose safety information",
          "Reconciliation with labeling Sections 5 and 6",
          "Location of SDTM/ADaM datasets and define.xml supporting the analyses"
        ],
        "generationPrompt": "Draft the Integrated Summary of Safety structure for {{PRODUCT_NAME}} in {{INDICATION}} ({{SPONSOR}}, {{PHASE}}). Define the study-pooling strategy, exposure tables, and the analysis framework for deaths/SAEs/discontinuations, common adverse reactions, lab/ECG findings, and prespecified subgroups, using placeholders for all counts and rates, and specify how each output must reconcile with labeling Sections 5 and 6 and with ADaM datasets. Do not invent any safety results."
      },
      {
        "code": "ise",
        "title": "Integrated Summary of Efficacy (ISE)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The integrated analysis of effectiveness across the adequate and well-controlled studies, submitted in Module 5.3.5.3 with a summary in Module 2.7.3.",
        "authoringGuidance": "The ISE consolidates the substantial-evidence case for effectiveness by integrating the pivotal adequate and well-controlled studies and relevant supportive studies. It must state the primary and key secondary endpoints, the statistical analysis and multiplicity control, and present the treatment effect with confidence intervals across the pooled and individual studies, along with consistency across clinically relevant subgroups. Reviewers assess whether the totality of evidence meets the substantial-evidence standard and whether the Indications and Usage and Dosage sections of labeling are fully supported. The ISE should align with ICH E9 (statistical principles), address the estimand and handling of missing data, and reconcile with the ADaM datasets and the statistical review's ability to reproduce results. Common deficiencies include unadjusted multiplicity, post hoc subgroup claims presented as confirmatory, inconsistency between the ISE and the proposed indication, and non-reproducible analyses.",
        "keyContentElements": [
          "Identification of pivotal adequate and well-controlled studies and supportive studies",
          "Primary and key secondary endpoints and the estimand framework",
          "Statistical methods, multiplicity control, and missing-data handling per ICH E9",
          "Pooled and by-study treatment effects with confidence intervals",
          "Consistency of effect across prespecified subgroups",
          "Dose-response and durability/maintenance-of-effect evidence where relevant",
          "Sensitivity analyses supporting robustness of the primary result",
          "Reconciliation with the proposed Indications and Usage and Dosage sections",
          "Location of ADaM datasets, define.xml, and analysis programs",
          "Discussion of the totality of evidence against the substantial-evidence standard"
        ],
        "generationPrompt": "Draft the Integrated Summary of Efficacy framework for {{PRODUCT_NAME}} in {{INDICATION}} ({{SPONSOR}}, {{PHASE}}). Identify the pivotal and supportive studies, articulate the endpoints, estimand, and multiplicity strategy per ICH E9, lay out the pooled and by-study effect presentation and subgroup consistency analyses with placeholders for all estimates, and describe how the analyses support the proposed indication and remain reproducible from ADaM datasets. Do not fabricate efficacy results."
      }
    ],
    "registryId": "US_NDA",
    "timing": "Submitted after successful completion of Phase 3 (or adequate and well-controlled studies establishing effectiveness) and typically following a Pre-NDA meeting; FDA files or issues Refuse-to-File within 60 days of receipt.",
    "ctdSectionCodes": [
      "1",
      "2",
      "3",
      "4",
      "5"
    ]
  },
  {
    "id": "bla",
    "label": "Biologics License Application (BLA)",
    "category": "application",
    "family": "BLA",
    "agency": "FDA/CDER or CBER",
    "description": "A marketing application submitted under section 351(a) of the Public Health Service Act and 21 CFR 601.2 requesting a license to introduce a biological product into interstate commerce. Unlike an NDA, a BLA licenses both the product and the manufacturing establishment, so it must demonstrate that the product is safe, pure, and potent and that the facility meets standards designed to assure continued safety, purity, and potency. The CMC content emphasizes biologic-specific elements: characterization of a complex molecule, comparability across process changes (ICH Q5E), a validated potency (biological activity) assay, viral/adventitious-agent safety, and lot-release and stability protocols. It is organized under the CTD, with clinical safety and effectiveness integrated in Module 5 and summarized in Module 2, and typically includes immunogenicity assessment absent from most small-molecule NDAs.",
    "regulatoryBasis": [
      "PHS Act section 351(a)",
      "21 CFR 601.2 (BLA content and format)",
      "21 CFR 600-610 (biologics standards, general potency 610.10)",
      "21 CFR 201.56/201.57 (PLR labeling)",
      "21 CFR 314.81 (postmarketing reports, applied to BLAs)",
      "ICH Q5E (comparability after manufacturing changes)",
      "ICH Q5A(R2)/Q5B/Q5C/Q5D (viral safety, expression construct, stability, cell substrates)",
      "ICH Q6B (specifications for biotech products)",
      "ICH M4 (CTD organization)",
      "PDUFA VII commitment letter"
    ],
    "components": [
      {
        "code": "356h",
        "title": "Form FDA 356h - Application to Market a New or Abbreviated New Drug or Biologic",
        "required": true,
        "contentType": "form",
        "guidance": "The signed application form constituting the BLA, identifying the biological product, the applicant, and the establishments to be licensed.",
        "authoringGuidance": "For a BLA, Form FDA 356h serves the same legal-identity function as in an NDA but also anchors the establishment-licensing dimension unique to biologics. It must state the proper name of the biological product, dosage form, strength, and route, select the 351(a) BLA submission type, and identify each manufacturing establishment (with FEI numbers) that will be listed on the license. Reviewers verify that the establishments named reconcile with the facilities/establishment description in Module 3 and with the sites FDA will inspect. The same certifications apply (debarment, financial disclosure, PREA, GMP/GLP/GCP), and the signature must be by a responsible US official or authorized US agent. A mismatch between listed establishments and the CMC facility section, or an incomplete FEI set, is a frequent filing deficiency because it disrupts inspection planning.",
        "keyContentElements": [
          "Proper (proprietary and nonproprietary) name of the biological product",
          "Dosage form, strength/concentration, and route of administration",
          "Submission type identified as a 351(a) BLA (original, amendment, or resubmission)",
          "Each manufacturing, testing, and packaging establishment with FEI numbers",
          "Checklist of application contents mapped to CTD modules 1-5",
          "Certifications: debarment, financial disclosure, PREA, GMP/GLP/GCP compliance",
          "Applicant name, address, and authorized US agent for foreign applicants",
          "Signature, title, and date of the responsible official"
        ],
        "generationPrompt": "Draft the Form FDA 356h narrative fields and certifications for an original 351(a) BLA for {{PRODUCT_NAME}} indicated for {{INDICATION}} from {{SPONSOR}} at {{PHASE}}. Populate the proper name, dosage form/strength/route placeholders, list each manufacturing/testing establishment with FEI placeholders to be licensed, and include the debarment, financial disclosure, and PREA certifications, noting how the establishment list must reconcile with the Module 3 facilities section."
      },
      {
        "code": "cover-letter",
        "title": "BLA Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "The transmittal letter orienting the review division to the biologics application, prior agreements, licensed establishments, and any special requests.",
        "authoringGuidance": "The BLA cover letter orients the review division and should call out the biologics-specific elements a reviewer must plan for, especially the establishments requiring pre-license inspection. It states the product, indication, submission type, and BLA/application number, references the pre-BLA meeting and agreements (comparability strategy, potency assay validation status, immunogenicity plan, ISS/ISE scope), and lists expedited designations (Fast Track, Breakthrough, Priority Review, Accelerated Approval, or RMAT for advanced therapies). It should identify each manufacturing site and its readiness for inspection and note whether a REMS is proposed. Because facility licensing is inseparable from product approval, a cover letter that omits site/inspection readiness or comparability status forces the division to reconstruct the CMC posture and slows filing.",
        "keyContentElements": [
          "Product, indication, dosage form/concentration, and 351(a) submission type",
          "Cross-reference to IND number(s) and pre-BLA meeting date and minutes",
          "List of manufacturing/testing establishments and pre-license inspection readiness",
          "Comparability and potency-assay validation status summary",
          "Immunogenicity assessment strategy summary",
          "Expedited program designations, including RMAT if applicable",
          "Proposed REMS and pediatric plan status",
          "Requested meetings, waivers, or facility-inspection scheduling notes",
          "Regulatory point of contact and eCTD sequence details"
        ],
        "generationPrompt": "Write a BLA cover letter from {{SPONSOR}} to the appropriate FDA review division transmitting an original 351(a) BLA for {{PRODUCT_NAME}} for {{INDICATION}} at {{PHASE}}. Reference the IND and pre-BLA meeting, summarize agreements on comparability, potency-assay validation, and immunogenicity, list the establishments to be licensed and their inspection readiness, state expedited-designation and REMS status, and provide a regulatory point of contact."
      },
      {
        "code": "labeling",
        "title": "Proposed Labeling (PI/PLR, Medication Guide, Container/Carton)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The proposed Prescribing Information in PLR format with biologics-specific content (immunogenicity, handling/reconstitution), plus any Medication Guide and container/carton labels.",
        "authoringGuidance": "BLA labeling follows the same 21 CFR 201.56/201.57 PLR structure as an NDA but must incorporate biologic-specific content that reviewers expect. Section 6 must report immunogenicity (anti-drug and neutralizing antibody incidence with assay context), and Dosage and Administration and How Supplied must address reconstitution, dilution, in-use stability, and cold-chain handling. The proper name and, where relevant, the biosimilarity/interchangeability posture (for 351(k), not applicable to an original 351(a)) must be handled correctly, and every efficacy and safety claim must trace to Module 5, the ISS/ISE, and the validated potency framework. Reviewers cross-check the established pharmacologic class, the immunogenicity language against the assay validation, and the handling instructions against stability data. Deficiencies include immunogenicity statements not supported by assay characterization, missing in-use stability/handling instructions, and adverse-reaction tables that do not reconcile with the ISS.",
        "keyContentElements": [
          "Highlights of Prescribing Information with boxed warning if applicable",
          "Full PLR Prescribing Information (Sections 1-17)",
          "Section 6 immunogenicity data with assay context and neutralizing-antibody reporting",
          "Dosage and Administration including reconstitution, dilution, and rate of administration",
          "How Supplied/Storage and Handling with cold-chain and in-use stability instructions",
          "Indications and Usage limited to studied populations and endpoints",
          "Use in Specific Populations reflecting available PK/PD and pregnancy data",
          "Medication Guide or patient labeling where required by 21 CFR 208",
          "Container and carton labels with proper name, strength, and NDC placeholder",
          "SPL-formatted electronic labeling and annotated (marked) version"
        ],
        "generationPrompt": "Draft PLR-format Prescribing Information for the biologic {{PRODUCT_NAME}} indicated for {{INDICATION}} ({{SPONSOR}}, {{PHASE}}), with placeholders for all quantitative results. Include biologic-specific content: Section 6 immunogenicity language tied to assay context, reconstitution/dilution and cold-chain handling in Dosage/Administration and How Supplied, and note where each claim traces to Module 5, the ISS/ISE, and the potency framework. Do not invent efficacy, safety, or immunogenicity numbers."
      },
      {
        "code": "comparability",
        "title": "Comparability Assessment (ICH Q5E)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The demonstration, under ICH Q5E, that product manufactured after process or scale changes remains comparable in quality, safety, and efficacy to the material used in pivotal clinical studies.",
        "authoringGuidance": "The comparability assessment is a defining biologics element with no direct small-molecule NDA analog: because a biologic's quality is defined by its process, any change in manufacturer, site, scale, or process between clinical and commercial material must be shown not to adversely affect the product. Following ICH Q5E, the section must define the changes, present a risk-based comparability protocol, and provide side-by-side analytical, biophysical, and functional (potency) data across pre- and post-change lots, escalating to nonclinical or clinical bridging only where analytical data are insufficient. Reviewers evaluate whether the comparability exercise covers all quality attributes affected by the change, including higher-order structure, glycosylation/post-translational modifications, aggregates, charge variants, and impurities. A robust section maps each change to the attributes at risk and demonstrates that differences fall within pre-defined acceptance ranges. Common deficiencies are incomplete attribute coverage, acceptance criteria set post hoc, missing stability comparability, and reliance on release testing alone without extended characterization.",
        "keyContentElements": [
          "Description of each manufacturing change (site, scale, process, cell bank) and its timing relative to clinical lots",
          "Risk assessment linking each change to potentially affected quality attributes",
          "Pre-specified comparability protocol and acceptance criteria",
          "Side-by-side analytical characterization (primary/higher-order structure, glycosylation, charge/size variants)",
          "Functional/potency comparability across pre- and post-change lots",
          "Purity and impurity/aggregate comparison",
          "Stability comparability including forced-degradation/stress data",
          "Bridging nonclinical or clinical/PK data where analytical data are insufficient",
          "Conclusion mapping results against acceptance ranges per ICH Q5E",
          "Lot genealogy tying comparability lots to clinical and commercial material"
        ],
        "generationPrompt": "Draft an ICH Q5E comparability assessment framework for {{PRODUCT_NAME}} ({{SPONSOR}}, {{PHASE}}) covering the process/site/scale changes between clinical and intended-commercial material. Provide the change description, risk-to-attribute mapping, a pre-specified comparability protocol with acceptance-range placeholders, the analytical/functional/stability side-by-side data structure, and the criteria for escalating to nonclinical or clinical bridging. Do not fabricate analytical results."
      },
      {
        "code": "potency-lot-release",
        "title": "Potency Assay and Lot-Release Protocols",
        "required": true,
        "contentType": "mixed",
        "guidance": "The validated potency (biological activity) assay and the lot-release specifications and protocols demonstrating each lot meets standards of identity, purity, and potency under 21 CFR 610.",
        "authoringGuidance": "Potency and lot release are biologics-specific regulatory requirements: 21 CFR 610.10 requires that each lot of a licensed biologic meet a potency specification reflecting the product's specific ability to effect a given result, ideally through a biological or cell-based assay tied to the mechanism of action. This section must describe the potency assay, its qualification/validation (accuracy, precision, linearity, specificity, robustness, reference-standard qualification), and the release and stability specifications for drug substance and drug product per ICH Q6B. Reviewers assess whether the potency method is stability-indicating and mechanistically relevant, whether the reference standard is properly qualified and its two-tiered strategy defined, and whether the full lot-release panel (identity, content, purity, safety/sterility/endotoxin, potency) is justified. A complete section also addresses the control strategy and any use of a surrogate assay with justification. Common deficiencies include a purely physicochemical surrogate offered without a biological-activity link, inadequate assay validation, poorly qualified reference standards, and specifications not supported by manufacturing and stability data.",
        "keyContentElements": [
          "Description of the potency assay(s) and their link to mechanism of action per 21 CFR 610.10",
          "Assay validation (accuracy, precision, specificity, linearity, range, robustness)",
          "Reference standard qualification and two-tiered reference strategy",
          "Drug substance and drug product release specifications with acceptance criteria (ICH Q6B)",
          "Identity, content/strength, purity, and impurity tests in the release panel",
          "Safety tests: sterility, endotoxin, bioburden, and adventitious-agent testing as applicable",
          "Stability-indicating nature of the potency method and stability specifications",
          "Lot-release protocol and testing flow for each lot",
          "Control strategy linking critical quality attributes to release/in-process controls",
          "Justification for any surrogate or physicochemical potency measure"
        ],
        "generationPrompt": "Draft the potency assay and lot-release section for the biologic {{PRODUCT_NAME}} ({{SPONSOR}}, {{PHASE}}). Describe a mechanism-relevant potency assay and its validation, the reference-standard qualification strategy, and the drug substance and drug product release specifications (identity, content, purity, safety, potency) per 21 CFR 610 and ICH Q6B, with acceptance-criteria placeholders and a lot-release testing flow. Do not invent assay values."
      },
      {
        "code": "establishment-facilities",
        "title": "Establishment Description and Facilities (Module 3.2.A.1)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The description of each manufacturing, testing, and storage establishment to be licensed, supporting pre-license inspection and the establishment-licensing element of a BLA.",
        "authoringGuidance": "Because a BLA licenses the establishment as well as the product, the facilities section is a core regulatory deliverable with no equivalent weight in a typical NDA. It must describe each manufacturing, testing, packaging, and storage site (with FEI numbers), the equipment and process flow, contamination-control and segregation strategy, and the approach to preventing cross-contamination and assuring aseptic processing where relevant. Reviewers and the inspection team use this section to plan the pre-license inspection and to confirm the sites reconcile with Form 356h and the batch records. For products with viral-safety concerns, the section supports the adventitious-agent control strategy and facility segregation described elsewhere in Module 3. A complete section addresses environmental monitoring, utilities (water, HVAC), and multi-product facility controls. Common deficiencies include incomplete site lists, process-flow diagrams inconsistent with batch records, and inadequate description of contamination control or aseptic-processing controls that then surface as inspection findings.",
        "keyContentElements": [
          "List of all establishments (manufacture, test, package, store) with addresses and FEI numbers",
          "Role/function of each site and reconciliation with Form 356h",
          "Process flow diagrams for drug substance and drug product",
          "Facility layout, personnel/material flow, and segregation strategy",
          "Contamination and cross-contamination control, including aseptic processing controls",
          "Environmental monitoring program and utility qualification (water, HVAC, gases)",
          "Multi-product facility controls and changeover procedures where applicable",
          "Adventitious-agent/viral segregation controls supporting the safety strategy",
          "Equipment list and qualification status",
          "Readiness statement supporting pre-license inspection"
        ],
        "generationPrompt": "Draft the establishment description and facilities section (Module 3.2.A.1) for the {{PRODUCT_NAME}} BLA ({{SPONSOR}}, {{PHASE}}). Provide a template listing each manufacturing/testing/storage establishment with FEI placeholders, process-flow and facility-layout descriptions, contamination-control and aseptic-processing controls, environmental monitoring and utilities, and multi-product controls, structured to support pre-license inspection and to reconcile with Form 356h."
      },
      {
        "code": "iss",
        "title": "Integrated Summary of Safety (ISS)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The integrated, pooled analysis of safety across the biologics development program, including immunogenicity, submitted in Module 5.3.5.3 with a summary in Module 2.7.4.",
        "authoringGuidance": "As in an NDA, the ISS pools safety data across studies, but for a biologic it must give particular attention to immunogenicity and infusion/injection-related reactions that are characteristic of protein and cell/gene products. It must define pooling strategies, present total exposure, and analyze deaths, serious adverse events, discontinuations, common adverse reactions, and product-class risks (hypersensitivity, infusion reactions, anti-drug antibody consequences on safety, and any malignancy or infection risks for immunomodulators). Reviewers expect the immunogenicity analysis to link antibody incidence to clinical safety and to the assay characterization, and the ISS to reconcile with labeling Sections 5 and 6 and the ADaM datasets. It should follow ICH E3 conventions for integrated analyses and include the relevant subgroup analyses. Common deficiencies include immunogenicity impact not analyzed against safety outcomes, inconsistent pooling, adverse-event tables that do not reconcile with labeling, and non-reproducible datasets.",
        "keyContentElements": [
          "Pooling strategy and rationale for study groupings",
          "Extent of exposure (patients, patient-years, dose, duration)",
          "Deaths, serious adverse events, and discontinuations due to adverse events",
          "Common adverse reactions with incidence by treatment arm",
          "Immunogenicity: anti-drug/neutralizing antibody incidence and impact on safety",
          "Hypersensitivity and infusion/injection-site reaction analysis",
          "Product-class risks (infection, malignancy) where applicable to the mechanism",
          "Laboratory, vital sign, and ECG findings as applicable",
          "Subgroup analyses (age, sex, race, organ impairment, antibody status)",
          "Reconciliation with labeling Sections 5 and 6",
          "Location of SDTM/ADaM datasets and define.xml"
        ],
        "generationPrompt": "Draft the Integrated Summary of Safety structure for the biologic {{PRODUCT_NAME}} in {{INDICATION}} ({{SPONSOR}}, {{PHASE}}). Define the pooling strategy and exposure tables, the analysis of deaths/SAEs/discontinuations and common adverse reactions, and biologic-specific analyses of immunogenicity impact, hypersensitivity, and infusion reactions, using placeholders for all counts and rates and specifying reconciliation with labeling Sections 5 and 6 and ADaM datasets. Do not invent safety results."
      },
      {
        "code": "ise",
        "title": "Integrated Summary of Efficacy (ISE)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The integrated analysis of effectiveness across the adequate and well-controlled studies supporting the biologic, submitted in Module 5.3.5.3 with a summary in Module 2.7.3.",
        "authoringGuidance": "The ISE for a BLA integrates the pivotal adequate and well-controlled studies to establish substantial evidence of effectiveness, and where relevant addresses whether anti-drug antibodies attenuate efficacy over time. It must state the primary and key secondary endpoints, the statistical analysis and multiplicity control, and present pooled and by-study treatment effects with confidence intervals and subgroup consistency. Reviewers evaluate the totality of evidence against the substantial-evidence standard and confirm the proposed Indications and Usage and Dosage sections are supported, aligning the analysis with ICH E9 and confirming reproducibility from the ADaM datasets. For biologics, durability of effect and any dose/exposure-response relationship (including the impact of immunogenicity on exposure) are frequently pivotal. Common deficiencies include unadjusted multiplicity, post hoc subgroup claims, inconsistency between the ISE and the proposed indication, and analyses that the statistical reviewer cannot reproduce.",
        "keyContentElements": [
          "Identification of pivotal adequate and well-controlled studies and supportive studies",
          "Primary and key secondary endpoints and the estimand framework",
          "Statistical methods, multiplicity control, and missing-data handling per ICH E9",
          "Pooled and by-study treatment effects with confidence intervals",
          "Consistency of effect across prespecified subgroups",
          "Durability/maintenance-of-effect and dose/exposure-response evidence",
          "Impact of immunogenicity/anti-drug antibodies on efficacy where relevant",
          "Sensitivity analyses supporting robustness of the primary result",
          "Reconciliation with the proposed Indications and Usage and Dosage sections",
          "Location of ADaM datasets, define.xml, and analysis programs"
        ],
        "generationPrompt": "Draft the Integrated Summary of Efficacy framework for the biologic {{PRODUCT_NAME}} in {{INDICATION}} ({{SPONSOR}}, {{PHASE}}). Identify pivotal and supportive studies, articulate endpoints, estimand, and multiplicity strategy per ICH E9, lay out pooled and by-study effect presentation, subgroup consistency, durability and exposure-response including any immunogenicity impact on efficacy, with placeholders for all estimates, and describe reproducibility from ADaM datasets. Do not fabricate efficacy results."
      }
    ],
    "registryId": "US_BLA",
    "timing": "Submitted after pivotal clinical studies and process/commercial-scale validation are complete, typically following a Pre-BLA meeting; FDA files or issues Refuse-to-File within 60 days and a pre-license inspection of manufacturing facilities is scheduled during review.",
    "ctdSectionCodes": [
      "1",
      "2",
      "3",
      "4",
      "5"
    ]
  },
  {
    "id": "nda_pas",
    "label": "Prior Approval Supplement (PAS)",
    "category": "supplement",
    "family": "SUPPLEMENT",
    "agency": "FDA",
    "description": "A supplement to an approved NDA/BLA proposing a change that requires FDA review and approval BEFORE the change is implemented in a distributed product, submitted under 21 CFR 314.70(b). Used for major changes with substantial potential to adversely affect identity, strength, quality, purity, or potency as they relate to safety or effectiveness (e.g., new or reworked manufacturing site, new drug substance supplier for a narrow-therapeutic-index or complex product, changes to the qualitative/quantitative formulation, container-closure changes for sterile products, extension of expiry beyond supported real-time data, and most labeling changes that broaden the indication or claims).",
    "regulatoryBasis": [
      "21 CFR 314.70(a)",
      "21 CFR 314.70(b)",
      "21 CFR 314.71",
      "21 CFR 314.72",
      "FDA Guidance: Changes to an Approved NDA or ANDA (Apr 2004)",
      "FDA Guidance: CMC Postapproval Manufacturing Changes To Be Documented in Annual Reports (Mar 2014)",
      "ICH Q12: Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management",
      "ICH Q8(R2)/Q9(R1)/Q10/Q11",
      "PDUFA program fee provisions (FD&C Act sec. 736)"
    ],
    "components": [
      {
        "code": "PAS-COVER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal letter identifying the application, the exact change proposed, the regulatory category (Prior Approval Supplement under 314.70(b)), and a concise navigation aid to the submission.",
        "authoringGuidance": "The cover letter is the reviewer's first orientation and the record of what regulatory commitment is being made; it must state the NDA/BLA number, product proprietary and established name, dosage form and strength, applicant name, and an unambiguous one-paragraph description of the change. State explicitly that the submission is a Prior Approval Supplement under 21 CFR 314.70(b) and, where relevant, cite the change-classification guidance the applicant relied upon. A CMC reviewer reads this to confirm the change is correctly categorized as prior-approval rather than CBE or Annual Report; mis-categorization is the single most common cause of a refuse-to-file or reclassification action. Note any linked or concurrently submitted supplements, expedited-review requests, and prior Agency interactions (meeting minutes, Type A/B/C, or advice letters) by date.",
        "keyContentElements": [
          "NDA/BLA number, supplement type, and product identity (proprietary + established name, dosage form, strength)",
          "One-paragraph plain-language statement of the change being requested",
          "Explicit statement of regulatory basis: Prior Approval Supplement, 21 CFR 314.70(b)",
          "Change-classification rationale with citation to the applicable FDA change guidance",
          "List of all modules/sections updated with hyperlinked navigation",
          "Cross-reference to prior related supplements and any Agency meeting or advice on the change",
          "Statement of any requested expedited review or field-alert linkage",
          "Applicant contact, authorized representative, and U.S. agent (if foreign applicant)"
        ],
        "generationPrompt": "Draft a Prior Approval Supplement cover letter for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Identify the NDA/BLA, state the specific change, cite 21 CFR 314.70(b), justify the prior-approval classification against FDA change guidance, and list every module updated. Do not invent the NDA number or change details; insert bracketed placeholders where specific facts are required."
      },
      {
        "code": "PAS-356H",
        "title": "Form FDA 356h",
        "required": true,
        "contentType": "form",
        "guidance": "Application to Market a New or Abbreviated New Drug or Biologic for Human Use; the signed regulatory checklist and certification cover form for the supplement.",
        "authoringGuidance": "Form FDA 356h is the legal signature page binding the applicant to the submission and its certifications; box the 'Supplement' application type and identify the establishment(s) involved in the change. The checklist section must accurately reflect which CTD modules are included so the reviewer can reconcile the form against the submitted content. It is signed by the applicant or the authorized U.S. agent and carries the debarment and application-integrity certifications. Reviewers treat a mismatch between the 356h content checklist and the actual submission as a filing deficiency, and an unsigned or improperly delegated 356h can stop the review clock.",
        "keyContentElements": [
          "Application type marked as 'Supplement' with NDA/BLA number",
          "Product name, dosage form, strength, and proposed indication (unchanged for CMC-only PAS)",
          "Establishment name(s), FEI/registration numbers, and function for each facility in the change",
          "CTD module content checklist reconciled to the actual submission",
          "Debarment certification under FD&C Act 306(k)(1)",
          "Financial certification/disclosure statements referenced (Form FDA 3454/3455) where clinical data support the change",
          "Signature of applicant or authorized U.S. agent with printed name, title, and date"
        ],
        "generationPrompt": "Prepare the Form FDA 356h content and certification checklist for a Prior Approval Supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. Mark application type Supplement, list the manufacturing establishment(s) affected by the change with placeholders for FEI numbers, and reconcile the module checklist to a CMC change. Flag every field requiring a real signature or facility identifier as a bracketed placeholder."
      },
      {
        "code": "PAS-SUMMARY",
        "title": "Summary and Description of the Change",
        "required": true,
        "contentType": "mixed",
        "guidance": "A structured before-and-after description of the change, the affected components/processes/specifications, and the rationale, with a bridging assessment demonstrating no adverse impact on product quality, safety, or effectiveness.",
        "authoringGuidance": "This is the analytical core the reviewer reads to decide whether the change is supported; it must present the current (approved) state and the proposed state side by side, the reason for the change, and the data package that bridges them (comparability, stability, validation, or clinical bridging as applicable). Frame the assessment around the identity/strength/quality/purity/potency risk logic of 314.70 and, where the applicant has an approved post-approval change management protocol or ICH Q12 established conditions, reference them explicitly. A reviewer looks for a clear risk assessment, a defined set of established conditions that are (or are not) changing, and evidence that acceptance criteria continue to be met. Omitting a comparability protocol, providing stability on too few batches, or failing to address downstream impact on other approved products manufactured at the site are the deficiencies that most often trigger an information request.",
        "keyContentElements": [
          "Approved (current) condition vs. proposed condition presented in parallel",
          "Reason and business/quality driver for the change",
          "Identification of affected established conditions and specifications",
          "Risk assessment tied to identity, strength, quality, purity, potency (safety/effectiveness)",
          "Comparability/bridging data summary (analytical, process validation, dissolution, stability)",
          "Real-time and, where relevant, accelerated stability supporting proposed expiry/storage",
          "Cross-reference to updated Module 3 sections (3.2.S / 3.2.P) with change bars",
          "Statement of any approved PACMP or ICH Q12 established-conditions reliance",
          "Assessment of impact on other products or shared facilities/equipment"
        ],
        "generationPrompt": "Write the Summary and Description of the Change for a Prior Approval Supplement to {{SPONSOR}}'s {{PRODUCT_NAME}} ({{PHASE}} commercial). Present approved-vs-proposed conditions in a parallel table, state the rationale, define the risk assessment under 21 CFR 314.70, and describe WHERE the comparability, validation, and stability bridging data reside in Module 3. Do not fabricate results; use placeholders for batch numbers, acceptance criteria, and stability durations."
      },
      {
        "code": "PAS-LABELING",
        "title": "Labeling (Annotated and Clean)",
        "required": false,
        "contentType": "mixed",
        "guidance": "Proposed Prescribing Information and other labeling in clean and annotated (redline) form when the change affects labeling; includes SPL-formatted content and side-by-side comparison to currently approved labeling.",
        "authoringGuidance": "Include this component only when the PAS changes labeling (e.g., a manufacturing change that alters a storage statement, or an efficacy/indication change). Provide both a clean version and an annotated version that redlines every change against the currently approved PI, with each change traceable to its supporting data source. Reviewers in OND and the labeling review team compare the annotated copy line-by-line and expect the source (clinical study, CMC data, safety analysis) for every edit to be identified. Submit in the required electronic SPL format; unhighlighted changes, edits not supported by data in the supplement, or failure to carry the change through all labeling pieces (PI, patient labeling, carton/container) generate labeling deficiencies.",
        "keyContentElements": [
          "Clean proposed Prescribing Information in current PLR/PLLR format",
          "Annotated (redlined) PI comparing proposed to currently approved labeling",
          "Source citation for each proposed change (study, CMC, or safety basis)",
          "Patient labeling (Medication Guide/PPI/Instructions for Use) if affected",
          "Carton and container labeling if affected",
          "SPL-formatted electronic labeling files",
          "Statement confirming consistency across all labeling components"
        ],
        "generationPrompt": "Produce annotated and clean Prescribing Information for a labeling-affecting Prior Approval Supplement to {{SPONSOR}}'s {{PRODUCT_NAME}} for {{INDICATION}}. Redline each change against the approved PI and cite its data source. Do not invent clinical or safety statements; insert bracketed placeholders for values and study references, and note where SPL files must be attached."
      },
      {
        "code": "PAS-ENV",
        "title": "Environmental Assessment or Categorical Exclusion Claim",
        "required": true,
        "contentType": "narrative",
        "guidance": "A claim of categorical exclusion under 21 CFR 25.31 or, where an exclusion does not apply, a full Environmental Assessment under 21 CFR 25.40.",
        "authoringGuidance": "Every supplement must address NEPA; most CMC PAS submissions qualify for a categorical exclusion under 21 CFR 25.31 and require only a short statement claiming the exclusion and affirming no extraordinary circumstances (25.21). Where the change increases use such that expected environmental concentrations rise, or an exclusion otherwise does not apply, a full Environmental Assessment is required. A reviewer confirms the correct citation is invoked and that the applicant affirmatively states no extraordinary circumstances exist; a missing or incorrectly cited exclusion is a routine, easily avoided deficiency.",
        "keyContentElements": [
          "Citation of the specific categorical exclusion (e.g., 21 CFR 25.31(a)/(b)) OR",
          "Full Environmental Assessment content per 21 CFR 25.40 when exclusion is unavailable",
          "Affirmative statement that no extraordinary circumstances exist under 21 CFR 25.21",
          "Basis for the exclusion tied to the nature of the change",
          "Signature/attestation as applicable"
        ],
        "generationPrompt": "Draft the environmental section for a Prior Approval Supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. If the change qualifies, claim the categorical exclusion under 21 CFR 25.31 and affirm no extraordinary circumstances under 25.21; otherwise outline the Environmental Assessment structure under 25.40. State facts only where known and use placeholders otherwise."
      },
      {
        "code": "PAS-FEE",
        "title": "Program/User Fee Cover Sheet and Field Copy Certification",
        "required": true,
        "contentType": "form",
        "guidance": "PDUFA fee determination documentation (Form FDA 3397 where a supplement fee applies) and, for supplements requiring on-site inspection support, the Field Copy Certification.",
        "authoringGuidance": "Confirm the PDUFA fee status: many efficacy supplements incur a supplement application fee while CMC-only supplements typically do not, but the applicant must document the determination and include the cover sheet where a fee is due to avoid a fee-related refusal. When the change affects manufacturing subject to pre-approval or surveillance inspection, include the Field Copy Certification affirming that a true copy of the CMC technical sections was provided to the applicable district/field office. A reviewer and the user-fee staff verify fee payment before the review clock starts; an unpaid required fee places the supplement on financial hold.",
        "keyContentElements": [
          "Fee determination: whether a supplement fee applies and the basis",
          "Form FDA 3397 user fee cover sheet with payment identifier (when a fee is due)",
          "Field Copy Certification statement and signature (when inspection-relevant)",
          "Cross-reference to establishment(s) subject to inspection",
          "Statement of any small-business or fee-waiver status claimed"
        ],
        "generationPrompt": "Prepare the user-fee and field-copy documentation for a Prior Approval Supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. State the PDUFA fee determination and, if applicable, the Form FDA 3397 fields and Field Copy Certification language. Use placeholders for payment identifiers and facility names; do not assert a fee status you cannot determine."
      }
    ],
    "registryId": "US_NDA_SUPP",
    "timing": "Submit and obtain FDA approval BEFORE distributing product made with the change. FDA review clock is 4 months (major change) unless designated for a different classification; user must not distribute until an approval letter issues.",
    "ctdSectionCodes": [
      "1.2",
      "1.3",
      "1.14.1",
      "3.2.S",
      "3.2.P",
      "3.2.A",
      "3.2.R"
    ]
  },
  {
    "id": "cbe_30",
    "label": "Changes Being Effected in 30 Days Supplement (CBE-30)",
    "category": "supplement",
    "family": "SUPPLEMENT",
    "agency": "FDA",
    "description": "A supplement to an approved NDA/BLA for a moderate change that the applicant may implement 30 days after FDA receives the supplement, submitted under 21 CFR 314.70(c)(3). Used for moderate manufacturing, process, specification, container-closure, and certain labeling changes that have a moderate potential to adversely affect identity, strength, quality, purity, or potency. The applicant may distribute product 30 days after FDA receipt unless FDA notifies the applicant within that period that a Prior Approval Supplement is required or that information is missing.",
    "regulatoryBasis": [
      "21 CFR 314.70(a)",
      "21 CFR 314.70(c)",
      "21 CFR 314.70(c)(3)",
      "21 CFR 314.70(c)(4)",
      "FDA Guidance: Changes to an Approved NDA or ANDA (Apr 2004)",
      "FDA Guidance: CMC Postapproval Manufacturing Changes To Be Documented in Annual Reports (Mar 2014)",
      "SUPAC guidances (IR, MR, SS) where applicable",
      "ICH Q12 established-conditions framework"
    ],
    "components": [
      {
        "code": "CBE30-COVER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal letter identifying the application and stating clearly that the submission is a Changes Being Effected in 30 Days supplement under 21 CFR 314.70(c)(3), with the intended implementation date.",
        "authoringGuidance": "The cover letter must prominently label the submission 'Supplement - Changes Being Effected in 30 Days (314.70(c)(3))' so it is routed and clocked correctly; state the NDA/BLA number, product identity, the change, and the earliest intended distribution date (30 days after receipt). Because the applicant self-classifies the change as moderate, the letter should briefly justify why the change qualifies as CBE-30 rather than prior approval, citing the applicable guidance. Reviewers use the 30-day window to decide whether to reclassify to PAS; an ambiguous classification statement or a change that is actually major invites a reclassification letter that halts implementation.",
        "keyContentElements": [
          "Explicit label: Changes Being Effected in 30 Days supplement, 21 CFR 314.70(c)(3)",
          "NDA/BLA number and product identity",
          "One-paragraph description of the change and its moderate classification rationale",
          "Intended implementation/distribution date (>=30 days after FDA receipt)",
          "Citation to the guidance supporting CBE-30 categorization",
          "List of updated modules with navigation",
          "Cross-reference to related supplements and prior Agency interactions",
          "Applicant and U.S. agent contact information"
        ],
        "generationPrompt": "Draft a CBE-30 cover letter for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Label it a Changes Being Effected in 30 Days supplement under 21 CFR 314.70(c)(3), describe the moderate change, justify the classification with a guidance citation, and state the intended implementation date. Use placeholders for the NDA number and specific dates."
      },
      {
        "code": "CBE30-356H",
        "title": "Form FDA 356h",
        "required": true,
        "contentType": "form",
        "guidance": "Signed application form with 'Supplement' marked, the affected establishments identified, and the module content checklist reconciled to the submission.",
        "authoringGuidance": "As with any supplement, the 356h is the signed legal cover and certification; mark 'Supplement,' identify the establishment(s) implementing the change, and reconcile the content checklist to the actual modules. The applicant's signature carries the debarment and integrity certifications. Because CBE-30 changes are frequently CMC and inspection-relevant, ensure facility FEI numbers are accurate so the change can be linked to the establishment's inspection history. A checklist that overstates or understates included content is a filing-quality issue.",
        "keyContentElements": [
          "Application type 'Supplement' with NDA/BLA number",
          "Establishment name(s), FEI/registration numbers, and function",
          "CTD content checklist reconciled to the submission",
          "Debarment certification under FD&C Act 306(k)(1)",
          "Product identity fields (unchanged for CMC-only changes)",
          "Authorized signature, printed name, title, and date"
        ],
        "generationPrompt": "Prepare Form FDA 356h for a CBE-30 supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. Mark Supplement, list the manufacturing establishment(s) with placeholder FEI numbers, and reconcile the module checklist to a moderate CMC change. Bracket all fields requiring real identifiers or signatures."
      },
      {
        "code": "CBE30-CHANGE",
        "title": "Description and Justification of the Change",
        "required": true,
        "contentType": "mixed",
        "guidance": "Before/after description of the moderate change with the supporting data (validation, comparability, dissolution, stability) and an explicit justification that the change meets the criteria for a moderate (CBE-30) rather than major (PAS) change.",
        "authoringGuidance": "This section documents the applicant's self-classification and its evidentiary basis; present the approved and proposed conditions side by side and the data that show product quality is maintained. Anchor the moderate-change justification in the relevant guidance (e.g., SUPAC levels, the 2004 changes guidance) and, for solid orals, present comparative dissolution; for other dosage forms, present the appropriate comparability endpoints. Include stability data adequate to support the change and the current expiry. Reviewers assessing the 30-day window look for whether the risk truly is moderate and whether acceptance criteria are met; insufficient stability, missing comparative dissolution, or a change that touches a critical established condition are the classic triggers for reclassification to PAS.",
        "keyContentElements": [
          "Approved vs. proposed condition in parallel form",
          "Justification that the change is moderate under the applicable guidance/SUPAC level",
          "Comparability data appropriate to dosage form (dissolution profiles, analytical comparability)",
          "Process validation status for the changed step(s)",
          "Stability data supporting the change and current expiry",
          "Impact assessment on established conditions and specifications",
          "Cross-reference to updated Module 3 sections with change bars",
          "Confirmation that release and stability acceptance criteria remain met"
        ],
        "generationPrompt": "Write the Description and Justification of the Change for a CBE-30 supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. Present approved-vs-proposed conditions, justify the moderate classification against the 2004 changes guidance/SUPAC, and describe WHERE comparability, validation, and stability data reside. Do not fabricate results; use placeholders for batches, criteria, and durations."
      },
      {
        "code": "CBE30-LABELING",
        "title": "Labeling (Annotated and Clean)",
        "required": false,
        "contentType": "mixed",
        "guidance": "Clean and annotated labeling when the CBE-30 change affects labeling (e.g., certain safety-related additions permitted under CBE, storage statement changes), in SPL format.",
        "authoringGuidance": "Include only when the change affects labeling. Certain safety-related labeling strengthenings (adding or strengthening a warning, precaution, or adverse reaction) may be filed as changes being effected; provide both clean and redlined PI with each edit traceable to its data source. Reviewers compare the annotated copy against the approved PI and expect supporting safety data or CMC basis for each change; edits that broaden indications or make efficacy claims are NOT eligible for CBE and must be prior-approval. Failing to carry a change through all labeling pieces or providing edits unsupported by data are common deficiencies.",
        "keyContentElements": [
          "Clean proposed PI in current format",
          "Annotated PI redlined against approved labeling",
          "Data source citation for each change",
          "Confirmation that the change is CBE-eligible (safety strengthening or CMC-driven, not indication/efficacy broadening)",
          "Patient labeling and carton/container labeling if affected",
          "SPL-formatted electronic files"
        ],
        "generationPrompt": "Produce annotated and clean labeling for a labeling-affecting CBE-30 supplement to {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Redline each change, cite its basis, and confirm CBE eligibility (safety strengthening or CMC-driven). Use placeholders for values and study references; note where SPL files attach."
      },
      {
        "code": "CBE30-ENV",
        "title": "Categorical Exclusion Claim or Environmental Assessment",
        "required": true,
        "contentType": "narrative",
        "guidance": "Claim of categorical exclusion under 21 CFR 25.31 with a no-extraordinary-circumstances statement, or a full Environmental Assessment under 25.40 where an exclusion does not apply.",
        "authoringGuidance": "The NEPA requirement applies to CBE-30 supplements as it does to any supplement; most moderate CMC changes qualify for a categorical exclusion under 21 CFR 25.31 and need only a short claim plus affirmation of no extraordinary circumstances under 25.21. Cite the precise exclusion. A full EA is required only when the exclusion does not apply. Reviewers routinely check that the correct citation is present; an omitted or mis-cited exclusion is an avoidable deficiency.",
        "keyContentElements": [
          "Specific categorical exclusion citation (21 CFR 25.31) OR full EA under 25.40",
          "Affirmation of no extraordinary circumstances (21 CFR 25.21)",
          "Basis for exclusion tied to the change",
          "Attestation/signature as applicable"
        ],
        "generationPrompt": "Draft the environmental section for a CBE-30 supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. Claim the categorical exclusion under 21 CFR 25.31 and affirm no extraordinary circumstances under 25.21, or outline an EA under 25.40 if unavailable. State facts only where known; use placeholders otherwise."
      }
    ],
    "registryId": "US_CBE",
    "timing": "Product may be distributed 30 days after FDA receives the supplement, provided FDA has not, within 30 days of receipt, informed the applicant that the change requires prior approval or that the submission is deficient. Applicant bears the risk if FDA later disapproves.",
    "ctdSectionCodes": [
      "1.2",
      "1.3",
      "1.14.1",
      "3.2.S",
      "3.2.P",
      "3.2.A",
      "3.2.R"
    ]
  },
  {
    "id": "cbe_0",
    "label": "Changes Being Effected Supplement (CBE-0, Immediate)",
    "category": "supplement",
    "family": "SUPPLEMENT",
    "agency": "FDA",
    "description": "A supplement to an approved NDA/BLA for a change the applicant may implement immediately upon FDA receipt, submitted under 21 CFR 314.70(c) (the immediate CBE, commonly 'CBE-0'). Used for a defined set of moderate changes for which contemporaneous distribution is permitted, and most notably for safety-related labeling changes that add or strengthen a contraindication, warning, precaution, or adverse reaction, or add an instruction to enhance safe use. FDA retains authority to disapprove the change after review, in which case affected distributed product may be subject to action.",
    "regulatoryBasis": [
      "21 CFR 314.70(a)",
      "21 CFR 314.70(c)",
      "21 CFR 314.70(c)(6)",
      "21 CFR 314.70(c)(6)(iii)",
      "FDA Guidance: Changes to an Approved NDA or ANDA (Apr 2004)",
      "FDA Guidance: Safety Labeling Changes - Implementation of Section 505(o)(4) (Jul 2013)",
      "FD&C Act sec. 505(o)(4)",
      "21 CFR 201.57 (labeling content and format)"
    ],
    "components": [
      {
        "code": "CBE0-COVER",
        "title": "Cover Letter",
        "required": true,
        "contentType": "narrative",
        "guidance": "Transmittal letter labeling the submission a Changes Being Effected supplement under 21 CFR 314.70(c) implemented immediately (CBE-0), stating the change and the date of implementation.",
        "authoringGuidance": "The cover letter must clearly label the submission as an immediate Changes Being Effected supplement under 21 CFR 314.70(c) and, for safety labeling changes, note whether it is applicant-initiated or responsive to an FDA Section 505(o)(4) safety-labeling-change notification. State the NDA/BLA number, product identity, the specific change, and that the change is being implemented on receipt. Because CBE-0 is reserved for a narrow set of eligible changes, briefly justify eligibility with the applicable citation. Reviewers verify eligibility immediately; a change filed as CBE-0 that is not eligible (e.g., an efficacy or indication change) will draw a reclassification or disapproval action.",
        "keyContentElements": [
          "Explicit label: Changes Being Effected supplement, 21 CFR 314.70(c), implemented on receipt (CBE-0)",
          "NDA/BLA number and product identity",
          "Description of the change (typically a safety labeling strengthening)",
          "Eligibility justification with citation (e.g., 314.70(c)(6)(iii))",
          "Whether the change responds to an FDA 505(o)(4) notification or is applicant-initiated",
          "Implementation date and confirmation of concurrent distribution",
          "List of updated modules with navigation",
          "Applicant and U.S. agent contact information"
        ],
        "generationPrompt": "Draft a CBE-0 cover letter for {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Label it an immediate Changes Being Effected supplement under 21 CFR 314.70(c), describe the safety-related labeling change, justify eligibility, and state that it is implemented on receipt. Indicate whether it responds to a 505(o)(4) notice. Use placeholders for the NDA number and dates."
      },
      {
        "code": "CBE0-356H",
        "title": "Form FDA 356h",
        "required": true,
        "contentType": "form",
        "guidance": "Signed application form with 'Supplement' marked and the content checklist reconciled to the submission.",
        "authoringGuidance": "The 356h provides the signed legal cover and certifications for the CBE-0; mark 'Supplement,' identify the NDA/BLA, and reconcile the content checklist. For a labeling-only CBE-0 the CMC establishment fields are typically unchanged, but the debarment and integrity certifications still apply and the form must be properly signed by the applicant or U.S. agent. Reviewers reconcile the checklist against the actual submission as a filing-quality check.",
        "keyContentElements": [
          "Application type 'Supplement' with NDA/BLA number",
          "Product identity fields",
          "Content checklist reconciled to submitted modules (labeling and any supporting safety module)",
          "Debarment certification under FD&C Act 306(k)(1)",
          "Establishment fields where a CMC change is involved (else unchanged)",
          "Authorized signature, printed name, title, and date"
        ],
        "generationPrompt": "Prepare Form FDA 356h for a CBE-0 supplement to {{SPONSOR}}'s {{PRODUCT_NAME}}. Mark Supplement, reconcile the checklist to a labeling change plus supporting safety analysis, and bracket all fields requiring real identifiers or signatures."
      },
      {
        "code": "CBE0-LABELING",
        "title": "Safety Labeling Change (Annotated and Clean)",
        "required": true,
        "contentType": "mixed",
        "guidance": "The proposed labeling in clean and annotated form implementing the safety change, in SPL format, with each edit traceable to the safety basis.",
        "authoringGuidance": "This is the substantive deliverable of most CBE-0 submissions; provide clean and annotated Prescribing Information redlining the added or strengthened contraindication, warning, precaution, adverse reaction, or safe-use instruction against the currently approved PI. Each change must be placed in the correct PLR section (21 CFR 201.57) and traceable to the safety data or signal that prompted it. For changes responsive to an FDA 505(o)(4) notification, the labeling must reflect the agreed language or the applicant's alternative with justification. Reviewers examine whether the change is truly a safety strengthening (CBE-eligible) rather than a risk minimization that also narrows or expands use inappropriately; misplacement in the label, inconsistency across labeling pieces, or edits unsupported by the safety analysis are the frequent deficiencies.",
        "keyContentElements": [
          "Clean proposed PI in PLR/PLLR format per 21 CFR 201.57",
          "Annotated PI redlined against currently approved labeling",
          "Placement of each change in the correct labeling section (Contraindications, Warnings/Precautions, Adverse Reactions, Dosage/Administration)",
          "Traceability of each change to the safety data source or signal",
          "Alignment with any FDA 505(o)(4) safety-labeling-change notification",
          "Patient labeling (Medication Guide/PPI) updates if affected",
          "Carton/container labeling updates if affected",
          "SPL-formatted electronic labeling files"
        ],
        "generationPrompt": "Produce clean and annotated Prescribing Information for a CBE-0 safety labeling change to {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Redline each added or strengthened safety statement into the correct 21 CFR 201.57 section and cite its safety basis. Do not fabricate safety findings; use placeholders for specific rates, study references, and 505(o)(4) notice details. Note where SPL files attach."
      },
      {
        "code": "CBE0-SAFETY",
        "title": "Supporting Safety Assessment",
        "required": true,
        "contentType": "mixed",
        "guidance": "The safety data and analysis (case series, pooled data, pharmacovigilance signal evaluation, or literature) supporting the labeling change, cross-referenced to Module 2.7.4 and any periodic safety report.",
        "authoringGuidance": "The safety assessment demonstrates why the labeling change is warranted; it should summarize the signal, the data reviewed (postmarketing cases with causality assessment, clinical trial data, pooled analyses, or literature), and the weight-of-evidence conclusion that supports the specific labeling language. Cross-reference the relevant integrated or periodic safety analyses and PSUR/PADER where applicable. Reviewers assess whether the evidence supports the strength and placement of the change; a labeling change unsupported by an articulated safety rationale, or one that under- or over-states the signal relative to the data, will draw an information request or a request for stronger/weaker language.",
        "keyContentElements": [
          "Statement of the safety signal or concern being addressed",
          "Data sources reviewed (postmarketing cases, clinical trials, pooled/integrated analyses, literature)",
          "Causality/weight-of-evidence assessment",
          "Case-level or aggregate summaries (WHERE the data reside, not fabricated numbers)",
          "Justification linking the evidence to the specific labeling language and its placement",
          "Cross-reference to Module 2.7.4, PSUR/PBRER, and PADER as applicable",
          "Any proposed additional pharmacovigilance or risk-communication actions"
        ],
        "generationPrompt": "Write the supporting safety assessment for a CBE-0 labeling change to {{SPONSOR}}'s {{PRODUCT_NAME}}. Describe the signal, the data sources, the weight-of-evidence logic, and how it justifies the specific labeling language and placement, cross-referencing Module 2.7.4 and periodic safety reports. Do not invent case counts or rates; use placeholders and describe WHERE the data reside."
      }
    ],
    "registryId": "US_CBE",
    "timing": "The change may be implemented immediately upon FDA receipt of the supplement (day 0). FDA reviews and may later require modification or disapprove; the applicant assumes the risk of distributing before the review is complete.",
    "ctdSectionCodes": [
      "1.2",
      "1.3",
      "1.14.1",
      "2.7.4",
      "3.2.S",
      "3.2.P"
    ]
  },
  {
    "id": "iss",
    "label": "Integrated Summary of Safety (ISS)",
    "category": "application",
    "family": "NDA",
    "agency": "FDA",
    "description": "A standalone, integrated pooled-safety deliverable that combines safety data across all relevant studies of a drug to characterize its overall safety profile at the level of detail required for a marketing application. The ISS is more comprehensive than the Module 2.7.4 Summary of Clinical Safety: it presents the full integrated analyses (pooling strategy, exposure, adverse events, deaths, serious and significant AEs, laboratory/vital-sign/ECG evaluations, and subgroup analyses) with supporting datasets, and lives in eCTD Section 5.3.5.3 while the condensed summary appears in 2.7.4.",
    "regulatoryBasis": [
      "21 CFR 314.50(d)(5)(vi)(a)",
      "21 CFR 314.50(d)(5)(v)",
      "ICH E3: Structure and Content of Clinical Study Reports",
      "ICH M4E(R2): CTD Efficacy - Module 2.7.4 Summary of Clinical Safety",
      "ICH E1: Extent of Population Exposure to Assess Clinical Safety",
      "ICH E9: Statistical Principles for Clinical Trials",
      "ICH E2A/E2E safety terminology and signal frameworks",
      "FDA Reviewer Guidance: Conducting a Clinical Safety Review of a New Product Application (2005)",
      "FDA Guidance: Premarketing Risk Assessment (2005)",
      "FDA Guidance: Integrated Summary of Effectiveness (Aug 2015) - companion analytic principles"
    ],
    "components": [
      {
        "code": "ISS-POOL",
        "title": "Pooling Strategy and Analysis Framework",
        "required": true,
        "contentType": "mixed",
        "guidance": "The pre-specified rationale for how studies and treatment arms are grouped into pools for integrated safety analysis, including the study inventory, pooling rules, and the studies included in and excluded from each pool.",
        "authoringGuidance": "The pooling strategy is the interpretive foundation of the entire ISS; a reviewer reads it first to judge whether every downstream integrated number is meaningful. Define each analysis pool (e.g., all controlled studies, all studies with the to-be-marketed formulation/dose, placebo-controlled pool, all-exposure pool) with explicit inclusion/exclusion rules based on design, population, dose/formulation, and duration, and justify combining studies given differences in design and populations. Present a complete study inventory mapping each study to the pools it enters. State how the pooling and analyses were pre-specified (protocol/SAP for integration) versus post hoc, because reviewers weight pre-specified analyses more heavily. Inconsistent pooling, combining studies with incompatible designs without justification, or a pooling scheme that obscures a dose- or duration-related signal are the deficiencies that most often trigger a request for re-analysis.",
        "keyContentElements": [
          "Definitions of each safety analysis pool with inclusion/exclusion rules",
          "Complete study inventory (phase, design, control, population, dose, duration, N)",
          "Mapping table of each study to the pool(s) it enters",
          "Rationale for combinability given design and population heterogeneity",
          "Handling of the to-be-marketed formulation/dose vs. other formulations/doses",
          "Pre-specification status (integration SAP) and any post hoc analyses flagged",
          "Method for handling long-term/open-label and controlled data separately",
          "Data cut-off dates and database lock provenance for each pool"
        ],
        "generationPrompt": "Draft the pooling strategy for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} ({{PHASE}}). Define each safety pool with explicit inclusion/exclusion rules, provide the study-inventory and study-to-pool mapping structure, justify combinability, and state pre-specification. Do not invent study results; use placeholders for study identifiers, Ns, and cut-off dates."
      },
      {
        "code": "ISS-POP",
        "title": "Analysis Populations and Data Handling Conventions",
        "required": true,
        "contentType": "mixed",
        "guidance": "Definitions of the safety analysis populations and the standardized conventions for AE coding, treatment-emergence, severity/causality, and missing data applied across the integrated database.",
        "authoringGuidance": "This section establishes the denominators and rules that make pooled counts comparable across studies; define the safety population (typically all randomized subjects who received at least one dose, analyzed as treated), and any as-treated vs. as-randomized conventions. Specify the MedDRA version used and confirm re-coding to a single dictionary version across studies, the definition of treatment-emergent AEs (relative to a defined baseline and treatment window), severity grading (CTCAE version if used), causality categories, and rules for handling missing data, multiple occurrences, and subject-level counting (subjects with >=1 event vs. event counts). Reviewers check that all studies were re-coded to one MedDRA version and that treatment-emergence is defined consistently; mixed dictionary versions, inconsistent baseline definitions, or double-counting are common integrity findings.",
        "keyContentElements": [
          "Safety population definition and analysis conventions (as-treated vs. as-randomized)",
          "MedDRA version and confirmation of uniform re-coding across studies",
          "Treatment-emergent AE definition (baseline reference and treatment/follow-up windows)",
          "Severity grading system (e.g., CTCAE version) and causality categories",
          "Subject-level vs. event-level counting rules and handling of recurrent events",
          "Missing-data conventions and handling of study discontinuations",
          "Standardization of laboratory units and normal ranges across studies",
          "Handling of dose changes, rescue medication, and open-label extension periods"
        ],
        "generationPrompt": "Write the analysis-populations and data-handling section for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}}. Define the safety population, the MedDRA version and uniform re-coding, the treatment-emergent AE definition, severity/causality conventions, and lab standardization. Use placeholders for version numbers and dates; do not fabricate counts."
      },
      {
        "code": "ISS-EXP",
        "title": "Extent of Exposure",
        "required": true,
        "contentType": "table",
        "guidance": "Integrated summary of the extent of drug exposure across the pooled population - number of subjects, person-time, and distribution by dose, duration, and formulation - evaluated against ICH E1 expectations.",
        "authoringGuidance": "Exposure defines the sensitivity of the safety database to detect rare events, so this section is read to judge whether the program can characterize the safety profile and support the ICH E1 minimum for chronic use. Present the number of subjects exposed to the drug (and to the to-be-marketed dose), cumulative person-time (patient-years), and the distribution of subjects by duration bands (e.g., >=1, >=3, >=6, >=12 months) and by dose. Distinguish controlled from all-exposure pools. Reviewers verify that exposure at the intended dose and duration meets E1 for chronic indications and that long-term exposure numbers are not inflated by low-dose or short-duration subjects; an exposure table that fails to break out the marketed dose/duration or that overstates person-time draws immediate questions.",
        "keyContentElements": [
          "Number of subjects exposed to drug overall and to the to-be-marketed dose",
          "Cumulative person-time (patient-years) by pool",
          "Distribution of subjects by duration bands (>=1, 3, 6, 12 months, etc.)",
          "Distribution by dose level and by formulation",
          "Exposure in controlled vs. all-exposure pools",
          "Assessment against ICH E1 minimum exposure expectations for the indication",
          "Cumulative dose and dose-intensity summaries where relevant",
          "Exposure in key subgroups (age, sex, renal/hepatic impairment) at a high level"
        ],
        "generationPrompt": "Create the extent-of-exposure section and table shells for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Define subject counts, patient-years, and duration/dose distributions by pool, and assess against ICH E1. Provide table structures with placeholder cells; do not invent exposure numbers."
      },
      {
        "code": "ISS-DEMO",
        "title": "Integrated Demographics and Baseline Characteristics",
        "required": true,
        "contentType": "table",
        "guidance": "Pooled demographic and baseline disease characteristics of the integrated safety population, supporting interpretability and subgroup analyses.",
        "authoringGuidance": "Integrated demographics let the reviewer judge whether the pooled safety population represents the intended treatment population and whether treatment groups are balanced within controlled pools. Present age (including elderly strata per ICH E7), sex, race/ethnicity, region, weight/BMI, baseline disease severity, relevant comorbidities, and baseline organ function (renal/hepatic) across pools and by treatment group. Reviewers use this to assess external validity and to frame the subgroup safety analyses; notable is whether important subpopulations (elderly, renal/hepatic impairment, specific races) are adequately represented. Under-representation of a key demographic or imbalance in the controlled pool that could confound safety comparisons should be surfaced here rather than discovered later.",
        "keyContentElements": [
          "Age (mean/median and clinically relevant strata, including >=65 and >=75)",
          "Sex and race/ethnicity distribution with regional breakdown",
          "Weight/BMI and baseline disease severity",
          "Baseline renal and hepatic function categories",
          "Relevant comorbidities and concomitant medications",
          "Treatment-group balance within controlled pools",
          "Representation of ICH E7 geriatric and other special populations",
          "Cross-reference to subgroup safety analyses"
        ],
        "generationPrompt": "Draft the integrated demographics section and table shells for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}}. Summarize age, sex, race, region, organ function, and baseline disease characteristics across pools and by treatment group. Provide table structures with placeholders; do not fabricate values."
      },
      {
        "code": "ISS-AE",
        "title": "Integrated Adverse Event Analyses",
        "required": true,
        "contentType": "mixed",
        "guidance": "The core integrated analyses of common adverse events, serious adverse events, deaths, discontinuations due to AEs, and other significant AEs, presented by SOC/PT with between-treatment comparisons in controlled pools.",
        "authoringGuidance": "This is the analytic heart of the ISS and the section the medical reviewer scrutinizes most closely; present overall AE incidence, common treatment-emergent AEs by MedDRA SOC and preferred term with between-group comparisons (drug vs. comparator/placebo) in controlled pools, and dedicated analyses of deaths, other serious AEs, and AEs leading to discontinuation or dose modification. Include severity and causality breakdowns, dose- and time-to-onset relationships, and narratives or cross-references for deaths and important SAEs. Use risk differences/relative risks where appropriate and flag adverse events of special interest. Reviewers look for a transparent, consistently-denominated presentation that neither buries nor over-adjusts signals; failing to present the marketed-dose comparison, omitting time-to-onset/duration for key events, inconsistent counting, or inadequate death/SAE narratives are the deficiencies that generate information requests and safety-review findings.",
        "keyContentElements": [
          "Overall incidence of treatment-emergent AEs by pool and treatment group",
          "Common AEs by SOC/PT with between-group comparisons in controlled pools",
          "Deaths: incidence, causes, and cross-referenced narratives",
          "Other serious AEs and adverse events of special interest",
          "AEs leading to discontinuation, dose reduction, or interruption",
          "Severity and causality distributions",
          "Dose-response and time-to-onset/duration analyses for key events",
          "Risk difference/relative risk estimates where appropriate",
          "Common/serious AE tables split for controlled vs. all-exposure pools"
        ],
        "generationPrompt": "Write the integrated adverse-event analysis section and table shells for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Structure overall AE incidence, common AEs by SOC/PT with drug-vs-comparator comparisons, deaths, SAEs, AESIs, discontinuations, and dose/time relationships. Provide table structures and describe WHERE narratives reside; do not invent event rates."
      },
      {
        "code": "ISS-LAB",
        "title": "Laboratory, Vital Signs, ECG, and Other Safety Evaluations",
        "required": true,
        "contentType": "mixed",
        "guidance": "Integrated analyses of clinical laboratory data (hematology, chemistry, urinalysis), vital signs, ECG/QT, and any specialized safety assessments, including shift tables, marked-abnormality analyses, and drug-induced liver injury evaluation.",
        "authoringGuidance": "This section characterizes safety signals that AE reporting alone may miss; present central-tendency changes and, more importantly, categorical shift tables and incidence of marked/potentially clinically significant abnormalities for key analytes across pools. Include a structured hepatotoxicity assessment (e.g., Hy's Law evaluation with ALT/AST and total bilirubin elevations and eDISH-style presentation) and QT/ECG analyses where relevant. Reviewers look specifically for potential drug-induced liver injury, renal signals, hematologic effects, and cardiac repolarization effects; a superficial lab section without shift tables, or an absent/weak Hy's Law analysis, is a predictable trigger for an information request in most programs.",
        "keyContentElements": [
          "Hematology, chemistry, and urinalysis central-tendency changes by pool/group",
          "Shift tables (baseline-to-worst) for key analytes",
          "Incidence of marked/potentially clinically significant abnormalities",
          "Structured hepatotoxicity evaluation (Hy's Law/eDISH; ALT/AST/bilirubin)",
          "Vital-sign changes including orthostatic and weight effects",
          "ECG/QTc analyses and outlier/categorical thresholds",
          "Any specialized assessments (renal biomarkers, immunogenicity, etc.)",
          "Cross-reference to relevant AESIs and AE analyses"
        ],
        "generationPrompt": "Draft the laboratory/vital-signs/ECG safety section and table shells for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}}. Include central-tendency changes, shift tables, marked-abnormality incidence, a Hy's Law/eDISH hepatotoxicity evaluation, and QTc analyses. Provide table structures with placeholders; do not fabricate laboratory values."
      },
      {
        "code": "ISS-SUBGROUP",
        "title": "Subgroup and Intrinsic/Extrinsic Factor Safety Analyses",
        "required": true,
        "contentType": "mixed",
        "guidance": "Integrated safety analyses stratified by intrinsic and extrinsic factors - age, sex, race/ethnicity, region, weight, renal/hepatic function, concomitant medications, and other pre-specified subgroups - to detect differential safety.",
        "authoringGuidance": "Subgroup safety analyses inform labeling in special populations and identify differential risk; present key safety endpoints (overall AEs, SAEs, deaths, discontinuations, and important AESIs) within pre-specified subgroups, using the controlled pool for comparative inference where possible. Emphasize ICH E7 geriatric analyses, organ-impairment subgroups, sex and race, and pharmacogenomic or drug-interaction strata where relevant. Reviewers use these to support Section 8 (Use in Specific Populations) labeling; they expect subgroups to be pre-specified, adequately sized (with caveats where small), and consistently analyzed. Post hoc subgroups presented as confirmatory, unaddressed small-subgroup instability, or failure to analyze elderly/organ-impairment safety are the recurring deficiencies.",
        "keyContentElements": [
          "Pre-specified subgroups by age (incl. >=65/>=75), sex, race/ethnicity, region",
          "Renal and hepatic impairment subgroups",
          "Weight/BMI and baseline-severity strata",
          "Concomitant-medication and drug-interaction subgroups",
          "Key safety endpoints presented within each subgroup",
          "Comparative inference from controlled pools where feasible",
          "Explicit caveats for small or post hoc subgroups",
          "Linkage to proposed labeling in Use in Specific Populations",
          "Consistency assessment of the treatment-safety relationship across subgroups"
        ],
        "generationPrompt": "Write the subgroup safety-analysis section and table shells for the ISS of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Cover age, sex, race, region, renal/hepatic impairment, weight, and concomitant-medication strata for key safety endpoints, emphasizing ICH E7 populations and labeling implications. Provide table structures with placeholders and flag small/post hoc subgroups; do not invent results."
      }
    ],
    "timing": "Authored during the marketing application (NDA/BLA) build after database lock of the pivotal program; delivered as part of the original application and updated with 120-day safety updates as required under 21 CFR 314.50(d)(5)(vi)(b).",
    "ctdSectionCodes": [
      "2.7.3",
      "2.7.4",
      "5.3.5.3"
    ]
  },
  {
    "id": "ise",
    "label": "Integrated Summary of Efficacy (ISE)",
    "category": "application",
    "family": "NDA",
    "agency": "FDA",
    "description": "A standalone, integrated pooled-efficacy deliverable that combines efficacy data across the adequate and well-controlled studies of a drug to characterize overall effectiveness for the proposed indication at the level of detail required for a marketing application. The ISE is more comprehensive than the Module 2.7.3 Summary of Clinical Efficacy: it presents the full integrated analyses (study/pooling strategy, analysis populations, integrated demographics, primary and secondary endpoint analyses across studies, dose-response, persistence of effect, and efficacy subgroup analyses) with supporting datasets, and lives in eCTD Section 5.3.5.3 while the condensed summary appears in 2.7.3.",
    "regulatoryBasis": [
      "21 CFR 314.50(d)(5)(v)",
      "21 CFR 314.50(d)(5)(iii)",
      "21 CFR 314.126 (adequate and well-controlled studies)",
      "ICH E3: Structure and Content of Clinical Study Reports",
      "ICH M4E(R2): CTD Efficacy - Module 2.7.3 Summary of Clinical Efficacy",
      "ICH E9: Statistical Principles for Clinical Trials",
      "ICH E9(R1): Estimands and Sensitivity Analysis",
      "ICH E10: Choice of Control Group",
      "FDA Guidance: Integrated Summary of Effectiveness (Aug 2015)",
      "FDA Guidance: Demonstrating Substantial Evidence of Effectiveness (2019)",
      "FDA Guidance: Multiple Endpoints in Clinical Trials (2022)"
    ],
    "components": [
      {
        "code": "ISE-POOL",
        "title": "Study Inventory and Pooling/Integration Strategy",
        "required": true,
        "contentType": "mixed",
        "guidance": "The rationale and rules for which adequate and well-controlled studies are combined for integrated efficacy analysis, whether via formal pooling or cross-study comparison (meta-analytic) approaches, with the study inventory and design comparison.",
        "authoringGuidance": "Per the FDA 2015 ISE guidance, integration is not always a literal pooling of subject-level data; the strategy must state whether effectiveness is demonstrated by independent substantiation across trials, by formal meta-analysis, or by pooling, and justify the chosen approach. Provide a complete inventory of the adequate and well-controlled studies with their designs, controls (ICH E10), populations, endpoints, and results structure, and a side-by-side design comparison establishing that the studies are similar enough to integrate or, if not, why independent replication is the basis for substantial evidence. Reviewers judge whether the integration approach is appropriate and pre-specified; pooling dissimilar trials to manufacture significance, or presenting a meta-analysis as if it substitutes for two adequate and well-controlled trials, are the errors that undermine the effectiveness claim.",
        "keyContentElements": [
          "Statement of the effectiveness evidentiary standard relied upon (replication vs. single trial + confirmatory)",
          "Complete inventory of adequate and well-controlled studies (design, control, N, endpoints)",
          "Side-by-side design and population comparison across studies",
          "Integration approach: independent substantiation, meta-analysis, or subject-level pooling - with justification",
          "Definition of efficacy analysis pools and their inclusion/exclusion rules",
          "Pre-specification status (integration SAP) and any post hoc analyses flagged",
          "Handling of heterogeneity across studies (fixed vs. random effects if meta-analytic)",
          "Data cut-off and database-lock provenance per study"
        ],
        "generationPrompt": "Draft the study-inventory and integration-strategy section for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}} in {{INDICATION}} ({{PHASE}}). State the effectiveness standard, inventory the adequate and well-controlled studies, compare their designs, and justify the integration approach (replication, meta-analysis, or pooling) per the FDA 2015 ISE guidance. Do not invent results; use placeholders for study identifiers, Ns, and endpoints."
      },
      {
        "code": "ISE-POP",
        "title": "Analysis Populations and Estimand Framework",
        "required": true,
        "contentType": "mixed",
        "guidance": "Definitions of the efficacy analysis populations (ITT/full analysis set, per-protocol) and the estimand/intercurrent-event framework and missing-data handling applied consistently across the integrated program per ICH E9(R1).",
        "authoringGuidance": "This section fixes the populations and estimation rules that make cross-study efficacy claims interpretable; define the full analysis set (ITT) and per-protocol population, and articulate the estimand(s) - treatment condition, population, endpoint, intercurrent-event strategy, and population-level summary - per ICH E9(R1), harmonized across studies. Specify the primary analysis method, handling of intercurrent events (treatment discontinuation, rescue medication) and missing data, and the sensitivity analyses that probe robustness. Reviewers increasingly evaluate whether the estimand matches the labeling claim and whether missing-data handling could bias the effect; an ITT analysis undermined by informative dropout, inconsistent estimands across pooled studies, or a per-protocol emphasis that inflates the effect are recurring concerns.",
        "keyContentElements": [
          "Full analysis set (ITT) and per-protocol population definitions, harmonized across studies",
          "Estimand definition(s) per ICH E9(R1) with intercurrent-event strategies",
          "Primary analysis model and covariate adjustment conventions",
          "Missing-data handling and imputation approach",
          "Pre-specified sensitivity and supplementary analyses",
          "Multiplicity control strategy across pooled endpoints (per 2022 multiple-endpoints guidance)",
          "Handling of study as a factor/stratum in integrated models",
          "Consistency of endpoint definitions and assessment timing across studies"
        ],
        "generationPrompt": "Write the analysis-populations and estimand section for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}}. Define the ITT and per-protocol sets, articulate the estimand(s) and intercurrent-event strategies per ICH E9(R1), specify the primary model, missing-data handling, sensitivity analyses, and multiplicity control. Use placeholders for specifics; do not fabricate results."
      },
      {
        "code": "ISE-DEMO",
        "title": "Integrated Demographics and Baseline Disease Characteristics",
        "required": true,
        "contentType": "table",
        "guidance": "Pooled demographic and baseline disease characteristics of the integrated efficacy population, supporting interpretability, generalizability, and efficacy subgroup analyses.",
        "authoringGuidance": "Integrated demographics establish that the studied population reflects the population for whom the indication is sought and that treatment groups are balanced; present age, sex, race/ethnicity, region, baseline disease severity, duration of disease, relevant biomarkers, and prior/concomitant therapy across studies and by treatment group. Reviewers use this to assess external validity and to frame efficacy subgroup analyses and consistency of effect. Under-representation of the intended population, or baseline imbalances that could confound the efficacy comparison, should be surfaced and addressed here.",
        "keyContentElements": [
          "Age (including geriatric strata), sex, race/ethnicity, and region",
          "Baseline disease severity and duration of disease",
          "Relevant baseline biomarkers or disease subtypes",
          "Prior and concomitant therapies",
          "Treatment-group balance within and across studies",
          "Representation of the intended-use population and special populations",
          "Weight/BMI and relevant organ-function status",
          "Cross-reference to efficacy subgroup analyses"
        ],
        "generationPrompt": "Draft the integrated demographics section and table shells for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Summarize age, sex, race, region, baseline severity, disease duration, biomarkers, and prior therapy across studies and by treatment group. Provide table structures with placeholders; do not invent values."
      },
      {
        "code": "ISE-PRIMARY",
        "title": "Integrated Primary and Secondary Efficacy Analyses",
        "required": true,
        "contentType": "mixed",
        "guidance": "The core integrated analyses of the primary and key secondary endpoints across studies, presenting per-study results and, where appropriate, a combined estimate with measures of consistency and heterogeneity.",
        "authoringGuidance": "This is the analytic core of the ISE and the basis for the effectiveness conclusion; present the primary endpoint result for each adequate and well-controlled study side by side (effect size, confidence interval, p-value) and, where integration is justified, a combined estimate with a forest plot and formal heterogeneity assessment. Carry the same treatment through key secondary endpoints with the pre-specified multiplicity hierarchy. Emphasize consistency of the treatment effect across studies rather than relying solely on a pooled p-value, and align the analyses with the estimand and labeling claim. Reviewers look for replicated, internally consistent evidence; over-reliance on a single pooled significance test, unexplained between-study heterogeneity, unclear multiplicity control, or misalignment between the analyzed estimand and the proposed claim are the deficiencies that jeopardize approval.",
        "keyContentElements": [
          "Per-study primary endpoint results (effect estimate, CI, p-value)",
          "Combined/meta-analytic estimate with forest plot where integration is justified",
          "Formal heterogeneity assessment (e.g., I-squared, interaction tests)",
          "Key secondary endpoints following the pre-specified multiplicity hierarchy",
          "Alignment of analyses with the defined estimand and labeling claim",
          "Sensitivity analyses supporting robustness of the primary result",
          "Responder and clinically-meaningful-difference analyses where relevant",
          "Consistency-of-effect narrative across studies",
          "Cross-reference to individual study reports in Module 5.3.5.1"
        ],
        "generationPrompt": "Write the integrated primary/secondary efficacy analysis section and table/figure shells for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Present per-study primary results, a combined estimate with forest plot and heterogeneity assessment, secondary endpoints under the multiplicity hierarchy, and consistency-of-effect. Provide structures and describe WHERE data reside; do not fabricate effect sizes or p-values."
      },
      {
        "code": "ISE-DOSE",
        "title": "Dose-Response and Persistence/Durability of Effect",
        "required": true,
        "contentType": "mixed",
        "guidance": "Integrated dose-response analyses and analyses of onset, persistence, and durability of the treatment effect over time, including maintenance-of-effect and any tolerance or attenuation.",
        "authoringGuidance": "These analyses justify the recommended dose and dosing interval and demonstrate that the benefit is maintained over the intended treatment duration; present integrated exposure- or dose-response relationships for efficacy, time-to-onset, and the durability of effect across the controlled and long-term periods, including any evidence of attenuation, tolerance, or rebound after discontinuation. Reviewers use this to support Dosage and Administration labeling and to confirm that the pivotal dose is the effective dose; missing dose-response support for the recommended dose, or a durability analysis confounded by dropout in long-term extensions, commonly generate questions.",
        "keyContentElements": [
          "Integrated dose- or exposure-response relationship for the primary endpoint",
          "Justification of the recommended dose and dosing interval",
          "Time-to-onset of the treatment effect",
          "Maintenance/durability of effect over the controlled and long-term periods",
          "Evidence of tolerance, attenuation, or post-discontinuation rebound (if any)",
          "Handling of dropout/missing data in long-term durability analyses",
          "Randomized-withdrawal or maintenance-study evidence where available",
          "Linkage to Dosage and Administration labeling"
        ],
        "generationPrompt": "Draft the dose-response and durability-of-effect section for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Present integrated dose/exposure-response, time-to-onset, maintenance of effect, and any attenuation, and link to dose selection and labeling. Provide analysis structures with placeholders; do not invent response data."
      },
      {
        "code": "ISE-SUBGROUP",
        "title": "Efficacy Subgroup and Consistency Analyses",
        "required": true,
        "contentType": "mixed",
        "guidance": "Integrated efficacy analyses stratified by pre-specified intrinsic and extrinsic factors - age, sex, race/ethnicity, region, baseline severity, disease subtype/biomarker status, and other subgroups - to assess consistency and generalizability of the treatment effect.",
        "authoringGuidance": "Subgroup efficacy analyses demonstrate that effectiveness is consistent across the intended population and inform any restricted or biomarker-defined indication; present the primary endpoint effect within pre-specified subgroups (forest plots with interaction tests), emphasizing ICH E7 geriatric, sex, race/ethnicity, regional (for multiregional trials, ICH E17 considerations), and biomarker-defined strata. Frame subgroups as supportive of consistency, not as a basis for post hoc claims, and provide appropriate caveats for small subgroups. Reviewers scrutinize whether the overall effect is driven by a subset, whether any subgroup lacks benefit, and whether regional consistency supports the U.S. population; over-interpreting favorable post hoc subgroups, or ignoring a subgroup with no effect, are the recurring pitfalls.",
        "keyContentElements": [
          "Pre-specified subgroups: age (incl. >=65), sex, race/ethnicity, region",
          "Baseline severity and disease-subtype/biomarker strata",
          "Primary endpoint effect within each subgroup (forest plots)",
          "Treatment-by-subgroup interaction tests with appropriate caveats",
          "Regional consistency and applicability to the U.S. population (ICH E17)",
          "Assessment of whether the overall effect is driven by any subset",
          "Explicit flagging of post hoc vs. pre-specified subgroups and small-N instability",
          "Linkage to proposed indication scope and Use in Specific Populations labeling",
          "Consistency-of-effect conclusion supporting generalizability"
        ],
        "generationPrompt": "Write the efficacy subgroup and consistency-analysis section and figure shells for the ISE of {{SPONSOR}}'s {{PRODUCT_NAME}} ({{INDICATION}}). Cover age, sex, race, region, baseline severity, and biomarker strata with forest plots and interaction tests, address regional/U.S. applicability, and flag post hoc/small subgroups. Provide structures with placeholders; do not fabricate subgroup effects."
      }
    ],
    "timing": "Authored during the marketing application (NDA/BLA) build after database lock of the efficacy program; delivered as part of the original application. Integrated efficacy analyses should be pre-specified in an integration SAP before unblinding where feasible.",
    "ctdSectionCodes": [
      "2.7.3",
      "2.7.4",
      "5.3.5.3"
    ]
  }
];

export default LIFECYCLE_DOCUMENT_TYPES;
