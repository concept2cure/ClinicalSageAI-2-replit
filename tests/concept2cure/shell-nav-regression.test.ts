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

  it('keeps sidebar wired with 5 destinations', () => {
    const sidebar = read('client/src/concept2cure/components/sidebar/ZenSidebar.tsx');

    // Sidebar exists and renders the 5 canonical destinations
    expect(sidebar).toContain('ZenSidebar');
    expect(sidebar).toContain('Chats');
    expect(sidebar).toContain('Projects');
    expect(sidebar).toContain('Communication Center');
    expect(sidebar).toContain('Apps');
    expect(sidebar).toContain('Settings');
  });
});
