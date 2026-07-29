/**
 * Discovery & cheminformatics tool definitions — compound/target search and
 * related discovery-stage lookups (ChEMBL and friends).
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 3). This is a discovery-stage domain rather than a regulatory
 * submission one, so it earns its own module. These are pure `AnaTool`
 * definition objects; their handlers live in AnaToolExecutor.ts. Imported back
 * into AnaToolDefinitions.ts so `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Discovery & Cheminformatics Tools
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_CHEMBL_COMPOUND: AnaTool = {
  name: 'search_chembl_compound',
  description:
    'Search the curated ChEMBL database (EMBL-EBI) for a drug or compound by name. Returns ' +
    'citeable molecule records (ChEMBL ID + canonical URL) with the curated physicochemical / ' +
    'drug-likeness descriptors (molecular weight, cLogP, PSA, H-bond donors/acceptors, rotatable ' +
    'bonds, rule-of-five violations, QED), the molecule type, and the highest development phase ' +
    '(0–4, where 4 = approved). Optionally include mechanism(s) of action and molecular target(s). ' +
    'Use for discovery / competitive-landscape / developability questions about a known compound. ' +
    'Cite results by ChEMBL ID and link to the provided url.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Drug or compound name to search (e.g. "pembrolizumab", "osimertinib").',
      },
      include_mechanism: {
        type: 'boolean',
        description:
          'When true, also fetch mechanism(s) of action and target(s) for the top match. Default false.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum molecules to return (default: 5, max: 20).',
      },
    },
    required: ['query'],
  },
};

export const ASSESS_TRIAL_FEASIBILITY: AnaTool = {
  name: 'assess_trial_feasibility',
  description:
    'Assess the OPERATIONAL feasibility of a planned clinical trial from empirical ClinicalTrials.gov ' +
    'base rates for comparable studies (by condition, optional intervention and phase). Returns the ' +
    'completion vs discontinuation rate among trials that reached a terminal state — each with a 95% ' +
    'confidence interval — the realised enrollment distribution of completed comparators, the number ' +
    'of currently-active competing trials, sponsor breadth, and a feasibility verdict. Every figure is ' +
    'a count-based statistic; when too few comparable trials have resolved, it returns ' +
    "'insufficient_evidence' rather than an invented number. This answers 'can the trial be run?' " +
    "(recruitment, completion, competition) — distinct from the statistical probability of the endpoint hitting.",
  input_schema: {
    type: 'object',
    properties: {
      condition: {
        type: 'string',
        description: 'Disease / condition for the planned trial, e.g. "non-small cell lung cancer".',
      },
      intervention: {
        type: 'string',
        description: 'Optional intervention / drug / device to narrow the comparator set.',
      },
      phase: {
        type: 'string',
        description: 'Optional trial phase filter, e.g. PHASE3 or 3.',
      },
      max_comparators: {
        type: 'number',
        description: 'Maximum comparable trials to analyze (default 100, max 200).',
      },
    },
    required: ['condition'],
  },
};

export const SEARCH_PREPRINTS: AnaTool = {
  name: 'search_preprints',
  description:
    'Search preprints on bioRxiv / medRxiv (and other preprint servers) for emerging, ' +
    'pre-peer-review evidence — new mechanisms, targets, biomarkers, and translational findings. ' +
    'Backed by Europe PMC full-text preprint search. Returns records with a citeable DOI/URL, the ' +
    'preprint server, and the posting date. IMPORTANT: preprints are NOT peer-reviewed — always ' +
    'surface the returned caveat and label these findings as preliminary. Use to scout the leading ' +
    'edge of a field; corroborate with search_literature (PubMed) for peer-reviewed support.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text query (mechanism, target, biomarker, disease, method).',
      },
      server: {
        type: 'string',
        enum: ['biorxiv', 'medrxiv', 'any'],
        description: "Restrict to a preprint server, or 'any' (default).",
      },
      max_results: {
        type: 'number',
        description: 'Maximum preprints to return (default: 5, max: 25).',
      },
    },
    required: ['query'],
  },
};

export const SCREEN_COMPOUND_LIABILITIES: AnaTool = {
  name: 'screen_compound_liabilities',
  description:
    'Deterministic structural-alert and developability screen for a small molecule. Provide a SMILES ' +
    'string and/or a compound name (if only a name is given, the SMILES and descriptors are pulled ' +
    'from ChEMBL). Returns: (1) SMILES validation + heavy-atom inventory; (2) an ICH M7(R2)-relevant ' +
    'structural-alert screen — most importantly the N-nitrosamine motif, plus aromatic amine/nitro, ' +
    'epoxide/aziridine, azide, Michael acceptor, etc., each with a confidence level; and (3) a ' +
    'Lipinski/Veber oral-developability read over curated descriptors. This is a SCREEN, not an ICH ' +
    'M7 classification — always surface the returned disclaimer and recommend a qualified (Q)SAR ' +
    '(e.g. Derek/Sarah Nexus) plus expert review before any regulatory conclusion. High value for ' +
    'nitrosamine risk and early developability triage.',
  input_schema: {
    type: 'object',
    properties: {
      smiles: {
        type: 'string',
        description: 'SMILES structure of the molecule to screen.',
      },
      compound_name: {
        type: 'string',
        description: 'Compound/drug name to resolve via ChEMBL when no SMILES is supplied.',
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Project Schedule of Events — AnA-owned, regulatory-aware milestone schedule
// ─────────────────────────────────────────────────────────────────────────────

export const GENERATE_SCHEDULE_OF_EVENTS: AnaTool = {
  name: 'generate_schedule_of_events',
  description:
    "Generate (or regenerate) the active project's Schedule of Events: a regulatory-aware " +
    'set of dated, visual milestones for the program. AnA grounds the schedule in the project ' +
    'type (IND, 510K, NDA, BLA, PMA, De Novo, CER, IVDR, MAA, EUA), the applicable regulatory ' +
    'framework, and the program goals, compressing or stretching the milestone offsets to hit ' +
    'the requested target date. Milestones are stored as project workflow stages and surfaced ' +
    'on the Schedule tab. Requires an active project in context. Use when the user asks to plan, ' +
    'lay out, or build a project timeline / schedule / milestones, or when no schedule exists yet.',
  input_schema: {
    type: 'object',
    properties: {
      project_type: {
        type: 'string',
        description:
          'Submission/project type to base the schedule on (IND, NDA, BLA, 510K, PMA, DE_NOVO, ' +
          'CER, IVDR, MAA, EUA). Defaults to the project type in context.',
      },
      target_date: {
        type: 'string',
        description: 'Desired overall completion/submission date (ISO YYYY-MM-DD). The schedule compresses to fit.',
      },
      baseline_date: {
        type: 'string',
        description: 'Anchor/start date for the schedule (ISO YYYY-MM-DD). Defaults to today.',
      },
      goals: {
        type: 'array',
        description: 'Program goals to align the schedule to; the earliest goal target also pulls the program forward.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            target_date: { type: 'string', description: 'ISO YYYY-MM-DD' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            metric: { type: 'string', description: 'How success is measured' },
          },
          required: ['title'],
        },
      },
    },
    required: [],
  },
};

export const AMEND_SCHEDULE_OF_EVENTS: AnaTool = {
  name: 'amend_schedule_of_events',
  description:
    "Amend a single milestone on the active project's Schedule of Events — move its target date, " +
    'change its status, or update progress. Use when a milestone is completed, delayed, blocked, ' +
    'or needs re-dating based on new information. Records an auditable revision. Requires an ' +
    'active project in context.',
  input_schema: {
    type: 'object',
    properties: {
      milestone_key: {
        type: 'string',
        description: 'Stable key of the milestone to amend (e.g. "pre_ind_meeting"). Read it from the schedule first.',
      },
      new_target_date: { type: 'string', description: 'New target date (ISO YYYY-MM-DD).' },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'at_risk', 'completed', 'slipped', 'blocked'],
        description: 'New milestone status.',
      },
      progress: { type: 'number', description: 'Completion percentage 0-100.' },
      note: { type: 'string', description: 'Short rationale for the amendment (kept in the audit trail).' },
    },
    required: ['milestone_key'],
  },
};

export const REVIEW_SCHEDULE_OF_EVENTS_HEALTH: AnaTool = {
  name: 'review_schedule_of_events_health',
  description:
    "Proactively review the active project's Schedule of Events: assess every milestone for " +
    'slippage and at-risk status, open recovery/mitigation tasks, raise alerts, flag goals whose ' +
    'target dates have passed, and refresh AnA\'s status narrative. Returns the current health ' +
    'verdict (on_track / at_risk / off_track) with per-milestone detail. Requires an active ' +
    'project in context. Use to answer "where does my schedule stand?" or to take corrective ' +
    'action across the program.',
  input_schema: {
    type: 'object',
    properties: {
      apply: {
        type: 'boolean',
        description:
          'When true (default), AnA acts on findings (updates statuses, opens tasks, raises alerts). ' +
          'When false, only returns the assessment.',
      },
    },
    required: [],
  },
};

export const RESET_PROJECT_GOALS: AnaTool = {
  name: 'reset_project_goals',
  description:
    "Reset the active project's program goals based on changed context (new regulatory " +
    'requirement, slipped critical milestone, changed scope/strategy). Replaces the current goal ' +
    'set, retains the old goals as history, records the rationale, and raises an info alert. Use ' +
    'when goals must be re-baselined, not for one-off milestone edits. Requires an active project ' +
    'in context.',
  input_schema: {
    type: 'object',
    properties: {
      goals: {
        type: 'array',
        description: 'The new goal set.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            target_date: { type: 'string', description: 'ISO YYYY-MM-DD' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            metric: { type: 'string' },
          },
          required: ['title'],
        },
      },
      rationale: {
        type: 'string',
        description: 'Why the goals are being reset — recorded in the audit trail and shown to the user.',
      },
    },
    required: ['goals', 'rationale'],
  },
};

export const RECONCILE_DOSSIER_NUMBERS: AnaTool = {
  name: 'reconcile_dossier_numbers',
  description:
    "Scan several documents/modules of a submission together and flag the SAME labeled figure disagreeing across them — the classic reviewer finding (e.g. enrolled N in the protocol vs the CSR vs Module 2.7.3, or alpha/power/hazard-ratio drift between the SAP and the results). DETERMINISTIC and conservative: it extracts only figures sitting next to an unambiguous regulatory label (enrolled/randomized N, sample size, sites, events/deaths, alpha, power, hazard ratio, primary p-value) and reports any label that resolves to more than one distinct value, with the exact snippet from each document. Use this for cross-document numerical consistency — per-document checks cannot see these. Returns discrepancies (label + distinct values + per-document occurrences) and the labels found consistent.",
  input_schema: {
    type: 'object',
    properties: {
      documents: {
        type: 'array',
        description: 'The documents/modules to reconcile against each other.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable identifier (artifact id, module code, or file name).' },
            title: { type: 'string', description: 'Optional human-readable title for reporting.' },
            text: { type: 'string', description: 'Plain-text content of the document to scan.' },
          },
          required: ['id', 'text'],
        },
      },
    },
    required: ['documents'],
  },
};
