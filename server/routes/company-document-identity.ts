import { Router } from 'express';
import { z } from 'zod';
import { companyDocumentsFailure, context, writeProfile } from '../services/company-documents/profile';
import { readLegacyCompanyPreview, validatedLegacyCandidate } from '../services/company-documents/legacy-adoption';
import { readCompanyFilingIdentity, reviewCompanyFilingIdentity } from '../services/company-documents/identity';
import { parseCompanyInput } from '../services/company-documents/validation';
import { SubmissionReadError } from '../services/submission-service/submission-request-read';

const router = Router();
router.get('/legacy-adoption', async (req, res) => {
  try { const ctx = await context(req, 'brand'); res.json(await readLegacyCompanyPreview(ctx.q, ctx.organizationId)); }
  catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.post('/legacy-adoption', async (req, res) => {
  try {
    const input = parseCompanyInput(z.object({ expectedRevision: z.number().int().nonnegative(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(3).max(2000) }).strict(), req.body);
    const ctx = await context(req, 'brand');
    const candidate = await validatedLegacyCandidate(ctx.q, ctx.organizationId, input.sourceHash);
    const result = await writeProfile(req, input.expectedRevision, input.reason, profile => ({ ...profile, ...candidate, brandingAdopted: true }),
      { capability: 'brand', beforeCommit: async q => { await validatedLegacyCandidate(q, ctx.organizationId, input.sourceHash); } });
    res.json(result);
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.get('/identity', async (req, res) => {
  try {
    const input = parseCompanyInput(z.object({ sequenceId: z.coerce.number().int().positive(), variantId: z.string().uuid().optional() }).strict(), req.query);
    res.json((await readCompanyFilingIdentity(req, input.sequenceId, input.variantId)).data);
  }
  catch (error) { const failure = error instanceof SubmissionReadError ? error : companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.post('/identity/review', async (req, res) => {
  try { res.json(await reviewCompanyFilingIdentity(req, req.body)); }
  catch (error) { const failure = error instanceof SubmissionReadError ? error : companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
export default router;
