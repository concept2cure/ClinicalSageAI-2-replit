import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from '../readinessEvaluator';
import { buildPackageManifest } from '../submissionPackageBuilder';
import { resolveOutlineForType } from '../canonicalDocumentStore';
import { getMandatoryArtifacts } from '../requiredArtifactMatrix';

const filing = 'US_NDA';
const sections = () => resolveOutlineForType(filing).filter(s => s.required).map(s => ({
  code: s.code, title: s.title, status: 'approved', artifactCount: 1, documentIds: [`doc-${s.code}`],
}));
const artifacts = (status = 'approved') => getMandatoryArtifacts(filing).map(a => ({
  type: a.artifactType, status, documentId: `doc-${a.artifactType}`,
}));

describe('submission assessment distinguishes evidence presence from approval', () => {
  it('draft artifacts are present but incomplete and produce review gaps', () => {
    const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: sections(), artifacts: artifacts('draft') });
    expect(result.artifactReadiness.present).toBe(result.artifactReadiness.required);
    expect(result.artifactReadiness.approved).toBe(0);
    expect(result.artifactReadiness.completionPercent).toBe(0);
    expect(result.artifactReadiness.unapproved).toHaveLength(result.artifactReadiness.required);
    expect(result.gaps.filter(g => g.type === 'artifact')).toHaveLength(result.artifactReadiness.required);
    expect(result.level).not.toBe('ready');
    expect(buildPackageManifest(filing, 'project', sections(), artifacts('draft'))!.metadata.packageComplete).toBe(false);
  });

  it('a signature state without an approval meaning is present but unapproved', () => {
    const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: sections(), artifacts: artifacts('signed') });
    expect(result.artifactReadiness.present).toBe(result.artifactReadiness.required);
    expect(result.artifactReadiness.approved).toBe(0);
    expect(result.level).not.toBe('ready');
    expect(buildPackageManifest(filing, 'project', sections(), artifacts('signed'))!.metadata.packageComplete).toBe(false);
  });

  it.each(['missing', 'not_started', 'todo', 'superseded', 'withdrawn', 'archived', 'deleted', 'invented_status'])('%s records cannot satisfy requirements', status => {
    const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: sections(), artifacts: artifacts(status) });
    expect(result.artifactReadiness.present).toBe(0);
    expect(result.artifactReadiness.missing).toHaveLength(result.artifactReadiness.required);
    expect(result.level).toBe('not_ready');
    const manifest = buildPackageManifest(filing, 'project', sections(), artifacts(status))!;
    expect(manifest.artifacts.every(a => a.status === 'missing')).toBe(true);
    expect(manifest.metadata.packageComplete).toBe(false);
  });

  it('one required section still in review prevents a ready verdict even above 90 percent', () => {
    const actual = sections();
    actual[0].status = 'review';
    const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: actual, artifacts: artifacts() });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe('nearly_ready');
    expect(result.gaps.some(g => g.type === 'section' && g.code === actual[0].code)).toBe(true);
  });

  it('an empty approved section cannot be counted as completed evidence', () => {
    const actual = sections();
    actual[0].artifactCount = 0;
    actual[0].documentIds = [];
    const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: actual, artifacts: artifacts() });
    expect(result.sectionReadiness.completed).toBe(actual.length - 1);
    expect(result.level).not.toBe('ready');
    const manifest = buildPackageManifest(filing, 'project', actual, artifacts())!;
    expect(manifest.sections.find(s => s.code === actual[0].code)?.status).toBe('missing');
    expect(manifest.metadata.packageComplete).toBe(false);
  });

  it('approval without an artifact identity cannot complete the package', () => {
    const actual = artifacts().map(({ documentId: _id, ...a }) => a);
    const manifest = buildPackageManifest(filing, 'project', sections(), actual)!;
    expect(manifest.metadata.packageComplete).toBe(false);
    expect(manifest.metadata.sourceIdentitiesPresent).toBe(false);
  });

  it('duplicate current records with inconsistent states never select an approval by input order', () => {
    const first = artifacts()[0];
    for (const actual of [
      [...artifacts(), { ...first, status: 'review', documentId: 'other-current' }],
      [{ ...first, status: 'review', documentId: 'other-current' }, ...artifacts()],
    ]) {
      const result = evaluateReadiness({ registryIdOrLegacy: filing, sections: sections(), artifacts: actual });
      expect(result.artifactReadiness.approved).toBe(result.artifactReadiness.required - 1);
      expect(result.level).not.toBe('ready');
      expect(buildPackageManifest(filing, 'project', sections(), actual)!.metadata.packageComplete).toBe(false);
    }
  });

  it('IND safety routing remains unresolved without report subtype and commercial status', () => {
    const manifest = buildPackageManifest('US_IND_SR', 'project', [], [])!;
    expect(manifest.submissionGateway).toBeNull();
    expect(manifest.metadata.packageComplete).toBe(false);
    expect(manifest.validationRules).toContain('ind_safety_subtype_and_commercial_status_not_assessed');
    expect(manifest.validationRules).not.toContain('ectd_structure_valid');
    expect(manifest.outlineLimitations?.join(' ')).toMatch(/E2B.*AEMS/);
  });

  it('a retired version does not defeat a current approved replacement', () => {
    const actual = [...artifacts(), { ...artifacts()[0], status: 'superseded', documentId: 'old-version' }];
    const actualSections = [...sections(), { ...sections()[0], status: 'superseded', artifactCount: 0, documentIds: [] }];
    expect(evaluateReadiness({ registryIdOrLegacy: filing, sections: actualSections, artifacts: actual }).level).toBe('ready');
    expect(buildPackageManifest(filing, 'project', sections(), actual)!.metadata.packageComplete).toBe(true);
  });
});
