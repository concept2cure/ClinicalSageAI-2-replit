/**
 * Which outline sections a project's eSTAR requires: the one answer for a
 * 510(k) or De Novo (P-107 item 3, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * The outlines scored here are the ones the product scaffolds, read out of
 * their migration, so an edit to a mapper matcher or to a shipped outline shows
 * here which sections change hands.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estarDeviceAnswers,
  estarFilingType,
  estarOutlineRequirements,
  type EstarOutlineRequirements,
  type EstarOutlineSectionInput,
} from '../estar-outline-requirements';
import { leafDocumentType, mapToEstar, type DeviceFlags, type EstarType } from '../estar-mapper';
import { governedSectionsToDeviceSections, sectionsToLeaves } from '../estar-content-leaves';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const OUTLINES = path.join(REPO_ROOT, 'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql');

type PackNode = { key: string; parent_key: string | null; label: string; mandatory: boolean; path_order: number };

/** The live outlines, in file order: [0] k510 fda-estar-510k-v1.1, [1] denovo fda-estar-denovo-v1.1. */
function shippedPacks(): [PackNode[], PackNode[]] {
  const blobs = [...fs.readFileSync(OUTLINES, 'utf8').matchAll(/\$pack\$([\s\S]*?)\$pack\$/g)].map((m) => JSON.parse(m[1]));
  expect(blobs, 'the outlines migration no longer carries two $pack$ blobs').toHaveLength(2);
  return blobs as [PackNode[], PackNode[]];
}
const [K510, DENOVO] = shippedPacks();

const sectionsOf = (pack: PackNode[], written: string[] = []): EstarOutlineSectionInput[] =>
  pack.map((n) => ({ key: n.key, label: n.label, parentKey: n.parent_key, mandatory: n.mandatory, hasContent: written.includes(n.key) }));

const FLAG_IDS = ['combinationProduct', 'softwareAiMl', 'cyberDevice', 'sterile', 'implantable', 'cliaWaived', 'clinicalData'] as const;
const answered = (yes: ReadonlyArray<(typeof FLAG_IDS)[number]>): DeviceFlags =>
  Object.fromEntries(FLAG_IDS.map((f) => [f, yes.includes(f)])) as DeviceFlags;
const ALL_NO = answered([]);
const ALL_YES = answered(FLAG_IDS);

const ask = (type: EstarType, pack: PackNode[], flags: DeviceFlags | undefined, written: string[] = [], variant?: 'device' | 'ivd') =>
  estarOutlineRequirements({ type, variant, flags, sections: sectionsOf(pack, written) });

/** The keys the mapper decides, grouped by its answer, and the keys left to the pack. */
function ledger(r: EstarOutlineRequirements) {
  const keys = (pick: (s: EstarOutlineRequirements['sections'][number]) => boolean) => r.sections.filter(pick).map((s) => s.key);
  return {
    required: keys((s) => s.decidedBy === 'mapper' && s.requirement === 'required'),
    undetermined: keys((s) => s.requirement === 'undetermined'),
    whenApplicable: keys((s) => s.requirement === 'when-applicable'),
    notApplicable: keys((s) => s.requirement === 'not-applicable'),
    notRequired: keys((s) => s.decidedBy === 'mapper' && s.requirement === 'not-required'),
    pack: keys((s) => s.decidedBy === 'pack'),
  };
}

describe('estarFilingType: which governed documents an eSTAR applies to', () => {
  it('a 510(k) and a De Novo for FDA', () => {
    expect(estarFilingType('k510', 'fda')).toBe('510k');
    expect(estarFilingType('denovo', 'fda')).toBe('de_novo');
    expect(estarFilingType('K510', 'FDA')).toBe('510k');
  });

  it.each([
    ['pma', 'fda'], ['mdr', 'ema'], ['ivdr', 'ema'], ['cer', 'ema'], ['ind', 'fda'], ['k510', 'ema'], ['denovo', null], [null, 'fda'],
  ])('none for %s:%s, where the pack\'s flag stays the rule', (docType, agency) => {
    expect(estarFilingType(docType, agency)).toBeNull();
  });
});

