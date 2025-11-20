/**
 * PubMed API Routes - PRODUCTION READY
 *
 * This module provides API endpoints to interact with REAL PubMed data:
 * - /api/pubmed/search: Search PubMed for articles using NCBI E-utilities
 * - /api/pubmed/abstracts: Fetch article abstracts by PMID using E-Fetch
 * - /api/pubmed/citations: Generate formatted citations for articles
 */

import express from 'express';
import { OpenAI } from 'openai';
import axios from 'axios';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const router = express.Router();
const parseXML = promisify(parseString);

// Initialize OpenAI client for AI-enhanced abstracts and summaries
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// NCBI E-utilities API configuration
const NCBI_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_API_KEY = process.env.NCBI_API_KEY || ''; // Optional but increases rate limits
const NCBI_EMAIL = process.env.NCBI_EMAIL || 'regulatory@example.com'; // Required by NCBI policy
const RATE_LIMIT_DELAY = NCBI_API_KEY ? 100 : 334; // 10 req/sec with key, 3 req/sec without

// Simple in-memory cache to reduce API calls
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// Rate limiting helper
let lastRequestTime = 0;
async function rateLimitedRequest(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  return axios.get(url, { timeout: 10000 });
}

/**
 * @route GET /api/pubmed/search
 * @description Search PubMed for scientific articles using real NCBI API
 * @param {string} query - Search query term
 * @param {number} limit - Maximum results to return (default: 10, max: 100)
 * @returns {Array} Array of publication objects
 */
router.get('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ 
        success: false,
        error: 'Query parameter is required' 
      });
    }

    const sanitizedLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    const cacheKey = `search:${query}:${sanitizedLimit}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[PubMed] Cache hit for query: ${query}`);
      return res.json(cached.data);
    }

    console.log(`[PubMed] Real API search for query: ${query}`);

    // Step 1: Search PubMed for PMIDs using E-Search
    const searchUrl = `${NCBI_BASE_URL}/esearch.fcgi?` + 
      `db=pubmed&` +
      `term=${encodeURIComponent(query)}&` +
      `retmax=${sanitizedLimit}&` +
      `retmode=json&` +
      `tool=eCTDCoAuthor&` +
      `email=${NCBI_EMAIL}` +
      (NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : '');

    const searchResponse = await rateLimitedRequest(searchUrl);
    
    if (!searchResponse.data?.esearchresult?.idlist) {
      return res.json({
        success: true,
        query,
        results: [],
        metadata: {
          totalResults: 0,
          source: 'NCBI PubMed'
        }
      });
    }

    const pmids = searchResponse.data.esearchresult.idlist;
    const totalResults = parseInt(searchResponse.data.esearchresult.count) || 0;

    if (pmids.length === 0) {
      const emptyResponse = {
        success: true,
        query,
        results: [],
        metadata: {
          totalResults: 0,
          source: 'NCBI PubMed'
        }
      };
      cache.set(cacheKey, { data: emptyResponse, timestamp: Date.now() });
      return res.json(emptyResponse);
    }

    // Step 2: Fetch article details using E-Summary
    const summaryUrl = `${NCBI_BASE_URL}/esummary.fcgi?` +
      `db=pubmed&` +
      `id=${pmids.join(',')}&` +
      `retmode=json&` +
      `tool=eCTDCoAuthor&` +
      `email=${NCBI_EMAIL}` +
      (NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : '');

    const summaryResponse = await rateLimitedRequest(summaryUrl);
    const articles = summaryResponse.data?.result;

    if (!articles) {
      throw new Error('Failed to fetch article summaries from PubMed');
    }

    // Transform PubMed data to our format
    const results = pmids.map(pmid => {
      const article = articles[pmid];
      if (!article) return null;

      return {
        pmid,
        title: article.title || 'No title available',
        authors: article.authors?.map(a => `${a.name}`)?.join(', ') || 'Unknown',
        journal: article.fulljournalname || article.source || 'Unknown Journal',
        year: article.pubdate?.substring(0, 4) || 'Unknown',
        doi: article.elocationid || article.articleids?.find(id => id.idtype === 'doi')?.value || null,
        pubType: article.pubtype || [],
        source: 'NCBI PubMed'
      };
    }).filter(Boolean);

    const response = {
      success: true,
      query,
      results,
      metadata: {
        totalResults,
        returned: results.length,
        source: 'NCBI PubMed',
        timestamp: new Date().toISOString()
      }
    };

    // Cache the response
    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    res.json(response);
  } catch (error) {
    console.error('Error searching PubMed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search PubMed',
      message: error.message,
      details: error.response?.data || null
    });
  }
});

