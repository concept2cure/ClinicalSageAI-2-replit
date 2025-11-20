/**
 * Semantic Intelligence Routes
 *
 * These endpoints expose the semantic intelligence engine capabilities:
 * - Protocol-CSR alignment scoring
 * - Semantic similarity calculations
 * - Field-level comparisons with reasoning
 * - Risk flag identification
 * - Protocol optimization recommendations
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { csrReports, csrDetails } from 'shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Validate protocol alignment request
const protocolAlignmentSchema = z.object({
  protocolText: z.string().min(10),
  csrIds: z.array(z.string()).optional(),
  indication: z.string().optional(),
  phase: z.string().optional(),
});

/**
 * Calculate semantic alignment between a protocol and relevant CSRs
 */
router.post('/protocol-alignment', async (req, res) => {
  try {
    // Validate request
    const validation = protocolAlignmentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.format(),
      });
    }

    const { protocolText, csrIds, indication, phase } = validation.data;

    // If specific CSR IDs are provided, use those
    let csrData = [];
    if (csrIds && csrIds.length > 0) {
      for (const id of csrIds) {
        // Get CSR report
        const csrReport = await db.query.csrReports.findFirst({
          where: eq(csrReports.id, parseInt(id)),
        });

        if (csrReport) {
          // Get CSR details
          const details = await db.query.csrDetails.findFirst({
            where: eq(csrDetails.reportId, csrReport.id),
          });

          if (details) {
            csrData.push({
              id: csrReport.id.toString(),
              title: csrReport.title || 'Untitled CSR',
              primary_endpoint: details.endpoints
                ? Array.isArray(details.endpoints)
                  ? details.endpoints[0]
                  : details.endpoints
                : null,
              duration_weeks: details.studyDescription
                ? extractDurationFromDescription(details.studyDescription)
                : null,
              sample_size: details.studyDescription
                ? extractSampleSizeFromDescription(details.studyDescription)
                : null,
              inclusion_criteria: details.inclusionCriteria || [],
              exclusion_criteria: details.exclusionCriteria || [],
            });
          }
        }
      }
    }
    // Otherwise, filter by indication and/or phase
    else {
      // Build query conditions
      const conditions = [];
      if (indication) {
        conditions.push(eq(csrReports.indication, indication));
      }
      if (phase) {
        conditions.push(eq(csrReports.phase, phase));
      }

      // Get matching reports (limit to 10 for performance)
      const reports = await db.query.csrReports.findMany({
        where: conditions.length > 0 ? { AND: conditions } : undefined,
        limit: 10,
      });

      // Get details for each report
      for (const report of reports) {
        const details = await db.query.csrDetails.findFirst({
          where: eq(csrDetails.reportId, report.id),
        });

        if (details) {
          csrData.push({
            id: report.id.toString(),
            title: report.title || 'Untitled CSR',
            primary_endpoint: details.endpoints
              ? Array.isArray(details.endpoints)
                ? details.endpoints[0]
                : details.endpoints
              : null,
            duration_weeks: details.studyDescription
              ? extractDurationFromDescription(details.studyDescription)
              : null,
            sample_size: details.studyDescription
              ? extractSampleSizeFromDescription(details.studyDescription)
              : null,
            inclusion_criteria: details.inclusionCriteria || [],
            exclusion_criteria: details.exclusionCriteria || [],
          });
        }
      }
    }

    // If no CSRs found, return error
    if (csrData.length === 0) {
      return res.status(404).json({
        error: 'No matching CSRs found',
        message: 'Try different search criteria or CSR IDs',
      });
    }

    // Create temporary file with protocol text and CSR data
    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `protocol_${Date.now()}.json`);
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        protocol_text: protocolText,
        csr_data: csrData,
      })
    );

    // Call Python script to run semantic analysis
    const pythonProcess = spawn('python3', [
      path.resolve('./semantic_similarity.py'),
      '--input',
      tempFile,
      '--mode',
      'api',
    ]);

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', data => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      pythonError += data.toString();
    });

    pythonProcess.on('close', code => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      if (code !== 0) {
        console.error('Python process error:', pythonError);
        return res.status(500).json({
          error: 'Error processing semantic alignment',
          details: pythonError,
        });
      }

      try {
        const result = JSON.parse(pythonOutput);
        return res.json(result);
      } catch (err) {
        console.error('Error parsing Python output:', err);
        return res.status(500).json({
          error: 'Error parsing semantic alignment results',
          details: err.message,
        });
      }
    });
  } catch (err) {
    console.error('Error in protocol alignment endpoint:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
});

/**
 * Get semantic field-level alignment for a specific CSR
 */
