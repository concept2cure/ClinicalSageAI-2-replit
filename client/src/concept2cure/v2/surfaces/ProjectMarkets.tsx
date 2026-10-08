/**
 * The project's markets: one row per market, each with its own server verdict,
 * and the header line that states them (docs/design/FILING_SPINE.md F9, §6
 * row 12).
 *
 * Generalised from slice 24's ProjectSubmitStage, ProjectReadiness and
 * ProjectSubmissions (ONE_ANA_ONE_CANVAS.md), which showed ONE verdict per
 * project — the verdict of the submission of the project's own application
 * type — above a list of the project's submissions. A project filing an IND to
 * FDA and an MAA to EMA had a verdict for the IND and none for the MAA. Now
 * the list IS the verdicts: each market (one submission, one application type
 * to one agency) shows its latest sequence, that sequence's verdict from
 * GET /api/submissions/sequences/:seqId/dispatch-readiness, and what the
 * platform can carry for it (MarketSupportLine, F19).
 *
 * Nothing here computes a verdict or a figure. The verdict and its blockers
 * are the server's; the only arithmetic is counting rows the server returned
 * (blockers, gates it marked not assessed, documents on the review board).
 * A read that failed is "No verdict" with a retry on that row only — never
 * "Cleared", and never the other rows hidden.
 *
 * Opening a row opens the Submission Center on that submission and sequence
 * (navParams → submissionNavTarget, F10): on Validation when the server
 * blocked dispatch, otherwise on Sequences.
 *
 * "Add a market" opens the Submission Center's New submission form with the
 * open project named (FILING_SPINE.md F9; the form takes the project, F20).
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, type DataState } from '../dataConnect';
import { MarketSupportLine } from '../MarketSupportLine';
import { stashNavParamsForTarget } from '../navParams';
import { SC_REGIONS, SC_SEQ_STATUS } from '../fixtures/submission';
import type { ReviewItem } from '../fixtures/review-data';
import {
  programTypeLabel,
  SUB_STATUS_LABEL,
  SUB_STATUS_TONE,
  type DispatchReadinessAssessment,
  type LatestSequence,
  type MarketRead,
  type MarketSubmission,
  type ProgramMarket,
  type ProgramMarkets,
} from './programSequence';

const regionLabel = (v: string) => SC_REGIONS.find((r) => r.v === v)?.l ?? v;

/** A market in words: "IND · FDA (US)". */
export function marketName(s: Pick<MarketSubmission, 'applicationType' | 'primaryRegion'>): string {
  return [programTypeLabel(s.applicationType), s.primaryRegion ? regionLabel(s.primaryRegion) : null].filter(Boolean).join(' · ');
}

/** The sequence a verdict is for: "Sequence 0000 · Assembling · 14 leaves"
 *  (the leaf count as the server's assessment states it, when it does). */
function sequenceLine(q: LatestSequence, a: DispatchReadinessAssessment | null): string {
  const status = q.status ? SC_SEQ_STATUS[q.status]?.l ?? q.status : null;
  const leaves = typeof a?.leafCount === 'number' ? `${a.leafCount} ${a.leafCount === 1 ? 'leaf' : 'leaves'}` : null;
  return [q.sequenceNumber ? `Sequence ${q.sequenceNumber}` : `Sequence id ${q.id}`, status, leaves].filter(Boolean).join(' · ');
}

/** The server's gates it cleared without assessing (GateView.notAssessed). */
function unassessedGates(a: DispatchReadinessAssessment | null) {
  return (Array.isArray(a?.gates) ? a.gates : []).filter((g) => g.cleared && Boolean(g.notAssessed));
}

export type VerdictTone = 'ok' | 'blocked' | 'warn' | 'idle';

export interface VerdictWords {
  text: string;
  tone: VerdictTone;
  icon: React.ReactNode;
  /** A read failed: the row offers a retry. */
  failed: boolean;
}

