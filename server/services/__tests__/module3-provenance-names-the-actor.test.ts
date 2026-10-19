/**
 * Module 3 provenance names who mapped or bridged an artifact.
 *
 * What the code used to do (until 2026-10-15): classifyAndMapArtifactToSource
 * took no actor at all and bridgeCompileToArtifact ignored the one it had for
 * this row — both wrote the literal 'system' into
 * cmc_provenance_events.created_by, for mappings and bridges a named person
 * ran (AnA module3_classify_source, the compile bridges). The lineage call a
 * few lines above the bridge's provenance insert already attributed the same
 * write through governedActor, so one transaction named two different actors.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const answer = (sql: string) => {
    if (sql.includes('SELECT id, artifact_id AS "artifactId", title, content, metadata')) {
      return { rows: [{ id: 5, artifactId: 'art-1', title: 'CoA batch 7', content: 'text', metadata: {} }] };
    }
    if (sql.includes('INSERT INTO cmc_source_objects')) return { rows: [{ id: 77 }] };
    if (sql.includes('INSERT INTO concept2cure_artifacts')) return { rows: [{ id: 501 }] };
    return { rows: [] };
  };
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return answer(sql);
    },
    release: () => undefined,
  };
  return { calls, client, lineage: vi.fn(async () => undefined) };
});

vi.mock('../../db', () => ({
  getPool: () => ({ connect: async () => H.client, query: H.client.query }),
}));
vi.mock('../cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: async () => ({ state: 'linked', artifactProjectId: 99 }),
}));
vi.mock('../clinical-regulatory-evidence/lineage-gate', () => ({
  enforceAuthorLineage: H.lineage,
}));

import {
  bridgeCompileToArtifact,
  classifyAndMapArtifactToSource,
  type DossierUploadClassification,
} from '../module3-convergence-service';

const ORG = 7;
const PROJECT = 'proj-cmc-1';
const MACHINE = 'system+module3-convergence@concept2cure.local';

const classification: DossierUploadClassification = {
  submissionTrack: 'IND',
  dossierModule: '3',
  ctdSection: '3.2.S.4',
  sourceType: 'specification',
  useAsModule3Source: true,
  tags: [],
};

const compiled = {
  narrativeDraft: 'Section text.',
  tables: [],
  completeness: 100,
  missingInputs: [],
  lineage: [{ sourceObjectId: 'src-1', sourceHashAtCompile: 'h' }],
};

const provenanceInsert = () => {
  const hit = H.calls.find((c) => c.sql.includes('INSERT INTO cmc_provenance_events'));
  if (!hit) throw new Error('no provenance event was written');
  return hit;
};
const wroteAnything = () => H.calls.some((c) => /^\s*(INSERT|UPDATE)/i.test(c.sql));

beforeEach(() => {
  H.calls.length = 0;
  H.lineage.mockClear();
});

describe('classifyAndMapArtifactToSource — the mapping is attributed to whoever ran it', () => {
  it('writes the acting user as created_by, not the literal system', async () => {
    await classifyAndMapArtifactToSource(ORG, PROJECT, 'art-1', classification, { actorUserId: 42 });
    const insert = provenanceInsert();
    expect(insert.sql).not.toContain("'system'");
    expect(insert.params[insert.params.length - 1]).toBe('42');
  });

  it('refuses, and writes nothing, when the caller does not say who is mapping', async () => {
    await expect(
      classifyAndMapArtifactToSource(ORG, PROJECT, 'art-1', classification),
    ).rejects.toThrow(/actor/i);
    expect(wroteAnything()).toBe(false);
  });
});

describe('bridgeCompileToArtifact — provenance names the same actor as the lineage', () => {
  it('a user-initiated bridge records the user, as its lineage does', async () => {
    await bridgeCompileToArtifact(ORG, PROJECT, '3.2.S.4', compiled, { createdById: 42 });
    const insert = provenanceInsert();
    expect(insert.sql).not.toContain("'system'");
    expect(insert.params[insert.params.length - 1]).toBe('42');
    expect(H.lineage).toHaveBeenCalledWith(expect.anything(), ORG, expect.anything(), expect.any(String), '42');
  });

  it('a bridge with no identified user names the machine actor, never a bare "system"', async () => {
    await bridgeCompileToArtifact(ORG, PROJECT, '3.2.S.4', compiled, { createdById: null });
    const insert = provenanceInsert();
    expect(insert.params[insert.params.length - 1]).toBe(MACHINE);
    expect(H.lineage).toHaveBeenCalledWith(expect.anything(), ORG, expect.anything(), expect.any(String), MACHINE);
  });

  it('refuses, and writes nothing, when the caller does not state the actor at all', async () => {
    await expect(
      (bridgeCompileToArtifact as unknown as (...a: unknown[]) => Promise<unknown>)(ORG, PROJECT, '3.2.S.4', compiled),
    ).rejects.toThrow(/actor/i);
    expect(wroteAnything()).toBe(false);
  });
});
