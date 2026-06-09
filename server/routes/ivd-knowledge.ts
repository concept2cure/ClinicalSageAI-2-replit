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
  search,
  listEntries,
  getEntry,
  getRelated,
  listDomains,
  listTopics,
  corpusSize,
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
  return {
    domain: domainRaw && isKnowledgeDomain(domainRaw) ? (domainRaw as KnowledgeDomain) : undefined,
    jurisdiction:
      jurisRaw && (JURISDICTIONS as string[]).includes(jurisRaw)
        ? (jurisRaw as Jurisdiction)
        : undefined,
    topic: q(req, 'topic'),
    tag: q(req, 'tag'),
    limit: limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 10)) : undefined,
  };
}

// ── Index / stats ───────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'IVD Knowledge Base',
    entries: corpusSize(),
    domains: listDomains(),
    topics: listTopics(),
  });
});

// ── Search ──────────────────────────────────────────────────────────────────
router.get('/search', (req: Request, res: Response) => {
  const query = q(req, 'q') ?? '';
  const results = search(query, parseOptions(req));
  res.json({
    query,
    count: results.length,
    results: results.map(r => ({
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

// ── List entries (structured filters, full bodies) ──────────────────────────
router.get('/entries', (req: Request, res: Response) => {
  const rows = listEntries(parseOptions(req));
  res.json({ count: rows.length, rows });
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
