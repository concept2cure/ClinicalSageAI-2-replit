#!/usr/bin/env node
/**
 * PubMed/NCBI Data Farmer
 *
 * Harvests scientific literature from NIH's PubMed database:
 * - Clinical trial publications
 * - Drug research papers
 * - Regulatory science articles
 * - Medical device literature
 *
 * Part of Project Cortex - Automated Data Harvester
 *
 * API: NCBI E-utilities
 * Rate Limit: 3 requests/second (10/sec with API key)
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BATCH_SIZE = 50;
const API_DELAY_MS = 400; // 0.4 second between requests (2.5 req/sec, under 3/sec limit)
const PROGRESS_FILE = path.join(__dirname, '../cortex_pubmed_progress.json');

// NCBI E-utilities Base
const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Search queries for pharmaceutical/regulatory topics
const SEARCH_QUERIES = [
  'clinical trial results[Title/Abstract]',
  'FDA approval[Title/Abstract]',
  'drug safety pharmacovigilance[Title/Abstract]',
  'regulatory submission[Title/Abstract]',
  'bioequivalence study[Title/Abstract]',
  'phase 3 trial[Title/Abstract]',
  'adverse drug reaction[Title/Abstract]',
  'medical device safety[Title/Abstract]',
  'IND application[Title/Abstract]',
  'NDA submission[Title/Abstract]',
];

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(emoji, message, color = colors.reset) {
  logger.info(`${color}${emoji} ${message}${colors.reset}`);
}

/**
 * Load/save progress tracking
 */
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    currentQueryIndex: 0,
    retStart: 0,
    totalHarvested: 0,
    queryProgress: {},
    lastRun: null,
  };
}

function saveProgress(progress) {
  progress.lastRun = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Create a data atom in the Cortex
 */
async function createAtom(atomType, sourceId, content, structuredData = {}) {
  const title = structuredData.title || structuredData.name || sourceId;
  const tags = structuredData.tags || [];
  const sourceType = structuredData.source || 'pubmed';

  try {
    const existing = await pool.query(
      `SELECT id FROM lumen_data_atoms WHERE source_id = $1 AND atom_type = $2`,
      [sourceId, atomType]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `
        UPDATE lumen_data_atoms
        SET content = $1, structured_data = $2, tags = $3, updated_at = NOW()
        WHERE id = $4
      `,
        [content, JSON.stringify(structuredData), tags, existing.rows[0].id]
      );
      return existing.rows[0].id;
    }

    const result = await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.9, 'active', NOW(), NOW())
      RETURNING id
    `,
      [sourceType, sourceId, atomType, title, content, JSON.stringify(structuredData), tags]
    );
    return result.rows[0]?.id;
  } catch (error) {
    log('⚠️', `Atom creation error: ${error.message}`, colors.yellow);
    return null;
  }
}

/**
 * Create knowledge graph relationship
 */
async function createGraphEdge(
  entityId,
  entityType,
  entityName,
  relationship,
  relatedId,
  relatedType,
  relatedName
) {
  try {
    await pool.query(
      `
      INSERT INTO rag_knowledge_graph
      (id, organization_id, entity_id, entity_type, entity_name,
       relationship_type, related_entity_id, related_entity_type, related_entity_name,
       confidence, direction, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.85, 'outbound', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [entityId, entityType, entityName, relationship, relatedId, relatedType, relatedName]
    );
  } catch (error) {
    // Silently fail on edge creation
  }
}

/**
 * Search PubMed for article IDs
 */
async function searchPubMed(query, retStart = 0, retMax = BATCH_SIZE) {
  try {
    const response = await axios.get(`${NCBI_BASE}/esearch.fcgi`, {
      params: {
        db: 'pubmed',
        term: query,
        retstart: retStart,
        retmax: retMax,
        retmode: 'json',
        sort: 'relevance',
      },
      timeout: 30000,
    });

    const result = response.data?.esearchresult;
    return {
      ids: result?.idlist || [],
      count: parseInt(result?.count || 0),
      retStart: parseInt(result?.retstart || 0),
    };
  } catch (error) {
    log('❌', `PubMed search error: ${error.message}`, colors.red);
    return { ids: [], count: 0, retStart: 0 };
  }
}

/**
 * Fetch article details from PubMed
 */
