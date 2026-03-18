import { db } from '../db';
import {
  biostatKnowledgeNodes,
  biostatKnowledgeEdges,
  methodRegulatoryOutcomes,
  csrReports,
  csrDetails,
  type BiostatKnowledgeNode,
  type BiostatKnowledgeEdge,
  type MethodRegulatoryOutcome,
} from '../../shared/schema';
import { eq, and, like, desc, sql, count } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types ---

type NodeType =
  | 'indication'
  | 'endpoint'
  | 'statistical_method'
  | 'study_design'
  | 'regulatory_decision'
  | 'drug_class'
  | 'estimand_strategy'
  | 'missing_data_method'
  | 'multiplicity_method';

type EdgeType =
  | 'method_used_for_endpoint'
  | 'design_approved_by_agency'
  | 'endpoint_succeeded_in_phase'
  | 'method_recommended_for_indication'
  | 'estimand_used_with_method'
  | 'method_combined_with_method'
  | 'indication_uses_endpoint'
  | 'drug_class_targets_indication';

interface GraphNode {
  id: number;
  nodeType: NodeType;
  name: string;
  description: string | null;
  properties: any;
  sourceCount: number | null;
}

interface GraphEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: EdgeType;
  weight: number | null;
  evidence: any;
}

interface MethodLandscapeEntry {
  methodName: string;
  methodNodeId: number | null;
  totalUses: number;
  acceptedCount: number;
  rejectedCount: number;
  successRate: number;
  agencies: string[];
  phases: string[];
}

interface EndpointMethodMatrixEntry {
  endpoint: string;
  method: string;
  totalCount: number;
  acceptedCount: number;
  successRate: number;
  agencies: string[];
}

interface MethodTrendEntry {
  year: number;
  count: number;
  acceptedCount: number;
  successRate: number;
}

interface IngestResult {
  nodesCreated: number;
  edgesCreated: number;
  csrId: number;
  indication: string | null;
}

interface GraphQueryResult {
  answer: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  confidence: number;
}

// --- Service ---

