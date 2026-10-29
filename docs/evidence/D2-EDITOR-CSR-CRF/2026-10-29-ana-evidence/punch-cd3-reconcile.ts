/**
 * Slice 1 end-to-end (deterministic leg): the REBYOTA PUNCH CD3 (Study 2017-01)
 * aggregates as FDA reported them, through the engine (buildCSRTables), the
 * evidence pack (buildCsrAuthoringEvidence, via loadCsrAuthoringEvidence) and
 * the AnA tool get_csr_section_evidence, for E3 §10.1 and §11.4.1. Each
 * FDA-reported figure is then passed back to the tool as a drafted claim and
 * reconciled to its cell; one claim is deliberately one off.
 *
 * Sources (server/data/public-csr-reference):
 *   - Clinical Review Memo, 30 Nov 2022 (pages/…e3def112a78bd2.jsonl), p.65
 *     (pdf page 69) §6.2.10.1.3 and Table 22 "Subject Disposition, Study 2017-01".
 *   - Statistical Review (pages/…f7b6585b06beb9.jsonl), page 27, Table 11
 *     "Primary Endpoint Outcomes by Treatment Arm and Analysis Population".
 *
 * Disposition rows are an EXPANSION OF AGGREGATE COUNTS into anonymous rows so
 * the subject-level builder can count them; no subject fact is invented.
 * "Completed" is DERIVED (treated minus discontinued: 180−21, 87−12), not a
 * figure FDA states. This is not a csr-source.v1 envelope: that contract
 * requires every randomized participant's demographics and AE records, which
 * the review memos do not carry (README, "What was not run").
 *
 * Run: npx tsx docs/evidence/D2-EDITOR-CSR-CRF/2026-10-29-ana-evidence/punch-cd3-reconcile.ts
 * Writes punch-cd3-reconciliation.json beside this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCSRTables, type StudyData, type DispositionRecord } from '../../../../server/services/csr-tabulation-builders';
import { registerCsrSectionEvidenceHandlers } from '../../../../server/services/ana/csr-section-evidence-tool';
import type { RetainedCsrTables } from '../../../../server/services/csr/cortex-authoring-context';

const PROGRAM = '00000000-0000-4000-8000-000000002017';
const RUN = '00000000-0000-4000-8000-0000000c5d01';
const STUDY = '2017-01';

const rows = (armId: string, status: DispositionRecord['status'], n: number): DispositionRecord[] =>
  Array.from({ length: n }, () => ({ armId, status }));

const study: StudyData = {
  studyId: STUDY, protocolNumber: '2017-01',
  treatmentArms: [
    { armId: 'RBX', armName: 'RBX2660', randomized: 193, populations: { safety: 180, itt: 193, mitt: 177, perProtocol: 167, completed: 159 } },
    { armId: 'PBO', armName: 'Placebo', randomized: 96, populations: { safety: 87, itt: 96, mitt: 85, perProtocol: 78, completed: 75 } },
  ],
  disposition: [
    ...rows('RBX', 'completed', 159), ...rows('RBX', 'discontinued', 21), ...rows('RBX', 'other', 13),
    ...rows('PBO', 'completed', 75), ...rows('PBO', 'discontinued', 12), ...rows('PBO', 'other', 9),
  ],
  demographics: [],
  efficacy: [
    { endpointName: 'Treatment success within 8 weeks (mITT)', endpointType: 'primary', armId: 'RBX', value: 0.71, display: '126 (0.71)', comparatorArmId: 'PBO' },
    { endpointName: 'Treatment success within 8 weeks (mITT)', endpointType: 'primary', armId: 'PBO', value: 0.62, display: '53 (0.62)' },
  ],
  adverseEvents: [],
};

const retained: RetainedCsrTables = {
  runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: false,
  studies: [{ source: { documentId: '00000000-0000-4000-8000-00000000d0c1', version: 'transcription-2026-10-29',
    sha256: '0'.repeat(63) + '1', dataCutDate: 'unknown', studyId: STUDY, protocolNumber: '2017-01',
    clinicalVerification: 'not-established' }, tables: buildCSRTables(study) }],
};

/** [section, table, row label, column header prefix, FDA-reported figure, where FDA reports it]. */
const FDA: Array<[string, string, string, string, string, string]> = [
  ['10.1', 'disposition', 'Randomized', 'RBX2660', '193', 'Clinical Review Table 22'],
  ['10.1', 'disposition', 'Randomized', 'Placebo', '96', 'Clinical Review Table 22'],
  ['10.1', 'disposition', 'Discontinued (any reason)', 'RBX2660', '21', 'Clinical Review §6.2.10.1.3'],
  ['10.1', 'disposition', 'Discontinued (any reason)', 'Placebo', '12', 'Clinical Review §6.2.10.1.3'],
  ['10.1', 'disposition', 'Other', 'RBX2660', '13', 'Statistical Review Table 11 (not treated)'],
  ['10.1', 'disposition', 'Other', 'Placebo', '9', 'Statistical Review Table 11 (not treated)'],
  ['10.1', 'disposition', 'Randomized', 'Total', '289', 'Clinical Review Table 22'],
  ['11.4.1', 'analysisPopulations', 'Safety', 'RBX2660', '180', 'Clinical Review Table 22'],
  ['11.4.1', 'analysisPopulations', 'Safety', 'Placebo', '87', 'Clinical Review Table 22'],
  ['11.4.1', 'analysisPopulations', 'mITT', 'RBX2660', '177', 'Clinical Review Table 22; Statistical Review Table 11'],
  ['11.4.1', 'analysisPopulations', 'mITT', 'Placebo', '85', 'Clinical Review Table 22; Statistical Review Table 11'],
  ['11.4.1', 'analysisPopulations', 'Per-Protocol', 'RBX2660', '167', 'Clinical Review Table 22'],
  ['11.4.1', 'analysisPopulations', 'Per-Protocol', 'Placebo', '78', 'Clinical Review Table 22'],
  ['11.4.1', 'primaryEfficacy', 'RBX2660', 'Result', '126 (0.71)', 'Statistical Review Table 11 (mITT)'],
  ['11.4.1', 'primaryEfficacy', 'Placebo', 'Result', '53 (0.62)', 'Statistical Review Table 11 (mITT)'],
  // Deliberate drafting error: one success too many. Must not reconcile.
  ['11.4.1', 'primaryEfficacy', 'RBX2660', 'Result', '127 (0.71)', 'DELIBERATE ERROR (FDA: 126 (0.71))'],
];