describe('estarDeviceAnswers: the device answers are read once, and only when a document needs them', () => {
  const K510_DOC = { doc_type: 'k510', agency: 'fda' };
  const PMA_DOC = { doc_type: 'pma', agency: 'fda' };

  it('a project with a 510(k) or De Novo document: one read, whatever else it holds', async () => {
    const read = vi.fn(async () => ALL_NO);
    await expect(estarDeviceAnswers([PMA_DOC, K510_DOC, { doc_type: 'denovo', agency: 'fda' }], 'device', read))
      .resolves.toEqual({ variant: 'device', flags: ALL_NO });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a project with none: the answers are not read', async () => {
    const read = vi.fn(async () => ALL_NO);
    await expect(estarDeviceAnswers([PMA_DOC, { doc_type: 'mdr', agency: 'ema' }], 'device', read))
      .resolves.toEqual({ variant: 'device', flags: undefined });
    await expect(estarDeviceAnswers([], 'device', read)).resolves.toEqual({ variant: 'device', flags: undefined });
    expect(read).not.toHaveBeenCalled();
  });

  it('never answered stays never answered', async () => {
    await expect(estarDeviceAnswers([K510_DOC], 'device', async () => undefined)).resolves.toEqual({ variant: 'device', flags: undefined });
  });

  it('a read that fails is thrown on, not read as never answered', async () => {
    await expect(estarDeviceAnswers([K510_DOC], 'device', async () => { throw new Error('connection terminated'); }))
      .rejects.toThrow('connection terminated');
  });

  it.each([['ivd', 'ivd'], ['device', 'device'], ['service', 'device'], [null, 'device'], [undefined, 'device']] as const)(
    'the %s view selects the %s slot registry', async (view, variant) => {
      expect((await estarDeviceAnswers([K510_DOC], view, async () => ALL_NO)).variant).toBe(variant);
    },
  );
});

describe('the shipped 510(k) outline, by device', () => {
  /* D6 (risk management) moved from ALWAYS to WHEN_APPLICABLE on 2026-11-10 (P-123): FDA's eSTAR asks for it in a
     Special 510(k) and hides it in a Traditional or Abbreviated one, and the mapper now says so. */
  const ALWAYS = ['A1', 'A5', 'A6', 'A9', 'B', 'B1', 'B2', 'C', 'C1', 'C2', 'D', 'D2', 'E1', 'E5', 'E6', 'E7'];
  const WHEN_APPLICABLE = ['A4', 'A7', 'D3', 'D6', 'E4', 'E8'];
  const PACK = ['A', 'A2', 'A3', 'B3', 'D1', 'E', 'F', 'F1', 'G', 'G1', 'G2'];

  it('device questions never answered: the conditional sections are not decided', () => {
    expect(ledger(ask('510k', K510, undefined))).toEqual({
      required: ALWAYS,
      undetermined: ['A8', 'D4', 'D5', 'E2', 'E3'],
      whenApplicable: WHEN_APPLICABLE,
      notApplicable: [],
      notRequired: [],
      pack: PACK,
    });
  });

  it('every question answered no', () => {
    expect(ledger(ask('510k', K510, ALL_NO))).toEqual({
      required: ALWAYS,
      undetermined: [],
      whenApplicable: WHEN_APPLICABLE,
      // Finished content here would contradict the answer.
      notApplicable: ['A8', 'D4', 'E2'],
      // Shelf life (D5) and cybersecurity documentation (E3) contradict nothing: the mapper's `contradicts`.
      notRequired: ['D5', 'E3'],
      pack: PACK,
    });
  });

  it('every question answered yes', () => {
    expect(ledger(ask('510k', K510, ALL_YES))).toEqual({
      required: ['A1', 'A5', 'A6', 'A8', 'A9', 'B', 'B1', 'B2', 'C', 'C1', 'C2', 'D', 'D2', 'D4', 'D5', 'E1', 'E2', 'E3', 'E5', 'E6', 'E7'],
      undetermined: [],
      whenApplicable: WHEN_APPLICABLE,
      notApplicable: [],
      notRequired: [],
      pack: PACK,
    });
  });

  it.each([
    ['sterile', ['D4', 'D5']],
    ['softwareAiMl', ['E2']],
    ['cyberDevice', ['E3']],
    ['clinicalData', ['A8']],
    // The outline has no section for these three; the slot is reported unplaced instead.
    ['combinationProduct', []],
    ['implantable', []],
    ['cliaWaived', []],
  ] as const)('answering yes to %s makes exactly %j required', (flag, keys) => {
    const no = ask('510k', K510, ALL_NO);
    const yes = ask('510k', K510, answered([flag]));
    const moved = yes.sections.filter((s) => s.requirement !== no.byKey.get(s.key)!.requirement);
    expect(moved.map((s) => s.key)).toEqual(keys);
    for (const s of moved) expect(s.requirement).toBe('required');
  });
});

