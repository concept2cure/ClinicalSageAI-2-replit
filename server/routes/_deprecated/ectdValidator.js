/**
 * eCTD Validator Routes - Server-side API routes for eCTD validation
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/ectd');

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use original filename with timestamp to avoid collisions
    const filename = `${Date.now()}-${file.originalname}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

/**
 * Validate eCTD submission
 *
 * @route POST /api/ectd/validate
 * @param {File} req.file - eCTD zip file
 * @returns {Object} - Validation results
 */
router.post('/validate', upload.single('file'), async (req, res) => {
  try {
    console.log('Validating eCTD submission');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    console.log(`File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);

    // Extract file info
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    // Check file type
    if (fileExt !== '.zip') {
      // Remove uploaded file if not a zip
      fs.unlinkSync(filePath);

      return res.status(400).json({
        success: false,
        error: 'Only ZIP files are supported',
      });
    }

    // In a real implementation, we would call the eCTD validator CLI
    // For now, we'll simulate validation with a mock response
    try {
      // Mock command execution (in production, replace with actual validator CLI call)
      // const { stdout, stderr } = await execAsync(`ectd-validator ${filePath}`);

      // For demonstration, create mock validation response
      const validationResults = generateMockValidationResults(req.file.originalname);

      res.json({
        success: true,
        file: {
          name: req.file.originalname,
          size: req.file.size,
          path: req.file.path,
        },
        validation: validationResults,
      });
    } catch (execError) {
      console.error('Error executing validator:', execError);

      res.status(500).json({
        success: false,
        error: `Validation process failed: ${execError.message}`,
      });
    }
  } catch (error) {
    console.error('Error validating eCTD submission:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate eCTD submission',
    });
  }
});

/**
 * Get validation status
 *
 * @route GET /api/ectd/validate/:jobId
 * @param {string} req.params.jobId - Validation job ID
 * @returns {Object} - Validation status
 */
router.get('/validate/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    console.log(`Getting validation status for job ${jobId}`);

    // In a real implementation, we would check the status of the validation job
    // For now, return a mock status
    res.json({
      success: true,
      jobId,
      status: 'completed',
      progress: 100,
      results: generateMockValidationResults(`job-${jobId}`),
    });
  } catch (error) {
    console.error(`Error getting validation status for job ${req.params.jobId}:`, error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get validation status',
    });
  }
});

/**
 * Generate mock validation results for demonstration
 *
 * @param {string} filename - Uploaded file name
 * @returns {Object} - Mock validation results
 */
function generateMockValidationResults(filename) {
  const hasErrors = Math.random() > 0.7; // 30% chance of errors

  return {
    summary: {
      filename,
      validatedAt: new Date().toISOString(),
      valid: !hasErrors,
      errorCount: hasErrors ? Math.floor(Math.random() * 5) + 1 : 0,
      warningCount: Math.floor(Math.random() * 10),
      infoCount: Math.floor(Math.random() * 15),
    },
    issues: hasErrors
      ? [
          {
            level: 'error',
            code: 'ECTD-001',
            message: 'Invalid XML syntax in index.xml',
            location: '/index.xml',
            line: 23,
            details: 'XML parsing error: Unexpected end of tag',
          },
          {
            level: 'error',
            code: 'ECTD-057',
            message: 'Missing required attribute in sequence element',
            location: '/index.xml',
            line: 45,
            details: 'The "sequence" element must contain a "number" attribute',
          },
          {
            level: 'warning',
            code: 'ECTD-112',
            message: 'File size exceeds recommended limit',
            location: '/m2/23-qos/quality-overall-summary.pdf',
            details: 'File size is 28.5 MB, which exceeds the recommended limit of 25 MB',
          },
          {
            level: 'info',
            code: 'ECTD-201',
            message: 'Consider adding bookmarks to PDF',
            location: '/m3/32-body-data/32s-drug-substance/substance-manufacturer.pdf',
            details: 'PDF documents should contain bookmarks for easy navigation',
          },
        ]
      : [
          {
            level: 'warning',
            code: 'ECTD-103',
            message: 'File name contains non-standard characters',
            location: '/m2/25-clinical-overview/clinical_overview-2023.pdf',
            details: 'File names should follow the eCTD naming convention',
          },
          {
            level: 'info',
            code: 'ECTD-210',
            message: 'Folder structure follows CTD but with additional folders',
            location: '/m3/32-body-data/custom-folder/',
            details: 'Consider using standard folder structure for better compatibility',
          },
        ],
    validationStandard: 'eCTD v4.0 (ICH and FDA)',
    recommendations: [
      'Ensure all XML files are well-formed and valid',
      'Keep PDF files under 25 MB for optimal performance',
      'Follow the standard eCTD folder structure',
      'Include TOC and bookmarks in all PDF documents',
      'Use descriptive but standard file names',
    ],
  };
}

export default router;
