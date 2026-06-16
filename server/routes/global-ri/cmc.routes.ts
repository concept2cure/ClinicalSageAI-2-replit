/** Global RI — CMC specifications (ICH Q6A/Q6B test sets). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getUniversalTests,
  getSpecificationTests,
  SPEC_PRODUCT_TYPES,
  SPEC_DOSAGE_FORMS,
  type SpecProductType,
  type SpecDosageForm,
} from '../../services/global-ri/cmc-specifications';

const router = Router();

/** Universal specification tests for a product type (small_molecule | biologic). */
router.get('/cmc/universal-tests/:productType', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const productType = String(Array.isArray(req.params.productType) ? req.params.productType[0] : req.params.productType) as SpecProductType;
  if (!SPEC_PRODUCT_TYPES.includes(productType)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown product type "${productType}" (expected small_molecule/biologic).` } });
  }
  res.json({ productTypes: SPEC_PRODUCT_TYPES, ...getUniversalTests(productType) });
});

/**
 * Full specification test set for a product type, optionally with a dosage form.
 * Path: :productType ; Query: ?dosageForm=solid_oral|oral_liquid|parenteral
 */
router.get('/cmc/specifications/:productType', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const productType = String(Array.isArray(req.params.productType) ? req.params.productType[0] : req.params.productType) as SpecProductType;
  if (!SPEC_PRODUCT_TYPES.includes(productType)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown product type "${productType}".` } });
  }
  const dosageForm = typeof req.query.dosageForm === 'string' ? (req.query.dosageForm as SpecDosageForm) : undefined;
  try {
    res.json({ dosageForms: SPEC_DOSAGE_FORMS, ...getSpecificationTests({ productType, dosageForm }) });
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid dosage form.' } });
  }
});

export default router;
