/**
 * Domain Prompt Registry — Comprehensive specialized prompts for every capability area.
 *
 * Every slash command, every former dashboard, every specialized focus has a set of
 * human-language prompts that achieve all goals through AnA conversation.
 *
 * Zero Capability Loss: if a dashboard once showed it, a prompt here can surface it.
 */

export interface DomainPrompt {
  id: string;
  label: string;
  /** Optional description shown below the label */
  description?: string;
  /** The intent key (for action handlers that intercept specific intents) */
  intent?: string;
}

export interface DomainPromptGroup {
  /** Domain identifier */
  domain: string;
  /** Human-readable label */
  label: string;
  /** Prompts in this domain — ordered by most common usage */
  prompts: DomainPrompt[];
}

// ── Core Project Intelligence ─────────────────────────────────────────────────

const PROJECT_STATUS: DomainPromptGroup = {
  domain: 'project-status',
  label: 'Project Status',
  prompts: [
    { id: 'ps-status', label: 'Give me a quick project status briefing' },
    { id: 'ps-readiness', label: 'How ready is my submission?' },
    { id: 'ps-blockers', label: "What's blocking my submission?" },
    { id: 'ps-next', label: 'What should I work on next?' },
    { id: 'ps-workflow', label: 'Show my full workflow progress' },
    { id: 'ps-assess', label: 'Run a comprehensive project assessment' },
  ],
};

const RISK_INTELLIGENCE: DomainPromptGroup = {
  domain: 'risk',
  label: 'Risk & Foresight',
  prompts: [
    { id: 'ri-risk', label: 'Analyze my submission risk profile' },
    { id: 'ri-simulate', label: 'Simulate likely reviewer challenges' },
    { id: 'ri-signals', label: 'Show accumulated regulatory intelligence signals' },
    { id: 'ri-deficiencies', label: 'Show known deficiency patterns for my submission type' },
    { id: 'ri-twin', label: 'Run a submission twin analysis — claims vs evidence integrity' },
    { id: 'ri-consistency', label: 'Check cross-module consistency across the dossier' },
    { id: 'ri-contradictions', label: 'Scan for contradictions across documents' },
    { id: 'ri-drift', label: 'Detect narrative drift across my submission' },
  ],
};

const RECOMMENDATIONS: DomainPromptGroup = {
  domain: 'recommendations',
  label: 'Recommendations',
  prompts: [
    { id: 'rec-recommend', label: 'What are my top priority actions right now?' },
    { id: 'rec-next', label: 'Prioritize my next steps by impact' },
    { id: 'rec-checklist', label: 'Generate a compliance checklist for my document' },
    { id: 'rec-preflight', label: 'Run a preflight check before submission' },
  ],
};

// ── Document Authoring ────────────────────────────────────────────────────────

const AUTHORING: DomainPromptGroup = {
  domain: 'authoring',
  label: 'Document Authoring',
  prompts: [
    { id: 'auth-draft', label: 'Draft a section for my submission' },
    { id: 'auth-audit', label: 'Audit my document like a hostile reviewer' },
    { id: 'auth-scan', label: 'Scan for regulatory deficiencies' },
    { id: 'auth-amend', label: 'Amend my document with change tracking' },
    { id: 'auth-review', label: 'Conduct a regulatory review of the current section' },
    { id: 'auth-claims', label: 'Analyze evidence chains and find unsupported claims' },
    { id: 'auth-lock-check', label: 'Check if this document is locked or approved before editing' },
    { id: 'auth-ctd-reqs', label: 'What are the regulatory requirements for this CTD section?' },
    { id: 'auth-next-step', label: 'Suggest the next step for this document' },
  ],
};

const DOCUMENT_LIFECYCLE: DomainPromptGroup = {
  domain: 'doc-lifecycle',
  label: 'Document Lifecycle',
  prompts: [
    { id: 'dl-freeze', label: 'Freeze this document for submission' },
    { id: 'dl-sign', label: 'Request electronic signature' },
    { id: 'dl-submit', label: 'Submit this document to regulatory workflow' },
    { id: 'dl-checklist', label: 'Generate regulatory compliance checklist' },
    { id: 'dl-export', label: 'Export this conversation' },
  ],
};

// ── Specialized Domains ───────────────────────────────────────────────────────

