/**
 * A market assessment assesses THAT market, for THIS program's filing, or it
 * refuses.
 *
 * ── THE DEFECT THESE PIN ────────────────────────────────────────────────────
 * Before `report-engine.ts`, POST /runs answered every market-named report type
 * with the Executive Readiness Digest under that market's heading (QA
 * 2026-10-08, j8). The fix was to refuse every type no engine computed. This
 * engine computes four of them, which re-opens the same risk one level down: a
 * report titled "FDA NDA / BLA Filing Readiness" computed for a program
 * recorded as an EU MAA would be the j8 defect with one more step of
 * indirection — a market readiness nothing assessed for that market.
 *
 * So the cases below are, in order: it refuses another market's filing; it
 * refuses a program with no recorded filing; it refuses a kind the Module 1
 * record does not model; it refuses a type whose declared region moved away
 * from its binding; it reports coverage as NOT ASSESSED rather than as every
 * heading missing when nothing records a CTD code; and only then, it computes.
 *
 * @module server/services/report-os/regional/__tests__/filing-readiness
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());

vi.mock('../../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { computeRegionalRun, RegionalNotComputed } from '../filing-readiness';
import { REGIONAL_FILING_TYPES, REGION_TO_JURISDICTION } from '../filing-types';
import { MODELED_JURISDICTIONS, REGIONAL_MODULE1 } from '../../../../../shared/regulatory/regional-module1';
import { GLOBAL_REPORT_TYPE_SEED } from '../../taxonomy-global';
import { REPORT_TYPE_SEED } from '../../taxonomy';

/** The registry row for a type, as `readDeclared` reads it. */
const typeRow = (region: string, deps: string[] = ['module_completeness', 'section_status']) => ({
  rows: [{ label: 'A market report', governance_requirements: { region }, data_dependencies: deps }],
});

/**
 * A fake `pool` that answers by the table each statement names. `sections` and
 * `concept2cure_artifacts` default to empty, which is the not-assessed case.
 */
function stub(opts: {
  type?: { rows: unknown[] };
  project?: Record<string, unknown> | null;
  sections?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  rulePacks?: Array<Record<string, unknown>>;
}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('report_type_registry')) return opts.type ?? typeRow('USA_FDA');
    if (sql.includes('FROM projects')) return { rows: opts.project ? [opts.project] : [] };
    if (sql.includes('FROM sections')) return { rows: opts.sections ?? [] };
    if (sql.includes('concept2cure_artifacts')) return { rows: opts.artifacts ?? [] };
    if (sql.includes('c2c_rule_packs')) {
      return { rows: opts.rulePacks ?? [{ doc_type: 'nda', agency: 'fda', version: '1', label: 'FDA NDA pack' }] };
    }
    throw new Error(`unstubbed query: ${sql}`);
  });
}

const FDA_NDA = 'usa_fda.nda_bla_filing_readiness';
const EMA_MAA = 'ema.maa_readiness_assessment';

beforeEach(() => {
  query.mockReset();
});

describe('the engine only ever reads a Module 1 tree the record actually has', () => {
  it('every listed kind is one its jurisdiction models, so no type can ask for a tree that does not exist', () => {
    for (const [typeId, binding] of Object.entries(REGIONAL_FILING_TYPES)) {
      const modelled = REGIONAL_MODULE1[binding.jurisdiction].kinds;
      for (const kind of binding.kinds) {
        expect(modelled, `${typeId} names ${kind}`).toContain(kind);
      }
    }
  });

  it('lists no jurisdiction outside the three the record models', () => {
    for (const binding of Object.values(REGIONAL_FILING_TYPES)) {
      expect(MODELED_JURISDICTIONS).toContain(binding.jurisdiction);
    }
  });
});

describe('the bindings agree with the governed type definitions', () => {
  const declaredRegionOf = (typeId: string): string | undefined => {
    const all = [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED];
    const found = all.find((t) => t.typeId === typeId);
    const gov = (found?.governanceRequirements ?? {}) as { region?: unknown };
    return typeof gov.region === 'string' ? gov.region : undefined;
  };

  it("each type's declared region is the market its binding reads", () => {
    for (const [typeId, binding] of Object.entries(REGIONAL_FILING_TYPES)) {
      const region = declaredRegionOf(typeId);
      expect(region, `${typeId} is in the taxonomy`).toBeDefined();
      expect(REGION_TO_JURISDICTION[region!], `${typeId} declares ${region}`).toBe(binding.jurisdiction);
    }
  });

  /* The run-time assertion catches a drift one run at a time, after the type is
     already being offered. This catches it in CI: the DEPLOYED registry row is
     what `readDeclared` reads in production, and the seed is what deploys. */
  it("each type's region in the deployed seed is the same market", () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../../migrations/20260930_report_type_registry_seed.sql'),
      'utf8',
    );
    for (const [typeId, binding] of Object.entries(REGIONAL_FILING_TYPES)) {
      const at = sql.indexOf(`('${typeId}'`);
      expect(at, `${typeId} is seeded`).toBeGreaterThan(-1);
      const region = /"region":"([A-Z_]+)"/.exec(sql.slice(at, at + 2000))?.[1];
      expect(REGION_TO_JURISDICTION[region ?? ''], `${typeId} is seeded as ${region}`).toBe(binding.jurisdiction);
    }
  });
});

