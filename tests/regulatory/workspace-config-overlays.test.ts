import { describe, it, expect } from 'vitest';
import { resolveWorkspaceConfig, buildSelectionCatalog } from '../../shared/regulatory/workspace-config';

describe('workspace-config — region overlay', () => {
  it('resolving with region adds the region overlay block', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'US' });
    expect(cfg.region).toBeDefined();
    expect(cfg.region!.code).toBe('US');
    expect(cfg.region!.language).toBe('en');
    expect(cfg.region!.dossierStandard).toBe('eCTD');
  });

  it('JP region overlay has ja language', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'JP' });
    expect(cfg.region!.language).toBe('ja');
  });

  it('CN region overlay has CTD dossier standard', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'CN' });
    expect(cfg.region!.dossierStandard).toBe('CTD');
  });

  it('SG region overlay has ACTD dossier standard', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'SG' });
    expect(cfg.region!.dossierStandard).toBe('ACTD');
  });

  it('unknown region does NOT produce a region overlay', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'ZZ' });
    expect(cfg.region).toBeUndefined();
  });

  it('string-form resolver never produces a region overlay', () => {
    const cfg = resolveWorkspaceConfig('NDA');
    expect(cfg.region).toBeUndefined();
  });

  it('US region overlay includes a gateway URL', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'US' });
    expect(cfg.region!.gatewayUrl).toBeTruthy();
  });
});

describe('workspace-config — client-type overlay', () => {
  it('resolving with clientType adds the clientType overlay block', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', clientType: 'pharma' });
    expect(cfg.clientType).toBeDefined();
    expect(cfg.clientType!.industry).toBe('pharma');
    expect(cfg.clientType!.vertical).toBe('biopharma');
  });

  it('medtech client type maps to mdx vertical', () => {
    const cfg = resolveWorkspaceConfig({ need: 'US_510K', clientType: 'medtech' });
    expect(cfg.clientType!.vertical).toBe('mdx');
  });

  it('cro client type uses signoff_required approval', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', clientType: 'cro' });
    expect(cfg.clientType!.defaultApprovalPath).toBe('signoff_required');
  });

  it('academic client type uses single_reviewer approval', () => {
    const cfg = resolveWorkspaceConfig({ need: 'IND', clientType: 'academic' });
    expect(cfg.clientType!.defaultApprovalPath).toBe('single_reviewer');
  });

  it('medical_writing client type has terminology overrides', () => {
    const cfg = resolveWorkspaceConfig({ need: 'CSR', clientType: 'medical_writing' });
    expect(cfg.clientType!.terminology['product']).toBe('Document');
  });

  it('unknown client type does NOT produce a clientType overlay', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', clientType: 'fintech' });
    expect(cfg.clientType).toBeUndefined();
  });

  it('string-form resolver never produces a clientType overlay', () => {
    const cfg = resolveWorkspaceConfig('NDA');
    expect(cfg.clientType).toBeUndefined();
  });
});

describe('workspace-config — combined overlays', () => {
  it('both region and clientType overlays are present when supplied', () => {
    const cfg = resolveWorkspaceConfig({ need: 'NDA', region: 'EU', clientType: 'biotech' });
    expect(cfg.region).toBeDefined();
    expect(cfg.clientType).toBeDefined();
    expect(cfg.region!.code).toBe('EU');
    expect(cfg.clientType!.industry).toBe('biotech');
  });

  it('overlays do not affect the base config identity', () => {
    const base = resolveWorkspaceConfig('NDA');
    const withOverlays = resolveWorkspaceConfig({ need: 'NDA', region: 'JP', clientType: 'pharma' });
    expect(withOverlays.resolved.id).toBe(base.resolved.id);
    expect(withOverlays.scope).toBe(base.scope);
    expect(withOverlays.vocabulary).toBe(base.vocabulary);
    expect(withOverlays.apps.length).toBe(base.apps.length);
  });
});

describe('workspace-config — supplementary (non-filing) document types', () => {
  it('SOP resolves to a known workspace config', () => {
    const cfg = resolveWorkspaceConfig('SOP');
    expect(cfg.known).toBe(true);
    expect(cfg.resolved.displayName).toContain('Operating Procedure');
    expect(cfg.scope).toBe('document');
    expect(cfg.vocabulary).toBe('quality');
  });

  it('WORK_INSTRUCTION resolves to a known workspace config', () => {
    const cfg = resolveWorkspaceConfig('WORK_INSTRUCTION');
    expect(cfg.known).toBe(true);
    expect(cfg.resolved.displayName).toContain('Work Instruction');
  });

  it('SOP has QMS lifecycle actions', () => {
    const cfg = resolveWorkspaceConfig('SOP');
    expect(cfg.lifecycleActions).toContain('draft');
    expect(cfg.lifecycleActions).toContain('review');
    expect(cfg.lifecycleActions).toContain('approve');
  });

  it('supplementary types have no gateway', () => {
    expect(resolveWorkspaceConfig('SOP').gateway).toBeNull();
    expect(resolveWorkspaceConfig('WORK_INSTRUCTION').gateway).toBeNull();
  });
});

describe('workspace-config — unknown fallback', () => {
  it('unknown need resolves as not known', () => {
    const cfg = resolveWorkspaceConfig('MAGIC_POTION');
    expect(cfg.known).toBe(false);
    expect(cfg.scope).toBe('document');
    expect(cfg.vocabulary).toBe('generic');
  });

  it('unknown need still gets knowledge_base service', () => {
    const cfg = resolveWorkspaceConfig('MAGIC_POTION');
    const svcIds = cfg.services.map((s) => s.id);
    expect(svcIds).toContain('knowledge_base');
  });

  it('unknown need gets no apps', () => {
    const cfg = resolveWorkspaceConfig('MAGIC_POTION');
    expect(cfg.apps).toHaveLength(0);
  });
});

describe('workspace-config — selection catalog', () => {
  it('buildSelectionCatalog returns non-empty groups', () => {
    const groups = buildSelectionCatalog();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.id).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.options.length).toBeGreaterThan(0);
    }
  });

  it('the submissions group contains NDA / BLA / 510(k) options', () => {
    const groups = buildSelectionCatalog();
    const submissions = groups.find((g) => g.id === 'submissions');
    expect(submissions).toBeDefined();
    const values = submissions!.options.map((o) => o.value);
    expect(values).toContain('US_NDA');
    expect(values).toContain('US_BLA');
    expect(values).toContain('US_510K');
  });

  it('the QMS group contains SOP', () => {
    const groups = buildSelectionCatalog();
    const qms = groups.find((g) => g.id === 'qms');
    expect(qms).toBeDefined();
    const values = qms!.options.map((o) => o.value);
    expect(values).toContain('SOP');
  });

  it('every option value resolves to a workspace config', () => {
    const groups = buildSelectionCatalog();
    for (const g of groups) {
      for (const opt of g.options) {
        const cfg = resolveWorkspaceConfig(opt.value);
        expect(cfg.known).toBe(true);
      }
    }
  });

  it('options are sorted by region then label within each group', () => {
    const groups = buildSelectionCatalog();
    for (const g of groups) {
      for (let i = 1; i < g.options.length; i++) {
        const a = g.options[i - 1];
        const b = g.options[i];
        const cmp = (a.region ?? '').localeCompare(b.region ?? '') || a.label.localeCompare(b.label);
        expect(cmp).toBeLessThanOrEqual(0);
      }
    }
  });
});
