/**
 * plan_ind_module_authoring is retired onto the record-composed Module 2.5 and
 * 2.7 tools (CLAUDE.md Rule 2; Rule 2 audit S6, 2026-11-01; ONE_DESIGN_PLAN S4;
 * docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md, "### S6").
 *
 * The tool planned a Module 2.5 Clinical Overview or 2.7 Clinical Summary from
 * `facts[]` in the call, which the model writes. Each fact's value went into
 * the plan's text verbatim and into the required_strings its verify step asked
 * the document to carry, so every figure in the plan was one the model
 * supplied; its own receipt said "caller/model-supplied". The IND interview
 * ended in "Author IND Module 2 Narrative ... from the collected facts", the
 * IND chat's context block sent Module 2.5 and 2.7 to it, three skills listed
 * it and the IND-enabling program phase offered it.
 *
 * The replacements, by path:
 *   - draft_clinical_overview_m2_5 (legacy-import-tool-defs.ts; handler in
 *     AnaToolExecutor.ts) composes 2.5 from the program's completed CSRs
 *     (module2-csr-inputs.ts) and, with none, returns the 2.5 outline the
 *     template library serves (ctd-component-outline.ts);
 *   - draft_clinical_summary_m2_7 (bla-biologics-tool-defs.ts) composes
 *     2.7.1–2.7.4 from the same records and says so when there are none.
 * Their tests: nonclinical-clinpharm-tools.test.ts (the M2.7 handler: supplied
 * figures not used, needs_data, composed from the records);
 * new-tool-handlers.test.ts and ana-tools-read-the-ctd-record.test.ts (the
 * M2.5 outline with no data);
 * module2-csr-inputs.pglite.test.ts (the CSR loader both read).
 *
 * What the planner held that those tools lack is carried over. Its sections
 * were the record's headings directly below 2.5 and 2.7 (D2 cleanup C4a). The
 * 2.5 headings are the M2.5 tool's outline (ana-tools-read-the-ctd-record.test.ts).
 * The 2.7 headings, which the M2.7 tool does not return without a CSR, are
 * get_document_template's clinical_summary outline, read from the same record
 * to its depth; the last case holds that. Its required_strings were those
 * headings plus each fact's value: the headings are the outlines above, and a
 * draft's heading coverage is checked by medical_writing_review; the values
 * were the model's. Nothing else carries over: the former section ids and the
 * unplaced-fact report described facts the model supplied.
 *
 * History: git log --all --diff-filter=D -- '*ind-module*' was empty before
 * this change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { BIOTECH_PROGRAM_PHASES, BIOTECH_PROGRAM_SPINE } from '../biotech-program.js';
import { documentTemplateTool } from '../document-template-tool';
import { buildSuggestedActions } from '../intelligence-questions/engine.js';
import { getFlowDefinition } from '../intelligence-questions/flows/index.js';
import { getSkillLibrary } from '../skills/library/index.js';
import { submissionContextBlockFor } from '../submission-context-block';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';

const TOOL = 'plan_ind_module_authoring';
const RECORD_TOOLS = ['draft_clinical_overview_m2_5', 'draft_clinical_summary_m2_7'] as const;
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'));

describe('plan_ind_module_authoring is retired', () => {
  it('has no handler: the one it had put the model’s figure into the plan', async () => {
    const handler = getToolHandler(TOOL);
    // A call as the model made it: a figure nobody else stated, labelled live.
    const answer = handler
      ? JSON.parse(String(await handler(
          {
            module: '2.5', product_name: 'BX-115', indication: 'AML', provenance: 'live',
            facts: [{ section_id: '2.5.4', label: 'Primary endpoint ORR', value: '42.3%' }],
          },
          { organizationId: 7, userId: 3 } as never,
        ))).author_docx_native
      : 'no handler';
    expect(answer).toBe('no handler');
  });

  it('is not offered to the model and has no definition', async () => {
    expect(ALL_ANA_TOOLS.map((t) => t.name)).not.toContain(TOOL);
    const defs = (await import('../evidence-literature-tool-defs.js')) as Record<string, unknown>;
    expect(defs.PLAN_IND_MODULE_AUTHORING).toBeUndefined();
  });

  it('is absent from the authorization register and the launch-scope inventory', () => {
    const register = readJson('tool-authorization.register.json') as { tools: Record<string, unknown> };
    expect(Object.keys(register.tools).length).toBeGreaterThan(100);
    expect(Object.keys(register.tools)).not.toContain(TOOL);
    const inv = readJson('ana-launch-scope.inventory.json') as { tools: { inScope: string[]; hiddenApp: unknown } };
    expect(inv.tools.inScope.length).toBeGreaterThan(100);
    expect(inv.tools.inScope).not.toContain(TOOL);
    expect(JSON.stringify(inv.tools.hiddenApp)).not.toContain(`"${TOOL}"`);
  });

  it('its module is gone', () => {
    expect(fs.existsSync(path.resolve(__dirname, '..', 'ind-module-authoring.ts'))).toBe(false);
  });
});

describe('where it was offered, the record-composed 2.5 and 2.7 tools are', () => {
  it('the IND interview ends in both, each a registered tool, and offers no draft from its answers', () => {
    const def = getFlowDefinition('ind_submission', { organizationId: 1, userId: 1, projectId: null, clientType: 'pharma' });
    expect(def).toBeTruthy();
    const actions = buildSuggestedActions(def!);
    const types = actions.map((a) => a.actionType);
    expect(types).not.toContain(TOOL);
    for (const tool of RECORD_TOOLS) expect(types).toContain(tool);
    for (const t of types) expect(typeof getToolHandler(t), t).toBe('function');
    for (const a of actions) {
      expect(a.description, a.label).not.toContain(TOOL);
      expect(a.description, a.label).not.toMatch(/from the collected facts/);
    }
  });

  it('the IND chat is told to compose 2.5 and 2.7 from the records and to pass them no figures', () => {
    const block = submissionContextBlockFor({ projectContext: { productType: 'IND' } });
    expect(block).not.toContain(TOOL);
    for (const tool of RECORD_TOOLS) expect(block).toContain(`\`${tool}\``);
    expect(block).toContain('Do not pass results, counts or rates');
  });

  it('no platform skill names it; the IND, 2.5 and 2.7 skills route to the record tools', () => {
    const library = getSkillLibrary();
    const naming = library.skills.filter((s) => s.tools.includes(TOOL) || s.instructions.includes(TOOL)).map((s) => s.key);
    expect(naming).toEqual([]);
    const toolsOf = (key: string) => library.byKey.get(key)?.tools ?? [];
    expect(toolsOf('submissions.ind-initial')).toEqual(expect.arrayContaining([...RECORD_TOOLS]));
    expect(toolsOf('medical-writing.clinical-overview')).toContain('draft_clinical_overview_m2_5');
    expect(toolsOf('medical-writing.clinical-summary')).toEqual(expect.arrayContaining(['draft_clinical_summary_m2_7', 'get_document_template']));
  });

  it('no program phase offers it; the phase that produces the pivotal CSRs offers the record tools', () => {
    for (const phase of BIOTECH_PROGRAM_PHASES) expect(BIOTECH_PROGRAM_SPINE[phase].anaCanDoNow, phase).not.toContain(TOOL);
    expect(BIOTECH_PROGRAM_SPINE.clinical_late.anaCanDoNow).toEqual(expect.arrayContaining([...RECORD_TOOLS]));
  });
});

describe('what it held that the record tools lack is carried over', () => {
  const children = (root: string) =>
    ctdRecordSubtree(root).filter((h) => h.code.split('.').length === root.split('.').length + 1).map((h) => h.code);

  it('its 2.7 headings: get_document_template serves the record’s 2.7 outline, headed as the record titles it', async () => {
    expect(typeof getToolHandler('get_document_template')).toBe('function');
    const headings: string[] = [];
    let offset = 0;
    for (let page = 0; page < 20; page++) {
      const out = JSON.parse(await documentTemplateTool({ template_id: 'clinical_summary', offset, limit: 30 }));
      expect(out.error, `@${offset}`).toBeUndefined();
      headings.push(...(out.template.sections as Array<{ number: string; heading: string }>).map((s) => `${s.number} ${s.heading}`));
      if (out.nextOffset === null) break;
      offset = out.nextOffset;
    }
    expect(headings).toEqual(children('2.7').map((c) => `${c} ${ichHeadingTitle(c)}`));
  });
});

// S6 review (2026-11-01): the IND intake now routes to the 2.5 handler, and
// nothing tested that it ignores figures a call supplies. With no project
// open it asks for one and uses none of them.
describe('the 2.5 replacement uses no figure a call supplies', () => {
  it('draft_clinical_overview_m2_5 with csrs in the call and no project open: needs_project, figures named as not used', async () => {
    const out = JSON.parse(String(await getToolHandler('draft_clinical_overview_m2_5')!(
      {
        product_name: 'BX-115', indication: 'AML',
        csrs: [{ studyId: 'X-301', protocolNumber: 'X-301', phase: '3', studyDesign: 'randomized', primaryEndpoint: 'ORR', primaryResult: 'ORR 42.3%', sampleSize: 312 }],
      },
      { organizationId: 7, userId: 3 } as never,
    )));
    expect(out).toMatchObject({ ok: false, status: 'needs_project', ignoredSuppliedFigures: true });
    expect(JSON.stringify(out)).not.toContain('42.3%');
  });
});

