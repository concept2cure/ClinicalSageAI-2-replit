/**
 * <GovernedTimestamp> — the one way to render a governed-record timestamp.
 *
 * FDA / EMA inspectors correlate every governed action against server-side
 * UTC audit rows. The client's local `toLocaleString()` shows browser-locale
 * time with no tz label — a formatting choice that reads as clock drift when
 * an inspector diffs a client screenshot against the audit trail. The audit
 * called this out at `EsignModal.tsx:341` and `AuditTimeline.tsx:14`; both
 * now render through this component.
 *
 * Contract:
 *   • The absolute UTC value is the primary display (unambiguous, correlates
 *     to the audit row).
 *   • The viewer's local rendering is offered as a secondary line with the
 *     resolved IANA time zone appended, so a signer who wants to check
 *     "when did I sign" against their own clock has that too — and knows
 *     which clock they're looking at.
 *   • A `<time datetime=…>` element carries the machine-readable ISO for
 *     copy/paste and assistive tech, without changing what the user sees.
 *   • Invalid or absent input renders `—` and is announced by no ARIA
 *     shouting — the caller decides whether missing timestamps are notable.
 *
 * Not a "pretty date" formatter. Do not use it for casual dates elsewhere in
 * the UI; use it wherever the timestamp is bound to a governed record
 * (audits, signatures, immutable ledger entries).
 *
 * @module client/src/concept2cure/_shared/components/GovernedTimestamp
 */
import * as React from 'react';

export interface GovernedTimestampProps {
  /** ISO 8601 or anything `new Date()` accepts. Missing or invalid → `—`. */
  value: string | number | Date | null | undefined;
  /**
   * How to lay the primary UTC and secondary local lines out.
   *  - 'stacked' (default): UTC on line 1, "local · <tz>" on line 2. For
   *    modals, audit tables, and any surface with vertical room.
   *  - 'inline': "UTC · local (tz)" on one line. For dense list rows.
   */
  layout?: 'stacked' | 'inline';
  /** Optional className passed to the wrapper `<time>` element. */
  className?: string;
}

const ABSENT = '—';

function formatUtc(d: Date): string {
  // 2026-07-30 23:59:00 UTC — no seconds fraction, no timezone abbreviation
  // beyond the trailing UTC (audit rows use ISO Z; this is the human form).
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function formatLocal(d: Date): { text: string; tz: string } {
  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  const text = d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { text, tz };
}

export function GovernedTimestamp({
  value,
  layout = 'stacked',
  className,
}: GovernedTimestampProps): React.ReactElement {
  if (value == null || value === '') {
    return <span className={className}>{ABSENT}</span>;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return <span className={className}>{ABSENT}</span>;
  }

  const utc = formatUtc(d);
  const local = formatLocal(d);
  const iso = d.toISOString();

  if (layout === 'inline') {
    return (
      <time dateTime={iso} className={className}>
        <span>{utc}</span>
        <span aria-hidden="true"> · </span>
        <span>
          {local.text} ({local.tz})
        </span>
      </time>
    );
  }

  return (
    <time
      dateTime={iso}
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}
    >
      <span>{utc}</span>
      <span style={{ opacity: 0.65, fontSize: '0.85em' }}>
        {local.text} · {local.tz}
      </span>
    </time>
  );
}

export default GovernedTimestamp;
