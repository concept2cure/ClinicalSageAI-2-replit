// Biopharma nav — verbatim from ui_kits/biopharma/data.jsx

export interface BioNavGroup {
  id: string;
  label: string;
}

export interface BioNavItem {
  id: string;
  label: string;
  icon: string;
  group: string;
}

export const BIOPHARMA_NAV_GROUPS: BioNavGroup[] = [
  { id: 'workstream',   label: 'Workstream' },
  { id: 'lifecycle',    label: 'Lifecycle' },
  { id: 'workbench',    label: 'Workbench' },
  { id: 'intelligence', label: 'Intelligence' },
  // Phase 10.2 — labeled so the group collapses (brief smart defaults:
  // Workstream open; Lifecycle / Intelligence / System collapsed).
  { id: 'system',       label: 'System' },
];

export const BIOPHARMA_NAV: BioNavItem[] = [
  // Workstream
  { id: 'overview',    label: 'Overview',                    icon: 'grid',          group: 'workstream' },
  { id: 'ind',         label: 'IND / CTA',                   icon: 'flask',         group: 'workstream' },
  { id: 'nda',         label: 'NDA · 505(b)',                icon: 'file',          group: 'workstream' },
  { id: 'bla',         label: 'BLA · 351(a)',                icon: 'atom',          group: 'workstream' },
  { id: 'maa',         label: 'MAA · EU centralized',        icon: 'globe',         group: 'workstream' },
  { id: 'jnda',        label: 'JNDA · Japan',                icon: 'shieldCheck',   group: 'workstream' },
  { id: 'precedent',   label: 'Precedent intelligence',      icon: 'scale',         group: 'workstream' },
  // Lifecycle
  { id: 'lifecycle',   label: 'Lifecycle management',        icon: 'history',       group: 'lifecycle' },
  { id: 'cmc',         label: 'CMC · Module 3',              icon: 'beaker',        group: 'lifecycle' },
  { id: 'clinical',    label: 'Clinical operations',         icon: 'users',         group: 'lifecycle' },
  { id: 'pharmacov',   label: 'Pharmacovigilance · PSUR',    icon: 'alertCircle',   group: 'lifecycle' },
  { id: 'pediatric',   label: 'Pediatric · PIP / PSP',       icon: 'shieldCheck',   group: 'lifecycle' },
  { id: 'orphan',      label: 'Orphan and rare',             icon: 'sparkles',      group: 'lifecycle' },
  { id: 'meetings',    label: 'Agency meetings',             icon: 'messageCircle', group: 'lifecycle' },
  { id: 'biostat',     label: 'Biostatistics',               icon: 'sigma',         group: 'lifecycle' },
  // Workbench (shared with MDX)
  { id: 'tasks',       label: 'Tasks and reviews',           icon: 'clipboardList', group: 'workbench' },
  { id: 'ana-review',  label: 'AnA review queue',            icon: 'sparkles',      group: 'workbench' },
  { id: 'vault',       label: 'Document vault',              icon: 'vault',         group: 'workbench' },
  { id: 'validation',  label: 'Validation center',           icon: 'shieldAlert',   group: 'workbench' },
  { id: 'submissions', label: 'Submission center',           icon: 'send',          group: 'workbench' },
  { id: 'templates',   label: 'Templates',                   icon: 'layout',        group: 'workbench' },
  // Intelligence
  { id: 'analytics',     label: 'Analytics',                 icon: 'barChart',      group: 'intelligence' },
  { id: 'memory',        label: 'AnA memory',                icon: 'database',      group: 'intelligence' },
  { id: 'conversations', label: 'AnA conversations',         icon: 'messageCircle', group: 'intelligence' },
  // System
  { id: 'search',        label: 'Global search',             icon: 'search',        group: 'system' },
  { id: 'notifications', label: 'Notifications',             icon: 'bell',          group: 'system' },
  { id: 'audit',         label: 'Audit log',                 icon: 'shield',        group: 'system' },
  { id: 'onboarding',    label: 'Onboarding',                icon: 'upload',        group: 'system' },
  { id: 'admin',         label: 'Admin and access',          icon: 'settings',      group: 'system' },
];

