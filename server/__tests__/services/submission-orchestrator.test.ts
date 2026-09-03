import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mock the DB before importing modules that use it
vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async () => ({ rows: [] })),
  },
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));

// AI client (used by csr-builder which is transitively imported)
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
}));

import {
  composeAppendices,
  composeRegional,
  composeFullModule3,
  injectAllCrossReferences,
} from '../../services/module3-extensions';
import {
  buildM23QualityOverallSummary,
  buildM24NonclinicalOverview,
  buildM27ClinicalSummary,
  type NonclinicalStudy,
  type CSRSummaryInput,
} from '../../services/m2-summary-builders';
import {
  buildCSRTables,
  type StudyData,
} from '../../services/csr-tabulation-builders';
import {
  validateRegionalPackage,
  type RegionalContext,
  type RegionalLeafRef,
} from '../../services/ectd/ectd-regional-rules';
import {
  validateDtdConformance,
  enforceMd5Checksums,
  auditStudyIdTagging,
} from '../../services/ectd/ectd-validator-hardening';
import {
  runOrchestrator,
  markDownstreamStale,
  type OrchestratorInputs,
  type StepRecord,
  type StepKey,
} from '../../services/submission-package-orchestrator';
import type { CanonicalSource } from '../../services/module3Composer';
import type { ECTDLeaf } from '../../services/ectd/ectd4-validator';
import crypto from 'crypto';

// ── Fixtures ────────────────────────────────────────────────────────────────

const drugSubstanceSource: CanonicalSource = {
  id: 'src-ds-001',
  sourceType: 'drug_substance',
  sourcePayload: {
    name: 'Compound X',
    manufacturer: 'BioCo Manufacturing',
    structuralElucidation: 'NMR, MS, IR',
    physicochemicalProperties: 'White crystalline solid',
  },
};

const stabilitySource: CanonicalSource = {
  id: 'src-stab-001',
  sourceType: 'stability',
  sourcePayload: {
    storageCondition: '25°C / 60% RH',
    timePoints: [0, 3, 6, 9, 12],
    shelfLifeClaim: '24 months',
  },
};

const drugProductSource: CanonicalSource = {
  id: 'src-dp-001',
  sourceType: 'drug_product',
  sourcePayload: {
    dosageFormDescription: 'Film-coated tablet',
    composition: 'Compound X, lactose, MCC, magnesium stearate',
    strength: '50 mg',
  },
};

const excipientSource: CanonicalSource = {
  id: 'src-excip-001',
  sourceType: 'excipient',
  sourcePayload: {
    materialName: 'Novel Polymer Z',
    novel: true,
    function: 'Modified release agent',
    concentration: '5% w/w',
  },
};

const minimalNonclinical: NonclinicalStudy = {
  studyId: 'NC-001',
  studyType: 'toxicology',
  species: 'rat',
  duration: '13 weeks',
  doseLevels: ['10 mg/kg', '50 mg/kg', '250 mg/kg'],
  primaryFinding: 'No adverse findings up to 50 mg/kg',
  noael: '50 mg/kg/day',
  glpStatus: 'GLP',
  reportSection: 'm4.2.3',
};

const minimalCSRInput: CSRSummaryInput = {
  studyId: 'C2C-001',
  protocolNumber: 'C2C-001-NDA',
  phase: '3',
  studyDesign: 'Randomized double-blind placebo-controlled',
  primaryEndpoint: 'Change from baseline at week 24',
  primaryResult: 'Met (p<0.001)',
  sampleSize: 400,
  ittPopulation: 395,
  saeCount: 12,
  deathCount: 0,
};

const minimalStudyData: StudyData = {
  studyId: 'C2C-001',
  protocolNumber: 'C2C-001-NDA',
  treatmentArms: [
    {
      armId: 'A',
      armName: 'Compound X 50 mg',
      randomized: 200,
      populations: { safety: 198, itt: 195, completed: 180 },
    },
    {
      armId: 'B',
      armName: 'Placebo',
      randomized: 200,
      populations: { safety: 199, itt: 196, completed: 175 },
    },
  ],
  disposition: [
    { armId: 'A', status: 'completed' },
    { armId: 'A', status: 'discontinued', reason: 'Adverse event' },
    { armId: 'B', status: 'completed' },
  ],
  demographics: [
    { armId: 'A', age: 55, sex: 'M' },
    { armId: 'A', age: 60, sex: 'F' },
    { armId: 'B', age: 58, sex: 'M' },
  ],
  efficacy: [
    {
      endpointName: 'Change from baseline',
      endpointType: 'primary',
      armId: 'A',
      value: -2.5,
      display: '-2.5 (95% CI -3.2 to -1.8)',
      pValue: 0.001,
      comparatorArmId: 'B',
    },
  ],
  adverseEvents: [
    { armId: 'A', pt: 'Headache', soc: 'Nervous system', severity: 'mild', serious: false, related: 'related', subjectId: 's1' },
    { armId: 'A', pt: 'Headache', soc: 'Nervous system', severity: 'mild', serious: false, related: 'related', subjectId: 's2' },
    { armId: 'B', pt: 'Headache', soc: 'Nervous system', severity: 'mild', serious: false, related: 'unrelated', subjectId: 's3' },
  ],
};

