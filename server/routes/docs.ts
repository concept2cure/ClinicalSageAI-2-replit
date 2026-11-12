/**
 * The Help Center (P-127, package S13; docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.1).
 *
 *   GET /api/docs                     → the collections with their articles' titles and summaries, and the courses
 *   GET /api/docs/search?q=…          → the articles that answer the words, best first
 *   GET /api/docs/:slug               → one article, with its related articles
 *
 * Each accepts `?clientType=` (biotech, pharma, medtech, diagnostics, cro) to leave out what is written for another
 * client type. The corpus is platform reference data, the same for every organisation (shared/help/), so these reads
 * touch no tenant table; the auth boundary admits the signed-in only (server/middleware/authBoundary.ts). AnA's
 * search_help_center and read_help_article read the same module, so the page and AnA cannot disagree.
 *
 * Until 2026-11-12 this mount was a stub that answered `{ docs: [] }` to everything; nothing called it.
 */
import { Router, type Request, type Response } from 'express';
import {
  ALL_HELP_ARTICLES,
  HELP_COLLECTIONS,
  findHelpArticle,
  helpArticlesIn,
  helpClientType,
  helpCoursesFor,
  searchHelp,
  type HelpArticle,
} from '../../shared/help';

const router = Router();

const first = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '').trim();
const listed = (a: HelpArticle) => ({ slug: a.slug, title: a.title, summary: a.summary, collection: a.collection });

router.get('/', (req: Request, res: Response) => {
  const clientType = helpClientType(first(req.query.clientType));
  const collections = HELP_COLLECTIONS.map((c) => ({ ...c, articles: helpArticlesIn(c.id, clientType).map(listed) }))
    .filter((c) => c.articles.length > 0);
  const courses = helpCoursesFor(clientType).map((c) => ({
    ...c,
    lessons: c.lessons
      .map((l) => ({ ...l, article: findHelpArticle(l.article) }))
      .filter((l): l is typeof l & { article: HelpArticle } => Boolean(l.article))
      .map((l) => ({ article: listed(l.article), demoScript: l.demoScript ?? null })),
  }));
  res.json({ data: { collections, courses, articleCount: ALL_HELP_ARTICLES.length, clientType } });
});

router.get('/search', (req: Request, res: Response) => {
  const q = first(req.query.q);
  if (!q) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Say what to search for (q).' } });
  if (q.length > 200) return res.status(400).json({ error: { code: 'VALIDATION', message: 'A search is at most 200 characters.' } });
  const clientType = helpClientType(first(req.query.clientType));
  const limit = Number.parseInt(first(req.query.limit) || '8', 10);
  res.json({ data: { query: q, hits: searchHelp(q, { clientType, limit: Number.isFinite(limit) ? limit : 8 }) } });
});

router.get('/:slug', (req: Request, res: Response) => {
  const article = findHelpArticle(first(req.params.slug));
  if (!article) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'There is no help article at that address.' } });
  const related = (article.related ?? []).map((s) => findHelpArticle(s)).filter((a): a is HelpArticle => Boolean(a)).map(listed);
  const collection = HELP_COLLECTIONS.find((c) => c.id === article.collection) ?? null;
  res.json({ data: { article, collection, related } });
});

export default router;
