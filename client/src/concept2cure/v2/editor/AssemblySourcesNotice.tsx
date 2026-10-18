import React from 'react';
import type { AssemblyBuildController } from './assemblyBuildState';
import { assemblySelectionKey } from './assemblySourceSelection';
import { assemblySourceKey } from '@shared/authoring/assembly-sources';

/** Text-free source receipts stay distinct from authored prose and citations. */
export function AssemblySourcesNotice({ controller }: { controller: AssemblyBuildController }) {
  const selected = controller.sourceSelection;
  if (!selected) return null;
  const possible = controller.plan?.sources ?? controller.receipt?.plan.sources;
  const manifest = possible && assemblySelectionKey(possible.entries.map(entry => entry.source)) === assemblySelectionKey(selected) ? possible : null;
  return <div className="ed-source-detail" data-testid="assembly-selected-sources" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <strong>Selected source references</strong>
    <p>These references record your selection. They do not establish scientific support, verified citations, model use, approval or a full-file review.</p>
    {manifest ? <>
      <ul>{manifest.entries.map(entry => <li key={assemblySourceKey(entry.source)}>
        <strong>{entry.title}</strong> · {entry.source.kind === 'data-room' ? `Data Room source ${entry.source.sourceId}` : `Vault document ${entry.source.documentId}`}
        <p>Version: {entry.version ?? 'not recorded'} · disposition: {entry.disposition ?? 'not recorded'} · original file: {entry.originalFileAvailable === null ? 'availability not recorded' : entry.originalFileAvailable ? 'available' : 'unavailable; retained text is separate'}</p>
        <p>Original SHA-256: <span className="source-import-hash">{entry.contentHash}</span></p>
        <p>Extraction SHA-256: <span className="source-import-hash">{entry.extractedTextSha256}</span></p>
        <p>Selected UTF-16 excerpt [{entry.span.start}, {entry.span.end}) of {entry.span.totalChars} characters · excerpt SHA-256: <span className="source-import-hash">{entry.span.sha256}</span></p>
      </li>)}</ul>
      <ul>{manifest.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul>
    </> : <>
      <ul>{selected.map(source => <li key={assemblySourceKey(source)}>{source.kind === 'data-room' ? `Data Room source ${source.sourceId}` : `Vault document ${source.documentId}`}{source.expectedChecksum ? ` · expected SHA-256 ${source.expectedChecksum}` : ''}</li>)}</ul>
      <p>Preview the build to verify current source versions and exact readable excerpts. No source text has been copied into this document.</p>
    </>}
    <button type="button" className="btn ghost authoring-oversight-action" disabled={controller.busy} onClick={() => controller.adoptSources(null)}>Clear selected sources</button>
  </div>;
}
