/**
 * Document AI Service
 *
 * This service provides AI-powered document analysis and processing capabilities
 * using OpenAI's GPT-4 model for enhanced document intelligence.
 */

import * as docushare from './docushare.js';
import * as aiUtils from './aiUtils.js';

/**
 * Extract basic info from a PDF buffer
 *
 * @param {Buffer} pdfBuffer - PDF file as a buffer
 * @returns {Promise<string>} - Basic document info
 */
async function extractBasicDocInfo(pdfBuffer) {
  try {
    // In a production environment, we would use a more robust PDF extraction library
    // For now, we'll just return a placeholder string
    const fileSizeKB = Math.round(pdfBuffer.length / 1024);
    return `PDF document of size ${fileSizeKB}KB. [Text extraction placeholder]`;
  } catch (error) {
    console.error('Error extracting info from PDF:', error);
    return 'Failed to extract info from PDF';
  }
}

/**
 * Analyze a document with AI to extract insights
 *
 * @param {string} text - Document text content
 * @param {string} documentName - Name of the document
 * @returns {Promise<Object>} - AI analysis results
 */
async function analyzeDocumentWithAI(text, documentName) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        summary: 'OpenAI API key not configured. AI document analysis unavailable.',
        keywords: ['API', 'configuration', 'required'],
        module: 'unknown',
        documentType: 'unknown',
      };
    }

    // Determine the module context based on the document name
    let module = 'general';
    if (documentName.toLowerCase().includes('csr')) module = 'csr';
    if (documentName.toLowerCase().includes('cer')) module = 'cer';
    if (documentName.toLowerCase().includes('protocol')) module = 'clinical';
    if (documentName.toLowerCase().includes('ind')) module = 'ind';
    if (documentName.toLowerCase().includes('nda')) module = 'nda';

    // Get document summary using aiUtils
    const summary = await aiUtils.generateDocumentSummary(text);

    // Extract keywords using aiUtils
    const keywords = await aiUtils.extractKeywords(text, 10);

    // Analyze document type and context
    const docAnalysis = await aiUtils.analyzeDocumentType(text, documentName);

    // Generate insights
    const insights = await aiUtils.generateDocumentInsights(text);

    return {
      summary: summary,
      keywords: keywords,
      keyPoints: insights.findings || [],
      challenges: insights.challenges || [],
      recommendations: insights.recommendations || [],
      module,
      documentType: docAnalysis.documentType || 'unknown',
      regulatoryContext: docAnalysis.regulatoryContext || 'unknown',
      therapeuticArea: docAnalysis.therapeuticArea || 'unknown',
      name: documentName,
    };
  } catch (error) {
    console.error('Error analyzing document with AI:', error);

    // Return a fallback response when AI processing fails
    return {
      summary: 'AI analysis unavailable. Check logs for details.',
      keywords: ['analysis', 'error'],
      module: 'general',
      documentType: 'unknown',
      name: documentName,
    };
  }
}

/**
 * Process and store a document with AI analysis
 *
 * @param {Buffer} fileBuffer - Document file buffer
 * @param {string} fileName - Original file name
 * @param {string} folder - Target folder in DocuShare
 * @returns {Promise<Object>} - Processing result with metadata
 */
export async function processAndStore(fileBuffer, fileName, folder = 'drafts') {
  try {
    // Extract basic document info
    const extractedText = await extractBasicDocInfo(fileBuffer);

    // Analyze the document with AI
    const analysisResult = await analyzeDocumentWithAI(extractedText, fileName);

    // Upload to DocuShare with metadata
    const uploadResult = await docushare.upload(fileBuffer, fileName, folder, {
      ai_processed: true,
      ai_summary: analysisResult.summary,
      document_type: analysisResult.documentType,
      module_context: analysisResult.module,
    });

    // Return the combined result
    return {
      ...analysisResult,
      objectId: uploadResult.objectId,
      uploadSuccess: true,
    };
  } catch (error) {
    console.error('Error in processAndStore:', error);
    throw new Error(`Failed to process document: ${error.message}`);
  }
}

export default { processAndStore };
