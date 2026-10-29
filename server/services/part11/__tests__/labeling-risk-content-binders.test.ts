/**
 * The content binders for a labeling document, a labeling translation and a
 * hazard's residual-risk acceptance (D5, 21 CFR Part 11 §11.70;
 * docs/evidence/D5-CONTENT-DIGEST-BINDERS/2026-10-29/).
 *
 * Each binder digests exactly the fields its signer attests to, by its named
 * recipe, through the one canonicalisation (sha256CanonicalJson). Pinned here
 * field by field: every attested field moves the digest, and every field the
 * signing act itself writes (status, the approval stamp, timestamps) or that
 * places the record rather than says what it is (project, assignee) does not,
 * so a signature re-derives after a later workflow step when nothing it
 * attested changed.
 *
 * And the writer's fail-closed rule: an act that declares the content basis
 * it binds is refused when its binder cannot bind, never signed over the
 * ledger chain hash instead.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTENT_BINDERS } from '../governed-target-binders';
import { BINDING_BASIS, canonicalJson, persistGovernedSignSignature } from '../signature-persistence';

type Row = Record<string, unknown>;
const ORG = 7;

const DOC: Row = {
  id: 11, organization_id: ORG, program_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', device_name: 'Aurora CGM', doc_kind: 'ifu',
  version: '2.1', status: 'review', language: 'en', region: 'us', udi_di: '00812345678906', effective_date: null,
  expires_at: '2029-01-31', artifact_id: null, metadata: {}, created_by: 3, approved_by: null, approved_at: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', deleted_at: null,
};
const SYMBOL: Row = { id: 1, symbol_code: '5.4.3', symbol_name: 'Consult instructions for use', description: 'Read the IFU', required_by: ['FDA', 'EU'], metadata: {}, created_at: 'x' };
const ARTIFACT: Row = { id: 40, content: 'Insert the sensor at a 90 degree angle.', version: 3 };
const TRANSLATION: Row = {
  id: 21, labeling_document_id: 11, organization_id: ORG, language: 'de', translator: 'A. Weber', translation_method: 'human',
  back_translation_verified: true, status: 'review', artifact_id: null, approved_by: null, approved_at: null, metadata: {},
  created_by: 3, created_at: 'x', updated_at: 'y',
};
const HAZARD: Row = {
  id: 31, organization_id: ORG, program_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ref_code: 'HZ-01', hazard: 'Sensor drift',
  hazardous_situation: 'Reading high while glucose falls', harm: 'Mis-dosing', sequence_of_events: 'Drift, then a missed low alert',
  severity: 4, probability: 3, detectability: 2, initial_risk: 12, residual_severity: 4, residual_probability: 1, residual_risk: 4,
  control_strategy: 'design_reduce', acceptable: null, benefit_risk_rationale: 'Benefit outweighs the residual', status: 'verified',
  source: 'fmea', assigned_to: 9, metadata: {}, created_at: 'x', updated_at: 'y', deleted_at: null,
};
const CONTROL: Row = {
  id: 1, risk_item_id: 31, organization_id: ORG, description: 'Factory calibration check', control_type: 'inherent_safety',
  implementation_evidence: null, verification_evidence: 'VER-0042', effectiveness_evidence: null, introduces_new_risk: false,
  new_risk_item_id: null, status: 'verified', created_at: 'x', updated_at: 'y',
};

interface World { doc?: Row | null; symbols?: Row[]; artifact?: Row | null; translation?: Row | null; hazard?: Row | null; controls?: Row[] }

/** A client that answers each binder read from `world`, recording every statement. */
function clientOf(world: World) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const rows = (r: Row | null | undefined) => ({ rows: r ? [r] : [] });
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/FROM labeling_symbols/.test(sql)) return { rows: world.symbols ?? [] };
      if (/FROM concept2cure_artifacts/.test(sql)) return rows(world.artifact);
      if (/FROM labeling_translations/.test(sql)) return rows(world.translation);
      if (/FROM labeling_documents/.test(sql)) return rows(world.doc);
      if (/FROM risk_controls/.test(sql)) return { rows: world.controls ?? [] };
      if (/FROM risk_items/.test(sql)) return rows(world.hazard);
      if (/INSERT INTO electronic_signatures/.test(sql)) throw new Error('nothing may be inserted');
      return { rows: [] };
    },
  };
  return { client, calls };
}

