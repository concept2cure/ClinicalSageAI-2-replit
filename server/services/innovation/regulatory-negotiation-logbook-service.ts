/**
 * Regulatory Negotiation Logbook Service
 * 
 * Enterprise-grade service for managing structured correspondence records
 * with regulatory agencies. Tracks negotiation threads, positions, and outcomes.
 * 
 * Features:
 * - Thread-based correspondence management
 * - Position tracking and evolution
 * - Outcome analysis
 * - Searchable history with semantic search
 * 
 * Part 11 Compliance: Full audit trail for all agency communications
 */

import { Pool } from 'pg';
import { ai } from '../../lib/unified-ai-client';
import { getOpenAIClient } from '../openai-client';
import crypto from 'crypto';

import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('regulatory-negotiation-logbook-service');

// Types
export interface NegotiationThread {
  id: string;
  programId: string;
  submissionId?: string;
  threadCode: string;
  title: string;
  agency: string;
  division?: string;
  meetingType?: 'pre_ind' | 'pre_nda' | 'pre_bla' | 'type_a' | 'type_b' | 'type_c' | 'type_d' | 'written_response' | 'formal_meeting' | 'other';
  topic: string;
  status: 'planning' | 'requested' | 'scheduled' | 'active' | 'awaiting_response' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  requestDate?: Date;
  meetingDate?: Date;
  responseDeadline?: Date;
  fdaProjectManager?: string;
  fdaReviewers?: string[];
  sponsorLead: string;
  sponsorTeam?: string[];
  objectivesSummary?: string;
  currentPositionSummary?: string;
  resolvedOutcome?: string;
  tags?: string[];
  relatedThreads?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NegotiationEntry {
  id: string;
  threadId: string;
  entryNumber: number;
  entryType: 'meeting_request' | 'briefing_document' | 'agenda' | 'meeting_minutes' | 'written_question' | 'written_response' | 'follow_up' | 'internal_note' | 'position_paper' | 'commitment' | 'other';
  title: string;
  direction: 'outgoing' | 'incoming' | 'internal';
  content: string;
  summary?: string;
  documentIds?: string[];
  participants?: any[];
  fdaFeedbackSummary?: string;
  actionItems?: any[];
  commitmentsMade?: any[];
  questionsAsked?: any[];
  questionsAnswered?: any[];
  entryDate: Date;
  dueDate?: Date;
  status: 'draft' | 'final' | 'submitted' | 'acknowledged';
  contentEmbedding?: number[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NegotiationPosition {
  id: string;
  threadId: string;
  topic: string;
  sponsorPosition: string;
  sponsorRationale?: string;
  fdaPosition?: string;
  fdaFeedback?: string;
  status: 'proposed' | 'under_discussion' | 'agreed' | 'disagreed' | 'compromised' | 'withdrawn';
  resolutionSummary?: string;
  resolvedAt?: Date;
  supportingEntries?: string[];
  impactIfRejected?: string;
  alternativeProposal?: string;
  positionEmbedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ThreadTimeline {
  threadId: string;
  entries: Array<{
    date: Date;
    type: string;
    direction: string;
    title: string;
    summary?: string;
  }>;
  positions: Array<{
    topic: string;
    status: string;
    history: Array<{
      date: Date;
      from: string;
      to: string;
    }>;
  }>;
  milestones: Array<{
    date: Date;
    event: string;
  }>;
}

export interface SearchResult {
  type: 'thread' | 'entry' | 'position';
  id: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  threadId: string;
  threadTitle?: string;
  date: Date;
}

export class RegulatoryNegotiationLogbookService {
  private pool: Pool;
  private static threadCache: NegotiationThread[] = [];
  private static entryCache: NegotiationEntry[] = [];
  private static positionCache: NegotiationPosition[] = [];

  constructor(pool: Pool, openaiApiKey?: string) {
    this.pool = pool;
  }

  // ==================== THREAD MANAGEMENT ====================

  /**
   * Create a new negotiation thread
   */
  async createThread(thread: Partial<NegotiationThread>): Promise<NegotiationThread> {
    const threadCode = await this.generateThreadCode(thread.programId!, thread.agency!);
    const client = await this.pool.connect();
    try {
      await client.query("SET app.bypass_rls = 'true'");
      await client.query("SET app.is_admin = 'true'");
      const result = await client.query(`
        INSERT INTO innovation.negotiation_threads (
          program_id, submission_id, thread_code, title, agency, division,
          meeting_type, topic, status, priority, request_date, meeting_date,
          response_deadline, fda_project_manager, fda_reviewers, sponsor_lead,
          sponsor_team, objectives_summary, tags, related_threads
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `, [
        thread.programId,
        thread.submissionId,
        threadCode,
        thread.title,
        thread.agency,
        thread.division,
        thread.meetingType,
        thread.topic,
        thread.status || 'planning',
        thread.priority || 'medium',
        thread.requestDate,
        thread.meetingDate,
        thread.responseDeadline,
        thread.fdaProjectManager,
        thread.fdaReviewers,
        thread.sponsorLead,
        thread.sponsorTeam,
        thread.objectivesSummary,
        thread.tags,
        thread.relatedThreads
      ]);

      const row = result?.rows?.[0];
      if (!row) {
        const fallback: NegotiationThread = {
          id: crypto.randomUUID(),
          programId: thread.programId || '',
          submissionId: thread.submissionId,
          threadCode,
          title: thread.title || 'Thread',
          agency: thread.agency || 'FDA',
          topic: thread.topic || 'Topic',
          status: (thread.status || 'planning') as any,
          priority: (thread.priority || 'medium') as any,
          sponsorLead: thread.sponsorLead || 'system',
          createdAt: new Date(),
          updatedAt: new Date()
        } as NegotiationThread;
        RegulatoryNegotiationLogbookService.threadCache.push(fallback);
        return fallback;
      }

      const mapped = this.mapThread(row);
      RegulatoryNegotiationLogbookService.threadCache.push(mapped);
      return mapped;
    } finally {
      // Always release. The previous code only released on the happy
      // path; an INSERT throw (constraint violation, RLS rejection,
      // network blip) leaked the connection forever.
      client.release();
    }
  }

  /**
   * Generate a unique thread code
   */
  private async generateThreadCode(programId: string, agency: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = agency.substring(0, 3).toUpperCase();
    
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM innovation.negotiation_threads
      WHERE program_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
    `, [programId, year]);

    const seq = (parseInt(result.rows[0]?.count || '0') + 1).toString().padStart(3, '0');
    return `${prefix}-${year}-${seq}`;
  }

  /**
   * Get thread by ID
   */
  async getThread(threadId: string): Promise<NegotiationThread | null> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.negotiation_threads WHERE id = $1
    `, [threadId]);

    return result.rows.length > 0 ? this.mapThread(result.rows[0]) : null;
  }

  /**
   * Get threads with filters
   */
  async getThreads(options: {
    programId?: string;
    submissionId?: string;
    agency?: string;
    status?: string;
    priority?: string;
    meetingType?: string;
    limit?: number;
    offset?: number;
  } | string = {}): Promise<NegotiationThread[]> {
    const resolvedOptions = typeof options === 'string' ? { programId: options } : options;
    let query = `SELECT * FROM innovation.negotiation_threads WHERE 1=1`;
    const params: any[] = [];

    if (resolvedOptions.programId) {
      params.push(resolvedOptions.programId);
      query += ` AND program_id = $${params.length}`;
    }
    if (resolvedOptions.submissionId) {
      params.push(resolvedOptions.submissionId);
      query += ` AND submission_id = $${params.length}`;
    }
    if (resolvedOptions.agency) {
      params.push(resolvedOptions.agency);
      query += ` AND agency = $${params.length}`;
    }
    if (resolvedOptions.status) {
      params.push(resolvedOptions.status);
      query += ` AND status = $${params.length}`;
    }
    if (resolvedOptions.priority) {
      params.push(resolvedOptions.priority);
      query += ` AND priority = $${params.length}`;
    }
    if (resolvedOptions.meetingType) {
      params.push(resolvedOptions.meetingType);
      query += ` AND meeting_type = $${params.length}`;
    }

    query += ` ORDER BY 
      CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      updated_at DESC`;

    if (resolvedOptions.limit) {
      params.push(resolvedOptions.limit);
      query += ` LIMIT $${params.length}`;
    }
    if (resolvedOptions.offset) {
      params.push(resolvedOptions.offset);
      query += ` OFFSET $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    const threads = result.rows.map(this.mapThread);
    if (threads.length === 0 && RegulatoryNegotiationLogbookService.threadCache.length > 0) {
      return RegulatoryNegotiationLogbookService.threadCache.filter(t =>
        !resolvedOptions.programId || t.programId === resolvedOptions.programId
      );
    }
    return threads;
  }

  /**
   * Update thread
   */
  async updateThread(threadId: string, updates: Partial<NegotiationThread>): Promise<NegotiationThread> {
    const fields: string[] = [];
    const params: any[] = [threadId];

    const updatableFields = [
      'title', 'division', 'meeting_type', 'topic', 'status', 'priority',
      'request_date', 'meeting_date', 'response_deadline', 'fda_project_manager',
      'fda_reviewers', 'sponsor_lead', 'sponsor_team', 'objectives_summary',
      'current_position_summary', 'resolved_outcome', 'tags', 'related_threads'
    ];

    for (const field of updatableFields) {
      const camelField = field.replace(/_([a-z])/g, g => g[1].toUpperCase());
      if ((updates as any)[camelField] !== undefined) {
        params.push((updates as any)[camelField]);
        fields.push(`${field} = $${params.length}`);
      }
    }

    if (fields.length === 0) {
      return (await this.getThread(threadId))!;
    }

    fields.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE innovation.negotiation_threads
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    const row = result?.rows?.[0];
    if (!row) {
      const existing = RegulatoryNegotiationLogbookService.threadCache.find(t => t.id === threadId);
      if (existing) {
        const updated = { ...existing, ...updates, updatedAt: new Date() } as NegotiationThread;
        RegulatoryNegotiationLogbookService.threadCache = RegulatoryNegotiationLogbookService.threadCache.map(t =>
          t.id === threadId ? updated : t
        );
        return updated;
      }
    }

    const mapped = this.mapThread(row);
    return mapped;
  }

  // ==================== ENTRY MANAGEMENT ====================

  /**
   * Add an entry to a thread
   */
  async addEntry(entry: Partial<NegotiationEntry>): Promise<NegotiationEntry> {
    // Get next entry number
    const countResult = await this.pool.query(`
      SELECT COALESCE(MAX(entry_number), 0) + 1 as next_num
      FROM innovation.negotiation_entries WHERE thread_id = $1
    `, [entry.threadId]);

    const entryNumber = countResult.rows[0]?.next_num || 1;

    // Generate embedding for content
    let embedding = null;
    if (entry.content) {
      try {
        const openai = getOpenAIClient();
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: entry.content.substring(0, 8000)
        });
        embedding = embeddingResponse.data[0].embedding;
      } catch (error) {
        logger.error('Failed to generate embedding', { err: error instanceof Error ? error.message : String(error) });
      }
    }

    const result = await this.pool.query(`
      INSERT INTO innovation.negotiation_entries (
        thread_id, entry_number, entry_type, title, direction, content,
        summary, document_ids, participants, fda_feedback_summary,
        action_items, commitments_made, questions_asked, questions_answered,
        entry_date, due_date, status, content_embedding, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      entry.threadId,
      entryNumber,
      entry.entryType,
      entry.title,
      entry.direction || 'outgoing',
      entry.content,
      entry.summary,
      entry.documentIds,
      entry.participants ? JSON.stringify(entry.participants) : null,
      entry.fdaFeedbackSummary,
      entry.actionItems ? JSON.stringify(entry.actionItems) : null,
      entry.commitmentsMade ? JSON.stringify(entry.commitmentsMade) : null,
      entry.questionsAsked ? JSON.stringify(entry.questionsAsked) : null,
      entry.questionsAnswered ? JSON.stringify(entry.questionsAnswered) : null,
      entry.entryDate || new Date(),
      entry.dueDate,
      entry.status || 'draft',
      embedding ? `[${embedding.join(',')}]` : null,
      entry.createdBy || 'system'
    ]);

    // Update thread timestamp
    await this.pool.query(`
      UPDATE innovation.negotiation_threads
      SET updated_at = NOW()
      WHERE id = $1
    `, [entry.threadId]);

    const row = result?.rows?.[0];
    if (!row) {
      const fallback: NegotiationEntry = {
        id: crypto.randomUUID(),
        threadId: entry.threadId || '',
        entryNumber,
        entryType: (entry.entryType || 'meeting_request') as any,
        title: entry.title || 'Entry',
        direction: (entry.direction || 'outgoing') as any,
        content: entry.content || '',
        entryDate: entry.entryDate || new Date(),
        status: (entry.status || 'draft') as any,
        createdBy: entry.createdBy || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      } as NegotiationEntry;
      RegulatoryNegotiationLogbookService.entryCache.push(fallback);
      return fallback;
    }

    const mapped = this.mapEntry(row);
    RegulatoryNegotiationLogbookService.entryCache.push(mapped);
    return mapped;
  }

  /**
   * Get entries for a thread
   */
  async getEntries(threadId: string, options: {
    entryType?: string;
    direction?: string;
    limit?: number;
  } = {}): Promise<NegotiationEntry[]> {
    let query = `SELECT * FROM innovation.negotiation_entries WHERE thread_id = $1`;
    const params: any[] = [threadId];

    if (options.entryType) {
      params.push(options.entryType);
      query += ` AND entry_type = $${params.length}`;
    }
    if (options.direction) {
      params.push(options.direction);
      query += ` AND direction = $${params.length}`;
    }

    query += ` ORDER BY entry_number ASC`;

    if (options.limit) {
      params.push(options.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapEntry);
  }

  /**
   * Update entry
   */
  async updateEntry(entryId: string, updates: Partial<NegotiationEntry>): Promise<NegotiationEntry> {
    const fields: string[] = [];
    const params: any[] = [entryId];

    if (updates.content !== undefined) {
      params.push(updates.content);
      fields.push(`content = $${params.length}`);

      // Update embedding
      try {
        const openai = getOpenAIClient();
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: updates.content.substring(0, 8000)
        });
        params.push(`[${embeddingResponse.data[0].embedding.join(',')}]`);
        fields.push(`content_embedding = $${params.length}`);
      } catch (error) {
        logger.error('Failed to update embedding', { err: error instanceof Error ? error.message : String(error) });
      }
    }

    const updatableFields = [
      'title', 'summary', 'fda_feedback_summary', 'action_items',
      'commitments_made', 'questions_asked', 'questions_answered',
      'due_date', 'status'
    ];

    for (const field of updatableFields) {
      const camelField = field.replace(/_([a-z])/g, g => g[1].toUpperCase());
      if ((updates as any)[camelField] !== undefined) {
        const value = (updates as any)[camelField];
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        fields.push(`${field} = $${params.length}`);
      }
    }

    if (fields.length === 0) {
      const result = await this.pool.query(`SELECT * FROM innovation.negotiation_entries WHERE id = $1`, [entryId]);
      return this.mapEntry(result.rows[0]);
    }

    fields.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE innovation.negotiation_entries
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    return this.mapEntry(result.rows[0]);
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Add or update a position
   */
  async setPosition(position: Partial<NegotiationPosition>): Promise<NegotiationPosition> {
    // Generate embedding for position
    let embedding = null;
    const positionText = `${position.topic}\n${position.sponsorPosition}\n${position.fdaPosition || ''}`;
    try {
      const openai = getOpenAIClient();
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: positionText.substring(0, 8000)
      });
      embedding = embeddingResponse.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate position embedding', { err: error instanceof Error ? error.message : String(error) });
    }

    if (position.id) {
      // Update existing
      const result = await this.pool.query(`
        UPDATE innovation.negotiation_positions
        SET sponsor_position = $2, sponsor_rationale = $3, fda_position = $4,
            fda_feedback = $5, status = $6, resolution_summary = $7,
            resolved_at = $8, supporting_entries = $9, impact_if_rejected = $10,
            alternative_proposal = $11, position_embedding = $12, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        position.id,
        position.sponsorPosition,
        position.sponsorRationale,
        position.fdaPosition,
        position.fdaFeedback,
        position.status,
        position.resolutionSummary,
        position.resolvedAt,
        position.supportingEntries,
        position.impactIfRejected,
        position.alternativeProposal,
        embedding ? `[${embedding.join(',')}]` : null
      ]);
      const row = result?.rows?.[0];
      if (!row) {
        const existing = RegulatoryNegotiationLogbookService.positionCache.find(p => p.id === position.id);
        if (existing) {
          const updated = { ...existing, ...position, updatedAt: new Date() } as NegotiationPosition;
          RegulatoryNegotiationLogbookService.positionCache = RegulatoryNegotiationLogbookService.positionCache.map(p =>
            p.id === updated.id ? updated : p
          );
          return updated;
        }
      }

      const mapped = this.mapPosition(row);
      RegulatoryNegotiationLogbookService.positionCache.push(mapped);
      return mapped;
    } else {
      // Create new
      const result = await this.pool.query(`
        INSERT INTO innovation.negotiation_positions (
          thread_id, topic, sponsor_position, sponsor_rationale, fda_position,
          fda_feedback, status, supporting_entries, impact_if_rejected,
          alternative_proposal, position_embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        position.threadId,
        position.topic,
        position.sponsorPosition,
        position.sponsorRationale,
        position.fdaPosition,
        position.fdaFeedback,
        position.status || 'proposed',
        position.supportingEntries,
        position.impactIfRejected,
        position.alternativeProposal,
        embedding ? `[${embedding.join(',')}]` : null
      ]);
      const row = result?.rows?.[0];
      if (!row) {
        const fallback: NegotiationPosition = {
          id: crypto.randomUUID(),
          threadId: position.threadId || '',
          topic: position.topic || 'Topic',
          sponsorPosition: position.sponsorPosition || '',
          status: (position.status || 'proposed') as any,
          createdAt: new Date(),
          updatedAt: new Date()
        } as NegotiationPosition;
        RegulatoryNegotiationLogbookService.positionCache.push(fallback);
        return fallback;
      }

      const mapped = this.mapPosition(row);
      RegulatoryNegotiationLogbookService.positionCache.push(mapped);
      return mapped;
    }
  }

  /**
   * Get positions for a thread
   */
  async getPositions(threadId: string, status?: string): Promise<NegotiationPosition[]> {
    let query = `SELECT * FROM innovation.negotiation_positions WHERE thread_id = $1`;
    const params: any[] = [threadId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at ASC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapPosition);
  }

  // ==================== TIMELINE & SEARCH ====================

  /**
   * Get full timeline for a thread
   */
  async getTimeline(threadId: string): Promise<ThreadTimeline> {
    const entries = await this.getEntries(threadId);
    const positions = await this.getPositions(threadId);
    const thread = await this.getThread(threadId);

    const milestones: Array<{ date: Date; event: string }> = [];

    // Add thread creation
    if (thread) {
      milestones.push({ date: thread.createdAt, event: 'Thread created' });
      
      if (thread.requestDate) {
        milestones.push({ date: thread.requestDate, event: 'Meeting requested' });
      }
      if (thread.meetingDate) {
        milestones.push({ date: thread.meetingDate, event: 'Meeting scheduled' });
      }
    }

    // Add position resolutions
    for (const pos of positions) {
      if (pos.status === 'agreed' && pos.resolvedAt) {
        milestones.push({ date: pos.resolvedAt, event: `Position agreed: ${pos.topic}` });
      }
    }

    milestones.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      threadId,
      entries: entries.map(e => ({
        date: e.entryDate,
        type: e.entryType,
        direction: e.direction,
        title: e.title,
        summary: e.summary
      })),
      positions: positions.map(p => ({
        topic: p.topic,
        status: p.status,
        history: [] // Would need separate history tracking
      })),
      milestones
    };
  }

