import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('Submission Ops hardening regressions', () => {
  it('validates artifact-section mapping ownership and project alignment', () => {
    const src = read('server/routes/submission-ops.ts');
    expect(src).toContain("return res.status(404).json({ error: 'Artifact not found for organization' });");
    expect(src).toContain("return res.status(404).json({ error: 'Section not found for organization' });");
    expect(src).toContain('Artifact and target section package must belong to the same project');
  });

  it('validates milestone sectionIds belong to target package', () => {
    const src = read('server/routes/submission-ops.ts');
    expect(src).toContain('sectionId ${sId} does not belong to package ${req.params.packageId}');
    expect(src).toContain('eq(c2cPackageSections.packageDbId, pkg.id)');
  });
});
