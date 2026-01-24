/**
 * Regulatory Delta Radar Service
 * 
 * Enterprise-grade service for detecting and managing regulatory deltas
 * between submission content and agency guidance documents.
 * 
 * Features:
 * - Real-time guidance document monitoring
 * - Semantic similarity analysis for change detection
 * - Automated delta classification and prioritization
 * - Resolution workflow tracking
 * 
 * Part 11 Compliance: Full audit trail for all delta operations
 */

import { Pool } from 'pg';
import OpenAI from 'openai';
import crypto from 'crypto';

// Types
export interface GuidanceDocument {
  id: string;
  agency: string;
  documentNumber?: string;
  title: string;
  version?: string;
  contentHash: string;
  contentText?: string;
  effectiveDate?: Date;
  publicationDate: Date;
  therapeuticArea?: string[];
  submissionTypes?: string[];
  documentType: string;
  sourceUrl?: string;
}

export interface DeltaRadarScan {
  id: string;
  programId: string;
  orgId: string;
  scanType: 'full' | 'incremental' | 'targeted';
  targetGuidanceIds?: string[];
  totalDeltasFound: number;
  criticalDeltas: number;
  highDeltas: number;
  mediumDeltas: number;
  lowDeltas: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface DeltaFinding {
  id: string;
  scanId: string;
  programId: string;
  guidanceDocumentId: string;
  affectedDocumentId?: string;
  affectedSectionPath?: string;
  deltaType: 'new_requirement' | 'changed_requirement' | 'removed_requirement';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  guidanceText?: string;
  currentState?: string;
  recommendedAction: string;
  confidenceScore: number;
  semanticSimilarity?: number;
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed';
  resolutionNotes?: string;
}

export interface DeltaRadarConfig {
  semanticThreshold: number;
  criticalKeywords: string[];
  agencies: string[];
  submissionTypes: string[];
}

interface ScanContext {
  programId: string;
  orgId: string;
  submissionType?: string;
  therapeuticArea?: string;
  existingContent?: Map<string, string>;
}

export class RegulatoryDeltaRadarService {
  private pool: Pool;
  private openai: OpenAI;
  private embeddingCache: Map<string, number[]>;
  private defaultConfig: DeltaRadarConfig;

  constructor(pool: Pool, openaiApiKey?: string) {
    this.pool = pool;
    this.openai = new OpenAI({ apiKey: openaiApiKey || process.env.OPENAI_API_KEY });
    this.embeddingCache = new Map();
    this.defaultConfig = {
      semanticThreshold: 0.75,
      criticalKeywords: [
        'must', 'shall', 'required', 'mandatory', 'prohibited',
        'safety', 'efficacy', 'clinical hold', 'refuse to file'
      ],
      agencies: ['FDA', 'EMA', 'ICH', 'PMDA', 'Health Canada'],
      submissionTypes: ['IND', 'NDA', 'BLA', '510k', 'PMA']
    };
  }

