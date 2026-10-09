/**
 * The IRB package manifest.
 *
 * Most of these tests exist for one branch: a requirement the submission does
 * not record enough to judge must come back `undetermined`, never
 * `not_required`. The asymmetry is deliberate and it is a safety property — a
 * board that receives a package missing Form FDA 1572 because nobody recorded
 * that the study runs under an IND has a real problem, and it would be a
 * problem this engine caused by reading an unrecorded field as "no".
 */
import { describe, it, expect } from 'vitest';

import {
  buildPackageManifest,
  expectationsFor,
  type PackageContext,
  type PlacedArtifact,
} from '../package-manifest';
import { IRB_SLOT_CODES } from '../../../../shared/regulatory/placement-vocabulary';

function ctx(over: Partial<PackageContext> = {}): PackageContext {
  return { riskLevel: 'minimal', ...over };
}

function placed(slot: string, over: Partial<PlacedArtifact> = {}): PlacedArtifact {
  return { slot, leafId: 1, title: 'A document', resolvable: true, ...over };
}

function rowFor(manifest: ReturnType<typeof buildPackageManifest>, slot: string) {
  return manifest.rows.find((r) => r.slot === slot);
}

// ─── Absent is never "no" ────────────────────────────────────────────────────

describe('an unrecorded condition is undetermined, not not-required', () => {
  it('cannot decide the 1572 or financial disclosure when IND status is unrecorded', () => {
    const m = buildPackageManifest(ctx(), []);

    for (const slot of ['irb.form-1572', 'irb.financial-disclosure']) {
      const row = rowFor(m, slot);
      expect(row?.requirement).toBe('undetermined');
      expect(row?.settledBy).toBe('isIndStudy');
      expect(row?.basis).toMatch(/not a record that it does not apply/);
    }
  });

  it('cannot decide assent when child involvement is unrecorded', () => {
    const row = rowFor(buildPackageManifest(ctx(), []), 'irb.assent');
    expect(row?.requirement).toBe('undetermined');
    expect(row?.settledBy).toBe('involvesChildren');
  });

  it('takes it out of scope only on a RECORDED false', () => {
    const m = buildPackageManifest(ctx({ involvesChildren: false, isIndStudy: false, usesPhi: false }), []);

    expect(rowFor(m, 'irb.assent')?.requirement).toBe('not_required');
    expect(rowFor(m, 'irb.form-1572')?.requirement).toBe('not_required');
    expect(rowFor(m, 'irb.hipaa-authorization')?.requirement).toBe('not_required');
  });

  it('requires it on a recorded true, and says which fact made it so', () => {
    const m = buildPackageManifest(ctx({ involvesChildren: true, isIndStudy: true }), []);

    expect(rowFor(m, 'irb.assent')?.requirement).toBe('conditional');
    expect(rowFor(m, 'irb.assent')?.basis).toMatch(/records that children are involved/);
    expect(rowFor(m, 'irb.form-1572')?.requirement).toBe('conditional');
  });

  it('cannot decide the monitoring plan when no risk level is recorded', () => {
    const row = rowFor(buildPackageManifest({ riskLevel: null }, []), 'irb.safety-monitoring-plan');
    expect(row?.requirement).toBe('undetermined');
    expect(row?.settledBy).toBe('riskLevel');
  });

  it('demands a monitoring plan only above minimal risk', () => {
    expect(rowFor(buildPackageManifest(ctx({ riskLevel: 'greater_than_minimal' }), []), 'irb.safety-monitoring-plan')?.requirement).toBe('conditional');
    expect(rowFor(buildPackageManifest(ctx({ riskLevel: 'minimal' }), []), 'irb.safety-monitoring-plan')?.requirement).toBe('optional');
  });
});

// ─── A requested waiver is not a granted one ─────────────────────────────────

describe('consent', () => {
  it('still expects the consent document when a waiver has only been REQUESTED', () => {
    const row = rowFor(buildPackageManifest(ctx({ consentWaiverRequested: true }), []), 'irb.consent');

    expect(row?.requirement).toBe('required');
    expect(row?.basis).toMatch(/not a waiver granted/);
  });

  it('expects it as a matter of course otherwise', () => {
    expect(rowFor(buildPackageManifest(ctx(), []), 'irb.consent')?.requirement).toBe('required');
  });
});

// ─── A placeholder is not a document ─────────────────────────────────────────

