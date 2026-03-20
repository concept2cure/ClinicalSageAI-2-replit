/**
 * Manufacturing Intelligence Tuner
 *
 * This module provides functionality to benchmark and improve manufacturing processes
 * using AI and global precedent mining.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { manufacturingDataSchema } from './types.js';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

// Rate limiter for manufacturing analysis
const manufacturingAnalysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute (more restrictive due to complexity)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many manufacturing analysis requests, please try again after a minute',
});
import { ai } from '../../lib/unified-ai-client';

// Create router
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept CSV, PDF, XML, Excel files
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/xml' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, PDF, XML, and Excel files are allowed'));
    }
  },
});

// Get OpenAI client
// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists
const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Analyze batch records and manufacturing data
 * POST /api/cmc/manufacturing-tuner/analyze
 */
router.post('/analyze', checkForOpenAIKey, manufacturingAnalysisLimiter, async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = manufacturingDataSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { batchRecords, processes } = req.body;

    // Generate a unique analysis ID
    const analysisId = uuidv4();

    // Use OpenAI to analyze the manufacturing data
    const messages = [
      {
        role: 'system',
        content: `You are an expert in pharmaceutical manufacturing process optimization and quality control.
        You need to analyze batch records and process data to identify optimizations, benchmarks, and potential improvements.
        
        For your analysis, focus on:
        1. Yield analysis and optimization opportunities
        2. Critical process parameters that show variability
        3. Process efficiency benchmarks compared to industry standards
        4. Control strategy recommendations
        5. Potential risk areas and mitigation strategies
        
        Provide a structured, objective analysis that would help optimize manufacturing processes.`,
      },
      {
        role: 'user',
        content: `Please analyze the following manufacturing data:
        
        Batch Records: ${JSON.stringify(batchRecords)}
        
        Processes: ${JSON.stringify(processes)}
        
        Please provide a comprehensive analysis according to the guidelines.`,
      },
    ];

    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 2500,
    });

    // Get the response
    const analysis = aiResult.content;

    // Structure the results
    const analysisResult = {
      analysisId,
      batchRecords,
      processes,
      analysis,
      recommendations: {
        processImprovements: [],
        controlStrategy: '',
        validationApproach: '',
      },
      benchmarks: {
        yieldComparison: '',
        industryStandards: '',
        efficiencyMetrics: '',
      },
      generatedAt: new Date().toISOString(),
    };

    // Extract structured recommendations
    const recommendationsPrompt = `Based on the batch records and process data analysis:
    ${analysis}
    
    Please provide structured, specific recommendations in JSON format with the following fields:
    1. processImprovements: Array of specific process improvements
    2. controlStrategy: Recommended control strategy updates
    3. validationApproach: Recommended validation approach
    
    Format the response as valid JSON only.`;

    const recommendationsResponse = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a manufacturing optimization expert. Provide structured recommendations in valid JSON format only.',
        },
        { role: 'user', content: recommendationsPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    // Parse the recommendations
    try {
      const recommendations = JSON.parse(recommendationsResponse.choices[0].message.content);
      analysisResult.recommendations = recommendations;
    } catch (error) {
      console.error('Error parsing recommendations JSON:', error);
    }

    // Extract structured benchmarks
    const benchmarksPrompt = `Based on the batch records and process data analysis:
    ${analysis}
    
    Please provide structured benchmarks in JSON format with the following fields:
    1. yieldComparison: Yield comparison with industry standards
    2. industryStandards: Relevant industry standards for this process
    3. efficiencyMetrics: Key efficiency metrics
    
    Format the response as valid JSON only.`;

    const benchmarksResponse = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a manufacturing benchmarking expert. Provide structured benchmarks in valid JSON format only.',
        },
        { role: 'user', content: benchmarksPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    // Parse the benchmarks
    try {
      const benchmarks = JSON.parse(benchmarksResponse.choices[0].message.content);
      analysisResult.benchmarks = benchmarks;
    } catch (error) {
      console.error('Error parsing benchmarks JSON:', error);
    }

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `manufacturing_${analysisId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(analysisResult, null, 2));

    return res.status(200).json({
      success: true,
      analysisId,
      analysis: analysisResult.analysis,
      recommendations: analysisResult.recommendations,
      benchmarks: analysisResult.benchmarks,
      downloadUrl: `/api/cmc/manufacturing-tuner/download/${analysisId}`,
    });
  } catch (error) {
    console.error('Error in manufacturing analysis:', error);
    return res.status(500).json({
      error: 'An error occurred while analyzing manufacturing data',
      details: error.message,
    });
  }
});

/**
 * Upload batch records or manufacturing data files
 * POST /api/cmc/manufacturing-tuner/upload
 */
router.post('/upload', checkForOpenAIKey, upload.array('files', 5), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Generate a unique upload ID
    const uploadId = uuidv4();

    // Process each uploaded file
    const processedFiles = [];

    for (const file of files) {
      // Basic file info
      const fileInfo = {
        originalName: file.originalname,
        fileName: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype,
        path: file.path,
      };

      // Extract text content from the file (if applicable)
      let fileContent = null;

      if (file.mimetype === 'text/csv') {
        // Read CSV content
        fileContent = fs.readFileSync(file.path, 'utf8');
      } else if (file.mimetype === 'application/xml') {
        // Read XML content
        fileContent = fs.readFileSync(file.path, 'utf8');
      } else if (file.mimetype === 'application/pdf') {
        // For PDF, we'd need a PDF parser library (not implemented here)
        fileContent = 'PDF content extraction not implemented in this example';
      } else if (
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        // For Excel, we'd need an Excel parser library (not implemented here)
        fileContent = 'Excel content extraction not implemented in this example';
      }

      // Use OpenAI to extract structured data (if content is available)
      let extractedData = null;

      if (fileContent) {
        const extractionPrompt = `This is a manufacturing data file. Please extract key information about batch records, processes, equipment, materials, and any other relevant manufacturing data.
        
        File content:
        ${fileContent.substring(0, 10000)} // Limit content size
        
        Please extract structured information in JSON format.`;

        const extractionResponse = await ai.chat({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are a manufacturing data extraction expert. Extract structured information from the provided file.',
            },
            { role: 'user', content: extractionPrompt },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        });

        extractedData = extractionResponse.choices[0].message.content;
      }

      // Add processed file info
      processedFiles.push({
        ...fileInfo,
        extractedData,
      });
    }

    // Save the processed file info
    const processingResult = {
      uploadId,
      files: processedFiles,
      uploadedAt: new Date().toISOString(),
    };

    const resultFilePath = path.join(outputDir, `upload_${uploadId}.json`);
    fs.writeFileSync(resultFilePath, JSON.stringify(processingResult, null, 2));

    return res.status(200).json({
      success: true,
      uploadId,
      files: processedFiles.map(file => ({
        originalName: file.originalName,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
      })),
      processingResult: `/api/cmc/manufacturing-tuner/processing/${uploadId}`,
    });
  } catch (error) {
    console.error('Error in file upload:', error);
    return res.status(500).json({
      error: 'An error occurred while uploading and processing files',
      details: error.message,
    });
  }
});

/**
 * Get processing result for uploaded files
 * GET /api/cmc/manufacturing-tuner/processing/:uploadId
 */
router.get('/processing/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;

    // Sanitize the upload ID to prevent directory traversal
    const sanitizedId = uploadId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `upload_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Upload processing result not found' });
    }

    // Read the processing result
    const processingResult = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    return res.json(processingResult);
  } catch (error) {
    console.error('Error in getting processing result:', error);
    return res.status(500).json({
      error: 'An error occurred while getting the processing result',
      details: error.message,
    });
  }
});

