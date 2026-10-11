import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { withoutHiddenAppTools } from '../ana-launch-scope.js';
import { cmcGuidance, cmcRequirements } from '../cmc-knowledge-tools.js';
import { selectToolsForTurn, SELF_DRIVE_TOOLS, type ToolSelectionOptions } from '../tool-selection.js';

const pool = withoutHiddenAppTools(ALL_ANA_TOOLS);
const CMC_RECORD_TOOLS = ['find_cmc_guidance', 'get_cmc_requirements', 'explain_cmc_topic'] as const;
const offered = (prompt: string, options: ToolSelectionOptions = {}) =>
  selectToolsForTurn(pool, prompt, { maxTools: 50, pinned: [...SELF_DRIVE_TOOLS], ...options });

beforeEach(() => vi.stubEnv('ANA_TOOL_SELECTION_DISABLED', '0'));
afterEach(() => vi.unstubAllEnvs());

describe('AnA biotech workflows — actual launch pool and streaming selection budget', () => {
  it('uses a real governed pool larger than the relevance budget', () => {
    expect(pool.length).toBeGreaterThan(50);
    for (const name of CMC_RECORD_TOOLS) expect(pool.some(tool => tool.name === name)).toBe(true);
  });

  const referenceCases = [
    ['which version of ICH Q5C applies to our stability plan', 'find_cmc_guidance'],
    ['how do we document the potency assay in Module 3', 'get_cmc_requirements'],
    ['what quality requirements apply to our biologic stability data', 'get_cmc_requirements'],
    ['why does our gene therapy need a potency assay', 'explain_cmc_topic'],
  ] as const;

  it.each(referenceCases)('offers the required cited record for: %s', (prompt, name) => {
    expect(offered(prompt).map(tool => tool.name)).toContain(name);
  });

  it('keeps the persona-required CMC references available on an otherwise context-free follow-up', () => {
    const names = offered('and why?').map(tool => tool.name);
    for (const name of CMC_RECORD_TOOLS) expect(names).toContain(name);
  });

  it('keeps required record reads under the existing core reliability rule', () => {
    const names = offered('and why?', { deprioritize: new Set(CMC_RECORD_TOOLS) }).map(tool => tool.name);
    for (const name of CMC_RECORD_TOOLS) expect(names).toContain(name);
  });

  it('cannot resurrect a record tool withheld by tenant governance, even when pinned or carried', () => {
    const denied = new Set<string>(CMC_RECORD_TOOLS);
    const governed = pool.filter(tool => !denied.has(tool.name ?? ''));
    const selected = selectToolsForTurn(governed, 'what does Q5C require for biologic stability', {
      maxTools: 50, pinned: [...SELF_DRIVE_TOOLS, ...CMC_RECORD_TOOLS], carriedTools: CMC_RECORD_TOOLS,
    });
    for (const name of CMC_RECORD_TOOLS) expect(selected.map(tool => tool.name)).not.toContain(name);
    expect(selected.every(tool => governed.includes(tool))).toBe(true);
  });

  const workflows = [
    ['program', 'where are we with our gene therapy program and what should we do next', 'get_biotech_program_status'],
    ['program', 'what is the critical path for our biosimilar', 'get_biotech_program_status'],
    ['intake', 'read the PDF I just attached', 'read_uploaded_document'],
    ['intake', 'this scanned report is hard to read, extract the text from the pages', 'ocr_document_pages'],
    ['intake', 'inspect the files I attached before you start drafting', 'inspect_uploaded_document'],
    ['intake', 'read the Excel batch results I uploaded', 'read_spreadsheet'],
    ['authoring', 'what documents and sections do we have in this project', 'list_authoring_outline'],
    ['authoring', 'read the current clinical overview before revising it', 'read_authoring_section'],
    ['authoring', 'find every section mentioning the changed dose', 'search_authoring_sections'],
    ['authoring', 'help me write a statistical analysis plan', 'get_document_template'],
    ['authoring', 'help me prepare an EU clinical trial application', 'get_document_template'],
    ['authoring', 'help me prepare a Canada CTA amendment', 'get_document_template'],
    ['authoring', 'help me draft the investigator brochure', 'get_document_template'],
    ['statistics', 'what sample size do we need for a phase 2 trial', 'compute_sample_size'],
    ['statistics', 'define the estimand for our trial', 'define_estimand'],
    ['statistics', 'how should we handle missing patient outcomes', 'select_missing_data_strategy'],
    ['statistics', 'plan how to control multiplicity for our co primary endpoints', 'plan_multiplicity_control'],
    ['consistency', 'check that the efficacy percentages match the counts', 'check_numerical_integrity'],
    ['consistency', 'check for discrepancies across the study documents', 'check_dossier_consistency'],
    ['submission', 'what happens next after database lock', 'plan_submission_from_database_lock'],
    ['submission', 'what would cause the FDA to reject our electronic submission', 'list_fda_technical_rules'],
    ['nonclinical', 'compute the first in human starting dose from NOAEL and MABEL', 'compute_fih_dose'],
  ] as const;

  it.each(workflows)('retains %s peer: %s', (_workflow, prompt, name) => {
    const selected = offered(prompt);
    expect(pool.some(tool => tool.name === name), 'peer must already be in launch scope').toBe(true);
    expect(selected.map(tool => tool.name)).toContain(name);
    expect(selected.length).toBeLessThanOrEqual(50);
    expect(new Set(selected.map(tool => tool.name)).size).toBe(selected.length);
    expect(selected.every(tool => pool.includes(tool))).toBe(true);
  });

  it.each(['estimate_recorded_shelf_life', 'assess_recorded_stability_trend', 'assess_recorded_batch_poolability'])(
    'preserves the existing launch refusal for %s', name => {
      expect(ALL_ANA_TOOLS.some(tool => tool.name === name)).toBe(true);
      expect(pool.some(tool => tool.name === name)).toBe(false);
      expect(offered(name, { pinned: [...SELF_DRIVE_TOOLS, name], carriedTools: [name] }).map(tool => tool.name)).not.toContain(name);
    },
  );

  it('the selected Q5C reference reads an actual cited record, with a recorded currency limit', () => {
    const result = JSON.parse(cmcGuidance({ query: 'Q5C', authority: 'ICH' }));
    expect(result.found).toBeGreaterThan(0);
    expect(result.documents.some((document: { cite: string }) => document.cite.startsWith('ICH Q5C ('))).toBe(true);
    expect(result.record).toContain('Record as of');
  });

  it('potency requirements remain cited record reads, not numerical calculations or readiness', () => {
    const result = JSON.parse(cmcRequirements({ topic: 'potency', modality: 'biologic' }));
    expect(result.found).toBeGreaterThan(0);
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.requirements.every((requirement: { sources: string[] }) => requirement.sources.length > 0)).toBe(true);
    expect(result.status).toBeUndefined();
  });
});
