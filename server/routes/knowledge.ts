/**
 * Knowledge Base API — read-only access to the platform's structured, citable
 * regulatory intelligence corpora:
 *   GET /api/knowledge/summary                         counts across all corpora
 *   GET /api/knowledge/ich-guidelines?code=&query=&category=
 *   GET /api/knowledge/pathways?agency=&query=
 *   GET /api/knowledge/standards?domain=
 *   GET /api/knowledge/deficiencies?category=&agency=
 *   GET /api/knowledge/validation-rules?region=
 *
 * This is STATIC reference data (not tenant-specific). Every payload carries the
 * relevant honesty caveat (e.g. confirm ICH revisions on ich.org). No writes.
 */

import { Router, Request, Response } from 'express';

import {
  ICH_GUIDELINES,
  ICH_IMPLEMENTING_REGULATORS,
  getGuideline,
  guidelinesByCategory,
  searchGuidelines,
  ichCorpusSummary,
  type IchCategory,
} from '../services/ana-ri/ich-guideline-corpus.js';
import {
  REGULATORY_PATHWAYS,
  pathwaysByAgency,
  searchPathways,
  pathwaysSummary,
  type PathwayAgency,
} from '../services/ana-ri/regulatory-pathways-corpus.js';
import { DEFICIENCY_TAXONOMY } from '../services/ana-ri/deficiency-taxonomy.js';
import {
  PHARMACOPOEIAS,
  PHARMACOPOEIAL_CHAPTERS,
  getChapter,
  searchChapters,
  pharmacopoeiaSummary,
} from '../services/ana-ri/pharmacopoeia-corpus.js';
import { REGULATORY_STANDARDS_SEED } from '../../shared/schema/regulatory-standards.seed.js';

const router = Router();

const ICH_NOTE = 'ICH revisions/step status evolve. Confirm the current revision on ich.org before citing.';
const PATHWAY_NOTE = 'Designations and criteria change. Confirm eligibility against current agency guidance.';

const ICH_CATEGORIES: IchCategory[] = ['quality', 'safety', 'efficacy', 'multidisciplinary'];
const PATHWAY_AGENCIES: PathwayAgency[] = [
  'FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada', 'TGA', 'NMPA', 'ANVISA', 'Swissmedic',
];

function qstr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim() : '';
}

// ── Summary across all corpora ───────────────────────────────────────────────
router.get('/summary', (_req: Request, res: Response) => {
  res.json({
    ich: { ...ichCorpusSummary(), implementingRegulators: ICH_IMPLEMENTING_REGULATORS },
    pathways: pathwaysSummary(),
    standards: { total: REGULATORY_STANDARDS_SEED.length },
    deficiencies: { total: DEFICIENCY_TAXONOMY.length },
    pharmacopoeia: pharmacopoeiaSummary(),
  });
});

const PHARM_NOTE =
  'Compendial chapter numbers and harmonisation status are revised. Confirm against the current pharmacopoeia (and ICH Q4B annex) before citing.';

// ── Pharmacopoeia (bodies + general chapters) ────────────────────────────────
router.get('/pharmacopoeia', (req: Request, res: Response) => {
  const code = qstr(req.query.code);
  const query = qstr(req.query.query);
  if (code) {
    const chapter = getChapter(code);
    return res.json({ match: chapter ? 'exact' : 'none', chapter: chapter ?? null, note: PHARM_NOTE });
  }
  const chapters = query ? searchChapters(query, 25) : PHARMACOPOEIAL_CHAPTERS;
  res.json({ pharmacopoeias: PHARMACOPOEIAS, count: chapters.length, chapters, note: PHARM_NOTE });
});

// ── ICH guidelines ───────────────────────────────────────────────────────────
router.get('/ich-guidelines', (req: Request, res: Response) => {
  const code = qstr(req.query.code);
  const query = qstr(req.query.query);
  const category = qstr(req.query.category);
  if (category && !ICH_CATEGORIES.includes(category as IchCategory)) {
    return res.status(422).json({ error: `category must be one of: ${ICH_CATEGORIES.join(', ')}` });
  }
  if (code) {
    const g = getGuideline(code);
    return res.json({ match: g ? 'exact' : 'none', guideline: g ?? null, note: ICH_NOTE });
  }
  const guidelines = query
    ? searchGuidelines(query, 25)
    : category
      ? guidelinesByCategory(category as IchCategory)
      : ICH_GUIDELINES;
  res.json({ count: guidelines.length, guidelines, note: ICH_NOTE });
});

// ── Expedited / access pathways ──────────────────────────────────────────────
router.get('/pathways', (req: Request, res: Response) => {
  const agency = qstr(req.query.agency);
  const query = qstr(req.query.query);
  if (agency && !PATHWAY_AGENCIES.includes(agency as PathwayAgency)) {
    return res.status(422).json({ error: `agency must be one of: ${PATHWAY_AGENCIES.join(', ')}` });
  }
  const pathways = agency
    ? pathwaysByAgency(agency as PathwayAgency)
    : query
      ? searchPathways(query, 25)
      : REGULATORY_PATHWAYS;
  res.json({ count: pathways.length, pathways, note: PATHWAY_NOTE });
});

// ── Consensus standards ──────────────────────────────────────────────────────
router.get('/standards', (req: Request, res: Response) => {
  const domain = qstr(req.query.domain).toLowerCase();
  const standards = domain
    ? REGULATORY_STANDARDS_SEED.filter(s => s.domain.toLowerCase() === domain)
    : REGULATORY_STANDARDS_SEED;
  res.json({ count: standards.length, standards });
});

// ── Deficiency taxonomy ──────────────────────────────────────────────────────
router.get('/deficiencies', (req: Request, res: Response) => {
  const category = qstr(req.query.category).toLowerCase();
  const agency = qstr(req.query.agency).toLowerCase();
  let deficiencies = DEFICIENCY_TAXONOMY;
  if (category) deficiencies = deficiencies.filter(d => d.category.toLowerCase() === category);
  if (agency) deficiencies = deficiencies.filter(d => d.agencies.some(a => a.toLowerCase() === agency));
  res.json({ count: deficiencies.length, deficiencies });
});

// ── eCTD validation rule corpus ──────────────────────────────────────────────
router.get('/validation-rules', async (req: Request, res: Response) => {
  const region = qstr(req.query.region).toLowerCase();
  const REGIONS = ['fda', 'eu', 'jp', 'ca', 'au', 'ch'] as const;
  if (region && !(REGIONS as readonly string[]).includes(region)) {
    return res.status(422).json({ error: `region must be one of: ${REGIONS.join(', ')}` });
  }
  try {
    const { RULE_CORPUS, rulesForRegion, corpusSummary } = await import('../services/ectd/validation-rule-corpus.js');
    const rules = region ? rulesForRegion(region as (typeof REGIONS)[number]) : RULE_CORPUS;
    res.json({ region: region || 'all', summary: corpusSummary(), count: rules.length, rules });
  } catch (err: any) {
    res.status(500).json({ error: 'Validation-rule corpus unavailable', detail: err?.message });
  }
});

export default router;
