import express from 'express';
import { lumenCortexService } from '../services/lumen-cortex-service';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { lumenObservationTerms } from '@shared/schema';

const router = express.Router();

router.get('/health', async (_req, res) => {
  try {
    const status = await lumenCortexService.verifyNeonConnection();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Lumen Cortex health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify Lumen Cortex connectivity',
    });
  }
});

router.post('/harvest/10k', async (req, res) => {
  try {
    const { cik, limit, includeAmended, organizationId } = req.body || {};
    const orgId = req.organizationId || organizationId;

    if (!cik || !orgId) {
      return res.status(400).json({
        success: false,
        error: 'cik and organizationId are required.',
      });
    }

    const result = await lumenCortexService.harvest10KFilings({
      organizationId: Number(orgId),
      cik,
      limit,
      includeAmended,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('10-K harvest failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to harvest 10-K filings',
    });
  }
});

router.post('/observation-terms/csr', async (req, res) => {
  try {
    const { organizationId, limit } = req.body || {};
    const orgId = req.organizationId || organizationId;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required.',
      });
    }

    const result = await lumenCortexService.syncObservationTermsFromCSR(
      Number(orgId),
      limit
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('CSR observation term sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build observation terms from CSR data',
    });
  }
});

router.get('/observation-terms', async (req, res) => {
  try {
    const { organizationId, category, termType } = req.query;
    const orgId = req.organizationId || organizationId;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required.',
      });
    }

    const conditions = [eq(lumenObservationTerms.organizationId, Number(orgId))];
    if (category) {
      conditions.push(eq(lumenObservationTerms.category, String(category)));
    }
    if (termType) {
      conditions.push(eq(lumenObservationTerms.termType, String(termType)));
    }

    const terms = await db
      .select()
      .from(lumenObservationTerms)
      .where(and(...conditions));

    res.json({
      success: true,
      terms,
      total: terms.length,
    });
  } catch (error) {
    console.error('Failed to fetch observation terms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch observation terms',
    });
  }
});

export default router;