const noFallback = (why: string) => { throw new Error(`should not fall back: ${why}`); };
const fallback = (why: string) => ({ digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: why, fallbackReason: why });
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const bindDoc = (w: World, rest = '11') => CONTENT_BINDERS['labeling-document'](clientOf(w).client, rest, ORG, noFallback);
const bindTranslation = (w: World, rest = '21') => CONTENT_BINDERS['labeling-translation'](clientOf(w).client, rest, ORG, noFallback);
const bindHazard = (w: World, rest = '31') => CONTENT_BINDERS['risk-item'](clientOf(w).client, rest, ORG, noFallback);

const DOC_WORLD: World = { doc: DOC, symbols: [SYMBOL] };
const TRANSLATION_WORLD: World = { translation: TRANSLATION };
const HAZARD_WORLD: World = { hazard: HAZARD, controls: [CONTROL] };

describe('registration', () => {
  it.each(['labeling-document', 'labeling-translation', 'risk-item'])('%s has a content binder, so its signature never falls back silently', (prefix) => {
    expect(CONTENT_BINDERS[prefix]).toBeTypeOf('function');
  });

  it('names the three bases in the platform vocabulary', () => {
    expect(BINDING_BASIS).toMatchObject({
      LABELING_DOCUMENT_CONTENT: 'labeling-document-content-sha256',
      LABELING_TRANSLATION_CONTENT: 'labeling-translation-content-sha256',
      RISK_RESIDUAL_ACCEPTANCE_CONTENT: 'risk-residual-acceptance-content-sha256',
    });
  });
});

describe('labeling-document/v1', () => {
  it('digests the label by its recipe, organisation-scoped', async () => {
    const { client, calls } = clientOf(DOC_WORLD);
    const b = await CONTENT_BINDERS['labeling-document'](client, '11', ORG, noFallback);
    expect(b.basis).toBe('labeling-document-content-sha256');
    expect(b.digest).toBe(sha256(canonicalJson({
      recipe: 'labeling-document/v1', labelingDocumentId: 11, deviceName: 'Aurora CGM', docKind: 'ifu', version: '2.1', language: 'en',
      region: 'us', udiDi: '00812345678906', expiresAt: '2029-01-31', artifact: null,
      symbols: [{ symbolCode: '5.4.3', symbolName: 'Consult instructions for use', description: 'Read the IFU', requiredBy: ['FDA', 'EU'] }],
    })));
    expect(b.note).toMatch(/labeling-document\/v1/);
    for (const c of calls) expect(c.params).toEqual(expect.arrayContaining([ORG]));
  });

  it.each(['device_name', 'doc_kind', 'version', 'language', 'region', 'udi_di', 'expires_at'])('an edit of %s moves the digest', async (field) => {
    const before = await bindDoc(DOC_WORLD);
    const after = await bindDoc({ ...DOC_WORLD, doc: { ...DOC, [field]: `${String(DOC[field])}-edited` } });
    expect(after.digest).not.toBe(before.digest);
  });

  it.each(['symbol_code', 'symbol_name', 'description', 'required_by'])('an edit of a symbol\'s %s moves the digest', async (field) => {
    const before = await bindDoc(DOC_WORLD);
    const after = await bindDoc({ ...DOC_WORLD, symbols: [{ ...SYMBOL, [field]: field === 'required_by' ? ['FDA'] : 'edited' }] });
    expect(after.digest).not.toBe(before.digest);
  });

  it('a symbol added or removed moves the digest', async () => {
    const before = await bindDoc(DOC_WORLD);
    expect((await bindDoc({ ...DOC_WORLD, symbols: [] })).digest).not.toBe(before.digest);
    expect((await bindDoc({ ...DOC_WORLD, symbols: [SYMBOL, { ...SYMBOL, id: 2, symbol_code: '5.1.1' }] })).digest).not.toBe(before.digest);
  });

  it.each([
    ['status', 'approved'], ['approved_by', 5], ['approved_at', '2026-10-29T10:00:00Z'], ['effective_date', '2026-11-01'],
    ['updated_at', '2026-10-29T10:00:00Z'], ['created_at', 'z'], ['created_by', 4], ['program_id', null], ['metadata', { a: 1 }],
  ])('%s, written by the act or placing the record, does not move the digest', async (field, value) => {
    const before = await bindDoc(DOC_WORLD);
    expect((await bindDoc({ ...DOC_WORLD, doc: { ...DOC, [field]: value } })).digest).toBe(before.digest);
  });

  it('binds the text of the artifact it names, by the sha256 of its content, and an edit of that text moves the digest', async () => {
    const world = { ...DOC_WORLD, doc: { ...DOC, artifact_id: 40 }, artifact: ARTIFACT };
    const b = await bindDoc(world);
    expect(b.digest).toBe(sha256(canonicalJson({
      recipe: 'labeling-document/v1', labelingDocumentId: 11, deviceName: 'Aurora CGM', docKind: 'ifu', version: '2.1', language: 'en',
      region: 'us', udiDi: '00812345678906', expiresAt: '2029-01-31', artifact: { id: 40, contentSha256: sha256(String(ARTIFACT.content)) },
      symbols: [{ symbolCode: '5.4.3', symbolName: 'Consult instructions for use', description: 'Read the IFU', requiredBy: ['FDA', 'EU'] }],
    })));
    expect((await bindDoc({ ...world, artifact: { ...ARTIFACT, content: 'edited' } })).digest).not.toBe(b.digest);
    // The artifact's own version counter is not the text.
    expect((await bindDoc({ ...world, artifact: { ...ARTIFACT, version: 4 } })).digest).toBe(b.digest);
  });

  it('falls back, with its reason, when the label or the text it names cannot be read', async () => {
    const run = (w: World, rest = '11') => CONTENT_BINDERS['labeling-document'](clientOf(w).client, rest, ORG, fallback);
    expect((await run({ doc: null })).fallbackReason).toMatch(/labeling document/);
    expect((await run({ ...DOC_WORLD, doc: { ...DOC, artifact_id: 99 }, artifact: null })).fallbackReason).toMatch(/artifact 99/);
    expect((await run(DOC_WORLD, 'x')).fallbackReason).toMatch(/malformed/);
  });
});

