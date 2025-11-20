/**
 * Literature Aggregator Service
 *
 * This service handles multi-source literature search and aggregation
 * for 510(k) submissions, including semantic search capabilities via pgvector.
 */

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { OpenAI } from 'openai';
import { pool } from '../db/setupLiterature';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client for embeddings
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Define available literature sources with configuration
export const LITERATURE_SOURCES = [
  {
    id: 'database',
    name: 'Previously Imported',
    description: 'Literature previously imported and saved in the database',
    enabled: true,
    priority: 1,
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    description: 'Medical literature from the National Library of Medicine',
    enabled: true,
    priority: 2,
    apiKey: process.env.PUBMED_API_KEY || '',
  },
  {
    id: 'fda',
    name: 'FDA',
    description: 'FDA regulatory documents and guidance',
    enabled: true,
    priority: 3,
  },
  {
    id: 'clinicaltrials',
    name: 'ClinicalTrials.gov',
    description: 'Registry and results database of clinical studies',
    enabled: true,
    priority: 4,
  },
];

// Search parameters interface
export interface LiteratureSearchParams {
  query: string;
  sources?: string[];
  startDate?: string | null;
  endDate?: string | null;
  useSemanticSearch?: boolean;
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  organizationId: string;
}

// Literature entry interface
export interface LiteratureEntry {
  id: string;
  title: string;
  authors?: string[];
  abstract?: string;
  publication_date?: string;
  journal?: string;
  doi?: string;
  url?: string;
  source_name: string;
  source_id?: string;
  relevance_score?: number;
  organization_id: string;
  created_at: string;
  updated_at: string;
  embedding?: number[] | null;
}

// Search results interface
export interface LiteratureSearchResults {
  results: LiteratureEntry[];
  total: number;
  execution_time_ms: number;
  sources_queried: string[];
}

/**
 * Literature Aggregator Service Class
 */
class LiteratureAggregatorService {
  /**
   * Search literature from multiple sources
   */
  public async searchLiterature(params: LiteratureSearchParams): Promise<LiteratureSearchResults> {
    const startTime = Date.now();
    const sourcesToQuery = this.getSourcesForQuery(params.sources);
    let queryEmbedding: number[] | null = null;

    console.log(`Searching literature with query: ${params.query}`);
    console.log(`Sources: ${sourcesToQuery.join(', ')}`);

    try {
      // Generate embedding for query if semantic search is enabled
      if (params.useSemanticSearch && openai) {
        queryEmbedding = await this.generateEmbedding(params.query);
      }

      // Initialize results array
      const results: LiteratureEntry[] = [];

      // Search the database first (including semantic search)
      if (sourcesToQuery.includes('database')) {
        const dbResults = await this.searchDatabase(params, queryEmbedding);
        results.push(...dbResults);
      }

      // Search external sources in parallel
      const externalSourcePromises: Promise<LiteratureEntry[]>[] = [];

      // PubMed search
      if (sourcesToQuery.includes('pubmed')) {
        externalSourcePromises.push(this.searchPubMed(params));
      }

      // FDA search
      if (sourcesToQuery.includes('fda')) {
        externalSourcePromises.push(this.searchFDA(params));
      }

      // ClinicalTrials.gov search
      if (sourcesToQuery.includes('clinicaltrials')) {
        externalSourcePromises.push(this.searchClinicalTrials(params));
      }

      // Wait for all external searches to complete
      const externalResults = await Promise.all(externalSourcePromises);

      // Flatten external results
      const allExternalResults = externalResults.flat();

      // Save external results to database for future use
      if (allExternalResults.length > 0) {
        await this.saveLiteratureEntries(allExternalResults, queryEmbedding);
      }

      // Combine all results and deduplicate
      const combinedResults = this.combineAndDeduplicateResults(
        results,
        allExternalResults,
        params.query,
        params.limit || 20,
        params.offset || 0
      );

      const executionTime = Date.now() - startTime;

      return {
        results: combinedResults,
        total: results.length + allExternalResults.length,
        execution_time_ms: executionTime,
        sources_queried: sourcesToQuery,
      };
    } catch (error) {
      console.error('Error searching literature:', error);
      throw error;
    }
  }

