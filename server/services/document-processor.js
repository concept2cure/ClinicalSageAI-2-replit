/**
 * Document Processor Service
 *
 * This service provides advanced document processing capabilities for the TrialSage platform,
 * including PDF extraction, text analysis, and document transformation.
 * It integrates with AI services for intelligent document processing.
 */

import fs from 'fs/promises';
import path from 'path';
import { getOpenAIClient } from './openai-client';
import { db } from '../db.js';
import { hashDocument } from './blockchain.js';

// Initialize OpenAI client
const openai = getOpenAIClient();

// Document types
export const DOCUMENT_TYPES = {
  CSR: 'clinical_study_report',
  PROTOCOL: 'clinical_protocol',
  IB: 'investigators_brochure',
  IND: 'ind_application',
  NDA: 'new_drug_application',
  BLA: 'biologics_license_application',
  CTA: 'clinical_trial_application',
  SOP: 'standard_operating_procedure',
  REGULATORY_CORRESPONDENCE: 'regulatory_correspondence',
  ICF: 'informed_consent_form',
  SAP: 'statistical_analysis_plan',
  CMC: 'chemistry_manufacturing_controls',
  MODULE_2: 'ctd_module_2',
  MODULE_3: 'ctd_module_3',
  MODULE_4: 'ctd_module_4',
  MODULE_5: 'ctd_module_5',
};

// Processing results storage
const processingResults = new Map();

/**
 * Extract text from PDF document
 * @param {string} filePath - Path to PDF file
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Extracted text and metadata
 */
export async function extractTextFromPDF(filePath, options = {}) {
  try {
    console.log(`[DocProcessor] Extracting text from PDF: ${filePath}`);

    // Check if file exists
    await fs.access(filePath);

    // In production, this would use a library like pdfjs or PyMuPDF
    // For this implementation, we're using a simplified mock

    // Get file stats
    const stats = await fs.stat(filePath);

    // Read a portion of the file to identify it
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    await fileHandle.read(buffer, 0, 1024, 0);
    await fileHandle.close();

    // Check if it's a PDF
    const isPDF = buffer.toString('utf8', 0, 5) === '%PDF-';

    if (!isPDF) {
      throw new Error('File is not a valid PDF');
    }

    console.log(`[DocProcessor] PDF file size: ${stats.size} bytes`);

    // Simulate text extraction
    const pages = Math.ceil(stats.size / 5000); // Approximate page count

    // Generate result ID
    const resultId = hashDocument(`${filePath}-${Date.now()}`);

    // Create extraction result
    const result = {
      id: resultId,
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      pageCount: pages,
      extractionDate: new Date().toISOString(),
      metadata: {
        title: options.title || path.basename(filePath, '.pdf'),
        author: options.author || 'Unknown',
        creationDate: stats.birthtime.toISOString(),
        modificationDate: stats.mtime.toISOString(),
        isPDF: true,
      },
      text: `Simulated extracted text from ${path.basename(filePath)}. This file has ${pages} pages.`,
      sections: [],
      status: 'completed',
    };

    // Store result
    processingResults.set(resultId, result);

    // Return result
    return {
      resultId,
      fileName: result.fileName,
      pageCount: result.pageCount,
      metadata: result.metadata,
      status: result.status,
    };
  } catch (error) {
    console.error(`[DocProcessor] Error extracting text from PDF: ${filePath}`, error);
    throw error;
  }
}

/**
 * Extract structured data from document
 * @param {string} resultId - Processing result ID
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured data
 */
export async function extractStructuredData(resultId, options = {}) {
  try {
    console.log(`[DocProcessor] Extracting structured data for result: ${resultId}`);

    // Get processing result
    const result = processingResults.get(resultId);

    if (!result) {
      throw new Error(`Processing result not found: ${resultId}`);
    }

    // Determine document type and schema
    const documentType = options.documentType || detectDocumentType(result);
    console.log(`[DocProcessor] Detected document type: ${documentType}`);

    // Extract structured data based on document type
    let structuredData;

    switch (documentType) {
      case DOCUMENT_TYPES.CSR:
        structuredData = await extractCSRData(result, options);
        break;
      case DOCUMENT_TYPES.PROTOCOL:
        structuredData = await extractProtocolData(result, options);
        break;
      case DOCUMENT_TYPES.IB:
        structuredData = await extractIBData(result, options);
        break;
      case DOCUMENT_TYPES.CMC:
        structuredData = await extractCMCData(result, options);
        break;
      default:
        structuredData = await extractGenericData(result, options);
    }

    // Update result with structured data
    result.structuredData = structuredData;
    result.documentType = documentType;

    // Store updated result
    processingResults.set(resultId, result);

    return {
      resultId,
      documentType,
      structuredData,
      status: 'completed',
    };
  } catch (error) {
    console.error(`[DocProcessor] Error extracting structured data: ${resultId}`, error);
    throw error;
  }
}

