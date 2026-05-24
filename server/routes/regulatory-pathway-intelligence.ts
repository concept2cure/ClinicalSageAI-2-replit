/**
 * Regulatory Pathway Intelligence API Routes
 *
 * Exposes the Concept2Cure proprietary regulatory knowledge base through
 * REST endpoints for use by the AnA co-pilot and platform UI.
 */

import { Router, Request, Response } from 'express';
import { getRegulatoryPathwayIntelligence } from '../services/regulatory-pathway-intelligence';

const router = Router();

// ─── Engine Stats ───────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const stats = engine.getStats();
    res.json({
      status: 'operational',
      engine: 'Concept2Cure Regulatory Pathway Intelligence Engine v1.0',
      ...stats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get engine stats' });
  }
});

// ─── Authorities ────────────────────────────────────────────────────────────

router.get('/authorities', (_req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const authorities = engine.listAuthorities();
    res.json({ count: authorities.length, authorities });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list authorities' });
  }
});

router.get('/authorities/:code', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const authority = engine.getAuthority(String(req.params.code));
    if (!authority) {
      return res.status(404).json({ error: `Authority '${req.params.code}' not found` });
    }
    res.json({ code: req.params.code, ...authority });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get authority details' });
  }
});

router.get('/authorities/region/:region', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const authorities = engine.getAuthoritiesByRegion(String(req.params.region));
    res.json({ region: req.params.region, count: authorities.length, authorities });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get authorities by region' });
  }
});

router.get('/authorities/:code/submission-types', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const types = engine.getSubmissionTypes(String(req.params.code));
    if (!types) {
      return res.status(404).json({ error: `No submission types found for '${req.params.code}'` });
    }
    res.json({ agency: req.params.code, submissionTypes: types });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get submission types' });
  }
});

router.get('/authorities/:code/expedited-programs', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const programs = engine.getExpeditedPrograms(String(req.params.code));
    if (!programs) {
      return res.status(404).json({ error: `No expedited programs found for '${req.params.code}'` });
    }
    res.json({ agency: req.params.code, expeditedPrograms: programs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get expedited programs' });
  }
});

// ─── ICH Guidelines ─────────────────────────────────────────────────────────

router.get('/ich-guidelines/:id', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const guideline = engine.getICHGuideline(String(req.params.id));
    if (!guideline) {
      return res.status(404).json({ error: `ICH guideline '${req.params.id}' not found` });
    }
    res.json({ id: req.params.id, ...guideline });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get guideline' });
  }
});

router.get('/ich-guidelines/category/:category', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const validCategories = ['Q_Quality', 'S_Safety', 'E_Efficacy', 'M_Multidisciplinary'];
    if (!validCategories.includes(String(req.params.category))) {
      return res.status(400).json({ error: `Invalid category. Valid: ${validCategories.join(', ')}` });
    }
    const guidelines = engine.getGuidelinesByCategory(req.params.category as any);
    res.json({
      category: req.params.category,
      count: Object.keys(guidelines).length,
      guidelines,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get guidelines by category' });
  }
});

router.get('/ich-guidelines/ctd-section/:section', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const guidelines = engine.getGuidelinesForCTDSection(String(req.params.section));
    res.json({
      ctdSection: req.params.section,
      count: guidelines.length,
      guidelines,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get guidelines for CTD section' });
  }
});

router.get('/ich-guidelines/critical', (_req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const guidelines = engine.getCriticalGuidelines();
    res.json({ count: guidelines.length, guidelines });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get critical guidelines' });
  }
});

router.get('/ich-guidelines/search', (req: Request, res: Response) => {
  try {
    const keyword = req.query.q as string;
    if (!keyword) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const engine = getRegulatoryPathwayIntelligence();
    const results = engine.searchGuidelines(keyword);
    res.json({ query: keyword, count: results.length, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search guidelines' });
  }
});

// ─── Document Requirements ──────────────────────────────────────────────────

router.get('/document-requirements/:submissionType', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const reqs = engine.getDocumentRequirements(String(req.params.submissionType));
    if (!reqs) {
      return res.status(404).json({ error: `No document requirements found for '${req.params.submissionType}'` });
    }
    res.json(reqs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document requirements' });
  }
});

router.get('/ctd-structure', (_req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    res.json(engine.getCTDModuleStructure());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get CTD structure' });
  }
});

router.get('/cross-agency-equivalents/:category', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const equivalents = engine.getCrossAgencyEquivalents(String(req.params.category));
    if (!equivalents) {
      return res.status(404).json({ error: `No cross-agency equivalents found for '${req.params.category}'` });
    }
    res.json({ category: req.params.category, equivalents });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cross-agency equivalents' });
  }
});

router.get('/review-timelines', (_req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    res.json(engine.getGlobalReviewTimelines());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get review timelines' });
  }
});

// ─── Pathway Analysis ───────────────────────────────────────────────────────

router.post('/recommend-pathway', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const { productType, indication, targetAgencies, isFirstInClass, isOrphan, hasUnmetNeed, currentPhase } = req.body;

    if (!productType || !targetAgencies || !Array.isArray(targetAgencies)) {
      return res.status(400).json({ error: 'productType and targetAgencies (array) are required' });
    }

    const recommendations = engine.recommendPathway({
      productType,
      indication: indication || '',
      targetAgencies,
      isFirstInClass,
      isOrphan,
      hasUnmetNeed,
      currentPhase,
    });

    res.json({
      productType,
      targetAgencies,
      recommendations,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate pathway recommendation' });
  }
});

router.post('/global-strategy', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const { productType, targetAgencies, primaryAgency, isFirstInClass, hasUnmetNeed } = req.body;

    if (!productType || !targetAgencies || !primaryAgency) {
      return res.status(400).json({ error: 'productType, targetAgencies, and primaryAgency are required' });
    }

    const strategy = engine.designGlobalStrategy({
      productType,
      targetAgencies,
      primaryAgency,
      isFirstInClass,
      hasUnmetNeed,
    });

    res.json(strategy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to design global strategy' });
  }
});

router.get('/ctd-guidance/:section', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const guidance = engine.getCTDSectionGuidance(String(req.params.section));
    res.json(guidance);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get CTD section guidance' });
  }
});

// ─── Intelligence Briefing ──────────────────────────────────────────────────

router.post('/briefing', (req: Request, res: Response) => {
  try {
    const engine = getRegulatoryPathwayIntelligence();
    const { therapeuticArea, phase, targetAgencies, productType } = req.body;

    const briefing = engine.generateIntelligenceBriefing({
      therapeuticArea,
      phase,
      targetAgencies,
      productType,
    });

    res.json(briefing);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate intelligence briefing' });
  }
});

export default router;
