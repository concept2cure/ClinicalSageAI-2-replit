const MS_DAY = 86_400_000;

/** Recorded time only; absent or malformed facts have no invented timestamp. */
export function relTime(value:string|Date|null|undefined,now=Date.now()):string|null {
  if (!value) return null;
  const date=value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const ms=now-date.getTime();
  if (ms<0) return 'just now';
  if (ms<3_600_000) return `${Math.max(1,Math.round(ms/60_000))}m ago`;
  if (ms<MS_DAY) return `${Math.round(ms/3_600_000)}h ago`;
  const days=Math.round(ms/MS_DAY);
  return days===1 ? 'yesterday' : `${days} d ago`;
}

/** Queue excerpt only. A decision reads the full native captured snapshot. */
export function excerpt(html:string|null|undefined,max=600):string {
  if (!html) return '';
  const clean=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
  return clean.length>max ? `${clean.slice(0,max).trimEnd()}…` : clean;
}
