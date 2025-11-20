/**
 * Real-Time Audit Risk Monitor
 *
 * This module provides functionality to monitor CMC documents and SOPs for compliance
 * risks, detect outdated or contradictory information, and generate heatmaps and
 * simulated inspector questions.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { documentAuditSchema } from './types.js';
import { rateLimit } from 'express-rate-limit';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

// Rate limiter for audit monitoring
const auditMonitoringLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute (more restrictive due to complexity)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many audit monitoring requests, please try again after a minute',
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for document files
  fileFilter: function (req, file, cb) {
    // Accept document formats
    if (
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/rtf' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, Excel, Plain Text, and RTF files are allowed'));
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
 * Analyze document for audit risks
 * POST /api/cmc/audit-risk-monitor/analyze
 */
router.post('/analyze', checkForOpenAIKey, auditMonitoringLimiter, async (req, res) => {
  try {
    // Validate request body against schema
    const validationResult = documentAuditSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { documentId, documentType, content, relatedDocuments, lastUpdated, author, version } =
      req.body;

    // Generate a unique audit ID
    const auditId = uuidv4();

    // Use OpenAI to analyze the document for risks
    const messages = [
      {
        role: 'system',
        content: `You are an expert regulatory compliance auditor specializing in GMP and CMC documentation.
        You need to analyze ${documentType} documents for potential audit risks and compliance issues.
        
        For your analysis, focus on:
        1. Outdated or contradictory information
        2. Missing links between validation studies and specifications
        3. Gaps in document lineage (e.g., missing change logs)
        4. Potential FDA 483 or other health authority findings
        5. Scientific or technical inconsistencies
        
        Based on common findings from FDA, EMA, PMDA, and other health authority inspections,
        provide a detailed risk analysis with actionable recommendations.`,
      },
      {
        role: 'user',
        content: `Please analyze the following ${documentType} document for audit risks:
        
        Document ID: ${documentId}
        Version: ${version || 'Not specified'}
        Last Updated: ${lastUpdated || 'Not specified'}
        Author: ${author || 'Not specified'}
        
        ${content}
        
        ${
          relatedDocuments && relatedDocuments.length > 0
            ? `Related Documents: ${relatedDocuments.join(', ')}`
            : 'No related documents specified.'
        }
        
        Please provide a comprehensive audit risk analysis with specific findings and recommendations.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 3000,
    });

    // Get the risk analysis
    const riskAnalysis = response.choices[0].message.content;

    // Generate specific findings based on FDA 483 patterns
    const findingsPrompt = `Based on your risk analysis of this ${documentType} document:
    ${riskAnalysis}
    
    Please extract specific findings in the format of a regulatory inspection report (like FDA Form 483).
    For each finding, provide:
    1. A clear observation statement
    2. Reference to the specific section/content in the document
    3. The applicable regulatory requirement that may be violated
    4. Severity rating (Critical, Major, Minor)
    
    Present these findings in a structured, itemized format suitable for a regulatory inspection report.`;

    const findingsResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory inspector. Generate formal inspection findings based on document analysis.',
        },
        { role: 'user', content: findingsPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Get the inspection findings
    const inspectionFindings = findingsResponse.choices[0].message.content;

    // Generate simulated inspector questions
    const questionsPrompt = `Based on your risk analysis and findings for this ${documentType} document:
    ${riskAnalysis}
    
    ${inspectionFindings}
    
    Please generate a list of likely questions that a regulatory inspector might ask about this document.
    For each question:
    1. Phrase it as the inspector would ask it
    2. Indicate the context in which it might be asked
    3. Note the underlying concern or focus area
    
    Format as a Q&A preparation guide for a regulatory inspection.`;

    const questionsResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert preparing a team for inspection. Generate likely inspector questions.',
        },
        { role: 'user', content: questionsPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    // Get the inspector questions
    const inspectorQuestions = questionsResponse.choices[0].message.content;

    // Generate a remediation plan
    const remediationPrompt = `Based on the analysis and findings for this ${documentType} document:
    ${riskAnalysis}
    
    ${inspectionFindings}
    
    Please generate a prioritized remediation plan that addresses the identified issues.
    For each remediation item:
    1. Clear description of the action required
    2. Priority level (High/Medium/Low)
    3. Suggested timeframe for completion
    4. Resources likely needed
    
    Format as an actionable remediation plan that could be implemented by a regulatory affairs team.`;

    const remediationResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory compliance consultant. Generate a practical remediation plan.',
        },
        { role: 'user', content: remediationPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    // Get the remediation plan
    const remediationPlan = remediationResponse.choices[0].message.content;

    // Structure the results
    const auditResult = {
      auditId,
      documentId,
      documentType,
      documentMetadata: {
        lastUpdated,
        author,
        version,
      },
      riskAnalysis,
      inspectionFindings,
      inspectorQuestions,
      remediationPlan,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `audit_${auditId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(auditResult, null, 2));

    return res.status(200).json({
      success: true,
      auditId,
      documentId,
      documentType,
      riskSummary: {
        analysis: riskAnalysis.substring(0, 300) + '...',
        findings: inspectionFindings.substring(0, 300) + '...',
        questions: inspectorQuestions.substring(0, 300) + '...',
        remediation: remediationPlan.substring(0, 300) + '...',
      },
      downloadUrl: `/api/cmc/audit-risk-monitor/download/${auditId}`,
    });
  } catch (error) {
    console.error('Error in document audit:', error);
    return res.status(500).json({
      error: 'An error occurred while auditing the document',
      details: error.message,
    });
  }
});

/**
 * Analyze multiple documents for cross-document risks
 * POST /api/cmc/audit-risk-monitor/analyze-collection
 */
router.post('/analyze-collection', checkForOpenAIKey, auditMonitoringLimiter, async (req, res) => {
  try {
    const { documents, productName, submissionType } = req.body;

    // Basic validation
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'At least one document is required' });
    }

    // Generate a unique collection audit ID
    const collectionAuditId = uuidv4();

    // Extract document IDs and types for reference
    const documentSummaries = documents.map(doc => ({
      id: doc.documentId,
      type: doc.documentType,
      title: doc.title || doc.documentType,
    }));

    // Use OpenAI to analyze the collection for cross-document risks
    const messages = [
      {
        role: 'system',
        content: `You are an expert regulatory compliance auditor specializing in cross-document analysis for GMP and CMC documentation.
        You need to analyze a collection of documents for potential cross-document risks and consistency issues.
        
        For your analysis, focus on:
        1. Inconsistencies between related documents
        2. Missing cross-references or linkages
        3. Traceability gaps between specifications, methods, and validation
        4. Document chain integrity issues
        5. Potential health authority inspection focal points
        
        Based on common findings from FDA, EMA, PMDA, and other health authority inspections,
        provide a detailed cross-document risk analysis with actionable recommendations.`,
      },
      {
        role: 'user',
        content: `Please analyze the following collection of documents for cross-document risks:
        
        Product Name: ${productName || 'Not specified'}
        Submission Type: ${submissionType || 'Not specified'}
        
        Documents:
        ${documentSummaries.map(doc => `- ${doc.id}: ${doc.title} (${doc.type})`).join('\n')}
        
        Document Contents:
        ${documents.map(doc => `--- Document: ${doc.documentId} (${doc.documentType}) ---\n${doc.content.substring(0, 2000)}...\n`).join('\n\n')}
        
        Please provide a comprehensive cross-document risk analysis with specific findings and recommendations.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.3,
      max_tokens: 3000,
    });

    // Get the cross-document risk analysis
    const crossDocumentAnalysis = response.choices[0].message.content;

    // Generate a consistency matrix
    const consistencyPrompt = `Based on your cross-document analysis:
    ${crossDocumentAnalysis}
    
    Please generate a consistency matrix for these documents that shows:
    1. How each document relates to others
    2. Consistency scores between document pairs (High/Medium/Low)
    3. Key inconsistencies or gaps identified
    
    Format as a structured matrix or table showing document relationship strengths and issues.`;

    const consistencyResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory documentation expert. Generate a consistency matrix for document relationships.',
        },
        { role: 'user', content: consistencyPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Get the consistency matrix
    const consistencyMatrix = consistencyResponse.choices[0].message.content;

    // Generate a submission readiness assessment
    const readinessPrompt = `Based on your cross-document analysis and consistency matrix:
    ${crossDocumentAnalysis}
    
    ${consistencyMatrix}
    
    Please provide a submission readiness assessment that evaluates:
    1. Overall submission readiness score (0-100%)
    2. Critical gaps that must be addressed before submission
    3. Key risk areas for regulatory review
    4. Prioritized areas for improvement
    
    Format as a formal submission readiness assessment report section.`;

    const readinessResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory submission expert. Generate a submission readiness assessment.',
        },
        { role: 'user', content: readinessPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    // Get the readiness assessment
    const readinessAssessment = readinessResponse.choices[0].message.content;

    // Structure the results
    const collectionAuditResult = {
      collectionAuditId,
      productName: productName || 'Not specified',
      submissionType: submissionType || 'Not specified',
      documentSummaries,
      crossDocumentAnalysis,
      consistencyMatrix,
      readinessAssessment,
      generatedAt: new Date().toISOString(),
    };

    // Save the results to a JSON file for future reference
    const filePath = path.join(outputDir, `collection_audit_${collectionAuditId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(collectionAuditResult, null, 2));

    return res.status(200).json({
      success: true,
      collectionAuditId,
      productName: productName || 'Not specified',
      submissionType: submissionType || 'Not specified',
      documentCount: documents.length,
      analysisSummary: {
        crossDocumentAnalysis: crossDocumentAnalysis.substring(0, 300) + '...',
        consistencyMatrix: consistencyMatrix.substring(0, 300) + '...',
        readinessAssessment: readinessAssessment.substring(0, 300) + '...',
      },
      downloadUrl: `/api/cmc/audit-risk-monitor/download-collection/${collectionAuditId}`,
    });
  } catch (error) {
    console.error('Error in collection audit:', error);
    return res.status(500).json({
      error: 'An error occurred while auditing the document collection',
      details: error.message,
    });
  }
});

/**
 * Generate simulated inspection questions for a specific domain
 * POST /api/cmc/audit-risk-monitor/inspection-simulation
 */
router.post(
  '/inspection-simulation',
  checkForOpenAIKey,
  auditMonitoringLimiter,
  async (req, res) => {
    try {
      const { auditId, inspectionType, healthAuthority, inspectionFocus } = req.body;

      // Basic validation
      if (!auditId && !inspectionType) {
        return res.status(400).json({ error: 'Either audit ID or inspection type is required' });
      }

      let auditData = null;

      // If audit ID is provided, load the existing audit data
      if (auditId) {
        const filePath = path.join(outputDir, `audit_${auditId}.json`);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Audit not found' });
        }

        auditData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }

      // Prepare context for the simulation
      const simulationContext = auditData
        ? `Based on the previous audit of a ${auditData.documentType} document:\n${auditData.riskAnalysis}\n\n${auditData.inspectionFindings}`
        : `For a general ${inspectionType} inspection`;

      // Use OpenAI to generate simulated inspection questions
      const simulationPrompt = `${simulationContext}
    
    Please generate a comprehensive set of inspection questions that would likely be asked by ${healthAuthority || 'a regulatory inspector'} during ${inspectionType || 'an inspection'} ${inspectionFocus ? `focused on ${inspectionFocus}` : ''}.
    
    For each question:
    1. Provide the specific question as an inspector would phrase it
    2. Include follow-up questions that might be asked based on common responses
    3. Note the regulatory basis or concern behind the question
    4. Suggest an ideal response approach
    
    Format as a detailed Q&A preparation guide that regulatory affairs professionals can use to prepare for an inspection.`;

      const simulationResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert regulatory affairs consultant who prepares companies for ${healthAuthority || 'regulatory'} inspections.`,
          },
          { role: 'user', content: simulationPrompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      // Get the simulated inspection questions
      const inspectionQuestions = simulationResponse.choices[0].message.content;

      // Generate best practices for the inspection
      const bestPracticesPrompt = `For a ${healthAuthority || 'regulatory'} inspection ${inspectionFocus ? `focused on ${inspectionFocus}` : ''}:
    
    Please provide best practices for:
    1. Document organization and presentation
    2. Responding to difficult questions
    3. Handling unexpected findings
    4. Managing the flow of the inspection
    5. Post-inspection response preparation
    
    Format as practical guidance for inspection preparation.`;

      const bestPracticesResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an experienced regulatory affairs expert who has managed many successful inspections.',
          },
          { role: 'user', content: bestPracticesPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      // Get the best practices
      const inspectionBestPractices = bestPracticesResponse.choices[0].message.content;

      // Generate a unique simulation ID
      const simulationId = uuidv4();

      // Structure the results
      const simulationResult = {
        simulationId,
        auditId: auditId || null,
        inspectionType:
          inspectionType || (auditData ? `${auditData.documentType} Review` : 'General Inspection'),
        healthAuthority: healthAuthority || 'General Regulatory',
        inspectionFocus: inspectionFocus || 'Comprehensive',
        inspectionQuestions,
        inspectionBestPractices,
        generatedAt: new Date().toISOString(),
      };

      // Save the results to a JSON file for future reference
      const filePath = path.join(outputDir, `inspection_${simulationId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(simulationResult, null, 2));

      return res.status(200).json({
        success: true,
        simulationId,
        inspectionType: simulationResult.inspectionType,
        healthAuthority: simulationResult.healthAuthority,
        inspectionFocus: simulationResult.inspectionFocus,
        questionCount: inspectionQuestions.split('\n\n').length, // Approximate count
        downloadUrl: `/api/cmc/audit-risk-monitor/download-simulation/${simulationId}`,
      });
    } catch (error) {
      console.error('Error in inspection simulation:', error);
      return res.status(500).json({
        error: 'An error occurred while generating inspection simulation',
        details: error.message,
      });
    }
  }
);

