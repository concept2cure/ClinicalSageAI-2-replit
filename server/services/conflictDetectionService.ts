/**
 * LUMEN CORTEX - Conflict Detection Service
 *
 * Identifies and manages contradictory information across the knowledge base.
 * Essential for maintaining regulatory data integrity and accuracy.
 *
 * @module server/services/conflictDetectionService
 * @version 1.0.0
 * @enterprise true
 */

import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════
//                         TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ConflictType =
  | 'factual_contradiction' // Direct factual disagreement
  | 'temporal_inconsistency' // Time-based conflicts
  | 'regulatory_discrepancy' // Different regulatory interpretations
  | 'dosage_conflict' // Dosage/safety parameter differences
  | 'outcome_divergence' // Different clinical outcomes reported
  | 'procedural_conflict' // Different procedural requirements
  | 'superseded_information'; // Older info not marked as outdated

export type ConflictSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ResolutionStrategy =
  | 'prefer_newer' // Use most recent information
  | 'prefer_primary_source' // Use primary regulatory source
  | 'prefer_higher_quality' // Use higher quality score
  | 'manual_review' // Requires human review
  | 'merge_information' // Combine both perspectives
  | 'mark_both_uncertain'; // Flag both as uncertain

export interface Conflict {
  id?: string;
  atomId1: string;
  atomId2: string;
  conflictType: ConflictType;
  severity: ConflictSeverity;
  description: string;
  evidence: string;
  suggestedResolution?: ResolutionStrategy;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  metadata?: Record<string, any>;
}

export interface ConflictReport {
  conflict: Conflict;
  atom1: AtomSummary;
  atom2: AtomSummary;
  autoResolvable: boolean;
  confidenceInResolution: number;
}

interface AtomSummary {
  id: string;
  title: string;
  atomType: string;
  sourceType: string;
  createdAt: Date;
  qualityScore?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//                      CONFLICT DETECTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class ConflictDetectionService {
  private pool: Pool;

  // Keywords that indicate potential conflicts
  private conflictIndicators = {
    contradiction: [
      'however',
      'contrary',
      'contradicts',
      'in contrast',
      'opposite',
      'disputes',
      'challenges',
      'refutes',
      'disagrees',
      'conflicts with',
      'inconsistent with',
      'contradictory',
    ],
    supersession: [
      'supersedes',
      'replaces',
      'updates',
      'revised',
      'new guidance',
      'amended',
      'withdrawn',
      'obsolete',
      'deprecated',
      'previous version',
    ],
    uncertainty: [
      'uncertain',
      'unclear',
      'ambiguous',
      'conflicting evidence',
      'insufficient data',
      'controversial',
      'debated',
    ],
  };

