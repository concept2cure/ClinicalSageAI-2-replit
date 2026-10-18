import React, { lazy, Suspense, useId, useState } from 'react';

const CompanySettings = lazy(async () => {
  const loaded = await import('./surfaces/CompanyDocumentSettings');
  return { default: loaded.CompanyDocumentSettings };
});

/** A reachable organization-settings door for delegated custodians, independent
 * of the administrator roster. The reused component reads current capabilities. */
export function CompanyDocumentsAccountSection() {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <section className="de-section" aria-label="Company documents">
    <h3 className="de-heading">Company documents</h3>
    <p className="de-desc">Review company identity, letterhead and legal originals. Changes follow your current organization and project permissions.</p>
    <button className="de-btn ghost" type="button" aria-expanded={open} aria-controls={contentId}
      onClick={() => setOpen(value => !value)}>{open ? 'Close company documents' : 'Open company documents'}</button>
    <div id={contentId} hidden={!open}>
      {open && <Suspense fallback={<p role="status">Opening company documents…</p>}><CompanySettings /></Suspense>}
    </div>
  </section>;
}
