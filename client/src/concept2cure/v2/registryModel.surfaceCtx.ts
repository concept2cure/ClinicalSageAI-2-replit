/**
 * ui-v2 per-surface AnA context — the large ANA_SURFACE_CTX data table, split
 * out of registryModel.ts to keep it under the repo-health 1,500-line gate.
 * registryModel re-exports it; every consumer imports from registryModel
 * unchanged. Ported verbatim from the kit registry.jsx (getAnaContext reads
 * `here`/`focus`/`actions`/`suggestions`; absent ids derive from registry meta).
 */
export const ANA_SURFACE_CTX = {
  'communication-center': {
    here: 'the FDA↔client communication loop for the active filing',
    focus: 'Agency correspondence · CRL response · lifecycle',
    actions: [
      {
        label: 'Draft the CRL response',
        icon: 'penLine',
        prompt: 'Draft the full CRL response letter — one section per deficiency, each citing the resolving evidence and the updated eCTD section.',
      },
      {
        label: 'Triage what needs a response',
        icon: 'inbox',
        prompt: 'Which agency communications need a response, by when, and who owns each?',
      },
      {
        label: 'Plan the resubmission',
        icon: 'gitBranch',
        prompt: 'Build the resubmission plan: decompose every CRL deficiency into a section-linked task and give me the critical path to resubmit.',
      },
    ],
  },
  'program-journey': {
    here: 'the whole program journey — every stage from concept to submission',
    focus: 'Program lifecycle · all 9 stages',
    actions: [
      {
        label: 'Where are we blocked?',
        icon: 'alertTriangle',
        prompt: 'Across the whole program journey, what is blocking submission and what is the fastest path to clear each blocker?',
      },
      {
        label: 'Readiness by stage',
        icon: 'workflow',
        prompt: 'Summarize readiness for every lifecycle stage and the gate that must clear next.',
      },
      {
        label: 'Pre-empt agency questions',
        icon: 'sparkles',
        prompt: 'List the predicted HAQs across the program and pre-draft a response to each.',
      },
    ],
    suggestions: [
      'What is on the critical path to submission?',
      'Summarize every open contradiction and blocker',
      'Which stage gate clears next, and what does it need?',
    ],
  },
  'authoring-engine': {
    here: 'document creation across the whole CTD pyramid — raw data to final draft',
    focus: 'CTD authoring · per-document-type systems',
    actions: [
      {
        label: 'Draft a CTD document',
        icon: 'penLine',
        prompt: 'Draft my next CTD document with the right document-type system, grounded on the locked evidence.',
      },
      {
        label: 'Regenerate a table',
        icon: 'sparkles',
        prompt: 'Regenerate the summary table for the updated dataset and reconcile it deterministically.',
      },
      {
        label: 'Run a validation gate',
        icon: 'shieldCheck',
        prompt: 'Run the section-completeness and citation validation on the active document.',
      },
    ],
    suggestions: [
      'Which documents are missing required sections?',
      'Draft §2.5 from the locked studies',
      'Set up an automation to sync a table summary',
    ],
  },
  pharmacovigilance: {
    here: 'safety surveillance — signal detection and PSUR/PBRER cycles',
    focus: 'PV · active signals + aggregate reports',
    actions: [
      {
        label: 'Adjudicate top signal',
        icon: 'shieldAlert',
        prompt: 'Adjudicate the highest-PRR signal — pull every case narrative, run causality, and suggest a label update.',
      },
      {
        label: 'Draft PSUR §15',
        icon: 'penLine',
        prompt: 'Draft the PSUR §15 risk evaluation for the open cycle.',
      },
      {
        label: 'Reconcile FAERS ⇄ EV',
        icon: 'gitCompare',
        prompt: 'Cross-reference EudraVigilance and FAERS for the active signals and flag divergences.',
      },
    ],
    suggestions: [
      'Which signals crossed the PRR threshold?',
      'What aggregate reports are due this quarter?',
      'Draft an expedited 7/15-day report',
    ],
  },
  pediatric: {
    here: 'the pediatric strategy — FDA iPSP / PREA and EMA PIP',
    focus: 'Pediatric · plans & PREA milestones',
    actions: [
      {
        label: 'Draft extrapolation rationale',
        icon: 'penLine',
        prompt: 'Draft the PSP rationale for adolescent extrapolation from the current evidence.',
      },
      {
        label: 'Draft PREA waiver',
        icon: 'sparkles',
        prompt: 'Draft a PREA waiver justification against the pediatric extrapolation framework.',
      },
      {
        label: 'Milestones due in 90 days',
        icon: 'clock',
        prompt: 'Surface every PIP/PREA milestone due in the next 90 days.',
      },
    ],
    suggestions: [
      'Compare our PIP and iPSP scopes',
      'What pediatric milestones are at risk?',
      'Draft the iPSP age-range rationale',
    ],
  },
  orphan: {
    here: 'orphan & rare-disease designations, vouchers and advocacy',
    focus: 'Orphan · designations & RPD vouchers',
    actions: [
      {
        label: 'Draft designation narrative',
        icon: 'penLine',
        prompt: 'Draft the FDA orphan designation application narrative — prevalence and scientific rationale.',
      },
      {
        label: 'Compare exclusivity',
        icon: 'scale',
        prompt: 'Compare orphan exclusivity benefits across FDA, EMA and PMDA for our indication.',
      },
      {
        label: 'Find orphan precedents',
        icon: 'sparkles',
        prompt: 'Find the closest orphan precedents to our lead rare-disease indication.',
      },
    ],
    suggestions: [
      'Status of the pending FDA designation',
      'Pull every RPD voucher transaction 2022–2025',
      'Prep the patient-advocacy committee agenda',
    ],
  },
  'lifecycle-mgmt': {
    here: 'post-approval lifecycle — supplements, variations and CMC change control',
    focus: 'Lifecycle · supplements & change control',
    actions: [
      {
        label: 'Classify against ICH Q12',
        icon: 'shieldCheck',
        prompt: 'Classify the open CMC changes against ICH Q12 — PACMP-eligible vs prior-approval supplement.',
      },
      {
        label: 'Draft a Type II variation',
        icon: 'penLine',
        prompt: 'Draft a Type II variation against the current EMA guidance for the specification change.',
      },
      {
        label: 'Prep the annual report',
        icon: 'history',
        prompt: 'Prepare the next PADER — pull every post-approval change this cycle.',
      },
    ],
    suggestions: [
      'Which changes are PACMP-eligible?',
      'Open every supplement filed in the last 90 days',
      'What renewal cycles are approaching?',
    ],
  },
  'nda-cockpit': {
    here: 'the NDA/BLA filing — CTD readiness, PDUFA clock and Refuse-to-File risk',
    focus: 'Filing · CTD M1–5 + RTF',
    actions: [
      {
        label: 'Assess filing readiness',
        icon: 'shieldCheck',
        prompt: 'Assess filing readiness across Modules 1–5 and the top Refuse-to-File risks.',
      },
      {
        label: 'Mitigate RTF risk',
        icon: 'alertTriangle',
        prompt: 'Draft a mitigation plan for the open Refuse-to-File items.',
      },
      {
        label: 'Explain the review clock',
        icon: 'clock',
        prompt: 'Where are we on the PDUFA review clock and what is due before the next milestone?',
      },
    ],
    suggestions: [
      'What is the highest RTF risk right now?',
      'Which Module 1 admin items are open?',
      'Summarize CTD readiness by module',
    ],
  },
  cmc: {
    here: 'CMC Module 3 — specifications, stability and control strategy',
    focus: 'Module 3 · CMC',
    actions: [
      {
        label: 'Reconcile specifications',
        icon: 'shieldCheck',
        prompt: 'Reconcile the drug-substance specifications across the CSR and §3.2.S.4.1.',
      },
      {
        label: 'Classify an impurity',
        icon: 'beaker',
        prompt: 'Classify an impurity applying ICH M7 / Q3A logic.',
      },
      {
        label: 'Summarize stability trend',
        icon: 'sparkles',
        prompt: 'Summarize the stability trend and the provisional shelf-life.',
      },
    ],
    /* The module's whole capability surface, in human language.
       These lived in a "Copilot" sub-tab that held nothing but chat entry
       points — a tab existing to launch chat is the pattern chat-first design
       forbids, and it made every prompt below reachable only if you already knew
       to go there. Here they reach the AnA panel on every CMC tab instead. */
    suggestions: [
      'What is gating Module 3?',
      'Pull the 24-month stability trend',
      'What is blocking the final export gate on this program?',
      'Compile Module 3 and tell me which sections are still blocked',
      'Explain each open contradiction and what would resolve it',
      'What shelf life do my stability data actually support, and what limits it?',
      /* Not a duplicate of the line above: that one DERIVES a shelf life from the
         data, this one VALIDATES a claim already being made. A CMC lead defending
         a filed 24-month claim is asking the second question, not the first. */
      'What evidence supports a 24-month shelf-life claim?',
      'Are my primary batches combinable for one shelf-life claim?',
      'Which QC results are still awaiting second-person review?',
      'Which CQAs have no validated analytical method controlling them?',
      'Run the ICH compliance check and turn the findings into a remediation plan',
      'Generate the drug-substance control strategy and tell me what a reviewer would challenge',
      'Assess comparability across the post-change lots',
      'Which markets need a prior-approval supplement for the scale-up?',
      'Explain ICH Q6B expectations for charge-variant specs',
      'Draft a method-validation justification for sub-visible particles',
      'Reconcile drug-substance specs across CSR-201 and §3.2.S.4.1',
    ],
  },
  'submission-center': {
    here: 'the submission package — assembly, validation and dispatch',
    focus: 'Submission · package + gateway',
    actions: [
      {
        label: 'Run the eValidator',
        icon: 'shieldCheck',
        prompt: 'Run the eValidator on the package and list every error and warning.',
      },
      {
        label: 'What gates transmit?',
        icon: 'alertTriangle',
        prompt: 'What must clear before this package can be dispatched to the gateway?',
      },
      {
        label: 'Run a shadow review',
        icon: 'sparkles',
        prompt: 'Run a shadow review across the five reviewer lenses and flag RtF/CRL risk.',
      },
    ],
    suggestions: ['Validate the active sequence', 'Compare ESG vs eSTAR export', 'What blocks dispatch?'],
  },
  'haq-manager': {
    here: 'agency questions — IR / Day-120 LoQ / CRL responses',
    focus: 'HAQ · open agency questions',
    actions: [
      {
        label: 'Draft a response',
        icon: 'penLine',
        prompt: 'Draft a source-traced response to the highest-priority open agency question.',
      },
      {
        label: 'Find precedent responses',
        icon: 'scale',
        prompt: 'Find precedent responses to similar agency questions and adapt the strongest one.',
      },
      {
        label: 'Triage all open HAQs',
        icon: 'sparkles',
        prompt: 'Triage every open and predicted HAQ and rank by urgency and effort.',
      },
    ],
    suggestions: [
      'Pre-draft the 3 predicted HAQs',
      'Which responses are due this week?',
      'Anchor a response on the locked CSR',
    ],
  },
  'agency-meetings': {
    here: 'agency interactions — briefing books, questions and minutes',
    focus: 'Meetings · briefing books',
    actions: [
      {
        label: 'Draft a briefing book',
        icon: 'penLine',
        prompt: 'Draft the briefing book for the next scheduled agency meeting from the current dossier.',
      },
      {
        label: 'Frame the questions',
        icon: 'sparkles',
        prompt: 'Frame the meeting questions with our position and the supporting data for each.',
      },
      {
        label: 'Track commitments',
        icon: 'checkSquare',
        prompt: 'Pull the commitments from the last meeting minutes and their current status.',
      },
    ],
    suggestions: [
      'Prep the next Type B/C briefing',
      'Cross-reference prior minutes',
      'What questions should we ask?',
    ],
  },
  'csr-workflow': {
    here: 'the clinical study report — ICH E3 structure and analyses',
    focus: 'CSR · ICH E3',
    actions: [
      {
        label: 'Draft §11 efficacy',
        icon: 'penLine',
        prompt: 'Draft the CSR §11 efficacy evaluation from the SAP and TLF shells with provenance.',
      },
      {
        label: 'Place the TLFs',
        icon: 'sparkles',
        prompt: 'Generate and place the in-text TLFs from the locked ADaM datasets.',
      },
      {
        label: 'Check cross-references',
        icon: 'shieldCheck',
        prompt: 'Check in-text ↔ appendix cross-reference integrity across the CSR.',
      },
      // Clinical-Regulatory Intelligence Graph — read-only reasoning over the
      // shared evidence spine. Phrased as "historical FDA precedent", never as a
      // prediction of what the Agency will do.
      {
        label: 'Compare to precedent',
        icon: 'gitCompare',
        prompt:
          'Compare this CSR section against comparable studies and the FDA findings on this application. State the differences and the coverage denominators.',
      },
      {
        label: 'Open regulatory source',
        icon: 'externalLink',
        prompt:
          'Open the official regulatory source behind the findings cited on this section, at the exact page.',
      },
      {
        label: 'Trace recommendation',
        icon: 'route',
        prompt:
          'Show the evidence chain behind this recommendation: sources, calculations, assumptions and contradictions.',
      },
    ],
    suggestions: [
      'Which E3 sections are still open?',
      'Draft the disposition and deviation tables',
      'Reconcile the TLFs against the datasets',
    ],
  },
  'crl-library': {
    here: 'verified FDA findings across the shared clinical-regulatory evidence graph',
    focus: 'FDA CRL library',
    actions: [
      {
        label: 'Compare to precedent',
        icon: 'gitCompare',
        prompt:
          'Compare our proposed design to the findings shown here — comparable designs, adverse findings, the differences, and what is still unanswered.',
      },
      {
        label: 'Explain design risk',
        icon: 'alertTriangle',
        prompt:
          'Explain the design risk these findings imply: supportive evidence, negative precedent, applicability, differences, mitigations and unknowns.',
      },
      {
        label: 'Stress test protocol',
        icon: 'activity',
        prompt:
          'Stress-test our protocol against the scenarios these findings select. Name the source of every parameter.',
      },
      {
        label: 'Open regulatory source',
        icon: 'externalLink',
        prompt: 'Open the official source for this finding at the exact page and location.',
      },
      {
        label: 'Trace recommendation',
        icon: 'route',
        prompt:
          'Show the evidence chain: sources, transformations, calculations, assumptions and contradictions.',
      },
    ],
    suggestions: [
      'Findings on this endpoint class',
      'What did FDA ask for after this deficiency?',
      'Compare our design to this letter',
    ],
  },
  'ind-checklist': {
    here: 'the IND lifecycle — application, amendments and reports',
    focus: 'IND · §312 lifecycle',
    actions: [
      {
        label: 'Amendment readiness',
        icon: 'shieldCheck',
        prompt: 'Run the IND amendment readiness check and list what is required.',
      },
      {
        label: 'Draft the annual report',
        icon: 'penLine',
        prompt: 'Draft the IND annual report / DSUR from the current study status.',
      },
      {
        label: 'Open a safety report',
        icon: 'alertTriangle',
        prompt: 'Start a SUSAR 7-day safety report and walk me through the required fields.',
      },
    ],
    suggestions: [
      'What is outstanding on Forms 1571/1572/3674?',
      'Draft the next protocol amendment',
      'What safety reports are due?',
    ],
  },
  biostatistics: {
    here: 'the statistical plan — SAP, power and estimands',
    focus: 'Biostatistics · SAP & power',
    actions: [
      {
        label: 'Size the study',
        icon: 'sigma',
        prompt: 'Run the sample-size and power calculation for the proposed design.',
      },
      {
        label: 'Define an estimand',
        icon: 'sparkles',
        prompt: 'Define the estimand for the primary endpoint per ICH E9(R1).',
      },
      {
        label: 'Draft the SAP section',
        icon: 'penLine',
        prompt: 'Draft the SAP analysis-populations and multiplicity sections.',
      },
    ],
    suggestions: [
      'Recompute power at the observed effect size',
      'Draft the group-sequential design',
      'Check the estimand ↔ endpoint linkage',
    ],
  },
  nonclinical: {
    here: 'IND-enabling nonclinical & CTD Module 4 — GLP studies, SEND and the M2.6 summary',
    focus: 'Module 4 · GLP studies',
    actions: [
      {
        label: 'Draft §2.6.6 summary',
        icon: 'penLine',
        prompt: 'Draft the §2.6.6 toxicology written summary from the study reports, linking every claim to its source study.',
      },
      {
        label: 'Fix SEND reject',
        icon: 'shieldCheck',
        prompt: 'Fix the SEND LB dataset reject and re-validate the package.',
      },
      {
        label: 'Classify a finding',
        icon: 'sparkles',
        prompt: 'Classify a nonclinical finding as adverse or non-adverse with the rationale.',
      },
    ],
    suggestions: [
      'Which SEND domains are blocking?',
      'Draft the Module 2.6 tabulated summaries',
      'What gates a complete Module 4?',
    ],
  },
  'clinical-ops': {
    here: 'clinical-development operations — sites, enrollment, DSMB and deviations',
    focus: 'Clinical ops · sites & studies',
    actions: [
      {
        label: 'Assess site risk',
        icon: 'shieldCheck',
        prompt: 'Run a site-risk assessment across all active sites and prioritize monitoring.',
      },
      {
        label: 'Prep DSMB package',
        icon: 'sparkles',
        prompt: 'Prepare the DSMB data package for the next interim review.',
      },
      {
        label: 'Triage deviations',
        icon: 'alertTriangle',
        prompt: 'Triage the open protocol deviations and draft the CAPA for the highest-severity one.',
      },
    ],
    suggestions: [
      'Which sites are behind enrollment?',
      'What is the gap to database lock?',
      'Summarize open deviations and CAPA status',
    ],
  },
  dossier: {
    here: 'the eCTD dossier — folder tree, documents and data room',
    focus: 'Dossier · eCTD tree',
    actions: [
      {
        label: 'Map a document to a leaf',
        icon: 'gitBranch',
        prompt: 'Map the active document to its correct eCTD leaf and lifecycle operation.',
      },
      {
        label: 'What is unmapped?',
        icon: 'alertTriangle',
        prompt: 'List every required eCTD leaf that has no document mapped yet.',
      },
      {
        label: 'Compile the dossier',
        icon: 'sparkles',
        prompt: 'Compile the current dossier and report completeness and readiness.',
      },
    ],
    suggestions: [
      'Show completeness by CTD module',
      'Which leaves are missing?',
      'Open the data room source files',
    ],
  },
};
