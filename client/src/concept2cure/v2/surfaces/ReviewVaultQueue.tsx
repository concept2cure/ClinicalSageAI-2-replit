/**
 * Vault versions in review, on the Review & approval board (QA 2026-10-08,
 * walk 2, j3 (b)).
 *
 * "Send for review" on a Vault version assigns nobody: any member whose role
 * carries signing authority, other than its uploader and sender, signs the
 * review. The board read only Authoring's review store, so a version in review
 * was in nobody's queue. GET /api/review/board now carries `vaultReviews`
 * (server/services/review/vault-review-queue.ts); this lists them and says who
 * has each one, by name, or plainly that nobody in the organization can sign
 * it. The step itself is taken on the version in the Vault, where the
 * signature dialog is.
 *
 * Since RR1b (docs/design/REVIEW_ROUTING_2026-10-23.md §2.11) a version sent on
 * a named route is held by its named members whose turn it is: "Awaiting my
 * review" lists it with the reader's own due date, and "Requested by me" with
 * every member's outcome (the round panel the version shows, with Remind).
 * "Open the version" opens that version in the Vault of its project, as the
 * route's notice does. A route that could not be read says so.
 */
import React from 'react';

import { I } from '../icons';
import { RouteRoundPanel } from './VaultReviewRoute';
import type { RouteRoundView } from '../reviewRoute/routeRound';

export interface VaultReviewItem {
  canonicalId: string;
  vaultId: string;
  programId: string | null;
  program: string | null;
  title: string;
  version: string | null;
  step: 'review' | 'approve';
  sentBy: string | null;
  sentAt: string | null;
  /** Null when the member list could not be read. */
  eligibleSigners: string[] | null;
  mine: boolean;
  sentByMe: boolean;
  /** 'live' or 'withdrawn' for a named route; 'legacy' for a version in review without one (absent from an older server). */
  routeState?: 'live' | 'withdrawn' | 'legacy';
  round?: RouteRoundView | null;
  /** The route could not be read: who holds it is unknown. */
  routeUnread?: boolean;
  /** The reader's own due date, when it is their turn. */
  myDueAt?: string | null;
}

/** Who has it, in one sentence. */
export function vaultReviewHolder(item: VaultReviewItem): string {
  const act = item.step === 'review' ? 'sign the review' : 'approve it';
  if (item.routeUnread) return 'Reviewers could not be read. Open it in the Vault to see who is named.';
  if (item.routeState === 'withdrawn') return 'Its review route was withdrawn: nothing is signed on it until a new route is sent.';
  if (item.routeState === 'live') {
    const names = (item.eligibleSigners ?? []).join(', ');
    if (item.mine) return `Your turn: ${act}${item.myDueAt ? `, due ${utcDate(item.myDueAt)}` : ''}.${names ? ` Also waiting for ${names}.` : ''}`;
    return `Named on its route${names ? `, waiting for ${names}` : ''}.`;
  }
  if (item.eligibleSigners === null) return `Who can ${act} could not be read. Open it in the Vault to see.`;
  if (item.eligibleSigners.length === 0) {
    return `No one in this organization can ${act}: no member other than ${item.step === 'review' ? 'its uploader and the person who sent it' : 'its uploader, sender and reviewer'} holds a role with signing authority. An organization admin can give a member a role that carries it.`;
  }
  const names = item.eligibleSigners;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return `${item.mine ? 'You can ' + act + '. ' : ''}Not assigned to one person. Can ${act}: ${list}.`;
}

function utcDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ReviewVaultQueue({ items, onOpenVault, meId }: {
  /** Undefined from an older server; null when the read failed. */
  items: VaultReviewItem[] | null | undefined;
  /** Open this version in the Vault of its project. */
  onOpenVault: (item: VaultReviewItem) => void;
  /** The reader, for the round's "You signed at …" (null when unknown). */
  meId?: number | null;
}) {
  if (items === undefined || (items !== null && items.length === 0)) return null;
  return (
    <section className="rv-vault" aria-label="Vault versions in review" data-testid="review-vault-queue">
      <div className="rv-vault-h">Vault versions in review</div>
      {items === null ? (
        <div className="rv-reject-note" role="alert">
          {I.alertTriangle} The Vault versions in review could not be read, so this board may be missing some. Open the
          Vault to see each version&rsquo;s stage.
        </div>
      ) : (
        <div className="rv-vault-list">
          {items.map((item) => {
            const sent = utcDate(item.sentAt);
            return (
              <div key={item.canonicalId} className="lrow" data-testid={`review-vault-item-${item.canonicalId}`}>
                <div className="lrow-top">
                  <span className="lrow-title">
                    {item.title}
                    {item.version ? ` v${item.version}` : ''}
                  </span>
                  <span className="rd-chip tone-warn">
                    {item.routeState === 'withdrawn' ? 'Route withdrawn' : item.step === 'review' ? 'Awaiting review signature' : 'Awaiting approval'}
                  </span>
                </div>
                <div className="rv-reject-note">{vaultReviewHolder(item)}</div>
                {item.sentByMe && item.round ? (
                  <RouteRoundPanel view={{ kind: item.routeState === 'withdrawn' ? 'withdrawn' : 'live', round: item.round }}
                    meId={meId ?? null} title={`${item.title}${item.version ? ` v${item.version}` : ''}`} canRemind />
                ) : null}
                <div className="lrow-meta">
                  {item.program ? <span>{item.program}</span> : null}
                  <span>
                    Sent for review{item.sentBy ? ` by ${item.sentByMe ? 'you' : item.sentBy}` : ''}
                    {sent ? ` · ${sent}` : ''}
                  </span>
                  <button type="button" className="btn ghost" onClick={() => onOpenVault(item)}>
                    Open the version
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
