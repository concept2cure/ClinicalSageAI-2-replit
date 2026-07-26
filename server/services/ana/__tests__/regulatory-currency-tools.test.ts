/**
 * Regulatory Currency Engine (Lane A) — verifies the two dated-facts tools are
 * (a) registered as AnA tool handlers and (b) return the curated registry's facts
 * with correct status/severity, through the public getToolHandler() seam.
 *
 * This is the currency guard that stops AnA advising on a VOID/stale rule from its
 * static knowledge, so the wiring + the load-bearing facts (LDT void, PMDA eCTD
 * v4.0 mandate, change-radar drift ordering) are guarded against regression.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { REGULATORY_CURRENCY_TOOLS } from '../regulatoryCurrencyTools';

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name} must be registered`).toBeTruthy();
  const raw = await handler!(input, ctx);
  return JSON.parse(raw as string);
}

describe('regulatory-currency tools — registration', () => {
  it('every defined tool has a registered handler', () => {
    for (const tool of REGULATORY_CURRENCY_TOOLS) {
      expect(getToolHandler(tool.name), `${tool.name} handler`).toBeTruthy();
    }
    expect(REGULATORY_CURRENCY_TOOLS).toHaveLength(2);
  });
});

describe('check_regulatory_currency', () => {
  it('returns the LDT fact flagged as void/superseded', async () => {
    const out = await call('check_regulatory_currency', { topic: 'LDT' });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.matchCount).toBeGreaterThan(0);
    const ldt = out.result.facts.find((f: any) => f.id === 'us-ldt-final-rule-void');
    expect(ldt, 'LDT fact must be returned').toBeTruthy();
    expect(ldt.status).toBe('void');
    expect(ldt.supersedes).toBeTruthy();
    expect(ldt.sourceUrl).toContain('federalregister.gov');
    expect(ldt.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retrieves the PMDA eCTD v4.0 mandate for jurisdiction=JP', async () => {
    const out = await call('check_regulatory_currency', { jurisdiction: 'JP' });
    expect(out.status).toBe('computed');
    const pmda = out.result.facts.find((f: any) => f.id === 'pmda-ectd-v4-mandatory');
    expect(pmda, 'PMDA eCTD v4.0 fact must be returned for JP').toBeTruthy();
    expect(pmda.jurisdiction).toBe('JP');
    expect(pmda.effectiveDate).toBe('2026-04-01');
    /* This asserted 'mandatory_upcoming' — the stored value — which was
       already wrong by the time it ran: the mandate took effect on
       2026-04-01. The tool now resolves statuses against today, so a
       future obligation is reported as in force once its date arrives.
       The assertion is stable because the promotion is monotonic: a date
       that has passed does not un-pass. */
    expect(pmda.status).toBe('in_force');
    // Every returned JP fact must actually be JP.
    expect(out.result.facts.every((f: any) => f.jurisdiction === 'JP')).toBe(true);
  });

  it('returns a clean empty result for an unknown topic (does not throw)', async () => {
    const out = await call('check_regulatory_currency', { topic: 'no-such-topic-xyzzy' });
    expect(out.status).toBe('computed');
    expect(out.result.matchCount).toBe(0);
    expect(out.result.facts).toEqual([]);
  });
});

describe('guidance_change_radar', () => {
  it('surfaces drift after an early draftedOn with void_rule ranked highest', async () => {
    const out = await call('guidance_change_radar', { draftedOn: '2023-01-01' });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.driftCount).toBeGreaterThan(0);

    const drifts = out.result.drifts as Array<{ severity: string; severityRank: number; fact: any }>;
    // Severity ranks are non-increasing (most-urgent first).
    for (let i = 1; i < drifts.length; i++) {
      expect(drifts[i - 1].severityRank).toBeGreaterThanOrEqual(drifts[i].severityRank);
    }
    // The void LDT rule must be present and carry the highest severity.
    expect(out.result.highestSeverity).toBe('void_rule');
    expect(drifts[0].severity).toBe('void_rule');
    const ldt = drifts.find((d) => d.fact.id === 'us-ldt-final-rule-void');
    expect(ldt, 'void LDT rule must appear as drift').toBeTruthy();
    expect(ldt!.severity).toBe('void_rule');
  });

  it('only flags facts effective AFTER draftedOn', async () => {
    // The FDA 510(k) eSTAR mandate took effect 2023-10-01; a later draft excludes it.
    const out = await call('guidance_change_radar', { draftedOn: '2024-01-01' });
    expect(out.status).toBe('computed');
    const ids = (out.result.drifts as any[]).map((d) => d.fact.id);
    expect(ids).not.toContain('fda-estar-510k-mandatory');
    // The 2026 PMDA mandate is still future relative to the draft, so it surfaces.
    expect(ids).toContain('pmda-ectd-v4-mandatory');
  });

  it('returns a clean empty result for an unmatched topic (does not throw)', async () => {
    const out = await call('guidance_change_radar', { topics: ['no-such-topic-xyzzy'] });
    expect(out.status).toBe('computed');
    expect(out.result.driftCount).toBe(0);
    expect(out.result.highestSeverity).toBeNull();
    expect(out.result.drifts).toEqual([]);
  });
});