/** The states with no server verdict to state, in words. */
const NO_VERDICT_WORDS: Record<Exclude<MarketRead['state'], 'verdict'>, VerdictWords> = {
  reading: { text: 'Checking…', tone: 'idle', icon: I.clock, failed: false },
  'sequences-failed': { text: 'No verdict · its sequences could not be read', tone: 'warn', icon: I.alertTriangle, failed: true },
  'no-sequence': { text: 'No sequence yet', tone: 'idle', icon: I.rocket, failed: false },
  'verdict-failed': { text: 'No verdict · the readiness read failed', tone: 'warn', icon: I.alertTriangle, failed: true },
};

/** What a cleared verdict did not assess, counted from the server's gates. */
function clearedCaveat(a: DispatchReadinessAssessment | null): string {
  const unassessed = unassessedGates(a).length;
  if (unassessed > 0) return ` · ${unassessed} gate${unassessed === 1 ? '' : 's'} not assessed`;
  const noBreakdown = !Array.isArray(a?.gates);
  return noBreakdown && a?.externalValidation?.ran === false ? ' · external validator not run' : '';
}

/** One market's verdict, in words. "No verdict" whenever the server did not
 *  answer; "Cleared" only when it said so, with what it did not assess. */
export function marketVerdict(read: MarketRead): VerdictWords {
  if (read.state !== 'verdict') return NO_VERDICT_WORDS[read.state];
  const { gate, assessment } = read;
  if (!gate) return { text: 'No verdict from the server', tone: 'warn', icon: I.alertTriangle, failed: false };
  if (gate.cleared) return { text: `Cleared to dispatch${clearedCaveat(assessment)}`, tone: 'ok', icon: I.shieldCheck, failed: false };
  const n = gate.blockers.length;
  const text = n > 0 ? `Dispatch blocked · ${n} blocker${n === 1 ? '' : 's'}` : 'Dispatch blocked';
  return { text, tone: 'blocked', icon: I.lock, failed: false };
}

/** What a cleared verdict did not check, in the server's words. The server
 *  clears a gate whose check did not run and is not required here; a bare
 *  "Cleared to dispatch" would overclaim (slice 24 review). */
function NotAssessedLines({ a }: { a: DispatchReadinessAssessment | null }) {
  const unassessed = unassessedGates(a);
  if (unassessed.length > 0) {
    return (
      <>
        {unassessed.map((g) => (
          <p key={g.key} className="pj-mkt-note" data-testid="pj-market-not-assessed" data-gate={g.key}>
            <span aria-hidden="true">{I.alertTriangle}</span>{' '}
            <b>{g.rule?.title ?? `The ${g.key} gate`}</b>: not assessed. {g.notAssessed}
          </p>
        ))}
      </>
    );
  }
  // A response with no gate breakdown still says whether the validator ran.
  if (a?.externalValidation && a.externalValidation.ran === false) {
    return (
      <p className="pj-mkt-note" data-testid="pj-market-not-assessed" data-gate="external">
        <span aria-hidden="true">{I.alertTriangle}</span> External validator not run: the package has not been checked against it.
      </p>
    );
  }
  return null;
}

/** The server's answer under the verdict: its blockers verbatim, what it did
 *  not assess, and its structural counts. */
function VerdictDetail({ read }: { read: MarketRead }) {
  if (read.state !== 'verdict') return null;
  const { gate, assessment: a } = read;
  const rd = a?.readiness;
  return (
    <>
      {!gate && <p className="pj-mkt-note">The gate is unanswered, which is not the same as cleared.</p>}
      {gate?.cleared && <NotAssessedLines a={a} />}
      {gate && !gate.cleared && gate.blockers.length > 0 && (
        <ol className="pj-mkt-blockers" aria-label="What must close before dispatch">
          {gate.blockers.map((b, i) => <li key={i}>{b}</li>)}
        </ol>
      )}
      {rd && (
        <div className="pj-file-m">
          Structural validation: {rd.errors} error{rd.errors === 1 ? '' : 's'} · {rd.warnings} warning{rd.warnings === 1 ? '' : 's'} · {rd.infos} info
        </div>
      )}
    </>
  );
}

/* The submission status chip's tone, in the file-row vocabulary (pj-file-status data-s). */
const SUB_ROW_TONE: Record<string, string> = { ai: 'acc', ok: 'ok', idle: 'idle' };

