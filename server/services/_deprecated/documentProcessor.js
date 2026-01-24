/**
 * Document Processor Service for TrialSage
 *
 * This service extracts text from PDF documents and processes them
 * for the regulatory knowledge base.
 *
 * NOTE: This version uses the file system for storage rather than SQLite
 * to avoid dependency issues.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure required directories exist
const DATA_DIR = path.join(__dirname, '../../data');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge_base');
const METADATA_PATH = path.join(KNOWLEDGE_DIR, 'metadata.json');

// Known regulatory authorities by region
const REGULATORY_AUTHORITIES = {
  FDA: [
    'fda',
    'food and drug administration',
    'cdrh',
    'cber',
    'cder',
    'cfsan',
    'usa',
    'us',
    'united states',
  ],
  EMA: [
    'ema',
    'european medicines agency',
    'eu',
    'europe',
    'european union',
    'mdr',
    'ivdr',
    'meddev',
  ],
  PMDA: ['pmda', 'pharmaceuticals and medical devices agency', 'japan', 'japanese'],
  NMPA: ['nmpa', 'national medical products administration', 'china', 'chinese'],
  'Health Canada': ['health canada', 'canada', 'canadian'],
  TGA: ['tga', 'therapeutic goods administration', 'australia', 'australian'],
  ICH: [
    'ich',
    'international council for harmonisation',
    'international',
    'harmonisation',
    'harmonization',
  ],
  WHO: ['who', 'world health organization', 'global'],
  ISO: ['iso', 'international organization for standardization'],
  IMDRF: ['imdrf', 'international medical device regulators forum'],
  MHRA: [
    'mhra',
    'medicines and healthcare products regulatory agency',
    'uk',
    'united kingdom',
    'great britain',
  ],
};

// Document type categories
const DOCUMENT_TYPES = {
  Guidance: ['guidance', 'guide', 'guideline', 'guiding', 'recommendation'],
  Regulation: ['regulation', 'regulatory', 'law', 'legal', 'statute', 'directive', 'rule'],
  Standard: ['standard', 'iso', 'en', 'astm', 'ansi', 'iec'],
  Report: ['report', 'whitepaper', 'white paper', 'review', 'assessment'],
  Template: ['template', 'form', 'checklist', 'submission'],
  ClinicalStudy: ['clinical', 'study', 'trial', 'protocol', 'ich e6', 'ich e8', 'ich e9'],
  Technical: ['technical', 'specification', 'requirement', 'documentation'],
};

/**
 * Initialize the knowledge base directory structure and metadata file
 */
async function initializeDatabase() {
  try {
    // Ensure data directories exist
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }

    // Create metadata file if it doesn't exist
    if (!fs.existsSync(METADATA_PATH)) {
      const initialMetadata = {
        documentCount: 0,
        lastUpdated: new Date().toISOString(),
        jurisdictionCounts: {},
        documentTypeCounts: {},
        documents: [],
      };

      fs.writeFileSync(METADATA_PATH, JSON.stringify(initialMetadata, null, 2));
    }

    return true;
  } catch (error) {
    console.error('Error initializing knowledge base:', error);
    return false;
  }
}

/**
 * Store document content in the knowledge base
 * @param {Array} docs - Array of document objects with metadata
 */
