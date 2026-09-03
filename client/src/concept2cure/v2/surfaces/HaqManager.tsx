import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob, downloadText, safeFileName } from '../download';
import { shellProgramName } from '../shellProject';

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
  /** Numeric feature-store row id — the key the /review//approve endpoints
      require. Emitted by the /rounds mapper alongside the display qid. */
  dbId?: number;
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

/* ════ HaqManager -- Health Authority Questions response workbench ════ */

export function HaqManager({ onAsk }: SurfaceViewProps) {
  /* The open programme, named as a person would say it — never a hardcoded
     product. `null` when no programme is open, and every caller below phrases
     its request without one rather than substituting a placeholder: an
     assistant that has to ask which programme beats one confidently answering
     about the wrong one. */
  const program = shellProgramName();

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

  /* AnA can open any agency question by its id or a phrase from its text — the
     same row click a person makes — switching rounds if the question lives in
     another one, so its analysis, draft and commitments show. Resolved across
     the REAL store with honest misses; held (retry) while the rounds load.
     Selecting is view-state only — drafting an answer and committing a response
     stay governed human acts, never reachable from here. */
  useSurfaceActionHandlers('haq-manager', {
    'haq-manager.select-question': (params) => {
      const raw = String(params.question ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a question by its id or a phrase from its text.' };
      if (roundsState.loading) return { ok: false, reason: 'The HAQ rounds are still loading.', retry: true };
      if (roundsState.error) {
        return { ok: false, reason: 'The HAQ store did not respond, so there are no questions to open.' };
      }
      // Every question across every round, plus optimistic local adds, deduped
      // by display id (persisted first so its real dbId wins over an add).
      const seen = new Set<string>();
      const all: HaqQuestion[] = [];
      for (const cand of [...Object.values(questionsByRound).flat(), ...extra]) {
        if (seen.has(cand.id)) continue;
        seen.add(cand.id);
        all.push(cand);
      }
      if (all.length === 0) return { ok: false, reason: 'No agency questions are recorded yet.' };
      const needle = raw.toLowerCase();
      const exact = all.filter((c) => c.id.toLowerCase() === needle);
      const hits = exact.length ? exact : all.filter((c) => (c.q ?? '').toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No agency question matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} questions — use the exact id.` };
      const hit = hits[0];
      if (hit.roundId && hit.roundId !== effRoundId) setRoundId(hit.roundId);
      setActiveId(hit.id);
      return { ok: true, detail: `Opened ${hit.id}` };
    },
  });
  useEffect(() => {
    if (!roundsState.loading && !roundsState.error) notifySurfaceActionReady('haq-manager');
  }, [roundsState.loading, roundsState.error]);

  const HAQ_FORM: C2CFormConfig = {
    eyebrow: 'HAQ — log question',
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
      fireToast('Select an agency round before logging a question', 'error');
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
        fireToast('Could not log question — sign in and retry', 'error');
        return;
      }
      const body = await res.json().catch(() => null);
      const created = body?.data;
      if (!created || !created.id) {
        fireToast('Could not log question — unexpected response', 'error');
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
        'error',
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
    } catch {
      /* noop */
    }
  }, [effActiveId, effRoundId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // REAL status transition: POSTs to the governed HAQ store. The /rounds
  // mapper now emits the numeric dbId each endpoint keys on, so Route-to-review
  // and Approve persist server-side; the local statusMap is only updated after
  // the server confirms (adopting the server's status), never optimistically.
  const setStatus = async (q: HaqQuestion, st: 'in-review' | 'approved') => {
    if (q.dbId == null || !q.roundId) {
      fireToast('This question predates the id-mapped feed — reload the rounds to enable governed transitions.', 'error');
      return;
    }
    const verb = st === 'approved' ? 'approve' : 'review';
    try {
      const res = await apiRequest('POST', `/api/haq-manager/letters/${encodeURIComponent(q.roundId)}/questions/${q.dbId}/${verb}`, {});
      const json = await res.json().catch(() => null);
      if (!res.ok || !(json as any)?.success) {
        fireToast(res.status === 401 ? 'Sign in to update the question.' : `Couldn’t ${verb} — ` + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was persisted.', 'error');
        return;
      }
      const serverStatus = String((json as any)?.data?.status ?? st);
      const display = serverStatus === 'in_review' ? 'in-review' : serverStatus;
      setStatusMap((m) => ({ ...m, [q.id]: display }));
      fireToast((st === 'approved' ? 'Approved ' : 'Routed to review ') + q.id + ' — persisted to the HAQ store.');
    } catch (e) {
      fireToast(`Couldn’t ${verb} — ` + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  /* ── "Assemble response package" ───────────────────────────────────────────
     The primary action of the whole workbench, and it had NO onClick at all:
     a user approved every question in the round, clicked the one button
     everything else builds toward, and nothing happened.

     POST /api/haq-manager/letters/:id/assemble assembles the package from the
     round's own approved responses — question text, approved response,
     citations, commitments, in question order — and REFUSES with the list of
     what is outstanding if any question is unapproved. The Markdown it returns
     downloads as-is, or goes to the DOCX/PDF renderer. Nothing is drafted on
     the way through. */
  const [assembling, setAssembling] = useState<'docx' | 'md' | null>(null);
  const assemble = async (format: 'docx' | 'md') => {
    if (assembling || !round) return;
    setAssembling(format);
    try {
      const res = await apiRequest('POST', `/api/haq-manager/letters/${encodeURIComponent(round.id)}/assemble`, {});
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; data?: { markdown: string; title: string; questionCount: number; questionsWithNoResponseText: string[] } }
        | null;
      if (!res.ok || json?.success !== true || !json.data?.markdown) {
        fireToast(
          // `json.error` was read raw — an enum token or internal string would
          // have reached the toast. The canonical reader filters both.
          'The package was not assembled — ' + (serverMessage(json) ?? `the server refused it (HTTP ${res.status})`),
          'error',
        );
        return;
      }
      const { markdown, title, questionCount, questionsWithNoResponseText } = json.data;
      const base = safeFileName(title, 'haq-response-package');
      let ok: boolean;
      if (format === 'md') {
        ok = downloadText(base + '.md', markdown, 'text/markdown;charset=utf-8');
      } else {
        const r2 = await apiRequest('POST', '/api/concept2cure/artifacts/export-docx', { title, content: markdown });
        if (!r2.ok) {
          const b = await r2.json().catch(() => null);
          fireToast(
            'The package assembled but the Word file was not produced — ' +
              ((b as any)?.error?.message ?? (b as any)?.error ?? `HTTP ${r2.status}`) + '.',
            'error',
          );
          return;
        }
        ok = downloadBlob(base + '.docx', await r2.blob());
      }
      fireToast(
        ok
          ? `Response package downloaded — ${questionCount} approved response${questionCount === 1 ? '' : 's'}.` +
              (questionsWithNoResponseText.length
                ? ` ${questionsWithNoResponseText.join(', ')} ${questionsWithNoResponseText.length === 1 ? 'carries' : 'carry'} no response text.`
                : '')
          : 'The package was built but the browser refused the download.',
        ok ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast('The package was not assembled — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    } finally {
      setAssembling(null);
    }
  };

  const approved = qs.filter((x) => x.status === 'approved').length;
  const pct = qs.length ? Math.round((approved / qs.length) * 100) : 0;
  const stPill = (s: string) =>
    s === 'approved' ? 'complete' : s === 'in-review' ? 'review' : 'draft';
  const stLbl = (s: string) =>
    s === 'approved' ? 'Approved' : s === 'in-review' ? 'In review' : 'Draft';

  /* WHAT ANA SEES HERE. An agency question has a clock on it, so the round's
     due date and remaining days travel — "what is due first" is the question
     most often asked on this screen, and it cannot be answered from a question
     list alone.

     Question TEXT is deliberately not published. The summary carries counts,
     disciplines and status; the verbatim agency wording stays on the screen.
     This channel is sent on every turn and is bounded server-side, so putting
     a letter's full text through it would crowd out the rest of the context
     for no gain — AnA can be asked about a specific question, and the
     surface's own affordances hand it over deliberately when that happens. */
  const anaContext = useMemo(
    () => ({
      summary: roundsState.loading
        ? 'HAQ manager, still loading agency question rounds.'
        : roundsState.error
          ? 'HAQ manager could not load the governed question store — rounds are unavailable, not absent.'
          : rounds.length === 0
            ? 'HAQ manager: no agency question rounds logged yet.'
            : `HAQ manager: ${rounds.length} round(s)` +
              (round ? `, "${round.id}" from ${round.agency} selected (${round.type}, due ${round.due})` : '') +
              `; ${qs.length} question(s), ${approved} approved (${pct}%).`,
      facts: {
        roundsState: roundsState.loading ? 'loading' : roundsState.error ? 'error' : rounds.length === 0 ? 'empty' : 'ready',
        roundCount: rounds.length,
        ...(round
          ? {
              selectedRoundId: round.id,
              agency: round.agency,
              authority: round.authority,
              submission: round.submission,
              roundType: round.type,
              receivedOn: round.received,
              responseDue: round.due,
              clockDaysRemaining: round.clockDays,
            }
          : {}),
        questionCount: qs.length,
        questionsApproved: approved,
        percentApproved: pct,
        disciplines: [...new Set(qs.map((q) => q.disc).filter(Boolean))],
        severities: [...new Set(qs.map((q) => q.tone).filter(Boolean))],
        openBySeverity: qs.filter((q) => q.status !== 'approved').reduce<Record<string, number>>(
          (acc, q) => ({ ...acc, [q.tone || 'unspecified']: (acc[q.tone || 'unspecified'] ?? 0) + 1 }),
          {},
        ),
      },
      availableActions: [
        'Explain which questions are on the critical path for the response clock',
        'Decompose an agency question into what it is actually asking for',
        'Draft a response to a question, grounded on locked evidence',
        'Log an agency question',
      ],
    }),
    [roundsState.loading, roundsState.error, rounds, round, qs, approved, pct],
  );
  usePublishSurfaceContext('haq-manager', anaContext);

  return (
    <div className="cv-body">
      <div className="haq">
        <div className="haq-head">
          <div>
            <div className="sec-kicker">PLATFORM — POST-SUBMISSION</div>
            <h1 className="haq-title">Health authority questions</h1>
            <p className="haq-sub">
              Agency information requests and lists of questions — decomposed,
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
                        <b>{r.clockDays}d</b> of {r.clockTotal}d left — due{' '}
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
              <div className="haq-assemble-row">
                <button
                  className="haq-assemble"
                  disabled={pct < 100 || assembling !== null || qs.length === 0}
                  onClick={() => void assemble('docx')}
                  title={
                    pct < 100
                      ? 'Approve all responses to assemble the package'
                      : 'Assemble the response package as a Word document'
                  }
                >
                  {I.fileText} {assembling === 'docx' ? 'Assembling…' : 'Assemble response package'}
                </button>
                <button
                  className="haq-assemble alt"
                  disabled={pct < 100 || assembling !== null || qs.length === 0}
                  onClick={() => void assemble('md')}
                  title="Download the assembled package as Markdown"
                >
                  {assembling === 'md' ? 'Assembling…' : 'Markdown'}
                </button>
              </div>
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
                        AnA analysis — what they are really asking
                      </div>
                      <p>
                        {q.analysis ||
                          'Not yet analyzed — ask AnA to decompose what the agency is really asking.'}
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
                        'No draft yet — ask AnA to draft a source-traced response.'}
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
                          /* `for BX-204` was a string literal, so refining any
                             tenant's agency response asked about a demo
                             programme. The round already knows its own
                             submission — that is the real answer, and the open
                             programme is the fallback. */
                          `Refine the ${q.id} response to the ${round?.agency} ${round?.type}` +
                            (round?.submission ? ` for ${round.submission}` : program ? ` for ${program}` : ''),
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
                          onClick={() => setStatus(q, 'approved')}
                        >
                          {I.check} Approve
                        </button>
                      ) : (
                        <button
                          className="haq-act pri"
                          onClick={() => setStatus(q, 'in-review')}
                        >
                          {I.arrowRight} Route to review
                        </button>
                      )
                    ) : (
                      <span className="haq-approved">
                        {I.checkCircle} Approved — persisted to the HAQ store
                        (e-signature &amp; package assembly still to come)
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
