/**
 * A knowledge-graph edge says what was observed, and no more. Run against a
 * real PostgreSQL (PGlite) carrying the real cortex migration
 * (db/migrations/20260125_enhanced_cortex_schema.sql: the edge table and
 * get_atom_neighbors).
 *
 * Until 2026-10-15 knowledgeGraphService:
 *  - read a relation off cue words in ONE atom's text and asserted it of every
 *    atom sharing a key term with it: a "However" anywhere made the atom
 *    'contradicts' them, an "updated" made it 'supersedes' them. Nothing
 *    compared the two atoms;
 *  - called two atoms of the same atom_type 'same_topic';
 *  - stamped constants as edge confidence (0.5, 0.6, 0.7; 0.9 on a manual edge)
 *    and as strength (0.3, 0.4; 0.8 on a manual edge that stated none);
 *  - getNeighbors reported each neighbour's confidence as 0 and its source type
 *    as '' (neither was read), and each edge's strength again as its confidence;
 *  - getSubgraph and findByRelationship read a `confidence` column the edge
 *    table does not have, so both failed on every call.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { KnowledgeGraphService } from '../knowledgeGraphService';
import { createCortexManagementRoutes } from '../../routes/cortexManagementRoutes';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const CORTEX_SCHEMA = fs.readFileSync(path.join(repoRoot, 'db/migrations/20260125_enhanced_cortex_schema.sql'), 'utf8');

/** lumen_data_atoms' real columns (see citation-atom-columns.test.ts), less the pgvector ones. */
const ATOMS_DDL = `
CREATE TABLE lumen_data_atoms (
  id serial PRIMARY KEY, organization_id integer, source_type text, source_id text,
  atom_type text, title text, content text, structured_data jsonb, tags text[],
  confidence real, status text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
)`;

interface EdgeRow {
  source_atom_id: number;
  target_atom_id: number;
  relationship_type: string;
  relationship_strength: number | null;
  metadata: Record<string, unknown>;
}

let db: PGlite;
let pool: Pool;
let a1: string;
let a2: string;

async function edges(): Promise<EdgeRow[]> {
  const { rows } = await db.query<EdgeRow>(
    'SELECT source_atom_id, target_atom_id, relationship_type, relationship_strength, metadata FROM lumen_knowledge_graph_edges ORDER BY relationship_type',
  );
  return rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ATOMS_DDL);
  await db.exec(CORTEX_SCHEMA);
  pool = { query: (text: string, params?: unknown[]) => db.query(text, params) } as unknown as Pool;
}, 60_000);