async function storeDocuments(docs) {
  try {
    // Ensure directories exist
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }

    // Read existing metadata
    let metadata = {
      documents: [],
      documentCount: 0,
      jurisdictionCounts: {},
      documentTypeCounts: {},
    };

    if (fs.existsSync(METADATA_PATH)) {
      try {
        const metadataStr = fs.readFileSync(METADATA_PATH, 'utf8');
        metadata = JSON.parse(metadataStr);
      } catch (error) {
        console.warn('Error reading metadata, creating new:', error);
        metadata = {
          documents: [],
          documentCount: 0,
          jurisdictionCounts: {},
          documentTypeCounts: {},
        };
      }
    }

    // Get the next document ID
    const nextId =
      metadata.documents.length > 0 ? Math.max(...metadata.documents.map(d => d.id)) + 1 : 1;

    // Store each document in the file system
    const timestamp = new Date().toISOString();

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const docId = nextId + i;

      // Save the document content to a file
      const contentFilePath = path.join(KNOWLEDGE_DIR, `doc_${docId}.txt`);
      fs.writeFileSync(contentFilePath, doc.content);

      // Add to metadata
      const docMetadata = {
        id: docId,
        source: doc.source,
        section: doc.section || null,
        jurisdiction: doc.jurisdiction || 'Unknown',
        tags: doc.tags || [],
        doc_type: doc.doc_type || 'Unknown',
        last_updated: timestamp,
        file_path: contentFilePath,
      };

      metadata.documents.push(docMetadata);

      // Update jurisdiction counts
      metadata.jurisdictionCounts[docMetadata.jurisdiction] =
        (metadata.jurisdictionCounts[docMetadata.jurisdiction] || 0) + 1;

      // Update document type counts
      metadata.documentTypeCounts[docMetadata.doc_type] =
        (metadata.documentTypeCounts[docMetadata.doc_type] || 0) + 1;
    }

    // Update metadata
    metadata.documentCount = metadata.documents.length;
    metadata.lastUpdated = timestamp;

    // Save updated metadata
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));

    return { count: docs.length, documents: docs };
  } catch (error) {
    console.error('Error storing documents:', error);
    throw error;
  }
}

/**
 * Extract text from a PDF file
 * Enhanced implementation for better text extraction from PDFs
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<string>} - The extracted text
 */
async function extractPdfText(pdfPath) {
  try {
    const stats = fs.statSync(pdfPath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    // Read file as buffer
    const fileBuffer = fs.readFileSync(pdfPath);

    // Check PDF header
    const isPdf = fileBuffer.slice(0, 5).toString() === '%PDF-';
    if (!isPdf) {
      console.warn(`File ${pdfPath} does not appear to be a valid PDF`);
    }

    // Convert buffer to string and extract text using a simple regex approach
    // This is a simplified approach and not as robust as a dedicated PDF library
    const fileStr = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 5000000)); // Limit to first 5MB

    // Extract text between PDF text markers (simplified approach)
    const textRegex = /\(([^\)\\]+|\\\\|\\\)|\\[0-9]{3})*\)/g;
    const matches = fileStr.match(textRegex) || [];

    let extractedText = '';

    // Process matches to extract readable text
    for (const match of matches) {
      let text = match.substring(1, match.length - 1); // Remove parentheses
      text = text.replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');

      // Only add if it contains actual text (not just control chars)
      if (text.match(/[a-zA-Z]{3,}/)) {
        extractedText += text + ' ';
      }
    }

    // Clean up text
    extractedText = extractedText.replace(/\s+/g, ' ').trim();

    // If we didn't extract much text, add file info
    if (extractedText.length < 100) {
      extractedText =
        `PDF Document: ${path.basename(pdfPath)}\nSize: ${fileSizeInMB.toFixed(2)} MB\n\n` +
        (extractedText ||
          'No extractable text found in this PDF. The document may be scanned or image-based.');

      // Try to extract regulatory terms
      const regulatoryTerms = [
        'FDA',
        'EMA',
        'PMDA',
        'ICH',
        'ISO',
        'NMPA',
        'Health Canada',
        'TGA',
        'medical device',
        'regulatory',
        'guidance',
        'regulation',
        'compliance',
        'safety',
        'effectiveness',
        'clinical',
        'evaluation',
        'report',
        'quality',
      ];

      const foundTerms = [];
      for (const term of regulatoryTerms) {
        if (fileStr.includes(term)) {
          foundTerms.push(term);
        }
      }

      if (foundTerms.length > 0) {
        extractedText += `\n\nDocument contains references to: ${foundTerms.join(', ')}`;
      }
    } else {
      // Add document info to the beginning
      extractedText =
        `PDF Document: ${path.basename(pdfPath)}\nSize: ${fileSizeInMB.toFixed(2)} MB\n\n` +
        extractedText;
    }

    return extractedText;
  } catch (error) {
    console.error(`Error extracting text from ${pdfPath}:`, error);
    return `Failed to extract text from ${path.basename(pdfPath)}: ${error.message}`;
  }
}