// ── Module 3 extensions ─────────────────────────────────────────────────────

describe('module3-extensions', () => {
  describe('composeAppendices', () => {
    it('returns 3.2.A.1, 3.2.A.2, 3.2.A.3', () => {
      const sections = composeAppendices([drugSubstanceSource, drugProductSource, excipientSource]);
      const keys = sections.map(s => s.sectionKey);
      expect(keys).toContain('3.2.A.1');
      expect(keys).toContain('3.2.A.2');
      expect(keys).toContain('3.2.A.3');
    });

    it('marks 3.2.A.2 as not applicable for small molecules', () => {
      const sections = composeAppendices([drugSubstanceSource]);
      const a2 = sections.find(s => s.sectionKey === '3.2.A.2');
      expect(a2?.narrativeDraft).toContain('not applicable');
    });

    it('lists novel excipients in 3.2.A.3', () => {
      const sections = composeAppendices([excipientSource]);
      const a3 = sections.find(s => s.sectionKey === '3.2.A.3');
      expect(a3?.tables.length).toBeGreaterThan(0);
      expect(a3?.narrativeDraft).toContain('1 novel excipient');
    });
  });

  describe('composeRegional', () => {
    it('returns US-specific subsections for US region', () => {
      const sections = composeRegional([drugSubstanceSource], 'US');
      expect(sections.every(s => s.sectionKey.endsWith('.US'))).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    });

    it('returns EU-specific subsections for EU region', () => {
      const sections = composeRegional([drugSubstanceSource], 'EU');
      expect(sections.every(s => s.sectionKey.endsWith('.EU'))).toBe(true);
    });
  });

  describe('composeFullModule3', () => {
    it('returns S, P, A, and R sections together', () => {
      const sections = composeFullModule3(
        [drugSubstanceSource, drugProductSource, stabilitySource, excipientSource],
        'US'
      );
      const sKeys = sections.filter(s => s.sectionKey.startsWith('3.2.S')).map(s => s.sectionKey);
      const pKeys = sections.filter(s => s.sectionKey.startsWith('3.2.P')).map(s => s.sectionKey);
      const aKeys = sections.filter(s => s.sectionKey.startsWith('3.2.A')).map(s => s.sectionKey);
      const rKeys = sections.filter(s => s.sectionKey.startsWith('3.2.R')).map(s => s.sectionKey);
      expect(sKeys.length).toBeGreaterThan(0);
      expect(pKeys.length).toBeGreaterThan(0);
      expect(aKeys.length).toBe(3);
      expect(rKeys.length).toBeGreaterThan(0);
    });

    it('injects cross-references for sections that depend on others', () => {
      const sections = composeFullModule3(
        [drugSubstanceSource, drugProductSource, stabilitySource],
        'US'
      );
      const p8 = sections.find(s => s.sectionKey === '3.2.P.8');
      expect(p8?.narrativeDraft).toContain('Cross-references');
    });
  });

  describe('injectAllCrossReferences', () => {
    it('does not crash on empty input', () => {
      expect(() => injectAllCrossReferences([])).not.toThrow();
    });
  });
});

// ── M2 summary builders ─────────────────────────────────────────────────────

