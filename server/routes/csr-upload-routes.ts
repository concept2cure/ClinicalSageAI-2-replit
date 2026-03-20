import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { csrExtractorService } from '../services/csr-extractor-service';
import { clinicalIntelligenceService } from '../services/clinical-intelligence-service';
import { authMiddleware } from '../auth';

const router = Router();

// SECURITY: All CSR upload/processing endpoints require authentication
router.use(authMiddleware);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'csrs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept PDF, TXT and JSON files
  if (
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'text/plain' ||
    file.mimetype === 'application/json'
  ) {
    cb(null, true);
  } else {
    cb(new Error('File format not supported. Please upload PDF, TXT, or JSON files.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/**
 * @route POST /api/csr/upload
 * @description Upload and process a CSR file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;

    // Store file information in database
    const [result] = await db.execute<{ id: number }>(sql`
      INSERT INTO csr_reports (
        title, 
        file_name, 
        file_size, 
        upload_date, 
        file_path
      ) VALUES (
        ${path.basename(file.originalname, path.extname(file.originalname))}, 
        ${file.filename}, 
        ${file.size}, 
        ${new Date()}, 
        ${file.path}
      ) RETURNING id
    `);

    if (!result) {
      return res.status(500).json({ error: 'Failed to record file information' });
    }

    const reportId = result.id;

    // Create an initial CSR details record
    await db.execute(sql`
      INSERT INTO csr_details (
        report_id,
        processed,
        processing_status
      ) VALUES (
        ${reportId},
        false,
        'pending'
      )
    `);

    // Start processing in the background (don't await)
    // This will happen asynchronously so the response can be sent quickly
    csrExtractorService
      .processCSR(reportId)
      .catch(err => console.error(`Background processing error for CSR ID ${reportId}:`, err));

    // Add to semantic processing queue to ensure this document goes through the framework
    clinicalIntelligenceService.addToProcessingQueue(reportId.toString(), 'CSR');
    console.log(`Added CSR ${reportId} to semantic processing queue`);

    // Return immediate response
    res.status(201).json({
      status: 'success',
      message: 'CSR uploaded and scheduled for processing',
      reportId,
      fileInfo: {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: file.path,
      },
    });
  } catch (error) {
    console.error('Error uploading CSR:', error);
    res.status(500).json({
      error: 'Failed to process CSR upload',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route GET /api/csr/:id
 * @description Get CSR details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);

    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    // Get CSR report and details
    const [report] = await db.execute<{
      id: number;
      title: string;
      sponsor: string | null;
      indication: string | null;
      phase: string | null;
      file_name: string | null;
      file_size: number | null;
      upload_date: Date | null;
      summary: string | null;
    }>(sql`
      SELECT id, title, sponsor, indication, phase, 
             file_name, file_size, upload_date, summary
      FROM csr_reports 
      WHERE id = ${reportId}
    `);

    if (!report) {
      return res.status(404).json({ error: 'CSR report not found' });
    }

    const [details] = await db.execute<{
      id: number;
      report_id: number;
      processed: boolean;
      processing_status: string | null;
      study_design: string | null;
      primary_objective: string | null;
    }>(sql`
      SELECT id, report_id, processed, processing_status, 
             study_design, primary_objective
      FROM csr_details 
      WHERE report_id = ${reportId}
    `);

    // Check if there's a processed JSON file
    const processedFilePath = path.join(
      process.cwd(),
      'data/processed_csrs',
      `CSR-${reportId}.json`
    );

    let processedData = null;
    if (fs.existsSync(processedFilePath)) {
      try {
        processedData = JSON.parse(fs.readFileSync(processedFilePath, 'utf-8'));
      } catch (err) {
        console.error(`Error reading processed CSR file for ID ${reportId}:`, err);
      }
    }

    res.json({
      report,
      details: details || { processed: false, processing_status: 'not_found' },
      processedData,
    });
  } catch (error) {
    console.error('Error retrieving CSR:', error);
    res.status(500).json({
      error: 'Failed to retrieve CSR information',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route GET /api/csr/status/:id
 * @description Get processing status of a CSR
 */
router.get('/status/:id', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);

    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const [details] = await db.execute<{
      processed: boolean;
      processing_status: string | null;
    }>(sql`
      SELECT processed, processing_status
      FROM csr_details 
      WHERE report_id = ${reportId}
    `);

    if (!details) {
      return res.status(404).json({ error: 'CSR details not found' });
    }

    res.json({
      processed: details.processed,
      status: details.processing_status,
    });
  } catch (error) {
    console.error('Error checking CSR status:', error);
    res.status(500).json({
      error: 'Failed to check CSR processing status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route GET /api/csr/list
 * @description List available CSRs
 */
router.get('/list', async (req, res) => {
  try {
    // Get query parameters for filtering and pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Build the query
    const reports = await db.execute<{
      id: number;
      title: string;
      sponsor: string | null;
      indication: string | null;
      phase: string | null;
      upload_date: Date | null;
      processed: boolean;
      processing_status: string | null;
    }>(sql`
      SELECT r.id, r.title, r.sponsor, r.indication, r.phase, r.upload_date,
             d.processed, d.processing_status
      FROM csr_reports r
      LEFT JOIN csr_details d ON r.id = d.report_id
      ORDER BY r.upload_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Get total count for pagination
    const [countResult] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM csr_reports
    `);

    const totalReports = countResult ? countResult.count : 0;
    const totalPages = Math.ceil(totalReports / limit);

    res.json({
      reports,
      pagination: {
        page,
        limit,
        totalReports,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error listing CSRs:', error);
    res.status(500).json({
      error: 'Failed to retrieve CSR list',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route POST /api/csr/process/:id
 * @description Manually trigger processing for a CSR
 */
router.post('/process/:id', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);

    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    // Update status to pending
    await db.execute(sql`
      UPDATE csr_details
      SET processed = false, processing_status = 'pending'
      WHERE report_id = ${reportId}
    `);

    // Process the CSR in the background
    csrExtractorService
      .processCSR(reportId)
      .catch(err => console.error(`Manual processing error for CSR ID ${reportId}:`, err));

    res.json({
      status: 'processing_started',
      reportId,
    });
  } catch (error) {
    console.error('Error processing CSR:', error);
    res.status(500).json({
      error: 'Failed to start CSR processing',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route GET /api/csr/stats
 * @description Get statistics about CSR processing
 */
router.get('/stats', async (req, res) => {
  try {
    // Get processing stats
    const stats = await csrExtractorService.getProcessingStats();

    // Get count of processed files actually on disk
    const processedFileCount = csrExtractorService.getProcessedFileCount();

    res.json({
      databaseStats: stats,
      processedFileCount,
      processingGap: stats.processed - processedFileCount,
    });
  } catch (error) {
    console.error('Error getting CSR stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve CSR statistics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @route POST /api/csr/upload-enhanced
 * @description Upload and process a CSR file with enhanced semantic extraction
 */
router.post('/upload-enhanced', upload.single('file'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;

    // Only allow PDF and TXT files
    if (!file.originalname.endsWith('.pdf') && !file.originalname.endsWith('.txt')) {
      return res.status(400).json({ error: 'Only PDF or TXT files are supported.' });
    }

    // Store file information in database
    const [result] = await db.execute<{ id: number }>(sql`
      INSERT INTO csr_reports (
        title, 
        file_name, 
        file_size, 
        upload_date, 
        file_path
      ) VALUES (
        ${path.basename(file.originalname, path.extname(file.originalname))}, 
        ${file.filename}, 
        ${file.size}, 
        ${new Date()}, 
        ${file.path}
      ) RETURNING id
    `);

    if (!result) {
      return res.status(500).json({ error: 'Failed to record file information' });
    }

    const reportId = result.id;

    // Create an initial CSR details record
    await db.execute(sql`
      INSERT INTO csr_details (
        report_id,
        processed,
        processing_status
      ) VALUES (
        ${reportId},
        false,
        'pending_enhanced'
      )
    `);

    // Start enhanced processing in the background with the improved extraction pipeline
    // This will use our upgraded extraction capabilities including semantic, pharmacologic, and statistical insights
    csrExtractorService
      .processCSR(reportId)
      .catch(err => console.error(`Enhanced processing error for CSR ID ${reportId}:`, err));

    // Add to semantic processing queue to ensure this document goes through the framework
    clinicalIntelligenceService.addToProcessingQueue(reportId.toString(), 'CSR');
    console.log(`Added CSR ${reportId} to semantic processing queue for enhanced analysis`);

    // Build path for the processed JSON file (will be created by processor)
    const jsonFilename = `CSR-${reportId}.json`;
    const jsonPath = path.join(process.cwd(), 'data/processed_csrs', jsonFilename);

    // Return immediate response
    res.status(201).json({
      status: 'parsed',
      message: 'CSR uploaded and scheduled for enhanced processing',
      csr_id: `CSR-${reportId}`,
      reportId,
      json_path: `/api/files/processed_csrs/${jsonFilename}`,
      fileInfo: {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: file.path,
      },
    });
  } catch (error) {
    console.error('Error uploading CSR with enhanced processing:', error);
    res.status(500).json({
      error: 'Failed to process enhanced CSR upload',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