export class BiostatKnowledgeGraphService {
  /**
   * Extract biostat knowledge nodes and edges from a CSR.
   * Queries csrReports + csrDetails tables, parses indication, endpoints,
   * statistical methods, and creates knowledge graph nodes and edges.
   */
  async ingestFromCSR(csrId: number, organizationId: number): Promise<IngestResult> {
    // Fetch the CSR report
    const [report] = await db
      .select()
      .from(csrReports)
      .where(and(eq(csrReports.id, csrId), eq(csrReports.organizationId, organizationId)))
      .limit(1);

    if (!report) {
      throw new Error(`CSR report ${csrId} not found for organization ${organizationId}`);
    }

    // Fetch associated details
    const details = await db
      .select()
      .from(csrDetails)
      .where(eq(csrDetails.reportId, csrId))
      .limit(1);

    const detail = details[0] || null;

    let nodesCreated = 0;
    let edgesCreated = 0;

    // 1. Create indication node
    let indicationNode: BiostatKnowledgeNode | null = null;
    if (report.indication) {
      indicationNode = await this.findOrCreateNode(
        'indication',
        report.indication,
        { phase: report.phase, sponsor: report.sponsor },
        organizationId
      );
      nodesCreated++;
    }

    // 2. Create primary endpoint node
    const primaryEndpointText = detail?.primaryEndpoint || report.primaryEndpoint;
    let primaryEndpointNode: BiostatKnowledgeNode | null = null;
    if (primaryEndpointText) {
      primaryEndpointNode = await this.findOrCreateNode(
        'endpoint',
        primaryEndpointText,
        { type: 'primary', csrId },
        organizationId
      );
      nodesCreated++;

      // Link indication -> endpoint
      if (indicationNode) {
        await this.createEdge(
          indicationNode.id,
          primaryEndpointNode.id,
          'indication_uses_endpoint',
          { csrId, phase: report.phase },
          organizationId
        );
        edgesCreated++;
      }
    }

    // 3. Create secondary endpoint nodes
    const secondaryText = detail?.secondaryEndpoints || report.secondaryEndpoints;
    if (secondaryText) {
      const secondaryList = secondaryText
        .split(/[;\n,]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      for (const endpoint of secondaryList) {
        const epNode = await this.findOrCreateNode(
          'endpoint',
          endpoint,
          { type: 'secondary', csrId },
          organizationId
        );
        nodesCreated++;

        if (indicationNode) {
          await this.createEdge(
            indicationNode.id,
            epNode.id,
            'indication_uses_endpoint',
            { csrId, type: 'secondary' },
            organizationId
          );
          edgesCreated++;
        }
      }
    }

    // 4. Create statistical method nodes from detail
    if (detail?.statisticalMethods) {
      const methods = this.parseStatisticalMethods(detail.statisticalMethods);

      for (const method of methods) {
        const methodNode = await this.findOrCreateNode(
          'statistical_method',
          method,
          { csrId, phase: report.phase },
          organizationId
        );
        nodesCreated++;

        // Link method -> primary endpoint
        if (primaryEndpointNode) {
          await this.createEdge(
            methodNode.id,
            primaryEndpointNode.id,
            'method_used_for_endpoint',
            { csrId, phase: report.phase },
            organizationId
          );
          edgesCreated++;
        }

        // Link method -> indication
        if (indicationNode) {
          await this.createEdge(
            methodNode.id,
            indicationNode.id,
            'method_recommended_for_indication',
            { csrId, phase: report.phase },
            organizationId
          );
          edgesCreated++;
        }
      }
    }

    // 5. Create study design node
    const designText = detail?.studyDesign || report.studyDesign;
    if (designText) {
      const designNode = await this.findOrCreateNode(
        'study_design',
        designText,
        {
          blinding: detail?.blinding,
          randomization: detail?.randomization,
          sampleSize: detail?.sampleSize || report.sampleSize,
          csrId,
        },
        organizationId
      );
      nodesCreated++;

      if (indicationNode) {
        await this.createEdge(
          designNode.id,
          indicationNode.id,
          'design_approved_by_agency',
          { csrId, agency: report.regulatoryAgency },
          organizationId
        );
        edgesCreated++;
      }
    }

    return {
      nodesCreated,
      edgesCreated,
      csrId,
      indication: report.indication,
    };
  }

  /**
   * Natural language query against the knowledge graph using AI.
   * Translates the query into node/edge lookups and returns results.
   */
  async queryGraph(query: string, organizationId: number): Promise<GraphQueryResult> {
    // Step 1: Use AI to extract search terms and intent
    const extractionResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a biostatistics knowledge graph query parser. Extract search parameters from the user query.
Return JSON with these fields:
- nodeTypes: array of node types to search (indication, endpoint, statistical_method, study_design, regulatory_decision, drug_class, estimand_strategy, missing_data_method, multiplicity_method)
- searchTerms: array of key terms to look for in node names
- edgeTypes: array of edge types relevant to the query
- intent: one of "find_methods", "find_endpoints", "find_relationships", "find_trends", "general"`,
        },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    let parsed: {
      nodeTypes: NodeType[];
      searchTerms: string[];
      edgeTypes: EdgeType[];
      intent: string;
    };
    try {
      parsed = JSON.parse(extractionResponse.choices[0]?.message?.content || '{}');
    } catch {
      parsed = { nodeTypes: [], searchTerms: [], edgeTypes: [], intent: 'general' };
    }

    // Step 2: Search for matching nodes
    const matchedNodes: BiostatKnowledgeNode[] = [];
    for (const term of parsed.searchTerms || []) {
      const nodes = await db
        .select()
        .from(biostatKnowledgeNodes)
        .where(
          and(
            like(biostatKnowledgeNodes.name, `%${term}%`),
            eq(biostatKnowledgeNodes.organizationId, organizationId)
          )
        )
        .limit(20);
      matchedNodes.push(...nodes);
    }

    // Also search by node type if specified
    for (const nodeType of parsed.nodeTypes || []) {
      const nodes = await db
        .select()
        .from(biostatKnowledgeNodes)
        .where(
          and(
            eq(biostatKnowledgeNodes.nodeType, nodeType),
            eq(biostatKnowledgeNodes.organizationId, organizationId)
          )
        )
        .limit(20);
      matchedNodes.push(...nodes);
    }

    // Deduplicate nodes by id
    const uniqueNodeMap = new Map<number, BiostatKnowledgeNode>();
    for (const node of matchedNodes) {
      uniqueNodeMap.set(node.id, node);
    }
    const uniqueNodes = Array.from(uniqueNodeMap.values());

    // Step 3: Find edges connecting the matched nodes
    const nodeIds = uniqueNodes.map(n => n.id);
    const matchedEdges: BiostatKnowledgeEdge[] = [];
    if (nodeIds.length > 0) {
      for (const nodeId of nodeIds.slice(0, 50)) {
        const outEdges = await db
          .select()
          .from(biostatKnowledgeEdges)
          .where(
            and(
              eq(biostatKnowledgeEdges.sourceNodeId, nodeId),
              eq(biostatKnowledgeEdges.organizationId, organizationId)
            )
          )
          .limit(10);

        const inEdges = await db
          .select()
          .from(biostatKnowledgeEdges)
          .where(
            and(
              eq(biostatKnowledgeEdges.targetNodeId, nodeId),
              eq(biostatKnowledgeEdges.organizationId, organizationId)
            )
          )
          .limit(10);

        matchedEdges.push(...outEdges, ...inEdges);
      }
    }

    // Deduplicate edges
    const uniqueEdgeMap = new Map<number, BiostatKnowledgeEdge>();
    for (const edge of matchedEdges) {
      uniqueEdgeMap.set(edge.id, edge);
    }
    const uniqueEdges = Array.from(uniqueEdgeMap.values());

    // Step 4: Use AI to synthesize an answer
    const synthesisResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a biostatistics expert. Synthesize an answer based on the knowledge graph data provided. Be concise and precise.',
        },
        {
          role: 'user',
          content: `Question: ${query}\n\nKnowledge Graph Nodes:\n${JSON.stringify(
            uniqueNodes.map(n => ({ type: n.nodeType, name: n.name, props: n.properties })),
            null,
            2
          )}\n\nEdges:\n${JSON.stringify(
            uniqueEdges.map(e => ({ type: e.edgeType, evidence: e.evidence, weight: e.weight })),
            null,
            2
          )}`,
        },
      ],
      temperature: 0.3,
    });

    const answer = synthesisResponse.choices[0]?.message?.content || 'No answer could be generated.';
    const confidence = uniqueNodes.length > 0 ? Math.min(0.95, 0.5 + uniqueNodes.length * 0.05) : 0.1;

    return {
      answer,
      nodes: uniqueNodes as unknown as GraphNode[],
      edges: uniqueEdges as unknown as GraphEdge[],
      confidence,
    };
  }

  /**
   * Returns statistical methods used for an indication with success rates.
   */
  async getMethodLandscape(
    indication: string,
    organizationId: number
  ): Promise<MethodLandscapeEntry[]> {
    // Query methodRegulatoryOutcomes for this indication
    const outcomes = await db
      .select()
      .from(methodRegulatoryOutcomes)
      .where(
        and(
          like(methodRegulatoryOutcomes.indication, `%${indication}%`),
          eq(methodRegulatoryOutcomes.organizationId, organizationId)
        )
      );

    // Aggregate by method name
    const methodMap = new Map<
      string,
      {
        methodNodeId: number | null;
        total: number;
        accepted: number;
        agencies: Set<string>;
        phases: Set<string>;
      }
    >();

    for (const outcome of outcomes) {
      const key = outcome.methodName;
      if (!methodMap.has(key)) {
        methodMap.set(key, {
          methodNodeId: outcome.methodNodeId,
          total: 0,
          accepted: 0,
          agencies: new Set(),
          phases: new Set(),
        });
      }
      const entry = methodMap.get(key)!;
      entry.total++;
      if (outcome.accepted) entry.accepted++;
      entry.agencies.add(outcome.agency);
      if (outcome.phase) entry.phases.add(outcome.phase);
    }

    // Convert to result array
    const landscape: MethodLandscapeEntry[] = [];
    for (const [methodName, data] of methodMap.entries()) {
      landscape.push({
        methodName,
        methodNodeId: data.methodNodeId,
        totalUses: data.total,
        acceptedCount: data.accepted,
        rejectedCount: data.total - data.accepted,
        successRate: data.total > 0 ? data.accepted / data.total : 0,
        agencies: Array.from(data.agencies),
        phases: Array.from(data.phases),
      });
    }

    // Sort by success rate descending, then by total uses descending
    landscape.sort((a, b) => {
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      return b.totalUses - a.totalUses;
    });

    return landscape;
  }

  /**
   * Matrix of endpoints vs methods with success rates from methodRegulatoryOutcomes.
   */
  async getEndpointMethodMatrix(
    organizationId: number,
    filters?: { indication?: string; phase?: string; agency?: string }
  ): Promise<EndpointMethodMatrixEntry[]> {
    // Build conditions
    const conditions = [eq(methodRegulatoryOutcomes.organizationId, organizationId)];
    if (filters?.indication) {
      conditions.push(like(methodRegulatoryOutcomes.indication, `%${filters.indication}%`));
    }
    if (filters?.phase) {
      conditions.push(eq(methodRegulatoryOutcomes.phase, filters.phase));
    }
    if (filters?.agency) {
      conditions.push(eq(methodRegulatoryOutcomes.agency, filters.agency));
    }

    const outcomes = await db
      .select()
      .from(methodRegulatoryOutcomes)
      .where(and(...conditions));

    // Build endpoint x method matrix
    const matrixMap = new Map<
      string,
      { total: number; accepted: number; agencies: Set<string> }
    >();

    for (const outcome of outcomes) {
      const endpoint = outcome.endpoint || 'unspecified';
      const key = `${endpoint}|||${outcome.methodName}`;
      if (!matrixMap.has(key)) {
        matrixMap.set(key, { total: 0, accepted: 0, agencies: new Set() });
      }
      const entry = matrixMap.get(key)!;
      entry.total++;
      if (outcome.accepted) entry.accepted++;
      entry.agencies.add(outcome.agency);
    }

    const matrix: EndpointMethodMatrixEntry[] = [];
    for (const [key, data] of matrixMap.entries()) {
      const [endpoint, method] = key.split('|||');
      matrix.push({
        endpoint,
        method,
        totalCount: data.total,
        acceptedCount: data.accepted,
        successRate: data.total > 0 ? data.accepted / data.total : 0,
        agencies: Array.from(data.agencies),
      });
    }

    matrix.sort((a, b) => b.successRate - a.successRate);
    return matrix;
  }

  /**
   * Temporal trends for a statistical concept (method, endpoint, etc.).
   */
  async getMethodTrend(
    concept: string,
    organizationId: number
  ): Promise<MethodTrendEntry[]> {
    const outcomes = await db
      .select()
      .from(methodRegulatoryOutcomes)
      .where(
        and(
          like(methodRegulatoryOutcomes.methodName, `%${concept}%`),
          eq(methodRegulatoryOutcomes.organizationId, organizationId)
        )
      );

    // Aggregate by year
    const yearMap = new Map<number, { total: number; accepted: number }>();
    for (const outcome of outcomes) {
      const year = outcome.reviewYear || 0;
      if (year === 0) continue;
      if (!yearMap.has(year)) {
        yearMap.set(year, { total: 0, accepted: 0 });
      }
      const entry = yearMap.get(year)!;
      entry.total++;
      if (outcome.accepted) entry.accepted++;
    }

    const trends: MethodTrendEntry[] = [];
    for (const [year, data] of yearMap.entries()) {
      trends.push({
        year,
        count: data.total,
        acceptedCount: data.accepted,
        successRate: data.total > 0 ? data.accepted / data.total : 0,
      });
    }

    trends.sort((a, b) => a.year - b.year);
    return trends;
  }

  /**
   * Upsert logic for knowledge nodes. Finds existing node by type + name + org,
   * or creates a new one. Merges properties on update.
   */
  async findOrCreateNode(
    nodeType: NodeType,
    name: string,
    properties: Record<string, any>,
    organizationId: number
  ): Promise<BiostatKnowledgeNode> {
    // Try to find existing node
    const existing = await db
      .select()
      .from(biostatKnowledgeNodes)
      .where(
        and(
          eq(biostatKnowledgeNodes.nodeType, nodeType),
          eq(biostatKnowledgeNodes.name, name),
          eq(biostatKnowledgeNodes.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const node = existing[0];
      // Merge properties and increment source count
      const mergedProperties = { ...(node.properties as Record<string, any> || {}), ...properties };
      const [updated] = await db
        .update(biostatKnowledgeNodes)
        .set({
          properties: mergedProperties,
          sourceCount: (node.sourceCount || 0) + 1,
          lastEnrichedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(biostatKnowledgeNodes.id, node.id))
        .returning();
      return updated;
    }

    // Create new node
    const [created] = await db
      .insert(biostatKnowledgeNodes)
      .values({
        nodeType,
        name,
        description: null,
        properties,
        sourceCount: 1,
        lastEnrichedAt: new Date(),
        organizationId,
      })
      .returning();

    return created;
  }

  /**
   * Create a relationship edge between two knowledge nodes.
   */
  async createEdge(
    sourceId: number,
    targetId: number,
    edgeType: EdgeType,
    evidence: Record<string, any>,
    organizationId: number
  ): Promise<BiostatKnowledgeEdge> {
    // Check for existing edge of same type between these nodes
    const existing = await db
      .select()
      .from(biostatKnowledgeEdges)
      .where(
        and(
          eq(biostatKnowledgeEdges.sourceNodeId, sourceId),
          eq(biostatKnowledgeEdges.targetNodeId, targetId),
          eq(biostatKnowledgeEdges.edgeType, edgeType),
          eq(biostatKnowledgeEdges.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update weight (strengthen existing edge) and merge evidence
      const edge = existing[0];
      const mergedEvidence = {
        ...(edge.evidence as Record<string, any> || {}),
        ...evidence,
        reinforcements: ((edge.evidence as any)?.reinforcements || 0) + 1,
      };
      const [updated] = await db
        .update(biostatKnowledgeEdges)
        .set({
          weight: (edge.weight || 1.0) + 0.1,
          evidence: mergedEvidence,
        })
        .where(eq(biostatKnowledgeEdges.id, edge.id))
        .returning();
      return updated;
    }

    // Create new edge
    const [created] = await db
      .insert(biostatKnowledgeEdges)
      .values({
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        edgeType,
        weight: 1.0,
        evidence,
        csrId: evidence.csrId || null,
        organizationId,
      })
      .returning();

    return created;
  }

  // --- Private helpers ---

  /**
   * Parse statistical methods text into individual method names.
   */
  private parseStatisticalMethods(text: string): string[] {
    const methodPatterns = [
      /ANCOVA/gi,
      /ANOVA/gi,
      /MMRM/gi,
      /mixed[\s-]?model/gi,
      /logistic[\s-]?regression/gi,
      /Cox[\s-]?proportional/gi,
      /Kaplan[\s-]?Meier/gi,
      /log[\s-]?rank/gi,
      /Fisher'?s?\s*exact/gi,
      /chi[\s-]?square/gi,
      /Wilcoxon/gi,
      /Mann[\s-]?Whitney/gi,
      /multiple[\s-]?imputation/gi,
      /LOCF/gi,
      /Hochberg/gi,
      /Bonferroni/gi,
      /Holm/gi,
      /gate[\s-]?keeping/gi,
      /hierarchical[\s-]?testing/gi,
      /Bayesian/gi,
      /propensity[\s-]?score/gi,
      /inverse[\s-]?probability/gi,
      /generalized[\s-]?linear/gi,
      /negative[\s-]?binomial/gi,
      /Poisson/gi,
      /t[\s-]?test/gi,
    ];

    const found = new Set<string>();
    for (const pattern of methodPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        // Normalize to title case
        for (const match of matches) {
          found.add(match.trim());
        }
      }
    }

    // If no known patterns matched, split by common delimiters and take non-trivial chunks
    if (found.size === 0) {
      const chunks = text
        .split(/[;,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 3 && s.length < 100);
      for (const chunk of chunks.slice(0, 5)) {
        found.add(chunk);
      }
    }

    return Array.from(found);
  }
}

export default new BiostatKnowledgeGraphService();
