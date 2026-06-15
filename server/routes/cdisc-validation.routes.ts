/**
 * CDISC validation REST surface.
 *
 * Deterministic, dataset-level conformance checks over submitted CDISC SDTM
 * domain metadata (SDTM-IG v3.4). Mounted at /api/cdisc-validation with
 * authenticateToken applied at mount time.
 *
 *  - POST /sdtm-domain/conformance  check a domain's variable metadata against
 *    the SDTM-IG v3.4 reference spec (DM, AE).
 *
 * The checker is pure/deterministic over the supplied variable metadata.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { checkSdtmDomainConformance } from '../services/cdisc/sdtm-domain-conformance-checker';
import { generateDefineXml } from '../services/cdisc/define-xml-generator';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('cdisc-validation-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('cdisc-validation route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Conformance check failed.' } });
}

/**
 * SDTM domain conformance check (CDISC SDTM-IG v3.4).
 * Body: { domain: string, variables: Array<{ name, dataType, length?, controlledTerms? }> }.
 * Returns the verdict + findings (missing required, type mismatch, codelist
 * violation, unknown domain, extra variable).
 */
router.post('/sdtm-domain/conformance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.domain !== 'string' || !b.domain.trim() || !Array.isArray(b.variables)) {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: 'domain (string) and variables[] (SDTM variable metadata) are required.' } });
  }
  try {
    res.json(checkSdtmDomainConformance({ domain: b.domain, variables: b.variables }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Generate a CDISC Define-XML v2.1 document from dataset/variable/codelist
 * metadata. Body: { studyName, standard?, datasets: DefineDataset[], codelists? }.
 * JSON (gaps + counts + xml) by default; `?format=xml` returns the define.xml.
 */
router.post('/define-xml', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.studyName !== 'string' || !b.studyName.trim() || !Array.isArray(b.datasets)) {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: 'studyName (string) and datasets[] are required.' } });
  }
  try {
    const result = generateDefineXml({ studyName: b.studyName, studyOID: b.studyOID, standard: b.standard, datasets: b.datasets, codelists: b.codelists });
    if (String(req.query.format).toLowerCase() === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(result.xml);
    }
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
