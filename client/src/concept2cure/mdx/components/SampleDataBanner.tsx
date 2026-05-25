/**
 * SampleDataBanner — honest indicator shown when a surface (or panel) is
 * rendering canonical example fixtures instead of the tenant's live data.
 *
 * Why this exists: every MDX surface falls back to a kit fixture when its
 * live fetch returns no rows (idle, loading, error, or an unconfigured
 * backend). Without a marker a user cannot tell sample content from their
 * own regulated data — a real hazard if a filing decision is made off
 * example predicates. This banner makes the distinction explicit.
 *
 * Contract: render it wherever a fixture fallback is in effect. The
 * surface owns the decision; the canonical signal is the live source
 * being null while not loading:
 *
 *   const usingSample = liveRows === null && !loading;
 *   <SampleDataBanner show={usingSample} loading={loading} />
 *
 * While the fetch is still in flight, pass `loading` so the banner reads
 * as transient ("loading your data") rather than a standing warning.
 *
 * Voice + visual rules per CLAUDE.md:
 *   - Sentence case, no emoji, no exclamation, no cheerleading
 *   - 13px body / 11px metadata
 *   - Lucide icons only, 200ms ease-out motion only
 *   - Neutral treatment — accent orange stays reserved for the one focal
 *     action per screen, so this informational marker does not use it
 */

import * as React from 'react';
import { I } from '../icons';

export interface SampleDataBannerProps {
  /** Render only when the surface is actually showing fixture content. */
  show: boolean;
  /** True while the live fetch is in flight — softens copy to "loading". */
  loading?: boolean;
  /** Optional noun for what is sampled, e.g. "predicate candidates". */
  label?: string;
}

export function SampleDataBanner({ show, loading = false, label }: SampleDataBannerProps) {
  if (!show) return null;

  const subject = label ? `The ${label} below` : 'This view';

  return (
    <div className="sample-data-banner" role="status" aria-live="polite">
      <span className="sample-data-icon" aria-hidden>
        {loading ? I.database : I.alertCircle}
      </span>
      <span className="sample-data-text">
        {loading ? (
          <>Loading your data — {subject.toLowerCase()} shows canonical sample content until it arrives.</>
        ) : (
          <>
            <strong className="sample-data-tag">Sample data</strong> — not your project. {subject} shows
            canonical example content; your live data appears once the source is connected.
          </>
        )}
      </span>
    </div>
  );
}
