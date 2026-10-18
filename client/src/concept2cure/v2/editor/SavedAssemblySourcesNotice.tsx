import React from 'react';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import { assemblySourceKey } from '@shared/authoring/assembly-sources';
import type { AssemblyBuildController } from './assemblyBuildState';

/** A historical read is separate from both the current selection and build recovery. */
export function SavedAssemblySourcesNotice({ controller }: { controller: AssemblyBuildController }) {
  const { savedSources: saved } = controller;
  const recorded = saved.data?.record;
  const checking = saved.phase === 'checking'; const reusing = saved.phase === 'reusing';
  return <div className="ed-source-detail" data-testid="saved-assembly-sources" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <strong>Last recorded build source references</strong>
    <p>Check the last recorded source-based build. This does not restore a plan, review draft, citations or approval, and clearing the current selection does not erase this history.</p>
    <div className="authoring-oversight-actions">
      <button type="button" className="btn ghost authoring-oversight-action" disabled={!!controller.savedSourcesReadDisabledReason}
        title={controller.savedSourcesReadDisabledReason ?? undefined} onClick={() => void controller.checkSavedSources()}>{checking ? 'Checking saved sources…' : 'Check saved sources'}</button>
      {recorded && <button type="button" className="btn ghost authoring-oversight-action" disabled={reusing || !!controller.savedSourcesReuseDisabledReason}
        title={controller.savedSourcesReuseDisabledReason ?? undefined} onClick={() => void controller.useSavedSources()}>{reusing ? 'Checking before reuse…' : 'Use saved sources'}</button>}
    </div>
    {saved.message && <div className="scaf-note" role={saved.phase === 'failed' ? 'alert' : 'status'}>{saved.message}</div>}
    {recorded && <>
      <p>Recorded <GovernedTimestamp value={recorded.recordedAt} layout="inline" /> · historical source references, separate from your current selection.</p>
      <ul>{recorded.manifest.entries.map(entry => <li key={assemblySourceKey(entry.source)}>
        <strong>{entry.title}</strong> · {entry.source.kind === 'data-room' ? `Data Room source ${entry.source.sourceId}` : `Vault document ${entry.source.documentId}`}
        <p>Version: {entry.version ?? 'not recorded'} · selected UTF-16 excerpt [{entry.span.start}, {entry.span.end}) of {entry.span.totalChars} characters.</p>
        <p>Original SHA-256: <span className="source-import-hash">{entry.contentHash}</span></p>
      </li>)}</ul>
      <ul>{recorded.manifest.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul>
      {controller.savedSourcesReuseDisabledReason && <p role="status">{controller.savedSourcesReuseDisabledReason}</p>}
      <p>Reuse checks this same saved record again. Then choose a template and preview a fresh build; no work starts automatically.</p>
    </>}
  </div>;
}
