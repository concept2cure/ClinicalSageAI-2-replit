/**
 * ui-v2 nav + AnA model — ported verbatim from the design kit's
 * app/registry.jsx (design_handoff_c2c_v2_ui_replacement, 2026-07-06).
 *
 * The SURFACES themselves live in shared/constants/ui-surface-registry.ts
 * (reconciled with the kit ids in the same change — deep links depend on the
 * ids staying identical). This module carries everything AROUND the surfaces:
 * the rail model (client categories · core · specialist · explore · quick),
 * client segmentation, per-segment workspace modules, AnA modes / co-author
 * context / surface-scoped actions, and the governed AI-action taxonomy.
 *
 * GENERATED from the kit registry (scripts in the design package) — edit the
 * kit first, then re-port, so design and code cannot drift.
 *
 * The ANA_* co-author/context objects are FIXTURES (the kit's offline shapes).
 * Surfaces render them only behind the SampleTag pill until the live
 * /api/coauthor + /api/ana-ri wiring lands in the surface-port phases —
 * never as live data (GAP RULE).
 */
import { getSurface, UI_SURFACES, type UiSurface } from '@shared/constants/ui-surface-registry';

/** Client-type rail tiers (kit NAV_TIERS — distinct from the registry's structural navTier) */
export const NAV_TIERS_V2 = [
  { id: 'mdx', label: 'Medical Device & IVD' },
  { id: 'biopharma', label: 'Biotech & Pharma' },
  { id: 'admin', label: 'Admin' },
];
/** Surface → client-type rail group (mdx | biopharma | admin | both) */
export const NAV_GROUP_OF: Record<string, string> = {
  'device-workstream': 'mdx',
  labeling: 'mdx',
  risk: 'mdx',
  'design-controls': 'mdx',
  'human-factors': 'mdx',
  'labeling-pi': 'biopharma',
  'program-journey': 'biopharma',
  'authoring-engine': 'biopharma',
  'batch-draft': 'biopharma',
  inconsistency: 'biopharma',
  'source-tracer': 'biopharma',
  pediatric: 'biopharma',
  orphan: 'biopharma',
  'lifecycle-mgmt': 'biopharma',
  pharmacovigilance: 'biopharma',
  'clinical-ops': 'biopharma',
  nonclinical: 'biopharma',
  registrations: 'both',
  'change-assessment': 'both',
  'nda-cockpit': 'biopharma',
  'agency-meetings': 'both',
  'shadow-review': 'both',
  'dispatch-readiness': 'both',
  'communication-center': 'both',
  insights: 'both',
  'market-access': 'both',
  'reg-change': 'both',
  dossier: 'both',
  'ind-checklist': 'biopharma',
  biopharma: 'biopharma',
  cmc: 'biopharma',
  'csr-workflow': 'biopharma',
  'ectd-coauthor': 'biopharma',
  pdev: 'biopharma',
  setup: 'admin',
  'audit-trail': 'admin',
  billing: 'admin',
  licensing: 'admin',
  training: 'admin',
};
/** Client-category selector at the top of the rail — drives segment context */
export const CLIENT_CATEGORIES = [
  { id: 'medtech', label: 'Medical Device & IVD', icon: 'stethoscope' },
  { id: 'biotech', label: 'Biotech', icon: 'atom' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'microscope' },
  { id: 'pharma', label: 'Pharma', icon: 'beaker' },
  { id: 'cro', label: 'CRO / Research', icon: 'network' },
  { id: 'health', label: 'Health Systems', icon: 'building' },
];
/** Core workspace — the same central solution for every client type */
export const RAIL_CORE = [
  { id: 'projects', label: 'Project management', icon: 'folder' },
  { id: 'vault', label: 'Vault', icon: 'vault' },
  { id: 'submission-center', label: 'Submission Center', icon: 'rocket' },
  { id: 'tasks', label: 'Tasking', icon: 'checkSquare' },
  { id: 'insights', label: 'Reporting & analytics', icon: 'barChart' },
];
/** Specialist science apps promoted to the rail (also in the Apps catalog) */
export const RAIL_SPECIALIST = [{ id: 'rbm', label: 'Risk-based monitoring', icon: 'shieldCheck' }];
/** Explore section */
export const RAIL_EXPLORE = [
  { id: 'ana-command', label: 'AnA Command', icon: 'sparkles', badge: 'AnA' },
  { id: 'ana-memory', label: 'AnA Memory', icon: 'database', badge: 'AnA' },
  { id: 'apps', label: 'Apps catalog', icon: 'grid' },
  { id: 'artifacts-center', label: 'Artifacts Center', icon: 'sparkles' },
  { id: 'conversation-thread', label: 'Conversation', icon: 'messageSquare', badge: 'AnA' },
];
/** Quick access (targets resolve to surface ids) */
export const RAIL_QUICK = [
  { id: 'recent', label: 'Recent Documents', icon: 'clock', target: 'document-authoring' },
  { id: 'tasks', label: 'My Tasks', icon: 'checkSquare', target: 'tasks', count: 12 },
  { id: 'starred', label: 'Starred Items', icon: 'star', target: 'projects' },
];
/** Surfaces reachable via ⌘K/deep-link but intentionally not rail entries */
export const NAV_HIDDEN: ReadonlySet<string> = new Set([
  'device-510k',
  'device-cer',
  'device-diagnostics',
  'ectd-coauthor',
  'csr-workflow',
  'filings-catalog',
  'dossier-map',
  'nda-cockpit',
  'biopharma',
  'ind-checklist',
  'template-library',
  'dossier',
  'review-approve',
  'doc-journey',
  'change-assessment',
  'tasks',
  'review',
  'agency-meetings',
  'vault',
  'evidence-search',
  'haq-manager',
  'global-ri',
  'safety-narrative',
  'cmc',
  'labeling',
  'risk',
  'design-controls',
  'human-factors',
  'regulatory-workspace',
  'labeling-pi',
]);
/** Client segmentation — canonical UI axis organizations.client_type; see kit registry notes */
export const SEGMENTS = [
  {
    id: 'medtech',
    label: 'Medical Device & Diagnostics',
    primary: true,
    icon: 'stethoscope',
    pathways: ['510(k)', 'De Novo', 'PMA', 'IVDR'],
    defaultSurface: 'device-workstream',
    focus: [
      'device-workstream',
      'labeling',
      'risk',
      'design-controls',
      'human-factors',
      'precedent-intelligence',
    ],
    ana: '510(k)/PMA/De Novo + IVDR; predicate & substantial-equivalence context.',
  },
  {
    id: 'biotech',
    label: 'Biotech',
    primary: true,
    icon: 'atom',
    pathways: ['IND', 'BLA', 'MAA', 'J-NDA'],
    defaultSurface: 'biopharma',
    focus: ['ind-checklist', 'biopharma', 'cmc', 'document-authoring', 'pdev', 'biostatistics'],
    ana: 'Biologics IND→BLA, CTD assembly, comparability & immunogenicity.',
  },
  {
    id: 'pharma',
    label: 'Pharma',
    primary: true,
    icon: 'beaker',
    pathways: ['IND', 'NDA', 'MAA', 'J-NDA', 'Lifecycle'],
    defaultSurface: 'nda-cockpit',
    focus: [
      'nda-cockpit',
      'ind-checklist',
      'cmc',
      'document-authoring',
      'biostatistics',
      'safety-narrative',
    ],
    ana: 'Small-molecule IND→NDA/MAA, pediatric plans.',
  },
  {
    id: 'cro',
    label: 'CRO',
    primary: true,
    icon: 'network',
    multiSponsor: true,
    pathways: ['Multi-sponsor: CER / 510K / IND / NDA / BLA / PMA / De Novo'],
    defaultSurface: 'cro-portfolio',
    focus: [
      'cro-portfolio',
      'protocol-dev',
      'research-admin',
      'projects',
      'tasks',
      'submission-center',
      'insights',
    ],
    ana: 'Multi-sponsor programs, tenant-isolated by organization.',
  },
  {
    id: 'academic',
    label: 'Academic / IIT',
    primary: false,
    icon: 'book',
    pathways: ['IIT', 'IRB'],
    defaultSurface: 'protocol-dev',
    focus: ['projects', 'protocol-dev', 'research-admin', 'document-authoring', 'biostatistics'],
    ana: 'Investigator-initiated trials, IRB/IACUC protocol authoring & committee review.',
  },
  {
    id: 'regulatory',
    label: 'Regulatory consulting',
    primary: false,
    icon: 'scale',
    pathways: ['Cross-segment'],
    defaultSurface: 'projects',
    focus: ['global-ri', 'precedent-intelligence', 'submission-center'],
    ana: 'Consulting / government — all pathways.',
  },
  {
    id: 'medical_writing',
    label: 'Medical writing',
    primary: false,
    icon: 'penLine',
    pathways: ['Document canvas'],
    defaultSurface: 'document-authoring',
    focus: ['document-authoring', 'template-library'],
    ana: 'Document-first authoring.',
  },
];
export const PRIMARY_SEGMENTS = SEGMENTS.filter((s) => s.primary);
export const getSegment = (id: string) => SEGMENTS.find((s) => s.id === id);