async function fetchArticleDetails(pmids) {
  if (!pmids.length) return [];

  try {
    const response = await axios.get(`${NCBI_BASE}/efetch.fcgi`, {
      params: {
        db: 'pubmed',
        id: pmids.join(','),
        retmode: 'xml',
        rettype: 'abstract',
      },
      timeout: 60000,
    });

    const xml = response.data;
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const articles = parsed?.PubmedArticleSet?.PubmedArticle;
    if (!articles) return [];

    // Normalize to array
    const articleArray = Array.isArray(articles) ? articles : [articles];

    return articleArray
      .map(article => {
        const medline = article?.MedlineCitation;
        const articleData = medline?.Article;

        if (!medline || !articleData) return null;

        const pmid = medline?.PMID?._ || medline?.PMID;
        const title = articleData?.ArticleTitle?._ || articleData?.ArticleTitle || '';
        const abstractText = articleData?.Abstract?.AbstractText;

        // Handle abstract (can be string or array of objects)
        let abstract = '';
        if (typeof abstractText === 'string') {
          abstract = abstractText;
        } else if (Array.isArray(abstractText)) {
          abstract = abstractText.map(a => (typeof a === 'string' ? a : a._ || '')).join(' ');
        } else if (abstractText?._) {
          abstract = abstractText._;
        }

        // Get authors
        const authorList = articleData?.AuthorList?.Author;
        const authors = [];
        if (authorList) {
          const authorArray = Array.isArray(authorList) ? authorList : [authorList];
          authorArray.forEach(author => {
            const lastName = author?.LastName;
            const foreName = author?.ForeName;
            if (lastName) {
              authors.push(foreName ? `${foreName} ${lastName}` : lastName);
            }
          });
        }

        // Get journal info
        const journal = articleData?.Journal;
        const journalTitle = journal?.Title || journal?.ISOAbbreviation || '';
        const pubDate = journal?.JournalIssue?.PubDate;
        const year = pubDate?.Year || pubDate?.MedlineDate?.split(' ')?.[0] || '';

        // Get MeSH terms
        const meshList = medline?.MeshHeadingList?.MeshHeading;
        const meshTerms = [];
        if (meshList) {
          const meshArray = Array.isArray(meshList) ? meshList : [meshList];
          meshArray.forEach(mesh => {
            const descriptor = mesh?.DescriptorName;
            if (descriptor) {
              meshTerms.push(descriptor._ || descriptor);
            }
          });
        }

        // Get keywords
        const keywordList = medline?.KeywordList?.Keyword;
        const keywords = [];
        if (keywordList) {
          const keywordArray = Array.isArray(keywordList) ? keywordList : [keywordList];
          keywordArray.forEach(kw => {
            keywords.push(kw._ || kw);
          });
        }

        return {
          pmid,
          title,
          abstract,
          authors,
          journal: journalTitle,
          year,
          meshTerms,
          keywords,
        };
      })
      .filter(Boolean);
  } catch (error) {
    log('❌', `PubMed fetch error: ${error.message}`, colors.red);
    return [];
  }
}

/**
 * Harvest a batch of PubMed articles
 */
async function harvestPubMed(query, retStart = 0) {
  log('📚', `Searching PubMed: "${query.substring(0, 40)}..." (start: ${retStart})`, colors.cyan);

  // Search for article IDs
  const searchResult = await searchPubMed(query, retStart, BATCH_SIZE);

  if (!searchResult.ids.length) {
    log('📭', `No results found`, colors.yellow);
    return { imported: 0, total: 0, hasMore: false };
  }

  log(
    '🔍',
    `Found ${searchResult.count} total, fetching ${searchResult.ids.length} articles...`,
    colors.blue
  );

  // Rate limit delay
  await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));

  // Fetch article details
  const articles = await fetchArticleDetails(searchResult.ids);
  log('✅', `Retrieved ${articles.length} article details`, colors.green);

  let imported = 0;
  for (const article of articles) {
    if (!article.pmid) continue;

    const atomId = await createAtom(
      'publication',
      `PMID:${article.pmid}`,
      JSON.stringify({
        pmid: article.pmid,
        title: article.title,
        abstract: article.abstract?.substring(0, 5000),
        authors: article.authors,
        journal: article.journal,
        year: article.year,
        mesh_terms: article.meshTerms,
        keywords: article.keywords,
        source: 'PubMed',
      }),
      {
        title: article.title?.substring(0, 200),
        tags: ['pubmed', 'publication', 'scientific_literature', ...article.meshTerms.slice(0, 5)],
        source: 'pubmed',
        authors: article.authors,
        journal: article.journal,
        year: article.year,
      }
    );

    if (atomId) {
      imported++;

      // Create author edges
      for (const author of article.authors.slice(0, 3)) {
        // Limit to first 3 authors
        await createGraphEdge(
          `PMID:${article.pmid}`,
          'publication',
          article.title?.substring(0, 50),
          'AUTHORED_BY',
          `AUTHOR:${author}`,
          'author',
          author
        );
      }

      // Create MeSH term edges (for semantic linking)
      for (const mesh of article.meshTerms.slice(0, 5)) {
        // Limit to first 5 terms
        await createGraphEdge(
          `PMID:${article.pmid}`,
          'publication',
          article.title?.substring(0, 50),
          'TAGGED_WITH',
          `MESH:${mesh}`,
          'mesh_term',
          mesh
        );
      }
    }
  }

  const hasMore = searchResult.count > retStart + BATCH_SIZE;
  return { imported, total: articles.length, hasMore, nextStart: retStart + BATCH_SIZE };
}