async function main() {
  let handler: ((input: Record<string, unknown>, ctx?: never) => Promise<string>) | undefined;
  registerCsrSectionEvidenceHandlers((_name, h) => { handler = h as typeof handler; }, {
    pool: async () => ({ query: async () => ({ rows: [] }) }) as never,
    resolveProgram: async () => PROGRAM,
    load: async () => retained,
  });
  const ctx = { organizationId: 1, userId: 1, projectRef: PROGRAM } as never;
  const report: Record<string, unknown> = {};
  for (const section of ['10.1', '11.4.1']) {
    const pack = JSON.parse(await handler!({ run_id: RUN, study_id: STUDY, section }, ctx));
    const wanted = FDA.filter(f => f[0] === section);
    const located = wanted.map(([, table, label, header, value, where]) => {
      const t = pack.tables.find((x: { key: string }) => x.key === table);
      const column = t.headers.findIndex((h: string) => h.startsWith(header));
      const row = t.rows.findIndex((r: string[]) => r[0] === label || r[1] === label);
      return { claim: { table, row, column, value }, where, cell: t.rows[row]?.[column] ?? null };
    });
    const rec = JSON.parse(await handler!({ run_id: RUN, study_id: STUDY, section,
      evidence_digest: pack.evidence.evidence_digest, claims: located.map(l => l.claim) }, ctx));
    const bad = new Map((rec.not_reconciled ?? []).map((f: { index: number }) => [f.index, f]));
    report[section] = {
      evidence: pack.evidence, tables: pack.tables, missing_tables: pack.missing_tables,
      reconciliation: rec.reconciliation, counts: rec.counts,
      claims: located.map((l, i) => ({ fda_reported: l.claim.value, fda_source: l.where, table: l.claim.table,
        row: l.claim.row, column: l.claim.column, engine_cell: l.cell, result: bad.has(i) ? (bad.get(i) as { result: string }).result : 'matches' })),
    };
  }
  // Written to a file: the server logger shares stdout.
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'punch-cd3-reconciliation.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
