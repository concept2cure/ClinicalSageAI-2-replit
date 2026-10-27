/** A2.10: the former catalogue identity reaches the governed Projects intake. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getSurface } from '../../shared/constants/ui-surface-registry';
import { DEFERRED_CAPABILITY_INVENTORY } from '../../shared/constants/deferred-capability-inventory';
import { DEEP_LINK_ALIASES, ALIAS_APPLIES, SEGMENTS, getSegmentModules } from '../../client/src/concept2cure/v2/registryModel';
import { SURFACE_VIEWS } from '../../client/src/concept2cure/v2/surfaceViews';
import { destinationFor } from '../../client/src/concept2cure/v2/routing';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('filing catalogue converges on the existing Projects wizard', () => {
  it.each([false, true])('uses the same validated wizard action with projectOpen=%s', projectOpen => {
    expect(DEEP_LINK_ALIASES['filings-catalog']).toBe('projects');
    expect(ALIAS_APPLIES['filings-catalog']).toEqual({ actionId: 'projects.new-project', params: {} });
    expect(destinationFor('filings-catalog', projectOpen)).toEqual({ surfaceId: 'projects', applies: { actionId: 'projects.new-project', params: {} } });
  });

  it('retires the standalone surface and deferred identity without removing Projects', () => {
    expect(getSurface('filings-catalog')).toBeUndefined();
    expect(SURFACE_VIEWS['filings-catalog']).toBeUndefined();
    expect(DEFERRED_CAPABILITY_INVENTORY.some(row => row.surfaceId === 'filings-catalog')).toBe(false);
    expect(getSurface('projects')).toBeTruthy();
    expect(SURFACE_VIEWS.projects).toBeTruthy();
  });

  it('offers no old surface in a client-type module list', () => {
    for (const segment of SEGMENTS) {
      for (const group of getSegmentModules(segment.id)) expect(group.items).not.toContain('filings-catalog');
    }
  });

  it('removes the old fixture exemption because shared reference data owns the guide', () => {
    const allowlist = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/launch-scope-fixture-allowlist.json'), 'utf8'));
    expect(Object.keys(allowlist.symbols).filter(key => key.startsWith('filings-catalog-data.'))).toEqual([]);
  });
});