/**
 * Upload document for audit risk analysis
 * POST /api/cmc/audit-risk-monitor/upload
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

    // Use OpenAI to extract document metadata
    const extractionPrompt = `This is a regulatory document. Please analyze it and extract:
    
    1. Document type (e.g., SOP, specification, validation protocol, etc.)
    2. Document ID or number (if present in the filename)
    3. Version information (if present in the filename)
    4. Last update date (if present in the filename)
    
    File name: ${file.originalname}`;

    const extractionResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a document metadata extraction expert. Extract document type, ID, version, and date information.',
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
    const resultFilePath = path.join(outputDir, `audit_upload_${uploadId}.json`);
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
      processingUrl: `/api/cmc/audit-risk-monitor/processing/${uploadId}`,
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
 * Download audit results
 * GET /api/cmc/audit-risk-monitor/download/:auditId
 */
router.get('/download/:auditId', (req, res) => {
  try {
    const { auditId } = req.params;

    // Sanitize the audit ID to prevent directory traversal
    const sanitizedId = auditId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `audit_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    // Read the audit data
    const auditData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Return the audit data
    return res.json(auditData);
  } catch (error) {
    console.error('Error in audit download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the audit',
      details: error.message,
    });
  }
});

/**
 * Download collection audit results
 * GET /api/cmc/audit-risk-monitor/download-collection/:collectionAuditId
 */
router.get('/download-collection/:collectionAuditId', (req, res) => {
  try {
    const { collectionAuditId } = req.params;

    // Sanitize the collection audit ID to prevent directory traversal
    const sanitizedId = collectionAuditId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `collection_audit_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Collection audit not found' });
    }

    // Read the collection audit data
    const collectionAuditData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Return the collection audit data
    return res.json(collectionAuditData);
  } catch (error) {
    console.error('Error in collection audit download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the collection audit',
      details: error.message,
    });
  }
});

