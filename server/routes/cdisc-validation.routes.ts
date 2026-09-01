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
import { checkAdamAdslConformance } from '../services/cdisc/adam-adsl-conformance-checker';
import { checkAdamBdsConformance } from '../services/cdisc/adam-bds-conformance-checker';
import { checkAdamOccdsConformance } from '../services/cdisc/adam-occds-conformance-checker';
import { assessPackageReadiness } from '../services/cdisc/cdisc-package-readiness';
import { checkSendDomainConformance } from '../services/cdisc/send-domain-conformance-checker';
import { validateControlledTerms, listCodelists, getCodelist } from '../services/cdisc/controlled-terminology-validator';
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
 * Generate a CDISC Define-XML document from dataset/variable/codelist metadata.
 * Body: { studyName, standard?, defineVersion?: '2.0' | '2.1', datasets:
 * DefineDataset[], codelists? }. Defaults to 2.1; an unrecognised defineVersion
 * is a 400 rather than a silent fall back to the default, because the file's
 * declared version is what the receiving gateway validates against.
 * JSON (gaps + counts + version + xml) by default; `?format=xml` returns the
 * define.xml.
 */
router.post('/define-xml', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.studyName !== 'string' || !b.studyName.trim() || !Array.isArray(b.datasets)) {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: 'studyName (string) and datasets[] are required.' } });
  }
  if (b.defineVersion !== undefined && b.defineVersion !== '2.0' && b.defineVersion !== '2.1') {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: "defineVersion must be '2.0' or '2.1'." } });
  }
  try {
    const result = generateDefineXml({ studyName: b.studyName, studyOID: b.studyOID, standard: b.standard, defineVersion: b.defineVersion, datasets: b.datasets, codelists: b.codelists });
    if (String(req.query.format).toLowerCase() === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(result.xml);
    }
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * ADaM ADSL (Subject-Level Analysis Dataset) conformance check (ADaM IG v1.1).
 * Body: { variables: Array<{ name, dataType, controlledTerms? }> }. Returns the
 * verdict + findings (missing required/expected, type mismatch, flag violation).
 */
router.post('/adam-adsl/conformance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.variables)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'variables[] (ADSL variable metadata) is required.' } });
  }
  try {
    res.json(checkAdamAdslConformance({ variables: b.variables }));
  } catch (err) {
    fail(res, err);
  }
});

/** ADaM BDS (Basic Data Structure) conformance check (ADaM IG v1.1). Body: { variables }. */
router.post('/adam-bds/conformance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.variables)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'variables[] (BDS variable metadata) is required.' } });
  }
  try {
    res.json(checkAdamBdsConformance({ variables: b.variables }));
  } catch (err) {
    fail(res, err);
  }
});

/** ADaM OCCDS (Occurrence Data Structure, e.g. ADAE) conformance check. Body: { variables }. */
router.post('/adam-occds/conformance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.variables)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'variables[] (OCCDS variable metadata) is required.' } });
  }
  try {
    res.json(checkAdamOccdsConformance({ variables: b.variables }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Dataset-package readiness — dispatch each dataset (SDTM domain / ADaM class)
 * to the right checker and roll up one verdict. Body: { studyName?, datasets[] }.
 */
router.post('/package/readiness', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.datasets)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'datasets[] is required.' } });
  }
  try {
    res.json(assessPackageReadiness({ studyName: b.studyName, datasets: b.datasets }));
  } catch (err) {
    fail(res, err);
  }
});

/** SEND (nonclinical) domain conformance check (SEND-IG v3.1). Body: { domain, variables }. */
router.post('/send-domain/conformance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.domain !== 'string' || !b.domain.trim() || !Array.isArray(b.variables)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'domain (string) and variables[] are required.' } });
  }
  try {
    res.json(checkSendDomainConformance({ domain: b.domain, variables: b.variables }));
  } catch (err) {
    fail(res, err);
  }
});

/** List the modeled CDISC controlled-terminology codelists. */
router.get('/controlled-terminology/codelists', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ codelists: listCodelists().map((code) => ({ code, ...getCodelist(code) })) });
});

/** Validate values against a CDISC controlled-terminology codelist. Body: { codelist, values }. */
router.post('/controlled-terminology/validate', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.codelist !== 'string' || !Array.isArray(b.values)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'codelist (string) and values[] are required.' } });
  }
  try {
    res.json(validateControlledTerms({ codelist: b.codelist, values: b.values }));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
