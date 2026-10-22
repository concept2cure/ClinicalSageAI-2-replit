/**
 * The project's agency inbox: one store, one list, two screens (2026-10-17).
 *
 * There were two agency inboxes that did not know about each other. Project
 * home's Respond tab took the agency's letter into the data room and nowhere
 * else; Communication kept its own log in concept2cure_agency_communications.
 * A letter added in Respond never appeared in Communication's inbox, and a
 * communication logged there could not be drafted from its letter.
 *
 * The Communication store is the canonical record. This module is the one
 * client path to it, used by both screens:
 *   - useAgencyInbox: the list read (GET .../agency-communications), the
 *     audited write (POST, the same route Communication's "Log communication"
 *     uses) and the triage transition (PATCH .../:eventId/advance, computed
 *     server-side from the stored status).
 *   - AgencyInboxList: the inbox cards, with their triage state and actions.
 *   - draftResponseWithAna: "Draft response with AnA" hands AnA the letter
 *     itself, pinned as a source for that one turn (window.C2C_SOURCE_PINS,
 *     the data room's handoff, read once by useAnaChat). AnA drafts; nothing
 *     here claims a response was produced.
 *
 * A letter is linked to its communication by its data-room source, written
 * into linkedArtifactIds as `cre_source:<id>` (the reference the upload route
 * itself records for a source). No schema change: the column already existed.
 *
 * Each card opens the letter's questions and responses (AgencyResponses.tsx,
 * 2026-10-18): a response per question, approved by a Part 11 signature, and
 * the response package. Closing a letter with recorded questions is refused by
 * the server until every response is approved.
 *
 * Another screen can open one letter (2026-10-19): CMC / Module 3 lists the
 * program's Module 3 questions read from their letters, and each opens here,
 * on its letter, where it is worked (P-38). The list takes `openLetterId`
 * (from the navigation-params channel, consumed by CommunicationCenter), opens
 * that card, scrolls it into view and moves focus to it; a letter that is not
 * in the list is said to be so, and no other letter opens.
 */
import React from 'react';
import { I } from '../icons';
import { utcDaysUntil } from '@shared/utils/utc-day';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { CC_SOURCE_TYPES, CC_TONE, CC_CLOSURE } from '../fixtures/commcenter';
import type { C2CFormFieldOption } from '../C2CForm';
import type { SourceRow } from './projectSources';
import type { LinkedSubmission } from '@shared/types/communication-center';
import { AgencyResponses } from './AgencyResponses';
import '../styles/commcenter-v2.css';

/**
 * GET agency-communications row. The list read does NOT project a top-level
 * taskId (task linkage is created on POST but not returned by the GET), and
 * visibilityTier is nested under auditMetadata — both are read null-safe and
 * never fabricated. Dates arrive as ISO strings; dueDate is nullable.
 */
