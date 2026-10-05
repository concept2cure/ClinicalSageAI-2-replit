/**
 * assemble_device_submission answers about the open project's governed
 * content, never about what the model typed (g-assemble-device-project-scope).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The AnA tool built its device readiness verdict from three model-supplied
 * inputs and never read the open project:
 *   - leaves[], with `substantive: true` accepted from the model;
 *   - deviceFlags, the device's intake answers, accepted from the model;
 *   - presentTemplates, trusted by FILE NAME — the bug POST
 *     /api/510k/estar/assemble already fixed with isUsableEstarTemplate.
 * So a model that typed "every section substantive, template present" got
 * 'official-estar' for a program whose governed sections are all drafts.
 *
 * ── What this proves ──────────────────────────────────────────────────────────
 *   • with a project open, the verdict follows the program's governed sections
 *     (drafted ⇒ not ready; approved ⇒ ready) whatever the model passes, and
 *     the source that answered is echoed (deviceContentSource);
 *   • template availability is the server's checksum-verified answer;
 *   • a failed read is reported as a failed read, never as missing sections —
 *     the project lookup, the scope probe, and the content read itself
 *     (mutation: `.catch(() => [])` on loadDeviceContentLeaves in
 *     loadProgramDeviceAssemblyInput fails the content-read cases);
 *   • model leaves are accepted only under mode 'hypothetical', where they can
 *     never yield a producible official eSTAR; with no project and no
 *     hypothetical mode the tool asks for a project;
 *   • the AnA tool's project verdict equals assembleProgramDeviceSubmission's,
 *     the function POST /assemble runs — same artifactKind, same blockers;
 *   • advise_device_readiness, which carried the same defect in parallel,
 *     follows the same scope rule and gives the same verdict.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const PROGRAM = '0a000000-0000-4000-8000-00000000000a';
const OFFICIAL = 'eSTAR-510k-non-ivd.pdf';

type GovRow = { id: number; section_key: string; label: string; status: string; content: unknown; mandatory: boolean };

const h = vi.hoisted(() => ({
  open: vi.fn(async (_pool: unknown, _ctx: unknown): Promise<string | null> => null),
  governed: [] as Array<Record<string, unknown>>,
  docThrows: false,
  /** 1-based call of the c2c_document_sections query that rejects (0 = none). */
  sectionsThrowOnCall: 0,
  sectionsCalls: 0,
  legacyRows: [] as Array<Record<string, unknown>>,
  flags: vi.fn(async (_org: number, _program: string): Promise<Record<string, boolean> | undefined> => undefined),
  vendored: vi.fn(async (): Promise<Array<{ fileName: string; bytes: Buffer; integrity: string }>> => []),
  queries: [] as string[],
}));

const query = vi.fn(async (sql: string) => {
  h.queries.push(sql);
  if (/FROM c2c_documents/.test(sql)) {
    if (h.docThrows) throw new Error('relation "c2c_documents" does not exist');
    return { rows: [{ id: 'doc-k510', doc_type: 'k510' }] };
  }
  if (/FROM c2c_document_sections/.test(sql)) {
    h.sectionsCalls += 1;
    if (h.sectionsCalls === h.sectionsThrowOnCall) throw new Error('canceling statement due to statement timeout on c2c_document_sections');
    return { rows: h.governed };
  }
  return { rows: [] };
});

/** Drizzle-shaped stub for the legacy cerv2_510k_sections read (select→from→where→orderBy). */
function legacyChain(): any {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(h.legacyRows).then(ok, ko),
  };
  return chain;
}

vi.mock('../../../db.js', () => ({
  pool: { query: (sql: string) => query(sql) },
  getPool: () => ({ query: (sql: string) => query(sql) }),
  db: { select: () => legacyChain() },
}));
vi.mock('../../c2c/program-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../c2c/program-access.js')>()),
  resolveOpenProgram: h.open,
}));
vi.mock('../../pathway-engines/estar/program-device-flags.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pathway-engines/estar/program-device-flags.js')>()),
  loadProgramDeviceFlags: h.flags,
}));
vi.mock('../../pathway-engines/estar/estar-template-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pathway-engines/estar/estar-template-registry.js')>()),
  listVendoredTemplates: h.vendored,
}));

