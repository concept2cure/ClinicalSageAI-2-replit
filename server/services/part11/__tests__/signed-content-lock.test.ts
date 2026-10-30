/**
 * The refusal of an edit to signed content reads the recipe's own attested-field
 * list (P-63), and the translation recipe binds its source (P-64). D5, 21 CFR
 * Part 11 §11.10(e), §11.70; docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/.
 *
 * "Cannot drift" is pinned both ways: every field on a recipe's list moves its
 * digest (so the list is not wider than the digest), the digest is the hand
 * recipe of the binder README (so it is not wider than the list), and the
 * refusal refuses exactly the list.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_BINDERS,
  LABELING_DOCUMENT_ATTESTATION,
  LABELING_TRANSLATION_ATTESTATION,
  LABELING_TRANSLATION_V1_ATTESTATION,
  RISK_RESIDUAL_ACCEPTANCE_ATTESTATION,
  type RecipeAttestation,
} from '../governed-target-binders';
import { BINDING_BASIS, canonicalJson } from '../signature-persistence';
import {
  SIGNED_CONTENT_LOCKED, lockedChildrenOf, lockedFieldsIn, lockedFieldsOf, signedContentRefusal, type SignedRecordKind,
} from '../signed-content-lock';

type Row = Record<string, unknown>;
const ORG = 7;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const DOC: Row = {
  device_name: 'Aurora CGM', doc_kind: 'ifu', version: '2.1', language: 'en', region: 'us', udi_di: '00812345678906',
  expires_at: '2029-01-31', artifact_id: null,
};
const SYMBOL: Row = { symbol_code: '5.4.3', symbol_name: 'Consult instructions for use', description: 'Read the IFU', required_by: ['FDA', 'EU'] };
const TRANSLATION: Row = {
  labeling_document_id: 11, language: 'de', translator: 'A. Weber', translation_method: 'human', back_translation_verified: true, artifact_id: null,
};
const HAZARD: Row = {
  ref_code: 'HZ-01', hazard: 'Sensor drift', hazardous_situation: 'Reading high', harm: 'Mis-dosing', sequence_of_events: 'Drift',
  severity: 4, probability: 3, detectability: 2, initial_risk: 12, control_strategy: 'design_reduce', source: 'fmea',
  residual_severity: 4, residual_probability: 1, residual_risk: 4, benefit_risk_rationale: 'Benefit outweighs the residual',
};
const CONTROL: Row = {
  description: 'Factory calibration check', control_type: 'inherent_safety', implementation_evidence: null, verification_evidence: 'VER-0042',
  effectiveness_evidence: null, introduces_new_risk: false, new_risk_item_id: null, status: 'verified',
};

interface World { doc?: Row | null; symbols?: Row[]; translation?: Row | null; hazard?: Row | null; controls?: Row[] }
function clientOf(w: World) {
  const rows = (r: Row | null | undefined) => ({ rows: r ? [r] : [] });
  return {
    query: async (sql: string) => {
      if (/FROM labeling_symbols/.test(sql)) return { rows: w.symbols ?? [] };
      if (/FROM labeling_translations/.test(sql)) return rows(w.translation);
      if (/FROM labeling_documents/.test(sql)) return rows(w.doc);
      if (/FROM risk_controls/.test(sql)) return { rows: w.controls ?? [] };
      if (/FROM risk_items/.test(sql)) return rows(w.hazard);
      return { rows: [] };
    },
  };
}
const noFallback = (why: string) => { throw new Error(`should not fall back: ${why}`); };
const fallback = (why: string) => ({ digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: why, fallbackReason: why });

const WORLD: World = { doc: DOC, symbols: [SYMBOL], translation: TRANSLATION, hazard: HAZARD, controls: [CONTROL] };
const bind = (prefix: string, rest: string, w: World, options?: Record<string, unknown>) =>
  CONTENT_BINDERS[prefix](clientOf(w) as never, rest, ORG, noFallback, options as never);

/** A value no fixture holds, of the column's own kind (an integer column takes a number, null included). */
const other = (v: unknown, int?: true): unknown => {
  if (int) return v == null ? 1 : Number(v) + 1;
  if (typeof v === 'boolean') return !v;
  if (Array.isArray(v)) return ['PMDA'];
  return v == null ? 'set' : `${String(v)}-edited`;
};

