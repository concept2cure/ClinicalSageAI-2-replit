/**
 * Literature Retrieval Service for Clinical Evaluation Reports
 *
 * This service provides integration with medical literature databases
 * to retrieve relevant publications for clinical evaluation reports.
 *
 * Features:
 * - PubMed API integration with robust error handling
 * - Local caching to reduce duplicate API calls
 * - Smart batching to handle large datasets
 * - Relevance scoring via server-side AI (Claude/Anthropic)
 *
 * Migrated from direct OpenAI SDK to server proxy to avoid browser API key exposure.
 */

import OpenAI from 'openai';

// SECURITY: OpenAI calls must go through the backend API gateway.
// Direct client-side calls with API keys are forbidden in production.
const openai = null; // Removed: never expose API keys in the browser bundle

// PubMed API base URL
const PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// PubMed rate limits - 3 requests per second with API key
const RATE_LIMIT_DELAY = 350;

/**
 * Helper: call the server-side AI completion endpoint
 */
async function callAI({ systemPrompt, userPrompt, jsonMode = false, temperature = 0.2 }) {
  const response = await fetch('/api/ai/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`AI completion failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return jsonMode ? data : data.content;
}

// Enhanced persistent cache with localStorage backup
const cache = {
  searches: new Map(),
  summaries: new Map(),
  fullTexts: new Map(),
  reviews: new Map(),
  TTL: 24 * 60 * 60 * 1000,
  MAX_ITEMS: { searches: 200, summaries: 500, fullTexts: 100, reviews: 300 },

  init() {
    try {
      const storedCache = localStorage.getItem('literature_cache');
      if (storedCache) {
        const parsed = JSON.parse(storedCache);
        Object.keys(parsed).forEach(cacheType => {
          if (this[cacheType] instanceof Map) {
            parsed[cacheType].forEach(([key, value]) => this[cacheType].set(key, value));
          }
        });
      }
    } catch (error) {
      console.warn('Failed to restore cache from localStorage:', error);
      localStorage.removeItem('literature_cache');
    }
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  },

  persist() {
    try {
      const serialized = {
        searches: [...this.searches.entries()],
        summaries: [...this.summaries.entries()],
        fullTexts: [...this.fullTexts.entries()],
        reviews: [...this.reviews.entries()],
      };
      localStorage.setItem('literature_cache', JSON.stringify(serialized));
    } catch (error) {
      if (error.name === 'QuotaExceededError') { this.prune(); this.persist(); }
    }
  },

  get(map, key) {
    const item = map.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.TTL) { map.delete(key); this.persist(); return null; }
    item.lastAccessed = Date.now();
    return item.data;
  },

  set(map, key, value) {
    if (map.size >= this.MAX_ITEMS[this.getMapName(map)]) this.pruneMap(map);
    map.set(key, { data: value, timestamp: Date.now(), lastAccessed: Date.now() });
    if (map.size % 10 === 0) this.persist();
  },

  getMapName(map) {
    if (map === this.searches) return 'searches';
    if (map === this.summaries) return 'summaries';
    if (map === this.fullTexts) return 'fullTexts';
    if (map === this.reviews) return 'reviews';
    return 'unknown';
  },

  cleanup() {
    const now = Date.now();
    let removed = 0;
    [this.searches, this.summaries, this.fullTexts, this.reviews].forEach(map => {
      map.forEach((value, key) => {
        if (now - value.timestamp > this.TTL) { map.delete(key); removed++; }
      });
    });
    if (removed > 0) this.persist();
  },

  pruneMap(map) {
    const entries = [...map.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const removeCount = Math.max(1, Math.floor(entries.length * 0.2));
    for (let i = 0; i < removeCount && i < entries.length; i++) map.delete(entries[i][0]);
  },

  prune() {
    [this.searches, this.summaries, this.fullTexts, this.reviews].forEach(m => this.pruneMap(m));
  },
};

cache.init();

/**
 * Search PubMed for relevant literature based on device and keywords
 */
export const searchPubMedLiterature = async (deviceData, keywords = [], maxResults = 20, options = {}) => {
  try {
    const deviceTerms = [
      deviceData.name, deviceData.type, deviceData.manufacturer,
      deviceData.model, deviceData.category, ...(deviceData.indications || []),
    ].filter(Boolean);

    const allTerms = [...deviceTerms, ...keywords].filter(t => t && t.trim().length > 0);
    if (allTerms.length === 0) return [];

    let deviceTermsQuery = deviceTerms.length > 0 ? `(${deviceTerms.join(' OR ')})` : '';
    let keywordsQuery = keywords.length > 0 ? `(${keywords.join(' OR ')})` : '';
    let searchQuery = (deviceTermsQuery && keywordsQuery)
      ? `${deviceTermsQuery} AND ${keywordsQuery}`
      : deviceTermsQuery || keywordsQuery;
    searchQuery += ' AND ("medical device" OR "clinical evaluation" OR safety OR performance OR "clinical data")';

    const cacheKey = `${searchQuery}_${maxResults}`;
    if (!options.forceRefresh) {
      const cached = cache.get(cache.searches, cacheKey);
      if (cached) return cached;
    }

    let searchData;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const apiKeyParam = import.meta.env.VITE_PUBMED_API_KEY ? `&api_key=${import.meta.env.VITE_PUBMED_API_KEY}` : '';
        const searchUrl = `${PUBMED_API_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${maxResults}${apiKeyParam}&retmode=json`;
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) throw new Error(`PubMed search failed: ${searchResponse.status}`);
        searchData = await searchResponse.json();
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000)));
      }
    }

    const pmids = searchData?.esearchresult?.idlist || [];
    if (pmids.length === 0) return [];

    let allResults = [];
    for (let i = 0; i < pmids.length; i += 50) {
      const batchPmids = pmids.slice(i, i + 50);
      const batchKey = batchPmids.join(',');
      let batchResults = cache.get(cache.summaries, batchKey);

      if (!batchResults || options.forceRefresh) {
        try {
          const apiKeyParam = import.meta.env.VITE_PUBMED_API_KEY ? `&api_key=${import.meta.env.VITE_PUBMED_API_KEY}` : '';
          if (i > 0) await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
          const summaryResponse = await fetch(`${PUBMED_API_BASE}/esummary.fcgi?db=pubmed&id=${batchPmids.join(',')}${apiKeyParam}&retmode=json`);
          if (!summaryResponse.ok) throw new Error(`PubMed summary failed: ${summaryResponse.status}`);
          const summaryData = await summaryResponse.json();
          batchResults = batchPmids.map(pmid => {
            const article = summaryData.result[pmid];
            if (!article) return null;
            return {
              id: pmid, title: article.title || 'Untitled',
              authors: article.authors ? article.authors.map(a => a.name).join(', ') : 'Unknown',
              journal: article.fulljournalname || article.source || 'Unknown Journal',
              publicationDate: article.pubdate || 'Unknown',
              abstract: article.abstract || 'Abstract not available',
              url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
              relevance: null, keyFindings: [], retrievedAt: new Date().toISOString(),
            };
          }).filter(Boolean);
          cache.set(cache.summaries, batchKey, batchResults);
        } catch (error) {
          console.error(`Error retrieving batch of PMIDs:`, error);
          batchResults = [];
        }
      }
      allResults = [...allResults, ...batchResults];
    }

    if (allResults.length === 0) return [];
    const enrichedResults = await assessLiteratureRelevance(allResults, deviceData);
    cache.set(cache.searches, cacheKey, enrichedResults);
    return enrichedResults;
  } catch (error) {
    console.error('Error searching PubMed literature:', error);
    throw new Error(`Literature search failed: ${error.message}`);
  }
};

