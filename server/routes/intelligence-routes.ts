import express, { Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { csrReports, csrDetails } from '../sage-plus-service';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Schema for CSR ingestion request
const ingestCsrSchema = z.object({
  content: z
    .object({
      title: z.string().optional(),
      sponsor: z.string().optional(),
      indication: z.string().optional(),
      phase: z.string().optional(),
      study_design: z.string().optional(),
      primary_objective: z.string().optional(),
      inclusion_criteria: z.array(z.string()).or(z.string()).optional(),
      exclusion_criteria: z.array(z.string()).or(z.string()).optional(),
      endpoints: z.array(z.string()).or(z.object({}).passthrough()).optional(),
      treatment_arms: z.array(z.string()).or(z.string()).optional(),
      sample_size: z.number().optional(),
      duration_weeks: z.number().optional(),
      results: z.any().optional(),
      adverse_events: z.any().optional(),
      safety: z.any().optional(),
      efficacy: z.any().optional(),
      study_id: z.string().optional(),
      nct_id: z.string().optional(),
    })
    .passthrough(),
});

// POST /api/intelligence/ingest-csr - Ingest CSR data into intelligence database
router.post('/ingest-csr', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = ingestCsrSchema.parse(req.body);
    const { content } = validatedData;

    console.log('Ingesting CSR content into intelligence database:', content.title);

    // 1. Store the CSR data in the database if it doesn't exist
    let csrId = 0;

    // Check if CSR already exists by title or study ID
    const existingReport = await db
      .select()
      .from(csrReports)
      .where(eq(csrReports.title, content.title || 'Unknown CSR'))
      .limit(1);

    if (existingReport.length > 0) {
      csrId = existingReport[0].id;
      console.log(`Using existing CSR report ID: ${csrId}`);
    } else {
      // Insert new CSR report
      const newReport = await db
        .insert(csrReports)
        .values({
          title: content.title || 'Unknown CSR',
          sponsor: content.sponsor || null,
          indication: content.indication || null,
          phase: content.phase || null,
          fileName: content.study_id || 'Unknown',
          fileSize: 0,
          uploadDate: new Date(),
          summary: content.primary_objective || null,
        })
        .returning({ id: csrReports.id });

      csrId = newReport[0].id;
      console.log(`Created new CSR report ID: ${csrId}`);
    }

    // 2. Store the CSR details
    const reportDetails = await db
      .select()
      .from(csrDetails)
      .where(eq(csrDetails.reportId, csrId))
      .limit(1);

    // Process inclusion/exclusion criteria
    let inclusionCriteria: string[] = [];
    if (typeof content.inclusion_criteria === 'string') {
      inclusionCriteria = [content.inclusion_criteria];
    } else if (Array.isArray(content.inclusion_criteria)) {
      inclusionCriteria = content.inclusion_criteria;
    }

    let exclusionCriteria: string[] = [];
    if (typeof content.exclusion_criteria === 'string') {
      exclusionCriteria = [content.exclusion_criteria];
    } else if (Array.isArray(content.exclusion_criteria)) {
      exclusionCriteria = content.exclusion_criteria;
    }

    // Process endpoints
    let endpoints: string[] = [];
    if (typeof content.endpoints === 'string') {
      endpoints = [content.endpoints];
    } else if (Array.isArray(content.endpoints)) {
      endpoints = content.endpoints;
    } else if (content.endpoints && typeof content.endpoints === 'object') {
      // Handle complex endpoint structure
      endpoints = Object.entries(content.endpoints)
        .filter(([key]) => key !== 'id' && key !== 'reportId')
        .map(([key, value]) => {
          if (typeof value === 'string') return value;
          if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
          }
          return String(value);
        });
    }

    // Process metrics and success
    const metrics = {
      sampleSize: content.sample_size || 0,
      duration: content.duration_weeks || 0,
      completionRate: content.results?.completion_rate || 0,
      studyId: content.study_id || null,
      nctId: content.nct_id || null,
    };

    // Determine success based on available data
    let success = null;
    if (content.results?.outcome === 'positive' || content.results?.success === true) {
      success = true;
    } else if (content.results?.outcome === 'negative' || content.results?.success === false) {
      success = false;
    }

    if (reportDetails.length > 0) {
      // Update existing details
      await db
        .update(csrDetails)
        .set({
          endpoints,
          inclusionCriteria,
          exclusionCriteria,
          sampleSize: content.sample_size || null,
          arms: content.treatment_arms?.length || null,
          success,
          metrics,
          extractedAt: new Date(),
        })
        .where(eq(csrDetails.id, reportDetails[0].id));

      console.log(`Updated CSR details ID: ${reportDetails[0].id}`);
    } else {
      // Insert new details
      const newDetails = await db
        .insert(csrDetails)
        .values({
          reportId: csrId,
          endpoints,
          outcomes: content.results?.outcomes || [],
          inclusionCriteria,
          exclusionCriteria,
          sampleSize: content.sample_size || null,
          arms: content.treatment_arms?.length || null,
          success,
          metrics,
          extractedAt: new Date(),
        })
        .returning({ id: csrDetails.id });

      console.log(`Created new CSR details ID: ${newDetails[0].id}`);
    }

    // 3. Generate redirect route with CSR ID
    const redirectRoute = `/planning?csr_id=${csrId}`;

    return res.status(200).json({
      success: true,
      message: 'CSR data successfully ingested into intelligence database',
      csr_id: csrId,
      redirect_route: redirectRoute,
    });
  } catch (err) {
    console.error('Error ingesting CSR data:', err);

    if (err instanceof z.ZodError) {
      const validationError = fromZodError(err);
      return res.status(400).json({
        success: false,
        message: `Invalid request data: ${validationError.message}`,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to ingest CSR data',
    });
  }
});

// GET /api/intelligence/csr/:id - Get CSR data by ID
router.get('/csr/:id', async (req: Request, res: Response) => {
  try {
    const csrId = parseInt(req.params.id);
    if (isNaN(csrId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CSR ID',
      });
    }

    // Fetch CSR report and details
    const report = await db.select().from(csrReports).where(eq(csrReports.id, csrId)).limit(1);

    if (report.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CSR not found',
      });
    }

    const details = await db
      .select()
      .from(csrDetails)
      .where(eq(csrDetails.reportId, csrId))
      .limit(1);

    // Combine report and details
    const csrData = {
      ...report[0],
      details: details.length > 0 ? details[0] : null,
    };

    return res.status(200).json({
      success: true,
      data: csrData,
    });
  } catch (err) {
    console.error('Error fetching CSR data:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CSR data',
    });
  }
});

export default router;