/**
 * Detect document type from content
 * @param {Object} result - Processing result
 * @returns {string} - Document type
 */
function detectDocumentType(result) {
  // In production, this would use ML or pattern matching
  // For now, we'll simulate with simple heuristics

  const text = result.text.toLowerCase();
  const fileName = result.fileName.toLowerCase();

  if (text.includes('clinical study report') || fileName.includes('csr')) {
    return DOCUMENT_TYPES.CSR;
  } else if (text.includes('protocol') || fileName.includes('protocol')) {
    return DOCUMENT_TYPES.PROTOCOL;
  } else if (
    (text.includes('investigator') && text.includes('brochure')) ||
    fileName.includes('ib')
  ) {
    return DOCUMENT_TYPES.IB;
  } else if (
    (text.includes('chemistry') && text.includes('manufacturing')) ||
    fileName.includes('cmc')
  ) {
    return DOCUMENT_TYPES.CMC;
  } else if (text.includes('module 2') || fileName.includes('m2')) {
    return DOCUMENT_TYPES.MODULE_2;
  } else if (text.includes('module 3') || fileName.includes('m3')) {
    return DOCUMENT_TYPES.MODULE_3;
  } else if (text.includes('module 4') || fileName.includes('m4')) {
    return DOCUMENT_TYPES.MODULE_4;
  } else if (text.includes('module 5') || fileName.includes('m5')) {
    return DOCUMENT_TYPES.MODULE_5;
  }

  // Default
  return 'unknown';
}

/**
 * Extract data from Clinical Study Report
 * @param {Object} result - Processing result
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured CSR data
 */
async function extractCSRData(result, options) {
  try {
    // Define extraction fields
    const extractionFields = [
      'study_title',
      'protocol_id',
      'sponsor',
      'investigational_product',
      'study_phase',
      'study_design',
      'study_population',
      'efficacy_results',
      'safety_results',
      'conclusions',
    ];

    // Use AI to extract structured data
    const systemPrompt =
      "You're an AI specialized in extracting information from Clinical Study Reports (CSRs). " +
      'Extract key information accurately and structure it according to the requested fields.';

    const prompt = `
      Extract the following fields from this Clinical Study Report:
      ${extractionFields.join(', ')}
      
      Text:
      ${result.text.substring(0, 8000)}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Parse extraction result
    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Add document type and processing metadata
    return {
      document_type: DOCUMENT_TYPES.CSR,
      extraction_date: new Date().toISOString(),
      ...extractedData,
    };
  } catch (error) {
    console.error('[DocProcessor] Error extracting CSR data:', error);

    // Return basic data if extraction fails
    return {
      document_type: DOCUMENT_TYPES.CSR,
      extraction_date: new Date().toISOString(),
      extraction_error: error.message,
      study_title: result.metadata.title,
      error: true,
    };
  }
}

/**
 * Extract data from Clinical Protocol
 * @param {Object} result - Processing result
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured Protocol data
 */
async function extractProtocolData(result, options) {
  try {
    // Define extraction fields
    const extractionFields = [
      'protocol_title',
      'protocol_id',
      'sponsor',
      'phase',
      'study_design',
      'objectives',
      'endpoints',
      'inclusion_criteria',
      'exclusion_criteria',
      'investigational_product',
      'dosing_regimen',
      'study_procedures',
      'statistical_methods',
    ];

    // Use AI to extract structured data
    const systemPrompt =
      "You're an AI specialized in extracting information from Clinical Protocols. " +
      'Extract key information accurately and structure it according to the requested fields.';

    const prompt = `
      Extract the following fields from this Clinical Protocol:
      ${extractionFields.join(', ')}
      
      Text:
      ${result.text.substring(0, 8000)}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Parse extraction result
    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Add document type and processing metadata
    return {
      document_type: DOCUMENT_TYPES.PROTOCOL,
      extraction_date: new Date().toISOString(),
      ...extractedData,
    };
  } catch (error) {
    console.error('[DocProcessor] Error extracting Protocol data:', error);

    // Return basic data if extraction fails
    return {
      document_type: DOCUMENT_TYPES.PROTOCOL,
      extraction_date: new Date().toISOString(),
      extraction_error: error.message,
      protocol_title: result.metadata.title,
      error: true,
    };
  }
}

