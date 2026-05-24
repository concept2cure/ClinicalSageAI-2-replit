/**
 * CER Analytics Routes
 *
 * This file contains routes related to Clinical Evaluation Report (CER) analytics,
 * including FAERS data analysis, natural language queries, and alerts.
 */

import express from 'express';
import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { requireOpenAIKey } from '../check-secrets';
import { getGateway } from '../services/ai-gateway';

const router = express.Router();

// Helper function to handle Python script execution
async function executePythonScript(scriptName: string, args: string[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    // Base path for Python scripts
    const scriptPath = path.join(process.cwd(), scriptName);

    // Check if the script exists
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Python script not found: ${scriptName}`));
    }

    // Spawn the Python process
    const pythonProcess = spawn('python', [scriptPath, ...args]);

    let stdout = '';
    let stderr = '';

    // Collect stdout data
    pythonProcess.stdout.on('data', data => {
      stdout += data.toString();
    });

    // Collect stderr data
    pythonProcess.stderr.on('data', data => {
      stderr += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', code => {
      if (code !== 0) {
        console.error(`Python script error (${scriptName}):`, stderr);
        return reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }

      try {
        // Try to parse the output as JSON
        const jsonOutput = JSON.parse(stdout);
        resolve(jsonOutput);
      } catch (err) {
        // If not valid JSON, return the raw output
        resolve(stdout);
      }
    });

    // Handle process errors
    pythonProcess.on('error', err => {
      reject(err);
    });
  });
}

/**
 * @route GET /api/cer/:ndc_code
 * @description Generate a CER narrative for a given NDC code
 */
router.get('/:ndc_code', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);

    // Validate NDC code format (basic check)
    if (!ndc_code || !/^[0-9a-zA-Z-]+$/.test(ndc_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid NDC code format',
      });
    }

    const result = await executePythonScript('cer_narrative.py', [ndc_code]);

    res.json({
      success: true,
      ndc_code,
      narrative: result.narrative || result,
      source: 'FAERS',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating CER narrative:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error generating CER narrative',
    });
  }
});

/**
 * @route GET /api/cer/normalize/:ndc_code
 * @description Get normalized FAERS data for a given NDC code
 */
router.get('/normalize/:ndc_code', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);

    // Validate NDC code
    if (!ndc_code || !/^[0-9a-zA-Z-]+$/.test(ndc_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid NDC code format',
      });
    }

    const result = await executePythonScript('faers_client.py', ['normalize', ndc_code]);

    res.json({
      success: true,
      ndc_code,
      data: result,
    });
  } catch (error) {
    console.error('Error normalizing FAERS data:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error normalizing FAERS data',
    });
  }
});

/**
 * @route GET /api/cer/forecast/:ndc_code/:event
 * @description Get event forecasting for a specific NDC code and adverse event
 */
router.get('/forecast/:ndc_code/:event', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);
    const event = String(req.params.event);

    // Validate parameters
    if (!ndc_code || !event) {
      return res.status(400).json({
        success: false,
        message: 'NDC code and event name are required',
      });
    }

    const result = await executePythonScript('faers_client.py', ['forecast', ndc_code, event]);

    res.json({
      success: true,
      ndc_code,
      event,
      forecast: result,
    });
  } catch (error) {
    console.error('Error forecasting FAERS event:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error forecasting event',
    });
  }
});

/**
 * @route GET /api/cer/anomalies/:ndc_code
 * @description Get anomaly detection results for a given NDC code
 */
router.get('/anomalies/:ndc_code', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);

    // Validate NDC code
    if (!ndc_code || !/^[0-9a-zA-Z-]+$/.test(ndc_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid NDC code format',
      });
    }

    const result = await executePythonScript('faers_client.py', ['anomalies', ndc_code]);

    res.json({
      success: true,
      ndc_code,
      anomalies: result,
    });
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error detecting anomalies',
    });
  }
});

/**
 * @route GET /api/cer/alerts/:ndc_code
 * @description Get real-time alerts for a given NDC code
 */
router.get('/alerts/:ndc_code', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);

    // Validate NDC code
    if (!ndc_code || !/^[0-9a-zA-Z-]+$/.test(ndc_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid NDC code format',
      });
    }

    const result = await executePythonScript('faers_client.py', ['alerts', ndc_code]);

    res.json({
      success: true,
      ndc_code,
      alerts: result.alerts || [],
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error fetching alerts',
    });
  }
});

/**
 * @route GET /api/cer/:ndc_code/enhanced-pdf
 * @description Generate and download an enhanced PDF report with embedded charts
 */
router.get('/:ndc_code/enhanced-pdf', async (req: Request, res: Response) => {
  try {
    const ndc_code = String(req.params.ndc_code);

    // Validate NDC code
    if (!ndc_code || !/^[0-9a-zA-Z-]+$/.test(ndc_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid NDC code format',
      });
    }

    // Execute the Python script to generate PDF
    const scriptPath = path.join(process.cwd(), 'cer_narrative.py');
    const outputFilePath = path.join(process.cwd(), 'exports', `enhanced_cer_${ndc_code}.pdf`);

    // Ensure the exports directory exists
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const pythonProcess = spawn('python', [scriptPath, ndc_code, '--enhanced-pdf', outputFilePath]);

    let stderr = '';

    pythonProcess.stderr.on('data', data => {
      stderr += data.toString();
    });

    pythonProcess.on('close', code => {
      if (code !== 0) {
        console.error('Error generating enhanced PDF:', stderr);
        return res.status(500).json({
          success: false,
          message: `Error generating enhanced PDF: ${stderr}`,
        });
      }

      // Check if the file was created
      if (!fs.existsSync(outputFilePath)) {
        return res.status(500).json({
          success: false,
          message: 'PDF file was not generated',
        });
      }

      // Stream the file to the response
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=enhanced_cer_${ndc_code}.pdf`);

      const fileStream = fs.createReadStream(outputFilePath);
      fileStream.pipe(res);

      // Clean up the file after sending (optional)
      fileStream.on('end', () => {
        // fs.unlinkSync(outputFilePath); // Uncomment to delete after sending
      });
    });

    pythonProcess.on('error', err => {
      console.error('Error spawning Python process:', err);
      res.status(500).json({
        success: false,
        message: `Error spawning Python process: ${err.message}`,
      });
    });
  } catch (error) {
    console.error('Error generating enhanced PDF:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error generating enhanced PDF',
    });
  }
});