describe('it refuses rather than assess the wrong thing', () => {
  it("does not assess an FDA filing readiness for a program recorded as an EU MAA (the j8 defect, one level down)", async () => {
    stub({ project: { metadata: { registryId: 'EU_MAA' } } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(RegionalNotComputed);
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      /assesses a US filing. This program is recorded as/,
    );
  });

  it('does not assess an EMA readiness for a program recorded as a US NDA either', async () => {
    stub({ type: typeRow('EU_EMA'), project: { metadata: { registryId: 'US_NDA' } } });
    await expect(computeRegionalRun(EMA_MAA, 3, 'project', '11')).rejects.toThrow(
      /assesses a EU filing/,
    );
  });

  it('refuses a program that records no filing, rather than picking one', async () => {
    stub({ project: { metadata: {} } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      'Record the program’s filing type before running this market readiness assessment. No market readiness was assessed.',
    );
  });

  it('refuses a filing kind no Module 1 record models — a device filing is not eCTD', async () => {
    stub({ project: { metadata: { registryId: 'US_510K' } } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      /has no Module 1 record here/,
    );
  });

  it("refuses when the type's declared region is not the market this binding reads", async () => {
    // The taxonomy edit case: the type moves to EU_EMA, this module still says US.
    stub({ type: typeRow('EU_EMA'), project: { metadata: { registryId: 'US_NDA' } } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      /declares region EU_EMA, which is not the US Module 1 record/,
    );
  });

  it("refuses a kind the Module 1 record models but this report is not about — an ANDA is not an NDA", async () => {
    // Same jurisdiction (US), same tree, different filing. The kinds check is
    // its own branch: the market matches and the report still does not.
    stub({ project: { metadata: { registryId: 'US_ANDA' } } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      /assesses a nda or bla filing. This program is recorded as/,
    );
  });

  it('refuses a scope that is not one program', async () => {
    stub({ project: { metadata: { registryId: 'US_NDA' } } });
    await expect(computeRegionalRun(FDA_NDA, 3, 'program', '4')).rejects.toThrow(
      /assessed for one program, not for a program scope/,
    );
  });

  it('refuses a program another organization owns, rather than assessing nothing about it', async () => {
    stub({ project: null });
    await expect(computeRegionalRun(FDA_NDA, 3, 'project', '11')).rejects.toThrow(
      /not found in this organization/,
    );
  });
});

describe('it reports what it measured, and says when it measured nothing', () => {
  it('reports coverage as NOT ASSESSED when no section or document records a CTD code', async () => {
    stub({ project: { metadata: { registryId: 'US_NDA' } } });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    const m1 = run.summary.module1 as { assessed: boolean; missingHeadings: unknown; coveredHeadings: unknown; requiredHeadings: number };
    expect(m1.assessed).toBe(false);
    // The defect this exists to prevent: an unrecorded program read as a
    // damning gap list. Nothing is counted as missing, because nothing was
    // matched.
    expect(m1.missingHeadings).toBeNull();
    expect(m1.coveredHeadings).toBeNull();
    expect(run.providers.find((p) => p.provider === 'module1_content')?.status).toBe('missing');
    expect(run.providers.find((p) => p.provider === 'module1_content')?.blocker).toMatch(
      /no section or governed document of this program records a CTD section code/i,
    );
    // And it is not a critical filing blocker: nothing was found to be absent.
    expect(run.criticalBlockers).toEqual([]);
  });

  it('names each required heading with no document, as a critical blocker', async () => {
    // One recorded code, so coverage IS assessed, and everything else is a gap.
    stub({
      project: { metadata: { registryId: 'US_NDA' } },
      sections: [{ section_id: '1.2', metadata: {} }],
    });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    const m1 = run.summary.module1 as { assessed: boolean; requiredHeadings: number; coveredHeadings: number; missingHeadings: Array<{ code: string }> };
    expect(m1.assessed).toBe(true);
    expect(m1.requiredHeadings).toBeGreaterThan(0);
    expect(m1.missingHeadings.length).toBe(m1.requiredHeadings - m1.coveredHeadings);
    for (const gap of m1.missingHeadings) {
      expect(run.criticalBlockers.some((b) => b.includes(gap.code))).toBe(true);
    }
  });

  it('counts a document filed under a child heading as covering its container, and not the reverse', async () => {
    const deep = await (async () => {
      stub({ project: { metadata: { registryId: 'US_NDA' } }, sections: [{ section_id: '1.1.1', metadata: {} }] });
      return computeRegionalRun(FDA_NDA, 3, 'project', '11');
    })();
    const shallow = await (async () => {
      stub({ project: { metadata: { registryId: 'US_NDA' } }, sections: [{ section_id: '1', metadata: {} }] });
      return computeRegionalRun(FDA_NDA, 3, 'project', '11');
    })();
    const codesOf = (r: Awaited<ReturnType<typeof computeRegionalRun>>) =>
      (r.summary.module1 as { missingHeadings: Array<{ code: string }> }).missingHeadings.map((h) => h.code);
    // 1.1.1 covers 1.1; 1 does not cover 1.1.
    expect(codesOf(deep)).not.toContain('1.1');
    expect(codesOf(shallow)).toContain('1.1');
  });

  it('measures no confidence, so the truthfulness gate holds the report below final', async () => {
    stub({ project: { metadata: { registryId: 'US_NDA' } }, sections: [{ section_id: '1.2', metadata: {} }] });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    expect(run.confidence).toBeNull();
  });

  it('discloses every declared dependency it does not compute, as its own provider row', async () => {
    stub({
      type: typeRow('USA_FDA', ['module_completeness', 'section_status', 'question_risk', 'safety_signals']),
      project: { metadata: { registryId: 'US_NDA' } },
      sections: [{ section_id: '1.2', metadata: {} }],
    });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    for (const dep of ['question_risk', 'safety_signals']) {
      const row = run.providers.find((p) => p.provider === dep);
      expect(row, `${dep} is disclosed`).toBeDefined();
      expect(row?.status).toBe('missing');
      expect(row?.blocker).toMatch(/not computed by this assessment/);
    }
    // The one it answers in full is not disclosed at all.
    expect(run.providers.filter((p) => p.provider === 'section_status')).toEqual([]);
  });

  it("does not let a partly-answered dependency read as fully assessed", async () => {
    /* `module_completeness` was first listed as fully computed. A reader of the
       evidence panel sees a dependency absent from the missing list and infers
       it was assessed — so a Module-1-only examination would have read as a
       claim about the whole dossier. */
    stub({
      type: typeRow('USA_FDA', ['module_completeness', 'section_status']),
      project: { metadata: { registryId: 'US_NDA' } },
      sections: [{ section_id: '1.2', metadata: {} }],
    });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    const row = run.providers.find((p) => p.provider === 'module_completeness');
    expect(row, 'module_completeness is disclosed, not silent').toBeDefined();
    expect(row?.status).toBe('partial');
    expect(row?.blocker).toMatch(/Module 1 only/);
    expect(row?.blocker).toMatch(/does not examine Modules 2–5/);
  });

  it("states the market's own line and the specification its heading numbers come from", async () => {
    stub({ project: { metadata: { registryId: 'US_NDA' } }, sections: [{ section_id: '1.2', metadata: {} }] });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    const market = run.summary.market as Record<string, unknown>;
    expect(market.jurisdiction).toBe('US');
    expect(market.applicationKind).toBe('nda');
    expect(typeof market.module1Spec).toBe('string');
    expect(String(market.module1Spec).length).toBeGreaterThan(0);
    // The canonical statement reached the run rather than a sentence written here.
    expect(typeof market.line).toBe('string');
    expect(run.providers.some((p) => p.provider === 'market_support')).toBe(true);
  });

  it('proceeds, and says so, when no rule pack can be read at all', async () => {
    stub({ project: { metadata: { registryId: 'US_NDA' } }, sections: [{ section_id: '1.2', metadata: {} }], rulePacks: [] });
    const run = await computeRegionalRun(FDA_NDA, 3, 'project', '11');
    const row = run.providers.find((p) => p.provider === 'market_support');
    expect(row?.status).toBe('missing');
    expect(row?.blocker).toMatch(/market statement could not be read/);
    // The Module 1 assessment does not depend on the pack, so it still ran.
    expect((run.summary.module1 as { assessed: boolean }).assessed).toBe(true);
  });
});
