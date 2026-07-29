/**
 * Documents the Analytics surface produces.
 *
 * Analytics is a read-only surface, so the documents are scheduled exports
 * (portfolio readiness reports, quarterly performance briefs) and
 * on-demand dossiers (reviewer-velocity comparison for a product code,
 * blocker-cluster postmortems).
 *
 * Wire shape: GET /api/mdx/analytics/reports
 */

export const ANL_DOC_FRAMEWORKS = [
  { id: 'portfolio', label: 'Portfolio',    desc: 'Cross-program rollups' },
  { id: 'pathway',   label: 'Pathway',      desc: '510(k) / PMA / CER specific' },
  { id: 'reviewer',  label: 'Reviewer',     desc: 'FDA cohort comparisons' },
];

export const ANL_DOCUMENTS = [
  {
    id: 'rpt-portfolio-q2-2026', framework: 'portfolio',
    type: 'Portfolio readiness report',
    title: 'Q2 2026 portfolio readiness — board review',
    ver: 'v1.3', status: 'ready', completion: 100, blocker: false,
    owner: 'JC', reviewers: ['MW', 'AM'], lastEdit: '4d ago',
    esigRequired: false, esigState: 'na',
    sections: 8, sectionsComplete: 8,
    editor: 'report-portfolio',
    schedule: 'quarterly',
  },
  {
    id: 'rpt-portfolio-q3-2026', framework: 'portfolio',
    type: 'Portfolio readiness report',
    title: 'Q3 2026 portfolio readiness (auto-drafting)',
    ver: 'v0.4', status: 'draft', completion: 42, blocker: false,
    owner: 'system', reviewers: ['JC'], lastEdit: '1h ago',
    esigRequired: false, esigState: 'na',
    sections: 8, sectionsComplete: 3,
    editor: 'report-portfolio',
    schedule: 'quarterly',
  },
  {
    id: 'rpt-cycle-510k-2026', framework: 'pathway',
    type: 'Cycle-time brief',
    title: '510(k) cycle-time brief — 2026 cohort',
    ver: 'v1.0', status: 'review', completion: 88, blocker: false,
    owner: 'JC', reviewers: ['MW'], lastEdit: '2d ago',
    esigRequired: false, esigState: 'na',
    sections: 5, sectionsComplete: 5,
    editor: 'report-cycle',
  },
  {
    id: 'rpt-velocity-nbw', framework: 'reviewer',
    type: 'Reviewer-velocity dossier',
    title: 'NBW (glucose monitor) — FDA cohort velocity vs ours',
    ver: 'v2.1', status: 'ready', completion: 100, blocker: false,
    owner: 'JC', reviewers: ['MW'], lastEdit: '6d ago',
    esigRequired: false, esigState: 'na',
    sections: 4, sectionsComplete: 4,
    editor: 'report-velocity',
  },
  {
    id: 'rpt-velocity-dqk', framework: 'reviewer',
    type: 'Reviewer-velocity dossier',
    title: 'DQK (implantable cardiac monitor) — cohort velocity vs ours',
    ver: 'v1.6', status: 'review', completion: 92, blocker: false,
    owner: 'MW', reviewers: ['JC'], lastEdit: '14h ago',
    esigRequired: false, esigState: 'na',
    sections: 4, sectionsComplete: 4,
    editor: 'report-velocity',
  },
  {
    id: 'rpt-blockers-q2-2026', framework: 'portfolio',
    type: 'Blocker root-cause postmortem',
    title: 'Q2 2026 blocker postmortem — 8 root-cause clusters',
    ver: 'v0.7', status: 'draft', completion: 64, blocker: false,
    owner: 'JC', reviewers: [], lastEdit: '3d ago',
    esigRequired: false, esigState: 'na',
    sections: 8, sectionsComplete: 5,
    editor: 'report-blockers',
  },
];

