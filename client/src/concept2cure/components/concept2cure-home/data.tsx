import { isFeatureEnabled } from '@/flags/featureFlags';
import type { IconName } from './icons';

export type NavGroup = 'domain' | 'work' | 'intelligence' | 'system';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  href: string | null;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'mdx',        label: 'Medical Device and Diagnostics', icon: 'stethoscope', group: 'domain',       href: null },
  { id: 'biopharma',  label: 'Biotech and Pharma',             icon: 'atom',        group: 'domain',       href: null },
  { id: 'pdev',       label: 'Pharmaceutical Development',      icon: 'beaker',      group: 'domain',       href: null },

  { id: 'projects',   label: 'Projects',                       icon: 'folder',      group: 'work',         href: null },
  { id: 'vault',      label: 'Vault DMS',                      icon: 'vault',       group: 'work',         href: null },
  { id: 'tasking',    label: 'Tasking and Collaboration',      icon: 'checkCircle', group: 'work',         href: null },
  { id: 'submission', label: 'Submission Center',              icon: 'send',        group: 'work',         href: null },

  { id: 'protocol',   label: 'Protocol and Study Design',      icon: 'microscope',  group: 'intelligence', href: null },
  { id: 'cmc',        label: 'CMC Module',                     icon: 'beaker',      group: 'intelligence', href: null },
  { id: 'biostat',    label: 'Biostatistics',                  icon: 'sigma',       group: 'intelligence', href: null },
  { id: 'quality',    label: 'Quality and Lifecycle',          icon: 'shieldCheck', group: 'intelligence', href: null },
  { id: 'reporting',  label: 'Reports',                        icon: 'barChart',    group: 'intelligence', href: null },

  { id: 'memory',     label: 'AnA Memory',                     icon: 'brain',       group: 'system',       href: null },
  { id: 'artifacts',  label: 'User Artifacts',                 icon: 'sparkles',    group: 'system',       href: null },
  { id: 'audit',      label: 'Audit and Compliance',           icon: 'scroll',      group: 'system',       href: null },
  { id: 'admin',      label: 'Admin Settings',                 icon: 'settings',    group: 'system',       href: null },
];

export const NAV_SUB: Record<string, string[]> = {
  projects:   ['NDA 212345 · BX-204', '510(k) · BX-204 device', 'EMA scientific advice', 'Pediatric plan'],
  vault:      ['Source documents', 'Controlled copies', 'Audit log'],
  tasking:    ['Assigned to me', 'Open reviews', 'Due this week'],
  submission: ['In flight · 2', 'Archive · 14'],
  protocol:   ['Active protocols · 3', 'Templates', 'Endpoint library'],
  cmc:        ['Drug substance · §3.2.S', 'Drug product · §3.2.P', 'Stability studies', 'Specifications'],
  biostat:    ['SAPs · 4 active', 'Sample size calcs', 'Interim analyses', 'Tables, listings, figures'],
  quality:    ['SOP management', 'CAPA · 3 open', 'Post-market surveillance', 'Inspection readiness', 'Compliance monitor'],
  reporting:  ['Readiness dashboards', 'Timeline forecasting', 'Precedent models'],
  memory:     ['Recent recalls · 42', 'Pinned facts', 'Source traces', 'RIM v4.2'],
  artifacts:  ['Recent drafts · 12', 'Pinned artifacts'],
  audit:      ['21 CFR Part 11 trail', 'E-signatures', 'Access log', 'Change history'],
  admin:      ['Users & roles', 'Integrations', 'Agency credentials', 'Billing'],
};

export interface DashMetric {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: 'ok' | 'warn' | 'err' };
  /** Plain-text summary shown below the metric. The kit used JSX spans for
   *  delta colouring; those are prototype artefacts — production renders
   *  plain strings and applies colour via CSS classes on the card itself. */
  meta: string;
}

export const DASH: DashMetric[] = [
  {
    label: 'Submission readiness',
    metric: '87',
    unit: '%',
    bar: { pct: 87, tone: 'ok' },
    meta: 'NDA 212345 · 3 items blocking',
  },
  {
    label: 'Active projects',
    metric: '14',
    meta: '6 biotech · 8 device · 2 in review this week',
  },
  {
    label: 'Tasks due',
    metric: '7',
    meta: '3 overdue · 4 due by Friday',
  },
  {
    label: 'Alerts',
    metric: '2',
    meta: 'FDA guidance update · EMA precedent +1',
  },
];

