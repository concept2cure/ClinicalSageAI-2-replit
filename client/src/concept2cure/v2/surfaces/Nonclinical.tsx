import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData, useLiveRows, type DataState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';

/* ── Inline fixture types ── */

interface NcStudy {
  // Display columns returned by listStudies() (nonclinical-service.ts):
  // { id, type, species, dur, finding, cls, send }. `id` is the human
  // study_number and `send` is a derived CASE (always present). species /
  // duration_label / key_finding / finding_class are nullable columns — and the
  // POST /studies write path does not set dur/finding/cls, so persisted studies
  // routinely carry null there. Rendered honestly (omitted when absent), never
  // fabricated. `_new` is a client-only optimistic-add marker.
  id: string;
  type: string;
  species: string | null;
  dur: string | null;
  finding: string | null;
  cls: string | null;
  send: string;
  _new?: boolean;
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

/** SEND package-readiness rollup (live projection of the governed registry). */
interface NcSendRollup {
  inScope: number;
  validated: number;
  missingDomains: string[];
  risk: 'high' | 'medium' | 'low' | 'none';
}

/** GET /api/nonclinical-summary display contract (see server m26-m4-view.ts). */
interface NcSummary {
  m26: NcM26Section[];
  m4: NcM4Placement[];
  send: NcSendRollup;
  completeness: number;
  gaps: string[];
  provisioned: boolean;
}

/* Stable empty seed for the optimistic-row store while the live studies list is
   loading. `useLiveRows` returns a fresh [] on every render until it resolves,
   which would otherwise thrash the re-seed effect in `useRows`. */
const EMPTY_STUDIES: NcStudy[] = [];

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
    received: 'ok', complete: 'ok', missing: 'err',
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

/* ── Honest loading / error / empty guard for the /api/nonclinical-summary
   object (the M2.6 / Module 4 / SEND projection). The route fails closed to a
   real ICH M4S skeleton, so `data` is normally present; a null payload or a
   failed load are still surfaced honestly — never a fixture. ── */

function SummaryBody({
  state,
  emptyTitle,
  children,
}: {
  state: DataState<NcSummary>;
  emptyTitle: string;
  children: (sum: NcSummary) => React.ReactNode;
}) {
  if (state.loading) {
    return <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (state.error) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the nonclinical summary"
        hint="The Module 2.6 / Module 4 / SEND projection didn't respond. It's computed from the governed nonclinical registry — sign in and retry, or check the service is reachable."
      />
    );
  }
  if (!state.data) {
    return <EmptyState icon={I.fileText} title={emptyTitle} />;
  }
  return <>{children(state.data)}</>;
}

/* ════ Nonclinical — CTD Module 4 surface ════ */

