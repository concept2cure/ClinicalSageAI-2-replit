/**
 * The project's doors, by the job each does: one name per job, written once
 * (.design/client-journey/INFORMATION_ARCHITECTURE.md, section 9, "Door names";
 * slice A.1).
 *
 * A door is a verb phrase naming the job. A door that leaves the step names the
 * job and then the place it is done in ("Compose Module 3 in CMC / Module 3"); it
 * never names only where it goes ("Open in Authoring", "Open readiness"). The
 * same job has the same name wherever its door appears, so every door reads its
 * name from here: Plan's phase doors and Author's CMC door, Plan's phase 7 and
 * Submit's IND forms door, and the device workstreams on Plan.
 *
 * Only names live here. Where each door goes, and when it is offered, stays with
 * the step that draws it (ProjectPlan, ProjectHome, ProjectMarkets,
 * ProjectMdxWorkflow). clientNamesSlice1.test.tsx holds these names to section 9
 * and refuses a job name written anywhere else in the client.
 */

/** The doors on the project's six steps. */
export const STEP_DOORS = {
  /** Evidence: the project's files in Vault, where files are filed, uploaded and versioned. */
  vault: 'Add or find files in Vault',
  /** Author: the editor's own view, with no document named. */
  editor: 'Find or start a document in the editor',
  /** Author: the protocol workspace, which lists the open project's protocols. */
  protocol: 'Write the protocol in the protocol workspace',
  /** Author, and Plan's phase 3: CMC / Module 3, within its composition boundary. */
  cmc: 'Compose Module 3 in CMC / Module 3',
  /** Plan, for a filing with no list of what it needs in this release: its documents on Author. */
  filingDocuments: 'See this filing’s documents on Author',
  /** Plan's phase 8: the approved documents go into a market's sequence on Submit. */
  placeInSequence: 'Place approved documents in the sequence on Submit',
  /** Plan: the heading of the signed-in person's own tasks. */
  yourTasksHeading: 'Your tasks',
  /** Plan: Tasks, filtered to the signed-in person's own tasks. */
  yourTasks: 'See your tasks in Tasks',
  /** Plan and Review: Tasks, on everyone's tasks. */
  allTasks: 'See all tasks in Tasks',
  /** Review: the review board, which starts on the open project. */
  reviewBoard: 'Review documents on the review board',
  /** Submit's header, and Plan's phase 7, for a US IND. */
  indForms: 'Prepare Forms 1571, 1572 and 3674 in IND forms',
  /** Submit's header: Submission Center, on the open project. */
  everySequence: 'See every sequence in Submission Center',
  /** Submit's market row, by its market ("IND · FDA (US)"): Submission Center, on that market's latest sequence. */
  marketSequence: (market: string) => `Build the ${market} sequence in Submission Center`,
} as const;

/**
 * The device workstreams' doors on Plan (ProjectMdxWorkflow). A pathway's own
 * strategy and assembly doors depend on the pathway the project files, keyed as
 * ProjectMdxWorkflow reads the recorded filing ('510k', 'pma', 'mdr', 'ivdr').
 */
export const DEVICE_DOORS = {
  /** Design controls, risk management, manufacturing transfer: Engineering evidence. */
  engineering: 'Build the risk file and design-control trace',
  /** Work whose sources come into the project on Evidence; also any door whose feature is not available. */
  evidence: 'Add this work’s sources on Evidence',
  /** Medical writing, labeling, registration and UDI, and an assembly with no pathway feature: Author. */
  documents: 'Write this work’s documents on Author',
  /** Software and cybersecurity. */
  software: 'Check the software and cybersecurity documentation',
  /** The authority's review: the project's Respond step. */
  agencyResponses: 'Answer the agency on Respond',
  /** Post-market surveillance. */
  surveillance: 'Run post-market surveillance and CAPA',
  /** Clinical evidence for a filing with an EU MDR section. */
  clinicalEvaluation: 'Write the clinical evaluation (CER)',
  /** Clinical evidence otherwise. */
  clinicalStudies: 'Record the clinical studies behind this filing',
  /** Analytical and clinical performance, and performance evaluation, for a filing with an IVDR section. */
  ivdrEvidence: 'Record analytical and clinical performance (IVDR)',
  /** Regulatory strategy, for a recorded FDA route (510(k), De Novo, PMA): the project's Q-Submissions (slice 12). */
  preSub: 'Prepare a Pre-Sub for FDA',
  /** Labeling: the project's label and IFU, at draft (section 6, slice 20). */
  label: 'Write the label and IFU',
  /** Registration and UDI: each label's UDI against the device's UDI record, at check (section 6, slice 20). */
  udi: 'Check each label’s UDI',
  /** By the primary pathway: its regulatory strategy and its submission assembly, each in the pathway's feature. */
  pathway: {
    '510k': { strategy: 'Choose predicates and build the SE comparison', assembly: 'Assemble the eSTAR' },
    pma: { strategy: 'See which PMA modules are written', assembly: 'Export the PMA package' },
    mdr: { strategy: 'Gather literature and map the GSPRs', assembly: 'Export the CER' },
    ivdr: { strategy: 'Record classification and performance evidence', assembly: 'Assemble the technical documentation' },
  },
} as const;
