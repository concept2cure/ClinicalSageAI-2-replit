import React from 'react';
import type { VaultDoc } from '../fixtures/vault-data';
import { SourceAssemblyAction, sourceAssemblyUnavailableReason } from './SourceAssemblyDialog';

/** One exact Vault upload adapter for catalogue details and the files rail. */
export function VaultSourceBuildAction({ source, programId, onNav }: {
  source: VaultDoc; programId: string | null; onNav?: (surfaceId: string) => void;
}) {
  if (source.src !== 'upload' || !source.docId || !programId) return null;
  return <SourceAssemblyAction programId={programId} onNav={onNav} titles={[source.title]}
    sources={[{ kind: 'vault', documentId: source.docId, ...(source.hash ? { expectedChecksum: source.hash } : {}) }]}
    unavailable={sourceAssemblyUnavailableReason({ ...source, isCurrent: source.earlierVersion ? false : undefined })} />;
}
