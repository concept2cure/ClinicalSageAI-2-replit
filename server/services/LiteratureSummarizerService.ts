/**
 * Literature Summarizer Service
 *
 * This service provides AI-powered summaries of literature entries
 * for 510(k) submissions, helping users quickly understand and incorporate
 * key information from multiple sources.
 */

import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { pool } from '../db/setupLiterature';
import literatureAggregator, { LiteratureEntry } from './LiteratureAggregatorService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Summary types and their descriptions
const SUMMARY_TYPES = {
  standard: 'Generate a concise summary of the key points from the literature',
  detailed: 'Generate a comprehensive summary with methodology, results, and implications',
  critical: 'Generate a critical analysis highlighting strengths, weaknesses, and potential biases',
  comparison:
    'Compare and contrast the findings, methodologies, and conclusions across the literature',
};

// Summary request parameters
export interface SummaryParams {
  literatureIds: string[];
  summaryType: string;
  focus?: string;
  organizationId: string;
}

// Summary result interface
export interface SummaryResult {
  id: string;
  summary: string;
  processing_time_ms: number;
  literature_ids: string[];
  literature_preview?: LiteratureEntry[];
  total_literature_count: number;
}

/**
 * Literature Summarizer Service Class
 */
class LiteratureSummarizerService {
  /**
   * Generate a summary from multiple literature entries
   */
  public async generateSummary(params: SummaryParams): Promise<SummaryResult> {
    const startTime = Date.now();

    try {
      // Validate summary type
      if (!Object.keys(SUMMARY_TYPES).includes(params.summaryType)) {
        throw new Error(`Invalid summary type: ${params.summaryType}`);
      }

      // Fetch literature entries
      const literatureEntries: LiteratureEntry[] = [];
      for (const literatureId of params.literatureIds) {
        const entry = await literatureAggregator.getLiteratureById(
          literatureId,
          params.organizationId
        );

        if (entry) {
          literatureEntries.push(entry);
        }
      }

      if (literatureEntries.length === 0) {
        throw new Error('No valid literature entries found for the provided IDs');
      }

      // Generate summary using AI
      const summary = await this.generateSummaryWithAI(
        literatureEntries,
        params.summaryType,
        params.focus
      );

      const executionTime = Date.now() - startTime;

      // Create a preview of the first few entries (up to 3)
      const previewEntries = literatureEntries.slice(0, 3);

      // Save summary to database
      const summaryId = await this.saveSummary(
        summary,
        params.summaryType,
        params.focus || '',
        params.literatureIds,
        params.organizationId
      );

      return {
        id: summaryId,
        summary,
        processing_time_ms: executionTime,
        literature_ids: params.literatureIds,
        literature_preview: previewEntries,
        total_literature_count: literatureEntries.length,
      };
    } catch (error) {
      console.error('Error generating summary:', error);
      throw error;
    }
  }

  /**
   * Get recent summaries for an organization
   */
  public async getRecentSummaries(organizationId: string, limit: number = 5): Promise<any[]> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `SELECT s.*, 
            (SELECT jsonb_agg(jsonb_build_object(
              'id', le.id,
              'title', le.title,
              'source_name', le.source_name,
              'publication_date', le.publication_date
            )) FROM literature_entries le
            WHERE le.id = ANY(s.literature_ids)
            AND le.organization_id = s.organization_id
            LIMIT 3) as literature_preview
          FROM literature_summaries s
          WHERE s.organization_id = $1
          ORDER BY s.created_at DESC
          LIMIT $2`,
          [organizationId, limit]
        );

        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting recent summaries:', error);
      throw error;
    }
  }

  /**
   * Get a specific summary by ID
   */
  public async getSummaryById(summaryId: string, organizationId: string): Promise<any | null> {
    try {
      const client = await pool.connect();

      try {
        const result = await client.query(
          `SELECT s.*, 
            (SELECT jsonb_agg(jsonb_build_object(
              'id', le.id,
              'title', le.title,
              'authors', le.authors,
              'abstract', le.abstract,
              'journal', le.journal,
              'publication_date', le.publication_date,
              'source_name', le.source_name,
              'url', le.url
            )) FROM literature_entries le
            WHERE le.id = ANY(s.literature_ids)
            AND le.organization_id = s.organization_id) as literature_entries
          FROM literature_summaries s
          WHERE s.id = $1 AND s.organization_id = $2`,
          [summaryId, organizationId]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting summary by ID:', error);
      throw error;
    }
  }

  /**
   * Generate summary using OpenAI
   */
  private async generateSummaryWithAI(
    literatureEntries: LiteratureEntry[],
    summaryType: string,
    focus?: string
  ): Promise<string> {
    if (!openai) {
      return 'AI-powered summaries are not available. Please configure the OpenAI API key.';
    }

    try {
      // Create a formatted representation of the literature entries
      const formattedEntries = literatureEntries
        .map((entry, index) => {
          return `
ENTRY ${index + 1}:
Title: ${entry.title}
${entry.authors && entry.authors.length > 0 ? `Authors: ${entry.authors.join(', ')}` : ''}
${entry.journal ? `Journal: ${entry.journal}` : ''}
${entry.publication_date ? `Date: ${entry.publication_date}` : ''}
${entry.source_name ? `Source: ${entry.source_name}` : ''}
${entry.abstract ? `Abstract: ${entry.abstract}` : ''}
        `;
        })
        .join('\n\n');

      // Create prompt based on summary type and focus
      const typeDescription = SUMMARY_TYPES[summaryType as keyof typeof SUMMARY_TYPES];
      const focusInstruction = focus ? `Pay special attention to aspects related to: ${focus}` : '';

      const prompt = `
I need you to ${typeDescription} for a 510(k) medical device submission.
${focusInstruction}

The literature entries are:

${formattedEntries}

Generate a well-structured, comprehensive summary that:
1. Identifies key findings and their relevance to medical devices
2. Highlights methodological strengths and limitations where appropriate
3. Notes any safety or efficacy considerations that would be relevant for regulatory submissions
4. Presents information in a clear, objective manner suitable for inclusion in a 510(k) submission
5. Uses proper citations and maintains scientific rigor throughout
      `;

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'system',
            content:
              'You are an expert medical and regulatory literature specialist assisting with a 510(k) submission for a medical device.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      return response.choices[0].message.content || 'Error generating summary.';
    } catch (error) {
      console.error('Error generating summary with AI:', error);
      return `Error generating summary: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Save summary to database
   */
  private async saveSummary(
    summaryText: string,
    summaryType: string,
    focusArea: string,
    literatureIds: string[],
    organizationId: string
  ): Promise<string> {
    try {
      const client = await pool.connect();

      try {
        // Begin transaction
        await client.query('BEGIN');

        const summaryId = uuidv4();

        // Insert summary
        await client.query(
          `INSERT INTO literature_summaries (
            id, summary_text, summary_type, focus_area,
            literature_ids, organization_id, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [summaryId, summaryText, summaryType, focusArea, literatureIds, organizationId]
        );

        // Insert entries in the many-to-many table
        for (const literatureId of literatureIds) {
          await client.query(
            `INSERT INTO literature_summary_entries (
              summary_id, literature_id, organization_id
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (summary_id, literature_id) DO NOTHING`,
            [summaryId, literatureId, organizationId]
          );
        }

        // Commit transaction
        await client.query('COMMIT');

        return summaryId;
      } catch (error) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error saving summary:', error);
      throw error;
    }
  }
}

// Create singleton instance
const literatureSummarizer = new LiteratureSummarizerService();

export default literatureSummarizer;