/** Where the Submission Center opens: a market's sequence, or the open
 *  project's submission list. Every key the Submission Center reads is
 *  named here (submissionNavTarget: submissionId, sequenceId, ws); a key with
 *  no value is sent empty, and consumeNavParams drops it. */
interface CenterTarget {
  submissionId?: number;
  sequenceId?: number;
  ws: 'validation' | 'sequences' | 'portfolio';
  /** Open New submission on arrival ("Add a market"). */
  newSubmission?: boolean;
}

/** The one way this list opens the Submission Center. */
function openSubmissionCenter(onNav: (id: string) => void, at: CenterTarget): void {
  stashNavParamsForTarget('submission-center', {
    submissionId: at.submissionId != null ? String(at.submissionId) : '',
    sequenceId: at.sequenceId != null ? String(at.sequenceId) : '',
    ws: at.ws,
    newSubmission: at.newSubmission ? '1' : '',
  });
  onNav('submission-center');
}

/** A market opens on its latest sequence: on Validation when the server
 *  blocked dispatch, otherwise on Sequences. */
function marketTarget(m: ProgramMarket): CenterTarget {
  const r = m.read;
  const sequence = r.state === 'verdict' || r.state === 'verdict-failed' ? r.sequence : null;
  const blocked = r.state === 'verdict' && r.gate != null && !r.gate.cleared;
  return { submissionId: m.submission.id, sequenceId: sequence?.id, ws: blocked ? 'validation' : 'sequences' };
}

function MarketRow({ m, onRetry, onOpen }: {
  m: ProgramMarket; onRetry: (id: number) => void; onOpen: ((m: ProgramMarket) => void) | null;
}) {
  const s = m.submission;
  const name = marketName(s);
  const v = marketVerdict(m.read);
  const sequence = m.read.state === 'verdict' || m.read.state === 'verdict-failed' ? m.read.sequence : null;
  const verdictRef = React.useRef<HTMLDivElement>(null);
  /* Retry unmounts itself (the row goes back to "Checking…"), so focus moves
     to the verdict first and the answer is announced where focus is. */
  const retry = () => {
    verdictRef.current?.focus();
    onRetry(s.id);
  };
  return (
    <li className="pj-file pj-mkt" data-testid="pj-submission" data-market={s.id}>
      <div className="pj-file-top">
        <span className="pj-file-badge">{name}</span>
        <span className="pj-file-status" data-s={SUB_ROW_TONE[SUB_STATUS_TONE[s.status] ?? 'idle'] ?? 'idle'}>
          {SUB_STATUS_LABEL[s.status] ?? s.status}
        </span>
        {s.lifecycleStage && <span className="pj-file-m" data-testid="pj-market-stage">{s.lifecycleStage} stage</span>}
      </div>
      <div className="pj-file-n">{s.title}{s.productName ? ` · ${s.productName}` : ''}</div>
      {sequence && <div className="pj-file-m">{sequenceLine(sequence, m.read.state === 'verdict' ? m.read.assessment : null)}</div>}
      {/* The market is named inside the announced text, so a verdict that
          arrives is heard with the market it belongs to. */}
      <div className="pj-mkt-verdict" data-tone={v.tone} data-testid="pj-market-verdict" aria-live="polite" ref={verdictRef} tabIndex={-1}>
        <span className="pj-mkt-verdict-ic" aria-hidden="true">{v.icon}</span>
        <span><span className="pj-sr">{name}: </span>{v.text}</span>
        {v.failed && (
          <button type="button" className="btn ghost pj-mkt-btn" onClick={retry} aria-label={`Retry the verdict for ${name}`}>
            Retry
          </button>
        )}
      </div>
      <VerdictDetail read={m.read} />
      {/* What the platform can carry for this market, in the server's words (F19). */}
      <div className="pj-file-m"><MarketSupportLine applicationType={s.applicationType} market={s.primaryRegion} /></div>
      {onOpen && (
        <div className="pj-mkt-acts">
          <button type="button" className="btn ghost pj-mkt-btn" onClick={() => onOpen(m)} aria-label={`Open ${name} in the Submission Center`}>
            Open {I.right}
          </button>
        </div>
      )}
    </li>
  );
}

