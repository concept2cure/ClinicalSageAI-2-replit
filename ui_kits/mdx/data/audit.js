/**
 * Full audit log — Phase 5
 *
 * Tamper-proof SHA-256-chained audit of every action on the platform.
 * 21 CFR Part 11 §11.10(e) requires this for any regulated mutation.
 *
 * Wire shape: GET /api/mdx/audit?from=&to=&actor=&action=&resource=
 */

(() => {

const AUDIT_KPIS = [
  { label: 'Events today',   metric: '342',  meta: '218 reads · 87 writes · 37 signings' },
  { label: 'Signings today', metric: '37',   meta: 'Part 11 e-signature events' },
  { label: 'Chain integrity',metric: '100',  unit: '%', meta: 'Last verified 2m ago · 0 breaks across 1.2M entries', tone: 'ok' },
  { label: 'Retention',      metric: '7',    unit: 'y', meta: 'Minimum per 21 CFR Part 11 §11.10(c)' },
];

const AUDIT_ACTIONS = [
  { id: 'create',     label: 'Create' },
  { id: 'update',     label: 'Update' },
  { id: 'sign',       label: 'Sign' },
  { id: 'approve',    label: 'Approve' },
  { id: 'export',     label: 'Export' },
  { id: 'grant',      label: 'Grant' },
  { id: 'revoke',     label: 'Revoke' },
  { id: 'transmit',   label: 'Transmit' },
];

const AUDIT_RESOURCES = [
  { id: 'submission', label: 'Submission' },
  { id: 'artifact',   label: 'Artifact' },
  { id: 'capa',       label: 'CAPA' },
  { id: 'mdr',        label: 'MDR' },
  { id: 'member',     label: 'Member' },
  { id: 'role',       label: 'Role' },
  { id: 'grant',      label: 'Grant' },
  { id: 'memory',     label: 'Memory atom' },
];

const AUDIT_EVENTS = [
  { id: 'A-9924812', when: '2m ago',  actor: 'u-jc',    actorName: 'Jordan Chen',   role: 'admin',  action: 'sign',     resource: 'artifact',   target: 'IFU-BX204-EN-v2.7',         resourceId: 'f4',           reason: 'Final release for FDA transmittal',     sha: '8c3f2d11a8e1ccd2', prev: '710a334987d2', chain: 'ok' },
  { id: 'A-9924811', when: '14m ago', actor: 'u-jc',    actorName: 'Jordan Chen',   role: 'admin',  action: 'grant',    resource: 'grant',      target: 'u-pb · Editor (Reg Affairs)',resourceId: 'g-2391',       reason: 'Onboarding — new RA hire',              sha: 'f0419a37710a3349', prev: '12bc66e85f7c', chain: 'ok' },
  { id: 'A-9924810', when: '1h ago',  actor: 'system',  actorName: 'system',         role: 'system', action: 'export',   resource: 'submission', target: 'Weekly audit-log export · W19',resourceId: 'rpt-audit-w19',reason: 'Scheduled · auto-sealed',                sha: '12bc66e85f7c0091', prev: 'a8e1ccd24e92', chain: 'ok' },
  { id: 'A-9924809', when: '2h ago',  actor: 'u-ak',    actorName: 'Aaron Kim',     role: 'editor', action: 'update',   resource: 'artifact',   target: 'RMF-BX204-residual-v3.1',   resourceId: 'f2',           reason: 'R-061 verification evidence attached', sha: 'a8e1ccd24e927720', prev: '4e927720d6f1', chain: 'ok' },
  { id: 'A-9924808', when: '3h ago',  actor: 'u-jc',    actorName: 'Jordan Chen',   role: 'admin',  action: 'approve',  resource: 'capa',       target: 'CAPA-0215 (OR-801 stripping)',resourceId:'CAPA-0215',     reason: 'Effectiveness verification passed',     sha: '4e927720d6f12233', prev: 'd6f1223345e9', chain: 'ok' },
  { id: 'A-9924807', when: '4h ago',  actor: 'u-jc',    actorName: 'Jordan Chen',   role: 'admin',  action: 'transmit', resource: 'submission', target: 'BX-204 510(k) eSTAR · FDA ESG',resourceId:'sub-k510-bx204', reason: 'Cleared all gates · Tuesday transmittal',sha: 'd6f1223345e927ab', prev: '45e927abf041', chain: 'ok' },
  { id: 'A-9924806', when: '5h ago',  actor: 'u-mw',    actorName: 'Marcus Webb',   role: 'editor', action: 'create',   resource: 'mdr',        target: 'MDR-0091 · CV-330 5-day',   resourceId: 'MDR-0091',     reason: '5-day clock opened — battery EOL alarm',sha: '45e927abf0419a37', prev: 'ccd2710a8c3f', chain: 'ok' },
  { id: 'A-9924805', when: '6h ago',  actor: 'u-jc',    actorName: 'Jordan Chen',   role: 'admin',  action: 'sign',     resource: 'capa',       target: 'CAPA-0214 close-out',       resourceId: 'CAPA-0214',    reason: 'Effectiveness check passed',            sha: 'ccd2710a8c3f2d11', prev: '8c3f2d11d6f1', chain: 'ok' },
  { id: 'A-9924804', when: '8h ago',  actor: 'u-ak',    actorName: 'Aaron Kim',     role: 'editor', action: 'update',   resource: 'memory',     target: 'm-2849 cybersec SBOM rule',resourceId: 'm-2849',       reason: 'Updated after FDA cyber guidance 2023', sha: '8c3f2d11d6f12233', prev: 'a8e1ccd28c3f', chain: 'ok' },
  { id: 'A-9924803', when: '11h ago', actor: 'system',  actorName: 'system',         role: 'system', action: 'export',   resource: 'submission', target: 'Q2 cycle-time brief auto-draft',resourceId:'rpt-cycle-q2', reason: 'Scheduled · auto-sealed',                sha: 'a8e1ccd28c3f2d11', prev: '5f7c0091a8e1', chain: 'ok' },
  { id: 'A-9924802', when: '1d ago',  actor: 'u-ps',    actorName: 'Priya Shah',    role: 'editor', action: 'sign',     resource: 'artifact',   target: 'Software SRS — BX-204 4.1', resourceId: 'doc-srs-sw',   reason: 'Peer review complete',                  sha: '5f7c0091a8e1ccd2', prev: '710a3349f041', chain: 'ok' },
  { id: 'A-9924801', when: '1d ago',  actor: 'u-am',    actorName: 'Ana Müller',    role: 'editor', action: 'update',   resource: 'artifact',   target: 'PSUR-BX204-2025',           resourceId: 'doc-psur-bx204-2025',reason:'Literature update Q2',             sha: '710a3349f0419a37', prev: '8c3f2d1145e9', chain: 'ok' },
];

window.AUDIT_KPIS = AUDIT_KPIS;
window.AUDIT_ACTIONS = AUDIT_ACTIONS;
window.AUDIT_RESOURCES = AUDIT_RESOURCES;
window.AUDIT_EVENTS = AUDIT_EVENTS;

})();
