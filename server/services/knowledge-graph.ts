/**
 * Knowledge Graph Service
 * 
 * Implements the "Logic Layer" of the Neuro-Symbolic Architecture.
 * Provides deterministic graph-based reasoning to ground AI outputs in facts.
 * 
 * Key capabilities:
 * - Entity extraction from documents
 * - Graph edge creation and traversal
 * - Deep regulatory search (beyond vector similarity)
 * - Staleness detection for traceability
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Types
export type EntityType = 
  | 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT' | 'DOSE' | 'ROUTE_OF_ADMINISTRATION'
  | 'INDICATION' | 'POPULATION' | 'SAMPLE_SIZE' | 'STUDY_PHASE'
  | 'PRIMARY_ENDPOINT' | 'SECONDARY_ENDPOINT' | 'SAFETY_ENDPOINT'
  | 'P_VALUE' | 'CONFIDENCE_INTERVAL' | 'EFFECT_SIZE'
  | 'ADVERSE_EVENT' | 'SERIOUS_ADVERSE_EVENT'
  | 'NCT_ID' | 'IND_NUMBER' | 'NDA_NUMBER'
  | 'PROTOCOL_VERSION' | 'AMENDMENT'
  | 'SPONSOR' | 'CRO' | 'INVESTIGATOR' | 'SITE'
  | 'DATE' | 'DURATION' | 'MEASUREMENT' | 'OTHER';

export type RelationshipType =
  | 'SUPPORTS' | 'CONTRADICTS' | 'QUALIFIES' | 'EXTENDS'
  | 'DERIVED_FROM' | 'VERSION_OF' | 'SUPERSEDES' | 'AMENDMENT_OF'
  | 'CITES' | 'REFERENCES' | 'INCLUDES' | 'PART_OF'
  | 'SAME_AS' | 'RELATED_TO' | 'BASED_ON'
  | 'FULFILLS_REQUIREMENT' | 'EVIDENCE_FOR' | 'CLAIM_ABOUT'
  | 'CAUSES' | 'CORRELATES_WITH' | 'PREDICTS'
  | 'STUDY_ARM_OF' | 'COMPARATOR_FOR' | 'MEASURED_IN';

export interface ExtractedEntity {
  entityType: EntityType;
  entityValue: string;
  normalizedValue?: string;
  confidenceScore: number;
  sourceSpan?: { start: number; end: number; text: string };
  pageNumber?: number;
  sectionPath?: string;
  numericValue?: number;
  unit?: string;
}

export interface GraphEdge {
  sourceAtomId: string;
  targetAtomId: string;
  relationshipType: RelationshipType;
  strength?: number;
  evidenceText?: string;
  confidenceScore?: number;
}

export interface TraversalResult {
  atomId: string;
  depth: number;
  path: string[];
  relationshipTypes: RelationshipType[];
}

export interface TraceabilityEntry {
  requirementId: string;
  requirementType: string;
  requirementText: string;
  evidenceAtomIds: string[];
  claimAtomIds: string[];
  status: 'VERIFIED' | 'SUSPECT' | 'STALE' | 'MISSING' | 'PENDING_REVIEW';
  isStale: boolean;
}

export class KnowledgeGraphService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // Entity Extraction
  // ==========================================================================

  /**
   * Store extracted entities from a document atom
   */
  async storeEntities(atomId: string, entities: ExtractedEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const entity of entities) {
        await client.query(
          `INSERT INTO lumen.entity_extractions (
            atom_id, entity_type, entity_value, normalized_value,
            confidence_score, source_span, page_number, section_path,
            numeric_value, unit, extraction_method
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'LLM')`,
          [
            atomId,
            entity.entityType,
            entity.entityValue,
            entity.normalizedValue,
            entity.confidenceScore,
            entity.sourceSpan ? JSON.stringify(entity.sourceSpan) : null,
            entity.pageNumber,
            entity.sectionPath,
            entity.numericValue,
            entity.unit
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get entities for an atom
   */
  async getEntities(atomId: string): Promise<ExtractedEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.entity_extractions WHERE atom_id = $1`,
      [atomId]
    );

    return result.rows.map(row => ({
      entityType: row.entity_type,
      entityValue: row.entity_value,
      normalizedValue: row.normalized_value,
      confidenceScore: row.confidence_score,
      sourceSpan: row.source_span,
      pageNumber: row.page_number,
      sectionPath: row.section_path,
      numericValue: row.numeric_value,
      unit: row.unit
    }));
  }

  /**
   * Find atoms containing specific entity
   */
  async findAtomsByEntity(
    entityType: EntityType,
    entityValue?: string
  ): Promise<{ atomId: string; entities: ExtractedEntity[] }[]> {
    let query = `
      SELECT atom_id, array_agg(row_to_json(ee.*)) as entities
      FROM lumen.entity_extractions ee
      WHERE entity_type = $1
    `;
    const params: any[] = [entityType];

    if (entityValue) {
      query += ` AND (entity_value ILIKE $2 OR normalized_value ILIKE $2)`;
      params.push(`%${entityValue}%`);
    }

    query += ` GROUP BY atom_id`;

    const result = await this.pool.query(query, params);
    return result.rows.map(row => ({
      atomId: row.atom_id,
      entities: row.entities
    }));
  }

  // ==========================================================================
  // Graph Edge Management
  // ==========================================================================

  /**
   * Create a relationship edge between two atoms
   */
  async createEdge(edge: GraphEdge): Promise<string> {
    const id = uuidv4();
    
    await this.pool.query(
      `INSERT INTO lumen.atom_relationships (
        id, source_atom_id, target_atom_id, relationship_type,
        strength, evidence_text, confidence_score, extraction_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL')
      ON CONFLICT (source_atom_id, target_atom_id, relationship_type) 
      WHERE is_active = TRUE
      DO UPDATE SET 
        strength = EXCLUDED.strength,
        evidence_text = EXCLUDED.evidence_text,
        confidence_score = EXCLUDED.confidence_score`,
      [
        id,
        edge.sourceAtomId,
        edge.targetAtomId,
        edge.relationshipType,
        edge.strength ?? 1.0,
        edge.evidenceText,
        edge.confidenceScore ?? 1.0
      ]
    );

    return id;
  }

  /**
   * Create multiple edges in bulk
   */
  async createEdgesBulk(edges: GraphEdge[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const edge of edges) {
        await client.query(
          `INSERT INTO lumen.atom_relationships (
            source_atom_id, target_atom_id, relationship_type,
            strength, evidence_text, confidence_score, extraction_method
          ) VALUES ($1, $2, $3, $4, $5, $6, 'LLM')
          ON CONFLICT (source_atom_id, target_atom_id, relationship_type) 
          WHERE is_active = TRUE DO NOTHING`,
          [
            edge.sourceAtomId,
            edge.targetAtomId,
            edge.relationshipType,
            edge.strength ?? 1.0,
            edge.evidenceText,
            edge.confidenceScore ?? 1.0
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get outgoing edges from an atom
   */
  async getOutgoingEdges(atomId: string): Promise<GraphEdge[]> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.atom_relationships 
       WHERE source_atom_id = $1 AND is_active = TRUE`,
      [atomId]
    );

    return result.rows.map(row => ({
      sourceAtomId: row.source_atom_id,
      targetAtomId: row.target_atom_id,
      relationshipType: row.relationship_type,
      strength: row.strength,
      evidenceText: row.evidence_text,
      confidenceScore: row.confidence_score
    }));
  }

  /**
   * Get incoming edges to an atom
   */
  async getIncomingEdges(atomId: string): Promise<GraphEdge[]> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.atom_relationships 
       WHERE target_atom_id = $1 AND is_active = TRUE`,
      [atomId]
    );

    return result.rows.map(row => ({
      sourceAtomId: row.source_atom_id,
      targetAtomId: row.target_atom_id,
      relationshipType: row.relationship_type,
      strength: row.strength,
      evidenceText: row.evidence_text,
      confidenceScore: row.confidence_score
    }));
  }

  // ==========================================================================
  // Graph Traversal
  // ==========================================================================

  /**
   * Traverse graph from starting atom
   */
  async traverseGraph(
    startAtomId: string,
    options: {
      maxDepth?: number;
      relationshipTypes?: RelationshipType[];
      direction?: 'OUTGOING' | 'INCOMING' | 'BOTH';
    } = {}
  ): Promise<TraversalResult[]> {
    const { maxDepth = 3, relationshipTypes, direction = 'OUTGOING' } = options;

    const result = await this.pool.query(
      `SELECT * FROM lumen.traverse_graph($1, $2, $3, $4)`,
      [
        startAtomId,
        maxDepth,
        relationshipTypes || null,
        direction
      ]
    );

    return result.rows.map(row => ({
      atomId: row.atom_id,
      depth: row.depth,
      path: row.path,
      relationshipTypes: row.relationship_types
    }));
  }

  /**
   * Find shortest path between two atoms
   */
  async findPath(
    sourceAtomId: string,
    targetAtomId: string,
    maxDepth: number = 5
  ): Promise<{ path: string[]; relationshipTypes: RelationshipType[]; length: number } | null> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.find_path($1, $2, $3)`,
      [sourceAtomId, targetAtomId, maxDepth]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      path: row.path,
      relationshipTypes: row.relationship_types,
      length: row.path_length
    };
  }

  /**
   * Find all supporting evidence for a claim atom
   */
  async findSupportingEvidence(claimAtomId: string): Promise<{
    evidenceAtomId: string;
    relationshipType: RelationshipType;
    confidence: number;
    evidenceText: string;
  }[]> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.find_supporting_evidence($1)`,
      [claimAtomId]
    );

    return result.rows;
  }

  /**
   * Deep search: Find all documents derived from a source
   */
  async findDerivedDocuments(sourceAtomId: string): Promise<{
    atomId: string;
    title: string;
    derivationPath: string[];
  }[]> {
    const result = await this.pool.query(
      `WITH derived AS (
        SELECT * FROM lumen.traverse_graph($1, 5, ARRAY['DERIVED_FROM', 'VERSION_OF', 'AMENDMENT_OF']::lumen.relationship_type[], 'INCOMING')
      )
      SELECT d.atom_id, da.title, d.path
      FROM derived d
      JOIN lumen.data_atoms da ON da.id = d.atom_id
      ORDER BY d.depth`,
      [sourceAtomId]
    );

    return result.rows.map(row => ({
      atomId: row.atom_id,
      title: row.title,
      derivationPath: row.path
    }));
  }

  // ==========================================================================
  // Traceability Matrix
  // ==========================================================================

  /**
   * Add a traceability entry
   */
  async addTraceabilityEntry(entry: TraceabilityEntry & { programId?: string }): Promise<string> {
    const id = uuidv4();

    await this.pool.query(
      `INSERT INTO lumen.traceability_matrix (
        id, program_id, requirement_id, requirement_type, requirement_text,
        evidence_atom_ids, claim_atom_ids, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        entry.programId || null,
        entry.requirementId,
        entry.requirementType,
        entry.requirementText,
        entry.evidenceAtomIds,
        entry.claimAtomIds,
        entry.status
      ]
    );

    return id;
  }

  /**
   * Get stale traceability entries (sources changed)
   */
  async getStaleEntries(programId?: string): Promise<TraceabilityEntry[]> {
    let query = `
      SELECT * FROM lumen.traceability_matrix 
      WHERE is_stale = TRUE
    `;
    const params: any[] = [];

    if (programId) {
      query += ` AND program_id = $1`;
      params.push(programId);
    }

    query += ` ORDER BY stale_since DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Mark entries as verified
   */
  async verifyEntry(entryId: string, verifiedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE lumen.traceability_matrix
       SET status = 'VERIFIED',
           is_stale = FALSE,
           stale_since = NULL,
           staleness_reason = NULL,
           last_verified_at = NOW(),
           last_verified_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [entryId, verifiedBy]
    );
  }

  // ==========================================================================
  // Graph Statistics
  // ==========================================================================

  /**
   * Get graph statistics
   */
  async getGraphStats(): Promise<{
    totalAtoms: number;
    totalEdges: number;
    totalEntities: number;
    atomsWithOutgoing: number;
    atomsWithIncoming: number;
    staleTraceabilityEntries: number;
    suspectEntries: number;
  }> {
    const result = await this.pool.query(`SELECT * FROM lumen.v_graph_statistics`);
    const row = result.rows[0];

    return {
      totalAtoms: parseInt(row.total_atoms),
      totalEdges: parseInt(row.total_edges),
      totalEntities: parseInt(row.total_entities),
      atomsWithOutgoing: parseInt(row.atoms_with_outgoing),
      atomsWithIncoming: parseInt(row.atoms_with_incoming),
      staleTraceabilityEntries: parseInt(row.stale_traceability_entries),
      suspectEntries: parseInt(row.suspect_entries)
    };
  }
}
