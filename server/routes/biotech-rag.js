/**
 * Biotech AI Intelligence RAG API Routes
 * Production-ready endpoints for document ingestion, search, and knowledge synthesis
 */

import { Router } from 'express';
import { z } from 'zod';
import ragService from '../services/biotechRagService.js';
import { db } from '../db';
import crypto from 'crypto';
import {
  ragDocuments,
  ragChunks,
  ragQueries,
  ragKnowledgeGraph,
  ragIngestionJobs
} from '@shared/schema';
import { eq, desc, and, sql, gte } from 'drizzle-orm';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/html',
      'text/csv',
      'application/json'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`));
    }
  }
});

// Rate limiters removed - can be re-enabled when express-rate-limit issue is resolved
// const searchLimiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 1 minute
//   max: 30, // 30 searches per minute
//   message: 'Too many search requests, please try again later'
// });

// const uploadLimiter = rateLimit({
//   windowMs: 5 * 60 * 1000, // 5 minutes
//   max: 10, // 10 uploads per 5 minutes
//   message: 'Too many document uploads, please try again later'
// });

// Validation schemas
const DocumentIngestionSchema = z.object({
  title: z.string().min(1).max(500),
  documentType: z.enum([
    'pdf', 'word', 'csr', 'protocol', 'regulatory',
    'patent', 'literature', 'clinical_report', 'ind', 'nda'
  ]),
  organizationId: z.number().optional(),
  therapeuticArea: z.string().optional(),
  indication: z.string().optional(),
  phase: z.string().optional(),
  compound: z.string().optional(),
  sponsor: z.string().optional(),
  confidential: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

const SearchQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  topK: z.number().min(1).max(100).optional().default(10),
  minScore: z.number().min(0).max(1).optional().default(0.5),
  searchMode: z.enum(['semantic', 'keyword', 'hybrid']).optional().default('hybrid'),
  filters: z.object({
    documentType: z.string().optional(),
    therapeuticArea: z.string().optional(),
    indication: z.string().optional(),
    compound: z.string().optional(),
    dateRange: z.object({
      from: z.string().optional(),
      to: z.string().optional()
    }).optional()
  }).optional(),
  includeGraph: z.boolean().optional().default(false),
  organizationId: z.number().optional()
});

const MultiDocumentSynthesisSchema = z.object({
  query: z.string().min(1).max(1000),
  documentIds: z.array(z.string()).min(1).max(20),
  organizationId: z.number().optional()
});

const ProtocolAnalysisSchema = z.object({
  documentId: z.string(),
  analysisType: z.enum([
    'endpoints', 'inclusion_criteria', 'exclusion_criteria',
    'safety', 'efficacy', 'sample_size', 'statistical_plan'
  ]),
  organizationId: z.number().optional()
});

const BiomarkerCorrelationSchema = z.object({
  biomarkers: z.array(z.string()).min(2).max(10),
  indication: z.string().optional(),
  organizationId: z.number().optional()
});

/**
 * Document ingestion endpoint
 */
router.post('/ingest', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file provided' });
    }

    const params = DocumentIngestionSchema.parse(req.body);
    
    // Default to organization 7 if not provided
    const organizationId = params.organizationId || 7;

    const result = await ragService.ingestDocument({
      organizationId,
      title: params.title,
      documentType: params.documentType,
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata: {
        therapeuticArea: params.therapeuticArea,
        indication: params.indication,
        phase: params.phase,
        compound: params.compound,
        sponsor: params.sponsor,
        confidential: params.confidential,
        ...params.metadata
      }
    });

    res.json({
      success: true,
      documentId: result.documentId,
      status: result.status,
      chunksProcessed: result.chunksProcessed,
      entities: result.entities,
      message: 'Document successfully ingested and indexed'
    });

  } catch (error) {
    console.error('Document ingestion error:', error);
    res.status(500).json({
      error: 'Failed to ingest document',
      details: error.message
    });
  }
});

/**
 * Batch document ingestion
 */
router.post('/ingest/batch', upload.array('documents', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No documents provided' });
    }

    const organizationId = req.body.organizationId || 7;
    const results = [];

    for (const file of req.files) {
      try {
        const result = await ragService.ingestDocument({
          organizationId,
          title: file.originalname,
          documentType: req.body.documentType || 'pdf',
          fileBuffer: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          metadata: req.body.metadata || {}
        });
        
        results.push({
          fileName: file.originalname,
          success: true,
          documentId: result.documentId,
          status: result.status
        });
      } catch (error) {
        results.push({
          fileName: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      totalDocuments: req.files.length,
      successfulIngestions: results.filter(r => r.success).length,
      results
    });

  } catch (error) {
    console.error('Batch ingestion error:', error);
    res.status(500).json({
      error: 'Failed to process batch ingestion',
      details: error.message
    });
  }
});

/**
 * Semantic search endpoint
 */
router.post('/search', async (req, res) => {
  try {
    const params = SearchQuerySchema.parse(req.body);
    const organizationId = params.organizationId || 7;

    const searchResults = await ragService.search(params.query, {
      organizationId,
      topK: params.topK,
      minScore: params.minScore,
      searchMode: params.searchMode,
      filters: params.filters,
      includeGraph: params.includeGraph
    });

    res.json({
      success: true,
      ...searchResults,
      searchParams: params
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

/**
 * Question answering endpoint
 */
router.post('/ask', async (req, res) => {
  try {
    const { query, organizationId = 7, maxTokens = 1000 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Search for relevant context
    const searchResults = await ragService.search(query, {
      organizationId,
      topK: 5,
      searchMode: 'hybrid'
    });

    // Extract context from top results
    const context = searchResults.results
      .map(r => r.content)
      .join('\n\n');

    // Generate answer
    const answer = await ragService.generateAnswer(query, context, { maxTokens });

    res.json({
      success: true,
      query,
      answer: answer.answer,
      confidence: answer.confidence,
      sources: searchResults.results.map(r => ({
        documentId: r.documentId,
        documentTitle: r.documentTitle,
        section: r.section,
        relevanceScore: r.score
      })),
      responseMetadata: {
        model: answer.model,
        usage: answer.usage
      }
    });

  } catch (error) {
    console.error('Q&A error:', error);
    res.status(500).json({
      error: 'Failed to generate answer',
      details: error.message
    });
  }
});

/**
 * Multi-document synthesis endpoint
 */
router.post('/synthesize', async (req, res) => {
  try {
    const params = MultiDocumentSynthesisSchema.parse(req.body);
    const organizationId = params.organizationId || 7;

    const synthesis = await ragService.synthesizeDocuments(
      params.query,
      params.documentIds,
      organizationId
    );

    res.json({
      success: true,
      ...synthesis
    });

  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({
      error: 'Failed to synthesize documents',
      details: error.message
    });
  }
});

/**
 * Clinical trial protocol analysis
 */
router.post('/analyze/protocol', async (req, res) => {
  try {
    const params = ProtocolAnalysisSchema.parse(req.body);
    const organizationId = params.organizationId || 7;

    // Get document chunks
    const chunks = await db.select()
      .from(ragChunks)
      .innerJoin(ragDocuments, eq(ragChunks.documentId, ragDocuments.id))
      .where(and(
        eq(ragDocuments.documentId, params.documentId),
        eq(ragDocuments.organizationId, organizationId)
      ))
      .limit(50);

    if (chunks.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Prepare analysis prompt based on type
    const analysisPrompts = {
      endpoints: 'Extract and analyze all primary and secondary endpoints',
      inclusion_criteria: 'List and categorize all inclusion criteria',
      exclusion_criteria: 'List and categorize all exclusion criteria',
      safety: 'Analyze safety monitoring plans and stopping rules',
      efficacy: 'Analyze efficacy measures and success criteria',
      sample_size: 'Extract sample size calculations and power analysis',
      statistical_plan: 'Summarize the statistical analysis plan'
    };

    const context = chunks.map(c => c.rag_chunks.content).join('\n');
    const prompt = `${analysisPrompts[params.analysisType]} from this clinical trial protocol:\n\n${context}`;

    const analysis = await ragService.generateAnswer(prompt, context, {
      maxTokens: 2000
    });

    res.json({
      success: true,
      documentId: params.documentId,
      analysisType: params.analysisType,
      analysis: analysis.answer,
      confidence: analysis.confidence,
      metadata: {
        chunksAnalyzed: chunks.length,
        documentTitle: chunks[0]?.rag_documents.title
      }
    });

  } catch (error) {
    console.error('Protocol analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze protocol',
      details: error.message
    });
  }
});

/**
 * Regulatory document Q&A
 */
router.post('/regulatory/qa', async (req, res) => {
  try {
    const { question, documentType = 'regulatory', organizationId = 7 } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Search regulatory documents
    const searchResults = await ragService.search(question, {
      organizationId,
      topK: 5,
      filters: { documentType },
      searchMode: 'hybrid'
    });

    const context = searchResults.results.map(r => r.content).join('\n\n');
    
    const systemPrompt = `You are a regulatory affairs expert. Answer questions about FDA, EMA, and other regulatory requirements based on the provided regulatory documents.`;
    
    const answer = await ragService.generateAnswer(
      question,
      context,
      { maxTokens: 1500, systemPrompt }
    );

    res.json({
      success: true,
      question,
      answer: answer.answer,
      sources: searchResults.results.map(r => ({
        documentTitle: r.documentTitle,
        section: r.section,
        relevance: r.score
      })),
      confidence: answer.confidence
    });

  } catch (error) {
    console.error('Regulatory Q&A error:', error);
    res.status(500).json({
      error: 'Failed to answer regulatory question',
      details: error.message
    });
  }
});

/**
 * Drug interaction checking
 */
router.post('/interactions/check', async (req, res) => {
  try {
    const { drugs, organizationId = 7 } = req.body;

    if (!drugs || drugs.length < 2) {
      return res.status(400).json({ 
        error: 'At least two drugs are required for interaction checking' 
      });
    }

    // Search for drug interaction information
    const query = `drug interactions between ${drugs.join(' and ')}`;
    const searchResults = await ragService.search(query, {
      organizationId,
      topK: 10,
      includeGraph: true
    });

    // Check knowledge graph for direct relationships
    const graphInteractions = searchResults.graphResults?.filter(g =>
      g.relationshipType === 'interacts_with' ||
      g.relationshipType === 'contraindicated_with'
    ) || [];

    // Generate comprehensive interaction analysis
    const context = searchResults.results.map(r => r.content).join('\n');
    const interactionPrompt = `Analyze potential drug-drug interactions between ${drugs.join(', ')}. Include mechanism, severity, and clinical recommendations.`;
    
    const analysis = await ragService.generateAnswer(interactionPrompt, context, {
      maxTokens: 1500
    });

    res.json({
      success: true,
      drugs,
      interactions: graphInteractions,
      analysis: analysis.answer,
      sources: searchResults.results.slice(0, 5).map(r => ({
        documentTitle: r.documentTitle,
        relevance: r.score
      })),
      severity: graphInteractions.length > 0 ? 'high' : 'moderate'
    });

  } catch (error) {
    console.error('Drug interaction check error:', error);
    res.status(500).json({
      error: 'Failed to check drug interactions',
      details: error.message
    });
  }
});

/**
 * Biomarker correlation finder
 */
router.post('/biomarkers/correlate', async (req, res) => {
  try {
    const params = BiomarkerCorrelationSchema.parse(req.body);
    const organizationId = params.organizationId || 7;

    // Search for biomarker relationships
    const correlations = [];
    
    for (let i = 0; i < params.biomarkers.length - 1; i++) {
      for (let j = i + 1; j < params.biomarkers.length; j++) {
        const query = `${params.biomarkers[i]} ${params.biomarkers[j]} correlation ${params.indication || ''}`;
        
        const results = await ragService.search(query, {
          organizationId,
          topK: 3,
          includeGraph: true
        });

        if (results.results.length > 0) {
          correlations.push({
            biomarker1: params.biomarkers[i],
            biomarker2: params.biomarkers[j],
            evidence: results.results[0].content.slice(0, 200),
            confidence: results.results[0].score,
            sources: results.results.length
          });
        }
      }
    }

    // Check knowledge graph
    const graphData = await db.select()
      .from(ragKnowledgeGraph)
      .where(and(
        eq(ragKnowledgeGraph.organizationId, organizationId),
        eq(ragKnowledgeGraph.entityType, 'biomarker')
      ))
      .limit(100);

    res.json({
      success: true,
      biomarkers: params.biomarkers,
      indication: params.indication,
      correlations: correlations.sort((a, b) => b.confidence - a.confidence),
      graphRelationships: graphData.length,
      summary: `Found ${correlations.length} potential correlations among ${params.biomarkers.length} biomarkers`
    });

  } catch (error) {
    console.error('Biomarker correlation error:', error);
    res.status(500).json({
      error: 'Failed to find biomarker correlations',
      details: error.message
    });
  }
});

/**
 * Literature review automation
 */
router.post('/literature/review', async (req, res) => {
  try {
    const { topic, maxPapers = 20, organizationId = 7 } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    // Search for literature documents
    const searchResults = await ragService.search(topic, {
      organizationId,
      topK: maxPapers,
      filters: { documentType: 'literature' },
      searchMode: 'hybrid'
    });

    // Group by document for review
    const documentMap = new Map();
    searchResults.results.forEach(result => {
      if (!documentMap.has(result.documentId)) {
        documentMap.set(result.documentId, {
          documentId: result.documentId,
          title: result.documentTitle,
          relevantSections: []
        });
      }
      documentMap.get(result.documentId).relevantSections.push({
        content: result.content.slice(0, 300),
        score: result.score
      });
    });

    // Generate literature review summary
    const context = searchResults.results.map(r => r.content).join('\n\n');
    const reviewPrompt = `Generate a systematic literature review summary on: ${topic}`;
    
    const review = await ragService.generateAnswer(reviewPrompt, context, {
      maxTokens: 2500
    });

    res.json({
      success: true,
      topic,
      review: review.answer,
      papers: Array.from(documentMap.values()),
      totalPapers: documentMap.size,
      metadata: {
        searchMode: 'hybrid',
        maxPapers
      }
    });

  } catch (error) {
    console.error('Literature review error:', error);
    res.status(500).json({
      error: 'Failed to generate literature review',
      details: error.message
    });
  }
});

/**
 * Patent landscape analysis
 */
router.post('/patents/landscape', async (req, res) => {
  try {
    const { compound, indication, organizationId = 7 } = req.body;

    if (!compound && !indication) {
      return res.status(400).json({ 
        error: 'Either compound or indication is required' 
      });
    }

    const query = `patent ${compound || ''} ${indication || ''} claims prior art`;
    
    // Search patent documents
    const searchResults = await ragService.search(query, {
      organizationId,
      topK: 15,
      filters: { documentType: 'patent' },
      includeGraph: true
    });

    // Analyze patent landscape
    const patentData = searchResults.results.map(r => ({
      relevance: r.score,
      excerpt: r.content.slice(0, 200),
      entities: r.metadata?.entities || {}
    }));

    // Generate landscape analysis
    const context = searchResults.results.map(r => r.content).join('\n');
    const analysisPrompt = `Analyze the patent landscape for ${compound || indication}, including freedom to operate, competitive positioning, and white spaces.`;
    
    const analysis = await ragService.generateAnswer(analysisPrompt, context, {
      maxTokens: 2000
    });

    res.json({
      success: true,
      query: { compound, indication },
      patentsAnalyzed: searchResults.results.length,
      landscapeAnalysis: analysis.answer,
      keyPatents: patentData.slice(0, 5),
      graphRelationships: searchResults.graphResults?.length || 0,
      recommendations: {
        freedomToOperate: searchResults.results.length < 5 ? 'high' : 'moderate',
        patentStrategy: searchResults.results.length < 3 ? 'offensive' : 'defensive'
      }
    });

  } catch (error) {
    console.error('Patent landscape error:', error);
    res.status(500).json({
      error: 'Failed to analyze patent landscape',
      details: error.message
    });
  }
});

/**
 * Get document status and metadata
 */
router.get('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const organizationId = parseInt(req.query.organizationId) || 7;

    const [document] = await db.select()
      .from(ragDocuments)
      .where(and(
        eq(ragDocuments.documentId, documentId),
        eq(ragDocuments.organizationId, organizationId)
      ));

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get chunk statistics
    const chunks = await db.select({
      count: sql`count(*)`,
      avgTokens: sql`avg(token_count)`,
      totalEntities: sql`count(distinct entities)`
    })
    .from(ragChunks)
    .where(eq(ragChunks.documentId, document.id));

    res.json({
      success: true,
      document: {
        ...document,
        statistics: chunks[0]
      }
    });

  } catch (error) {
    console.error('Document retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve document',
      details: error.message
    });
  }
});

/**
 * List all documents
 */
router.get('/documents', async (req, res) => {
  try {
    const organizationId = parseInt(req.query.organizationId) || 7;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const documents = await db.select()
      .from(ragDocuments)
      .where(eq(ragDocuments.organizationId, organizationId))
      .orderBy(desc(ragDocuments.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db.select({ count: sql`count(*)` })
      .from(ragDocuments)
      .where(eq(ragDocuments.organizationId, organizationId));

    res.json({
      success: true,
      documents,
      pagination: {
        total: total[0].count,
        limit,
        offset,
        hasMore: offset + documents.length < total[0].count
      }
    });

  } catch (error) {
    console.error('Document listing error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      details: error.message
    });
  }
});

/**
 * Get query history and analytics
 */
router.get('/analytics/queries', async (req, res) => {
  try {
    const organizationId = parseInt(req.query.organizationId) || 7;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const queries = await db.select({
      date: sql`date(created_at)`,
      count: sql`count(*)`,
      avgResponseTime: sql`avg(response_time)`,
      uniqueUsers: sql`count(distinct user_id)`
    })
    .from(ragQueries)
    .where(and(
      eq(ragQueries.organizationId, organizationId),
      gte(ragQueries.createdAt, startDate)
    ))
    .groupBy(sql`date(created_at)`)
    .orderBy(desc(sql`date(created_at)`));

    // Get top queries
    const topQueries = await db.select({
      query: ragQueries.query,
      count: sql`count(*)`,
      avgResponseTime: sql`avg(response_time)`
    })
    .from(ragQueries)
    .where(and(
      eq(ragQueries.organizationId, organizationId),
      gte(ragQueries.createdAt, startDate)
    ))
    .groupBy(ragQueries.query)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

    res.json({
      success: true,
      analytics: {
        dailyStats: queries,
        topQueries,
        period: `Last ${days} days`
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      details: error.message
    });
  }
});

/**
 * Ingest regulatory sources endpoint
 * Crawls and ingests documents from FDA, EMA, ICH, WHO
 */
router.post('/ingest/regulatory-sources', async (req, res) => {
  try {
    const { 
      sources = ['FDA', 'EMA'], 
      documentTypes = ['guidances', 'warning_letters', 'epar'],
      limit = 10,
      organizationId = 7
    } = req.body;

    // Import regulatory crawler service
    const RegulatoryCrawler = (await import('../services/regulatoryCrawler.js')).default;
    const crawler = new RegulatoryCrawler();
    
    const results = {
      totalQueued: 0,
      sources: []
    };

    // Process each source
    for (const source of sources) {
      let sourceResult = { source, documentsQueued: 0, error: null };
      
      try {
        switch(source.toUpperCase()) {
          case 'FDA':
            const fdaResult = await crawler.crawlFDA({
              types: documentTypes.filter(t => ['guidances', 'warning_letters', 'approvals'].includes(t)),
              limit,
              organizationId
            });
            sourceResult.documentsQueued = fdaResult.documentsQueued || 0;
            sourceResult.documents = fdaResult.documents;
            break;
            
          case 'EMA':
            const emaResult = await crawler.crawlEMA({
              types: documentTypes.filter(t => ['epar', 'scientific_guidelines'].includes(t)),
              limit,
              organizationId
            });
            sourceResult.documentsQueued = emaResult.documentsQueued || 0;
            sourceResult.documents = emaResult.documents;
            break;
            
          case 'ICH':
            const ichResult = await crawler.crawlICH({
              types: ['quality', 'safety', 'efficacy'],
              limit,
              organizationId
            });
            sourceResult.documentsQueued = ichResult.documentsQueued || 0;
            sourceResult.documents = ichResult.documents;
            break;
            
          case 'WHO':
            const whoResult = await crawler.crawlWHO({
              types: ['prequalification', 'guidelines'],
              limit,
              organizationId
            });
            sourceResult.documentsQueued = whoResult.documentsQueued || 0;
            sourceResult.documents = whoResult.documents;
            break;
            
          default:
            sourceResult.error = `Unknown source: ${source}`;
        }
        
        results.totalQueued += sourceResult.documentsQueued;
      } catch (error) {
        sourceResult.error = error.message;
      }
      
      results.sources.push(sourceResult);
    }

    res.json({
      success: true,
      message: 'Regulatory sources crawl initiated',
      totalDocumentsQueued: results.totalQueued,
      sources: results.sources
    });

  } catch (error) {
    console.error('Regulatory sources ingestion error:', error);
    res.status(500).json({
      error: 'Failed to ingest regulatory sources',
      details: error.message
    });
  }
});

/**
 * Train/Bulk processing endpoint
 * Processes multiple documents in batch for training
 */
router.post('/train', async (req, res) => {
  try {
    const { 
      documentIds = [],
      documentType = 'csr',
      processingMode = 'full', // full, incremental, update
      organizationId = 7,
      options = {}
    } = req.body;

    // Create ingestion jobs for training
    const jobs = [];
    
    if (documentIds.length > 0) {
      // Process specific documents
      for (const docId of documentIds) {
        const jobId = `train_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const job = {
          id: crypto.randomUUID(),
          organizationId,
          jobId,
          jobType: 'batch',
          documentType,
          status: 'queued',
          priority: 8, // Higher priority for training
          metadata: {
            processingMode,
            sourceDocumentId: docId,
            ...options
          }
        };
        
        await db.insert(ragIngestionJobs).values(job);
        jobs.push(jobId);
      }
    } else {
      // Process all documents of type
      const documents = await db.select()
        .from(ragDocuments)
        .where(and(
          eq(ragDocuments.organizationId, organizationId),
          eq(ragDocuments.documentType, documentType),
          eq(ragDocuments.processingStatus, 'unprocessed')
        ))
        .limit(100);
      
      for (const doc of documents) {
        const jobId = `train_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const job = {
          id: crypto.randomUUID(),
          organizationId,
          jobId,
          jobType: 'batch',
          documentId: doc.id,
          documentType: doc.document_type,
          status: 'queued',
          priority: 8,
          metadata: {
            processingMode,
            ...options
          }
        };
        
        await db.insert(ragIngestionJobs).values(job);
        jobs.push(jobId);
      }
    }

    // Start processing jobs asynchronously
    setImmediate(async () => {
      for (const jobId of jobs) {
        try {
          await ragService.processTrainingJob(jobId);
        } catch (error) {
          console.error(`Failed to process training job ${jobId}:`, error);
        }
      }
    });

    res.json({
      success: true,
      message: 'Training pipeline initiated',
      jobsCreated: jobs.length,
      jobIds: jobs,
      estimatedTime: `${Math.ceil(jobs.length * 2)} minutes`,
      status: 'processing'
    });

  } catch (error) {
    console.error('Training pipeline error:', error);
    res.status(500).json({
      error: 'Failed to initiate training pipeline',
      details: error.message
    });
  }
});

/**
 * Get training/processing status
 */
router.get('/train/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const [job] = await db.select()
      .from(ragIngestionJobs)
      .where(eq(ragIngestionJobs.jobId, jobId));
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      progress: job.progress || 0,
      progressMessage: job.progressMessage,
      stages: job.stages,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      processingTime: job.processingTime,
      chunksProcessed: job.chunksProcessed,
      entitiesExtracted: job.entitiesExtracted,
      error: job.error
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to retrieve job status',
      details: error.message
    });
  }
});

/**
 * Export search results
 */
router.post('/export/results', async (req, res) => {
  try {
    const { queryId, format = 'json' } = req.body;

    const [query] = await db.select()
      .from(ragQueries)
      .where(eq(ragQueries.queryId, queryId));

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    if (format === 'json') {
      res.json({
        query: query.query,
        results: query.results,
        metadata: {
          createdAt: query.createdAt,
          responseTime: query.responseTime,
          resultsCount: query.resultsCount
        }
      });
    } else if (format === 'csv') {
      // Generate CSV format
      const csv = [
        'Document Title,Section,Score,Content Excerpt',
        ...(query.results || []).map(r =>
          `"${r.documentTitle}","${r.section || ''}",${r.score},"${r.content?.slice(0, 100)}"`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="search_results_${queryId}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Invalid export format' });
    }

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export results',
      details: error.message
    });
  }
});

export default router;