import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Cross-surface data providers (RBM surface writes these globals) ── */
declare global {
  interface Window {
    RBM_SITES?: RbmSite[];
    RBM_OVERSIGHT_COUNTS?: Record<string, { open: number; high: number }>;
  }
}

/* ── Inline fixture types ── */

interface RbmSite {
  n: string;
  name: string;
  country: string;
  composite: number;
  tier: string;
  drivers?: string[];
}

interface CoStudy {
  id: string;
  phase: string;
  design: string;
  n: number;
  target: number;
  status: string;
  note: string;
}

interface CoSite {
  n: string;
  name: string;
  country: string;
  composite: number | null;
  tier: string;
  driver: string;
  open: number;
  high: number;
  _new?: boolean;
}

interface CoDsmb {
  n: string;
  date: string;
  outcome: string;
  tone: string;
}

interface CoDev {
  sev: string;
  site: string;
  title: string;
  capa: string;
  status: string;
  _new?: boolean;
}

/* ── Inline fixture data (kit window globals) ── */

const CO_STUDIES: CoStudy[] = [
  { id: 'BX204-301', phase: '3', design: 'Randomized · pivotal', n: 412, target: 412, status: 'active', note: 'Primary ORR readout Q4 2026' },
  { id: 'BX204-201', phase: '2', design: 'Single-arm · dose-expansion', n: 186, target: 186, status: 'complete', note: 'Supportive · CSR locked' },
  { id: 'BX204-101', phase: '1', design: 'Dose-escalation (3+3)', n: 54, target: 54, status: 'complete', note: 'MTD established' },
];

const CO_DSMB: CoDsmb[] = [
  { n: 'Review 3', date: 'Mar 2026', outcome: 'Continue as planned', tone: 'ok' },
  { n: 'Review 2', date: 'Sep 2025', outcome: 'Continue -- no safety concerns', tone: 'ok' },
  { n: 'Review 1', date: 'Mar 2025', outcome: 'Continue -- enrollment on track', tone: 'ok' },
];

const CO_DEV: CoDev[] = [
  { sev: 'med', site: '1117', title: 'Informed-consent version lag at re-consent', capa: 'CAPA open', status: 'evaluating' },
  { sev: 'low', site: '1104', title: 'Visit window exceeded (2 subjects)', capa: 'documented', status: 'planned' },
];

/** Build site list from cross-surface RBM data (race-proof: always reads current). */
function buildSites(): CoSite[] {
  return ((window as any).RBM_SITES || []).map((s: RbmSite) => {
    const ov = ((window as any).RBM_OVERSIGHT_COUNTS || {})[s.n] || { open: 0, high: 0 };
    return { n: s.n, name: s.name, country: s.country, composite: s.composite, tier: s.tier, driver: (s.drivers || [])[0] || '', open: ov.open, high: ov.high };
  });
}

/* ── Inline shared kit helpers (not yet ported as modules) ── */

interface QueueItem {
  ico: string;
  title: string;
  sub: string;
  tone: string;
  action: string;
  cmd: string;
}

