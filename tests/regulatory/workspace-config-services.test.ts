import { describe, it, expect } from 'vitest';
import { resolveWorkspaceConfig } from '../../shared/regulatory/workspace-config';
import type { WorkspaceServiceId } from '../../shared/regulatory/workspace-config';

const serviceIds = (need: string): WorkspaceServiceId[] =>
  resolveWorkspaceConfig(need).services.map((s) => s.id);

describe('workspace-config services — financial disclosures (21 CFR 54)', () => {
  it('IND (clinical trial) includes financial_disclosures', () => {
    expect(serviceIds('US_IND')).toContain('financial_disclosures');
  });

  it('NDA (marketing authorization with clinical data) includes financial_disclosures', () => {
    expect(serviceIds('US_NDA')).toContain('financial_disclosures');
  });

  it('BLA (biologic marketing authorization) includes financial_disclosures', () => {
    expect(serviceIds('US_BLA')).toContain('financial_disclosures');
  });

  it('510(k) (dossier with clinical data) includes financial_disclosures', () => {
    expect(serviceIds('US_510K')).toContain('financial_disclosures');
  });
});

describe('workspace-config services — CMC consistency', () => {
  it('NDA (dossier) includes cmc_consistency', () => {
    expect(serviceIds('US_NDA')).toContain('cmc_consistency');
  });

  it('BLA includes cmc_consistency', () => {
    expect(serviceIds('US_BLA')).toContain('cmc_consistency');
  });

  it('PMA (device approval dossier) includes cmc_consistency', () => {
    expect(serviceIds('US_PMA')).toContain('cmc_consistency');
  });

  it('IND (dossier) includes cmc_consistency', () => {
    expect(serviceIds('US_IND')).toContain('cmc_consistency');
  });
});

describe('workspace-config services — dose optimization', () => {
  it('IND (drug clinical trial) includes dose_optimization', () => {
    expect(serviceIds('US_IND')).toContain('dose_optimization');
  });

  it('NDA (drug marketing authorization) includes dose_optimization', () => {
    expect(serviceIds('US_NDA')).toContain('dose_optimization');
  });

  it('510(k) device clearance does NOT include dose_optimization', () => {
    expect(serviceIds('US_510K')).not.toContain('dose_optimization');
  });

  it('CDx PMA (IVD vocabulary) does NOT include dose_optimization', () => {
    expect(serviceIds('US_CDX_PMA')).not.toContain('dose_optimization');
  });
});

describe('workspace-config services — effort certification', () => {
  it('IND (clinical trial) includes effort_certification', () => {
    expect(serviceIds('US_IND')).toContain('effort_certification');
  });

  it('NDA (marketing authorization, not a clinical trial) does NOT include effort_certification', () => {
    expect(serviceIds('US_NDA')).not.toContain('effort_certification');
  });

  it('510(k) does NOT include effort_certification', () => {
    expect(serviceIds('US_510K')).not.toContain('effort_certification');
  });
});

describe('workspace-config services — baseline always-on services', () => {
  it('every regulatory config includes knowledge_base', () => {
    for (const need of ['US_IND', 'US_NDA', 'US_510K', 'EU_MAA']) {
      expect(serviceIds(need)).toContain('knowledge_base');
    }
  });

  it('every regulatory config includes cross_artifact_intelligence', () => {
    for (const need of ['US_IND', 'US_NDA', 'US_510K', 'EU_MAA']) {
      expect(serviceIds(need)).toContain('cross_artifact_intelligence');
    }
  });

  it('every regulatory config includes regulatory_intelligence', () => {
    for (const need of ['US_IND', 'US_NDA', 'US_510K', 'EU_MAA']) {
      expect(serviceIds(need)).toContain('regulatory_intelligence');
    }
  });
});

describe('workspace-config services — CDx intelligence', () => {
  it('CDx PMA includes cdx_intelligence', () => {
    expect(serviceIds('US_CDX_PMA')).toContain('cdx_intelligence');
  });

  it('CDx 510(k) includes cdx_intelligence', () => {
    expect(serviceIds('US_CDX_510K')).toContain('cdx_intelligence');
  });

  it('standard NDA does NOT include cdx_intelligence', () => {
    expect(serviceIds('US_NDA')).not.toContain('cdx_intelligence');
  });
});

describe('workspace-config services — special designations', () => {
  it('IND (clinical trial) includes special_designations', () => {
    expect(serviceIds('US_IND')).toContain('special_designations');
  });

  it('NDA (marketing authorization) includes special_designations', () => {
    expect(serviceIds('US_NDA')).toContain('special_designations');
  });
});

describe('workspace-config services — controlled substances', () => {
  it('IND (drug clinical trial) includes controlled_substances', () => {
    expect(serviceIds('US_IND')).toContain('controlled_substances');
  });

  it('NDA (drug dossier) includes controlled_substances', () => {
    expect(serviceIds('US_NDA')).toContain('controlled_substances');
  });

  it('510(k) device does NOT include controlled_substances', () => {
    expect(serviceIds('US_510K')).not.toContain('controlled_substances');
  });
});

describe('workspace-config services — pediatric intelligence', () => {
  it('IND (clinical trial) includes pediatric_intelligence', () => {
    expect(serviceIds('US_IND')).toContain('pediatric_intelligence');
  });

  it('NDA (marketing authorization) includes pediatric_intelligence', () => {
    expect(serviceIds('US_NDA')).toContain('pediatric_intelligence');
  });
});

describe('workspace-config services — inspection readiness', () => {
  it('NDA (dossier) includes inspection_readiness', () => {
    expect(serviceIds('US_NDA')).toContain('inspection_readiness');
  });

  it('PMA (device approval) includes inspection_readiness', () => {
    expect(serviceIds('US_PMA')).toContain('inspection_readiness');
  });
});
