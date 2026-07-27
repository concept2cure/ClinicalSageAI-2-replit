import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/admin-access.css';

/**
 * Admin and Access — the single product admin for every client type.
 *
 * A ui-v2-native port of Claude Design's canonical admin kit
 * (ui_kits/mdx/surfaces/Admin.jsx): Members · Roles + scopes · SSO +
 * provisioning · API keys · Settings, a KPI row, and an always-visible 21 CFR
 * Part 11 admin-audit band. Reached from the bottom-left account menu
 * ("Admin"), gated to org admins.
 *
 * Live from GET /api/mdx/admin (the read-model wired in mdx-admin.ts:
 * members/roles/apiKeys/audit/settings/sso from real stores). The fixture
 * below is shown ONLY behind the Sample pill when the live shape is
 * unavailable — never presented as real. Governed mutations route through AnA
 * (onAsk) so every change captures a reason and emits a Part 11 audit entry.
 */

interface Kpi { label: string; metric: string; unit?: string; meta: string; tone?: string }
interface Member { id: string; initials: string; name: string; email: string; role: string; groups: string[]; sso: string; mfa: boolean; lastSeen: string; state: string; programs?: string[] }
interface Role { id: string; label: string; members: number; desc: string; scopes: string[] }
interface Grant { user: string; program: string; scope: string; granted: string; expires?: string }
interface Conn { kind: string; provider: string; status?: string; domain: string; users: number; lastSync?: string }
interface Sso { primary: Conn; fallback: Conn; proposed: Conn; scim: { provider: string; enabled: boolean; provisionedAttrs: number; lastEvent: string }; mfaRequired?: boolean; sessionTtl?: string }
interface ApiKey { id: string; name: string; owner: string; scopes: string[]; created: string; lastUsed: string; rotateIn: string }
interface Audit { id: string; when: string; actor: string; action: string; target: string; sha: string }
interface Setting { id: string; label: string; value: string; kind?: string; desc: string }
interface AdminData {
  kpis: Kpi[]; members: Member[]; roles: Role[]; grants: Grant[];
  sso: Sso; apiKeys: ApiKey[]; audit: Audit[]; settings: Setting[];
}

/* Fixture — fail-closed shape shown behind the Sample pill when the live
   /api/mdx/admin is unreachable or shape-mismatched. Never presented as live. */
const FX: AdminData = {
  kpis: [
    { label: 'Members', metric: '—', meta: 'Live from your org directory' },
    { label: 'Open seats', metric: '—', meta: 'Plan vs used' },
    { label: 'SSO coverage', metric: '—', unit: '%', meta: 'Provisioned via SSO', tone: 'ok' },
    { label: 'Admin audit lag', metric: '0', unit: 's', meta: 'Real-time chain', tone: 'ok' },
  ],
  members: [
    { id: 'u-1', initials: 'JC', name: 'Jordan Chen', email: 'jordan@example.io', role: 'Admin', groups: ['Reg Affairs'], sso: 'okta', mfa: true, lastSeen: '2m ago', state: 'active' },
    { id: 'u-2', initials: 'MW', name: 'Marcus Webb', email: 'marcus@example.io', role: 'Editor', groups: ['PMA'], sso: 'okta', mfa: true, lastSeen: '11m ago', state: 'active' },
    { id: 'u-3', initials: 'PB', name: 'Phoebe Brennan', email: 'phoebe@example.io', role: 'Editor', groups: [], sso: 'okta', mfa: false, lastSeen: 'never', state: 'invited' },
  ],
  roles: [
    { id: 'admin', label: 'Admin', members: 1, desc: 'Full org control; cannot edit the audit log.', scopes: ['org:*', 'member:*', 'role:*', 'audit:read'] },
    { id: 'editor', label: 'Editor', members: 2, desc: 'Edit assigned programs, accept AnA drafts.', scopes: ['program:edit', 'artifact:edit', 'ana:accept'] },
    { id: 'reviewer', label: 'Reviewer', members: 0, desc: 'Comment, sign, approve.', scopes: ['program:read', 'artifact:sign'] },
  ],
  grants: [{ user: 'u-1', program: '*', scope: 'edit', granted: 'Org admin' }],
  sso: {
    primary: { kind: 'OIDC', provider: 'Not configured', status: 'disabled', domain: '—', users: 0, lastSync: 'never' },
    fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: '—', users: 0, lastSync: 'real-time' },
    proposed: { kind: 'SAML', provider: 'Not configured', status: 'staging', domain: '—', users: 0, lastSync: 'never' },
    scim: { provider: 'Not configured', enabled: false, provisionedAttrs: 0, lastEvent: '—' },
    mfaRequired: false, sessionTtl: '—',
  },
  apiKeys: [],
  audit: [{ id: 'ADM-0000', when: '—', actor: 'system', action: 'audit.chain', target: 'awaiting live data', sha: '' }],
  settings: [
    { id: 'mfa', label: 'MFA required', value: '—', desc: '21 CFR Part 11 §11.10(d)' },
    { id: 'ttl', label: 'Session timeout', value: '—', desc: 'Idle re-authentication interval' },
    { id: 'branding', label: 'Org branding', value: '—', desc: 'Appears on PDF exports' },
  ],
};

