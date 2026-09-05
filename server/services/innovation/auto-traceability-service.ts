/**
 * Auto-Traceability Service
 * 
 * Enterprise-grade service for automatic traceability link detection
 * during document drafting. Uses semantic analysis to connect claims
 * to requirements, evidence, and supporting documentation.
 * 
 * Features:
 * - Real-time link detection during drafting
 * - Semantic similarity matching
 * - Multi-type link classification
 * - Traceability matrix generation
 * 
 * Part 11 Compliance: Full audit trail for all links
 */

import { Pool } from 'pg';
import { ai } from '../../lib/unified-ai-client';
import { getOpenAIClient } from '../openai-client';
import crypto from 'crypto';
import { releaseWithoutBypass } from './rlsBypassSession';

// Types
export type TraceLinkType = 
  | 'SUPPORTS'
  | 'DERIVES_FROM'
  | 'REFERENCES'
  | 'CONTRADICTS'
  | 'SUPERSEDES'
  | 'DEFINES'
  | 'VALIDATES'
  | 'IMPLEMENTS';

export interface AutoTraceLink {
  id: string;
  programId: string;
  sessionId?: string;
  sourceDocumentId?: string;
  sourceAtomId?: string;
  sourceSectionPath?: string;
  sourceText: string;
  sourceTextHash?: string;
  targetDocumentId?: string;
  targetAtomId?: string;
  targetSectionPath?: string;
  targetText?: string;
  targetType: 'requirement' | 'claim' | 'data' | 'reference';
  linkType: TraceLinkType;
  confidenceScore: number;
  detectionMethod: 'semantic' | 'keyword' | 'reference_parse' | 'manual';
  detectionModel?: string;
  isValidated: boolean;
  validatedBy?: string;
  validatedAt?: Date;
  validationStatus?: 'confirmed' | 'rejected' | 'modified';
  createdAt: Date;
}

export interface TraceabilityMatrixSnapshot {
  id: string;
  programId: string;
  snapshotName?: string;
  snapshotType: 'milestone' | 'submission' | 'audit' | 'periodic';
  totalRequirements: number;
  tracedRequirements: number;
  coveragePercentage: number;
  matrixData: any;
  summaryStats?: any;
  status: 'draft' | 'finalized' | 'superseded';
  finalizedAt?: Date;
  finalizedBy?: string;
  createdAt: Date;
}

export interface TraceabilityCell {
  requirementId: string;
  requirementText: string;
  links: Array<{
    sourceId: string;
    sourceText: string;
    linkType: TraceLinkType;
    confidence: number;
    validated: boolean;
  }>;
  coverage: 'full' | 'partial' | 'none';
}

export interface DetectionContext {
  programId: string;
  sessionId?: string;
  documentId?: string;
  sectionPath?: string;
}

interface RequirementTarget {
  id: string;
  text: string;
  type: string;
  embedding?: number[];
  sectionPath?: string;
  documentId?: string;
}

export class AutoTraceabilityService {
  private pool: Pool;
  private embeddingCache: Map<string, number[]>;
  private requirementCache: Map<string, RequirementTarget[]>;
  private static linkCache: AutoTraceLink[] = [];
  private static snapshotCache: TraceabilityMatrixSnapshot[] = [];

  constructor(pool: Pool, openaiApiKey?: string) {
    this.pool = pool;
    this.embeddingCache = new Map();
    this.requirementCache = new Map();
  }

  /**
   * Detect traceability links for new content
   */
  async detectLinks(
    sourceTextOrInput: string | {
      documentId: string;
      content: string;
      sourceType?: string;
      programId?: string;
    },
    context?: DetectionContext,
    targetTypes: ('requirement' | 'claim' | 'data' | 'reference')[] = ['requirement', 'claim', 'data', 'reference']
  ): Promise<AutoTraceLink[] | { potentialLinks: AutoTraceLink[] }> {
    if (typeof sourceTextOrInput !== 'string') {
      const programId = sourceTextOrInput.programId || await this.resolveProgramId();
      const links = await this.detectLinksInternal(
        sourceTextOrInput.content,
        {
          programId: programId || '',
          documentId: sourceTextOrInput.documentId
        },
        targetTypes
      );
      return { potentialLinks: links };
    }

    return this.detectLinksInternal(sourceTextOrInput, context!, targetTypes);
  }

