import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relPath: string) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('concept2cure shell/nav regression', () => {
  it('keeps layout mode routing in ZenApp', () => {
    const content = read('client/src/concept2cure/ZenApp.tsx');
    // Key layout modes are defined and routed
    expect(content).toContain("'vault-workspace'");
    expect(content).toContain("'report-engine'");
    expect(content).toContain("'review-readiness'");
    expect(content).toContain("'project-home'");
    expect(content).toContain("'section-workspace'");
  });

  it('keeps global operating shell and sidebar wired', () => {
    const shell = read('client/src/concept2cure/components/shell/GlobalOperatingShell.tsx');
    const sidebar = read('client/src/concept2cure/components/sidebar/ZenSidebar.tsx');

    // Shell exports the GlobalOperatingShell component
    expect(shell).toContain('GlobalOperatingShell');
    expect(shell).toContain('layoutMode');
    // Sidebar exists and renders navigation
    expect(sidebar).toContain('ZenSidebar');
  });
});