/**
 * Download analysis results
 * GET /api/cmc/manufacturing-tuner/download/:analysisId
 */
router.get('/download/:analysisId', (req, res) => {
  try {
    const { analysisId } = req.params;
    const format = req.query.format || 'json';

    // Sanitize the analysis ID to prevent directory traversal
    const sanitizedId = analysisId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `manufacturing_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Read the analysis data
    const analysisData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Handle different formats
    if (format === 'pdf') {
      // In a real implementation, we would convert the data to PDF
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'PDF format not yet implemented' });
    } else if (format === 'html') {
      // In a real implementation, we would convert the data to HTML
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'HTML format not yet implemented' });
    } else {
      // Return JSON format
      return res.json(analysisData);
    }
  } catch (error) {
    console.error('Error in analysis download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the analysis',
      details: error.message,
    });
  }
});

/**
 * Generate optimization recommendations
 * POST /api/cmc/manufacturing-tuner/optimize
 */
router.post('/optimize', checkForOpenAIKey, manufacturingAnalysisLimiter, async (req, res) => {
  try {
    const { analysisId, targetArea } = req.body;

    // Basic validation
    if (!analysisId) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    // Get the analysis results
    const filePath = path.join(outputDir, `manufacturing_${analysisId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const analysisData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Use OpenAI to generate optimization recommendations
    const optimizationPrompt = `Based on the following manufacturing analysis:
    ${analysisData.analysis}
    
    And the identified recommendations:
    ${JSON.stringify(analysisData.recommendations)}
    
    And benchmarks:
    ${JSON.stringify(analysisData.benchmarks)}
    
    Please generate detailed optimization recommendations${targetArea ? ` specifically for ${targetArea}` : ''}.
    
    Focus on:
    1. Specific actions to improve yields and reduce variability
    2. Process parameter adjustments with scientific rationale
    3. Equipment or material modifications
    4. Control strategy enhancements
    5. Implementation steps and validation considerations
    
    Please provide comprehensive, actionable recommendations.`;

    const optimizationResponse = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical manufacturing optimization expert. Provide detailed, actionable recommendations.',
        },
        { role: 'user', content: optimizationPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Get the response
    const optimizationRecommendations = optimizationResponse.choices[0].message.content;

    // Update the analysis results with the optimization recommendations
    analysisData.optimizationRecommendations = {
      targetArea: targetArea || 'overall',
      recommendations: optimizationRecommendations,
      generatedAt: new Date().toISOString(),
    };

    // Save the updated results
    fs.writeFileSync(filePath, JSON.stringify(analysisData, null, 2));

    return res.status(200).json({
      success: true,
      analysisId,
      targetArea: targetArea || 'overall',
      optimizationRecommendations,
      downloadUrl: `/api/cmc/manufacturing-tuner/download/${analysisId}`,
    });
  } catch (error) {
    console.error('Error in optimization recommendations:', error);
    return res.status(500).json({
      error: 'An error occurred while generating optimization recommendations',
      details: error.message,
    });
  }
});

export default router;
