/**
 * Only server/services/review/review-route.ts sets the route-writer setting
 * (RR1a, finding B1). The database trigger unified_tasks_route_rows_guard
 * admits a write to a route row only on a transaction that set
 * c2c.review_route_writer, so a second setter anywhere in the server would be a
 * second route writer the trigger cannot tell apart. Test files are excluded:
 * they build fixtures as the route writer would.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const SETTER = /set_config\(\s*'c2c\.review_route_writer'|SET\s+(LOCAL\s+)?c2c\.review_route_writer/i;

function routeWriterSetters(root = ROOT, dirs = ['server', 'shared']): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        if (SETTER.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(root, full));
      }
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return found.sort();
}

describe('the route-writer setting has one setter', () => {
  it('is set only by server/services/review/review-route.ts', () => {
    expect(routeWriterSetters()).toEqual(['server/services/review/review-route.ts']);
  });

  it('fails when another server file sets it (the gate seen failing)', () => {
    const tmp = fs.mkdtempSync(path.join(ROOT, 'server', '.route-writer-gate-'));
    try {
      fs.writeFileSync(path.join(tmp, 'rogue.ts'), "await q.query(`SELECT set_config('c2c.review_route_writer', 'on', true)`);\n");
      expect(routeWriterSetters()).toContain(path.relative(ROOT, path.join(tmp, 'rogue.ts')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
