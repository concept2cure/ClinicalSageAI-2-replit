import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relPath: string) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('concept2cure shell/nav regression', () => {
  it('keeps centralized sidebar nav mapping in ZenApp', () => {
    const content = read('client/src/concept2cure/ZenApp.tsx');
    expect(content).toContain('const SIDEBAR_ACTIVE_NAV_BY_LAYOUT');
    expect(content).toContain("'vault-workspace': 'vault'");
    expect(content).toContain("'report-engine': 'reports'");
    expect(content).toContain("'review-readiness': 'review'");
    expect(content).toContain("'project-home': 'projects'");
    expect(content).toContain("'section-workspace': 'documents'");
  });

  it('keeps global operating shell actions and updated sidebar branding', () => {
    const shell = read('client/src/concept2cure/components/shell/GlobalOperatingShell.tsx');
    const sidebar = read('client/src/concept2cure/components/sidebar/ZenSidebar.tsx');

    expect(shell).toContain('Concept2Cure OS');
    expect(shell).toContain("label: 'Submission'");
    expect(sidebar).toContain('Concept2Cure');
    expect(sidebar).toContain('Global Operating Nav');
  });
});