  /**
   * Get recent literature entries
   */
  public async getRecentLiterature(
    organizationId: string,
    limit: number = 10
  ): Promise<LiteratureEntry[]> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `SELECT * FROM literature_entries
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
          [organizationId, limit]
        );

        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting recent literature:', error);
      throw error;
    }
  }

  /**
   * Get literature entry by ID
   */
  public async getLiteratureById(
    id: string,
    organizationId: string
  ): Promise<LiteratureEntry | null> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `SELECT * FROM literature_entries
          WHERE id = $1 AND organization_id = $2`,
          [id, organizationId]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting literature by ID:', error);
      throw error;
    }
  }

  /**
   * Get citations for a document
   */
  public async getCitations(
    documentId: string,
    documentType: string,
    organizationId: string
  ): Promise<any[]> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `SELECT dc.*, le.title, le.authors, le.journal, le.publication_date, le.source_name
          FROM document_citations dc
          JOIN literature_entries le ON dc.literature_id = le.id
          WHERE dc.document_id = $1 
          AND dc.document_type = $2 
          AND dc.organization_id = $3`,
          [documentId, documentType, organizationId]
        );

        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting citations:', error);
      throw error;
    }
  }

  /**
   * Add a citation to a document
   */
  public async addCitation(
    literatureId: string,
    documentId: string,
    documentType: string,
    sectionId: string,
    sectionName: string,
    citationText: string,
    organizationId: string
  ): Promise<any> {
    try {
      // Verify literature exists and belongs to the organization
      const literature = await this.getLiteratureById(literatureId, organizationId);

      if (!literature) {
        throw new Error('Literature entry not found or not accessible');
      }

      const client = await pool.connect();

      try {
        const citationId = uuidv4();
        const result = await client.query(
          `INSERT INTO document_citations (
            id, literature_id, document_id, document_type, 
            section_id, section_name, citation_text, organization_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            citationId,
            literatureId,
            documentId,
            documentType,
            sectionId,
            sectionName,
            citationText,
            organizationId,
          ]
        );

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error adding citation:', error);
      throw error;
    }
  }

  /**
   * Remove a citation from a document
   */
  public async removeCitation(citationId: string, organizationId: string): Promise<boolean> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `DELETE FROM document_citations
          WHERE id = $1 AND organization_id = $2
          RETURNING id`,
          [citationId, organizationId]
        );

        // Handle possible null or undefined rowCount
        return result.rowCount !== null && result.rowCount !== undefined && result.rowCount > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error removing citation:', error);
      throw error;
    }
  }

  /**
   * Search literature in the database
   */
  private async searchDatabase(
    params: LiteratureSearchParams,
    queryEmbedding: number[] | null
  ): Promise<LiteratureEntry[]> {
    try {
      const client = await pool.connect();

      try {
        let query = '';
        let queryParams: any[] = [];

        // Semantic search with vector embeddings
        if (queryEmbedding && params.useSemanticSearch) {
          query = `
            SELECT *, 
            1 - (embedding <=> $1) as relevance_score
            FROM literature_entries
            WHERE organization_id = $2
            AND embedding IS NOT NULL
            ORDER BY relevance_score DESC
            LIMIT $3 OFFSET $4
          `;

          queryParams = [
            JSON.stringify(queryEmbedding),
            params.organizationId,
            params.limit || 20,
            params.offset || 0,
          ];
        } else {
          // Text-based search
          query = `
            SELECT * FROM literature_entries
            WHERE organization_id = $1
            AND (
              title ILIKE $2
              OR abstract ILIKE $2
              OR journal ILIKE $2
              OR EXISTS (
                SELECT 1 FROM unnest(authors) author
                WHERE author ILIKE $2
              )
            )
          `;

          if (params.startDate) {
            query += ` AND publication_date >= $5`;
            queryParams.push(params.startDate);
          }

          if (params.endDate) {
            query += ` AND publication_date <= $6`;
            queryParams.push(params.endDate);
          }

          query += ` ORDER BY publication_date DESC LIMIT $3 OFFSET $4`;

          queryParams = [
            params.organizationId,
            `%${params.query}%`,
            params.limit || 20,
            params.offset || 0,
          ];
        }

        const result = await client.query(query, queryParams);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error searching database:', error);
      return [];
    }
  }

  /**
   * Search PubMed literature
   */
  private async searchPubMed(params: LiteratureSearchParams): Promise<LiteratureEntry[]> {
    try {
      const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
      const pubmedApiKey = process.env.PUBMED_API_KEY;
      const apiKeyParam = pubmedApiKey ? `&api_key=${pubmedApiKey}` : '';

      // Build search query
      let searchTerm = params.query;

      // Add date range if provided
      if (params.startDate) {
        searchTerm += ` AND ${params.startDate.split('-')[0]}[pdat]`;
      }

      if (params.endDate) {
        searchTerm += ` AND ${params.endDate.split('-')[0]}[pdat]`;
      }

      // Encode search term
      const encodedSearchTerm = encodeURIComponent(searchTerm);

      // Step 1: Search for PMIDs
      const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodedSearchTerm}&retmax=${params.limit || 20}&retmode=json${apiKeyParam}`;
      const searchResponse = await axios.get(searchUrl);

      const pmids = searchResponse.data.esearchresult.idlist || [];

      if (pmids.length === 0) {
        return [];
      }

      // Step 2: Fetch article details
      const pmidList = pmids.join(',');
      const summaryUrl = `${baseUrl}/esummary.fcgi?db=pubmed&id=${pmidList}&retmode=json${apiKeyParam}`;
      const summaryResponse = await axios.get(summaryUrl);

      const articles = summaryResponse.data.result || {};

      // Convert to literature entries
      const entries: LiteratureEntry[] = [];

      for (const pmid of pmids) {
        if (!articles[pmid]) continue;

        const article = articles[pmid];
        const authorList = article.authors || [];
        const authors = authorList.map((author: any) => `${author.name}`);

        // Parse publication date
        let publicationDate = null;
        if (article.pubdate) {
          const dateComponents = article.pubdate.split(' ');
          if (dateComponents.length >= 2) {
            const month = this.getMonthNumber(dateComponents[0]);
            const year = dateComponents[1];
            if (month && year) {
              publicationDate = `${year}-${month}-01`;
            }
          }
        }

        entries.push({
          id: uuidv4(),
          title: article.title || 'Unknown Title',
          authors,
          abstract: article.abstract || '',
          publication_date: publicationDate,
          journal: article.fulljournalname || article.source,
          doi: article.elocationid || '',
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          source_name: 'PubMed',
          source_id: pmid,
          organization_id: params.organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return entries;
    } catch (error) {
      console.error('Error searching PubMed:', error);
      return [];
    }
  }

  /**
   * Search FDA literature
   */
  private async searchFDA(params: LiteratureSearchParams): Promise<LiteratureEntry[]> {
    try {
      // FDA has no direct API for literature, but we can use their openFDA API
      // to get device and drug information
      const baseUrl = 'https://api.fda.gov/device/510k.json';
      const query = encodeURIComponent(
        `device_name:"${params.query}" OR statement_or_summary:"${params.query}"`
      );
      const limit = params.limit || 20;

      const response = await axios.get(`${baseUrl}?search=${query}&limit=${limit}`);
      const results = response.data.results || [];

      // Convert to literature entries
      const entries: LiteratureEntry[] = [];

      for (const result of results) {
        const deviceName = result.device_name || 'Unknown Device';
        const applicationNumber = result.k_number || '';
        const decisionDate = result.decision_date ? result.decision_date.substring(0, 10) : null;

        entries.push({
          id: uuidv4(),
          title: `510(k) Clearance: ${deviceName}`,
          abstract: result.statement_or_summary || '',
          publication_date: decisionDate,
          journal: 'FDA 510(k) Database',
          url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${applicationNumber}`,
          source_name: 'FDA',
          source_id: applicationNumber,
          organization_id: params.organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return entries;
    } catch (error) {
      console.error('Error searching FDA:', error);
      return [];
    }
  }

  /**
   * Search ClinicalTrials.gov
   */
  private async searchClinicalTrials(params: LiteratureSearchParams): Promise<LiteratureEntry[]> {
    try {
      const baseUrl = 'https://clinicaltrials.gov/api/query/full_studies?expr=';
      const query = encodeURIComponent(params.query);
      const format = 'fmt=json';
      const min = params.offset || 0;
      const max = (params.limit || 20) + (params.offset || 0) - 1;

      const url = `${baseUrl}${query}&${format}&min_rnk=${min}&max_rnk=${max}`;

      const response = await axios.get(url);
      const studies = response.data.FullStudiesResponse?.FullStudies || [];

      // Convert to literature entries
      const entries: LiteratureEntry[] = [];

      for (const study of studies) {
        const studyData = study.Study?.ProtocolSection || {};
        const identificationModule = studyData.IdentificationModule || {};
        const statusModule = studyData.StatusModule || {};
        const sponsorModule = studyData.SponsorCollaboratorsModule || {};
        const descriptionModule = studyData.DescriptionModule || {};

        const nctId = identificationModule.NCTId || '';
        const title = identificationModule.BriefTitle || 'Unknown Study';
        const sponsors = sponsorModule.LeadSponsor?.OrganizationName || '';
        const status = statusModule.OverallStatus || '';
        const startDate = statusModule.StartDate || null;
        const abstract =
          descriptionModule.DetailedDescription || descriptionModule.BriefSummary || '';

        entries.push({
          id: uuidv4(),
          title: `${title} (${status})`,
          authors: [sponsors],
          abstract: abstract,
          publication_date: startDate,
          journal: 'ClinicalTrials.gov',
          url: `https://clinicaltrials.gov/study/${nctId}`,
          source_name: 'ClinicalTrials.gov',
          source_id: nctId,
          organization_id: params.organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return entries;
    } catch (error) {
      console.error('Error searching ClinicalTrials.gov:', error);
      return [];
    }
  }

  /**
   * Generate embedding for a query using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!openai) {
      console.log('OpenAI API key not configured, skipping embedding generation');
      return null;
    }

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Save literature entries to database
   */
  private async saveLiteratureEntries(
    entries: LiteratureEntry[],
    queryEmbedding?: number[] | null
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      const client = await pool.connect();

      try {
        // Begin transaction
        await client.query('BEGIN');

        for (const entry of entries) {
          // Check if entry already exists
          const existingResult = await client.query(
            `SELECT id FROM literature_entries 
            WHERE source_name = $1 AND source_id = $2 AND organization_id = $3`,
            [entry.source_name, entry.source_id, entry.organization_id]
          );

          if (existingResult.rows.length > 0) {
            // Skip existing entries
            continue;
          }

          // Generate embedding for the entry
          let embedding = null;
          if (openai && queryEmbedding) {
            const text = [entry.title, entry.abstract].filter(Boolean).join(' ');
            embedding = await this.generateEmbedding(text);
          }

          const authorList = Array.isArray(entry.authors) ? entry.authors : [];

          // Insert new entry
          await client.query(
            `INSERT INTO literature_entries (
              id, title, authors, abstract, publication_date,
              journal, doi, url, source_name, source_id,
              organization_id, embedding, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              entry.id,
              entry.title,
              authorList,
              entry.abstract,
              entry.publication_date,
              entry.journal,
              entry.doi,
              entry.url,
              entry.source_name,
              entry.source_id,
              entry.organization_id,
              embedding ? JSON.stringify(embedding) : null,
              entry.created_at,
              entry.updated_at,
            ]
          );
        }

        // Commit transaction
        await client.query('COMMIT');
      } catch (error) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error saving literature entries:', error);
      throw error;
    }
  }

  /**
   * Combine and deduplicate results from all sources
   */
  private combineAndDeduplicateResults(
    dbResults: LiteratureEntry[],
    externalResults: LiteratureEntry[],
    query: string,
    limit: number,
    offset: number
  ): LiteratureEntry[] {
    const seenSourceIds = new Set<string>();
    const combinedResults: LiteratureEntry[] = [];

    // Add database results first (already deduplicated)
    for (const result of dbResults) {
      if (result.source_id) {
        seenSourceIds.add(`${result.source_name}:${result.source_id}`);
      }
      combinedResults.push(result);
    }

    // Add external results, skipping duplicates
    for (const result of externalResults) {
      const sourceKey = `${result.source_name}:${result.source_id}`;

      if (result.source_id && seenSourceIds.has(sourceKey)) {
        continue;
      }

      if (result.source_id) {
        seenSourceIds.add(sourceKey);
      }

      if (!result.relevance_score) {
        result.relevance_score = this.calculateRelevanceScore(result, query);
      }

      combinedResults.push(result);
    }

    // Sort by relevance score (descending)
    combinedResults.sort((a, b) => {
      const scoreA = a.relevance_score || 0;
      const scoreB = b.relevance_score || 0;
      return scoreB - scoreA;
    });

    // Apply pagination
    return combinedResults.slice(0, limit);
  }

  /**
   * Calculate a simple relevance score for entries without embeddings
   */
  private calculateRelevanceScore(entry: LiteratureEntry, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    let score = 0;

    // Check title (highest weight)
    if (entry.title) {
      const titleLower = entry.title.toLowerCase();
      for (const term of queryTerms) {
        if (titleLower.includes(term)) {
          score += 0.5;
        }
      }
    }

    // Check abstract (medium weight)
    if (entry.abstract) {
      const abstractLower = entry.abstract.toLowerCase();
      for (const term of queryTerms) {
        if (abstractLower.includes(term)) {
          score += 0.2;
        }
      }
    }

    // Check journal (low weight)
    if (entry.journal) {
      const journalLower = entry.journal.toLowerCase();
      for (const term of queryTerms) {
        if (journalLower.includes(term)) {
          score += 0.1;
        }
      }
    }

    // Normalize score to 0-1 range
    return Math.min(1, score);
  }

  /**
   * Convert month name to number
   */
  private getMonthNumber(month: string): string {
    const months: Record<string, string> = {
      Jan: '01',
      Feb: '02',
      Mar: '03',
      Apr: '04',
      May: '05',
      Jun: '06',
      Jul: '07',
      Aug: '08',
      Sep: '09',
      Oct: '10',
      Nov: '11',
      Dec: '12',
    };

    return months[month] || '01';
  }

  /**
   * Determine which sources to query based on user selection
   */
  private getSourcesForQuery(requestedSources?: string[]): string[] {
    if (!requestedSources || requestedSources.length === 0) {
      // If no sources specified, use all enabled sources
      return LITERATURE_SOURCES.filter(source => source.enabled).map(source => source.id);
    }

    // Filter out any requested sources that are not enabled
    const enabledSourceIds = LITERATURE_SOURCES.filter(source => source.enabled).map(
      source => source.id
    );
    return requestedSources.filter(id => enabledSourceIds.includes(id));
  }
}

// Create singleton instance
const literatureAggregator = new LiteratureAggregatorService();

export default literatureAggregator;