describe('the shipped De Novo outline, by device', () => {
  it('device questions never answered', () => {
    expect(ledger(ask('de_novo', DENOVO, undefined))).toEqual({
      required: ['A1', 'A2', 'A4', 'A7', 'B', 'B1', 'C1', 'C3', 'D', 'D1', 'D2', 'E', 'E1', 'E2', 'F'],
      undetermined: ['A5', 'D3', 'D4', 'D5'],
      whenApplicable: ['A6', 'D6', 'D9'],
      notApplicable: [],
      notRequired: [],
      pack: ['A', 'A3', 'B2', 'B3', 'C', 'C2', 'C4', 'D7', 'D8', 'G', 'G1'],
    });
  });

  it('a sterile cyber device with clinical data, nothing else', () => {
    const r = ledger(ask('de_novo', DENOVO, answered(['sterile', 'cyberDevice', 'clinicalData'])));
    expect(r.required).toEqual(['A1', 'A2', 'A4', 'A5', 'A7', 'B', 'B1', 'C1', 'C3', 'D', 'D1', 'D2', 'D3', 'D5', 'E', 'E1', 'E2', 'F']);
    expect(r.notApplicable).toEqual(['D4']);
    expect(r.undetermined).toEqual([]);
  });
});

describe('the outline is read as readiness reads it', () => {
  /* Readiness projects a governed section through
     sectionsToLeaves(governedSectionsToDeviceSections(row)). This module builds
     the same leaf from the outline's key and label. If the two ever differ, a
     section would be required here and not counted there. */
  it.each([
    ['510k', K510],
    ['de_novo', DENOVO],
  ] as const)('%s: each section supplies the slots it supplies when authored alone', (type, pack) => {
    const r = ask(type, pack, ALL_YES);
    for (const node of pack) {
      const alone = mapToEstar({
        type, flags: ALL_YES,
        leaves: sectionsToLeaves(governedSectionsToDeviceSections([
          { section_key: node.key, label: node.label, status: 'approved', content: { text: 'Finished section text. '.repeat(10) } },
        ])),
      });
      const lit = alone.sections.filter((s) => s.present).map((s) => s.id);
      const answer = r.byKey.get(node.key)!;
      expect(answer.decidedBy, node.key).toBe(lit.length > 0 ? 'mapper' : 'pack');
      if (lit.length > 0) expect(lit, node.key).toContain(answer.slotId);
      else expect(answer.slotId, node.key).toBeUndefined();
    }
  });

  it('the document type of a label is the one the matchers compare', () => {
    expect(leafDocumentType('Device description')).toBe('device_description');
    expect(leafDocumentType('Package label and physician / patient labeling')).toBe('package_label_and_physician_patient_labeling');
    expect(leafDocumentType('  ')).toBeUndefined();
    expect(leafDocumentType(null)).toBeUndefined();
  });
});

