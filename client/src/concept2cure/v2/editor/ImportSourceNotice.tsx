import React from 'react';
import type { DocumentProvenance } from './provenance';

/** Conversion limits remain with the working copy after the intake dialog closes. */
export function ImportSourceNotice({ source }: { source: DocumentProvenance['importSource'] }) {
  if (!source) return null;
  return <details className="ed-provline" data-testid="import-source-notice">
    <summary>Original source and import limits</summary>
    <p>{source.fileName} · {source.conversion === 'docx-structure' ? 'Word structure import' : 'Extracted text working copy'}</p>
    <p style={{ overflowWrap: 'anywhere' }}>Source SHA-256: {source.sha256}</p>
    <p>Reason: {source.reason}</p>
    {source.warnings.length > 0 && <ul>{source.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    <p>Review against the original before approval or filing.</p>
  </details>;
}