export interface ModuleCard {
  navId: string;
  icon: IconName;
  title: string;
  desc: string;
  foot: string;
}

export const MODULES: ModuleCard[] = [
  { navId: 'mdx',        icon: 'stethoscope', title: 'Medical Device and Diagnostics', desc: 'Class II/III device clearance, IVD submissions, predicate intelligence, UDI and post-market vigilance.',               foot: '6 active · 510(k), De Novo, PMA' },
  { navId: 'biopharma',  icon: 'atom',        title: 'Biotech and Pharma',             desc: 'Small molecule and biologic submissions. IND, NDA, BLA, MAA, pediatric plans.',                                            foot: '8 active · NDA, BLA, MAA' },
  { navId: 'pdev',       icon: 'beaker',      title: 'Pharmaceutical Development',      desc: 'IND program development across CMC, nonclinical, clinical and regulatory. Assembly, FDA interactions and contradiction tracking.', foot: 'IND programs · CMC, nonclinical, clinical' },
  { navId: 'projects',   icon: 'folder',      title: 'Projects',                       desc: 'Persistent workspaces with shared context, chats, artifacts and files.',                                                   foot: '14 projects · 42 contributors' },
  { navId: 'vault',      icon: 'vault',       title: 'Vault DMS',                      desc: 'Controlled document management with 21 CFR Part 11 audit trail and e-signatures.',                                         foot: '12,480 docs · 99.8% valid' },
  { navId: 'tasking',    icon: 'checkCircle', title: 'Tasking and Collaboration',      desc: 'Review assignments, sign-offs and cross-team handoffs tied to artifacts.',                                                 foot: '7 open · 3 overdue' },
  { navId: 'submission', icon: 'send',        title: 'Submission Center',              desc: 'Compose, validate and ship eCTD, EU-CTR and other agency packages.',                                                       foot: '2 in flight · next: NDA 212345' },
  { navId: 'protocol',   icon: 'microscope',  title: 'Protocol and Study Design',      desc: 'Draft protocols and study designs grounded in agency precedent and endpoint libraries.',                                  foot: '3 protocols · biostat AnA' },
  { navId: 'cmc',        icon: 'beaker',      title: 'CMC Module',                     desc: 'Chemistry, Manufacturing and Controls — drug substance, drug product, stability, specs.',                                foot: '§3.2.S / §3.2.P · 12 docs' },
  { navId: 'biostat',    icon: 'sigma',       title: 'Biostatistics',                  desc: 'Statistical analysis plans, sample-size calculations, TLFs and interim analyses.',                                         foot: '4 SAPs · R / SAS bridge' },
  { navId: 'quality',    icon: 'shieldCheck', title: 'Quality and Lifecycle',          desc: 'SOPs, CAPA, post-market surveillance, inspection readiness and continuous compliance.',                                    foot: '3 CAPAs open · 1 inspection due' },
  { navId: 'reporting',  icon: 'barChart',    title: 'Reports',                        desc: 'Readiness dashboards, timeline forecasts and precedent likelihood modeling.',                                             foot: '9 dashboards · RIM v4.2' },
  { navId: 'memory',     icon: 'brain',       title: 'AnA Memory',                     desc: 'Browse what AnA remembers — pinned facts, source traces and how the RIM reasons about your programs.',                   foot: '42 recalls · 14 pinned' },
  { navId: 'artifacts',  icon: 'sparkles',    title: 'User Artifacts',                 desc: 'Every artifact AnA has drafted for you — sections, SAPs, responses, slides.',                                             foot: '34 artifacts · 12 this week' },
  { navId: 'audit',      icon: 'scroll',      title: 'Audit and Compliance',           desc: '21 CFR Part 11 audit trail, e-signatures, access logs and full change history.',                                          foot: 'Part 11 ready · 248k events' },
  { navId: 'admin',      icon: 'settings',    title: 'Admin Settings',                 desc: 'Users and roles, SSO, agency credentials, integrations and billing.',                                                    foot: 'Enterprise tier · SOC 2 Type II' },
];