const RECORDS: Array<{ kind: SignedRecordKind; prefix: string; rest: string; table: 'doc' | 'translation' | 'hazard'; attestation: RecipeAttestation }> = [
  { kind: 'labeling-document', prefix: 'labeling-document', rest: '11', table: 'doc', attestation: LABELING_DOCUMENT_ATTESTATION },
  { kind: 'labeling-translation', prefix: 'labeling-translation', rest: '21', table: 'translation', attestation: LABELING_TRANSLATION_ATTESTATION },
  { kind: 'risk-item', prefix: 'risk-item', rest: '31', table: 'hazard', attestation: RISK_RESIDUAL_ACCEPTANCE_ATTESTATION },
];
const CHILD_ROW: Record<string, { key: 'symbols' | 'controls'; row: Row }> = {
  labeling_symbols: { key: 'symbols', row: SYMBOL },
  risk_controls: { key: 'controls', row: CONTROL },
};

describe.each(RECORDS)('$kind: the list the digest and the refusal both read', ({ kind, prefix, rest, table, attestation }) => {
  it.each(attestation.fields.map((f) => [f.field, f.column, f.int] as const))('%s (column %s) moves the digest', async (_field, column, int) => {
    const base = WORLD[table] as Row;
    const before = await bind(prefix, rest, WORLD);
    const after = await bind(prefix, rest, { ...WORLD, [table]: { ...base, [column]: other(base[column], int) } });
    expect(after.digest).not.toBe(before.digest);
  });

  it.each(Object.entries(attestation.children).flatMap(([t, fields]) => fields.map((f) => [t, f.column, f.int] as const)))(
    'a child row of %s: its %s moves the digest', async (t, column, int) => {
      const { key, row } = CHILD_ROW[t];
      const before = await bind(prefix, rest, WORLD);
      const after = await bind(prefix, rest, { ...WORLD, [key]: [{ ...row, [column]: other(row[column], int) }] });
      expect(after.digest).not.toBe(before.digest);
    },
  );

  it('the refusal refuses exactly the listed fields, the named text, and the signed act\'s own', () => {
    expect(lockedFieldsOf(kind)).toEqual([
      ...attestation.fields.map((f) => f.field),
      ...(attestation.textField ? [attestation.textField] : []),
      ...(kind === 'labeling-document' ? ['effectiveDate'] : []),
    ]);
    expect(lockedChildrenOf(kind)).toEqual(Object.keys(attestation.children));
  });
});

describe('the lists, as the binder README names them (an inspector\'s copy)', () => {
  it('a label: device, kind, version, language, region, UDI-DI, expiry, its text, its symbols; and its effective date', () => {
    expect(lockedFieldsOf('labeling-document')).toEqual(['deviceName', 'docKind', 'version', 'language', 'region', 'udiDi', 'expiresAt', 'artifactId', 'effectiveDate']);
    expect(LABELING_DOCUMENT_ATTESTATION.children.labeling_symbols.map((f) => f.field)).toEqual(['symbolCode', 'symbolName', 'description', 'requiredBy']);
  });

  it('a translation: language, translator, method, back-translation check, its text; v2 also binds its source', () => {
    expect(lockedFieldsOf('labeling-translation')).toEqual(['language', 'translator', 'translationMethod', 'backTranslationVerified', 'artifactId']);
    expect(LABELING_TRANSLATION_ATTESTATION).toMatchObject({ recipe: 'labeling-translation/v2', source: 'labeling-document' });
    expect(LABELING_TRANSLATION_V1_ATTESTATION).toMatchObject({ recipe: 'labeling-translation/v1', source: null, fields: LABELING_TRANSLATION_ATTESTATION.fields });
  });

  it('a hazard: the analysis, both estimates, the strategy, the source, the rationale; and every control with its evidence and status', () => {
    expect(lockedFieldsOf('risk-item')).toEqual([
      'refCode', 'hazard', 'hazardousSituation', 'harm', 'sequenceOfEvents', 'severity', 'probability', 'detectability', 'initialRisk',
      'controlStrategy', 'source', 'residualSeverity', 'residualProbability', 'residualRisk', 'benefitRiskRationale',
    ]);
    expect(RISK_RESIDUAL_ACCEPTANCE_ATTESTATION.children.risk_controls.map((f) => f.field)).toEqual([
      'description', 'controlType', 'implementationEvidence', 'verificationEvidence', 'effectivenessEvidence', 'introducesNewRisk', 'newRiskItemId', 'status',
    ]);
  });
});

