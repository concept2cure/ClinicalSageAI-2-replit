/**
 * Cortex Prime Service
 * 
 * The unified AI brain service for Clinical Sage AI.
 * Provides access to all Cortex capabilities:
 * - Unified semantic search
 * - Graph-based reasoning
 * - Regulatory intuition
 * - Epistemic intelligence
 * - Causal inference
 * - Self-evolving learning
 * - Cross-domain transfer
 * 
 * @module server/services/cortexPrimeService
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../db/pool';

// ============================================================================
// TYPES
// ============================================================================

export interface CortexAtom {
  id: string;
  orgId: string | null;
  atomType: string;
  content: string;
  structuredData?: Record<string, any>;
  embedding1536?: number[];
  embedding3072?: number[];
  sourceType?: string;
  sourceId?: string;
  qualityScore?: number;
  metadata?: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CortexEdge {
  id: string;
  sourceAtomId: string;
  targetAtomId: string;
  edgeType: string;
  strength: number;
  evidence?: Record<string, any>;
  metadata?: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
}

export interface CortexAgent {
  id: string;
  agentName: string;
  agentType: string;
  description?: string;
  capabilities: string[];
  modelConfig: Record<string, any>;
  promptTemplate?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CortexTrace {
  id: string;
  threadId: string;
  agentId?: string;
  traceType: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  reasoning?: Record<string, any>;
  status: string;
  tokenUsage?: Record<string, any>;
  durationMs?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface CortexThread {
  id: string;
  orgId: string;
  userId?: string;
  threadType: string;
  title?: string;
  contextAtomIds: string[];
  programId?: string;
  submissionId?: string;
  metadata?: Record<string, any>;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchOptions {
  atomTypes?: string[];
  therapeuticArea?: string;
  submissionType?: string;
  limit?: number;
  minSimilarity?: number;
  includePatterns?: boolean;
  includePredictions?: boolean;
}

export interface SearchResult {
  atomId: string;
  atomType: string;
  content: string;
  similarityScore: number;
  relevanceScore: number;
  sourceInfo: Record<string, any>;
  metadata: Record<string, any>;
}

export interface TraversalResult {
  atomId: string;
  atomType: string;
  content: string;
  depth: number;
  path: string[];
  edgeTypesTraversed: string[];
  cumulativeStrength: number;
}

export interface RegulatorySignal {
  id: string;
  orgId: string;
  signalType: string;
  sourceDocument: string;
  agencyCode: string;
  extractedContent: Record<string, any>;
  confidence: number;
  therapeuticArea?: string;
  submissionType?: string;
  sentimentScore?: number;
  urgencyLevel?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface IntuitionPrediction {
  id: string;
  orgId: string;
  submissionId: string;
  predictionType: string;
  predictedOutcome: string;
  confidence: number;
  supportingSignals: string[];
  riskFactors: Record<string, any>[];
  recommendations: Record<string, any>[];
  validatedAt?: Date;
  actualOutcome?: string;
  createdAt: Date;
}

export interface UncertaintyEstimate {
  id: string;
  orgId: string;
  contextType: string;
  contextId: string;
  totalUncertainty: number;
  aleatoricUncertainty: number;
  epistemicUncertainty: number;
  modelUncertainty: number;
  dataUncertainty: number;
  uncertaintyDecomposition: Record<string, any>;
  recommendedActions: Record<string, any>[];
  createdAt: Date;
}

export interface CausalEffect {
  id: string;
  graphId: string;
  causeVariable: string;
  effectVariable: string;
  effectSize: number;
  confidenceInterval: [number, number];
  pValue: number;
  mechanism?: string;
  moderators: Record<string, any>[];
  mediators: Record<string, any>[];
  isSignificant: boolean;
  createdAt: Date;
}

export interface LearningExperience {
  id: string;
  orgId?: string;
  experienceType: string;
  input: Record<string, any>;
  output: Record<string, any>;
  feedback?: Record<string, any>;
  wasSuccessful?: boolean;
  outcomeMetrics: Record<string, any>;
  lessonsLearned: string[];
  isDistillable: boolean;
  distilledTo?: string;
  createdAt: Date;
}

export interface DistilledInsight {
  id: string;
  insightType: string;
  content: string;
  embedding?: number[];
  sourceExperiences: string[];
  generalizationScope: Record<string, any>;
  confidence: number;
  applicabilityConditions: Record<string, any>;
  usageCount: number;
  successRate: number;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface DomainKnowledge {
  id: string;
  domainId: string;
  knowledgeType: string;
  content: string;
  embedding?: number[];
  structuredData?: Record<string, any>;
  sourceInfo: Record<string, any>;
  confidence: number;
  abstractionLevel: number;
  transferability: number;
  usageCount: number;
  successRate: number;
  createdAt: Date;
}

export interface TransferMapping {
  id: string;
  sourceDomainId: string;
  targetDomainId: string;
  mappingType: string;
  sourcePattern: Record<string, any>;
  targetPattern: Record<string, any>;
  transformationRules: Record<string, any>;
  confidence: number;
  validationStatus: string;
  usageCount: number;
  successRate: number;
  createdAt: Date;
}

export interface HealthCheckResult {
  status: string;
  checkedAt: Date;
  tables: Record<string, number>;
  indexes: Record<string, string>;
  latestEvolution?: Record<string, any>;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CortexPrimeService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  // ============================================================================
  // ATOM OPERATIONS
  // ============================================================================

  /**
   * Create a new knowledge atom
   */
  async createAtom(atom: Partial<CortexAtom>): Promise<CortexAtom> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO cortex.atoms (
          org_id, atom_type, content, structured_data,
          embedding_1536, embedding_3072, source_type, source_id,
          quality_score, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          atom.orgId,
          atom.atomType,
          atom.content,
          atom.structuredData ? JSON.stringify(atom.structuredData) : null,
          atom.embedding1536,
          atom.embedding3072,
          atom.sourceType,
          atom.sourceId,
          atom.qualityScore || 1.0,
          atom.metadata ? JSON.stringify(atom.metadata) : '{}'
        ]
      );
      return this.mapAtom(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get atom by ID
   */
  async getAtom(atomId: string): Promise<CortexAtom | null> {
    const result = await this.pool.query(
      'SELECT * FROM cortex.atoms WHERE id = $1 AND is_active = TRUE',
      [atomId]
    );
    return result.rows.length > 0 ? this.mapAtom(result.rows[0]) : null;
  }

  /**
   * Update atom
   */
  async updateAtom(atomId: string, updates: Partial<CortexAtom>): Promise<CortexAtom | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.content !== undefined) {
      fields.push(`content = $${idx++}`);
      values.push(updates.content);
    }
    if (updates.structuredData !== undefined) {
      fields.push(`structured_data = $${idx++}`);
      values.push(JSON.stringify(updates.structuredData));
    }
    if (updates.embedding1536 !== undefined) {
      fields.push(`embedding_1536 = $${idx++}`);
      values.push(updates.embedding1536);
    }
    if (updates.embedding3072 !== undefined) {
      fields.push(`embedding_3072 = $${idx++}`);
      values.push(updates.embedding3072);
    }
    if (updates.qualityScore !== undefined) {
      fields.push(`quality_score = $${idx++}`);
      values.push(updates.qualityScore);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return this.getAtom(atomId);

    fields.push('updated_at = NOW()');
    values.push(atomId);

    const result = await this.pool.query(
      `UPDATE cortex.atoms SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = TRUE RETURNING *`,
      values
    );

    return result.rows.length > 0 ? this.mapAtom(result.rows[0]) : null;
  }

  /**
   * Soft delete atom
   */
  async deleteAtom(atomId: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE cortex.atoms SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE',
      [atomId]
    );
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  /**
   * Unified semantic search across all knowledge
   */
  async search(
    queryEmbedding: number[],
    queryText?: string,
    orgId?: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.unified_search($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        queryEmbedding,
        queryText || null,
        options.atomTypes || null,
        orgId || null,
        options.therapeuticArea || null,
        options.submissionType || null,
        options.limit || 20,
        options.minSimilarity || 0.5
      ]
    );

    return result.rows.map(row => ({
      atomId: row.atom_id,
      atomType: row.atom_type,
      content: row.content,
      similarityScore: parseFloat(row.similarity_score),
      relevanceScore: parseFloat(row.relevance_score),
      sourceInfo: row.source_info,
      metadata: row.metadata
    }));
  }

  /**
   * Fast search using 1536-dim embeddings
   */
  async searchFast(
    queryEmbedding: number[],
    atomTypes?: string[],
    orgId?: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.unified_search_fast($1, $2, $3, $4)`,
      [queryEmbedding, atomTypes || null, orgId || null, limit]
    );

    return result.rows.map(row => ({
      atomId: row.atom_id,
      atomType: row.atom_type,
      content: row.content,
      similarityScore: parseFloat(row.similarity_score),
      relevanceScore: parseFloat(row.similarity_score),
      sourceInfo: {},
      metadata: {}
    }));
  }

  /**
   * Master query function
   */
  async query(
    queryText: string,
    queryEmbedding?: number[],
    orgId?: string,
    options: SearchOptions = {}
  ): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT cortex.query($1, $2, $3, $4)`,
      [
        queryText,
        queryEmbedding || null,
        orgId || null,
        JSON.stringify(options)
      ]
    );
    return result.rows[0]?.query || {};
  }

  // ============================================================================
  // GRAPH OPERATIONS
  // ============================================================================

  /**
   * Create edge between atoms
   */
  async createEdge(edge: Partial<CortexEdge>): Promise<CortexEdge> {
    const result = await this.pool.query(
      `INSERT INTO cortex.edges (
        source_atom_id, target_atom_id, edge_type, strength,
        evidence, org_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        edge.sourceAtomId,
        edge.targetAtomId,
        edge.edgeType,
        edge.strength || 1.0,
        edge.evidence ? JSON.stringify(edge.evidence) : null,
        null, // org_id derived from atoms
        edge.metadata ? JSON.stringify(edge.metadata) : '{}'
      ]
    );
    return this.mapEdge(result.rows[0]);
  }

  /**
   * Traverse reasoning graph
   */
  async traverseReasoning(
    startAtomId: string,
    edgeTypes?: string[],
    maxDepth: number = 3,
    minStrength: number = 0.5
  ): Promise<TraversalResult[]> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.traverse_reasoning($1, $2, $3, $4)`,
      [startAtomId, edgeTypes || null, maxDepth, minStrength]
    );

    return result.rows.map(row => ({
      atomId: row.atom_id,
      atomType: row.atom_type,
      content: row.content,
      depth: row.depth,
      path: row.path,
      edgeTypesTraversed: row.edge_types_traversed,
      cumulativeStrength: parseFloat(row.cumulative_strength)
    }));
  }

  // ============================================================================
  // THREAD OPERATIONS
  // ============================================================================

  /**
   * Create conversation thread
   */
  async createThread(thread: Partial<CortexThread>): Promise<CortexThread> {
    const result = await this.pool.query(
      `INSERT INTO cortex.threads (
        org_id, user_id, thread_type, title, context_atom_ids,
        program_id, submission_id, metadata, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        thread.orgId,
        thread.userId,
        thread.threadType || 'conversation',
        thread.title,
        thread.contextAtomIds || [],
        thread.programId,
        thread.submissionId,
        thread.metadata ? JSON.stringify(thread.metadata) : '{}',
        thread.expiresAt
      ]
    );
    return this.mapThread(result.rows[0]);
  }

  /**
   * Get thread by ID
   */
  async getThread(threadId: string): Promise<CortexThread | null> {
    const result = await this.pool.query(
      'SELECT * FROM cortex.threads WHERE id = $1 AND is_active = TRUE',
      [threadId]
    );
    return result.rows.length > 0 ? this.mapThread(result.rows[0]) : null;
  }

  /**
   * Assemble context for LLM
   */
  async assembleContext(
    threadId: string,
    maxTokens: number = 8000,
    includeHistory: boolean = true
  ): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT cortex.assemble_context($1, $2, $3)`,
      [threadId, maxTokens, includeHistory]
    );
    return result.rows[0]?.assemble_context || {};
  }

  // ============================================================================
  // TRACE OPERATIONS
  // ============================================================================

  /**
   * Create trace (memory of interaction)
   */
  async createTrace(trace: Partial<CortexTrace>): Promise<CortexTrace> {
    const result = await this.pool.query(
      `INSERT INTO cortex.traces (
        thread_id, agent_id, trace_type, input, output,
        reasoning, status, token_usage, org_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        trace.threadId,
        trace.agentId,
        trace.traceType || 'interaction',
        JSON.stringify(trace.input),
        trace.output ? JSON.stringify(trace.output) : null,
        trace.reasoning ? JSON.stringify(trace.reasoning) : null,
        trace.status || 'pending',
        trace.tokenUsage ? JSON.stringify(trace.tokenUsage) : null,
        null // org_id derived from thread
      ]
    );
    return this.mapTrace(result.rows[0]);
  }

  /**
   * Update trace with output
   */
  async completeTrace(
    traceId: string,
    output: Record<string, any>,
    status: string = 'completed',
    tokenUsage?: Record<string, any>
  ): Promise<CortexTrace | null> {
    const result = await this.pool.query(
      `UPDATE cortex.traces SET 
        output = $1, status = $2, completed_at = NOW(),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
        token_usage = COALESCE($3, token_usage)
      WHERE id = $4 RETURNING *`,
      [JSON.stringify(output), status, tokenUsage ? JSON.stringify(tokenUsage) : null, traceId]
    );
    return result.rows.length > 0 ? this.mapTrace(result.rows[0]) : null;
  }

  // ============================================================================
  // REGULATORY INTUITION
  // ============================================================================

  /**
   * Extract regulatory signals from document
   */
  async extractRegulatorySignals(
    orgId: string,
    documentId: string,
    documentContent: string,
    documentType: string
  ): Promise<RegulatorySignal[]> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.extract_regulatory_signals($1, $2, $3, $4)`,
      [orgId, documentId, documentContent, documentType]
    );
    return result.rows.map(row => this.mapRegulatorySignal(row));
  }

  /**
   * Generate intuition prediction
   */
  async generatePrediction(
    orgId: string,
    submissionId: string,
    predictionType: string = 'approval_likelihood'
  ): Promise<IntuitionPrediction | null> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.generate_intuition_prediction($1, $2, $3)`,
      [orgId, submissionId, predictionType]
    );
    return result.rows.length > 0 ? this.mapIntuitionPrediction(result.rows[0]) : null;
  }

  /**
   * Match against rejection patterns
   */
  async matchRejectionPatterns(
    orgId: string,
    submissionContent: Record<string, any>
  ): Promise<Array<{ patternId: string; patternName: string; matchScore: number; outcome: string }>> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.match_rejection_patterns($1, $2)`,
      [orgId, JSON.stringify(submissionContent)]
    );
    return result.rows.map(row => ({
      patternId: row.pattern_id,
      patternName: row.pattern_name,
      matchScore: parseFloat(row.match_score),
      outcome: row.predicted_outcome
    }));
  }

  // ============================================================================
  // EPISTEMIC INTELLIGENCE
  // ============================================================================

  /**
   * Estimate uncertainty for a context
   */
  async estimateUncertainty(
    orgId: string,
    contextType: string,
    contextId: string,
    inputData: Record<string, any>
  ): Promise<UncertaintyEstimate | null> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.estimate_uncertainty($1, $2, $3, $4)`,
      [orgId, contextType, contextId, JSON.stringify(inputData)]
    );
    return result.rows.length > 0 ? this.mapUncertaintyEstimate(result.rows[0]) : null;
  }

  /**
   * Detect knowledge gaps
   */
  async detectKnowledgeGaps(
    orgId: string,
    domain: string,
    queryEmbedding?: number[]
  ): Promise<Array<{ area: string; severity: string; suggestedQueries: string[] }>> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.detect_knowledge_gaps($1, $2, $3)`,
      [orgId, domain, queryEmbedding || null]
    );
    return result.rows.map(row => ({
      area: row.gap_area,
      severity: row.severity,
      suggestedQueries: row.suggested_queries
    }));
  }

  // ============================================================================
  // CAUSAL INFERENCE
  // ============================================================================

  /**
   * Estimate causal effect
   */
  async estimateCausalEffect(
    graphId: string,
    causeVariable: string,
    effectVariable: string
  ): Promise<CausalEffect | null> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.estimate_causal_effect($1, $2, $3)`,
      [graphId, causeVariable, effectVariable]
    );
    return result.rows.length > 0 ? this.mapCausalEffect(result.rows[0]) : null;
  }

  /**
   * Generate counterfactual scenario
   */
  async generateCounterfactual(
    graphId: string,
    interventions: Record<string, any>
  ): Promise<{ scenarioId: string; predictedOutcomes: Record<string, any> }> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.generate_counterfactual($1, $2)`,
      [graphId, JSON.stringify(interventions)]
    );
    return {
      scenarioId: result.rows[0]?.scenario_id,
      predictedOutcomes: result.rows[0]?.predicted_outcomes || {}
    };
  }

  /**
   * Get intervention recommendations
   */
  async recommendInterventions(
    graphId: string,
    targetOutcome: string,
    constraints?: Record<string, any>
  ): Promise<Array<{ variable: string; action: string; expectedImpact: number }>> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.recommend_interventions($1, $2, $3)`,
      [graphId, targetOutcome, constraints ? JSON.stringify(constraints) : null]
    );
    return result.rows.map(row => ({
      variable: row.intervention_variable,
      action: row.suggested_action,
      expectedImpact: parseFloat(row.expected_impact)
    }));
  }

  // ============================================================================
  // SELF-EVOLVING INTELLIGENCE
  // ============================================================================

  /**
   * Record learning experience
   */
  async recordLearningExperience(experience: Partial<LearningExperience>): Promise<LearningExperience> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.record_learning_experience($1, $2, $3, $4, $5)`,
      [
        experience.orgId,
        experience.experienceType,
        JSON.stringify(experience.input),
        JSON.stringify(experience.output),
        experience.wasSuccessful
      ]
    );
    return this.mapLearningExperience(result.rows[0]);
  }

  /**
   * Run distillation to extract insights
   */
  async runDistillation(minExperiences: number = 10): Promise<DistilledInsight[]> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.run_distillation($1)`,
      [minExperiences]
    );
    return result.rows.map(row => this.mapDistilledInsight(row));
  }

  /**
   * Get current expertise scores
   */
  async getExpertiseScores(domainFilter?: string): Promise<Array<{ domain: string; score: number; level: string }>> {
    let query = 'SELECT * FROM cortex.expertise_scores WHERE is_active = TRUE';
    const params: any[] = [];
    
    if (domainFilter) {
      query += ' AND domain_area = $1';
      params.push(domainFilter);
    }
    query += ' ORDER BY expertise_score DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => ({
      domain: row.domain_area,
      score: parseFloat(row.expertise_score),
      level: row.expertise_level
    }));
  }

  /**
   * Trigger evolution cycle
   */
  async evolve(): Promise<{ eventsProcessed: number; insightsCreated: number }> {
    const result = await this.pool.query(`SELECT * FROM cortex.evolve()`);
    return {
      eventsProcessed: result.rows[0]?.events_processed || 0,
      insightsCreated: result.rows[0]?.insights_created || 0
    };
  }

  // ============================================================================
  // CROSS-DOMAIN TRANSFER
  // ============================================================================

  /**
   * Find transfer candidates for a query
   */
  async findTransferCandidates(
    targetDomainId: string,
    queryEmbedding: number[],
    minSimilarity: number = 0.6
  ): Promise<Array<{ knowledgeId: string; sourceDomain: string; similarity: number; transferability: number }>> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.find_transfer_candidates($1, $2, $3)`,
      [targetDomainId, queryEmbedding, minSimilarity]
    );
    return result.rows.map(row => ({
      knowledgeId: row.knowledge_id,
      sourceDomain: row.source_domain,
      similarity: parseFloat(row.similarity),
      transferability: parseFloat(row.transferability)
    }));
  }

  /**
   * Execute knowledge transfer
   */
  async executeTransfer(
    sourceKnowledgeId: string,
    targetDomainId: string,
    transformationRules?: Record<string, any>
  ): Promise<DomainKnowledge | null> {
    const result = await this.pool.query(
      `SELECT * FROM cortex.execute_transfer($1, $2, $3)`,
      [sourceKnowledgeId, targetDomainId, transformationRules ? JSON.stringify(transformationRules) : null]
    );
    return result.rows.length > 0 ? this.mapDomainKnowledge(result.rows[0]) : null;
  }

  /**
   * Get domain similarity
   */
  async getDomainSimilarity(domain1Id: string, domain2Id: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT cortex.compute_domain_similarity($1, $2) as similarity`,
      [domain1Id, domain2Id]
    );
    return parseFloat(result.rows[0]?.similarity || 0);
  }

  // ============================================================================
  // HEALTH & DIAGNOSTICS
  // ============================================================================

  /**
   * Run health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const result = await this.pool.query(`SELECT cortex.health_check()`);
    const data = result.rows[0]?.health_check || {};
    return {
      status: data.status,
      checkedAt: new Date(data.checked_at),
      tables: data.tables,
      indexes: data.indexes,
      latestEvolution: data.latest_evolution
    };
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<Array<{
    tableName: string;
    totalRows: number;
    activeRows: number;
    orgCount: number;
    typeCount: number;
    earliest: Date;
    latest: Date;
  }>> {
    const result = await this.pool.query(`SELECT * FROM cortex.statistics`);
    return result.rows.map(row => ({
      tableName: row.table_name,
      totalRows: parseInt(row.total_rows),
      activeRows: parseInt(row.active_rows),
      orgCount: parseInt(row.org_count),
      typeCount: parseInt(row.type_count),
      earliest: row.earliest,
      latest: row.latest
    }));
  }

  // ============================================================================
  // PRIVATE MAPPERS
  // ============================================================================

  private mapAtom(row: any): CortexAtom {
    return {
      id: row.id,
      orgId: row.org_id,
      atomType: row.atom_type,
      content: row.content,
      structuredData: row.structured_data,
      embedding1536: row.embedding_1536,
      embedding3072: row.embedding_3072,
      sourceType: row.source_type,
      sourceId: row.source_id,
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : undefined,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapEdge(row: any): CortexEdge {
    return {
      id: row.id,
      sourceAtomId: row.source_atom_id,
      targetAtomId: row.target_atom_id,
      edgeType: row.edge_type,
      strength: parseFloat(row.strength),
      evidence: row.evidence,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at
    };
  }

  private mapThread(row: any): CortexThread {
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      threadType: row.thread_type,
      title: row.title,
      contextAtomIds: row.context_atom_ids || [],
      programId: row.program_id,
      submissionId: row.submission_id,
      metadata: row.metadata,
      isActive: row.is_active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapTrace(row: any): CortexTrace {
    return {
      id: row.id,
      threadId: row.thread_id,
      agentId: row.agent_id,
      traceType: row.trace_type,
      input: row.input,
      output: row.output,
      reasoning: row.reasoning,
      status: row.status,
      tokenUsage: row.token_usage,
      durationMs: row.duration_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    };
  }

  private mapRegulatorySignal(row: any): RegulatorySignal {
    return {
      id: row.id,
      orgId: row.org_id,
      signalType: row.signal_type,
      sourceDocument: row.source_document,
      agencyCode: row.agency_code,
      extractedContent: row.extracted_content,
      confidence: parseFloat(row.confidence),
      therapeuticArea: row.therapeutic_area,
      submissionType: row.submission_type,
      sentimentScore: row.sentiment_score ? parseFloat(row.sentiment_score) : undefined,
      urgencyLevel: row.urgency_level,
      isActive: row.is_active,
      createdAt: row.created_at
    };
  }

  private mapIntuitionPrediction(row: any): IntuitionPrediction {
    return {
      id: row.id,
      orgId: row.org_id,
      submissionId: row.submission_id,
      predictionType: row.prediction_type,
      predictedOutcome: row.predicted_outcome,
      confidence: parseFloat(row.confidence),
      supportingSignals: row.supporting_signals || [],
      riskFactors: row.risk_factors || [],
      recommendations: row.recommendations || [],
      validatedAt: row.validated_at,
      actualOutcome: row.actual_outcome,
      createdAt: row.created_at
    };
  }

  private mapUncertaintyEstimate(row: any): UncertaintyEstimate {
    return {
      id: row.id,
      orgId: row.org_id,
      contextType: row.context_type,
      contextId: row.context_id,
      totalUncertainty: parseFloat(row.total_uncertainty),
      aleatoricUncertainty: parseFloat(row.aleatoric_uncertainty),
      epistemicUncertainty: parseFloat(row.epistemic_uncertainty),
      modelUncertainty: parseFloat(row.model_uncertainty),
      dataUncertainty: parseFloat(row.data_uncertainty),
      uncertaintyDecomposition: row.uncertainty_decomposition,
      recommendedActions: row.recommended_actions || [],
      createdAt: row.created_at
    };
  }

  private mapCausalEffect(row: any): CausalEffect {
    return {
      id: row.id,
      graphId: row.graph_id,
      causeVariable: row.cause_variable,
      effectVariable: row.effect_variable,
      effectSize: parseFloat(row.effect_size),
      confidenceInterval: [parseFloat(row.ci_lower), parseFloat(row.ci_upper)],
      pValue: parseFloat(row.p_value),
      mechanism: row.mechanism,
      moderators: row.moderators || [],
      mediators: row.mediators || [],
      isSignificant: row.is_significant,
      createdAt: row.created_at
    };
  }

  private mapLearningExperience(row: any): LearningExperience {
    return {
      id: row.id,
      orgId: row.org_id,
      experienceType: row.experience_type,
      input: row.input,
      output: row.output,
      feedback: row.feedback,
      wasSuccessful: row.was_successful,
      outcomeMetrics: row.outcome_metrics || {},
      lessonsLearned: row.lessons_learned || [],
      isDistillable: row.is_distillable,
      distilledTo: row.distilled_to,
      createdAt: row.created_at
    };
  }

  private mapDistilledInsight(row: any): DistilledInsight {
    return {
      id: row.id,
      insightType: row.insight_type,
      content: row.content,
      embedding: row.embedding,
      sourceExperiences: row.source_experiences || [],
      generalizationScope: row.generalization_scope || {},
      confidence: parseFloat(row.confidence),
      applicabilityConditions: row.applicability_conditions || {},
      usageCount: parseInt(row.usage_count),
      successRate: parseFloat(row.success_rate),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at
    };
  }

  private mapDomainKnowledge(row: any): DomainKnowledge {
    return {
      id: row.id,
      domainId: row.domain_id,
      knowledgeType: row.knowledge_type,
      content: row.content,
      embedding: row.embedding,
      structuredData: row.structured_data,
      sourceInfo: row.source_info || {},
      confidence: parseFloat(row.confidence),
      abstractionLevel: parseInt(row.abstraction_level),
      transferability: parseFloat(row.transferability),
      usageCount: parseInt(row.usage_count),
      successRate: parseFloat(row.success_rate),
      createdAt: row.created_at
    };
  }

  private mapTransferMapping(row: any): TransferMapping {
    return {
      id: row.id,
      sourceDomainId: row.source_domain_id,
      targetDomainId: row.target_domain_id,
      mappingType: row.mapping_type,
      sourcePattern: row.source_pattern,
      targetPattern: row.target_pattern,
      transformationRules: row.transformation_rules || {},
      confidence: parseFloat(row.confidence),
      validationStatus: row.validation_status,
      usageCount: parseInt(row.usage_count),
      successRate: parseFloat(row.success_rate),
      createdAt: row.created_at
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let cortexService: CortexPrimeService | null = null;

export function getCortexPrimeService(): CortexPrimeService {
  if (!cortexService) {
    cortexService = new CortexPrimeService();
  }
  return cortexService;
}

export default CortexPrimeService;
