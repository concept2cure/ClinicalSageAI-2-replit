import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  PROJECTS, NP_TEAMS, WS_TONE,
  type ProjPortfolioEntry, type NpTeamMember,
} from '../fixtures/project-home-data';
import '../styles/project-home-v2.css';

/* ── Window globals — gap until registry / submission-type modules port ── */
declare global {
  interface Window {
    __C2C_NEW_PROJECT?: boolean;
    RegistryPicker?: React.ComponentType<{ value: string | null; onChange: (v: string) => void; initialSegment?: string }>;
    SEGMENT_CONTEXT?: Record<string, { label: string }>;
    getSubmissionTypeContext?: (id: string) => {
      id: string; displayName: string; pathwayKey?: string;
      agency?: string; region?: string; dossierStandard?: string;
      ctdModule?: string; submissionFormat?: string;
    } | null;
    REG_TA_GROUPS?: { id: string; label: string }[];
    REG_TA?: { id: string; label: string; group: string }[];
    REG_PATHWAYS?: Record<string, { kind: string; tree: { items: unknown[] }[] }>;
    REG_TEMPLATES?: Record<string, { items: unknown[] }[]>;
  }
}

/* ════ New Project Wizard (registry-driven) ════ */

interface SelTpl {
  id: string;
  label: string;
  pathway: string;
  agency?: string;
  region?: string;
  dossierStandard?: string;
  ctdModule?: string;
  submissionFormat?: string;
}

const SEG2REG: Record<string, string | null> = {
  biotech: 'pharma_biotech', pharma: 'pharma_biotech',
  medtech: 'medical_devices', diagnostics: 'diagnostics_ivd',
  cro: null, health: 'pharma_biotech',
};

const SEG2WS: Record<string, string> = {
  biotech: 'Biotech', pharma: 'Pharma', medtech: 'MDX',
  diagnostics: 'MDX', cro: 'CRO', health: 'Biotech',
};