export function Nonclinical({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  /* Was a dead write to `c2c_open_surface`, a key with no reader — so every
     Module 4 placement row was a button that did nothing. */
  const open = (id: string) => onNav(id);
  const liveStudies = useLiveRows<NcStudy>('/api/nonclinical/studies');
  // `useLiveRows` synthesizes a FRESH [] every render whenever it has no array
  // to return (while loading AND on a failed load); feed the optimistic-row
  // store a STABLE empty seed in those states so the re-seed effect below
  // doesn't thrash. Once the org's registry resolves (rows or an honest empty
  // []), that reference is stable and becomes the seed.
  const seedStudies =
    liveStudies.loading || liveStudies.error ? EMPTY_STUDIES : liveStudies.rows;
  const [studies, addStudy] = useRows(seedStudies);

  // Live M2.6 / M4-placement / SEND projection of the governed registry
  // (server nonclinical-summary.routes.ts → m26-m4-view.ts). useLiveData unwraps
  // the `{ data }` success envelope, so the payload is the NcSummary object
  // directly (not `.data.data`): a real object, an honest empty, or an honest
  // error — never a fixture.
  const summaryState = useLiveData<NcSummary>('/api/nonclinical-summary');
  const summary = summaryState.data;
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

  const clsPill = (c: string | null) =>
    c ? (
      <span className={'rd-chip tone-' + (c === 'adverse' ? 'warn' : c === 'pending' ? 'idle' : 'ok')}>{c}</span>
    ) : null;

  return (
    <BpComposer
      eyebrow="Nonclinical -- CTD Module 4"
      title="Nonclinical & Module 4"
      state={
        summary ? (
          <><b>{studies.length}</b> GLP {studies.length === 1 ? 'study' : 'studies'} {I.dot} SEND {summary.send.risk === 'none' ? 'not in scope' : summary.send.risk + ' risk'} {I.dot} Module 2.6 {summary.completeness}% complete.</>
        ) : (
          <><b>{studies.length}</b> GLP {studies.length === 1 ? 'study' : 'studies'} in the governed nonclinical registry.</>
        )
      }
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
            {liveStudies.loading && studies.length === 0 ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading nonclinical studies…</div>
            ) : liveStudies.error && studies.length === 0 ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the nonclinical studies"
                hint="The governed nonclinical registry didn't respond. These are the organization's GLP tox / pharmacology / PK studies — sign in and retry, or check the service is reachable."
              />
            ) : studies.length === 0 ? (
              <EmptyState
                icon={I.fileText}
                title="No nonclinical studies yet"
                hint="Add a GLP tox, pharmacology, or PK study. Each is governed here — the report is classified, its SEND package is queued, and it threads into CTD Module 4."
              />
            ) : (
              studies.map((s, i) => (
                <div key={i} className={rowcls(s)}>
                  <span className="sp-tag">{s.id}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">
                      {s.type}
                      {s.species ? <> {I.dot} {s.species}</> : null}
                      {s.dur ? <> {I.dot} {s.dur}</> : null}
                    </span>
                    <span className="sp-row-s">
                      {s.finding ? <>{s.finding} {I.dot} </> : null}SEND {s.send}
                    </span>
                  </span>
                  {clsPill(s.cls)}
                </div>
              ))
            )}
          </div>
        </SpCard>
      </div>

      <div className="sp-2col">
        <SpCard
          title="SEND readiness"
          meta={summary ? `${summary.send.inScope} in-scope -- ${summary.send.risk === 'none' ? 'not in scope' : summary.send.risk + ' risk'}` : 'Pinnacle21'}
        >
          <SummaryBody state={summaryState} emptyTitle="No SEND package data yet">
            {(sum) => (
              <div className="sp-list">
                <div className="sp-row">
                  <span className="sp-row-b">
                    <span className="sp-row-t">{sum.send.validated}/{sum.send.inScope} package(s) validation-ready</span>
                    <span className="sp-row-s">
                      {sum.send.missingDomains.length > 0
                        ? 'Missing required SEND domain(s): ' + sum.send.missingDomains.join(', ')
                        : sum.send.inScope > 0
                          ? 'All required SEND domains present.'
                          : 'No SEND-mandated studies in the registry yet.'}
                    </span>
                  </span>
                  <span className={'rd-chip tone-' + (sum.send.risk === 'high' ? 'err' : sum.send.risk === 'medium' ? 'warn' : 'ok')}>
                    {sum.send.risk === 'none' ? 'not in scope' : sum.send.risk + ' risk'}
                  </span>
                </div>
              </div>
            )}
          </SummaryBody>
          <div className="sp-foot">
            <button className="sp-ask" onClick={() => ask('Run SEND conformance -- map units to controlled terminology and re-validate the package.')}>
              {I.sparkles} Run SEND conformance
            </button>
          </div>
        </SpCard>

        <SpCard title="Module 4 placement" meta="4.2.x readiness">
          <SummaryBody state={summaryState} emptyTitle="No Module 4 placement data yet">
            {(sum) => (
              <div className="sp-list">
                {sum.m4.map((m, i) => (
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
            )}
          </SummaryBody>
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard title="CTD Module 2.6 summary builder" meta="2.6.1 -- 2.6.7">
          <SummaryBody state={summaryState} emptyTitle="No Module 2.6 summary data yet">
            {(sum) => (
              <div className="sp-list">
                {sum.m26.map((m, i) => (
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
            )}
          </SummaryBody>
        </SpCard>
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
