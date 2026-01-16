/**
 * Smart References & Asset Library API Routes
 * Backend services for intelligent document linking and TFL extraction
 */

import express from 'express';
import { db } from '../db';
import { documents } from '@shared/schema';
import { eq, and, like, or, desc, sql } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

/**
 * GET /api/smart-refs/:documentId
 * Get intelligent cross-references for a document
 */
router.get('/smart-refs/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const organizationId = Number((req as any).organizationId);

    // Get current document
    const [currentDoc] = await db
      .select()
      .from(documents)
      .where(and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId)
      ))
      .limit(1);

    if (!currentDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get all other documents in organization
    const allDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        module: documents.module,
        documentType: documents.documentType,
        content: documents.content,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt
      })
      .from(documents)
      .where(and(
        eq(documents.organizationId, organizationId),
        sql`${documents.id} != ${documentId}`
      ))
      .orderBy(desc(documents.updatedAt))
      .limit(100);

    // Calculate relevance scores
    const scoredRefs = allDocs.map(doc => {
      const relevance = calculateRelevanceScore(currentDoc, doc);
      return {
        ...doc,
        relevance,
        content: undefined // Don't send full content to client
      };
    }).filter(ref => ref.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20);

    res.json({
      success: true,
      references: scoredRefs,
      currentDocument: {
        id: currentDoc.id,
        title: currentDoc.title,
        module: currentDoc.module
      }
    });

  } catch (error) {
    console.error('Smart refs error:', error);
    res.status(500).json({ error: 'Failed to generate smart references' });
  }
});

/**
 * GET /api/assets
 * Get Tables, Figures, Listings from document vault
 * NOTE: documentAssets table not yet created - this is a placeholder
 */
router.get('/assets', async (req, res) => {
  try {
    const organizationId = Number((req as any).organizationId);
    const { type, search, limit = 50 } = req.query;

    // TODO: Implement when documentAssets table is created
    // For now, return empty array (frontend has fallback defaults)
    res.json({
      success: true,
      assets: [],
      count: 0
    });

  } catch (error) {
    console.error('Assets fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

/**
 * POST /api/assets/extract
 * Extract tables/figures/listings from uploaded document
 * NOTE: documentAssets table not yet created - placeholder implementation
 */
router.post('/assets/extract', async (req, res) => {
  try {
    const { documentId } = req.body;
    const organizationId = Number((req as any).organizationId);

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    // Get document
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId)
      ))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Extract assets from document content
    const extractedAssets = await extractAssetsFromText(doc.content, doc);

    // TODO: Insert into documentAssets table when created
    // For now, just return the extracted data
    res.json({
      success: true,
      extracted: extractedAssets.length,
      assets: extractedAssets
    });

  } catch (error) {
    console.error('Asset extraction error:', error);
    res.status(500).json({ error: 'Failed to extract assets' });
  }
});

/**
 * POST /api/smart-refs/recent
 * Track recently used references
 * NOTE: documentReferences table not yet created - placeholder
 */
router.post('/smart-refs/recent', async (req, res) => {
  try {
    const { documentId, referencedDocId } = req.body;
    const organizationId = Number((req as any).organizationId);

    if (!documentId || !referencedDocId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // TODO: Implement when documentReferences table is created
    res.json({ success: true });

  } catch (error) {
    console.error('Reference tracking error:', error);
    res.status(500).json({ error: 'Failed to track reference' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate relevance score between two documents
 */
function calculateRelevanceScore(currentDoc, candidateDoc) {
  let score = 0;

  // 1. Same module (+5 points)
  if (currentDoc.module && candidateDoc.module && 
      currentDoc.module === candidateDoc.module) {
    score += 5;
  }

  // 2. Same document type (+3 points)
  if (currentDoc.documentType && candidateDoc.documentType &&
      currentDoc.documentType === candidateDoc.documentType) {
    score += 3;
  }

  // 3. Keyword overlap in title (+1 per match)
  const currentKeywords = extractKeywords(currentDoc.title + ' ' + (currentDoc.content || '').substring(0, 500));
  const candidateKeywords = extractKeywords(candidateDoc.title + ' ' + (candidateDoc.content || '').substring(0, 500));
  
  const commonKeywords = currentKeywords.filter(kw => candidateKeywords.includes(kw));
  score += commonKeywords.length;

  // 4. Recency bonus (newer docs are more relevant)
  const daysSinceUpdate = (Date.now() - new Date(candidateDoc.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 7) score += 2;
  else if (daysSinceUpdate < 30) score += 1;

  return score;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];
  
  const keywords = [
    'study', 'trial', 'clinical', 'protocol', 'report', 'summary',
    'efficacy', 'safety', 'adverse', 'endpoint', 'analysis',
    'patient', 'subject', 'treatment', 'control', 'placebo',
    'phase', 'multicenter', 'randomized', 'double-blind',
    'primary', 'secondary', 'exploratory', 'pharmacokinetic',
    'pharmacodynamic', 'toxicology', 'nonclinical', 'cmc'
  ];

  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw));
}

/**
 * Extract tables, figures, listings from document text
 */
async function extractAssetsFromText(content, document) {
  if (!content) return [];

  const assets = [];
  const lines = content.split('\n');

  // Regex patterns for TFL detection
  const tablePattern = /table\s+(\d+\.[\d.]*)\s*[-–—:]\s*(.+?)(?=\n|$)/gi;
  const figurePattern = /figure\s+(\d+\.[\d.]*)\s*[-–—:]\s*(.+?)(?=\n|$)/gi;
  const listingPattern = /listing\s+(\d+\.[\d.]*)\s*[-–—:]\s*(.+?)(?=\n|$)/gi;

  // Extract tables
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    const number = match[1];
    const title = match[2].trim();
    const startIndex = match.index;
    
    // Extract content (next 500 chars or until next heading)
    const contentSnippet = content.substring(startIndex, startIndex + 1000)
      .split('\n')
      .slice(0, 20)
      .join('\n');

    assets.push({
      type: 'table',
      number,
      title: `Table ${number} - ${title}`,
      content: contentSnippet,
      page: null // Would need PDF parsing for page numbers
    });
  }

  // Extract figures
  while ((match = figurePattern.exec(content)) !== null) {
    const number = match[1];
    const title = match[2].trim();
    
    assets.push({
      type: 'figure',
      number,
      title: `Figure ${number} - ${title}`,
      content: `[Image placeholder: ${title}]`,
      page: null
    });
  }

  // Extract listings
  while ((match = listingPattern.exec(content)) !== null) {
    const number = match[1];
    const title = match[2].trim();
    const startIndex = match.index;
    
    const contentSnippet = content.substring(startIndex, startIndex + 1000)
      .split('\n')
      .slice(0, 20)
      .join('\n');

    assets.push({
      type: 'listing',
      number,
      title: `Listing ${number} - ${title}`,
      content: contentSnippet,
      page: null
    });
  }

  return assets;
}

export default router;
