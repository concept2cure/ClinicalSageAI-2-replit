/**
 * Documents the Admin surface produces.
 *
 * Admin is mostly a control plane, but it generates 21 CFR Part 11
 * compliance artifacts: audit-log exports (signed PDFs with SHA-256
 * chain manifest), member-access reports (who-touched-what-when over
 * a date range), e-signature manifests (every signature on the
 * platform with reason + identity-challenge proof), SSO config
 * snapshots, and access-grant history rollups for regulators.
 *
 * Wire shape: GET /api/mdx/admin/documents
 */

(() => {

const ADM_DOC_FRAMEWORKS = [
  { id: 'part-11', label: '21 CFR Part 11', desc: 'E-records / e-signatures' },
  { id: 'access',  label: 'Access',         desc: 'Roles, grants, history' },
  { id: 'sso',     label: 'SSO + SCIM',     desc: 'Identity provisioning' },
];

const ADM_DOCUMENTS = [
  {
    id: 'rpt-audit-2026-05-w2', framework: 'part-11',
    type: 'Audit-log export — weekly',
    title: 'Admin audit · 2026-W19 — SHA-256 chain manifest',
    ver: 'v1.0', status: 'ready', completion: 100, blocker: false,
    owner: 'system', reviewers: ['JC'], lastEdit: '14m ago',
    esigRequired: true, esigState: 'signed', signedBy: 'system · auto-sealed',
    sections: 1, sectionsComplete: 1,
    editor: 'audit-export',
    schedule: 'weekly',
  },
  {
    id: 'rpt-audit-2026-05-w1', framework: 'part-11',
    type: 'Audit-log export — weekly',
    title: 'Admin audit · 2026-W18 — SHA-256 chain manifest',
    ver: 'v1.0', status: 'locked', completion: 100, blocker: false,
    owner: 'system', reviewers: ['JC'], lastEdit: '7d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'system · auto-sealed',
    sections: 1, sectionsComplete: 1,
    editor: 'audit-export',
    schedule: 'weekly',
  },
  {
    id: 'rpt-esig-manifest-q2', framework: 'part-11',
    type: 'E-signature manifest',
    title: 'Q2 2026 e-signature manifest — every signing event',
    ver: 'v0.6', status: 'draft', completion: 78, blocker: false,
    owner: 'system', reviewers: ['JC'], lastEdit: '2h ago',
    esigRequired: false, esigState: 'na',
    sections: 1, sectionsComplete: 1,
    editor: 'esig-manifest',
    schedule: 'quarterly',
  },
  {
    id: 'rpt-access-jc-90d', framework: 'access',
    type: 'Member access report',
    title: 'Jordan Chen — last 90d actions for Part 11 inspection',
    ver: 'v1.0', status: 'ready', completion: 100, blocker: false,
    owner: 'JC', reviewers: [], lastEdit: '11m ago',
    esigRequired: true, esigState: 'signed', signedBy: 'JC · just now',
    sections: 1, sectionsComplete: 1,
    editor: 'access-report',
  },
  {
    id: 'rpt-grants-2026', framework: 'access',
    type: 'Access grants ledger',
    title: '2026 program-access grants — change history + active state',
    ver: 'v2.0', status: 'review', completion: 96, blocker: false,
    owner: 'JC', reviewers: ['MW'], lastEdit: '1d ago',
    esigRequired: true, esigState: 'pending',
    sections: 1, sectionsComplete: 1,
    editor: 'access-report',
  },
  {
    id: 'rpt-sso-snapshot', framework: 'sso',
    type: 'SSO configuration snapshot',
    title: 'Okta + Entra ID configuration · signed snapshot',
    ver: 'v1.4', status: 'locked', completion: 100, blocker: false,
    owner: 'JC', reviewers: [], lastEdit: '4d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'JC · 2026-05-10',
    sections: 1, sectionsComplete: 1,
    editor: 'sso-snapshot',
  },
];

window.ADM_DOC_FRAMEWORKS = ADM_DOC_FRAMEWORKS;
window.ADM_DOCUMENTS = ADM_DOCUMENTS;

})();