/**
 * Assess literature relevance via server-side AI (Claude)
 */
export const assessLiteratureRelevance = async (literatureItems, deviceData, options = {}) => {
  if (!literatureItems || literatureItems.length === 0) return [];

  try {
    const itemIds = literatureItems.map(i => i.id).sort().join(',');
    const deviceKey = `${deviceData.name || ''}_${deviceData.type || ''}`;
    const cacheKey = `relevance_${deviceKey}_${itemIds}`;

    if (!options.forceRefresh) {
      const cached = cache.get(cache.reviews, cacheKey);
      if (cached) return cached;
    }

    const deviceContext = {
      name: deviceData.name, type: deviceData.type, indications: deviceData.indications,
      description: deviceData.description, riskClass: deviceData.riskClass, intendedUse: deviceData.intendedUse,
    };

    let processedItems = [];
    for (let i = 0; i < literatureItems.length; i += 5) {
      const batch = literatureItems.slice(i, i + 5);
      const batchCacheKey = `relevance_batch_${deviceKey}_${batch.map(it => it.id).join(',')}`;
      let enhancedBatch = !options.forceRefresh ? cache.get(cache.reviews, batchCacheKey) : null;

      if (!enhancedBatch) {
        const minimized = batch.map(it => ({
          id: it.id, title: it.title, abstract: it.abstract, journal: it.journal, publicationDate: it.publicationDate,
        }));

        let assessments = {};
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await callAI({
              systemPrompt: `You are a regulatory medical device specialist evaluating research papers for a Clinical Evaluation Report.
              Assess each paper's relevance based on device type similarity, clinical application relevance, safety/performance data, recency, and study quality.`,
              userPrompt: `Evaluate these papers for relevance to this device:
              Device: ${JSON.stringify(deviceContext, null, 2)}
              Papers: ${JSON.stringify(minimized, null, 2)}
              Respond in JSON with paper ID as key: { "ID": { "relevanceScore": 85, "keyFindings": [], "relevanceExplanation": "", "evidenceLevel": "II" } }`,
              jsonMode: true,
              temperature: 0.2,
            });
            assessments = typeof result === 'string' ? JSON.parse(result) : result;
            break;
          } catch (error) {
            if (attempt >= 2) {
              assessments = batch.reduce((acc, it) => {
                acc[it.id] = { relevanceScore: 50, keyFindings: ['Assessment unavailable'], relevanceExplanation: 'Automated assessment failed', evidenceLevel: 'Unknown' };
                return acc;
              }, {});
            } else {
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
          }
        }

        enhancedBatch = batch.map(it => ({
          ...it,
          relevance: assessments[it.id]?.relevanceScore || 0,
          keyFindings: assessments[it.id]?.keyFindings || [],
          relevanceExplanation: assessments[it.id]?.relevanceExplanation || 'No assessment',
          evidenceLevel: assessments[it.id]?.evidenceLevel || 'Unknown',
          assessedAt: new Date().toISOString(),
        }));
        cache.set(cache.reviews, batchCacheKey, enhancedBatch);
      }
      processedItems = [...processedItems, ...enhancedBatch];
      if (i + 5 < literatureItems.length) await new Promise(r => setTimeout(r, 500));
    }

    const sorted = processedItems.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    cache.set(cache.reviews, cacheKey, sorted);
    return sorted;
  } catch (error) {
    console.error('Error assessing literature relevance:', error);
    return literatureItems.map(it => ({
      ...it, relevance: it.relevance || null, keyFindings: it.keyFindings || [],
      relevanceExplanation: `Assessment failed: ${error.message}`, assessmentError: error.message,
    }));
  }
};