/**
 * Process a document file and add it to the knowledge base
 * @param {string} filePath - Path to the file
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Object>} - Processing result
 */
async function processDocument(filePath, metadata = {}) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Extract text from PDF
    console.log(`Extracting text from ${filePath}...`);
    let documentText = await extractPdfText(filePath);

    if (!documentText || documentText.trim() === '') {
      return {
        success: false,
        error: 'No text content could be extracted from the document',
      };
    }

    // Count words and estimate read time
    const wordCount = documentText.split(/\s+/).length;
    const readTimeMinutes = Math.ceil(wordCount / 200); // Assuming 200 words per minute

    // Generate a unique ID for the document
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Add word count and read time to metadata
    const enrichedMetadata = {
      ...metadata,
      documentId,
      wordCount,
      readTimeMinutes,
      processingDate: new Date().toISOString(),
    };

    // Determine jurisdiction if not provided
    if (!enrichedMetadata.jurisdiction || enrichedMetadata.jurisdiction === 'General') {
      // Try to extract jurisdiction from content
      const lowerText = documentText.toLowerCase();

      if (lowerText.includes('fda') || lowerText.includes('food and drug administration')) {
        enrichedMetadata.jurisdiction = 'FDA';
      } else if (lowerText.includes('ema') || lowerText.includes('european medicines agency')) {
        enrichedMetadata.jurisdiction = 'EMA';
      } else if (
        lowerText.includes('ich') ||
        lowerText.includes('international council for harmonisation')
      ) {
        enrichedMetadata.jurisdiction = 'ICH';
      } else if (lowerText.includes('who') || lowerText.includes('world health organization')) {
        enrichedMetadata.jurisdiction = 'WHO';
      }
    }

    // Create document object
    const documentObject = {
      id: documentId,
      title: enrichedMetadata.title || path.basename(filePath),
      content: documentText,
      metadata: enrichedMetadata,
      wordCount,
      readTimeMinutes,
      jurisdiction: enrichedMetadata.jurisdiction || 'General',
      documentType: enrichedMetadata.documentType || 'Regulatory',
      source: enrichedMetadata.source || 'User Upload',
      uploadDate: enrichedMetadata.uploadDate || new Date().toISOString(),
    };

    console.log(`Storing document ${documentId} in knowledge base...`);

    // Store document in knowledge base
    await storeDocuments([documentObject]);

    console.log(`Document ${documentId} processed successfully`);

    return {
      success: true,
      documentId,
      stats: {
        wordCount,
        readTimeMinutes,
        jurisdiction: documentObject.jurisdiction,
        documentType: documentObject.documentType,
      },
    };
  } catch (error) {
    console.error('Error processing document:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process all PDF files in a directory
 * @param {string} folderPath - Path to the folder containing PDFs
 * @returns {Promise<Array>} - Array of document objects
 */
async function processPdfs(folderPath) {
  const processedDocs = [];

  try {
    // Get all PDF files in the directory
    const files = fs.readdirSync(folderPath);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    // Process each PDF
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(folderPath, pdfFile);
      const fileName = path.basename(pdfFile);

      try {
        // Extract text from the PDF
        const text = await extractPdfText(pdfPath);

        // Determine document type and jurisdiction from filename and content
        const docInfo = determineDocumentType(fileName, text);

        // Extract document sections for more granular knowledge
        const sections = extractDocumentSections(text);

        // If no sections were extracted, store the whole document
        if (sections.length === 0) {
          processedDocs.push({
            source: fileName,
            content: text,
            jurisdiction: docInfo.jurisdiction,
            doc_type: docInfo.type,
            tags: docInfo.tags,
          });
        } else {
          // Store each section separately for more granular retrieval
          sections.forEach(section => {
            processedDocs.push({
              source: fileName,
              section: section.title,
              content: section.content,
              jurisdiction: docInfo.jurisdiction,
              doc_type: docInfo.type,
              tags: docInfo.tags,
            });
          });
        }
      } catch (error) {
        console.error(`Error processing PDF ${pdfFile}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${folderPath}:`, error);
  }

  return processedDocs;
}

/**
 * Extract document sections to allow for more granular knowledge retrieval
 * @param {string} text - Document text
 * @returns {Array} - Array of section objects
 */
function extractDocumentSections(text) {
  // This is a simple section extractor that looks for header patterns
  // In a production implementation, this would use a more sophisticated approach

  const sections = [];

  // Common section header patterns in regulatory documents
  const sectionPatterns = [
    /\n(\d+\.\s+[A-Z][A-Za-z\s]+)\n/g, // Numbered section headers: "1. Introduction"
    /\n([A-Z][A-Z\s]+)(?:\n|\s*:)/g, // ALL CAPS headers: "INTRODUCTION" or "SCOPE:"
    /\n(Chapter\s+\d+[.:]\s+[A-Za-z\s]+)\n/gi, // Chapter headers: "Chapter 1: Introduction"
    /\n(Appendix\s+[A-Z]\s*[.:]\s+[A-Za-z\s]+)\n/gi, // Appendix headers: "Appendix A: References"
    /\n(Section\s+\d+[.:]\s+[A-Za-z\s]+)\n/gi, // Section headers: "Section 1: Scope"
  ];

  // Find potential section headers
  const potentialSections = [];

  sectionPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      potentialSections.push({
        title: match[1].trim(),
        index: match.index + 1, // +1 to skip the newline
      });
    }
  });

  // Sort sections by their position in the document
  potentialSections.sort((a, b) => a.index - b.index);

  // Extract content between sections
  for (let i = 0; i < potentialSections.length; i++) {
    const sectionStart = potentialSections[i].index + potentialSections[i].title.length;
    const sectionEnd =
      i < potentialSections.length - 1 ? potentialSections[i + 1].index : text.length;

    const sectionContent = text.substring(sectionStart, sectionEnd).trim();

    // Only add if there's meaningful content (more than just a few characters)
    if (sectionContent.length > 20) {
      sections.push({
        title: potentialSections[i].title,
        content: sectionContent,
      });
    }
  }

  return sections;
}

