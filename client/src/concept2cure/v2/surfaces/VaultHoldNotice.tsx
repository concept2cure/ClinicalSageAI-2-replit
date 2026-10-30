/**
 * "On legal hold" on a Vault document (MR-08 Stage 5 step 5).
 *
 * Every reader of the project sees that the document is held, under which
 * matter reference and since when, before they are offered a withdrawal. A
 * project hold covers every document; a document hold covers the version it
 * names. The hold's reason, and placing and lifting, are in Admin › Settings,
 * for the roles that hold that authority. When the holds could not be read the
 * notice says so: an unread hold is never shown as no hold.
 */
import React from 'react';
import { I } from '../icons';

export interface VaultHoldNoticeShape {
  scope: 'program' | 'document';
  documentId: string | null;
  reference: string;
  placedAt: string;
}

/** The holds that cover one version: every project hold, and a hold naming it. */
export function holdsCovering(holds: readonly VaultHoldNoticeShape[], documentId: string | null | undefined): VaultHoldNoticeShape[] {
  return holds.filter((h) => h.scope === 'program' || (documentId != null && h.documentId === documentId));
}

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
};

export function holdNoticeText(covering: readonly VaultHoldNoticeShape[]): string {
  const each = covering.map((h) => `${h.reference} (${h.scope === 'program' ? 'the whole project' : 'this version'}, since ${day(h.placedAt)})`);
  return `On legal hold: ${each.join('; ')}. While a hold is in place this document cannot be withdrawn or disposed of. Holds are placed and lifted in Admin, Settings.`;
}

export function VaultHoldNotice({ holds, unreadable, documentId }: {
  /** The project's active holds from the Vault read; undefined when the server did not say. */
  holds?: readonly VaultHoldNoticeShape[];
  /** The server could not read the holds. */
  unreadable?: boolean;
  documentId?: string | null;
}) {
  if (unreadable) {
    return (
      <div className="vd-dr-err" role="alert" data-testid="vault-hold-unreadable">
        {I.alertTriangle} Whether this document is on legal hold could not be read. Do not withdraw or dispose of it until that is known.
      </div>
    );
  }
  const covering = holdsCovering(holds ?? [], documentId);
  if (!covering.length) return null;
  return (
    <div className="tl-warn-row" role="note" data-testid="vault-hold-notice">
      {I.lock} {holdNoticeText(covering)}
    </div>
  );
}
