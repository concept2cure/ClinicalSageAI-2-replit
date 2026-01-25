/**
 * LUMEN CORTEX - Atom Version History Service
 *
 * Tracks all changes to atoms for audit trail and compliance.
 * Enables version comparison, rollback, and audit reporting.
 *
 * @module server/services/atomVersionService
 * @version 1.0.0
 * @enterprise true
 * @compliance 21 CFR Part 11, Annex 11
 */

import { Pool } from 'pg';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
//                         TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface AtomVersion {
  id?: string;
  atomId: string;
  versionNumber: number;
  changeType: 'create' | 'update' | 'delete' | 'restore';

  // Snapshot of data at this version
  title: string;
  content: string;
  atomType: string;
  metadata: Record<string, any>;
  tags: string[];

  // Change tracking
  changedFields: string[];
  changeSummary: string;

  // Audit info
  changedBy: string;
  changeReason?: string;
  previousVersionId?: string;

  // Integrity
  contentHash: string;
  createdAt: Date;
}

export interface VersionDiff {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
}

export interface VersionComparisonReport {
  atomId: string;
  fromVersion: number;
  toVersion: number;
  diffs: VersionDiff[];
  summary: string;
}

export interface AuditTrailEntry {
  versionId: string;
  versionNumber: number;
  changeType: string;
  changedBy: string;
  changeReason?: string;
  changedFields: string[];
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
//                      VERSION HISTORY SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AtomVersionService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        VERSION CREATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a version snapshot of an atom
   */
  async createVersion(
    atomId: string,
    changeType: 'create' | 'update' | 'delete' | 'restore',
    changedBy: string,
    changeReason?: string
  ): Promise<AtomVersion> {
    // Get current atom state
    const atomResult = await this.pool.query(
      `
      SELECT * FROM lumen_data_atoms WHERE id = $1
    `,
      [atomId]
    );

    if (atomResult.rows.length === 0 && changeType !== 'delete') {
      throw new Error(`Atom ${atomId} not found`);
    }

    const atom = atomResult.rows[0] || {};

    // Get previous version for comparison
    const prevVersionResult = await this.pool.query(
      `
      SELECT * FROM lumen_atom_versions
      WHERE atom_id = $1
      ORDER BY version_number DESC
      LIMIT 1
    `,
      [atomId]
    );

    const prevVersion = prevVersionResult.rows[0];
    const versionNumber = prevVersion ? prevVersion.version_number + 1 : 1;

    // Determine changed fields
    const changedFields = this.detectChangedFields(prevVersion, atom);

    // Generate content hash for integrity verification
    const contentHash = this.generateContentHash(atom);

    // Create version record
    const result = await this.pool.query(
      `
      INSERT INTO lumen_atom_versions (
        atom_id, version_number, change_type,
        title, content, atom_type, metadata, tags,
        changed_fields, change_summary, changed_by, change_reason,
        previous_version_id, content_hash
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `,
      [
        atomId,
        versionNumber,
        changeType,
        atom.title || '',
        atom.content || '',
        atom.atom_type || '',
        JSON.stringify(atom.metadata || {}),
        atom.tags || [],
        changedFields,
        this.generateChangeSummary(changeType, changedFields),
        changedBy,
        changeReason,
        prevVersion?.id || null,
        contentHash,
      ]
    );

    return this.mapRowToVersion(result.rows[0]);
  }

