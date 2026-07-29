/* global window */
/* Home-screen content — kept in its own module so App.jsx stays readable. */

/* ───── Primary nav items ─────
   Tiered: domain (2) · work (4) · intelligence (5) · system (4) = 15 items.
   Precedent Intelligence lives inside the MDX workstream, not here. */
window.NAV_ITEMS = [
  { id: 'mdx',        label: 'Medical Device and Diagnostics',        icon: 'stethoscope', group: 'domain',       href: '../mdx/index.html' },
  { id: 'biopharma',  label: 'Biotech and Pharma',                    icon: 'atom',         group: 'domain',       href: '../biopharma/index.html' },

  { id: 'projects',   label: 'Projects',                              icon: 'folder',       group: 'work',         href: '../projects/index.html' },
  { id: 'vault',      label: 'Vault DMS',                             icon: 'vault',        group: 'work',         href: null },
  { id: 'tasking',    label: 'Tasking and Collaboration',             icon: 'checkCircle',  group: 'work',         href: '../tasking/index.html' },
  { id: 'submission', label: 'Submission Center',                     icon: 'send',         group: 'work',         href: '../submission/index.html' },

  { id: 'protocol',   label: 'Protocol and Study Design',             icon: 'microscope',   group: 'intelligence', href: '../intelligence/index.html?tab=protocol' },
  { id: 'cmc',        label: 'CMC Module',                            icon: 'beaker',       group: 'intelligence', href: '../cmc/index.html' },
  { id: 'biostat',    label: 'Biostatistics',                         icon: 'sigma',        group: 'intelligence', href: '../intelligence/index.html?tab=biostat' },
  { id: 'quality',    label: 'Quality and Lifecycle',                 icon: 'shieldCheck',  group: 'intelligence', href: null },
  { id: 'reporting',  label: 'Reports',                               icon: 'barChart',     group: 'intelligence', href: '../intelligence/index.html?tab=reporting' },

  { id: 'memory',     label: 'AnA Memory',                            icon: 'brain',        group: 'system',       href: null },
  { id: 'artifacts',  label: 'Documents',                             icon: 'sparkles',     group: 'system',       href: '../authoring/index.html' },
  { id: 'audit',      label: 'Audit and Compliance',                  icon: 'scroll',       group: 'system',       href: null },
  { id: 'admin',      label: 'Admin Settings',                        icon: 'settings',     group: 'system',       href: null },
];

/* ───── Sub-items revealed when a nav item is active ───── */
window.NAV_SUB = {
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
  artifacts:  ['Active drafts · 12', 'Recently drafted', 'Pinned artifacts', 'Templates by agency'],
  audit:      ['21 CFR Part 11 trail', 'E-signatures', 'Access log', 'Change history'],
  admin:      ['Users & roles', 'Integrations', 'Agency credentials', 'Billing'],
};

/* ───── Dashboard metrics ───── */
window.DASH = [
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
    meta: <><span className="delta-warn">3 overdue</span> · 4 due by Friday</>,
  },
  {
    label: 'Alerts',
    metric: '2',
    meta: <>FDA guidance update · EMA precedent <span className="delta-up">+1</span></>,
  },
];