interface BpComposerProps {
  eyebrow: string;
  title: string;
  state: React.ReactNode;
  starters: string[];
  primary?: React.ReactNode;
  queue: QueueItem[];
  onAsk: (text: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

function BpComposer({ eyebrow, title, state, starters, primary, queue, onAsk, lead, children }: BpComposerProps) {
  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">{eyebrow}</div>
          <h1 className="sp-title">{title}</h1>
          <p className="sp-state">{state}</p>
        </div>
        {primary}
      </div>
      {lead}
      <div className="sp-starters">
        {starters.map((s, i) => (
          <button key={i} className="sp-starter" onClick={() => onAsk(s)}>
            <span className="sk">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}
      </div>
      <div className="sp-sec">
        <div className="sp-sec-h">
          <span className="t">Today {I.dot} your queue</span>
          <span className="s">{queue.length} items</span>
          <span className="sp-sample">sample</span>
        </div>
        <div className="sp-queue">
          {queue.map((q, i) => (
            <button key={i} className="sp-q" data-tone={q.tone} onClick={() => onAsk(q.cmd)}>
              <span className="sp-q-ic">{I[q.ico] || I.info}</span>
              <span className="sp-q-b">
                <span className="sp-q-t">{q.title}</span>
                <span className="sp-q-s">{q.sub}</span>
              </span>
              <span className="sp-q-a">{q.action} {I.right}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

interface SpCardProps {
  title: string;
  meta?: React.ReactNode;
  sample?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
}

function SpCard({ title, meta, sample, action, children, foot }: SpCardProps) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sample && <span className="sp-sample">sample</span>}
          {meta}
          {action}
        </span>
      </div>
      <div className="pj-card-b">
        {children}
        {foot}
      </div>
    </div>
  );
}

interface AddBtnProps {
  onClick: () => void;
  label: string;
}

function AddBtn({ onClick, label }: AddBtnProps) {
  return (
    <button className="sp-addbtn" onClick={onClick}>
      {I.plus} {label}
    </button>
  );
}

interface SpAskProps {
  onAsk: (text: string) => void;
  cmd: string;
  label: string;
}

function SpAsk({ onAsk, cmd, label }: SpAskProps) {
  return (
    <div className="sp-foot">
      <button className="sp-ask" onClick={() => onAsk(cmd)}>
        {I.sparkles} {label}
      </button>
    </div>
  );
}

function pill(status: string) {
  const map: Record<string, string> = {
    active: 'ai', review: 'warn', drafted: 'idle', draft: 'idle',
    designated: 'ok', approved: 'ok', requested: 'warn', evaluating: 'warn',
    planned: 'idle', implemented: 'ok', monitoring: 'ai', watch: 'idle',
    drafting: 'warn', queued: 'idle', filed: 'ai', eligible: 'warn',
    awarded: 'ok', agreed: 'ok', submitted: 'ai', 'in draft': 'idle',
    received: 'ok', complete: 'ok',
  };
  return <span className={'rd-chip tone-' + (map[status] || 'idle')}>{status}</span>;
}

function rowcls(r: { _new?: boolean }): string {
  return 'sp-row' + (r._new ? ' de-row-new' : '');
}

function useRows<T extends { _new?: boolean }>(seed: T[]): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  const add = (r: T) => {
    const row: T = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

/* ════ Clinical Operations — clinical-development stage surface ════ */

export function ClinicalOps({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const initialSites = buildSites();
  const [sites, addSite] = useRows<CoSite>(initialSites.length ? initialSites : buildSites());
  const [devs, addDev] = useRows<CoDev>(CO_DEV);
  const [siteForm, setSiteForm] = useState(false);
  const [devForm, setDevForm] = useState(false);
  const [toast, fireToast] = useToast();

  const SITE_FORM: C2CFormConfig = {
    eyebrow: 'Clinical ops -- activate site',
    title: 'Activate a study site',
    governed: 'Sites are governed records -- activation writes an audit entry and enrolls the site into risk-based monitoring.',
    submitLabel: 'Activate site',
    fields: [
      { key: 'n', label: 'Site number', type: 'text', placeholder: 'e.g. 1131', required: true, half: true },
      { key: 'country', label: 'Country', type: 'select', options: ['US', 'DE', 'FR', 'UK', 'JP', 'CA', 'SE', 'IT', 'AU'], required: true, half: true },
      { key: 'name', label: 'Site name', type: 'text', placeholder: 'Institution', required: true },
      { key: 'tier', label: 'Initial monitoring tier', type: 'seg', options: ['reduced', 'standard', 'enhanced'], default: 'standard' },
    ],
  };

  const DEV_FORM: C2CFormConfig = {
    eyebrow: 'Clinical ops -- log deviation',
    title: 'Log a protocol deviation',
    governed: 'Deviations are governed -- logging opens the CAPA workflow and writes a §11 audit entry.',
    submitLabel: 'Log deviation',
    fields: [
      { key: 'site', label: 'Site', type: 'select', options: sites.map((s) => s.n), required: true, half: true },
      { key: 'sev', label: 'Severity', type: 'seg', options: ['low', 'med', 'high'], default: 'low', half: true },
      { key: 'title', label: 'Deviation', type: 'text', placeholder: 'What happened', required: true },
      { key: 'capa', label: 'CAPA', type: 'select', options: ['documented', 'CAPA open', 'escalated'], default: 'documented', half: true },
      { key: 'status', label: 'Status', type: 'seg', options: ['planned', 'evaluating'], default: 'evaluating', half: true },
      { key: 'detail', label: 'Detail', type: 'textarea', placeholder: 'Description, root cause, corrective action...' },
    ],
  };

  const enhanced = sites.filter((s) => s.tier === 'enhanced');
  const worst = sites.slice().sort((a, b) => (b.composite || 0) - (a.composite || 0))[0] || ({} as CoSite);

  return (
    <BpComposer
      eyebrow="Clinical development -- operations"
      title="Clinical operations"
      state={
        enhanced.length
          ? <><b>{enhanced.length}</b> of <b>{sites.length}</b> study sites are enhanced-tier and need on-site monitoring -- {worst.name} leads at composite <b>{worst.composite}</b>. Central monitoring holds the rest.</>
          : <>All <b>{sites.length}</b> sites are at standard or reduced monitoring -- no enhanced visits required.</>
      }
      starters={[
        'Which sites are behind enrollment and why?',
        'Summarize the open protocol deviations and CAPA status',
        'Prep the next DSMB data package',
        'What is the gap to database lock on the pivotal study?',
      ]}
      primary={<button className="sp-primary" onClick={() => setSiteForm(true)}>{I.plus} Add study site</button>}
      queue={[
        { ico: 'alertTriangle', title: worst.name + ' -- enhanced tier', sub: 'composite ' + worst.composite + ' -- ' + worst.driver, tone: 'warn', action: 'Review', cmd: 'Explain the drivers behind the highest-risk site and the monitoring it needs.' },
        { ico: 'shieldCheck', title: 'DSMB data package due', sub: 'Interim review 4 -- Q3 2026', tone: 'info', action: 'Prep', cmd: 'Prepare the DSMB data package for interim review 4' },
        { ico: 'clipboardList', title: 'Open protocol deviation -- CAPA', sub: 'Site 1117 -- informed-consent version lag', tone: 'warn', action: 'Open', cmd: 'Open the site 1117 informed-consent deviation and draft the CAPA' },
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard
          title="Site-risk assessment -- RBM"
          sample
          meta="site-risk-engine composite"
          foot={
            <SpAsk
              onAsk={ask}
              cmd="Recompute site risk and show the enhanced-tier sites with drivers and the monitoring recommendation."
              label="Recompute & prioritize monitoring"
            />
          }
        >
          <p className="co-assess-lead">
            {enhanced.length} of {sites.length} sites are <b>enhanced-tier</b> and need on-site monitoring; central monitoring holds the remaining {sites.length - enhanced.length} at standard or reduced. Composite scores are the governed site-risk-engine output -- AnA ranks and explains them, it doesn't recompute them here.
          </p>
          <div className="sp-list">
            {enhanced.map((s, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">Site {s.n}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.name} -- composite {s.composite}</span>
                  <span className="sp-row-s">{s.driver}{s.open ? ` -- ${s.open} open signal${s.open > 1 ? 's' : ''}` : ''}</span>
                </span>
                <span className="sp-sev" data-s="high">enhanced</span>
              </div>
            ))}
          </div>
          <div className="co-reco">{I.shieldCheck} Recommendation -- schedule enhanced monitoring visits for these {enhanced.length} sites; maintain central monitoring elsewhere. Every visit writes a §11 audit entry.</div>
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard title="Studies & enrollment" sample meta="Phase 1 -> 3">
          <div className="sp-list">
            {CO_STUDIES.map((s, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Summarize the status of study ${s.id}`)}>
                <span className="sp-tag">{s.id}</span>
                <span className="sp-tag2">Ph {s.phase}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.design} -- N={s.n}/{s.target}</span>
                  <span className="sp-row-s">{s.note}</span>
                </span>
                {pill(s.status)}
              </button>
            ))}
          </div>
        </SpCard>
      </div>

      <div className="sp-2col">
        <SpCard
          title="Study sites -- monitoring tier"
          meta={sites.length + ' sites'}
          action={<AddBtn onClick={() => setSiteForm(true)} label="Add site" />}
          foot={<SpAsk onAsk={ask} cmd="Open the central-monitoring view across all sites." label="Central monitoring" />}
        >
          <div className="sp-list">
            {sites.map((s, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Explain the site-risk drivers for ${s.name} (site ${s.n}).`)}>
                <span className="sp-tag">Site {s.n}</span>
                <span className="sp-tag2">{s.country}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.name}{s.composite != null ? ` -- composite ${s.composite}` : ''}</span>
                  <span className="sp-row-s">{s.driver}</span>
                </span>
                <span className="sp-sev" data-s={s.tier === 'enhanced' ? 'high' : s.tier === 'standard' ? 'med' : 'low'}>{s.tier}</span>
              </button>
            ))}
          </div>
        </SpCard>

        <SpCard title="DSMB & interim reviews" sample meta="independent monitoring">
          <div className="sp-list">
            {CO_DSMB.map((d, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{d.n}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.outcome}</span>
                  <span className="sp-row-s">{d.date}</span>
                </span>
                <span className={'rd-chip tone-' + d.tone}>cleared</span>
              </div>
            ))}
          </div>
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard
          title="Protocol deviations"
          meta={devs.length + ' open'}
          action={<AddBtn onClick={() => setDevForm(true)} label="Log deviation" />}
        >
          <div className="sp-list">
            {devs.map((d, i) => (
              <div key={i} className={rowcls(d)}>
                <span className="sp-sev" data-s={d.sev}>{d.sev}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.title}</span>
                  <span className="sp-row-s">{d.site} -- {d.capa}</span>
                </span>
                {pill(d.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>

      {siteForm && (
        <C2CForm
          config={SITE_FORM}
          onCancel={() => setSiteForm(false)}
          onSubmit={(v) => {
            addSite({
              n: v.n,
              name: v.name,
              country: v.country,
              composite: null,
              tier: v.tier,
              driver: 'New site -- composite pending first RBM cycle',
              open: 0,
              high: 0,
            });
            setSiteForm(false);
            fireToast('Site activated -- ' + v.n + ' (' + v.country + ')');
          }}
        />
      )}
      {devForm && (
        <C2CForm
          config={DEV_FORM}
          onCancel={() => setDevForm(false)}
          onSubmit={(v) => {
            addDev({ sev: v.sev, site: v.site, title: v.title, capa: v.capa, status: v.status });
            setDevForm(false);
            fireToast('Deviation logged -- ' + v.site);
          }}
        />
      )}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
