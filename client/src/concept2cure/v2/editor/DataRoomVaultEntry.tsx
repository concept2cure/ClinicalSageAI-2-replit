/**
 * A Vault document as the data catalog lists it (S2, 2026-11-11): what it is, where it is filed, its grade
 * and the grade's basis, and "Use in this project". The Vault stays where a person opens, reviews and
 * approves it; the catalog reads it.
 */
import React from 'react';
import { vaultDocKindLabel } from '@shared/constants/domain/vault-taxonomy';
import { GradeBasis, GradeChip, type SourceGrade } from './DataRoomGrade';
import { UseVaultAction, type ProjectUses } from './DataRoomUses';

export interface VaultCatalogDoc {
  documentId: string; projectId: string; projectName: string | null; title: string; fileName: string | null;
  mimeType: string | null; fileSize: number | null; version: string | null; createdAt: string | null; checksum: string | null;
  folder: string | null; folderLabel: string | null; ctdSection: string | null; evidenceKind: string | null;
  placementStatus: string | null; originalFileAvailable: boolean; textAvailable: boolean; grade?: SourceGrade | null;
}

const PLACEMENT: Record<string, string> = { confirmed: 'filing confirmed', suggested: 'filing suggested, not yet confirmed', unfiled: 'not yet filed in a folder' };

function vaultPlacement(doc: VaultCatalogDoc): string {
  return [
    doc.evidenceKind ? vaultDocKindLabel(doc.evidenceKind) : null,
    doc.ctdSection ? `CTD ${doc.ctdSection}` : null,
    doc.folder ? `folder ${doc.folderLabel || doc.folder}` : null,
    doc.placementStatus ? PLACEMENT[doc.placementStatus] ?? null : null,
  ].filter(Boolean).join(' · ');
}

function vaultLineage(doc: VaultCatalogDoc): string {
  return [
    doc.version ? `version ${doc.version}` : null,
    doc.fileName && doc.fileName !== doc.title ? doc.fileName : null,
    doc.createdAt ? `added to Vault ${new Date(doc.createdAt).toLocaleDateString()}` : null,
    doc.checksum ? `SHA-256 ${doc.checksum.slice(0, 12)}…` : null,
  ].filter(Boolean).join(' · ');
}

export function VaultCatalogEntry({ doc, programId, uses }: { doc: VaultCatalogDoc; programId: string; uses?: ProjectUses }) {
  const elsewhere = doc.projectId !== programId;
  const placement = vaultPlacement(doc);
  return <details className="pf-sel pf-library-entry" data-testid="data-room-vault-entry">
    <summary className="pf-sel-t">
      <span>{doc.title}</span>
      <span className="pf-sel-m" style={{ display: 'block' }}>
        <GradeChip grade={doc.grade} /> In Vault · {doc.textAvailable ? 'Readable' : 'Not read yet'}
        {doc.originalFileAvailable ? '' : ' · original file unavailable'}{doc.projectName ? ` · ${doc.projectName}` : ''}
      </span>
    </summary>
    <div className="pf-library-detail">
      {placement && <span className="pf-sel-m" style={{ display: 'block' }} data-testid="source-placement">{placement}</span>}
      <span className="pf-sel-m" style={{ display: 'block' }} data-testid="source-lineage">{vaultLineage(doc)}</span>
      <GradeBasis grade={doc.grade} />
      <UseVaultAction doc={doc} uses={uses} />
      <p className="pf-sel-m">{elsewhere
        ? `Filed in the Vault of ${doc.projectName ?? 'another project'}. Use it in this project to list it with this project’s data.`
        : 'Filed in this project’s Vault. Open it, review it and approve it from the Library tab.'}</p>
    </div>
  </details>;
}