export interface CommRow {
  id: string;
  sourceType: string;
  communicationType: string;
  sourceChannel: string;
  linkedSectionCodes: string[];
  /** Documents the communication is about; a letter's source is `cre_source:<id>`. */
  linkedArtifactIds?: string[];
  /** The submission id as stored; read with linkedSubmission, which says whether it names one. */
  linkedSubmissionId?: string | null;
  /** The live submission of this project's program the id names, or null when it names none. */
  linkedSubmission?: LinkedSubmission | null;
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

/** What the POST takes (server/routes/c2c/communication-center.ts schema). */
export interface LogCommunicationBody {
  sourceType: string;
  communicationType: string;
  sourceChannel: string;
  linkedSectionCodes: string[];
  linkedArtifactIds?: string[];
  /** A submission of this project's program; the server refuses any other. */
  linkedSubmissionId?: string;
  dueDate?: string;
  urgency: CommRow['urgency'];
  responseRequired: boolean;
  extractedIssues: string[];
  visibilityTier: string;
}

export type LogResult = { ok: true; row: CommRow } | { ok: false; detail: string };

/* Stable empty seed while the live inbox is loading / errored / project-less,
   so the re-seed effect below does not thrash. */
const EMPTY_COMMS: CommRow[] = [];

export function agencyCommsPath(projectId: string | null | undefined): string | null {
  return projectId ? '/api/concept2cure/projects/' + encodeURIComponent(projectId) + '/agency-communications' : null;
}

const LETTER_SOURCE_PREFIX = 'cre_source:';

/** The linkedArtifactIds entry that ties a communication to its letter's data-room source. */
export function letterSourceRef(sourceId: number): string {
  return LETTER_SOURCE_PREFIX + String(sourceId);
}

/** A submission as the inbox, the log form and Respond name it: title, then application type and market. */
export function submissionLabel(s: Pick<LinkedSubmission, 'id' | 'title' | 'applicationType' | 'primaryRegion'>): string {
  const where = [s.applicationType, s.primaryRegion].filter((v): v is string => Boolean(v)).map((v) => v.toUpperCase());
  return `${s.title || `Submission ${s.id}`}${where.length ? ` (${where.join(', ')})` : ''}`;
}

/**
 * What a communication's card says of its submission. A stored id that names
 * none of this project's live submissions (an older unchecked value, or a
 * submission since removed) is said as such, never shown as a link.
 */
export function submissionLinkText(c: Pick<CommRow, 'linkedSubmissionId' | 'linkedSubmission'>): string {
  if (c.linkedSubmission) return ' · concerns ' + submissionLabel(c.linkedSubmission);
  return c.linkedSubmissionId ? ' · the submission it names is not one of this project\u2019s' : '';
}

/** The data-room source ids of the letter(s) linked to a communication. */
export function letterSourceIds(c: Pick<CommRow, 'linkedArtifactIds'>): string[] {
  return (c.linkedArtifactIds ?? [])
    .map((ref) => /^cre_source:(\d+)$/.exec(String(ref))?.[1] ?? null)
    .filter((id): id is string => id != null && Number(id) > 0);
}

/**
 * The log form's letter choices: this project's data-room sources, each one
 * already linked to an inbox item listed as such and not choosable, so the
 * same letter is not logged twice. Only the title is shown; nothing is read
 * off the letter.
 */
export function letterSourceOptions(
  sources: ReadonlyArray<Pick<SourceRow, 'id' | 'title' | 'isCurrent'>>,
  comms: ReadonlyArray<Pick<CommRow, 'linkedArtifactIds'>>,
): C2CFormFieldOption[] {
  const linked = new Set(comms.flatMap((c) => letterSourceIds(c)));
  return sources.map((s) => {
    const name = s.title ?? `Source ${s.id}`;
    const superseded = s.isCurrent === false ? ' (superseded)' : '';
    return linked.has(String(s.id))
      ? { value: String(s.id), label: `${name}${superseded}: already in the inbox`, disabled: true }
      : { value: String(s.id), label: name + superseded };
  });
}

/** Only ApiRequestError has been through the envelope reduction and is safe to show. */
function thrownDetail(e: unknown): string {
  const known = (e as { name?: unknown })?.name === 'ApiRequestError';
  return known && (e as Error).message ? (e as Error).message : 'the service could not be reached';
}

/**
 * "Draft response with AnA": the communication's letter is pinned for this one
 * turn, so the draft is grounded on it rather than on whatever retrieval picks.
 * A communication with no linked document says so in the request, and clears
 * any pin left behind, so no other document is passed off as the letter.
 */
export function draftResponseWithAna(c: CommRow, onAsk: (q: string) => void): void {
  const pins = letterSourceIds(c);
  const w = window as unknown as { C2C_SOURCE_PINS?: string[] };
  if (pins.length) w.C2C_SOURCE_PINS = pins;
  else delete w.C2C_SOURCE_PINS;
  const issues = c.extractedIssues?.length ? ` Issues recorded on it: ${c.extractedIssues.join('; ')}.` : '';
  onAsk(
    `Draft a response to the agency communication "${c.communicationType}" (${c.id}) in this project's agency inbox.` +
      (pins.length
        ? " The agency's letter is attached as a source: answer each question it asks, quoting the question."
        : ' No document of the letter is linked to this communication, so work only from what is recorded on it and say what the letter would be needed for.') +
      issues +
      ' Use no question number or due date the letter does not state.',
  );
}

/**
 * The project's agency communications: the live read, seeded into local state
 * so a logged or advanced row shows the server's record without a re-read.
 */
export function useAgencyInbox(projectId: string | null, fire: (m: string, tone?: 'ok' | 'error') => void) {
  const path = agencyCommsPath(projectId);
  const live = useLiveRows<CommRow>(path);
  const seed = !path || live.loading || live.error ? EMPTY_COMMS : live.rows;
  const [comms, setComms] = React.useState<CommRow[]>(() => seed.map((c) => ({ ...c })));
  /* Adopt a new read DURING the render that sees it, not in an effect after
     it: an effect left one committed frame with the read settled (loading
     false) and the rows still the empty copy, so the inbox painted "No agency
     communications yet" and, for a letter another screen linked to, a
     role="alert" "That letter is not in this project's inbox" over a letter
     that was there (review of 2026-10-19). React re-renders before committing. */
  const [adopted, setAdopted] = React.useState<CommRow[]>(seed);
  if (adopted !== seed) {
    setAdopted(seed);
    setComms(seed.map((c) => ({ ...c })));
  }

  /* The audited write. The row adopted is the SERVER's record (real id, real
     generated task id); on failure nothing is added and the caller says so. */
  const log = React.useCallback(
    async (body: LogCommunicationBody): Promise<LogResult> => {
      if (!path) return { ok: false, detail: 'no project is selected' };
      try {
        const res = await apiRequest('POST', path, body);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          return { ok: false, detail: serverMessage(json) ?? `the store did not accept it (HTTP ${res.status})` };
        }
        const saved = json.data as CommRow & { generatedTaskId?: number };
        const row: CommRow = {
          ...saved,
          taskId: saved.generatedTaskId != null ? String(saved.generatedTaskId) : null,
          _new: true,
        };
        setComms((cs) => [row, ...cs.filter((c) => c.id !== row.id)]);
        return { ok: true, row };
      } catch (e) {
        return { ok: false, detail: thrownDetail(e) };
      }
    },
    [path],
  );

