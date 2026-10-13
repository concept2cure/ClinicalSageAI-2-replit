import React from 'react';
import type { DocumentProvenance } from './provenance';

/** Conversion limits remain with the working copy after the intake dialog closes. */
export function ImportSourceNotice({ source }: { source: DocumentProvenance['importSource'] }) {
  if (!source) return null;
  return <details className="ed-provline ed-source-notice" data-testid="import-source-notice">
    <summary>Original source and import limits</summary>
    <div className="ed-source-detail">
      <p className="de-desc">{source.fileName} · {source.conversion === 'docx-structure' ? 'Word structure import' : 'Extracted text working copy'}</p>
      <p className="de-desc">Source SHA-256: <span className="source-import-hash">{source.sha256}</span></p>
      <p className="de-desc">Reason: {source.reason}</p>
      {source.warnings.length > 0 && <ul className="de-desc source-import-warnings">{source.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
      <p className="de-desc">Review against the original before approval or filing.</p>
    </div>
  </details>;
}
