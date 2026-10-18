import { Router } from 'express';
import { readCompanyLegalInventory } from '../services/company-documents/legal-inventory';
import { companyDocumentsFailure } from '../services/company-documents/profile';

const router = Router();
router.get('/legal-documents', async (req, res) => {
  try { res.json(await readCompanyLegalInventory(req, req.query)); }
  catch (error) {
    const failure = companyDocumentsFailure(error);
    res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
});
export default router;
