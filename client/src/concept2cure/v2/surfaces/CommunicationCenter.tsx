/**
 * Communication Center — the regulated FDA<>client loop hub.
 *
 * Real-data standard (no mock in product). Every DATA slice renders real
 * persisted data, an honest empty state, or an honest error state — never a
 * hardcoded fixture. Self-audit of the fixture-backed slices:
 *
 *   Agency inbox  → GET /api/concept2cure/projects/:pid/agency-communications
 *                   (read, log, triage and cards: AgencyInbox.tsx, shared with
 *                   project home's Respond tab — one inbox per project)
 *                   REAL (server routes/concept2cure.ts → concept2cure_agency_communications).
 *   Meetings      → GET /api/ha-interactions/interactions   REAL (listInteractions).
 *   Commitments   → GET /api/ha-interactions/commitments     REAL (listCommitments).
 *   Authority     → GET /api/concept2cure/projects/:pid/authority-profiles
 *   profiles        REAL (server routes/concept2cure.ts → concept2cure_authority_profiles).
 *   FDA loop      → GET /api/concept2cure/projects/:pid/submission-center/items
 *                   REAL (server routes/c2c/communication-center.ts →
 *                   concept2cure_submission_center_items). The CRL round-trip
 *                   and deficiency gap analysis still have no endpoint —
 *                   MISSING → honest empty, nothing fabricated.
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
import { C2CForm } from '../C2CForm';
import { CC_SOURCE_TYPES, CC_INTERACTION_TYPES } from '../fixtures/commcenter';
import { AgencyInboxList, daysTo, draftResponseWithAna, letterSourceOptions, letterSourceRef, useAgencyInbox } from './AgencyInbox';
import { isSourcesPage, sourcesUrl, type SourcesPage } from './projectSources';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/commcenter-v2.css';
import { C2CToast, useToast } from '../toast';
import { CompanyLegalCommunicationLinks } from './CompanyLegalCommunicationLinks';
import type { CompanyLegalCommunicationLink } from '@shared/company-correspondence';

/* ── Display rows, aligned to the REAL backend columns actually returned ── */

/* The agency inbox row, read, write and cards live in AgencyInbox.tsx, shared
   with project home's Respond tab: one inbox per project (2026-10-17). */

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

/** One submission-center item as the router returns it (SubmissionCenterItemRecord). */
type SubmissionItemRow = {
  id: string;
  title: string;
  authority: string;
  submissionType: string;
  sequenceNumber?: string;
  status: string;
  dispatchReady: boolean;
  updatedAt: string;
  metadata?: { companyLegalDocuments?: CompanyLegalCommunicationLink[] };
};

/* Active project id — the runtime channel Projects.tsx sets when a project is
   opened (read the same way by ProjectHome / CmcModule / Inconsistency). The
   agency-communications and authority-profiles reads are project-scoped, so with
   no project in context there is nothing to load. */
function currentProjectId(): string | null {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  } catch {
    return null;
  }
}

/* ── Helpers ── */


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
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />;
  }
  if (empty) {
    return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children}</>;
}

/** What the log form's letter field says about the data-room read it lists. */
function letterFieldDesc(read: { loading: boolean; error?: string; data: SourcesPage | null }, count: number): string {
  if (read.loading) return "Reading this project's data room…";
  if (read.error) {
    return "This project's data room could not be read, so no letter can be linked now. The communication can still be logged without one.";
  }
  if (count === 0) return "This project's data room holds no documents to link.";
  return (
    "A document already in this project's data room. One already linked to an inbox item is marked and cannot be chosen again." +
    (read.data?.window?.truncated ? ' Only the newest 200 documents are listed.' : '')
  );
}

/* ── Main component ── */

