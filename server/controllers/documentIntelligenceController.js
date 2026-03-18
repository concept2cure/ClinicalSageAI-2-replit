/**
 * Document Intelligence Controller
 *
 * This controller handles the processing of uploaded documents to extract
 * structured data using AI-assisted methods.
 */

// Import core Node.js modules
const path = require('path');
const fs = require('fs');
const { promises: fsPromises } = fs;
const os = require('os');
const util = require('util');
const crypto = require('crypto');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);

// Simple console logger
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
};

// Document processing prompt template
const extractionPrompt = `
You are an advanced AI assistant specializing in extracting structured device information from regulatory documents.
Analyze the provided document and extract all relevant fields for FDA 510(k) device submissions.

INSTRUCTIONS:
1. Carefully read the document to identify key device information.
2. Extract specific fields in JSON format.
3. For each field, provide a confidence score (0.0-1.0) indicating certainty.
4. If a field is completely missing or uncertain (confidence < 0.5), you may omit it.

The expected output format is a JSON object with these properties:
{
  "extractedFields": [
    {
      "name": "fieldName",
      "value": "extractedValue",
      "confidence": 0.95,  
      "source": "documentSection" (optional)
    },
    ...
  ]
}

Common fields to extract include:
- deviceName: The name of the medical device
- manufacturer: Company that makes the device
- manufacturerAddress: Full address of the manufacturer
- contactPerson: Primary contact for regulatory matters
- contactEmail: Contact email address
- contactPhone: Contact phone number
- deviceClass: FDA device class (I, II, or III)
- productCode: FDA product classification code
- regulationNumber: 21 CFR reference number
- panel: Medical specialty panel (abbreviated, e.g., "CV" for cardiovascular)
- intendedUse: Brief statement of the device's intended use
- indications: Specific indications for use
- deviceDescription: Technical description of the device
- predicateDeviceName: Name of predicate device(s)
- predicateManufacturer: Manufacturer of predicate device
- predicateK510Number: K-number of predicate device
`;

/**
 * File handling utility functions
 */
const createTempUploadDir = async () => {
  const uploadDir = path.join(os.tmpdir(), 'regulatory_uploads');
  try {
    await fsPromises.mkdir(uploadDir, { recursive: true });
    return uploadDir;
  } catch (err) {
    logger.error('Failed to create upload directory', { error: err.message });
    throw err;
  }
};

const generateUniqueFilename = originalFilename => {
  const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalFilename);
  return `upload-${uniqueSuffix}${ext}`;
};

const isValidFileType = filename => {
  const allowedTypes = ['.pdf', '.docx', '.doc', '.txt'];
  const ext = path.extname(filename).toLowerCase();
  return allowedTypes.includes(ext);
};

/**
 * Custom file upload handler
 */
const handleFileUpload = async req => {
  // Create upload directory
  const uploadDir = await createTempUploadDir();

  // Only parse multipart form data if content type is correct
  if (!req.is('multipart/form-data')) {
    throw new Error('Content type must be multipart/form-data');
  }

  // Setup for file processing
  const filesPromise = new Promise((resolve, reject) => {
    const busboy = require('busboy');
    const bb = busboy({
      headers: req.headers,
      limits: {
        files: 10,
        fileSize: 20 * 1024 * 1024, // 20MB
      },
    });

    const uploadedFiles = [];
    const formFields = {};

    // Handle file upload
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;

      // Check if file type is allowed
      if (!isValidFileType(filename)) {
        reject(
          new Error(
            `Invalid file type for ${filename}. Only PDF, DOCX, DOC, and TXT files are allowed.`
          )
        );
        return;
      }

      const filepath = path.join(uploadDir, generateUniqueFilename(filename));
      const writeStream = fs.createWriteStream(filepath);

      // Save the file
      pipeline(file, writeStream)
        .then(() => {
          uploadedFiles.push({
            originalname: filename,
            encoding,
            mimetype: mimeType,
            path: filepath,
            size: fs.statSync(filepath).size,
          });
        })
        .catch(err => {
          logger.error('File upload error', { error: err.message });
          reject(err);
        });
    });

    // Handle form fields
    bb.on('field', (name, val) => {
      formFields[name] = val;
    });

    // Handle completion
    bb.on('finish', () => {
      resolve({ files: uploadedFiles, fields: formFields });
    });

    // Handle errors
    bb.on('error', err => {
      logger.error('Busboy error', { error: err.message });
      reject(err);
    });

    // Pass request data to busboy
    req.pipe(bb);
  });

  return filesPromise;
};

/**
 * Extract document content based on file type
 */