const BIOSTATISTICS: DomainPromptGroup = {
  domain: 'biostatistics',
  label: 'Biostatistics',
  prompts: [
    { id: 'bio-sap', label: 'Generate a Statistical Analysis Plan' },
    { id: 'bio-power', label: 'Calculate sample size and statistical power' },
    { id: 'bio-dose', label: 'Design a dose escalation protocol' },
    { id: 'bio-defensibility', label: 'Run a statistical defensibility assessment' },
    { id: 'bio-design', label: 'Help design the optimal clinical trial' },
  ],
};

const CMC: DomainPromptGroup = {
  domain: 'cmc',
  label: 'CMC / Module 3',
  prompts: [
    { id: 'cmc-eval', label: 'Evaluate my CMC documentation' },
    { id: 'cmc-change', label: 'Assess manufacturing change impact on CQAs' },
    { id: 'cmc-compare', label: 'Help with comparability assessment' },
    { id: 'cmc-module3', label: 'Review Module 3 documentation completeness' },
    { id: 'cmc-workplan', label: 'Generate a CMC workplan and timeline' },
    // Module 3 Workflow Convergence prompts (Phase 7)
    { id: 'cmc-build-m3', label: 'Build Module 3 from current project sources', intent: 'module3_build_all', description: 'Compile all Module 3 subsections from available source objects and uploaded documents' },
    { id: 'cmc-m3-missing', label: 'Show missing inputs for Module 3', intent: 'module3_missing_inputs', description: 'Show which subsections are missing required data to compile' },
    { id: 'cmc-m3-stale', label: 'Show stale Module 3 sections', intent: 'module3_stale_sections', description: 'Identify sections that need refreshing due to source changes' },
    { id: 'cmc-m3-refresh', label: 'Refresh stale Module 3 sections from latest sources', intent: 'module3_refresh_stale', description: 'Rebuild all stale sections from updated source data' },
    { id: 'cmc-m3-readiness', label: 'Module 3 submission readiness check', intent: 'module3_readiness', description: 'Check approval state, contradictions, and export readiness' },
    { id: 'cmc-m3-contradictions', label: 'Scan Module 3 for contradictions', intent: 'module3_contradictions', description: 'Detect cross-functional data conflicts in CMC data' },
    { id: 'cmc-m3-section', label: 'Build a specific Module 3 subsection (e.g. 3.2.S.4)', intent: 'module3_build_section', description: 'Compile one specific subsection and open it in the editor' },
    { id: 'cmc-m3-lineage', label: 'Show source lineage for a Module 3 section', intent: 'module3_lineage', description: 'Trace which sources feed a specific subsection' },
    // CMC Data Entry → Module 3 Write-Through prompts
    { id: 'cmc-push-data', label: 'Push CMC data into Module 3 pipeline', intent: 'cmc_push_data', description: 'Show which CMC data entries have been synced to canonical sources and which sections were impacted' },
    { id: 'cmc-pending-tasks', label: 'Show pending CMC review tasks', intent: 'cmc_pending_tasks', description: 'List CMC data entry tasks awaiting review or approval before merging to Module 3' },
    { id: 'cmc-data-coverage', label: 'What CMC data is missing for my project?', intent: 'cmc_data_coverage', description: 'Compare entered CMC data against Module 3 requirements to identify gaps' },
  ],
};

const SAFETY: DomainPromptGroup = {
  domain: 'safety',
  label: 'Safety & Pharmacovigilance',
  prompts: [
    { id: 'sf-narrative', label: 'Generate a safety narrative' },
    { id: 'sf-iss', label: 'Generate an Integrated Summary of Safety' },
    { id: 'sf-dsur', label: 'Help with DSUR preparation' },
    { id: 'sf-benefit-risk', label: 'Draft benefit-risk analysis' },
    { id: 'sf-rmp', label: 'Generate or update the Risk Management Plan' },
    { id: 'sf-cross-study', label: 'Run cross-study safety analysis' },
  ],
};

const CLINICAL: DomainPromptGroup = {
  domain: 'clinical',
  label: 'Clinical / Efficacy',
  prompts: [
    { id: 'cl-csr', label: 'Help with Clinical Study Report sections' },
    { id: 'cl-ise', label: 'Generate an Integrated Summary of Efficacy' },
    { id: 'cl-ib', label: 'Generate or update the Investigator\'s Brochure' },
    { id: 'cl-design', label: 'Design the optimal clinical trial' },
    { id: 'cl-endpoints', label: 'Recommend and evaluate endpoint strategy' },
    { id: 'cl-insights', label: 'Generate clinical insights for my indication' },
  ],
};

