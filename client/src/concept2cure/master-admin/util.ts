/** Small formatting helpers shared across Master Administration surfaces. */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString();
}

/** Map a status string to a tone class used by the .ma-badge component. */
export function statusTone(status: string): 'ok' | 'warn' | 'err' | 'muted' {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'healthy':
      return 'ok';
    case 'suspended':
    case 'past_due':
    case 'degraded':
      return 'err';
    case 'trialing':
    case 'incomplete':
      return 'warn';
    default:
      return 'muted';
  }
}

export function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
