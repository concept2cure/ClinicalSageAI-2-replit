/**
 * Regulatory Document Crawler Service
 * 
 * Handles crawling, fetching, and processing of regulatory documents from
 * FDA, EMA, ICH, WHO, and other regulatory agencies.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { db } from '../db';
import { ragDocuments, ragSources, ragIngestionJobs } from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import pdfParse from 'pdf-parse';
import ragService from './biotechRagService.js';

class RegulatoryCrawlerService {
  constructor() {
    this.crawlers = {
      fda: new FDACrawler(),
      ema: new EMACrawler(),
      ich: new ICHCrawler(),
      who: new WHOCrawler()
    };
    
    this.queue = [];
    this.isProcessing = false;
    this.maxConcurrent = 3;
    this.retryLimit = 3;
    this.rateLimitDelay = 2000; // 2 seconds between requests
    
    // Cache for recently processed documents
    this.processedCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Initialize scheduled crawling jobs
   */
  initializeScheduledCrawling() {
    // Daily crawl at 2 AM for FDA updates
    cron.schedule('0 2 * * *', async () => {
      console.log('Starting scheduled FDA crawl');
      await this.crawlFDA({
        types: ['guidances', 'warning_letters', 'approvals'],
        limit: 20
      });
    });

    // Weekly crawl for EMA (Sundays at 3 AM)
    cron.schedule('0 3 * * 0', async () => {
      console.log('Starting scheduled EMA crawl');
      await this.crawlEMA({
        types: ['epar', 'scientific_guidelines'],
        limit: 15
      });
    });

    // Bi-weekly crawl for ICH (1st and 15th of month at 4 AM)
    cron.schedule('0 4 1,15 * *', async () => {
      console.log('Starting scheduled ICH crawl');
      await this.crawlICH({
        types: ['quality', 'safety', 'efficacy', 'multidisciplinary'],
        limit: 10
      });
    });

    // Monthly crawl for WHO (1st of month at 5 AM)
    cron.schedule('0 5 1 * *', async () => {
      console.log('Starting scheduled WHO crawl');
      await this.crawlWHO({
        types: ['prequalification', 'guidelines'],
        limit: 10
      });
    });

    console.log('Regulatory crawler scheduled jobs initialized');
  }

  /**
   * Crawl FDA documents
   */
  async crawlFDA(options = {}) {
    const { types = ['guidances', 'warning_letters'], limit = 10 } = options;
    const results = [];

    try {
      for (const type of types) {
        const documents = await this.crawlers.fda.fetchDocuments(type, limit);
        for (const doc of documents) {
          // Check if already processed
          if (await this.isDocumentProcessed(doc.url)) {
            console.log(`Skipping already processed FDA document: ${doc.title}`);
            continue;
          }

          const jobId = await this.queueDocument({
            ...doc,
            source: 'FDA',
            documentType: type,
            organizationId: 7 // Default organization
          });
          
          results.push({
            jobId,
            title: doc.title,
            url: doc.url
          });
        }
      }

      // Process queue
      await this.processQueue();
      
      return {
        success: true,
        documentsQueued: results.length,
        documents: results
      };
    } catch (error) {
      console.error('FDA crawl error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Crawl EMA documents
   */
  async crawlEMA(options = {}) {
    const { types = ['epar', 'scientific_guidelines'], limit = 10 } = options;
    const results = [];

    try {
      for (const type of types) {
        const documents = await this.crawlers.ema.fetchDocuments(type, limit);
        for (const doc of documents) {
          if (await this.isDocumentProcessed(doc.url)) {
            console.log(`Skipping already processed EMA document: ${doc.title}`);
            continue;
          }

          const jobId = await this.queueDocument({
            ...doc,
            source: 'EMA',
            documentType: type,
            organizationId: 7
          });
          
          results.push({
            jobId,
            title: doc.title,
            url: doc.url
          });
        }
      }

      await this.processQueue();
      
      return {
        success: true,
        documentsQueued: results.length,
        documents: results
      };
    } catch (error) {
      console.error('EMA crawl error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Crawl ICH documents
   */
  async crawlICH(options = {}) {
    const { types = ['quality', 'safety', 'efficacy'], limit = 10 } = options;
    const results = [];

    try {
      for (const type of types) {
        const documents = await this.crawlers.ich.fetchDocuments(type, limit);
        for (const doc of documents) {
          if (await this.isDocumentProcessed(doc.url)) {
            console.log(`Skipping already processed ICH document: ${doc.title}`);
            continue;
          }

          const jobId = await this.queueDocument({
            ...doc,
            source: 'ICH',
            documentType: type,
            organizationId: 7
          });
          
          results.push({
            jobId,
            title: doc.title,
            url: doc.url
          });
        }
      }

      await this.processQueue();
      
      return {
        success: true,
        documentsQueued: results.length,
        documents: results
      };
    } catch (error) {
      console.error('ICH crawl error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Crawl WHO documents
   */
  async crawlWHO(options = {}) {
    const { types = ['prequalification', 'guidelines'], limit = 10 } = options;
    const results = [];

    try {
      for (const type of types) {
        const documents = await this.crawlers.who.fetchDocuments(type, limit);
        for (const doc of documents) {
          if (await this.isDocumentProcessed(doc.url)) {
            console.log(`Skipping already processed WHO document: ${doc.title}`);
            continue;
          }

          const jobId = await this.queueDocument({
            ...doc,
            source: 'WHO',
            documentType: type,
            organizationId: 7
          });
          
          results.push({
            jobId,
            title: doc.title,
            url: doc.url
          });
        }
      }

      await this.processQueue();
      
      return {
        success: true,
        documentsQueued: results.length,
        documents: results
      };
    } catch (error) {
      console.error('WHO crawl error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if document has been processed recently
   */
  async isDocumentProcessed(url) {
    // Check cache first
    if (this.processedCache.has(url)) {
      const cached = this.processedCache.get(url);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return true;
      }
    }

    try {
      // Check database
      const existing = await db.select()
        .from(ragDocuments)
        .where(eq(ragDocuments.sourceUrl, url))
        .limit(1);

      if (existing.length > 0) {
        this.processedCache.set(url, {
          timestamp: Date.now(),
          documentId: existing[0].documentId
        });
        return true;
      }
    } catch (error) {
      console.error('Error checking processed document:', error);
    }

    return false;
  }

  /**
   * Queue a document for processing
   */
  async queueDocument(document) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Record ingestion job
      await db.insert(ragIngestionJobs).values({
        jobId,
        source: document.source,
        documentUrl: document.url,
        documentTitle: document.title,
        documentType: document.documentType,
        status: 'queued',
        metadata: {
          publishDate: document.publishDate,
          category: document.category,
          tags: document.tags
        },
        organizationId: document.organizationId
      });

      this.queue.push({
        jobId,
        ...document
      });

      return jobId;
    } catch (error) {
      console.error('Error queuing document:', error);
      throw error;
    }
  }

  /**
   * Process the document queue
   */
  async processQueue() {
    if (this.isProcessing) {
      console.log('Queue already processing');
      return;
    }

    this.isProcessing = true;
    const processing = [];

    try {
      while (this.queue.length > 0 || processing.length > 0) {
        // Start new processing jobs up to concurrent limit
        while (processing.length < this.maxConcurrent && this.queue.length > 0) {
          const document = this.queue.shift();
          processing.push(this.processDocument(document));
        }

        // Wait for at least one to complete
        if (processing.length > 0) {
          const completed = await Promise.race(processing);
          const index = processing.findIndex(p => p === completed);
          if (index > -1) {
            processing.splice(index, 1);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single document
   */
  async processDocument(document) {
    const { jobId, url, title, source, documentType, organizationId } = document;
    
    try {
      // Update job status
      await db.update(ragIngestionJobs)
        .set({ 
          status: 'processing',
          startedAt: new Date()
        })
        .where(eq(ragIngestionJobs.jobId, jobId));

      // Fetch document content
      const content = await this.fetchDocumentContent(url);
      
      if (!content) {
        throw new Error('Failed to fetch document content');
      }

      // Ingest into RAG system
      const result = await ragService.ingestDocument({
        organizationId,
        title,
        documentType: `regulatory_${documentType}`,
        fileBuffer: Buffer.from(content.text || content, 'utf-8'),
        fileName: `${source}_${documentType}_${Date.now()}.${content.format || 'txt'}`,
        mimeType: content.mimeType || 'text/plain',
        metadata: {
          source,
          sourceUrl: url,
          documentType,
          regulatoryAgency: source,
          publishDate: document.publishDate,
          category: document.category,
          tags: document.tags,
          extractedAt: new Date().toISOString()
        }
      });

      // Update job status
      await db.update(ragIngestionJobs)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
          documentId: result.documentId,
          chunksProcessed: result.chunksProcessed
        })
        .where(eq(ragIngestionJobs.jobId, jobId));

      // Add to cache
      this.processedCache.set(url, {
        timestamp: Date.now(),
        documentId: result.documentId
      });

      console.log(`Successfully processed: ${title}`);
      return { success: true, jobId, documentId: result.documentId };

    } catch (error) {
      console.error(`Error processing document ${title}:`, error);
      
      // Update job status
      await db.update(ragIngestionJobs)
        .set({ 
          status: 'failed',
          error: error.message,
          failedAt: new Date()
        })
        .where(eq(ragIngestionJobs.jobId, jobId));

      return { success: false, jobId, error: error.message };
    }
  }

  /**
   * Fetch document content from URL
   */
  async fetchDocumentContent(url) {
    try {
      // Add delay for rate limiting
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const contentType = response.headers['content-type'];
      
      if (contentType?.includes('pdf')) {
        // Parse PDF
        const pdfData = await pdfParse(response.data);
        return {
          text: pdfData.text,
          format: 'pdf',
          mimeType: 'application/pdf'
        };
      } else if (contentType?.includes('html')) {
        // Parse HTML
        const html = response.data.toString('utf-8');
        const $ = cheerio.load(html);
        
        // Remove scripts and styles
        $('script, style').remove();
        
        // Extract text content
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        
        return {
          text,
          format: 'html',
          mimeType: 'text/html'
        };
      } else {
        // Plain text
        return {
          text: response.data.toString('utf-8'),
          format: 'txt',
          mimeType: 'text/plain'
        };
      }
    } catch (error) {
      console.error('Error fetching document content:', error);
      throw error;
    }
  }
}

/**
 * FDA Document Crawler
 */
class FDACrawler {
  async fetchDocuments(type, limit = 10) {
    const documents = [];
    
    try {
      switch (type) {
        case 'guidances':
          return await this.fetchGuidances(limit);
        case 'warning_letters':
          return await this.fetchWarningLetters(limit);
        case 'approvals':
          return await this.fetchApprovals(limit);
        default:
          throw new Error(`Unknown FDA document type: ${type}`);
      }
    } catch (error) {
      console.error(`FDA crawler error for ${type}:`, error);
      return [];
    }
  }

  async fetchGuidances(limit) {
    // FDA guidances RSS feed
    const url = 'https://www.fda.gov/feeds/guidances_all.xml';
    const documents = [];

    try {
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      $('item').slice(0, limit).each((i, elem) => {
        documents.push({
          title: $(elem).find('title').text(),
          url: $(elem).find('link').text(),
          publishDate: new Date($(elem).find('pubDate').text()),
          description: $(elem).find('description').text(),
          category: 'guidance'
        });
      });
    } catch (error) {
      console.error('Error fetching FDA guidances:', error);
    }

    return documents;
  }

  async fetchWarningLetters(limit) {
    // FDA warning letters RSS feed
    const url = 'https://www.fda.gov/feeds/warning_letters.xml';
    const documents = [];

    try {
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      $('item').slice(0, limit).each((i, elem) => {
        documents.push({
          title: $(elem).find('title').text(),
          url: $(elem).find('link').text(),
          publishDate: new Date($(elem).find('pubDate').text()),
          description: $(elem).find('description').text(),
          category: 'warning_letter'
        });
      });
    } catch (error) {
      console.error('Error fetching FDA warning letters:', error);
    }

    return documents;
  }

  async fetchApprovals(limit) {
    // FDA drug approvals (simplified - would use proper API in production)
    const documents = [];
    
    // Mock data for demonstration - in production, would scrape actual FDA approvals
    for (let i = 0; i < Math.min(limit, 5); i++) {
      documents.push({
        title: `FDA Drug Approval - Example ${i + 1}`,
        url: `https://www.fda.gov/drugs/drug-approvals/example-${i + 1}`,
        publishDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        description: `Example FDA drug approval document ${i + 1}`,
        category: 'approval'
      });
    }

    return documents;
  }
}

/**
 * EMA Document Crawler
 */
class EMACrawler {
  async fetchDocuments(type, limit = 10) {
    try {
      switch (type) {
        case 'epar':
          return await this.fetchEPARs(limit);
        case 'scientific_guidelines':
          return await this.fetchScientificGuidelines(limit);
        default:
          throw new Error(`Unknown EMA document type: ${type}`);
      }
    } catch (error) {
      console.error(`EMA crawler error for ${type}:`, error);
      return [];
    }
  }

  async fetchEPARs(limit) {
    // EMA EPARs RSS feed
    const url = 'https://www.ema.europa.eu/en/rss/whats-new.xml';
    const documents = [];

    try {
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      $('item').slice(0, limit).each((i, elem) => {
        const title = $(elem).find('title').text();
        if (title.toLowerCase().includes('epar') || title.toLowerCase().includes('assessment')) {
          documents.push({
            title,
            url: $(elem).find('link').text(),
            publishDate: new Date($(elem).find('pubDate').text()),
            description: $(elem).find('description').text(),
            category: 'epar'
          });
        }
      });
    } catch (error) {
      console.error('Error fetching EMA EPARs:', error);
    }

    return documents.slice(0, limit);
  }

  async fetchScientificGuidelines(limit) {
    // Mock data - in production would scrape actual EMA guidelines
    const documents = [];
    
    for (let i = 0; i < Math.min(limit, 5); i++) {
      documents.push({
        title: `EMA Scientific Guideline - Example ${i + 1}`,
        url: `https://www.ema.europa.eu/guidelines/example-${i + 1}`,
        publishDate: new Date(Date.now() - i * 48 * 60 * 60 * 1000),
        description: `Example EMA scientific guideline ${i + 1}`,
        category: 'scientific_guideline'
      });
    }

    return documents;
  }
}

/**
 * ICH Document Crawler
 */
class ICHCrawler {
  async fetchDocuments(type, limit = 10) {
    try {
      // ICH guidelines by category
      const documents = [];
      const categories = {
        quality: 'Q',
        safety: 'S',
        efficacy: 'E',
        multidisciplinary: 'M'
      };

      const categoryCode = categories[type];
      if (!categoryCode) {
        throw new Error(`Unknown ICH document type: ${type}`);
      }

      // Mock data - in production would fetch from ICH website
      for (let i = 0; i < Math.min(limit, 5); i++) {
        documents.push({
          title: `ICH ${categoryCode}${i + 1} Guideline`,
          url: `https://www.ich.org/page/guidelines/${categoryCode}${i + 1}`,
          publishDate: new Date(Date.now() - i * 72 * 60 * 60 * 1000),
          description: `ICH ${type} guideline ${categoryCode}${i + 1}`,
          category: type,
          tags: ['ICH', type, `${categoryCode}-series`]
        });
      }

      return documents;
    } catch (error) {
      console.error(`ICH crawler error for ${type}:`, error);
      return [];
    }
  }
}

/**
 * WHO Document Crawler
 */
class WHOCrawler {
  async fetchDocuments(type, limit = 10) {
    try {
      switch (type) {
        case 'prequalification':
          return await this.fetchPrequalification(limit);
        case 'guidelines':
          return await this.fetchGuidelines(limit);
        default:
          throw new Error(`Unknown WHO document type: ${type}`);
      }
    } catch (error) {
      console.error(`WHO crawler error for ${type}:`, error);
      return [];
    }
  }

  async fetchPrequalification(limit) {
    // Mock data - in production would fetch from WHO website
    const documents = [];
    
    for (let i = 0; i < Math.min(limit, 5); i++) {
      documents.push({
        title: `WHO Prequalification Document - Example ${i + 1}`,
        url: `https://extranet.who.int/pqweb/content/example-${i + 1}`,
        publishDate: new Date(Date.now() - i * 96 * 60 * 60 * 1000),
        description: `WHO prequalification document ${i + 1}`,
        category: 'prequalification',
        tags: ['WHO', 'prequalification']
      });
    }

    return documents;
  }

  async fetchGuidelines(limit) {
    // Mock data - in production would fetch from WHO website
    const documents = [];
    
    for (let i = 0; i < Math.min(limit, 5); i++) {
      documents.push({
        title: `WHO Guideline - Example ${i + 1}`,
        url: `https://www.who.int/publications/guidelines/example-${i + 1}`,
        publishDate: new Date(Date.now() - i * 120 * 60 * 60 * 1000),
        description: `WHO guideline document ${i + 1}`,
        category: 'guideline',
        tags: ['WHO', 'guideline']
      });
    }

    return documents;
  }
}

// Export singleton instance
const regulatoryCrawler = new RegulatoryCrawlerService();
export default regulatoryCrawler;