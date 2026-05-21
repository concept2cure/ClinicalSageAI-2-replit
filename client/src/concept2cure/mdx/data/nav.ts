/**
 * MDX nav data — ported verbatim from design-system/ui_kits/mdx/data.jsx.
 * Shape contracts: do not drift without designer review.
 */

import type { IconKey } from '../icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconKey;
  group: 'workstream' | 'workbench' | 'diagnostics' | 'intelligence' | 'system' | 'work';
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
  { id: 'diagnostics',  label: 'Diagnostics' },
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
  { id: 'quality',      label: 'Quality System',        icon: 'shieldCheck',  group: 'workstream' },

  // Workbench — cross-program work surfaces.
  { id: 'tasks',        label: 'Tasks and Reviews',     icon: 'clipboardList',group: 'workbench' },
  { id: 'vault',        label: 'Document Vault',        icon: 'vault',        group: 'workbench' },
  { id: 'validation',   label: 'Validation Center',     icon: 'shieldAlert',  group: 'workbench' },
  { id: 'submissions',  label: 'Submission Center',     icon: 'rocket',       group: 'workbench' },
  { id: 'templates',    label: 'Templates',             icon: 'template',     group: 'workbench' },

  // Diagnostics — Phase 6 paid-feature surfaces for IVD/CDx/LDT customers.
  { id: 'ivd',          label: 'IVD Pathway',           icon: 'flask',        group: 'diagnostics' },
  { id: 'ivdr',         label: 'EU IVDR',               icon: 'globe',        group: 'diagnostics' },
  { id: 'cdx',          label: 'Companion Diagnostic',  icon: 'atom',         group: 'diagnostics' },
  { id: 'ldt',          label: 'LDT Compliance',        icon: 'beaker',       group: 'diagnostics' },

  // Intelligence — read-only reporting + cross-cutting memory.
  { id: 'analytics',    label: 'Analytics',             icon: 'barChart3',    group: 'intelligence' },
  { id: 'memory',       label: 'AnA Memory',            icon: 'database',     group: 'intelligence' },
  { id: 'conversations',label: 'AnA Conversations',     icon: 'chat',         group: 'intelligence' },

  // System — admin + the only link that exits the workstream.
  { id: 'search',       label: 'Global Search',         icon: 'search',       group: 'system' },
  { id: 'notifications',label: 'Notifications',         icon: 'bell',         group: 'system' },
  { id: 'audit',        label: 'Audit Log',             icon: 'shield',       group: 'system' },
  { id: 'onboarding',   label: 'Onboarding',            icon: 'upload',       group: 'system' },
  { id: 'admin',        label: 'Admin and Access',      icon: 'userCheck',    group: 'system' },
];

export interface StubInfo {
  title: string;
  icon: IconKey;
  desc: string;
  phase: string;
}

// Phase 4 keys (engineering · udi · postmarket · analytics · memory · admin)
// were removed from this stubs map after their surfaces shipped — each rail
// item now resolves to its real surface in App.tsx. New stubs land here as
// the kit designs surfaces for later phases.
export const MDX_STUBS: Record<string, StubInfo> = {};

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
  overview:     ['Find device-code precedents', 'Generate readiness report', 'Flag filing risks'],
  k510:         ['Find more CGM predicates', 'Draft SE discussion', 'Check eSTAR validation'],
  pma:          ['Summarize enrollment gap', 'Draft DSMB charter', 'Pull pivotal precedents'],
  cer:          ['Run FAERS signal scan', 'Adjudicate lead dislodgement', 'Draft Article 61 section'],
  predicate:    ['Compare K221847 vs subject', 'Find predicates for CGM', 'Cluster by product code'],
  engineering:  ['ISO 14971 risk review', 'Cybersecurity premarket', 'Biocompatibility for 14-day'],
  udi:          ['Generate UDI for BX-204', 'Labeling MRI statements', 'Multi-language harmonization'],
  postmarket:   ['This week signals', 'Open MDRs', 'Trending adverse events'],
  analytics:    ['Cycle time vs product code peers', 'Top 3 blockers this quarter', 'Reviewer velocity for OB-GYN devices'],
  memory:       ['Show critical memories pinned to AnA', 'Ingest the style guide PDF', 'Supersede the 2024 deficiency learnings'],
  admin:        ['Audit Jordan Chen access this week', 'Open seats by role', 'Rotate API key for ESG bridge'],
  // Phase 5 — must-have-for-beta surfaces.
  vault:        ['Find every artifact signed by Jordan in Q2', 'Verify SHA-256 chain across the vault', 'Show files approaching retention purge'],
  audit:        ['Verify chain integrity for last 24h', 'Export Q2 signing manifest', 'Find every export by JC last 30d'],
  notifications:['Mute vigilance signals below review severity', 'Show only AnA drafts pending review', 'Route MDR alerts to Marcus'],
  templates:    ['Apply the eSTAR baseline to BX-204', 'Suggest the right template for a 30-day MDR', 'Compare PSUR v2.4 to last year'],
  quality:      ['Pre-inspection check for Q3 notified-body audit', 'Open SOP-820-50 supplier controls', 'Surface every member missing current training'],
  // Phase 6 — diagnostic-client surfaces.
  ivd:          ['Reconcile method comparison against EP09-A3', 'Draft the CLIA waiver flex-study', 'Surface analytical studies still in draft'],
  ivdr:         ['Walk me through Annex VIII classification', 'Find the PER gap vs Annex II/III', 'Schedule the next BSI milestone'],
  cdx:          ['Verify label alignment with KEYTRUDA-9', 'Recompute concordance with the latest cohort', 'Map every NDA section to its PMA equivalent'],
  ldt:          ['Run enforcement-discretion decision for every LDT', 'Show LDTs due for Phase 2 registration', 'Draft the CV-IH401 De Novo Pre-Sub response'],
  // Phase 8 — cross-cutting surfaces.
  search:       ['Show every artifact signed by Jordan in Q2', 'Find every audit entry on CV-330 last 30 days', 'Surface MDR conversations across the portfolio'],
  onboarding:   ['Resume AnA section mapping', 'Surface every unmappable artifact for manual review', 'Seed memory from style guides + RTA letters'],
  conversations:['Find every conversation that produced a draft this week', 'Pin the IV-415 PER drafting thread', 'Export Q2 CV-330 conversations as PDF'],
  editor:       ['Draft this section from predicate', 'Check claim against evidence', 'Rewrite for FDA tone'],
};
