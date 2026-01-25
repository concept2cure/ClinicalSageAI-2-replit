/**
 * LUMEN CORTEX - Knowledge Graph Service
 *
 * Automated knowledge graph construction and traversal.
 * Discovers and maintains relationships between atoms.
 *
 * @module server/services/knowledgeGraphService
 * @version 1.0.0
 * @enterprise true
 */

import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════
//                         TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type RelationshipType =
  | 'references' // A references B
  | 'contradicts' // A contradicts B
  | 'supports' // A supports/confirms B
  | 'supersedes' // A replaces/updates B
  | 'derived_from' // A was derived from B
  | 'related_to' // Generic relationship
  | 'part_of' // A is component of B
  | 'example_of' // A exemplifies B
  | 'requires' // A requires B
  | 'caused_by' // A caused by B
  | 'precedes' // A temporally before B
  | 'same_topic' // A and B discuss same topic
  | 'same_product' // A and B about same product
  | 'same_agency' // A and B from same regulatory agency
  | 'similar_outcome' // A and B have similar outcomes
  | 'contrasting_outcome'; // A and B have different outcomes

export interface Edge {
  id?: string;
  sourceAtomId: string;
  targetAtomId: string;
  relationshipType: RelationshipType;
  relationshipStrength: number; // 0.0 - 1.0
  bidirectional: boolean;
  extractedFrom?: 'content_analysis' | 'citation' | 'manual' | 'embedding_similarity' | 'metadata';
  confidence: number;
  metadata?: Record<string, any>;
}

export interface GraphNode {
  atomId: string;
  title: string;
  atomType: string;
  sourceType: string;
  confidence: number;
  qualityScore?: number;
  edges: Edge[];
}

export interface PathResult {
  pathAtoms: string[];
  pathRelationships: string[];
  pathLength: number;
}

export interface SubgraphResult {
  nodes: GraphNode[];
  edges: Edge[];
  centerAtomId: string;
  depth: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//                      KNOWLEDGE GRAPH SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class KnowledgeGraphService {
  private pool: Pool;

