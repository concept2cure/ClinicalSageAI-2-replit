/**
 * What AnA tells a client about Japan outside the programmes tools: the PMDA
 * positions of the cross-jurisdictional engine, the PMDA consultation catalogue,
 * the shared meeting-type description and the prompt prose.
 *
 * Until 2026-10-05 the cross-jurisdictional engine said, with no basis, that
 * Japanese bridging data were "mandatory per ICH E5", that a "Japanese standard
 * of care comparator" was "required", that PMDA wanted a "QT study in Japanese
 * subjects", that Japan needed "Zone IVa (hot/humid)" stability conditions, and
 * that Japan had "no mandatory pediatric plan". The PMDA meeting catalogue had
 * two generic rows; the shared meeting type named an "RS Soudankai"; and three
 * prompts named the pre-2025 "conditional early approval".
 *
 * Nothing in this step was read against MHLW, PMDA or ICH text (those hosts are
 * egress-blocked here): every basis is `recall`, shipped labelled
 * (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/DECISIONS.md #26).
 * Facts: g-jp-data-claims-truth-facts.md in the same folder.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { basisProblems, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import { crossJurisdictionalEngine } from '../cross-jurisdictional-intelligence';
import { JP_PROGRAMS, getJpProgram } from '../ind/ctd/jp-programs';
import { MEETING_CATALOG, meetingsForMarket, recommendMeetings } from '../global-ri/ha-meetings';
import { REGULATORY_MEETING_TYPES } from '../../../shared/constants/domain/regulatory-meeting-types';
import { CULTURAL_OVERLAYS, MARKET_BRIEFS, JAPAN_REGULATORY_DEEP_DIVE } from '../ana-ri/locale-overlays';
import { buildDefaultInstructions } from '../regulatory/defaultInstructionBuilder';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';

const REPO = resolve(__dirname, '../../..');

async function analyzeAll() {
  return crossJurisdictionalEngine.analyze({ submissionType: 'NDA', targetAgencies: ['FDA', 'EMA', 'PMDA', 'NMPA'] });
}

function pmdaPosition(result: Awaited<ReturnType<typeof analyzeAll>>, topic: string) {
  const d = result.divergences.find((x) => x.topic === topic);
  if (!d) throw new Error(`no divergence "${topic}"`);
  const p = d.agencies.find((a) => a.agency === 'PMDA');
  if (!p) throw new Error(`no PMDA position under "${topic}"`);
  return p;
}

/** Japan statements with no basis that this step removes; none may come back. */
const UNSOURCED_JP_CLAIMS: RegExp[] = [
  /mandatory per ICH E5/i,
  /comparator required/i,
  /QT study in Japanese subjects/i,
  /Zone IVa/i,
  /requires? (Japanese )?bridging (study )?data/i,
  /still require local data/i,
  /no mandatory (pediatric|paediatric)/i,
  /(pediatric|paediatric) (plan|development) (is )?(but )?encouraged/i,
];

describe('cross-jurisdictional engine — PMDA positions', () => {
  it('states none of the unsourced Japan claims anywhere in its result', async () => {
    const result = await analyzeAll();
    const texts: string[] = [];
    for (const d of result.divergences) {
      for (const a of d.agencies) if (a.agency === 'PMDA') texts.push(a.position);
      texts.push(d.harmonizationGuidance);
    }
    for (const s of result.filingSequences) texts.push(s.rationale, ...s.advantages, ...s.disadvantages);
    const hits = texts.filter((t) => UNSOURCED_JP_CLAIMS.some((re) => re.test(t)));
    expect(hits).toEqual([]);
  });

  it('says Japanese-data needs are case by case under ICH E5, citing the 2023 MHLW notice', async () => {
    const result = await analyzeAll();
    for (const topic of ['Ethnic Sensitivity / Bridging', 'Primary Endpoint Acceptance']) {
      const p = pmdaPosition(result, topic);
      expect(p.position).toMatch(/case by case/i);
      expect(p.position).toContain('ICH E5');
      expect(p.position).toContain('医薬薬審発1225第2号');
      expect(p.position).toMatch(/in principle not required/i);
    }
  });

  it('reads the paediatric position from the jp-programs record', async () => {
    const plan = getJpProgram('jp-pediatric-development-plan');
    const p = pmdaPosition(await analyzeAll(), 'Pediatric Requirements');
    expect(p.position).toContain(plan.name);
    expect(p.position).toContain(plan.nameJa);
    expect(p.position).toContain(plan.effectiveFrom!);
    expect(p.basis).toEqual(plan.basis);
  });

  it('places Japan in the ICH Q1A(R2) long-term conditions, not zone IVa', async () => {
    const p = pmdaPosition(await analyzeAll(), 'Stability Testing Requirements');
    expect(p.position).toContain('ICH Q1A(R2)');
    expect(p.position).toMatch(/zones? I and II/i);
  });

  it('gives every PMDA position a well-formed basis, all labelled recall (no regulator text was read)', async () => {
    const result = await analyzeAll();
    const pmda = result.divergences.flatMap((d) => d.agencies.filter((a) => a.agency === 'PMDA').map((a) => ({ topic: d.topic, ...a })));
    expect(pmda.length).toBeGreaterThan(0);
    const missing = pmda.filter((p) => !p.basis || p.basis.length === 0).map((p) => p.topic);
    expect(missing).toEqual([]);
    for (const p of pmda) {
      for (const b of p.basis as RegulatoryBasis[]) {
        expect(basisProblems(b), `${p.topic}: ${b.ref}`).toEqual([]);
        expect(b.confidence, `${p.topic}: ${b.ref}`).toBe('recall');
      }
      expect(p.guidanceRef, p.topic).toMatch(/not checked|recall|unverified/i);
    }
  });
});