/** Submissions in the organisation the project scope left out, as the server
 *  counted them; nothing when it sent no count. */
function notOfferedLine(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  const one = n === 1;
  return (
    `${n} submission${one ? '' : 's'} in this organisation ${one ? 'is' : 'are'} not recorded to this project, so ` +
    `${one ? 'it is' : 'they are'} not listed here. A submission is never matched to a project by name.`
  );
}

/** The scoped list was refused for the person's role (GET /api/submissions
 *  requires the regulatory-author role). A retry cannot change that. */
export function marketsForbidden(markets: ProgramMarkets): boolean {
  return Boolean(markets.list.error) && markets.list.status === 403;
}

const FORBIDDEN_WORDS = 'Your role does not include reading submissions, so this project’s markets are not shown.';

function MarketsBody({ markets, onOpen, center }: {
  markets: ProgramMarkets; onOpen: ((m: ProgramMarket) => void) | null; center: boolean;
}) {
  const { list } = markets;
  if (list.loading) {
    return <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>Loading this project&apos;s markets…</div>;
  }
  if (marketsForbidden(markets)) {
    return <p className="pj-mkt-note" data-testid="pj-markets-forbidden">{FORBIDDEN_WORDS}</p>;
  }
  if (list.error) {
    return (
      <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load this project's markets"
        hint="The submission store didn't respond, so nothing here says whether the project has any." retry={markets.retryList} />
    );
  }
  const others = notOfferedLine(markets.notOffered);
  if (markets.markets.length === 0) {
    const start = center ? ' Add a market to start one.' : '';
    return (
      <EmptyState icon={I.rocket} title="No market for this project yet"
        hint={`A market is one submission: an application to one agency.${start}${others ? ` ${others}` : ''}`} />
    );
  }
  return (
    <>
      <ul className="pj-files pj-mkts" aria-label="Markets">
        {markets.markets.map((m) => <MarketRow key={m.submission.id} m={m} onRetry={markets.retryMarket} onOpen={onOpen} />)}
      </ul>
      {others && <p className="pj-mkt-note">{others}</p>}
    </>
  );
}

/** The Submit tab's market list. "Open Submission Center" opens the open
 *  project's submission list, where New submission takes the project from
 *  the shell (NewSubmissionForm, F20). */
export function ProjectMarkets({ markets, onNav, available, ectdFiling }: {
  markets: ProgramMarkets;
  onNav: (id: string) => void;
  available: (id: string) => boolean;
  /** The project is read and is not a device or diagnostic filing. */
  ectdFiling: boolean;
}) {
  const center = available('submission-center');
  return (
    <section className="pj-sec" aria-labelledby="pj-markets-h" data-testid="pj-markets">
      <div className="pj-sec-h">
        <h2 id="pj-markets-h">Markets</h2>
        <span className="pj-sec-acts">
          {/* The readiness screen (Submission Readiness), kept as slice 24's
              door until F10 retargets it to Validation on the gated sequence. */}
          {available('dispatch-readiness') && (
            <button type="button" className="btn ghost pj-mkt-btn" onClick={() => onNav('dispatch-readiness')}>
              Open readiness {I.right}
            </button>
          )}
          {/* eCTD compile reads the open project's submission. F14 moves it
              onto the sequence's Dispatch tab. It builds an FDA/EMA eCTD
              backbone only, which is not how a 510(k), De Novo or PMA is
              filed, so a device or diagnostic project, or one not yet read,
              is not offered it. */}
          {ectdFiling && available('ectd-compile') && (
            <button type="button" className="btn ghost pj-mkt-btn" onClick={() => onNav('ectd-compile')}>
              Compile and download {I.right}
            </button>
          )}
          {center && (
            <button type="button" className="btn primary pj-mkt-btn" onClick={() => openSubmissionCenter(onNav, { ws: 'portfolio', newSubmission: true })}>
              {I.plus} Add a market
            </button>
          )}
          {/* The Submission Center reads the open project, so it opens on this one. */}
          {center && (
            <button type="button" className="btn ghost pj-mkt-btn" onClick={() => openSubmissionCenter(onNav, { ws: 'portfolio' })}>
              Open Submission Center {I.right}
            </button>
          )}
        </span>
      </div>
      <MarketsBody markets={markets} center={center} onOpen={center ? (m) => openSubmissionCenter(onNav, marketTarget(m)) : null} />
    </section>
  );
}