describe('placement', () => {
  it('does not count a leaf that names no resolvable document as satisfying a slot', () => {
    const m = buildPackageManifest(ctx(), [placed('irb.protocol', { resolvable: false })]);
    const row = rowFor(m, 'irb.protocol');

    expect(row?.placed).toHaveLength(1);
    expect(row?.satisfied).toBe(false);
    expect(row?.unresolvable).toBe(1);
    expect(m.counts.unresolvable).toBe(1);
  });

  it('counts a resolvable placement as satisfying it', () => {
    const m = buildPackageManifest(ctx(), [placed('irb.protocol')]);
    expect(rowFor(m, 'irb.protocol')?.satisfied).toBe(true);
    expect(m.counts.requiredSatisfied).toBe(1);
  });

  it('reports a placement at a slot no expectation covers, rather than ignoring it', () => {
    const m = buildPackageManifest(ctx(), [placed('irb.other-thing')]);

    expect(m.unexpectedSlots).toEqual(['irb.other-thing']);
    expect(m.counts.unexpected).toBe(1);
  });

  it('orders multiple placements at one slot by leaf id, deterministically', () => {
    const m = buildPackageManifest(ctx(), [placed('irb.consent', { leafId: 9 }), placed('irb.consent', { leafId: 2 })]);
    expect(rowFor(m, 'irb.consent')?.placed.map((p) => p.leafId)).toEqual([2, 9]);
  });
});

// ─── Readiness ───────────────────────────────────────────────────────────────

describe('readyToAssemble', () => {
  /** Everything recorded, so nothing is undetermined. */
  const decided = ctx({
    riskLevel: 'minimal',
    involvesChildren: false,
    isIndStudy: false,
    usesPhi: false,
    usesRecruitmentMaterial: false,
  });

  function satisfyAll(context: PackageContext): PlacedArtifact[] {
    return expectationsFor(context)
      .filter((e) => e.requirement === 'required' || e.requirement === 'conditional')
      .map((e, i) => placed(e.slot, { leafId: i + 1 }));
  }

  it('is true when every required and conditional slot carries a resolvable document', () => {
    const m = buildPackageManifest(decided, satisfyAll(decided));

    expect(m.counts.undetermined).toBe(0);
    expect(m.readyToAssemble).toBe(true);
  });

  /*
   * The point of the whole module. Everything a board asked for is present and
   * resolvable, and the package is still NOT ready, because nobody recorded
   * whether this is an IND study. "We could not tell" is not a finished
   * package, and a readiness flag that ignored it would be the reassuring lie.
   */
  it('is FALSE while anything is undetermined, even with every placed slot satisfied', () => {
    const unknown = ctx({ isIndStudy: null, involvesChildren: false, usesPhi: false, usesRecruitmentMaterial: false });
    const m = buildPackageManifest(unknown, satisfyAll(unknown));

    expect(m.counts.required).toBe(m.counts.requiredSatisfied);
    expect(m.counts.conditional).toBe(m.counts.conditionalSatisfied);
    expect(m.counts.undetermined).toBeGreaterThan(0);
    expect(m.readyToAssemble).toBe(false);
  });

  it('is false while any placement is unresolvable', () => {
    const all = satisfyAll(decided);
    all[0] = { ...all[0], resolvable: false };

    expect(buildPackageManifest(decided, all).readyToAssemble).toBe(false);
  });

  it('is false on an empty package', () => {
    expect(buildPackageManifest(decided, []).readyToAssemble).toBe(false);
  });
});

// ─── The slot vocabulary is the one the packager uses ────────────────────────

describe('slots', () => {
  it('draws every expectation from the declared IRB slot list', () => {
    for (const e of expectationsFor(ctx())) {
      expect(IRB_SLOT_CODES).toContain(e.slot);
    }
  });

  it('gives every expectation a basis, so no requirement is unexplained', () => {
    for (const e of expectationsFor(ctx())) expect(e.basis.length).toBeGreaterThan(20);
  });

  it('names a settling field on every undetermined row and on no other', () => {
    const rows = buildPackageManifest(ctx({ riskLevel: null }), []).rows;
    for (const r of rows) {
      if (r.requirement === 'undetermined') expect(r.settledBy).toBeTruthy();
      else expect(r.settledBy).toBeUndefined();
    }
  });

  it('is deterministic', () => {
    const a = JSON.stringify(buildPackageManifest(ctx(), [placed('irb.consent')]));
    expect(JSON.stringify(buildPackageManifest(ctx(), [placed('irb.consent')]))).toBe(a);
  });
});