describe('labeling-translation/v1', () => {
  it('digests the translation by its recipe', async () => {
    const b = await bindTranslation(TRANSLATION_WORLD);
    expect(b.basis).toBe('labeling-translation-content-sha256');
    expect(b.digest).toBe(sha256(canonicalJson({
      recipe: 'labeling-translation/v1', translationId: 21, labelingDocumentId: 11, language: 'de', translator: 'A. Weber',
      translationMethod: 'human', backTranslationVerified: true, artifact: null,
    })));
  });

  it.each([['labeling_document_id', 12], ['language', 'fr'], ['translator', 'B. Schmidt'], ['translation_method', 'machine'], ['back_translation_verified', false]])(
    'an edit of %s moves the digest', async (field, value) => {
      const before = await bindTranslation(TRANSLATION_WORLD);
      expect((await bindTranslation({ translation: { ...TRANSLATION, [field]: value } })).digest).not.toBe(before.digest);
    },
  );

  it.each([['status', 'approved'], ['approved_by', 5], ['approved_at', 'z'], ['updated_at', 'z'], ['created_by', 4], ['metadata', { a: 1 }]])(
    '%s does not move the digest', async (field, value) => {
      const before = await bindTranslation(TRANSLATION_WORLD);
      expect((await bindTranslation({ translation: { ...TRANSLATION, [field]: value } })).digest).toBe(before.digest);
    },
  );

  it('binds the translated text it names', async () => {
    const world = { translation: { ...TRANSLATION, artifact_id: 40 }, artifact: ARTIFACT };
    const b = await bindTranslation(world);
    expect((await bindTranslation({ ...world, artifact: { ...ARTIFACT, content: 'edited' } })).digest).not.toBe(b.digest);
  });
});

