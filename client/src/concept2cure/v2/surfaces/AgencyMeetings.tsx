import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* -- Inline fixture types -- */

interface Meeting {
  id: string;
  type: string;
  agency: string;
  cat: string;
  program: string;
  status: string;
  requested: string | null;
  granted: string | null;
  meets: string | null;
  clock: string;
  format: string;
  goal: string;
  _new?: boolean;
}

interface BbSection {
  n: string;
  label: string;
  st: string;
  focus?: boolean;
}

interface BbQuestion {
  q: string;
  area: string;
  pos: string;
}

interface BriefingBook {
  title: string;
  state: string;
  ver: string;
  owner: string;
  sections: BbSection[];
  questions: BbQuestion[];
}

interface Commitment {
  c: string;
  doc: string;
  due: string;
  st: string;
}

interface Minutes {
  received: string;
  agree: string[];
  commitments: Commitment[];
}

/* live row = a meeting plus its nested briefing book + minutes (JSONB) */
type LiveMeeting = Meeting & {
  briefingBook?: BriefingBook | null;
  minutes?: Minutes | null;
};

/* -- Inline fixture data (kit-identical) -- */

const MTG_LIST: Meeting[] = [
  {
    id: 'm1', type: 'Pre-IND', agency: 'FDA · CDER', cat: 'Type B', program: 'BX-204 · IND', status: 'granted',
    requested: '2026-05-02', granted: '2026-05-20', meets: '2026-07-08', clock: 'WRR due 2026-06-24',
    format: 'Written responses + teleconference', goal: 'Align on the nonclinical package and Phase 1 design before IND.',
  },
  {
    id: 'm2', type: 'End-of-Phase-2', agency: 'FDA · CDER', cat: 'Type B (EOP2)', program: 'BX-204 · NDA', status: 'requested',
    requested: '2026-06-10', granted: null, meets: null, clock: 'FDA grant/deny due 2026-06-31',
    format: 'Face-to-face', goal: 'Agree the Phase 3 pivotal design, endpoints, and the SAP before committing.',
  },
  {
    id: 'm3', type: 'Pre-Submission (Q-Sub)', agency: 'FDA · CDRH', cat: 'Q-Sub', program: 'Aurora CGM · 510(k)', status: 'held',
    requested: '2026-03-01', granted: '2026-03-18', meets: '2026-04-22', clock: 'Minutes received',
    format: 'Teleconference', goal: 'Confirm predicate strategy and the human-factors validation plan.',
  },
  {
    id: 'm4', type: 'Scientific Advice', agency: 'EMA · CHMP/SAWP', cat: 'EMA SA', program: 'BX-204 · MAA', status: 'planned',
    requested: null, granted: null, meets: '2026-09-15 (target)', clock: 'Letter of Intent by 2026-07-20',
    format: 'SAWP discussion', goal: 'Parallel EU view on the pivotal design + confirmatory evidence.',
  },
];

const MTG_BB: Record<string, BriefingBook> = {
  m1: {
    title: 'Pre-IND briefing book · BX-204', state: 'In review', ver: 'v0.8', owner: 'J. Chen',
    sections: [
      { n: '1', label: 'Product & regulatory history', st: 'approved' },
      { n: '2', label: 'Nonclinical pharmacology / toxicology summary', st: 'review' },
      { n: '3', label: 'CMC overview', st: 'review' },
      { n: '4', label: 'Proposed Phase 1 clinical protocol synopsis', st: 'draft' },
      { n: '5', label: 'Specific questions to the Agency', st: 'draft', focus: true },
    ],
    questions: [
      { q: 'Does the Agency agree the 13-week GLP tox package supports the proposed Phase 1 starting dose?', area: 'Nonclinical', pos: 'Supported by MABEL + 10x safety factor.' },
      { q: 'Is the proposed first-in-human dose-escalation scheme (3+3) acceptable?', area: 'Clinical', pos: 'Aligns with precedent in RTK-X inhibitors.' },
      { q: 'Does the Agency concur the comparability protocol is sufficient for the planned process change?', area: 'CMC', pos: 'Pending the S3.2.S.4 reconciliation.' },
    ],
  },
  m3: {
    title: 'Pre-Sub briefing book · Aurora CGM', state: 'Final', ver: 'v1.0', owner: 'M. Webb',
    sections: [
      { n: '1', label: 'Device description & intended use', st: 'approved' },
      { n: '2', label: 'Proposed predicate & SE rationale', st: 'approved' },
      { n: '3', label: 'Human-factors validation plan', st: 'approved' },
      { n: '4', label: 'Specific questions to the Agency', st: 'approved', focus: true },
    ],
    questions: [
      { q: 'Does CDRH agree K221847 is an appropriate primary predicate?', area: 'Predicate', pos: 'Same intended use; iCGM special controls.' },
      { q: 'Is the summative human-factors protocol adequate for the use-related risks?', area: 'Human factors', pos: '15 users/group per IEC 62366-1.' },
    ],
  },
};

