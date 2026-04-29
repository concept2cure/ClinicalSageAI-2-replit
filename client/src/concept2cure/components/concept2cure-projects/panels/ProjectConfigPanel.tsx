/**
 * ProjectConfigPanel — right Sheet flyout (4-tab config + Settings).
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectConfigPanel + Field, lines 924–1292).
 *
 * HANDOFF audit notes wired here:
 *   - item 4: PCP_AGENCIES uses the unified six-code list (FDA / EMA /
 *     MHRA / HC / PMDA / Swissmedic) — see data/config.ts.
 *   - item 7: Instructions tab on this panel still has its full editor
 *     (the flyout is a quick-edit affordance); the ProjectInstructions
 *     full-screen tab is the canonical Instructions surface.
 *   - item 9: onSave is now part of the prop contract.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { I } from '../icons';
import {
  PCP_TABS,
  PCP_SUBMISSION_TYPES,
  PCP_AGENCIES,
  PCP_STATUSES,
  PCP_ROLES,
  PCP_MEMBERS,
  PCP_SSO_GROUPS,
} from '../data';
import type { Project, ConfigPanelTab } from '../types';

interface PcpForm {
  name: string;
  submissionType: string;
  product: string;
  sponsor: string;
  targetAgency: string;
  targetDate: string;
  status: string;
  description: string;
}

interface Props {
  project: Project;
  open: boolean;
  onClose: () => void;
  /** Per HANDOFF item 9: persists the form on a single PATCH. */
  onSave?: (form: PcpForm) => void;
}

