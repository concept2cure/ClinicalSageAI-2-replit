/** Actual saved template records, canonical current access and complete bounded
 * reference pages. This fixture does not qualify live RLS or provider behavior. */
import { describe, expect, it } from 'vitest';
import { indTemplateId } from '../../authoring/ind-authoring-templates';
import { pg, DOCUMENT, sectionId, COHERENT, statements, review, denied, replaceSections, walkPages,
  type ReviewItem } from './_saved-document-critique-fixture';

const TEMPLATE = indTemplateId('section:m1.1.1');
const OTHER_TEMPLATE = '33333333-2222-4333-8444-000000000002';
const SAVED_LIMIT = 'Keep the original sponsor-signed FDA form; this worksheet cannot replace it.';
const SAVED_GUIDE = 'Verify the retained form identity, sponsor name and current IND number against the original.';
const source = (id = TEMPLATE) => ({ id, entryId: 'section:m1.1.1', version: 1, sha256: 'a'.repeat(64),
  kind: 'preparation', aiDraftable: false, authoringMode: 'form', originalFormat: 'pdf', limitations: [SAVED_LIMIT] });
const guidance = (text = SAVED_GUIDE) => ({ guidance_text: text, regulatory_references: ['21 CFR 312.23(a)(1)'],
  compliance_checklist: ['Verify original signature and source identity.'], common_pitfalls: ['Do not invent an IND number.'],
  source_reference: 'fixture/recorded-guidance-reference' });

async function seedTemplate(recorded = true, id = TEMPLATE) {
  await replaceSections(2);
  await pg.query('UPDATE authoring_documents SET title=$1,module=$2,template_id=$3,provenance=$4 WHERE id=$5',
    ['Renamed administrative working document', 'M1', id, JSON.stringify({ source: 'template', templateSource: source(id) }), DOCUMENT]);
  await pg.query("UPDATE authoring_sections SET code='1.1.1' WHERE doc_id=$1", [DOCUMENT]);
  if (recorded) for (const n of [1, 2]) {
    await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata,created_at)
      VALUES($1,$2,7,'CREATE','owner@example.test',$3,'2026-10-01')`,
    [DOCUMENT, sectionId(n), JSON.stringify({ templateSource: source(id), templateGuidance: guidance(`${SAVED_GUIDE} Saved section ${n}.`) })]);
  }
}

async function currentGuidance(id = TEMPLATE, tenant = 7, text = 'Current reference differs from the saved seed.') {
  await pg.query(`INSERT INTO template_guidance(template_id,tenant_id,section_name,section_code,guidance_text,compliance_checklist)
    VALUES($1,$2,'Saved section guidance','1.1.1',$3,'[]')`, [id, tenant, text]);
}

/** Reference must be exposed separately, never added to the scored section prose. */
function referenceItems(items: ReviewItem[]): Array<ReviewItem & Record<string, unknown>> {
  return items.filter(item => item.kind === 'template-reference') as Array<ReviewItem & Record<string, unknown>>;
}

describe('saved template oversight preserves recorded identity and reference limits', () => {
  it('reviews a renamed FDA form preparation worksheet with exact saved limits separate from scored prose', async () => {
    await replaceSections(2);
    const plain = await review();
    await seedTemplate();
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: TEMPLATE, sourceState: 'recorded', kind: 'preparation', aiDraftable: false });
    const identity = { ...source() } as Partial<ReturnType<typeof source>>;
    delete identity.limitations;
    expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', source: identity, limitationCount: 1 }));
    const references = referenceItems(items);
    expect(references).toContainEqual(expect.objectContaining({ templateId: TEMPLATE, sectionId: null,
      authority: 'recorded', field: 'limitations', itemIndex: 0, text: SAVED_LIMIT }));
    for (const n of [1, 2]) expect(references).toContainEqual(expect.objectContaining({ templateId: TEMPLATE,
      sectionId: sectionId(n), authority: 'recorded', field: 'guidance_text', text: `${SAVED_GUIDE} Saved section ${n}.` }));
    expect(first.documentScore).toBe(plain.documentScore);
    expect(first.precisionVerdict).toBe(plain.precisionVerdict);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
    expect(items.filter(item => item.kind === 'section')).toHaveLength(2);
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('retains earliest recorded guidance when current references and later CREATE rows differ', async () => {
    await seedTemplate();
    await currentGuidance();
    await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata,created_at)
      VALUES($1,$2,7,'CREATE','owner@example.test',$3,'2026-10-03')`,
    [DOCUMENT, sectionId(1), JSON.stringify({ templateSource: source(), templateGuidance: guidance('Later metadata must not replace the seed.') })]);
    const { items } = await walkPages();
    expect(JSON.stringify(items)).toContain(`${SAVED_GUIDE} Saved section 1.`);
    expect(JSON.stringify(items)).not.toContain('Current reference differs');
    expect(JSON.stringify(items)).not.toContain('Later metadata must not replace');
  });

  it('isolates current guidance by exact template and tenant even when section codes are identical', async () => {
    await seedTemplate(false, OTHER_TEMPLATE);
    await currentGuidance(TEMPLATE, 7, 'Another template with the same code is private to that template.');
    await currentGuidance(OTHER_TEMPLATE, 8, 'Another tenant guidance must never appear.');
    await currentGuidance(OTHER_TEMPLATE, 7, 'Exact current reference for the saved template.');
    const { items } = await walkPages();
    const references = referenceItems(items);
    expect(references).toContainEqual(expect.objectContaining({ templateId: OTHER_TEMPLATE, sectionId: sectionId(1),
      authority: 'current-reference', field: 'guidance_text', text: 'Exact current reference for the saved template.' }));
    expect(JSON.stringify(items)).not.toContain('Another template with the same code');
    expect(JSON.stringify(items)).not.toContain('Another tenant guidance');
  });

  it('uses an exact active global fallback only when saved and tenant-specific guidance are absent', async () => {
    await seedTemplate(false);
    await pg.query('INSERT INTO intelligence.document_templates(id,status) VALUES($1,$2),($3,$2)', [TEMPLATE, 'active', OTHER_TEMPLATE]);
    await pg.query(`INSERT INTO intelligence.template_sections(template_id,section_code,section_title,ordering,content_guidance,required_elements)
      VALUES($1,'1.1.1','Reference form',0,$2,'[]'),($3,'1.1.1','Other reference',0,$4,'[]')`,
    [TEMPLATE, 'Exact current global reference.', OTHER_TEMPLATE, 'Wrong global template with the same code.']);
    const { items } = await walkPages();
    expect(referenceItems(items)).toContainEqual(expect.objectContaining({ templateId: TEMPLATE, sectionId: sectionId(1),
      authority: 'current-reference', field: 'guidance_text', text: 'Exact current global reference.' }));
    expect(JSON.stringify(items)).not.toContain('Wrong global template');
  });

});

