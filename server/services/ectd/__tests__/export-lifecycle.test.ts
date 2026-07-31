import { describe, it, expect } from 'vitest';
import { applyLifecycleDelta, type ExportModule } from '../export-lifecycle';
import { buildLeafManifest, manifestToPriorLeaves, computeSequencePrefix } from '../sequence-manifest';

/** Build a fresh module map for each test (applyLifecycleDelta mutates it). */
function modules(): Map<string, ExportModule> {
  const m = new Map<string, ExportModule>();
  m.set('3', {
    moduleNumber: '3',
    moduleName: 'Quality',
    granules: [
      { granuleId: '3.2.S.1', granuleName: 'General', filePath: 'm3/3-2-s-1/general.pdf', checksum: 'GEN_V2', operation: 'new' },
      { granuleId: '3.2.P.1', granuleName: 'Composition', filePath: 'm3/3-2-p-1/comp.pdf', checksum: 'COMP_SAME', operation: 'new' },
      { granuleId: '3.2.S.3', granuleName: 'Stability', filePath: 'm3/3-2-s-3/stab.pdf', checksum: 'STAB_NEW', operation: 'new' },
    ],
  });
  return m;
}

// Prior sequence (0000): general@V1 (will change), comp@SAME (unchanged),
// old-manufacture (dropped → delete). Stability is brand new.
const prior = manifestToPriorLeaves(buildLeafManifest([
  { ctdSection: '3.2.S.1', href: 'm3/3-2-s-1/general.pdf', md5: 'GEN_V1' },
  { ctdSection: '3.2.P.1', href: 'm3/3-2-p-1/comp.pdf', md5: 'COMP_SAME' },
  { ctdSection: '3.2.S.2', href: 'm3/3-2-s-2/old-manufacture.pdf', md5: 'OLD' },
]));

describe('applyLifecycleDelta', () => {
  it('classifies new/replace, omits unchanged, and appends a backbone-only delete', () => {
    const m = modules();
    const res = applyLifecycleDelta(m, prior, computeSequencePrefix('0000'));

    expect(res.summary).toMatchObject({ new: 1, replace: 1, delete: 1, unchangedOmitted: 1 });

    const g = m.get('3')!.granules;
    const byId = Object.fromEntries(g.map((x) => [x.granuleId, x]));

    // changed → replace, pointing at the prior file
    expect(byId['3.2.S.1'].operation).toBe('replace');
    expect(byId['3.2.S.1'].modifiedFile).toBe('../0000/m3/3-2-s-1/general.pdf');
    // brand new → new, no pointer
    expect(byId['3.2.S.3'].operation).toBe('new');
    expect(byId['3.2.S.3'].modifiedFile).toBeUndefined();
    // unchanged → omitted from the map + reported for removal
    expect(byId['3.2.P.1']).toBeUndefined();
    expect(res.removedFiles).toEqual(['m3/3-2-p-1/comp.pdf']);
    // dropped → backbone-only delete, href == modified-file == prior path
    expect(byId['3.2.S.2'].operation).toBe('delete');
    expect(byId['3.2.S.2'].modifiedFile).toBe('../0000/m3/3-2-s-2/old-manufacture.pdf');
    expect(byId['3.2.S.2'].filePath).toBe('../0000/m3/3-2-s-2/old-manufacture.pdf');
  });

  it('omits an unchanged leaf and emits a delete for every prior leaf now dropped', () => {
    // Current sequence carries only comp (unchanged). Prior also had general +
    // old-manufacture — both now absent → two deletes.
    const m = new Map<string, ExportModule>([
      ['3', { moduleNumber: '3', moduleName: 'Quality', granules: [
        { granuleId: '3.2.P.1', granuleName: 'C', filePath: 'm3/3-2-p-1/comp.pdf', checksum: 'COMP_SAME', operation: 'new' },
      ] }],
    ]);
    const res = applyLifecycleDelta(m, prior, computeSequencePrefix('0000'));
    expect(res.summary).toMatchObject({ new: 0, replace: 0, delete: 2, unchangedOmitted: 1 });
    const ops = m.get('3')!.granules.map((x) => x.operation);
    expect(ops).toEqual(['delete', 'delete']);
    expect(m.get('3')!.granules.every((x) => x.modifiedFile?.startsWith('../0000/'))).toBe(true);
  });

  it('with no prior, marks everything new and omits nothing', () => {
    const m = modules();
    const res = applyLifecycleDelta(m, [], computeSequencePrefix('0000'));
    expect(res.summary).toMatchObject({ new: 3, replace: 0, delete: 0, unchangedOmitted: 0 });
    expect(m.get('3')!.granules.every((x) => x.operation === 'new')).toBe(true);
  });
});
