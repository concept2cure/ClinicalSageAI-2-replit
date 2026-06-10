/**
 * Tests for intent-based tool selection. Exercised against the REAL enabled-tool
 * surface so the guarantees hold on the live catalog, not a fixture.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { selectToolsForTurn, ALWAYS_ON_TOOLS, getToolCatalog, categorizeTool } from '../tool-selection';
import { getAllEnabledTools } from '../AnaToolDefinitions';

const ALL = getAllEnabledTools();
const names = (tools: Array<{ name?: string }>) => new Set(tools.map(t => t.name));

afterEach(() => {
  delete process.env.ANA_TOOL_SELECTION_DISABLED;
});

describe('selectToolsForTurn', () => {
  it('always includes the platform command bridge — nothing is ever out of reach', () => {
    const sel = selectToolsForTurn(ALL, 'totally unrelated chit-chat about the weather', { maxTools: 20 });
    const n = names(sel);
    expect(n.has('list_platform_commands')).toBe(true);
    expect(n.has('execute_platform_command')).toBe(true);
  });

  it('always includes the core search/guidance/authoring tools', () => {
    const n = names(selectToolsForTurn(ALL, 'hello', { maxTools: 20 }));
    for (const core of ['project_knowledge_search', 'generate_document', 'lookup_fda_guidance']) {
      expect(n.has(core)).toBe(true);
    }
  });

  it('surfaces the nonclinical tools for a nonclinical turn', () => {
    const n = names(selectToolsForTurn(ALL, 'compute the first-in-human dose and classify the tox findings (NOAEL)', { maxTools: 30 }));
    expect(n.has('compute_fih_dose')).toBe(true);
    expect(n.has('classify_tox_findings')).toBe(true);
  });

  it('surfaces clin-pharm tools for a DDI / QTc turn, and respects the cap', () => {
    const sel = selectToolsForTurn(ALL, 'assess the DDI risk as a CYP perpetrator and the concentration-QTc relationship', { maxTools: 30 });
    const n = names(sel);
    expect(n.has('assess_ddi_risk')).toBe(true);
    expect(sel.length).toBeLessThanOrEqual(30);
  });

  it('returns the full surface unchanged below the cap', () => {
    expect(selectToolsForTurn(ALL, 'anything', { maxTools: ALL.length + 5 }).length).toBe(ALL.length);
  });

  it('returns only the always-on set when the query carries no intent signal', () => {
    const sel = selectToolsForTurn(ALL, '   ??? ', { maxTools: 50 });
    // every selected named tool is in the always-on set (server tools have no name)
    for (const t of sel) {
      if (t.name) expect(ALWAYS_ON_TOOLS.has(t.name)).toBe(true);
    }
  });

  it('passes everything through when disabled via env', () => {
    process.env.ANA_TOOL_SELECTION_DISABLED = '1';
    expect(selectToolsForTurn(ALL, 'nonclinical', { maxTools: 5 }).length).toBe(ALL.length);
  });

  it('always includes the user-pinned tools from the picker', () => {
    const n = names(selectToolsForTurn(ALL, 'hello', { maxTools: 18, pinned: ['assess_ddi_risk', 'create_udi_record'] }));
    expect(n.has('assess_ddi_risk')).toBe(true);
    expect(n.has('create_udi_record')).toBe(true);
  });

  it('selects by context (document type) even when the message is terse', () => {
    // A bare "draft it" carries no domain words; the context supplies the intent.
    const n = names(
      selectToolsForTurn(ALL, 'draft it', {
        maxTools: 30,
        context: { documentType: 'nonclinical_overview', projectType: 'IND', surface: 'nonclinical' },
      }),
    );
    expect(n.has('draft_nonclinical_overview_m2_4')).toBe(true);
  });
});

describe('getToolCatalog', () => {
  it('groups the surface into categories for the picker', () => {
    const cats = getToolCatalog(ALL);
    const ids = cats.map(c => c.id);
    expect(ids).toContain('platform');
    expect(ids).toContain('nonclinical');
    // every category has at least one tool, and each tool has name + description
    for (const c of cats) {
      expect(c.tools.length).toBeGreaterThan(0);
      expect(c.tools[0]).toHaveProperty('name');
      expect(c.tools[0]).toHaveProperty('description');
    }
  });

  it('routes representative tools to sensible categories', () => {
    expect(categorizeTool('execute_platform_command').id).toBe('platform');
    expect(categorizeTool('compute_fih_dose').id).toBe('nonclinical');
    expect(categorizeTool('assess_ddi_risk').id).toBe('clinical_pharmacology');
    expect(categorizeTool('draft_quality_overall_summary_m2_3').id).toBe('cmc_quality');
  });
});

describe('selectToolsForTurn — reliability-aware deprioritization', () => {
  const bridge = [{ name: 'list_platform_commands' }, { name: 'execute_platform_command' }];
  const filler = Array.from({ length: 50 }, (_, i) => ({ name: `filler_${i}`, description: 'unrelated utility' }));
  const tools = [
    ...bridge,
    { name: 'zebra_alpha', description: 'zebra analysis' },
    { name: 'zebra_beta', description: 'zebra analysis' },
    ...filler,
  ];

  it('keeps a healthy relevant tool over an unhealthy one when over the cap', () => {
    const sel = selectToolsForTurn(tools, 'zebra', { maxTools: 3, deprioritize: new Set(['zebra_alpha']) });
    const n = names(sel);
    expect(n.has('zebra_beta')).toBe(true);
    expect(n.has('zebra_alpha')).toBe(false);
  });

  it('without deprioritization, ranks purely by relevance (stable order)', () => {
    const sel = selectToolsForTurn(tools, 'zebra', { maxTools: 3 });
    expect(names(sel).has('zebra_alpha')).toBe(true);
  });

  it('never drops an always-on tool even if marked unhealthy (capability guarantee)', () => {
    const sel = selectToolsForTurn(tools, 'zebra', {
      maxTools: 3,
      deprioritize: new Set(['execute_platform_command']),
    });
    const n = names(sel);
    expect(n.has('execute_platform_command')).toBe(true);
    expect(n.has('list_platform_commands')).toBe(true);
  });
});