/**
 * @route POST /api/pubmed/abstracts
 * @description Fetch abstracts for a list of PubMed IDs using real NCBI E-Fetch API
 * @param {Array} pmids - Array of PubMed IDs
 * @returns {Object} Map of PMIDs to abstract objects
 */
router.post('/abstracts', async (req, res) => {
  try {
    const { pmids } = req.body;

    if (!pmids || !Array.isArray(pmids) || pmids.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid PMIDs array is required' 
      });
    }

    // Limit to 100 PMIDs per request to avoid timeout
    const sanitizedPmids = pmids.slice(0, 100);
    const cacheKey = `abstracts:${sanitizedPmids.join(',')}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[PubMed] Cache hit for ${sanitizedPmids.length} abstracts`);
      return res.json(cached.data);
    }

    console.log(`[PubMed] Real API fetching abstracts for PMIDs: ${sanitizedPmids.join(', ')}`);

    // Fetch full article data including abstracts using E-Fetch with XML format
    const fetchUrl = `${NCBI_BASE_URL}/efetch.fcgi?` +
      `db=pubmed&` +
      `id=${sanitizedPmids.join(',')}&` +
      `retmode=xml&` +
      `tool=eCTDCoAuthor&` +
      `email=${NCBI_EMAIL}` +
      (NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : '');

    const fetchResponse = await rateLimitedRequest(fetchUrl);
    
    if (!fetchResponse.data) {
      throw new Error('No data received from PubMed E-Fetch API');
    }

    // Parse XML response
    const parsedData = await parseXML(fetchResponse.data);
    const articles = parsedData?.PubmedArticleSet?.PubmedArticle || [];

    // Transform to abstracts map
    const abstracts = {};
    
    articles.forEach(article => {
      try {
        const medlineCitation = article.MedlineCitation?.[0];
        const pubmedData = article.PubmedData?.[0];
        
        if (!medlineCitation) return;
        
        const pmid = medlineCitation.PMID?.[0]?._ || medlineCitation.PMID?.[0];
        const articleData = medlineCitation.Article?.[0];
        
        if (!pmid || !articleData) return;

        // Extract abstract text
        let abstractText = '';
        const abstractArr = articleData.Abstract?.[0]?.AbstractText;
        if (abstractArr) {
          abstractText = abstractArr.map(section => {
            if (typeof section === 'string') return section;
            if (section._) {
              const label = section.$.Label ? `${section.$.Label}: ` : '';
              return `${label}${section._}`;
            }
            return '';
          }).filter(Boolean).join('\n\n');
        }

        // Extract authors
        const authorList = articleData.AuthorList?.[0]?.Author || [];
        const authors = authorList.map(author => {
          const lastName = author.LastName?.[0] || '';
          const initials = author.Initials?.[0] || '';
          return `${lastName} ${initials}`.trim();
        }).filter(Boolean).join(', ');

        // Extract journal info
        const journal = articleData.Journal?.[0];
        const journalTitle = journal?.Title?.[0] || journal?.ISOAbbreviation?.[0] || 'Unknown Journal';
        const pubDate = journal?.JournalIssue?.[0]?.PubDate?.[0];
        const year = pubDate?.Year?.[0] || pubDate?.MedlineDate?.[0]?.substring(0, 4) || 'Unknown';

        // Extract DOI
        const articleIds = pubmedData?.ArticleIdList?.[0]?.ArticleId || [];
        const doi = articleIds.find(id => id.$.IdType === 'doi')?._  || null;

        // Extract publication types
        const pubTypeList = articleData.PublicationTypeList?.[0]?.PublicationType || [];
        const pubTypes = pubTypeList.map(pt => pt._).filter(Boolean);

        abstracts[pmid] = {
          pmid,
          title: articleData.ArticleTitle?.[0] || 'No title available',
          abstract: abstractText || 'No abstract available',
          authors: authors || 'Unknown',
          journal: journalTitle,
          year,
          doi,
          pubType: pubTypes,
          source: 'NCBI PubMed'
        };
      } catch (parseError) {
        console.error(`Error parsing article data for PMID:`, parseError);
      }
    });

    const response = {
      success: true,
      abstracts,
      metadata: {
        requested: sanitizedPmids.length,
        returned: Object.keys(abstracts).length,
        source: 'NCBI PubMed',
        timestamp: new Date().toISOString()
      }
    };

    // Cache the response
    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    res.json(response);
  } catch (error) {
    console.error('Error fetching PubMed abstracts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch abstracts',
      message: error.message,
      details: error.response?.data || null
    });
  }
});

