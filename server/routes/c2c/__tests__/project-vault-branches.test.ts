/**
 * Route test for GET /api/c2c/project-vault/:id — the derived branches.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * The data room had three stores that did not see each other:
 *   • CMC-compiled §3.2 artifacts landed in concept2cure_artifacts and were
 *     invisible in the very surface the CMC module's vault buttons opened;
 *   • the surface's own Upload button wrote vault.documents — a table this
 *     read-model never queried, so "the row appears in the tree because the
 *     server wrote it" (Vault.tsx) was false in effect.
 *
 * The read-model now unions both as derived branches — "Module 3 (CMC)"
 * organized by CTD section, and "Uploaded files" — each degrading HONESTLY:
 * a store this environment has not provisioned is reported in `unavailable`,
 * never rendered as an empty folder (which would read as "no documents").
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

/**
 * The CMC → artifact-spine resolution, stated per case.
 *
 * The Module 3 branch asks this BEFORE querying concept2cure_artifacts,
 * because the artifact query joins through projects.regulatory_program_id and
 * therefore cannot match for a program with no anchor however much has been
 * compiled. Mocked rather than exercised so each case below says which of the
 * three spine states it is testing.
 */
const resolveSpineMock = vi.fn();
vi.mock('../../../services/cmc/resolve-cmc-artifact-project.js', () => ({
  resolveCmcArtifactProject: (...args: unknown[]) => resolveSpineMock(...args),
}));

import createProjectVaultRoutes from '../project-vault';

const PROJECT = '11111111-2222-3333-4444-555555555555';

function app(orgId: number) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = orgId;
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/**
 * Route SQL in call order: project → documents → (sections per doc) → M3
 * artifacts → uploads → upload COUNTS → data-room sources.
 *
 * The queue is strict, so a query the route gained and this file did not is an
 * `undefined` response and a 500 — which is what happened when the filing
 * cabinet grew its program-wide count. Adding the row here is the fixture
 * catching up with the route, not a test being loosened.
 */
function seedBase() {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    .mockResolvedValueOnce({ rows: [] }); // no c2c document builds → no section reads
}

const folders = (body: any): Record<string, any> =>
  Object.fromEntries((body?.data?.tree ?? []).map((f: any) => [f.id, f]));

beforeEach(() => {
  queryMock.mockReset();
  resolveSpineMock.mockReset();
  // Anchored is the normal state; a case that tests otherwise says so.
  resolveSpineMock.mockResolvedValue({ state: 'linked', artifactProjectId: 42, via: 'program-anchor' });
});