const DEVICE: DomainPromptGroup = {
  domain: 'device',
  label: 'Medical Devices',
  prompts: [
    { id: 'dev-510k', label: 'Help with my 510(k) submission' },
    { id: 'dev-predicate', label: 'Find predicate devices and comparisons' },
    { id: 'dev-pma', label: 'Help with PMA submission requirements' },
    { id: 'dev-denovo', label: 'Guide me through De Novo classification' },
    { id: 'dev-cer', label: 'Build Clinical Evaluation Report for EU MDR' },
  ],
};

const DIAGNOSTICS: DomainPromptGroup = {
  domain: 'diagnostics',
  label: 'Diagnostics & IVD',
  prompts: [
    { id: 'dx-intended-use', label: 'Refine intended use and clinical claim language for my diagnostic' },
    { id: 'dx-analytical', label: 'Build an analytical validation strategy (LoD, precision, linearity)' },
    { id: 'dx-clinical', label: 'Design clinical performance validation for sensitivity/specificity targets' },
    { id: 'dx-cutoff', label: 'Recommend cutoff strategy and method comparison plan' },
    { id: 'dx-cdx', label: 'Assess companion diagnostic co-development risks' },
  ],
};

const CMS_REIMBURSEMENT: DomainPromptGroup = {
  domain: 'cms',
  label: 'CMS & Reimbursement',
  prompts: [
    { id: 'cms-coding', label: 'Develop coding pathway strategy (CPT/HCPCS/DRG/APC)' },
    { id: 'cms-coverage', label: 'Assess coverage evidence for Medicare and key payers' },
    { id: 'cms-payment', label: 'Pressure-test payment assumptions and reimbursement risk' },
    { id: 'cms-heor', label: 'Build HEOR/value dossier narrative for payer conversations' },
    { id: 'cms-policy', label: 'Map coverage policy dependencies and evidence gaps' },
  ],
};

const REGULATORY_STRATEGY: DomainPromptGroup = {
  domain: 'strategy',
  label: 'Regulatory Strategy',
  prompts: [
    { id: 'str-strategy', label: 'Generate a Regulatory Strategy Note' },
    { id: 'str-memo', label: 'Generate a Risk Assessment Memo with go/no-go recommendation' },
    { id: 'str-brief', label: 'Prepare reviewer question anticipation brief' },
    { id: 'str-precedent', label: 'Find and analyze relevant regulatory precedents' },
    { id: 'str-pathway', label: 'Compare regulatory pathways for my product' },
    { id: 'str-jurisdictions', label: 'Analyze cross-jurisdictional requirements for my product' },
    { id: 'str-haq', label: 'Prepare for health authority questions' },
    {
      id: 'str-agency-deficiency',
      label: 'Agency-Specific Deficiency Prediction',
      description: 'Based on our submission type and target agency, predict the most likely deficiency questions. Use RIM pattern intelligence to identify agency-specific reviewer triggers and common rejection patterns.',
    },
    {
      id: 'str-multi-region-timeline',
      label: 'Multi-Region Timeline Optimization',
      description: 'Analyze our multi-region submission plan and optimize the sequencing. Which agencies should we file with first? Where can parallel submissions save time? What bridging requirements create dependencies?',
    },
    {
      id: 'str-ich-compliance',
      label: 'ICH Guideline Compliance Check',
      description: 'Scan our dossier for ICH guideline compliance. Identify which ICH guidelines apply to our submission type, flag deviations, and note where regional implementations differ from the harmonized standard.',
    },
    {
      id: 'str-pv-readiness',
      label: 'Pharmacovigilance System Readiness',
      description: 'Assess our pharmacovigilance system readiness for each target market. Check PSMF (EU), REMS (US), J-RMP (Japan), and RMP requirements. Identify gaps in our safety reporting infrastructure.',
    },
  ],
};

