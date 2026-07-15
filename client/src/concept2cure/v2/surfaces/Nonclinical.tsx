import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';

/* ── Inline fixture types ── */

interface NcStudy {
  id: string;
  type: string;
  species: string;
  dur: string;
  finding: string;
  cls: string;
  send: string;
  _new?: boolean;
}

interface NcSendDomain {
  d: string;
  st: string;
}

interface NcM26Section {
  n: string;
  l: string;
  st: string;
  note?: string;
}

interface NcM4Placement {
  code: string;
  l: string;
  pct: number;
}

/* ── Inline fixture data (kit window globals) ── */

const NC_STUDIES: NcStudy[] = [
  { id: 'TX-701', type: 'Repeat-dose tox', species: 'Rat', dur: '26-week', finding: 'Minimal hepatocellular hypertrophy (adaptive)', cls: 'non-adverse', send: 'conforms' },
  { id: 'TX-702', type: 'Repeat-dose tox', species: 'Cynomolgus', dur: '39-week', finding: 'No adverse findings to top dose', cls: 'clean', send: 'conforms' },
  { id: 'CARC-701', type: 'Carcinogenicity', species: 'Tg mouse', dur: '26-week', finding: 'In life -- terminal necropsy pending', cls: 'pending', send: 'in progress' },
  { id: 'PK-301', type: 'Toxicokinetics', species: 'Rat', dur: '—', finding: 'Dose-proportional exposure, no accumulation', cls: 'clean', send: 'conforms' },
  { id: 'SP-201', type: 'Safety pharm (CV)', species: 'Cynomolgus', dur: '—', finding: 'No QTc or hemodynamic effect', cls: 'clean', send: 'conforms' },
  { id: 'GT-101', type: 'Genotoxicity (Ames + MN)', species: 'in vitro / in vivo', dur: '—', finding: 'Negative across the battery', cls: 'clean', send: 'n/a' },
];

const NC_SEND: NcSendDomain[] = [
  { d: 'DM', st: 'conforms' }, { d: 'EX', st: 'conforms' }, { d: 'DS', st: 'conforms' }, { d: 'TX', st: 'conforms' },
  { d: 'MA', st: 'warn' }, { d: 'MI', st: 'conforms' }, { d: 'OM', st: 'conforms' }, { d: 'PC', st: 'conforms' },
  { d: 'PP', st: 'conforms' }, { d: 'BW', st: 'conforms' }, { d: 'CL', st: 'conforms' }, { d: 'LB', st: 'reject' },
];

const NC_M26: NcM26Section[] = [
  { n: '2.6.1', l: 'Introduction', st: 'complete' },
  { n: '2.6.2', l: 'Pharmacology written summary', st: 'complete' },
  { n: '2.6.3', l: 'Pharmacology tabulated summary', st: 'complete' },
  { n: '2.6.4', l: 'Pharmacokinetics written summary', st: 'review' },
  { n: '2.6.5', l: 'Pharmacokinetics tabulated summary', st: 'draft' },
  { n: '2.6.6', l: 'Toxicology written summary', st: 'drafting', note: 'carcinogenicity subsection held for CARC-701' },
  { n: '2.6.7', l: 'Toxicology tabulated summary', st: 'draft' },
];

const NC_M4MAP: NcM4Placement[] = [
  { code: '4.2.1', l: 'Pharmacology study reports', pct: 92 },
  { code: '4.2.2', l: 'Pharmacokinetic study reports', pct: 88 },
  { code: '4.2.3', l: 'Toxicology study reports', pct: 84 },
];

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

