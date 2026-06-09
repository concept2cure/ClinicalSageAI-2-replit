/**
 * IND FDA form generation REST surface — Forms 1571 / 1572 / 3674 / 3454 / 3455.
 *
 * Mounted at /api/ind-forms with authenticateToken applied at mount time
 * (see server/bootstrap/register-ind-lifecycle-routes.ts). The generators are
 * stateless and deterministic: they render the supplied project metadata into a
 * PDF, using an official fillable AcroForm template when one is present in the
 * templates dir, otherwise a labeled fallback PDF.
 *
 * NOTE: official FDA AcroForm PDFs must be dropped into the templates dir (see
 * ind-form-fill-service templatesDir()); until then every form auto-falls back
 * to the deterministic labeled PDF.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  generateIndForm,
  generateAllForm1572,
  SUPPORTED_FORM_IDS,
  type SupportedFormId,
  type IndFormPdfResult,
} from '../services/ind-forms/ind-form-fill-service';
import {
  buildForm1571,
  buildForm3674,
  buildForm3454,
  buildForm3455,
  buildAllForm1572,
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
  type IndProjectMetadata,
} from '../services/ind-forms/ind-form-data-builders';
import { assembleFormMetadata } from '../services/ind-forms/form-context-assembler';
import {
  getSponsor,
  getRegulatoryAgent,
  getInvestigator,
} from '../services/ind-master-data/ind-master-data-service';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ind-forms-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

function isSupported(formId: string): formId is SupportedFormId {
  return (SUPPORTED_FORM_IDS as readonly string[]).includes(formId);
}

function metaOf(req: Request): IndProjectMetadata {
  // The form content is project data the caller supplies; the builders treat
  // every field as optional and report missingRequired, so a partial body is
  // always safe to render.
  return (req.body && typeof req.body === 'object' ? req.body : {}) as IndProjectMetadata;
}

function sendPdf(res: Response, result: IndFormPdfResult): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.formId}.pdf"`);
  res.setHeader('X-Form-Used-Official-Template', String(result.usedOfficialTemplate));
  res.setHeader('X-Form-Field-Coverage', result.fieldCoverage.toFixed(3));
  if (result.missingRequired.length > 0) {
    res.setHeader('X-Form-Missing-Required', result.missingRequired.join(','));
  }
  res.status(200).send(Buffer.from(result.pdfBytes));
}

function fail(res: Response, err: unknown): void {
  logger.error('ind-forms route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Form generation failed.' } });
}

/** List the supported form ids. */
router.get('/', limiter, requireRole(AUTHOR), (_req, res) => {
  res.json({ forms: SUPPORTED_FORM_IDS });
});

/**
 * Build the field map for a form WITHOUT rendering a PDF — useful for previews
 * and completeness checks (returns { formId, fields, missingRequired }).
 */
router.post('/:formId/build', limiter, requireRole(AUTHOR), (req, res) => {
  const formId = String(req.params.formId);
  const meta = metaOf(req);
  try {
    switch (formId) {
      case FORM_1571:
        return res.json(buildForm1571(meta));
      case FORM_3674:
        return res.json(buildForm3674(meta));
      case FORM_3454:
        return res.json(buildForm3454(meta));
      case FORM_3455:
        return res.json(buildForm3455(meta));
      case FORM_1572: {
        // 1572 is per-investigator; build one per investigator.
        return res.json(buildAllForm1572(meta));
      }
      default:
        return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
    }
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render a single form to PDF. For 1572 this uses the first investigator; use
 * /1572/pdf-all to render one PDF per investigator.
 */
router.post('/:formId/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  try {
    sendPdf(res, await generateIndForm(formId, metaOf(req)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render a form to PDF auto-populated from the master-data registries.
 * Body: { sponsorId?, agentId?, investigatorIds?: string[], overrides?: IndProjectMetadata }.
 * Records are loaded tenant-scoped; `overrides` layer project fields on top.
 */
router.post('/:formId/pdf-from-records', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const [sponsor, agent, investigators] = await Promise.all([
      b.sponsorId ? getSponsor(String(b.sponsorId), ctx) : Promise.resolve(null),
      b.agentId ? getRegulatoryAgent(String(b.agentId), ctx) : Promise.resolve(null),
      Array.isArray(b.investigatorIds)
        ? Promise.all(b.investigatorIds.map((id: unknown) => getInvestigator(String(id), ctx)))
        : Promise.resolve([]),
    ]);
    const meta = assembleFormMetadata({ sponsor, agent, investigators, overrides: b.overrides });
    sendPdf(res, await generateIndForm(formId, meta));
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'NOT_FOUND') {
      return res.status(404).json({ error: { code, message: 'A referenced master-data record was not found.' } });
    }
    fail(res, err);
  }
});

/** Render one 1572 PDF per investigator; returns base64-encoded PDFs as JSON. */
router.post('/1572/pdf-all', limiter, requireRole(AUTHOR), async (req, res) => {
  try {
    const results = await generateAllForm1572(metaOf(req));
    res.json({
      formId: FORM_1572,
      documents: results.map((r) => ({
        usedOfficialTemplate: r.usedOfficialTemplate,
        fieldCoverage: r.fieldCoverage,
        missingRequired: r.missingRequired,
        pdfBase64: Buffer.from(r.pdfBytes).toString('base64'),
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
