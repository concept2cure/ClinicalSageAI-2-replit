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
    const reports = await db.select().from(strategicReports).orderBy(strategicReports.created_at);
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
    const { id } = req.params;
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
    const { protocolId } = req.params;

    // Fetch protocol data
    const [protocol] = await db
      .select()
      .from(protocols)
      .where(eq(protocols.id, parseInt(protocolId)));

    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    // Check if a strategic report already exists for this protocol
    const [existingReport] = await db
      .select()
      .from(strategicReports)
      .where(eq(strategicReports.protocol_id, parseInt(protocolId)));

    if (existingReport) {
      return res.status(200).json({
        message: 'Strategic report already exists for this protocol',
        reportId: existingReport.id,
      });
    }

    // Parse primary endpoints
    let primaryEndpoints: string[] = [];
    if (protocol.primary_endpoints) {
      try {
        primaryEndpoints = Array.isArray(protocol.primary_endpoints)
          ? protocol.primary_endpoints
          : JSON.parse(protocol.primary_endpoints as string);
      } catch (e) {
        primaryEndpoints = [protocol.primary_endpoints as string];
      }
    }

    // Generate strategic report
    const reportId = await strategicReportGenerator.generateReport(
      protocol.id,
      protocol.indication,
      protocol.phase,
      primaryEndpoints,
      protocol.sample_size || 100,
      protocol.duration || 12,
      protocol.control_type || 'placebo',
      protocol.blinding || 'double-blind'
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
    const { id } = req.params;

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
