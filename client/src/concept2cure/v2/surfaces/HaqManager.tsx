import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { HAQ_ROUNDS, HAQ_QUESTIONS } from '../fixtures/haq-data';
import type { HaqQuestion, HaqRound } from '../fixtures/haq-data';
import '../styles/project-home-v2.css';

/* ── Inline shared helpers ── */

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

/* ════ HaqManager -- Health Authority Questions response workbench ════ */

export function HaqManager({ onAsk }: SurfaceViewProps) {
  /* live ?? fixture — adopt the store's rounds+questions only when the backend
     returns the full display shape, else keep the codebase fixture so the
     workbench never renders blank. Same round ids ('fda-ir1'/'ema-d120') in
     both, so the selected round survives the swap. */
  type RoundsPayload = { rounds?: HaqRound[]; questions?: Record<string, HaqQuestion[]> } | null;
  const [live, setLive] = useState<{ rounds: HaqRound[]; questions: Record<string, HaqQuestion[]> } | null>(null);
  const [sample, setSample] = useState(true);
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: RoundsPayload }>('/api/haq-manager/rounds', { data: null }).then((res) => {
      if (cancelled) return;
      const d = res.data?.data;
      if (!res.sample && d && Array.isArray(d.rounds) && d.rounds.length > 0 && d.rounds[0]?.id) {
        setLive({ rounds: d.rounds, questions: d.questions || {} });
        setSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rounds = live?.rounds ?? HAQ_ROUNDS;
  const questionsByRound = live?.questions ?? HAQ_QUESTIONS;
  const [roundId, setRoundId] = useState<string>((HAQ_ROUNDS[0]?.id ?? ''));
  const round = rounds.find((r) => r.id === roundId) || rounds[0];
  const baseQs = questionsByRound[roundId] || [];
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<HaqQuestion[]>([]);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const qs: HaqQuestion[] = [
    ...extra.filter((e) => e.roundId === roundId),
    ...baseQs,
  ].map((q) => ({
    ...q,
    status: (statusMap[q.id] || q.status) as HaqQuestion['status'],
  }));
  const [activeId, setActiveId] = useState<string>(baseQs[0]?.id ?? '');

  const HAQ_FORM: C2CFormConfig = {
    eyebrow: 'HAQ -- log question',
    title: 'Log an agency question',
    governed:
      'Logging an agency question creates a governed record on the response clock; AnA decomposition and source-tracing follow.',
    submitLabel: 'Log question',
    fields: [
      { key: 'id', label: 'Question ID', type: 'text', placeholder: 'e.g. IR-07', required: true, half: true },
      {
        key: 'disc', label: 'Discipline', type: 'select',
        options: ['Clinical', 'Nonclinical', 'CMC', 'Biostatistics', 'Labeling', 'Safety', 'Regulatory'],
        required: true, half: true,
      },
      { key: 'tone', label: 'Severity', type: 'seg', options: ['minor', 'major', 'critical'], default: 'major' },
      { key: 'owner', label: 'Owner', type: 'text', placeholder: 'Responsible reviewer', required: true },
      { key: 'q', label: 'Question text', type: 'textarea', placeholder: 'Paste the agency question verbatim...', required: true },
    ],
  };

  const submitHaq = (v: Record<string, string>) => {
    const id = v.id || 'IR-' + Date.now();
    setExtra((xs) => [
      {
        roundId,
        id,
        disc: v.disc,
        tone: v.tone === 'critical' ? 'err' : v.tone === 'minor' ? 'idle' : 'warn',
        q: v.q,
        owner: v.owner,
        status: 'draft' as const,
        _new: true,
        analysis: 'Pending AnA decomposition -- run "Refine with AnA" to analyze what the agency is really asking.',
        draft: 'Not yet drafted. Ask AnA to draft a source-traced response.',
        cites: [],
        commitments: [],
        precedentNote: 'Run a precedent compare to see how prior submissions answered this.',
      },
      ...xs,
    ]);
    setForm(false);
    setActiveId(id);
    fireToast('Question logged -- ' + id);
  };

  const q = qs.find((x) => x.id === activeId) || qs[0];

  /* eslint-disable react-hooks/exhaustive-deps -- kit pattern: q/round derived from deps */
  useEffect(() => {
    try {
      if ((window as any).C2C) {
        (window as any).C2C.setContext({
          entityType: 'haq',
          entityId: activeId,
          entityLabel:
            (round?.id || roundId) +
            ' -- ' +
            ((q && (q.label || q.text || q.id)) || 'question'),
        });
      }
    } catch (_e) {
      /* noop */
    }
  }, [activeId, roundId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const setStatus = (id: string, st: string) =>
    setStatusMap((m) => ({ ...m, [id]: st }));
  const approved = qs.filter((x) => x.status === 'approved').length;
  const pct = qs.length ? Math.round((approved / qs.length) * 100) : 0;
  const stPill = (s: string) =>
    s === 'approved' ? 'complete' : s === 'in-review' ? 'review' : 'draft';
  const stLbl = (s: string) =>
    s === 'approved' ? 'Approved' : s === 'in-review' ? 'In review' : 'Draft';

  return (
    <div className="cv-body">
      <div className="haq">
        <div className="haq-head">
          <div>
            <div className="sec-kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              PLATFORM -- POST-SUBMISSION
              <SampleTag sample={sample} />
            </div>
            <h1 className="haq-title">Health authority questions</h1>
            <p className="haq-sub">
              Agency information requests and lists of questions -- decomposed,
              source-traced, answered with precedent, and governed onto the
              response package.
            </p>
          </div>
          <button
            className="reg-cta"
            style={{ flexShrink: 0, alignSelf: 'flex-start' }}
            onClick={() => setForm(true)}
          >
            {I.plus} Log question
          </button>
        </div>

        {/* round selector */}
        <div className="haq-rounds">
          {rounds.map((r) => {
            const cp = r.clockTotal
              ? (r.clockDays / r.clockTotal) * 100
              : 0;
            const urgent = r.clockDays <= 7;
            return (
              <button
                key={r.id}
                className="haq-round"
                data-on={r.id === roundId || undefined}
                onClick={() => {
                  setRoundId(r.id);
                  const fq = (questionsByRound[r.id] || [])[0];
                  setActiveId(fq?.id ?? '');
                }}
              >
                <div className="haq-round-top">
                  <span className="haq-flag">{r.flag}</span>
                  <span className="haq-round-ag">{r.authority}</span>
                </div>
                <div className="haq-round-ty">{r.type}</div>
                <div
                  className="haq-round-clock"
                  data-urgent={urgent || undefined}
                >
                  <span className="ico">{I.clock}</span>
                  <span>
                    <b>{r.clockDays}d</b> of {r.clockTotal}d left -- due{' '}
                    {r.due}
                  </span>
                </div>
                <div className="haq-round-bar">
                  <span
                    style={{ width: cp + '%' }}
                    data-urgent={urgent || undefined}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* readiness */}
        <div className="haq-ready">
          <div className="haq-ready-l">
            <b>{approved}</b> of {qs.length} responses approved --{' '}
            {qs.length - approved} open
          </div>
          <div className="haq-ready-bar">
            <span style={{ width: pct + '%' }} />
          </div>
          <button
            className="haq-assemble"
            disabled={pct < 100}
            title={
              pct < 100
                ? 'Approve all responses to assemble the package'
                : 'Assemble the response package'
            }
          >
            {I.fileText} Assemble response package
          </button>
        </div>

        <div className="haq-grid">
          {/* question list */}
          <div className="haq-list">
            {qs.map((x) => (
              <button
                key={x.id}
                className={'haq-qrow' + (x._new ? ' de-row-new' : '')}
                data-on={x.id === activeId || undefined}
                onClick={() => setActiveId(x.id)}
              >
                <div className="haq-qrow-top">
                  <span className="haq-qid">{x.id}</span>
                  <span className="haq-disc" data-tone={x.tone}>
                    {x.disc}
                  </span>
                  <span
                    className={`status-pill ${stPill(x.status)}`}
                    style={{ marginLeft: 'auto' }}
                  >
                    {stLbl(x.status)}
                  </span>
                </div>
                <div className="haq-qrow-q">{x.q}</div>
                <div className="haq-qrow-foot">
                  <span className="ico">{I.user}</span>
                  {x.owner}
                </div>
              </button>
            ))}
          </div>

          {/* detail */}
          {q && (
            <div className="haq-detail">
              <div className="haq-d-head">
                <div className="haq-d-id">
                  {q.id} -- {q.disc}
                </div>
                <span className={`status-pill ${stPill(q.status)}`}>
                  {stLbl(q.status)}
                </span>
              </div>

              <div className="haq-ask">
                <div className="haq-ask-l">{round?.agency} asks</div>
                <p>{q.q}</p>
              </div>

              <div className="haq-analysis">
                <span className="ico">{I.sparkles}</span>
                <div>
                  <div className="haq-analysis-l">
                    AnA analysis -- what they are really asking
                  </div>
                  <p>{q.analysis}</p>
                </div>
              </div>

              <div className="haq-resp">
                <div className="haq-resp-h">
                  <span className="haq-resp-l">Drafted response</span>
                  <span className="haq-resp-by">
                    Traced to the locked dossier
                  </span>
                </div>
                <p className="haq-resp-text">{q.draft}</p>
                <div className="haq-cites">
                  <span className="haq-cites-l">Cited evidence</span>
                  {q.cites.map((c, i) => (
                    <span key={i} className="haq-cite" data-ok={c.ok}>
                      {c.ok ? I.check : I.alertTriangle} {c.src}
                    </span>
                  ))}
                </div>
                {q.commitments && q.commitments.length > 0 && (
                  <div className="haq-commit">
                    <span className="haq-commit-l">
                      {I.alertTriangle} Commitments
                    </span>
                    {q.commitments.map((c, i) => (
                      <div key={i} className="haq-commit-row">
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="haq-precedent">
                <span className="ico">{I.scale}</span>
                <div>
                  <div className="haq-precedent-l">
                    Precedent intelligence
                  </div>
                  <p>{q.precedentNote}</p>
                </div>
              </div>

              <div className="haq-actions">
                <button
                  className="haq-act"
                  onClick={() =>
                    onAsk(
                      `Refine the ${q.id} response to the ${round?.agency} ${round?.type} for BX-204`,
                    )
                  }
                >
                  {I.sparkles} Refine with AnA
                </button>
                <button
                  className="haq-act"
                  onClick={() =>
                    onAsk(
                      `Compare ${q.id} against how precedent NDAs answered this`,
                    )
                  }
                >
                  {I.gitCompare} Precedent compare
                </button>
                <div className="haq-sp" />
                {q.status !== 'approved' ? (
                  q.status === 'in-review' ? (
                    <button
                      className="haq-act pri"
                      onClick={() => setStatus(q.id, 'approved')}
                    >
                      {I.check} Approve &amp; sign
                    </button>
                  ) : (
                    <button
                      className="haq-act pri"
                      onClick={() => setStatus(q.id, 'in-review')}
                    >
                      {I.arrowRight} Route to review
                    </button>
                  )
                ) : (
                  <span className="haq-approved">
                    {I.checkCircle} Approved -- 21 CFR &sect;11 signed -- in
                    package
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {form && (
          <C2CForm
            config={HAQ_FORM}
            onCancel={() => setForm(false)}
            onSubmit={submitHaq}
          />
        )}
        <C2CToast msg={toast} />
      </div>
    </div>
  );
}
