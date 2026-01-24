/**
 * Knowledge Graph Client Service
 * 
 * Provides access to the Semantic Knowledge Graph for deep regulatory search.
 * This is the "Logic Layer" that grounds AI outputs in deterministic facts.
 */

import { apiRequest } from '../lib/queryClient';

export interface GraphStats {
  totalAtoms: number;
  totalEdges: number;
  totalEntities: number;
  atomsWithOutgoing: number;
  atomsWithIncoming: number;
  staleTraceabilityEntries: number;
  suspectEntries: number;
}

export interface ExtractedEntity {
  entityType: string;
  entityValue: string;
  normalizedValue?: string;
  confidenceScore: number;
  numericValue?: number;
  unit?: string;
}

export interface GraphEdge {
  sourceAtomId: string;
  targetAtomId: string;
  relationshipType: string;
  strength?: number;
  evidenceText?: string;
  confidenceScore?: number;
}

export interface TraversalResult {
  atomId: string;
  depth: number;
  path: string[];
  relationshipTypes: string[];
}

export interface TraceabilityEntry {
  id: string;
  requirementId: string;
  requirementText: string;
  status: string;
  isStale: boolean;
  stalenessReason?: string;
}

export class KnowledgeGraphClient {
  private baseUrl = '/api/neuro-symbolic';

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    const response = await apiRequest('GET', `${this.baseUrl}/graph/stats`);
    return response.json();
  }

  /**
   * Get entities for a document atom
   */
  async getEntities(atomId: string): Promise<{ atomId: string; entities: ExtractedEntity[]; count: number }> {
    const response = await apiRequest('GET', `${this.baseUrl}/graph/entities/${atomId}`);
    return response.json();
  }

  /**
   * Search for atoms by entity type and value
   */
  async searchEntities(entityType: string, entityValue?: string): Promise<{
    results: { atomId: string; entities: ExtractedEntity[] }[];
    count: number;
  }> {
    const response = await apiRequest('POST', `${this.baseUrl}/graph/entities/search`, {
      entityType,
      entityValue
    });
    return response.json();
  }

  /**
   * Create a graph edge
   */
  async createEdge(edge: GraphEdge): Promise<{ edgeId: string; success: boolean }> {
    const response = await apiRequest('POST', `${this.baseUrl}/graph/edges`, edge);
    return response.json();
  }

  /**
   * Traverse the graph from a starting atom
   */
  async traverse(
    atomId: string,
    options?: { maxDepth?: number; direction?: 'OUTGOING' | 'INCOMING' | 'BOTH'; types?: string[] }
  ): Promise<{ startAtom: string; results: TraversalResult[]; count: number }> {
    const params = new URLSearchParams();
    if (options?.maxDepth) params.set('maxDepth', String(options.maxDepth));
    if (options?.direction) params.set('direction', options.direction);
    if (options?.types) params.set('types', options.types.join(','));

    const response = await apiRequest('GET', `${this.baseUrl}/graph/traverse/${atomId}?${params}`);
    return response.json();
  }

  /**
   * Find shortest path between two atoms
   */
  async findPath(sourceAtomId: string, targetAtomId: string): Promise<{
    source: string;
    target: string;
    path: { path: string[]; relationshipTypes: string[]; length: number } | null;
    found: boolean;
  }> {
    const response = await apiRequest('GET', `${this.baseUrl}/graph/path?source=${sourceAtomId}&target=${targetAtomId}`);
    return response.json();
  }

  /**
   * Find supporting evidence for a claim
   */
  async findEvidence(claimAtomId: string): Promise<{
    claimAtomId: string;
    evidence: { evidenceAtomId: string; relationshipType: string; confidence: number; evidenceText: string }[];
    count: number;
  }> {
    const response = await apiRequest('GET', `${this.baseUrl}/graph/evidence/${claimAtomId}`);
    return response.json();
  }

  /**
   * Find all documents derived from a source
   * This is the "Deep Search" capability - deterministic, not fuzzy
   */
  async findDerivedDocuments(sourceAtomId: string): Promise<{
    sourceAtomId: string;
    derivedDocuments: { atomId: string; title: string; derivationPath: string[] }[];
    count: number;
    message: string;
  }> {
    const response = await apiRequest('GET', `${this.baseUrl}/graph/derived/${sourceAtomId}`);
    return response.json();
  }

  /**
   * Get stale traceability entries
   */
  async getStaleEntries(programId?: string): Promise<{
    entries: TraceabilityEntry[];
    count: number;
    message: string;
  }> {
    const params = programId ? `?programId=${programId}` : '';
    const response = await apiRequest('GET', `${this.baseUrl}/traceability/stale${params}`);
    return response.json();
  }

  /**
   * Add a traceability entry
   */
  async addTraceabilityEntry(entry: {
    requirementId: string;
    requirementType: string;
    requirementText: string;
    evidenceAtomIds: string[];
    claimAtomIds: string[];
    programId?: string;
  }): Promise<{ entryId: string; success: boolean }> {
    const response = await apiRequest('POST', `${this.baseUrl}/traceability`, entry);
    return response.json();
  }

  /**
   * Verify a traceability entry
   */
  async verifyEntry(entryId: string, verifiedBy?: string): Promise<{ entryId: string; status: string; success: boolean }> {
    const response = await apiRequest('POST', `${this.baseUrl}/traceability/${entryId}/verify`, {
      verifiedBy: verifiedBy || 'user'
    });
    return response.json();
  }

  /**
   * Extract entities from content
   */
  async extractEntities(atomId: string, content: string): Promise<{
    atomId: string;
    entities: ExtractedEntity[];
    relationships: Array<{
      sourceEntity: string;
      targetEntity: string;
      relationshipType: string;
      confidence: number;
    }>;
    metadata: { 
      processingTimeMs: number; 
      modelUsed: string; 
      entityCount: number;
      correlationId: string;
      contentHash: string;
    };
  }> {
    const response = await apiRequest('POST', `${this.baseUrl}/extract/${atomId}`, { content });
    return response.json();
  }
}

// Singleton instance
export const knowledgeGraph = new KnowledgeGraphClient();