/** Phase 10.2 smart defaults — Workstream open; Lifecycle / Workbench /
 *  Intelligence / System collapsed. Persisted per user via
 *  users.preferences.railGroups once the user toggles a group. */
export function defaultRailGroupsOpen(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  BIOPHARMA_NAV_GROUPS.forEach(g => {
    out[g.id] = g.id === 'workstream' || !g.label;
  });
  return out;
}

export const HERE_LABEL_BIOPHARMA: Record<string, string> = {
  overview:     'Overview',
  ind:          'IND / CTA',
  nda:          'NDA · 505(b)',
  bla:          'BLA · 351(a)',
  maa:          'MAA · EU centralized',
  jnda:         'JNDA · Japan',
  precedent:    'Precedent intelligence',
  lifecycle:    'Lifecycle management',
  cmc:          'CMC · Module 3',
  clinical:     'Clinical operations',
  pharmacov:    'Pharmacovigilance · PSUR',
  pediatric:    'Pediatric · PIP / PSP',
  orphan:       'Orphan and rare',
  meetings:     'Agency meetings',
  biostat:      'Biostatistics',
  tasks:        'Tasks and reviews',
  'ana-review': 'AnA review queue',
  vault:        'Document vault',
  validation:   'Validation center',
  submissions:  'Submission center',
  templates:    'Templates',
  analytics:    'Analytics',
  memory:       'AnA memory',
  conversations:'AnA conversations',
  search:       'Global search',
  notifications:'Notifications',
  audit:        'Audit log',
  onboarding:   'Onboarding',
  admin:        'Admin and access',
};

export const BIOPHARMA_SUGGESTIONS: Record<string, string[]> = {
  overview:  ['Find biopharma precedents for breakthrough designation', 'Generate cross-portfolio readiness report', 'Flag filing risks for the next 90 days'],
  ind:       ['Draft IND amendment · BX-115 protocol revision', 'Open SUSAR 7-day form', 'Check Module 3 stability narrative'],
  nda:       ['Strengthen NDA §2.5 against FDA 2023 oncology bridging guidance', 'Draft FDA Q-Sub for Type B', 'Run NDA readiness diagnostic'],
  bla:       ['Compare BX-502 to RP3 reference', 'Run Tier 1 analytical similarity check', 'Draft 351(k) bridging strategy'],
  maa:       ['Pull EU MDR Annex II ⇄ ICH M4 crosswalk for §3.2.P', 'Generate CHMP day 120 response pack', 'Compare PSP and PIP scopes'],
  jnda:      ['Pull PMDA bridging precedent for oncology', 'Compare Japan PK to global pool', 'Draft Yakuji-ho compliance checklist'],
  lifecycle: ['Compare CMC change-control across BX-099 and BX-204', 'Draft Type II variation against EMA guidance', 'Open every supplement filed in last 90 days'],
  orphan:    ['Find orphan precedents in RPE65 dystrophy', 'Draft FDA orphan application narrative', 'Pull every RPD voucher transaction 2022-2025'],
  meetings:  ['Generate Type C briefing book outline · BX-115', 'Pull every aligned FDA outcome 2024-2026', 'Cross-reference past minutes for stability strategy'],
  pediatric: ['Draft PSP rationale for adolescent extrapolation', 'Compare PIP modifications across BX-420 and BX-301', 'Surface every PIP milestone due in 90 days'],
  cmc:       ['Reconcile drug substance specs across CSR-201 and §3.2.S.4.1', 'Pull stability trend at 24 months', 'Generate process performance summary'],
  pharmacov: ['Adjudicate the highest-PRR signal', 'Draft PSUR §15 risk evaluation', 'Cross-reference EudraVigilance + FAERS'],
  precedent: ['Find the 5 closest precedents to our lead program', 'Pull all accelerated approvals 2022–2025 for solid tumors', 'Cluster precedents by mechanism of action'],
};

// Phase 10.2 — client-type IA moved to ./clientTypes (typed, includes medtech
// + per-type Overview config). Re-exported here for existing import sites.
export { CLIENT_TYPES, asClientType, getClientTypeConfig } from './clientTypes';
export type { ClientType, ClientTypeConfig, ClientTypeOverview } from './clientTypes';