/** Readiness tier display meta (label · tone · blurb) */
export const READINESS_META = {
  'contract-ready': {
    label: 'Contract-ready',
    tone: 'ok',
    blurb: 'Typed @shared contract and/or one-call discovery catalog exist — render from data.',
  },
  'routes-ready': {
    label: 'Routes-ready',
    tone: 'ai',
    blurb: 'REST mounted + tested; bind components directly. Contract partial/absent.',
  },
  'kit-only': {
    label: 'Kit-only',
    tone: 'warn',
    blurb: 'Design prototype exists; backend binding map being assembled.',
  },
  planned: { label: 'Planned', tone: 'idle', blurb: 'Routes exist; surface not yet prioritized.' },
};
/** Entitlements sample: module ids this org is NOT licensed for (fixture until /api/module-subscriptions wiring in Phase 6; rail shows lock + upgrade CTA, never a dead button) */
export const LICENSE_UNLICENSED: string[] = ['labeling', 'risk', 'pdev', 'biopharma'];
export const isLicensed = (id: string) => !LICENSE_UNLICENSED.includes(id);

/** AnA modes (intent → engine label, resolved server-side; no vendor names on screen) */
export const ANA_MODES = [
  { id: 'standard', label: 'Standard', model: 'Balanced', desc: 'Chat, reasoning, quick answers' },
  {
    id: 'deep-research',
    label: 'Deep research',
    model: 'Maximum',
    desc: 'Drafting, multi-step analysis, long-form',
  },
  {
    id: 'quick-ask',
    label: 'Quick ask',
    model: 'Instant',
    desc: 'Autocomplete, inline, classification',
  },
];
/** Governed AI actions (POST /api/ai-actions/execute); governed:true requires the §11.50 e-sign gate */
export const AI_ACTIONS = [
  {
    id: 'run_validation',
    label: 'Run validation',
    governed: false,
    verb: 'Validated',
    triggers: ['validate', 'validation', 'check', 'verify', 'preflight', 'lint', 'rule'],
  },
  {
    id: 'refine_with_validation',
    label: 'Refine with findings',
    governed: false,
    verb: 'Refined',
    triggers: ['refine', 'address', 'fix', 'improve', 'revise', 'rewrite', 'tighten', 'strengthen'],
  },
  {
    id: 'attach_sources_to_document',
    label: 'Attach sources',
    governed: false,
    verb: 'Attached sources to',
    triggers: ['attach', 'cite', 'reference', 'source', 'citation', 'evidence', 'support', 'link'],
  },
  {
    id: 'promote_artifact',
    label: 'Promote to document',
    governed: true,
    verb: 'Promoted',
    triggers: ['promote', 'publish', 'elevate', 'formalize'],
  },
  {
    id: 'save_document_version',
    label: 'Save version',
    governed: true,
    verb: 'Versioned',
    triggers: ['save', 'version', 'snapshot', 'commit', 'baseline'],
  },
  {
    id: 'route_document_to_module',
    label: 'Route to module',
    governed: true,
    verb: 'Routed',
    triggers: ['route', 'send', 'move', 'assign', 'dispatch', 'hand off', 'transfer'],
  },
  {
    id: 'export_document',
    label: 'Export document',
    governed: true,
    verb: 'Exported',
    triggers: ['export', 'download', 'pdf', 'docx', 'zip', 'share'],
  },
  {
    id: 'compile_dossier',
    label: 'Compile dossier',
    governed: true,
    verb: 'Compiled',
    triggers: ['compile', 'assemble', 'package', 'bundle', 'build', 'prepare'],
  },
];
export const getAction = (id: string) => AI_ACTIONS.find((a) => a.id === id);