const MULTI_AGENCY_STRATEGY: DomainPromptGroup = {
  domain: 'multi-agency-strategy',
  label: 'Multi-Agency Strategy',
  prompts: [
    {
      id: 'mas-ema-scientific-advice',
      label: 'EMA Scientific Advice Strategy',
      description: 'Analyze our submission and recommend an EMA Scientific Advice strategy. What questions should we pose to the CHMP? Identify areas where rapporteur concerns are likely and suggest pre-emptive data packages.',
    },
    {
      id: 'mas-pmda-bridging',
      label: 'PMDA Bridging Study Assessment',
      description: 'Evaluate whether our clinical data requires bridging studies for PMDA submission. Assess ethnic sensitivity factors, Japanese population exposure requirements, and pharmacokinetic bridging needs per ICH E5.',
    },
    {
      id: 'mas-health-canada',
      label: 'Health Canada NDS Alignment',
      description: 'Review our dossier for Health Canada NDS alignment. Check bilingual labelling requirements, Canadian reference product comparison, and C-PHRM pediatric obligations.',
    },
    {
      id: 'mas-china-mrct',
      label: 'China NMPA MRCT Readiness',
      description: 'Assess our multi-regional clinical trial data for NMPA submission readiness. Evaluate Chinese site data sufficiency, CDE-format benefit-risk requirements, and data localization compliance.',
    },
    {
      id: 'mas-tga-pathway',
      label: 'TGA Pathway Selection',
      description: 'Recommend the optimal TGA registration pathway for our product. Compare CTN vs CTX approaches, evaluate scheduling classification rationale, and identify Australian-specific documentation requirements.',
    },
    {
      id: 'mas-cross-jurisdiction',
      label: 'Cross-Jurisdiction Harmonization',
      description: 'Perform a cross-jurisdictional analysis of our submission. Identify where our CTD can be harmonized across FDA, EMA, PMDA, and Health Canada vs. where region-specific modules are needed. Flag ICH guideline deviations by region.',
    },
    {
      id: 'mas-eu-pediatric-pip',
      label: 'EU Paediatric Investigation Plan',
      description: 'Evaluate our Paediatric Investigation Plan (PIP) compliance for EMA. Identify gaps in paediatric study obligations, assess waiver eligibility, and recommend PIP modification strategy if needed.',
    },
    {
      id: 'mas-global-labelling',
      label: 'Global Labelling Strategy',
      description: 'Develop a global labelling strategy across our target markets. Compare SmPC (EU), USPI (US), Japanese PI, and local labelling requirements. Identify content that can be harmonized vs. region-specific adaptations needed.',
    },
  ],
};

const LABELING: DomainPromptGroup = {
  domain: 'labeling',
  label: 'Labeling & SmPC',
  prompts: [
    { id: 'lbl-uspi', label: 'Generate US Prescribing Information' },
    { id: 'lbl-smpc', label: 'Generate Summary of Product Characteristics' },
    { id: 'lbl-ectd', label: 'Show eCTD module structure and place artifacts' },
  ],
};

const IND_AUTHORING: DomainPromptGroup = {
  domain: 'ind-authoring',
  label: 'IND Authoring',
  prompts: [
    // Module 1 — Administrative
    { id: 'ind-cover', label: 'Draft the IND cover letter (Section 1.1)', intent: 'ind_draft_section', description: 'Generate a complete FDA IND cover letter for your product' },
    { id: 'ind-1571', label: 'Prepare FDA Form 1571 data (Section 1.2)', intent: 'ind_draft_section', description: 'Generate structured data for the IND Application form' },
    { id: 'ind-1572', label: 'Prepare FDA Form 1572 data (Section 1.3)', intent: 'ind_draft_section', description: 'Statement of Investigator form data' },
    { id: 'ind-toc', label: 'Generate Table of Contents (Section 1.5)', intent: 'ind_draft_section', description: 'ICH M4 CTD structure with all modules' },
    // Module 2 — CTD Summaries
    { id: 'ind-intro', label: 'Draft CTD Introduction (Section 2.2)', intent: 'ind_draft_section', description: 'Product overview, mechanism of action, development rationale' },
    { id: 'ind-qos', label: 'Draft Quality Overall Summary (Section 2.3)', intent: 'ind_draft_section', description: 'Drug substance and drug product quality summary' },
    { id: 'ind-nco', label: 'Draft Nonclinical Overview (Section 2.4)', intent: 'ind_draft_section', description: 'Integrated pharmacology, PK, and toxicology assessment' },
    { id: 'ind-co', label: 'Draft Clinical Overview (Section 2.5)', intent: 'ind_draft_section', description: 'Clinical development rationale and safety/efficacy overview' },
    { id: 'ind-ncs', label: 'Draft Nonclinical Summaries (Section 2.6)', intent: 'ind_draft_section', description: 'Written and tabulated nonclinical summaries' },
    { id: 'ind-cs', label: 'Draft Clinical Summary (Section 2.7)', intent: 'ind_draft_section', description: 'Biopharmaceutics, pharmacology, efficacy, safety summaries' },
    // General IND workflow
    { id: 'ind-gap', label: 'Run IND gap analysis', description: 'Identify missing sections and data gaps across Module 1-5' },
    { id: 'ind-readiness', label: 'Assess IND submission readiness', description: 'Score each module and identify blockers' },
    { id: 'ind-reviewer', label: 'Anticipate FDA reviewer questions', description: 'Predict likely deficiency letters based on your submission state' },
    { id: 'ind-strategy', label: 'Review my IND regulatory strategy', description: 'Fast Track, Breakthrough, Orphan designation assessment' },
  ],
};