describe('GET /api/c2c/project-vault/:id — derived branches', () => {
  it('lists CMC-compiled Module 3 artifacts organized by CTD section', async () => {
    seedBase();
    queryMock
      // Module 3 artifacts (anchored via the program → project EXISTS)
      .mockResolvedValueOnce({
        rows: [
          { id: 1, artifact_id: 'm3-3.2.S.1-abc', title: 'Module 3 — General Information', ctd_section: '3.2.S.1', status: 'approved', version: 3, updated_at: null },
          { id: 2, artifact_id: 'm3-3.2.P.8-def', title: 'Module 3 — Stability (Drug Product)', ctd_section: '3.2.P.8', status: 'draft', version: 1, updated_at: null },
        ],
      })
      // uploads
      .mockResolvedValueOnce({ rows: [] })
      // program-wide upload counts (shown/total/unfiled)
      .mockResolvedValueOnce({ rows: [{ total: 0, unfiled: 0 }] })
      // data room sources (cre_evidence_sources — same mocked pool)
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);

    const m3 = folders(res.body)['m3-cmc'];
    expect(m3).toBeTruthy();
    expect(m3.label).toBe('Module 3 (CMC)');
    expect(m3.children).toHaveLength(2);
    expect(m3.children[0].num).toBe('3.2.S.1');
    // Approved artifact → approved chip, 100% on the one completion definition.
    expect(m3.children[0].status).toBe('approved');
    expect(m3.children[0].pct).toBe(100);
    // Draft artifact → draft chip, 0% — drafting is not completion.
    expect(m3.children[1].status).toBe('draft');
    expect(m3.children[1].pct).toBe(0);
    // The artifact query is anchored through the program uuid, org-scoped.
    const artifactCall = queryMock.mock.calls.find((c) => String(c[0]).includes('concept2cure_artifacts'));
    expect(artifactCall?.[1]).toEqual([PROJECT, 7]);
    expect(String(artifactCall?.[0])).toContain('regulatory_program_id');
  });

  it('lists what the Upload button ingested — the row really does appear in the tree, WHERE its filing says', async () => {
    // The uploads branch is the filing cabinet: the same vault.documents rows,
    // placed by their (suggested or confirmed) dossier filing rather than a
    // flat "Uploaded files" bucket — one uploads branch, carrying placement.
    seedBase();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // no M3 artifacts
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'aaaa-1', document_code: 'stab-summary.pdf', document_title: 'stab-summary',
            document_type: 'MODULE_3', version: '1.0', file_name: 'stab-summary.pdf',
            file_size: 1048576, mime_type: 'application/pdf', content_hash: 'h1',
            folder_id: 'module-3', evidence_kind: 'report', ctd_section: '3.2.P.8',
            placement_status: 'suggested', placement_confidence: 'high',
            placement_rationale: 'CTD pattern "Stability" → Module 3 (3.2.P.8).',
            updated_at: null, owner_name: 'A. Analyst',
          },
        ],
      })
      // program-wide upload counts (shown/total/unfiled)
      .mockResolvedValueOnce({ rows: [{ total: 1, unfiled: 0 }] })
      // data room sources
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);

    const cabinet = folders(res.body)['cabinet'];
    expect(cabinet).toBeTruthy();
    expect(cabinet.label).toBe('Source files · filing cabinet');
    const m3Folder = cabinet.children.find((c: any) => c.id === 'cab-module-3');
    expect(m3Folder).toBeTruthy();
    const leaf = m3Folder.children[0];
    expect(leaf.title).toBe('stab-summary');
    expect(leaf.status).toBe('suggested');
    expect(leaf.owner).toBe('A. Analyst');
    expect(leaf.filing.folderId).toBe('module-3');
    expect(leaf.filing.ctdSection).toBe('3.2.P.8');
  });

  it('reports an unprovisioned store as unavailable — never as an empty branch', async () => {
    seedBase();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // M3 artifacts fine, none
      .mockRejectedValueOnce(Object.assign(new Error('relation "vault.documents" does not exist'), { code: '42P01' }));

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(folders(res.body)['cabinet']).toBeUndefined();
    // The data room's 'filed' stage joins against the missing uploads store,
    // so it is reported unavailable alongside — never a silent Filed=0.
    expect(res.body.data.unavailable).toEqual([
      expect.objectContaining({ branch: 'Uploaded files' }),
      expect.objectContaining({ branch: 'Data room' }),
    ]);
  });

  it('reports an UNANCHORED program as unavailable, not as a missing Module 3 branch', async () => {
    // The defect: `module3Branch` returned null for two different facts — "this
    // program is anchored and nothing is filed" and "this program has no
    // PM-spine anchor, so the registry cannot be asked about it at all" — and
    // the surface rendered both as no Module 3 section. A user with a compiled,
    // approved and placed Module 3 saw an empty data room and concluded nothing
    // had been compiled. CLAUDE.md: an error is never rendered as an empty
    // result.
    seedBase();
    resolveSpineMock.mockResolvedValue({
      state: 'unanchored',
      artifactProjectId: null,
      detail:
        'This program has no PM-spine anchor (projects.regulatory_program_id), so the governed ' +
        'artifact registry cannot be addressed for it.',
    });
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // uploads
      .mockResolvedValueOnce({ rows: [{ total: '0', unfiled: '0' }] }) // upload counts
      .mockResolvedValueOnce({ rows: [] }); // data-room sources

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);

    expect(res.status).toBe(200);
    expect(folders(res.body)['m3-cmc']).toBeUndefined();
    expect(res.body.data.unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branch: 'Module 3 (CMC)',
          reason: expect.stringContaining('no PM-spine anchor'),
        }),
      ]),
    );
  });

  it('an ANCHORED program with nothing filed yet is an honest empty, not an unavailable', async () => {
    // The other side of the same discrimination: "addressable, and nothing
    // there" must NOT be reported as a store that cannot be reached, or the
    // notice would cry wolf on every new project.
    seedBase();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // M3 artifacts: anchored, none filed
      .mockResolvedValueOnce({ rows: [] }) // uploads
      .mockResolvedValueOnce({ rows: [{ total: '0', unfiled: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);

    expect(res.status).toBe(200);
    expect(folders(res.body)['m3-cmc']).toBeUndefined();
    expect(
      (res.body.data.unavailable ?? []).some((u: { branch: string }) => u.branch === 'Module 3 (CMC)'),
    ).toBe(false);
  });

  it('a real failure in a branch is still a failure — not silently degraded', async () => {
    seedBase();
    queryMock.mockRejectedValueOnce(new Error('connection reset'));

    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
