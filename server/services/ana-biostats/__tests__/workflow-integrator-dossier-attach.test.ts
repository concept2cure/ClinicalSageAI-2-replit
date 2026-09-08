/**
 * The biostatistics workflow attaches a statistical summary to a dossier
 * section through the CANONICAL governed mapping operation.
 *
 * It used to insert the c2c_artifact_section_map row itself — a second
 * implementation of a governed capability, with no audit row for a regulated
 * mapping, no tenant check on the section, no content-revision bump and no
 * stale-bundle clear, so a package could ship a zip that predated the very
 * document the platform had just attached to it. These tests pin the migration:
 * the integrator calls the canonical function, and it reports what that
 * function reports rather than an unconditional success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mapArtifactToSectionFn = vi.fn();
vi.mock('../../ectd/package-content-change', () => ({
  mapArtifactToSection: (...a: unknown[]) => mapArtifactToSectionFn(...a),
}));

/** The integrator lazily loads these; neither may be reached for an attach. */
const dbAccess = vi.fn();
vi.mock('../../../db', () => ({
  get db() { dbAccess(); return {}; },
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { WorkflowIntegrator } from '../workflow-integrator';

const attach = (integrator: WorkflowIntegrator) =>
  (integrator as any).attachToDossier(7, 12, 99, 777) as Promise<{ action: string; success: boolean; message: string }>;

beforeEach(() => {
  mapArtifactToSectionFn.mockReset();
  dbAccess.mockClear();
});

describe('WorkflowIntegrator.attachToDossier', () => {
  it('maps through the canonical governed operation — tenant-scoped, with a reason, and never writing the row itself', async () => {
    mapArtifactToSectionFn.mockResolvedValue({
      ok: true, mapping: { id: 32 }, duplicate: false, packageDbId: 5,
      staleBundleCleared: false, ledgerWriteFailed: false,
    });
    const res = await attach(new WorkflowIntegrator());
    expect(res).toMatchObject({ action: 'attach_to_dossier', success: true });
    expect(mapArtifactToSectionFn).toHaveBeenCalledTimes(1);
    const args = mapArtifactToSectionFn.mock.calls[0][0];
    expect(args).toMatchObject({
      orgId: 99, artifactDbId: 7, sectionDbId: 12, actorUserId: 777,
      documentFamily: 'statistical_summary', ownerFunction: 'biostatistics', ownershipType: 'sponsor',
      surface: 'ana-biostats-workflow',
    });
    expect(String(args.reason).length).toBeGreaterThanOrEqual(8);
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it('SAYS a previously assembled bundle was cleared, rather than reporting a bare attachment', async () => {
    mapArtifactToSectionFn.mockResolvedValue({
      ok: true, mapping: { id: 32 }, duplicate: false, packageDbId: 5,
      staleBundleCleared: true, ledgerWriteFailed: false,
    });
    const res = await attach(new WorkflowIntegrator());
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/bundle was cleared and must be assembled again/);
  });

  it('SAYS a lost audit row, and reports a refusal as a refusal', async () => {
    mapArtifactToSectionFn.mockResolvedValue({
      ok: true, mapping: { id: 32 }, duplicate: true, packageDbId: 5,
      staleBundleCleared: false, ledgerWriteFailed: true,
    });
    let res = await attach(new WorkflowIntegrator());
    expect(res.message).toMatch(/already attached/);
    expect(res.message).toMatch(/ledger entry could not be written/);

    mapArtifactToSectionFn.mockResolvedValue({
      ok: false, code: 'SECTION_NOT_FOUND', message: 'Section not found for organization',
    });
    res = await attach(new WorkflowIntegrator());
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/refused: Section not found for organization/);
  });
});
