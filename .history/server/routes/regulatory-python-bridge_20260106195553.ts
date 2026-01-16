import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

router.post('/validate-section', async (req, res) => {
  try {
    const { content, section, moduleId, ruleset } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Path to the python script
    // server/routes/regulatory-python-bridge.ts -> server/scripts/validate_ectd_section.py
    // We are in server/routes/, so ../scripts/validate_ectd_section.py
    const scriptPath = path.join(__dirname, '../scripts/validate_ectd_section.py');

    const pythonProcess = spawn('python3', [scriptPath]);

    let dataString = '';
    let errorString = '';

    // Collect data from script stdout
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    // Collect error from script stderr
    pythonProcess.stderr.on('data', (data) => {
      errorString += data.toString();
    });

    // Send input to script stdin
    const inputPayload = JSON.stringify({
      content,
      section,
      moduleId
    });
    
    pythonProcess.stdin.write(inputPayload);
    pythonProcess.stdin.end();

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Script stderr: ${errorString}`);
        
        // Even if status code is non-zero, check if we got a valid JSON error response
        try {
            const jsonResponse = JSON.parse(dataString);
            return res.json(jsonResponse);
        } catch (e) {
            return res.status(500).json({ 
                success: false, 
                error: 'Regulatory Scan process failed', 
                details: errorString 
            });
        }
      }

      try {
        const jsonResponse = JSON.parse(dataString);
        res.json(jsonResponse);
      } catch (error) {
        console.error('Failed to parse Python response:', dataString);
        res.status(500).json({ 
            success: false, 
            error: 'Invalid response from Regulatory Brain',
            raw: dataString
        });
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