  /* Triage persists: the server computes the transition from the STORED status
     and writes an audit entry; the row is adopted from its answer. */
  const advance = React.useCallback(
    async (id: string) => {
      if (!path) return;
      try {
        const res = await apiRequest('PATCH', `${path}/${encodeURIComponent(id)}/advance`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          fire('Not advanced — ' + (serverMessage(body) ?? `the server refused the change (HTTP ${res.status})`) + '. Nothing was stored.', 'error');
          return;
        }
        const row = (body as { data?: { humanReviewStatus?: string; closureStatus?: string } } | null)?.data;
        if (!row?.humanReviewStatus) {
          fire('Not advanced — the server did not confirm the new status.', 'error');
          return;
        }
        setComms((cs) =>
          cs.map((c) =>
            c.id === id
              ? { ...c, humanReviewStatus: row.humanReviewStatus as string, closureStatus: row.closureStatus ?? c.closureStatus }
              : c,
          ),
        );
        fire(`Advanced to ${String(row.humanReviewStatus).replace('_', ' ')} — recorded with an audit entry.`);
      } catch (e) {
        fire('Not advanced — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was stored.', 'error');
      }
    },
    [path, fire],
  );

  return { path, live, comms, log, advance, projectId, fire };
}

/**
 * Whole UTC calendar days from today to a date (0 on the day itself, negative
 * once it has passed); null when there is none. The same days the server's
 * overdue verdict compares (shared/utils/utc-day.ts): counted in milliseconds
 * from the browser's clock, a letter due today read "-1d" from 12:00 UTC on.
 */
export function daysTo(d: string | null | undefined, now: Date = new Date()): number | null {
  return utcDaysUntil(d, now.toISOString());
}

