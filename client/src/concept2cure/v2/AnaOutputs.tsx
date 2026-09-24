/**
 * AnA's output, beneath the turn that produced it — a file card with a small
 * page of the real draft.
 *
 * ── Why a card ───────────────────────────────────────────────────────────────
 * A draft used to appear in most hosts as one line of text ("Drafted
 * Clinical Overview 2.5"), easy to scroll past and impossible to recognise at
 * a glance. The card shows the thing itself: a miniature page set in the
 * reading face, with the draft's own title and its opening text, a type
 * badge, and what is known about where it was saved.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * The page is the draft's REAL text, clipped — never lorem, never a
 * placeholder silhouette. A draft whose text the turn did not carry (a thread
 * reopened later) shows its title alone. The saved line is `draftNote`: saved
 * only when the server said so. The card opens something only when its host
 * passes somewhere to open it; otherwise it is a record, not a button.
 *
 * The full-page conversation does not mount this: it renders the same draft as
 * the document canvas (docs/design/ANA_DOCUMENT_CANVAS.md) or an artifact card
 * of its own, and the rail's card opens that very page.
 *
 * @module client/src/concept2cure/v2/AnaOutputs
 */

import React from 'react';

import { I } from './icons';
import type { AnaChatMessage } from '../components/ana/useAnaChat';
import { draftNote } from './anaWorkModel';

/** How much of the draft the miniature page carries. */
const PAGE_CHARS = 520;

/** The draft's opening text as plain words: markup, markdown marks and runs of space removed. */
export function pageExcerpt(content: string | undefined, title: string): string {
  if (!content) return '';
  const plain = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A body that opens by repeating its title would print it twice on the page.
  const body = plain.toLowerCase().startsWith(title.toLowerCase()) ? plain.slice(title.length).trim() : plain;
  return body.length > PAGE_CHARS ? `${body.slice(0, PAGE_CHARS).trimEnd()}…` : body;
}

function humanType(t: string | undefined): string | null {
  if (!t) return null;
  const words = t.replace(/[_-]+/g, ' ').trim();
  if (!words) return null;
  return words.length <= 4 ? words.toUpperCase() : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The fields of a turn the card reads: its draft, and whether it is still in flight. */
export type AnaOutput = Pick<AnaChatMessage, 'generatedDraft' | 'streaming'>;

export interface AnaOutputCardsProps {
  message: AnaOutput;
  /** Where the card leads, when the host has somewhere to open it. */
  onOpen?: () => void;
  /** The words of that action, shown on the card ("Open in conversation"). */
  openLabel?: string;
}

export function AnaOutputCards({ message, onOpen, openLabel = 'Open' }: AnaOutputCardsProps) {
  const d = message.generatedDraft;
  if (!d?.title) return null;
  const excerpt = pageExcerpt(d.content, d.title);
  const type = humanType(d.documentType);
  const note = draftNote(message);
  const face = (
    <>
      <span className="ana-out-thumb" aria-hidden="true">
        <span className="ana-out-page">
          <span className="ana-out-page-t">{d.title}</span>
          {excerpt ? <span className="ana-out-page-b">{excerpt}</span> : null}
        </span>
        <span className="ana-out-badge">Draft</span>
      </span>
      <span className="ana-out-cap">
        <span className="ana-out-title">{d.title}</span>
        <span className="ana-out-meta">{[type, note].filter(Boolean).join(' · ')}</span>
        {onOpen ? (
          <span className="ana-out-go">
            {openLabel} <span aria-hidden="true">{I.arrowRight}</span>
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <div className="ana-out" role="group" aria-label="Output">
      {onOpen ? (
        <button type="button" className="ana-out-card is-action" onClick={onOpen}>
          {face}
        </button>
      ) : (
        <div className="ana-out-card">{face}</div>
      )}
    </div>
  );
}

export default AnaOutputCards;
