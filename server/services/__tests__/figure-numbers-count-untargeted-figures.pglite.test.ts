/**
 * A figure with no target section is numbered after the ones before it.
 *
 * Until 2026-10-15 getNextFigureNumber counted figures whose metadata
 * sectionCode = 'general', but a figure generated with no target section was
 * stored with no sectionCode at all (undefined is dropped from the JSON). So
 * the count was always 0 and every such figure was "Figure general-1".
 *
 * Real SQL on PGlite; the model client and the audit/provenance writers are
 * replaced.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const holder = vi.hoisted(() => ({ pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> } }));
const dbDouble = vi.hoisted(() => ({
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: async () => undefined }));
vi.mock('../../lib/unified-ai-client', () => ({
  ai: { chat: async () => ({ content: '{"type":"bar"}', model: 'claude-opus-5' }) },
}));

import { generateFigure } from '../figureGenerationService';

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  holder.pg = pg as unknown as typeof holder.pg;
  // The columns storeFigure writes and getNextFigureNumber reads.
  await pg.exec(`
    CREATE TABLE concept2cure_artifacts (
      id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL, project_id INTEGER, organization_id INTEGER,
      created_by_id INTEGER, title TEXT, content TEXT, content_hash TEXT, type TEXT NOT NULL,
      category TEXT NOT NULL, status TEXT, metadata JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    );
  `);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('figure numbering', () => {
  it('numbers successive untargeted figures 1, 2', async () => {
    const request = {
      projectId: 5, organizationId: 9, userId: 1, figureType: 'bar_chart' as const,
      title: 'Response rate by arm', description: 'ORR by arm', rawData: [{ arm: 'treatment', orr: 0.42 }],
    };
    const first = await generateFigure(request);
    const second = await generateFigure(request);
    expect(first.figure?.figureNumber).toBe('Figure general-1');
    expect(second.figure?.figureNumber).toBe('Figure general-2');
  }, 60_000);
});
