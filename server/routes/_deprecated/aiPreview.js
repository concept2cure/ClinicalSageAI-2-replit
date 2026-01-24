/**
 * AI Preview Routes
 *
 * Provides instant document analysis during upload preview,
 * enhancing the user experience with immediate AI insights.
 */

import { Router } from 'express';
import aiUtils from '../services/aiUtils.js';

const router = Router();

/**
 * POST /api/ai/preview - Analyze a document before upload
 *
 * Accepts a base64-encoded document and returns AI-generated insights
 * including summary, document type, regulatory context, and keywords.
 *
 * @param {Object} req.body.base64 - Base64-encoded document data
 */
router.post('/api/ai/preview', async (req, res) => {
  try {
    const { base64, filename, mimeType } = req.body;

    if (!base64) {
      return res.status(400).json({
        success: false,
        message: 'Missing document data',
      });
    }

    // Decode base64 document
    const buffer = Buffer.from(base64.split(',')[1] || base64, 'base64');

    // For text-based files, convert buffer to text
    let text = '';
    if (mimeType?.startsWith('text/') || mimeType === 'application/json') {
      text = buffer.toString('utf8');
    } else {
      // Extract text from non-text documents
      // This would require specialized parsing based on the document type
      // For now, we'll assume PDF and use a simple text extraction technique

      // In a real implementation, use appropriate parsing libraries based on mimeType
      // This is a simplified placeholder
      text = buffer.toString('utf8').replace(/[\x00-\x1F\x7F-\xFF]/g, ' ');
    }

    // If text is too large, truncate it
    const maxLength = 10000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    // Generate document insights in parallel
    const [summary, documentType, keywords] = await Promise.all([
      aiUtils.generateDocumentSummary(text),
      aiUtils.analyzeDocumentType(text, filename || ''),
      aiUtils.extractKeywords(text),
    ]);

    // Return AI insights
    res.json({
      success: true,
      preview: {
        summary,
        document_type: documentType.type,
        regulatory_context: documentType.context,
        keywords,
        character_count: text.length,
        filename: filename || 'Unnamed document',
      },
    });
  } catch (error) {
    console.error('AI preview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing document',
      error: error.message,
    });
  }
});

export default router;
