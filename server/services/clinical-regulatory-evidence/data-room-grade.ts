/**
 * The grade of a data-room capture (S2, the data room catalog; the founder,
 * 2026-11-06: "that data is essentially graded").
 *
 * Nothing graded a captured item. The classifier's confidence says how sure it
 * is of a folder, not how much the data can be trusted, and AnA's
 * score_rwe_data_source is stored nowhere. This is the grade: a deterministic
 * function of facts the system already holds about the capture, with every
 * fact it used shown beside it (RULE 2: the engine computes, the model only
 * narrates). Six criteria:
 *
 *   provenance    the SHA-256 recorded at capture, who captured it, how it arrived;
 *   integrity     the original bytes held, the Vault copy's bytes the same, fixity proven;
 *   currency      current, or superseded by a later capture;
 *   processing    read in full, in part, or not read;
 *   verification  the Vault catalog record confirmed or corrected by a person;
 *   conformance   for a dataset, the CDISC validators over the profiled structure
 *                 (cdisc-conformance-service.ts, the engines behind AnA's
 *                 validate_sdtm_dataset / validate_adam_dataset); not applicable otherwise.
 *
 * A criterion that does not apply leaves the denominator; a fact the system
 * does not hold (fixity never checked, nothing confirmed) earns nothing and
 * says so. Two caps: a withdrawn capture is D, a superseded one at most C.
 *
 * The grade is stored on the capture (grade, grade_score, grade_basis,
 * grade_engine, graded_at: additive columns, migrations/20261106_data_room_grade.sql)
 * and rewritten only when the facts it was computed from change: the basis
 * carries a fingerprint of them.
 */
import { createHash } from 'node:crypto';
import { validateAdamDataset, validateSdtmDataset, type VariableInput } from '../cdisc/cdisc-conformance-service.js';

export const DATA_ROOM_GRADE_ENGINE = 'data-room-grade v1' as const;

export type DataRoomGradeLetter = 'A' | 'B' | 'C' | 'D';
export type GradeCriterion = 'provenance' | 'integrity' | 'currency' | 'processing' | 'verification' | 'conformance';

export interface GradeBasisLine {
  criterion: GradeCriterion;
  /** Points earned; null when the criterion does not apply to this capture. */
  points: number | null;
  max: number;
  /** What was found, in words, from the fact itself. */
  detail: string;
}

export interface DataRoomGrade {
  grade: DataRoomGradeLetter;
  /** 0–100 over the criteria that apply. */
  score: number;
  basis: GradeBasisLine[];
  /** A cap that held the letter below the score's, when one did. */
  cap: string | null;
  engine: typeof DATA_ROOM_GRADE_ENGINE;
  /** SHA-256 over the facts; the stored grade is rewritten only when this changes. */
  factsFingerprint: string;
}

/** A profiled table of a dataset capture (dataset-profile.ts), structure only. */
export interface GradeProfiledTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  cdisc: { standard: 'SDTM' | 'ADaM' | null; domain: string | null } | null;
}

/** Everything the grade reads, each a recorded fact. */
export interface DataRoomGradeFacts {
  checksum: string | null;
  capturedBy: number | null;
  origin: string | null;
  originalFileAvailable: boolean;
  isCurrent: boolean;
  dataEligible: boolean;
  disposition: 'keep_data' | 'remove_data' | 'supersede' | null;
  extractionStatus: string | null;
  textAvailable: boolean | null;
  /** OCR stopped short of the whole document. */
  extractionPartial: boolean;
  /** The program's Vault holds these bytes (the checksum join filing uses). */
  filed: boolean;
  /** The latest fixity verdict on that Vault copy (vault-fixity.ts), or null when never checked. */
  fixity: string | null;
  /** That copy's catalog record: suggested, confirmed or corrected (vault.document_catalog.catalog_state). */
  catalogState: string | null;
  /** The dataset profile's tables, when the capture is a dataset; null otherwise. */
  datasetTables: GradeProfiledTable[] | null;
}

const MAX: Record<GradeCriterion, number> = {
  provenance: 20, integrity: 20, currency: 15, processing: 15, verification: 15, conformance: 15,
};

const SHA256_RE = /^[0-9a-f]{64}$/i;

function provenance(f: DataRoomGradeFacts): GradeBasisLine {
  const hash = Boolean(f.checksum && SHA256_RE.test(f.checksum.trim()));
  const points = (hash ? 10 : 0) + (f.capturedBy !== null ? 5 : 0) + (f.origin ? 5 : 0);
  const said = [
    hash ? 'SHA-256 recorded at capture' : 'no SHA-256 recorded',
    f.capturedBy !== null ? 'who captured it is recorded' : 'who captured it is not recorded',
    f.origin ? `arrived by ${f.origin.replace(/_/g, ' ')}` : 'how it arrived is not recorded',
  ];
  return { criterion: 'provenance', points, max: MAX.provenance, detail: `${said.join('; ')}.` };
}