  /**
   * Detect which fields changed between versions
   */
  private detectChangedFields(prevVersion: any, currentAtom: any): string[] {
    if (!prevVersion) return ['all'];

    const changedFields: string[] = [];
    const fieldsToCheck = [
      'title',
      'content',
      'atom_type',
      'metadata',
      'tags',
      'confidence',
      'source_url',
    ];

    for (const field of fieldsToCheck) {
      const prevValue = prevVersion[field];
      const currentValue = currentAtom[field];

      if (JSON.stringify(prevValue) !== JSON.stringify(currentValue)) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  /**
   * Generate content hash for integrity verification
   */
  private generateContentHash(atom: any): string {
    const content = JSON.stringify({
      title: atom.title,
      content: atom.content,
      atomType: atom.atom_type,
      metadata: atom.metadata,
      tags: atom.tags,
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate human-readable change summary
   */
  private generateChangeSummary(changeType: string, changedFields: string[]): string {
    switch (changeType) {
      case 'create':
        return 'Initial version created';
      case 'delete':
        return 'Atom marked as deleted';
      case 'restore':
        return 'Atom restored from previous version';
      case 'update':
        if (changedFields.length === 0) return 'No changes detected';
        if (changedFields.includes('content') && changedFields.includes('title')) {
          return 'Title and content updated';
        }
        if (changedFields.includes('content')) {
          return 'Content updated';
        }
        if (changedFields.includes('metadata')) {
          return 'Metadata updated';
        }
        return `Updated: ${changedFields.join(', ')}`;
      default:
        return 'Unknown change';
    }
  }

  /**
   * Map database row to AtomVersion
   */
  private mapRowToVersion(row: any): AtomVersion {
    return {
      id: row.id,
      atomId: row.atom_id,
      versionNumber: row.version_number,
      changeType: row.change_type,
      title: row.title,
      content: row.content,
      atomType: row.atom_type,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      tags: row.tags || [],
      changedFields: row.changed_fields || [],
      changeSummary: row.change_summary,
      changedBy: row.changed_by,
      changeReason: row.change_reason,
      previousVersionId: row.previous_version_id,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        VERSION QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all versions of an atom
   */
  async getVersionHistory(atomId: string): Promise<AtomVersion[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM lumen_atom_versions
      WHERE atom_id = $1
      ORDER BY version_number DESC
    `,
      [atomId]
    );

    return result.rows.map(row => this.mapRowToVersion(row));
  }

  /**
   * Get a specific version
   */
  async getVersion(atomId: string, versionNumber: number): Promise<AtomVersion | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM lumen_atom_versions
      WHERE atom_id = $1 AND version_number = $2
    `,
      [atomId, versionNumber]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToVersion(result.rows[0]);
  }

  /**
   * Get latest version of an atom
   */
  async getLatestVersion(atomId: string): Promise<AtomVersion | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM lumen_atom_versions
      WHERE atom_id = $1
      ORDER BY version_number DESC
      LIMIT 1
    `,
      [atomId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToVersion(result.rows[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        VERSION COMPARISON
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compare two versions of an atom
   */
  async compareVersions(
    atomId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<VersionComparisonReport> {
    const [from, to] = await Promise.all([
      this.getVersion(atomId, fromVersion),
      this.getVersion(atomId, toVersion),
    ]);

    if (!from || !to) {
      throw new Error('One or both versions not found');
    }

    const diffs: VersionDiff[] = [];

    // Compare each field
    const fieldsToCompare = ['title', 'content', 'atomType', 'tags'];

    for (const field of fieldsToCompare) {
      const oldValue = (from as any)[field];
      const newValue = (to as any)[field];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        let changeType: 'added' | 'modified' | 'removed' = 'modified';

        if (oldValue === null || oldValue === undefined || oldValue === '') {
          changeType = 'added';
        } else if (newValue === null || newValue === undefined || newValue === '') {
          changeType = 'removed';
        }

        diffs.push({
          field,
          oldValue,
          newValue,
          changeType,
        });
      }
    }

    // Compare metadata changes
    const metadataDiffs = this.compareMetadata(from.metadata, to.metadata);
    diffs.push(...metadataDiffs);

    return {
      atomId,
      fromVersion,
      toVersion,
      diffs,
      summary: this.generateComparisonSummary(diffs),
    };
  }

  /**
   * Compare metadata objects
   */
  private compareMetadata(
    oldMeta: Record<string, any>,
    newMeta: Record<string, any>
  ): VersionDiff[] {
    const diffs: VersionDiff[] = [];
    const allKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)]);

    for (const key of allKeys) {
      const oldValue = oldMeta[key];
      const newValue = newMeta[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        let changeType: 'added' | 'modified' | 'removed' = 'modified';

        if (oldValue === undefined) changeType = 'added';
        else if (newValue === undefined) changeType = 'removed';

        diffs.push({
          field: `metadata.${key}`,
          oldValue,
          newValue,
          changeType,
        });
      }
    }

    return diffs;
  }

  /**
   * Generate comparison summary
   */
  private generateComparisonSummary(diffs: VersionDiff[]): string {
    if (diffs.length === 0) return 'No changes between versions';

    const added = diffs.filter(d => d.changeType === 'added').length;
    const modified = diffs.filter(d => d.changeType === 'modified').length;
    const removed = diffs.filter(d => d.changeType === 'removed').length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} field(s) added`);
    if (modified > 0) parts.push(`${modified} field(s) modified`);
    if (removed > 0) parts.push(`${removed} field(s) removed`);

    return parts.join(', ');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        VERSION ROLLBACK
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rollback atom to a previous version
   */
  async rollbackToVersion(
    atomId: string,
    targetVersion: number,
    rolledBackBy: string,
    reason: string
  ): Promise<AtomVersion> {
    const version = await this.getVersion(atomId, targetVersion);
    if (!version) {
      throw new Error(`Version ${targetVersion} not found for atom ${atomId}`);
    }

    // Update the atom to the previous state
    await this.pool.query(
      `
      UPDATE lumen_data_atoms SET
        title = $2,
        content = $3,
        atom_type = $4,
        metadata = $5,
        tags = $6,
        updated_at = NOW()
      WHERE id = $1
    `,
      [
        atomId,
        version.title,
        version.content,
        version.atomType,
        JSON.stringify(version.metadata),
        version.tags,
      ]
    );

    // Create a new version documenting the rollback
    return this.createVersion(
      atomId,
      'restore',
      rolledBackBy,
      `Rolled back to version ${targetVersion}: ${reason}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        AUDIT TRAIL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get audit trail for an atom
   */
  async getAuditTrail(atomId: string): Promise<AuditTrailEntry[]> {
    const result = await this.pool.query(
      `
      SELECT id, version_number, change_type, changed_by, change_reason,
             changed_fields, created_at
      FROM lumen_atom_versions
      WHERE atom_id = $1
      ORDER BY version_number DESC
    `,
      [atomId]
    );

    return result.rows.map(row => ({
      versionId: row.id,
      versionNumber: row.version_number,
      changeType: row.change_type,
      changedBy: row.changed_by,
      changeReason: row.change_reason,
      changedFields: row.changed_fields || [],
      timestamp: row.created_at,
    }));
  }

  /**
   * Get audit trail across all atoms for a time range
   */
  async getAuditTrailByTimeRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): Promise<Array<AuditTrailEntry & { atomId: string; atomTitle: string }>> {
    const result = await this.pool.query(
      `
      SELECT v.id, v.atom_id, v.version_number, v.change_type, v.changed_by,
             v.change_reason, v.changed_fields, v.created_at, v.title as atom_title
      FROM lumen_atom_versions v
      WHERE v.created_at BETWEEN $1 AND $2
      ORDER BY v.created_at DESC
      LIMIT $3
    `,
      [startDate, endDate, limit]
    );

    return result.rows.map(row => ({
      versionId: row.id,
      atomId: row.atom_id,
      atomTitle: row.atom_title,
      versionNumber: row.version_number,
      changeType: row.change_type,
      changedBy: row.changed_by,
      changeReason: row.change_reason,
      changedFields: row.changed_fields || [],
      timestamp: row.created_at,
    }));
  }

  /**
   * Verify version integrity using content hash
   */
  async verifyVersionIntegrity(versionId: string): Promise<{
    valid: boolean;
    storedHash: string;
    computedHash: string;
  }> {
    const result = await this.pool.query(
      `
      SELECT * FROM lumen_atom_versions WHERE id = $1
    `,
      [versionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Version ${versionId} not found`);
    }

    const version = result.rows[0];
    const computedHash = this.generateContentHash({
      title: version.title,
      content: version.content,
      atom_type: version.atom_type,
      metadata: version.metadata,
      tags: version.tags,
    });

    return {
      valid: computedHash === version.content_hash,
      storedHash: version.content_hash,
      computedHash,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        STATISTICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get version statistics
   */
  async getStatistics(): Promise<{
    totalVersions: number;
    atomsWithVersions: number;
    avgVersionsPerAtom: number;
    changeTypeDistribution: Record<string, number>;
    recentChanges: number;
  }> {
    const [totalVersions, atomsWithVersions, changeTypes, recentChanges] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM lumen_atom_versions'),
      this.pool.query('SELECT COUNT(DISTINCT atom_id) FROM lumen_atom_versions'),
      this.pool.query('SELECT change_type, COUNT(*) FROM lumen_atom_versions GROUP BY change_type'),
      this.pool.query(`
        SELECT COUNT(*) FROM lumen_atom_versions
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
    ]);

    const total = parseInt(totalVersions.rows[0].count);
    const atoms = parseInt(atomsWithVersions.rows[0].count);

    const changeTypeDistribution: Record<string, number> = {};
    for (const row of changeTypes.rows) {
      changeTypeDistribution[row.change_type] = parseInt(row.count);
    }

    return {
      totalVersions: total,
      atomsWithVersions: atoms,
      avgVersionsPerAtom: atoms > 0 ? total / atoms : 0,
      changeTypeDistribution,
      recentChanges: parseInt(recentChanges.rows[0].count),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                              FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createAtomVersionService(pool: Pool): AtomVersionService {
  return new AtomVersionService(pool);
}
