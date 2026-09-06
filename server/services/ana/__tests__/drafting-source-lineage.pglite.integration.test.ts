/**
 * Ledger L154 — the executor's half of source lineage.
 *
 * Proves, on a real PGlite database with the real evidence-spine and
 * span-lineage migrations, that a drafting tool's `sources` input is resolved
 * through the one resolver the human route uses (existence + tenant ownership,
 * never a trusted number), that what cannot be resolved is dropped AND named,
 * and that the resolved list drives the same lineage gate the human accept
 * route calls — verbatim clauses land on the source, the rest on the author.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDraftSources, describeDraftLineage } from '../drafting-source-lineage';
import { enforceSourceAndAuthorLineage } from '../../clinical-regulatory-evidence/lineage-gate';

const ORG_A = 11;
const ORG_B = 12;
let pglite: PGlite;
const exec = {
  query: async <R = any>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(text, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function makeSource(orgId: number, checksum: string, artifactId?: string): Promise<number> {
  const { rows } = await exec.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status, metadata)
     VALUES ($1, 'tenant_private', 'client_document', 'csr.pdf', $2, 'ingested', 'extracted', $3::jsonb)
     RETURNING id`,
    [orgId, checksum, JSON.stringify(artifactId ? { artifactId } : {})],
  );
  return (rows[0] as { id: number }).id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A},'a'), (${ORG_B},'b');`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 60_000);
afterAll(async () => {
  await pglite?.close();
});

describe('resolveDraftSources', () => {
  it('resolves an evidence_source_id only when it exists in the tenant, and an artifact_id through the same resolver', async () => {
    const mine = await makeSource(ORG_A, 'sha-a1');
    const byArtifact = await makeSource(ORG_A, 'sha-a2', 'artifact-77');
    const theirs = await makeSource(ORG_B, 'sha-b1');
    const { sources, dropped } = await resolveDraftSources(
      ORG_A,
      [
        { evidence_source_id: mine, excerpt: 'The primary endpoint was met.' },
        { artifact_id: 'artifact-77', excerpt: 'Adverse events were mild.', title: 'AE table' },
        { evidence_source_id: theirs, excerpt: 'Another tenant\'s text.' },
        { evidence_source_id: mine + 1000, excerpt: 'A number that exists nowhere.' },
        { evidence_source_id: mine }, // no excerpt
        { excerpt: 'no id at all' },
      ],
      exec,
    );
    expect(sources.map((s) => s.sourceId)).toEqual([mine, byArtifact]);
    expect(sources[1].title).toBe('AE table');
    expect(dropped.map((d) => d.index).sort()).toEqual([2, 3, 4, 5]);
    expect(dropped.find((d) => d.index === 2)?.reason).toMatch(/not a Data Room source visible/);
    expect(dropped.find((d) => d.index === 4)?.reason).toMatch(/no excerpt/);
  });

  it('is empty, not an error, when the tool call carried no sources', async () => {
    expect(await resolveDraftSources(ORG_A, undefined, exec)).toEqual({ sources: [], dropped: [] });
    expect((await resolveDraftSources(ORG_A, 'nope', exec)).dropped[0].reason).toMatch(/must be an array/);
  });

  it('drives the same gate as the human accept: the verbatim clause lands on the source, the rest on the author', async () => {
    const src = await makeSource(ORG_A, 'sha-a3');
    const { sources, dropped } = await resolveDraftSources(
      ORG_A,
      [{ evidence_source_id: src, excerpt: 'Clinical study report. The primary endpoint was met at week twelve in the intent-to-treat population. Further detail follows.' }],
      exec,
    );
    const content =
      'The primary endpoint was met at week twelve in the intent-to-treat population. These findings were consistent across every prespecified subgroup we examined.';
    const gate = await enforceSourceAndAuthorLineage(
      exec,
      ORG_A,
      { documentTable: 'q_sub_section_bodies', documentId: 'qsb-1' },
      content,
      '41',
      sources,
    );
    expect(gate.sourceSpans).toBeGreaterThanOrEqual(1);
    expect(gate.authorSpans).toBeGreaterThanOrEqual(1);
    expect(gate.distinctSources).toBe(1);
    const { rows } = await exec.query(
      `SELECT provenance_kind, reference_id FROM document_span_lineage
        WHERE document_table = 'q_sub_section_bodies' AND document_id = 'qsb-1' ORDER BY char_start`,
    );
    const kinds = (rows as Array<{ provenance_kind: string; reference_id: string | null }>);
    expect(kinds.some((k) => k.provenance_kind === 'cre_evidence_source' && k.reference_id === String(src))).toBe(true);
    expect(kinds.some((k) => k.provenance_kind === 'author_assertion')).toBe(true);
    const report = describeDraftLineage(gate, sources, dropped);
    expect(report.citedSources).toBe(1);
    expect(report.note).toMatch(/verbatim quotes of 1 source/);
  });

  it('says so when sources were cited but nothing quotes them', async () => {
    const src = await makeSource(ORG_A, 'sha-a4');
    const { sources, dropped } = await resolveDraftSources(
      ORG_A,
      [{ evidence_source_id: src, excerpt: 'text the draft never repeats' }],
      exec,
    );
    const gate = await enforceSourceAndAuthorLineage(
      exec,
      ORG_A,
      { documentTable: 'q_sub_section_bodies', documentId: 'qsb-2' },
      'An entirely paraphrased sentence that shares nothing verbatim with the source.',
      '41',
      sources,
    );
    const report = describeDraftLineage(gate, sources, dropped);
    expect(report.quotedSpans).toBe(0);
    expect(report.citedSources).toBe(0);
    expect(report.note).toMatch(/no clause of the text quotes any of them verbatim/);
  });
});