import { getToolHandler } from '../AnaToolExecutor.js';

/** Every always-required 510(k) eSTAR section (per estar-mapper), by title. */
const TITLES = [
  'Cover letter',
  'Indications for use',
  'Device description',
  'Proposed labeling and instructions for use',
  'Biocompatibility evaluation',
  'Performance testing — bench',
  'Substantial equivalence comparison to predicate',
  'CDRH cover sheet 3514',
  'MDUFA user fee cover sheet 3601',
  'Truthful and accurate statement',
  'Risk management file',
  '510(k) Summary',
];

const PLAIN_DEVICE = {
  combinationProduct: false, softwareAiMl: false, cyberDevice: false, sterile: false,
  implantable: false, cliaWaived: false, clinicalData: false,
};

const body = (t: string) => `${t}: authored content for the CV-330 monitor, long enough to read as real section text.`;
const governedRows = (status: string): GovRow[] =>
  TITLES.map((t, i) => ({ id: i + 1, section_key: `S${i + 1}`, label: t, status, content: { text: body(t) }, mandatory: true }));

/** What a model that wants a green light types. */
const MODEL_CLAIMS = {
  pathway: '510k',
  variant: 'device',
  leaves: TITLES.map((t, i) => ({ sectionCode: String(i + 1), title: t, substantive: true })),
  deviceFlags: PLAIN_DEVICE,
  presentTemplates: [OFFICIAL],
  environment: 'staging',
};

const OPEN: ToolContext = { organizationId: 42, userId: 7, projectId: null, projectRef: PROGRAM };
const NONE: ToolContext = { organizationId: 42, userId: 7 };

const call = async (input: Record<string, unknown>, ctx?: ToolContext) =>
  JSON.parse(await getToolHandler('assemble_device_submission')!(input, ctx));

beforeEach(() => {
  h.open.mockReset();
  h.open.mockImplementation(async () => PROGRAM);
  h.governed = governedRows('drafted');
  h.docThrows = false;
  h.sectionsThrowOnCall = 0;
  h.sectionsCalls = 0;
  h.legacyRows = [];
  h.flags.mockReset();
  h.flags.mockImplementation(async () => PLAIN_DEVICE);
  h.vendored.mockReset();
  h.vendored.mockImplementation(async () => [{ fileName: OFFICIAL, bytes: Buffer.from(''), integrity: 'verified' }]);
  h.queries.length = 0;
  query.mockClear();
});

