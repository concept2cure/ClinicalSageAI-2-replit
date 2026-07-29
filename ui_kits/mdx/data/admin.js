(() => {
/**
 * Admin and access data — org members, roles, program-level access grants,
 * SSO/SAML/OIDC, API keys, admin audit log, org settings.
 *
 * 21 CFR Part 11 demands every admin action be auditable. Every mutation
 * on this surface emits an entry into the admin audit log.
 */

const ADM_KPIS = [
  { label: 'Members',           metric: '47', meta: '43 active · 2 invited · 2 disabled' },
  { label: 'Open seats',        metric: '13', meta: '60 plan · 47 used' },
  { label: 'SSO coverage',      metric: '94', unit: '%', meta: '44 of 47 — 3 fallback to local', tone: 'ok' },
  { label: 'Admin audit lag',   metric: '0',  unit: 's', meta: 'Real-time chain · last verified 2m ago', tone: 'ok' },
];

/* Members — last seen, MFA, SSO provider, role, group memberships. */
const ADM_MEMBERS = [
  { id: 'u-jc', initials: 'JC', name: 'Jordan Chen',     email: 'jordan@c2c.io',     role: 'Admin',        groups: ['Reg Affairs','MDX leads'], sso: 'okta', mfa: true,  lastSeen: '2m ago',   state: 'active', programs: ['*'] },
  { id: 'u-mw', initials: 'MW', name: 'Marcus Webb',     email: 'marcus@c2c.io',     role: 'Editor',       groups: ['Reg Affairs','PMA'],       sso: 'okta', mfa: true,  lastSeen: '11m ago',  state: 'active', programs: ['cv330','nm512','cv410'] },
  { id: 'u-ps', initials: 'PS', name: 'Priya Shah',      email: 'priya@c2c.io',      role: 'Editor',       groups: ['Quality','IVD'],            sso: 'okta', mfa: true,  lastSeen: '34m ago',  state: 'active', programs: ['dx102','dx221'] },
  { id: 'u-am', initials: 'AM', name: 'Ana Müller',      email: 'ana@c2c.io',        role: 'Editor',       groups: ['CER','EU MDR'],             sso: 'okta', mfa: true,  lastSeen: '1h ago',   state: 'active', programs: ['iv415','iv208','pm660'] },
  { id: 'u-ak', initials: 'AK', name: 'Aaron Kim',       email: 'aaron@c2c.io',      role: 'Editor',       groups: ['Engineering'],              sso: 'okta', mfa: true,  lastSeen: '2h ago',   state: 'active', programs: ['bx204','cv330','nm512'] },
  { id: 'u-rn', initials: 'RN', name: 'Ravi Nair',       email: 'ravi@c2c.io',       role: 'Editor',       groups: ['Engineering','PMA'],        sso: 'okta', mfa: true,  lastSeen: '4h ago',   state: 'active', programs: ['nm512','pm660'] },
  { id: 'u-sm', initials: 'SM', name: 'Sofia Marchetti', email: 'sofia@c2c.io',      role: 'Editor',       groups: ['Reg Affairs','510(k)'],     sso: 'okta', mfa: true,  lastSeen: '14m ago',  state: 'active', programs: ['or801','or902','cv410'] },
  { id: 'u-lt', initials: 'LT', name: 'Linh Tran',       email: 'linh@c2c.io',       role: 'Reviewer',     groups: ['Quality'],                  sso: 'okta', mfa: true,  lastSeen: '1d ago',   state: 'active', programs: ['or801','rx340','dx102'] },
  { id: 'u-ra', initials: 'RA', name: 'Rohan Ali',       email: 'rohan@c2c.io',      role: 'Reviewer',     groups: ['Biostat'],                  sso: 'okta', mfa: true,  lastSeen: '3d ago',   state: 'active', programs: ['bx204','iv208'] },
  { id: 'u-eb', initials: 'EB', name: 'Elena Bauer',     email: 'elena@c2c.io',      role: 'Viewer',       groups: ['Legal'],                    sso: 'okta', mfa: true,  lastSeen: '11d ago',  state: 'active', programs: ['*'] },
  { id: 'u-ct', initials: 'CT', name: 'Camille Tan',     email: 'camille@cro-7.com', role: 'External',     groups: ['CV-330 DSMB'],              sso: 'local',mfa: true,  lastSeen: '6h ago',   state: 'active', programs: ['cv330'] },
  { id: 'u-pb', initials: 'PB', name: 'Phoebe Brennan',  email: 'phoebe@c2c.io',     role: 'Editor',       groups: ['Reg Affairs'],              sso: 'okta', mfa: false, lastSeen: 'never',    state: 'invited', programs: [] },
  { id: 'u-od', initials: 'OD', name: 'Oscar Dwight',    email: 'oscar@c2c.io',      role: '—',            groups: [],                            sso: 'okta', mfa: false, lastSeen: '94d ago',  state: 'disabled',programs: [] },
];

/* Roles — what each role can do. Read by the role builder. */
const ADM_ROLES = [
  { id: 'admin',    label: 'Admin',    members: 1,  desc: 'Full org control. Audit-only actions: cannot directly edit audit log.', scopes: ['org:*','program:*','member:*','role:*','sso:*','api:*','audit:read'] },
  { id: 'editor',   label: 'Editor',   members: 7,  desc: 'Edit assigned programs, accept AnA drafts, request e-signatures.',     scopes: ['program:edit','artifact:edit','ana:accept','submission:draft'] },
  { id: 'reviewer', label: 'Reviewer', members: 2,  desc: 'Comment, sign, approve. Cannot edit drafts directly.',                  scopes: ['program:read','artifact:comment','artifact:sign','submission:read'] },
  { id: 'viewer',   label: 'Viewer',   members: 1,  desc: 'Read-only across granted programs.',                                    scopes: ['program:read','artifact:read'] },
  { id: 'external', label: 'External', members: 1,  desc: 'Scoped to specific programs/sections, time-bound access.',              scopes: ['program:read:scoped','artifact:comment:scoped'] },
];

/* Program-level grants — who has access to which device's submission. */
const ADM_GRANTS = [
  { user: 'u-jc', program: '*',     scope: 'edit', granted: 'Org admin' },
  { user: 'u-mw', program: 'cv330', scope: 'edit', granted: '2026-01-08' },
  { user: 'u-mw', program: 'nm512', scope: 'edit', granted: '2026-01-08' },
  { user: 'u-mw', program: 'cv410', scope: 'edit', granted: '2026-03-22' },
  { user: 'u-ps', program: 'dx102', scope: 'edit', granted: '2026-01-08' },
  { user: 'u-am', program: 'iv415', scope: 'edit', granted: '2026-01-08' },
  { user: 'u-ct', program: 'cv330', scope: 'review-scoped', granted: '2026-02-11', expires: '2026-08-11' },
  { user: 'u-eb', program: '*',     scope: 'read',  granted: '2026-01-08' },
];

/* SSO config — providers and connections. */
const ADM_SSO = {
  primary:      { kind: 'OIDC',  provider: 'Okta',         status: 'connected',     domain: 'c2c.okta.com',     users: 44, lastSync: '2m ago' },
  fallback:     { kind: 'Local', provider: 'Local users',  status: 'enabled',       domain: 'c2c.io',           users: 3,  lastSync: 'real-time' },
  proposed:     { kind: 'SAML',  provider: 'Microsoft Entra ID', status: 'staging', domain: 'concept2cure.onmicrosoft.com', users: 0, lastSync: 'never' },
  scim:         { provider: 'Okta SCIM 2.0', enabled: true, provisionedAttrs: 18, lastEvent: '2m ago — created u-pb' },
  mfaRequired:  true,
  sessionTtl:   '8h',
};

/* API keys + integrations — for the FDA ESG bridge, internal services, etc. */
const ADM_API_KEYS = [
  { id: 'key-7c',  name: 'esg-bridge prod',  owner: 'u-jc', scopes: ['submission:transmit','audit:write'], created: '2026-01-12', lastUsed: '4h ago', rotateIn: '24d' },
  { id: 'key-7b',  name: 'eudamed-sync prod',owner: 'u-am', scopes: ['udi:read','udi:write'],              created: '2026-02-03', lastUsed: '11h ago',rotateIn: '46d' },
  { id: 'key-7a',  name: 'vault-archiver',   owner: 'u-jc', scopes: ['vault:export'],                       created: '2025-11-22', lastUsed: '2d ago', rotateIn: 'overdue' },
  { id: 'key-69',  name: 'pubmed-ingest',    owner: 'u-am', scopes: ['memory:write'],                       created: '2025-09-14', lastUsed: '1d ago', rotateIn: '79d' },
];

/* Admin audit — admin-action subset of the full audit log. SHA-256 chained. */
const ADM_AUDIT = [
  { id: 'ADM-3214', when: '2m ago',  actor: 'u-jc', action: 'role.grant',     target: 'u-pb · Editor (Reg Affairs)',           sha: '8c3f…2d11' },
  { id: 'ADM-3213', when: '14m ago', actor: 'u-jc', action: 'grant.scoped',   target: 'u-ct → CV-330 (review-scoped, exp 2026-08-11)', sha: 'f041…9a37' },
  { id: 'ADM-3212', when: '1h ago',  actor: 'system',action:'sso.sync',       target: 'Okta SCIM · 1 created · 0 updated',     sha: '12bc…66e8' },
  { id: 'ADM-3211', when: '4h ago',  actor: 'u-jc', action: 'api.rotate',     target: 'key-7c — esg-bridge prod',               sha: 'a8e1…ccd2' },
  { id: 'ADM-3210', when: '11h ago', actor: 'u-jc', action: 'member.disable', target: 'u-od · Oscar Dwight',                   sha: '4e92…7720' },
  { id: 'ADM-3208', when: '2d ago',  actor: 'u-jc', action: 'role.update',    target: 'Reviewer scopes — added artifact:sign', sha: '710a…3349' },
  { id: 'ADM-3204', when: '4d ago',  actor: 'u-jc', action: 'org.setting',    target: 'session-ttl 12h → 8h',                  sha: '5f7c…0091' },
];

/* Org-wide settings — small switchboard for things that don't fit elsewhere. */
const ADM_SETTINGS = [
  { id: 'session-ttl',    label: 'Session timeout',           value: '8 hours',                kind: 'duration',       desc: 'Idle re-authentication interval' },
  { id: 'mfa-required',   label: 'MFA required',              value: 'Yes (all roles)',        kind: 'toggle',         desc: '21 CFR Part 11 §11.10(d) compliance' },
  { id: 'esig-rechallenge', label: 'E-sign re-challenge',    value: 'Password + TOTP',         kind: 'esig',           desc: 'Per signing action — never persistent' },
  { id: 'retention',      label: 'Audit retention',           value: '7 years',                 kind: 'duration',       desc: '21 CFR Part 11 minimum, 6 years post-clearance' },
  { id: 'branding',       label: 'Org branding',              value: 'Concept2Cure, Inc.',      kind: 'text',           desc: 'Appears on PDF exports + cover letters' },
  { id: 'regulatory',     label: 'Default regulatory bodies', value: 'FDA · EU MDR · PMDA · MHRA', kind: 'list',         desc: 'Pre-selected in submission flows' },
  { id: 'export-policy',  label: 'Vault export policy',       value: 'Approved + signed only',  kind: 'select',         desc: 'Restricts download to artifacts in those states' },
];


// Window globals (kit harness only — codebase uses ESM imports)
window.ADM_KPIS = ADM_KPIS;
window.ADM_MEMBERS = ADM_MEMBERS;
window.ADM_ROLES = ADM_ROLES;
window.ADM_GRANTS = ADM_GRANTS;
window.ADM_SSO = ADM_SSO;
window.ADM_API_KEYS = ADM_API_KEYS;
window.ADM_AUDIT = ADM_AUDIT;
window.ADM_SETTINGS = ADM_SETTINGS;

})();
