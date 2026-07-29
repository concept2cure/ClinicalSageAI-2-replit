(() => {
/**
 * MDX nav — ported from client/src/concept2cure/mdx/data/nav.ts.
 *
 * DIFF vs. codebase (Phase 4 contract):
 *   • MDX_STUBS no longer contains engineering / udi / postmarket /
 *     analytics / memory / admin. Those 6 surfaces are now designed
 *     (see surfaces/*.jsx) and the App route table dispatches to them
 *     directly instead of falling through to <InDesignSurface>.
 *
 * Claude Code lands this 1:1 in nav.ts: keep MDX_NAV_V2 unchanged
 * (same ids, same labels, same icons, same group order), delete the
 * six entries from MDX_STUBS, and add the six `case` arms in App.tsx
 * mirroring K510/PMA/CER.
 */

const MDX_NAV_GROUPS = [
  { id: 'workstream',   label: 'Workstream' },
  { id: 'workbench',    label: 'Workbench' },
  { id: 'diagnostics',  label: 'Diagnostics' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'system',       label: '' },
];

const MDX_NAV_V2 = [
  // Workstream
  { id: 'overview',   label: 'Overview',               icon: 'grid',         group: 'workstream' },
  { id: 'k510',       label: '510(k) Submissions',     icon: 'file',         group: 'workstream' },
  { id: 'pma',        label: 'PMA Submissions',        icon: 'shieldCheck',  group: 'workstream' },
  { id: 'cer',        label: 'CER Generator',          icon: 'microscope',   group: 'workstream' },
  { id: 'predicate',  label: 'Precedent Intelligence', icon: 'scale',        group: 'workstream' },

  // Workbench
  { id: 'tasks',       label: 'Tasks and Reviews', icon: 'clipboardList', group: 'workbench' },
  { id: 'ana-review',  label: 'AnA Review Queue',  icon: 'sparkles',      group: 'workbench' },
  { id: 'vault',       label: 'Document Vault',    icon: 'vault',         group: 'workbench' },
  { id: 'validation',  label: 'Validation Center', icon: 'shieldAlert',   group: 'workbench' },
  { id: 'submissions', label: 'Submission Center', icon: 'rocket',        group: 'workbench' },
  { id: 'qsub',        label: 'Q-Sub Briefing',    icon: 'chat',          group: 'workbench' },
  { id: 'templates',   label: 'Templates',         icon: 'template',      group: 'workbench' },

  // Lifecycle (formerly stubs — now Phase 4)
  { id: 'engineering', label: 'Device Engineering',   icon: 'wrench',      group: 'workstream' },
  { id: 'udi',         label: 'UDI and Labeling',     icon: 'tag',         group: 'workstream' },
  { id: 'postmarket',  label: 'Post-market Vigilance',icon: 'alertCircle', group: 'workstream' },
  { id: 'quality',     label: 'Quality System',       icon: 'shieldCheck', group: 'workstream' },
  { id: 'samd',        label: 'SaMD Lifecycle',       icon: 'zap',         group: 'workstream' },
  { id: 'clinical',    label: 'Clinical Studies',     icon: 'users',       group: 'workstream' },

  // Diagnostics (Phase 6)
  { id: 'ivd',         label: 'IVD Pathway',          icon: 'flask',     group: 'diagnostics' },
  { id: 'ivdr',        label: 'EU IVDR',              icon: 'globe',     group: 'diagnostics' },
  { id: 'cdx',         label: 'Companion Diagnostic', icon: 'atom',      group: 'diagnostics' },
  { id: 'ldt',         label: 'LDT Compliance',       icon: 'beaker',    group: 'diagnostics' },

  // Intelligence
  { id: 'analytics',     label: 'Analytics',             icon: 'barChart3', group: 'intelligence' },
  { id: 'memory',        label: 'AnA Memory',            icon: 'database',  group: 'intelligence' },
  { id: 'conversations', label: 'AnA Conversations',     icon: 'chat',      group: 'intelligence' },

  // System
  { id: 'search',        label: 'Global Search',     icon: 'search',    group: 'system' },
  { id: 'notifications', label: 'Notifications',     icon: 'bell',      group: 'system' },
  { id: 'audit',         label: 'Audit Log',         icon: 'shield',    group: 'system' },
  { id: 'onboarding',    label: 'Onboarding',        icon: 'upload',    group: 'system' },
  { id: 'admin',         label: 'Admin and Access',  icon: 'userCheck', group: 'system' },
];

/* MDX_STUBS is now empty for the rail items this kit designs. */
const MDX_STUBS = {};

const ANA_MODES = [
  { id: 'standard',      label: 'Standard',      model: 'Sonnet 4.5', desc: 'Chat, reasoning, quick answers' },
  { id: 'deep-research', label: 'Deep research', model: 'Opus 4.5',   desc: 'Drafting, multi-step analysis, long-form' },
  { id: 'nano-banana',   label: 'Nano-banana',   model: 'Haiku 4.5',  desc: 'Autocomplete, inline, classification' },
];

const MDX_SUGGESTIONS = {
  overview:    ['Find device-code precedents', 'Generate readiness report', 'Flag filing risks'],
  k510:        ['Find more CGM predicates', 'Draft SE discussion', 'Check eSTAR validation'],
  pma:         ['Summarize enrollment gap', 'Draft DSMB charter', 'Pull pivotal precedents'],
  cer:         ['Run FAERS signal scan', 'Adjudicate lead dislodgement', 'Draft Article 61 section'],
  predicate:   ['Compare K221847 vs subject', 'Find predicates for CGM', 'Cluster by product code'],
  engineering: ['Re-score risk after design change', 'Open ECRs older than 30 days', 'Draft V&V trace for §07'],
  udi:         ['Generate UDI for BX-204',  'Reconcile EU UDI-DI with FDA',     'Check MRI-conditional statement'],
  postmarket:  ["This week's signals",      'Open MDR 30-day reports',         'Trending adverse events'],
  analytics:   ['Cycle time vs product code peers', 'Top 3 blockers this quarter', 'Reviewer velocity for OB-GYN devices'],
  memory:      ['Show critical memories pinned to AnA', 'Ingest the style guide PDF', 'Supersede the 2024 deficiency learnings'],
  admin:       ['Audit Jordan Chen access this week', 'Open seats by role', 'Rotate API key for ESG bridge'],
  audit:       ['Verify chain integrity for last 24h', 'Export Q2 signing manifest', 'Find every export by JC last 30d'],
  notifications:['Mute vigilance signals below review severity', 'Show only AnA drafts pending review', 'Route MDR alerts to Marcus'],
  quality:     ['Pre-inspection check for Q3 notified-body audit', 'Open SOP-820-50 supplier controls', 'Surface every member missing current training'],
  vault:       ['Find every artifact signed by Jordan in Q2', 'Verify SHA-256 chain across the vault', 'Show files approaching retention purge'],
  templates:   ['Apply the eSTAR baseline to BX-204', 'Suggest the right template for a 30-day MDR', 'Compare PSUR v2.4 to last year'],
  ivd:         ['Reconcile method comparison against EP09-A3', 'Draft the CLIA waiver flex-study', 'Surface analytical studies still in draft'],
  ivdr:        ['Walk me through Annex VIII classification', 'Find the PER gap vs Annex II/III', 'Schedule the next BSI milestone'],
  cdx:         ['Verify label alignment with KEYTRUDA-9', 'Recompute concordance with the latest cohort', 'Map every NDA section to its PMA equivalent'],
  ldt:         ['Run enforcement-discretion decision for every LDT', 'Show LDTs due for Phase 2 registration', 'Draft the CV-IH401 De Novo Pre-Sub response'],
  'ana-review':['Show me drafts waiting more than 24 hours', 'Bulk-accept high-confidence drafts in this surface', 'Refine the last 3 drafts I reviewed'],
  qsub:        ['Compose a new Pre-Sub question with AnA', 'Surface every FDA Q-Sub response in the last 90 days', 'Cross-reference our Q-Sub with related submissions'],
  samd:        ['Re-run coverage analysis for IEC 62304', 'Triage all open anomalies by severity', 'Verify PCCP change-control framework against FDA 2023 cyber guidance'],
  clinical:    ['Compare enrollment pace vs the protocol target', 'Surface every site below their enrollment commitment', 'Pull adverse-event adjudication queue summary'],
  search:      ['Show every artifact signed by Jordan in Q2', 'Find every audit entry on CV-330 last 30 days', 'Surface MDR conversations across the portfolio'],
  onboarding:  ['Resume AnA section mapping', 'Surface every unmappable artifact for manual review', 'Seed memory from style guides + RTA letters'],
  conversations:['Find every conversation that produced a draft this week', 'Pin the IV-415 PER drafting thread', 'Export Q2 CV-330 conversations as PDF'],
};


// Window globals (kit harness only — codebase uses ESM imports)
window.MDX_NAV_GROUPS = MDX_NAV_GROUPS;
window.MDX_NAV_V2 = MDX_NAV_V2;
window.MDX_STUBS = MDX_STUBS;
window.ANA_MODES = ANA_MODES;
window.MDX_SUGGESTIONS = MDX_SUGGESTIONS;

})();