describe('assemble_device_submission — project scope', () => {
  it('drafted governed content is not ready, whatever substantive/flags/templates the model types', async () => {
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.status).toBe('computed');
    expect(out.result.canProduceOfficialEstar).toBe(false);
    expect(out.result.artifactKind).not.toBe('official-estar');
    expect(out.deviceContentSource).toBe('governed_program');
    expect(out.result.estar.summary.ready).toBe(false);
    expect(out.result.estar.summary.missingRequired).toContain('device-description');
    // The governed document was actually read for this program.
    expect(h.queries.some((q) => /FROM c2c_document_sections/.test(q))).toBe(true);
    expect(h.open).toHaveBeenCalled();
  });

  it('approved governed content is ready with no model leaves, flags or templates at all', async () => {
    h.governed = governedRows('approved');
    const out = await call({ pathway: '510k', variant: 'device' }, OPEN);
    expect(out.status).toBe('computed');
    expect(out.deviceContentSource).toBe('governed_program');
    expect(out.result.estar.summary.missingRequired).toEqual([]);
    expect(out.result.estar.summary.undetermined).toEqual([]);
    expect(out.result.template.available).toBe(true);
    expect(out.result.canProduceOfficialEstar).toBe(true);
    expect(h.flags).toHaveBeenCalledWith(42, PROGRAM);
  });

  it("the device answers are the program's, not the model's", async () => {
    h.governed = governedRows('approved');
    h.flags.mockImplementation(async () => undefined); // intake never answered
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.result.estar.summary.undetermined.length).toBeGreaterThan(0);
    expect(out.result.canProduceOfficialEstar).toBe(false);
  });

  it('a template whose bytes are not the pinned ones does not count, whatever file names the model lists', async () => {
    h.governed = governedRows('approved');
    h.vendored.mockImplementation(async () => [{ fileName: OFFICIAL, bytes: Buffer.from(''), integrity: 'mismatch' }]);
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.result.template.available).toBe(false);
    expect(out.result.canProduceOfficialEstar).toBe(false);
  });

  it("a program with no authored governed sections answers from the legacy store and says so ('legacy_org_wide')", async () => {
    h.governed = TITLES.map((t, i) => ({ id: i + 1, section_key: `S${i + 1}`, label: t, status: 'not_started', content: null, mandatory: true }));
    h.legacyRows = [{ sectionNumber: '3', sectionTitle: 'Device description', sectionKey: 'device_description', category: 'device_description', status: 'drafting', content: body('Device description') }];
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.status).toBe('computed');
    expect(out.deviceContentSource).toBe('legacy_org_wide');
    expect(out.result.canProduceOfficialEstar).toBe(false);
  });

  it('with no project open and no hypothetical mode, it asks for a project', async () => {
    h.open.mockImplementation(async () => null);
    const out = await call(MODEL_CLAIMS, NONE);
    expect(out.status).toBe('needs_project');
    expect(out.result).toBeUndefined();
  });

  it("mode 'hypothetical' ignores substantive and template claims and is labelled as not the project's content", async () => {
    const out = await call({ ...MODEL_CLAIMS, mode: 'hypothetical' }, NONE);
    expect(out.status).toBe('computed');
    expect(out.mode).toBe('hypothetical');
    expect(String(out.basis)).toMatch(/hypothetical/i);
    expect(String(out.basis)).toMatch(/not this project/i);
    expect(out.result.canProduceOfficialEstar).toBe(false);
    expect(out.result.estar.summary.ready).toBe(false);
    expect(out.result.template.present).toEqual([]);
    expect(out.deviceContentSource).toBeUndefined();
  });

  it("the AnA tool's project verdict equals assembleProgramDeviceSubmission's (the function POST /assemble runs)", async () => {
    const mod = await import('../../pathway-engines/device-assembly/assemble-device-submission.js');
    const shared = (mod as Record<string, unknown>).assembleProgramDeviceSubmission as
      | ((orgId: number, o: Record<string, unknown>) => Promise<{ deviceContentSource: string; artifactKind: string; blockers: string[] }>)
      | undefined;
    expect(typeof shared).toBe('function');
    const direct = await shared!(42, { programId: PROGRAM, pathway: '510k', variant: 'device' });
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.result.artifactKind).toBe(direct.artifactKind);
    expect(out.result.blockers).toEqual(direct.blockers);
    expect(out.deviceContentSource).toBe(direct.deviceContentSource);
  });
});

describe('assemble_device_submission — failed reads', () => {
  it('a failed read is reported as a failed read — never as missing sections', async () => {
    h.docThrows = true;
    const raw = await getToolHandler('assemble_device_submission')!(MODEL_CLAIMS, OPEN);
    const out = JSON.parse(raw);
    expect(out.status).toBe('read_failed');
    expect(typeof out.standing_error).toBe('string');
    expect(out.result).toBeUndefined();
    expect(raw).not.toMatch(/section\(s\) missing|missingRequired/);
    // The driver's message (it names tables) goes to the log, not to the model.
    expect(raw).not.toMatch(/c2c_documents/);
  });

  it('a failed CONTENT read after the scope resolved is a failed read — never missing sections', async () => {
    // Call 1 is resolveDeviceContentScope's "is anything authored?" probe —
    // approved rows, so the governed scope is chosen. Call 2 is
    // loadDeviceContentLeaves' content read, which fails. A catch-return-[]
    // around that read would turn it into "every section missing".
    h.governed = governedRows('approved');
    h.sectionsThrowOnCall = 2;
    const raw = await getToolHandler('assemble_device_submission')!(MODEL_CLAIMS, OPEN);
    const out = JSON.parse(raw);
    expect(h.sectionsCalls).toBeGreaterThanOrEqual(2);
    expect(out.status).toBe('read_failed');
    expect(out.result).toBeUndefined();
    expect(raw).not.toMatch(/section\(s\) missing|missingRequired/);
    expect(raw).not.toMatch(/statement timeout/);
  });

  it('a failed project lookup is a failed read too', async () => {
    h.open.mockImplementation(async () => { throw new Error('connection terminated'); });
    const out = await call(MODEL_CLAIMS, OPEN);
    expect(out.status).toBe('read_failed');
    expect(out.result).toBeUndefined();
  });
});

