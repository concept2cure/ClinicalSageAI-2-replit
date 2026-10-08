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
 */
import React from 'react';

import { I } from '../icons';

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
}

/** Who has it, in one sentence. */
export function vaultReviewHolder(item: VaultReviewItem): string {
  const act = item.step === 'review' ? 'sign the review' : 'approve it';
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

export function ReviewVaultQueue({ items, onOpenVault }: {
  /** Undefined from an older server; null when the read failed. */
  items: VaultReviewItem[] | null | undefined;
  onOpenVault: () => void;
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
                    {item.step === 'review' ? 'Awaiting review signature' : 'Awaiting approval'}
                  </span>
                </div>
                <div className="rv-reject-note">{vaultReviewHolder(item)}</div>
                <div className="lrow-meta">
                  {item.program ? <span>{item.program}</span> : null}
                  <span>
                    Sent for review{item.sentBy ? ` by ${item.sentByMe ? 'you' : item.sentBy}` : ''}
                    {sent ? ` · ${sent}` : ''}
                  </span>
                  <button type="button" className="btn ghost" onClick={onOpenVault}>
                    Open in the Vault
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