  // Source hierarchy for resolution
  private sourceHierarchy: Record<string, number> = {
    ich_guideline: 100,
    fda_guidance: 95,
    ema_guideline: 95,
    fda_regulation: 93,
    ema_decision: 92,
    fda_warning_letter: 90,
    'clinicaltrials.gov': 80,
    pubmed_meta_analysis: 75,
    pubmed: 70,
    derived_analysis: 50,
    manual_entry: 40,
    web_scrape: 30,
    unknown: 10,
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                      CONFLICT DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Detect conflicts for a specific atom
   */
  async detectConflictsForAtom(atomId: string): Promise<ConflictReport[]> {
    const conflicts: ConflictReport[] = [];

    // Get the target atom
    const atomResult = await this.pool.query(
      `
      SELECT a.*, q.overall_score as quality_score
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE a.id = $1
    `,
      [atomId]
    );

    if (atomResult.rows.length === 0) {
      throw new Error(`Atom ${atomId} not found`);
    }

    const targetAtom = atomResult.rows[0];

    // 1. Check for content-based contradictions
    const contentConflicts = await this.detectContentConflicts(targetAtom);
    conflicts.push(...contentConflicts);

    // 2. Check for temporal/supersession conflicts
    const temporalConflicts = await this.detectTemporalConflicts(targetAtom);
    conflicts.push(...temporalConflicts);

    // 3. Check for regulatory discrepancies
    const regulatoryConflicts = await this.detectRegulatoryDiscrepancies(targetAtom);
    conflicts.push(...regulatoryConflicts);

    // Store detected conflicts
    for (const conflict of conflicts) {
      await this.storeConflict(conflict.conflict);
    }

    return conflicts;
  }

  /**
   * Detect content-based contradictions
   */
  private async detectContentConflicts(targetAtom: any): Promise<ConflictReport[]> {
    const conflicts: ConflictReport[] = [];
    const targetContent = `${targetAtom.title} ${targetAtom.content}`.toLowerCase();

    // Find atoms with overlapping topics but potentially conflicting content
    const relatedAtoms = await this.pool.query(
      `
      SELECT a.*, q.overall_score as quality_score
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE a.id != $1
        AND a.atom_type = $2
        AND (
          a.tags && $3::text[]
          OR to_tsvector('english', a.title || ' ' || a.content) @@ plainto_tsquery('english', $4)
        )
      LIMIT 50
    `,
      [targetAtom.id, targetAtom.atom_type, targetAtom.tags || [], targetAtom.title]
    );

    for (const relatedAtom of relatedAtoms.rows) {
      const relatedContent = `${relatedAtom.title} ${relatedAtom.content}`.toLowerCase();

      // Check for contradiction indicators
      for (const indicator of this.conflictIndicators.contradiction) {
        if (relatedContent.includes(indicator)) {
          // Further analysis needed - check if they reference each other or same topic
          const similarity = this.calculateContentOverlap(targetContent, relatedContent);

          if (similarity > 0.3) {
            const conflict = this.createConflictReport(
              targetAtom,
              relatedAtom,
              'factual_contradiction',
              `Content contains contradiction indicator "${indicator}" with ${Math.round(similarity * 100)}% topic overlap`,
              indicator
            );
            conflicts.push(conflict);
            break;
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect temporal/supersession conflicts
   */
  private async detectTemporalConflicts(targetAtom: any): Promise<ConflictReport[]> {
    const conflicts: ConflictReport[] = [];

    // Find newer atoms on the same topic
    const newerAtoms = await this.pool.query(
      `
      SELECT a.*, q.overall_score as quality_score
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE a.id != $1
        AND a.atom_type = $2
        AND a.created_at > $3
        AND (
          a.tags && $4::text[]
          OR a.title ILIKE $5
        )
      ORDER BY a.created_at DESC
      LIMIT 20
    `,
      [
        targetAtom.id,
        targetAtom.atom_type,
        targetAtom.created_at,
        targetAtom.tags || [],
        `%${targetAtom.title.split(' ').slice(0, 3).join('%')}%`,
      ]
    );

    for (const newerAtom of newerAtoms.rows) {
      const newerContent = `${newerAtom.title} ${newerAtom.content}`.toLowerCase();

      // Check for supersession indicators
      for (const indicator of this.conflictIndicators.supersession) {
        if (newerContent.includes(indicator)) {
          const conflict = this.createConflictReport(
            targetAtom,
            newerAtom,
            'superseded_information',
            `Newer atom (${newerAtom.created_at.toISOString().split('T')[0]}) may supersede this information`,
            indicator
          );
          conflict.conflict.suggestedResolution = 'prefer_newer';
          conflict.autoResolvable = true;
          conflict.confidenceInResolution = 0.7;
          conflicts.push(conflict);
          break;
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect regulatory discrepancies (FDA vs EMA vs other agencies)
   */
  private async detectRegulatoryDiscrepancies(targetAtom: any): Promise<ConflictReport[]> {
    const conflicts: ConflictReport[] = [];
    const targetAgency = this.extractAgency(targetAtom);

    if (!targetAgency) return conflicts;

    // Find atoms from different agencies on similar topics
    const otherAgencyAtoms = await this.pool.query(
      `
      SELECT a.*, q.overall_score as quality_score
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE a.id != $1
        AND a.atom_type = $2
        AND a.source_type NOT ILIKE $3
        AND (
          a.tags && $4::text[]
          OR a.title ILIKE $5
        )
      LIMIT 30
    `,
      [
        targetAtom.id,
        targetAtom.atom_type,
        `%${targetAgency}%`,
        targetAtom.tags || [],
        `%${this.extractProductName(targetAtom) || targetAtom.title.split(' ').slice(0, 2).join('%')}%`,
      ]
    );

    for (const otherAtom of otherAgencyAtoms.rows) {
      const otherAgency = this.extractAgency(otherAtom);
      if (!otherAgency || otherAgency === targetAgency) continue;

      // Check for regulatory discrepancies (different decisions on same product)
      const targetOutcome = this.extractOutcome(targetAtom);
      const otherOutcome = this.extractOutcome(otherAtom);

      if (targetOutcome && otherOutcome && targetOutcome !== otherOutcome) {
        const conflict = this.createConflictReport(
          targetAtom,
          otherAtom,
          'regulatory_discrepancy',
          `Different regulatory outcomes: ${targetAgency} (${targetOutcome}) vs ${otherAgency} (${otherOutcome})`,
          `${targetAgency}: ${targetOutcome}, ${otherAgency}: ${otherOutcome}`
        );
        conflict.conflict.severity = 'high';
        conflict.autoResolvable = false;
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Calculate content overlap using simple word intersection
   */
  private calculateContentOverlap(content1: string, content2: string): number {
    const words1 = new Set(content1.split(/\s+/).filter(w => w.length > 4));
    const words2 = new Set(content2.split(/\s+/).filter(w => w.length > 4));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }

    return intersection / Math.min(words1.size, words2.size);
  }

  /**
   * Extract agency from atom
   */
  private extractAgency(atom: any): string | null {
    if (atom.metadata?.agency) return atom.metadata.agency;
    const sourceType = (atom.source_type || '').toLowerCase();
    if (sourceType.includes('fda')) return 'FDA';
    if (sourceType.includes('ema')) return 'EMA';
    if (sourceType.includes('pmda')) return 'PMDA';
    if (sourceType.includes('health canada')) return 'Health Canada';
    return null;
  }

  /**
   * Extract product name from atom
   */
  private extractProductName(atom: any): string | null {
    if (atom.metadata?.product_name) return atom.metadata.product_name;
    if (atom.metadata?.drug_name) return atom.metadata.drug_name;
    return null;
  }

  /**
   * Extract outcome/decision from atom
   */
  private extractOutcome(atom: any): string | null {
    if (atom.metadata?.decision) return atom.metadata.decision;
    if (atom.metadata?.outcome) return atom.metadata.outcome;

    const content = (atom.content || '').toLowerCase();
    if (content.includes('approved')) return 'approved';
    if (content.includes('rejected') || content.includes('refusal')) return 'rejected';
    if (content.includes('withdrawn')) return 'withdrawn';
    if (content.includes('pending')) return 'pending';
    return null;
  }

  /**
   * Create a conflict report
   */
  private createConflictReport(
    atom1: any,
    atom2: any,
    conflictType: ConflictType,
    description: string,
    evidence: string
  ): ConflictReport {
    // Determine severity
    let severity: ConflictSeverity = 'medium';
    if (conflictType === 'factual_contradiction') severity = 'high';
    if (conflictType === 'regulatory_discrepancy') severity = 'high';
    if (conflictType === 'dosage_conflict') severity = 'critical';
    if (conflictType === 'superseded_information') severity = 'low';

    // Determine auto-resolvability
    const autoResolvable = ['superseded_information', 'temporal_inconsistency'].includes(
      conflictType
    );

    // Suggest resolution
    let suggestedResolution: ResolutionStrategy = 'manual_review';
    if (conflictType === 'superseded_information') suggestedResolution = 'prefer_newer';
    if (conflictType === 'temporal_inconsistency') suggestedResolution = 'prefer_newer';

    return {
      conflict: {
        atomId1: atom1.id,
        atomId2: atom2.id,
        conflictType,
        severity,
        description,
        evidence,
        suggestedResolution,
      },
      atom1: {
        id: atom1.id,
        title: atom1.title,
        atomType: atom1.atom_type,
        sourceType: atom1.source_type,
        createdAt: atom1.created_at,
        qualityScore: atom1.quality_score,
      },
      atom2: {
        id: atom2.id,
        title: atom2.title,
        atomType: atom2.atom_type,
        sourceType: atom2.source_type,
        createdAt: atom2.created_at,
        qualityScore: atom2.quality_score,
      },
      autoResolvable,
      confidenceInResolution: autoResolvable ? 0.7 : 0.3,
    };
  }

  /**
   * Store conflict in database
   */
  private async storeConflict(conflict: Conflict): Promise<string> {
    const result = await this.pool.query(
      `
      INSERT INTO lumen_atom_conflicts (
        atom_id_1, atom_id_2, conflict_type, severity, description,
        evidence, suggested_resolution
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (atom_id_1, atom_id_2, conflict_type) DO UPDATE SET
        severity = $4,
        description = $5,
        detected_at = NOW()
      RETURNING id
    `,
      [
        conflict.atomId1,
        conflict.atomId2,
        conflict.conflictType,
        conflict.severity,
        conflict.description,
        conflict.evidence,
        conflict.suggestedResolution,
      ]
    );

    return result.rows[0].id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                      CONFLICT RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Auto-resolve conflicts that can be automated
   */
  async autoResolveConflicts(): Promise<{ resolved: number; strategy: Record<string, number> }> {
    const unresolvedResult = await this.pool.query(`
      SELECT * FROM lumen_atom_conflicts
      WHERE resolved_at IS NULL
        AND conflict_type IN ('superseded_information', 'temporal_inconsistency')
    `);

    let resolved = 0;
    const strategyCount: Record<string, number> = {};

    for (const conflict of unresolvedResult.rows) {
      const strategy = conflict.suggested_resolution || 'prefer_newer';

      // Apply resolution
      await this.pool.query(
        `
        UPDATE lumen_atom_conflicts
        SET resolved_at = NOW(),
            resolved_by = 'auto_resolution',
            resolution_notes = $1
        WHERE id = $2
      `,
        [`Auto-resolved using ${strategy} strategy`, conflict.id]
      );

      resolved++;
      strategyCount[strategy] = (strategyCount[strategy] || 0) + 1;
    }

    return { resolved, strategy: strategyCount };
  }

  /**
   * Manually resolve a conflict
   */
  async resolveConflict(conflictId: string, resolvedBy: string, notes: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE lumen_atom_conflicts
      SET resolved_at = NOW(),
          resolved_by = $1,
          resolution_notes = $2
      WHERE id = $3
    `,
      [resolvedBy, notes, conflictId]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                      CONFLICT QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get unresolved conflicts
   */
  async getUnresolvedConflicts(limit: number = 50): Promise<ConflictReport[]> {
    const result = await this.pool.query(
      `
      SELECT c.*,
             a1.title as atom1_title, a1.atom_type as atom1_type, a1.source_type as atom1_source,
             a2.title as atom2_title, a2.atom_type as atom2_type, a2.source_type as atom2_source
      FROM lumen_atom_conflicts c
      JOIN lumen_data_atoms a1 ON c.atom_id_1 = a1.id
      JOIN lumen_data_atoms a2 ON c.atom_id_2 = a2.id
      WHERE c.resolved_at IS NULL
      ORDER BY
        CASE c.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        c.detected_at DESC
      LIMIT $1
    `,
      [limit]
    );

    return result.rows.map(row => ({
      conflict: {
        id: row.id,
        atomId1: row.atom_id_1,
        atomId2: row.atom_id_2,
        conflictType: row.conflict_type,
        severity: row.severity,
        description: row.description,
        evidence: row.evidence,
        suggestedResolution: row.suggested_resolution,
      },
      atom1: {
        id: row.atom_id_1,
        title: row.atom1_title,
        atomType: row.atom1_type,
        sourceType: row.atom1_source,
        createdAt: row.detected_at,
      },
      atom2: {
        id: row.atom_id_2,
        title: row.atom2_title,
        atomType: row.atom2_type,
        sourceType: row.atom2_source,
        createdAt: row.detected_at,
      },
      autoResolvable: ['superseded_information', 'temporal_inconsistency'].includes(
        row.conflict_type
      ),
      confidenceInResolution: 0.5,
    }));
  }

  /**
   * Get conflict statistics
   */
  async getConflictStatistics(): Promise<{
    total: number;
    unresolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const [total, unresolved, bySeverity, byType] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM lumen_atom_conflicts'),
      this.pool.query('SELECT COUNT(*) FROM lumen_atom_conflicts WHERE resolved_at IS NULL'),
      this.pool.query('SELECT severity, COUNT(*) FROM lumen_atom_conflicts GROUP BY severity'),
      this.pool.query(
        'SELECT conflict_type, COUNT(*) FROM lumen_atom_conflicts GROUP BY conflict_type'
      ),
    ]);

    const severityMap: Record<string, number> = {};
    for (const row of bySeverity.rows) {
      severityMap[row.severity] = parseInt(row.count);
    }

    const typeMap: Record<string, number> = {};
    for (const row of byType.rows) {
      typeMap[row.conflict_type] = parseInt(row.count);
    }

    return {
      total: parseInt(total.rows[0].count),
      unresolved: parseInt(unresolved.rows[0].count),
      bySeverity: severityMap,
      byType: typeMap,
    };
  }

  /**
   * Run full conflict detection scan
   */
  async runFullScan(limit: number = 100): Promise<{ scanned: number; conflictsFound: number }> {
    const atomsResult = await this.pool.query(
      `
      SELECT id FROM lumen_data_atoms LIMIT $1
    `,
      [limit]
    );

    let conflictsFound = 0;
    for (const atom of atomsResult.rows) {
      const conflicts = await this.detectConflictsForAtom(atom.id);
      conflictsFound += conflicts.length;
    }

    return {
      scanned: atomsResult.rows.length,
      conflictsFound,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                              FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createConflictDetectionService(pool: Pool): ConflictDetectionService {
  return new ConflictDetectionService(pool);
}