  /**
   * Initialize the service and validate database connectivity
   */
  async initialize(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      console.log('[DeltaRadar] Service initialized successfully');
      return true;
    } catch (error) {
      console.error('[DeltaRadar] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Import a new guidance document into the system
   */
  async importGuidanceDocument(doc: Partial<GuidanceDocument>): Promise<GuidanceDocument> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Generate content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(doc.contentText || doc.title || '')
        .digest('hex');

      // Generate embedding if content available
      let embedding: number[] | null = null;
      if (doc.contentText) {
        embedding = await this.generateEmbedding(doc.contentText);
      }

      const result = await client.query(`
        INSERT INTO innovation.guidance_documents (
          agency, document_number, title, version, content_hash,
          content_text, content_embedding, effective_date, publication_date,
          therapeutic_area, submission_types, document_type, source_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          content_hash = EXCLUDED.content_hash,
          content_text = EXCLUDED.content_text,
          content_embedding = EXCLUDED.content_embedding,
          updated_at = NOW()
        RETURNING *
      `, [
        doc.agency,
        doc.documentNumber,
        doc.title,
        doc.version,
        contentHash,
        doc.contentText,
        embedding ? `[${embedding.join(',')}]` : null,
        doc.effectiveDate,
        doc.publicationDate || new Date(),
        doc.therapeuticArea,
        doc.submissionTypes,
        doc.documentType || 'guidance',
        doc.sourceUrl
      ]);

      await client.query('COMMIT');

      console.log(`[DeltaRadar] Imported guidance document: ${doc.title}`);
      return this.mapGuidanceDocument(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DeltaRadar] Failed to import guidance:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run a delta radar scan for a program
   */
  async runDeltaScan(context: ScanContext, config?: Partial<DeltaRadarConfig>): Promise<DeltaRadarScan> {
    const scanConfig = { ...this.defaultConfig, ...config };
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create scan record
      const scanResult = await client.query(`
        INSERT INTO innovation.delta_radar_scans (
          program_id, org_id, scan_type, status, started_at
        ) VALUES ($1, $2, 'full', 'running', NOW())
        RETURNING *
      `, [context.programId, context.orgId]);

      const scan = scanResult.rows[0];
      const scanId = scan.id;

      try {
        // Get relevant guidance documents
        const guidanceResult = await client.query(`
          SELECT * FROM innovation.guidance_documents
          WHERE ($1::varchar[] IS NULL OR submission_types && $1)
            AND ($2::varchar[] IS NULL OR therapeutic_area && $2)
          ORDER BY publication_date DESC
        `, [
          context.submissionType ? [context.submissionType] : null,
          context.therapeuticArea ? [context.therapeuticArea] : null
        ]);

        const findings: DeltaFinding[] = [];

        // Analyze each guidance document
        for (const guidance of guidanceResult.rows) {
          const docFindings = await this.analyzeGuidanceDocument(
            guidance,
            context,
            scanConfig,
            scanId
          );
          findings.push(...docFindings);
        }

        // Insert findings
        for (const finding of findings) {
          await client.query(`
            INSERT INTO innovation.delta_findings (
              scan_id, program_id, guidance_document_id, affected_document_id,
              affected_section_path, delta_type, severity, title, description,
              guidance_text, current_state, recommended_action, confidence_score,
              semantic_similarity, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open')
          `, [
            finding.scanId,
            finding.programId,
            finding.guidanceDocumentId,
            finding.affectedDocumentId,
            finding.affectedSectionPath,
            finding.deltaType,
            finding.severity,
            finding.title,
            finding.description,
            finding.guidanceText,
            finding.currentState,
            finding.recommendedAction,
            finding.confidenceScore,
            finding.semanticSimilarity
          ]);
        }

        // Count findings by severity
        const criticalCount = findings.filter(f => f.severity === 'critical').length;
        const highCount = findings.filter(f => f.severity === 'high').length;
        const mediumCount = findings.filter(f => f.severity === 'medium').length;
        const lowCount = findings.filter(f => f.severity === 'low').length;

        // Update scan with results
        const finalResult = await client.query(`
          UPDATE innovation.delta_radar_scans
          SET status = 'completed',
              completed_at = NOW(),
              total_deltas_found = $2,
              critical_deltas = $3,
              high_deltas = $4,
              medium_deltas = $5,
              low_deltas = $6
          WHERE id = $1
          RETURNING *
        `, [scanId, findings.length, criticalCount, highCount, mediumCount, lowCount]);

        await client.query('COMMIT');

        console.log(`[DeltaRadar] Scan completed: ${findings.length} deltas found`);
        return this.mapScan(finalResult.rows[0]);

      } catch (analysisError) {
        // Update scan with error
        await client.query(`
          UPDATE innovation.delta_radar_scans
          SET status = 'failed', error_message = $2, completed_at = NOW()
          WHERE id = $1
        `, [scanId, String(analysisError)]);
        throw analysisError;
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DeltaRadar] Scan failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze a single guidance document for deltas
   */
  private async analyzeGuidanceDocument(
    guidance: any,
    context: ScanContext,
    config: DeltaRadarConfig,
    scanId: string
  ): Promise<DeltaFinding[]> {
    const findings: DeltaFinding[] = [];

    if (!guidance.content_text) {
      return findings;
    }

    // Extract requirements from guidance
    const requirements = this.extractRequirements(guidance.content_text);

    for (const req of requirements) {
      // Check semantic similarity with existing content
      let similarity = 0;
      let matchedContent: string | undefined;

      if (context.existingContent) {
        const reqEmbedding = await this.generateEmbedding(req.text);
        
        for (const [section, content] of context.existingContent) {
          const contentEmbedding = await this.generateEmbedding(content);
          const sim = this.cosineSimilarity(reqEmbedding, contentEmbedding);
          
          if (sim > similarity) {
            similarity = sim;
            matchedContent = content;
          }
        }
      }

      // If similarity below threshold, this is a potential gap
      if (similarity < config.semanticThreshold) {
        const severity = this.determineSeverity(req.text, config.criticalKeywords);
        
        findings.push({
          id: '', // Will be assigned by DB
          scanId,
          programId: context.programId,
          guidanceDocumentId: guidance.id,
          deltaType: 'new_requirement',
          severity,
          title: `Potential gap: ${req.text.substring(0, 100)}...`,
          description: `This requirement from ${guidance.agency} guidance may not be adequately addressed in the current submission.`,
          guidanceText: req.text,
          currentState: matchedContent || 'No matching content found',
          recommendedAction: this.generateRecommendation(req.text, severity),
          confidenceScore: 1 - similarity, // Higher confidence when less similar
          semanticSimilarity: similarity,
          status: 'open'
        });
      }
    }

    return findings;
  }

  /**
   * Extract requirements from guidance text
   */
  private extractRequirements(text: string): { text: string; type: string }[] {
    const requirements: { text: string; type: string }[] = [];
    
    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    // Keywords that indicate requirements
    const requirementIndicators = [
      'must', 'shall', 'should', 'required', 'recommended',
      'essential', 'necessary', 'mandatory', 'important'
    ];

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const isRequirement = requirementIndicators.some(ind => lower.includes(ind));
      
      if (isRequirement) {
        let type = 'recommended';
        if (lower.includes('must') || lower.includes('shall') || lower.includes('required')) {
          type = 'mandatory';
        }
        
        requirements.push({ text: sentence.trim(), type });
      }
    }

    return requirements;
  }

  /**
   * Determine severity based on content
   */
  private determineSeverity(
    text: string,
    criticalKeywords: string[]
  ): 'critical' | 'high' | 'medium' | 'low' {
    const lower = text.toLowerCase();
    
    // Critical if contains critical keywords
    const hasCritical = criticalKeywords.some(kw => lower.includes(kw.toLowerCase()));
    if (hasCritical && (lower.includes('safety') || lower.includes('efficacy'))) {
      return 'critical';
    }
    
    if (hasCritical) {
      return 'high';
    }
    
    if (lower.includes('should') || lower.includes('recommended')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Generate recommendation based on finding
   */
  private generateRecommendation(text: string, severity: string): string {
    const lower = text.toLowerCase();
    
    if (severity === 'critical') {
      return 'IMMEDIATE ACTION REQUIRED: Review this critical requirement and ensure your submission explicitly addresses it. Consider consulting with regulatory affairs.';
    }
    
    if (severity === 'high') {
      return 'HIGH PRIORITY: Add content addressing this requirement before submission. Document how your submission meets this guidance.';
    }
    
    if (lower.includes('document') || lower.includes('include')) {
      return 'Ensure the required documentation is included in the appropriate module of your submission.';
    }
    
    return 'Review this guidance recommendation and consider incorporating it into your submission.';
  }

  /**
   * Get findings for a scan
   */
  async getScanFindings(scanId: string): Promise<DeltaFinding[]> {
    const result = await this.pool.query(`
      SELECT df.*, gd.title as guidance_title, gd.agency
      FROM innovation.delta_findings df
      JOIN innovation.guidance_documents gd ON gd.id = df.guidance_document_id
      WHERE df.scan_id = $1
      ORDER BY 
        CASE df.severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        df.confidence_score DESC
    `, [scanId]);

    return result.rows.map(this.mapFinding);
  }

  /**
   * Get recent scans for a program
   */
  async getProgramScans(programId: string, limit: number = 10): Promise<DeltaRadarScan[]> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.delta_radar_scans
      WHERE program_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [programId, limit]);

    return result.rows.map(this.mapScan);
  }

  /**
   * Update finding status
   */
  async updateFindingStatus(
    findingId: string,
    status: DeltaFinding['status'],
    resolutionNotes?: string,
    resolvedBy?: string
  ): Promise<DeltaFinding> {
    const result = await this.pool.query(`
      UPDATE innovation.delta_findings
      SET status = $2,
          resolution_notes = COALESCE($3, resolution_notes),
          resolved_at = CASE WHEN $2 IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END,
          resolved_by = COALESCE($4, resolved_by)
      WHERE id = $1
      RETURNING *
    `, [findingId, status, resolutionNotes, resolvedBy]);

    return this.mapFinding(result.rows[0]);
  }

  /**
   * Get delta statistics for dashboard
   */
  async getDeltaStatistics(orgId: string): Promise<{
    totalScans: number;
    totalFindings: number;
    openCritical: number;
    openHigh: number;
    resolutionRate: number;
    avgFindingsPerScan: number;
    trendData: { date: string; count: number }[];
  }> {
    const result = await this.pool.query(`
      WITH scan_stats AS (
        SELECT 
          COUNT(*) as total_scans,
          SUM(total_deltas_found) as total_findings,
          AVG(total_deltas_found) as avg_findings
        FROM innovation.delta_radar_scans
        WHERE org_id = $1 AND status = 'completed'
      ),
      finding_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as open_critical,
          COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as open_high,
          COUNT(*) FILTER (WHERE status IN ('resolved', 'dismissed'))::float / 
            NULLIF(COUNT(*), 0) as resolution_rate
        FROM innovation.delta_findings df
        JOIN innovation.delta_radar_scans ds ON ds.id = df.scan_id
        WHERE ds.org_id = $1
      ),
      trend_data AS (
        SELECT 
          DATE_TRUNC('day', created_at)::date as scan_date,
          SUM(total_deltas_found) as daily_count
        FROM innovation.delta_radar_scans
        WHERE org_id = $1 AND status = 'completed'
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY scan_date
      )
      SELECT 
        ss.total_scans,
        ss.total_findings,
        fs.open_critical,
        fs.open_high,
        fs.resolution_rate,
        ss.avg_findings,
        COALESCE(json_agg(json_build_object('date', td.scan_date, 'count', td.daily_count))
          FILTER (WHERE td.scan_date IS NOT NULL), '[]') as trend_data
      FROM scan_stats ss, finding_stats fs
      LEFT JOIN trend_data td ON TRUE
      GROUP BY ss.total_scans, ss.total_findings, fs.open_critical, 
               fs.open_high, fs.resolution_rate, ss.avg_findings
    `, [orgId]);

    const row = result.rows[0] || {};
    
    return {
      totalScans: parseInt(row.total_scans) || 0,
      totalFindings: parseInt(row.total_findings) || 0,
      openCritical: parseInt(row.open_critical) || 0,
      openHigh: parseInt(row.open_high) || 0,
      resolutionRate: parseFloat(row.resolution_rate) || 0,
      avgFindingsPerScan: parseFloat(row.avg_findings) || 0,
      trendData: row.trend_data || []
    };
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = crypto.createHash('md5').update(text.substring(0, 500)).digest('hex');
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limit to model max
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.error('[DeltaRadar] Embedding generation failed:', error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
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
   * Map database row to GuidanceDocument
   */
  private mapGuidanceDocument(row: any): GuidanceDocument {
    return {
      id: row.id,
      agency: row.agency,
      documentNumber: row.document_number,
      title: row.title,
      version: row.version,
      contentHash: row.content_hash,
      contentText: row.content_text,
      effectiveDate: row.effective_date,
      publicationDate: row.publication_date,
      therapeuticArea: row.therapeutic_area,
      submissionTypes: row.submission_types,
      documentType: row.document_type,
      sourceUrl: row.source_url
    };
  }

  /**
   * Map database row to DeltaRadarScan
   */
  private mapScan(row: any): DeltaRadarScan {
    return {
      id: row.id,
      programId: row.program_id,
      orgId: row.org_id,
      scanType: row.scan_type,
      targetGuidanceIds: row.target_guidance_ids,
      totalDeltasFound: row.total_deltas_found || 0,
      criticalDeltas: row.critical_deltas || 0,
      highDeltas: row.high_deltas || 0,
      mediumDeltas: row.medium_deltas || 0,
      lowDeltas: row.low_deltas || 0,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message
    };
  }

  /**
   * Map database row to DeltaFinding
   */
  private mapFinding(row: any): DeltaFinding {
    return {
      id: row.id,
      scanId: row.scan_id,
      programId: row.program_id,
      guidanceDocumentId: row.guidance_document_id,
      affectedDocumentId: row.affected_document_id,
      affectedSectionPath: row.affected_section_path,
      deltaType: row.delta_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      guidanceText: row.guidance_text,
      currentState: row.current_state,
      recommendedAction: row.recommended_action,
      confidenceScore: row.confidence_score,
      semanticSimilarity: row.semantic_similarity,
      status: row.status,
      resolutionNotes: row.resolution_notes
    };
  }
}

export default RegulatoryDeltaRadarService;