/**
 * advise_device_readiness was a parallel copy of the same defect: it handed the
 * model's leaves (substantive:true), template file names, deviceFlags,
 * environment and requireTemplate straight to the engine, and answered
 * "Ready: an official, submittable FDA eSTAR … can be produced" without
 * reading any project.
 */
describe('advise_device_readiness — project scope', () => {
  const advise = async (input: Record<string, unknown>, ctx?: ToolContext) => {
    const raw = await getToolHandler('advise_device_readiness')!(input, ctx);
    return { raw, out: JSON.parse(raw) };
  };

  it('with a project open, drafted governed content is not ready, whatever the model types', async () => {
    const { raw, out } = await advise({ ...MODEL_CLAIMS, requireTemplate: false }, OPEN);
    expect(out.canProduceOfficialEstar).toBe(false);
    expect(out.artifactKind).not.toBe('official-estar');
    expect(String(out.headline)).not.toMatch(/^Ready/);
    expect(out.deviceContentSource).toBe('governed_program');
    expect(out.mode).toBe('project');
    expect(h.open).toHaveBeenCalled();
    expect(raw).not.toMatch(/submittable FDA eSTAR .* can be produced/);
  });

  it('with a project open, approved governed content is ready with no model input but the question', async () => {
    h.governed = governedRows('approved');
    const { out } = await advise({ pathway: '510k', variant: 'device' }, OPEN);
    expect(out.canProduceOfficialEstar).toBe(true);
    expect(out.missingRequiredSections).toEqual([]);
    expect(out.deviceContentSource).toBe('governed_program');
  });

  it("the advice and assemble_device_submission give the open project the same verdict", async () => {
    const assembled = await call(MODEL_CLAIMS, OPEN);
    const { out } = await advise(MODEL_CLAIMS, OPEN);
    expect(out.artifactKind).toBe(assembled.result.artifactKind);
    expect(out.blockers).toEqual(assembled.result.blockers);
    expect(out.canProduceOfficialEstar).toBe(assembled.result.canProduceOfficialEstar);
  });

  it('with no project open, model leaves marked substantive plus the template name never yield an official eSTAR', async () => {
    h.open.mockImplementation(async () => null);
    const { raw, out } = await advise({ ...MODEL_CLAIMS, requireTemplate: false, environment: 'production' }, NONE);
    expect(out.canProduceOfficialEstar).toBe(false);
    expect(out.artifactKind).not.toBe('official-estar');
    expect(String(out.headline)).not.toMatch(/^Ready/);
    expect(out.mode).toBe('hypothetical');
    expect(String(out.basis)).toMatch(/not this project/i);
    expect(raw).not.toMatch(/submittable FDA eSTAR .* can be produced/);
  });

  it('with no project open and no outline, it asks for a project', async () => {
    h.open.mockImplementation(async () => null);
    const { out } = await advise({ pathway: '510k', variant: 'device' }, NONE);
    expect(out.status).toBe('needs_project');
    expect(out.canProduceOfficialEstar).toBeUndefined();
  });

  it('a failed content read is read_failed, never a verdict', async () => {
    h.governed = governedRows('approved');
    h.sectionsThrowOnCall = 2;
    const { raw, out } = await advise(MODEL_CLAIMS, OPEN);
    expect(out.status).toBe('read_failed');
    expect(out.canProduceOfficialEstar).toBeUndefined();
    expect(raw).not.toMatch(/statement timeout/);
  });
});