/**
 * Extract data from Investigator's Brochure
 * @param {Object} result - Processing result
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured IB data
 */
async function extractIBData(result, options) {
  try {
    // Define extraction fields
    const extractionFields = [
      'document_title',
      'product_name',
      'sponsor',
      'edition_number',
      'date',
      'mechanism_of_action',
      'pharmacology',
      'toxicology',
      'clinical_experience',
      'risk_benefit_assessment',
    ];

    // Use AI to extract structured data
    const systemPrompt =
      "You're an AI specialized in extracting information from Investigator's Brochures (IBs). " +
      'Extract key information accurately and structure it according to the requested fields.';

    const prompt = `
      Extract the following fields from this Investigator's Brochure:
      ${extractionFields.join(', ')}
      
      Text:
      ${result.text.substring(0, 8000)}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Parse extraction result
    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Add document type and processing metadata
    return {
      document_type: DOCUMENT_TYPES.IB,
      extraction_date: new Date().toISOString(),
      ...extractedData,
    };
  } catch (error) {
    console.error('[DocProcessor] Error extracting IB data:', error);

    // Return basic data if extraction fails
    return {
      document_type: DOCUMENT_TYPES.IB,
      extraction_date: new Date().toISOString(),
      extraction_error: error.message,
      document_title: result.metadata.title,
      error: true,
    };
  }
}

/**
 * Extract data from CMC document
 * @param {Object} result - Processing result
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured CMC data
 */
async function extractCMCData(result, options) {
  try {
    // Define extraction fields
    const extractionFields = [
      'document_title',
      'product_name',
      'manufacturer',
      'manufacturing_process',
      'specifications',
      'analytical_methods',
      'stability_data',
      'container_closure',
      'formulation',
    ];

    // Use AI to extract structured data
    const systemPrompt =
      "You're an AI specialized in extracting information from Chemistry, Manufacturing, and Controls (CMC) documents. " +
      'Extract key information accurately and structure it according to the requested fields.';

    const prompt = `
      Extract the following fields from this CMC document:
      ${extractionFields.join(', ')}
      
      Text:
      ${result.text.substring(0, 8000)}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Parse extraction result
    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Add document type and processing metadata
    return {
      document_type: DOCUMENT_TYPES.CMC,
      extraction_date: new Date().toISOString(),
      ...extractedData,
    };
  } catch (error) {
    console.error('[DocProcessor] Error extracting CMC data:', error);

    // Return basic data if extraction fails
    return {
      document_type: DOCUMENT_TYPES.CMC,
      extraction_date: new Date().toISOString(),
      extraction_error: error.message,
      document_title: result.metadata.title,
      error: true,
    };
  }
}

/**
 * Extract generic data from document
 * @param {Object} result - Processing result
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} - Structured generic data
 */