// PDEV (Phase 7) is a Domain rail item gated by ENABLE_PDEV_SURFACE. When the
// flag is off the route falls through to projects, so the rail, launcher, and
// command palette must hide the entry rather than offer a dead destination.
export function visibleNavItems(): NavItem[] {
  if (isFeatureEnabled('ENABLE_PDEV_SURFACE')) return NAV_ITEMS;
  return NAV_ITEMS.filter(n => n.id !== 'pdev');
}

export function visibleModules(): ModuleCard[] {
  if (isFeatureEnabled('ENABLE_PDEV_SURFACE')) return MODULES;
  return MODULES.filter(m => m.navId !== 'pdev');
}

export interface RecentRow {
  icon: IconName;
  mod: string;
  ttl: string;
  pill: { kind: 'info' | 'ok' | 'warn' | 'err' | 'neutral'; label: string };
  when: string;
}

export const RECENTS: RecentRow[] = [
  { icon: 'pencil', mod: 'eCTD · §2.5',             ttl: 'Clinical overview — v0.4 autosaved',       pill: { kind: 'info',    label: 'Drafting' },  when: '2 min ago' },
  { icon: 'chat',   mod: 'AnA · Precedent',         ttl: '510(k) predicate search returned 14 hits', pill: { kind: 'ok',      label: 'Complete' },  when: '18 min ago' },
  { icon: 'file',   mod: 'Submission · NDA 212345', ttl: 'Module 3.2.S ready for review — J. Chen',  pill: { kind: 'warn',    label: 'In review' }, when: '1 hour ago' },
  { icon: 'clip',   mod: 'Tasking',                 ttl: 'R. Ahuja signed off on biostat SAP',       pill: { kind: 'ok',      label: 'Approved' },  when: '3 hours ago' },
  { icon: 'flask',  mod: 'Protocol · BX-204',       ttl: 'Interim analysis plan updated',            pill: { kind: 'neutral', label: 'Draft' },     when: 'yesterday' },
  { icon: 'globe',  mod: 'AnA · Cross-agency',      ttl: 'EMA scientific advice prep — pack ready',  pill: { kind: 'err',     label: '2 gaps' },    when: 'yesterday' },
];

export interface Suggestion {
  ico: IconName;
  label: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { ico: 'file',   label: 'Draft CTD Section 2.5' },
  { ico: 'search', label: 'Find 510(k) predicates' },
  { ico: 'flask',  label: 'Review biostat SAP' },
  { ico: 'clip',   label: 'Submission readiness' },
  { ico: 'globe',  label: 'Cross-agency precedent' },
];

export type Scope = 'all' | 'biopharma' | 'mdx';

export const SCOPE_OPTIONS: { id: Scope; label: string; ico: IconName }[] = [
  { id: 'all',       label: 'All',       ico: 'globe' },
  { id: 'biopharma', label: 'Biopharma', ico: 'atom' },
  { id: 'mdx',       label: 'Device/Dx', ico: 'stethoscope' },
];

export interface BriefingItem {
  num: string;
  t: string;
  meta: string;
  /** Project the action belongs to. Used by the home host to deep-link. */
  projectId?: string;
  /** Optional next-action id from /api/intelligence/projects/:id/next-actions. */
  actionId?: string;
}

export const BRIEFING_BY_SCOPE: Record<Scope, BriefingItem[]> = {
  all: [
    { num: '01', t: "Review J. Chen's biostat SAP — 2 comments open", meta: 'BX-204 · due today' },
    { num: '02', t: 'Resolve 2 gaps on EMA scientific advice prep',   meta: 'Pack · ready to ship' },
    { num: '03', t: 'Approve §3.2.S Drug substance for NDA 212345',    meta: 'Readiness 87%' },
  ],
  biopharma: [
    { num: '01', t: 'Approve §3.2.S Drug substance for NDA 212345',    meta: 'Readiness 87%' },
    { num: '02', t: 'Resolve 2 gaps on EMA scientific advice prep',   meta: 'Pack · ready to ship' },
    { num: '03', t: 'Confirm pediatric plan harmonization across FDA/EMA', meta: 'iPSP · PIP' },
  ],
  mdx: [
    { num: '01', t: 'Finalize 510(k) predicate analysis — 14 candidates', meta: 'BX-204 device · SE arg.' },
    { num: '02', t: 'Sign off UDI-DI assignments for Class II portfolio',  meta: '23 devices' },
    { num: '03', t: 'Close 3 post-market vigilance cases',                 meta: 'MedWatch · due Fri' },
  ],
};