async function extractDocumentContent(file) {
  const filePath = file.path;
  const fileExt = path.extname(file.originalname).toLowerCase();

  try {
    let content = '';

    // Extract content based on file type
    if (fileExt === '.pdf') {
      content = await extractPdfContent(filePath);
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      content = await extractDocxContent(filePath);
    } else if (fileExt === '.txt') {
      content = await fsPromises.readFile(filePath, 'utf-8');
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    // Format the content
    return `File: ${file.originalname}\nContent:\n${content}`;
  } catch (error) {
    logger.error('Error extracting document content', {
      filePath,
      fileType: fileExt,
      error: error.message,
    });

    return null;
  }
}

// Helper to extract content from PDF files
async function extractPdfContent(filePath) {
  try {
    // Use a simple child process to extract text using pdftotext (if available)
    const { exec } = require('child_process');
    const execPromise = util.promisify(exec);

    try {
      const { stdout } = await execPromise(`pdftotext "${filePath}" -`);
      return stdout;
    } catch (cmdError) {
      // If pdftotext is not available, provide a simpler response
      logger.warn('pdftotext command failed, using fallback', { error: cmdError.message });
      return `[PDF content extraction requires additional tools. PDF metadata extracted: ${path.basename(filePath)}]`;
    }
  } catch (error) {
    logger.error('PDF extraction error', { error: error.message });
    return `[Error extracting PDF content: ${error.message}]`;
  }
}

// Helper to extract content from DOCX files
async function extractDocxContent(filePath) {
  try {
    // Use simple text extraction
    const { exec } = require('child_process');
    const execPromise = util.promisify(exec);

    try {
      // Try using catdoc if available
      const { stdout } = await execPromise(`catdoc "${filePath}"`);
      return stdout;
    } catch (cmdError) {
      // If catdoc is not available, provide a simpler response
      logger.warn('catdoc command failed, using fallback', { error: cmdError.message });
      return `[DOCX content extraction requires additional tools. Document metadata extracted: ${path.basename(filePath)}]`;
    }
  } catch (error) {
    logger.error('DOCX extraction error', { error: error.message });
    return `[Error extracting DOCX content: ${error.message}]`;
  }
}

/**
 * Extract structured data from document content using OpenAI
 */
async function extractStructuredData(content, documentType) {
  try {
    // Check for OpenAI integration
    if (!process.env.OPENAI_API_KEY) {
      const err = new Error('AI_SERVICE_UNAVAILABLE: OpenAI API key is not configured. Document intelligence extraction requires a valid OPENAI_API_KEY.');
      err.code = 'AI_SERVICE_UNAVAILABLE';
      throw err;
    }

    const { getOpenAIClient } = require('../services/openai-client');
    const openai = getOpenAIClient();

    // If content is very large, truncate it (OpenAI has token limits)
    let processedContent = content;
    const maxContentLength = 100000; // About 25k tokens

    if (content.length > maxContentLength) {
      logger.warn('Content too large, truncating', {
        originalSize: content.length,
        truncatedSize: maxContentLength,
      });
      processedContent =
        content.substring(0, maxContentLength) + '\n\n[CONTENT TRUNCATED DUE TO SIZE]';
    }

    // Build messages for OpenAI
    const messages = [
      { role: 'system', content: extractionPrompt },
      {
        role: 'user',
        content: `Document Type: ${documentType}\n\nDocument Content:\n${processedContent}`,
      },
    ];

    // Make API call to OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use the newest model for best extraction results
      messages,
      temperature: 0.1, // Low temperature for more precise extraction
      response_format: { type: 'json_object' }, // Ensure JSON response
      max_tokens: 4000, // Limit response size
    });

    // Extract and parse the response
    const responseContent = response.choices[0].message.content;
    const parsedData = JSON.parse(responseContent);

    logger.info('Structured data extraction complete', {
      fieldsExtracted: parsedData.extractedFields?.length || 0,
    });

    return parsedData;
  } catch (error) {
    logger.error('Error in data extraction', { error: error.message, stack: error.stack });
    throw error;
  }
}

// mockExtractedData removed — extraction now requires a working AI service.

/**
 * Clean up temporary files after processing
 */
async function cleanupFiles(files) {
  if (!files || files.length === 0) return;

  for (const file of files) {
    try {
      if (file.path && fs.existsSync(file.path)) {
        await fsPromises.unlink(file.path);
        logger.info('Deleted temporary file', { path: file.path });
      }
    } catch (err) {
      logger.warn('Error deleting temporary file', { path: file.path, error: err.message });
    }
  }
}

/**
 * Process uploaded documents and extract structured data
 */
const processDocuments = async (req, res) => {
  try {
    // Process file uploads using custom handler
    const { files, fields } = await handleFileUpload(req);

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get extraction parameters
    const documentType = fields.documentType || 'technical';
    const confidenceThreshold = parseFloat(fields.confidenceThreshold || '0.7');

    // Process each document
    logger.info('Processing documents', {
      count: files.length,
      documentType,
      confidenceThreshold,
    });

    // Process each file in sequence to avoid memory issues
    const documentContents = [];
    for (const file of files) {
      const content = await extractDocumentContent(file);
      if (content) {
        documentContents.push(content);
      }
    }

    if (documentContents.length === 0) {
      return res
        .status(400)
        .json({ error: 'Could not extract content from any of the uploaded files' });
    }

    // Combine all document contents
    const combinedContent = documentContents.join('\n\n====== NEW DOCUMENT ======\n\n');

    // Extract structured data
    const extractedData = await extractStructuredData(combinedContent, documentType);

    // Filter results based on confidence threshold
    const filteredFields = extractedData.extractedFields.filter(
      field => field.confidence >= confidenceThreshold
    );

    // Clean up temporary files after processing
    await cleanupFiles(files);

    // Return the extracted data
    return res.status(200).json({
      success: true,
      documentType,
      confidenceThreshold,
      extractedFields: filteredFields,
      totalFieldsExtracted: extractedData.extractedFields.length,
      fieldsAboveThreshold: filteredFields.length,
    });
  } catch (error) {
    logger.error('Document processing error', { error: error.message, stack: error.stack });

    const statusCode = error.code === 'AI_SERVICE_UNAVAILABLE' ? 503 : 500;
    return res.status(statusCode).json({
      error: statusCode === 503 ? 'AI service unavailable' : 'Error processing documents',
      message: error.message,
      code: error.code || 'PROCESSING_ERROR',
    });
  }
};

module.exports = {
  processDocuments,
  extractStructuredData,
};