/** Surface-scoped action intents (Agent-mode fallback chips, Ask follow-ups, ⌘K ranking) */
export const SURFACE_ACTIONS: Record<string, string[]> = {
  rbm: ['run_validation', 'attach_sources_to_document', 'export_document'],
  pyramid: ['run_validation', 'export_document'],
  'document-authoring': [
    'run_validation',
    'refine_with_validation',
    'attach_sources_to_document',
    'save_document_version',
    'export_document',
  ],
  'ectd-coauthor': ['run_validation', 'compile_dossier', 'route_document_to_module', 'export_document'],
  'csr-workflow': ['run_validation', 'refine_with_validation', 'save_document_version', 'export_document'],
  'device-510k': [
    'run_validation',
    'refine_with_validation',
    'attach_sources_to_document',
    'save_document_version',
    'export_document',
  ],
  'device-cer': [
    'run_validation',
    'refine_with_validation',
    'attach_sources_to_document',
    'save_document_version',
    'export_document',
  ],
  'ivd-completeness': ['assess_filing_readiness', 'run_validation', 'refine_with_validation', 'export_document'],
  'device-diagnostics': [
    'run_validation',
    'refine_with_validation',
    'attach_sources_to_document',
    'save_document_version',
    'export_document',
  ],
  'submission-center': ['compile_dossier', 'route_document_to_module', 'export_document', 'save_document_version'],
  'decision-lineage': ['get_document', 'export_document', 'run_validation'],
  dossier: ['compile_dossier', 'route_document_to_module', 'export_document'],
  vault: ['promote_artifact', 'attach_sources_to_document', 'export_document'],
  review: ['save_document_version', 'export_document', 'route_document_to_module'],
  'haq-manager': ['attach_sources_to_document', 'refine_with_validation', 'save_document_version'],
  'report-engine': ['attach_sources_to_document', 'export_document'],
  'global-ri': ['compile_dossier', 'attach_sources_to_document'],
  'safety-narrative': ['attach_sources_to_document', 'save_document_version'],
  biostatistics: ['attach_sources_to_document', 'refine_with_validation'],
  'precedent-intelligence': ['attach_sources_to_document', 'promote_artifact'],
  cmc: ['run_validation', 'refine_with_validation', 'save_document_version'],
  'ind-checklist': ['run_validation', 'compile_dossier', 'route_document_to_module'],
  risk: ['attach_sources_to_document', 'save_document_version'],
  labeling: ['run_validation', 'refine_with_validation', 'save_document_version'],
  'evidence-search': ['attach_sources_to_document', 'promote_artifact'],
  tasks: ['route_document_to_module'],
  'conversation-thread': ['attach_sources_to_document', 'promote_artifact'],
  _default: ['run_validation', 'attach_sources_to_document', 'export_document'],
};
export const getSurfaceActions = (id: string) =>
  SURFACE_ACTIONS[id] ?? SURFACE_ACTIONS._default;

