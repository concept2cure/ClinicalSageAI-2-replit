import React from 'react';
import { workflowOriginLine, type DocumentProvenance } from './provenance';
import { isWorkflowImportOrigin } from '@shared/authoring/source-import';

/** Conversion limits remain with the working copy after the intake dialog closes. */
export function ImportSourceNotice({ source }: { source: DocumentProvenance['importSource'] }) {
  if (!source) return null;
  return <details className="ed-provline" data-testid="import-source-notice">
    <summary>Original source and import limits</summary>
    {isWorkflowImportOrigin(source) ? <>
      <p>Saved {source.kind === 'csr' ? 'CSR' : 'protocol'} output · version {source.version ?? 'not recorded'} · {source.sourceScope.level} scope</p>
      <p>Imported as an unbound draft; source approval and signatures were not copied.</p>
      <p style={{ overflowWrap: 'anywhere' }}>Snapshot fingerprint: {source.fingerprint}</p>
      <p>This identity does not establish scientific source support. This copy has its own review and signature controls.</p>
      {source.association.reason && <p>Project association reason: {source.association.reason}</p>}
      <ul>{source.sectionOrigins.map(s => <li key={s.code}>{s.code} · {workflowOriginLine(s)}</li>)}</ul>
      {source.sectionOrigins.some(s => s.originalAuthorship === 'machine') && <p>Reviewer adoption does not certify model qualification. Machine passages remain held unless their qualification requirements are met or the affected passages are replaced by human writing.</p>}
      {source.gaps.length > 0 && <><strong>Recorded gaps</strong><ul>{source.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
    </> : <>
      <p>{source.fileName} · {source.conversion === 'docx-structure' ? 'Word structure import' : 'Extracted text working copy'}</p>
      <p style={{ overflowWrap: 'anywhere' }}>Source SHA-256: {source.sha256}</p>
    </>}
    <p>Reason: {source.reason}</p>
    {source.warnings.length > 0 && <ul>{source.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    <p>Review against the original before approval or filing.</p>
  </details>;
}