/**
 * Determine document type and jurisdiction from filename and content
 * This enhanced version provides a more comprehensive classification system
 * @param {string} filename - The filename to analyze
 * @param {string} content - Document content for additional context
 * @returns {Object} - Document type information
 */
function determineDocumentType(filename, content = '') {
  const lowerFilename = filename.toLowerCase();
  const lowerContent = content.toLowerCase().substring(0, 2000); // Use just the first part for efficiency

  // Determine jurisdiction
  let jurisdiction = 'Unknown';
  let highestMatch = 0;

  for (const [auth, keywords] of Object.entries(REGULATORY_AUTHORITIES)) {
    let matchCount = 0;

    keywords.forEach(keyword => {
      // Check filename for jurisdiction keywords
      if (lowerFilename.includes(keyword)) {
        matchCount += 3; // Filename matches are more important
      }

      // Check content for jurisdiction keywords
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const contentMatches = (lowerContent.match(regex) || []).length;
      matchCount += contentMatches;
    });

    if (matchCount > highestMatch) {
      highestMatch = matchCount;
      jurisdiction = auth;
    }
  }

  // Determine document type
  let docType = 'Unknown';
  highestMatch = 0;

  for (const [type, keywords] of Object.entries(DOCUMENT_TYPES)) {
    let matchCount = 0;

    keywords.forEach(keyword => {
      // Check filename for type keywords
      if (lowerFilename.includes(keyword)) {
        matchCount += 3; // Filename matches are more important
      }

      // Check content for type keywords
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const contentMatches = (lowerContent.match(regex) || []).length;
      matchCount += contentMatches;
    });

    if (matchCount > highestMatch) {
      highestMatch = matchCount;
      docType = type;
    }
  }

  // Extract potential tags
  const tags = [];

  // Check for specific document identifiers
  const ichGuidanceMatch = lowerContent.match(/\bich\s+([a-z]\d+[a-z]*)(?:\s*\(r\d+\))?/gi);
  if (ichGuidanceMatch) {
    ichGuidanceMatch.forEach(match => tags.push(match.toUpperCase()));
    jurisdiction = 'ICH';
    docType = 'Guidance';
  }

  // Check for FDA guidance numbers
  const fdaGuidanceMatch = lowerContent.match(
    /\bguidance\s+(?:for\s+industry\s+)?(?:no\.\s+)?(\d+-\d+)/gi
  );
  if (fdaGuidanceMatch) {
    fdaGuidanceMatch.forEach(match => tags.push(match));
    jurisdiction = 'FDA';
    docType = 'Guidance';
  }

  // Check for EU MDR/IVDR references
  if (lowerContent.includes('2017/745') || lowerContent.includes('mdr')) {
    tags.push('MDR');
    tags.push('2017/745');
    jurisdiction = 'EMA';
    docType = 'Regulation';
  }

  if (lowerContent.includes('2017/746') || lowerContent.includes('ivdr')) {
    tags.push('IVDR');
    tags.push('2017/746');
    jurisdiction = 'EMA';
    docType = 'Regulation';
  }

  // ISO standards
  const isoMatch = lowerContent.match(/\biso\s+(\d+(?:-\d+)*(?::\d+)?)/gi);
  if (isoMatch) {
    isoMatch.forEach(match => tags.push(match.toUpperCase()));
    docType = 'Standard';
  }

  return {
    jurisdiction,
    type: docType,
    tags: tags.length > 0 ? [...new Set(tags)] : undefined, // Deduplicate tags
  };
}