/**
 * A due date's day count in words: "today", "in 3 days", "4 days ago". A date
 * that has passed is said as that, never as "overdue": whether a letter is
 * overdue is the server's verdict (its questions not all approved), not the
 * calendar's.
 */
export function dueInWords(d: string | null | undefined, short = false): string | null {
  const n = daysTo(d);
  if (n === null) return null;
  if (n === 0) return 'today';
  const unit = short ? 'd' : n === 1 || n === -1 ? ' day' : ' days';
  return n > 0 ? `in ${n}${unit}` : `${-n}${unit} ago`;
}

/** Where a card opens its letter's questions and responses. */
export interface InboxResponses {
  projectId: string;
  fire: (m: string, tone?: 'ok' | 'error') => void;
}

/** A request, from another screen, to open one letter (and one of its questions). */
export interface LetterOpening {
  letterId: string;
  questionId: number | null;
  /** A new request for the same letter opens it again. */
  token: number;
}

/** Opens, scrolls to and focuses a card another screen linked to; a new link for the same card does it again. */
function useLinkedOpen(targeted: boolean, token: number | undefined, setOpen: (open: boolean) => void) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!targeted) return;
    setOpen(true);
    ref.current?.scrollIntoView?.({ block: 'start' });
    ref.current?.focus();
  }, [targeted, token, setOpen]);
  return ref;
}

