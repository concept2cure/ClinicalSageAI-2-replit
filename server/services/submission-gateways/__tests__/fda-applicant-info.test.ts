/**
 * us-regional.xml `<applicant-info>` and `<application>` (package-spine sweep F07,
 * confirmed 2026-10-01).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `buildFdaBackbone` never read `input.sponsorId` or `input.sponsorName`, and
 * with no contacts supplied (the package spine supplies none) it wrote
 * `<applicant-info/>`. No file in an FDA bundle named the applicant: the DUNS
 * and company name the caller recorded reached nothing. With contacts it was
 * still wrong — no `<id>`, no `<company-name>`, and `<email>` / `<telephone>`
 * written directly under `<applicant-contact>`, email first, with no
 * `<telephones>` / `<emails>` wrappers. `<application>` carried no
 * `application-containing-files`.
 *
 * Element names asserted here come from the repository's own records: the
 * SPEC_DIGEST us-regional example (docs/ectd/SPEC_DIGEST.md: applicant-info,
 * applicant-contacts, applicant-contact, applicant-contact-name and its
 * applicant-contact-type) and the verified F07 record
 * (docs/evidence/W5/2026-09-30-package-spine-sweep/README.md: id,
 * company-name, the telephones/emails wrappers, application-containing-files).
 *
 * Every assertion reads the real packager's zip through a DOM parser, so child
 * ORDER is asserted, not just presence.
 */
import { describe, it, expect } from 'vitest';
import { packFda, only, childNames, textOf, FULL_CONTACT } from './support/fda-backbone';

describe('us-regional <applicant-info> carries the applicant the caller recorded', () => {
  it('with no contacts: <id> is the sponsor id, <company-name> the sponsor name — and no <applicant-contacts> is invented', async () => {
    const { doc } = await packFda();
    const info = only(doc, 'applicant-info');
    expect(childNames(info)).toEqual(['id', 'company-name']);
    // The DUNS is the TEXT of <id>, with no child element.
    const id = only(doc, 'id');
    expect(childNames(id)).toEqual([]);
    expect(textOf(id)).toBe('123456789');
    expect(textOf(only(doc, 'company-name'))).toBe('Acme Biologics Inc.');
    // Never a placeholder contact: the element is absent, not filled in.
    expect(doc.getElementsByTagName('applicant-contacts').length).toBe(0);
    expect(doc.getElementsByTagName('applicant-contact').length).toBe(0);
  });

  it('writes an UNASSIGNED marker the caller passed verbatim, and invents nothing in its place', async () => {
    const { doc } = await packFda({ sponsorId: 'UNASSIGNED-ORG-7', sponsorName: 'UNASSIGNED (organization 7)' });
    expect(textOf(only(doc, 'id'))).toBe('UNASSIGNED-ORG-7');
    expect(textOf(only(doc, 'company-name'))).toBe('UNASSIGNED (organization 7)');
  });

  it('escapes the company name (a raw "&" or "<" would make the backbone unparseable)', async () => {
    const { doc } = await packFda({ sponsorName: 'Smith & Sons <Pharma>' });
    expect(textOf(only(doc, 'company-name'))).toBe('Smith & Sons <Pharma>');
  });

  it('a contact: name, then <telephones>/<telephone>, then <emails>/<email> — in that order, inside <applicant-contacts>', async () => {
    const { doc } = await packFda({ contacts: [FULL_CONTACT] });
    expect(childNames(only(doc, 'applicant-info'))).toEqual(['id', 'company-name', 'applicant-contacts']);
    expect(childNames(only(doc, 'applicant-contacts'))).toEqual(['applicant-contact']);
    expect(childNames(only(doc, 'applicant-contact'))).toEqual(['applicant-contact-name', 'telephones', 'emails']);
    const name = only(doc, 'applicant-contact-name');
    expect(name.getAttribute('applicant-contact-type')).toBe('fdaact1');
    expect(textOf(name)).toBe('Jane Smith');
    expect(childNames(only(doc, 'telephones'))).toEqual(['telephone']);
    expect(textOf(only(doc, 'telephone'))).toBe('+1 301 555 0100');
    expect(childNames(only(doc, 'emails'))).toEqual(['email']);
    expect(textOf(only(doc, 'email'))).toBe('jane@example.com');
    // telephone-number-type's FDA code list is not vendored, so no value for
    // it is written rather than a guessed one.
    expect(only(doc, 'telephone').hasAttribute('telephone-number-type')).toBe(false);
  });

  it('a contact with an email and no telephone gets no empty <telephones> wrapper', async () => {
    const { doc } = await packFda({ contacts: [{ type: 'technical', name: 'Raj Patel', email: 'raj@example.com' }] });
    expect(childNames(only(doc, 'applicant-contact'))).toEqual(['applicant-contact-name', 'emails']);
    expect(only(doc, 'applicant-contact-name').getAttribute('applicant-contact-type')).toBe('fdaact2');
    expect(doc.getElementsByTagName('telephones').length).toBe(0);
  });
});

describe('what <applicant-info> could not say is said on the bundle', () => {
  it('no contact: the regional-backbone status names the missing <applicant-contacts>', async () => {
    const { bundle } = await packFda();
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/^<applicant-info> has no <applicant-contacts>/);
  });

  it('a contact role outside the vocabulary is written as fdaact1, and the status says it was defaulted', async () => {
    const { doc, bundle } = await packFda({ contacts: [{ ...FULL_CONTACT, type: 'chief of staff' }] });
    expect(only(doc, 'applicant-contact-name').getAttribute('applicant-contact-type')).toBe('fdaact1');
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/role "chief of staff", which is not an applicant-contact-type code/);
  });

  it('a contact with no email: the status names the missing <emails>', async () => {
    const { bundle } = await packFda({ contacts: [{ type: 'regulatory', name: 'Jane Smith', phone: '+1 301 555 0100' }] });
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/applicant contact "Jane Smith" has no email, so no <emails>/);
  });
});

describe('us-regional <application>', () => {
  it('declares application-containing-files="true": this sequence ships the files its backbone references', async () => {
    const { doc } = await packFda();
    expect(only(doc, 'application').getAttribute('application-containing-files')).toBe('true');
  });
});
