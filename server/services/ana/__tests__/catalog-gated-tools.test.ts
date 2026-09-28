/**
 * CATALOG_GATED_TOOLS is the list of every tool that refuses without the
 * catalog — derived from the handlers, not remembered.
 *
 * governedToolsetFor drops these names from the toolset when an organization's
 * catalog is off. A gated tool missing from the list would still be offered,
 * and would refuse on every call: the exact defect the list exists to prevent.
 * So the list is checked against the one thing that makes a tool gated — a
 * call to requireCatalog(ctx, '<name>') in a handler — in both directions.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_GATED_TOOLS } from '../document-tools-shared';

const DIR = path.resolve(__dirname, '..');

function gatedByHandlers(): string[] {
  const names = new Set<string>();
  for (const file of fs.readdirSync(DIR)) {
    if (!file.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(DIR, file), 'utf8');
    for (const m of src.matchAll(/requireCatalog\(\s*ctx\s*,\s*'([a-z_]+)'\s*\)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('CATALOG_GATED_TOOLS', () => {
  it('names exactly the tools whose handlers call requireCatalog', () => {
    const found = gatedByHandlers();
    expect(found.length).toBeGreaterThan(0);
    expect([...CATALOG_GATED_TOOLS].sort()).toEqual(found);
  });
});