  private async detectLinksInternal(
    sourceText: string,
    context: DetectionContext,
    targetTypes: ('requirement' | 'claim' | 'data' | 'reference')[]
  ): Promise<AutoTraceLink[]> {
    const detectedLinks: AutoTraceLink[] = [];

    // Skip very short text
    if (sourceText.trim().length < 20) {
      return detectedLinks;
    }

    // Generate embedding for source text
    const sourceEmbedding = await this.generateEmbedding(sourceText);

    // Get potential targets
    const targets = await this.getTraceTargets(context.programId, targetTypes);

    // Find semantic matches
    for (const target of targets) {
      if (!target.embedding) {
        target.embedding = await this.generateEmbedding(target.text);
      }

      const similarity = this.cosineSimilarity(sourceEmbedding, target.embedding);

      // Threshold for link detection
      if (similarity > 0.75) {
        const linkType = this.classifyLinkType(sourceText, target.text);
        
        detectedLinks.push({
          id: '', // Will be set by DB
          programId: context.programId,
          sessionId: context.sessionId,
          sourceDocumentId: context.documentId,
          sourceSectionPath: context.sectionPath,
          sourceText: sourceText.substring(0, 500),
          sourceTextHash: this.hashText(sourceText),
          targetDocumentId: target.documentId,
          targetAtomId: target.id,
          targetSectionPath: target.sectionPath,
          targetText: target.text,
          targetType: target.type as any,
          linkType,
          confidenceScore: similarity,
          detectionMethod: 'semantic',
          detectionModel: 'text-embedding-3-small',
          isValidated: false,
          createdAt: new Date()
        });
      }
    }

    // Also detect explicit references
    const referenceLinks = this.detectExplicitReferences(sourceText, context);
    detectedLinks.push(...referenceLinks);

    // Deduplicate
    const unique = this.deduplicateLinks(detectedLinks);

    // Store detected links
    for (const link of unique) {
      await this.storeLink(link);
    }

    console.log(`[AutoTrace] Detected ${unique.length} links for content`);
    return unique;
  }

  /**
   * Create a trace link with simplified input
   */
  async createLink(input: {
    programId: string;
    sourceType?: string;
    sourceId: string;
    sourceLocation?: string;
    targetType: string;
    targetId: string;
    targetLocation?: string;
    linkType: string;
    confidence: number;
    creationMethod?: 'auto_detected' | 'manual';
  }): Promise<AutoTraceLink> {
    const link = await this.storeLink({
      id: '',
      programId: input.programId,
      sourceDocumentId: input.sourceId,
      sourceSectionPath: input.sourceLocation,
      sourceText: input.sourceLocation || 'source',
      targetDocumentId: input.targetId,
      targetSectionPath: input.targetLocation,
      targetText: input.targetLocation,
      targetType: (input.targetType as any) || 'reference',
      linkType: this.normalizeLinkType(input.linkType),
      confidenceScore: input.confidence,
      detectionMethod: input.creationMethod === 'manual' ? 'manual' : 'semantic',
      isValidated: false,
      createdAt: new Date()
    } as AutoTraceLink);

    return link;
  }

  /**
   * Validate a link with defaults
   */
  async validateLink(linkId: string): Promise<AutoTraceLink>;
  async validateLink(
    linkId: string,
    status: 'confirmed' | 'rejected' | 'modified',
    validatedBy: string,
    modifications?: Partial<AutoTraceLink>
  ): Promise<AutoTraceLink>;
  async validateLink(
    linkId: string,
    status: 'confirmed' | 'rejected' | 'modified' = 'confirmed',
    validatedBy: string = 'system',
    modifications?: Partial<AutoTraceLink>
  ): Promise<AutoTraceLink> {
    return this.validateLinkInternal(linkId, status, validatedBy, modifications);
  }

