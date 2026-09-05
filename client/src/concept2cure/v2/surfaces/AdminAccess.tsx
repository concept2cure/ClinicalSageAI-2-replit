import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ceremonyOpen } from '../ceremony';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { C2CToast, useToast } from '../toast';
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
 * Fixture-free by construction (GA real-data standard). The surface renders the
 * org's REAL admin estate from GET /api/mdx/admin — members/roles/grants,
 * api-keys, audit, settings and a truthful SSO/SCIM object, all org-scoped and
 * derived from the real stores (server/routes/mdx-admin.ts) — or an honest
 * loading / empty / error state. There is no inline fixture, no "Sample data"
 * pill, and no fabricated admin data ever presented as live: fabricated member,
 * key or audit rows on an administrative surface are exactly what the GA bar
 * forbids. KPI counts are derived from the real rows. Governed mutations route
 * through AnA (onAsk) so every change captures a reason and emits a Part 11
 * audit entry.
 *
 * ── Why this surface does NOT hide the AnA rail ──────────────────────────────
 * It used to. `admin-console` claimed the rail's column — the flag then spelled
 * `hideAna`, now `ownsConversation` — which stops the shell rendering
 * the rail, while all seven of the hand-offs below still called `onAsk`. That
 * combination is worse here than anywhere else in the product: a
 * governed command comes back from ANA as a `pendingSignoff`, and the §11.50
 * e-signature prompt is drawn BY the rail (V2App `adaptChatMessage` → AnaRail →
 * GovernedActionSignoff). Hiding the rail did not defer the signature gate, it
 * hid it — "Invite member", "Grant access", "Rotate API key" and "Change
 * setting" all appeared to do nothing, and the prompt to sign for them
 * reappeared later on whatever surface the admin opened next, because `ask()`
 * persisted `anaOpen` on its way past.
 *
 * A rail-hiding surface CAN present its own §11.50 gate — `rbm` does, through
 * its study-scoped dock (RbmSurfaces.tsx:276). This surface does not need to:
 * it is an ordinary admin page, not an editor. `.adm-members-layout` is
 * `minmax(0,1fr) 320px` with a single-column fallback at 1100px and
 * `.adm-access { min-width: 0 }`, so it gives the rail's 380px back by
 * shrinking. The rail is where these actions belong, and it is there now.
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
/** Shape of the GET /api/mdx/admin payload (server/routes/mdx-admin.ts). `sso`
 *  is nullable because the route degrades it to null if the stores are missing. */
interface AdminData {
  kpis: Kpi[]; members: Member[]; roles: Role[]; grants: Grant[];
  sso: Sso | null; apiKeys: ApiKey[]; audit: Audit[]; settings: Setting[];
}

