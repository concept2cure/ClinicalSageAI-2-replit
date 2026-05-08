/**
 * Tests for buildCitationGraph — pure helper that walks artifacts'
 * citations[] to construct the cross-artifact graph.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCitationGraph,
  type CitationGraphBundle,
} from '../ana/citation-graph';
import type {
  SentenceCitation,
  CitationStatus,
  CitationSource,
} from '../ana/citation-engine';

function source(artifactId: string, relationship: 'supports' | 'contradicts' = 'supports'): CitationSource {
  return {
    artifactId,
    sectionCode: null,
    pageRef: null,
    passageSnippet: 'snippet',
    relevanceScore: 0.8,
    relationship,
  };
}

function sent(
  text: string,
  sources: CitationSource[],
  status: CitationStatus = 'supported'
): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: text.length,
    text,
    contentHash: 'h-' + Math.random().toString(36).slice(2),
    sources,
    status,
    gap: null,
    flags: [],
  };
}

function bundle(
  artifactId: string,
  citations: SentenceCitation[],
  ctdSection: string | null = null
): CitationGraphBundle {
  return { artifactId, ctdSection, title: `${artifactId} title`, citations };
}

describe('citation-graph · buildCitationGraph', () => {
  it('returns empty nodes/edges when there are no bundles', () => {
    const g = buildCitationGraph([]);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
  });

  it('builds one supports edge with sentenceCount=1 for a single citation', () => {
    const g = buildCitationGraph([
      bundle('csr-001', [sent('s', [source('protocol-001')])]),
      bundle('protocol-001', []),
    ]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({
      fromArtifactId: 'csr-001',
      toArtifactId: 'protocol-001',
      relationship: 'supports',
      sentenceCount: 1,
    });
  });

  it('aggregates multiple citations between the same pair into one edge', () => {
    const g = buildCitationGraph([
      bundle('csr-001', [
        sent('s1', [source('protocol-001')]),
        sent('s2', [source('protocol-001')]),
        sent('s3', [source('protocol-001')]),
      ]),
      bundle('protocol-001', []),
    ]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].sentenceCount).toBe(3);
    expect(g.edges[0].examples).toHaveLength(3);
  });

  it('emits supports + contradicts as DISTINCT edges between the same pair', () => {
    const g = buildCitationGraph([
      bundle('csr-001', [
        sent('s1', [source('protocol-001')]),
        sent('s2', [source('protocol-001', 'contradicts')]),
      ]),
      bundle('protocol-001', []),
    ]);
    expect(g.edges).toHaveLength(2);
    const supports = g.edges.find(e => e.relationship === 'supports');
    const contradicts = g.edges.find(e => e.relationship === 'contradicts');
    expect(supports?.sentenceCount).toBe(1);
    expect(contradicts?.sentenceCount).toBe(1);
  });

  it('skips self-edges (an artifact citing itself)', () => {
    const g = buildCitationGraph([
      bundle('csr-001', [sent('s', [source('csr-001')])]),
    ]);
    expect(g.edges).toEqual([]);
  });

  it('drops edges to artifacts outside the project', () => {
    const g = buildCitationGraph(
      [
        bundle('csr-001', [
          sent('inProject', [source('protocol-001')]),
          sent('outOfProject', [source('external-999')]),
        ]),
        bundle('protocol-001', []),
      ],
      new Set(['csr-001', 'protocol-001'])
    );
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].toArtifactId).toBe('protocol-001');
  });

  it('caps examples at 3 per edge but still counts every sentence', () => {
    const g = buildCitationGraph([
      bundle('csr-001', [
        sent('s1', [source('protocol-001')]),
        sent('s2', [source('protocol-001')]),
        sent('s3', [source('protocol-001')]),
        sent('s4', [source('protocol-001')]),
        sent('s5', [source('protocol-001')]),
      ]),
      bundle('protocol-001', []),
    ]);
    expect(g.edges[0].sentenceCount).toBe(5);
    expect(g.edges[0].examples).toHaveLength(3);
  });

  it('truncates long example text', () => {
    const long = 'X'.repeat(500);
    const g = buildCitationGraph([
      bundle('csr-001', [sent(long, [source('protocol-001')])]),
      bundle('protocol-001', []),
    ]);
    const example = g.edges[0].examples[0].text;
    expect(example.length).toBeLessThanOrEqual(201); // 200 + "…"
    expect(example.endsWith('…')).toBe(true);
  });

  it('rolls up node stats: distinct partners + per-relationship counts', () => {
    const g = buildCitationGraph([
      // CSR cites Protocol (supports) and IB (contradicts) — 2 partners
      bundle('csr-001', [
        sent('s1', [source('protocol-001')]),
        sent('s2', [source('ib-001', 'contradicts')]),
      ]),
      // CSR-2 also cites Protocol — Protocol's citedBy = 2
      bundle('csr-002', [sent('s', [source('protocol-001')])]),
      bundle('protocol-001', []),
      bundle('ib-001', []),
    ]);
    const csr1 = g.nodes.find(n => n.artifactId === 'csr-001')!;
    const protocol = g.nodes.find(n => n.artifactId === 'protocol-001')!;
    const ib = g.nodes.find(n => n.artifactId === 'ib-001')!;

    expect(csr1.citingCount).toBe(2);
    expect(csr1.outboundSupports).toBe(1);
    expect(csr1.outboundContradicts).toBe(1);

    expect(protocol.citedByCount).toBe(2); // csr-001 + csr-002
    expect(protocol.inboundSupports).toBe(2);
    expect(protocol.inboundContradicts).toBe(0);

    expect(ib.citedByCount).toBe(1);
    expect(ib.inboundContradicts).toBe(1);
  });

  it('sorts edges by sentenceCount desc, stable ties', () => {
    const g = buildCitationGraph([
      bundle('a', [
        sent('1', [source('z')]),
      ]),
      bundle('b', [
        sent('1', [source('z')]),
        sent('2', [source('z')]),
        sent('3', [source('z')]),
      ]),
      bundle('c', [
        sent('1', [source('z')]),
        sent('2', [source('z')]),
      ]),
      bundle('z', []),
    ]);
    expect(g.edges.map(e => `${e.fromArtifactId}->${e.sentenceCount}`)).toEqual([
      'b->3',
      'c->2',
      'a->1',
    ]);
  });

  it('preserves bundle order for nodes', () => {
    const g = buildCitationGraph([
      bundle('z', []),
      bundle('a', []),
      bundle('m', []),
    ]);
    expect(g.nodes.map(n => n.artifactId)).toEqual(['z', 'a', 'm']);
  });

  it('ignores sources whose relationship is not supports/contradicts', () => {
    const weird = source('protocol-001');
    (weird as any).relationship = 'gap'; // not a graph relationship
    const g = buildCitationGraph([
      bundle('csr-001', [sent('s', [weird])]),
      bundle('protocol-001', []),
    ]);
    expect(g.edges).toEqual([]);
  });
});
