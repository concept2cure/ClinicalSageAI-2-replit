/**
 * Global Compliance Auto-Match
 *
 * This module provides functionality to auto-localize CMC content for multiple
 * health authorities, enabling "write once, file anywhere" capability.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { complianceDocumentSchema, regulatoryMarketSchema } from './types.js';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

// Rate limiter for global compliance processing
const complianceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute (more restrictive due to complexity)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many compliance processing requests, please try again after a minute',
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for document files
  fileFilter: function (req, file, cb) {
    // Accept document formats
    if (
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/rtf'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, Plain Text, and RTF files are allowed'));
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
 * Transform a Module 3 document for different regulatory markets
 * POST /api/cmc/global-compliance/transform
 */
router.post('/transform', checkForOpenAIKey, complianceLimiter, async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = complianceDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { documentType, content, baseRegion, targetRegions, formatPreferences } = req.body;

    // Generate a unique transformation ID
    const transformationId = uuidv4();

    // Create a map to store transformed content for each target region
    const transformedContent = {};

    // Process each target region
    for (const region of targetRegions) {
      // Skip if target region is same as base region
      if (region === baseRegion) {
        transformedContent[region] = {
          content,
          note: 'This is the original content (no transformation needed)',
        };
        continue;
      }

      // Use OpenAI to transform content for the target region
      const messages = [
        {
          role: 'system',
          content: `You are an expert regulatory affairs specialist with deep knowledge of global CMC requirements.
          You need to transform a ${documentType} document from ${baseRegion.toUpperCase()} format to ${region.toUpperCase()} format.
          
          For your transformation, follow these guidelines:
          1. Adapt terminology to match ${region.toUpperCase()} regulatory expectations (e.g., "drug substance" vs. "active substance")
          2. Adjust document structure to follow ${region.toUpperCase()} specific formats
          3. Convert units as needed (e.g., US to metric if necessary)
          4. Add or remove sections as required by ${region.toUpperCase()} regulations
          5. Adapt referencing style to match ${region.toUpperCase()} expectations
          
          ${formatPreferences?.useLocalTerminology ? 'Use local terminology for the target region.' : ''}
          ${formatPreferences?.includeRegionalAnnexes ? 'Include any additional regional annexes required.' : ''}
          ${formatPreferences?.standardizeUnits ? 'Standardize units according to regional conventions.' : ''}
          
          Maintain the scientific integrity and factual content while making these adaptations.`,
        },
        {
          role: 'user',
          content: `Please transform the following ${baseRegion.toUpperCase()} ${documentType} document to ${region.toUpperCase()} format:
          
          ${content}
          
          Please provide the transformed content with appropriate formatting and structure for ${region.toUpperCase()}.`,
        },
      ];

      const aiResult = await ai.chat({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.3,
        max_tokens: 4000,
      });

      // Get the transformed content
      const regionTransformedContent = aiResult.content;

      // Generate a change tracking log
      const changeTrackingPrompt = `Based on the original content:
      ${content.substring(0, 3000)}... (truncated for brevity)
      
      And the transformed content for ${region.toUpperCase()}:
      ${regionTransformedContent.substring(0, 3000)}... (truncated for brevity)
      
      Please provide a detailed change tracking log highlighting:
      1. Terminology changes
      2. Structural changes
      3. Unit conversions
      4. Added or removed sections
      5. Reference style changes
      
      Format as a clear, itemized list of changes.`;

      const changeTrackingResponse = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a regulatory document specialist expert in tracking changes between different regional formats.',
          },
          { role: 'user', content: changeTrackingPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      // Store the transformed content and change tracking log
      transformedContent[region] = {
        content: regionTransformedContent,
        changeTrackingLog: changeTrackingResponse.choices[0].message.content,
      };

      // If including regional annexes is required, generate them
      if (formatPreferences?.includeRegionalAnnexes) {
        const annexPrompt = `Based on the ${region.toUpperCase()} regulatory requirements for ${documentType} documents,
        please generate any additional regional annexes that would be required for this submission.
        
        Consider the following as context:
        ${regionTransformedContent.substring(0, 3000)}... (truncated for brevity)
        
        Please provide only the annexes specific to ${region.toUpperCase()} that aren't part of the main document.`;

        const annexResponse = await ai.chat({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a regulatory compliance expert specializing in ${region.toUpperCase()} requirements.`,
            },
            { role: 'user', content: annexPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        });

        // Add annexes to the transformed content
        transformedContent[region].annexes = annexResponse.choices[0].message.content;
      }
    }

    // Structure the results
    const transformationResult = {
      transformationId,
      documentType,
      baseRegion,
      targetRegions,
      originalContent: content,
      transformedContent,
      formatPreferences,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `compliance_${transformationId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(transformationResult, null, 2));

    return res.status(200).json({
      success: true,
      transformationId,
      targetRegions,
      transformationSummary: Object.keys(transformedContent).map(region => ({
        region,
        status: 'completed',
        hasAnnexes: Boolean(transformedContent[region].annexes),
      })),
      downloadUrl: `/api/cmc/global-compliance/download/${transformationId}`,
    });
  } catch (error) {
    console.error('Error in global compliance transformation:', error);
    return res.status(500).json({
      error: 'An error occurred while transforming the document',
      details: error.message,
    });
  }
});

/**
 * Upload document for compliance transformation
 * POST /api/cmc/global-compliance/upload
 */
router.post('/upload', checkForOpenAIKey, upload.single('document'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Basic file info
    const fileInfo = {
      originalName: file.originalname,
      fileName: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      path: file.path,
    };

    // Extract text content from the file (if applicable)
    // In a real implementation, we would use appropriate libraries for each file type
    // For this example, we'll just use a simple text extraction for text files
    let fileContent = '';

    if (file.mimetype === 'text/plain') {
      fileContent = fs.readFileSync(file.path, 'utf8');
    } else {
      // For other file types, we'd need to use appropriate libraries
      // This is a placeholder
      fileContent = 'Document content extraction not fully implemented in this example';
    }

    // Use OpenAI to extract document type and base region
    const extractionPrompt = `This is a regulatory document. Please analyze the document name and extract:
    
    1. Document type (e.g., Module 3.2.S.1, specification document, analytical method, etc.)
    2. Base region (e.g., FDA, EMA, ICH, etc.) based on the formatting and terminology
    
    File name: ${file.originalname}`;

    const extractionResponse = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory document classification expert. Extract document type and likely base region.',
        },
        { role: 'user', content: extractionPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    // Generate a unique upload ID
    const uploadId = uuidv4();

    // Structure upload result
    const uploadResult = {
      uploadId,
      fileInfo,
      documentMetadata: {
        extractionResult: extractionResponse.choices[0].message.content,
        contentPreview: fileContent.substring(0, 1000) + (fileContent.length > 1000 ? '...' : ''),
      },
      uploadedAt: new Date().toISOString(),
    };

    // Save upload result
    const resultFilePath = path.join(outputDir, `compliance_upload_${uploadId}.json`);
    fs.writeFileSync(resultFilePath, JSON.stringify(uploadResult, null, 2));

    return res.status(200).json({
      success: true,
      uploadId,
      fileInfo: {
        originalName: fileInfo.originalName,
        fileSize: fileInfo.fileSize,
        mimeType: fileInfo.mimeType,
      },
      documentMetadata: uploadResult.documentMetadata,
      processingUrl: `/api/cmc/global-compliance/processing/${uploadId}`,
    });
  } catch (error) {
    console.error('Error in document upload:', error);
    return res.status(500).json({
      error: 'An error occurred while uploading and processing the document',
      details: error.message,
    });
  }
});

/**
 * Generate compatibility matrix across regions
 * POST /api/cmc/global-compliance/compatibility-matrix
 */
router.post('/compatibility-matrix', checkForOpenAIKey, complianceLimiter, async (req, res) => {
  try {
    const { documentType, baseRegion, targetRegions } = req.body;

    // Basic validation
    if (!documentType || !baseRegion || !targetRegions || !Array.isArray(targetRegions)) {
      return res
        .status(400)
        .json({ error: 'Document type, base region, and target regions are required' });
    }

    // Use OpenAI to generate compatibility matrix
    const messages = [
      {
        role: 'system',
        content: `You are a global regulatory affairs expert with comprehensive knowledge of CMC requirements across health authorities.
        You need to create a detailed compatibility matrix for transforming a ${documentType} document from ${baseRegion.toUpperCase()} format to various target regions.
        
        For your matrix, analyze and provide:
        1. Key differences in requirements across regions
        2. Compatibility challenges and potential solutions
        3. Required adaptations for each target region
        4. Effort level estimate for each transformation
        5. Risk assessment for each transformation
        
        Structure the matrix in a clear, tabular format that can guide regulatory affairs professionals.`,
      },
      {
        role: 'user',
        content: `Please create a compatibility matrix for transforming a ${documentType} document from ${baseRegion.toUpperCase()} to the following target regions:
        
        Target Regions: ${targetRegions.map(r => r.toUpperCase()).join(', ')}
        
        Please provide a comprehensive compatibility analysis in a structured format.`,
      },
    ];

    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 2500,
    });

    // Get the compatibility matrix
    const compatibilityMatrix = aiResult.content;

    // Generate regulatory requirements for each region
    const requirementsPrompt = `For a ${documentType} document, please provide a concise overview of the regulatory requirements for each of these regions:
    
    Regions: ${[baseRegion, ...targetRegions].map(r => r.toUpperCase()).join(', ')}
    
    For each region, highlight:
    1. Key required sections
    2. Region-specific expectations
    3. Common deficiencies found during review
    4. Reference guidelines or regulations
    
    Format as a clear, structured listing by region.`;

    const requirementsResponse = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a global regulatory affairs expert. Provide concise regulatory requirements by region.',
        },
        { role: 'user', content: requirementsPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Get the regulatory requirements
    const regulatoryRequirements = requirementsResponse.choices[0].message.content;

    // Generate a unique analysis ID
    const analysisId = uuidv4();

    // Structure the results
    const analysisResult = {
      analysisId,
      documentType,
      baseRegion,
      targetRegions,
      compatibilityMatrix,
      regulatoryRequirements,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `compliance_analysis_${analysisId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(analysisResult, null, 2));

    return res.status(200).json({
      success: true,
      analysisId,
      documentType,
      baseRegion,
      targetRegions,
      compatibilityMatrix,
      regulatoryRequirements,
      downloadUrl: `/api/cmc/global-compliance/download-analysis/${analysisId}`,
    });
  } catch (error) {
    console.error('Error in compatibility matrix generation:', error);
    return res.status(500).json({
      error: 'An error occurred while generating the compatibility matrix',
      details: error.message,
    });
  }
});

/**
 * Download transformation results
 * GET /api/cmc/global-compliance/download/:transformationId
 */
router.get('/download/:transformationId', (req, res) => {
  try {
    const { transformationId } = req.params;
    const region = req.query.region; // Optional region parameter
    const format = req.query.format || 'json';

    // Sanitize the transformation ID to prevent directory traversal
    const sanitizedId = transformationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `compliance_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Transformation not found' });
    }

    // Read the transformation data
    const transformationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // If a specific region is requested, return only that region's content
    if (region) {
      if (!transformationData.transformedContent[region]) {
        return res.status(404).json({ error: `Content for region ${region} not found` });
      }

      // Handle different formats
      if (format === 'docx') {
        // In a real implementation, we would convert the data to DOCX
        // For now, we'll just return the JSON for the specific region
        return res.status(500).json({ error: 'DOCX format not yet implemented' });
      } else {
        // Return JSON for the specific region
        return res.json({
          transformationId,
          region,
          content: transformationData.transformedContent[region].content,
          changeTrackingLog: transformationData.transformedContent[region].changeTrackingLog,
          annexes: transformationData.transformedContent[region].annexes,
        });
      }
    } else {
      // Return the full transformation data
      return res.json(transformationData);
    }
  } catch (error) {
    console.error('Error in transformation download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the transformation',
      details: error.message,
    });
  }
});