async function extractGenericData(result, options) {
  try {
    // Define extraction fields
    const extractionFields = options.fields || [
      'document_title',
      'author',
      'date',
      'summary',
      'key_points',
    ];

    // Use AI to extract structured data
    const systemPrompt =
      "You're an AI specialized in extracting information from regulatory documents. " +
      'Extract key information accurately and structure it according to the requested fields.';

    const prompt = `
      Extract the following fields from this document:
      ${extractionFields.join(', ')}
      
      Text:
      ${result.text.substring(0, 8000)}
      
      Return the extracted data as a JSON object with the fields as keys.
      If a field is not found, set its value to null.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Parse extraction result
    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Add document type and processing metadata
    return {
      document_type: 'generic',
      extraction_date: new Date().toISOString(),
      ...extractedData,
    };
  } catch (error) {
    console.error('[DocProcessor] Error extracting generic data:', error);

    // Return basic data if extraction fails
    return {
      document_type: 'generic',
      extraction_date: new Date().toISOString(),
      extraction_error: error.message,
      document_title: result.metadata.title,
      error: true,
    };
  }
}

/**
 * Generate document from template
 * @param {string} templateId - Template ID
 * @param {Object} data - Data to populate template
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Generated document
 */
export async function generateDocument(templateId, data, options = {}) {
  try {
    console.log(`[DocProcessor] Generating document from template: ${templateId}`);

    // In production, this would use a template engine
    // For now, we'll simulate with a simple implementation

    // Get template from database
    const templateQuery = await db.query('SELECT * FROM document_templates WHERE id = $1', [
      templateId,
    ]);

    if (templateQuery.rows.length === 0) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const template = templateQuery.rows[0];

    // Generate document ID
    const documentId = hashDocument(`${templateId}-${Date.now()}`);

    // Create document metadata
    const document = {
      id: documentId,
      templateId,
      name: options.name || `${template.name} - Generated`,
      type: template.type,
      format: options.format || 'docx',
      createdDate: new Date().toISOString(),
      creator: options.userId,
      status: 'generated',
      size: 0,
      path: `generated_documents/${documentId}.${options.format || 'docx'}`,
    };

    // Store document metadata in database
    await db.query(
      `INSERT INTO documents
      (id, template_id, name, type, format, created_date, creator, status, size, path)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        document.id,
        document.templateId,
        document.name,
        document.type,
        document.format,
        document.createdDate,
        document.creator,
        document.status,
        document.size,
        document.path,
      ]
    );

    // In a real implementation, we would generate the actual document file here

    // Return document metadata
    return document;
  } catch (error) {
    console.error(`[DocProcessor] Error generating document from template: ${templateId}`, error);
    throw error;
  }
}

/**
 * Convert document to different format
 * @param {string} documentId - Document ID
 * @param {string} targetFormat - Target format
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} - Converted document
 */