/** Per-category workspace modules (complete capability inventory on the segment home) */
export const SEGMENT_MODULES = {
  medtech: [
    {
      label: 'Author & assemble',
      items: [
        'device-workstream',
        'device-510k',
        'device-cer',
        'labeling',
        'inconsistency',
        'source-tracer',
        'doc-journey',
        'template-library',
      ],
    },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage'],
    },
    { label: 'Submit & file', items: ['submission-center', 'pyramid', 'dossier-map', 'haq-manager'] },
    { label: 'Review & govern', items: ['review', 'tasks', 'agency-meetings', 'audit-trail'] },
    {
      label: 'Intelligence & risk',
      items: ['precedent-intelligence', 'risk', 'global-ri', 'intelligence-catalog', 'deep-research'],
    },
    { label: 'Lifecycle & access', items: ['registrations', 'market-access', 'change-assessment'] },
  ],
  diagnostics: [
    {
      label: 'Author & assemble',
      items: [
        'device-diagnostics',
        'ivd-completeness',
        'device-cer',
        'device-510k',
        'labeling',
        'inconsistency',
        'source-tracer',
        'template-library',
      ],
    },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage'],
    },
    { label: 'Submit & file', items: ['submission-center', 'pyramid', 'dossier-map', 'haq-manager'] },
    { label: 'Review & govern', items: ['review', 'tasks', 'agency-meetings', 'audit-trail'] },
    {
      label: 'Intelligence & risk',
      items: ['precedent-intelligence', 'risk', 'global-ri', 'intelligence-catalog', 'deep-research'],
    },
    { label: 'Lifecycle & access', items: ['registrations', 'market-access', 'change-assessment'] },
  ],
  biotech: [
    { label: 'Program journey', items: ['program-journey'] },
    {
      label: 'Author & assemble',
      items: [
        'authoring-engine',
        'batch-draft',
        'inconsistency',
        'source-tracer',
        'dossier',
        'document-authoring',
        'biopharma',
        'cmc',
        'nonclinical',
        'csr-workflow',
        'labeling-pi',
        'doc-journey',
        'ectd-coauthor',
        'template-library',
      ],
    },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage', 'insights'],
    },
    {
      label: 'Applications & filing',
      items: [
        'filings-catalog',
        'nda-cockpit',
        'ind-checklist',
        'submission-center',
        'communication-center',
        'pyramid',
        'dossier-map',
        'pdev',
        'haq-manager',
      ],
    },
    {
      label: 'Review & govern',
      items: [
        'orchestration',
        'review',
        'shadow-review',
        'dispatch-readiness',
        'tasks',
        'agency-meetings',
        'audit-trail',
      ],
    },
    {
      label: 'Science & intelligence',
      items: [
        'biostatistics',
        'rbm',
        'clinical-ops',
        'safety-narrative',
        'pharmacovigilance',
        'precedent-intelligence',
        'global-ri',
        'intelligence-catalog',
        'deep-research',
      ],
    },
    {
      label: 'Lifecycle & access',
      items: [
        'lifecycle-mgmt',
        'pediatric',
        'orphan',
        'registrations',
        'market-access',
        'change-assessment',
        'reg-change',
      ],
    },
  ],
  pharma: [
    { label: 'Program journey', items: ['program-journey'] },
    {
      label: 'Author & assemble',
      items: [
        'authoring-engine',
        'batch-draft',
        'inconsistency',
        'source-tracer',
        'dossier',
        'document-authoring',
        'labeling-pi',
        'cmc',
        'nonclinical',
        'csr-workflow',
        'doc-journey',
        'ectd-coauthor',
        'template-library',
      ],
    },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage', 'insights'],
    },
    {
      label: 'Applications & filing',
      items: [
        'filings-catalog',
        'nda-cockpit',
        'ind-checklist',
        'submission-center',
        'communication-center',
        'pyramid',
        'dossier-map',
        'pdev',
        'haq-manager',
      ],
    },
    {
      label: 'Review & govern',
      items: [
        'orchestration',
        'review',
        'shadow-review',
        'dispatch-readiness',
        'tasks',
        'agency-meetings',
        'audit-trail',
      ],
    },
    {
      label: 'Science & intelligence',
      items: [
        'biostatistics',
        'rbm',
        'clinical-ops',
        'safety-narrative',
        'pharmacovigilance',
        'precedent-intelligence',
        'global-ri',
        'intelligence-catalog',
        'deep-research',
      ],
    },
    {
      label: 'Lifecycle & access',
      items: [
        'lifecycle-mgmt',
        'pediatric',
        'orphan',
        'registrations',
        'market-access',
        'change-assessment',
        'reg-change',
      ],
    },
  ],
  cro: [
    { label: 'Portfolio & studies', items: ['cro-portfolio', 'projects', 'tasks'] },
    {
      label: 'Author & assemble',
      items: ['protocol-dev', 'document-authoring', 'csr-workflow', 'template-library'],
    },
    { label: 'Research administration', items: ['research-admin', 'agency-meetings'] },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage', 'insights'],
    },
    {
      label: 'Submit & file',
      items: ['submission-center', 'ind-checklist', 'dossier-map', 'haq-manager'],
    },
    {
      label: 'Science & intelligence',
      items: [
        'biostatistics',
        'rbm',
        'precedent-intelligence',
        'global-ri',
        'intelligence-catalog',
        'deep-research',
      ],
    },
    { label: 'Review & govern', items: ['review', 'audit-trail'] },
  ],
  health: [
    { label: 'Author & assemble', items: ['protocol-dev', 'document-authoring', 'template-library'] },
    { label: 'Research administration', items: ['research-admin', 'agency-meetings'] },
    {
      label: 'Evidence & data',
      items: ['vault', 'evidence-search', 'artifacts-center', 'decision-lineage'],
    },
    { label: 'Submit & file', items: ['ind-checklist', 'submission-center'] },
    {
      label: 'Science & intelligence',
      items: ['biostatistics', 'global-ri', 'intelligence-catalog', 'deep-research'],
    },
    { label: 'Review & govern', items: ['review', 'tasks', 'audit-trail'] },
  ],
};
/** FIXTURE — per-segment co-author context; live override comes from /api/coauthor (SampleTag applies) */
export const ANA_COAUTHOR_BY_SEG = {
  biotech: {
    program: 'BX-204 · oncology BLA',
    section: '2.5 Clinical Overview',
    stage: 'Draft',
    readiness: 72,
    evidence: [{ count: 3, label: 'studies' }, { count: 1, label: 'CSR' }, { count: 2, label: 'precedents' }],
    activity: [
      { type: 'edit', text: 'Endpoint rationale updated', when: '12m ago' },
      { type: 'alert', text: 'ORR contradiction detected', when: '1h ago' },
    ],
    actions: [
      {
        id: 'draft_section',
        label: 'Draft section',
        icon: 'penLine',
        prompt: 'Draft §2.5 Clinical Overview from the linked studies, CSR and approved precedents.',
      },
      {
        id: 'harmonize',
        label: 'Harmonize with §2.7.3',
        icon: 'gitCompare',
        prompt: 'Harmonize §2.5 endpoint language with §2.7.3 Clinical Efficacy Summary and flag any divergence.',
      },
      {
        id: 'explain_blocker',
        label: 'Explain blocker',
        icon: 'alertTriangle',
        prompt: 'Explain the ORR contradiction blocking §2.5 and what evidence resolves it.',
      },
      {
        id: 'correction',
        label: 'Generate correction draft',
        icon: 'wand',
        prompt: 'Generate a correction draft for the ORR contradiction in §2.5, tracked for review.',
      },
      {
        id: 'compare_approved',
        label: 'Compare to approved version',
        icon: 'gitBranch',
        prompt: 'Compare the current §2.5 draft to the last approved version and summarize the deltas.',
      },
    ],
  },
  medtech: {
    program: 'CardioFlow CX · 510(k)',
    section: '§12 — Substantial Equivalence',
    stage: 'Draft',
    readiness: 64,
    evidence: [
      { count: 2, label: 'predicates' },
      { count: 1, label: 'bench test' },
      { count: 1, label: 'clinical' },
    ],
    activity: [
      { type: 'edit', text: 'Predicate K203117 linked', when: '9m ago' },
      { type: 'alert', text: 'Sterilization SE gap flagged', when: '40m ago' },
    ],
    actions: [
      {
        id: 'draft',
        label: 'Draft SE comparison',
        icon: 'penLine',
        prompt: 'Draft the §12 substantial-equivalence comparison table against predicate K203117.',
      },
      {
        id: 'compare',
        label: 'Compare predicates',
        icon: 'gitCompare',
        prompt: 'Compare the two linked predicates and recommend the strongest SE basis.',
      },
      {
        id: 'explain',
        label: 'Explain SE gap',
        icon: 'alertTriangle',
        prompt: 'Explain the sterilization SE gap and what evidence closes it.',
      },
      {
        id: 'estar',
        label: 'Build eSTAR section',
        icon: 'fileCheck',
        prompt: 'Assemble the eSTAR §12 section from the SE comparison.',
      },
    ],
  },
  diagnostics: {
    program: 'DxAssay RT-PCR · IVDR',
    section: 'Annex II — Performance Evaluation',
    stage: 'Draft',
    readiness: 58,
    evidence: [
      { count: 3, label: 'analytical' },
      { count: 1, label: 'clinical perf' },
      { count: 2, label: 'precedents' },
    ],
    activity: [
      { type: 'edit', text: 'LoD study results updated', when: '15m ago' },
      { type: 'alert', text: 'CDx linkage gap detected', when: '1h ago' },
    ],
    actions: [
      {
        id: 'draft',
        label: 'Draft performance report',
        icon: 'penLine',
        prompt: 'Draft the IVDR Annex II performance evaluation from the linked analytical and clinical studies.',
      },
      {
        id: 'gspr',
        label: 'Check GSPR',
        icon: 'fileCheck',
        prompt: 'Check the performance report against IVDR GSPR requirements and flag gaps.',
      },
      {
        id: 'explain',
        label: 'Explain CDx gap',
        icon: 'alertTriangle',
        prompt: 'Explain the companion-diagnostic linkage gap and how to resolve it.',
      },
      {
        id: 'compare',
        label: 'Compare to precedent',
        icon: 'gitBranch',
        prompt: 'Compare this performance dossier to the two IVDR precedents.',
      },
    ],
  },
  pharma: {
    program: 'AltexaTab · NDA',
    section: '2.7.1 Biopharmaceutic Summary',
    stage: 'Draft',
    readiness: 70,
    evidence: [{ count: 4, label: 'CSRs' }, { count: 1, label: 'ISS/ISE' }, { count: 2, label: 'precedents' }],
    activity: [
      { type: 'edit', text: 'Pop-PK bridge updated', when: '11m ago' },
      { type: 'alert', text: 'PLLR labeling gap flagged', when: '1h ago' },
    ],
    actions: [
      {
        id: 'label',
        label: 'Draft USPI label',
        icon: 'fileText',
        prompt: 'Draft the USPI per PLLR / 21 CFR 201.57 from the clinical summary.',
      },
      {
        id: 'harmonize',
        label: 'Harmonize with ISS',
        icon: 'gitCompare',
        prompt: 'Harmonize the biopharmaceutic summary with the ISS/ISE.',
      },
      {
        id: 'explain',
        label: 'Explain PLLR gap',
        icon: 'alertTriangle',
        prompt: 'Explain the PLLR labeling gap and what is needed to close it.',
      },
      {
        id: 'compare',
        label: 'Compare to approved label',
        icon: 'gitBranch',
        prompt: 'Compare the draft USPI to the approved reference label.',
      },
    ],
  },
  cro: {
    program: 'Multi-sponsor portfolio',
    section: 'Cross-sponsor submission plan',
    stage: 'Planning',
    readiness: 45,
    evidence: [{ count: 7, label: 'sponsors' }, { count: 12, label: 'studies' }],
    activity: [
      { type: 'edit', text: 'Sponsor Acme study added', when: '20m ago' },
      { type: 'alert', text: 'Org-isolation check pending', when: '2h ago' },
    ],
    actions: [
      {
        id: 'plan',
        label: 'Plan submission',
        icon: 'penLine',
        prompt: 'Draft the cross-sponsor submission plan for the active portfolio.',
      },
      {
        id: 'portfolio',
        label: 'Sponsor portfolio',
        icon: 'gitBranch',
        prompt: 'Summarize status across all 7 sponsors and 12 studies.',
      },
      {
        id: 'explain',
        label: 'Org-isolation check',
        icon: 'alertTriangle',
        prompt: 'Run the org-isolation check across sponsors and report exposure.',
      },
      {
        id: 'study',
        label: 'Set up new study',
        icon: 'wand',
        prompt: 'Set up a new study workspace for a sponsor.',
      },
    ],
  },
  health: {
    program: 'IIT · oncology',
    section: 'IIT Protocol — IRB submission',
    stage: 'Draft',
    readiness: 52,
    evidence: [{ count: 1, label: 'protocol' }, { count: 2, label: 'site agreements' }],
    activity: [
      { type: 'edit', text: 'Protocol v2 drafted', when: '18m ago' },
      { type: 'alert', text: 'IRB form 1572 gap', when: '1h ago' },
    ],
    actions: [
      {
        id: 'draft',
        label: 'Draft protocol',
        icon: 'penLine',
        prompt: 'Draft the IIT protocol sections from the study concept.',
      },
      {
        id: 'irb',
        label: 'IRB submission',
        icon: 'fileCheck',
        prompt: 'Assemble the IRB submission package for this investigator-initiated trial.',
      },
      {
        id: 'explain',
        label: 'Explain IRB gap',
        icon: 'alertTriangle',
        prompt: 'Explain the Form 1572 gap and what is required.',
      },
      {
        id: 'ind',
        label: 'Investigator IND',
        icon: 'gitBranch',
        prompt: 'Outline the investigator IND requirements for this trial.',
      },
    ],
  },
};
export const ANA_COAUTHOR = ANA_COAUTHOR_BY_SEG.biotech;
export const getCoauthor = (segment: string) =>
  (ANA_COAUTHOR_BY_SEG as Record<string, typeof ANA_COAUTHOR>)[segment] ?? ANA_COAUTHOR;

