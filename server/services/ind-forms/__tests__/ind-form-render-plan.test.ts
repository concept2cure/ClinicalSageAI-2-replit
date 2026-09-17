/**
 * describeRenderPlan — what the engine WILL produce for a form, stated before
 * anything is rendered, from the same gates renderBuiltForm applies.
 *
 * The forms panel used to learn how a form had rendered only after the PDF
 * came back (X-Form-* headers on the download). A sponsor deciding whether to
 * click needs the statement on screen first: the official AcroForm template,
 * the official form through its XFA datasets, a labeled reconstruction, or a
 * bare draft — who has reviewed the fill, and which boxes the platform will
 * leave for them to complete and sign in Adobe Acrobat. Pinned against the
 * vendored FDA templates themselves, not a fixture.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describeRenderPlan, generateIndForm } from '../ind-form-fill-service';

const ids = (fields: Array<{ id: string }>) => fields.map((f) => f.id);

describe('describeRenderPlan — the render statement before the render', () => {
  it('FDA 1572: the official AcroForm template, human-reviewed, with the boxes left to the sponsor named', async () => {
    const plan = await describeRenderPlan('FDA_1572');
    expect(plan.formId).toBe('FDA_1572');
    expect(plan.method).toBe('official-acroform');
    expect(plan.officialTemplate).toBe(true);
    expect(plan.edition).toBe('2025-04-13');
    expect(typeof plan.reviewedBy).toBe('string');
    expect((plan.reviewedBy ?? '').length).toBeGreaterThan(0);
    // Canonical fields with no reviewed widget on the official form are the
    // sponsor's to complete on the form itself (attachments, the signature).
    expect(ids(plan.sponsorCompletes)).toEqual(expect.arrayContaining(['investigator_qualifications', 'study_title']));
    expect(plan.platformWrites).toEqual(expect.arrayContaining(['investigator_name', 'facility_name', 'irb_name']));
    for (const f of plan.sponsorCompletes) {
      expect(f.label.trim().length).toBeGreaterThan(0);
    }
    // A field is either written by the platform or left to the sponsor, never both.
    for (const id of ids(plan.sponsorCompletes)) expect(plan.platformWrites).not.toContain(id);
  });

  it('FDA 1571 and 3674: the official form filled through its XFA datasets, not yet human-reviewed, deliberately unmapped boxes named', async () => {
    const p1571 = await describeRenderPlan('FDA_1571');
    expect(p1571.method).toBe('official-xfa-datasets');
    expect(p1571.officialTemplate).toBe(true);
    expect(p1571.edition).toBe('2025-03-28');
    expect(p1571.reviewedBy).toBeNull();
    expect(ids(p1571.sponsorCompletes)).toEqual(
      expect.arrayContaining(['ind_type', 'phase_of_study', 'authorized_rep_name', 'us_agent_name']),
    );
    expect(p1571.platformWrites).toEqual(expect.arrayContaining(['sponsor_name', 'ind_number', 'drug_name', 'indication']));

    const p3674 = await describeRenderPlan('FDA_3674');
    expect(p3674.method).toBe('official-xfa-datasets');
    expect(p3674.reviewedBy).toBeNull();
    // The 42 U.S.C. § 282(j) certification checkboxes are a sponsor attestation.
    expect(ids(p3674.sponsorCompletes)).toEqual(
      expect.arrayContaining(['cert_not_applicable', 'cert_requirements_met', 'cert_submitted_no_data']),
    );
    expect(p3674.platformWrites).toEqual(expect.arrayContaining(['sponsor_name', 'drug_name', 'nct_number']));
  });

  it('FDA 3454 and 356h: the official AcroForm template', async () => {
    for (const formId of ['FDA_3454', 'FDA_356H']) {
      const plan = await describeRenderPlan(formId);
      expect(plan.method).toBe('official-acroform');
      expect(plan.officialTemplate).toBe(true);
      expect(typeof plan.reviewedBy).toBe('string');
    }
  });

  it('a form with no vendored template is a reconstruction or a draft — never called official, nothing left "on the form"', async () => {
    const plan = await describeRenderPlan('FDA_1574');
    expect(plan.officialTemplate).toBe(false);
    expect(['reconstruction', 'draft']).toContain(plan.method);
    expect(plan.reviewedBy).toBeNull();
    expect(plan.edition).toBeNull();
    expect(plan.sponsorCompletes).toEqual([]);
    expect(plan.platformWrites).toEqual([]);
  });

  it('reads the real template state: with the templates directory empty, no form has an official plan', async () => {
    const prev = process.env.IND_FORM_TEMPLATES_DIR;
    process.env.IND_FORM_TEMPLATES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-no-templates-'));
    try {
      for (const formId of ['FDA_1571', 'FDA_1572', 'FDA_3674']) {
        const plan = await describeRenderPlan(formId);
        expect(plan.officialTemplate).toBe(false);
        expect(plan.method).not.toMatch(/^official/);
        expect(plan.reviewedBy).toBeNull();
      }
    } finally {
      if (prev === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
      else process.env.IND_FORM_TEMPLATES_DIR = prev;
    }
  });

  it('an unsupported form id is refused, not planned', async () => {
    await expect(describeRenderPlan('FDA_9999')).rejects.toThrow(/Unsupported/);
  });

  it('the plan agrees with what the render actually does (1571, 3674, 3454)', async () => {
    const meta = {
      sponsorName: 'Concept2Cure Biopharma, Inc.',
      sponsor: {
        name: 'Concept2Cure Biopharma, Inc.',
        address: '400 Kendall Square, Cambridge, MA 02142',
        contactPhone: '+1 617 555 0142',
        authorizedRepName: 'Dana Reyes',
        authorizedRepTitle: 'VP, Regulatory Affairs',
      },
      indNumber: '162045',
      serialNumber: '0000',
      drugName: 'C2C-1042 capsules',
      indication: 'Moderate to severe plaque psoriasis',
      studyPhase: 'Phase 1',
      nctNumber: 'NCT05551234',
      ctgovCertificationBasis: 'requirements_met' as const,
      investigators: [{ name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: false } }],
    };
    for (const formId of ['FDA_1571', 'FDA_3674', 'FDA_3454']) {
      const plan = await describeRenderPlan(formId);
      const rendered = await generateIndForm(formId, meta);
      expect(rendered.usedOfficialTemplate).toBe(plan.officialTemplate);
      expect(rendered.reconstructed === true).toBe(plan.method === 'reconstruction');
    }
  }, 60_000);
});
