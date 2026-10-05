import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CMC_CONVERGENCE_MAP } from '../cmcConvergenceMap';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

describe('CMC convergence map (code authority)', () => {
  it('contains a canonical cmc-os schema owner entry', () => {
    const entry = CMC_CONVERGENCE_MAP.find((e) => e.path === 'shared/schema/cmc-os.ts');
    expect(entry?.state).toBe('canonical');
  });

  it('tracks transitional shared/cmc-schema ownership', () => {
    const entry = CMC_CONVERGENCE_MAP.find((e) => e.path === 'shared/cmc-schema.ts');
    expect(entry?.state).toBe('transitional');
  });

  it('lists only files that exist', () => {
    // A row for a deleted file is a claim about code nobody can open. Until
    // 2026-10-05 the map carried server/routes/cmc-dashboard.ts, already gone,
    // and four routers retired that day.
    const missing = CMC_CONVERGENCE_MAP.map((e) => e.path).filter(
      (p) => !fs.existsSync(path.join(repoRoot, p)),
    );
    expect(missing, `Convergence map lists missing files:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('lists each file once', () => {
    const paths = CMC_CONVERGENCE_MAP.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
