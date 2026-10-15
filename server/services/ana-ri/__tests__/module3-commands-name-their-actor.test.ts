/**
 * AnA's Module 3 commands write their provenance under the user who ran them.
 *
 * What the code used to do (until 2026-10-15): module3_classify_source called
 * classifyAndMapArtifactToSource with no actor at all (the service then wrote
 * created_by 'system'), and the build, build-section and refresh commands
 * persisted sections with `actorId: String(ctx.userId ?? 'system')` — so a
 * command that reached a handler without a user wrote its provenance as
 * 'system' rather than being refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandContext } from '../command-types';

const H = vi.hoisted(() => ({
  classify: vi.fn(async () => ({ sourceObjectId: 77, sectionKey: '3.2.S.4' })),
  bridge: vi.fn(async () => ({ bridged: true, artifactId: 'm3-art', isNew: true })),
  status: vi.fn(async () => ({
    sections: [{ sectionKey: '3.2.S.1', isStale: true }],
    artifactRegistry: { state: 'linked' },
  })),
  compose: vi.fn(),
  persist: vi.fn(async () => 'section-row-1'),
}));

vi.mock('../../../db', () => {
  // Classification reads the program's recorded type (2026-10-15): an IND here.
  const client = {
    query: async (sql: string) => ({ rows: /FROM regulatory_programs/.test(sql) ? [{ program_type: 'IND' }] : [] }),
    release: () => undefined,
  };
  return { getPool: () => ({ connect: async () => client, query: client.query }), pool: {}, db: {} };
});
vi.mock('../../module3-convergence-service', () => ({
  classifyAndMapArtifactToSource: H.classify,
  bridgeCompileToArtifact: H.bridge,
  getModule3BuildStatus: H.status,
}));
vi.mock('../../cmc/module3-compile', () => ({
  composeProjectModule3: H.compose,
  persistComposedSection: H.persist,
}));

import {
  module3BuildAll,
  module3BuildSection,
  module3ClassifySource,
  module3RefreshStale,
} from '../module3-command-handlers';

const ORG = 7;
const PROJECT = 'proj-cmc-1';
/** A program of ORG's, as classification requires one that records its type. */
const PROGRAM = '0b6a3c1e-1111-4a2b-9c3d-0000000000aa';
const withUser = { organizationId: ORG, userId: 42 } as CommandContext;
const withoutUser = { organizationId: ORG } as unknown as CommandContext;

const section = {
  sectionKey: '3.2.S.1',
  sectionPath: '3.2.S.1',
  structuredPayload: {},
  narrativeDraft: 'text',
  tables: [],
  completeness: 100,
  missingInputs: [],
  lineage: [{ sourceObjectId: 'src-1', sourceHashAtCompile: 'h' }],
};

beforeEach(() => {
  for (const fn of [H.classify, H.bridge, H.status, H.persist]) fn.mockClear();
  H.compose.mockReset().mockResolvedValue({ sources: [{ id: 'src-1' }], sections: [section] });
});

describe('module3_classify_source', () => {
  it('maps the artifact under the user who ran the command', async () => {
    const res = await module3ClassifySource(withUser, {
      projectId: PROGRAM,
      artifactId: 'art-1',
      sourceType: 'specification',
    });
    expect(res.success).toBe(true);
    expect(H.classify).toHaveBeenCalledWith(
      ORG,
      PROGRAM,
      'art-1',
      expect.objectContaining({ sourceType: 'specification', submissionTrack: 'IND' }),
      { actorUserId: 42 },
    );
  });

  it('is refused, and maps nothing, when the command carries no user', async () => {
    const res = await module3ClassifySource(withoutUser, {
      projectId: PROJECT,
      artifactId: 'art-1',
      sourceType: 'specification',
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/acting user/i);
    expect(H.classify).not.toHaveBeenCalled();
  });
});

describe('module3_build_all / build_section / refresh_stale', () => {
  it('persists and bridges under the user who ran the build', async () => {
    const res = await module3BuildAll(withUser, { projectId: PROJECT });
    expect(res.success).toBe(true);
    expect(H.persist).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      PROJECT,
      section,
      expect.objectContaining({ actorId: '42' }),
    );
    expect(H.bridge).toHaveBeenCalledWith(ORG, PROJECT, '3.2.S.1', expect.anything(), { createdById: 42 });
  });

  it('build_all is refused, and writes nothing as "system", when the command carries no user', async () => {
    const res = await module3BuildAll(withoutUser, { projectId: PROJECT });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/acting user/i);
    expect(H.persist).not.toHaveBeenCalled();
    expect(H.bridge).not.toHaveBeenCalled();
  });

  it('build_section is refused when the command carries no user', async () => {
    const res = await module3BuildSection(withoutUser, { projectId: PROJECT, sectionKey: '3.2.S.1' });
    expect(res.success).toBe(false);
    expect(H.persist).not.toHaveBeenCalled();
  });

  it('refresh_stale is refused when the command carries no user', async () => {
    const res = await module3RefreshStale(withoutUser, { projectId: PROJECT });
    expect(res.success).toBe(false);
    expect(H.persist).not.toHaveBeenCalled();
  });
});
