import { Request, Response, Router } from 'express';
import { db } from './db';
import { strategicReports, protocols } from 'shared/schema';
import { eq } from 'drizzle-orm';
import { strategicReportGenerator } from './strategic-report-generator';

const router = Router();

/**
 * Get all strategic reports
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }
    const reports = await db.select().from(strategicReports).orderBy(strategicReports.createdAt);
    return res.status(200).json(reports);
  } catch (error) {
    console.error('Error fetching strategic reports:', error);
    return res.status(500).json({ error: 'Failed to fetch strategic reports' });
  }
});

/**
 * Get a specific strategic report by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }
    const [report] = await db
      .select()
      .from(strategicReports)
      .where(eq(strategicReports.id, parseInt(id)));

    if (!report) {
      return res.status(404).json({ error: 'Strategic report not found' });
    }

    return res.status(200).json(report);
  } catch (error) {
    console.error(`Error fetching strategic report with ID ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch strategic report' });
  }
});

/**
 * Generate a strategic report for a protocol
 */
router.post('/generate/:protocolId', async (req: Request, res: Response) => {
  try {
    const protocolId = req.params.protocolId as string;
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    // Fetch protocol data
    const [protocol] = await db
      .select()
      .from(protocols)
      .where(eq(protocols.id, parseInt(protocolId)));

    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    if (!protocol.indication || !protocol.phase) {
      return res.status(400).json({
        error: 'Protocol indication and phase are required to generate a strategic report',
      });
    }

    // Check if a strategic report already exists for this protocol
    const protocolReportId = `protocol-${protocolId}`;
    const [existingReport] = await db
      .select()
      .from(strategicReports)
      .where(eq(strategicReports.reportId, protocolReportId));

    if (existingReport) {
      return res.status(200).json({
        message: 'Strategic report already exists for this protocol',
        reportId: existingReport.id,
      });
    }

    // Parse primary endpoints
    const protocolMetadata = (protocol.metadata || {}) as Record<string, any>;
    const protocolContent = (protocol.content || {}) as Record<string, any>;
    const rawPrimaryEndpoints =
      protocolMetadata.primaryEndpoints ??
      protocolContent.primaryEndpoints ??
      protocolMetadata.primary_endpoints ??
      protocolContent.primary_endpoints;

    let primaryEndpoints: string[] = [];
    if (rawPrimaryEndpoints) {
      try {
        primaryEndpoints = Array.isArray(rawPrimaryEndpoints)
          ? rawPrimaryEndpoints
          : JSON.parse(rawPrimaryEndpoints as string);
      } catch (e) {
        primaryEndpoints = [rawPrimaryEndpoints as string];
      }
    }

    const sampleSize =
      Number(protocolMetadata.sampleSize ?? protocolContent.sampleSize ?? 100) || 100;
    const duration = Number(protocolMetadata.duration ?? protocolContent.duration ?? 12) || 12;
    const controlType = (protocolMetadata.controlType ??
      protocolContent.controlType ??
      'placebo') as string;
    const blinding = (protocolMetadata.blinding ??
      protocolContent.blinding ??
      'double-blind') as string;

    // Generate strategic report
    const reportId = await strategicReportGenerator.generateReport(
      protocol.id,
      protocol.indication,
      protocol.phase,
      primaryEndpoints,
      sampleSize,
      duration,
      controlType,
      blinding
    );

    return res.status(201).json({
      message: 'Strategic report generated successfully',
      reportId,
    });
  } catch (error) {
    console.error(
      `Error generating strategic report for protocol ${req.params.protocolId}:`,
      error
    );
    return res.status(500).json({ error: 'Failed to generate strategic report' });
  }
});

/**
 * Generate or regenerate a strategic report on demand
 */
router.post('/generate-manual', async (req: Request, res: Response) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }
    const {
      protocolId,
      indication,
      phase,
      primaryEndpoints,
      sampleSize,
      duration,
      controlType,
      blinding,
    } = req.body;

    // Validate required fields
    if (!indication || !phase) {
      return res.status(400).json({ error: 'Indication and phase are required' });
    }

    // Generate strategic report
    const reportId = await strategicReportGenerator.generateReport(
      protocolId || 0,
      indication,
      phase,
      primaryEndpoints || [],
      sampleSize || 100,
      duration || 12,
      controlType || 'placebo',
      blinding || 'double-blind'
    );

    return res.status(201).json({
      message: 'Strategic report generated successfully',
      reportId,
    });
  } catch (error) {
    console.error('Error generating manual strategic report:', error);
    return res.status(500).json({ error: 'Failed to generate strategic report' });
  }
});

/**
 * Delete a strategic report
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    // Check if report exists
    const [report] = await db
      .select()
      .from(strategicReports)
      .where(eq(strategicReports.id, parseInt(id)));

    if (!report) {
      return res.status(404).json({ error: 'Strategic report not found' });
    }

    // Delete report
    await db.delete(strategicReports).where(eq(strategicReports.id, parseInt(id)));

    return res.status(200).json({ message: 'Strategic report deleted successfully' });
  } catch (error) {
    console.error(`Error deleting strategic report with ID ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to delete strategic report' });
  }
});

export default router;
