/**
 * Cross-artifact citation graph.
 *
 * The citations[] view answers "what backs this sentence?"; the graph
 * view answers "who cites whom across the dossier?":
 *
 *   - Edge (A → B, supports): some sentence in artifact A is supported
 *     by a passage from artifact B.
 *   - Edge (A → B, contradicts): some sentence in A has a contradicting
 *     citation pointing at B.
 *   - Self-edges (A → A) are skipped — an artifact citing its own atoms
 *     is mostly noise for the dossier-level view.
 *   - Cross-project edges (B not in the project) are dropped — the
 *     report stays scoped to artifacts the caller owns.
 *
 * Per-node stats roll up inbound / outbound counts so a dashboard can
 * show "Protocol §5.1 is cited by 8 other artifacts; 7 supports, 1
 * contradicts" without re-walking the edge list.
 *
 * Pure helper buildCitationGraph(bundles, projectArtifactIds): testable
 * standalone. Live entry pulls citations + project artifact IDs and
 * runs the helper.
 *
 * @module server/services/ana/citation-graph
 */
import { getPool } from '../../db/runtime.js';
import type {
  SentenceCitation,
  CitationRelationship,
} from './citation-engine.js';

export type GraphRelationship = 'supports' | 'contradicts';

export interface CitationGraphEdge {
  fromArtifactId: string;
  toArtifactId: string;
  relationship: GraphRelationship;
  sentenceCount: number;
  examples: Array<{
    sentenceIndex: number;
    text: string;
    contentHash: string;
  }>;
}

export interface CitationGraphNode {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  citingCount: number;
  citedByCount: number;
  outboundSupports: number;
  outboundContradicts: number;
  inboundSupports: number;
  inboundContradicts: number;
}

export interface ProjectCitationGraph {
  projectId: number;
  organizationId: number;
  asOf: string;
  nodeCount: number;
  edgeCount: number;
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
}

export interface CitationGraphBundle {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  citations: SentenceCitation[];
}

const MAX_EXAMPLES_PER_EDGE = 3;

/**
 * Pure: walk every artifact's citations to build the graph. Self-edges
 * dropped. Edges to artifacts outside the supplied projectArtifactIds
 * set are dropped (cross-project sources are noise for this view).
 *
 * Returns nodes in the order supplied (artifact bundle order) plus
 * edges sorted by sentenceCount desc, then by (from, to) for stability.
 */
