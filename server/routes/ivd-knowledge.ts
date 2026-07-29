/**
 * IVD knowledge base routes — mounted at /api/ivd-knowledge.
 *
 * Read-only access to the curated, citable IVD scientific/legal/regulatory
 * corpus. Authenticated; no tenant scoping (the corpus is global reference
 * intelligence, not tenant data).
 *
 *   GET /                      corpus stats + domains/topics index
 *   GET /search?q=...&domain=&jurisdiction=&topic=&tag=&limit=
 *   GET /entries?domain=&jurisdiction=&topic=&tag=&limit=
 *   GET /entries/:id           single entry
 *   GET /entries/:id/related   resolved related entries
 *   GET /domains               distinct domains
 *   GET /topics?domain=        distinct topics
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import {
  searchPaged,
  listEntriesPaged,
  getEntry,
  getRelated,
  listDomains,
  listTopics,
  corpusSize,
  corpusVersion,
  type SearchOptions,
} from '../services/ivd-knowledge/knowledge.service';
import { isKnowledgeDomain, type KnowledgeDomain, type Jurisdiction } from '../services/ivd-knowledge/types';

const router = Router();
router.use(authenticateToken);

const JURISDICTIONS: Jurisdiction[] = ['US', 'EU', 'UK', 'JP', 'CN', 'BR', 'CA', 'AU', 'global'];

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function parseOptions(req: Request): SearchOptions {
  const domainRaw = q(req, 'domain');
  const jurisRaw = q(req, 'jurisdiction');
  const limitRaw = q(req, 'limit');
  const offsetRaw = q(req, 'offset');
  return {
    domain: domainRaw && isKnowledgeDomain(domainRaw) ? (domainRaw as KnowledgeDomain) : undefined,
    jurisdiction:
      jurisRaw && (JURISDICTIONS as string[]).includes(jurisRaw)
        ? (jurisRaw as Jurisdiction)
        : undefined,
    topic: q(req, 'topic'),
    tag: q(req, 'tag'),
    limit: limitRaw ? Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 10)) : undefined,
    offset: offsetRaw ? Math.max(0, parseInt(offsetRaw, 10) || 0) : undefined,
  };
}

// ── Index / stats ───────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'IVD Knowledge Base',
    entries: corpusSize(),
    corpusVersion: corpusVersion(),
    domains: listDomains(),
    topics: listTopics(),
  });
});

// ── Search (paginated) ───────────────────────────────────────────────────────
router.get('/search', (req: Request, res: Response) => {
  const query = q(req, 'q') ?? '';
  const page = searchPaged(query, parseOptions(req));
  res.json({
    query,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    count: page.rows.length,
    results: page.rows.map(r => ({
      id: r.entry.id,
      domain: r.entry.domain,
      topic: r.entry.topic,
      title: r.entry.title,
      summary: r.entry.summary,
      jurisdictions: r.entry.jurisdictions,
      tags: r.entry.tags,
      score: r.score,
      matchedIn: r.matchedIn,
    })),
  });
});

// ── List entries (paginated, structured filters, full bodies) ───────────────
router.get('/entries', (req: Request, res: Response) => {
  const page = listEntriesPaged(parseOptions(req));
  res.json({ total: page.total, limit: page.limit, offset: page.offset, count: page.rows.length, rows: page.rows });
});

router.get('/entries/:id', (req: Request, res: Response) => {
  const entry = getEntry(pathParam(req, 'id'));
  if (!entry) return res.status(404).json({ error: 'Knowledge entry not found' });
  res.json(entry);
});

router.get('/entries/:id/related', (req: Request, res: Response) => {
  const id = pathParam(req, 'id');
  if (!getEntry(id)) return res.status(404).json({ error: 'Knowledge entry not found' });
  res.json({ id, related: getRelated(id) });
});

// ── Taxonomy ────────────────────────────────────────────────────────────────
router.get('/domains', (_req: Request, res: Response) => {
  res.json({ domains: listDomains() });
});

router.get('/topics', (req: Request, res: Response) => {
  const domainRaw = q(req, 'domain');
  const domain = domainRaw && isKnowledgeDomain(domainRaw) ? (domainRaw as KnowledgeDomain) : undefined;
  res.json({ topics: listTopics(domain) });
});

export default router;
