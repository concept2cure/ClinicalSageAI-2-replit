/**
 * In the editor's Sources rail, beside the section's data-room citations: the Vault versions this section was drafted
 * from that a later approved version has replaced (S12; founder decisions P-83, P-109 with its third clarification).
 *
 * A work project's deliverable is a Vault document's version family. A section drafted from one of its versions keeps
 * that link as span lineage (span-lineage-vault.ts). Once a later version of that document is approved, the project's
 * changes name the section (GET /api/c2c/projects/:id/source-changes, `vaultChanges`; vault-citation-changes.ts); this
 * says the same here, in the rail's own words, where the section is being edited. A report, never a rewrite.
 *
 * Split from DocumentWorkbench.tsx, which renders it at the foot of the Sources rail. Not a panel or a card: rows in the
 * rail's own markup, drawn only when there is something to say. A read that fails says so; it never reads as "none".
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { setVaultTarget } from '../vaultTarget';

/** One section's replaced Vault version, as the project's changes report it. */
export interface VaultReplacement {
  sectionId: string;
  citedVaultId: string;
  citedVersion: string | null;
  vaultTitle: string | null;
  approvedVaultId: string;
  approvedVersion: string | null;
}

interface ChangesRead { vaultChanges: VaultReplacement[]; vaultCount: number }

const isChangesRead: ShapeGuard<ChangesRead> = (value): value is ChangesRead => {
  const read = value as Partial<ChangesRead> | null;
  return !!read && Array.isArray(read.vaultChanges) && read.vaultCount === read.vaultChanges.length
    && read.vaultChanges.every((row) => row && typeof row.sectionId === 'string'
      && typeof row.citedVaultId === 'string' && typeof row.approvedVaultId === 'string');
};

const versionWords = (v: string | null) => (v ? `v${v}` : 'a later version');

/** "Drafted from v1.0 · v3.0 is approved". */
export function replacementText(row: VaultReplacement): string {
  return `Drafted from ${row.citedVersion ? `v${row.citedVersion}` : 'an earlier version'} · ${versionWords(row.approvedVersion)} is approved`;
}

export function SectionVaultReplacements({ programId, sectionId, onNav }: {
  programId: string | null;
  sectionId: string;
  onNav: (id: string) => void;
}) {
  const path = programId ? `/api/c2c/projects/${encodeURIComponent(programId)}/source-changes` : null;
  const read = useLiveData<ChangesRead>(path, [path, sectionId], isChangesRead);
  if (!programId || read.loading) return null;
  if (read.error || !read.data) {
    return (
      <p className="sec-sub" role="status" data-testid="section-vault-replacements-unread">
        Vault citations could not be checked for this section.
      </p>
    );
  }
  const rows = read.data.vaultChanges.filter((row) => row.sectionId === sectionId);
  if (rows.length === 0) return null;
  return (
    <div data-testid="section-vault-replacements">
      {rows.map((row) => (
        <div key={`${row.citedVaultId}:${row.approvedVaultId}`} className="cmt">
          <div className="cmt-meta">
            <b>{row.vaultTitle || 'Vault document'}</b>
            <span className="cmt-when">· Vault</span>
          </div>
          <div className="cmt-body" style={{ display: 'grid', gap: 4 }}>
            <span className="sp-tone-warn" style={{ fontSize: 12 }}
              title="A later version of this Vault document was approved after this section was drafted from an earlier one. Nothing has been rewritten: read the approved version and decide whether it changes what this section says.">
              Source has been replaced since cited
            </span>
            <span style={{ fontSize: 12, opacity: 0.85 }}>{replacementText(row)}</span>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="nda-open"
                onClick={() => { setVaultTarget({ documentId: row.approvedVaultId, programId }); onNav('vault'); }}>
                {I.vault} Open in Vault
              </button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
