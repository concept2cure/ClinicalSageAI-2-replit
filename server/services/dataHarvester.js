/**
 * IND Wizard Data Harvester Service
 *
 * Intelligently extracts structured data from source documents (protocols, CSRs, CMC reports)
 * and automatically populates relevant IND sections.
 *
 * Features:
 * - Document parsing (PDF, DOCX, HTML)
 * - Intelligent data extraction with GPT-4o
 * - Mapping to IND sections based on context
 * - Structured data extraction (tables, figures, references)
 * - Citation tracking and management
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs/promises';
import { PDFExtract } from 'pdf.js-extract';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';
import { eventBus } from '../events/eventBus.js';
import { ai } from '../lib/unified-ai-client';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

// PDF extraction utility
const pdfExtract = new PDFExtract();

// Mapping of document types to section parsers
const DOCUMENT_TYPE_PARSERS = {
  protocol: extractProtocolData,
  csr: extractCSRData,
  ib: extractIBData,
  cmc: extractCMCData,
  toxicology: extractToxicologyData,
  analytical: extractAnalyticalData,
  stability: extractStabilityData,
  sop: extractSOPData,
  literature: extractLiteratureData,
};

// Mapping of document types to target IND sections
const DOCUMENT_TO_SECTION_MAPPING = {
  protocol: ['2.5', '2.7.3', '5.3.5'],
  csr: ['2.5', '2.7.1', '2.7.3', '2.7.4', '5.3.5'],
  ib: ['2.4', '2.6.2', '2.6.6', '2.7.2'],
  cmc: ['2.3', '3.2.P', '3.2.S'],
  toxicology: ['2.4', '2.6.6', '4.3'],
  analytical: ['3.2.P.5', '3.2.S.4'],
  stability: ['3.2.P.8', '3.2.S.7'],
  sop: ['3.2.P.3.3', '3.2.S.2.2'],
  literature: ['2.4', '2.5', '2.7.5'],
};

/**
 * Main function to process a document and extract data
 *
 * @param {string} documentId - ID of the document in the database
 * @param {string} submissionId - ID of the IND submission
 * @returns {Promise<Object>} - Results of the extraction process
 */
export async function processDocument(documentId, submissionId) {
  try {
    logger.info(`Starting document processing: ${documentId} for submission ${submissionId}`);

    // Step 1: Get document metadata from database
    const { data: document, error: docError } = await supabase
      .from('ind_references')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError) {
      throw new Error(`Error fetching document metadata: ${docError.message}`);
    }

    // Update processing status
    await supabase.from('ind_harvesting_jobs').insert({
      document_id: documentId,
      submission_id: submissionId,
      status: 'processing',
      start_time: new Date().toISOString(),
    });

    // Step 2: Extract document content based on type
    const documentContent = await extractDocumentContent(document);

    // Step 3: Based on document type, extract structured data
    const documentType = document.document_type.toLowerCase();
    const extractorFunction = DOCUMENT_TYPE_PARSERS[documentType] || extractGenericData;

    const extractedData = await extractorFunction(documentContent, document);

    // Step 4: Map extracted data to IND sections
    const targetSections = DOCUMENT_TO_SECTION_MAPPING[documentType] || [];
    const mappedSections = await mapDataToSections(extractedData, targetSections, submissionId);

    // Step 5: Insert extracted data into IND blocks
    const insertResults = await insertDataIntoBlocks(mappedSections, submissionId, document);

    // Step 6: Generate knowledge graph entities from extracted data
    await generateKnowledgeEntities(extractedData, submissionId, documentId);

    // Step 7: Update processing status
    await supabase
      .from('ind_harvesting_jobs')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        sections_affected: targetSections,
        extraction_summary: {
          extracted_sections: Object.keys(extractedData).length,
          inserted_blocks: insertResults.insertCount,
          tables_extracted: extractedData.tables?.length || 0,
          figures_extracted: extractedData.figures?.length || 0,
          references_extracted: extractedData.references?.length || 0,
        },
      })
      .eq('document_id', documentId)
      .eq('submission_id', submissionId);

    // Emit event for workflow integration
    eventBus.publish({
      type: 'document_harvested',
      payload: {
        document_id: documentId,
        submission_id: submissionId,
        sections_affected: targetSections,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: true,
      document_id: documentId,
      submission_id: submissionId,
      extracted_data: extractedData,
      mapped_sections: mappedSections,
      target_sections: targetSections,
      insert_results: insertResults,
    };
  } catch (error) {
    logger.error(`Error processing document ${documentId}: ${error.message}`, error);

    // Update processing status to failed
    await supabase
      .from('ind_harvesting_jobs')
      .update({
        status: 'failed',
        end_time: new Date().toISOString(),
        error_message: error.message,
      })
      .eq('document_id', documentId)
      .eq('submission_id', submissionId);

    throw error;
  }
}