/**
 * Retrieve full text of a publication when available
 */
export const retrieveFullText = async pmid => {
  try {
    const linksUrl = `${PUBMED_API_BASE}/elink.fcgi?dbfrom=pubmed&id=${pmid}&cmd=prlinks&retmode=json`;
    const linksResponse = await fetch(linksUrl);
    if (!linksResponse.ok) throw new Error(`Failed to retrieve full text links: ${linksResponse.statusText}`);

    const linksData = await linksResponse.json();
    const fullTextLinks = linksData?.linksets?.[0]?.linksetdbs?.find(db => db.linkname === 'pubmed_pmc');
    if (fullTextLinks?.links?.[0]?.url) {
      return { pmid, fullTextUrl: fullTextLinks.links[0].url, source: 'PubMed Central', accessType: 'Free' };
    }

    const pmcResponse = await fetch(`${PUBMED_API_BASE}/efetch.fcgi?db=pmc&id=${pmid}&retmode=json`);
    if (pmcResponse.ok) {
      const pmcData = await pmcResponse.json();
      if (pmcData?.papers?.[0]?.url) {
        return { pmid, fullTextUrl: pmcData.papers[0].url, source: 'PubMed Central', accessType: 'Free' };
      }
    }

    return { pmid, fullTextUrl: null, source: null, accessType: 'Restricted', message: 'Full text access requires subscription or purchase' };
  } catch (error) {
    return { pmid, error: error.message, fullTextUrl: null, accessType: 'Error' };
  }
};

/**
 * Compile a comprehensive literature review section for CER
 */
export const compileLiteratureReview = async (relevantLiterature, deviceData) => {
  try {
    const topLiterature = relevantLiterature.sort((a, b) => (b.relevance || 0) - (a.relevance || 0)).slice(0, 10);

    const content = await callAI({
      systemPrompt: `You are a medical literature expert compiling a literature review section for a Clinical Evaluation Report.
      Synthesize the provided literature into a comprehensive review following MEDDEV 2.7/1 Rev 4 guidelines.
      Focus on clinical evidence related to safety, performance, and benefit-risk determination.`,
      userPrompt: `Compile a comprehensive literature review section based on these articles:
      Device: ${JSON.stringify(deviceData, null, 2)}
      Literature: ${JSON.stringify(topLiterature, null, 2)}
      Include search methodology summary, appraisal criteria, key findings, evidence quality analysis,
      identified gaps, safety/performance implications, and conclusions.
      Format as a formal CER literature review section with proper citations.`,
      temperature: 0.2,
    });

    return {
      literatureReviewText: typeof content === 'string' ? content : content.content,
      includedReferences: topLiterature.map(it => ({
        id: it.id, title: it.title, authors: it.authors,
        journal: it.journal, publicationDate: it.publicationDate, relevance: it.relevance,
      })),
      totalReferencesReviewed: relevantLiterature.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error compiling literature review:', error);
    throw new Error(`Failed to compile literature review: ${error.message}`);
  }
};

export default {
  searchPubMedLiterature,
  assessLiteratureRelevance,
  retrieveFullText,
  compileLiteratureReview,
};