/**
 * @route POST /api/pubmed/citations
 * @description Generate formatted citations for PubMed articles using real article data
 * @param {Array} pmids - Array of PubMed IDs
 * @param {string} style - Citation style (vancouver, apa, chicago)
 * @returns {Array} Array of formatted citation strings
 */
router.post('/citations', async (req, res) => {
  try {
    const { pmids, style = 'vancouver' } = req.body;

    if (!pmids || !Array.isArray(pmids) || pmids.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid PMIDs array is required' 
      });
    }

    console.log(`[PubMed] Generating ${style} citations for PMIDs: ${pmids.join(', ')}`);

    // First, fetch the abstracts which contain all article metadata
    // Forward the organization header if present
    const headers = {};
    if (req.headers['x-organization-id']) {
      headers['x-organization-id'] = req.headers['x-organization-id'];
    }
    
    const abstractsResponse = await axios.post(
      `http://localhost:${process.env.PORT || 5000}/api/pubmed/abstracts`,
      { pmids },
      { headers }
    );

    if (!abstractsResponse.data?.success || !abstractsResponse.data?.abstracts) {
      throw new Error('Failed to fetch article data for citations');
    }

    const abstracts = abstractsResponse.data.abstracts;

    // Generate formatted citations
    const citations = pmids.map(pmid => {
      const article = abstracts[pmid];
      if (!article) {
        return {
          pmid,
          citation: `PMID: ${pmid} - Article data not available`,
          success: false
        };
      }

      return {
        pmid,
        citation: formatCitation(article, style),
        success: true
      };
    });

    res.json({
      success: true,
      style,
      citations,
      metadata: {
        requested: pmids.length,
        successful: citations.filter(c => c.success).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error generating citations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate citations',
      message: error.message
    });
  }
});

/**
 * Format a citation based on the given style
 * Supports Vancouver, APA, and Chicago citation styles
 */
function formatCitation(article, style) {
  const { authors, title, journal, year, doi } = article;
  
  // Clean up title (remove trailing periods if present)
  const cleanTitle = title.replace(/\.$/, '');
  
  if (style === 'vancouver') {
    // Vancouver: Authors. Title. Journal. Year;Volume(Issue):Pages.
    let citation = `${authors}. ${cleanTitle}. ${journal}. ${year}`;
    if (doi) citation += `. doi:${doi}`;
    else citation += `.`;
    return citation;
  } else if (style === 'apa') {
    // APA: Authors (Year). Title. Journal.
    let citation = `${authors} (${year}). ${cleanTitle}. ${journal}`;
    if (doi) citation += `. https://doi.org/${doi}`;
    else citation += `.`;
    return citation;
  } else if (style === 'chicago') {
    // Chicago: Authors. "Title." Journal (Year).
    let citation = `${authors}. "${cleanTitle}." ${journal} (${year})`;
    if (doi) citation += `. https://doi.org/${doi}`;
    else citation += `.`;
    return citation;
  } else {
    // Default to Vancouver
    return formatCitation(article, 'vancouver');
  }
}

export default router;