/**
 * Extract document content based on file type
 *
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted content
 */
async function extractDocumentContent(document) {
  try {
    // Determine file path/URL
    let filePath = document.file_path;

    // If document is stored in Supabase Storage
    if (document.storage_path) {
      // Download from storage
      const { data, error } = await supabase.storage
        .from('ind-documents')
        .download(document.storage_path);

      if (error) {
        throw new Error(`Error downloading document: ${error.message}`);
      }

      // Save temporarily
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate a unique filename
      const tempFileName = `${crypto.randomBytes(16).toString('hex')}${path.extname(document.storage_path)}`;
      filePath = path.join(tempDir, tempFileName);

      // Convert Blob to Buffer and write to file
      const buffer = Buffer.from(await data.arrayBuffer());
      await fs.writeFile(filePath, buffer);
    } else if (document.url && !document.file_path) {
      // If document is at a URL, download it
      const response = await fetch(document.url);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Save temporarily
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate a unique filename based on URL
      const urlHash = crypto.createHash('md5').update(document.url).digest('hex');
      const fileExt = path.extname(document.url) || '.pdf'; // Default to PDF if no extension
      filePath = path.join(tempDir, `${urlHash}${fileExt}`);

      await fs.writeFile(filePath, buffer);
    }

    // Extract based on file type
    const fileExt = path.extname(filePath).toLowerCase();
    let content = { text: '', html: '', sections: [], tables: [], figures: [], metadata: {} };

    if (fileExt === '.pdf') {
      content = await extractPdfContent(filePath);
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      content = await extractDocxContent(filePath);
    } else if (fileExt === '.html' || fileExt === '.htm') {
      content = await extractHtmlContent(filePath);
    } else if (fileExt === '.txt') {
      const text = await fs.readFile(filePath, 'utf8');
      content.text = text;
      content.sections = [{ title: 'Main Content', content: text }];
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    // Add document metadata
    content.metadata = {
      document_id: document.id,
      title: document.title,
      author: document.author,
      date: document.date || document.year,
      type: document.document_type,
    };

    // Clean up temporary file if it was created
    if (filePath.includes('temp/')) {
      await fs
        .unlink(filePath)
        .catch(err => logger.warn(`Error deleting temp file: ${err.message}`));
    }

    return content;
  } catch (error) {
    logger.error(`Error extracting document content: ${error.message}`, error);
    throw error;
  }
}

/**
 * Extract content from PDF file
 *
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<Object>} - Extracted content
 */
async function extractPdfContent(filePath) {
  try {
    // Use pdf.js-extract for basic extraction
    const result = await pdfExtract.extract(filePath, {});

    // Combine all pages into one text
    let fullText = '';
    result.pages.forEach(page => {
      page.content.forEach(item => {
        fullText += item.str + ' ';
      });
      fullText += '\n\n';
    });

    // Use pdftohtml for better structure detection (if available)
    let html = '';
    try {
      // Try to use pdftohtml command-line tool if available
      const htmlOutputPath = filePath.replace('.pdf', '.html');
      await execAsync(`pdftohtml -c -s -i -noframes ${filePath} ${htmlOutputPath}`);
      html = await fs.readFile(htmlOutputPath, 'utf8');
      await fs.unlink(htmlOutputPath).catch(() => {}); // Clean up
    } catch (pdfHtmlError) {
      // Fallback to basic HTML
      html = `<html><body><pre>${fullText}</pre></body></html>`;
    }

    // Extract sections, tables, and figures
    const sections = await extractStructuredSections(fullText, html);
    const tables = await extractTables(html);
    const figures = await extractFigures(filePath, result.pages.length);

    return {
      text: fullText,
      html,
      sections,
      tables,
      figures,
      metadata: {},
    };
  } catch (error) {
    logger.error(`Error extracting PDF content: ${error.message}`, error);
    throw error;
  }
}

/**
 * Extract content from DOCX file
 *
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<Object>} - Extracted content
 */
async function extractDocxContent(filePath) {
  try {
    const result = await mammoth.extractAllFrom({ path: filePath });
    const text = result.value.text;
    const html = result.value.html;

    // Parse document structure
    const sections = await extractStructuredSections(text, html);
    const tables = await extractTables(html);

    // Extract images from DOCX
    const figures = [];
    for (const image of result.value.images) {
      figures.push({
        data: image.data,
        contentType: image.contentType,
        alt: image.altText || 'Figure',
        description: image.altText || 'Figure',
      });
    }

    return {
      text,
      html,
      sections,
      tables,
      figures,
      metadata: {},
    };
  } catch (error) {
    logger.error(`Error extracting DOCX content: ${error.message}`, error);
    throw error;
  }
}

/**
 * Extract content from HTML file
 *
 * @param {string} filePath - Path to HTML file
 * @returns {Promise<Object>} - Extracted content
 */
async function extractHtmlContent(filePath) {
  try {
    const html = await fs.readFile(filePath, 'utf8');
    const $ = cheerio.load(html);

    // Extract text
    // Remove script and style elements
    $('script, style').remove();
    const text = $('body').text().trim().replace(/\s+/g, ' ');

    // Extract sections
    const sections = [];
    $('h1, h2, h3').each((_, element) => {
      const $el = $(element);
      const title = $el.text().trim();
      let content = '';

      // Get all content until next heading
      let node = $el.next();
      while (node.length && !node.is('h1, h2, h3')) {
        content += node.text() + ' ';
        node = node.next();
      }

      sections.push({
        title,
        content: content.trim(),
      });
    });

    // Extract tables
    const tables = [];
    $('table').each((index, element) => {
      const rows = [];
      $(element)
        .find('tr')
        .each((_, row) => {
          const cells = [];
          $(row)
            .find('th, td')
            .each((_, cell) => {
              cells.push($(cell).text().trim());
            });
          if (cells.length > 0) {
            rows.push(cells);
          }
        });

      if (rows.length > 0) {
        let caption = '';
        // Look for table caption
        const $caption = $(element).find('caption');
        if ($caption.length) {
          caption = $caption.text().trim();
        } else {
          // Try to find a nearby paragraph that looks like a caption
          const prevP = $(element).prev('p');
          if (prevP.text().toLowerCase().includes('table')) {
            caption = prevP.text().trim();
          }
        }

        tables.push({
          rows,
          caption,
          index,
        });
      }
    });

    // Extract figures
    const figures = [];
    $('img').each((index, element) => {
      const $img = $(element);
      const src = $img.attr('src');
      const alt = $img.attr('alt') || '';

      // Look for figure caption
      let caption = alt;
      // Try finding a figcaption element
      const $figcaption = $img.closest('figure').find('figcaption');
      if ($figcaption.length) {
        caption = $figcaption.text().trim();
      } else {
        // Try finding a nearby paragraph that looks like a caption
        const nextP = $img.next('p');
        if (
          nextP.text().toLowerCase().includes('figure') ||
          nextP.text().toLowerCase().includes('fig')
        ) {
          caption = nextP.text().trim();
        }
      }

      figures.push({
        src,
        alt,
        caption,
        index,
      });
    });

    return {
      text,
      html,
      sections,
      tables,
      figures,
      metadata: {},
    };
  } catch (error) {
    logger.error(`Error extracting HTML content: ${error.message}`, error);
    throw error;
  }
}

/**
 * Extract structured sections from text and html
 *
 * @param {string} text - Full text content
 * @param {string} html - HTML content if available
 * @returns {Promise<Array>} - Array of sections with title and content
 */
async function extractStructuredSections(text, html) {
  try {
    // Try to identify sections using AI
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in analyzing scientific and regulatory documents. 
          Identify the main sections in this document and extract their content.
          Return a JSON array of sections, each with title and content fields.
          Group the content intelligently by logical sections rather than just headings.
          Maintain the hierarchical structure of sections and subsections when possible.`,
        },
        {
          role: 'user',
          content: `Extract the sections from this document content:
          
          ${text.slice(0, 15000)} [content truncated for analysis]`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(result.choices[0].message.content);

    if (parsed && Array.isArray(parsed.sections)) {
      return parsed.sections;
    }

    // Fallback: Try to extract sections based on regex patterns
    const sections = [];
    const sectionRegex = /^(\d+(?:\.\d+)*)\s+([A-Z][^\n]+)$/gm;
    let match;
    let lastIndex = 0;
    let lastTitle = null;

    while ((match = sectionRegex.exec(text)) !== null) {
      if (lastTitle) {
        // Add the previous section
        const content = text.substring(lastIndex, match.index).trim();
        if (content) {
          sections.push({
            title: lastTitle,
            content,
          });
        }
      }

      lastTitle = `${match[1]} ${match[2]}`;
      lastIndex = match.index + match[0].length;
    }

    // Add the last section
    if (lastTitle) {
      const content = text.substring(lastIndex).trim();
      if (content) {
        sections.push({
          title: lastTitle,
          content,
        });
      }
    }

    return sections.length > 0 ? sections : [{ title: 'Main Content', content: text }];
  } catch (error) {
    logger.error(`Error extracting structured sections: ${error.message}`, error);
    // Fallback to single section
    return [{ title: 'Main Content', content: text }];
  }
}

/**
 * Extract tables from HTML content
 *
 * @param {string} html - HTML content
 * @returns {Promise<Array>} - Array of tables with rows and caption
 */
async function extractTables(html) {
  try {
    const $ = cheerio.load(html);
    const tables = [];

    $('table').each((index, element) => {
      const rows = [];
      $(element)
        .find('tr')
        .each((_, row) => {
          const cells = [];
          $(row)
            .find('th, td')
            .each((_, cell) => {
              cells.push($(cell).text().trim());
            });
          if (cells.length > 0) {
            rows.push(cells);
          }
        });

      if (rows.length > 0) {
        let caption = '';
        // Look for table caption
        const $caption = $(element).find('caption');
        if ($caption.length) {
          caption = $caption.text().trim();
        } else {
          // Try to find a nearby paragraph that looks like a caption
          const prevP = $(element).prev('p');
          if (prevP.text().toLowerCase().includes('table')) {
            caption = prevP.text().trim();
          }
        }

        tables.push({
          rows,
          caption,
          index,
        });
      }
    });

    return tables;
  } catch (error) {
    logger.error(`Error extracting tables: ${error.message}`, error);
    return [];
  }
}

/**
 * Extract figures from a PDF file
 *
 * @param {string} filePath - Path to PDF file
 * @param {number} pageCount - Number of pages in PDF
 * @returns {Promise<Array>} - Array of figures with data and description
 */
async function extractFigures(filePath, pageCount) {
  try {
    const figures = [];
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Extract images from PDF using pdfimages if available
    try {
      const outputPrefix = path.join(tempDir, 'img');
      await execAsync(`pdfimages -all -f 1 -l ${pageCount} ${filePath} ${outputPrefix}`);

      // List all extracted images
      const files = await fs.readdir(tempDir);
      const imageFiles = files.filter(file => file.startsWith('img-'));

      for (const [index, file] of imageFiles.entries()) {
        const fullPath = path.join(tempDir, file);
        const data = await fs.readFile(fullPath);

        figures.push({
          data,
          contentType: file.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
          alt: `Figure ${index + 1}`,
          description: `Figure ${index + 1}`,
        });

        // Clean up extracted image
        await fs.unlink(fullPath).catch(() => {});
      }
    } catch (error) {
      logger.warn(`Could not extract figures using pdfimages: ${error.message}`);
      // Fallback - could use other methods or AI to identify figures
    }

    return figures;
  } catch (error) {
    logger.error(`Error extracting figures: ${error.message}`, error);
    return [];
  }
}

/**
 * Process and extract data from Protocol documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractProtocolData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in clinical trial protocols. Extract key information from this protocol 
          that would be needed for an IND submission. Focus on study design, objectives, endpoints, 
          eligibility criteria, dosing, and safety monitoring.
          
          Return a JSON object with these keys:
          - study_title
          - study_phase
          - study_design
          - objectives: {primary, secondary}
          - endpoints: {primary, secondary}
          - population
          - eligibility: {inclusion, exclusion}
          - treatments
          - dosing_regimen
          - safety_monitoring
          - statistical_methods
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key protocol information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting protocol data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from CSR documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractCSRData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in clinical study reports (CSRs). Extract key information from this CSR 
          that would be needed for an IND submission. Focus on efficacy results, safety findings, 
          statistical analyses, and conclusions.
          
          Return a JSON object with these keys:
          - study_title
          - study_id
          - study_phase
          - study_design
          - population
          - efficacy_results
          - safety_results
          - statistical_analyses
          - conclusions
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key CSR information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting CSR data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from IB documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractIBData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in Investigator's Brochures (IBs). Extract key information from this IB 
          that would be needed for an IND submission. Focus on nonclinical data, clinical experience, 
          pharmacology, toxicology, and benefit-risk.
          
          Return a JSON object with these keys:
          - drug_name
          - mechanism_of_action
          - pharmacology
          - pharmacokinetics
          - toxicology
          - clinical_experience
          - safety_profile
          - dosing_recommendations
          - benefit_risk
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key IB information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting IB data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from CMC documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractCMCData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in Chemistry, Manufacturing, and Controls (CMC). Extract key information from this CMC document 
          that would be needed for an IND submission. Focus on manufacturing process, controls, specifications, 
          and stability data.
          
          Return a JSON object with these keys:
          - drug_substance
          - manufacturing_process
          - controls
          - specifications
          - container_closure
          - stability_data
          - analytical_methods
          - batch_analysis
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key CMC information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting CMC data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from Toxicology documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractToxicologyData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in toxicology studies. Extract key information from this toxicology document 
          that would be needed for an IND submission. Focus on study design, findings, NOAEL, and safety conclusions.
          
          Return a JSON object with these keys:
          - study_type
          - species
          - duration
          - dose_levels
          - findings
          - noael
          - toxicokinetics
          - safety_margins
          - conclusions
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key toxicology information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting toxicology data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from Analytical documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractAnalyticalData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in analytical methods for pharmaceuticals. Extract key information from this analytical document 
          that would be needed for an IND submission. Focus on methods, validation, specifications, and results.
          
          Return a JSON object with these keys:
          - method_type
          - validation_parameters
          - acceptance_criteria
          - results
          - conclusions
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key analytical information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting analytical data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from Stability documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractStabilityData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in pharmaceutical stability studies. Extract key information from this stability document 
          that would be needed for an IND submission. Focus on study conditions, timepoints, results, and shelf-life determination.
          
          Return a JSON object with these keys:
          - storage_conditions
          - timepoints
          - parameters_tested
          - results
          - shelf_life
          - conclusions
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key stability information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting stability data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from SOP documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractSOPData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in Standard Operating Procedures (SOPs). Extract key information from this SOP document 
          that would be needed for an IND submission. Focus on procedure steps, responsibilities, and quality aspects.
          
          Return a JSON object with these keys:
          - procedure_title
          - purpose
          - scope
          - responsibilities
          - procedure_steps
          - quality_measures
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key SOP information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting SOP data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Process and extract data from Literature documents
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractLiteratureData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in scientific literature analysis. Extract key information from this scientific article 
          that would be relevant for an IND submission. Focus on study findings, methods, and conclusions.
          
          Return a JSON object with these keys:
          - article_title
          - authors
          - journal
          - year
          - study_type
          - methods
          - key_findings
          - relevance_to_ind
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key literature information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}. ${document.journal || ''}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting literature data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}. ${document.journal || ''}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Generic data extraction for unknown document types
 *
 * @param {Object} content - Document content
 * @param {Object} document - Document metadata
 * @returns {Promise<Object>} - Extracted data
 */
async function extractGenericData(content, document) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in regulatory document analysis. Extract key information from this document 
          that would be relevant for an IND submission. Focus on relevant findings and information.
          
          Return a JSON object with these keys:
          - document_title
          - document_type
          - key_findings
          - relevance_to_ind
          - sections: [array of extracted sections with title and content]`,
        },
        {
          role: 'user',
          content: `Extract key information from this content:
          
          ${content.text.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(result.choices[0].message.content);

    // Add tables and figures
    extractedData.tables = content.tables;
    extractedData.figures = content.figures;

    // Add reference info
    extractedData.references = [
      {
        id: document.id,
        citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
        document_type: document.document_type,
      },
    ];

    return extractedData;
  } catch (error) {
    logger.error(`Error extracting generic data: ${error.message}`, error);
    return {
      sections: content.sections,
      tables: content.tables,
      figures: content.figures,
      references: [
        {
          id: document.id,
          citation: `${document.author ? document.author + ', ' : ''}${document.year ? document.year + '. ' : ''}${document.title}.`,
          document_type: document.document_type,
        },
      ],
    };
  }
}

/**
 * Map extracted data to IND sections
 *
 * @param {Object} extractedData - Data extracted from document
 * @param {Array} targetSections - Target IND sections
 * @param {string} submissionId - IND submission ID
 * @returns {Promise<Object>} - Mapped sections with content
 */
async function mapDataToSections(extractedData, targetSections, submissionId) {
  try {
    const mappedSections = {};

    // For each target section, map relevant extracted data
    for (const sectionCode of targetSections) {
      const result = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an AI expert in IND submissions. Map the extracted data from a source document 
            to the appropriate content for IND section ${sectionCode}. Format the content as markdown suitable 
            for inclusion in an IND. Include appropriate citations to the source document.
            
            Return a JSON object with:
            {
              "section_code": "${sectionCode}",
              "markdown_content": "The formatted content in markdown",
              "referenced_tables": [indices of relevant tables from the source],
              "referenced_figures": [indices of relevant figures from the source]
            }`,
          },
          {
            role: 'user',
            content: `Map this extracted data to IND section ${sectionCode}:
            
            ${JSON.stringify(extractedData, null, 2)}
            
            Remember to:
            1. Format as professional markdown suitable for an IND
            2. Include appropriate citations to the source document
            3. Reference relevant tables and figures by index if applicable
            4. Organize content logically for section ${sectionCode}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const sectionMapping = JSON.parse(result.choices[0].message.content);
      mappedSections[sectionCode] = sectionMapping;
    }

    return mappedSections;
  } catch (error) {
    logger.error(`Error mapping data to sections: ${error.message}`, error);
    throw error;
  }
}

/**
 * Insert extracted and mapped data into IND blocks
 *
 * @param {Object} mappedSections - Sections with mapped content
 * @param {string} submissionId - IND submission ID
 * @param {Object} document - Source document metadata
 * @returns {Promise<Object>} - Results of insertion
 */
async function insertDataIntoBlocks(mappedSections, submissionId, document) {
  try {
    let insertCount = 0;
    const insertedBlockIds = [];

    // For each mapped section, create blocks
    for (const [sectionCode, mapping] of Object.entries(mappedSections)) {
      // 1. Insert markdown content
      if (mapping.markdown_content) {
        const { data: markdownBlock, error: markdownError } = await supabase
          .from('ind_blocks')
          .insert({
            submission_id: submissionId,
            section_code: sectionCode,
            block_type: 'markdown',
            content: { markdown: mapping.markdown_content },
            created_by: 'data_harvester',
            source_document_id: document.id,
            extraction_timestamp: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (markdownError) {
          logger.error(`Error inserting markdown block: ${markdownError.message}`);
        } else {
          insertCount++;
          insertedBlockIds.push(markdownBlock.id);
        }
      }

      // 2. Insert referenced tables
      if (mapping.referenced_tables && mapping.referenced_tables.length > 0) {
        for (const tableIndex of mapping.referenced_tables) {
          const table = document.tables && document.tables[tableIndex];
          if (table) {
            const { data: tableBlock, error: tableError } = await supabase
              .from('ind_blocks')
              .insert({
                submission_id: submissionId,
                section_code: sectionCode,
                block_type: 'table',
                content: {
                  rows: table.rows,
                  caption: table.caption || `Table from ${document.title}`,
                },
                created_by: 'data_harvester',
                source_document_id: document.id,
                extraction_timestamp: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (tableError) {
              logger.error(`Error inserting table block: ${tableError.message}`);
            } else {
              insertCount++;
              insertedBlockIds.push(tableBlock.id);
            }
          }
        }
      }

      // 3. Insert referenced figures
      if (mapping.referenced_figures && mapping.referenced_figures.length > 0) {
        for (const figureIndex of mapping.referenced_figures) {
          const figure = document.figures && document.figures[figureIndex];
          if (figure) {
            // Upload figure to storage if it has binary data
            let figureUrl = figure.src;

            if (figure.data) {
              // Generate a filename
              const filename = `figures/${submissionId}/${crypto.randomBytes(16).toString('hex')}.png`;

              // Upload to storage
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('ind-assets')
                .upload(filename, figure.data, {
                  contentType: figure.contentType || 'image/png',
                });

              if (uploadError) {
                logger.error(`Error uploading figure: ${uploadError.message}`);
              } else {
                // Get public URL
                const { data: urlData } = await supabase.storage
                  .from('ind-assets')
                  .getPublicUrl(filename);

                figureUrl = urlData.publicUrl;
              }
            }

            // Insert figure block
            if (figureUrl) {
              const { data: figureBlock, error: figureError } = await supabase
                .from('ind_blocks')
                .insert({
                  submission_id: submissionId,
                  section_code: sectionCode,
                  block_type: 'figure',
                  content: {
                    url: figureUrl,
                    caption: figure.caption || figure.alt || `Figure from ${document.title}`,
                    altText: figure.alt || figure.caption || `Figure from ${document.title}`,
                  },
                  created_by: 'data_harvester',
                  source_document_id: document.id,
                  extraction_timestamp: new Date().toISOString(),
                })
                .select('id')
                .single();

              if (figureError) {
                logger.error(`Error inserting figure block: ${figureError.message}`);
              } else {
                insertCount++;
                insertedBlockIds.push(figureBlock.id);
              }
            }
          }
        }
      }
    }

    return {
      insertCount,
      insertedBlockIds,
    };
  } catch (error) {
    logger.error(`Error inserting blocks: ${error.message}`, error);
    throw error;
  }
}

/**
 * Generate knowledge graph entities from extracted data
 *
 * @param {Object} extractedData - Data extracted from document
 * @param {string} submissionId - IND submission ID
 * @param {string} documentId - Source document ID
 * @returns {Promise<boolean>} - Success indicator
 */
async function generateKnowledgeEntities(extractedData, submissionId, documentId) {
  try {
    const result = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an AI expert in pharmaceutical knowledge graphs. Extract key entities from this document data 
          that would be relevant for an IND submission knowledge graph. Focus on drugs, indications, studies, 
          endpoints, biomarkers, and adverse events.
          
          Return a JSON object with arrays of entities:
          {
            "drugs": [{ "name": "...", "type": "...", "properties": {} }],
            "indications": [{ "name": "...", "properties": {} }],
            "studies": [{ "id": "...", "title": "...", "properties": {} }],
            "endpoints": [{ "name": "...", "definition": "...", "properties": {} }],
            "biomarkers": [{ "name": "...", "type": "...", "properties": {} }],
            "adverse_events": [{ "name": "...", "grade": "...", "properties": {} }]
          }`,
        },
        {
          role: 'user',
          content: `Extract knowledge graph entities from this extracted document data:
          
          ${JSON.stringify(extractedData, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const entities = JSON.parse(result.choices[0].message.content);

    // Prepare entities for insertion
    const dbEntities = [];

    // Process each entity type
    for (const [entityType, entityList] of Object.entries(entities)) {
      if (Array.isArray(entityList)) {
        for (const entity of entityList) {
          dbEntities.push({
            submission_id: submissionId,
            document_id: documentId,
            entity_type: entityType,
            entity_name: entity.name || entity.id || entity.title,
            entity_data: entity,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // Insert entities if any were extracted
    if (dbEntities.length > 0) {
      const { error } = await supabase.from('ind_knowledge_entities').insert(dbEntities);

      if (error) {
        logger.error(`Error inserting knowledge entities: ${error.message}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Error generating knowledge entities: ${error.message}`, error);
    return false;
  }
}

/**
 * Get and update the status of a harvesting job
 *
 * @param {string} jobId - ID of the harvesting job
 * @returns {Promise<Object>} - Job status
 */
export async function getHarvestingJobStatus(jobId) {
  try {
    const { data: job, error } = await supabase
      .from('ind_harvesting_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Error fetching job status: ${error.message}`);
    }

    return job;
  } catch (error) {
    logger.error(`Error getting job status: ${error.message}`, error);
    throw error;
  }
}

