/**
 * Communication Center — the regulated FDA<>client loop hub.
 *
 * Real-data standard (no mock in product). Every DATA slice renders real
 * persisted data, an honest empty state, or an honest error state — never a
 * hardcoded fixture. Self-audit of the fixture-backed slices:
 *
 *   Agency inbox  → GET /api/concept2cure/projects/:pid/agency-communications
 *                   REAL (server routes/concept2cure.ts → concept2cure_agency_communications).
 *   Meetings      → GET /api/ha-interactions/interactions   REAL (listInteractions).
 *   Commitments   → GET /api/ha-interactions/commitments     REAL (listCommitments).
 *   Authority     → GET /api/concept2cure/projects/:pid/authority-profiles
 *   profiles        REAL (server routes/concept2cure.ts → concept2cure_authority_profiles).
 *   FDA loop      → submission-center items + CRL round-trip + deficiency gap
 *                   analysis have NO mounted read handler on this surface's API
 *                   (the /submission-center/items route is defined only in the
 *                   un-mounted concept2cure-communication-center module, and no
 *                   endpoint returns CRL deficiencies). MISSING → honest empty,
 *                   no lifecycle/CRL/deficiency data is fabricated.
 *
 * NOTE on the API base: the legacy binding called `/api/communication-center/...`,
 * which is not mounted anywhere in the server (it always fell through to the
 * fixture). The real handlers live on the concept2cure router at
 * `/api/concept2cure/projects/:projectId/*`; the project id comes from the
 * runtime project channel (window.C2C_PROJECT), and parseProjectParam requires a
 * numeric id, so with no project in context the project-scoped reads show an
 * honest "open a project" empty.
 */
import React from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { useLiveRows, useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import {
  CC_SOURCE_TYPES,
  CC_INTERACTION_TYPES,
  CC_TONE,
  CC_CLOSURE,
} from '../fixtures/commcenter';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/commcenter-v2.css';

/* ── Display rows, aligned to the REAL backend columns actually returned ── */

/**
 * GET agency-communications row. The list read does NOT project a top-level
 * taskId (task linkage is created on POST but not returned by the GET), and
 * visibilityTier is nested under auditMetadata — both are read null-safe and
 * never fabricated. Dates arrive as ISO strings; dueDate is nullable.
 */
interface CommRow {
  id: string;
  sourceType: string;
  communicationType: string;
  sourceChannel: string;
  linkedSectionCodes: string[];
  receivedDate: string;
  dueDate?: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  responseRequired: boolean;
  extractedIssues: string[];
  humanReviewStatus: string;
  closureStatus: string;
  auditMetadata?: { visibilityTier?: string | null } | null;
  taskId?: string | null; // not returned by the list read; never fabricated
  _new?: boolean; // client-only optimistic marker
}

/**
 * GET /api/ha-interactions/interactions row (services/ha-interactions →
 * listInteractions). Columns are snake_case; the per-meeting question/agreed
 * counts are NOT returned by the list read and are never fabricated. Dates are
 * nullable.
 */
interface InteractionRow {
  id: number;
  interaction_type: string;
  agency: string | null;
  title: string;
  status: string;
  requested_date: string | null;
  scheduled_date: string | null;
  held_date: string | null;
}

/**
 * GET /api/ha-interactions/commitments returns { commitments, summary }.
 * effectiveStatus is derived server-side; the rest are snake_case + nullable.
 */
interface CommitmentRow {
  id: number;
  commitment_type: string;
  description: string;
  regulatory_basis: string | null;
  due_date: string | null;
  status: string;
  fulfilled_date: string | null;
  effectiveStatus: string;
}
interface CommitmentsPayload {
  commitments: CommitmentRow[];
}

/**
 * GET authority-profiles row (concept2cure_authority_profiles), aligned to
 * AuthorityProfileRecord (centerOrDivision / submissionTransport /
 * acceptedFormats / validationRequirements / acknowledgmentModel).
 */
interface AuthProfileRow {
  id: string;
  authority: string;
  centerOrDivision: string;
  channelType: string;
  submissionTransport: string;
  acceptedFormats: string[];
  validationRequirements: string[];
  acknowledgmentModel: string;
}

/* Stable empty seed for the optimistic-row store while the live inbox is
   loading / errored / project-less. useLiveRows synthesizes a fresh [] every
   render in those states, which would otherwise thrash the re-seed effect. */
const EMPTY_COMMS: CommRow[] = [];

/* Active project id — the runtime channel Projects.tsx sets when a project is
   opened (read the same way by ProjectHome / CmcModule / Inconsistency). The
   agency-communications and authority-profiles reads are project-scoped, so with
   no project in context there is nothing to load. */
function currentProjectId(): string | null {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  } catch (_e) {
    return null;
  }
}