export function buildCitationGraph(
  bundles: CitationGraphBundle[],
  projectArtifactIds?: Set<string>,
  options: { projectId?: number; organizationId?: number; now?: Date } = {}
): ProjectCitationGraph {
  const inProject =
    projectArtifactIds ?? new Set(bundles.map(b => b.artifactId));
  const now = options.now ?? new Date();

  // Edge accumulator keyed by (from|to|relationship).
  const edgeMap = new Map<
    string,
    { edge: CitationGraphEdge }
  >();

  // Node accumulator keyed by artifactId.
  const nodeMap = new Map<string, CitationGraphNode>();
  for (const b of bundles) {
    nodeMap.set(b.artifactId, {
      artifactId: b.artifactId,
      ctdSection: b.ctdSection,
      title: b.title,
      citingCount: 0,
      citedByCount: 0,
      outboundSupports: 0,
      outboundContradicts: 0,
      inboundSupports: 0,
      inboundContradicts: 0,
    });
  }

  for (const b of bundles) {
    const fromId = b.artifactId;
    for (const c of b.citations) {
      for (const src of c.sources) {
        const toId = src.artifactId;
        if (!toId) continue;
        if (toId === fromId) continue; // self-edge
        if (!inProject.has(toId)) continue; // out of project scope
        // Only the two graph relationships count — `gap` shouldn't have a
        // source artifact, but defend anyway.
        const rel: CitationRelationship = src.relationship;
        if (rel !== 'supports' && rel !== 'contradicts') continue;

        const key = `${fromId}|${toId}|${rel}`;
        let bucket = edgeMap.get(key);
        if (!bucket) {
          bucket = {
            edge: {
              fromArtifactId: fromId,
              toArtifactId: toId,
              relationship: rel,
              sentenceCount: 0,
              examples: [],
            },
          };
          edgeMap.set(key, bucket);
        }
        bucket.edge.sentenceCount += 1;
        if (bucket.edge.examples.length < MAX_EXAMPLES_PER_EDGE) {
          bucket.edge.examples.push({
            sentenceIndex: c.sentenceIndex,
            text: c.text.length > 200 ? `${c.text.slice(0, 200)}…` : c.text,
            contentHash: c.contentHash,
          });
        }
      }
    }
  }

  // Per-node tallies. citingCount / citedByCount count distinct partner
  // artifacts; the inbound/outbound supports/contradicts count edges
  // (one per relationship per pair).
  const outboundPartners = new Map<string, Set<string>>();
  const inboundPartners = new Map<string, Set<string>>();

  for (const { edge } of edgeMap.values()) {
    const fromNode = nodeMap.get(edge.fromArtifactId);
    const toNode = nodeMap.get(edge.toArtifactId);
    if (!fromNode || !toNode) continue;

    if (edge.relationship === 'supports') {
      fromNode.outboundSupports += 1;
      toNode.inboundSupports += 1;
    } else {
      fromNode.outboundContradicts += 1;
      toNode.inboundContradicts += 1;
    }

    let outSet = outboundPartners.get(edge.fromArtifactId);
    if (!outSet) {
      outSet = new Set();
      outboundPartners.set(edge.fromArtifactId, outSet);
    }
    outSet.add(edge.toArtifactId);

    let inSet = inboundPartners.get(edge.toArtifactId);
    if (!inSet) {
      inSet = new Set();
      inboundPartners.set(edge.toArtifactId, inSet);
    }
    inSet.add(edge.fromArtifactId);
  }

  for (const [id, node] of nodeMap) {
    node.citingCount = outboundPartners.get(id)?.size ?? 0;
    node.citedByCount = inboundPartners.get(id)?.size ?? 0;
  }

  // Stable edge order: sentenceCount desc, then (fromArtifactId, toArtifactId, relationship).
  const edges = Array.from(edgeMap.values())
    .map(b => b.edge)
    .sort((a, b) => {
      if (a.sentenceCount !== b.sentenceCount) {
        return b.sentenceCount - a.sentenceCount;
      }
      if (a.fromArtifactId !== b.fromArtifactId) {
        return a.fromArtifactId.localeCompare(b.fromArtifactId);
      }
      if (a.toArtifactId !== b.toArtifactId) {
        return a.toArtifactId.localeCompare(b.toArtifactId);
      }
      return a.relationship.localeCompare(b.relationship);
    });

  const nodes = Array.from(nodeMap.values());

  return {
    projectId: options.projectId ?? 0,
    organizationId: options.organizationId ?? 0,
    asOf: now.toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };
}

/**
 * Live: pull every artifact + citations for the project and build the
 * graph. Tenant-scoped via organization_id on the SQL.
 */
export async function getProjectCitationGraph(
  projectId: number,
  organizationId: number
): Promise<ProjectCitationGraph> {
  const { rows } = await getPool().query(
    `SELECT artifact_id, ctd_section, title, citations
       FROM concept2cure_artifacts
      WHERE project_id = $1
        AND organization_id = $2
      ORDER BY ctd_section NULLS LAST, updated_at DESC`,
    [projectId, organizationId]
  );
  const bundles: CitationGraphBundle[] = rows.map((r: any) => ({
    artifactId: r.artifact_id,
    ctdSection: r.ctd_section,
    title: r.title,
    citations: Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [],
  }));
  const projectArtifactIds = new Set(bundles.map(b => b.artifactId));
  return buildCitationGraph(bundles, projectArtifactIds, {
    projectId,
    organizationId,
  });
}