const TABS = [
  { id: 'members', label: 'Members', icon: 'user' },
  { id: 'roles', label: 'Roles + scopes', icon: 'lock' },
  { id: 'sso', label: 'SSO + provisioning', icon: 'shieldCheck' },
  { id: 'apikeys', label: 'API keys', icon: 'key' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Adopt live only when it structurally matches the display contract. */
function mapLive(payload: unknown): AdminData | null {
  if (!payload || typeof payload !== 'object') return null;
  const d = (payload as { data?: unknown }).data ?? payload;
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.members) || !Array.isArray(o.roles)) return null;
  return {
    kpis: Array.isArray(o.kpis) ? (o.kpis as Kpi[]) : FX.kpis,
    members: o.members as Member[],
    roles: o.roles as Role[],
    grants: Array.isArray(o.grants) ? (o.grants as Grant[]) : [],
    sso: (o.sso && typeof o.sso === 'object' ? o.sso : FX.sso) as Sso,
    apiKeys: Array.isArray(o.apiKeys) ? (o.apiKeys as ApiKey[]) : [],
    audit: Array.isArray(o.audit) ? (o.audit as Audit[]) : [],
    settings: Array.isArray(o.settings) ? (o.settings as Setting[]) : [],
  };
}

const MCOLS = '40px 1.4fr 100px 1fr 90px 70px 90px';
const KCOLS = '110px 1fr 1.4fr 90px 90px 110px 70px';

