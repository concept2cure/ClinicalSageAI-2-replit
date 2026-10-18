/** Canonical RIM DDL, actual matrix computation/rendering, unknowns and sealed-output boundaries. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), readiness: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../orchestrator', () => ({ computeInitialRun: h.readiness }));
import { computeDomainReport } from '../research-compliance-report-providers';
import { calculateLabelCurrencyMatrix, LABEL_CURRENCY_LIMIT, LABEL_CURRENCY_TYPE, type LabelMatrixSnapshot } from '../label-currency-matrix';
import { labelCurrencyMatrixOf } from '../render/label-currency-matrix';
import { computeRunForType } from '../compute-run';
import { reportAvailability } from '../report-engine';
import { gapsWereEvaluated, renderReport } from '../render/render';
import { evaluateTruthfulness } from '../truthfulness';
import { buildRunPdf } from '../pdf/run-pdf';
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('CREATE TABLE organizations(id integer PRIMARY KEY); CREATE TABLE users(id integer PRIMARY KEY); CREATE TABLE submissions(id integer PRIMARY KEY); INSERT INTO organizations VALUES(7),(8),(9); INSERT INTO users VALUES(3),(4);');
  await pg.exec(await readFile('migrations/20260610_rim_lite.sql', 'utf8'));
  await pg.exec(await readFile('migrations/20260610_lifecycle_obligations.sql', 'utf8'));
  await pg.exec(`
    INSERT INTO rim_products(id,organization_id,product_name,status,created_by,deleted_at) VALUES
      (10,7,'Recorded product Alpha','active',3,NULL),(11,7,'Recorded product Beta','development',3,NULL),(12,8,'FOREIGN SECRET PRODUCT','active',4,NULL),(13,7,'Deleted product','active',3,now());
    INSERT INTO rim_registrations(id,organization_id,product_id,country,market_status,registration_number,approval_date,renewal_due_date,created_by,deleted_at) VALUES
      (1,7,10,'US','approved',NULL,NULL,NULL,3,NULL),(2,7,10,'EU','approved','EU-17','2025-01-02','2028-03-04',3,NULL),
      (3,7,10,'JP','under_review','JP-18',NULL,NULL,3,NULL),(4,7,11,'CA','approved','CA-19','2025-02-03',NULL,3,NULL),
      (5,8,12,'SECRET','approved','SECRET',NULL,NULL,4,NULL),(6,7,12,'FOREIGN_PARENT','approved','LEAK',NULL,NULL,3,NULL),
      (7,7,13,'DELETED_PARENT','approved',NULL,NULL,NULL,3,NULL),(8,7,10,' us ','submitted','SECOND-US',NULL,NULL,3,NULL),
      (9,7,10,'DELETED','approved',NULL,NULL,NULL,3,now());
    INSERT INTO rim_labels(id,organization_id,product_id,country,label_type,version,status,approved_date,created_by,deleted_at) VALUES
      (1,7,10,NULL,'core_data_sheet','CCDS-1','approved',NULL,3,NULL),
      (2,7,10,'US','uspi','2','approved','2025-01-02',3,NULL),(3,7,10,'US','uspi','10','approved','2099-01-01',3,NULL),
      (4,7,10,'US','uspi','3','superseded','2024-02-03',3,NULL),(5,7,10,'EU','pil','','draft',NULL,3,NULL),
      (6,8,12,'SECRET','uspi','SECRET LABEL','approved','2025-01-01',4,NULL),
      (7,7,12,'FOREIGN_PARENT','uspi','LEAK LABEL','approved','2025-01-01',3,NULL),
      (8,7,10,'DELETED','uspi','DELETED LABEL','approved','2025-01-01',3,now()),
      (9,7,13,'DELETED_PARENT','uspi','DELETED PARENT LABEL','approved','2025-01-01',3,NULL),
      (10,7,10,'EU','smpc','SmPC-2026','approved',NULL,3,NULL);
    INSERT INTO lifecycle_obligations(id,organization_id,product_id,region,obligation_type,title,status,due_date,created_by,deleted_at) VALUES
      (1,7,10,'fda','supplement','Recorded open obligation','in_preparation','2000-01-01',3,NULL),
      (2,7,10,'jp','renewal','Recorded approved obligation','approved','2000-01-01',3,NULL),
      (3,7,NULL,'other','annual_report','Unlinked obligation','planned',NULL,3,NULL),
      (4,8,12,'other','annual_report','FOREIGN SECRET OBLIGATION','planned',NULL,4,NULL),
      (5,7,12,'other','annual_report','LEAK OBLIGATION','planned',NULL,3,NULL),
      (6,7,13,'other','annual_report','DELETED PARENT OBLIGATION','planned',NULL,3,NULL),
      (7,7,10,'other','annual_report','DELETED OBLIGATION','planned',NULL,3,now()),
      (8,7,10,'eu','variation','Recorded submitted obligation','submitted','2000-01-01',3,NULL);
  `);
  h.query.mockImplementation((sql: string, args?: unknown[]) => pg.query(sql, args));
});
afterAll(async () => { await pg?.close(); });
const load = () => computeDomainReport(LABEL_CURRENCY_TYPE, 7, { scopeType: 'project', scopeId: '123' });
const matrix = async () => labelCurrencyMatrixOf((await load())!.summary)!;

describe('recorded label matrix from canonical PostgreSQL source tables', () => {
  it('loads exactly one snapshot and binds every read to the selected organization', async () => {
    h.query.mockClear(); const report = (await load())!;
    expect(h.query).toHaveBeenCalledOnce(); expect(h.query.mock.calls[0][1]).toEqual([7]);
    expect(report.computedScope).toBe('organization'); expect(report.provider.status).toBe('partial');
    expect(report.provenance.queries).toHaveLength(1);
    expect(report.provider.atoms).toContainEqual({ sourceTable: 'rim_labels', recordId: 3, transformation: 'direct_copy' });
    expect(JSON.stringify(report)).not.toMatch(/FOREIGN SECRET|LEAK LABEL|LEAK OBLIGATION|DELETED PARENT|DELETED LABEL|DELETED OBLIGATION/);
    expect(labelCurrencyMatrixOf(report.summary)!.products.map(row => row.id)).toEqual([10, 11]);
  });
  it('preserves all versions and duplicate approvals without choosing a current winner', async () => {
    const output = await matrix(); const us = output.labels.filter(row => row.market === 'US');
    expect(us.map(row => row.version)).toEqual(['2', '10', '3']);
    expect(us.every(row => row.approvedRecordsInSlot === 2 && row.approvalEvidence === 'ambiguous approved records' && row.legalCurrency === 'unknown')).toBe(true);
    expect(us.map(row => row.recordedStatus)).toEqual(['approved', 'approved', 'superseded']);
    expect(output.gaps.some(gap => gap.title.includes('approval date unresolved') && gap.message.includes('2099-01-01'))).toBe(true);
    expect(output.gaps.some(gap => gap.title.includes('ambiguous registrations'))).toBe(true);
    expect(output.gaps.some(gap => gap.title.includes('missing version'))).toBe(true);
  });
  it('does not substitute a core data sheet for an unrecorded JP/CA label or invent J-Label support', async () => {
    const output = await matrix();
    for (const market of ['JP', 'CA']) expect(output.labels.find(row => row.market === market)).toMatchObject({ labelId: null, labelType: null, legalCurrency: 'unknown', approvalEvidence: 'no label record' });
    expect(output.gaps.some(gap => gap.title.includes('J-Label source unavailable'))).toBe(true);
    expect(output.labels.find(row => row.labelType === 'core_data_sheet')?.market).toBeNull();
  });
  it('keeps independent region obligations independent and calculates only recorded due-date standing', async () => {
    const rows = (await matrix()).obligations;
    expect(rows.map(row => row.id)).toEqual([1, 2, 3, 8]);
    expect(rows[0]).toMatchObject({ region: 'fda', urgency: 'overdue', productName: 'Recorded product Alpha' });
    expect(rows[1].urgency).toBe('closed'); expect(rows[3].urgency).toBe('closed');
    expect(rows[2]).toMatchObject({ product_id: null, productName: null, urgency: 'undated' });
  });
  it('refuses client-workspace narrowing before reading organization-wide data', async () => {
    h.query.mockClear();
    await expect(computeDomainReport(LABEL_CURRENCY_TYPE, 7, { clientWorkspaceId: 71 })).rejects.toMatchObject({ code: 'REPORT_CLIENT_SCOPE_UNSUPPORTED' });
    expect(h.query).not.toHaveBeenCalled();
  });
  it('an empty source stays missing with explicit critical gaps and no reassuring score', async () => {
    const result = (await computeDomainReport(LABEL_CURRENCY_TYPE, 9))!;
    expect(result.provider.status).toBe('missing'); expect(result.criticalBlockers).toEqual([LABEL_CURRENCY_LIMIT]);
    expect(labelCurrencyMatrixOf(result.summary)?.gaps.some(gap => gap.title === 'Source records missing')).toBe(true);
    expect(JSON.stringify(result.summary)).not.toMatch(/low.risk|100%|confidence/);
  });
  it('an unreadable source rejects instead of persisting a successful empty matrix', async () => {
    h.query.mockRejectedValueOnce(new Error('Source unavailable'));
    await expect(load()).rejects.toThrow('Source unavailable');
  });
  it('the actual shared dispatcher uses the domain engine and propagates critical blockers', async () => {
    const result = await computeRunForType({ engine: 'domain', typeId: LABEL_CURRENCY_TYPE, organizationId: 7, scopeType: 'account', scopeId: '7' });
    expect(result.computed.confidence).toBeNull(); expect(result.computed.criticalBlockers).toEqual([LABEL_CURRENCY_LIMIT]);
    expect(labelCurrencyMatrixOf(result.computed.summary.domain as Record<string, unknown>)?.labels.length).toBeGreaterThan(0);
    expect(h.readiness).not.toHaveBeenCalled();
    for (const scope of ['account', 'program', 'project']) expect(reportAvailability(LABEL_CURRENCY_TYPE, scope, ['account', 'program', 'project'])).toMatchObject({ runnable: true, engine: 'domain', computedScope: 'organization' });
  });
});

async function rendered() {
  const { computed } = await computeRunForType({ engine: 'domain', typeId: LABEL_CURRENCY_TYPE, organizationId: 7, scopeType: 'account', scopeId: '7' });
  return { computed, report: renderReport({ reportTypeId: LABEL_CURRENCY_TYPE, reportTypeLabel: 'Label Currency Matrix', scopeType: 'account', scopeId: '7', providers: computed.providers, blockers: computed.blockers, summary: computed.summary, confidence: computed.confidence, status: 'partial', generatedAt: '2026-10-14T00:00:00.000Z' }) };
}

/** The repository's legacy ambient declaration exposes the old default
 * function; the installed pdf-parse 2.x exports a constructor. Check that
 * runtime contract and its extracted text without asserting an unchecked type. */
