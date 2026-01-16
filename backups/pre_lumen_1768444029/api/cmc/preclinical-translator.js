/**
 * Preclinical-to-Process Translator
 *
 * This module provides functionality to instantly scale lab discoveries
 * into commercial process frameworks.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { preclinicalDataSchema } from './types.js';
import { rateLimit } from 'express-rate-limit';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

// Rate limiter for preclinical translation
const preclinicalTranslationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute (more restrictive due to complexity)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many preclinical translation requests, please try again after a minute',
});

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
    // Accept lab protocol and formula files (PDF, Word, Excel, CSV)
    if (
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'text/csv'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, Excel, and CSV files are allowed'));
    }
  },
});

// Get OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists
const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Translate preclinical formulation to commercial scale
 * POST /api/cmc/preclinical-translator/translate
 */
router.post('/translate', checkForOpenAIKey, preclinicalTranslationLimiter, async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = preclinicalDataSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const {
      formulationDescription,
      scaleSize,
      ingredients,
      preparationMethod,
      analyticalMethods,
      stabilityData,
      targetDosageForm,
    } = req.body;

    // Generate a unique translation ID
    const translationId = uuidv4();

    // Use OpenAI to generate commercial scale-up strategy
    const messages = [
      {
        role: 'system',
        content: `You are an expert in pharmaceutical process scale-up and technology transfer.
        You need to translate preclinical laboratory-scale formulations into commercial-scale manufacturing processes.
        
        For your translation, focus on:
        1. Scale-up strategy and required equipment/facility
        2. Potential scale-up challenges and failure points
        3. Modifications needed for commercial viability
        4. Draft validation approach and process controls
        5. Manufacturing batch instructions
        
        Provide a structured, comprehensive translation that would allow successful technology transfer from lab to commercial manufacturing.`,
      },
      {
        role: 'user',
        content: `Please translate the following preclinical formulation to commercial scale:
        
        Formulation Description: ${formulationDescription}
        
        Current Scale: ${scaleSize}
        
        Ingredients: ${JSON.stringify(ingredients)}
        
        Preparation Method: ${preparationMethod}
        
        Analytical Methods: ${analyticalMethods ? JSON.stringify(analyticalMethods) : 'Not provided'}
        
        Stability Data: ${stabilityData || 'Not provided'}
        
        Target Dosage Form: ${targetDosageForm}
        
        Please provide a comprehensive scale-up strategy according to the guidelines.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 2500,
    });

    // Get the response
    const scaleUpStrategy = response.choices[0].message.content;

    // Generate equipment and facility requirements
    const equipmentPrompt = `Based on the formulation and scale-up strategy:
    ${scaleUpStrategy}
    
    Please provide a comprehensive list of equipment and facility requirements in JSON format with the following fields:
    1. equipment: Array of required equipment with specifications
    2. facility: Facility requirements (e.g., clean room classification, space needs)
    3. utilities: Required utilities (e.g., water, gas, electricity requirements)
    
    Format the response as valid JSON only.`;

    const equipmentResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical manufacturing expert. Provide structured equipment and facility requirements in valid JSON format only.',
        },
        { role: 'user', content: equipmentPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    // Parse the equipment requirements
    let equipmentRequirements = {};
    try {
      equipmentRequirements = JSON.parse(equipmentResponse.choices[0].message.content);
    } catch (error) {
      console.error('Error parsing equipment requirements JSON:', error);
    }

    // Generate failure point analysis
    const failurePointPrompt = `Based on the formulation and scale-up strategy:
    ${scaleUpStrategy}
    
    Please identify potential failure points and risks in this scale-up process. Focus on:
    1. Challenges specific to this formulation type
    2. Critical process parameters that might be affected by scale-up
    3. Areas where experience shows scale-up typically fails
    4. Material compatibility issues
    5. Regulatory concerns
    
    Provide a detailed risk assessment with mitigation strategies.`;

    const failurePointResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical scale-up risk assessment expert. Provide a detailed failure point and risk analysis.',
        },
        { role: 'user', content: failurePointPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    // Get the failure point analysis
    const failurePointAnalysis = failurePointResponse.choices[0].message.content;

    // Generate draft validation protocol
    const validationPrompt = `Based on the formulation and scale-up strategy:
    ${scaleUpStrategy}
    
    Please provide a draft validation protocol outline for this scale-up process. Include:
    1. Validation approach (e.g., traditional, continuous verification, hybrid)
    2. Key parameters to be validated
    3. Sampling and testing plan
    4. Number of validation batches recommended
    5. Acceptance criteria framework
    
    Structure this as a validation protocol outline suitable for CMC submission.`;

    const validationResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical process validation expert. Provide a structured validation protocol outline.',
        },
        { role: 'user', content: validationPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    // Get the validation protocol
    const validationProtocol = validationResponse.choices[0].message.content;

    // Structure the results
    const translationResult = {
      translationId,
      preclinicalData: {
        formulationDescription,
        scaleSize,
        ingredients,
        preparationMethod,
        analyticalMethods,
        stabilityData,
        targetDosageForm,
      },
      scaleUpStrategy,
      equipmentRequirements,
      failurePointAnalysis,
      validationProtocol,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `preclinical_${translationId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(translationResult, null, 2));

    return res.status(200).json({
      success: true,
      translationId,
      scaleUpStrategy,
      equipmentRequirements,
      failurePointAnalysis,
      validationProtocol,
      downloadUrl: `/api/cmc/preclinical-translator/download/${translationId}`,
    });
  } catch (error) {
    console.error('Error in preclinical translation:', error);
    return res.status(500).json({
      error: 'An error occurred while translating preclinical data',
      details: error.message,
    });
  }
});