describe('m2-summary-builders', () => {
  it('builds M2.3 QOS from a full Module 3 composition', () => {
    const m3 = composeFullModule3(
      [drugSubstanceSource, drugProductSource, stabilitySource],
      'US'
    );
    const m23 = buildM23QualityOverallSummary({
      module3Sections: m3,
      drugSubstanceName: 'Compound X',
      drugProductName: 'Compound X 50 mg tablets',
    });
    expect(m23.sectionKey).toBe('2.3');
    expect(m23.narrative).toContain('QUALITY OVERALL SUMMARY');
    expect(m23.narrative).toContain('Compound X');
    expect(m23.completeness).toBeGreaterThanOrEqual(0);
    expect(m23.completeness).toBeLessThanOrEqual(100);
  });

  it('flags missing inputs in M2.3 gaps', () => {
    const m23 = buildM23QualityOverallSummary({ module3Sections: [] });
    expect(m23.gaps.length).toBeGreaterThan(0);
    expect(m23.completeness).toBeLessThan(100);
  });

  it('builds M2.4 from nonclinical studies', () => {
    const m24 = buildM24NonclinicalOverview({
      nonclinicalStudies: [minimalNonclinical],
      drugSubstanceName: 'Compound X',
      indication: 'hypertension',
    });
    expect(m24.sectionKey).toBe('2.4');
    expect(m24.narrative).toContain('NONCLINICAL OVERVIEW');
    expect(m24.tables.length).toBeGreaterThan(0);
  });

  it('builds M2.7 from CSR inputs', () => {
    const m27 = buildM27ClinicalSummary({
      csrs: [minimalCSRInput],
      indication: 'hypertension',
      investigationalProduct: 'Compound X',
    });
    expect(m27.sectionKey).toBe('2.7');
    expect(m27.narrative).toContain('CLINICAL SUMMARY');
    expect(m27.tables.length).toBeGreaterThan(0);
  });
});

// ── CSR tabulation ──────────────────────────────────────────────────────────

