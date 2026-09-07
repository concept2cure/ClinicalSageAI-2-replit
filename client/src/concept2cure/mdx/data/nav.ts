/**
 * MDX nav data — ported verbatim from ui_kits/mdx/data.jsx.
 * Shape contracts: do not drift without designer review.
 */

import type { IconKey } from '../icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconKey;
  group: 'workstream' | 'workbench' | 'intelligence' | 'system' | 'work';
  href?: string;
  meta?: string;
}

export interface NavGroup {
  id: NavItem['group'];
  label: string;
}

export const MDX_NAV_GROUPS: NavGroup[] = [
  { id: 'workstream',   label: 'Workstream' },
  { id: 'workbench',    label: 'Workbench' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'system',       label: '' },
];

export const MDX_NAV_V2: NavItem[] = [
  // Workstream — where you do program-level work.
  { id: 'overview',     label: 'Overview',              icon: 'grid',         group: 'workstream' },
  { id: 'k510',         label: '510(k) Submissions',    icon: 'file',         group: 'workstream' },
  { id: 'pma',          label: 'PMA Submissions',       icon: 'shieldCheck',  group: 'workstream' },
  { id: 'cer',          label: 'CER Generator',         icon: 'microscope',   group: 'workstream' },
  { id: 'device-diagnostics-workbench', label: 'IVD Diagnostics', icon: 'flask', group: 'workstream' },
  { id: 'clinical-studies', label: 'Clinical Studies',   icon: 'stethoscope',  group: 'workstream' },
  { id: 'software',     label: 'Software Lifecycle',     icon: 'code',         group: 'workstream' },
  { id: 'predicate',    label: 'Precedent Intelligence',icon: 'scale',        group: 'workstream' },

  // Workbench — cross-program work surfaces.
  { id: 'tasks',        label: 'Tasks and Reviews',     icon: 'clipboardList',group: 'workbench' },
  { id: 'vault',        label: 'Document Vault',        icon: 'vault',        group: 'workbench' },
  { id: 'validation',   label: 'Validation Center',     icon: 'shieldAlert',  group: 'workbench' },
  { id: 'submissions',  label: 'Submission Center',     icon: 'rocket',       group: 'workbench' },
  { id: 'templates',    label: 'Templates',             icon: 'template',     group: 'workbench' },

  // Intelligence — read-only reporting + cross-cutting memory.
  { id: 'analytics',    label: 'Analytics',             icon: 'barChart3',    group: 'intelligence' },
  { id: 'memory',       label: 'AnA Memory',            icon: 'database',     group: 'intelligence' },

  // System — deliberately empty. Admin is a PRODUCT-level surface, not a
  // per-workstream one: the device/diagnostics workstream embeds this module
  // inside the ui-v2 product shell, whose single AdminConsole serves every
  // client type. Keeping a separate "Admin and Access" here produced two
  // admins (one per client type); it was removed so there is one product admin.
];

export interface StubInfo {
  title: string;
  icon: IconKey;
  desc: string;
  phase: string;
}

// Phase 4 shipped: engineering, udi, postmarket, analytics, memory, and admin
// now route to their real surfaces in App.tsx. No MDX nav id falls through to
// the "in design" placeholder. Kept as an empty map so future pre-design
// surfaces can register a stub here without reintroducing the import.
export const MDX_STUBS: Record<string, StubInfo> = {};

export interface AnaMode {
  id: 'standard' | 'deep-research' | 'nano-banana';
  label: string;
  model: string;
  desc: string;
}

/**
 * `model` is an INTENT label, not a vendor model name — matching
 * v2/registryModel.ts ANA_MODES ("intent → engine label, resolved server-side;
 * no vendor names on screen"), and the standing rule already written into
 * shell/AnaRail.tsx: "all UI says 'AnA 1.0' — no raw model names."
 *
 * These previously read 'Sonnet 4.5' / 'Opus 4.5' / 'Haiku 4.5'. Nothing in this
 * kit renders `.model` today — AnaRail and CmdK both display `.label` — so the
 * names were never on screen. That is exactly what made it worth fixing: it was
 * a loaded gun, one `{m.model}` away from shipping vendor names into a regulated
 * UI, in a file whose own sibling comment forbids them.
 *
 * NOTE — divergence left alone deliberately: the third mode is `nano-banana`
 * here and `quick-ask` in v2. The id is persisted in localStorage as
 * `mdx.anaMode`, so renaming it silently would strand existing users' saved
 * preference. It should converge when the shells do.
 */
