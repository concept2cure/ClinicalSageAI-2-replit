/**
 * The 510(k) certification/disclosure statement is not labelled Form FDA 3654.
 *
 * Until 2026-10-15 generateForm3654 named its draft "FDA Form 3654 -
 * Certification/Disclosure Statement" and printed "FORM FDA 3654 (12/21)" in
 * its header and footer. The repository's own references say Form FDA 3654 is
 * the Standards Data Report for 510(k)s — a declaration of conformity to
 * recognised consensus standards: the canonical registry
 * (server/config/FDAFormsRegistry.ts, "Not a financial-disclosure form"), the
 * catalog snapshot (server/config/fdaFormsCatalogSnapshot.ts) and the eSTAR
 * mapper ("Declarations of Conformity (FDA 3654)"). What this builder drafts —
 * a truthful-and-accurate certification with clinical-investigation and
 * financial-interest disclosures — is not that form, and a stored draft that
 * calls itself by another form's number misstates what it is.
 */
import { describe, expect, it } from 'vitest';

import FDAFormGenerator from '../FDAFormGenerator';
import { FDAFormsRegistry } from '../../config/FDAFormsRegistry';

describe('FDAFormGenerator.generateForm3654 — the label says what the document is', () => {
  it('the reference: the registry names Form FDA 3654 the Standards Data Report for 510(k)s', () => {
    expect(FDAFormsRegistry.FDA_3654.title).toBe('Standards Data Report for 510(k)s');
  });

  it('names the draft a certification/disclosure statement, not Form FDA 3654', async () => {
    const out = await new FDAFormGenerator().generateForm3654({});
    expect(out.name).toMatch(/Certification\/Disclosure Statement/);
    expect(out.name).not.toMatch(/3654/);
  });

  it('prints no Form FDA 3654 number on the document', async () => {
    const out = await new FDAFormGenerator().generateForm3654({});
    expect(out.htmlContent).not.toMatch(/FDA 3654/i);
    expect(out.htmlContent).toContain('CERTIFICATION AND DISCLOSURE STATEMENT');
  });
});