describe('PMDA consultation catalogue (ha-meetings)', () => {
  const consultations = JP_PROGRAMS.filter((p) => p.kind === 'consultation');

  it('has one row per consultation type in the jp-programs record, named as PMDA names it', () => {
    const rows = meetingsForMarket('PMDA');
    for (const c of consultations) {
      const row = rows.find((r) => r.programId === c.id);
      expect(row, c.id).toBeDefined();
      expect(row!.name).toContain(c.nameJa);
      expect(row!.purpose).toBe(c.description);
      expect(row!.basis).toEqual(c.basis);
    }
    expect(rows.every((r) => r.programId && r.basis && r.basis.length > 0)).toBe(true);
    expect(rows.length).toBe(consultations.length);
  });

  it('keeps the two existing codes for compatibility', () => {
    const codes = MEETING_CATALOG.filter((m) => m.market === 'PMDA').map((m) => m.code);
    expect(codes).toEqual(expect.arrayContaining(['pmda_clinical_trial_consultation', 'pmda_pre_nda_consultation']));
    expect(MEETING_CATALOG.find((m) => m.code === 'pmda_clinical_trial_consultation')!.programId).toBe('pmda-consultation-clinical-trial');
    expect(MEETING_CATALOG.find((m) => m.code === 'pmda_pre_nda_consultation')!.programId).toBe('pmda-consultation-pre-application');
  });

  it('recommends the end-of-Phase II consultation at end of Phase II', () => {
    const res = recommendMeetings({ market: 'PMDA', milestone: 'end_of_phase_2' });
    expect(res.recommended.map((m) => m.programId)).toContain('pmda-consultation-end-of-phase-2');
  });
});

describe('the shared PMDA meeting type', () => {
  it('names the RS strategy consultation as PMDA does, not "RS Soudankai"', () => {
    const t = REGULATORY_MEETING_TYPES.find((m) => m.value === 'consultation')!;
    expect(t.description).not.toMatch(/Soudankai/i);
    expect(t.description).toContain('RS戦略相談');
  });
});

describe('prompt prose about Japanese conditional approval', () => {
  const STALE: RegExp[] = [/conditional early approval/i, /条件付き早期承認/, /confirmatory (clinical )?trials? (are|is) difficult/i];

  it('no prompt names the pre-2025 conditional early approval or its criteria', () => {
    const jpInstr = buildDefaultInstructions(getApplicationType('JP_MKT_APPROVAL')!, 'X');
    const prompts = { ja: CULTURAL_OVERLAYS.ja, pmda: MARKET_BRIEFS.pmda, deepDive: JAPAN_REGULATORY_DEEP_DIVE, jpInstr };
    const hits = Object.entries(prompts).flatMap(([k, text]) => STALE.filter((re) => re.test(text)).map((re) => `${k}: ${re}`));
    expect(hits).toEqual([]);
  });

  it('names it as amended in 2025, without restating criteria', () => {
    const jpInstr = buildDefaultInstructions(getApplicationType('JP_MKT_APPROVAL')!, 'X');
    expect(MARKET_BRIEFS.pmda).toContain('conditional approval (amended 2025)');
    expect(jpInstr).toContain('conditional approval (amended 2025)');
    expect(CULTURAL_OVERLAYS.ja).toContain('条件付き承認（2025年改正）');
    expect(JAPAN_REGULATORY_DEEP_DIVE).toMatch(/Conditional approval \(条件付き承認制度, amended 2025\)/);
  });

  it('keeps the Japan conditional-approval and paediatric prose of the migrated engine in jp-programs.ts only', () => {
    const src = readFileSync(resolve(REPO, 'server/services/cross-jurisdictional-intelligence.ts'), 'utf8');
    const PATTERNS = [/Conditional Early Approval/i, /confirmatory (clinical )?trials? (are|is) difficult/i, /no mandatory (pediatric|paediatric)/i, /条件付き/, /小児用医薬品/];
    const lines = src.split('\n').filter((l) => PATTERNS.some((re) => re.test(l)));
    expect(lines).toEqual([]);
  });
});