const MTG_MINUTES: Record<string, Minutes> = {
  m3: {
    received: '2026-04-29',
    agree: [
      'CDRH concurred K221847 is an acceptable primary predicate.',
      'Summative HF protocol acceptable with critical-task list expanded to include sensor insertion.',
    ],
    commitments: [
      { c: 'Expand HF critical-task analysis to cover insertion-site errors.', doc: 'Human-factors validation plan', due: 'Before 510(k)', st: 'open' },
      { c: 'Provide stratified MARD by age band in the clinical performance report.', doc: 'Performance -- clinical', due: 'In submission', st: 'open' },
    ],
  },
};

/* -- Inline shared helpers -- */

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

function MtgStat({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={'mtg-stat ' + (tone || '')}>{children}</span>;
}

/* ════ AgencyMeetings -- agency meetings & briefing books surface ════ */

export function AgencyMeetings({ onAsk, onNav }: SurfaceViewProps) {
  const [meetings, setMeetings] = useState<Meeting[]>(() => MTG_LIST.map((r) => ({ ...r })));
  const [bbMap, setBbMap] = useState<Record<string, BriefingBook>>(MTG_BB);
  const [minMap, setMinMap] = useState<Record<string, Minutes>>(MTG_MINUTES);
  const [sample, setSample] = useState(true);
  const [sel, setSel] = useState('m1');
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const m = meetings.find((x) => x.id === sel) || meetings[0];

  const addMeeting = (r: Meeting) => {
    const row = { ...r, _new: true };
    setMeetings((rs) => [row, ...rs]);
    setTimeout(
      () => setMeetings((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))),
      1500,
    );
  };

  /* live ?? fixture — adopt the org's seeded agency meetings (and each row's
     nested briefing book + minutes) when the store returns the full meeting
     shape, else keep the codebase fixture so the surface is never empty. Never
     fabricates. Local form-added rows then work off whichever set loaded. */
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: LiveMeeting[] }>('/api/agency-meetings', { data: [] }).then((res) => {
      if (cancelled) return;
      const list = res.data?.data;
      if (
        !res.sample &&
        Array.isArray(list) &&
        list.length > 0 &&
        list[0]?.id &&
        list[0]?.type &&
        list[0]?.status
      ) {
        setMeetings(list.map(({ briefingBook: _bb, minutes: _mn, ...row }) => row));
        const bb: Record<string, BriefingBook> = {};
        const mn: Record<string, Minutes> = {};
        for (const r of list) {
          if (r.briefingBook) bb[r.id] = r.briefingBook;
          if (r.minutes) mn[r.id] = r.minutes;
        }
        setBbMap(bb);
        setMinMap(mn);
        setSel((cur) => (list.some((s) => s.id === cur) ? cur : list[0].id));
        setSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const MTG_FORM: C2CFormConfig = {
    eyebrow: 'Agency interaction · new request',
    title: 'Request an agency meeting',
    governed:
      'A meeting request is a governed interaction -- the request and its briefing-book plan are recorded with an audit entry.',
    submitLabel: 'Create request',
    fields: [
      {
        key: 'type', label: 'Meeting type', type: 'select',
        options: ['Pre-IND', 'INTERACT', 'Type A', 'Type B', 'Type C', 'End-of-Phase-2', 'Pre-NDA', 'Pre-BLA', 'Pre-Submission (Q-Sub)', 'Scientific Advice'],
        required: true,
      },
      {
        key: 'agency', label: 'Agency', type: 'select',
        options: ['FDA · CDER', 'FDA · CBER', 'FDA · CDRH', 'EMA · CHMP/SAWP', 'PMDA', 'Health Canada', 'MHRA'],
        required: true, half: true,
      },
      { key: 'cat', label: 'Category', type: 'text', placeholder: 'e.g. Type B', half: true },
      {
        key: 'program', label: 'Program', type: 'select',
        options: ['BX-204 · IND', 'BX-204 · NDA', 'BX-204 · MAA', 'AltexaTab · NDA', 'Aurora CGM · 510(k)'],
        required: true,
      },
      {
        key: 'format', label: 'Format', type: 'select',
        options: ['Face-to-face', 'Teleconference', 'Written responses only', 'Written responses + teleconference'],
        default: 'Teleconference', half: true,
      },
      { key: 'requested', label: 'Requested date', type: 'date', half: true },
      { key: 'goal', label: 'Meeting objective', type: 'textarea', placeholder: 'What alignment are you seeking?', required: true },
    ],
  };

  const submitMtg = (v: Record<string, string>) => {
    const id = 'm' + Date.now();
    addMeeting({
      id,
      type: v.type,
      agency: v.agency,
      cat: v.cat || v.type,
      program: v.program,
      status: 'requested',
      requested: v.requested || '--',
      granted: null,
      meets: null,
      clock: 'FDA grant/deny pending',
      format: v.format,
      goal: v.goal,
    });
    setForm(false);
    setSel(id);
    fireToast('Meeting request created · ' + v.type);
  };

  const bb: BriefingBook | undefined = bbMap[sel];
  const min: Minutes | undefined = minMap[sel];
  const stTone: Record<string, string> = { granted: 'ok', held: 'ok', requested: 'warn', planned: 'idle' };
  const ssTone: Record<string, string> = { approved: 'ok', review: 'warn', draft: 'idle', final: 'ok' };

  return (
    <div className="page-inner reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform · agency interactions <SampleTag sample={sample} /></div>
          <h1 className="reg-title">Meetings &amp; briefing books</h1>
          <p className="reg-sub">
            The regulator interactions that gate a program -- Pre-IND, INTERACT,
            Type A/B/C/D, EOP2, pre-NDA/BLA, device Q-Sub, EMA Scientific
            Advice. Each is built around a briefing book and resolves to minutes
            and commitments that flow into the dossier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="reg-cta" onClick={() => setForm(true)}>
            {I.plus} Request meeting
          </button>
          {onAsk && (
            <button
              className="reg-cta sm"
              onClick={() =>
                onAsk(
                  'Draft a Pre-IND meeting request and briefing book for BX-204',
                )
              }
            >
              {I.sparkles} Prepare with AnA
            </button>
          )}
        </div>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi">
          <div className="reg-kpi-v">{meetings.length}</div>
          <div className="reg-kpi-l">Meetings</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v" data-tone="warn">
            Jul 8
          </div>
          <div className="reg-kpi-l">Next -- Pre-IND WRR Jun 24</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v">5</div>
          <div className="reg-kpi-l">Open questions to agencies</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v" data-tone="warn">
            2
          </div>
          <div className="reg-kpi-l">Open commitments</div>
        </div>
      </div>

      <div className="mtg-split">
        <div className="mtg-list">
          {meetings.map((x) => (
            <button
              key={x.id}
              className={
                'mtg-card' +
                (x.id === sel ? ' on' : '') +
                (x._new ? ' de-row-new' : '')
              }
              onClick={() => setSel(x.id)}
            >
              <div className="mtg-card-top">
                <span className="mtg-cat">{x.cat}</span>
                <MtgStat tone={stTone[x.status]}>{x.status}</MtgStat>
              </div>
              <div className="mtg-card-t">{x.type}</div>
              <div className="mtg-card-m">
                {x.agency} · {x.program}
              </div>
              <div className="mtg-card-clock">
                {I.clock} {x.meets || x.clock}
              </div>
            </button>
          ))}
        </div>

        <div className="mtg-detail">
          <div className="mtg-dh">
            <div>
              <div className="mtg-dh-t">
                {m.type} · {m.program}
              </div>
              <div className="mtg-dh-m">
                {m.agency} · {m.cat} · {m.format}
              </div>
            </div>
            <MtgStat tone={stTone[m.status]}>{m.status}</MtgStat>
          </div>
          <div className="mtg-goal">
            {I.target || I.flag} {m.goal}
          </div>
          <div className="mtg-clockline">
            <span>
              {I.clock} {m.clock}
            </span>
            {m.requested && <span>Requested {m.requested}</span>}
            {m.granted && <span>Granted {m.granted}</span>}
            {m.meets && <span>Meets {m.meets}</span>}
          </div>

          {bb ? (
            <div className="mtg-bb">
              <div className="mtg-bb-h">
                <span className="mtg-bb-l">
                  {I.book || I.fileText} Briefing book · {bb.ver} · {bb.state} ·{' '}
                  {bb.owner}
                </span>
                <div className="mtg-bb-acts">
                  <button
                    className="reg-mini"
                    onClick={() => onNav && onNav('dossier')}
                  >
                    {I.fileText} Open document
                  </button>
                  <button className="reg-mini">{I.download} PDF</button>
                </div>
              </div>
              <div className="mtg-bb-secs">
                {bb.sections.map((s) => (
                  <div
                    key={s.n}
                    className={'mtg-sec' + (s.focus ? ' focus' : '')}
                  >
                    <span className="mtg-sec-n">{s.n}</span>
                    <span className="mtg-sec-l">{s.label}</span>
                    <MtgStat tone={ssTone[s.st]}>{s.st}</MtgStat>
                  </div>
                ))}
              </div>
              <div className="mtg-q-h">Questions to the agency</div>
              {bb.questions.map((q, i) => (
                <div key={i} className="mtg-q">
                  <div className="mtg-q-top">
                    <span className="mtg-q-area">{q.area}</span>
                  </div>
                  <div className="mtg-q-q">{q.q}</div>
                  <div className="mtg-q-pos">
                    {I.arrowRight} Our position: {q.pos}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mtg-empty">
              <div className="mtg-empty-i">{I.book || I.fileText}</div>
              <div className="mtg-empty-t">No briefing book yet</div>
              <div className="mtg-empty-d">
                {m.status === 'requested'
                  ? 'Meeting requested -- draft the briefing book now so it is ready when the Agency grants.'
                  : 'Start the briefing book for this interaction.'}
              </div>
              {onAsk && (
                <button
                  className="reg-cta sm"
                  onClick={() =>
                    onAsk(
                      'Draft the briefing book for the ' +
                        m.type +
                        ' meeting on ' +
                        m.program,
                    )
                  }
                >
                  {I.sparkles} Draft briefing book with AnA
                </button>
              )}
            </div>
          )}

          {min && (
            <div className="mtg-min">
              <div className="mtg-min-h">
                {I.checkCircle || I.check} Meeting minutes · received{' '}
                {min.received}
              </div>
              <div className="mtg-min-sub">Agency agreements</div>
              <ul className="mtg-min-list">
                {min.agree.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="mtg-min-sub">Commitments arising</div>
              {min.commitments.map((c, i) => (
                <div key={i} className="mtg-commit" data-st={c.st}>
                  <span className="mtg-commit-c">{c.c}</span>
                  <span className="mtg-commit-meta">
                    &rarr; {c.doc} · {c.due}
                  </span>
                  <MtgStat tone={c.st === 'open' ? 'warn' : 'ok'}>
                    {c.st}
                  </MtgStat>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {form && (
        <C2CForm
          config={MTG_FORM}
          onCancel={() => setForm(false)}
          onSubmit={submitMtg}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