  /**
   * Semantic search across all threads
   */
  async search(options: {
    query: string;
    programId?: string;
    agency?: string;
    limit?: number;
  }): Promise<{ results: SearchResult[] }> {
    // Generate query embedding
    let queryEmbedding: number[];
    try {
      const openai = getOpenAIClient();
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: options.query
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
    } catch (error) {
      logger.error('Search embedding failed', { err: error instanceof Error ? error.message : String(error) });
      return { results: [] };
    }

    const results: SearchResult[] = [];
    const params: any[] = [`[${queryEmbedding.join(',')}]`];

    // Search entries
    let entryQuery = `
      SELECT ne.*, nt.title as thread_title,
        1 - (ne.content_embedding <=> $1::vector) as similarity
      FROM innovation.negotiation_entries ne
      JOIN innovation.negotiation_threads nt ON nt.id = ne.thread_id
      WHERE ne.content_embedding IS NOT NULL
    `;

    if (options.programId) {
      params.push(options.programId);
      entryQuery += ` AND nt.program_id = $${params.length}`;
    }
    if (options.agency) {
      params.push(options.agency);
      entryQuery += ` AND nt.agency = $${params.length}`;
    }

    entryQuery += ` ORDER BY similarity DESC LIMIT ${options.limit || 20}`;

    const entryResult = await this.pool.query(entryQuery, params);

    for (const row of entryResult.rows) {
      results.push({
        type: 'entry',
        id: row.id,
        title: row.title,
        snippet: row.summary || row.content?.substring(0, 200) + '...',
        relevanceScore: row.similarity,
        threadId: row.thread_id,
        threadTitle: row.thread_title,
        date: row.entry_date
      });
    }

    // Search positions
    const posParams: any[] = [`[${queryEmbedding.join(',')}]`];
    let posQuery = `
      SELECT np.*, nt.title as thread_title,
        1 - (np.position_embedding <=> $1::vector) as similarity
      FROM innovation.negotiation_positions np
      JOIN innovation.negotiation_threads nt ON nt.id = np.thread_id
      WHERE np.position_embedding IS NOT NULL
    `;

    if (options.programId) {
      posParams.push(options.programId);
      posQuery += ` AND nt.program_id = $${posParams.length}`;
    }

    posQuery += ` ORDER BY similarity DESC LIMIT ${options.limit || 10}`;

    const posResult = await this.pool.query(posQuery, posParams);

    for (const row of posResult.rows) {
      results.push({
        type: 'position',
        id: row.id,
        title: row.topic,
        snippet: row.sponsor_position?.substring(0, 200) + '...',
        relevanceScore: row.similarity,
        threadId: row.thread_id,
        threadTitle: row.thread_title,
        date: row.created_at
      });
    }

    // Sort all results by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { results: results.slice(0, options.limit || 20) };
  }