/* ── Helpers ── */

function daysTo(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000);
}

/* Honest loading → error → empty guard for a list slice (mirrors the reference
   re-anchors). */
function StateGuard({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  errorTitle,
  errorHint,
  children,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  emptyTitle: string;
  emptyHint?: React.ReactNode;
  errorTitle: string;
  errorHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) {
    return <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />;
  }
  if (empty) {
    return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children}</>;
}

/* ── Main component ── */

export function CommunicationCenter({ onAsk, onNav }: SurfaceViewProps) {
  const nav = (id: string) => {
    onNav(id);
  };

  const [tab, setTab] = React.useState('inbox');
  const [owner, setOwner] = React.useState<'all' | 'mine'>('all');
  const [form, setForm] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2800);
  };

  const projectId = currentProjectId();

  // ── Agency inbox — REAL, project-scoped ──
  const commsPath = projectId
    ? '/api/concept2cure/projects/' + encodeURIComponent(projectId) + '/agency-communications'
    : null;
  const liveComms = useLiveRows<CommRow>(commsPath);
  // Seed a local store from the live rows so the optimistic actions below still
  // function on top of real data. useLiveRows returns a FRESH [] every render
  // while loading / on error / with no project, so feed a STABLE empty seed in
  // those states to keep the re-seed effect from thrashing.
  const seedComms =
    !commsPath || liveComms.loading || liveComms.error ? EMPTY_COMMS : liveComms.rows;
  const [comms, setComms] = React.useState<CommRow[]>(() => seedComms.map((c) => ({ ...c })));
  const seedRef = React.useRef<CommRow[]>(seedComms);
  React.useEffect(() => {
    if (seedComms !== seedRef.current) {
      seedRef.current = seedComms;
      setComms(seedComms.map((c) => ({ ...c })));
    }
  }, [seedComms]);

  const open = comms.filter((c) => c.closureStatus !== 'closed');
  const responseDue = comms.filter((c) => c.responseRequired && c.closureStatus !== 'closed');
  const critical = responseDue.filter((c) => c.urgency === 'critical');
  const soonest = [...responseDue]
    .filter((c) => c.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];

  // ── Meetings & commitments — REAL, org-scoped (no project id required) ──
  const interState = useLiveRows<InteractionRow>('/api/ha-interactions/interactions');
  const commitState = useLiveData<CommitmentsPayload>('/api/ha-interactions/commitments');
  const commitments = Array.isArray(commitState.data?.commitments)
    ? commitState.data!.commitments
    : [];
  const commitEmpty = !commitState.loading && !commitState.error && commitments.length === 0;

  // ── Authority profiles — REAL, project-scoped ──
  const profPath = projectId
    ? '/api/concept2cure/projects/' + encodeURIComponent(projectId) + '/authority-profiles'
    : null;
  const profState = useLiveRows<AuthProfileRow>(profPath);

  // logComm — REAL, audited write. POSTs to
  // /api/concept2cure/projects/:pid/agency-communications, which persists the
  // event, auto-creates a response task + notification when a response is
  // required or urgency is high/critical, and writes the audit entry. The row
  // adopted into the view is the SERVER's record (real id, real generated task
  // id) — nothing is fabricated. On failure the form stays open and the toast
  // states plainly that nothing was persisted.
  const logComm = async (v: Record<string, string>) => {
    if (!commsPath) {
      fire('Select a project before logging a communication.');
      return;
    }
    const body = {
      sourceType: v.sourceType || 'manual_logged_event',
      communicationType: v.communicationType,
      sourceChannel: v.sourceChannel || 'Manually logged',
      linkedSectionCodes: [] as string[],
      dueDate: v.dueDate || undefined,
      urgency: (v.urgency || 'medium') as CommRow['urgency'],
      responseRequired: v.responseRequired === 'yes',
      extractedIssues: v.issue ? [v.issue] : [],
      // Any role may write the shared client↔C2C tier (canViewVisibilityTier);
      // the form does not yet collect a tier, so default to the shared one.
      visibilityTier: 'shared_client_c2c',
    };
    try {
      const res = await apiRequest('POST', commsPath, body);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        fire('Couldn’t save the communication — ' + (json?.error || `HTTP ${res.status}`) + '. Nothing was persisted.');
        return;
      }
      const saved = json.data as CommRow & { generatedTaskId?: number };
      const row: CommRow = {
        ...saved,
        taskId: saved.generatedTaskId != null ? String(saved.generatedTaskId) : null,
        _new: true,
      };
      setComms((cs) => [row, ...cs.filter((c) => c.id !== row.id)]);
      setForm(false);
      fire(
        row.taskId
          ? 'Saved to the governed store · response task created · audit entry written'
          : 'Saved to the governed store · audit entry written',
      );
    } catch (e) {
      fire('Couldn’t save the communication — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was persisted.');
    }
  };

  // triage — FLAG (deferred): there is no mounted PATCH for agency-communication
  // review/closure status, so this only flips the row in the CURRENT view. The
  // toast states that plainly; the change is not persisted and reverts on reload
  // once the live read re-seeds. No false claim of a saved status transition.
  const triage = (id: string) => {
    setComms((cs) =>
      cs.map((c) =>
        c.id === id
          ? {
              ...c,
              humanReviewStatus:
                c.humanReviewStatus === 'pending_review' ? 'triaged' : 'actioned',
              closureStatus: c.closureStatus === 'open' ? 'in_progress' : 'closed',
            }
          : c,
      ),
    );
    fire('Updated in this view only — status changes aren’t persisted yet (no server endpoint).');
  };

  const shown = owner === 'mine' ? open.filter((c) => c.responseRequired) : comms;

  return (
    <div className="cc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Submission · Communication Center</div>
          <h1 className="sp-title">Communication Center</h1>
          <p className="sp-state">
            The regulated FDA↔client loop — every agency letter, IR, gateway ack and meeting, traced
            to its filing and turned into governed action.
          </p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>
          {I.plus} Log communication
        </button>
      </div>

      <AnswerLead
        tone={critical.length || responseDue.length ? 'urgent' : 'calm'}
        eyebrow="What the FDA is waiting on from you"
        headline={
          !projectId ? (
            <>Open a project to load its agency communications.</>
          ) : liveComms.error ? (
            <>Couldn't load this project's agency communications.</>
          ) : critical.length ? (
            <>
              The FDA issued a <b>{critical[0].communicationType}</b>
              {critical[0].dueDate ? (
                <>
                  {' '}
                  — you have <b>{daysTo(critical[0].dueDate)} days</b> to respond
                </>
              ) : null}
              .
            </>
          ) : responseDue.length ? (
            <>
              <b>{responseDue.length}</b> agency communication
              {responseDue.length === 1 ? '' : 's'}{' '}
              {responseDue.length === 1 ? 'needs' : 'need'} a response
              {soonest && soonest.dueDate ? (
                <>
                  , the soonest in <b>{daysTo(soonest.dueDate)} days</b>
                </>
              ) : null}
              .
            </>
          ) : (
            <>No open agency communications need a response right now.</>
          )
        }
        body={
          <>
            Agency letters, IRs, gateway acks and meeting minutes are tracked here and turned into
            governed, section-linked action.
          </>
        }
        reassure="I'll decompose every deficiency into a section-linked task, draft each response, and walk the resubmission through the gateway — you review and sign."
        action={
          responseDue.length
            ? {
                label: 'Draft the ' + responseDue[0].communicationType + ' response',
                onClick: () =>
                  onAsk(
                    'Draft the response to the ' +
                      responseDue[0].communicationType +
                      ', addressing every extracted issue with a section-linked plan.',
                  ),
              }
            : { label: 'Review the inbox', onClick: () => setTab('inbox') }
        }
        secondary="Or work the inbox, meetings and commitments below."
      />

      <div className="cc-tabs">
        {(
          [
            ['loop', 'FDA loop'],
            ['inbox', 'Agency inbox · ' + open.length],
            ['meetings', 'Meetings & commitments'],
            ['profiles', 'Authority profiles'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            className={'cc-tab' + (tab === k ? ' on' : '')}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ════ TAB: FDA loop — MISSING backend, honest empty ════ */}
      {tab === 'loop' && (
        <>
          <div className="pj-seclbl">
            Submission lifecycle <span className="s">· FDA round-trip</span>
          </div>
          <EmptyState
            icon={I.fileText}
            title="Submission-loop tracking isn't available yet"
            hint="The submission lifecycle, the CRL response countdown and the deficiency gap analysis are computed from a governed submission record. That read (submission-center items and CRL deficiencies) isn't wired to this surface yet — no lifecycle, CRL or deficiency data is shown rather than fabricated."
          />
          <div className="cc-linkrow">
            <button className="cc-linkcard" onClick={() => nav('submission-center')}>
              <span className="ic">{I.rocket}</span>
              <div>
                <div className="t">Submission Center</div>
                <div className="s">Assemble, validate & dispatch the submission sequence</div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
            <button className="cc-linkcard" onClick={() => nav('tasks')}>
              <span className="ic">{I.checkSquare}</span>
              <div>
                <div className="t">Tasking</div>
                <div className="s">
                  Response tasks are auto-generated when agency communications are logged through
                  the governed API
                </div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
            <button className="cc-linkcard" onClick={() => nav('projects')}>
              <span className="ic">{I.folder}</span>
              <div>
                <div className="t">Project</div>
                <div className="s">Open the project lifecycle, team & evidence</div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
          </div>
        </>
      )}

      {/* ════ TAB: Agency inbox — REAL ════ */}
      {tab === 'inbox' && (
        <>
          <div className="cc-inbox-head">
            <div className="pj-seclbl" style={{ margin: 0 }}>
              Agency communications{' '}
              <span className="s">· {shown.length} shown · project-scoped</span>
            </div>
            <div className="cc-owner">
              <button
                className={'cc-owner-b' + (owner === 'all' ? ' on' : '')}
                onClick={() => setOwner('all')}
              >
                Everyone
              </button>
              <button
                className={'cc-owner-b' + (owner === 'mine' ? ' on' : '')}
                onClick={() => setOwner('mine')}
              >
                Needs response
              </button>
            </div>
          </div>
          {!projectId ? (
            <EmptyState
              icon={I.fileText}
              title="Open a project to see its agency communications"
              hint="Agency letters, IRs and gateway acks are scoped to a project. Open one from Projects to load its inbox."
            />
          ) : liveComms.loading && comms.length === 0 ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>
              Loading agency communications…
            </div>
          ) : liveComms.error && comms.length === 0 ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load agency communications"
              hint="The governed agency-communications register didn't respond. Sign in and retry, or check the service is reachable."
            />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={I.fileText}
              title="No agency communications yet"
              hint="Nothing has been logged for this project. Inbound agency letters, IRs and gateway acks appear here once captured."
            />
          ) : (
            <div className="cc-comms">
              {shown.map((c) => (
                <div
                  key={c.id}
                  className="cc-comm"
                  data-fresh={c._new || undefined}
                  data-urgency={c.urgency}
                >
                  <div className="cc-comm-l">
                    <span className={'cc-comm-dot tone-' + (CC_TONE[c.urgency] || 'idle')} />
                  </div>
                  <div className="cc-comm-b">
                    <div className="cc-comm-top">
                      <span className="cc-comm-t">{c.communicationType}</span>
                      <span className="cc-comm-src">
                        {CC_SOURCE_TYPES[c.sourceType] || c.sourceType}
                      </span>
                      {c.responseRequired && (
                        <span className="rd-chip tone-err">response required</span>
                      )}
                      {/* closureStatus is nullable on the register (a row logged
                          before the closure workflow existed carries none), so the
                          chip is omitted rather than asserting a state — same as
                          the responseRequired chip above it. */}
                      {c.closureStatus && (
                        <span className={'rd-chip tone-' + (CC_CLOSURE[c.closureStatus] || 'idle')}>
                          {c.closureStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="cc-comm-meta mono">
                      {c.sourceChannel} · received {c.receivedDate}
                      {c.dueDate
                        ? ' · due ' +
                          c.dueDate +
                          (daysTo(c.dueDate) != null ? ' (' + daysTo(c.dueDate) + 'd)' : '')
                        : ''}
                      {/* linkedSectionCodes / extractedIssues are absent, not [],
                          on rows the list read narrows or that predate the
                          columns — the length reads have to survive that. */}
                      {c.linkedSectionCodes?.length
                        ? ' · §' + c.linkedSectionCodes.join(' §')
                        : ''}
                    </div>
                    {c.extractedIssues && c.extractedIssues.length > 0 && (
                      <ul className="cc-comm-issues">
                        {c.extractedIssues.map((iss, i) => (
                          <li key={i}>{iss}</li>
                        ))}
                      </ul>
                    )}
                    <div className="cc-comm-foot">
                      {c.taskId && (
                        <button
                          className="cc-comm-task"
                          onClick={() => nav('tasks')}
                          title="Open in Tasking"
                        >
                          {I.checkSquare} {c.taskId}
                        </button>
                      )}
                      {c.responseRequired && c.closureStatus !== 'closed' && (
                        <button
                          className="cc-btn sm primary"
                          onClick={() =>
                            onAsk(
                              'Draft the response to "' +
                                c.communicationType +
                                '" (' +
                                c.id +
                                ') addressing: ' +
                                c.extractedIssues.join('; '),
                            )
                          }
                        >
                          {I.penLine} Draft response with AnA
                        </button>
                      )}
                      {c.closureStatus !== 'closed' && (
                        <button className="cc-btn sm" onClick={() => triage(c.id)}>
                          {c.humanReviewStatus === 'pending_review' ? 'Triage' : 'Advance'}
                        </button>
                      )}
                      {c.auditMetadata?.visibilityTier && (
                        <span className="cc-comm-vis" title="Visibility tier">
                          {I.eye} {c.auditMetadata.visibilityTier.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ════ TAB: Meetings & commitments — REAL ════ */}
      {tab === 'meetings' && (
        <>
          <div className="pj-seclbl">
            Health-authority interactions{' '}
            <span className="s">· /api/ha-interactions · org-scoped</span>
          </div>
          <StateGuard
            loading={interState.loading}
            error={interState.error}
            empty={interState.empty}
            emptyTitle="No health-authority interactions yet"
            emptyHint="Pre-IND, End-of-Phase, Type A/B/C and scientific-advice meetings logged for your organization appear here."
            errorTitle="Couldn't load health-authority interactions"
            errorHint="The HA interactions service didn't respond. Sign in and retry, or check the service is reachable."
          >
            <div className="cc-list">
              {interState.rows.map((m) => (
                <div key={m.id} className="cc-row">
                  <span className="cc-row-tag">
                    {CC_INTERACTION_TYPES[m.interaction_type] || m.interaction_type}
                  </span>
                  <div className="cc-row-b">
                    <div className="cc-row-t">{m.title}</div>
                    <div className="cc-row-s mono">
                      {m.agency ? m.agency.toUpperCase() : '—'}
                      {m.scheduled_date ? ' · ' + m.scheduled_date : ''}
                    </div>
                  </div>
                  <span
                    className={
                      'rd-chip tone-' +
                      (m.status === 'closed'
                        ? 'ok'
                        : m.status === 'held' || m.status === 'minutes_received'
                          ? 'ai'
                          : 'idle')
                    }
                  >
                    {m.status ? m.status.replace(/_/g, ' ') : 'unknown'}
                  </span>
                  <button
                    className="cc-btn sm"
                    onClick={() =>
                      onAsk(
                        'Summarize the ' +
                          (CC_INTERACTION_TYPES[m.interaction_type] || 'interaction') +
                          ' outcomes and open questions for ' +
                          m.title,
                      )
                    }
                  >
                    {I.sparkles}
                  </button>
                </div>
              ))}
            </div>
          </StateGuard>
          <div className="pj-seclbl">
            Regulatory commitments{' '}
            <span className="s">· PMR / PMC / REMS · /api/ha-interactions/commitments</span>
          </div>
          <StateGuard
            loading={commitState.loading}
            error={commitState.error}
            empty={commitEmpty}
            emptyTitle="No regulatory commitments yet"
            emptyHint="PMR / PMC / REMS commitments tracked for your organization appear here, with their derived on-track / due-soon status."
            errorTitle="Couldn't load regulatory commitments"
            errorHint="The HA commitments service didn't respond. Sign in and retry, or check the service is reachable."
          >
            <div className="cc-list">
              {commitments.map((c) => (
                <div key={c.id} className="cc-row">
                  <span className="cc-row-tag" data-kind={c.commitment_type}>
                    {c.commitment_type ? c.commitment_type.toUpperCase() : '—'}
                  </span>
                  <div className="cc-row-b">
                    <div className="cc-row-t">{c.description}</div>
                    <div className="cc-row-s mono">
                      {[c.regulatory_basis, c.due_date ? 'due ' + c.due_date : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <span
                    className={
                      'rd-chip tone-' +
                      (c.effectiveStatus === 'on_track' || c.effectiveStatus === 'fulfilled'
                        ? 'ok'
                        : c.effectiveStatus === 'due_soon'
                          ? 'warn'
                          : 'err')
                    }
                  >
                    {(c.effectiveStatus || c.status || 'unknown').replace(/_/g, ' ')}
                  </span>
                  <button
                    className="cc-btn sm"
                    onClick={() =>
                      onAsk(
                        'What is needed to fulfill this ' +
                          (c.commitment_type ? c.commitment_type.toUpperCase() : 'commitment') +
                          ' on time?',
                      )
                    }
                  >
                    {I.sparkles}
                  </button>
                </div>
              ))}
            </div>
          </StateGuard>
        </>
      )}

      {/* ════ TAB: Authority profiles — REAL ════ */}
      {tab === 'profiles' && (
        <>
          <div className="pj-seclbl">
            Authority profiles{' '}
            <span className="s">· channel · transport · validation · acknowledgment model</span>
          </div>
          {!projectId ? (
            <EmptyState
              icon={I.fileText}
              title="Open a project to see its authority profiles"
              hint="Authority profiles (channel, transport, accepted formats, validation) are configured per project. Open one from Projects to load them."
            />
          ) : (
            <StateGuard
              loading={profState.loading}
              error={profState.error}
              empty={profState.empty}
              emptyTitle="No authority profiles yet"
              emptyHint="Configure an authority profile — channel, transport, accepted formats and validation — for this project and it appears here."
              errorTitle="Couldn't load authority profiles"
              errorHint="The authority-profiles register didn't respond. Sign in and retry, or check the service is reachable."
            >
              <div className="cc-prof-grid">
                {profState.rows.map((p) => (
                  <div key={p.id} className="cc-prof">
                    <div className="cc-prof-h">
                      <span className="cc-prof-a">{p.authority}</span>
                      <span className="cc-prof-c">{p.centerOrDivision}</span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Channel</span>
                      <span className="v">
                        {[p.channelType, p.submissionTransport].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Formats</span>
                      <span className="v">{(p.acceptedFormats || []).join(', ') || '—'}</span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Validation</span>
                      <span className="v">
                        {(p.validationRequirements || []).join(', ') || '—'}
                      </span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Acknowledgment</span>
                      <span className="v">
                        {p.acknowledgmentModel ? p.acknowledgmentModel.replace(/_/g, ' ') : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </StateGuard>
          )}
        </>
      )}

      {/* ════ Log communication form ════ */}
      {form && (
        <C2CForm
          config={{
            eyebrow: 'Communication Center · agency communications',
            title: 'Log agency communication',
            sub: 'Record an inbound agency event. This adds it to the view; saving to the governed store — which is what auto-creates the response task, sends the notification and writes the audit entry — is not yet wired from this form.',
            governed:
              'Once persistence is wired, logged communications are org- and project-scoped and audit-logged, with visibility following the tier you set.',
            submitLabel: 'Add to view',
            fields: [
              {
                key: 'communicationType',
                label: 'Communication type',
                type: 'text',
                placeholder: 'e.g. Information Request (IR)',
                required: true,
              },
              {
                key: 'sourceType',
                label: 'Source',
                type: 'select',
                options: Object.keys(CC_SOURCE_TYPES).map((k) => ({
                  value: k,
                  label: CC_SOURCE_TYPES[k],
                })),
                required: true,
              },
              {
                key: 'sourceChannel',
                label: 'Source channel',
                type: 'text',
                placeholder: 'e.g. FDA CDER portal',
              },
              {
                key: 'urgency',
                label: 'Urgency',
                type: 'select',
                options: [
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ],
                required: true,
              },
              {
                key: 'responseRequired',
                label: 'Response required?',
                type: 'select',
                options: [
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ],
                required: true,
              },
              {
                key: 'dueDate',
                label: 'Response due (optional)',
                type: 'text',
                placeholder: 'YYYY-MM-DD',
              },
              {
                key: 'issue',
                label: 'Key issue (optional)',
                type: 'text',
                placeholder: 'e.g. Additional stability data required (§3.2.P.8)',
              },
            ],
          }}
          onCancel={() => setForm(false)}
          onSubmit={logComm}
        />
      )}

      {toast && (
        <div className="pdev-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}