function integrity(f: DataRoomGradeFacts): GradeBasisLine {
  let points = f.originalFileAvailable ? 10 : 0;
  const said = [f.originalFileAvailable ? 'original bytes held' : 'original bytes not available'];
  if (f.filed) { points += 5; said.push('the same bytes are filed in Vault'); }
  else said.push('not filed in Vault');
  if (f.fixity === 'verified') { points += 5; said.push('fixity proven'); }
  else if (f.fixity) said.push(`last fixity check: ${f.fixity}`);
  else said.push(f.filed ? 'fixity not yet checked' : 'fixity not checked');
  return { criterion: 'integrity', points, max: MAX.integrity, detail: `${said.join('; ')}.` };
}

function currency(f: DataRoomGradeFacts): GradeBasisLine {
  return f.isCurrent
    ? { criterion: 'currency', points: MAX.currency, max: MAX.currency, detail: 'Current: no later capture replaced it.' }
    : { criterion: 'currency', points: 0, max: MAX.currency, detail: 'Superseded by a later capture.' };
}

function processing(f: DataRoomGradeFacts): GradeBasisLine {
  const dataset = f.datasetTables !== null && f.datasetTables.length > 0;
  if (dataset) {
    return { criterion: 'processing', points: MAX.processing, max: MAX.processing, detail: `Structure read: ${f.datasetTables!.length} table${f.datasetTables!.length === 1 ? '' : 's'} profiled.` };
  }
  if (f.textAvailable && f.extractionPartial) {
    return { criterion: 'processing', points: 8, max: MAX.processing, detail: 'Read in part: the text covers only some pages.' };
  }
  if (f.textAvailable) return { criterion: 'processing', points: MAX.processing, max: MAX.processing, detail: 'Read in full: its text is available.' };
  const status = f.extractionStatus ? ` (${f.extractionStatus.replace(/_/g, ' ')})` : '';
  return { criterion: 'processing', points: 0, max: MAX.processing, detail: `Not read: no text is available${status}.` };
}

function verification(f: DataRoomGradeFacts): GradeBasisLine {
  if (f.catalogState === 'confirmed' || f.catalogState === 'corrected') {
    return { criterion: 'verification', points: MAX.verification, max: MAX.verification, detail: `Its Vault catalog record was ${f.catalogState} by a person.` };
  }
  if (f.filed) {
    return { criterion: 'verification', points: 5, max: MAX.verification, detail: f.catalogState === 'suggested' ? 'Filed; its catalog record is a suggestion no person has confirmed.' : 'Filed; no catalog record yet.' };
  }
  return { criterion: 'verification', points: 0, max: MAX.verification, detail: 'No person has confirmed what it is: not filed in Vault.' };
}

const VAR_TYPE: Record<string, VariableInput['type'] | undefined> = { number: 'Num', text: 'Char', date: 'Char' };

/** The CDISC validators over each profiled CDISC table; findings named per table. */
function conformance(f: DataRoomGradeFacts): GradeBasisLine {
  const tables = f.datasetTables;
  if (!tables || tables.length === 0) {
    return { criterion: 'conformance', points: null, max: MAX.conformance, detail: 'Not a dataset: CDISC conformance does not apply.' };
  }
  const cdisc = tables.filter((t) => t.cdisc?.standard === 'SDTM' || t.cdisc?.standard === 'ADaM');
  if (cdisc.length === 0) {
    return { criterion: 'conformance', points: 0, max: MAX.conformance, detail: 'A dataset with no CDISC standard recognized in its columns.' };
  }
  let clean = 0;
  const notes: string[] = [];
  for (const t of cdisc) {
    const variables = t.columns.map((c) => ({ name: c.name, ...(VAR_TYPE[c.type] ? { type: VAR_TYPE[c.type] } : {}) }));
    const name = (t.cdisc?.domain || t.name).toUpperCase();
    try {
      const r = t.cdisc?.standard === 'ADaM'
        ? validateAdamDataset({ dataset: name, variables })
        : validateSdtmDataset({ domain: name, variables });
      const errors = r.findings.filter((x) => x.severity === 'error').length;
      if (errors === 0) clean += 1;
      else notes.push(`${name}: ${errors} error${errors === 1 ? '' : 's'}`);
    } catch (e) {
      notes.push(`${name}: not validated (${e instanceof Error ? e.message : 'refused'})`);
    }
  }
  const points = Math.round((MAX.conformance * clean) / tables.length);
  const head = `${clean} of ${tables.length} table${tables.length === 1 ? '' : 's'} pass the ${[...new Set(cdisc.map((t) => t.cdisc!.standard))].join('/')} validator with no error`;
  return { criterion: 'conformance', points, max: MAX.conformance, detail: `${head}${notes.length ? ` (${notes.join('; ')})` : ''}. Structural subset, not the validator of record.` };
}

