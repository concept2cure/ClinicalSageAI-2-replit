/**
 * Report Generation API Routes
 *
 * This module handles the generation of persona-specific reports based on
 * subscription tiers and user roles.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { csrReports } from '../../../shared/schema';
import { getReportGenerator } from '../../services/report-generator-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Supported personas for report generation
const SUPPORTED_PERSONAS = [
  'investor',
  'regulatory',
  'biostats',
  'ceo',
  'ops',
  'planner',
  'writer',
  'pi',
  'intelligence',
  'cxo',
];

// Static path for example reports
const EXAMPLE_REPORTS_PATH = path.join(__dirname, '../../../static/example_reports');

/**
 * Get available report types
 */
router.get('/types', async (req, res) => {
  try {
    const reportTypes = [];

    // Get manifests for all persona types
    for (const persona of SUPPORTED_PERSONAS) {
      const manifestPath = path.join(EXAMPLE_REPORTS_PATH, persona, 'manifest.json');

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        reportTypes.push({
          persona,
          title: manifest.title,
          description:
            manifest.description ||
            `${persona.charAt(0).toUpperCase() + persona.slice(1)}-focused analysis and insights`,
          includes: manifest.includes || [],
        });
      }
    }

    res.json({
      success: true,
      reportTypes,
    });
  } catch (error) {
    console.error('Error fetching report types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available report types',
    });
  }
});

/**
 * Generate report based on persona and protocol ID
 */
router.post('/generate', async (req, res) => {
  try {
    const { persona, protocolId, indication, sessionId } = req.body;

    // Validate request body
    if (!persona) {
      return res.status(400).json({
        success: false,
        error: 'Persona type is required',
      });
    }

    if (!SUPPORTED_PERSONAS.includes(persona)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported persona: ${persona}. Available personas: ${SUPPORTED_PERSONAS.join(', ')}`,
      });
    }

    if (!protocolId && !indication) {
      return res.status(400).json({
        success: false,
        error: 'Either protocolId or indication is required',
      });
    }

    // Get protocol data if ID is provided.
    //
    // No protocol data store is wired into this route yet. Previously a
    // supplied protocolId was silently discarded — protocolData stayed
    // `null` and the response still came back `success: true` with no
    // indication that the report was never grounded in the requested
    // protocol. That is exactly the "error rendered as an empty result"
    // failure mode CLAUDE.md forbids: fail closed, don't fabricate.
    //
    // Until a real fetch exists, we do not invent one. Instead we track
    // that the caller's protocolId could not be resolved and surface that
    // honestly, both to the generators (so they can decline to fabricate
    // protocol-grounded specifics) and in the API response.
    const protocolData = null;
    const protocolDataUnavailable = Boolean(protocolId);

    // Get related trials for the protocol/indication
    let relatedTrials: (typeof csrReports.$inferSelect)[] = [];
    if (indication) {
      // Fetch related trials from database based on indication
      relatedTrials = await db
        .select()
        .from(csrReports)
        .where(eq(csrReports.indication, indication))
        .limit(10);
    }

    // Get appropriate report generator for the persona
    const reportGenerator = getReportGenerator(persona);

    // Generate the report
    const report = await reportGenerator.generateReport({
      protocolData,
      protocolDataUnavailable,
      relatedTrials,
      indication,
      sessionId,
    });

    // Return report to the client. When a protocolId was supplied but could
    // not be resolved, say so explicitly rather than returning a plain
    // success as if the report were grounded in real protocol records.
    res.json({
      success: true,
      ...(protocolDataUnavailable && {
        protocolDataUnavailable: true,
        warning:
          'protocolId was supplied but could not be resolved to protocol records; ' +
          'this report is not grounded in protocol data.',
      }),
      report,
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
    });
  }
});

/**
 * Get example report for a persona
 */
router.get('/example/:persona', async (req, res) => {
  try {
    const { persona } = req.params;

    // Validate persona
    if (!SUPPORTED_PERSONAS.includes(persona)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported persona: ${persona}`,
      });
    }

    // Get manifest for this persona
    const manifestPath = path.join(EXAMPLE_REPORTS_PATH, persona, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({
        success: false,
        error: `Example report for ${persona} not found`,
      });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Construct response with example files
    const exampleFiles = manifest.files.map((file: any) => {
      const filePath = path.join(EXAMPLE_REPORTS_PATH, persona, file);
      const fileContent = null;
      const fileExists = fs.existsSync(filePath);

      // For simplicity, we're not returning actual file content here
      // In a real implementation, you might want to send the files as downloads

      return {
        name: file,
        exists: fileExists,
        downloadUrl: fileExists ? `/api/reports/download/${persona}/${file}` : null,
      };
    });

    res.json({
      success: true,
      manifest,
      exampleFiles,
    });
  } catch (error) {
    console.error('Error fetching example report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch example report',
    });
  }
});

/**
 * Download example report file
 */
router.get('/download/:persona/:filename', (req, res) => {
  try {
    const { persona, filename } = req.params;

    // Validate persona
    if (!SUPPORTED_PERSONAS.includes(persona)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported persona: ${persona}`,
      });
    }

    // Construct file path
    // basename on filename: `persona` is validated against SUPPORTED_PERSONAS
      // above, but `filename` is unconstrained request input.
      const filePath = path.join(EXAMPLE_REPORTS_PATH, persona, path.basename(filename));

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${filename}`,
      });
    }

    // Send file
    res.download(filePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file',
    });
  }
});

export default router;