describe('recorded reference changes invalidate the saved review snapshot', () => {
  it.each(['source limitation', 'source identity hash', 'recorded guidance', 'current reference'] as const)(
    'invalidates continuation after %s drift without an authored-text timestamp change', async changed => {
      await seedTemplate(changed !== 'current reference');
      if (changed === 'current reference') await currentGuidance();
      const first = await review();
      if (changed === 'recorded guidance') {
        // Corruption probe in the isolated mutable fixture; production audit
        // immutability is exercised by its own canonical migration tests.
        await pg.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateGuidance,guidance_text}',$1)
          WHERE section_id=$2`, [JSON.stringify('Changed recorded requirements.'), sectionId(1)]);
      } else if (changed === 'current reference') {
        await pg.query('UPDATE template_guidance SET guidance_text=$1 WHERE template_id=$2', ['Changed current requirements.', TEMPLATE]);
      } else {
        const altered = { ...source(), ...(changed === 'source limitation'
          ? { limitations: ['Changed original-record limit.'] } : { sha256: 'b'.repeat(64) }) };
        await pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2', [JSON.stringify({ source: 'template', templateSource: altered }), DOCUMENT]);
      }
      await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
      expect((await pg.query<{ updated_at: Date }>('SELECT updated_at FROM authoring_documents WHERE id=$1', [DOCUMENT])).rows[0].updated_at)
        .toEqual(new Date('2026-10-02T00:00:00Z'));
    },
  );

});

describe('template references page completely within the model result budget', () => {
  it('pages every long escaped Unicode reference part without omissions or broken surrogate pairs', async () => {
    await seedTemplate();
    const long = '"Original" \\ αβé 👩🏾‍🔬 🧪\nPreserve the signed source. '.repeat(240);
    await pg.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateGuidance,guidance_text}',$1)
      WHERE section_id=$2`, [JSON.stringify(long), sectionId(1)]);
    const { pages, items } = await walkPages();
    const parts = referenceItems(items).filter(item => item.sectionId === sectionId(1) && item.field === 'guidance_text');
    expect(pages.length).toBeGreaterThan(1);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(item => item.text).join('')).toBe(long);
    let offset = 0;
    for (const part of parts) {
      expect(part.templateId).toBe(TEMPLATE);
      expect(part.authority).toBe('recorded');
      expect(part.itemIndex).toBe(0);
      expect(part.fieldTotalChars).toBe(long.length);
      expect(part.partOffset).toBe(offset);
      expect(part.text).toBeTypeOf('string');
      const text = part.text as string;
      expect(text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
      offset += text.length;
      expect(part.nextPartOffset).toBe(offset < long.length ? offset : null);
    }
    expect(offset).toBe(long.length);
  });

  it('pages long document limitations without crowding out authored-section coverage', async () => {
    await seedTemplate();
    const longLimit = 'Retain "original" \\ source 🧪; worksheet ≠ signed record.\n'.repeat(180);
    const recordedSource = { ...source(), limitations: [longLimit, SAVED_LIMIT] };
    await pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2',
      [JSON.stringify({ source: 'template', templateSource: recordedSource }), DOCUMENT]);
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource}',$1) WHERE doc_id=$2",
      [JSON.stringify(recordedSource), DOCUMENT]);
    const { first, pages, items } = await walkPages();
    const parts = referenceItems(items).filter(item => item.sectionId === null && item.field === 'limitations' && item.itemIndex === 0);
    expect(pages.length).toBeGreaterThan(1);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(item => item.text).join('')).toBe(longLimit);
    expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', limitationCount: 2 }));
    expect(referenceItems(items)).toContainEqual(expect.objectContaining({ field: 'limitations', itemIndex: 1, text: SAVED_LIMIT }));
    expect(items.filter(item => item.kind === 'section').map(item => item.sectionId)).toEqual([sectionId(1), sectionId(2)]);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
  });

});