export const ANA_MODES: AnaMode[] = [
  { id: 'standard',      label: 'Standard',      model: 'Balanced', desc: 'Chat, reasoning, quick answers' },
  { id: 'deep-research', label: 'Deep research', model: 'Maximum',  desc: 'Drafting, multi-step analysis, long-form' },
  { id: 'nano-banana',   label: 'Nano-banana',   model: 'Instant',  desc: 'Autocomplete, inline, classification' },
];

export interface AnaTool {
  id: string;
  group: string;
  label: string;
  desc: string;
}

export const ANA_TOOLS: AnaTool[] = [
  { id: 'search_predicates',    group: 'Precedent', label: 'Search predicates',       desc: 'Predicate device corpus by class, product code, intended use' },
  { id: 'get_se_matrix',        group: 'Precedent', label: 'Substantial equivalence', desc: 'Subject vs. predicate comparison matrix' },
  { id: 'search_precedents',    group: 'Precedent', label: 'Search precedents',       desc: 'Cross-agency regulatory decisions' },
  { id: 'search_literature',    group: 'Evidence',  label: 'Search literature',       desc: 'PubMed / Embase / Cochrane corpus' },
  { id: 'search_adverse',       group: 'Evidence',  label: 'Adverse events',          desc: 'FAERS / MAUDE signal query' },
  { id: 'get_program_status',   group: 'Program',   label: 'Program status',          desc: 'Readiness, next blocker, open deficiencies' },
  { id: 'get_rim_signals',      group: 'Program',   label: 'RIM signals',             desc: 'Deficiency / reviewer-trigger signals' },
  { id: 'run_judgment',         group: 'Program',   label: 'Judgment framework',      desc: '6-model scoring on an artifact' },
  { id: 'get_evidence_chain',   group: 'Program',   label: 'Evidence chain',          desc: 'Confidence trace for a claim' },
  { id: 'suggest_next_action',  group: 'Program',   label: 'Suggest next action',     desc: 'Recommendation engine' },
  { id: 'draft_section',        group: 'Authoring', label: 'Draft section',           desc: 'Governed authoring — 510(k), CER, PMA' },
  { id: 'create_artifact',      group: 'Authoring', label: 'Create artifact',         desc: 'Editor wire-up' },
];

export const MDX_SUGGESTIONS: Record<string, string[]> = {
  overview:   ['Find device-code precedents', 'Generate readiness report', 'Flag filing risks'],
  k510:       ['Find more CGM predicates', 'Draft SE discussion', 'Check eSTAR validation'],
  pma:        ['Summarize enrollment gap', 'Draft DSMB charter', 'Pull pivotal precedents'],
  cer:        ['Run FAERS signal scan', 'Adjudicate lead dislodgement', 'Draft Article 61 section'],
  'device-diagnostics-workbench': ['Classify under Annex VIII', 'Summarize analytical performance', 'Close open GSPR requirements'],
  'clinical-studies': ['Summarize enrollment gaps', 'List open major deviations', 'Assess BIMO readiness'],
  software:   ['Check IEC 62304 completeness', 'Which deliverables are unapproved?', 'Draft the SBOM'],
  predicate:  ['Compare K221847 vs subject', 'Find predicates for CGM', 'Cluster by product code'],
  engineering:['ISO 14971 risk review', 'Cybersecurity premarket', 'Biocompatibility for 14-day'],
  udi:        ['Generate UDI for BX-204', 'Labeling MRI statements', 'Multi-language harmonization'],
  postmarket: ['This week signals', 'Open MDRs', 'Trending adverse events'],
  editor:     ['Draft this section from predicate', 'Check claim against evidence', 'Rewrite for FDA tone'],
};
