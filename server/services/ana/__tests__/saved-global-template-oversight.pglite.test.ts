/** Exact recorded regional identity is review input, never inferred from a title
 * or a current catalogue lookup. Fixture audit mutations are corruption probes. */
import { describe, expect, it } from 'vitest';
import { pg, DOCUMENT, sectionId, COHERENT, review, denied, replaceSections, walkPages } from './_saved-document-critique-fixture';

const TEMPLATE = '9f9f9f9f-3333-5333-8333-000000000001';
const contexts = [
  { registryId: 'US_BLA', region: 'US', agency: 'FDA' },
  { registryId: 'CA_NDS', region: 'CA', agency: 'Health_Canada' },
  { registryId: 'EU_CTA', region: 'EU', agency: 'EMA' },
  { registryId: 'JP_CTN', region: 'JP', agency: 'PMDA' },
  { registryId: null, region: 'GLOBAL', agency: 'ICH' },
];
const source = (filingContext: unknown = contexts[2]) => ({ id: TEMPLATE,
  entryId: filingContext && typeof filingContext === 'object' && 'registryId' in filingContext
    ? typeof filingContext.registryId === 'string' ? `registry:${filingContext.registryId}` : 'component:protocol'
    : 'registry:EU_CTA', version: 1, sha256: 'c'.repeat(64), kind: 'preparation', aiDraftable: false,
  authoringMode: 'manual', originalFormat: 'CTIS', limitations: ['Working preparation only; retain original source records.'], filingContext });
type FixtureSource = Omit<ReturnType<typeof source>, 'filingContext'> & { filingContext?: unknown };
async function seed(recordedSource: FixtureSource = source()) {
  await replaceSections(2);
  await pg.query('UPDATE authoring_documents SET title=$1,module=NULL,template_id=$2,provenance=$3 WHERE id=$4',
    ['Renamed regional draft', TEMPLATE, JSON.stringify({ source: 'template', templateSource: recordedSource }), DOCUMENT]);
  for (const n of [1, 2]) await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata,created_at)
    VALUES($1,$2,7,'CREATE','owner@example.test',$3,'2026-10-01')`,
  [DOCUMENT, sectionId(n), JSON.stringify({ templateSource: recordedSource, templateGuidance: {
    guidance_text: `Saved regional source instruction ${n}.`, regulatory_references: ['Recorded source basis'],
    compliance_checklist: ['Retain the current approved original records.'], source_reference: 'fixture/saved-regional-reference',
  } })]);
}

describe('saved regional template references remain exact through review and paging', () => {
  it.each(contexts)('retains recorded $region filing context independently of a renamed title', async filingContext => {
    await replaceSections(2);
    const plain = await review();
    const recordedSource = source(filingContext);
    await seed(recordedSource);
    const { first, items } = await walkPages();
    expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', templateId: TEMPLATE,
      source: expect.objectContaining({ filingContext, entryId: recordedSource.entryId }) }));
    expect(first.documentScore).toBe(plain.documentScore);
    expect(first.precisionVerdict).toBe(plain.precisionVerdict);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
    expect(items.filter(item => item.kind === 'section')).toHaveLength(2);
    expect(JSON.stringify(items)).not.toContain('Renamed regional draft');
  });

  it('invalidates pinned continuation when only the recorded regional context changes', async () => {
    await seed();
    const first = await review();
    const changed = source({ registryId: 'JP_CTN', region: 'JP', agency: 'PMDA' });
    await pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2', [JSON.stringify({ source: 'template', templateSource: changed }), DOCUMENT]);
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource}',$1) WHERE doc_id=$2", [JSON.stringify(changed), DOCUMENT]);
    await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
  });

  it('refuses section CREATE context that conflicts with the saved document context', async () => {
    await seed();
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource,filingContext}',$1) WHERE section_id=$2",
      [JSON.stringify(contexts[0]), sectionId(1)]);
    await denied();
  });

  it.each([null, [], { registryId: 17, region: 'EU', agency: 'EMA' },
    { registryId: 'EU_CTA', region: 'EMEA', agency: 'EMA' },
    { registryId: 'EU_CTA', region: 'EU', agency: '' },
    { region: 'EU', agency: 'EMA' },
  ].map(filingContext => ({ filingContext })))('refuses malformed present filing context instead of silently discarding it: %j', async ({ filingContext }) => {
    await seed(source(filingContext));
    await denied();
  });


  it('refuses a regional source whose required filing context is missing', async () => {
    const missing: FixtureSource = { ...source() };
    delete missing.filingContext;
    await seed(missing);
    await denied();
  });

  it('refuses a recorded filing identity that disagrees with its source entry ID', async () => {
    await seed({ ...source(), filingContext: contexts[0] });
    await denied();
  });

  it('preserves old recorded sources that never carried optional filing context', async () => {
    const legacy: FixtureSource = { ...source(), entryId: 'section:m1.1.1' };
    delete legacy.filingContext;
    await seed(legacy);
    const { items } = await walkPages();
    const identity = (items.find(item => item.kind === 'template-source') as unknown as { source: Record<string, unknown> }).source;
    expect(identity.filingContext).toBeUndefined();
    expect(identity.entryId).toBe('section:m1.1.1');
  });
});