router.post('/field-alignment', async (req, res) => {
  try {
    const { protocolFields, csrId } = req.body;

    if (!protocolFields || !csrId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Both protocolFields and csrId are required',
      });
    }

    // Get CSR report
    const csrReport = await db.query.csrReports.findFirst({
      where: eq(csrReports.id, parseInt(csrId)),
    });

    if (!csrReport) {
      return res.status(404).json({
        error: 'CSR not found',
        message: `No CSR found with ID ${csrId}`,
      });
    }

    // Get CSR details
    const details = await db.query.csrDetails.findFirst({
      where: eq(csrDetails.reportId, csrReport.id),
    });

    if (!details) {
      return res.status(404).json({
        error: 'CSR details not found',
        message: `No details found for CSR ID ${csrId}`,
      });
    }

    // Extract CSR fields
    const csrFields = {
      primary_endpoint: details.endpoints
        ? Array.isArray(details.endpoints)
          ? details.endpoints[0]
          : details.endpoints
        : null,
      duration_weeks: details.studyDescription
        ? extractDurationFromDescription(details.studyDescription)
        : null,
      sample_size: details.studyDescription
        ? extractSampleSizeFromDescription(details.studyDescription)
        : null,
      inclusion_criteria: details.inclusionCriteria || [],
      exclusion_criteria: details.exclusionCriteria || [],
    };

    // Create temporary file with protocol and CSR fields
    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `alignment_${Date.now()}.json`);
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        protocol_fields: protocolFields,
        csr_fields: csrFields,
        csr_id: csrId,
      })
    );

    // Call Python script to run field alignment
    const pythonProcess = spawn('python3', [
      path.resolve('./semantic_aligner.py'),
      '--input',
      tempFile,
      '--mode',
      'api',
    ]);

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', data => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      pythonError += data.toString();
    });

    pythonProcess.on('close', code => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      if (code !== 0) {
        console.error('Python process error:', pythonError);
        return res.status(500).json({
          error: 'Error processing field alignment',
          details: pythonError,
        });
      }

      try {
        const result = JSON.parse(pythonOutput);
        return res.json(result);
      } catch (err) {
        console.error('Error parsing Python output:', err);
        return res.status(500).json({
          error: 'Error parsing field alignment results',
          details: err.message,
        });
      }
    });
  } catch (err) {
    console.error('Error in field alignment endpoint:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
});

/**
 * Get optimization recommendations for a protocol
 */
router.post('/optimize-protocol', async (req, res) => {
  try {
    const { protocolText, targetIndication, targetPhase } = req.body;

    if (!protocolText) {
      return res.status(400).json({
        error: 'Missing protocol text',
        message: 'Protocol text is required',
      });
    }

    // Create temporary file with protocol info
    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `optimize_${Date.now()}.json`);
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        protocol_text: protocolText,
        target_indication: targetIndication || null,
        target_phase: targetPhase || null,
      })
    );

    // Call Python script for optimization
    const pythonProcess = spawn('python3', [
      path.resolve('./semantic_trace_log.py'),
      '--input',
      tempFile,
      '--mode',
      'optimize',
    ]);

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', data => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      pythonError += data.toString();
    });

    pythonProcess.on('close', code => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      if (code !== 0) {
        console.error('Python process error:', pythonError);
        return res.status(500).json({
          error: 'Error optimizing protocol',
          details: pythonError,
        });
      }

      try {
        const result = JSON.parse(pythonOutput);
        return res.json(result);
      } catch (err) {
        console.error('Error parsing Python output:', err);
        return res.status(500).json({
          error: 'Error parsing optimization results',
          details: err.message,
        });
      }
    });
  } catch (err) {
    console.error('Error in optimize protocol endpoint:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
});

/**
 * Helper function to extract duration in weeks from study description
 */
function extractDurationFromDescription(description: string): number | null {
  if (!description) return null;

  // Look for patterns like "X weeks" or "X months"
  const weekPattern = /(\d+)\s*weeks?/i;
  const monthPattern = /(\d+)\s*months?/i;

  const weekMatch = description.match(weekPattern);
  if (weekMatch && weekMatch[1]) {
    return parseInt(weekMatch[1], 10);
  }

  const monthMatch = description.match(monthPattern);
  if (monthMatch && monthMatch[1]) {
    // Convert months to weeks (approximate)
    return parseInt(monthMatch[1], 10) * 4;
  }

  return null;
}

/**
 * Helper function to extract sample size from study description
 */
function extractSampleSizeFromDescription(description: string): number | null {
  if (!description) return null;

  // Look for patterns like "N=X" or "X subjects/patients/participants"
  const nPattern = /N\s*=\s*(\d+)/i;
  const subjectPattern = /(\d+)\s*(subjects|patients|participants)/i;

  const nMatch = description.match(nPattern);
  if (nMatch && nMatch[1]) {
    return parseInt(nMatch[1], 10);
  }

  const subjectMatch = description.match(subjectPattern);
  if (subjectMatch && subjectMatch[1]) {
    return parseInt(subjectMatch[1], 10);
  }

  return null;
}

export default router;
