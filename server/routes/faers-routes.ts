/**
 * FAERS Routes
 *
 * This module provides API endpoints for retrieving FAERS data and
 * generating Clinical Evaluation Reports (CER).
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { clinicalEvaluationReports } from '../../shared/schema';
import { requireOpenAIKey } from '../check-secrets';

import * as faersBridge from '../../faers-bridge.js';

const router = Router();

// Endpoint to fetch FAERS data by NDC code
router.post('/data', async (req: Request, res: Response) => {
  try {
    const { ndcCode } = req.body;

    if (!ndcCode) {
      return res.status(400).json({ error: 'NDC code is required' });
    }

    const faersData = await faersBridge.fetchFaersData(ndcCode);

    res.json(faersData);
  } catch (error) {
    console.error('Error fetching FAERS data:', error);
    let errorMessage = 'Error retrieving FAERS data';

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    res.status(500).json({ error: errorMessage });
  }
});

// Endpoint to generate CER narrative from FAERS data
router.post('/generate-narrative', requireOpenAIKey(), async (req: Request, res: Response) => {
  try {
    const { faersData, productName } = req.body;

    if (!faersData) {
      return res.status(400).json({ error: 'FAERS data is required' });
    }

    const narrative = await faersBridge.generateCerNarrative(faersData, productName);

    res.json({ narrative });
  } catch (error) {
    console.error('Error generating CER narrative:', error);
    let errorMessage = 'Error generating CER narrative';

    // Try to extract error message from Python exception
    try {
      const parseError = JSON.parse(error.message);
      errorMessage = parseError.error || error.message;
    } catch {
      if (error instanceof Error) {
        errorMessage = error.message;
      }
    }

    res.status(500).json({ error: errorMessage });
  }
});

// Endpoint to save generated CER report
router.post('/save-report', async (req: Request, res: Response) => {
  try {
    const { title, content, ndcCode, productName, manufacturer, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // Generate unique ID for the report
    const reportId = uuidv4();

    // Create a new CER record
    const reportData = {
      cer_id: reportId,
      title: title,
      device_name: productName || `NDC ${ndcCode}`,
      manufacturer: manufacturer || 'Unknown',
      indication: 'Post-market surveillance',
      report_date: new Date(),
      status: 'active',
      content_text: content,
      metadata: metadata || {},
    };

    // Save to database
    try {
      const [insertedReport] = await db
        .insert(clinicalEvaluationReports)
        .values(reportData)
        .returning();

      res.status(201).json({
        message: 'CER report saved successfully',
        report: insertedReport,
      });
    } catch (dbError) {
      console.error('Database error saving CER report:', dbError);
      res.status(500).json({ error: 'Database error saving CER report' });
    }
  } catch (error) {
    console.error('Error saving CER report:', error);
    res.status(500).json({ error: 'Error saving CER report' });
  }
});

// Endpoint to get all saved CER reports (with pagination)
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await db.select({ count: db.fn.count() }).from(clinicalEvaluationReports);

    // Get reports with pagination
    const reports = await db
      .select()
      .from(clinicalEvaluationReports)
      .orderBy(clinicalEvaluationReports.report_date)
      .limit(limit)
      .offset(offset);

    res.json({
      reports,
      pagination: {
        total: parseInt(totalCount[0].count.toString()),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error retrieving CER reports:', error);
    res.status(500).json({ error: 'Error retrieving CER reports' });
  }
});

// Endpoint to get a specific CER report by ID
router.get('/reports/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [report] = await db
      .select()
      .from(clinicalEvaluationReports)
      .where(eq(clinicalEvaluationReports.cer_id, id));

    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }

    res.json(report);
  } catch (error) {
    console.error('Error retrieving CER report:', error);
    res.status(500).json({ error: 'Error retrieving CER report' });
  }
});

export default router;
