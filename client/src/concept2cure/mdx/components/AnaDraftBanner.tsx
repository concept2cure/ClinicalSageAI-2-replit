/**
 * AnaDraftBanner — inline affordance shown on a section row when AnA has
 * drafted content via the write_kit_section tool and the user hasn't
 * accepted yet.
 *
 * Closes the loop in the kit's editor surfaces (K510Surface, PmaSurface,
 * CerSurface): the user sees "Drafted by AnA · 2m ago — Accept | Refine"
 * and either accepts the draft (clears draft_source, stamps accepted_at /
 * accepted_by, status flips to ready_for_review) or opens the editor at
 * that section to refine first.
 *
 * Voice + visual rules per CLAUDE.md:
 *   - Sentence case
 *   - 13px body / 11px metadata
 *   - Claude orange (--accent-100) reserved for the single focal action
 *   - 200ms ease-out motion only
 *   - No emoji, no exclamation, no cheerleading
 */

import * as React from 'react';
import { I } from '../icons';
import type { DraftProvenance } from '../data/k510';
import { useAcceptAnaDraft } from '../hooks/useAcceptAnaDraft';

export interface AnaDraftBannerProps {
  draft: DraftProvenance;
  /** Open the section in the editor for refinement before accept. */
  onRefine?: () => void;
  /** Called after a successful accept so the parent can refresh data and
   *  let the affordance disappear from the list. */
  onAccepted?: () => void;
}

/** Compact relative-time formatter — "2m ago", "3h ago", "yesterday". */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function AnaDraftBanner({ draft, onRefine, onAccepted }: AnaDraftBannerProps) {
  const { accept, loading, error } = useAcceptAnaDraft(draft.rowId, onAccepted);

  return (
    <div className="ana-draft-banner" role="status">
      <div className="ana-draft-meta">
        <span className="ana-draft-dot" aria-hidden />
        <span className="ana-draft-label">
          Drafted by AnA · <time dateTime={draft.at}>{timeAgo(draft.at)}</time>
        </span>
        {draft.summary ? (
          <span className="ana-draft-summary" title={draft.summary}>
            {draft.summary}
          </span>
        ) : null}
      </div>
      <div className="ana-draft-actions">
        {onRefine ? (
          <button
            type="button"
            className="ana-draft-btn ghost"
            onClick={onRefine}
            disabled={loading}
          >
            Refine
          </button>
        ) : null}
        <button
          type="button"
          className="ana-draft-btn primary"
          onClick={() => void accept()}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Accepting…' : 'Accept'}
          <span className="ana-draft-arrow" aria-hidden>{I.arrowRight}</span>
        </button>
      </div>
      {error ? (
        <div className="ana-draft-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