describe('a slot several sections supply is one requirement', () => {
  it('names the sections that supply it, and blocks each while all are empty', () => {
    const r = ask('510k', K510, answered(['sterile']));
    for (const key of ['D4', 'D5']) {
      const s = r.byKey.get(key)!;
      expect(s.slotId).toBe('sterilization');
      expect(s.suppliedBy).toEqual(['D4', 'D5']);
      expect(s.mark).toBe('Required: one of D4, D5');
      expect(s.blocker).toBe('Mandatory section — no content yet in D4 or D5');
    }
    expect(r.byKey.get('E6')!.mark).toBe('Required: one of E5, E6, E7');
    expect(r.byKey.get('E6')!.blocker).toBe('Mandatory section — no content yet in E5, E6 or E7');
  });

  it('content in any one of them clears the blocker on all', () => {
    const r = ask('510k', K510, answered(['sterile']), ['D5', 'E7']);
    for (const key of ['D4', 'D5', 'E5', 'E6', 'E7']) expect(r.byKey.get(key)!.blocker, key).toBeNull();
    // The mark does not change: the requirement is still the slot's.
    expect(r.byKey.get('D4')!.mark).toBe('Required: one of D4, D5');
  });

  it('a heading that holds sections is not offered as a choice, but its content counts, as in readiness', () => {
    // "B Device description" and "B1 Device description and principles of operation" both supply device-description.
    const empty = ask('510k', K510, ALL_NO).byKey.get('B1')!;
    expect(empty.suppliedBy).toEqual(['B', 'B1']);
    expect(empty.mark).toBe('Required');
    expect(empty.blocker).toBe('Mandatory section — no content yet');
    expect(ask('510k', K510, ALL_NO, ['B']).byKey.get('B1')!.blocker).toBeNull();
  });
});

describe('the words a reader shows', () => {
  const no = ask('510k', K510, ALL_NO);
  const yes = ask('510k', K510, ALL_YES);
  const unanswered = ask('510k', K510, undefined);

  it('required of every filing', () => {
    expect(no.byKey.get('A1')).toMatchObject({
      decidedBy: 'mapper', requirement: 'required', slotId: 'cover-letter', mark: 'Required',
      reason: 'required of every 510(k)', blocker: 'Mandatory section — no content yet',
    });
    expect(ask('de_novo', DENOVO, ALL_NO).byKey.get('C3')!.reason).toBe('required of every De Novo request');
  });

  it('required by a device answer', () => {
    expect(yes.byKey.get('E2')).toMatchObject({
      requirement: 'required', slotId: 'software', mark: 'Required',
      reason: 'required: the project answered yes to “Software / AI-ML”', blocker: 'Mandatory section — no content yet',
    });
  });

  it('not decided: the question has no answer, and that blocks until the section holds content', () => {
    expect(unanswered.byKey.get('E3')).toMatchObject({
      requirement: 'undetermined', mark: 'Not decided',
      reason: 'not decided: the project has not answered “Cyber device”',
      blocker: 'Not decided — the project has not answered “Cyber device”',
    });
    expect(ask('510k', K510, undefined, ['E3']).byKey.get('E3')!.blocker).toBeNull();
  });

  it('when applicable: a property the intake does not ask, reported and never blocking', () => {
    expect(no.byKey.get('D3')).toMatchObject({
      requirement: 'when-applicable', mark: 'When applicable', reason: 'required when the device is reusable', blocker: null,
    });
  });

  it('not applicable: the answer was no, and content here would contradict it', () => {
    expect(no.byKey.get('D4')).toMatchObject({
      requirement: 'not-applicable', mark: 'Not applicable',
      reason: 'not applicable: the project answered no to “Sterile”', blocker: null,
    });
  });

  it('optional: the answer was no, and content here contradicts nothing', () => {
    expect(no.byKey.get('D5')).toMatchObject({
      decidedBy: 'mapper', requirement: 'not-required', mark: 'Optional',
      reason: 'not required: the project answered no to “Sterile”', blocker: null,
    });
  });

  it('no section whose question is unanswered reads optional or not applicable', () => {
    for (const s of unanswered.sections.filter((x) => x.requirement === 'undetermined')) {
      expect(s.mark, s.key).toBe('Not decided');
    }
    expect(unanswered.sections.filter((s) => s.decidedBy === 'mapper' && ['Optional', 'Not applicable'].includes(s.mark))).toEqual([]);
  });
});