/**
 * Get current Cortex stats
 */
async function getCortexStats() {
  try {
    const atomCount = await pool.query(`SELECT COUNT(*) as count FROM lumen_data_atoms`);
    const graphCount = await pool.query(`SELECT COUNT(*) as count FROM rag_knowledge_graph`);
    return {
      atoms: parseInt(atomCount.rows[0]?.count || 0),
      edges: parseInt(graphCount.rows[0]?.count || 0),
    };
  } catch (error) {
    return { atoms: 0, edges: 0 };
  }
}

/**
 * Main harvesting function
 */
async function runPubMedHarvest() {
  logger.info('\n' + '═'.repeat(60));
  log('📚', '\x1b[1mPUBMED/NCBI DATA FARMER\x1b[0m', colors.cyan);
  logger.info('═'.repeat(60) + '\n');

  // Verify database connection
  try {
    const result = await pool.query('SELECT current_database() as db');
    log('🔗', `Connected to database: ${result.rows[0].db}`, colors.green);
  } catch (error) {
    log('❌', `Database connection failed: ${error.message}`, colors.red);
    process.exit(1);
  }

  const progress = loadProgress();
  const initialStats = await getCortexStats();
  log(
    '📈',
    `Current Cortex: ${initialStats.atoms} atoms, ${initialStats.edges} edges`,
    colors.blue
  );

  logger.info('\n' + '-'.repeat(40));

  // Get current query
  const queryIndex = progress.currentQueryIndex % SEARCH_QUERIES.length;
  const query = SEARCH_QUERIES[queryIndex];
  const retStart = progress.queryProgress[query]?.nextStart || 0;

  log('🔎', `Query ${queryIndex + 1}/${SEARCH_QUERIES.length}: ${query}`, colors.magenta);

  // Harvest batch
  const result = await harvestPubMed(query, retStart);

  // Update progress
  if (!progress.queryProgress[query]) {
    progress.queryProgress[query] = { nextStart: 0, totalHarvested: 0 };
  }
  progress.queryProgress[query].nextStart = result.nextStart || 0;
  progress.queryProgress[query].totalHarvested += result.imported;
  progress.totalHarvested += result.imported;

  // Move to next query if this one is exhausted
  if (!result.hasMore) {
    progress.currentQueryIndex++;
    progress.queryProgress[query].nextStart = 0; // Reset for next round
  }

  // Final stats
  const finalStats = await getCortexStats();
  saveProgress(progress);

  // Summary
  logger.info('\n' + '═'.repeat(60));
  log('✅', '\x1b[1mPUBMED HARVEST COMPLETE\x1b[0m', colors.green);
  logger.info('═'.repeat(60));
  logger.info(`
  📊 Session Results:
     • Publications imported: +${result.imported}
     • Query: "${query.substring(0, 35)}..."

  🧠 Cortex Prime Status:
     • Total Atoms: ${finalStats.atoms} (+${finalStats.atoms - initialStats.atoms})
     • Total Edges: ${finalStats.edges} (+${finalStats.edges - initialStats.edges})

  📈 Cumulative Progress:
     • Total Publications: ${progress.totalHarvested}
     • Queries Processed: ${progress.currentQueryIndex}/${SEARCH_QUERIES.length}
  `);

  await pool.end();
}

// Run
runPubMedHarvest().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
