/**
 * The help corpus's one reader (P-127): the list, one article, and search. GET /api/docs and AnA's help tools both
 * call these functions, so the Help Center and AnA can never disagree about what an article says.
 *
 * Search is deterministic: words in the title count most, then keywords and the summary, then the body. No model takes
 * part in finding or ranking an article.
 */
import { HELP_COLLECTIONS } from './collections';
import { HELP_COURSES } from './courses';
import { ALL_HELP_ARTICLES } from './articles';
import type { HelpArticle, HelpClientType, HelpCollectionId, HelpCourse } from './types';

export type { HelpArticle, HelpClientType, HelpCollection, HelpCollectionId, HelpCourse } from './types';
export { HELP_COLLECTIONS, HELP_COURSES, ALL_HELP_ARTICLES };

/** The client type an article list is read for: a stored value resolved to the corpus's vocabulary. */
export function helpClientType(stored: string | null | undefined): HelpClientType | null {
  const v = String(stored ?? '').trim().toLowerCase();
  if (v === 'biotech' || v === 'pharma' || v === 'cro' || v === 'diagnostics') return v;
  if (v === 'medtech' || v === 'mdx' || v === 'medical_device' || v === 'device') return 'medtech';
  if (v === 'biopharma') return 'biotech';
  return null;
}

/** Whether an article is written for this client type (an article with no client types is for everyone). */
export function articleFor(article: HelpArticle, clientType: HelpClientType | null): boolean {
  return !clientType || !article.clientTypes || article.clientTypes.length === 0 || article.clientTypes.includes(clientType);
}

export function findHelpArticle(slug: string): HelpArticle | undefined {
  const s = String(slug ?? '').trim().toLowerCase();
  return ALL_HELP_ARTICLES.find((a) => a.slug === s);
}

export function findHelpCourse(id: string): HelpCourse | undefined {
  return HELP_COURSES.find((c) => c.id === id);
}

export function helpArticlesIn(collection: HelpCollectionId, clientType: HelpClientType | null = null): HelpArticle[] {
  return ALL_HELP_ARTICLES.filter((a) => a.collection === collection && articleFor(a, clientType));
}

export function helpCoursesFor(clientType: HelpClientType | null): HelpCourse[] {
  return HELP_COURSES.filter((c) => !clientType || !c.clientTypes || c.clientTypes.length === 0 || c.clientTypes.includes(clientType));
}

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'it', 'my', 'i', 'do', 'how',
  'can', 'what', 'where', 'with', 'from', 'this', 'that', 'be', 'are', 'does', 'me', 'we', 'our', 'your', 'you', 'at', 'by']);

/** Lower-case words of two or more letters, stop words removed, with a light plural fold ("markets" → "market"). */
export function helpWords(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9()+-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[()+-]+|[()+-]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** The body as plain text (Markdown marks removed), for snippets. */
export function plainText(markdown: string): string {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HelpSearchHit {
  slug: string;
  title: string;
  collection: HelpCollectionId;
  summary: string;
  score: number;
  /** A sentence of the article where the words were found, or its summary. */
  snippet: string;
}

/**
 * Search the corpus. Returns at most `limit` hits, best first; none when no word of the query is in any article.
 * Filtered by client type where given.
 */
export function searchHelp(query: string, opts: { clientType?: HelpClientType | null; limit?: number } = {}): HelpSearchHit[] {
  const words = [...new Set(helpWords(query))];
  if (words.length === 0) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 25));
  const hits: HelpSearchHit[] = [];
  for (const a of ALL_HELP_ARTICLES) {
    if (!articleFor(a, opts.clientType ?? null)) continue;
    const title = new Set(helpWords(a.title));
    const tags = new Set(helpWords([a.summary, ...(a.keywords ?? [])].join(' ')));
    const body = helpWords(plainText(a.body));
    const bodySet = new Set(body);
    let score = 0;
    let matched = 0;
    for (const w of words) {
      const s = (title.has(w) ? 6 : 0) + (tags.has(w) ? 3 : 0) + (bodySet.has(w) ? 1 + Math.min(2, body.filter((b) => b === w).length / 4) : 0);
      if (s > 0) matched += 1;
      score += s;
    }
    if (matched === 0) continue;
    // An article that answers every word of the question ranks above one that answers some of them.
    score = score * (matched / words.length);
    hits.push({ slug: a.slug, title: a.title, collection: a.collection, summary: a.summary, score: Math.round(score * 100) / 100, snippet: snippetOf(a, words) });
  }
  return hits.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title)).slice(0, limit);
}

function snippetOf(a: HelpArticle, words: string[]): string {
  const sentences = plainText(a.body).split(/(?<=[.!?])\s+/);
  let best = '';
  let bestCount = 0;
  for (const s of sentences) {
    const set = new Set(helpWords(s));
    const n = words.filter((w) => set.has(w)).length;
    if (n > bestCount) { best = s; bestCount = n; }
  }
  const text = best || a.summary;
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}
