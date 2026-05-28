(() => {
/**
 * Admin and access surface — org members, roles, program-level grants,
 * SSO, API keys, admin audit log, org settings.
 *
 * Layout — tabbed under the page header:
 *   • Members tab (default) — table, with detail drawer on selection
 *   • Roles tab — role builder with scope chips
 *   • SSO + provisioning tab — Okta primary, Entra ID staging, SCIM
 *   • API keys tab
 *   • Settings tab
 *   • Admin audit — always-visible band along the bottom (Part 11)
 */

const { I, AskAnaChip, DocumentsPanel } = window;
const { ADM_KPIS, ADM_MEMBERS, ADM_ROLES, ADM_GRANTS, ADM_SSO, ADM_API_KEYS, ADM_AUDIT, ADM_SETTINGS } = window;
const { ADM_DOCUMENTS, ADM_DOC_FRAMEWORKS } = window;

const TABS = [
  { id: 'members',  label: 'Members',          icon: 'users' },
  { id: 'roles',    label: 'Roles + scopes',   icon: 'shield' },
  { id: 'sso',      label: 'SSO + provisioning',icon: 'shieldCheck' },
  { id: 'apikeys',  label: 'API keys',         icon: 'key' },
  { id: 'settings', label: 'Settings',         icon: 'sliders' },
];

function AdminSurface({ onAskAna }) {
  const [tab, setTab] = React.useState('members');
  const [selectedMember, setSelectedMember] = React.useState(ADM_MEMBERS[0].id);
  const [roleFilter, setRoleFilter] = React.useState('all');
  const [stateFilter, setStateFilter] = React.useState('all');

  const member = ADM_MEMBERS.find(m => m.id === selectedMember);
  const memberRole = ADM_ROLES.find(r => r.label === member?.role);
  const memberGrants = ADM_GRANTS.filter(g => g.user === selectedMember);
  const memberAudit = ADM_AUDIT.filter(a => a.target.includes(member?.name || '____'));

  const memberFiltered = ADM_MEMBERS.filter(m =>
    (roleFilter === 'all' || m.role === roleFilter) &&
    (stateFilter === 'all' || m.state === stateFilter),
  );

  return (
    <>
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
          <button
            className="btn ghost small"
            onClick={() => onAskAna('Audit Jordan Chen access this week — every action, every signing, every program touched. Export as a Part 11 PDF.')}
          >
            {I.eye} Audit a member
          </button>
          <button
            className="btn primary small"
            onClick={() => onAskAna('Invite a new member. Confirm name, email, role, group memberships, and which programs they should be granted access to.')}
          >
            {I.plus} Invite member
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {ADM_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Part 11 exports + access reports — what this surface produces */}
      <DocumentsPanel
        title="Compliance exports"
        subtitle={`${ADM_DOCUMENTS.length} 21 CFR Part 11 artifacts · ${ADM_DOCUMENTS.filter(d => d.esigState === 'signed').length} signed · ${ADM_DOCUMENTS.filter(d => d.status === 'draft' || d.status === 'review').length} in progress`}
        docs={ADM_DOCUMENTS}
        frameworks={ADM_DOC_FRAMEWORKS}
        onOpenEditor={(docId) => onAskAna(`Open compliance export ${docId}`)}
        onAskAna={onAskAna}
      />

      {/* Tab strip */}
      <div className="adm-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className="adm-tab"
            aria-current={tab === t.id || undefined}
            onClick={() => setTab(t.id)}
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
                <button className="seg-btn" data-on={stateFilter === 'all'}      onClick={() => setStateFilter('all')}>All</button>
                <button className="seg-btn" data-on={stateFilter === 'active'}   onClick={() => setStateFilter('active')}>Active</button>
                <button className="seg-btn" data-on={stateFilter === 'invited'}  onClick={() => setStateFilter('invited')}>Invited</button>
                <button className="seg-btn" data-on={stateFilter === 'disabled'} onClick={() => setStateFilter('disabled')}>Disabled</button>
              </div>
              <div className="seg small" style={{ marginLeft: 8 }}>
                <button className="seg-btn" data-on={roleFilter === 'all'}     onClick={() => setRoleFilter('all')}>Any role</button>
                {ADM_ROLES.map(r => (
                  <button key={r.id} className="seg-btn" data-on={roleFilter === r.label} onClick={() => setRoleFilter(r.label)}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: '40px 1.4fr 100px 1fr 90px 70px 90px' }}>
                <div />
                <div>Member</div>
                <div>Role</div>
                <div>Groups</div>
                <div>SSO</div>
                <div>MFA</div>
                <div>Last seen</div>
              </div>
              {memberFiltered.map(m => (
                <button
                  key={m.id}
                  className="ctable-row adm-member-row"
                  data-on={selectedMember === m.id}
                  data-state={m.state}
                  style={{ gridTemplateColumns: '40px 1.4fr 100px 1fr 90px 70px 90px' }}
                  onClick={() => setSelectedMember(m.id)}
                >
                  <div className="adm-avatar">{m.initials}</div>
                  <div>
                    <div className="ctable-strong">{m.name}</div>
                    <div style={{ color: 'var(--text-400)', fontSize: 12 }}>{m.email}</div>
                  </div>
                  <div>
                    {m.role === '—'
                      ? <span style={{ color: 'var(--text-400)' }}>—</span>
                      : <span className={`adm-role-pill adm-role-${m.role.toLowerCase()}`}>{m.role}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.groups.map(g => <span key={g} className="adm-group mono tiny">{g}</span>)}
                  </div>
                  <div>
                    {m.sso === 'okta'
                      ? <span className="adm-sso adm-sso-ok">{I.shield} okta</span>
                      : <span className="adm-sso adm-sso-local">local</span>}
                  </div>
                  <div>
                    {m.mfa
                      ? <span style={{ color: 'var(--success)' }}>{I.check}</span>
                      : <span style={{ color: 'var(--warning)' }}>{I.alertCircle}</span>}
                  </div>
                  <div style={{ color: m.state === 'active' ? 'var(--text-200)' : 'var(--text-400)' }}>{m.lastSeen}</div>
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
                  <div className="v"><span className={`adm-role-pill adm-role-${member.role.toLowerCase()}`}>{member.role}</span></div>
                </div>
                <div>
                  <div className="k">State</div>
                  <div className="v"><span className={`status-pill ${member.state === 'active' ? 'active' : member.state === 'invited' ? 'review' : 'idle'}`}>{member.state}</span></div>
                </div>
                <div>
                  <div className="k">SSO</div>
                  <div className="v">{member.sso === 'okta' ? 'Okta · SAML' : 'Local'}</div>
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
                  <div className="v" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {member.groups.map(g => <span key={g} className="adm-group mono tiny">{g}</span>) || '—'}
                  </div>
                </div>
              </div>

              <div className="drawer-section-lbl">Role scopes</div>
              <div className="adm-scopes">
                {(memberRole?.scopes || []).map(s => (
                  <span key={s} className="adm-scope mono tiny">{s}</span>
                ))}
              </div>

              <div className="drawer-section-lbl">Program access</div>
              {memberGrants.length === 0 && <div style={{ color: 'var(--text-400)', fontSize: 12 }}>No program-level grants.</div>}
              {memberGrants.map((g, i) => (
                <div key={i} className="adm-grant">
                  <span className="mono small">{g.program === '*' ? 'all programs' : g.program}</span>
                  <span className="adm-grant-scope">{g.scope}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-400)', fontSize: 12 }}>
                    {g.expires ? `granted ${g.granted} · expires ${g.expires}` : `granted ${g.granted}`}
                  </span>
                </div>
              ))}

              <div className="drawer-actions">
                <button
                  className="btn primary small"
                  onClick={() => onAskAna(`Grant ${member.name} access to a specific program. Confirm program, scope (read / review-scoped / edit), and any expiry. Emit the Part 11 audit entry.`)}
                >
                  {I.plus} Grant access
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => onAskAna(`Show ${member.name}'s last 90 days of activity — every signing, every artifact touched, every CAPA approved. Export as Part 11 PDF.`)}
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
            <span className="section-sub">{ADM_ROLES.length} roles · {ADM_ROLES.reduce((s, r) => s + r.members, 0)} members assigned</span>
          </div>
          <div className="adm-roles">
            {ADM_ROLES.map(r => (
              <article key={r.id} className="adm-role-card">
                <div className="adm-role-head">
                  <span className={`adm-role-pill adm-role-${r.id}`}>{r.label}</span>
                  <span className="adm-role-n mono">{r.members} member{r.members === 1 ? '' : 's'}</span>
                </div>
                <div className="adm-role-desc">{r.desc}</div>
                <div className="adm-role-scopes">
                  {r.scopes.map(s => <span key={s} className="adm-scope mono tiny">{s}</span>)}
                </div>
                <div className="adm-role-foot">
                  <button className="btn ghost small" onClick={() => onAskAna(`Edit the ${r.label} role. Show me current scopes, propose changes, and confirm impact on the ${r.members} member${r.members === 1 ? '' : 's'} currently assigned.`)}>{I.pencil} Edit scopes</button>
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
              <span className="adm-conn-kind mono small">{ADM_SSO.primary.kind}</span>
              <span className="adm-conn-name">{ADM_SSO.primary.provider}</span>
              <span className="status-pill active">connected</span>
            </div>
            <div className="adm-conn-meta">
              <div><span className="k">Domain</span><span className="v mono small">{ADM_SSO.primary.domain}</span></div>
              <div><span className="k">Users</span><span className="v">{ADM_SSO.primary.users}</span></div>
              <div><span className="k">Last sync</span><span className="v">{ADM_SSO.primary.lastSync}</span></div>
            </div>
            <button className="btn ghost small" onClick={() => onAskAna('Rotate the Okta SSO signing certificate. Walk me through the IdP-side change, the SP metadata refresh, and the rollback window.')}>{I.sparkles} Rotate signing cert</button>
          </article>
          <article className="adm-conn" data-state="staging">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">{ADM_SSO.proposed.kind}</span>
              <span className="adm-conn-name">{ADM_SSO.proposed.provider}</span>
              <span className="status-pill review">staging</span>
            </div>
            <div className="adm-conn-meta">
              <div><span className="k">Domain</span><span className="v mono small">{ADM_SSO.proposed.domain}</span></div>
              <div><span className="k">Users</span><span className="v">{ADM_SSO.proposed.users}</span></div>
              <div><span className="k">Last sync</span><span className="v">{ADM_SSO.proposed.lastSync}</span></div>
            </div>
            <button className="btn ghost small" onClick={() => onAskAna('Promote Microsoft Entra ID from staging to primary IdP. Confirm migration plan, fallback to local, and the cutover audit entries.')}>{I.arrowRight} Promote to primary</button>
          </article>
          <article className="adm-conn" data-state="enabled">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">{ADM_SSO.fallback.kind}</span>
              <span className="adm-conn-name">{ADM_SSO.fallback.provider}</span>
              <span className="status-pill draft">enabled</span>
            </div>
            <div className="adm-conn-meta">
              <div><span className="k">Domain</span><span className="v mono small">{ADM_SSO.fallback.domain}</span></div>
              <div><span className="k">Users</span><span className="v">{ADM_SSO.fallback.users}</span></div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-300)' }}>Fallback for accounts not provisioned via SSO. Always on, MFA enforced.</div>
          </article>
          <article className="adm-conn adm-scim">
            <div className="adm-conn-head">
              <span className="adm-conn-kind mono small">SCIM</span>
              <span className="adm-conn-name">{ADM_SSO.scim.provider}</span>
              <span className="status-pill active">{ADM_SSO.scim.enabled ? 'enabled' : 'disabled'}</span>
            </div>
            <div className="adm-conn-meta">
              <div><span className="k">Attrs synced</span><span className="v">{ADM_SSO.scim.provisionedAttrs}</span></div>
              <div><span className="k">Last event</span><span className="v" style={{ fontSize: 12, color: 'var(--text-300)' }}>{ADM_SSO.scim.lastEvent}</span></div>
            </div>
          </article>
        </div>
      )}

      {tab === 'apikeys' && (
        <section className="section">
          <div className="section-head">
            <h2>API keys</h2>
            <span className="section-sub">{ADM_API_KEYS.length} keys · scopes are immutable per key</span>
          </div>
          <div className="ctable">
            <div className="ctable-head" style={{ gridTemplateColumns: '110px 1fr 1.4fr 90px 90px 110px 70px' }}>
              <div>Key</div>
              <div>Name</div>
              <div>Scopes</div>
              <div>Owner</div>
              <div>Created</div>
              <div>Rotate in</div>
              <div>Last used</div>
            </div>
            {ADM_API_KEYS.map(k => {
              const owner = ADM_MEMBERS.find(m => m.id === k.owner);
              const overdue = k.rotateIn === 'overdue';
              return (
                <button key={k.id} className="ctable-row" style={{ gridTemplateColumns: '110px 1fr 1.4fr 90px 90px 110px 70px' }}
                  onClick={() => onAskAna(`Rotate API key ${k.name} (${k.id}). Stage new key, dual-publish for 24h, then deprecate the old key. Confirm audit entry.`)}>
                  <div className="mono small">{k.id}</div>
                  <div className="ctable-strong">{k.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {k.scopes.map(s => <span key={s} className="adm-scope mono tiny">{s}</span>)}
                  </div>
                  <div>{owner?.initials || '—'}</div>
                  <div>{k.created}</div>
                  <div style={{ color: overdue ? 'var(--error-text)' : 'var(--text-200)', fontWeight: overdue ? 600 : 400 }}>{k.rotateIn}</div>
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
            <span className="section-sub">Changes here emit Part 11 audit entries</span>
          </div>
          <div className="adm-settings">
            {ADM_SETTINGS.map(s => (
              <button key={s.id} className="adm-setting" onClick={() => onAskAna(`Change setting "${s.label}". Current value: ${s.value}. Confirm new value, the impact, and the audit entry.`)}>
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

      {/* Admin audit band — always visible at bottom */}
      <section className="section">
        <div className="section-head">
          <h2>Admin audit · last 24 hours</h2>
          <span className="section-sub">SHA-256 chained · cryptographically verifiable · {ADM_AUDIT.length} actions shown</span>
        </div>
        <div className="adm-audit">
          {ADM_AUDIT.map(a => (
            <div key={a.id} className="adm-audit-row">
              <span className="mono small adm-audit-id">{a.id}</span>
              <span className="adm-audit-when">{a.when}</span>
              <span className="adm-audit-actor">{a.actor === 'system' ? <span style={{ color: 'var(--text-400)' }}>system</span> : a.actor}</span>
              <span className="mono small adm-audit-action">{a.action}</span>
              <span className="adm-audit-target">{a.target}</span>
              <span className="mono tiny adm-audit-sha" title="SHA-256 chain hash">{a.sha}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

window.AdminSurface = AdminSurface;

})();