/**
 * @route POST /api/cer/nlp-query
 * @description Process a natural language query about CER data
 */
router.post('/nlp-query', requireOpenAIKey(), async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required',
      });
    }

    // Forward the query to the Python script for processing
    const result = await executePythonScript('faers_client.py', ['nlp-query', query]);

    // If the Python script returns structured data, use it
    if (result && typeof result === 'object') {
      return res.json(result);
    }

    // Route through AI Gateway — centralised audit, policy & rate limiting
    const prompt = `
      You are an expert analyst that converts natural language queries about clinical trial data into structured filter parameters.
      Given this query: "${query}"

      Extract relevant filter parameters like:
      - age (numeric)
      - event (string, e.g., "headache", "nausea")
      - period (string, e.g., "months", "years")
      - view (string, e.g., "trend", "comparison")

      Return ONLY a JSON object with these fields:
      {
        "natural_language_query": "the original query",
        "interpretation": "human-readable interpretation of what's being asked",
        "filter_parameters": {
          // extracted parameters
        },
        "confidence": 0.XX // numeric confidence score between 0 and 1
      }
    `;

    const gateway = getGateway();
    const gatewayResponse = await gateway.route({
      taskType: 'structured_output',
      messages: [
        {
          role: 'system',
          content:
            'You extract structured filter parameters from natural language queries about clinical trial data.',
        },
        { role: 'user', content: prompt },
      ],
      jsonMode: true,
      callerModule: 'cer-analytics',
      metadata: { queryLength: query.length },
    });

    // Parse the AI Gateway response
    const nlpResponse = JSON.parse(gatewayResponse.content);

    res.json(nlpResponse);
  } catch (error) {
    console.error('Error processing NLP query:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error processing NLP query',
    });
  }
});

export default router;