const TABS = [
  { id: 'members', label: 'Members', icon: 'user' },
  { id: 'roles', label: 'Roles + scopes', icon: 'lock' },
  { id: 'sso', label: 'SSO + provisioning', icon: 'shieldCheck' },
  { id: 'apikeys', label: 'API keys', icon: 'key' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const MCOLS = '40px 1.4fr 100px 1fr 90px 70px 90px';
// + a trailing Action column for the explicit Revoke control.
const KCOLS = '110px 1fr 1.4fr 90px 90px 110px 70px 90px';

export function AdminAccess({ onAsk }: SurfaceViewProps) {
  /* Fixture-free read: adopt the org's REAL admin estate from GET
     /api/mdx/admin (org-scoped, org-admin gated). A failed fetch (network,
     401/403, 500) is an honest error; a successful load with no members is an
     honest empty — never a codebase fixture, never a "Sample data" pill. */
  const [adminEpoch, setAdminEpoch] = useState(0);
  const { data, loading, error } = useLiveData<AdminData>('/api/mdx/admin', ['/api/mdx/admin', adminEpoch]);

  /* ── "Invite member" opened nothing ───────────────────────────────────────
     The page's primary CTA ran ask('Invite a new member. Confirm name, email,
     role…') — a sentence typed into the AnA panel. No form appeared, no invite
     was created, and no request was made, on the one screen whose job is
     managing who has access.

     POST /api/tenant-users exists, is org-admin gated (authorizeOrgAccess with
     requireAdmin), enforces the seat-licensing gate and audits the create. The
     roster is re-read afterwards so the new member appears because the server
     stored them. */
  const [toast, fireToast] = useToast();
  const [inviting, setInviting] = useState(false);

  /** The key a Revoke click is confirming. Null when no confirmation is open. */
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);

  const revokeKey = async () => {
    const k = revoking;
    setRevoking(null);
    if (!k) return;
    try {
      const res = await apiRequest('DELETE', `/api/api-keys/${encodeURIComponent(k.id)}`);
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        fireToast(
          'Key not revoked — ' + (serverMessage(b) ?? `the server refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      fireToast(`API key "${k.name}" revoked — the revocation is in the audit trail.`);
      setAdminEpoch((n) => n + 1);
    } catch (e) {
      fireToast(
        'Key not revoked — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing changed.',
        'error',
      );
    }
  };

  const REVOKE_FORM: C2CFormConfig = {
    eyebrow: 'API keys · revoke',
    title: revoking ? `Revoke "${revoking.name}"?` : 'Revoke key',
    governed:
      'Revocation is immediate and cannot be undone. Any service authenticating with this key stops working at once. The revocation is recorded in the audit trail against you.',
    submitLabel: 'Revoke key',
    fields: [],
  };

  const INVITE_FORM: C2CFormConfig = {
    eyebrow: 'Admin and access · new member',
    title: 'Invite a member',
    governed:
      'Creating a member consumes a licensed seat and emits a 21 CFR Part 11 audit entry naming you as the actor.',
    submitLabel: 'Send invite',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: true, half: true },
      {
        key: 'role', label: 'Role', type: 'select',
        options: ['member', 'manager', 'admin', 'viewer'],
        required: true, half: true,
      },
      { key: 'title', label: 'Job title', type: 'text', half: true },
      { key: 'department', label: 'Department', type: 'text', half: true },
    ],
  };

  const invite = async (v: Record<string, string>) => {
    setInviting(false);
    try {
      const res = await apiRequest('POST', '/api/tenant-users', {
        name: (v.name || '').trim(),
        email: (v.email || '').trim(),
        role: v.role,
        title: (v.title || '').trim() || undefined,
        department: (v.department || '').trim() || undefined,
        // organizationId is optional on createUserSchema — the route resolves
        // the tenant from the session, so this surface does not need an
        // AuthProvider just to name it. Reading it from useAuth here broke
        // every AdminAccess test, which render the surface standalone.
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        fireToast(
          'Member not invited — ' + (serverMessage(b) ?? `the server refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      // The server says how the invitee gets their setup link. When this
      // deployment has no email delivery, the link comes back once, here, and
      // the admin hands it over — so put it on the clipboard and say so.
      const body = await res.json().catch(() => null);
      const inv = body && typeof body === 'object' ? (body as { invitation?: { delivery?: string; setupUrl?: string } }).invitation : undefined;
      const who = (v.name || '').trim();
      if (inv && inv.delivery === 'failed') {
        fireToast(
          `${who} was added as ${v.role}, but no activation link could be issued — they cannot sign in yet. Ask them to use "Forgot password", or retry the invitation.`,
          'error',
        );
      } else if (inv && inv.delivery === 'link' && inv.setupUrl) {
        let copied = false;
        try {
          await navigator.clipboard?.writeText(inv.setupUrl);
          copied = true;
        } catch {
          copied = false;
        }
        fireToast(
          `${who} invited as ${v.role}. This server sends no email, so ${copied ? 'their password setup link is on your clipboard' : `share this setup link with them: ${inv.setupUrl}`} — it expires in 21 days.`,
        );
      } else {
        fireToast(`${who} invited as ${v.role}. An invitation email with their password setup link was sent.`);
      }
      setAdminEpoch((n) => n + 1);
    } catch (e) {
      fireToast(
        'Member not invited — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was created.',
        'error',
      );
    }
  };

  const [tab, setTab] = useState<TabId>('members');
  const [selected, setSelected] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  // Every list comes straight from the live payload (an empty array until it
  // lands, and on any degraded facet) — no fixture stand-in anywhere.
  const a = data;
  const allMembers = a?.members ?? [];
  const roles = a?.roles ?? [];
  const grants = a?.grants ?? [];
  const apiKeys = a?.apiKeys ?? [];
  const audit = a?.audit ?? [];
  const settings = a?.settings ?? [];
  const sso = a?.sso ?? null;

  const hasData = allMembers.length > 0;
  const ready = !loading && !error && hasData;

  const member = allMembers.find((m) => m.id === selected) ?? allMembers[0];
  const memberRole = roles.find((r) => r.label === member?.role);
  const memberGrants = grants.filter((g) => g.user === member?.id);
  const members = allMembers.filter(
    (m) => (roleFilter === 'all' || m.role === roleFilter) && (stateFilter === 'all' || m.state === stateFilter),
  );

  /* KPI counts derived from the REAL rows only (never hardcoded, never a
     fixture) — '--' until the live payload lands. */
  const activeMembers = allMembers.filter((m) => m.state === 'active').length;
  const mfaMembers = allMembers.filter((m) => m.mfa).length;
  const kpis = [
    { label: 'Members', value: allMembers.length, meta: `${activeMembers} active` },
    { label: 'Roles', value: roles.length, meta: 'Distinct org roles' },
    { label: 'MFA enabled', value: mfaMembers, meta: `of ${allMembers.length} members` },
    { label: 'API keys', value: apiKeys.length, meta: 'active, org-scoped' },
  ];
  const kv = (n: number) => (ready ? String(n) : '--');

  const ask = (t: string) => onAsk(t);

  /* WHAT ANA SEES HERE. Aggregates only: a per-member MFA/SSO list is a target
     list, so who-lacks-MFA is published as a count and never as names. No
     emails, no grants, no role scopes, no key ids/scopes/owners, no audit
     hashes, no SSO domains, no setting values. roleFilter is dead state
     (nothing sets it) and is not published. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'Admin and access is still loading; the KPI counts read "--" and nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The admin read-model could not be read, or this account lacks organization-admin access — a failed read, not an organization with no administrators.',
        availableActions: ['Retry the admin read as an organization admin'],
      };
    }
    if (!hasData) {
      return {
        summary:
          'This organization has no members, roles or keys to administer yet — a real empty, not a failure; they appear here as soon as they exist.',
      };
    }
    const tabLabel = TABS.find((t) => t.id === tab)?.label ?? tab;
    return {
      summary:
        `Admin and access, on the "${tabLabel}" tab: ${allMembers.length} member(s) (${activeMembers} active, ` +
        `${mfaMembers} MFA-enrolled), ${roles.length} role(s), ${apiKeys.length} API key(s), ` +
        `${audit.length} admin audit entry(ies) shown. SSO is ${sso ? 'configured' : 'not reported'}.`,
      facts: {
        tab,
        memberCount: allMembers.length,
        activeMembers,
        mfaMembers,
        roleCount: roles.length,
        apiKeyCount: apiKeys.length,
        auditEntryCount: audit.length,
        ssoConfigured: sso !== null,
        scimEnabled: sso?.scim?.enabled ?? null,
        stateFilter,
        aMemberIsSelected: member != null,
      },
      availableActions: [
        'Inviting a member, granting program access, editing role scopes, revoking an API key and changing org settings each capture a reason and emit a Part 11 audit entry — administrator acts, proposed only in conversation',
        'Switch between the Members, Roles + scopes, SSO + provisioning, API keys and Settings tabs, or filter members by state (all / active / invited / disabled)',
      ],
    };
  }, [loading, error, hasData, tab, allMembers.length, activeMembers, mfaMembers, roles.length, apiKeys.length, audit.length, sso, stateFilter, member]);
  /* View state only. Every mutation this screen offers — invite, grant,
     scope edit, key revoke, setting change — is a governed administrator act
     that routes through the rail's §11.50 sign-off, and none is reachable
     from here. Switching under an open invite/revoke form would discard it. */
  useSurfaceActionHandlers('admin-console', {
    'admin-console.open-tab': (params) => {
      const target = String(params.tab ?? '');
      const meta = TABS.find((t) => t.id === target);
      if (!meta) return { ok: false, reason: `No admin tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${meta.label}` };
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A governed form is open on this screen — switching tabs would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      setTab(target as TabId);
      return { ok: true, detail: `Opened ${meta.label}` };
    },
    'admin-console.filter-members': (params) => {
      const target = String(params.state ?? '');
      if (!['all', 'active', 'invited', 'disabled'].includes(target)) {
        return { ok: false, reason: `No member state named "${params.state}".` };
      }
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A governed form is open on this screen — changing the view would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      const switched = tab !== 'members';
      if (switched) setTab('members');
      setStateFilter(target);
      return {
        ok: true,
        detail:
          `Filtered members to ${target}` + (switched ? ' on the members tab' : '') +
          ' — counts on screen are aggregates; individual records stay on the screen',
      };
    },
  });

  usePublishSurfaceContext('admin-console', anaContext);

  return (
    <div className="adm-access">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Admin and access</h1>
          <div className="page-sub">
            Members · roles · program-level access grants · SSO · API keys · admin audit.
            Every action below emits a 21 CFR Part 11 audit entry.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => ask('Audit a member — every action, signing, and program touched this week. Export as a Part 11 PDF.')}>{I.eye} Audit a member</button>
          {/* Was a chat prompt: the page's primary CTA typed a sentence into
              the AnA panel and no invite form, no invite and no POST happened.
              POST /api/tenant-users exists, is org-admin gated and enforces the
              seat-licensing gate. */}
          <button
            className="btn primary small"
            onClick={() => setInviting(true)}
            data-testid="admin-invite-member"
          >
            {I.plus} Invite member
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {kpis.map((k) => (
          <div key={k.label} className="metric-card">
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{kv(k.value)}</div>
            <div className="metric-meta">{ready ? k.meta : ''}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="adm-empty" style={{ padding: '18px 14px' }}>Loading admin and access…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load admin and access"
          hint="The admin read-model didn't respond, or you don't have organization-admin access. This is your organization's real admin estate — sign in as an org admin and retry, or check the service is reachable."
        />
      ) : !hasData ? (
        <EmptyState
          icon={I.shieldCheck}
          title="No administrative data yet"
          hint={<>This organization has no members, roles or keys to administer yet. Members, API keys, audit entries and SSO configuration appear here as soon as they exist — served org-scoped to this organization.</>}
        />
      ) : (
        <>
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
                    <div><div className="k">SSO</div><div className="v">{member.sso === 'local' || member.sso === '' ? 'Local' : 'SSO'}</div></div>
                    <div><div className="k">MFA</div><div className="v">{member.mfa ? 'Enrolled' : 'Pending'}</div></div>
                    <div><div className="k">Last seen</div><div className="v">{member.lastSeen || '—'}</div></div>
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
              <div className="section-head"><h2>Roles + scopes</h2><span className="section-sub">{roles.length} roles · {roles.reduce((s, r) => s + (r.members || 0), 0)} members assigned</span></div>
              <div className="adm-roles">
                {roles.map((r) => (
                  <article key={r.id} className="adm-role-card">
                    <div className="adm-role-head"><span className={`adm-role-pill adm-role-${r.id}`}>{r.label}</span><span className="adm-role-n mono">{r.members} member{r.members === 1 ? '' : 's'}</span></div>
                    <div className="adm-role-desc">{r.desc || 'Org-level role derived from live membership.'}</div>
                    <div className="adm-role-scopes">{r.scopes.map((s) => <span key={s} className="adm-scope mono tiny">{s}</span>)}</div>
                    <div className="adm-role-foot"><button className="btn ghost small" onClick={() => ask(`Edit the ${r.label} role. Show current scopes, propose changes, and confirm impact on the ${r.members} member(s) assigned.`)}>{I.penLine} Edit scopes</button></div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {tab === 'sso' && sso && (
            <div className="adm-sso-grid">
              {([
                { c: sso.primary, badge: sso.primary.status || 'connected', cls: 'active' },
                { c: sso.proposed, badge: sso.proposed.status || 'staging', cls: 'review' },
                { c: sso.fallback, badge: sso.fallback.status || 'enabled', cls: 'draft' },
              ] as const).map(({ c, badge, cls }, i) => (
                <article key={i} className="adm-conn">
                  <div className="adm-conn-head"><span className="adm-conn-kind mono small">{c.kind}</span><span className="adm-conn-name">{c.provider}</span><span className={`status-pill ${cls}`}>{badge}</span></div>
                  <div className="adm-conn-meta">
                    <div><span className="k">Domain</span><span className="v mono small">{c.domain || '—'}</span></div>
                    <div><span className="k">Users</span><span className="v">{c.users}</span></div>
                    {c.lastSync && <div><span className="k">Last sync</span><span className="v">{c.lastSync}</span></div>}
                  </div>
                </article>
              ))}
              <article className="adm-conn adm-scim">
                <div className="adm-conn-head"><span className="adm-conn-kind mono small">SCIM</span><span className="adm-conn-name">{sso.scim.provider}</span><span className={`status-pill ${sso.scim.enabled ? 'active' : 'idle'}`}>{sso.scim.enabled ? 'enabled' : 'disabled'}</span></div>
                <div className="adm-conn-meta">
                  <div><span className="k">Attrs synced</span><span className="v">{sso.scim.provisionedAttrs}</span></div>
                  <div><span className="k">Last event</span><span className="v adm-sub">{sso.scim.lastEvent || '—'}</span></div>
                </div>
              </article>
            </div>
          )}

          {tab === 'apikeys' && (
            <section className="section">
              <div className="section-head"><h2>API keys</h2><span className="section-sub">{apiKeys.length} key{apiKeys.length === 1 ? '' : 's'} · scopes are immutable per key</span></div>
              {apiKeys.length === 0 ? (
                <div className="adm-empty">No API keys. Create one to let a service authenticate — scopes are fixed at creation and every use is audited.</div>
              ) : (
                <div className="ctable">
                  {/* ── The whole ROW was a button that claimed to rotate the key ──
                      Clicking anywhere on a row ran ask('Rotate API key … Stage a
                      new key, dual-publish for 24h, deprecate the old key…') — a
                      sentence into the AnA panel. No key was staged, rotated or
                      deprecated, and the only affordance on the keys table did
                      nothing.

                      Two things were wrong, and only one of them is "no handler".
                      Rotating a credential is destructive and must be deliberate;
                      a whole table row is the wrong trigger for it at any level of
                      wiring — a stray click should never be able to invalidate a
                      key a live integration is authenticating with.

                      So the row is a row, and the destructive action is its own
                      explicit control. `DELETE /api/api-keys/:id` exists, is
                      tenant-scoped and audits through auditApiKeyEvent
                      ('api_key_revoked'), so REVOKE is wired for real. Rotation —
                      stage, dual-publish, deprecate — has no endpoint and is a
                      three-step ceremony; it is not silently reduced to a revoke
                      here, and the 'Rotate in' column keeps telling the admin when
                      one is due. */}
                  <div className="ctable-head" style={{ gridTemplateColumns: KCOLS }}><div>Key</div><div>Name</div><div>Scopes</div><div>Owner</div><div>Created</div><div>Rotate in</div><div>Last used</div><div>Action</div></div>
                  {apiKeys.map((k) => {
                    const overdue = k.rotateIn === 'overdue';
                    return (
                      <div key={k.id} className="ctable-row" style={{ gridTemplateColumns: KCOLS }}>
                        <div className="mono small">{k.id}</div>
                        <div className="ctable-strong">{k.name}</div>
                        <div className="adm-groups">{k.scopes.map((s) => <span key={s} className="adm-scope mono tiny">{s}</span>)}</div>
                        <div>{k.owner}</div>
                        <div className="adm-muted">{k.created}</div>
                        <div className={overdue ? 'adm-overdue' : ''}>{k.rotateIn || '—'}</div>
                        <div className="adm-muted">{k.lastUsed}</div>
                        <div>
                          <button
                            className="btn ghost small"
                            onClick={() => setRevoking(k)}
                            title={`Revoke ${k.name} — any service using this key stops authenticating immediately`}
                            data-testid="apikey-revoke"
                          >
                            {I.x || I.trash} Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {tab === 'settings' && (
            <section className="section">
              <div className="section-head"><h2>Org settings</h2><span className="section-sub">Changes here emit Part 11 audit entries</span></div>
              {settings.length === 0 ? (
                <div className="adm-empty">No org settings configured yet.</div>
              ) : (
                <div className="adm-settings">
                  {settings.map((s) => (
                    <button key={s.id} className="adm-setting" onClick={() => ask(`Change setting "${s.label}". Current value: ${s.value}. Confirm the new value, its impact, and the audit entry.`)}>
                      <div><div className="adm-setting-label">{s.label}</div><div className="adm-setting-desc">{s.desc}</div></div>
                      <div className="adm-setting-val"><span>{s.value}</span><span className="adm-setting-chev">{I.arrowRight ?? I.right}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="section">
            <div className="section-head"><h2>Admin audit · recent</h2><span className="section-sub">SHA-256 chained · cryptographically verifiable · {audit.length} action{audit.length === 1 ? '' : 's'} shown</span></div>
            {audit.length === 0 ? (
              <div className="adm-empty">No admin audit entries yet. Governed actions appear here, SHA-256 chained.</div>
            ) : (
              <div className="adm-audit">
                {audit.map((ev) => (
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
            )}
          </section>
        </>
      )}

      {inviting && (
        <C2CForm
          config={INVITE_FORM}
          onCancel={() => setInviting(false)}
          onSubmit={invite}
        />
      )}
      {revoking && (
        <C2CForm
          config={REVOKE_FORM}
          onCancel={() => setRevoking(null)}
          onSubmit={() => void revokeKey()}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
