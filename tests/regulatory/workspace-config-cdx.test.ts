import { describe, it, expect } from 'vitest';
import { resolveWorkspaceConfig } from '../../shared/regulatory/workspace-config';
import type { WorkspaceAppId } from '../../shared/regulatory/app-registry';

const appIds = (need: string): WorkspaceAppId[] =>
  resolveWorkspaceConfig(need).apps.map((a) => a.id);

describe('companion diagnostic (CDx) — a full IVD marketing dossier', () => {
  it('CDx PMA resolves to dossier scope with a submission center and FDA gateway', () => {
    const cfg = resolveWorkspaceConfig('US_CDX_PMA');
    expect(cfg.scope).toBe('dossier');
    expect(cfg.gateway?.region).toBe('fda');
    expect(appIds('US_CDX_PMA')).toContain('submission_center');
  });

  it('CDx PMA carries the IVD discipline app set (analytical performance, risk, labeling)', () => {
    const ids = appIds('US_CDX_PMA');
    expect(ids).toContain('analytical_performance');
    expect(ids).toContain('risk');
    expect(ids).toContain('labeling');
    expect(ids).toContain('cer'); // EU IVDR performance evaluation discipline
  });

  it('CDx 510(k) is also a dossier (concurrent IVD clearance)', () => {
    const cfg = resolveWorkspaceConfig('US_CDX_510K');
    expect(cfg.scope).toBe('dossier');
    expect(appIds('US_CDX_510K')).toContain('submission_center');
  });

  it('grounds to the IVD segment with the performance evidence model', () => {
    const cfg = resolveWorkspaceConfig('US_CDX_PMA');
    expect(cfg.vocabulary).toBe('ivd');
    expect(cfg.program?.segment).toBe('ivd');
    expect(cfg.program?.evidenceModel).toBe('performance');
  });

  it('the CDx co-development agreement is a pre-submission document, NOT a dossier', () => {
    // Same companion_diagnostic family, but stage = pre_submission: it is the
    // coordination artifact, not the marketing dossier. It must not pull in a
    // submission center or an agency gateway.
    const cfg = resolveWorkspaceConfig('US_CDX_CODEV');
    expect(cfg.scope).toBe('document');
    expect(cfg.gateway).toBeNull();
    expect(appIds('US_CDX_CODEV')).not.toContain('submission_center');
  });
});
