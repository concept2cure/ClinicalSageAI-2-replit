/**
 * Consent forms and the elements they are held to, on the real consent schema
 * (migrations/20260629_protocol_consent.sql) in PGlite (D2, 2026-10-22).
 *
 * Decision delegated by the founder (2026-10-21): an FDA-regulated form needs
 * the "FDA may inspect" wording and, for an applicable clinical trial, the
 * ClinicalTrials.gov statement before approval; a draft or in-review form
 * gains the missing elements; an approved form is the signed record, is not
 * changed, and shows that it predates the requirement.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as R[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import {
  createConsentFormTx,
  updateElementTx,
  approveConsentFormTx,
  getCompleteness,
  setApplicableClinicalTrialTx,
} from '../protocol-consent-service';

const ORG = 903;
const USER = 4343;
const LEGACY_REQUIRED = ['purpose_duration', 'procedures', 'risks', 'benefits', 'alternatives', 'confidentiality', 'compensation', 'contacts', 'voluntary'];

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}
async function keys(formId: number): Promise<Array<{ element_key: string; required: boolean }>> {
  return (await exec.query(`SELECT element_key, required FROM consent_form_elements WHERE consent_form_id = $1 ORDER BY order_index, id`, [formId])).rows;
}
/** A form as the pre-2026-10-22 seed left it: old keys, every element drafted. */
async function legacyForm(status: string): Promise<number> {
  const f = await exec.query(`INSERT INTO consent_forms (organization_id, title, status, created_by) VALUES ($1, 'ICF v1', $2, $3) RETURNING id`, [ORG, status, USER]);
  const id = (f.rows[0] as { id: number }).id;
  let i = 0;
  for (const k of LEGACY_REQUIRED) {
    const content = k === 'confidentiality' ? 'Records are confidential; the FDA may inspect the records.' : 'Drafted.';
    await exec.query(
      `INSERT INTO consent_form_elements (organization_id, consent_form_id, element_key, title, content, required, present, order_index, created_by)
       VALUES ($1,$2,$3,$3,$4,true,true,$5,$6)`,
      [ORG, id, k, content, i++, USER],
    );
  }
  return id;
}
async function fill(formId: number): Promise<void> {
  const { rows } = await exec.query(`SELECT id, element_key FROM consent_form_elements WHERE consent_form_id = $1 AND content IS NULL`, [formId]);
  for (const r of rows as Array<{ id: number; element_key: string }>) {
    const content = r.element_key === 'clinicaltrials_gov'
      ? 'A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law.'
      : r.element_key === 'confidentiality' ? 'Records are confidential; the FDA may inspect the records.' : 'Drafted.';
    await updateElementTx(exec as any, ORG, r.id, { content, present: true }, USER);
  }
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT); INSERT INTO organizations (id, name) VALUES (${ORG}, 'org');`);
  await pglite.exec(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY); INSERT INTO users (id) VALUES (${USER});`);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pglite.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
  await pglite.exec(migration('migrations/20260629_protocol_consent.sql'));
}, 60_000);
afterAll(async () => {
  await pglite?.close();
});

describe('a new form', () => {
  it('is seeded with the FDA elements; the ClinicalTrials.gov statement is required unless the trial is not an applicable clinical trial', async () => {
    const unknown = await createConsentFormTx(exec as any, ORG, USER, { title: 'ICF' });
    const notAct = await createConsentFormTx(exec as any, ORG, USER, { title: 'ICF', applicableClinicalTrial: false });
    expect(unknown.elementsSeeded).toBe(17);
    expect((await keys(unknown.id)).find((k) => k.element_key === 'clinicaltrials_gov')!.required).toBe(true);
    expect((await keys(notAct.id)).find((k) => k.element_key === 'clinicaltrials_gov')!.required).toBe(false);
  });

  it('cannot be approved without the FDA inspection wording, and can be with it', async () => {
    const { id } = await createConsentFormTx(exec as any, ORG, USER, { title: 'ICF' });
    const conf = (await exec.query(`SELECT id FROM consent_form_elements WHERE consent_form_id = $1 AND element_key = 'confidentiality'`, [id])).rows[0] as { id: number };
    await updateElementTx(exec as any, ORG, conf.id, { content: 'Your records will be kept confidential.', present: true }, USER);
    await fill(id);
    await expect(approveConsentFormTx(exec as any, ORG, USER, id)).rejects.toThrow(/Food and Drug Administration may inspect/);
    await updateElementTx(exec as any, ORG, conf.id, { content: 'Your records are confidential, but the FDA may inspect them.' }, USER);
    await expect(approveConsentFormTx(exec as any, ORG, USER, id)).resolves.toMatchObject({ approved: true });
  });
});

describe('a form seeded before the change', () => {
  it('in review: is refused naming the missing element, gains it on the next edit, then approves once it is drafted', async () => {
    const id = await legacyForm('in_review');
    await expect(approveConsentFormTx(exec as any, ORG, USER, id)).rejects.toThrow(/clinicaltrials_gov" is not yet on this form/);
    const anyEl = (await exec.query(`SELECT id FROM consent_form_elements WHERE consent_form_id = $1 AND element_key = 'risks'`, [id])).rows[0] as { id: number };
    await updateElementTx(exec as any, ORG, anyEl.id, { content: 'Drafted again.' }, USER);
    const after = (await keys(id)).map((k) => k.element_key);
    expect(after.filter((k) => k === 'clinicaltrials_gov')).toHaveLength(1);
    expect(after).not.toContain('purpose'); // covered by purpose_duration
    await fill(id);
    await expect(approveConsentFormTx(exec as any, ORG, USER, id)).resolves.toMatchObject({ approved: true });
  });

  it('recording that the trial is not an applicable clinical trial lets it approve without the statement', async () => {
    const id = await legacyForm('draft');
    await setApplicableClinicalTrialTx(exec as any, ORG, USER, { formId: id, applicableClinicalTrial: false });
    await expect(approveConsentFormTx(exec as any, ORG, USER, id)).resolves.toMatchObject({ approved: true });
  });

  it('approved: unchanged, and its completeness says it predates the requirement', async () => {
    const id = await legacyForm('approved');
    const before = await keys(id);
    const c = await getCompleteness(ORG, id);
    expect(c.predatesCurrentElements).toEqual(['clinicaltrials_gov']);
    expect(c.findings.some((f) => f.severity === 'info' && /approved before/.test(f.message))).toBe(true);
    await expect(setApplicableClinicalTrialTx(exec as any, ORG, USER, { formId: id, applicableClinicalTrial: false })).rejects.toThrow(/approved/);
    expect(await keys(id)).toEqual(before);
  });
});
