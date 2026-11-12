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
  /** What a profiled dataset holds: its first tables with their CDISC standard and class, columns and rows. */
  dataset?: { format: string | null; tableCount: number; tables: Array<{ name: string; standard: string | null; domain: string | null; columns: number; rows: number }> } | null;
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

/** A dataset's tables as read from its bytes: "ADVS · ADaM BDS · 34 columns · 32,139 rows". A define file's rows are not data and are left out. */
function datasetLines(dataset: NonNullable<VaultCatalogDoc['dataset']>): string[] {
  const lines = dataset.tables.map(t => [
    t.name, t.standard ? `${t.standard}${t.domain && t.domain !== t.name ? ` ${t.domain}` : ''}` : 'no CDISC standard recognized',
    `${t.columns.toLocaleString()} column${t.columns === 1 ? '' : 's'}`, t.rows > 0 ? `${t.rows.toLocaleString()} row${t.rows === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · '));
  const more = dataset.tableCount - dataset.tables.length;
  return more > 0 ? [...lines, `and ${more} more`] : lines;
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
      {doc.dataset && <span className="pf-sel-m" style={{ display: 'block' }} data-testid="vault-dataset">
        {doc.dataset.format === 'define-xml' ? 'Describes' : 'Dataset'}: {datasetLines(doc.dataset).join('; ')}
      </span>}
      <GradeBasis grade={doc.grade} />
      <UseVaultAction doc={doc} uses={uses} />
      <p className="pf-sel-m">{elsewhere
        ? `Filed in the Vault of ${doc.projectName ?? 'another project'}. Use it in this project to list it with this project’s data.`
        : 'Filed in this project’s Vault. Open it, review it and approve it from the Library tab.'}</p>
    </div>
  </details>;
}
