/**
 * Reference management + house-style formatting for regulatory writing
 * (CERs, clinical overviews, IBs).
 *
 * Deterministic, dependency-free: parse RIS into structured references, format a
 * structured reference into Vancouver or AMA style, and lint a reference list
 * for completeness and duplicates. No DB, no network, no LLM — identical input
 * yields identical output, so a formatted bibliography is reproducible.
 *
 * @module server/services/references/reference-manager
 */

export type CitationStyle = 'vancouver' | 'ama';

export interface Reference {
  /** RIS type tag if known (e.g. JOUR, BOOK). */
  type?: string;
  authors: string[];
  title: string;
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
}

// ── RIS parsing ──────────────────────────────────────────────────────────────

const RIS_LINE = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/;

/** Parse RIS text into structured references (one per TY…ER record). */
export function parseRis(text: string): Reference[] {
  if (!text || typeof text !== 'string') return [];
  const refs: Reference[] = [];
  let cur: Reference | null = null;
  const start = (): Reference => ({ authors: [], title: '' });

  for (const rawLine of text.split(/\r?\n/)) {
    const m = RIS_LINE.exec(rawLine.trimEnd());
    if (!m) continue;
    const [, tag, value] = m;
    if (tag === 'TY') {
      if (cur) refs.push(cur);
      cur = start();
      cur.type = value.trim();
      continue;
    }
    if (!cur) cur = start();
    const v = value.trim();
    switch (tag) {
      case 'AU': case 'A1': if (v) cur.authors.push(v); break;
      case 'TI': case 'T1': cur.title = v; break;
      case 'JO': case 'JF': case 'T2': cur.journal = v; break;
      case 'PY': case 'Y1': cur.year = (v.match(/\d{4}/)?.[0]) ?? v; break;
      case 'VL': cur.volume = v; break;
      case 'IS': cur.issue = v; break;
      case 'SP': cur.pages = cur.pages ? `${v}-${cur.pages}` : v; break;
      case 'EP': cur.pages = cur.pages ? `${cur.pages}-${v}` : v; break;
      case 'DO': cur.doi = v.replace(/^doi:\s*/i, ''); break;
      case 'ER': refs.push(cur); cur = null; break;
      default: break;
    }
  }
  if (cur) refs.push(cur);
  return refs;
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** "Smith, John A." | "John A. Smith" → "Smith JA" (Vancouver/AMA author form). */
function formatAuthor(name: string): string {
  const trimmed = name.trim();
  let last: string, rest: string;
  if (trimmed.includes(',')) {
    const [l, r] = trimmed.split(',');
    last = l.trim();
    rest = (r ?? '').trim();
  } else {
    const parts = trimmed.split(/\s+/);
    last = parts.pop() ?? trimmed;
    rest = parts.join(' ');
  }
  const initials = rest
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join('');
  return initials ? `${last} ${initials}` : last;
}

/** Author list with the Vancouver/AMA "et al" rule (>6 authors → first 6 + et al). */
function formatAuthorList(authors: string[]): string {
  const formatted = authors.map(formatAuthor).filter(Boolean);
  if (formatted.length === 0) return '';
  if (formatted.length > 6) return `${formatted.slice(0, 6).join(', ')}, et al`;
  return formatted.join(', ');
}

function volIssuePages(ref: Reference): string {
  let s = '';
  if (ref.year) s += ref.year;
  if (ref.volume) s += `;${ref.volume}`;
  if (ref.issue) s += `(${ref.issue})`;
  if (ref.pages) s += `:${ref.pages}`;
  if (s && !s.endsWith('.')) s += '.';
  return s;
}

/**
 * Format a single reference in the requested style. Vancouver: plain journal,
 * no DOI by default. AMA: italicized journal (markdown), DOI appended.
 */
export function formatReference(ref: Reference, style: CitationStyle = 'vancouver'): string {
  const parts: string[] = [];
  const authors = formatAuthorList(ref.authors);
  if (authors) parts.push(`${authors}.`);
  if (ref.title) parts.push(`${ref.title.replace(/\.\s*$/, '')}.`);
  if (ref.journal) parts.push(style === 'ama' ? `*${ref.journal}*.` : `${ref.journal}.`);
  const vip = volIssuePages(ref);
  if (vip) parts.push(vip);
  if (style === 'ama' && ref.doi) parts.push(`doi:${ref.doi}`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Format a numbered bibliography. */
export function formatBibliography(refs: Reference[], style: CitationStyle = 'vancouver'): string {
  return refs.map((r, i) => `${i + 1}. ${formatReference(r, style)}`).join('\n');
}

// ── Lint ─────────────────────────────────────────────────────────────────────

export interface ReferenceLintIssue {
  index: number;
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface ReferenceLintResult {
  issues: ReferenceLintIssue[];
  duplicates: Array<{ indices: number[]; on: 'doi' | 'title' }>;
  summary: { total: number; errors: number; warnings: number; duplicateGroups: number };
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Lint a reference list for missing required fields and duplicate entries. */
export function lintReferences(refs: Reference[]): ReferenceLintResult {
  const issues: ReferenceLintIssue[] = [];
  refs.forEach((r, i) => {
    if (!r.authors || r.authors.length === 0) issues.push({ index: i, severity: 'warning', field: 'authors', message: 'No authors listed.' });
    if (!r.title?.trim()) issues.push({ index: i, severity: 'error', field: 'title', message: 'Missing title.' });
    if (!r.year) issues.push({ index: i, severity: 'warning', field: 'year', message: 'Missing publication year.' });
    if ((r.type ?? 'JOUR') === 'JOUR' && !r.journal?.trim()) {
      issues.push({ index: i, severity: 'warning', field: 'journal', message: 'Journal article with no journal name.' });
    }
  });

  // Duplicate detection: by DOI first, then normalized title.
  const byDoi = new Map<string, number[]>();
  const byTitle = new Map<string, number[]>();
  refs.forEach((r, i) => {
    if (r.doi) byDoi.set(r.doi.toLowerCase(), [...(byDoi.get(r.doi.toLowerCase()) ?? []), i]);
    if (r.title?.trim()) {
      const key = normalizeTitle(r.title);
      byTitle.set(key, [...(byTitle.get(key) ?? []), i]);
    }
  });
  const duplicates: ReferenceLintResult['duplicates'] = [];
  const seen = new Set<number>();
  for (const [, indices] of byDoi) {
    if (indices.length > 1) {
      duplicates.push({ indices, on: 'doi' });
      indices.forEach((i) => seen.add(i));
    }
  }
  for (const [, indices] of byTitle) {
    if (indices.length > 1 && !indices.every((i) => seen.has(i))) {
      duplicates.push({ indices, on: 'title' });
    }
  }

  const errors = issues.filter((x) => x.severity === 'error').length;
  const warnings = issues.filter((x) => x.severity === 'warning').length;
  return {
    issues,
    duplicates,
    summary: { total: refs.length, errors, warnings, duplicateGroups: duplicates.length },
  };
}