const letterOf = (score: number): DataRoomGradeLetter => (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : 'D');
const RANK: Record<DataRoomGradeLetter, number> = { A: 4, B: 3, C: 2, D: 1 };

/** A stable fingerprint of the facts: the same facts always give the same grade, and the same fingerprint. */
export function gradeFactsFingerprint(f: DataRoomGradeFacts): string {
  const ordered = Object.keys(f).sort().map((k) => [k, (f as unknown as Record<string, unknown>)[k]]);
  return createHash('sha256').update(JSON.stringify([DATA_ROOM_GRADE_ENGINE, ordered])).digest('hex');
}

/** The grade of one capture from its facts. Pure and deterministic. */
export function gradeCapture(f: DataRoomGradeFacts): DataRoomGrade {
  const basis = [provenance(f), integrity(f), currency(f), processing(f), verification(f), conformance(f)];
  const applied = basis.filter((b) => b.points !== null);
  const max = applied.reduce((n, b) => n + b.max, 0);
  const earned = applied.reduce((n, b) => n + (b.points ?? 0), 0);
  const score = max === 0 ? 0 : Math.round((100 * earned) / max);
  let grade = letterOf(score);
  let cap: string | null = null;
  const withdrawn = !f.dataEligible || f.disposition === 'remove_data';
  if (withdrawn && grade !== 'D') { grade = 'D'; cap = 'Withdrawn from use: graded D whatever its other facts.'; }
  else if (!f.isCurrent && RANK[grade] > RANK.C) { grade = 'C'; cap = 'Superseded: graded at most C; use the current capture.'; }
  if (f.fixity && f.fixity !== 'verified' && f.fixity !== 'unverifiable' && grade !== 'D') {
    grade = 'D'; cap = `Its Vault copy failed a fixity check (${f.fixity}): graded D.`;
  }
  return { grade, score, basis, cap, engine: DATA_ROOM_GRADE_ENGINE, factsFingerprint: gradeFactsFingerprint(f) };
}

/* ── The facts, read ─────────────────────────────────────────────────────── */

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** A capture as the catalog read returns it, with the fields the grade reads. */
export interface GradeableSource {
  id: number;
  organizationId: number;
  checksum: string | null;
  isCurrent: boolean;
  dataEligible?: boolean;
  originalFileAvailable?: boolean;
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
  extractionStatus: string | null;
  textAvailable?: boolean | null;
  metadata?: Record<string, unknown> | null;
  provenance?: Record<string, unknown> | null;
}

const obj = (v: unknown): Record<string, any> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null);

/** The dataset profile's tables, when the capture carries one. */
function profiledTables(meta: Record<string, any> | null): GradeProfiledTable[] | null {
  const profile = obj(meta?.datasetProfile);
  if (!profile || !Array.isArray(profile.tables)) return null;
  return profile.tables
    .map((t: unknown) => obj(t))
    .filter((t: Record<string, any> | null): t is Record<string, any> => Boolean(t && typeof t.name === 'string' && Array.isArray(t.columns)))
    .map((t: Record<string, any>) => ({
      name: String(t.name),
      columns: (t.columns as unknown[]).map((c) => obj(c)).filter((c): c is Record<string, any> => Boolean(c && typeof c.name === 'string'))
        .map((c) => ({ name: String(c.name), type: String(c.type ?? '') })),
      cdisc: obj(t.cdisc) ? { standard: (t.cdisc.standard ?? null), domain: (t.cdisc.domain ?? null) } : null,
    }));
}

interface VaultFacts { filed: boolean; fixity: string | null; catalogState: string | null; capturedBy: number | null }

/**
 * For each capture, what the Vault and the audit chain record about it: whether
 * the program's Vault holds its bytes (the filing join), that copy's latest
 * fixity verdict and its catalog record's state; and who captured it.
 */