describe('invalid saved template context fails closed', () => {
  it.each([
    { ...source(), id: OTHER_TEMPLATE }, { ...source(), aiDraftable: 'false' },
    { ...source(), sha256: 'not-a-snapshot' }, { ...source(), limitations: ['Valid', 17] },
  ])('refuses a malformed or conflicting recorded source instead of computing a verdict: %j', async recordedSource => {
    await seedTemplate();
    await pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2', [JSON.stringify({ source: 'template', templateSource: recordedSource }), DOCUMENT]);
    await denied();
  });

  it('refuses a section CREATE guidance identity that conflicts with the saved document template', async () => {
    await seedTemplate();
    await pg.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource,id}',$1)
      WHERE section_id=$2`, [JSON.stringify(OTHER_TEMPLATE), sectionId(1)]);
    await denied();
  });

  it('refuses a complete section CREATE source with conflicting recorded version details', async () => {
    await seedTemplate();
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource,sha256}',$1) WHERE section_id=$2",
      [JSON.stringify('b'.repeat(64)), sectionId(1)]);
    await denied();
  });

  it.each([null, { guidance_text: 17 }, { guidance_text: SAVED_GUIDE, compliance_checklist: 'not a list' }])(
    'refuses present malformed recorded guidance rather than silently falling back: %j', async recordedGuidance => {
      await seedTemplate();
      await currentGuidance();
      await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateGuidance}',$1) WHERE section_id=$2",
        [JSON.stringify(recordedGuidance), sectionId(1)]);
      await denied();
    },
  );

});

describe('template guidance availability describes the saved section', () => {
  it('reports missing exact section guidance while preserving the complete writing-only review', async () => {
    await replaceSections(2);
    const plain = await review();
    await seedTemplate(false);
    const { first, items } = await walkPages();
    expect(items.filter(item => item.kind === 'template-reference-gap')).toEqual([1, 2].map(n => expect.objectContaining({
      kind: 'template-reference-gap', templateId: TEMPLATE, sectionId: sectionId(n),
      authority: 'current-reference', state: 'not-recorded',
    })));
    expect(first.complete).toBe(true);
    expect(first.documentScore).toBe(plain.documentScore);
    expect(first.precisionVerdict).toBe(plain.precisionVerdict);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
    expect(referenceItems(items).some(item => item.field === 'guidance_text')).toBe(false);
    expect(items.filter(item => item.kind === 'section')).toHaveLength(2);
  });

  it.each([false, true])('treats guidance availability per saved section when a current null row coexists with real guidance: %s', async hasGuide => {
    await seedTemplate(false);
    await pg.query(`INSERT INTO template_guidance(template_id,tenant_id,section_name,section_code)
      VALUES($1,7,'Empty current reference','1.1.1')`, [TEMPLATE]);
    if (hasGuide) await currentGuidance(TEMPLATE, 7, 'Available exact current section guidance.');
    else await pg.query("UPDATE template_guidance SET compliance_checklist='[]',regulatory_references='[]' WHERE template_id=$1", [TEMPLATE]);
    const { items } = await walkPages();
    const gaps = items.filter(item => item.kind === 'template-reference-gap');
    if (hasGuide) {
      expect(gaps).toHaveLength(0);
      for (const n of [1, 2]) expect(referenceItems(items)).toContainEqual(expect.objectContaining({
        sectionId: sectionId(n), authority: 'current-reference', field: 'guidance_text',
        text: 'Available exact current section guidance.',
      }));
    } else {
      expect(gaps.map(item => item.sectionId)).toEqual([sectionId(1), sectionId(2)]);
      expect(referenceItems(items).some(item => item.field === 'guidance_text')).toBe(false);
    }
  });

  it.each([false, true])('distinguishes empty current JSON references from a nonempty JSON sibling: %s', async hasJson => {
    await seedTemplate(false);
    await pg.query(`INSERT INTO template_guidance(template_id,tenant_id,section_name,section_code,examples,ai_prompts)
      VALUES($1,7,'Empty current JSON reference','1.1.1','[]','{}')`, [TEMPLATE]);
    const actual = [{ step: 'Retain the original sponsor-signed form.' }];
    if (hasJson) await pg.query(`INSERT INTO template_guidance(template_id,tenant_id,section_name,section_code,examples)
      VALUES($1,7,'Actual current JSON reference','1.1.1',$2)`, [TEMPLATE, JSON.stringify(actual)]);
    const { first, items } = await walkPages();
    const gaps = items.filter(item => item.kind === 'template-reference-gap');
    if (hasJson) {
      expect(gaps).toHaveLength(0);
      for (const n of [1, 2]) expect(referenceItems(items)).toContainEqual(expect.objectContaining({
        sectionId: sectionId(n), authority: 'current-reference', field: 'examples', text: JSON.stringify(actual),
      }));
    } else expect(gaps.map(item => item.sectionId)).toEqual([sectionId(1), sectionId(2)]);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
  });
});

describe('template legacy records and bounded context retain honest scope', () => {
  it('returns identity-only historical CREATE guidance without fabricating missing source details', async () => {
    await seedTemplate();
    await pg.query('UPDATE authoring_documents SET provenance=NULL WHERE id=$1', [DOCUMENT]);
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateSource}',$1) WHERE doc_id=$2",
      [JSON.stringify({ id: TEMPLATE }), DOCUMENT]);
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: TEMPLATE, sourceState: 'not-recorded' });
    expect(referenceItems(items)).toContainEqual(expect.objectContaining({ templateId: TEMPLATE, sectionId: sectionId(1),
      authority: 'recorded', sourceVerification: 'identity-only', field: 'guidance_text', text: `${SAVED_GUIDE} Saved section 1.` }));
    expect(items.some(item => item.kind === 'template-source')).toBe(false);
    expect(referenceItems(items).some(item => item.field === 'limitations')).toBe(false);
  });

  it('refuses more than eight MiB of mandatory non-ASCII saved reference before returning a verdict', async () => {
    await seedTemplate();
    await pg.query("UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateGuidance,guidance_text}',$1) WHERE section_id=$2",
      [JSON.stringify('é'.repeat(4 * 1024 * 1024 + 1)), sectionId(1)]);
    await denied();
  });

  it('refuses excessive mandatory reference items instead of truncating original-record limits', async () => {
    await seedTemplate(false);
    const oversized = { ...source(), limitations: Array.from({ length: 20001 }, (_, i) => `Retain original record ${i}.`) };
    await pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2',
      [JSON.stringify({ source: 'template', templateSource: oversized }), DOCUMENT]);
    await denied();
  });

  it('preserves legacy review with an explicitly unrecorded template source instead of inferring builtin limits', async () => {
    await seedTemplate(false);
    await pg.query('UPDATE authoring_documents SET provenance=NULL WHERE id=$1', [DOCUMENT]);
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: TEMPLATE, sourceState: 'not-recorded' });
    expect(items.some(item => item.kind === 'template-source')).toBe(false);
    expect(JSON.stringify(items)).not.toContain(SAVED_LIMIT);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
  });

  it('does not infer a template from a matching document title or module when no template ID is stored', async () => {
    await pg.query("UPDATE authoring_documents SET title='Form FDA 1571',module='M1' WHERE id=$1", [DOCUMENT]);
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: null, sourceState: 'not-recorded' });
    expect(referenceItems(items)).toHaveLength(0);
    expect(items.some(item => item.kind === 'template-reference-gap')).toBe(false);
    expect(items.some(item => item.kind === 'template-source')).toBe(false);
  });

  it('refuses current revoked access before reading recorded template context', async () => {
    await seedTemplate();
    expect((await review()).complete).toBe(true);
    await pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE principal_id='7'");
    statements.length = 0;
    await denied();
    expect(statements.some(sql => /FROM authoring_audit_trail\b/.test(sql))).toBe(false);
    expect(statements.some(sql => /FROM template_guidance\b/.test(sql))).toBe(false);
  });
});
