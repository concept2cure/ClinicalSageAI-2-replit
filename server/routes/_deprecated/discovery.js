/**
 * Unified Discovery API
 *
 * This API provides unified search capabilities for:
 * 1. Literature search (for both CER and 510k modules)
 * 2. Predicate device search (primarily for 510k module)
 *
 * The API intelligently adapts result formats based on the module context
 * while maintaining a shared core implementation.
 */

import express from 'express';
import discoveryService from '../services/discoveryService.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
});

// Ensure database tables exist on startup
(async () => {
  try {
    await discoveryService.ensureTablesExist();
    console.log('✅ Discovery service database tables ready');
  } catch (error) {
    console.error('❌ Failed to initialize discovery service database tables:', error);
  }
})();

/**
 * @route   GET /api/discovery/literature
 * @desc    Search for literature based on query and filters
 * @access  Protected
 */
router.get('/literature', async (req, res) => {
  try {
    const { query, yearStart, yearEnd, peerReviewedOnly, fullTextOnly, includePreprints, context } =
      req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    // Convert query parameters to appropriate types
    const filters = {
      yearStart: yearStart ? parseInt(yearStart) : undefined,
      yearEnd: yearEnd ? parseInt(yearEnd) : undefined,
      peerReviewedOnly: peerReviewedOnly === 'true',
      fullTextOnly: fullTextOnly === 'true',
      includePreprints: includePreprints === 'true',
    };

    // Use the appropriate context (cer or 510k)
    const moduleContext = context || 'cer';

    const results = await discoveryService.searchLiterature(query, filters, moduleContext);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Literature search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search literature',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   GET /api/discovery/predicates
 * @desc    Search for predicate devices based on query and filters
 * @access  Protected
 */
router.get('/predicates', async (req, res) => {
  try {
    const { query, yearStart, yearEnd } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    // Convert query parameters to appropriate types
    const filters = {
      yearStart: yearStart ? parseInt(yearStart) : undefined,
      yearEnd: yearEnd ? parseInt(yearEnd) : undefined,
    };

    const results = await discoveryService.searchPredicateDevices(query, filters);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Predicate device search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search predicate devices',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   POST /api/discovery/upload
 * @desc    Upload a literature PDF file for processing
 * @access  Protected
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    const result = await discoveryService.processLiteratureFile(fileBuffer, req.file.filename);

    res.json({
      success: true,
      data: {
        id: result.id,
        filename: req.file.filename,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    console.error('Literature upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process literature file',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   POST /api/discovery/literature-review
 * @desc    Generate a literature review from selected articles
 * @access  Protected
 */
router.post('/literature-review', async (req, res) => {
  try {
    const { selectedArticles, deviceDescription, context } = req.body;

    if (!selectedArticles || !Array.isArray(selectedArticles) || selectedArticles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected articles are required',
      });
    }

    if (!deviceDescription) {
      return res.status(400).json({
        success: false,
        message: 'Device description is required',
      });
    }

    // Use the appropriate context (cer or 510k)
    const moduleContext = context || 'cer';

    const result = await discoveryService.generateLiteratureReview(
      selectedArticles,
      deviceDescription,
      moduleContext
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Literature review generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate literature review',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   POST /api/discovery/predicate-comparison
 * @desc    Generate a predicate device comparison report
 * @access  Protected
 */
router.post('/predicate-comparison', async (req, res) => {
  try {
    const { selectedPredicates, deviceDescription } = req.body;

    if (
      !selectedPredicates ||
      !Array.isArray(selectedPredicates) ||
      selectedPredicates.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Selected predicate devices are required',
      });
    }

    if (!deviceDescription) {
      return res.status(400).json({
        success: false,
        message: 'Device description is required',
      });
    }

    const result = await discoveryService.generatePredicateComparison(
      selectedPredicates,
      deviceDescription
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Predicate comparison generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate predicate comparison',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   GET /api/discovery/reviews
 * @desc    Get all saved literature reviews
 * @access  Protected
 */
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await discoveryService.getSavedReviews();

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error('Retrieving saved reviews error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve saved reviews',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route   GET /api/discovery/reviews/:id
 * @desc    Get a specific saved review by ID
 * @access  Protected
 */
router.get('/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const review = await discoveryService.getReviewById(id);

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error(`Retrieving review ${req.params.id} error:`, error);
    res.status(error.message === 'Review not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to retrieve review',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

export default router;
