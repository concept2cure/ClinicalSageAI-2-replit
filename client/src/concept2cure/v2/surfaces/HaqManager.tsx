import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Display types — aligned to the GET /api/haq-manager/rounds contract.
   server/routes/haq-manager.ts maps the governed HAQ store (feature store over
   project_memory_entries, category 'haq_question') onto exactly these keys, so
   these are the real backend columns, not a fixture. ── */

interface HaqCite {
  src: string;
  ok: boolean;
}

interface HaqRound {
  // Columns the /rounds mapper returns from each stored authority letter.
  id: string;
  agency: string;
  flag: string;
  authority: string;
  submission: string;
  type: string;
  received: string;
  due: string;
  clockDays: number;
  clockTotal: number;
  note: string;
}

interface HaqQuestion {
  // Columns the /rounds mapper returns for each stored question. A question
  // logged through POST /questions is persisted with empty analysis/draft and
  // empty cites/commitments (and possibly an empty owner) until AnA drafts it,
  // so those render honestly-empty — never fabricated. `roundId` is stamped by
  // the mapper; `_new` is a client-only optimistic-add marker.
  id: string;
  disc: string;
  tone: string;
  status: string;
  owner: string;
  q: string;
  analysis: string;
  draft: string;
  cites: HaqCite[];
  commitments: string[];
  precedentNote: string;
  roundId?: string;
  _new?: boolean;
}

interface RoundsData {
  rounds: HaqRound[];
  questions: Record<string, HaqQuestion[]>;
}

/* Stable empty references so `useLiveData` returning a fresh null every render
   (while loading / on error) never feeds a new [] or {} identity into derived
   render state. */
const EMPTY_ROUNDS: HaqRound[] = [];
const EMPTY_QUESTIONS: Record<string, HaqQuestion[]> = {};

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
  /* Live governed HAQ store — the authority letters as "rounds" plus their
     questions grouped by round (server/routes/haq-manager.ts → GET /rounds).
     useLiveData unwraps the `{ data }` success envelope, so the payload is the
     RoundsData object directly (not `.data.data`): a real object, an honest
     empty, or an honest error — never a fixture. The route fails closed to
     `{ data: null }` on a store error, which surfaces here as the empty state. */
  const roundsState = useLiveData<RoundsData>('/api/haq-manager/rounds');
  const rounds = roundsState.data?.rounds ?? EMPTY_ROUNDS;
  const questionsByRound = roundsState.data?.questions ?? EMPTY_QUESTIONS;

  const [roundId, setRoundId] = useState<string>('');
  // Effective selection: adopt the first real round until the user picks one,
  // so the workbench shows a round the moment the live data resolves without a
  // seed-into-state effect (which would risk a render loop).
  const effRoundId = roundId || rounds[0]?.id || '';
  const round = rounds.find((r) => r.id === effRoundId) || rounds[0];
  const baseQs = questionsByRound[effRoundId] || [];

  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<HaqQuestion[]>([]);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const qs: HaqQuestion[] = [
    ...extra.filter((e) => e.roundId === effRoundId),
    ...baseQs,
  ].map((q) => ({
    ...q,
    status: statusMap[q.id] || q.status,
  }));
  const [activeId, setActiveId] = useState<string>('');
  const effActiveId = activeId || qs[0]?.id || '';

  const HAQ_FORM: C2CFormConfig = {
    eyebrow: 'HAQ -- log question',
    title: 'Log an agency question',
    governed:
      'Logging an agency question persists it to the response package under the selected round; AnA decomposition and source-tracing follow.',
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

  const submitHaq = async (v: Record<string, string>) => {
    const displayTone =
      v.tone === 'critical' ? 'err' : v.tone === 'minor' ? 'idle' : 'warn';

    if (!effRoundId) {
      fireToast('Select an agency round before logging a question');
      return;
    }

    // Persist through the write-back endpoint and adopt the server's mapped
    // question. Only claim the write on a 201 with a real id.
    try {
      const res = await apiRequest('POST', '/api/haq-manager/questions', {
        roundId: effRoundId,
        qid: v.id || undefined,
        disc: v.disc,
        tone: displayTone,
        q: v.q,
        owner: v.owner,
        status: 'draft',
      });
      if (!res.ok) {
        // apiRequest only reaches here non-OK on 401 (auth); others throw.
        fireToast('Could not log question -- sign in and retry');
        return;
      }
      const body = await res.json().catch(() => null);
      const created = body?.data;
      if (!created || !created.id) {
        fireToast('Could not log question -- unexpected response');
        return;
      }
      setExtra((xs) => [
        { ...(created as HaqQuestion), roundId: effRoundId, _new: true },
        ...xs,
      ]);
      setForm(false);
      setActiveId(created.id);
      fireToast('Question logged -- ' + created.id);
    } catch (e) {
      fireToast(
        'Could not log question -- ' +
          (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  const q = qs.find((x) => x.id === effActiveId) || qs[0];

  /* eslint-disable react-hooks/exhaustive-deps -- kit pattern: q/round derived from deps */
  useEffect(() => {
    try {
      if ((window as any).C2C) {
        (window as any).C2C.setContext({
          entityType: 'haq',
          entityId: effActiveId,
          entityLabel:
            (round?.id || effRoundId) +
            ' -- ' +
            ((q && q.id) || 'question'),
        });
      }
    } catch (_e) {
      /* noop */
    }
  }, [effActiveId, effRoundId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Local-only status transition (Route to review / Approve). NOTE: this does
  // NOT persist — the /review and /approve endpoints key on a numeric db id, not
  // the display qid, so wiring them is left for the actions pass. See report.
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
            <div className="sec-kicker">PLATFORM -- POST-SUBMISSION</div>
            <h1 className="haq-title">Health authority questions</h1>
            <p className="haq-sub">
              Agency information requests and lists of questions -- decomposed,
              source-traced, answered with precedent, and governed onto the
              response package.
            </p>
          </div>
          {rounds.length > 0 && (
            <button
              className="reg-cta"
              style={{ flexShrink: 0, alignSelf: 'flex-start' }}
              onClick={() => setForm(true)}
            >
              {I.plus} Log question
            </button>
          )}
        </div>

        {roundsState.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
            Loading agency questions…
          </div>
        ) : roundsState.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load agency questions"
            hint="The governed HAQ response store didn't respond. These are the organization's FDA / EMA / PMDA information-request rounds and their questions — sign in and retry, or check the service is reachable."
          />
        ) : rounds.length === 0 ? (
          <EmptyState
            icon={I.fileText}
            title="No agency questions yet"
            hint="When an FDA Information Request, EMA Day-120 List of Questions, or PMDA query letter is logged, its rounds and questions appear here — decomposed, source-traced, and governed onto the response package."
          />
        ) : (
          <>
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
                    data-on={r.id === effRoundId || undefined}
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
                    data-on={x.id === effActiveId || undefined}
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
                      {x.owner || 'Unassigned'}
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
                      <p>
                        {q.analysis ||
                          'Not yet analyzed -- ask AnA to decompose what the agency is really asking.'}
                      </p>
                    </div>
                  </div>

                  <div className="haq-resp">
                    <div className="haq-resp-h">
                      <span className="haq-resp-l">Drafted response</span>
                      <span className="haq-resp-by">
                        Traced to the locked dossier
                      </span>
                    </div>
                    <p className="haq-resp-text">
                      {q.draft ||
                        'No draft yet -- ask AnA to draft a source-traced response.'}
                    </p>
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
                          {I.check} Approve
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
                        {I.checkCircle} Approved locally -- e-signature &amp;
                        package assembly not yet wired
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
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