export async function convertDocument(documentId, targetFormat, options = {}) {
  try {
    console.log(`[DocProcessor] Converting document ${documentId} to ${targetFormat}`);

    // Get document from database
    const documentQuery = await db.query('SELECT * FROM documents WHERE id = $1', [documentId]);

    if (documentQuery.rows.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const document = documentQuery.rows[0];

    // Check if conversion is needed
    if (document.format === targetFormat) {
      return {
        ...document,
        status: 'no_conversion_needed',
      };
    }

    // Generate converted document ID
    const convertedDocumentId = hashDocument(`${documentId}-${targetFormat}-${Date.now()}`);

    // Create converted document metadata
    const convertedDocument = {
      id: convertedDocumentId,
      originalId: documentId,
      name: `${document.name} (${targetFormat})`,
      type: document.type,
      format: targetFormat,
      createdDate: new Date().toISOString(),
      creator: options.userId || document.creator,
      status: 'converted',
      size: 0,
      path: `generated_documents/${convertedDocumentId}.${targetFormat}`,
    };

    // Store converted document metadata in database
    await db.query(
      `INSERT INTO documents
      (id, original_id, name, type, format, created_date, creator, status, size, path)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        convertedDocument.id,
        convertedDocument.originalId,
        convertedDocument.name,
        convertedDocument.type,
        convertedDocument.format,
        convertedDocument.createdDate,
        convertedDocument.creator,
        convertedDocument.status,
        convertedDocument.size,
        convertedDocument.path,
      ]
    );

    // In a real implementation, we would convert the actual document file here

    // Return converted document metadata
    return convertedDocument;
  } catch (error) {
    console.error(
      `[DocProcessor] Error converting document ${documentId} to ${targetFormat}`,
      error
    );
    throw error;
  }
}

/**
 * Search for text within documents
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchDocuments(query, options = {}) {
  try {
    console.log(`[DocProcessor] Searching documents for: ${query}`);

    // Build search query
    let sqlQuery = `
      SELECT d.*, ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', $1)) as rank
      FROM document_texts dt
      JOIN documents d ON dt.document_id = d.id
      WHERE to_tsvector('english', dt.content) @@ plainto_tsquery('english', $1)
    `;

    const queryParams = [query];
    let paramIndex = 2;

    // Add filters
    if (options.documentType) {
      sqlQuery += ` AND d.type = $${paramIndex}`;
      queryParams.push(options.documentType);
      paramIndex++;
    }

    if (options.format) {
      sqlQuery += ` AND d.format = $${paramIndex}`;
      queryParams.push(options.format);
      paramIndex++;
    }

    if (options.createdAfter) {
      sqlQuery += ` AND d.created_date >= $${paramIndex}`;
      queryParams.push(options.createdAfter);
      paramIndex++;
    }

    if (options.createdBefore) {
      sqlQuery += ` AND d.created_date <= $${paramIndex}`;
      queryParams.push(options.createdBefore);
      paramIndex++;
    }

    // Add sorting and limit
    sqlQuery += ` ORDER BY rank DESC`;

    if (options.limit) {
      sqlQuery += ` LIMIT $${paramIndex}`;
      queryParams.push(options.limit);
    }

    // Execute search query
    const searchResults = await db.query(sqlQuery, queryParams);

    // Format search results
    const results = searchResults.rows.map(row => ({
      documentId: row.id,
      documentName: row.name,
      documentType: row.type,
      format: row.format,
      createdDate: row.created_date,
      creator: row.creator,
      path: row.path,
      relevance: row.rank,
    }));

    return {
      query,
      results,
      count: results.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[DocProcessor] Error searching documents for ${query}`, error);
    throw error;
  }
}

/**
 * Validate document against template
 * @param {string} documentId - Document ID
 * @param {string} templateId - Template ID
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - Validation result
 */
export async function validateDocument(documentId, templateId, options = {}) {
  try {
    console.log(`[DocProcessor] Validating document ${documentId} against template ${templateId}`);

    // Get document and template from database
    const documentQuery = await db.query('SELECT * FROM documents WHERE id = $1', [documentId]);

    if (documentQuery.rows.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const templateQuery = await db.query('SELECT * FROM document_templates WHERE id = $1', [
      templateId,
    ]);

    if (templateQuery.rows.length === 0) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const document = documentQuery.rows[0];
    const template = templateQuery.rows[0];

    // Get document content
    const contentQuery = await db.query(
      'SELECT content FROM document_texts WHERE document_id = $1',
      [documentId]
    );

    if (contentQuery.rows.length === 0) {
      throw new Error(`Document content not found: ${documentId}`);
    }

    const content = contentQuery.rows[0].content;

    // Get template validation rules
    const rulesQuery = await db.query(
      'SELECT rules FROM template_validation_rules WHERE template_id = $1',
      [templateId]
    );

    const validationRules =
      rulesQuery.rows.length > 0
        ? rulesQuery.rows[0].rules
        : { required_sections: [], required_fields: [], format_rules: [] };

    // Perform validation
    const validationResult = {
      documentId,
      templateId,
      templateName: template.name,
      validationDate: new Date().toISOString(),
      valid: true,
      issues: [],
    };

    // Check required sections
    for (const section of validationRules.required_sections) {
      const sectionPattern = new RegExp(`${section.name}`, 'i');

      if (!sectionPattern.test(content)) {
        validationResult.valid = false;
        validationResult.issues.push({
          type: 'missing_section',
          section: section.name,
          description: `Required section "${section.name}" is missing`,
        });
      }
    }

    // Check required fields
    for (const field of validationRules.required_fields) {
      const fieldPattern = new RegExp(`${field.name}[\\s\\S]*?([\\w\\s.,\\-]+)`, 'i');
      const match = content.match(fieldPattern);

      if (!match || !match[1].trim()) {
        validationResult.valid = false;
        validationResult.issues.push({
          type: 'missing_field',
          field: field.name,
          description: `Required field "${field.name}" is missing or empty`,
        });
      }
    }

    return validationResult;
  } catch (error) {
    console.error(`[DocProcessor] Error validating document ${documentId}`, error);
    throw error;
  }
}

/**
 * Get processing result
 * @param {string} resultId - Processing result ID
 * @returns {Object|null} - Processing result or null if not found
 */
export function getProcessingResult(resultId) {
  return processingResults.get(resultId) || null;
}