/**
 * Queue a batch of documents for harvesting
 *
 * @param {Array} documentIds - Array of document IDs
 * @param {string} submissionId - IND submission ID
 * @returns {Promise<Object>} - Queue results
 */
export async function queueDocumentsForHarvesting(documentIds, submissionId) {
  try {
    const jobs = [];

    for (const documentId of documentIds) {
      // Check if document exists
      const { data: document, error: docError } = await supabase
        .from('ind_references')
        .select('id')
        .eq('id', documentId)
        .single();

      if (docError) {
        logger.warn(`Document ${documentId} not found: ${docError.message}`);
        continue;
      }

      // Create a harvesting job
      const { data: job, error: jobError } = await supabase
        .from('ind_harvesting_jobs')
        .insert({
          document_id: documentId,
          submission_id: submissionId,
          status: 'queued',
          queue_time: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobError) {
        logger.error(`Error creating harvesting job: ${jobError.message}`);
        continue;
      }

      jobs.push(job);

      // Process the document in the background
      processDocument(documentId, submissionId).catch(error => {
        logger.error(`Background document processing error: ${error.message}`, error);
      });
    }

    return {
      queued_count: jobs.length,
      job_ids: jobs.map(job => job.id),
    };
  } catch (error) {
    logger.error(`Error queueing documents: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get harvesting statistics for a submission
 *
 * @param {string} submissionId - IND submission ID
 * @returns {Promise<Object>} - Harvesting statistics
 */
export async function getHarvestingStats(submissionId) {
  try {
    // Get job statistics
    const { data: stats, error: statsError } = await supabase.rpc('get_harvesting_stats', {
      submission_id: submissionId,
    });

    if (statsError) {
      throw new Error(`Error getting harvesting stats: ${statsError.message}`);
    }

    // Get affected sections
    const { data: jobs, error: jobsError } = await supabase
      .from('ind_harvesting_jobs')
      .select('sections_affected')
      .eq('submission_id', submissionId)
      .eq('status', 'completed');

    if (jobsError) {
      throw new Error(`Error getting affected sections: ${jobsError.message}`);
    }

    // Aggregate all affected sections
    const allSections = new Set();
    jobs.forEach(job => {
      if (job.sections_affected && Array.isArray(job.sections_affected)) {
        job.sections_affected.forEach(section => allSections.add(section));
      }
    });

    return {
      stats: stats[0] || {
        total_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        queued_jobs: 0,
        processing_jobs: 0,
      },
      affected_sections: Array.from(allSections),
      completion_percentage: stats[0]
        ? Math.round((stats[0].completed_jobs / stats[0].total_jobs) * 100)
        : 0,
    };
  } catch (error) {
    logger.error(`Error getting harvesting stats: ${error.message}`, error);
    throw error;
  }
}

/**
 * Search for harvestable documents
 *
 * @param {Object} filters - Search filters
 * @returns {Promise<Array>} - Matching documents
 */
export async function searchHarvestableDocuments(filters) {
  try {
    let query = supabase.from('ind_references').select('id, title, author, year, document_type');

    // Apply filters
    if (filters.document_type) {
      query = query.eq('document_type', filters.document_type);
    }

    if (filters.search_term) {
      query = query.or(
        `title.ilike.%${filters.search_term}%,author.ilike.%${filters.search_term}%`
      );
    }

    if (filters.year) {
      query = query.eq('year', filters.year);
    }

    // Execute query
    const { data, error } = await query.limit(filters.limit || 100);

    if (error) {
      throw new Error(`Error searching documents: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error(`Error searching documents: ${error.message}`, error);
    throw error;
  }
}

export default {
  processDocument,
  queueDocumentsForHarvesting,
  getHarvestingJobStatus,
  getHarvestingStats,
  searchHarvestableDocuments,
};
