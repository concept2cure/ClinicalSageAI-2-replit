/**
 * Living Record Spine — the object model, as code.
 *
 * This is the single, explicit definition of the spine graph the rest of the
 * platform hangs off:
 *
 *   Program → Product → Substance|Device → Submission → Sequence → Document
 *           → Section → Claim → EvidenceValue → SourceArtifact
 *
 * It declares every node kind, the canonical table it resolves to, and the
 * typed edges that are legal between kinds. It is pure data + pure helpers so it
 * can be asserted in tests and reused by the reconciliation engine, the graph
 * overlay writers, and any traversal.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md for the prose.
 */

import type { SpineNodeKind, SpineEdgeKind } from '../../../shared/schema/living-record-spine';

// ─────────────────────────────────────────────────────────────────────────────
// Nodes
// ─────────────────────────────────────────────────────────────────────────────

export interface SpineNodeDef {
  kind: SpineNodeKind;
  /** The canonical table this node resolves to (documentation + overlay). */
  canonicalTable: string;
  /** The node kind directly above it in the containment chain, if any. */
  parent: SpineNodeKind | null;
  /** True when the node is a genuine new addition by this spec. */
  isNew?: boolean;
  note?: string;
}

/**
 * The containment spine, top to bottom. `parent` encodes the `contains` edge.
 * Product/Substance/Device are facets of Program today; their hard FKs are
 * tracked in spine_edges until they land natively (see the spec, §5).
 */
export const SPINE_NODES: Record<SpineNodeKind, SpineNodeDef> = {
  program: { kind: 'program', canonicalTable: 'regulatory_programs', parent: null },
  product: {
    kind: 'product',
    canonicalTable: 'regulatory_programs.product_*',
    parent: 'program',
    note: 'Product is a facet of Program today; FK spine tracked in spine_edges.',
  },
  substance: {
    kind: 'substance',
    canonicalTable: 'drug_substances',
    parent: 'product',
    note: 'Orphaned FK; expressed via spine_edges until hardened.',
  },
  device: {
    kind: 'device',
    canonicalTable: 'medical_devices',
    parent: 'product',
    note: 'Orphaned FK; expressed via spine_edges until hardened.',
  },
  submission: {
    kind: 'submission',
    canonicalTable: 'c2cSubmissionPackages',
    parent: 'program',
    note: 'Fragmented across pathway tables; canonical pointer is the submission: typed target.',
  },
  sequence: {
    kind: 'sequence',
    canonicalTable: 'regulatory_sequences',
    parent: 'submission',
    isNew: true,
    note: 'The eCTD sequence node that was missing from the spine.',
  },
  document: { kind: 'document', canonicalTable: 'c2c_documents', parent: 'sequence' },
  section: { kind: 'section', canonicalTable: 'evidence_claim_links.section_id', parent: 'document' },
  claim: { kind: 'claim', canonicalTable: 'evidence_claims', parent: 'section' },
  evidence_value: {
    kind: 'evidence_value',
    canonicalTable: 'canonical_facts',
    parent: 'claim',
    isNew: true,
    note: 'The single agreed value a claim asserts.',
  },
  source_artifact: {
    kind: 'source_artifact',
    canonicalTable: 'evidence_sources',
    parent: 'claim',
  },
};

/** The containment chain in order, for traversal and documentation. */
export const SPINE_CHAIN: SpineNodeKind[] = [
  'program',
  'product',
  'substance',
  'device',
  'submission',
  'sequence',
  'document',
  'section',
  'claim',
  'evidence_value',
  'source_artifact',
];

// ─────────────────────────────────────────────────────────────────────────────
// Edges
// ─────────────────────────────────────────────────────────────────────────────

export interface SpineEdgeDef {
  kind: SpineEdgeKind;
  from: SpineNodeKind[];
  to: SpineNodeKind[];
  /** Where the edge is actually persisted (native table or the overlay). */
  backing: string;
}

export const SPINE_EDGES: SpineEdgeDef[] = [
  { kind: 'contains', from: ['program', 'product', 'substance', 'device', 'submission', 'sequence', 'document', 'section'], to: ['product', 'substance', 'device', 'submission', 'sequence', 'document', 'section', 'claim'], backing: 'spine_edges + native FKs' },
  { kind: 'asserts', from: ['claim'], to: ['evidence_value'], backing: 'fact_bindings (claim-kind)' },
  { kind: 'supports', from: ['claim'], to: ['document', 'section'], backing: 'evidence_claim_links.link_type' },
  { kind: 'contradicts', from: ['claim'], to: ['document', 'section'], backing: 'evidence_claim_links.link_type' },
  { kind: 'references', from: ['claim'], to: ['document', 'section'], backing: 'evidence_claim_links.link_type' },
  { kind: 'supported_by', from: ['claim'], to: ['source_artifact'], backing: 'evidence_claims.source_id' },
  { kind: 'establishes', from: ['claim', 'source_artifact'], to: ['evidence_value'], backing: 'canonical_facts.established_by_*' },
  { kind: 'derives', from: ['evidence_value'], to: ['evidence_value'], backing: "fact_bindings.binding_kind='derived'" },
  { kind: 'supersedes', from: ['claim', 'evidence_value', 'sequence'], to: ['claim', 'evidence_value', 'sequence'], backing: '*.supersedes_id' },
  { kind: 'binds_to', from: ['document', 'section'], to: ['evidence_value'], backing: 'fact_bindings (target-kind)' },
];

const EDGE_INDEX = new Map<SpineEdgeKind, SpineEdgeDef>(SPINE_EDGES.map(e => [e.kind, e]));

/** Is `kind` a legal edge from a `from`-kind node to a `to`-kind node? */
export function isValidEdge(from: SpineNodeKind, to: SpineNodeKind, kind: SpineEdgeKind): boolean {
  const def = EDGE_INDEX.get(kind);
  if (!def) return false;
  return def.from.includes(from) && def.to.includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed target pointers (shared with the mutation-primitive vocabulary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the kind out of a typed target pointer such as:
 *   'claim:123' → 'claim'
 *   'section:doc_x:m2.5' → 'section'
 * Returns null when the prefix is unknown.
 */
export function targetKind(target: string): 'claim' | 'document' | 'section' | 'paragraph' | null {
  const prefix = target.split(':', 1)[0];
  if (prefix === 'claim' || prefix === 'document' || prefix === 'section' || prefix === 'paragraph') {
    return prefix;
  }
  return null;
}

/** Build a claim target pointer from a numeric claim id. */
export function claimTarget(claimId: number): string {
  return `claim:${claimId}`;
}

/** Extract the integer claim id from a 'claim:<id>' pointer, or null. */
export function claimIdFromTarget(target: string): number | null {
  if (targetKind(target) !== 'claim') return null;
  const id = parseInt(target.slice('claim:'.length), 10);
  return Number.isFinite(id) ? id : null;
}