export function ProjectConfigPanel({ project, open, onClose, onSave }: Props) {
  const [tab, setTab] = useState<ConfigPanelTab>('general');
  const [form, setForm] = useState<PcpForm | null>(null);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open && project) {
      setForm({
        name: project.name || '',
        submissionType: project.submissionType || '510K',
        product: project.product || '',
        sponsor: project.sponsor || '',
        targetAgency: (project.targetAgency as string) || 'FDA',
        targetDate: project.targetDate || '',
        status: project.status || 'draft',
        description: project.desc || '',
      });
      setInstructions(project.instructions || '');
    }
  }, [open, project]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !project || !form) return null;

  const set = <K extends keyof PcpForm>(k: K, v: PcpForm[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f));

  return (
    <div className="pcp" role="dialog" aria-label="Project configuration">
      <div className="pcp-sheet">
        <header className="pcp-head">
          <div>
            <h2 className="pcp-h2">Project configuration</h2>
            <p className="pcp-sub">
              Configure project settings, instructions, and compliance.
            </p>
          </div>
          <button type="button" className="pcp-close" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </header>

        <nav className="pcp-tabs" role="tablist" aria-label="Configuration tabs">
          {PCP_TABS.map(t => (
            <button
              type="button"
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className="pcp-tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <span className="pcp-tab-ico">{I[t.icon] ?? null}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="pcp-body">
          {tab === 'general' && (
            <div className="pcp-tab-body">
              <Field label="Project name">
                <input className="pcp-input" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>

              <Field label="Submission type">
                <select
                  className="pcp-select"
                  value={form.submissionType}
                  onChange={e => set('submissionType', e.target.value)}
                >
                  {PCP_SUBMISSION_TYPES.map(o => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </Field>

              <Field label="Product / device name">
                <input
                  className="pcp-input"
                  value={form.product}
                  onChange={e => set('product', e.target.value)}
                  placeholder="e.g. CardioFlow heart monitor"
                />
              </Field>

              <Field label="Sponsor">
                <input
                  className="pcp-input"
                  value={form.sponsor}
                  onChange={e => set('sponsor', e.target.value)}
                  placeholder="e.g. Acme Biotech, Inc."
                />
              </Field>

              <Field label="Target agency">
                <div className="pcp-radios" role="radiogroup">
                  {PCP_AGENCIES.map(a => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={form.targetAgency === a}
                      data-active={form.targetAgency === a}
                      className="pcp-radio"
                      onClick={() => set('targetAgency', a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Target submission date">
                <input
                  className="pcp-input"
                  type="date"
                  value={form.targetDate}
                  onChange={e => set('targetDate', e.target.value)}
                />
              </Field>

              <Field label="Status">
                <select
                  className="pcp-select"
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                >
                  {PCP_STATUSES.map(o => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </Field>

              <Field label="Description" optional>
                <textarea
                  className="pcp-textarea"
                  rows={3}
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Brief description of the project…"
                />
              </Field>

              {onSave && (
                <div className="pcp-form-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button type="button" className="prj-btn" onClick={onClose}>Cancel</button>
                  <button type="button" className="prj-btn primary" onClick={() => { onSave(form); onClose(); }}>
                    Save
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'instructions' && (
            <div className="pcp-tab-body">
              <div className="pcp-section-head">
                <div>
                  <h3 className="pcp-h3">Custom instructions</h3>
                  <p className="pcp-section-sub">
                    Project-specific guidance injected into every Claude conversation.
                  </p>
                </div>
                <span className="pcp-badge" data-tone="ok">{instructions ? 'Active' : 'Inactive'}</span>
              </div>

              <textarea
                className="pcp-textarea pcp-mono"
                rows={10}
                value={instructions}
                onChange={e => e.target.value.length <= 5000 && setInstructions(e.target.value)}
                placeholder="Add custom instructions for Claude in this project. For example: focus on FDA Class II device requirements. Always cite 21 CFR 820 when discussing QMS. Our predicate device is…"
              />

              <div className="pcp-instr-meta">
                <span>{instructions.length.toLocaleString()} / 5,000 characters</span>
                <button
                  type="button"
                  className="pcp-link"
                  onClick={() => setInstructions('')}
                  disabled={!instructions}
                >
                  Reset to default
                </button>
              </div>

              <p className="pcp-note">
                These instructions are injected into every Claude conversation within this project. They help Claude understand your regulatory context, product specifics, and preferred output style.
              </p>
            </div>
          )}

          {tab === 'team' && (
            <div className="pcp-tab-body">
              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">Invite members</h3>
                  <span className="pcp-badge" data-tone="ok">
                    {(PCP_MEMBERS[project.id] || []).length} active
                  </span>
                </div>
                <p className="pcp-section-sub">
                  Add by email. New members receive an invitation with the role you specify.
                </p>
                <div className="pcp-invite-row">
                  <input className="pcp-input" placeholder="name@company.com" />
                  <select className="pcp-select pcp-invite-role" defaultValue="Editor">
                    {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                  <button type="button" className="pcp-btn primary">Send invite</button>
                </div>
              </div>

              <div className="pcp-card">
                <h3 className="pcp-h3">Members</h3>
                <ul className="pcp-mem-list">
                  {(PCP_MEMBERS[project.id] || []).map(m => {
                    const isOwner = m.role === 'Owner';
                    return (
                      <li key={m.id} className="pcp-mem-row">
                        <span className="pcp-mem-avatar" aria-hidden="true">
                          {m.name.split(' ').map(s => s[0]).join('').slice(0, 2)}
                        </span>
                        <div className="pcp-mem-body">
                          <div className="pcp-mem-name">{m.name}</div>
                          <div className="pcp-mem-email">{m.email} · active {m.last}</div>
                        </div>
                        <select className="pcp-select pcp-mem-role" defaultValue={m.role}>
                          {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                        </select>
                        <button type="button" className="pcp-link is-danger" disabled={isOwner}>
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="pcp-roles-legend">
                  {PCP_ROLES.map(r => (
                    <div key={r.v} className="pcp-role-meta">
                      <span className="pcp-role-name">{r.l}</span>
                      <span className="pcp-role-hint">{r.hint}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">SSO group bindings</h3>
                  <span className="pcp-badge" data-tone="ok">SAML / OIDC</span>
                </div>
                <p className="pcp-section-sub">Map identity-provider groups to project roles.</p>
                <ul className="pcp-sso-list">
                  {PCP_SSO_GROUPS.map(g => (
                    <li key={g.id} className="pcp-sso-row">
                      <div className="pcp-sso-body">
                        <div className="pcp-sso-name">{g.name}</div>
                        <div className="pcp-sso-meta">{g.count} members</div>
                      </div>
                      <select className="pcp-select pcp-sso-role" defaultValue={g.mapped || ''}>
                        <option value="">Not mapped</option>
                        {PCP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'compliance' && (
            <div className="pcp-tab-body">
              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">
                    <span className="pcp-ico-inline">{I.shieldCheck}</span> 21 CFR Part 11 compliance
                  </h3>
                  <span className="pcp-badge" data-tone="ok">Enabled</span>
                </div>
                <p className="pcp-section-sub">
                  Electronic records and signatures comply with FDA 21 CFR Part 11 requirements. Audit trails, access controls, and data integrity measures are enforced.
                </p>
                <div className="pcp-stats">
                  <div className="pcp-stat">
                    <span className="pcp-stat-k">Audit trail</span>
                    <span className="pcp-stat-v">12 entries</span>
                  </div>
                  <div className="pcp-stat">
                    <span className="pcp-stat-k">E-signatures</span>
                    <span className="pcp-stat-v">3 recorded</span>
                  </div>
                </div>
              </div>

              <div className="pcp-card">
                <h3 className="pcp-h3">Audit trail</h3>
                <p className="pcp-section-sub">
                  All project changes are automatically tracked with user identity, timestamp, and action details. The audit trail is append-only and tamper-evident.
                </p>
                <div className="pcp-pill-row">
                  <span className="pcp-pill-out">Append-only</span>
                  <span className="pcp-pill-out">SHA-256 integrity</span>
                  <span className="pcp-pill-out">Tamper-evident</span>
                </div>
              </div>

              <div className="pcp-card">
                <div className="pcp-card-head">
                  <h3 className="pcp-h3">Regulatory lead</h3>
                  <span className="pcp-badge" data-tone="warn">Not assigned</span>
                </div>
                <p className="pcp-section-sub">
                  Assign a regulatory lead responsible for submission oversight, review approvals, and compliance sign-off.
                </p>
                <button type="button" className="pcp-btn">Assign regulatory lead</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="pcp-field">
      <label className="pcp-label">
        {label}{optional && <span className="pcp-optional"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}