beforeEach(async () => {
  await db.exec('TRUNCATE lumen_data_atoms RESTART IDENTITY CASCADE');
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO lumen_data_atoms (source_type, atom_type, title, content, tags, confidence) VALUES
       ('internal_note', 'clinical_summary', 'Pembrolizumab dosing',
        'However, the label was updated after the exposure-response analysis.', ARRAY['oncology','dosing'], 0.82),
       ('internal_note', 'clinical_summary', 'Pembrolizumab exposure',
        'Exposure-response for Pembrolizumab in the phase 2 cohort.', ARRAY['oncology'], 0.91)
     RETURNING id`,
  );
  [a1, a2] = rows.map(r => String(r.id));
});

describe('edges built from two atoms', () => {
  it('a cue word in one atom does not make it contradict or supersede another', async () => {
    await new KnowledgeGraphService(pool).buildEdgesForAtom(a1);
    const types = (await edges()).map(e => e.relationship_type);

    expect(types).not.toContain('contradicts');
    expect(types).not.toContain('supersedes');
    expect(types).toContain('shares_key_terms');
  });

  it('the shared-term edge names the terms the two atoms share', async () => {
    await new KnowledgeGraphService(pool).buildEdgesForAtom(a1);
    const shared = (await edges()).find(e => e.relationship_type === 'shares_key_terms');

    expect(shared).toMatchObject({ source_atom_id: Number(a1), target_atom_id: Number(a2) });
    expect(shared!.metadata.keyTerms).toEqual(['Pembrolizumab']);
  });

  it('two atoms of one atom_type are not called the same topic, and get no invented strength', async () => {
    await new KnowledgeGraphService(pool).buildEdgesForAtom(a1);
    const rows = await edges();

    expect(rows.map(e => e.relationship_type)).not.toContain('same_topic');
    const sameType = rows.find(e => e.relationship_type === 'same_atom_type');
    expect(sameType?.relationship_strength).toBeNull();
  });

  it('no edge carries a confidence nobody measured', async () => {
    await new KnowledgeGraphService(pool).buildEdgesForAtom(a1);
    const rows = await edges();

    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) expect(e.metadata.confidence ?? null).toBeNull();
  });

  it('a shared-tag edge keeps the strength its shared tags give it, and lists them', async () => {
    await new KnowledgeGraphService(pool).buildEdgesForAtom(a1);
    const tagged = (await edges()).find(e => e.relationship_type === 'related_to');

    expect(tagged?.relationship_strength).toBeCloseTo(0.2);
    expect(tagged?.metadata.sharedTags).toEqual(['oncology']);
  });
});

describe('graph reads report what they read', () => {
  beforeEach(async () => {
    await new KnowledgeGraphService(pool).createEdge({
      sourceAtomId: a1,
      targetAtomId: a2,
      relationshipType: 'supports',
      relationshipStrength: 0.7,
      bidirectional: true,
      extractedFrom: 'manual',
      confidence: null,
    });
  });

  it("getNeighbors does not report a neighbour's confidence or source type it never read", async () => {
    const [node] = await new KnowledgeGraphService(pool).getNeighbors(a1);

    expect(node.atomId).toBe(Number(a2));
    expect(node.confidence).toBeNull();
    expect(node.sourceType).toBeNull();
    expect(node.edges[0].relationshipStrength).toBeCloseTo(0.7);
    expect(node.edges[0].confidence).toBeNull();
  });

  it('getSubgraph answers, with no edge confidence', async () => {
    const sub = await new KnowledgeGraphService(pool).getSubgraph(a1);

    expect(sub.nodes[0]).toMatchObject({ sourceType: 'internal_note' });
    expect(sub.nodes[0].confidence).toBeCloseTo(0.82);
    expect(sub.edges).toHaveLength(1);
    expect(sub.edges[0].confidence).toBeNull();
  });

  it('findByRelationship answers, with no edge confidence', async () => {
    const found = await new KnowledgeGraphService(pool).findByRelationship(a1, 'supports', 'outgoing');

    expect(found).toHaveLength(1);
    expect(found[0].edge.confidence).toBeNull();
  });
});

describe('POST /api/cortex/management/graph/edge', () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/cortex/management', createCortexManagementRoutes(pool));
    return a;
  }

  it('records no strength or confidence the person did not state', async () => {
    const res = await request(app())
      .post('/api/cortex/management/graph/edge')
      .send({ sourceAtomId: a1, targetAtomId: a2, relationshipType: 'supports' });

    expect(res.status).toBe(200);
    const [row] = await edges();
    expect(row.relationship_strength).toBeNull();
    expect(row.metadata.confidence ?? null).toBeNull();
  });

  it('keeps a stated strength of 0, and refuses one outside 0..1', async () => {
    const zero = await request(app())
      .post('/api/cortex/management/graph/edge')
      .send({ sourceAtomId: a1, targetAtomId: a2, relationshipType: 'supports', relationshipStrength: 0 });
    expect(zero.status).toBe(200);
    expect((await edges())[0].relationship_strength).toBe(0);

    const tooBig = await request(app())
      .post('/api/cortex/management/graph/edge')
      .send({ sourceAtomId: a1, targetAtomId: a2, relationshipType: 'requires', relationshipStrength: 1.5 });
    expect(tooBig.status).toBe(400);
  });
});