describe('risk-residual-acceptance/v1', () => {
  it('digests the hazard and its controls by the recipe, organisation-scoped', async () => {
    const { client, calls } = clientOf(HAZARD_WORLD);
    const b = await CONTENT_BINDERS['risk-item'](client, '31', ORG, noFallback);
    expect(b.basis).toBe('risk-residual-acceptance-content-sha256');
    expect(b.digest).toBe(sha256(canonicalJson({
      recipe: 'risk-residual-acceptance/v1', riskItemId: 31, refCode: 'HZ-01', hazard: 'Sensor drift',
      hazardousSituation: 'Reading high while glucose falls', harm: 'Mis-dosing', sequenceOfEvents: 'Drift, then a missed low alert',
      severity: 4, probability: 3, detectability: 2, initialRisk: 12, controlStrategy: 'design_reduce', source: 'fmea',
      residualSeverity: 4, residualProbability: 1, residualRisk: 4, benefitRiskRationale: 'Benefit outweighs the residual',
      controls: [{
        description: 'Factory calibration check', controlType: 'inherent_safety', implementationEvidence: null, verificationEvidence: 'VER-0042',
        effectivenessEvidence: null, introducesNewRisk: false, newRiskItemId: null, status: 'verified',
      }],
    })));
    for (const c of calls) expect(c.params).toEqual(expect.arrayContaining([ORG]));
  });

  it.each([
    'ref_code', 'hazard', 'hazardous_situation', 'harm', 'sequence_of_events', 'severity', 'probability', 'detectability', 'initial_risk',
    'control_strategy', 'source', 'residual_severity', 'residual_probability', 'residual_risk', 'benefit_risk_rationale',
  ])('an edit of %s moves the digest', async (field) => {
    const before = await bindHazard(HAZARD_WORLD);
    const value = typeof HAZARD[field] === 'number' ? Number(HAZARD[field]) + 1 : `${String(HAZARD[field])}-edited`;
    expect((await bindHazard({ ...HAZARD_WORLD, hazard: { ...HAZARD, [field]: value } })).digest).not.toBe(before.digest);
  });

  it.each([
    ['description', 'edited'], ['control_type', 'protective_measure'], ['implementation_evidence', 'IMP-1'], ['verification_evidence', 'none'],
    ['effectiveness_evidence', 'EFF-1'], ['introduces_new_risk', true], ['new_risk_item_id', 32], ['status', 'proposed'],
  ])('an edit of a control\'s %s moves the digest', async (field, value) => {
    const before = await bindHazard(HAZARD_WORLD);
    expect((await bindHazard({ ...HAZARD_WORLD, controls: [{ ...CONTROL, [field]: value }] })).digest).not.toBe(before.digest);
  });

  it.each([['status', 'accepted'], ['acceptable', true], ['assigned_to', 10], ['program_id', null], ['updated_at', 'z'], ['metadata', { a: 1 }]])(
    '%s, written by the act or placing the record, does not move the digest', async (field, value) => {
      const before = await bindHazard(HAZARD_WORLD);
      expect((await bindHazard({ ...HAZARD_WORLD, hazard: { ...HAZARD, [field]: value } })).digest).toBe(before.digest);
    },
  );

  it('falls back when the hazard cannot be read', async () => {
    const b = await CONTENT_BINDERS['risk-item'](clientOf({ hazard: null }).client, '31', ORG, fallback);
    expect(b.fallbackReason).toMatch(/risk item/);
  });
});

describe('the writer refuses a declared content basis it cannot bind', () => {
  const params = {
    orgId: ORG, userId: 5, target: 'labeling-document:11', reason: 'Checked against the design output', payload: { meaning: 'approval' },
    actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c'.repeat(64), authenticationMethod: 'password', secondFactorVerified: false,
    occurredAt: new Date('2026-10-29T10:00:00Z'),
  };

  it('a binder that falls back refuses the signature: SIGNATURE_CONTENT_UNBOUND, and nothing is inserted', async () => {
    const { client, calls } = clientOf({ doc: null });
    await expect(persistGovernedSignSignature(client, { ...params, requiredBasis: BINDING_BASIS.LABELING_DOCUMENT_CONTENT }))
      .rejects.toMatchObject({ code: 'SIGNATURE_CONTENT_UNBOUND' });
    expect(calls.some((c) => /electronic_signatures|FROM users/.test(c.sql))).toBe(false);
  });

  it('the refusal names why the content could not be bound', async () => {
    const { client } = clientOf({ ...DOC_WORLD, doc: { ...DOC, artifact_id: 99 } });
    await expect(persistGovernedSignSignature(client, { ...params, requiredBasis: BINDING_BASIS.LABELING_DOCUMENT_CONTENT }))
      .rejects.toThrow(/artifact 99.*Nothing was signed\.$/);
  });
});