const DOSSIER: DomainPromptGroup = {
  domain: 'dossier',
  label: 'Dossier & Submission',
  prompts: [
    { id: 'dos-map', label: 'Map my CTD dossier structure' },
    { id: 'dos-missing', label: 'Identify missing sections in my dossier' },
    { id: 'dos-ectd', label: 'Show eCTD module structure' },
    { id: 'dos-readiness', label: 'Assess submission readiness by module' },
    { id: 'dos-workflow', label: 'Show full submission workflow with blockers' },
    { id: 'dos-predict', label: 'Predict the next best artifact to maximize readiness' },
    { id: 'dos-fragility', label: 'Assess my submission fragility' },
  ],
};

const KNOWLEDGE: DomainPromptGroup = {
  domain: 'knowledge',
  label: 'Knowledge & Memory',
  prompts: [
    { id: 'kb-knowledge', label: 'Show all knowledge stored for this project' },
    { id: 'kb-search', label: 'Search the project knowledge base' },
    { id: 'kb-decisions', label: 'Show key decisions and their rationale' },
    { id: 'kb-cross-doc', label: 'Analyze connections and gaps across my documents' },
  ],
};

const CONTEXT_TRANSPARENCY: DomainPromptGroup = {
  domain: 'context-transparency',
  label: 'Context & Transparency',
  prompts: [
    { id: 'ctx-memory', label: 'What memory context did you use for your last answer?' },
    { id: 'ctx-sources', label: 'Show me what sources informed your response' },
    { id: 'ctx-grounding', label: 'What is your current grounding mode?' },
    { id: 'ctx-enrichment', label: 'Which enrichment sources failed in the last response?' },
    { id: 'ctx-freshness', label: 'How fresh is the project context in this conversation?' },
    { id: 'ctx-ctd-guidance', label: 'What CTD section guidance applies to my current document?' },
    { id: 'ctx-confidence', label: 'Show me the confidence level of your last response' },
  ],
};

const REPORTS: DomainPromptGroup = {
  domain: 'reports',
  label: 'Reports & Export',
  prompts: [
    { id: 'rpt-report', label: 'Generate a full regulatory report' },
    { id: 'rpt-export', label: 'Export this conversation' },
    { id: 'rpt-audit-trail', label: 'Show audit trail for this document' },
  ],
};

// ── All domains ───────────────────────────────────────────────────────────────

export const ALL_DOMAIN_GROUPS: DomainPromptGroup[] = [
  PROJECT_STATUS,
  RISK_INTELLIGENCE,
  RECOMMENDATIONS,
  AUTHORING,
  DOCUMENT_LIFECYCLE,
  BIOSTATISTICS,
  CMC,
  SAFETY,
  CLINICAL,
  DEVICE,
  DIAGNOSTICS,
  CMS_REIMBURSEMENT,
  REGULATORY_STRATEGY,
  MULTI_AGENCY_STRATEGY,
  LABELING,
  IND_AUTHORING,
  DOSSIER,
  KNOWLEDGE,
  CONTEXT_TRANSPARENCY,
  REPORTS,
];

// ── Context-Aware Selection ───────────────────────────────────────────────────

/**
 * Map from navigation context to the most relevant domain groups.
 * Each context gets 3-5 primary domains surfaced first, with the rest available
 * through a "More prompts" expansion.
 */