/**
 * Download analysis results
 * GET /api/cmc/global-compliance/download-analysis/:analysisId
 */
router.get('/download-analysis/:analysisId', (req, res) => {
  try {
    const { analysisId } = req.params;

    // Sanitize the analysis ID to prevent directory traversal
    const sanitizedId = analysisId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `compliance_analysis_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Read the analysis data
    const analysisData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Return the analysis data
    return res.json(analysisData);
  } catch (error) {
    console.error('Error in analysis download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the analysis',
      details: error.message,
    });
  }
});

/**
 * Get processing result for uploaded document
 * GET /api/cmc/global-compliance/processing/:uploadId
 */
router.get('/processing/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;

    // Sanitize the upload ID to prevent directory traversal
    const sanitizedId = uploadId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `compliance_upload_${sanitizedId}.json`);

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
 * Get a list of supported regulatory markets with metadata
 * GET /api/cmc/global-compliance/markets
 */
router.get('/markets', (req, res) => {
  const markets = [
    {
      id: 'fda',
      name: 'FDA',
      fullName: 'U.S. Food and Drug Administration',
      region: 'United States',
      documentFormats: ['eCTD'],
      languageRequirements: ['English'],
      submissionFormat: 'Electronic (ESG)',
    },
    {
      id: 'ema',
      name: 'EMA',
      fullName: 'European Medicines Agency',
      region: 'European Union',
      documentFormats: ['eCTD'],
      languageRequirements: ['English', 'Local EU languages for certain parts'],
      submissionFormat: 'Electronic (CESP)',
    },
    {
      id: 'pmda',
      name: 'PMDA',
      fullName: 'Pharmaceuticals and Medical Devices Agency',
      region: 'Japan',
      documentFormats: ['eCTD', 'J-CTD'],
      languageRequirements: ['Japanese', 'English for some parts'],
      submissionFormat: 'Electronic (Gateway)',
    },
    {
      id: 'nmpa',
      name: 'NMPA',
      fullName: 'National Medical Products Administration',
      region: 'China',
      documentFormats: ['CTD'],
      languageRequirements: ['Chinese'],
      submissionFormat: 'Electronic + Paper copies',
    },
    {
      id: 'anvisa',
      name: 'ANVISA',
      fullName: 'Brazilian Health Regulatory Agency',
      region: 'Brazil',
      documentFormats: ['CTD'],
      languageRequirements: ['Portuguese'],
      submissionFormat: 'Electronic',
    },
    {
      id: 'health_canada',
      name: 'Health Canada',
      fullName: 'Health Canada',
      region: 'Canada',
      documentFormats: ['eCTD'],
      languageRequirements: ['English', 'French'],
      submissionFormat: 'Electronic (Common Electronic Submission Gateway)',
    },
    {
      id: 'uk_mhra',
      name: 'UK MHRA',
      fullName: 'Medicines and Healthcare products Regulatory Agency',
      region: 'United Kingdom',
      documentFormats: ['eCTD'],
      languageRequirements: ['English'],
      submissionFormat: 'Electronic (MHRA Submission Portal)',
    },
    {
      id: 'who',
      name: 'WHO',
      fullName: 'World Health Organization',
      region: 'Global',
      documentFormats: ['CTD'],
      languageRequirements: ['English'],
      submissionFormat: 'Electronic',
    },
    {
      id: 'tga',
      name: 'TGA',
      fullName: 'Therapeutic Goods Administration',
      region: 'Australia',
      documentFormats: ['eCTD'],
      languageRequirements: ['English'],
      submissionFormat: 'Electronic',
    },
    {
      id: 'swissmedic',
      name: 'Swissmedic',
      fullName: 'Swiss Agency for Therapeutic Products',
      region: 'Switzerland',
      documentFormats: ['eCTD'],
      languageRequirements: ['English', 'German', 'French', 'Italian'],
      submissionFormat: 'Electronic (Swissmedic Portal)',
    },
  ];

  return res.status(200).json({ markets });
});

export default router;