/** Per-client-category context: pathways, lead program (fixture), AnA framing, quick actions */
export const SEGMENT_CONTEXT = {
  medtech: {
    label: 'Medical Device & IVD',
    tagline: '510(k) · De Novo · PMA · EU MDR',
    program: 'CardioFlow CX — 510(k) Class II',
    pathways: ['510(k)', 'De Novo', 'PMA', 'EU MDR / CER'],
    ana: 'Predicate & substantial-equivalence reasoning, eSTAR, ISO 14971 risk, EU MDR / CER.',
    actions: [
      { id: 'estar', label: 'Build eSTAR', icon: 'fileCheck', surface: 'device-workstream' },
      { id: 'predicate', label: 'Predicate search', icon: 'scale', surface: 'precedent-intelligence' },
      { id: 'risk', label: 'Risk file (ISO 14971)', icon: 'alertTriangle', surface: 'risk' },
      { id: 'dhf', label: 'Design controls (DHF)', icon: 'gitBranch', surface: 'design-controls' },
      { id: 'hf', label: 'Human factors (62366)', icon: 'users', surface: 'human-factors' },
      { id: 'cer', label: 'CER generator', icon: 'microscope', surface: 'device-cer' },
    ],
  },
  biotech: {
    label: 'Biotech',
    tagline: 'IND · BLA · MAA · J-NDA',
    program: 'BX-301 — BLA · 351(a)',
    pathways: ['IND', 'BLA', 'MAA', 'J-NDA'],
    ana: 'Biologics IND→BLA. CTD assembly, comparability & immunogenicity.',
    actions: [
      { id: 'journey', label: 'Program journey', icon: 'workflow', surface: 'program-journey' },
      { id: 'author', label: 'Draft Clinical Overview', icon: 'penLine', surface: 'document-authoring' },
      { id: 'cmc', label: 'CMC Module 3', icon: 'beaker', surface: 'cmc' },
      { id: 'submit', label: 'BLA readiness', icon: 'rocket', surface: 'submission-center' },
    ],
  },
  diagnostics: {
    label: 'Diagnostics',
    tagline: '510(k) · EU IVDR · CLIA · CDx',
    program: 'DxAssay RT-PCR — IVDR Class C',
    pathways: ['510(k)', 'EU IVDR', 'CLIA', 'CDx'],
    ana: 'IVD analytical & clinical performance, IVDR Annex, companion-diagnostic linkage.',
    actions: [
      { id: 'perf', label: 'Performance report', icon: 'barChart', surface: 'device-diagnostics' },
      { id: 'gspr', label: 'IVDR GSPR checklist', icon: 'fileCheck', surface: 'device-cer' },
      { id: 'evidence', label: 'Analytical validation', icon: 'search', surface: 'evidence-search' },
      { id: 'predicate', label: 'Precedent search', icon: 'scale', surface: 'precedent-intelligence' },
    ],
  },
  pharma: {
    label: 'Pharma',
    tagline: 'IND · NDA · 505(b)(2) · MAA · Lifecycle',
    program: 'BX-204 — NDA 212345 · 505(b)(1)',
    pathways: ['IND', 'NDA', '505(b)(2)', 'MAA', 'Lifecycle'],
    ana: 'Small-molecule IND→NDA/MAA. ISS/ISE, labeling (PLLR), pediatric plans.',
    actions: [
      { id: 'journey', label: 'Program journey', icon: 'workflow', surface: 'program-journey' },
      { id: 'author', label: 'Author with AnA Engine', icon: 'sparkles', surface: 'authoring-engine' },
      { id: 'submit', label: 'NDA readiness', icon: 'rocket', surface: 'nda-cockpit' },
      { id: 'label', label: 'Draft USPI label', icon: 'fileText', surface: 'labeling-pi' },
    ],
  },
  cro: {
    label: 'CRO / Research',
    tagline: 'Multi-sponsor · protocol-led · org-isolated',
    program: 'Portfolio — 7 sponsors · 12 studies',
    pathways: ['Protocol development', 'Cross-sponsor', 'IND', '510(k)'],
    ana: 'Multi-sponsor portfolio. Protocol authoring + committee governance, org-isolated across sponsors.',
    actions: [
      { id: 'protocol', label: 'Protocol development', icon: 'clipboardList', surface: 'protocol-dev' },
      { id: 'research', label: 'Research administration', icon: 'network', surface: 'research-admin' },
      { id: 'portfolio', label: 'Sponsor portfolio', icon: 'folder', surface: 'cro-portfolio' },
      { id: 'tasks', label: 'Cross-sponsor tasks', icon: 'checkSquare', surface: 'tasks' },
    ],
  },
  health: {
    label: 'Health Systems',
    tagline: 'IIT · IRB · Investigator IND',
    program: 'IIT — investigator-initiated oncology trial',
    pathways: ['IIT', 'IRB', 'Investigator IND'],
    ana: 'Investigator-initiated trials. IRB, investigator INDs, site governance.',
    actions: [
      { id: 'author', label: 'Draft protocol', icon: 'clipboardList', surface: 'protocol-dev' },
      { id: 'research', label: 'Research administration', icon: 'network', surface: 'research-admin' },
      { id: 'submit', label: 'IRB submission', icon: 'rocket', surface: 'submission-center' },
      { id: 'tasks', label: 'Site governance', icon: 'checkSquare', surface: 'tasks' },
    ],
  },
};
export const getSegmentContext = (id: string) =>
  (SEGMENT_CONTEXT as Record<string, (typeof SEGMENT_CONTEXT)['biotech']>)[id] ?? SEGMENT_CONTEXT.biotech;