function NewProjectWizard({ onClose, onNav }: { onClose: () => void; onNav: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [ta, setTa] = useState('onc');
  const [team, setTeam] = useState<string[]>(['Jordan Chen']);
  const [target, setTarget] = useState('');
  const [creating, setCreating] = useState(false);

  const uiSeg = (typeof window !== 'undefined' && window.__C2C_SEGMENT) || 'biotech';
  const regSeg = SEG2REG[uiSeg];
  const segLabel = window.SEGMENT_CONTEXT?.[uiSeg]?.label || uiSeg;
  const ctx = tpl && window.getSubmissionTypeContext ? window.getSubmissionTypeContext(tpl) : null;
  const selTpl: SelTpl | null = ctx
    ? { ...ctx, label: ctx.displayName, pathway: ctx.pathwayKey || 'ctd' }
    : null;
  const toggleTeam = (n: string) => setTeam(t => t.includes(n) ? t.filter(x => x !== n) : [...t, n]);

  const doCreate = () => {
    setCreating(true);
    try {
      window.C2C_PROJECT = {
        id: 'new',
        title: name || selTpl?.label || 'New project',
        product,
        code: selTpl?.label || '',
        ws: SEG2WS[uiSeg] || 'Biotech',
        status: 'active',
      };
    } catch (_) { /* noop */ }
    setTimeout(() => { onClose(); onNav('project-home'); }, 1200);
  };

  const taGroups = window.REG_TA_GROUPS || [];
  const taList = window.REG_TA || [];

  return (
    <div className="esign-bd" onClick={onClose}>
      <div className="esign-modal" onClick={e => e.stopPropagation()} style={{ width: 880, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div className="esign-h" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <span className="ico" style={{ fontSize: 18 }}>{I.plus}</span>
          <div style={{ flex: 1 }}>
            <span className="t" style={{ fontSize: 15 }}>New project</span>
            <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
              Step {step + 1} of 3 — {['Choose template', 'Configure project', 'Review & create'][step]}
            </div>
          </div>
          <button className="tbtn" onClick={onClose}>{I.close}</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 8px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent-200)' : 'var(--bg-300)', transition: 'background 0.2s' }} />
          ))}
        </div>

        <div style={{ padding: '8px 20px 20px' }}>
          {/* Step 0: Choose template */}
          {step === 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', marginBottom: 12, borderRadius: 8, background: 'var(--accent-000)', border: '1px solid var(--accent-muted)' }}>
                <span className="ico" style={{ fontSize: 15, color: 'var(--accent-200)' }}>{I.sparkles}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-100)' }}>Tailored for {segLabel}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-400)' }}>Showing the filing types that fit your client type. Switch the tab to browse other segments.</div>
                </div>
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {window.RegistryPicker
                  ? <window.RegistryPicker value={tpl} onChange={setTpl} initialSegment={regSeg || undefined} />
                  : <p style={{ color: 'var(--text-400)', fontSize: 12 }}>Loading registry...</p>}
              </div>
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 1 && selTpl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Configure your {selTpl.label} project</div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Project name</span>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder={`e.g. ${selTpl.id === '510k' ? 'Aurora CGM — 510(k)' : 'BX-204 — ' + selTpl.label}`}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Product name</span>
                <input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. BX-204"
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Therapeutic area</span>
                <select value={ta} onChange={e => setTa(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-100)', fontSize: 13 }}>
                  {taGroups.map(g => {
                    const items = taList.filter(t => t.group === g.id);
                    return items.length
                      ? <optgroup key={g.id} label={g.label}>{items.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
                      : null;
                  })}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Target submission date</span>
                <input type="date" value={target} onChange={e => setTarget(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <div>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)', display: 'block', marginBottom: 6 }}>Team members</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {NP_TEAMS.map(m => (
                    <button key={m.name} onClick={() => toggleTeam(m.name)}
                      style={{ padding: '5px 10px', borderRadius: 16, border: '1px solid ' + (team.includes(m.name) ? 'var(--accent-200)' : 'var(--border)'), background: team.includes(m.name) ? 'var(--accent-000)' : 'transparent', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {team.includes(m.name) && <span style={{ color: 'var(--accent-200)', fontSize: 12 }}>{I.check}</span>}
                      {m.name} <span style={{ color: 'var(--text-400)' }}>· {m.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review & create */}
          {step === 2 && selTpl && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Review & create</div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 16px', fontSize: 12.5, padding: 16, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-100)' }}>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Filing type</span>
                <span style={{ fontWeight: 500 }}>{selTpl.label}</span>
                {selTpl.agency && <>
                  <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Agency / Region</span>
                  <span>{selTpl.agency} · {selTpl.region}</span>
                </>}
                {selTpl.dossierStandard && selTpl.dossierStandard !== '—' && <>
                  <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Dossier</span>
                  <span>{selTpl.dossierStandard}{selTpl.ctdModule && selTpl.ctdModule !== '—' ? ' · ' + selTpl.ctdModule : ''}</span>
                </>}
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Project name</span>
                <span>{name || '(unnamed)'}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Product</span>
                <span>{product || '—'}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Therapeutic area</span>
                <span>{taList.find(t => t.id === ta)?.label || ta}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Target date</span>
                <span>{target || 'Not set'}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Team</span>
                <span>{team.join(', ') || 'Just you'}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Pathway</span>
                <span>{(selTpl.pathway || '').toUpperCase()} — {(window.REG_PATHWAYS || {})[selTpl.pathway]?.kind || selTpl.submissionFormat || selTpl.pathway}</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Sections</span>
                <span>{((window.REG_PATHWAYS || {})[selTpl.pathway]?.tree || []).reduce((s: number, v: { items: unknown[] }) => s + v.items.length, 0) || '35'} sections auto-created</span>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Templates</span>
                <span>{((window.REG_TEMPLATES || {})[selTpl.pathway] || []).reduce((s: number, g: { items: unknown[] }) => s + g.items.length, 0) || '72'} document templates available</span>
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 6, background: 'color-mix(in srgb,var(--success) 8%,transparent)', border: '1px solid var(--success)', fontSize: 11.5, display: 'flex', gap: 8, alignItems: 'center' }}>
                {I.sparkles}<span>AnA will analyze your project context and suggest an initial schedule, instructions, and memory once the project is created.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="esign-f" style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          {step > 0 && <button className="btn ghost" style={{ flex: 0 }} onClick={() => setStep(s => s - 1)}>Back</button>}
          <span style={{ flex: 1 }} />
          {step < 2 && <button className="btn primary" disabled={step === 0 && !tpl} onClick={() => setStep(s => s + 1)}>Continue</button>}
          {step === 2 && <button className="btn primary" disabled={creating} onClick={doCreate}>
            {creating ? 'Creating project...' : <>{I.plus} Create project</>}
          </button>}
        </div>
      </div>
    </div>
  );
}

/* ════ Projects — portfolio of programs ════ */