function useRows(seed: NcStudy[]): readonly [NcStudy[], (r: NcStudy) => void] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  // Re-seed when the live list resolves (the seed identity changes once the
  // backend responds); user-added rows before that are optimistic.
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setRows((seed || []).map((r) => ({ ...r })));
    }
  }, [seed]);
  const add = (r: NcStudy) => {
    const row: NcStudy = { ...r, _new: true };
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

/* ── SEND conformance icon helper ── */

function sendIcon(st: string): React.ReactElement {
  if (st === 'conforms') return I.check;
  if (st === 'reject') return I.close;
  if (st === 'warn') return I.alertTriangle;
  return I.dot;
}

function sendTone(st: string): string {
  if (st === 'reject') return 'err';
  if (st === 'warn') return 'warn';
  if (st === 'conforms') return 'ok';
  return 'idle';
}

/* ════ Nonclinical — CTD Module 4 surface ════ */

export function Nonclinical({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const open = (id: string) => {
    try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* noop */ }
  };
  const liveStudies = useLiveList<NcStudy>('/api/nonclinical/studies', NC_STUDIES);
  const [studies, addStudy] = useRows(liveStudies.data);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Nonclinical -- new study',
    title: 'Add a GLP study',
    governed: 'Study records are governed -- the report is classified, SEND is queued, and an audit entry is written.',
    submitLabel: 'Add study',
    fields: [
      { key: 'id', label: 'Study ID', type: 'text', placeholder: 'e.g. TX-703', required: true, half: true },
      { key: 'type', label: 'Study type', type: 'select', options: ['Repeat-dose tox', 'Single-dose tox', 'Carcinogenicity', 'Toxicokinetics', 'Safety pharm (CV)', 'Safety pharm (CNS)', 'Genotoxicity (Ames + MN)', 'Reproductive tox', 'Local tolerance'], required: true, half: true },
      { key: 'species', label: 'Species / system', type: 'select', options: ['Rat', 'Mouse', 'Tg mouse', 'Cynomolgus', 'Rabbit', 'Dog', 'in vitro', 'in vitro / in vivo'], required: true, half: true },
      { key: 'dur', label: 'Duration', type: 'text', placeholder: 'e.g. 26-week', half: true },
      { key: 'finding', label: 'Key finding', type: 'text', placeholder: 'Principal observed finding', required: true },
      { key: 'cls', label: 'Finding classification', type: 'seg', options: ['clean', 'non-adverse', 'adverse', 'pending'], default: 'pending' },
      { key: 'send', label: 'SEND status', type: 'seg', options: ['n/a', 'in progress', 'conforms'], default: 'in progress' },
    ],
  };

  const onSubmit = (v: Record<string, string>) => {
    addStudy({
      id: v.id,
      type: v.type,
      species: v.species,
      dur: v.dur || '—',
      finding: v.finding,
      cls: v.cls,
      send: v.send,
    });
    setForm(false);
    fireToast('Study added -- ' + v.id + ' -- SEND queued');
  };

  const clsPill = (c: string) => (
    <span className={'rd-chip tone-' + (c === 'adverse' ? 'warn' : c === 'pending' ? 'idle' : 'ok')}>{c}</span>
  );

  return (
    <BpComposer
      eyebrow="Nonclinical -- CTD Module 4"
      title="Nonclinical & Module 4"
      state={<><b>{studies.length}</b> GLP studies {I.dot} SEND package <b>blocked</b> on 1 reject {I.dot} Module 2.6 summary in progress.</>}
      starters={[
        'Draft the §2.6.6 toxicology written summary from the study reports',
        'Fix the SEND LB dataset reject and re-validate',
        'Classify a new tox finding as adverse or non-adverse',
        'Show the gap to a complete Module 4',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Add study</button>}
      queue={[
        { ico: 'shieldAlert', title: 'SEND LB dataset -- Reject', sub: 'Pinnacle21 rule SD0063 -- blocks Module 5 crosswalk', tone: 'err', action: 'Fix', cmd: 'Fix the SEND LB dataset reject (rule SD0063) and re-validate the package' },
        { ico: 'fileText', title: '§2.6.6 toxicology written summary drafting', sub: 'Carcinogenicity subsection held for CARC-701', tone: 'warn', action: 'Continue', cmd: 'Continue drafting the §2.6.6 toxicology written summary from the locked study reports' },
        { ico: 'clock', title: 'CARC-701 terminal necropsy pending', sub: 'Gates the 2.6.6 carcinogenicity subsection', tone: 'info', action: 'Status', cmd: 'Status of CARC-701 and its impact on the 2.6.6 carcinogenicity subsection' },
      ]}
      onAsk={ask}
    >
      <SampleTag sample={liveStudies.sample} />

      <div className="sp-sec">
        <SpCard
          title="GLP study registry"
          meta={studies.length + ' studies'}
          action={<AddBtn onClick={() => setForm(true)} label="Add study" />}
          foot={
            <SpAsk
              onAsk={ask}
              cmd="Draft the §2.6.6 toxicology written summary from the registry, with a provenance chip linking every claim to its source study."
              label="Draft M2.6 summary from registry"
            />
          }
        >
          <div className="sp-list">
            {studies.map((s, i) => (
              <div key={i} className={rowcls(s)}>
                <span className="sp-tag">{s.id}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.type} {I.dot} {s.species}{s.dur !== '—' ? ' ' + I.dot + ' ' + s.dur : ''}</span>
                  <span className="sp-row-s">{s.finding} {I.dot} SEND {s.send}</span>
                </span>
                {clsPill(s.cls)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>

      <div className="sp-2col">
        <SpCard title="SEND conformance" sample meta="12 domains -- Pinnacle21">
          <div className="nc-send">
            {NC_SEND.map((x, i) => (
              <div key={i} className="nc-send-cell" data-st={sendTone(x.st)} title={x.d + ' -- ' + x.st}>
                <span className="nc-send-d">{x.d}</span>
                <span className="nc-send-s">{sendIcon(x.st)}</span>
              </div>
            ))}
          </div>
          <div className="sp-foot">
            <button className="sp-ask" onClick={() => ask('Run SEND conformance -- map units to controlled terminology and re-validate the LB reject.')}>
              {I.sparkles} Run SEND conformance
            </button>
          </div>
        </SpCard>

        <SpCard title="Module 4 placement" sample meta="4.2.x readiness">
          <div className="sp-list">
            {NC_M4MAP.map((m, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => open('dossier')}>
                <span className="sp-tag">{m.code}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{m.l}</span>
                  <span className="pj-mod-track" style={{ marginTop: 4 }}>
                    <span className="pj-mod-fill" data-risk={m.pct < 85 || undefined} style={{ width: m.pct + '%' }} />
                  </span>
                </span>
                <span className="sp-tag2">{m.pct}%</span>
              </button>
            ))}
          </div>
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard title="CTD Module 2.6 summary builder" sample meta="2.6.1 -- 2.6.7">
          <div className="sp-list">
            {NC_M26.map((m, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Open §${m.n} ${m.l} and continue drafting`)}>
                <span className="sp-tag">{m.n}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{m.l}</span>
                  {m.note && <span className="sp-row-s">{m.note}</span>}
                </span>
                {pill(m.st)}
              </button>
            ))}
          </div>
        </SpCard>
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