  // Relationship keywords for content analysis
  private relationshipPatterns: Record<RelationshipType, RegExp[]> = {
    references: [
      /according to/i,
      /as stated in/i,
      /cites/i,
      /references/i,
      /per guidance/i,
      /FDA guidance/i,
      /EMA guideline/i,
    ],
    contradicts: [
      /however/i,
      /in contrast/i,
      /contradicts/i,
      /conflicting/i,
      /disagrees with/i,
      /opposite/i,
    ],
    supports: [
      /supports/i,
      /confirms/i,
      /consistent with/i,
      /in agreement/i,
      /corroborates/i,
      /validates/i,
    ],
    supersedes: [/replaces/i, /supersedes/i, /updated/i, /revised/i, /new guidance/i],
    derived_from: [/based on/i, /derived from/i, /extracted from/i, /learned from/i],
    related_to: [/related to/i, /associated with/i, /concerning/i, /regarding/i],
    part_of: [/part of/i, /section of/i, /component of/i, /included in/i],
    example_of: [/for example/i, /such as/i, /instance of/i, /case study/i],
    requires: [/requires/i, /must include/i, /necessary/i, /mandatory/i, /prerequisite/i],
    caused_by: [/caused by/i, /due to/i, /resulted from/i, /because of/i],
    precedes: [/before/i, /prior to/i, /precedes/i, /followed by/i],
    same_topic: [],
    same_product: [],
    same_agency: [],
    similar_outcome: [],
    contrasting_outcome: [],
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                           EDGE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create an edge between two atoms
   */
  async createEdge(edge: Edge): Promise<string> {
    const result = await this.pool.query(
      `
      INSERT INTO lumen_knowledge_graph_edges (
        source_atom_id, target_atom_id, relationship_type, relationship_strength,
        bidirectional, extracted_from, confidence, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (source_atom_id, target_atom_id, relationship_type)
      DO UPDATE SET
        relationship_strength = GREATEST(lumen_knowledge_graph_edges.relationship_strength, $4),
        confidence = GREATEST(lumen_knowledge_graph_edges.confidence, $7),
        updated_at = NOW()
      RETURNING id
    `,
      [
        edge.sourceAtomId,
        edge.targetAtomId,
        edge.relationshipType,
        edge.relationshipStrength,
        edge.bidirectional,
        edge.extractedFrom || 'manual',
        edge.confidence,
        JSON.stringify(edge.metadata || {}),
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Create multiple edges in batch
   */
  async createEdgesBatch(edges: Edge[]): Promise<number> {
    if (edges.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];

    edges.forEach((edge, i) => {
      const offset = i * 8;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
      values.push(
        edge.sourceAtomId,
        edge.targetAtomId,
        edge.relationshipType,
        edge.relationshipStrength,
        edge.bidirectional,
        edge.extractedFrom || 'manual',
        edge.confidence,
        JSON.stringify(edge.metadata || {})
      );
    });

    const result = await this.pool.query(
      `
      INSERT INTO lumen_knowledge_graph_edges (
        source_atom_id, target_atom_id, relationship_type, relationship_strength,
        bidirectional, extracted_from, confidence, metadata
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (source_atom_id, target_atom_id, relationship_type)
      DO UPDATE SET
        relationship_strength = GREATEST(lumen_knowledge_graph_edges.relationship_strength, EXCLUDED.relationship_strength),
        confidence = GREATEST(lumen_knowledge_graph_edges.confidence, EXCLUDED.confidence),
        updated_at = NOW()
    `,
      values
    );

    return result.rowCount || 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                     AUTOMATIC EDGE DISCOVERY
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Discover edges based on content analysis
   */
  async discoverEdgesFromContent(atomId: string): Promise<Edge[]> {
    // Get the atom
    const atomResult = await this.pool.query(
      `
      SELECT id, title, content, atom_type, source_type, metadata
      FROM lumen_data_atoms WHERE id = $1
    `,
      [atomId]
    );

    if (atomResult.rows.length === 0) return [];
    const atom = atomResult.rows[0];
    const content = `${atom.title} ${atom.content}`;

    const discoveredEdges: Edge[] = [];

    // Find relationships by pattern matching
    for (const [relType, patterns] of Object.entries(this.relationshipPatterns)) {
      if (patterns.length === 0) continue;

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          // Found a potential relationship - look for related atoms
          const relatedAtoms = await this.findRelatedAtomsByKeywords(
            atomId,
            content,
            relType as RelationshipType
          );

          for (const related of relatedAtoms) {
            discoveredEdges.push({
              sourceAtomId: atomId,
              targetAtomId: related.id,
              relationshipType: relType as RelationshipType,
              relationshipStrength: related.strength,
              bidirectional: ['related_to', 'same_topic', 'same_product', 'same_agency'].includes(
                relType
              ),
              extractedFrom: 'content_analysis',
              confidence: 0.6,
              metadata: { pattern: pattern.source },
            });
          }
          break; // Found match for this relationship type
        }
      }
    }

    return discoveredEdges;
  }

  /**
   * Find related atoms by extracted keywords
   */
  private async findRelatedAtomsByKeywords(
    sourceAtomId: string,
    content: string,
    relType: RelationshipType
  ): Promise<Array<{ id: string; strength: number }>> {
    // Extract key terms (drug names, guideline references, etc.)
    const keyTerms = this.extractKeyTerms(content);
    if (keyTerms.length === 0) return [];

    // Search for atoms containing these terms
    const searchQuery = keyTerms.join(' | ');
    const result = await this.pool.query(
      `
      SELECT id,
             ts_rank(to_tsvector('english', title || ' ' || content), to_tsquery('english', $1)) as rank
      FROM lumen_data_atoms
      WHERE id != $2
        AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT 10
    `,
      [searchQuery, sourceAtomId]
    );

    return result.rows.map(row => ({
      id: row.id,
      strength: Math.min(1.0, row.rank / 10),
    }));
  }

  /**
   * Extract key terms from content
   */
  private extractKeyTerms(content: string): string[] {
    const terms: string[] = [];

    // FDA regulation references
    const fdaRefs = content.match(/21 CFR [\d.]+/gi);
    if (fdaRefs) terms.push(...fdaRefs);

    // Drug names (capitalized words often)
    const drugPattern =
      /\b[A-Z][a-z]+(?:mab|nib|zole|tide|stat|pril|sartan|olol|pine|pam|zepam)\b/g;
    const drugs = content.match(drugPattern);
    if (drugs) terms.push(...drugs);

    // ICH guidelines
    const ichRefs = content.match(/ICH [A-Z]\d+[A-Z]?/gi);
    if (ichRefs) terms.push(...ichRefs);

    // Application numbers
    const appNumbers = content.match(/(?:NDA|BLA|ANDA|IND)\s*\d{5,}/gi);
    if (appNumbers) terms.push(...appNumbers);

    return [...new Set(terms)].slice(0, 5);
  }

  /**
   * Discover edges by metadata similarity
   */
  async discoverEdgesByMetadata(atomId: string): Promise<Edge[]> {
    const atomResult = await this.pool.query(
      `
      SELECT id, atom_type, source_type, metadata, tags
      FROM lumen_data_atoms WHERE id = $1
    `,
      [atomId]
    );

    if (atomResult.rows.length === 0) return [];
    const atom = atomResult.rows[0];
    const edges: Edge[] = [];

    // Same atom type relationships
    const sameTypeAtoms = await this.pool.query(
      `
      SELECT id, title FROM lumen_data_atoms
      WHERE id != $1 AND atom_type = $2
      LIMIT 20
    `,
      [atomId, atom.atom_type]
    );

    for (const related of sameTypeAtoms.rows) {
      edges.push({
        sourceAtomId: atomId,
        targetAtomId: related.id,
        relationshipType: 'same_topic',
        relationshipStrength: 0.3,
        bidirectional: true,
        extractedFrom: 'metadata',
        confidence: 0.5,
      });
    }

    // Extract agency from metadata or source_type
    const agency = this.extractAgency(atom);
    if (agency) {
      const sameAgencyAtoms = await this.pool.query(
        `
        SELECT id, title FROM lumen_data_atoms
        WHERE id != $1
          AND (
            metadata->>'agency' = $2
            OR source_type ILIKE $3
          )
        LIMIT 20
      `,
        [atomId, agency, `%${agency}%`]
      );

      for (const related of sameAgencyAtoms.rows) {
        edges.push({
          sourceAtomId: atomId,
          targetAtomId: related.id,
          relationshipType: 'same_agency',
          relationshipStrength: 0.4,
          bidirectional: true,
          extractedFrom: 'metadata',
          confidence: 0.7,
        });
      }
    }

    // Tag-based relationships
    if (atom.tags && atom.tags.length > 0) {
      const taggedAtoms = await this.pool.query(
        `
        SELECT id, title, tags FROM lumen_data_atoms
        WHERE id != $1 AND tags && $2::text[]
        LIMIT 30
      `,
        [atomId, atom.tags]
      );

      for (const related of taggedAtoms.rows) {
        const overlapCount = atom.tags.filter((t: string) => related.tags.includes(t)).length;
        const strength = Math.min(1.0, overlapCount * 0.2);

        edges.push({
          sourceAtomId: atomId,
          targetAtomId: related.id,
          relationshipType: 'related_to',
          relationshipStrength: strength,
          bidirectional: true,
          extractedFrom: 'metadata',
          confidence: 0.6,
          metadata: { sharedTags: atom.tags.filter((t: string) => related.tags.includes(t)) },
        });
      }
    }

    return edges;
  }

  private extractAgency(atom: any): string | null {
    if (atom.metadata?.agency) return atom.metadata.agency;
    if (atom.source_type?.includes('fda')) return 'FDA';
    if (atom.source_type?.includes('ema')) return 'EMA';
    if (atom.source_type?.includes('pmda')) return 'PMDA';
    return null;
  }

  /**
   * Build edges for an atom using all discovery methods
   */
  async buildEdgesForAtom(atomId: string): Promise<number> {
    const contentEdges = await this.discoverEdgesFromContent(atomId);
    const metadataEdges = await this.discoverEdgesByMetadata(atomId);

    const allEdges = [...contentEdges, ...metadataEdges];

    // Deduplicate
    const uniqueEdges = this.deduplicateEdges(allEdges);

    if (uniqueEdges.length > 0) {
      await this.createEdgesBatch(uniqueEdges);
    }

    return uniqueEdges.length;
  }

  private deduplicateEdges(edges: Edge[]): Edge[] {
    const seen = new Set<string>();
    return edges.filter(edge => {
      const key = `${edge.sourceAtomId}-${edge.targetAtomId}-${edge.relationshipType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build knowledge graph for all atoms without edges
   */
  async buildGraphForAllAtoms(
    limit: number = 100
  ): Promise<{ processed: number; edgesCreated: number }> {
    // Find atoms without edges
    const atomsResult = await this.pool.query(
      `
      SELECT a.id
      FROM lumen_data_atoms a
      LEFT JOIN lumen_knowledge_graph_edges e ON a.id = e.source_atom_id OR a.id = e.target_atom_id
      WHERE e.id IS NULL
      LIMIT $1
    `,
      [limit]
    );

    let totalEdges = 0;
    for (const atom of atomsResult.rows) {
      const edgeCount = await this.buildEdgesForAtom(atom.id);
      totalEdges += edgeCount;
    }

    return {
      processed: atomsResult.rows.length,
      edgesCreated: totalEdges,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                           GRAPH QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get neighbors of an atom
   */
  async getNeighbors(
    atomId: string,
    depth: number = 1,
    relationshipTypes?: RelationshipType[]
  ): Promise<GraphNode[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM get_atom_neighbors($1, $2, $3)
    `,
      [atomId, depth, relationshipTypes || null]
    );

    // Group by atom to create nodes with edges
    const nodesMap = new Map<string, GraphNode>();

    for (const row of result.rows) {
      if (!nodesMap.has(row.atom_id)) {
        nodesMap.set(row.atom_id, {
          atomId: row.atom_id,
          title: row.title,
          atomType: row.atom_type,
          sourceType: '',
          confidence: 0,
          edges: [],
        });
      }

      const node = nodesMap.get(row.atom_id)!;
      node.edges.push({
        sourceAtomId: atomId,
        targetAtomId: row.atom_id,
        relationshipType: row.relationship_type,
        relationshipStrength: row.relationship_strength,
        bidirectional: false,
        confidence: row.relationship_strength,
      });
    }

    return Array.from(nodesMap.values());
  }

  /**
   * Find shortest paths between two atoms
   */
  async findPaths(sourceId: string, targetId: string, maxDepth: number = 5): Promise<PathResult[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM find_atom_path($1, $2, $3)
    `,
      [sourceId, targetId, maxDepth]
    );

    return result.rows.map(row => ({
      pathAtoms: row.path_atoms,
      pathRelationships: row.path_relationships,
      pathLength: row.path_length,
    }));
  }

  /**
   * Get a subgraph around an atom
   */
  async getSubgraph(atomId: string, depth: number = 2): Promise<SubgraphResult> {
    // Get center atom
    const centerResult = await this.pool.query(
      `
      SELECT id, title, atom_type, source_type, confidence
      FROM lumen_data_atoms WHERE id = $1
    `,
      [atomId]
    );

    if (centerResult.rows.length === 0) {
      throw new Error(`Atom ${atomId} not found`);
    }

    const centerAtom = centerResult.rows[0];
    const nodes: GraphNode[] = [
      {
        atomId: centerAtom.id,
        title: centerAtom.title,
        atomType: centerAtom.atom_type,
        sourceType: centerAtom.source_type,
        confidence: centerAtom.confidence,
        edges: [],
      },
    ];

    // Get all neighbors up to depth
    const neighbors = await this.getNeighbors(atomId, depth);
    nodes.push(...neighbors);

    // Get all edges between these nodes
    const nodeIds = nodes.map(n => n.atomId);
    const edgesResult = await this.pool.query(
      `
      SELECT source_atom_id, target_atom_id, relationship_type,
             relationship_strength, bidirectional, confidence
      FROM lumen_knowledge_graph_edges
      WHERE source_atom_id = ANY($1) AND target_atom_id = ANY($1)
    `,
      [nodeIds]
    );

    const edges: Edge[] = edgesResult.rows.map(row => ({
      sourceAtomId: row.source_atom_id,
      targetAtomId: row.target_atom_id,
      relationshipType: row.relationship_type,
      relationshipStrength: row.relationship_strength,
      bidirectional: row.bidirectional,
      confidence: row.confidence,
    }));

    return {
      nodes,
      edges,
      centerAtomId: atomId,
      depth,
    };
  }

  /**
   * Find atoms related by a specific relationship type
   */
  async findByRelationship(
    atomId: string,
    relationshipType: RelationshipType,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<Array<{ atom: any; edge: Edge }>> {
    let query: string;
    let params: any[];

    if (direction === 'outgoing') {
      query = `
        SELECT a.*, e.relationship_type, e.relationship_strength, e.bidirectional, e.confidence
        FROM lumen_knowledge_graph_edges e
        JOIN lumen_data_atoms a ON e.target_atom_id = a.id
        WHERE e.source_atom_id = $1 AND e.relationship_type = $2
      `;
      params = [atomId, relationshipType];
    } else if (direction === 'incoming') {
      query = `
        SELECT a.*, e.relationship_type, e.relationship_strength, e.bidirectional, e.confidence
        FROM lumen_knowledge_graph_edges e
        JOIN lumen_data_atoms a ON e.source_atom_id = a.id
        WHERE e.target_atom_id = $1 AND e.relationship_type = $2
      `;
      params = [atomId, relationshipType];
    } else {
      query = `
        SELECT a.*, e.relationship_type, e.relationship_strength, e.bidirectional, e.confidence,
               CASE WHEN e.source_atom_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction
        FROM lumen_knowledge_graph_edges e
        JOIN lumen_data_atoms a ON
          CASE WHEN e.source_atom_id = $1 THEN e.target_atom_id ELSE e.source_atom_id END = a.id
        WHERE (e.source_atom_id = $1 OR e.target_atom_id = $1) AND e.relationship_type = $2
      `;
      params = [atomId, relationshipType];
    }

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      atom: {
        id: row.id,
        title: row.title,
        content: row.content,
        atomType: row.atom_type,
        sourceType: row.source_type,
      },
      edge: {
        sourceAtomId: direction === 'incoming' ? row.id : atomId,
        targetAtomId: direction === 'incoming' ? atomId : row.id,
        relationshipType: row.relationship_type,
        relationshipStrength: row.relationship_strength,
        bidirectional: row.bidirectional,
        confidence: row.confidence,
      },
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                           GRAPH STATISTICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get graph statistics
   */
  async getStatistics(): Promise<{
    totalNodes: number;
    totalEdges: number;
    avgEdgesPerNode: number;
    relationshipDistribution: Record<string, number>;
    topConnectedAtoms: Array<{ id: string; title: string; edgeCount: number }>;
  }> {
    const [nodeCount, edgeCount, relationshipDist, topConnected] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM lumen_data_atoms'),
      this.pool.query('SELECT COUNT(*) FROM lumen_knowledge_graph_edges'),
      this.pool.query(`
        SELECT relationship_type, COUNT(*) as count
        FROM lumen_knowledge_graph_edges
        GROUP BY relationship_type
        ORDER BY count DESC
      `),
      this.pool.query(`
        SELECT a.id, a.title, COUNT(e.id) as edge_count
        FROM lumen_data_atoms a
        LEFT JOIN lumen_knowledge_graph_edges e ON a.id = e.source_atom_id OR a.id = e.target_atom_id
        GROUP BY a.id, a.title
        ORDER BY edge_count DESC
        LIMIT 10
      `),
    ]);

    const totalNodes = parseInt(nodeCount.rows[0].count);
    const totalEdges = parseInt(edgeCount.rows[0].count);

    const relationshipDistribution: Record<string, number> = {};
    for (const row of relationshipDist.rows) {
      relationshipDistribution[row.relationship_type] = parseInt(row.count);
    }

    return {
      totalNodes,
      totalEdges,
      avgEdgesPerNode: totalNodes > 0 ? totalEdges / totalNodes : 0,
      relationshipDistribution,
      topConnectedAtoms: topConnected.rows.map(row => ({
        id: row.id,
        title: row.title,
        edgeCount: parseInt(row.edge_count),
      })),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                              FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createKnowledgeGraphService(pool: Pool): KnowledgeGraphService {
  return new KnowledgeGraphService(pool);
}
