import React from 'react';
import { workflowOriginLine, type DocumentProvenance } from './provenance';
import { isWorkflowImportOrigin, WORKFLOW_SOURCE_LABELS } from '@shared/authoring/source-import';

/** Conversion limits remain with the working copy after the intake dialog closes. */
export function ImportSourceNotice({ source }: { source: DocumentProvenance['importSource'] }) {
  if (!source) return null;
  return <details className="ed-provline ed-source-notice" data-testid="import-source-notice">
    <summary>Original source and import limits</summary>
    <div className="ed-source-detail">
    {isWorkflowImportOrigin(source) ? <>
      <p>Saved {WORKFLOW_SOURCE_LABELS[source.kind]} output · version {source.version ?? 'not recorded'} · {source.sourceScope.level} scope</p>
      <p>Imported as an unbound draft; source approval and signatures were not copied.</p>
      <p className="de-desc">Snapshot fingerprint: <span className="source-import-hash">{source.fingerprint}</span></p>
      <p>This identity does not establish scientific source support. This copy has its own review and signature controls.</p>
      {source.association.reason && <p>Project association reason: {source.association.reason}</p>}
      <ul>{source.sectionOrigins.map(s => <li key={s.code}>{s.code} · {workflowOriginLine(s)}{s.narrativeReference
        ? ` · ${s.narrativeReference.narratives} narratives held by reference to CSR build ${s.narrativeReference.jobId}'s narrative store, not copied` : ''}</li>)}</ul>
      {source.sectionOrigins.some(s => s.originalAuthorship === 'machine') && <p>Reviewer adoption does not certify model qualification. Machine passages remain held unless their qualification requirements are met or the affected passages are replaced by human writing.</p>}
      {source.gaps.length > 0 && <><strong>Recorded gaps</strong><ul>{source.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
    </> : <>
      <p className="de-desc">{source.fileName} · {source.conversion === 'docx-structure' ? 'Word structure import' : 'Extracted text working copy'}</p>
      <p className="de-desc">Source SHA-256: <span className="source-import-hash">{source.sha256}</span></p>
    </>}
    <p className="de-desc">Reason: {source.reason}</p>
    {source.warnings.length > 0 && <ul className="de-desc source-import-warnings">{source.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    <p className="de-desc">Review against the original before approval or filing.</p>
    </div>
  </details>;
}