describe('lockedFieldsIn and the refusal', () => {
  it('names the bound fields a patch sets, in the list\'s order, and nothing it leaves unset or does not bind', () => {
    expect(lockedFieldsIn('risk-item', { assignedTo: 9, harm: 'x', programId: null, severity: undefined, refCode: null, status: 'closed' })).toEqual(['refCode', 'harm']);
    expect(lockedFieldsIn('labeling-document', { programId: 'p', effectiveDate: '2026-12-01' })).toEqual(['effectiveDate']);
    expect(lockedFieldsIn('labeling-translation', { status: 'review' })).toEqual([]);
  });

  it('is a 409 with the one code, what is bound, the way to change it, and "Nothing was saved."', () => {
    const r = signedContentRefusal('labeling-document', 'effective', { fields: ['version', 'udiDi'] });
    expect(r.status).toBe(409);
    expect(r.details).toEqual({ code: SIGNED_CONTENT_LOCKED, record: 'labeling-document', recordStatus: 'effective', fields: ['version', 'udiDi'], child: null });
    expect(r.message).toBe(
      'This labeling document is effective, and its signature binds version, udiDi. A signed record is not edited in place (21 CFR 11.10(e), 11.70). ' +
      'To change it, issue a new version and supersede this one, or move it back to draft or review with a reason, which withdraws its approval; then sign it again. Nothing was saved.',
    );
    expect(signedContentRefusal('risk-item', 'accepted', { child: 'risk_controls' }).message).toMatch(
      /^This hazard's residual risk is accepted, and the acceptance signature binds its risk controls, with their evidence and status\..*reopen the acceptance, which is a signed act \(POST \/api\/mdx\/risk-items\/:id\/reopen\).*Nothing was saved\.$/,
    );
  });
});

describe('labeling-translation/v2 (P-64)', () => {
  const docDigest = async () => (await bind('labeling-document', '11', WORLD)).digest;
  const own = (recipe: string) => ({
    recipe, translationId: 21, labelingDocumentId: 11, language: 'de', translator: 'A. Weber', translationMethod: 'human', backTranslationVerified: true, artifact: null,
  });

  it('digests the translation and its source: the document version and its labeling-document/v1 digest', async () => {
    const b = await bind('labeling-translation', '21', WORLD);
    const contentDigest = await docDigest();
    expect(b.digest).toBe(sha256(canonicalJson({ ...own('labeling-translation/v2'), source: { version: '2.1', contentDigest } })));
    expect(b.manifest).toEqual({ bindingRecipe: 'labeling-translation/v2', boundSource: { target: 'labeling-document:11', version: '2.1', contentDigest } });
  });

  it.each([['the version', { version: '2.2' }], ['the UDI-DI', { udi_di: '00812345678913' }]])('a source edit of %s moves it', async (_w, edit) => {
    const before = await bind('labeling-translation', '21', WORLD);
    expect((await bind('labeling-translation', '21', { ...WORLD, doc: { ...DOC, ...edit } })).digest).not.toBe(before.digest);
  });

  it('a symbol added to the source moves it', async () => {
    const before = await bind('labeling-translation', '21', WORLD);
    expect((await bind('labeling-translation', '21', { ...WORLD, symbols: [SYMBOL, { ...SYMBOL, symbol_code: '5.1.1' }] })).digest).not.toBe(before.digest);
  });

  it('as of a recorded source, it is the digest signed then, whatever the source says now', async () => {
    const signed = await bind('labeling-translation', '21', WORLD);
    const asOf = await bind('labeling-translation', '21', { ...WORLD, doc: { ...DOC, version: '3.0' } }, { asOfSource: signed.manifest?.boundSource });
    expect(asOf.digest).toBe(signed.digest);
  });

  it('a source that cannot be bound falls back with its reason, so the approval refuses', async () => {
    const b = await CONTENT_BINDERS['labeling-translation'](clientOf({ ...WORLD, doc: { ...DOC, artifact_id: 99 } }) as never, '21', ORG, fallback);
    expect(b.fallbackReason).toMatch(/source document it translates cannot be bound.*artifact 99/);
  });

  it('v1, asked for by name, is the 84aada8f7 recipe exactly, and ignores the source', async () => {
    const v1 = await bind('labeling-translation', '21', WORLD, { recipe: 'labeling-translation/v1' });
    expect(v1.digest).toBe(sha256(canonicalJson(own('labeling-translation/v1'))));
    expect(v1.manifest).toEqual({ bindingRecipe: 'labeling-translation/v1' });
    expect((await bind('labeling-translation', '21', { ...WORLD, doc: null }, { recipe: 'labeling-translation/v1' })).digest).toBe(v1.digest);
  });

  it.each([
    ['labeling-translation', '21', 'labeling-translation/v9'], ['labeling-document', '11', 'labeling-document/v2'], ['risk-item', '31', 'risk-residual-acceptance/v0'],
  ])('%s: a recipe the binder does not derive falls back, never another recipe\'s digest', async (prefix, rest, recipe) => {
    const b = await CONTENT_BINDERS[prefix](clientOf(WORLD) as never, rest, ORG, fallback, { recipe } as never);
    expect(b.digest).toBeNull();
    expect(b.fallbackReason).toMatch(/is not one this binder derives/);
  });
});
