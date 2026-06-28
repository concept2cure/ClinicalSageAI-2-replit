/**
 * Formatting helpers local to the Business Center. Copied (not imported) from
 * the Master Administration util patterns to keep this module self-contained.
 * All money is integer cents in USD.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format integer cents as USD, e.g. 149900 → "$1,499.00". */
export function fmtUsd(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  return USD.format(cents / 100);
}

/** Format integer cents as whole-dollar USD, e.g. 149900 → "$1,499". */
export function fmtUsdWhole(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  return USD_WHOLE.format(cents / 100);
}

/** Format a server-supplied percentage (already rounded), e.g. 62.5 → "62.5%". */
export function fmtPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${pct}%`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString();
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Map a status string to a tone class used by the Badge component. */
export function statusTone(status: string): 'ok' | 'warn' | 'err' | 'muted' {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'healthy':
      return 'ok';
    case 'suspended':
    case 'past_due':
      return 'err';
    case 'trialing':
    case 'incomplete':
      return 'warn';
    default:
      return 'muted';
  }
}

/** Margin sign → tone. Positive margin is healthy; negative is a loss. */
export function marginTone(marginCents: number | null | undefined): 'ok' | 'err' | 'muted' {
  if (marginCents == null) return 'muted';
  if (marginCents < 0) return 'err';
  if (marginCents > 0) return 'ok';
  return 'muted';
}
