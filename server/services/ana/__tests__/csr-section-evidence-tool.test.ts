/**
 * get_csr_section_evidence — AnA reads a retained Submission Center run's CSR
 * tables for one ICH E3 section, bound to their digest, and reconciles the
 * figures she drafted back to the cells (CSR end to end, slice 1,
 * docs/design/CSR_END_TO_END_2026-10-29.md).
 *
 * The figures come from the engine (csr-tabulation-builders, rebuilt from the
 * sealed run by readSavedClinicalTables); the model only narrates. So this
 * pins the failures first: a revoked source receipt, no project access and an
 * unmapped section are typed refusals, never an empty pack the model could
 * present as "no data"; and an AE count one off from aeBySOC does not
 * reconcile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsrSourceInputError } from '../../csr/source-access.js';
import type { RetainedCsrTables } from '../../csr/cortex-authoring-context.js';
import { RESULT_BUDGET } from '../agentic-loop.js';
import { AnaProjectScopeError } from '../project-scope-admission.js';
import type { ToolContext } from '../AnaToolExecutor.js';
import {
  CSR_SECTION_EVIDENCE_UNAVAILABLE,
  GET_CSR_SECTION_EVIDENCE,
  registerCsrSectionEvidenceHandlers,
  type CsrSectionEvidenceDeps,
} from '../csr-section-evidence-tool.js';

const PROGRAM = '0b8f6a52-6f0e-4d4b-9a51-2f7f0c1d9e01';
const RUN = '5d1c2b7e-1a3f-4c8e-b2d4-8e9f0a1b2c3d';
const DOC = '7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918';
const STUDY = 'PUNCH-CD3';
const CTX: ToolContext = { organizationId: 7, userId: 11, projectRef: PROGRAM } as ToolContext;

const table = (title: string, headers: string[], rows: string[][]) => ({ title, headers, rows });

function retained(overrides: Partial<RetainedCsrTables['studies'][number]['tables']> = {}): RetainedCsrTables {
  return {
    runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: false,
    studies: [{
      source: { documentId: DOC, version: '3', sha256: 'a'.repeat(64), dataCutDate: '2021-06-30',
        studyId: STUDY, protocolNumber: '2017-01', clinicalVerification: 'not-established' },
      tables: {
        analysisPopulations: table('§11.1 — Analysis Populations', ['Population', 'RBL (N=180)', 'Placebo (N=87)'],
          [['Safety', '180', '87'], ['mITT', '177', '85']]),
        aeOverallSummary: table('§12.2 — Overall AE Summary', ['Category', 'RBL (N=180)', 'Placebo (N=87)'],
          [['Any TEAE', '99 (55.0%)', '39 (44.8%)']]),
        aeBySOC: table('§12.2 — AEs by SOC', ['System Organ Class', 'RBL (N=180)', 'Placebo (N=87)'],
          [['Gastrointestinal disorders', '52 (28.9%)', '18 (20.7%)'], ['Infections and infestations', '21 (11.7%)', '9 (10.3%)']]),
        aeTopPT: table('§12.2 — Common AEs by PT', ['Preferred Term', 'RBL (N=180)', 'Placebo (N=87)'],
          [['Diarrhoea', '18 (10.0%)', '6 (6.9%)']]),
        disposition: table('§10.1 — Patient Disposition', ['Status', 'RBL', 'Placebo'], [['Completed', '170', '80']]),
        ...overrides,
      },
    }],
  };
}

function handlerWith(deps: CsrSectionEvidenceDeps) {
  const handlers = new Map<string, (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>>();
  registerCsrSectionEvidenceHandlers((name, h) => handlers.set(name, h), deps);
  const h = handlers.get('get_csr_section_evidence');
  if (!h) throw new Error('get_csr_section_evidence was not registered');
  return h;
}

const okDeps = (data: RetainedCsrTables = retained()): CsrSectionEvidenceDeps => ({
  pool: async () => ({ query: async () => ({ rows: [] }) }) as never,
  resolveProgram: async () => PROGRAM,
  load: async (_q, scope, runId) => {
    expect(scope).toMatchObject({ organizationId: 7, userId: 11, programId: PROGRAM });
    expect(runId).toBe(RUN);
    return data;
  },
});

const ask = { run_id: RUN, study_id: STUDY, section: '12.2' };

describe('get_csr_section_evidence fails closed', () => {
  it('refuses a run whose source receipt was revoked, typed, never as an empty pack', async () => {
    const h = handlerWith({ ...okDeps(), load: async () => {
      throw new CsrSourceInputError(409, 'CSR_SOURCE_DATA_UNAVAILABLE', 'This retained source is no longer eligible for data consumption.');
    } });
    const out = JSON.parse(await h(ask, CTX));
    expect(out.error).toBe(CSR_SECTION_EVIDENCE_UNAVAILABLE);
    expect(out.reason).toBe('CSR_SOURCE_DATA_UNAVAILABLE');
    expect(out).not.toHaveProperty('tables');
    expect(out.instruction).toMatch(/not .*no data|do not/i);
  });

  it('refuses when the person has no access to the open project', async () => {
    const h = handlerWith({ ...okDeps(), resolveProgram: async () => {
      throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.');
    } });
    const out = JSON.parse(await h(ask, CTX));
    expect(out.error).toBe(CSR_SECTION_EVIDENCE_UNAVAILABLE);
    expect(out.reason).toBe('ANA_PROJECT_ACCESS_DENIED');
  });

  it('refuses a section no retained table supports (12.5 vital signs) instead of borrowing safety tables', async () => {
    const out = JSON.parse(await handlerWith(okDeps())({ ...ask, section: '12.5' }, CTX));
    expect(out.error).toBe(CSR_SECTION_EVIDENCE_UNAVAILABLE);
    expect(out.reason).toBe('CSR_SECTION_NO_RETAINED_TABLES');
    expect(out).not.toHaveProperty('tables');
  });

  it('refuses without an open project or an identified member, and on a malformed selection', async () => {
    const h = handlerWith(okDeps());
    expect(JSON.parse(await h(ask, { organizationId: 7, userId: 11 } as ToolContext)).reason).toBe('ANA_PROJECT_REQUIRED');
    expect(JSON.parse(await h(ask, { organizationId: 7, projectRef: PROGRAM } as ToolContext)).reason).toBe('CSR_EVIDENCE_ACTOR_REQUIRED');
    expect(JSON.parse(await h({ ...ask, run_id: 'run-1' }, CTX)).reason).toBe('CSR_EVIDENCE_SELECTION_INVALID');
  });

  it('says a failed read failed, without driver text', async () => {
    const h = handlerWith({ ...okDeps(), load: async () => { throw new Error('relation "submission_orchestrator_inputs" does not exist'); } });
    const raw = await h(ask, CTX);
    expect(JSON.parse(raw).reason).toBe('CSR_EVIDENCE_READ_FAILED');
    expect(raw).not.toMatch(/submission_orchestrator_inputs/);
  });
});

describe('get_csr_section_evidence returns engine tables bound to their digest', () => {
  it('returns the §12.2 tables, their digest and limitations, within the result budget', async () => {
    const raw = await handlerWith(okDeps())(ask, CTX);
    expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    const out = JSON.parse(raw);
    expect(out).not.toHaveProperty('status');
    expect(out.evidence).toMatchObject({ run_id: RUN, study_id: STUDY, section: '12.2', evidence_status: 'available',
      clinical_verification: 'not-established', approval_required: true });
    expect(out.evidence.evidence_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(out.tables.map((t: { key: string }) => t.key)).toEqual(['analysisPopulations', 'aeOverallSummary', 'aeBySOC', 'aeTopPT']);
    expect(out.tables[2].rows[0]).toEqual(['Gastrointestinal disorders', '52 (28.9%)', '18 (20.7%)']);
    expect(out.limitations.join(' ')).toMatch(/not zero events/);
  });

  it('pages a large table by whole rows instead of cutting it', async () => {
    const many = Array.from({ length: 400 }, (_, i) => [`SOC ${i}`, `${i} (${(i / 10).toFixed(1)}%)`, `${i} (1.0%)`]);
    const deps = okDeps(retained({ aeBySOC: table('§12.2 — AEs by SOC', ['System Organ Class', 'RBL', 'Placebo'], many) }));
    const h = handlerWith(deps);
    const overview = await h(ask, CTX);
    expect(overview.length).toBeLessThanOrEqual(RESULT_BUDGET);
    const soc = JSON.parse(overview).tables.find((t: { key: string }) => t.key === 'aeBySOC');
    expect(soc.row_count).toBe(400);
    expect(soc).not.toHaveProperty('rows');
    let offset = 0; const seen: string[][] = [];
    while (offset !== null) {
      const raw = await h({ ...ask, table: 'aeBySOC', row_offset: offset }, CTX);
      expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
      const page = JSON.parse(raw);
      expect(page.table.row_offset).toBe(offset);
      seen.push(...page.table.rows);
      offset = page.next_row_offset;
    }
    expect(seen).toEqual(many);
  });
});

describe('get_csr_section_evidence reconciles drafted figures to the cells', () => {
  async function digest(h: ReturnType<typeof handlerWith>) {
    return JSON.parse(await h(ask, CTX)).evidence.evidence_digest as string;
  }

  it('reports an AE count one off from aeBySOC as not reconciling, with the cell value', async () => {
    const h = handlerWith(okDeps());
    const out = JSON.parse(await h({ ...ask, evidence_digest: await digest(h), claims: [
      { table: 'aeBySOC', row: 0, column: 1, value: '53 (28.9%)' },
      { table: 'aeBySOC', row: 1, column: 2, value: '9 (10.3%)' },
    ] }, CTX));
    expect(out.reconciliation).toBe('needs_review');
    expect(out.counts).toEqual({ matches: 1, mismatch: 1, unsupported: 0 });
    expect(out.not_reconciled).toEqual([{ index: 0, result: 'mismatch', table: 'aeBySOC', row: 0, column: 1, expected: '52 (28.9%)' }]);
  });

  it('reconciles figures that match and flags a figure no table holds', async () => {
    const h = handlerWith(okDeps());
    const d = await digest(h);
    const ok = JSON.parse(await h({ ...ask, evidence_digest: d, claims: [{ table: 'aeBySOC', row: 0, column: 1, value: '52 (28.9%)' }] }, CTX));
    expect(ok.reconciliation).toBe('matches');
    expect(ok.not_reconciled).toEqual([]);
    const unsupported = JSON.parse(await h({ ...ask, evidence_digest: d, claims: [{ table: 'labShifts', row: 0, column: 1, value: '3' }] }, CTX));
    expect(unsupported.reconciliation).toBe('needs_review');
    expect(unsupported.not_reconciled[0]).toMatchObject({ result: 'unsupported', expected: null });
  });

  it('refuses to reconcile against evidence other than the digest the draft was written from', async () => {
    const h = handlerWith(okDeps());
    const out = JSON.parse(await h({ ...ask, evidence_digest: 'b'.repeat(64), claims: [{ table: 'aeBySOC', row: 0, column: 1, value: '52 (28.9%)' }] }, CTX));
    expect(out.error).toBe(CSR_SECTION_EVIDENCE_UNAVAILABLE);
    expect(out.reason).toBe('CSR_EVIDENCE_DIGEST_CHANGED');
    const missing = JSON.parse(await h({ ...ask, claims: [{ table: 'aeBySOC', row: 0, column: 1, value: '52 (28.9%)' }] }, CTX));
    expect(missing.reason).toBe('CSR_EVIDENCE_DIGEST_REQUIRED');
  });

  it('refuses malformed claims rather than reporting them reconciled', async () => {
    const h = handlerWith(okDeps());
    const out = JSON.parse(await h({ ...ask, evidence_digest: await digest(h), claims: [{ table: 'aeBySOC', row: -1, column: 1, value: 52 }] }, CTX));
    expect(out.error).toBe('CSR_CLAIMS_INVALID');
    expect(out).not.toHaveProperty('reconciliation');
  });
});

describe('get_csr_section_evidence is wired', () => {
  it('is offered, handled, classed read, in launch scope, engine-presented and deterministic', async () => {
    const [{ ALL_ANA_TOOLS }, { getToolHandler }, { toolAuthorizationOf }, { getToolPedigree }] = await Promise.all([
      import('../AnaToolDefinitions.js'), import('../AnaToolExecutor.js'), import('../tool-authorization.js'), import('../tool-pedigree.js'),
    ]);
    expect(ALL_ANA_TOOLS.some((t) => t.name === GET_CSR_SECTION_EVIDENCE.name)).toBe(true);
    expect(typeof getToolHandler('get_csr_section_evidence')).toBe('function');
    expect(toolAuthorizationOf('get_csr_section_evidence', {}).class).toBe('read');
    expect(getToolPedigree('get_csr_section_evidence').pedigree).toBe('deterministic_query');
    const dir = path.resolve(__dirname, '..');
    const inv = JSON.parse(fs.readFileSync(path.join(dir, 'ana-launch-scope.inventory.json'), 'utf8'));
    expect(inv.tools.inScope).toContain('get_csr_section_evidence');
    const reg = JSON.parse(fs.readFileSync(path.join(dir, 'tool-authorization.register.json'), 'utf8'));
    expect(reg.tools.get_csr_section_evidence.present.source).toBe('engine');
  }, 120_000);

  it('is the first thing the clinical.study-report skill does for a results section', async () => {
    const { librarySources, buildLibrary } = await import('../skills/library/index.js');
    const s = buildLibrary(librarySources()).skills.find((k) => k.key === 'clinical.study-report');
    expect(s?.tools).toEqual(expect.arrayContaining(['get_csr_section_evidence', 'get_document_section_requirements']));
    expect(s?.instructions).toMatch(/`get_csr_section_evidence`[^\n]*before/);
  });
});