/**
 * Upload preclinical files (lab protocols, formulations)
 * POST /api/cmc/preclinical-translator/upload
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
      // In a real implementation, we would use appropriate libraries for each file type
      // For this example, we just acknowledge the different file types

      // Use OpenAI to extract structured formulation data
      const extractionPrompt = `This is a preclinical formulation document. Please extract key information about the formulation, including:
      
      1. Formulation description
      2. Scale size
      3. Ingredients (name, amount, function)
      4. Preparation method
      5. Analytical methods used
      6. Any stability data mentioned
      7. Target dosage form
      
      Please extract structured information in JSON format with these fields.`;

      const extractionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a pharmaceutical formulation expert. Extract structured information from the provided file name and type.',
          },
          {
            role: 'user',
            content: `File name: ${file.originalname}\nFile type: ${file.mimetype}\n\n${extractionPrompt}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      const extractedData = extractionResponse.choices[0].message.content;

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

    const resultFilePath = path.join(outputDir, `preclinical_upload_${uploadId}.json`);
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
      processingResult: `/api/cmc/preclinical-translator/processing/${uploadId}`,
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
 * Generate master batch record (MBR) from translation
 * POST /api/cmc/preclinical-translator/generate-mbr
 */
router.post('/generate-mbr', checkForOpenAIKey, preclinicalTranslationLimiter, async (req, res) => {
  try {
    const { translationId, batchSize, manufacturingFacility } = req.body;

    // Basic validation
    if (!translationId) {
      return res.status(400).json({ error: 'Translation ID is required' });
    }

    // Get the translation results
    const filePath = path.join(outputDir, `preclinical_${translationId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    const translationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Use OpenAI to generate master batch record
    const messages = [
      {
        role: 'system',
        content: `You are a pharmaceutical manufacturing expert specializing in master batch record (MBR) creation.
        Based on a preclinical-to-commercial translation, you need to create a detailed master batch record
        that would be used for commercial manufacturing.
        
        For your MBR, focus on:
        1. Detailed step-by-step manufacturing instructions
        2. In-process controls and sampling points
        3. Equipment setup and operating parameters
        4. Material handling instructions
        5. Critical process parameters and their acceptable ranges
        
        Provide a comprehensive, GMP-compliant master batch record that would satisfy regulatory requirements.`,
      },
      {
        role: 'user',
        content: `Based on the following preclinical-to-commercial translation, please generate a detailed master batch record:
        
        Formulation Description: ${translationData.preclinicalData.formulationDescription}
        
        Scale-Up Strategy: ${translationData.scaleUpStrategy}
        
        Equipment Requirements: ${JSON.stringify(translationData.equipmentRequirements)}
        
        Validation Protocol: ${translationData.validationProtocol}
        
        Batch Size: ${batchSize || 'Commercial scale (to be determined based on equipment capacity)'}
        
        Manufacturing Facility: ${manufacturingFacility || 'Generic GMP facility'}
        
        Please structure your response as a comprehensive master batch record with clearly defined sections.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 3000,
    });

    // Get the response
    const masterBatchRecord = response.choices[0].message.content;

    // Update the translation results with the master batch record
    translationData.masterBatchRecord = {
      batchSize: batchSize || 'Commercial scale',
      manufacturingFacility: manufacturingFacility || 'Generic GMP facility',
      record: masterBatchRecord,
      generatedAt: new Date().toISOString(),
    };

    // Save the updated results
    fs.writeFileSync(filePath, JSON.stringify(translationData, null, 2));

    return res.status(200).json({
      success: true,
      translationId,
      batchSize: batchSize || 'Commercial scale',
      manufacturingFacility: manufacturingFacility || 'Generic GMP facility',
      masterBatchRecord,
      downloadUrl: `/api/cmc/preclinical-translator/download/${translationId}`,
    });
  } catch (error) {
    console.error('Error in MBR generation:', error);
    return res.status(500).json({
      error: 'An error occurred while generating the master batch record',
      details: error.message,
    });
  }
});

/**
 * Download translation results
 * GET /api/cmc/preclinical-translator/download/:translationId
 */
router.get('/download/:translationId', (req, res) => {
  try {
    const { translationId } = req.params;
    const format = req.query.format || 'json';

    // Sanitize the translation ID to prevent directory traversal
    const sanitizedId = translationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `preclinical_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    // Read the translation data
    const translationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Handle different formats
    if (format === 'pdf') {
      // In a real implementation, we would convert the data to PDF
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'PDF format not yet implemented' });
    } else if (format === 'docx') {
      // In a real implementation, we would convert the data to DOCX
      // For now, we'll just return the JSON
      return res.status(500).json({ error: 'DOCX format not yet implemented' });
    } else {
      // Return JSON format
      return res.json(translationData);
    }
  } catch (error) {
    console.error('Error in translation download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the translation',
      details: error.message,
    });
  }
});

/**
 * Get processing result for uploaded files
 * GET /api/cmc/preclinical-translator/processing/:uploadId
 */
router.get('/processing/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;

    // Sanitize the upload ID to prevent directory traversal
    const sanitizedId = uploadId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `preclinical_upload_${sanitizedId}.json`);

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

export default router;