export function Projects({ onAsk, onNav, segment }: SurfaceViewProps) {
  const [ws, setWs] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('grid');
  const [wizardOpen, setWizardOpen] = useState(() => {
    if (window.__C2C_NEW_PROJECT) { window.__C2C_NEW_PROJECT = false; return true; }
    return false;
  });

  const list = PROJECTS.filter(p => (ws === 'all' || p.ws === ws) && (status === 'all' || p.status === status));
  const health = [
    { l: 'Active programs', n: String(PROJECTS.length), m: 'across MDX, Biotech, Pharma', t: '' },
    { l: 'Average readiness', n: Math.round(PROJECTS.reduce((s, p) => s + p.readiness, 0) / PROJECTS.length) + '%', m: 'portfolio mean', t: '' },
    { l: 'Blocked', n: String(PROJECTS.filter(p => p.status === 'blocked').length), m: 'need attention', t: 'err' },
    { l: 'Filing < 60 days', n: String(PROJECTS.filter(p => /days/.test(p.due)).length), m: 'near-term submissions', t: 'warn' },
  ];
  const wss = ['all', 'MDX', 'Biotech', 'Pharma'];

  const openProj = (pr: ProjPortfolioEntry) => {
    try {
      window.C2C_PROJECT = { id: pr.id, title: pr.title, code: pr.code, ws: pr.ws, status: pr.status };
      if (window.C2C?.setSurface) window.C2C.setSurface('project-home', pr.title);
    } catch (_) { /* noop */ }
    onNav('project-home');
  };

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Workspace</div>
          <h1 className="ph-title">Projects</h1>
          <div className="ph-sub">Every regulatory program across all workstreams. Open one to enter its project home.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Which programs are at risk this week?')}>{I.sparkles} Ask AnA</button>
          <button className="btn primary" onClick={() => setWizardOpen(true)}>{I.plus} New project</button>
        </div>
      </div>

      {wizardOpen && <NewProjectWizard onClose={() => setWizardOpen(false)} onNav={onNav} />}

      <div className="metrics">
        {health.map((h, i) => (
          <div key={i} className="metric" data-tone={h.t || undefined}>
            <div className="metric-l">{h.l}</div>
            <div className="metric-n">{h.n}</div>
            <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-400)' }}>{h.m}</div>
          </div>
        ))}
      </div>

      <div className="ws-switch" style={{ marginBottom: 8 }}>
        {wss.map(w => <button key={w} className={`ws-btn${ws === w ? ' on' : ''}`} onClick={() => setWs(w)}>{w === 'all' ? 'All workstreams' : w}</button>)}
        <span style={{ flex: 1 }} />
        <div className="seg">
          <button className={`seg-b${view === 'grid' ? ' on' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button className={`seg-b${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        {(['all', 'active', 'blocked', 'complete'] as const).map(s => (
          <button key={s} className={`seg-b${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {view === 'grid' ? (
        <div className="launch-grid">
          {list.map(p => (
            <button key={p.id} className="launch" onClick={() => openProj(p)}>
              <div className="launch-top">
                <span className={`rd-chip tone-${WS_TONE[p.ws]}`}>{p.ws}</span>
                <span className={`rd-chip tone-${p.status === 'blocked' ? 'err' : p.status === 'complete' ? 'ok' : 'ai'}`}>{p.status}</span>
              </div>
              <div className="launch-title">{p.title}</div>
              <div className="launch-desc">{p.code} · {p.stage} · Lead {p.lead}</div>
              <div className="ph-bar-track" style={{ margin: '12px 0 6px' }}>
                <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-400)' }}>
                <span>{p.readiness}% ready</span><span>{p.due}</span>
              </div>
              {p.blocker
                ? <div className="ed-flag" data-sev="warn" style={{ marginTop: 10 }}><span className="ico">{I.alertTriangle}</span><span>{p.blocker}</span></div>
                : <div style={{ marginTop: 10, fontSize: 11, color: 'var(--success)', display: 'flex', gap: 6, alignItems: 'center' }}>{I.check} No open blockers</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '1.6fr 80px 1fr 120px 100px 90px' }}>
            <div>Program</div><div>WS</div><div>Stage / readiness</div><div>Blocker</div><div>Lead</div><div>Due</div>
          </div>
          {list.map(p => (
            <button key={p.id} className="ct-row" style={{ gridTemplateColumns: '1.6fr 80px 1fr 120px 100px 90px' }} onClick={() => openProj(p)}>
              <div>
                <div className="ct-strong">{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-400)' }}>{p.code}</div>
              </div>
              <div><span className={`rd-chip tone-${WS_TONE[p.ws]}`}>{p.ws}</span></div>
              <div>
                <div style={{ fontSize: 11.5 }}>{p.stage}</div>
                <div className="ph-bar-track" style={{ marginTop: 5 }}>
                  <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: p.blocker ? 'var(--warning)' : 'var(--text-400)' }}>{p.blocker ? '1 blocker' : '—'}</div>
              <div style={{ fontSize: 11.5 }}>{p.lead}</div>
              <div style={{ fontSize: 11, color: 'var(--text-400)' }}>{p.due}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Projects;