/**
 * Setup the knowledge base with initial data
 */
async function setupKnowledgeBase() {
  try {
    console.log('Setting up knowledge base and importing regulatory documents...');
    await initializeDatabase();

    // Process RBM document specifically from attached_assets
    const rbmDocPath = path.join(
      process.cwd(),
      'attached_assets',
      'draftgfi_processesandpracticesapplicabletobioresearchmonitoringinspections-frdts2023-363op5-10-24_final.pdf'
    );

    if (fs.existsSync(rbmDocPath)) {
      console.log('Found RBM document, processing...');

      // Extract text from the PDF
      const rbmText = await extractPdfText(rbmDocPath);

      if (rbmText) {
        // Create document object with FDA jurisdiction since it's an FDA document
        const rbmDoc = {
          source: 'FDA Risk-Based Monitoring Guidance',
          content: rbmText,
          jurisdiction: 'FDA',
          doc_type: 'Guidance',
          tags: ['risk-based monitoring', 'RBM', 'clinical trials', 'monitoring', 'inspection'],
        };

        // Store the document
        await storeDocuments([rbmDoc]);
        console.log('Successfully imported RBM document into knowledge base');
      }
    } else {
      console.log('RBM document not found at path:', rbmDocPath);
    }

    // Check for any other PDF documents in attached_assets
    const attachedAssetsPath = path.join(process.cwd(), 'attached_assets');
    await importDocuments(attachedAssetsPath);

    return true;
  } catch (error) {
    console.error('Error setting up knowledge base:', error);
    return false;
  }
}

/**
 * Import documents into the knowledge base
 * @param {string} folderPath - Path to the folder containing documents
 */
