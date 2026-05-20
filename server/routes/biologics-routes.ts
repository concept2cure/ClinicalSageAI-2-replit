/**
 * Biologics & Combination Product Routes
 *
 * Endpoints for biologics/biosimilar pathway intelligence,
 * expedited program eligibility, and combination product classification.
 *
 * @module server/routes/biologics-routes
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { biologicsIntelligence } from '../services/biologics-intelligence-service.js';
import { combinationProductService } from '../services/combination-product-service.js';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('biologics-routes');

const router = Router();
router.use(authMiddleware);

// ============================================================================
// GET /api/biologics/pathway
// ============================================================================

router.get('/pathway', (req: Request, res: Response) => {
  try {
    const { productType, modalityType, indication, targetAgencies } = req.query;

    if (!productType || !modalityType || !indication) {
      return res.status(400).json({ error: 'Required: productType, modalityType, indication' });
    }

    const agencies = targetAgencies
      ? (targetAgencies as string).split(',').map((a) => a.trim())
      : ['FDA'];

    const result = biologicsIntelligence.getBiologicPathway({
      productType: productType as 'biologic' | 'biosimilar',
      modalityType: modalityType as any,
      indication: indication as string,
      targetAgencies: agencies,
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pathway error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to get biologic pathway' });
  }
});

// ============================================================================
// GET /api/biologics/biosimilar-requirements
// ============================================================================

router.get('/biosimilar-requirements', (req: Request, res: Response) => {
  try {
    const { referenceProduct, targetAgency, interchangeability } = req.query;

    if (!referenceProduct || !targetAgency) {
      return res.status(400).json({ error: 'Required: referenceProduct, targetAgency' });
    }

    const result = biologicsIntelligence.getBiosimilarRequirements({
      referenceProduct: referenceProduct as string,
      targetAgency: targetAgency as string,
      interchangeability: interchangeability === 'true',
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Biosimilar requirements error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to get biosimilar requirements' });
  }
});

// ============================================================================
// GET /api/biologics/expedited-pathways
// ============================================================================

router.get('/expedited-pathways', (req: Request, res: Response) => {
  try {
    const { indication, unmetNeed, seriousCondition, targetAgency } = req.query;

    if (!indication || !targetAgency) {
      return res.status(400).json({ error: 'Required: indication, targetAgency' });
    }

    const result = biologicsIntelligence.getExpeditedPathways({
      indication: indication as string,
      unmetNeed: unmetNeed === 'true',
      seriousCondition: seriousCondition === 'true',
      targetAgency: targetAgency as string,
    });

    return res.json({ pathways: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Expedited pathways error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to get expedited pathways' });
  }
});

// ============================================================================
// GET /api/biologics/comparability
// ============================================================================

router.get('/comparability', (req: Request, res: Response) => {
  try {
    const { modalityType, referenceProduct, targetAgency } = req.query;

    if (!modalityType || !referenceProduct || !targetAgency) {
      return res.status(400).json({ error: 'Required: modalityType, referenceProduct, targetAgency' });
    }

    const result = biologicsIntelligence.getComparabilityStudyDesign({
      modalityType: modalityType as string,
      referenceProduct: referenceProduct as string,
      targetAgency: targetAgency as string,
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Comparability error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to get comparability design' });
  }
});

// ============================================================================
// GET /api/combination-products/classify
// ============================================================================

router.get('/combination-products/classify', (req: Request, res: Response) => {
  try {
    const { drugComponent, deviceComponent, primaryAction } = req.query;

    if (!primaryAction) {
      return res.status(400).json({ error: 'Required: primaryAction (drug, device, or biologic)' });
    }

    const result = combinationProductService.determinePrimaryMode({
      drugComponent: (drugComponent as string) || '',
      deviceComponent: (deviceComponent as string) || '',
      primaryAction: primaryAction as 'drug' | 'device' | 'biologic',
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Classify error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to classify combination product' });
  }
});

// ============================================================================
// GET /api/combination-products/requirements
// ============================================================================

router.get('/combination-products/requirements', (req: Request, res: Response) => {
  try {
    const { primaryAction, targetAgency } = req.query;

    if (!primaryAction || !targetAgency) {
      return res.status(400).json({ error: 'Required: primaryAction, targetAgency' });
    }

    const classification = combinationProductService.determinePrimaryMode({
      drugComponent: '',
      deviceComponent: '',
      primaryAction: primaryAction as 'drug' | 'device' | 'biologic',
    });

    const result = combinationProductService.getCombinationRequirements({
      classification,
      targetAgency: targetAgency as string,
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Requirements error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to get combination requirements' });
  }
});

export default router;
