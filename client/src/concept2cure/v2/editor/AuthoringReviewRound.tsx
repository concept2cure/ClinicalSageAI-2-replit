/**
 * The document's review route in the Authoring workbench (RR5 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.12): the round the request
 * sent, read from GET /api/authoring/documents/:id/review-route, in the words
 * every route uses (memberLine, routeHeadline, RouteHistory in
 * ../reviewRoute/), and what the route lets the reader do here:
 *
 *   - a named reviewer whose turn it is is told how to sign: the document's
 *     E-sign with the meaning Review, the existing signing ceremony, whose
 *     signature closes their task on the route;
 *   - a named reviewer who cannot do it hands it back, with a reason
 *     (RouteActDialog, the one reason-only act dialog);
 *   - the sender, or an administrator, reassigns an unsigned member
 *     (RouteReassignSheet, the one reassign sheet, offering whom the route's
 *     validator admits).
 *
 * A route that could not be read says so, never "no reviewers". A document
 * with no route (nothing sent, or a review requested before RR5) shows
 * nothing here: its review requests are the task rows below.
 *
 * Nothing here decides who may sign: the server does, before the credential.
 *
 * @module client/src/concept2cure/v2/editor/AuthoringReviewRound
 */
import React, { useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';
import { memberLine, routeHeadline, type RouteMemberView, type RouteRoundView } from '../reviewRoute/routeRound';
import { RouteHistory } from '../reviewRoute/RouteHistory';
import { RouteReassignSheet } from '../reviewRoute/RouteReassignSheet';
import { nameOf, utc } from '../reviewRoute/routeText';
import { RouteActDialog } from '../surfaces/VaultReviewRoute';

const documentPath = (docId: string) => `/api/authoring/documents/${encodeURIComponent(docId)}`;
const AUDIT = 'this document’s audit trail';
const UNKNOWN_OUTCOME = 'The connection dropped, so it is not known whether this was recorded. Refresh the document’s tasks before trying again.';

/** One POST of a route act on the document; a refusal is thrown in the server's own words. */
export async function authoringRoutePost(url: string, body: Record<string, unknown>, failed: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiRequest('POST', url, body);
  } catch (e) {
    if (e instanceof ApiRequestError) throw new Error(`${failed} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.success !== true) throw new Error(`${failed} ${redactInternals(serverMessage(json), 'No reason was returned. Refresh and try again.')}`);
  return json;
}

interface RoundRead { round: RouteRoundView | null }
const isRoundRead = (v: unknown): v is RoundRead => {
  const o = v as RoundRead | null;
  return !!o && typeof o === 'object' && 'round' in o && (o.round === null || (!!o.round && Array.isArray(o.round.members) && !!o.round.route));
};

type Open = { kind: 'hand-back' } | { kind: 'reassign'; member: RouteMemberView } | null;

/** What the route lets the reader do: whose turn it is, whether they may hand back, and whether they reassign. */
function readerOf(round: RouteRoundView, meId: number | null, admin: boolean) {
  const live = round.route.status === 'open';
  const mine = live ? round.members.find((m) => m.userId === meId && m.outcome === 'pending') ?? null : null;
  return {
    sender: meId !== null && round.route.senderId === meId,
    mine,
    signNow: mine !== null && mine.stepOpen && mine.role === 'reviewer',
    reassigns: live && meId !== null && (round.route.senderId === meId || admin),
  };
}

function MemberList({ round, reassigns, onReassign }: { round: RouteRoundView; reassigns: boolean; onReassign: (m: RouteMemberView) => void }) {
  return (
    <ul className="vr-members" aria-label="Named on this review route">
      {round.members.map((m) => (
        <li key={m.taskId} className="vr-member" data-testid={`ar-round-member-${m.userId}`}>
          <span>{memberLine(m, round)}</span>
          {reassigns && (m.outcome === 'pending' || m.outcome === 'handed back') ? (
            <button type="button" className="sp-ask" aria-label={`Reassign ${nameOf(m)}`} onClick={() => onReassign(m)}>Reassign</button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RoundActs({ open, docId, title, onClose, onDone }: { open: Open; docId: string; title: string; onClose: () => void; onDone: () => void }) {
  if (open?.kind === 'hand-back') {
    return (
      <RouteActDialog act="hand-back" canonicalId="" title={title} reviewComplete={false} audit={AUDIT}
        post={(body) => authoringRoutePost(`${documentPath(docId)}/review-route/hand-back`, body, 'Your assignment was not handed back.')}
        onClose={onClose} onDone={onDone} />
    );
  }
  if (open?.kind === 'reassign') {
    return (
      <RouteReassignSheet member={open.member} title={title} candidatesUrl={`${documentPath(docId)}/route-candidates?for=reassign`} audit={AUDIT}
        post={(body) => authoringRoutePost(`${documentPath(docId)}/review-route/reassign`, body, 'The assignment was not reassigned.')}
        onClose={onClose} onDone={onDone} />
    );
  }
  return null;
}

function Round({ round, docId, title, meId, admin, onChanged }: {
  round: RouteRoundView; docId: string; title: string; meId: number | null; admin: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const can = readerOf(round, meId, admin);
  const done = () => { setOpen(null); onChanged(); };
  return (
    <section className="vr-round" aria-label="Review route" data-testid="ar-round" style={{ margin: '8px 12px' }}>
      <span className="vr-round-h" data-testid="ar-round-headline">{routeHeadline(round, meId)}</span>
      <span className="vr-round-m">{`Review route ${round.route.round} · sent by ${can.sender ? 'you' : round.route.senderName} · ${utc(round.route.createdAt)}`}</span>
      <MemberList round={round} reassigns={can.reassigns} onReassign={(member) => setOpen({ kind: 'reassign', member })} />
      {can.signNow ? (
        <div className="de-desc" data-testid="ar-round-sign-note">
          Sign the review with E-sign on this document, meaning Review: your signature closes your task on this route. To ask for changes instead, record “changes requested” on the Review board, which returns the route to its sender.
        </div>
      ) : null}
      {can.mine ? <button type="button" className="de-btn ghost" data-testid="ar-round-hand-back" onClick={() => setOpen({ kind: 'hand-back' })}>Hand back</button> : null}
      <RouteHistory history={round.history} />
      <RoundActs open={open} docId={docId} title={title} onClose={() => setOpen(null)} onDone={done} />
    </section>
  );
}

export function AuthoringReviewRound({ docId, title, meId, admin, refreshKey, onChanged }: {
  docId: string;
  title: string;
  /** The reader's account id, as the route names its members. */
  meId: number | null;
  /** An organization administrator reassigns as the sender does. */
  admin: boolean;
  refreshKey: number;
  /** A route act changed the route: the document's tasks are read again too. */
  onChanged?: () => void;
}) {
  const [epoch, setEpoch] = useState(0);
  const read = useLiveData<RoundRead>(`${documentPath(docId)}/review-route`, [docId, refreshKey, epoch], isRoundRead);
  if (read.loading) return <div role="status" className="scaf-note" style={{ padding: '4px 12px' }}>Reading the review route…</div>;
  if (read.error) {
    return (
      <div className="de-err" role="alert" style={{ margin: '8px 12px' }} data-testid="ar-round-unread">
        Reviewers could not be read. Refresh to see who is named on this document’s review route; this does not mean nobody is.
      </div>
    );
  }
  const round = read.data?.round ?? null;
  if (!round) return null;
  return <Round round={round} docId={docId} title={title} meId={meId} admin={admin} onChanged={() => { setEpoch((n) => n + 1); onChanged?.(); }} />;
}
