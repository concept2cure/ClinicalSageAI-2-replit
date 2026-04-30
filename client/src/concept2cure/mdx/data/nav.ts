/**
 * MDX nav data — ported verbatim from design-system/ui_kits/mdx/data.jsx.
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
  { id: 'predicate',    label: 'Precedent Intelligence',icon: 'scale',        group: 'workstream' },

  // Workbench — cross-program work surfaces.
  { id: 'tasks',        label: 'Tasks and Reviews',     icon: 'clipboardList',group: 'workbench' },
  { id: 'vault',        label: 'Document Vault',        icon: 'vault',        group: 'workbench' },
  { id: 'validation',   label: 'Validation Center',     icon: 'shieldAlert',  group: 'workbench' },
  { id: 'submissions',  label: 'Submission Center',     icon: 'rocket',       group: 'workbench' },
  { id: 'templates',    label: 'Templates',             icon: 'template',     group: 'workbench' },

  // Intelligence — read-only reporting + cross-cutting memory.
  { id: 'analytics',    label: 'Analytics',             icon: 'barChart3',    group: 'intelligence' },
  { id: 'memory',       label: 'Claude Memory',         icon: 'database',     group: 'intelligence' },

  // System — admin + the only link that exits the workstream.
  { id: 'admin',        label: 'Admin and Access',      icon: 'userCheck',    group: 'system' },
];

export interface StubInfo {
  title: string;
  icon: IconKey;
  desc: string;
  phase: string;
}

export const MDX_STUBS: Record<string, StubInfo> = {
  engineering: {
    title: 'Device engineering',
    icon: 'wrench',
    desc: 'Risk management (ISO 14971), biocompatibility, cybersecurity premarket submissions, and design controls traceability.',
    phase: 'Phase 4',
  },
  udi: {
    title: 'UDI and labeling',
    icon: 'tag',
    desc: 'UDI issuance, GUDID submission, labeling harmonization across regions, MRI-conditional statements.',
    phase: 'Phase 4',
  },
  postmarket: {
    title: 'Post-market vigilance',
    icon: 'alertCircle',
    desc: 'MDR tracking, trending adverse events, PMS plan execution, and notified-body reporting.',
    phase: 'Phase 4',
  },
  analytics: {
    title: 'Analytics',
    icon: 'barChart3',
    desc: 'Portfolio-wide metrics — cycle times, readiness trends, reviewer velocity, blocker root causes. Read-only.',
    phase: 'Phase 4',
  },
  memory: {
    title: 'Claude memory',
    icon: 'database',
    desc: "Your organization's shared Claude context — style guides, approved language, past review learnings. Pinned to every conversation.",
    phase: 'Phase 4',
  },
  admin: {
    title: 'Admin and access',
    icon: 'userCheck',
    desc: 'Org members, roles, program-level access grants, SSO, audit log. Required for any production rollout.',
    phase: 'Phase 4',
  },
};

export interface AnaMode {
  id: 'standard' | 'deep-research' | 'nano-banana';
  label: string;
  model: string;
  desc: string;
}

export const ANA_MODES: AnaMode[] = [
  { id: 'standard',      label: 'Standard',      model: 'Sonnet 4.5', desc: 'Chat, reasoning, quick answers' },
  { id: 'deep-research', label: 'Deep research', model: 'Opus 4.5',   desc: 'Drafting, multi-step analysis, long-form' },
  { id: 'nano-banana',   label: 'Nano-banana',   model: 'Haiku 4.5',  desc: 'Autocomplete, inline, classification' },
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
  predicate:  ['Compare K221847 vs subject', 'Find predicates for CGM', 'Cluster by product code'],
  engineering:['ISO 14971 risk review', 'Cybersecurity premarket', 'Biocompatibility for 14-day'],
  udi:        ['Generate UDI for BX-204', 'Labeling MRI statements', 'Multi-language harmonization'],
  postmarket: ['This week signals', 'Open MDRs', 'Trending adverse events'],
  editor:     ['Draft this section from predicate', 'Check claim against evidence', 'Rewrite for FDA tone'],
};