  /**
   * Detect explicit references in text (citations, section refs, etc.)
   */
  private detectExplicitReferences(text: string, context: DetectionContext): AutoTraceLink[] {
    const links: AutoTraceLink[] = [];

    // Citation patterns
    const citationPatterns = [
      /\[(\d+(?:[\s,-]+\d+)*)\]/g,                    // [1], [1-3]
      /\(([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s*\d{4})\)/g,  // (Smith et al., 2020)
      /(?:per|see|refer to)\s+(?:Section|Module)\s+([\d.]+)/gi  // per Section 2.3
    ];

    for (const pattern of citationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        links.push({
          id: '',
          programId: context.programId,
          sessionId: context.sessionId,
          sourceDocumentId: context.documentId,
          sourceSectionPath: context.sectionPath,
          sourceText: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + match[0].length + 50)),
          targetText: match[1],
          targetType: 'reference',
          linkType: 'REFERENCES',
          confidenceScore: 0.95,
          detectionMethod: 'reference_parse',
          isValidated: false,
          createdAt: new Date()
        });
      }
    }

    return links;
  }

  /**
   * Classify the type of link based on content
   */
  private classifyLinkType(sourceText: string, targetText: string): TraceLinkType {
    const sourceLower = sourceText.toLowerCase();
    const targetLower = targetText.toLowerCase();

    // Check for contradiction indicators
    if (sourceLower.includes('however') || sourceLower.includes('contrary') ||
        sourceLower.includes('unlike') || sourceLower.includes('in contrast')) {
      return 'CONTRADICTS';
    }

    // Check for derivation indicators
    if (sourceLower.includes('based on') || sourceLower.includes('derived from') ||
        sourceLower.includes('calculated from') || sourceLower.includes('extracted from')) {
      return 'DERIVES_FROM';
    }

    // Check for implementation indicators
    if (sourceLower.includes('implements') || sourceLower.includes('in compliance with') ||
        sourceLower.includes('per requirement') || sourceLower.includes('as required')) {
      return 'IMPLEMENTS';
    }

    // Check for validation indicators
    if (sourceLower.includes('validates') || sourceLower.includes('confirms') ||
        sourceLower.includes('verified by') || sourceLower.includes('demonstrated')) {
      return 'VALIDATES';
    }

    // Check for definition indicators
    if (sourceLower.includes('defined as') || sourceLower.includes('definition') ||
        targetLower.includes('means') || targetLower.includes('refers to')) {
      return 'DEFINES';
    }

    // Check for supersession indicators
    if (sourceLower.includes('supersedes') || sourceLower.includes('replaces') ||
        sourceLower.includes('updated') || sourceLower.includes('revised')) {
      return 'SUPERSEDES';
    }

    // Default to SUPPORTS
    return 'SUPPORTS';
  }

  /**
   * Get potential trace targets for a program
   */
  private async getTraceTargets(
    programId: string,
    types: string[]
  ): Promise<RequirementTarget[]> {
    // Check cache
    const cacheKey = `${programId}-${types.join(',')}`;
    if (this.requirementCache.has(cacheKey)) {
      return this.requirementCache.get(cacheKey)!;
    }

    const targets: RequirementTarget[] = [];

    // Get requirements from lumen schema if available
    try {
      const atomsResult = await this.pool.query(`
        SELECT id, content, atom_type, metadata
        FROM lumen.data_atoms
        WHERE program_id = $1 AND is_active = TRUE
        LIMIT 1000
      `, [programId]);

      for (const row of atomsResult.rows) {
        let type: string;
        switch (row.atom_type) {
          case 'REQUIREMENT':
          case 'GUIDANCE':
            type = 'requirement';
            break;
          case 'FINDING':
          case 'CONCLUSION':
            type = 'claim';
            break;
          case 'DATA_POINT':
          case 'STATISTIC':
            type = 'data';
            break;
          default:
            type = 'reference';
        }

        if (types.includes(type)) {
          targets.push({
            id: row.id,
            text: row.content,
            type,
            sectionPath: row.metadata?.section_path
          });
        }
      }
    } catch (error) {
      // Lumen schema might not exist, continue with other sources
      console.log('[AutoTrace] Lumen atoms not available, using alternative sources');
    }

    // Get regulatory requirements if available
    try {
      if (types.includes('requirement')) {
        const reqResult = await this.pool.query(`
          SELECT id, criterion_name || ': ' || description as text, 'requirement' as type
          FROM innovation.readiness_criteria
          WHERE is_active = TRUE
          LIMIT 500
        `);

        for (const row of reqResult.rows) {
          targets.push({
            id: row.id,
            text: row.text,
            type: 'requirement'
          });
        }
      }
    } catch (error) {
      // Continue without readiness criteria
    }

    // Cache results
    this.requirementCache.set(cacheKey, targets);
    
    // Expire cache after 5 minutes
    setTimeout(() => this.requirementCache.delete(cacheKey), 5 * 60 * 1000);

    return targets;
  }

  /**
   * Store a detected link
   */
  private async storeLink(link: AutoTraceLink): Promise<AutoTraceLink> {
    const client = await this.pool.connect();
    try {
      await client.query("SET app.bypass_rls = 'true'");
      await client.query("SET app.is_admin = 'true'");
      const result = await client.query(`
        INSERT INTO innovation.auto_trace_links (
          program_id, session_id, source_document_id, source_atom_id,
          source_section_path, source_text, source_text_hash,
          target_document_id, target_atom_id, target_section_path, target_text,
          target_type, link_type, confidence_score, detection_method, detection_model,
          is_validated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, FALSE)
        RETURNING *
      `, [
        link.programId,
        link.sessionId,
        link.sourceDocumentId,
        link.sourceAtomId,
        link.sourceSectionPath,
        link.sourceText,
        link.sourceTextHash,
        link.targetDocumentId,
        link.targetAtomId,
        link.targetSectionPath,
        link.targetText,
        link.targetType,
        link.linkType,
        link.confidenceScore,
        link.detectionMethod,
        link.detectionModel
      ]);

      const row = result?.rows?.[0];
      if (!row) {
        const fallback = { ...link, id: crypto.randomUUID(), createdAt: new Date() };
        AutoTraceabilityService.linkCache.push(fallback);
        return fallback;
      }

      const mapped = this.mapLink(row);
      AutoTraceabilityService.linkCache.push(mapped);
      return mapped;
    } finally {
      await releaseWithoutBypass(client);
    }
  }

  /**
   * Validate a link (confirm, reject, or modify)
   */
  private async validateLinkInternal(
    linkId: string,
    status: 'confirmed' | 'rejected' | 'modified',
    validatedBy: string,
    modifications?: Partial<AutoTraceLink>
  ): Promise<AutoTraceLink> {
    let query = `
      UPDATE innovation.auto_trace_links
      SET is_validated = TRUE,
          validated_by = $2,
          validated_at = NOW(),
          validation_status = $3
    `;
    const params: any[] = [linkId, validatedBy, status];

    if (modifications?.linkType) {
      query += `, link_type = $${params.length + 1}`;
      params.push(modifications.linkType);
    }

    query += ` WHERE id = $1 RETURNING *`;

    const result = await this.pool.query(query, params);
    const row = result?.rows?.[0];
    if (!row) {
      const cached = AutoTraceabilityService.linkCache.find(l => l.id === linkId);
      if (cached) {
        return { ...cached, isValidated: true, validationStatus: status };
      }
    }
    return this.mapLink(row);
  }

  /**
   * Get links for a program/session
   */
  async getLinks(
    programId: string,
    options: {
      sessionId?: string;
      documentId?: string;
      linkType?: TraceLinkType;
      validatedOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<AutoTraceLink[]> {
    let query = `
      SELECT * FROM innovation.auto_trace_links
      WHERE program_id = $1
    `;
    const params: any[] = [programId];
    let paramCount = 1;

    if (options.sessionId) {
      paramCount++;
      query += ` AND session_id = $${paramCount}`;
      params.push(options.sessionId);
    }

    if (options.documentId) {
      paramCount++;
      query += ` AND (source_document_id = $${paramCount} OR target_document_id = $${paramCount})`;
      params.push(options.documentId);
    }

    if (options.linkType) {
      paramCount++;
      query += ` AND link_type = $${paramCount}`;
      params.push(options.linkType);
    }

    if (options.validatedOnly) {
      query += ` AND is_validated = TRUE`;
    }

    query += ` ORDER BY confidence_score DESC`;

    if (options.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
    }

    const result = await this.pool.query(query, params);
    const links = result.rows.map(this.mapLink);
    if (links.length === 0 && AutoTraceabilityService.linkCache.length > 0) {
      return AutoTraceabilityService.linkCache.filter(l => l.programId === programId);
    }
    return links;
  }

  /**
   * Generate a traceability matrix snapshot
   */
  async generateMatrixSnapshot(
    programId: string,
    snapshotType: 'milestone' | 'submission' | 'audit' | 'periodic',
    snapshotName?: string
  ): Promise<TraceabilityMatrixSnapshot> {
    const client = await this.pool.connect();

    try {
      await client.query("SET app.bypass_rls = 'true'");
      await client.query("SET app.is_admin = 'true'");
      await client.query('BEGIN');

      // Get all requirements
      const requirements = await this.getTraceTargets(programId, ['requirement']);

      // Get all links for this program
      const links = await this.getLinks(programId, { validatedOnly: false });

      // Build matrix
      const matrix: TraceabilityCell[] = [];
      let tracedCount = 0;

      for (const req of requirements) {
        const reqLinks = links.filter(l => 
          l.targetAtomId === req.id || 
          (l.targetText && this.textsMatch(l.targetText, req.text))
        );

        const coverage: 'full' | 'partial' | 'none' = 
          reqLinks.length === 0 ? 'none' :
          reqLinks.some(l => l.isValidated) ? 'full' : 'partial';

        if (coverage !== 'none') {
          tracedCount++;
        }

        matrix.push({
          requirementId: req.id,
          requirementText: req.text,
          links: reqLinks.map(l => ({
            sourceId: l.id,
            sourceText: l.sourceText,
            linkType: l.linkType,
            confidence: l.confidenceScore,
            validated: l.isValidated
          })),
          coverage
        });
      }

      const totalRequirements = requirements.length;
      const coveragePercentage = totalRequirements > 0 
        ? (tracedCount / totalRequirements) * 100 
        : 0;

      // Summary statistics
      const summaryStats = {
        totalLinks: links.length,
        validatedLinks: links.filter(l => l.isValidated).length,
        byLinkType: {} as Record<string, number>,
        byTargetType: {} as Record<string, number>,
        avgConfidence: links.reduce((sum, l) => sum + l.confidenceScore, 0) / Math.max(links.length, 1)
      };

      for (const link of links) {
        summaryStats.byLinkType[link.linkType] = (summaryStats.byLinkType[link.linkType] || 0) + 1;
        summaryStats.byTargetType[link.targetType] = (summaryStats.byTargetType[link.targetType] || 0) + 1;
      }

      // Store snapshot
      const result = await client.query(`
        INSERT INTO innovation.traceability_matrix_snapshots (
          program_id, snapshot_name, snapshot_type,
          total_requirements, traced_requirements, coverage_percentage,
          matrix_data, summary_stats, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
        RETURNING *
      `, [
        programId,
        snapshotName || `${snapshotType} snapshot - ${new Date().toISOString().split('T')[0]}`,
        snapshotType,
        totalRequirements,
        tracedCount,
        coveragePercentage,
        JSON.stringify(matrix),
        JSON.stringify(summaryStats)
      ]);

      await client.query('COMMIT');

      console.log(`[AutoTrace] Matrix snapshot created: ${coveragePercentage.toFixed(1)}% coverage`);
      const row = result?.rows?.[0];
      if (!row) {
        const fallback: TraceabilityMatrixSnapshot = {
          id: crypto.randomUUID(),
          programId,
          snapshotName: snapshotName || `${snapshotType} snapshot`,
          snapshotType,
          totalRequirements,
          tracedRequirements: tracedCount,
          coveragePercentage,
          matrixData: matrix,
          summaryStats,
          status: 'draft',
          createdAt: new Date()
        };
        AutoTraceabilityService.snapshotCache.push(fallback);
        return fallback;
      }

      const mapped = this.mapSnapshot(row);
      AutoTraceabilityService.snapshotCache.push(mapped);
      return mapped;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[AutoTrace] Matrix snapshot failed:', error);
      throw error;
    } finally {
      await releaseWithoutBypass(client);
    }
  }

  /**
   * Get matrix snapshot
   */
  async getMatrixSnapshot(snapshotId: string): Promise<TraceabilityMatrixSnapshot | null> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.traceability_matrix_snapshots WHERE id = $1
    `, [snapshotId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSnapshot(result.rows[0]);
  }

  /**
   * Get latest matrix for a program
   */
  async getLatestMatrix(programId: string): Promise<TraceabilityMatrixSnapshot | null> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.traceability_matrix_snapshots
      WHERE program_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [programId]);

    if (result.rows.length === 0) {
      return null;
    }

    if (result.rows.length > 0) {
      return this.mapSnapshot(result.rows[0]);
    }

    const cached = AutoTraceabilityService.snapshotCache.filter(s => s.programId === programId);
    return cached[0] || null;
  }

  /**
   * Generate traceability matrix with simplified input
   */
  async generateMatrix(input: { programId: string; includeTypes?: string[] }): Promise<{ matrix: any }> {
    const snapshot = await this.generateMatrixSnapshot(input.programId, 'periodic');
    return { matrix: snapshot.matrixData };
  }

  private normalizeLinkType(linkType: string): TraceLinkType {
    return linkType.toUpperCase().replace(/[^A-Z_]/g, '_') as TraceLinkType;
  }

  private async resolveProgramId(): Promise<string | undefined> {
    // Multi-tenant safety (ledger C-47): only auto-resolve a default program when
    // exactly one exists. Grabbing the globally-latest program returned an
    // arbitrary tenant's row to a caller with no program context (cross-tenant
    // leak). Ambiguous (>1) → undefined; callers degrade to an empty program id.
    try {
      const result = await this.pool.query('SELECT id FROM programs LIMIT 2');
      if (result.rows.length === 1) return result.rows[0].id;
      if (result.rows.length > 1) return undefined;
    } catch {
      // table absent / not this shape — try core schema
    }

    try {
      const result = await this.pool.query('SELECT id FROM core.programs LIMIT 2');
      if (result.rows.length === 1) return result.rows[0].id;
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Finalize a matrix snapshot
   */
  async finalizeSnapshot(snapshotId: string, finalizedBy: string): Promise<TraceabilityMatrixSnapshot> {
    const result = await this.pool.query(`
      UPDATE innovation.traceability_matrix_snapshots
      SET status = 'finalized', finalized_at = NOW(), finalized_by = $2
      WHERE id = $1
      RETURNING *
    `, [snapshotId, finalizedBy]);

    return this.mapSnapshot(result.rows[0]);
  }

  /**
   * Get traceability statistics
   */
  async getStatistics(programId: string): Promise<{
    totalLinks: number;
    validatedLinks: number;
    pendingValidation: number;
    byLinkType: Record<string, number>;
    byTargetType: Record<string, number>;
    avgConfidence: number;
    coveragePercentage: number;
  }> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(*) FILTER (WHERE is_validated = TRUE) as validated_links,
        COUNT(*) FILTER (WHERE is_validated = FALSE) as pending_validation,
        AVG(confidence_score) as avg_confidence
      FROM innovation.auto_trace_links
      WHERE program_id = $1
    `, [programId]);

    const linkTypeResult = await this.pool.query(`
      SELECT link_type, COUNT(*) as count
      FROM innovation.auto_trace_links
      WHERE program_id = $1
      GROUP BY link_type
    `, [programId]);

    const targetTypeResult = await this.pool.query(`
      SELECT target_type, COUNT(*) as count
      FROM innovation.auto_trace_links
      WHERE program_id = $1
      GROUP BY target_type
    `, [programId]);

    const row = result.rows[0];
    
    const byLinkType: Record<string, number> = {};
    for (const r of linkTypeResult.rows) {
      byLinkType[r.link_type] = parseInt(r.count);
    }

    const byTargetType: Record<string, number> = {};
    for (const r of targetTypeResult.rows) {
      byTargetType[r.target_type] = parseInt(r.count);
    }

    // Get coverage from latest matrix
    const matrixResult = await this.pool.query(`
      SELECT coverage_percentage FROM innovation.traceability_matrix_snapshots
      WHERE program_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [programId]);

    return {
      totalLinks: parseInt(row.total_links) || 0,
      validatedLinks: parseInt(row.validated_links) || 0,
      pendingValidation: parseInt(row.pending_validation) || 0,
      byLinkType,
      byTargetType,
      avgConfidence: parseFloat(row.avg_confidence) || 0,
      coveragePercentage: matrixResult.rows.length > 0 
        ? parseFloat(matrixResult.rows[0].coverage_percentage) 
        : 0
    };
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text.substring(0, 500));
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const openai = getOpenAIClient();
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000)
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.error('[AutoTrace] Embedding failed:', error);
      return new Array(1536).fill(0);
    }
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Hash text for caching/deduplication
   */
  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Check if two texts match (fuzzy)
   */
  private textsMatch(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const normA = normalize(a);
    const normB = normalize(b);
    return normA.includes(normB) || normB.includes(normA) || 
           this.levenshteinSimilarity(normA, normB) > 0.8;
  }

  /**
   * Calculate Levenshtein similarity
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a.length === 0) return b.length === 0 ? 1 : 0;
    if (b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - (matrix[b.length][a.length] / maxLen);
  }

  /**
   * Deduplicate links
   */
  private deduplicateLinks(links: AutoTraceLink[]): AutoTraceLink[] {
    const seen = new Set<string>();
    return links.filter(link => {
      const key = `${link.sourceTextHash || link.sourceText}-${link.targetText}-${link.linkType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Map database row to link
   */
  private mapLink(row: any): AutoTraceLink {
    return {
      id: row.id,
      programId: row.program_id,
      sessionId: row.session_id,
      sourceDocumentId: row.source_document_id,
      sourceAtomId: row.source_atom_id,
      sourceSectionPath: row.source_section_path,
      sourceText: row.source_text,
      sourceTextHash: row.source_text_hash,
      targetDocumentId: row.target_document_id,
      targetAtomId: row.target_atom_id,
      targetSectionPath: row.target_section_path,
      targetText: row.target_text,
      targetType: row.target_type,
      linkType: row.link_type,
      confidenceScore: parseFloat(row.confidence_score),
      detectionMethod: row.detection_method,
      detectionModel: row.detection_model,
      isValidated: row.is_validated,
      validatedBy: row.validated_by,
      validatedAt: row.validated_at,
      validationStatus: row.validation_status,
      createdAt: row.created_at
    };
  }

  /**
   * Map database row to snapshot
   */
  private mapSnapshot(row: any): TraceabilityMatrixSnapshot {
    return {
      id: row.id,
      programId: row.program_id,
      snapshotName: row.snapshot_name,
      snapshotType: row.snapshot_type,
      totalRequirements: parseInt(row.total_requirements),
      tracedRequirements: parseInt(row.traced_requirements),
      coveragePercentage: parseFloat(row.coverage_percentage),
      matrixData: row.matrix_data,
      summaryStats: row.summary_stats,
      status: row.status,
      finalizedAt: row.finalized_at,
      finalizedBy: row.finalized_by,
      createdAt: row.created_at
    };
  }
}

export default AutoTraceabilityService;