export function CommunicationCenter({ onAsk, onNav }: SurfaceViewProps) {
  const nav = (id: string) => {
    onNav(id);
  };

  const [tab, setTab] = React.useState('inbox');
  const [owner, setOwner] = React.useState<'all' | 'mine'>('all');
  const [form, setForm] = React.useState(false);
  const [toast, fire] = useToast();

  const projectId = currentProjectId();

  // ── Agency inbox — REAL, project-scoped (AgencyInbox.tsx, shared with Respond) ──
  const { path: commsPath, live: liveComms, comms, log, advance: triage } = useAgencyInbox(projectId, fire);

  /* The letter a logged communication is about may already be in the
     project's data room (filed before Respond logged uploads, b0d7ac7c4). The
     log form offers those sources through the Data Room's own read, only while
     the form is open, and links the chosen one as `cre_source:<id>`, the
     reference Respond's upload path writes. The server checks it is a source
     of this organisation's project. */
  const sourcesRead = useLiveData<SourcesPage>(form && projectId ? sourcesUrl(projectId, '', 0) : null, [form, projectId], isSourcesPage);
  const letterOptions = letterSourceOptions(sourcesRead.data?.sources ?? [], comms);
  const letterDesc = letterFieldDesc(sourcesRead, letterOptions.length);

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

  // ── Submission-center items — REAL, project-scoped (the FDA-loop tab) ──
  const itemsPath = projectId
    ? '/api/concept2cure/projects/' + encodeURIComponent(projectId) + '/submission-center/items'
    : null;
  const itemState = useLiveRows<SubmissionItemRow>(itemsPath);

  /* What AnA can see of this screen.
     Four independent reads, two of them project-scoped. NO PROJECT is its own
     state and is published as itself: the agency inbox and the authority
     profiles are empty for want of a project id, not because the regulator has
     sent nothing — and "you have no open agency correspondence" is a claim a
     user would act on.

     `responseRequired` with a due date is the fact worth carrying: it is what
     turns this screen from a list into a clock. */
  const anaContext = React.useMemo(() => {
    const inbox = !commsPath
      ? { state: 'no-project' as const }
      : liveComms.loading
        ? { state: 'loading' as const }
        : liveComms.error
          ? { state: 'unreadable' as const }
          : { state: 'ready' as const };
    const inboxLine =
      inbox.state === 'no-project'
        ? 'no project is selected, so the agency inbox is not scoped to anything'
        : inbox.state === 'loading'
          ? 'the agency inbox is still loading'
          : inbox.state === 'unreadable'
            ? 'the agency inbox could not be read'
            : `${comms.length} agency communication(s), ${open.length} open, ${responseDue.length} awaiting a response, ${critical.length} critical`;
    return {
      summary:
        `Communication centre, "${tab}" tab (${owner === 'mine' ? 'my items' : 'all owners'}): ${inboxLine}.` +
        (inbox.state === 'ready' && soonest
          ? ` The soonest response is due ${soonest.dueDate}.`
          : '') +
        ' ' +
        (interState.loading
          ? 'Health-authority interactions are still loading.'
          : interState.error
            ? 'Health-authority interactions could not be read.'
            : `${interState.rows.length} health-authority interaction(s).`) +
        ' ' +
        (commitState.loading
          ? 'Commitments are still loading.'
          : commitState.error
            ? 'Commitments could not be read.'
            : `${commitments.length} commitment(s).`),
      facts: {
        openTab: tab,
        ownerFilter: owner,
        projectScoped: Boolean(projectId),
        agencyInboxState: inbox.state,
        agencyInbox: inbox.state === 'ready'
          ? {
              total: comms.length,
              open: open.length,
              awaitingResponse: responseDue.length,
              critical: critical.length,
              soonestDue: soonest ? { id: soonest.id, type: soonest.communicationType, due: soonest.dueDate, urgency: soonest.urgency } : null,
              items: comms.slice(0, 10).map((c) => ({
                id: c.id, type: c.communicationType, channel: c.sourceChannel,
                received: c.receivedDate, due: c.dueDate ?? null, urgency: c.urgency,
                responseRequired: c.responseRequired, issues: c.extractedIssues,
                reviewStatus: c.humanReviewStatus, closureStatus: c.closureStatus,
              })),
            }
          : null,
        interactions: interState.loading || interState.error
          ? null
          : interState.rows.slice(0, 10).map((r) => ({
              id: r.id, type: r.interaction_type, agency: r.agency, title: r.title,
              status: r.status, requested: r.requested_date, scheduled: r.scheduled_date, held: r.held_date,
            })),
        commitments: commitState.loading || commitState.error
          ? null
          : commitments.slice(0, 10).map((c) => ({
              id: c.id, type: c.commitment_type, description: c.description,
              regulatoryBasis: c.regulatory_basis, due: c.due_date,
              status: c.status, effectiveStatus: c.effectiveStatus, fulfilled: c.fulfilled_date,
            })),
        authorityProfiles: profState.loading || profState.error
          ? null
          : profState.rows.map((pr) => ({
              authority: pr.authority, centerOrDivision: pr.centerOrDivision,
              channel: pr.channelType, transport: pr.submissionTransport,
              acceptedFormats: pr.acceptedFormats ?? [],
            })),
        submissionItems: !itemsPath || itemState.loading || itemState.error
          ? null
          : itemState.rows.map((it) => ({
              id: it.id, title: it.title, authority: it.authority, type: it.submissionType,
              sequence: it.sequenceNumber ?? null, status: it.status, dispatchReady: it.dispatchReady,
            })),
      },
      availableActions: [
        'Log an agency communication (a governed write — persists the event and writes the audit entry; it creates no task)',
        'Switch tab between the inbox, interactions, commitments and authority profiles',
        'Filter to my items or all owners',
        'Read a communication\u2019s extracted issues, urgency and response due date',
      ],
    };
  }, [commsPath, liveComms.loading, liveComms.error, comms, open.length, responseDue.length, critical.length, soonest, tab, owner, projectId, interState.loading, interState.error, interState.rows, commitState.loading, commitState.error, commitments, profState.loading, profState.error, profState.rows, itemsPath, itemState.loading, itemState.error, itemState.rows]);
  usePublishSurfaceContext('communication-center', anaContext);

  // logComm — REAL, audited write. POSTs to
  // /api/concept2cure/projects/:pid/agency-communications, which persists the
  // event and writes the audit entry; it creates no task (checked 2026-10-17).
  // The row adopted into the view is the SERVER's record — nothing is
  // fabricated. On failure the form stays open and the toast
  // states plainly that nothing was persisted.
  const logComm = async (v: Record<string, string>) => {
    if (!commsPath) {
      fire('Select a project before logging a communication.');
      return;
    }
    const letter = Number(v.letterSourceId);
    const body = {
      sourceType: v.sourceType || 'manual_logged_event',
      communicationType: v.communicationType,
      sourceChannel: v.sourceChannel || 'Manually logged',
      linkedSectionCodes: [] as string[],
      linkedArtifactIds: Number.isSafeInteger(letter) && letter > 0 ? [letterSourceRef(letter)] : [],
      dueDate: v.dueDate || undefined,
      urgency: (v.urgency || 'medium') as 'low' | 'medium' | 'high' | 'critical',
      responseRequired: v.responseRequired === 'yes',
      extractedIssues: v.issue ? [v.issue] : [],
      // Any role may write the shared client↔C2C tier (canViewVisibilityTier);
      // the form does not yet collect a tier, so default to the shared one.
      visibilityTier: 'shared_client_c2c',
    };
    // The write, the server-record adoption and the error reduction are
    // AgencyInbox's useAgencyInbox.log — the same writer Respond logs a letter with.
    const r = await log(body);
    if (!r.ok) {
      fire('Couldn’t save the communication — ' + r.detail + '. Nothing was persisted.');
      return;
    }
    setForm(false);
    fire(
      r.row.taskId
        ? 'Saved to the governed store · response task created · audit entry written'
        : 'Saved to the governed store · audit entry written',
    );
  };

  /* Triage persists: PATCH .../agency-communications/:eventId/advance, the
     transition computed server-side from the STORED status with an audit entry
     naming from/to (commit 1e18cdd49). It is `triage` from useAgencyInbox, the
     same action Respond's inbox uses. */

  const shown = owner === 'mine' ? open.filter((c) => c.responseRequired) : comms;

  return (
    <div className="cc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Submission · Communication Center</div>
          <h1 className="sp-title">Communication center</h1>
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
          ) : liveComms.loading ? (
            /* The ternary had an `error` arm and no `loading` one, so while the
               read was in flight `critical` and `responseDue` were both empty
               and it fell through to the final arm — an authoritative all-clear
               on IR and CRL response clocks, under the eyebrow "What the FDA is
               waiting on from you". Transient, but it is the first thing on the
               surface and it is the one sentence a user acts on. */
            <>Reading this project's agency communications…</>
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
            Agency letters, IRs, gateway acks and meeting minutes logged for this project, with the
            ones that still need a response.
          </>
        }
        reassure="Ask me to draft a response to a letter logged here. The draft is yours to edit, send for review and sign."
        action={
          responseDue.length
            ? {
                /* Names who drafts, and hands AnA the letter itself (pinned),
                   the same as each card's button (AgencyInbox.tsx). It read
                   "Draft the <type> response" and sent a sentence only. */
                label: 'Draft response with AnA',
                onClick: () => draftResponseWithAna(responseDue[0], onAsk),
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

      {/* ════ TAB: FDA loop — submission items REAL; CRL/deficiency reads MISSING, honest ════ */}
      {tab === 'loop' && (
        <>
          <div className="pj-seclbl">
            Submission lifecycle <span className="s">· FDA round-trip</span>
          </div>
          {!projectId ? (
            <EmptyState
              icon={I.fileText}
              title="Open a project to see its submission items"
              hint="Submission-center items are tracked per project. Open one from Projects to load them."
            />
          ) : (
            <StateGuard
              loading={itemState.loading}
              error={itemState.error}
              empty={itemState.empty}
              emptyTitle="No submission items yet"
              emptyHint="Create a submission-center item for this project — authority, submission type, sequence — and its lifecycle appears here."
              errorTitle="Couldn't load submission items"
              errorHint="The submission-center register didn't respond. Sign in and retry, or check the service is reachable."
            >
              <div className="cc-prof-grid">
                {itemState.rows.map((it) => (
                  <div key={it.id} className="cc-prof">
                    <div className="cc-prof-h">
                      <span className="cc-prof-a">{it.title}</span>
                      <span className="cc-prof-c">
                        {[it.authority, it.submissionType].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Status</span>
                      <span className="v">{it.status.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Sequence</span>
                      <span className="v">{it.sequenceNumber || '—'}</span>
                    </div>
                    <div className="cc-prof-row">
                      <span className="k">Dispatch</span>
                      <span className="v">{it.dispatchReady ? 'ready' : 'not ready'}</span>
                    </div>
                    {projectId && <CompanyLegalCommunicationLinks projectId={projectId} recordId={it.id} kind="handoff" initial={it.metadata?.companyLegalDocuments} />}
                  </div>
                ))}
              </div>
            </StateGuard>
          )}
          <EmptyState
            icon={I.fileText}
            title="CRL response countdown and deficiency gap analysis aren't available yet"
            hint="No endpoint returns CRL deficiencies for a submission, so nothing is computed or shown for them here rather than fabricated."
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
          <AgencyInboxList
            hasProject={Boolean(projectId)}
            projectId={projectId}
            loading={liveComms.loading}
            error={liveComms.error}
            rows={shown}
            onAdvance={(id) => void triage(id)}
            onAsk={onAsk}
            onOpenTask={() => nav('tasks')}
          />
        </>
      )}

      {/* ════ TAB: Meetings & commitments — REAL ════ */}
      {tab === 'meetings' && (
        <>
          <div className="pj-seclbl">
            Health-authority interactions{' '}
            <span className="s">· org-scoped</span>
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
                    aria-label="Ask AnA about this interaction"
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
            <span className="s">· PMR / PMC / REMS</span>
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
                    aria-label="Ask AnA about this commitment"
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
            /* This said saving was "not yet wired" and labelled the button
               "Add to view", while onSubmit already POSTed to the governed
               store (logComm). Corrected 2026-10-17. */
            sub: "Record an inbound agency event. Saving writes it to this project's agency inbox, which Respond on the project shows too, with an audit entry.",
            governed:
              'Logged communications are org- and project-scoped and audit-logged, shared at the client and C2C visibility tier.',
            submitLabel: 'Log communication',
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
                key: 'letterSourceId',
                label: 'Letter in the data room (optional)',
                type: 'select',
                options: letterOptions,
                desc: letterDesc,
                descLive: true,
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

      <C2CToast msg={toast} />
    </div>
  );
}