async function actualPdfText(bytes: Buffer): Promise<string> {
  const pdfModule: unknown = await import('pdf-parse');
  if (!pdfModule || typeof pdfModule !== 'object' || !('PDFParse' in pdfModule) || typeof pdfModule.PDFParse !== 'function') throw new Error('Installed PDFParse constructor unavailable');
  const parser: unknown = Reflect.construct(pdfModule.PDFParse, [{ data: new Uint8Array(bytes) }]);
  if (!parser || typeof parser !== 'object' || !('getText' in parser) || typeof parser.getText !== 'function' || !('destroy' in parser) || typeof parser.destroy !== 'function') throw new Error('Installed PDFParse extraction API unavailable');
  try {
    const extracted: unknown = await parser.getText();
    if (!extracted || typeof extracted !== 'object' || !('text' in extracted) || typeof extracted.text !== 'string') throw new Error('PDF parser did not extract actual text');
    return extracted.text.replace(/\s+/g, ' ');
  } finally { await parser.destroy(); }
}
describe('actual matrix document and finalization truthfulness', () => {
  it('renders every fixed column, including later non-null values after a null first row', async () => {
    const { report, computed } = await rendered();
    const block = report.sections.find(section => section.id === 'label-matrix')!.blocks.find(block => block.kind === 'table');
    expect(block?.kind).toBe('table');
    if (block?.kind !== 'table') throw new Error('Actual label table missing');
    expect(block.columns).toContain('Market (null = unassigned/core)'); expect(block.columns).toContain('Approval date');
    expect(block.rows[0][2]).toBeNull(); expect(block.rows[1][2]).toBe('US'); expect(block.rows[1][7]).toBe('2025-01-02');
    expect(block.rows.map(row => row[5])).toContain('SmPC-2026');
    expect(report.computedScope).toBe('organization'); expect(gapsWereEvaluated(computed.summary)).toBe(true);
    const text = JSON.stringify(report.sections);
    expect(text).toContain('EU-17'); expect(text).toContain('Unlinked obligation'); expect(text).toContain('J-Label');
    expect(text).not.toMatch(/Submission readiness|No gaps detected|Gaps were not evaluated/);
  });
  it('holds a nonempty matrix at partial when final is requested', async () => {
    const { computed } = await rendered();
    expect(evaluateTruthfulness({ requestedStatus: 'final', confidence: computed.confidence, blockers: computed.blockers, criticalBlockers: computed.criticalBlockers, gapsSection: gapsWereEvaluated(computed.summary), disclosure: false }, { allowPartial: true, requireBlockers: true, forbidFinalIfMissingCritical: true })).toMatchObject({ allowedStatus: 'partial', downgradedFrom: 'final' });
  });
  it('exports actual matrix versions, source dates, obligations and explicit unknown currency in its PDF', async () => {
    const { report } = await rendered();
    const { bytes } = await buildRunPdf({ run: { id: 17, runUuid: null, reportTypeId: LABEL_CURRENCY_TYPE, scopeType: 'account', scopeId: '7', status: 'partial', confidence: null, createdAt: '2026-10-14T00:00:00Z' }, report, typeLabel: 'Label Currency Matrix', seal: null, runBy: 'Synthetic local test actor', exportId: 'matrix-test-export', exportedAt: '2026-10-14T01:00:00Z' });
    const text = await actualPdfText(bytes);
    for (const expected of ['SmPC-2026', '2025-01-02', '2099-01-01', 'Recorded open obligation', 'Unlinked obligation', 'Legal label currency is unknown', 'NOT FINAL', 'Data scope: organization']) expect(text).toContain(expected);
  });
  it('does not accept an unsupported saved matrix schema as valid source content', async () => {
    const input = { schemaVersion: 2, observedAt: '2026-10-14', products: [], registrations: [], labels: [], obligations: [], gaps: [], limits: [] };
    expect(() => labelCurrencyMatrixOf({ labelCurrencyMatrix: input })).toThrow('Unsupported');
  });
  it('pure calculation makes no latest-version or legal-currentness claim on a positive recorded slot', () => {
    const input: LabelMatrixSnapshot = { observed_at: '2026-10-14T00:00:00Z', products: [{ id: 1, organization_id: 7, product_name: 'Actual recorded product', status: 'active' }], registrations: [{ id: 1, product_id: 1, country: 'XX', market_status: 'approved', registration_number: null, approval_date: null, renewal_due_date: null }], labels: [{ id: 1, product_id: 1, country: 'XX', label_type: 'uspi', version: 'A.2', status: 'approved', approved_date: '2026-01-01' }], obligations: [] };
    const result = calculateLabelCurrencyMatrix(input);
    expect(result.labels[0]).toMatchObject({ version: 'A.2', approvalEvidence: 'recorded approved', legalCurrency: 'unknown' });
    expect(result.gaps[0].severity).toBe('critical'); expect(result.labels[0].labelType).toBe('uspi');
  });
});
