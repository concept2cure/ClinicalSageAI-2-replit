import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { db } from '../db';

// Create the router
const router = Router();

// Create exports directory if it doesn't exist
const exportsDir = path.join(process.cwd(), 'data/exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Create dossiers directory if it doesn't exist
const dossiersDir = path.join(process.cwd(), 'data/dossiers');
if (!fs.existsSync(dossiersDir)) {
  fs.mkdirSync(dossiersDir, { recursive: true });
}

// Export trial intelligence report
router.post('/export/intelligence-report', async (req: Request, res: Response) => {
  try {
    const { protocol_id, parsed, prediction, benchmarks, risk_flags, strategic_insights } =
      req.body;

    if (!protocol_id || !parsed) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: protocol_id and parsed data are required',
      });
    }

    // Generate PDF using Python script
    const inputData = {
      protocol_id,
      inputs: parsed,
      success_rate: prediction,
      benchmarks,
      risk_flags,
      strategic_insights,
      timestamp: Date.now(),
    };

    const tempInputFile = path.join('data', `intelligence_report_input_${Date.now()}.json`);
    fs.writeFileSync(tempInputFile, JSON.stringify(inputData));

    const pythonProcess = spawn('python3', [
      'scripts/generate_intelligence_report.py',
      tempInputFile,
    ]);

    let resultData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      resultData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
      console.error(`Intelligence report generation error: ${data}`);
    });

    pythonProcess.on('close', code => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempInputFile);
      } catch (err) {
        console.error('Failed to clean up temp file:', err);
      }

      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: `Intelligence report generation failed: ${errorData}`,
        });
      }

      try {
        const pdfPath = resultData.trim();

        if (!fs.existsSync(pdfPath)) {
          return res.status(500).json({
            success: false,
            message: 'PDF file not found',
          });
        }

        const fileName = path.basename(pdfPath);
        const downloadUrl = `/api/download/report/${fileName}`;

        // Return the download URL instead of streaming the file directly
        res.json({
          success: true,
          download_url: downloadUrl,
          file_path: pdfPath,
        });
      } catch (error) {
        console.error('Error processing intelligence report:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Failed to process intelligence report',
        });
      }
    });
  } catch (error) {
    console.error('Error in intelligence report generation:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred during report generation',
    });
  }
});

// Download report by filename
router.get('/download/report/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(exportsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Report file not found',
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    // Stream the file as response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to download report',
    });
  }
});

// Save intelligence report to dossier
router.post('/dossier/save-intelligence-report', async (req: Request, res: Response) => {
  try {
    const { protocol_id, user_id, report_data } = req.body;

    if (!protocol_id || !report_data) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: protocol_id and report_data are required',
      });
    }

    // Determine the user_id - either from the request body or the authenticated user
    const userId = user_id || (req.user ? req.user.id : 'default');
    const timestamp = new Date().toISOString();

    // Dossier path with user-specific naming
    const dossierPath = path.join(dossiersDir, `${userId}_${protocol_id}_dossier.json`);

    let dossier;

    // Check if dossier already exists
    if (fs.existsSync(dossierPath)) {
      // Load existing dossier
      dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));
    } else {
      // Create new dossier structure
      dossier = {
        protocol_id,
        username: userId,
        reports: [],
      };
    }

    // Add the new report with version label
    const version_label =
      report_data.version || `v${dossier.reports ? dossier.reports.length + 1 : 1}`;

    dossier.reports.push({
      created_at: timestamp,
      version: version_label,
      data: report_data,
    });

    // Save the updated dossier
    fs.writeFileSync(dossierPath, JSON.stringify(dossier, null, 2));

    res.json({
      success: true,
      message: 'Report added to dossier',
      path: dossierPath,
    });
  } catch (error) {
    console.error('Error saving report to dossier:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save report to dossier',
    });
  }
});

// List reports in a protocol's dossier
router.get('/dossier/view/:username/:protocol_id', (req: Request, res: Response) => {
  try {
    const { username, protocol_id } = req.params;
    const dossierPath = path.join(dossiersDir, `${username}_${protocol_id}_dossier.json`);

    if (!fs.existsSync(dossierPath)) {
      return res.json({
        success: true,
        protocol_id,
        username,
        reports: [],
      });
    }

    const dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));

    res.json({
      success: true,
      protocol_id,
      username,
      reports: dossier.reports,
    });
  } catch (error) {
    console.error('Error viewing dossier:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to view dossier',
    });
  }
});

// Get user's dossiers (list of protocols with dossiers)
router.get('/dossier/my-dossiers/:username', (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Get all dossier files for this user
    const allDossierFiles = fs.readdirSync(dossiersDir);
    const userDossierFiles = allDossierFiles.filter(
      file => file.startsWith(`${username}_`) && file.endsWith('_dossier.json')
    );

    // Extract protocol IDs and last modified dates
    const dossiers = userDossierFiles.map(file => {
      const filePath = path.join(dossiersDir, file);
      const stats = fs.statSync(filePath);
      const dossierData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Extract protocol ID from filename (username_protocolid_dossier.json)
      const protocolId = file.replace(`${username}_`, '').replace('_dossier.json', '');

      return {
        protocol_id: protocolId,
        last_modified: stats.mtime,
        report_count: dossierData.reports ? dossierData.reports.length : 0,
        latest_report:
          dossierData.reports && dossierData.reports.length > 0
            ? dossierData.reports[dossierData.reports.length - 1]
            : null,
      };
    });

    // Sort by last modified date (newest first)
    dossiers.sort((a, b) => b.last_modified.getTime() - a.last_modified.getTime());

    res.json({
      success: true,
      username,
      dossiers,
    });
  } catch (error) {
    console.error('Error listing user dossiers:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to list dossiers',
    });
  }
});

// Protocol version comparison export
router.post('/export/protocol-comparison', async (req: Request, res: Response) => {
  try {
    const { protocol_id, v1, v2 } = req.body;

    if (!protocol_id || !v1 || !v2) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: protocol_id, v1, and v2 are required',
      });
    }

    // Generate PDF using Python script
    const inputData = {
      protocol_id,
      v1,
      v2,
      timestamp: Date.now(),
    };

    const tempInputFile = path.join('data', `protocol_comparison_input_${Date.now()}.json`);
    fs.writeFileSync(tempInputFile, JSON.stringify(inputData));

    const pythonProcess = spawn('python3', ['scripts/export_compare_pdf.py', tempInputFile]);

    let resultData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      resultData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
      console.error(`Protocol comparison generation error: ${data}`);
    });

    pythonProcess.on('close', code => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempInputFile);
      } catch (err) {
        console.error('Failed to clean up temp file:', err);
      }

      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: `Protocol comparison generation failed: ${errorData}`,
        });
      }

      try {
        const pdfPath = resultData.trim();

        if (!fs.existsSync(pdfPath)) {
          return res.status(500).json({
            success: false,
            message: 'PDF file not found',
          });
        }

        const fileName = path.basename(pdfPath);
        const downloadUrl = `/api/download/report/${fileName}`;

        // Return the download URL instead of streaming the file directly
        res.json({
          success: true,
          download_url: downloadUrl,
          file_path: pdfPath,
        });
      } catch (error) {
        console.error('Error processing protocol comparison:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Failed to process protocol comparison',
        });
      }
    });
  } catch (error) {
    console.error('Error in protocol comparison generation:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred during comparison generation',
    });
  }
});

export default router;