const CONTEXT_DOMAIN_MAP: Record<string, string[]> = {
  // Global / project home
  'overview':           ['project-status', 'recommendations', 'risk', 'dossier'],
  'project-home':       ['project-status', 'recommendations', 'risk', 'dossier'],
  'projects':           ['project-status', 'recommendations', 'risk', 'dossier'],

  // Editor / authoring
  'submission-builder': ['authoring', 'doc-lifecycle', 'multi-agency-strategy', 'recommendations', 'risk'],
  'editor':             ['authoring', 'doc-lifecycle', 'recommendations', 'risk'],
  'ri-copilot':         ['authoring', 'risk', 'strategy', 'recommendations'],

  // Specialized domains
  'biostatistics':      ['biostatistics', 'clinical', 'authoring', 'risk'],
  'cmc':                ['cmc', 'authoring', 'recommendations', 'dossier'],
  'clinical-module5':   ['clinical', 'safety', 'biostatistics', 'authoring'],
  'safety':             ['safety', 'clinical', 'risk', 'authoring'],
  'device':             ['device', 'strategy', 'dossier', 'authoring'],
  'diagnostics':        ['diagnostics', 'device', 'clinical', 'biostatistics', 'risk'],
  'cms':                ['cms', 'strategy', 'reports', 'recommendations', 'risk'],

  // IND-specific contexts
  'ind':                ['ind-authoring', 'dossier', 'risk', 'recommendations'],
  'ind-checklist':      ['ind-authoring', 'dossier', 'authoring', 'risk'],
  'ind-workspace':      ['ind-authoring', 'authoring', 'dossier', 'risk'],
  'bla':                ['ind-authoring', 'cmc', 'clinical', 'dossier'],
  'nda':                ['ind-authoring', 'clinical', 'safety', 'dossier'],

  // Workflow views
  'verify':             ['recommendations', 'risk', 'doc-lifecycle', 'authoring'],
  'review':             ['authoring', 'risk', 'doc-lifecycle', 'recommendations'],
  'publish':            ['doc-lifecycle', 'dossier', 'recommendations', 'risk'],

  // Strategy / intelligence
  'strategy':           ['strategy', 'multi-agency-strategy', 'risk', 'recommendations', 'reports'],
  'intelligence':       ['risk', 'strategy', 'multi-agency-strategy', 'recommendations', 'knowledge', 'context-transparency'],
  'foresight':          ['risk', 'strategy', 'recommendations', 'project-status'],
  'precedent':          ['strategy', 'risk', 'authoring', 'recommendations'],

  // Dossier / vault
  'dossier-map':        ['dossier', 'authoring', 'recommendations', 'doc-lifecycle'],
  'vault':              ['knowledge', 'context-transparency', 'reports', 'dossier', 'doc-lifecycle'],

  // Labeling
  'labeling':           ['labeling', 'authoring', 'strategy', 'doc-lifecycle'],

  // Reports
  'report-engine':      ['reports', 'risk', 'recommendations', 'project-status'],
};

/**
 * Get domain prompt groups relevant to the current navigation context.
 *
 * @param navContext - The activeNavId or layoutMode (e.g. 'submission-builder', 'cmc')
 * @returns Primary groups (3-5) followed by remaining groups
 */
export function getPromptsForContext(navContext: string | null | undefined): {
  primary: DomainPromptGroup[];
  more: DomainPromptGroup[];
} {
  const key = navContext || 'overview';
  const primaryDomains = CONTEXT_DOMAIN_MAP[key] || CONTEXT_DOMAIN_MAP['overview']!;

  const primary = primaryDomains
    .map(d => ALL_DOMAIN_GROUPS.find(g => g.domain === d))
    .filter((g): g is DomainPromptGroup => !!g);

  const primarySet = new Set(primaryDomains);
  const more = ALL_DOMAIN_GROUPS.filter(g => !primarySet.has(g.domain));

  return { primary, more };
}

/**
 * Get a flat list of suggested action prompts for the current context.
 * Returns the top N prompts from primary domains, suitable for the
 * suggested action chips in AnaPersistentPanel.
 *
 * @param navContext - The activeNavId or layoutMode
 * @param maxChips - Maximum number of prompts to return (default 4)
 */
export function getSuggestedPromptsForContext(
  navContext: string | null | undefined,
  maxChips = 4
): DomainPrompt[] {
  const { primary } = getPromptsForContext(navContext);
  // Take the first prompt from each primary domain, then fill remaining slots
  const top: DomainPrompt[] = [];
  for (const group of primary) {
    if (top.length >= maxChips) break;
    if (group.prompts[0]) top.push(group.prompts[0]);
  }
  return top.slice(0, maxChips);
}