describe('a section no slot takes keeps its pack\'s flag', () => {
  it('mandatory in the pack: required, and blocks while empty', () => {
    expect(ask('510k', K510, ALL_NO).byKey.get('A2')).toEqual({
      key: 'A2', decidedBy: 'pack', requirement: 'required', suppliedBy: ['A2'],
      mark: 'Required', reason: 'mandatory section', blocker: 'Mandatory section — no content yet',
    });
    expect(ask('510k', K510, ALL_NO, ['A2']).byKey.get('A2')!.blocker).toBeNull();
  });

  it('optional in the pack', () => {
    expect(ask('510k', K510, ALL_NO).byKey.get('G1')).toEqual({
      key: 'G1', decidedBy: 'pack', requirement: 'not-required', suppliedBy: ['G1'],
      mark: 'Optional', reason: '', blocker: null,
    });
  });

  it('the mandatory sections still decided by the pack are these', () => {
    const held = (pack: PackNode[], r: EstarOutlineRequirements) =>
      r.sections.filter((s) => s.decidedBy === 'pack' && s.requirement === 'required' && !pack.some((n) => n.parent_key === s.key)).map((s) => s.key);
    expect(held(K510, ask('510k', K510, ALL_NO))).toEqual(['A2', 'B3']);
    expect(held(DENOVO, ask('de_novo', DENOVO, ALL_NO))).toEqual(['B2', 'C2', 'C4']);
  });
});

describe('slots the outline has no section for are reported, not dropped', () => {
  const ids = (r: EstarOutlineRequirements) => r.unplaced.map((u) => `${u.slotId}:${u.applicability}`);

  it('510(k): the three flag-decided slots, as the device answers them', () => {
    expect(ids(ask('510k', K510, ALL_NO))).toEqual([]);
    expect(ids(ask('510k', K510, undefined))).toEqual([
      'combination-product:undetermined', 'implant-labeling:undetermined', 'clia-waiver:undetermined',
    ]);
    expect(ids(ask('510k', K510, answered(['implantable'])))).toEqual(['implant-labeling:required']);
    expect(ask('510k', K510, answered(['implantable'])).unplaced[0].label).toBe('Implant-specific labeling and long-term performance');
  });

  it('an IVD 510(k): analytical performance is required and the generic outline has no section for it', () => {
    const r = ask('510k', K510, ALL_NO, [], 'ivd');
    expect(r.variant).toBe('ivd');
    expect(ids(r)).toContain('ivd-analytical-performance:required');
    expect(ids(ask('510k', K510, ALL_NO, [], 'device'))).not.toContain('ivd-analytical-performance:required');
  });

  it('De Novo: reprocessing and the Class III certification have no section', () => {
    expect(ids(ask('de_novo', DENOVO, ALL_NO))).toEqual(['reprocessing:when-applicable', 'class-iii-certification:when-applicable']);
  });
});

describe('inputs', () => {
  it('no sections: no answers', () => {
    const r = estarOutlineRequirements({ type: '510k', flags: ALL_NO, sections: [] });
    expect(r.sections).toEqual([]);
    expect(r.byKey.size).toBe(0);
    expect(r.variant).toBe('device');
  });

  it('a section with no key is not answered; a section with no label is read by its key', () => {
    const r = estarOutlineRequirements({
      type: '510k', flags: ALL_NO,
      sections: [{ key: '', label: 'Cover letter' }, { key: 'Cover letter' }, { key: 'X1', label: null, mandatory: true }],
    });
    expect(r.sections.map((s) => s.key)).toEqual(['Cover letter', 'X1']);
    expect(r.byKey.get('Cover letter')!.slotId).toBe('cover-letter');
    expect(r.byKey.get('X1')).toMatchObject({ decidedBy: 'pack', mark: 'Required' });
  });

  it('content is absent unless the reader says it is there', () => {
    const r = estarOutlineRequirements({ type: '510k', flags: ALL_NO, sections: [{ key: 'A1', label: 'Cover letter' }] });
    expect(r.byKey.get('A1')!.blocker).toBe('Mandatory section — no content yet');
  });
});