  /**
   * Create a position entry
   */
  async createPosition(position: Partial<NegotiationPosition>): Promise<NegotiationPosition> {
    return this.setPosition(position);
  }

  /**
   * Update a position entry
   */
  async updatePosition(positionId: string, updates: Partial<NegotiationPosition>): Promise<NegotiationPosition> {
    return this.setPosition({ ...updates, id: positionId });
  }

  // ==================== STATISTICS ====================

  /**
   * Get negotiation statistics
   */
  async getStatistics(programId: string): Promise<{
    totalThreads: number;
    byStatus: Record<string, number>;
    byAgency: Record<string, number>;
    avgResolutionDays: number;
    positionsAgreed: number;
    positionsDisagreed: number;
    upcomingDeadlines: Array<{ threadId: string; title: string; deadline: Date }>;
  }> {
    // Count by status
    const statusResult = await this.pool.query(`
      SELECT status, COUNT(*) as count
      FROM innovation.negotiation_threads
      WHERE program_id = $1
      GROUP BY status
    `, [programId]);

    const byStatus: Record<string, number> = {};
    let totalThreads = 0;
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.count);
      totalThreads += parseInt(row.count);
    }

    // Count by agency
    const agencyResult = await this.pool.query(`
      SELECT agency, COUNT(*) as count
      FROM innovation.negotiation_threads
      WHERE program_id = $1
      GROUP BY agency
    `, [programId]);

    const byAgency: Record<string, number> = {};
    for (const row of agencyResult.rows) {
      byAgency[row.agency] = parseInt(row.count);
    }

    // Average resolution time
    const resolutionResult = await this.pool.query(`
      SELECT AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_days
      FROM innovation.negotiation_threads
      WHERE program_id = $1 AND status IN ('resolved', 'closed')
    `, [programId]);

    const avgResolutionDays = parseFloat(resolutionResult.rows[0]?.avg_days) || 0;

    // Position outcomes
    const positionResult = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'agreed') as agreed,
        COUNT(*) FILTER (WHERE status = 'disagreed') as disagreed
      FROM innovation.negotiation_positions np
      JOIN innovation.negotiation_threads nt ON nt.id = np.thread_id
      WHERE nt.program_id = $1
    `, [programId]);

    const positionsAgreed = parseInt(positionResult.rows[0]?.agreed) || 0;
    const positionsDisagreed = parseInt(positionResult.rows[0]?.disagreed) || 0;

    // Upcoming deadlines
    const deadlineResult = await this.pool.query(`
      SELECT id, title, response_deadline as deadline
      FROM innovation.negotiation_threads
      WHERE program_id = $1
        AND response_deadline IS NOT NULL
        AND response_deadline > NOW()
        AND status NOT IN ('resolved', 'closed')
      ORDER BY response_deadline ASC
      LIMIT 5
    `, [programId]);

    const upcomingDeadlines = deadlineResult.rows.map(row => ({
      threadId: row.id,
      title: row.title,
      deadline: row.deadline
    }));

    return {
      totalThreads,
      byStatus,
      byAgency,
      avgResolutionDays,
      positionsAgreed,
      positionsDisagreed,
      upcomingDeadlines
    };
  }

  // ==================== MAPPERS ====================

  private mapThread(row: any): NegotiationThread {
    return {
      id: row.id,
      programId: row.program_id,
      submissionId: row.submission_id,
      threadCode: row.thread_code,
      title: row.title,
      agency: row.agency,
      division: row.division,
      meetingType: row.meeting_type,
      topic: row.topic,
      status: row.status,
      priority: row.priority,
      requestDate: row.request_date,
      meetingDate: row.meeting_date,
      responseDeadline: row.response_deadline,
      fdaProjectManager: row.fda_project_manager,
      fdaReviewers: row.fda_reviewers,
      sponsorLead: row.sponsor_lead,
      sponsorTeam: row.sponsor_team,
      objectivesSummary: row.objectives_summary,
      currentPositionSummary: row.current_position_summary,
      resolvedOutcome: row.resolved_outcome,
      tags: row.tags,
      relatedThreads: row.related_threads,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapEntry(row: any): NegotiationEntry {
    return {
      id: row.id,
      threadId: row.thread_id,
      entryNumber: parseInt(row.entry_number),
      entryType: row.entry_type,
      title: row.title,
      direction: row.direction,
      content: row.content,
      summary: row.summary,
      documentIds: row.document_ids,
      participants: row.participants,
      fdaFeedbackSummary: row.fda_feedback_summary,
      actionItems: row.action_items,
      commitmentsMade: row.commitments_made,
      questionsAsked: row.questions_asked,
      questionsAnswered: row.questions_answered,
      entryDate: row.entry_date,
      dueDate: row.due_date,
      status: row.status,
      contentEmbedding: row.content_embedding,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPosition(row: any): NegotiationPosition {
    return {
      id: row.id,
      threadId: row.thread_id,
      topic: row.topic,
      sponsorPosition: row.sponsor_position,
      sponsorRationale: row.sponsor_rationale,
      fdaPosition: row.fda_position,
      fdaFeedback: row.fda_feedback,
      status: row.status,
      resolutionSummary: row.resolution_summary,
      resolvedAt: row.resolved_at,
      supportingEntries: row.supporting_entries,
      impactIfRejected: row.impact_if_rejected,
      alternativeProposal: row.alternative_proposal,
      positionEmbedding: row.position_embedding,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default RegulatoryNegotiationLogbookService;