async function importDocuments(folderPath) {
  try {
    // Process PDFs in the directory
    const processedDocs = await processPdfs(folderPath);

    if (processedDocs.length === 0) {
      return {
        success: false,
        message: 'No documents found or processed',
        processedCount: 0,
      };
    }

    // Store the processed documents in the knowledge base
    const result = await storeDocuments(processedDocs);

    return {
      success: true,
      message: `Successfully processed ${result.count} document sections`,
      processedCount: processedDocs.length,
      documents: processedDocs.map(doc => ({
        source: doc.source,
        section: doc.section,
        jurisdiction: doc.jurisdiction,
        doc_type: doc.doc_type,
      })),
    };
  } catch (error) {
    console.error('Error importing documents:', error);
    return {
      success: false,
      message: `Error importing documents: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Search the knowledge base
 * @param {string} query - The search query
 * @param {string} jurisdiction - Optional jurisdiction filter
 * @param {string} docType - Optional document type filter
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} - Array of matching documents
 */
async function searchKnowledgeBase(query, jurisdiction = null, docType = null, limit = 10) {
  try {
    // Read metadata
    if (!fs.existsSync(METADATA_PATH)) {
      return [];
    }

    const metadataStr = fs.readFileSync(METADATA_PATH, 'utf8');
    const metadata = JSON.parse(metadataStr);

    // Filter documents based on query and filters
    const results = metadata.documents.filter(doc => {
      // Apply jurisdiction filter if provided
      if (jurisdiction && doc.jurisdiction !== jurisdiction) {
        return false;
      }

      // Apply document type filter if provided
      if (docType && doc.doc_type !== docType) {
        return false;
      }

      // Check if content file exists
      if (!fs.existsSync(doc.file_path)) {
        return false;
      }

      // Basic text search in content
      try {
        const content = fs.readFileSync(doc.file_path, 'utf8');
        return content.toLowerCase().includes(query.toLowerCase());
      } catch (error) {
        console.warn(`Error reading document ${doc.id}:`, error);
        return false;
      }
    });

    // Return limited number of results
    return results.slice(0, limit).map(doc => {
      // Add content to the result
      let content = '';
      try {
        content = fs.readFileSync(doc.file_path, 'utf8');
      } catch (error) {
        console.warn(`Error reading document ${doc.id}:`, error);
        content = `Error reading content: ${error.message}`;
      }

      return {
        ...doc,
        content,
      };
    });
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return [];
  }
}

/**
 * Get knowledge base statistics
 * @returns {Promise<Object>} - Knowledge base statistics
 */
async function getKnowledgeBaseStats() {
  try {
    if (!fs.existsSync(METADATA_PATH)) {
      return {
        initialized: false,
        documentCount: 0,
        lastUpdated: null,
        jurisdictions: [],
        documentTypes: [],
      };
    }

    const metadataStr = fs.readFileSync(METADATA_PATH, 'utf8');
    const metadata = JSON.parse(metadataStr);

    // Convert jurisdiction counts to array format
    const jurisdictions = Object.entries(metadata.jurisdictionCounts || {}).map(
      ([jurisdiction, count]) => ({
        jurisdiction,
        count,
      })
    );

    // Convert document type counts to array format
    const documentTypes = Object.entries(metadata.documentTypeCounts || {}).map(
      ([doc_type, count]) => ({
        doc_type,
        count,
      })
    );

    return {
      initialized: true,
      documentCount: metadata.documentCount || 0,
      lastUpdated: metadata.lastUpdated || null,
      jurisdictions,
      documentTypes,
    };
  } catch (error) {
    console.error('Error getting knowledge base stats:', error);
    return {
      initialized: false,
      documentCount: 0,
      lastUpdated: null,
      jurisdictions: [],
      documentTypes: [],
      error: error.message,
    };
  }
}

// Export functions
export {
  initializeDatabase as setupKnowledgeBase, // Alias for backward compatibility
  importDocuments,
  extractPdfText,
  processPdfs,
  initializeDatabase,
  storeDocuments,
  determineDocumentType,
  extractDocumentSections,
  searchKnowledgeBase,
  getKnowledgeBaseStats,
  processDocument, // Add the new document processing function
  searchKnowledgeBase as retrieveDocuments, // Alias for compatibility with regulatoryAIService
};