/** One agency communication: what came in, its triage state and its actions. */
function AgencyInboxCard({ c, onAdvance, onAsk, onOpenTask, responses, opening }: {
  c: CommRow;
  onAdvance: (id: string) => void;
  onAsk: (q: string) => void;
  onOpenTask?: () => void;
  responses?: InboxResponses;
  opening?: LetterOpening | null;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const targeted = opening?.letterId === c.id;
  const cardRef = useLinkedOpen(targeted, opening?.token, setOpen);
  const titleId = React.useId();
  const linkedNoteId = React.useId();
  /* The card a link opened takes focus, so it is a named region: its name is
     its own title plus a note that a link opened it. A name on a role-less
     div is prohibited (ARIA 1.2) and, where honoured, hides the card's due
     date, state and actions behind the label. */
  return (
    <div
      ref={cardRef}
      className="cc-comm"
      data-fresh={c._new || undefined}
      data-urgency={c.urgency}
      data-letter-id={c.id}
      tabIndex={targeted ? -1 : undefined}
      role={targeted ? 'region' : undefined}
      aria-labelledby={targeted ? `${titleId} ${linkedNoteId}` : undefined}
    >
      {targeted ? <span id={linkedNoteId} className="sr-only">opened from a link</span> : null}
      <div className="cc-comm-l">
        {/* Urgency on an agency communication was carried by the dot's tone alone. */}
        <span className={'cc-comm-dot tone-' + (CC_TONE[c.urgency] || 'idle')} aria-hidden="true" />
        <span className="sr-only">{c.urgency ? `Urgency: ${c.urgency}` : 'Urgency not set'}</span>
      </div>
      <div className="cc-comm-b">
        <div className="cc-comm-top">
          <span className="cc-comm-t" id={titleId}>{c.communicationType}</span>
          <span className="cc-comm-src">{CC_SOURCE_TYPES[c.sourceType] || c.sourceType}</span>
          {c.responseRequired && <span className="rd-chip tone-err">response required</span>}
          {/* closureStatus is nullable on the register (a row logged before
              the closure workflow existed carries none), so the chip is
              omitted rather than asserting a state. */}
          {c.closureStatus && (
            <span className={'rd-chip tone-' + (CC_CLOSURE[c.closureStatus] || 'idle')}>
              {c.closureStatus.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="cc-comm-meta mono">
          {c.sourceChannel} · received {c.receivedDate}
          {c.dueDate
            ? ' · due ' + c.dueDate + (dueInWords(c.dueDate, true) != null ? ' (' + dueInWords(c.dueDate, true) + ')' : '')
            : ''}
          {/* linkedSectionCodes / extractedIssues are absent, not [], on rows
              the list read narrows or that predate the columns. */}
          {c.linkedSectionCodes?.length ? ' · §' + c.linkedSectionCodes.join(' §') : ''}
          {letterSourceIds(c).length ? ' · letter in the data room' : ''}
          {submissionLinkText(c)}
        </div>
        {c.extractedIssues && c.extractedIssues.length > 0 && (
          <ul className="cc-comm-issues">
            {c.extractedIssues.map((iss, i) => (
              <li key={i}>{iss}</li>
            ))}
          </ul>
        )}
        <div className="cc-comm-foot">
          {c.taskId && onOpenTask && (
            <button className="cc-comm-task" onClick={onOpenTask} title="Open in Tasking">
              {I.checkSquare} {c.taskId}
            </button>
          )}
          {c.responseRequired && c.closureStatus !== 'closed' && (
            <button className="cc-btn sm primary" onClick={() => draftResponseWithAna(c, onAsk)}>
              {I.penLine} Draft response with AnA
            </button>
          )}
          {responses && (
            <button className="cc-btn sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
              {I.list} {open ? 'Hide questions & responses' : 'Questions & responses'}
            </button>
          )}
          {c.closureStatus !== 'closed' && (
            <button className="cc-btn sm" onClick={() => onAdvance(c.id)}>
              {c.humanReviewStatus === 'pending_review' ? 'Triage' : 'Close letter'}
            </button>
          )}
          {c.auditMetadata?.visibilityTier && (
            <span className="cc-comm-vis" title="Visibility tier">
              {I.eye} {c.auditMetadata.visibilityTier.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        {responses && open && (
          <div id={panelId}>
            <AgencyResponses
              projectId={responses.projectId}
              letter={c}
              fire={responses.fire}
              focusQuestionId={targeted ? opening?.questionId ?? null : null}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** The inbox cards, with their honest no-project / loading / error / empty states. */
export function AgencyInboxList({
  hasProject,
  loading,
  error,
  rows,
  onAdvance,
  onAsk,
  onOpenTask,
  responses,
  opening = null,
  emptyHint = 'Nothing has been logged for this project. Inbound agency letters, IRs and gateway acks appear here once captured.',
}: {
  hasProject: boolean;
  loading: boolean;
  error?: string;
  rows: CommRow[];
  onAdvance: (id: string) => void;
  onAsk: (q: string) => void;
  onOpenTask?: () => void;
  /** Lets each card open its letter's questions and responses. */
  responses?: InboxResponses;
  /** A letter another screen asked to open (CMC's "Open on its letter"). */
  opening?: LetterOpening | null;
  emptyHint?: string;
}) {
  /* A letter that is not in this list (deleted, restricted from this person,
     another project's) is said to be so; no other letter is opened instead. */
  const missing = opening && !loading && !error && !rows.some((c) => c.id === opening.letterId)
    ? (
        <p className="cc-q-note" role="alert">
          That letter is not in this project's inbox, or you cannot open it.
        </p>
      )
    : null;
  if (!hasProject) {
    return (
      <EmptyState
        icon={I.fileText}
        title="Open a project to see its agency communications"
        hint="Agency letters, IRs and gateway acks are scoped to a project. Open one from Projects to load its inbox."
      />
    );
  }
  if (loading && rows.length === 0) {
    return (
      <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
        Loading agency communications…
      </div>
    );
  }
  if (error && rows.length === 0) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load agency communications"
        hint="The governed agency-communications register didn't respond. Sign in and retry, or check the service is reachable."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <>
        {missing}
        <EmptyState icon={I.fileText} title="No agency communications yet" hint={emptyHint} />
      </>
    );
  }
  return (
    <>
      {missing}
      <div className="cc-comms">
        {rows.map((c) => (
          <AgencyInboxCard key={c.id} c={c} onAdvance={onAdvance} onAsk={onAsk} onOpenTask={onOpenTask} responses={responses} opening={opening} />
        ))}
      </div>
    </>
  );
}