async function readVaultFacts(q: Queryable, ids: number[]): Promise<Map<number, VaultFacts>> {
  const out = new Map<number, VaultFacts>();
  if (ids.length === 0) return out;
  const { rows } = await q.query(
    `SELECT s.id, s.created_by, d.id AS document_id, dc.catalog_state, fx.verdict
       FROM cre_evidence_sources s
       LEFT JOIN LATERAL (
         SELECT vd.id FROM vault.documents vd
          WHERE vd.program_id = s.client_program_id AND vd.organization_id = s.organization_id
            AND vd.deleted_at IS NULL AND s.checksum IS NOT NULL AND vd.content_hash = trim(s.checksum)
          ORDER BY vd.created_at LIMIT 1
       ) d ON TRUE
       LEFT JOIN vault.document_catalog dc ON dc.document_id = d.id
       LEFT JOIN LATERAL (
         SELECT a.new_values->>'verdict' AS verdict FROM audit_logs a
          WHERE d.id IS NOT NULL AND a.action = 'vault.document.fixity' AND a.record_id = d.id::text
            AND a.tenant_id = s.organization_id
          ORDER BY a.occurred_at DESC LIMIT 1
       ) fx ON TRUE
      WHERE s.id = ANY($1::int[])`,
    [ids],
  );
  for (const r of rows) {
    out.set(Number(r.id), {
      filed: r.document_id != null,
      fixity: r.verdict ?? null,
      catalogState: r.catalog_state ?? null,
      capturedBy: r.created_by == null ? null : Number(r.created_by),
    });
  }
  return out;
}

const NO_VAULT_FACTS: VaultFacts = { filed: false, fixity: null, catalogState: null, capturedBy: null };

/** How the capture arrived and whether its reading stopped short, from its provenance. */
function provenanceFacts(provenance: GradeableSource['provenance']): { origin: string | null; extractionPartial: boolean } {
  const prov = obj(provenance);
  const coverage = obj(prov?.extractionCoverage);
  return { origin: typeof prov?.origin === 'string' ? prov.origin : null, extractionPartial: Boolean(coverage?.limitedBy) };
}

/** The facts of one capture, from its row and what the Vault records. */
export function gradeFactsOf(s: GradeableSource, vault: VaultFacts = NO_VAULT_FACTS): DataRoomGradeFacts {
  return {
    checksum: s.checksum ?? null,
    ...provenanceFacts(s.provenance),
    originalFileAvailable: s.originalFileAvailable !== false,
    isCurrent: s.isCurrent !== false,
    dataEligible: s.dataEligible !== false,
    disposition: s.disposition ?? null,
    extractionStatus: s.extractionStatus ?? null,
    textAvailable: s.textAvailable ?? null,
    ...vault,
    datasetTables: profiledTables(obj(s.metadata)),
  };
}

/** A grade as a catalog row carries it. */
export interface StoredGrade {
  grade: DataRoomGradeLetter;
  score: number;
  basis: GradeBasisLine[];
  cap: string | null;
  engine: string;
  gradedAt: string;
}

/**
 * Grade a page of captures, and store each grade whose facts changed since it
 * was last stored (only the derived grade columns are written; the capture
 * guard leaves them mutable). Answers each capture's grade by id. A store that
 * fails leaves the computed grade answered, never a missing one.
 */
export async function gradeSources(q: Queryable, sources: GradeableSource[]): Promise<Map<number, StoredGrade>> {
  const out = new Map<number, StoredGrade>();
  if (sources.length === 0) return out;
  const ids = sources.map((s) => s.id);
  const vault = await readVaultFacts(q, ids);
  const stored = await q.query(
    `SELECT id, grade_basis->>'factsFingerprint' AS fp, graded_at FROM cre_evidence_sources WHERE id = ANY($1::int[])`,
    [ids],
  ).then((r) => new Map(r.rows.map((x: any) => [Number(x.id), { fp: x.fp as string | null, gradedAt: x.graded_at as Date | null }])))
    .catch(() => new Map<number, { fp: string | null; gradedAt: Date | null }>());
  const changed: Array<{ id: number; g: DataRoomGrade }> = [];
  const now = new Date();
  for (const s of sources) {
    const g = gradeCapture(gradeFactsOf(s, vault.get(s.id)));
    const prior = stored.get(s.id);
    const same = prior?.fp === g.factsFingerprint && prior.gradedAt;
    if (!same) changed.push({ id: s.id, g });
    out.set(s.id, {
      grade: g.grade, score: g.score, basis: g.basis, cap: g.cap, engine: g.engine,
      gradedAt: (same ? new Date(prior!.gradedAt as Date) : now).toISOString(),
    });
  }
  if (changed.length) {
    await q.query(
      `UPDATE cre_evidence_sources s
          SET grade = x.grade, grade_score = x.score, grade_basis = x.basis, grade_engine = $4, graded_at = now()
         FROM unnest($1::int[], $2::text[], $3::int[], $5::jsonb[]) AS x(id, grade, score, basis)
        WHERE s.id = x.id`,
      [
        changed.map((c) => c.id), changed.map((c) => c.g.grade), changed.map((c) => c.g.score), DATA_ROOM_GRADE_ENGINE,
        changed.map((c) => JSON.stringify({ basis: c.g.basis, cap: c.g.cap, factsFingerprint: c.g.factsFingerprint })),
      ],
    ).catch(() => undefined);
  }
  return out;
}
