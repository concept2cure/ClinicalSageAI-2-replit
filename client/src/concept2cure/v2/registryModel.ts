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
 * The ANA_* co-author/context objects are REFERENCE CONFIG, not data. They were
 * the kit's offline fixture shapes and carried invented per-programme values —
 * a lead programme code, a readiness percentage, linked-evidence counts and a
 * timestamped activity feed — which the AnA rail rendered on every authenticated
 * surface behind a "Sample data" pill. Those fields are gone (see the note where
 * ANA_COAUTHOR_BY_SEG used to be, and the one above SEGMENT_CONTEXT). What remains is
 * tenant-independent vocabulary: CTD section names, regulatory pathway lists,
 * prompt templates and surface routing. Nothing in this file may describe a
 * particular organization's programmes — that comes from the API.
 */
import { getSurface, UI_SURFACES, type UiSurface } from '@shared/constants/ui-surface-registry';
// ANA_SURFACE_CTX is the large per-surface AnA context table; it lives in a
// companion module (split to keep this file under the repo-health line gate)
// and is re-exported below so consumers still import it from registryModel.
import { ANA_SURFACE_CTX } from './registryModel.surfaceCtx';

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
  'pv-cockpit': 'biopharma',
  'clinical-ops': 'biopharma',
  nonclinical: 'biopharma',
  registrations: 'both',
  'change-assessment': 'both',
  quality: 'both',
  'nda-cockpit': 'biopharma',
  'maa-cockpit': 'biopharma',
  'agency-meetings': 'both',
  'shadow-review': 'both',
  'dispatch-readiness': 'both',
  'communication-center': 'both',
  insights: 'both',
  'market-access': 'both',
  'reg-change': 'both',
  dossier: 'both',
  'ind-checklist': 'biopharma',
  cmc: 'biopharma',
  'csr-workflow': 'biopharma',
  // Regulatory findings are read across device and biopharma alike — the graph
  // carries 510(k)/PMA disciplines as well as NDA/BLA, so this is not a
  // biopharma-only surface.
  'crl-library': 'both',
  'ectd-coauthor': 'biopharma',
  'ectd-compile': 'biopharma',
  pdev: 'biopharma',
  setup: 'admin',
  'audit-trail': 'admin',
  billing: 'admin',
  licensing: 'admin',
  training: 'admin',
};
// CLIENT_CATEGORIES (the rail's client-type selector) is DERIVED from SEGMENTS
// further below — declared after the canonical SEGMENTS list so the rail can
// never again offer a category id that getSegment() cannot resolve. Keeping it
// as a second hand-authored literal here is exactly what let the rail and the
// TopBar drift onto two different segment axes. See the derivation just after
// PRIMARY_SEGMENTS / getSegment.
/** Core workspace — the same central solution for every client type */
export const RAIL_CORE = [
  { id: 'projects', label: 'Project management', icon: 'folder' },
  { id: 'vault', label: 'Vault', icon: 'vault' },
  { id: 'submission-center', label: 'Submission Center', icon: 'rocket' },
  { id: 'tasks', label: 'Tasking', icon: 'checkSquare' },
  { id: 'insights', label: 'Reporting & analytics', icon: 'barChart' },
];
/** Specialist science apps promoted to the rail (also in the Apps catalog) */
export const RAIL_SPECIALIST = [
  { id: 'cmc', label: 'CMC / Module 3', icon: 'beaker' },
  { id: 'rbm', label: 'Risk-based monitoring', icon: 'shieldCheck' },
  { id: 'crl-library', label: 'FDA CRL library', icon: 'gavel' },
];
/** Explore section */
export const RAIL_EXPLORE = [
  { id: 'ana-command', label: 'AnA Command', icon: 'sparkles', badge: 'AnA' },
  { id: 'ana-memory', label: 'AnA memory', icon: 'database', badge: 'AnA' },
  { id: 'apps', label: 'Apps catalog', icon: 'grid' },
  { id: 'artifacts-center', label: 'Artifacts Center', icon: 'sparkles' },
  { id: 'conversation-thread', label: 'Conversation', icon: 'messageSquare', badge: 'AnA' },
];
/** Quick access (targets resolve to surface ids) */
export const RAIL_QUICK = [
  { id: 'recent', label: 'Recent Documents', icon: 'clock', target: 'document-authoring' },
  // No hardcoded count — the live "what needs me" number lives in the top-bar
  // Task Tray (GET /api/task-management/my-work), never a constant (D40).
  { id: 'tasks', label: 'My Tasks', icon: 'checkSquare', target: 'tasks' },
  /* No "Starred Items". The entry (ported from the kit, 2026-07) opened the
     full Projects list: nothing in the product can be starred — no star state
     on any surface, no route, no column — so its label promised a list that
     does not exist, and on Projects it marked itself current alongside
     "Project management". The one thing it actually did, open Projects, is
     RAIL_CORE's `projects` entry above. If starring is ever built, the entry
     comes back pointed at the starred list, not at Projects. */
];
/** Surfaces reachable via ⌘K/deep-link but intentionally not rail entries */
export const NAV_HIDDEN: ReadonlySet<string> = new Set([
  // The device surfaces used to be hidden here because all five were aliases
  // for one component that rendered the whole kit application — listing them
  // separately in the rail would have shown five entries that opened the same
  // screen. They are real, distinct surfaces now, so they are navigable.
  'ectd-coauthor',
  'csr-workflow',
  'filings-catalog',
  'dossier-map',
  'nda-cockpit',
  'maa-cockpit',
  'ind-checklist',
  'template-library',
  'dossier',
  'review-approve',
  'doc-journey',
  'change-assessment',
  'mission-control',
  'filing-strategy',
  'tasks',
  'review',
  'agency-meetings',
  'vault',
  'evidence-search',
  'haq-manager',
  'global-ri',
  'safety-narrative',
  'labeling',
  'risk',
  'design-controls',
  'human-factors',
  'regulatory-workspace',
  'labeling-pi',
  'quality',
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
    id: 'diagnostics',
    label: 'In Vitro Diagnostics',
    primary: true,
    icon: 'microscope',
    pathways: ['IVDR', 'CDx', '510(k)', 'De Novo'],
    defaultSurface: 'device-diagnostics',
    focus: [
      'device-diagnostics',
      'ivd-completeness',
      'labeling',
      'precedent-intelligence',
      'evidence-search',
    ],
    ana: 'IVD & companion diagnostics — IVDR classification, analytical & clinical performance, CDx co-development.',
  },
  {
    /* BP-W2-1 (decision: MERGE). 'biotech' and 'pharma' were two navigation
       entries over one experience — SEGMENT_MODULES held the same 57 surfaces
       in both, differing only by an accidental ordering swap. The company
       label was the wrong axis: review centre, pathway, fee programme and CMC
       core are functions of MODALITY (shared/regulatory/modality.ts, BP-W2-2),
       which now lives on the program. The retired ids keep resolving via
       SEGMENT_ALIASES below. */
    id: 'biopharma',
    label: 'Biotech & Pharma',
    primary: true,
    icon: 'atom',
    pathways: ['IND', 'NDA', 'BLA', 'MAA', 'J-NDA', 'Lifecycle'],
    defaultSurface: 'ind-checklist',
    focus: [
      'ind-checklist',
      'nda-cockpit',
      'cmc',
      'document-authoring',
      'pdev',
      'biostatistics',
      'safety-narrative',
    ],
    ana: 'Small-molecule and biologic programs, IND through NDA/BLA and lifecycle; modality sets centre, pathway and CMC frame.',
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
    id: 'health',
    label: 'Health Systems',
    primary: true,
    icon: 'building',
    pathways: ['IIT', 'IRB', 'IND'],
    defaultSurface: 'protocol-dev',
    focus: [
      'protocol-dev',
      'research-admin',
      'document-authoring',
      'ind-checklist',
      'submission-center',
    ],
    ana: 'Health-system & investigator-initiated trials — protocol authoring, IRB/IACUC review, investigator IND.',
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
/** BP-W2-1: the retired lane ids keep resolving — stored prefs, bookmarks and
 *  deep links carrying 'biotech' or 'pharma' land on the merged lane instead
 *  of silently falling back to the first segment. */
export const SEGMENT_ALIASES: Record<string, string> = {
  biotech: 'biopharma',
  pharma: 'biopharma',
};
export const resolveSegmentId = (id: string) => SEGMENT_ALIASES[id] ?? id;
export const getSegment = (id: string) => SEGMENTS.find((s) => s.id === resolveSegmentId(id));

/**
 * Client-category selector at the top of the rail — the client-type axis of the
 * canonical SEGMENTS list, carrying rail-specific short labels/icons.
 *
 * DERIVED from SEGMENTS, then filtered to ids that actually exist as a segment,
 * so a rail category can never again resolve to `undefined` in getSegment() and
 * make the TopBar silently fall back to the first segment. This closes the
 * regression where selecting "Diagnostics" or "Health Systems" in the rail
 * displayed the TopBar/context as medtech, because those two ids existed only on
 * the rail axis and never in SEGMENTS.
 */
const RAIL_CATEGORY_META: Record<string, { label: string; icon: string }> = {
  medtech: { label: 'Medical Device & IVD', icon: 'stethoscope' },
  biopharma: { label: 'Biotech & Pharma', icon: 'atom' },
  diagnostics: { label: 'Diagnostics', icon: 'microscope' },
  cro: { label: 'CRO / Research', icon: 'network' },
  health: { label: 'Health Systems', icon: 'building' },
};
export const CLIENT_CATEGORIES = Object.entries(RAIL_CATEGORY_META)
  .filter(([id]) => SEGMENTS.some((s) => s.id === id))
  .map(([id, meta]) => ({ id, ...meta }));

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
/* Entitlements are NOT declared here.
 *
 * This slot used to hold `LICENSE_UNLICENSED = ['labeling', 'risk', 'pdev']`
 * and an `isLicensed()` built from it — three module ids named in client
 * source, applied identically to every tenant, under a comment promising real
 * wiring "in Phase 6". Nothing ever called `isLicensed`, so the fixture gated
 * nothing while making the file look like it carried a tenant's licence state.
 *
 * The real answer is per-organization and lives on the server:
 *   server/services/entitlements/navigation-entitlements.ts
 *   GET /api/module-subscriptions/navigation
 *   client/src/concept2cure/v2/navEntitlements.tsx (the rail's consumer)
 *
 * Per this file's own header rule — "nothing in this file may describe a
 * particular organization's programmes" — a licence verdict may never come
 * back here.
 */

/** AnA modes (intent → engine label, resolved server-side; no vendor names on screen) */
/**
 * The modes the composer offers, each carrying the effort it actually buys.
 *
 * `effort` is not decoration. It is sent as `effort_level` and decides how many
 * agentic rounds AnA gets — `fast` 4, `balanced` 6+2, `thorough` 10+4 — plus her
 * output budget and model tier. Before it existed the picker was inert: the mode
 * was stored, shown next to the send button as "Ask · Maximum", and never
 * reached the request, so a reviewer choosing Deep research for a regulatory
 * question silently got the server default instead of the 14 rounds the label
 * promised — and Quick ask cost more than it claimed rather than less.
 *
 * Keep every entry's `effort` set: a mode without one falls back to the
 * server default, which is the defect this field exists to end.
 */
export const ANA_MODES: Array<{
  id: string;
  label: string;
  model: string;
  desc: string;
  effort: 'fast' | 'balanced' | 'thorough';
}> = [
  { id: 'standard', label: 'Standard', model: 'Balanced', desc: 'Chat, reasoning, quick answers', effort: 'balanced' },
  {
    id: 'deep-research',
    label: 'Deep research',
    model: 'Maximum',
    desc: 'Drafting, multi-step analysis, long-form',
    effort: 'thorough',
  },
  {
    id: 'quick-ask',
    label: 'Quick ask',
    model: 'Instant',
    desc: 'Autocomplete, inline, classification',
    effort: 'fast',
  },
];

/** The effort a mode id buys, or null when the id is unknown. */
export function effortForMode(modeId: string): 'fast' | 'balanced' | 'thorough' | null {
  return ANA_MODES.find((m) => m.id === modeId)?.effort ?? null;
}
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
  'ectd-compile': ['run_validation', 'compile_dossier', 'export_document'],
  // `attach_sources_to_document` added on both authoring surfaces that now read
  // the evidence graph, so a finding can be cited straight into the artifact.
  'csr-workflow': [
    'run_validation',
    'refine_with_validation',
    'attach_sources_to_document',
    'save_document_version',
    'export_document',
  ],
  'protocol-dev': ['run_validation', 'refine_with_validation', 'attach_sources_to_document'],
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
  'submission-twin': ['run_validation', 'compile_dossier'],
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
  // The six §10 graph tools are read-only reasoning and are deliberately NOT
  // governed actions (ADR-CRIG-003). Only writing a recommendation into a
  // regulated artifact is governed, and that already exists as promote_artifact
  // / save_document_version. Adding an e-signature gate to *reading* evidence
  // would train users to click through signoffs that carry no meaning.
  'crl-library': ['attach_sources_to_document', 'promote_artifact'],
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
        'device-pma',
        'device-cer',
        'device-presub',
        'labeling',
        'inconsistency',
        'source-tracer',
        'doc-journey',
        'template-library',
      ],
    },
    {
      label: 'Evidence & data',
      items: [
        'vault',
        'device-vault',
        'device-clinical-studies',
        'device-engineering',
        'device-software',
        'evidence-search',
        'artifacts-center',
        'decision-lineage',
      ],
    },
    { label: 'Submit & file', items: ['submission-center', 'device-submission', 'device-validation', 'submission-twin', 'gateway-transmittals', 'pyramid', 'dossier-map', 'haq-manager'] },
    { label: 'Review & govern', items: ['review', 'tasks', 'device-tasks', 'agency-meetings', 'audit-trail', 'quality', 'qmp', 'part11-console', 'identity-console', 'report-governance'] },
    {
      label: 'Intelligence & risk',
      items: ['precedent-intelligence', 'device-analytics', 'device-postmarket', 'crl-library', 'risk', 'global-ri', 'intelligence-catalog', 'deep-research'],
    },
    { label: 'Lifecycle & access', items: ['registrations', 'device-udi', 'market-access', 'change-assessment'] },
  ],
  diagnostics: [
    {
      label: 'Author & assemble',
      items: [
        'device-diagnostics',
        'ivd-completeness',
        'device-cer',
        'device-510k',
        'device-presub',
        'device-clinical-studies',
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
    { label: 'Submit & file', items: ['submission-center', 'submission-twin', 'gateway-transmittals', 'pyramid', 'dossier-map', 'haq-manager'] },
    { label: 'Review & govern', items: ['review', 'tasks', 'agency-meetings', 'audit-trail', 'quality', 'qmp', 'part11-console', 'identity-console', 'report-governance'] },
    {
      label: 'Intelligence & risk',
      items: ['precedent-intelligence', 'crl-library', 'risk', 'global-ri', 'intelligence-catalog', 'deep-research'],
    },
    { label: 'Lifecycle & access', items: ['registrations', 'market-access', 'change-assessment'] },
  ],
  /* BP-W2-1 (merge): one list. `pharma` was byte-identical apart from an
     accidental ordering swap (labeling-pi moved from position 10 to 7);
     deleting the duplicate removes the divergence as a side effect. */
  biopharma: [
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
        'cmc',
        'nonclinical',
        'csr-workflow',
        'labeling-pi',
        'doc-journey',
        'ectd-coauthor',
        'ectd-compile',
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
        'maa-cockpit',
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
        'quality',
      ],
    },
    {
      label: 'Science & intelligence',
      items: [
        'biostatistics',
        'biostat-workbench',
        'rbm',
        'clinical-ops',
        'safety-narrative',
        'pharmacovigilance',
        'pv-cockpit',
        'precedent-intelligence',
        'crl-library',
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
        'biostat-workbench',
        'rbm',
        'precedent-intelligence',
        'crl-library',
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
/*
 * No per-segment co-author config (ANA_COAUTHOR_BY_SEG / getCoauthor, removed
 * 2026-09-23, launch row D2).
 *
 * It held a CTD `section` per client domain ('2.5 Clinical Overview',
 * '§12 — Substantial Equivalence', …) and a set of action prompts, and
 * getAnaContext handed both to every authoring surface. The rail labelled the
 * section "Current section", so an empty organisation on Protocol development
 * was told it was in §2.5 — or in §12, after one click on the domain picker —
 * with no protocol and no document open. The prompts were worse: "Explain the
 * ORR contradiction blocking §2.5", "Draft the §12 comparison against predicate
 * K203117", "Summarize status across all 7 sponsors and 12 studies". Each one
 * sent AnA a premise no tenant's data supplied.
 *
 * Nothing it carried was about the person's actual position, because the rail
 * does not know which document or section is open. Authoring surfaces now get
 * the same module-scoped context and actions as every other surface without a
 * curated ANA_SURFACE_CTX entry (see getAnaContext). If the rail is ever told
 * the open section, it comes from the surface that has it open — not from a
 * constant keyed on the client domain.
 */

/**
 * Per-client-category REFERENCE CONFIG: the category label, its regulatory
 * pathway vocabulary, AnA's framing sentence and the quick-action targets.
 *
 * Each entry also used to carry a `program` string — biotech's was
 * 'BX-301 — BLA · 351(a)' — which the Home surface rendered under a branch icon
 * as if it were the signed-in organization's lead programme. It was not: it is a
 * design-kit sample, and it appeared on the FIRST authenticated screen while the
 * Projects page one click away correctly reported zero programmes. Invented
 * programme identity in a regulated tool is a data-integrity defect, so the
 * field is gone. Home now reads the real portfolio from GET /api/c2c/projects —
 * the same route Projects uses — and shows the real lead programme, an honest
 * "No programs yet", or an honest error.
 *
 * Everything left here is tenant-independent regulatory vocabulary: '510(k)' and
 * 'BLA' are the pathways that category files under, for every customer.
 */
export const SEGMENT_CONTEXT = {
  medtech: {
    label: 'Medical Device & IVD',
    tagline: '510(k) · De Novo · PMA · EU MDR',
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
  biopharma: {
    label: 'Biotech & Pharma',
    tagline: 'IND · NDA · BLA · MAA · Lifecycle',
    pathways: ['IND', 'NDA', '505(b)(2)', 'BLA', 'MAA', 'J-NDA', 'Lifecycle'],
    ana: 'Small-molecule and biologic programs, IND through NDA/BLA and lifecycle; modality sets centre, pathway and CMC frame.',
    actions: [
      { id: 'journey', label: 'Program journey', icon: 'workflow', surface: 'program-journey' },
      { id: 'author', label: 'Draft Clinical Overview', icon: 'penLine', surface: 'document-authoring' },
      { id: 'cmc', label: 'CMC Module 3', icon: 'beaker', surface: 'cmc' },
      /* 'BLA readiness' assumed the biologic; the merged lane says what the
         control is, and the pathway comes from the program's modality. */
      { id: 'submit', label: 'Submission readiness', icon: 'rocket', surface: 'submission-center' },
    ],
  },
  diagnostics: {
    label: 'Diagnostics',
    tagline: '510(k) · EU IVDR · CLIA · CDx',
    pathways: ['510(k)', 'EU IVDR', 'CLIA', 'CDx'],
    ana: 'IVD analytical & clinical performance, IVDR Annex, companion-diagnostic linkage.',
    actions: [
      { id: 'perf', label: 'Performance report', icon: 'barChart', surface: 'device-diagnostics' },
      { id: 'gspr', label: 'IVDR GSPR checklist', icon: 'fileCheck', surface: 'device-cer' },
      { id: 'evidence', label: 'Analytical validation', icon: 'search', surface: 'evidence-search' },
      { id: 'predicate', label: 'Precedent search', icon: 'scale', surface: 'precedent-intelligence' },
    ],
  },
  cro: {
    label: 'CRO / Research',
    tagline: 'Multi-sponsor · protocol-led · org-isolated',
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
  (SEGMENT_CONTEXT as Record<string, (typeof SEGMENT_CONTEXT)['biopharma']>)[resolveSegmentId(id)] ??
  SEGMENT_CONTEXT.biopharma;
export const getSegmentModules = (id: string) =>
  (SEGMENT_MODULES as Record<string, (typeof SEGMENT_MODULES)['biopharma']>)[resolveSegmentId(id)] ??
  SEGMENT_MODULES.biopharma;

/** Per-surface AnA context (here · focus · actions · suggestions); absent ids
 * derive from registry meta. Imported above from the companion module and
 * re-exported here so consumers still import it from registryModel. */
export { ANA_SURFACE_CTX };
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
  // No `device-submission` alias. It pointed at `document-authoring` while
  // SURFACE_VIEWS routed the same id to the device kit — the registry and the
  // deep-link table disagreeing about what one id means. `device-submission` is
  // the kit's submission-ops package view and resolves to itself.
  'ind-lifecycle': 'ind-checklist',
  // `/concept2cure/mdx` was the device kit's own route before it became
  // surfaces. Existing links and bookmarks still point at it, so the segment
  // resolves to the kit's entry surface rather than silently falling through to
  // home. `pdev` needs no alias — it is a real registered surface id now.
  mdx: 'device-workstream',
  /* shared/navigation NAVIGATION_TARGETS reconciliation (README step 2, and
     the precondition for AnA Live Drive): these ten registry ids are what AnA
     navigates by — `navigate_to` refuses everything else — but they predate
     the v2 surface ids, so without an alias each one landed on the
     KitSurfaceScaffold fallback: AnA saying "taking you to Intelligence" and
     the person arriving at a scaffold. Each maps to the surface that IS that
     capability today. Guarded by __tests__/navigationReachability.test.ts,
     which fails the moment a registry id and this table drift apart again. */
  biopharma: 'program-journey',
  documents: 'vault',
  submissions: 'submission-center',
  'section-workspace': 'document-authoring',
  'review-readiness': 'review',
  tasking: 'tasks',
  'submission-gateway': 'gateway-transmittals',
  intelligence: 'global-ri',
  authoring: 'document-authoring',
  safety: 'pv-cockpit',
};

/** Home is the shell's landing, not a registry surface (V2App renders it for
 *  the bare base route), so a registry lookup misses it and the fallback below
 *  named it by its raw id: the AnA rail read "Working in home". */
const HOME_META = { id: 'home', label: 'Home', icon: 'home', notes: '' };

/** Registry meta lookup with the kit's fallback shape. */
export function getSurfaceMeta(id: string): UiSurface | { id: string; label: string; icon?: string; notes?: string } {
  if (id === HOME_META.id) return HOME_META;
  return getSurface(id) ?? { id, label: id, icon: 'grid', notes: '' };
}

/**
 * Surface → client-type rail group. A surface NAV_GROUP_OF does not name
 * belongs to both client categories. The rail listing and the breadcrumb both
 * read this: the breadcrumb used to default an unnamed surface to
 * 'biopharma' while the rail defaulted it to 'both', so ~100 surfaces —
 * every device workbench among them — were crumbed "Biotech & Pharma"
 * (launch sweep finding 128).
 */
export function navGroupOf(id: string): string {
  return NAV_GROUP_OF[id] ?? 'both';
}

/**
 * The breadcrumb's client-category crumb for a surface: its tier when it
 * belongs to exactly one, "Admin" for an admin surface, and null when it
 * belongs to both — or when the tier would only repeat the surface's own
 * name ("Medical Device & IVD › Medical Device & IVD").
 */
export function breadcrumbTierOf(surface: { id: string; label: string }): { id: string; label: string } | null {
  const group = getSurface(surface.id)?.navTier === 'admin' ? 'admin' : navGroupOf(surface.id);
  const tier = NAV_TIERS_V2.find((t) => t.id === group) ?? null;
  return tier && tier.label !== surface.label ? tier : null;
}

/** Rail listing for a client-type tier (kit surfacesByTier). */
export function surfacesByTier(tier: string): UiSurface[] {
  return UI_SURFACES.filter((s) => {
    if (NAV_HIDDEN.has(s.id)) return false;
    if (tier === 'admin') return s.navTier === 'admin';
    const g = navGroupOf(s.id);
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

/** AnA context-aware suggestions per surface (kit Shell.jsx). */
export const ANA_SUGGESTIONS: Record<string, string[]> = {
  _default: ['Summarize this surface', 'What needs my attention?', 'Draft the next action'],
  'global-ri': ['Compute NCE exclusivity for FDA', 'Classify an IVD for EU MDR', 'Build a cross-market strategy brief'],
  'submission-center': ['Validate the OR-902 package', 'What gates transmit?', 'Compare ESG vs eSTAR export'],
  'document-authoring': ['Draft §2.5 from the predicate', 'Check claims against evidence', 'Rewrite for FDA tone'],
  projects: ['Which programs are blocked?', 'Portfolio readiness report', 'Flag filing risks this week'],
  vault: ['Find the latest biocompat report', 'What is still unfiled in the cabinet?', 'Search by SHA-256'],
  tasks: ['What is due this week?', 'Open reviews assigned to me', 'Summarize blockers'],
  'crl-library': [
    'Findings on this endpoint class',
    'What did FDA ask for after this deficiency?',
    'Compare our design to this letter',
  ],
};

/**
 * What AnA is attached to on a surface.
 *
 * Deterministic and tenant-independent: a curated ANA_SURFACE_CTX entry where
 * one exists, otherwise the surface's own label. `segment` is accepted for the
 * call sites' sake and deliberately unused — nothing here may change with the
 * client-domain picker, because nothing here is about the person's data.
 *
 * Two things this no longer does (2026-09-23, launch row D2):
 *   · It does not fill `here` from the registry `notes`. Those are capability
 *     summaries, and their first sentence reached the rail as "what AnA is
 *     attached to" carrying a ticket range ("(C2C-17..22)" on Protocol
 *     development), a route ("…the governed, audited /file route" on Vault) and
 *     a schema name ("@shared/schema unifiedTasks" on Tasks) — and, when it
 *     ended in a period, a doubled one in the greeting, which appends its own.
 *   · It does not report a `section`. See the note where ANA_COAUTHOR_BY_SEG
 *     used to be: the value was a per-domain constant shown as "Current
 *     section" with no document open. `section` stays on AnaContext, null,
 *     until something that knows the open section supplies it.
 */
export function getAnaContext(surfaceId: string, _segment: string): AnaContext {
  const meta = getSurfaceMeta(surfaceId);
  const ctx = (ANA_SURFACE_CTX as Record<string, Partial<AnaContext>>)[surfaceId];
  const here = ctx?.here ?? `the ${meta.label} workspace`;
  const focus = ctx?.focus ?? meta.label;
  const actions = ctx?.actions ?? [
    { label: 'Summarize this module', icon: 'sparkles', prompt: `Summarize the current state of ${meta.label} and what needs my attention.` },
    { label: 'What is blocking me?', icon: 'alertTriangle', prompt: `What is blocking progress in ${meta.label} right now, and what clears it?` },
    { label: 'Draft the next action', icon: 'penLine', prompt: `What is the single most important next action in ${meta.label}, and draft it.` },
  ];
  const suggestions = ctx?.suggestions ?? ANA_SUGGESTIONS[surfaceId] ?? ANA_SUGGESTIONS._default;
  return {
    module: meta.label,
    icon: 'icon' in meta ? meta.icon : undefined,
    here,
    focus,
    section: null,
    /* program / stage / readiness / evidence / activity are deliberately NOT
       returned. They came from the per-segment co-author fixture and described
       an invented programme ("BX-204 · oncology BLA", "72%", "ORR contradiction
       detected · 1h ago") on every authenticated surface. A per-surface
       co-author endpoint that could supply the real values does not exist —
       /api/coauthor has no root handler — so the rail omits the fields
       (AnaContext keeps them optional) instead of rendering a fabrication. If
       that endpoint is built, populate them HERE from its response; do not
       reintroduce a constant. */
    actions,
    suggestions,
  };
}
