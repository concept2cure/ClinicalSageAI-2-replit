import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
// Comment out the missing import for now
// import { validateSessionId } from "../utils/session-utils";

const router = Router();

/**
 * Find similar molecules and generate trial design recommendations
 */
router.post('/api/design/molecule-similarity', async (req: Request, res: Response) => {
  try {
    const { molecule, sessionId } = req.body;

    // Validate session ID if provided
    if (sessionId) {
      // Simple validation instead of using validateSessionId
      if (typeof sessionId !== 'string' || sessionId.length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Invalid session ID format',
        });
      }
    }

    if (!molecule) {
      return res.status(400).json({
        success: false,
        message: 'Molecule data is required',
      });
    }

    // Required molecule properties
    if (!molecule.name || !molecule.moa || !molecule.type) {
      return res.status(400).json({
        success: false,
        message: 'Molecule must include name, mechanism of action (moa), and type',
      });
    }

    // Create temporary JSON file to pass molecule data to Python
    const tempFilePath = path.join(process.cwd(), 'temp', `molecule_${Date.now()}.json`);
    const tempDirPath = path.dirname(tempFilePath);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDirPath)) {
      fs.mkdirSync(tempDirPath, { recursive: true });
    }

    // Write molecule data to temporary file
    fs.writeFileSync(
      tempFilePath,
      JSON.stringify({
        ...molecule,
        sessionId: sessionId || null,
      })
    );

    // Call Python script for molecule similarity analysis
    const pythonScriptPath = path.join(process.cwd(), 'trialsage', 'drug_similarity.py');

    const pythonProcess = spawn('python3', [
      pythonScriptPath,
      '--input',
      tempFilePath,
      '--mode',
      'api',
    ]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', data => {
      dataString += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorString += data.toString();
    });

    pythonProcess.on('close', code => {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('Error deleting temporary file:', e);
      }

      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        console.error(`Error: ${errorString}`);

        return res.status(500).json({
          success: false,
          message: 'Error processing molecule similarity analysis',
          error: errorString || 'Unknown error',
        });
      }

      try {
        const result = JSON.parse(dataString);
        return res.json({
          success: true,
          ...result,
        });
      } catch (error) {
        console.error('Error parsing Python output:', error);
        return res.status(500).json({
          success: false,
          message: 'Error parsing similarity analysis results',
        });
      }
    });
  } catch (error) {
    console.error('Error in molecule similarity endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

export default router;