/** The board read the Review tab makes, as the header line counts it. */
export interface ReviewCountRead {
  state: DataState<{ queue: ReviewItem[] }>;
  retry: () => void;
  /** The queue cap asked of the board: a full queue may hold more. */
  cap: number;
  /** Whether a board row is still out for review, by the rule the Review
   *  tab groups by (ProjectHome isOutForReview). Approved, declined and
   *  changes-requested rows are on the board but not in review. */
  inReview: (row: ReviewItem) => boolean;
}

function reviewWords(r: ReviewCountRead, retry: (fn: () => void) => () => void): React.ReactNode {
  if (r.state.loading) return <span className="pj-status-item" data-tone="idle">Reading reviews…</span>;
  const queue = r.state.data?.queue;
  if (r.state.error || !Array.isArray(queue)) {
    return (
      <span className="pj-status-item" data-tone="warn" role="alert">
        <span aria-hidden="true">{I.alertTriangle}</span> Reviews could not be read
        <button type="button" className="btn ghost pj-mkt-btn" onClick={retry(r.retry)} aria-label="Retry reading the reviews">Retry</button>
      </span>
    );
  }
  const n = queue.filter(r.inReview).length;
  /* A full queue may hold more rows than were returned, in review or not. */
  const more = queue.length >= r.cap;
  const count = n === 0 && !more ? 'No document' : `${n}${more ? ' or more' : ''} document${n === 1 && !more ? '' : 's'}`;
  return <span className="pj-status-item" data-tone="idle" data-testid="pj-status-reviews">{count} in review</span>;
}

/** The line under the project header: each market's verdict and the number
 *  of documents in review, from the same reads the Submit and Review tabs
 *  show. Nothing in it is computed beyond counting rows the server returned. */
export function ProjectStatusLine({ markets, reviews }: { markets: ProgramMarkets; reviews: ReviewCountRead }) {
  const { list } = markets;
  const lineRef = React.useRef<HTMLDivElement>(null);
  /* A Retry unmounts itself while its read runs; focus stays on the line. */
  const retry = (fn: () => void) => () => {
    lineRef.current?.focus();
    fn();
  };
  let marketItems: React.ReactNode;
  if (list.loading) {
    marketItems = <span className="pj-status-item" data-tone="idle">Reading this project&apos;s markets…</span>;
  } else if (marketsForbidden(markets)) {
    // A role that cannot read submissions: nothing to retry, and nothing failed.
    marketItems = null;
  } else if (list.error) {
    marketItems = (
      <span className="pj-status-item" data-tone="warn" role="alert">
        <span aria-hidden="true">{I.alertTriangle}</span> Markets could not be read
        <button type="button" className="btn ghost pj-mkt-btn" onClick={retry(markets.retryList)} aria-label="Retry reading the markets">Retry</button>
      </span>
    );
  } else if (markets.markets.length === 0) {
    marketItems = <span className="pj-status-item" data-tone="idle">No market yet</span>;
  } else {
    marketItems = markets.markets.map((m) => {
      const v = marketVerdict(m.read);
      return (
        <span key={m.submission.id} className="pj-status-item" data-tone={v.tone}>
          <span aria-hidden="true">{v.icon}</span> <b>{marketName(m.submission)}</b> {v.text}
        </span>
      );
    });
  }
  return (
    <div className="pj-status" role="group" data-testid="pj-status-line" aria-label="Where this filing stands" ref={lineRef} tabIndex={-1}>
      {marketItems}
      {reviewWords(reviews, retry)}
    </div>
  );
}