export const getSegmentModules = (id: string) =>
  (SEGMENT_MODULES as Record<string, (typeof SEGMENT_MODULES)['biotech']>)[id] ?? SEGMENT_MODULES.biotech;

/** Per-surface AnA context (here · focus · actions · suggestions); absent ids derive from registry meta */
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
    suggestions: [
      'What is gating Module 3?',
      'Pull the 24-month stability trend',
      'Assess comparability across the post-change lots',
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
    ],
    suggestions: [
      'Which E3 sections are still open?',
      'Draft the disposition and deviation tables',
      'Reconcile the TLFs against the datasets',
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
/** INSTALL §5 — the fixed 10-value e-sign meaning enum. Rendering is UI-only
 * until POST /api/esignature/sign validates it server-side (backend ask);
 * do not wire the dropdown live before that lands. */
export const ESIGN_MEANINGS = [
  'AUTHOR',
  'REVIEWER',
  'APPROVER',
  'VERIFIER',
  'WITNESS',
  'RESPONSIBLE_PARTY',
  'QUALITY_APPROVAL',
  'REGULATORY_APPROVAL',
  'CLINICAL_APPROVAL',
  'TECHNICAL_APPROVAL',
] as const;

/** Deep-link aliases — SURFACE_VIEWS-only ids, intentionally not rail/registry
 * entries (BUILD_STATE): task-board → tasks board view · device-submission →
 * governed editor (eSTAR pathway) · ind-lifecycle → deliverable-first IND view. */
export const DEEP_LINK_ALIASES: Record<string, string> = {
  'task-board': 'tasks',
  'device-submission': 'document-authoring',
  'ind-lifecycle': 'ind-checklist',
};

/** Registry meta lookup with the kit's fallback shape. */
export function getSurfaceMeta(id: string): UiSurface | { id: string; label: string; icon?: string; notes?: string } {
  return getSurface(id) ?? { id, label: id, icon: 'grid', notes: '' };
}

/** Rail listing for a client-type tier (kit surfacesByTier). */
export function surfacesByTier(tier: string): UiSurface[] {
  return UI_SURFACES.filter((s) => {
    if (NAV_HIDDEN.has(s.id)) return false;
    if (tier === 'admin') return s.navTier === 'admin';
    const g = NAV_GROUP_OF[s.id] ?? 'both';
    if (g === tier) return true;
    if (g === 'both' && (tier === 'mdx' || tier === 'biopharma')) return true;
    return false;
  });
}

export interface AnaContext {
  module: string;
  icon?: string;
  here: string;
  focus: string;
  program?: string;
  section: string | null;
  stage?: string;
  readiness?: number;
  evidence?: { count: number; label: string }[];
  activity?: { type: string; text: string; when: string }[];
  actions: { label: string; icon?: string; prompt?: string; id?: string }[];
  suggestions: string[];
}

const AUTHORING_SURFACES = [
  'document-authoring',
  'regulatory-workspace',
  'protocol-dev',
  'labeling-pi',
  'doc-journey',
  'ectd-coauthor',
  'review',
];

/** AnA context-aware suggestions per surface (kit Shell.jsx). */
export const ANA_SUGGESTIONS: Record<string, string[]> = {
  _default: ['Summarize this surface', 'What needs my attention?', 'Draft the next action'],
  'global-ri': ['Compute NCE exclusivity for FDA', 'Classify an IVD for EU MDR', 'Build a cross-market strategy brief'],
  'submission-center': ['Validate the OR-902 package', 'What gates transmit?', 'Compare ESG vs eSTAR export'],
  'document-authoring': ['Draft §2.5 from the predicate', 'Check claims against evidence', 'Rewrite for FDA tone'],
  projects: ['Which programs are blocked?', 'Portfolio readiness report', 'Flag filing risks this week'],
  vault: ['Find the latest biocompat report', 'Surface unsigned documents', 'Search by SHA-256'],
  tasks: ['What is due this week?', 'Open reviews assigned to me', 'Summarize blockers'],
};

/** What AnA is attached to on a surface (kit getAnaContext, verbatim logic). */
export function getAnaContext(surfaceId: string, segment: string): AnaContext {
  const meta = getSurfaceMeta(surfaceId);
  const co = getCoauthor(segment);
  const ctx = (ANA_SURFACE_CTX as Record<string, Partial<AnaContext>>)[surfaceId];
  const isAuthoring = AUTHORING_SURFACES.includes(surfaceId);
  const notes = 'notes' in meta && meta.notes ? String(meta.notes) : '';
  const here = ctx?.here ?? (notes ? notes.split('. ')[0] : `the ${meta.label} workspace`);
  const focus = ctx?.focus ?? (isAuthoring ? co.section : meta.label);
  let actions = ctx?.actions;
  if (!actions) {
    if (isAuthoring) actions = co.actions;
    else
      actions = [
        { label: 'Summarize this module', icon: 'sparkles', prompt: `Summarize the current state of ${meta.label} and what needs my attention.` },
        { label: 'What is blocking me?', icon: 'alertTriangle', prompt: `What is blocking progress in ${meta.label} right now, and what clears it?` },
        { label: 'Draft the next action', icon: 'penLine', prompt: `What is the single most important next action in ${meta.label}, and draft it.` },
      ];
  }
  const suggestions = ctx?.suggestions ?? ANA_SUGGESTIONS[surfaceId] ?? ANA_SUGGESTIONS._default;
  return {
    module: meta.label,
    icon: 'icon' in meta ? meta.icon : undefined,
    here,
    focus,
    program: co.program,
    section: isAuthoring ? co.section : null,
    stage: co.stage,
    readiness: co.readiness,
    evidence: co.evidence,
    activity: co.activity,
    actions,
    suggestions,
  };
}
