/**
 * The one Japanese programmes record (docs/design/ANA_REGULATORY_RECORD.md R13,
 * `jp-programs.ts`): conditional approval as amended by the 2025 PMD Act
 * amendment, SAKIGAKE, orphan, priority review, the paediatric development plan
 * effort obligation and the PMDA consultation types — each with a basis.
 *
 * Until 2026-10-05 four engines each carried their own Japan prose, all of it as
 * the law stood before the amendment and none of it with a basis:
 * expedited-programs.ts ("Confirmatory clinical trials are difficult"),
 * pediatric-requirements.ts ("No mandatory pediatric study plan"),
 * special-designations.ts ("Pediatric development is encouraged") and
 * regulatory-strategy-knowledge.ts ("Conditional Early Approval System").
 * They now read this record, and the grep below keeps the prose out of them.
 *
 * Nothing here has been read against MHLW or PMDA text (both hosts are
 * egress-blocked here), so every basis is `recall` — shipped labelled, per
 * DECISIONS.md #26.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { basisProblems } from '../../../../../shared/regulatory/regulatory-basis';
import { assessDesignationEligibility, getDesignationCriteria } from '../../../global-ri/special-designations';
import { compareGlobalPathways } from '../../../regulatory-strategy/regulatory-strategy-knowledge';

const record = () => import('../jp-programs');
const REPO = resolve(__dirname, '../../../../..');

/**
 * Files whose Japan programme prose moved onto the record in this change. The
 * follow-up step g-jp-data-claims-truth adds cross-jurisdictional-intelligence.ts,
 * ha-meetings.ts and the prompt overlays when it migrates them.
 */
const MIGRATED = [
  'server/services/global-ri/expedited-programs.ts',
  'server/services/global-ri/pediatric-requirements.ts',
  'server/services/global-ri/special-designations.ts',
  'server/services/regulatory-strategy/regulatory-strategy-knowledge.ts',
];

/** Japan paediatric or conditional-approval statements that belong only in jp-programs.ts. */
const LOCAL_PROSE: RegExp[] = [
  /Conditional Early Approval/i,
  /confirmatory (clinical )?trials? (are|is) difficult/i,
  /difficult to conduct (an )?adequate confirmatory/i,
  /no mandatory (pediatric|paediatric|PIP)/i,
  /(pediatric|paediatric) development (is )?encouraged/i,
  /voluntary (pediatric|paediatric) development/i,
  /条件付き/,
  /小児用医薬品/,
  /先駆/,
];