describe('csr-tabulation-builders', () => {
  it('builds disposition, demographics, efficacy, AE tables', () => {
    const tables = buildCSRTables(minimalStudyData);
    expect(tables.disposition.title).toContain('§10.1');
    expect(tables.demographics.title).toContain('§11.2');
    expect(tables.primaryEfficacy.title).toContain('Primary');
    expect(tables.aeOverallSummary.rows.length).toBeGreaterThan(0);
    expect(tables.aeBySOC.rows.length).toBeGreaterThan(0);
  });

  it('reports correct subject counts in AE summary', () => {
    const tables = buildCSRTables(minimalStudyData);
    const anyAERow = tables.aeOverallSummary.rows.find(r => r[0].startsWith('Any AE'));
    expect(anyAERow).toBeDefined();
    // Compound X arm: 2 unique subjects with AE out of 198
    expect(anyAERow![1]).toMatch(/2 \(/);
  });
});

// ── Regional rules ──────────────────────────────────────────────────────────

describe('ectd-regional-rules', () => {
  it('flags missing us-regional.xml for US submissions', () => {
    const ctx: RegionalContext = {
      region: 'US',
      applicationNumber: 'IND123456',
      sequenceNumber: '0000',
      submissionType: 'IND',
    };
    const findings = validateRegionalPackage(ctx, []);
    expect(findings.some(f => f.ruleId === 'FDA-ESG-004')).toBe(true);
  });

  it('rejects non-4-digit sequence numbers', () => {
    const ctx: RegionalContext = {
      region: 'US',
      applicationNumber: 'IND123456',
      sequenceNumber: '1',
      submissionType: 'IND',
    };
    const findings = validateRegionalPackage(ctx, []);
    expect(findings.some(f => f.ruleId === 'FDA-ESG-001' || f.message.includes('not a 4-digit'))).toBe(true);
  });

  it('flags package size over FDA 4 GB gateway limit', () => {
    const ctx: RegionalContext = {
      region: 'US',
      applicationNumber: 'IND123456',
      sequenceNumber: '0000',
      submissionType: 'IND',
      totalSizeBytes: 5 * 1024 * 1024 * 1024,
    };
    const leaves: RegionalLeafRef[] = [
      { sectionCode: 'm1.us', filePath: 'm1/us/us-regional.xml', mimeType: 'text/xml', fileSize: 1000 },
    ];
    const findings = validateRegionalPackage(ctx, leaves);
    expect(findings.some(f => f.ruleId === 'FDA-ESG-003')).toBe(true);
  });

  it('accepts valid EU application number format', () => {
    const ctx: RegionalContext = {
      region: 'EU',
      applicationNumber: 'EMEA/H/C/12345',
      sequenceNumber: '0000',
      submissionType: 'MAA',
    };
    const leaves: RegionalLeafRef[] = [
      { sectionCode: 'm1.eu', filePath: 'm1/eu/eu-regional.xml', mimeType: 'text/xml', fileSize: 1000 },
    ];
    const findings = validateRegionalPackage(ctx, leaves);
    expect(findings.some(f => f.ruleId === 'EMA-CESP-002')).toBe(false);
  });
});

// ── Validator hardening ─────────────────────────────────────────────────────

describe('ectd-validator-hardening', () => {
  describe('validateDtdConformance', () => {
    it('flags missing XML declaration', () => {
      const findings = validateDtdConformance('<ectd:ectd></ectd:ectd>', []);
      expect(findings.some(f => f.code === 'DTD_NO_DECLARATION')).toBe(true);
    });

    it('flags missing DOCTYPE', () => {
      const findings = validateDtdConformance(
        '<?xml version="1.0"?><ectd:ectd></ectd:ectd>',
        []
      );
      expect(findings.some(f => f.code === 'DTD_NO_DOCTYPE')).toBe(true);
    });

    it('flags missing eCTD namespace', () => {
      const xml = `<?xml version="1.0"?>
        <!DOCTYPE ectd:ectd SYSTEM "ich-ectd-3-2.dtd">
        <ectd:ectd xmlns:xlink="http://www.w3.org/1999/xlink"></ectd:ectd>`;
      const findings = validateDtdConformance(xml, []);
      expect(findings.some(f => f.code === 'DTD_MISSING_ECTD_NS')).toBe(true);
    });

    it('flags leaf missing required attributes', () => {
      const xml = `<?xml version="1.0"?>
        <!DOCTYPE ectd:ectd SYSTEM "ich-ectd-3-2.dtd">
        <ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
          <leaf title="Bad leaf"></leaf>
        </ectd:ectd>`;
      const findings = validateDtdConformance(xml, []);
      expect(findings.some(f => f.code === 'DTD_LEAF_MISSING_ATTR')).toBe(true);
    });

    // The vendored fixtures are the gate's own acceptance case. Nothing loaded
    // them before, so the gate had never actually been exercised end to end:
    // index-valid.xml failed on three phantom DTD_LEAF_MISSING_ATTR findings
    // raised against the `<leaf>` written inside its own documentation comment.
    // Assert both directions here so a regression in comment handling — in
    // either direction — fails the suite rather than the demo.
    const fixture = (name: string): string =>
      readFileSync(path.resolve(process.cwd(), 'assets/ectd-dtd/fixtures', name), 'utf8');

    it('passes the vendored conformant backbone fixture with zero findings', () => {
      const findings = validateDtdConformance(fixture('index-valid.xml'), []);
      expect(findings).toEqual([]);
    });

    it('does not read <leaf> inside an XML comment as a leaf', () => {
      // index-valid.xml documents DTD_LEAF_MISSING_ATTR using a literal <leaf>
      // in its header comment; only the four real leaves may be scanned.
      const findings = validateDtdConformance(fixture('index-valid.xml'), []);
      expect(findings.filter(f => f.code === 'DTD_LEAF_MISSING_ATTR')).toEqual([]);
    });

    it('fails the vendored non-conformant backbone fixture on every seeded violation', () => {
      const findings = validateDtdConformance(fixture('index-invalid.xml'), []);
      const codes = new Set(findings.map(f => f.code));
      for (const expected of [
        'DTD_NO_DECLARATION',
        'DTD_NO_DOCTYPE',
        'DTD_BAD_ROOT',
        'DTD_MISSING_ECTD_NS',
        'DTD_MISSING_XLINK_NS',
        'DTD_LEAF_MISSING_ATTR',
        'DTD_CHECKSUM_TYPE',
        'DTD_UNKNOWN_ELEMENT',
      ]) {
        expect(codes, `expected ${expected} from index-invalid.xml`).toContain(expected);
      }
      expect(findings.some(f => f.severity === 'error')).toBe(true);
    });
  });

  describe('enforceMd5Checksums', () => {
    it('flags malformed MD5', () => {
      const leaves: ECTDLeaf[] = [{
        sectionCode: 'm3.2.S.1',
        title: 'Test',
        checksum: 'notavalidmd5',
        checksumType: 'md5',
        operation: 'new',
        filePath: 'm3/test.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }];
      const findings = enforceMd5Checksums(leaves);
      expect(findings.some(f => f.code === 'MD5_INVALID_FORMAT')).toBe(true);
    });

    it('detects MD5 mismatch when buffers provided', () => {
      const buffer = Buffer.from('hello world');
      const wrongHash = crypto.createHash('md5').update('different content').digest('hex');
      const leaves: ECTDLeaf[] = [{
        sectionCode: 'm3.2.S.1',
        title: 'Test',
        checksum: wrongHash,
        checksumType: 'md5',
        operation: 'new',
        filePath: 'm3/test.pdf',
        mimeType: 'application/pdf',
        fileSize: 11,
      }];
      const findings = enforceMd5Checksums(leaves, { 'm3/test.pdf': buffer });
      expect(findings.some(f => f.code === 'MD5_MISMATCH')).toBe(true);
    });
  });

  describe('auditStudyIdTagging', () => {
    it('flags M5.3.5 leaf without study-id', () => {
      const leaves: ECTDLeaf[] = [{
        sectionCode: 'm5.3.5',
        title: 'Phase 3 CSR',
        checksum: 'a'.repeat(32),
        checksumType: 'md5',
        operation: 'new',
        filePath: 'm5/53/535/csr.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }];
      const findings = auditStudyIdTagging(leaves);
      expect(findings.some(f => f.code === 'STF_MISSING_STUDY_ID')).toBe(true);
    });

    it('does not flag M3 leaves (study-id not required)', () => {
      const leaves: ECTDLeaf[] = [{
        sectionCode: 'm3.2.S.1',
        title: 'DS general info',
        checksum: 'a'.repeat(32),
        checksumType: 'md5',
        operation: 'new',
        filePath: 'm3/32s1/ds.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }];
      const findings = auditStudyIdTagging(leaves);
      expect(findings.length).toBe(0);
    });
  });
});

// ── Orchestrator ────────────────────────────────────────────────────────────

describe('submission-package-orchestrator', () => {
  const baseInputs: OrchestratorInputs = {
    // organizationId is required by the Move 1 tenant-scope gate
    // (runOrchestrator throws on missing/non-positive). Fixture orgId 1 is
    // a placeholder.
    organizationId: 1,
    submissionId: 'sub-001',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [drugSubstanceSource, drugProductSource, stabilitySource],
    nonclinicalStudies: [minimalNonclinical],
    clinicalStudyData: [minimalStudyData],
    csrInputs: [minimalCSRInput],
    drugSubstanceName: 'Compound X',
    drugProductName: 'Compound X 50 mg tablets',
    indication: 'hypertension',
    skipValidation: true,
  };

  it('runs end-to-end and produces all step records', async () => {
    const { run, outputs } = await runOrchestrator(baseInputs);
    expect(run.runId).toBeDefined();
    expect(run.status).toMatch(/complete|partial/);
    // ORDERED_STEPS count: 11 original + m3.refine (Move 5) + csr.draft-narrative (Move 6)
    // + one additional pipeline step added since = 14.
    expect(run.steps.length).toBe(14);
    expect(outputs.module3Sections.length).toBeGreaterThan(0);
    expect(outputs.csrTables.length).toBe(1);
    expect(outputs.m23).toBeDefined();
    expect(outputs.m24).toBeDefined();
    expect(outputs.m25).toBeDefined();
    expect(outputs.m27).toBeDefined();
  });

  it('skips downstream steps when source data is missing', async () => {
    const { run, outputs } = await runOrchestrator({
      ...baseInputs,
      cmcSources: [],
      nonclinicalStudies: [],
      clinicalStudyData: [],
      csrInputs: [],
    });
    expect(run.steps.find(s => s.key === 'm3.compose')?.status).toBe('skipped');
    expect(run.steps.find(s => s.key === 'csr.tabulate')?.status).toBe('skipped');
    expect(outputs.m23).toBeUndefined();
    expect(outputs.m27).toBeUndefined();
  });

  it('marks downstream steps stale when an upstream step changes', () => {
    const steps: StepRecord[] = [
      { key: 'm3.compose', status: 'complete', inputHash: 'a', dependsOn: [] },
      { key: 'm3.appendices', status: 'complete', inputHash: 'b', dependsOn: ['m3.compose'] },
      { key: 'm2.3.qos', status: 'complete', inputHash: 'c', dependsOn: ['m3.compose', 'm3.appendices', 'm3.regional'] },
      { key: 'package.assemble', status: 'complete', inputHash: 'd', dependsOn: ['m2.3.qos', 'm2.4.nonclinical', 'm2.7.clinical', 'm1.admin'] },
    ];
    const stale = markDownstreamStale(steps, 'm3.compose');
    expect(stale).toContain('m3.appendices');
    expect(stale).toContain('m2.3.qos');
    expect(stale).toContain('package.assemble');
    expect(steps.find(s => s.key === 'm3.appendices')?.status).toBe('stale');
  });

  it('records input hashes for incremental rebuild detection', async () => {
    const result = await runOrchestrator(baseInputs);
    const m3Step = result.run.steps.find(s => s.key === 'm3.compose')!;
    expect(m3Step.inputHash).toBeTruthy();
    expect(m3Step.inputHash.length).toBe(64);  // sha256 hex
  });
});