/* ───── Module launcher ───── */
/* First two tiles are "pinned" — they're the domain selector. The rest map to functional modules. */
window.MODULES = [
  { navId: 'mdx',        icon: 'stethoscope', title: 'Medical Device and Diagnostics',    desc: 'Class II/III device clearance, IVD submissions, predicate intelligence, UDI and post-market vigilance.', foot: '6 active · 510(k), De Novo, PMA' },
  { navId: 'biopharma',  icon: 'atom',         title: 'Biotech and Pharma',               desc: 'Small molecule and biologic submissions. IND, NDA, BLA, MAA, pediatric plans.',                              foot: '8 active · NDA, BLA, MAA' },

  { navId: 'projects',   icon: 'folder',       title: 'Projects',                         desc: 'Persistent workspaces with shared context, chats, artifacts and files.',                                      foot: '14 projects · 42 contributors' },
  { navId: 'vault',      icon: 'vault',        title: 'Vault DMS',                        desc: 'Controlled document management with 21 CFR Part 11 audit trail and e-signatures.',                            foot: '12,480 docs · 99.8% valid' },
  { navId: 'tasking',    icon: 'checkCircle',  title: 'Tasking and Collaboration',        desc: 'Review assignments, sign-offs and cross-team handoffs tied to artifacts.',                                     foot: '7 open · 3 overdue' },
  { navId: 'submission', icon: 'send',         title: 'Submission Center',                desc: 'Compose, validate and ship eCTD, EU-CTR and other agency packages.',                                          foot: '2 in flight · next: NDA 212345' },

  { navId: 'protocol',   icon: 'microscope',   title: 'Protocol and Study Design',        desc: 'Draft protocols and study designs grounded in agency precedent and endpoint libraries.',                     foot: '3 protocols · biostat AnA' },
  { navId: 'cmc',        icon: 'beaker',       title: 'CMC Module',                       desc: 'Chemistry, Manufacturing and Controls — drug substance, drug product, stability, specs.',                   foot: '§3.2.S / §3.2.P · 12 docs' },
  { navId: 'biostat',    icon: 'sigma',        title: 'Biostatistics',                    desc: 'Statistical analysis plans, sample-size calculations, TLFs and interim analyses.',                            foot: '4 SAPs · R / SAS bridge' },
  { navId: 'quality',    icon: 'shieldCheck',  title: 'Quality and Lifecycle',            desc: 'SOPs, CAPA, post-market surveillance, inspection readiness and continuous compliance.',                      foot: '3 CAPAs open · 1 inspection due' },
  { navId: 'reporting',  icon: 'barChart',     title: 'Reports',                          desc: 'Readiness dashboards, timeline forecasts and precedent likelihood modeling.',                                foot: '9 dashboards · RIM v4.2' },

  { navId: 'memory',     icon: 'brain',        title: 'AnA Memory',                       desc: 'Browse what AnA remembers — pinned facts, source traces and how the RIM reasons about your programs.',   foot: '42 recalls · 14 pinned' },
  { navId: 'artifacts',  icon: 'sparkles',     title: 'Documents',                        desc: 'The document workbench. Draft INDs, NDAs, BLAs, MAAs, 510(k)s, CERs, PSURs, briefing books and HAQ responses — AnA-led conversation or structured author mode, against any agency rule pack.',                                foot: 'Authoring · Conversation + Workbench' },
  { navId: 'audit',      icon: 'scroll',       title: 'Audit and Compliance',             desc: '21 CFR Part 11 audit trail, e-signatures, access logs and full change history.',                             foot: 'Part 11 ready · 248k events' },
  { navId: 'admin',      icon: 'settings',     title: 'Admin Settings',                   desc: 'Users and roles, SSO, agency credentials, integrations and billing.',                                        foot: 'Enterprise tier · SOC 2 Type II' },
];

/* ───── Recent activity (mixed stream) ───── */
window.RECENTS = [
  { icon: 'pencil', mod: 'eCTD · §2.5',             ttl: 'Clinical overview — v0.4 autosaved',          pill: { kind: 'info',    label: 'Drafting' },  when: '2 min ago' },
  { icon: 'chat',   mod: 'AnA · Precedent',         ttl: '510(k) predicate search returned 14 hits',    pill: { kind: 'ok',      label: 'Complete' },  when: '18 min ago' },
  { icon: 'file',   mod: 'Submission · NDA 212345', ttl: 'Module 3.2.S ready for review — J. Chen',     pill: { kind: 'warn',    label: 'In review' }, when: '1 hour ago' },
  { icon: 'clip',   mod: 'Tasking',                 ttl: 'R. Ahuja signed off on biostat SAP',          pill: { kind: 'ok',      label: 'Approved' },  when: '3 hours ago' },
  { icon: 'flask',  mod: 'Protocol · BX-204',       ttl: 'Interim analysis plan updated',               pill: { kind: 'neutral', label: 'Draft' },     when: 'yesterday' },
  { icon: 'globe',  mod: 'AnA · Cross-agency',      ttl: 'EMA scientific advice prep — pack ready',     pill: { kind: 'err',     label: '2 gaps' },    when: 'yesterday' },
];

/* ───── Suggestion pills (chat composer) ───── */
window.SUGGESTIONS = [
  { ico: 'file',   label: 'Draft CTD Section 2.5' },
  { ico: 'search', label: 'Find 510(k) predicates' },
  { ico: 'flask',  label: 'Review biostat SAP' },
  { ico: 'clip',   label: 'Submission readiness' },
  { ico: 'globe',  label: 'Cross-agency precedent' },
];