export function AdminAccess({ onAsk }: SurfaceViewProps) {
  const raw = useLive<unknown>('/api/mdx/admin', null);
  const live = useMemo(() => (raw.sample ? null : mapLive(raw.data)), [raw.sample, raw.data]);
  const isLive = live !== null;
  const a: AdminData = live ?? FX;

  const [tab, setTab] = useState<TabId>('members');
  const [selected, setSelected] = useState<string>(a.members[0]?.id ?? '');
  const [roleFilter, setRoleFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  const member = a.members.find((m) => m.id === selected) ?? a.members[0];
  const memberRole = a.roles.find((r) => r.label === member?.role);
  const memberGrants = a.grants.filter((g) => g.user === member?.id);
  const members = a.members.filter(
    (m) => (roleFilter === 'all' || m.role === roleFilter) && (stateFilter === 'all' || m.state === stateFilter),
  );

  const ask = (t: string) => onAsk(t);

  return (
    <div className="adm-access">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Admin and access <SampleTag sample={!isLive} /></h1>
          <div className="page-sub">
            Members · roles · program-level access grants · SSO · API keys · admin audit.
            Every action below emits a 21 CFR Part 11 audit entry.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => ask('Audit a member — every action, signing, and program touched this week. Export as a Part 11 PDF.')}>{I.eye} Audit a member</button>
          <button className="btn primary small" onClick={() => ask('Invite a new member. Confirm name, email, role, group memberships, and which programs they should be granted access to.')}>{I.plus} Invite member</button>
        </div>
      </div>

      <div className="metrics-row">
        {a.kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="adm-tabs">
        {TABS.map((t) => (
          <button key={t.id} className="adm-tab" aria-current={tab === t.id || undefined} onClick={() => setTab(t.id)}>
            <span className="ico">{I[t.icon] ?? I.grid}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="adm-members-layout">
          <section className="section">
            <div className="section-head">
              <h2>Members</h2>
              <div className="seg small">
                {['all', 'active', 'invited', 'disabled'].map((s) => (
                  <button key={s} className="seg-btn" data-on={stateFilter === s || undefined} onClick={() => setStateFilter(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </div>
            {members.length === 0 ? (
              <div className="adm-empty">No members match this filter.</div>
            ) : (
              <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: MCOLS }}>
                  <div /><div>Member</div><div>Role</div><div>Groups</div><div>SSO</div><div>MFA</div><div>Last seen</div>
                </div>
                {members.map((m) => (
                  <button key={m.id} className="ctable-row" data-on={selected === m.id || undefined} style={{ gridTemplateColumns: MCOLS }} onClick={() => setSelected(m.id)}>
                    <div className="adm-avatar">{m.initials}</div>
                    <div><div className="ctable-strong">{m.name}</div><div className="adm-sub">{m.email}</div></div>
                    <div>{m.role === '—' ? <span className="adm-muted">—</span> : <span className={`adm-role-pill adm-role-${m.role.toLowerCase()}`}>{m.role}</span>}</div>
                    <div className="adm-groups">{m.groups.map((g) => <span key={g} className="adm-group mono tiny">{g}</span>)}</div>
                    <div>{m.sso === 'okta' || m.sso === 'sso' ? <span className="adm-sso adm-sso-ok">{I.shieldCheck} sso</span> : <span className="adm-sso adm-sso-local">local</span>}</div>
                    <div>{m.mfa ? <span className="adm-ok">{I.check}</span> : <span className="adm-warn">{I.alertTriangle}</span>}</div>
                    <div className="adm-muted">{m.lastSeen}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {member && (
            <aside className="adm-drawer">
              <div className="adm-drawer-head">
                <div className="adm-drawer-avatar">{member.initials}</div>
                <div><div className="adm-drawer-name">{member.name}</div><div className="adm-drawer-email">{member.email}</div></div>
              </div>
              <div className="drawer-meta">
                <div><div className="k">Role</div><div className="v">{member.role}</div></div>
                <div><div className="k">State</div><div className="v"><span className={`status-pill ${member.state === 'active' ? 'active' : member.state === 'invited' ? 'review' : 'idle'}`}>{member.state}</span></div></div>
                <div><div className="k">SSO</div><div className="v">{member.sso === 'local' ? 'Local' : 'SSO'}</div></div>
                <div><div className="k">MFA</div><div className="v">{member.mfa ? 'Enrolled' : 'Pending'}</div></div>
                <div><div className="k">Last seen</div><div className="v">{member.lastSeen}</div></div>
                <div><div className="k">Groups</div><div className="v adm-groups">{member.groups.length ? member.groups.map((g) => <span key={g} className="adm-group mono tiny">{g}</span>) : '—'}</div></div>
              </div>
              <div className="drawer-section-lbl">Role scopes</div>
              <div className="adm-scopes">{(memberRole?.scopes ?? []).map((s) => <span key={s} className="adm-scope mono tiny">{s}</span>)}</div>
              <div className="drawer-section-lbl">Program access</div>
              {memberGrants.length === 0 && <div className="adm-muted adm-sub">No program-level grants.</div>}
              {memberGrants.map((g, i) => (
                <div key={i} className="adm-grant">
                  <span className="mono small">{g.program === '*' ? 'all programs' : g.program}</span>
                  <span className="adm-grant-scope">{g.scope}</span>
                  <span className="adm-grant-when">{g.expires ? `expires ${g.expires}` : `granted ${g.granted}`}</span>
                </div>
              ))}
              <div className="drawer-actions">
                <button className="btn primary small" onClick={() => ask(`Grant ${member.name} access to a program. Confirm program, scope, and expiry, then emit the Part 11 audit entry.`)}>{I.plus} Grant access</button>
                <button className="btn ghost small" onClick={() => ask(`Show ${member.name}'s last 90 days of activity — every signing and artifact touched. Export as Part 11 PDF.`)}>{I.eye} Audit activity</button>
              </div>
            </aside>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <section className="section">
          <div className="section-head"><h2>Roles + scopes</h2><span className="section-sub">{a.roles.length} roles · {a.roles.reduce((s, r) => s + (r.members || 0), 0)} members assigned</span></div>
          <div className="adm-roles">
            {a.roles.map((r) => (
              <article key={r.id} className="adm-role-card">
                <div className="adm-role-head"><span className={`adm-role-pill adm-role-${r.id}`}>{r.label}</span><span className="adm-role-n mono">{r.members} member{r.members === 1 ? '' : 's'}</span></div>
                <div className="adm-role-desc">{r.desc}</div>
                <div className="adm-role-scopes">{r.scopes.map((s) => <span key={s} className="adm-scope mono tiny">{s}</span>)}</div>
                <div className="adm-role-foot"><button className="btn ghost small" onClick={() => ask(`Edit the ${r.label} role. Show current scopes, propose changes, and confirm impact on the ${r.members} member(s) assigned.`)}>{I.penLine} Edit scopes</button></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'sso' && (
        <div className="adm-sso-grid">
          {([
            { c: a.sso.primary, badge: a.sso.primary.status || 'connected', cls: 'active' },
            { c: a.sso.proposed, badge: 'staging', cls: 'review' },
            { c: a.sso.fallback, badge: a.sso.fallback.status || 'enabled', cls: 'draft' },
          ] as const).map(({ c, badge, cls }, i) => (
            <article key={i} className="adm-conn">
              <div className="adm-conn-head"><span className="adm-conn-kind mono small">{c.kind}</span><span className="adm-conn-name">{c.provider}</span><span className={`status-pill ${cls}`}>{badge}</span></div>
              <div className="adm-conn-meta">
                <div><span className="k">Domain</span><span className="v mono small">{c.domain}</span></div>
                <div><span className="k">Users</span><span className="v">{c.users}</span></div>
                {c.lastSync && <div><span className="k">Last sync</span><span className="v">{c.lastSync}</span></div>}
              </div>
            </article>
          ))}
          <article className="adm-conn adm-scim">
            <div className="adm-conn-head"><span className="adm-conn-kind mono small">SCIM</span><span className="adm-conn-name">{a.sso.scim.provider}</span><span className={`status-pill ${a.sso.scim.enabled ? 'active' : 'idle'}`}>{a.sso.scim.enabled ? 'enabled' : 'disabled'}</span></div>
            <div className="adm-conn-meta">
              <div><span className="k">Attrs synced</span><span className="v">{a.sso.scim.provisionedAttrs}</span></div>
              <div><span className="k">Last event</span><span className="v adm-sub">{a.sso.scim.lastEvent}</span></div>
            </div>
          </article>
        </div>
      )}

      {tab === 'apikeys' && (
        <section className="section">
          <div className="section-head"><h2>API keys</h2><span className="section-sub">{a.apiKeys.length} key{a.apiKeys.length === 1 ? '' : 's'} · scopes are immutable per key</span></div>
          {a.apiKeys.length === 0 ? (
            <div className="adm-empty">No API keys. Create one to let a service authenticate — scopes are fixed at creation and every use is audited.</div>
          ) : (
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: KCOLS }}><div>Key</div><div>Name</div><div>Scopes</div><div>Owner</div><div>Created</div><div>Rotate in</div><div>Last used</div></div>
              {a.apiKeys.map((k) => {
                const overdue = k.rotateIn === 'overdue';
                return (
                  <button key={k.id} className="ctable-row" style={{ gridTemplateColumns: KCOLS }} onClick={() => ask(`Rotate API key ${k.name} (${k.id}). Stage a new key, dual-publish for 24h, deprecate the old key, and confirm the audit entry.`)}>
                    <div className="mono small">{k.id}</div>
                    <div className="ctable-strong">{k.name}</div>
                    <div className="adm-groups">{k.scopes.map((s) => <span key={s} className="adm-scope mono tiny">{s}</span>)}</div>
                    <div>{k.owner}</div>
                    <div className="adm-muted">{k.created}</div>
                    <div className={overdue ? 'adm-overdue' : ''}>{k.rotateIn}</div>
                    <div className="adm-muted">{k.lastUsed}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className="section">
          <div className="section-head"><h2>Org settings</h2><span className="section-sub">Changes here emit Part 11 audit entries</span></div>
          <div className="adm-settings">
            {a.settings.map((s) => (
              <button key={s.id} className="adm-setting" onClick={() => ask(`Change setting "${s.label}". Current value: ${s.value}. Confirm the new value, its impact, and the audit entry.`)}>
                <div><div className="adm-setting-label">{s.label}</div><div className="adm-setting-desc">{s.desc}</div></div>
                <div className="adm-setting-val"><span>{s.value}</span><span className="adm-setting-chev">{I.arrowRight ?? I.right}</span></div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Admin audit · recent</h2><span className="section-sub">SHA-256 chained · cryptographically verifiable · {a.audit.length} action{a.audit.length === 1 ? '' : 's'} shown</span></div>
        <div className="adm-audit">
          {a.audit.map((ev) => (
            <div key={ev.id} className="adm-audit-row">
              <span className="mono small adm-audit-id">{ev.id}</span>
              <span className="adm-audit-when">{ev.when}</span>
              <span className="adm-audit-actor">{ev.actor === 'system' ? <span className="adm-muted">system</span> : ev.actor}</span>
              <span className="mono small adm-audit-action">{ev.action}</span>
              <span className="adm-audit-target">{ev.target}</span>
              <span className="mono tiny adm-audit-sha" title="SHA-256 chain hash">{ev.sha || '—'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
