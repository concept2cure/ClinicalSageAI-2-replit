/**
 * AdminSurface — HYBRID (per PHASE_4_INSTALL.md §1.1).
 *
 * Org members, roles, program-level grants, SSO, API keys, admin audit
 * log, org settings. Tabbed under the page header. The DocumentsPanel
 * (compliance exports) is the secondary zone — Part 11 audit exports,
 * access-snapshot dossiers, SSO configuration snapshots.
 *
 * Cross-program surface. Port basis:
 * design-system/ui_kits/mdx/surfaces/Admin.jsx.
 */

import * as React from 'react';
import { I, type IconKey } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  ADM_API_KEYS,
  ADM_AUDIT,
  ADM_GRANTS,
  ADM_KPIS,
  ADM_MEMBERS,
  ADM_ROLES,
  ADM_SETTINGS,
  ADM_SSO,
} from '../data/admin';
import { ADM_DOC_FRAMEWORKS, ADM_DOCUMENTS } from '../data/admin-docs';
import { useAdmin } from '../hooks/useAdmin';
import type { KitDocFramework, KitDocument } from '../components/DocumentsPanel';

export interface AdminSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

type AdminTab = 'members' | 'roles' | 'sso' | 'apikeys' | 'settings';

const TABS: ReadonlyArray<{ id: AdminTab; label: string; icon: IconKey }> = [
  { id: 'members', label: 'Members', icon: 'users' },
  { id: 'roles', label: 'Roles + scopes', icon: 'shield' },
  { id: 'sso', label: 'SSO + provisioning', icon: 'shieldCheck' },
  { id: 'apikeys', label: 'API keys', icon: 'key' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export function AdminSurface({ onAskAna }: AdminSurfaceProps) {
  const live = useAdmin();
  const kpis = live.kpis ?? ADM_KPIS;
  const members = live.members ?? ADM_MEMBERS;
  const roles = live.roles ?? ADM_ROLES;
  const grants = live.grants ?? ADM_GRANTS;
  const apiKeys = live.apiKeys ?? ADM_API_KEYS;
  const audit = live.audit ?? ADM_AUDIT;
  const settings = live.settings ?? ADM_SETTINGS;
  const sso = live.sso ?? ADM_SSO;
  const documents = ADM_DOCUMENTS as unknown as KitDocument[];
  const frameworks = ADM_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const [tab, setTab] = React.useState<AdminTab>('members');
  const [selectedMember, setSelectedMember] = React.useState<string>(
    members[0]?.id ?? '',
  );
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [stateFilter, setStateFilter] = React.useState<string>('all');

  const member = members.find((m) => m.id === selectedMember);
  const memberRole = roles.find((r) => r.label === member?.role);
  const memberGrants = grants.filter((g) => g.user === selectedMember);

  const memberFiltered = members.filter(
    (m) =>
      (roleFilter === 'all' || m.role === roleFilter) &&
      (stateFilter === 'all' || m.state === stateFilter),
  );

  const docsSigned = documents.filter((d) => d.esigState === 'signed').length;
  const docsInProgress = documents.filter(
    (d) => d.status === 'draft' || d.status === 'review',
  ).length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Admin and access</h1>
          <div className="page-sub">
            Members · roles · program-level access grants · SSO · API keys ·
            admin audit. Every action below emits a 21 CFR Part 11 audit
            entry.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Audit Jordan Chen access this week — every action, every signing, every program touched. Export as a Part 11 PDF.',
              )
            }
            type="button"
          >
            {I.eye} Audit a member
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Invite a new member. Confirm name, email, role, group memberships, and which programs they should be granted access to.',
              )
            }
            type="button"
          >
            {I.plus} Invite member
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <DocumentsPanel
        title="Compliance exports"
        subtitle={`${documents.length} 21 CFR Part 11 artifacts · ${docsSigned} signed · ${docsInProgress} in progress`}
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={(docId) => onAskAna(`Open compliance export ${docId}`)}
        onAskAna={(text) => onAskAna(text)}
      />

      <div className="adm-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="adm-tab"
            aria-current={tab === t.id || undefined}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <span className="ico">{I[t.icon]}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="adm-members-layout">
          <section className="section">
            <div className="section-head">
              <h2>Members</h2>
              <div className="seg small">
                {(['all', 'active', 'invited', 'disabled'] as const).map((s) => (
                  <button
                    key={s}
                    className="seg-btn"
                    data-on={stateFilter === s || undefined}
                    onClick={() => setStateFilter(s)}
                    type="button"
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="seg small" style={{ marginLeft: 8 }}>
                <button
                  className="seg-btn"
                  data-on={roleFilter === 'all' || undefined}
                  onClick={() => setRoleFilter('all')}
                  type="button"
                >
                  Any role
                </button>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    className="seg-btn"
                    data-on={roleFilter === r.label || undefined}
                    onClick={() => setRoleFilter(r.label)}
                    type="button"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ctable">
              <div
                className="ctable-head"
                style={{
                  gridTemplateColumns:
                    '40px 1.4fr 100px 1fr 90px 70px 90px',
                }}
              >
                <div />
                <div>Member</div>
                <div>Role</div>
                <div>Groups</div>
                <div>SSO</div>
                <div>MFA</div>
                <div>Last seen</div>
              </div>
              {memberFiltered.map((m) => (
                <button
                  key={m.id}
                  className="ctable-row adm-member-row"
                  data-on={selectedMember === m.id || undefined}
                  data-state={m.state}
                  style={{
                    gridTemplateColumns:
                      '40px 1.4fr 100px 1fr 90px 70px 90px',
                  }}
                  onClick={() => setSelectedMember(m.id)}
                  type="button"
                >
                  <div className="adm-avatar">{m.initials}</div>
                  <div>
                    <div className="ctable-strong">{m.name}</div>
                    <div style={{ color: 'var(--text-400)', fontSize: 12 }}>
                      {m.email}
                    </div>
                  </div>
                  <div>
                    {m.role === '—' ? (
                      <span style={{ color: 'var(--text-400)' }}>—</span>
                    ) : (
                      <span
                        className={`adm-role-pill adm-role-${m.role.toLowerCase()}`}
                      >
                        {m.role}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.groups.map((g) => (
                      <span key={g} className="adm-group mono tiny">
                        {g}
                      </span>
                    ))}
                  </div>
                  <div>
                    {m.sso === 'okta' ? (
                      <span className="adm-sso adm-sso-ok">
                        {I.shield} okta
                      </span>
                    ) : (
                      <span className="adm-sso adm-sso-local">local</span>
                    )}
                  </div>
                  <div>
                    {m.mfa ? (
                      <span style={{ color: 'var(--success)' }}>{I.check}</span>
                    ) : (
                      <span style={{ color: 'var(--warning)' }}>
                        {I.alertCircle}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      color:
                        m.state === 'active'
                          ? 'var(--text-200)'
                          : 'var(--text-400)',
                    }}
                  >
                    {m.lastSeen}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {member && (
            <aside className="adm-drawer">
              <div className="adm-drawer-head">
                <div className="adm-drawer-avatar">{member.initials}</div>
                <div>
                  <div className="adm-drawer-name">{member.name}</div>
                  <div className="adm-drawer-email">{member.email}</div>
                </div>
              </div>
              <div className="drawer-meta">
                <div>
                  <div className="k">Role</div>
                  <div className="v">
                    <span
                      className={`adm-role-pill adm-role-${member.role.toLowerCase()}`}
                    >
                      {member.role}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="k">State</div>
                  <div className="v">
                    <span
                      className={`status-pill ${
                        member.state === 'active'
                          ? 'active'
                          : member.state === 'invited'
                          ? 'review'
                          : 'idle'
                      }`}
                    >
                      {member.state}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="k">SSO</div>
                  <div className="v">
                    {member.sso === 'okta' ? 'Okta · SAML' : 'Local'}
                  </div>
                </div>
                <div>
                  <div className="k">MFA</div>
                  <div className="v">{member.mfa ? 'Enrolled' : 'Pending'}</div>
                </div>
                <div>
                  <div className="k">Last seen</div>
                  <div className="v">{member.lastSeen}</div>
                </div>
                <div>
                  <div className="k">Groups</div>
                  <div
                    className="v"
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
                  >
                    {member.groups.length === 0
                      ? '—'
                      : member.groups.map((g) => (
                          <span key={g} className="adm-group mono tiny">
                            {g}
                          </span>
                        ))}
                  </div>
                </div>
              </div>

              <div className="drawer-section-lbl">Role scopes</div>
              <div className="adm-scopes">
                {(memberRole?.scopes ?? []).map((s) => (
                  <span key={s} className="adm-scope mono tiny">
                    {s}
                  </span>
                ))}
              </div>

              <div className="drawer-section-lbl">Program access</div>
              {memberGrants.length === 0 && (
                <div style={{ color: 'var(--text-400)', fontSize: 12 }}>
                  No program-level grants.
                </div>
              )}
              {memberGrants.map((g, i) => (
                <div key={i} className="adm-grant">
                  <span className="mono small">
                    {g.program === '*' ? 'all programs' : g.program}
                  </span>
                  <span className="adm-grant-scope">{g.scope}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      color: 'var(--text-400)',
                      fontSize: 12,
                    }}
                  >
                    {g.expires
                      ? `granted ${g.granted} · expires ${g.expires}`
                      : `granted ${g.granted}`}
                  </span>
                </div>
              ))}

              <div className="drawer-actions">
                <button
                  className="btn primary small"
                  onClick={() =>
                    onAskAna(
                      `Grant ${member.name} access to a specific program. Confirm program, scope (read / review-scoped / edit), and any expiry. Emit the Part 11 audit entry.`,
                    )
                  }
                  type="button"
                >
                  {I.plus} Grant access
                </button>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    onAskAna(
                      `Show ${member.name}'s last 90 days of activity — every signing, every artifact touched, every CAPA approved. Export as Part 11 PDF.`,
                    )
                  }
                  type="button"
                >
                  {I.eye} Audit activity
                </button>
              </div>
            </aside>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <section className="section">
          <div className="section-head">
            <h2>Roles + scopes</h2>
            <span className="section-sub">
              {roles.length} roles ·{' '}
              {roles.reduce((s, r) => s + r.members, 0)} members assigned
            </span>
          </div>
          <div className="adm-roles">
            {roles.map((r) => (
              <article key={r.id} className="adm-role-card">
                <div className="adm-role-head">
                  <span className={`adm-role-pill adm-role-${r.id}`}>
                    {r.label}
                  </span>
                  <span className="adm-role-n mono">
                    {r.members} member{r.members === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="adm-role-desc">{r.desc}</div>
                <div className="adm-role-scopes">
                  {r.scopes.map((s) => (
                    <span key={s} className="adm-scope mono tiny">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="adm-role-foot">
                  <button
                    className="btn ghost small"
                    onClick={() =>
                      onAskAna(
                        `Edit the ${r.label} role. Show me current scopes, propose changes, and confirm impact on the ${r.members} member${r.members === 1 ? '' : 's'} currently assigned.`,
                      )
                    }
                    type="button"
                  >
                    {I.pencil} Edit scopes
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'sso' && (
        <div className="adm-sso-grid">
          <article className="adm-conn" data-state="connected">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">{sso.primary.kind}</span>
              <span className="adm-conn-name">{sso.primary.provider}</span>
              <span className="status-pill active">connected</span>
            </div>
            <div className="adm-conn-meta">
              <div>
                <span className="k">Domain</span>
                <span className="v mono small">{sso.primary.domain}</span>
              </div>
              <div>
                <span className="k">Users</span>
                <span className="v">{sso.primary.users}</span>
              </div>
              <div>
                <span className="k">Last sync</span>
                <span className="v">{sso.primary.lastSync}</span>
              </div>
            </div>
            <button
              className="btn ghost small"
              onClick={() =>
                onAskAna(
                  'Rotate the Okta SSO signing certificate. Walk me through the IdP-side change, the SP metadata refresh, and the rollback window.',
                )
              }
              type="button"
            >
              {I.sparkles} Rotate signing cert
            </button>
          </article>
          <article className="adm-conn" data-state="staging">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">
                {sso.proposed.kind}
              </span>
              <span className="adm-conn-name">{sso.proposed.provider}</span>
              <span className="status-pill review">staging</span>
            </div>
            <div className="adm-conn-meta">
              <div>
                <span className="k">Domain</span>
                <span className="v mono small">{sso.proposed.domain}</span>
              </div>
              <div>
                <span className="k">Users</span>
                <span className="v">{sso.proposed.users}</span>
              </div>
              <div>
                <span className="k">Last sync</span>
                <span className="v">{sso.proposed.lastSync}</span>
              </div>
            </div>
            <button
              className="btn ghost small"
              onClick={() =>
                onAskAna(
                  'Promote Microsoft Entra ID from staging to primary IdP. Confirm migration plan, fallback to local, and the cutover audit entries.',
                )
              }
              type="button"
            >
              {I.arrowRight} Promote to primary
            </button>
          </article>
          <article className="adm-conn" data-state="enabled">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">
                {sso.fallback.kind}
              </span>
              <span className="adm-conn-name">{sso.fallback.provider}</span>
              <span className="status-pill draft">enabled</span>
            </div>
            <div className="adm-conn-meta">
              <div>
                <span className="k">Domain</span>
                <span className="v mono small">{sso.fallback.domain}</span>
              </div>
              <div>
                <span className="k">Users</span>
                <span className="v">{sso.fallback.users}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-300)' }}>
              Fallback for accounts not provisioned via SSO. Always on, MFA
              enforced.
            </div>
          </article>
          <article className="adm-conn adm-scim">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">SCIM</span>
              <span className="adm-conn-name">{sso.scim.provider}</span>
              <span className="status-pill active">
                {sso.scim.enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
            <div className="adm-conn-meta">
              <div>
                <span className="k">Attrs synced</span>
                <span className="v">{sso.scim.provisionedAttrs}</span>
              </div>
              <div>
                <span className="k">Last event</span>
                <span
                  className="v"
                  style={{ fontSize: 12, color: 'var(--text-300)' }}
                >
                  {sso.scim.lastEvent}
                </span>
              </div>
            </div>
          </article>
        </div>
      )}

      {tab === 'apikeys' && (
        <section className="section">
          <div className="section-head">
            <h2>API keys</h2>
            <span className="section-sub">
              {apiKeys.length} keys · scopes are immutable per key
            </span>
          </div>
          <div className="ctable">
            <div
              className="ctable-head"
              style={{
                gridTemplateColumns: '110px 1fr 1.4fr 90px 90px 110px 70px',
              }}
            >
              <div>Key</div>
              <div>Name</div>
              <div>Scopes</div>
              <div>Owner</div>
              <div>Created</div>
              <div>Rotate in</div>
              <div>Last used</div>
            </div>
            {apiKeys.map((k) => {
              const owner = members.find((m) => m.id === k.owner);
              const overdue = k.rotateIn === 'overdue';
              return (
                <button
                  key={k.id}
                  className="ctable-row"
                  style={{
                    gridTemplateColumns: '110px 1fr 1.4fr 90px 90px 110px 70px',
                  }}
                  onClick={() =>
                    onAskAna(
                      `Rotate API key ${k.name} (${k.id}). Stage new key, dual-publish for 24h, then deprecate the old key. Confirm audit entry.`,
                    )
                  }
                  type="button"
                >
                  <div className="mono small">{k.id}</div>
                  <div className="ctable-strong">{k.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {k.scopes.map((s) => (
                      <span key={s} className="adm-scope mono tiny">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div>{owner?.initials ?? '—'}</div>
                  <div>{k.created}</div>
                  <div
                    style={{
                      color: overdue ? 'var(--error-text)' : 'var(--text-200)',
                      fontWeight: overdue ? 600 : 400,
                    }}
                  >
                    {k.rotateIn}
                  </div>
                  <div style={{ color: 'var(--text-400)' }}>{k.lastUsed}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'settings' && (
        <section className="section">
          <div className="section-head">
            <h2>Org settings</h2>
            <span className="section-sub">
              Changes here emit Part 11 audit entries
            </span>
          </div>
          <div className="adm-settings">
            {settings.map((s) => (
              <button
                key={s.id}
                className="adm-setting"
                onClick={() =>
                  onAskAna(
                    `Change setting "${s.label}". Current value: ${s.value}. Confirm new value, the impact, and the audit entry.`,
                  )
                }
                type="button"
              >
                <div>
                  <div className="adm-setting-label">{s.label}</div>
                  <div className="adm-setting-desc">{s.desc}</div>
                </div>
                <div className="adm-setting-val">
                  <span>{s.value}</span>
                  <span className="adm-setting-chev">{I.right}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Admin audit · last 24 hours</h2>
          <span className="section-sub">
            SHA-256 chained · cryptographically verifiable · {audit.length}{' '}
            actions shown
          </span>
        </div>
        <div className="adm-audit">
          {audit.map((a) => (
            <div key={a.id} className="adm-audit-row">
              <span className="mono small adm-audit-id">{a.id}</span>
              <span className="adm-audit-when">{a.when}</span>
              <span className="adm-audit-actor">
                {a.actor === 'system' ? (
                  <span style={{ color: 'var(--text-400)' }}>system</span>
                ) : (
                  a.actor
                )}
              </span>
              <span className="mono small adm-audit-action">{a.action}</span>
              <span className="adm-audit-target">{a.target}</span>
              <span
                className="mono tiny adm-audit-sha"
                title="SHA-256 chain hash"
              >
                {a.sha}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