describe('JP_PROGRAMS — the record', () => {
  it('holds each programme once, with the ids the engines read', async () => {
    const { JP_PROGRAMS } = await record();
    const ids = JP_PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'pmda-conditional-approval',
        'pmda-sakigake',
        'pmda-orphan-drug',
        'pmda-priority-review',
        'jp-pediatric-development-plan',
        'pmda-consultation-pre-meeting',
        'pmda-consultation-clinical-trial',
        'pmda-consultation-end-of-phase-2',
        'pmda-consultation-pre-application',
        'pmda-consultation-electronic-data',
        'pmda-consultation-rs-strategy',
        'pmda-consultation-pediatric-plan',
      ]),
    );
  });

  it('names the consultations as PMDA does', async () => {
    const { getJpProgram } = await record();
    expect(getJpProgram('pmda-consultation-pre-meeting').nameJa).toBe('事前面談');
    expect(getJpProgram('pmda-consultation-clinical-trial').nameJa).toBe('治験相談');
    expect(getJpProgram('pmda-consultation-end-of-phase-2').nameJa).toBe('第II相試験終了後相談');
    expect(getJpProgram('pmda-consultation-pre-application').nameJa).toBe('申請前相談');
    expect(getJpProgram('pmda-consultation-electronic-data').nameJa).toBe('医薬品申請電子データ提出確認相談');
    expect(getJpProgram('pmda-consultation-rs-strategy').nameJa).toBe('RS戦略相談');
    expect(getJpProgram('pmda-consultation-pediatric-plan').nameJa).toBe('小児用医薬品開発計画確認相談');
    const all = (await record()).JP_PROGRAMS.map((p) => `${p.name} ${p.nameJa}`).join(' ');
    expect(all).not.toMatch(/Soudankai/i);
  });

  it('every entry has a well-formed basis, and nothing unread is presented as regulator text', async () => {
    const { JP_PROGRAMS, jpProgramProblems } = await record();
    expect(jpProgramProblems()).toEqual([]);
    for (const p of JP_PROGRAMS) {
      expect(p.basis.length, p.id).toBeGreaterThan(0);
      for (const b of p.basis) {
        expect(basisProblems(b), `${p.id}: ${b.ref}`).toEqual([]);
        // The MHLW and PMDA pages were not read in this environment.
        expect(b.confidence, `${p.id}: ${b.ref}`).toBe('recall');
        // Unverified article numbers stay out of citation text.
        expect(b.ref, p.id).not.toMatch(/Art(icle)?\.?\s*14-8-2|69-2|001663251/);
      }
      expect(p.appliesTo.length, p.id).toBeGreaterThan(0);
      expect(p.criteria.length, p.id).toBeGreaterThan(0);
    }
  });

  it('a regulator-text basis must have been checked on or after the date the programme took effect', async () => {
    const { jpProgramProblems, JP_PROGRAMS } = await record();
    const stale = {
      ...JP_PROGRAMS.find((p) => p.id === 'pmda-conditional-approval')!,
      basis: [{ ref: 'MHLW page', confidence: 'regulator-text' as const, url: 'https://www.mhlw.go.jp/x.html', checked: '2026-04-30' }],
    };
    expect(jpProgramProblems([stale]).join(' ')).toMatch(/checked 2026-04-30 is before effectiveFrom 2026-05-01/);
  });

  it('conditional approval is the 2025 system: exploratory-trial stage, revocable, drugs only until read', async () => {
    const { getJpProgram } = await record();
    const p = getJpProgram('pmda-conditional-approval');
    expect(p.effectiveFrom).toBe('2026-05-01');
    expect(p.criteria.some((c) => /exploratory/i.test(c))).toBe(true);
    expect(p.criteria.join(' ')).not.toMatch(/confirmatory (clinical )?trials? (are|is) difficult/i);
    expect((p.conditions ?? []).join(' ')).toMatch(/revoked/i);
    // The device/IVD extension is from search extracts and secondary sources only.
    expect(p.appliesTo).toEqual(['drug']);
    expect(p.basis.map((b) => b.note ?? '').join(' ')).toMatch(/devices and IVDs/);
  });

  it('the paediatric plan is an effort obligation confirmed by PMDA', async () => {
    const { getJpProgram } = await record();
    const p = getJpProgram('jp-pediatric-development-plan');
    expect(p.kind).toBe('obligation');
    expect(p.effectiveFrom).toBe('2026-05-01');
    expect(p.name).toMatch(/effort obligation/i);
    expect(p.nameJa).toMatch(/努力義務/);
    expect(p.timing).toMatch(/PMDA/);
  });

  it('SAKIGAKE keeps the four criteria the matcher screens', async () => {
    const { getJpProgram } = await record();
    expect(getJpProgram('pmda-sakigake').criteria).toHaveLength(4);
  });

  it('getJpProgram throws for an id it does not hold', async () => {
    const { getJpProgram } = await record();
    expect(() => getJpProgram('pmda-conditional-early-approval')).toThrow();
  });
});

describe('readers of the record', () => {
  it('special-designations states the PMDA paediatric duty from the record, not "encouraged"', () => {
    const c = getDesignationCriteria('PMDA');
    expect(`${c.pediatricProgram} ${c.pediatricCriteria}`).not.toMatch(/encouraged/i);
    expect(c.pediatricCriteria).toMatch(/effort obligation/i);
    const r = assessDesignationEligibility({ market: 'PMDA', pediatricDevelopment: true });
    expect(`${r.pediatric!.requirement} ${r.pediatric!.obligation}`).not.toMatch(/encouraged/i);
    expect(r.pediatric!.requirement).toMatch(/effort obligation/i);
  });

  it('the global pathway comparison describes Japan conditional approval as amended', async () => {
    const { getJpProgram } = await record();
    const jp = compareGlobalPathways({ productType: 'small_molecule', indication: 'x', targetMarkets: ['japan'] }).pathways[0];
    const ca = getJpProgram('pmda-conditional-approval');
    expect(jp.conditionalApproval.name).toBe(ca.name);
    expect(jp.conditionalApproval.criteria).toEqual([...ca.criteria]);
    expect(jp.expeditedPathways.map((e) => e.name)).toEqual(
      expect.arrayContaining([ca.name, getJpProgram('pmda-sakigake').name, getJpProgram('pmda-priority-review').name]),
    );
  });

  it('no migrated file carries its own Japan paediatric or conditional-approval prose', () => {
    const hits: string[] = [];
    for (const rel of MIGRATED) {
      const lines = readFileSync(resolve(REPO, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const re of LOCAL_PROSE) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