/**
 * Download inspection simulation results
 * GET /api/cmc/audit-risk-monitor/download-simulation/:simulationId
 */
router.get('/download-simulation/:simulationId', (req, res) => {
  try {
    const { simulationId } = req.params;

    // Sanitize the simulation ID to prevent directory traversal
    const sanitizedId = simulationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `inspection_${sanitizedId}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Inspection simulation not found' });
    }

    // Read the simulation data
    const simulationData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Return the simulation data
    return res.json(simulationData);
  } catch (error) {
    console.error('Error in simulation download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the inspection simulation',
      details: error.message,
    });
  }
});

/**
 * Get processing result for uploaded document
 * GET /api/cmc/audit-risk-monitor/processing/:uploadId
 */
router.get('/processing/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;

    // Sanitize the upload ID to prevent directory traversal
    const sanitizedId = uploadId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `audit_upload_${sanitizedId}.json`);

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
 * Get common inspection findings by health authority
 * GET /api/cmc/audit-risk-monitor/inspection-findings
 */
router.get('/inspection-findings', (req, res) => {
  const healthAuthority = req.query.authority;

  const commonFindings = {
    fda: [
      {
        id: 'fda1',
        observation:
          'Failure to thoroughly review any unexplained discrepancy whether or not the batch has already been distributed',
        regulation: '21 CFR 211.192',
        category: 'Laboratory Controls',
        severity: 'Critical',
      },
      {
        id: 'fda2',
        observation:
          'Failure to establish adequate written procedures for production and process controls designed to assure that the drug products have the identity, strength, quality, and purity they purport or are represented to possess',
        regulation: '21 CFR 211.100(a)',
        category: 'Production Controls',
        severity: 'Major',
      },
      {
        id: 'fda3',
        observation:
          'Laboratory controls do not include the establishment of scientifically sound and appropriate test procedures designed to assure that components, drug product containers, closures, in-process materials, labeling, and drug products conform to appropriate standards of identity, strength, quality, and purity',
        regulation: '21 CFR 211.160(b)',
        category: 'Laboratory Controls',
        severity: 'Critical',
      },
      {
        id: 'fda4',
        observation:
          'Failure to establish and follow appropriate written procedures designed to prevent microbiological contamination of drug products purporting to be sterile',
        regulation: '21 CFR 211.113(b)',
        category: 'Sterility Assurance',
        severity: 'Critical',
      },
      {
        id: 'fda5',
        observation:
          'Written records of investigations into unexplained discrepancies do not include the conclusions and follow-up',
        regulation: '21 CFR 211.192',
        category: 'Documentation',
        severity: 'Major',
      },
    ],
    ema: [
      {
        id: 'ema1',
        observation:
          'Failure to ensure that the Quality Management System effectively assures that medicinal products with the required quality are consistently produced',
        regulation: 'EU GMP Chapter 1.4',
        category: 'Quality Management',
        severity: 'Critical',
      },
      {
        id: 'ema2',
        observation:
          'Inadequate validation of critical process steps and significant changes to the manufacturing process',
        regulation: 'EU GMP Annex 15',
        category: 'Validation',
        severity: 'Major',
      },
      {
        id: 'ema3',
        observation: 'Insufficient data integrity controls for computerized systems',
        regulation: 'EU GMP Annex 11',
        category: 'Data Integrity',
        severity: 'Critical',
      },
      {
        id: 'ema4',
        observation: 'Inadequate deviation management system with insufficient root cause analysis',
        regulation: 'EU GMP Chapter 1.4 (xiv)',
        category: 'Quality Management',
        severity: 'Major',
      },
      {
        id: 'ema5',
        observation: 'Insufficient oversight of outsourced activities and material suppliers',
        regulation: 'EU GMP Chapter 7',
        category: 'Outsourced Activities',
        severity: 'Major',
      },
    ],
    pmda: [
      {
        id: 'pmda1',
        observation: 'Inadequate contamination control strategy in manufacturing areas',
        regulation: 'MHLW Ministerial Ordinance No. 179, Article 24',
        category: 'Contamination Control',
        severity: 'Critical',
      },
      {
        id: 'pmda2',
        observation: 'Insufficient validation of analytical methods',
        regulation: 'MHLW Ministerial Ordinance No. 179, Article 11',
        category: 'Laboratory Controls',
        severity: 'Major',
      },
      {
        id: 'pmda3',
        observation: 'Inadequate change control procedures for manufacturing process changes',
        regulation: 'MHLW Ministerial Ordinance No. 179, Article 14',
        category: 'Change Management',
        severity: 'Major',
      },
      {
        id: 'pmda4',
        observation: 'Insufficient documentation of personnel training',
        regulation: 'MHLW Ministerial Ordinance No. 179, Article 19',
        category: 'Personnel',
        severity: 'Minor',
      },
      {
        id: 'pmda5',
        observation: 'Inadequate control of starting materials',
        regulation: 'MHLW Ministerial Ordinance No. 179, Article 10',
        category: 'Materials Management',
        severity: 'Major',
      },
    ],
  };

  if (healthAuthority && commonFindings[healthAuthority.toLowerCase()]) {
    return res.status(200).json({ findings: commonFindings[healthAuthority.toLowerCase()] });
  } else {
    return res.status(200).json({
      findings: {
        fda: commonFindings.fda,
        ema: commonFindings.ema,
        pmda: commonFindings.pmda,
      },
    });
  }
});

export default router;
