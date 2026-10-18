import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { companyDocumentsFailure, context } from '../services/company-documents/profile';
import { parseCompanyInput } from '../services/company-documents/validation';
import { companyLegalRequirementCatalog, readCompanyLegalReadiness } from '../services/company-documents/legal-readiness';
import { readCompanyLegalCustodians, readCompanyLegalLifecycle, refreshCompanyLegalReminder, updateCompanyLegalRequirement, updateCompanyLegalWorkflow } from '../services/company-documents/legal-workflow';
import { SubmissionReadError } from '../services/submission-service/submission-request-read';

const router = Router();
const handle = (work: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await work(req, res); } catch (error) {
    const failure = error instanceof SubmissionReadError ? { status: error.status, code: error.code, message: error.message } : companyDocumentsFailure(error);
    if (failure.status === 500) console.error('[company-legal-workflows]', error instanceof Error ? error.message : 'operation failed');
    res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
};
router.get('/legal-workflows/catalog', handle(async (req, res) => {
  await context(req); res.json(companyLegalRequirementCatalog());
}));
router.get('/legal-workflows/readiness', handle(async (req, res) => {
  const input = parseCompanyInput(z.object({ sequenceId: z.coerce.number().int().positive() }).strict(), req.query);
  res.json(await readCompanyLegalReadiness(req, input.sequenceId));
}));
router.post('/legal-workflows/requirements', handle(async (req, res) => { res.json(await updateCompanyLegalRequirement(req, req.body)); }));
router.get('/legal-documents/:id/lifecycle', handle(async (req, res) => { res.json(await readCompanyLegalLifecycle(req, String(req.params.id))); }));
router.get('/legal-documents/:id/custodians', handle(async (req, res) => { res.json(await readCompanyLegalCustodians(req, String(req.params.id))); }));
router.put('/legal-documents/:id/lifecycle', handle(async (req, res) => { res.json(await updateCompanyLegalWorkflow(req, String(req.params.id), req.body)); }));
router.post('/legal-documents/:id/remind', handle(async (req, res) => { res.json(await refreshCompanyLegalReminder(req, String(req.params.id), req.body)); }));
export default router;
