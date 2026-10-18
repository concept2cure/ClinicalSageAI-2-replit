import React from 'react';
import type { CompanyDocumentProfile } from '@shared/company-documents';

export function CompanySetupGuide({ profile, legalDocumentsIncluded = true, dirty, onSelect, onNav }: {
  profile: CompanyDocumentProfile; legalDocumentsIncluded?: boolean; dirty: boolean;
  onSelect: (section: 'identity' | 'design' | 'legal') => void;
  onNav?: (id: string) => void;
}) {
  const active = profile.legalDocuments.filter(document => document.active);
  return <details className="company-setup-guide"><summary>Company document setup and instructions</summary>
    <p className="company-hint">Suggested setup checks use the saved profile{dirty ? '; your unsaved draft is not included' : ''}. This guidance does not approve a legal document or determine an agency’s requirements.</p>
    <ol className="company-setup-checklist">
      <li><strong>Record the correct company identity</strong><span>{profile.companyName ? `Recorded: ${profile.companyName}` : 'Add the company name and relevant contact and registration details.'}</span><button className="btn ghost small" type="button" onClick={() => onSelect('identity')}>Review identity</button></li>
      <li><strong>Review the stationery and output choices</strong><span>{profile.revision > 0 ? `Profile saved at revision ${profile.revision}.` : 'The default design has not been saved as a company profile.'} Logos are optional. Automatic presentation is {profile.applyToReports || profile.applyToSubmissionCorrespondence ? 'enabled for selected outputs' : 'off; manual stationery downloads remain available'}.</span><button className="btn ghost small" type="button" onClick={() => onSelect('design')}>Review letterhead</button></li>
      <li><strong>Register original legal versions when needed</strong><span>{legalDocumentsIncluded ? `${active.length} active library entries visible to you.` : 'Open the legal library to read current accessible entries and counts.'} Upload originals to their project Vault, review them there, then register the exact PDF version.</span><button className="btn ghost small" type="button" onClick={() => onSelect('legal')}>Review legal library</button></li>
      <li><strong>Check the actual filing before placement</strong><span>Confirm the applicant, market, language and required documents for each submission. A library entry’s scope is company intent; it does not establish agency acceptance.</span>{onNav && <button className="btn ghost small" type="button" onClick={() => onNav('submission-center')}>Open Submission Center</button>}</li>
    </ol>
    <h3>Import and filing instructions</h3>
    <ul className="company-customer-instructions">
      <li>Import a Word or PDF letterhead up to 15 MB to extract editable formatting. Review extraction warnings: complex stationery is not reproduced as an exact facsimile.</li>
      <li>Use PNG, JPEG or GIF logos up to 2 MB. Inspect readable text, color contrast and a rendered proof before using the design with external recipients.</li>
      <li>Download an unsaved Word proof before saving when you need to inspect actual Word layout. A staged named design is a separate snapshot: another authorized person reviews it before publication, and outputs select published variants explicitly.</li>
      <li>Company presentation affects correspondence and report exports only where enabled. Report body typography, signatures, seals and required labels remain controlled by the report renderer.</li>
      <li>Register unchanged original legal PDFs, including signed originals, from Vault. Registration, internal approval, recorded signature evidence and legal applicability are separate facts.</li>
      <li>Select each legal companion explicitly for a submission. Copies into another project need that project’s own review and approval. Archiving a library entry does not revoke the underlying legal instrument.</li>
      <li>Use a legal entry’s lifecycle to assign renewal custody, record replacement or revocation, link reviewed authority and translation evidence, and inspect affected filings. External signature evidence is recorded separately; this application does not cryptographically validate a signature.</li>
    </ul>
  </details>;
}
