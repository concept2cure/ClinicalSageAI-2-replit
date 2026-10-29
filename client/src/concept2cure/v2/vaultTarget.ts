/**
 * The Vault's deep-link target: open the Vault on one named document.
 *
 * "File to Vault" in Authoring ends with "Open in Vault", and that used to land
 * on the Vault's first node. The document the person had just filed was
 * somewhere in the cabinet, and the next act on the filing path, "Place into
 * submission…", lives on that document's detail pane. So the path from an
 * approved document to a submission leaf had a step where the person had to
 * go looking (filing-path trace, 2026-10-15).
 *
 * One-shot, like the editor's target (editorTarget.ts): the sender publishes,
 * the Vault takes it once on mount and clears it, and a target for another
 * project is dropped rather than applied to the wrong vault.
 */
import { isVaultDoc, type VaultDoc, type VaultFolder } from './fixtures/vault-data';

interface VaultTarget {
  documentId: string;
  programId: string;
}

declare global {
  interface Window {
    /** Owned by this module: write through `setVaultTarget`, read through `takeVaultTarget`. */
    C2C_VAULT_TARGET?: VaultTarget | null;
  }
}

/** Said when a target is published, so a Vault already on screen takes it too (a review route's notice, RR1b). */
export const VAULT_TARGET_EVENT = 'c2c:vault-target';

/** Publish the document the Vault should open on next. Replaces any earlier target. */
export function setVaultTarget(target: VaultTarget): void {
  if (typeof window === 'undefined') return;
  const documentId = target.documentId.trim();
  const programId = target.programId.trim();
  window.C2C_VAULT_TARGET = documentId && programId ? { documentId, programId } : null;
  window.dispatchEvent(new Event(VAULT_TARGET_EVENT));
}

/** What the Vault found pending for it. */
export type TakenVaultTarget =
  | { kind: 'here'; documentId: string }
  /** Filed under another project: said on the Vault, never applied to it. */
  | { kind: 'other-project' };

/**
 * Take the pending target for `programId`, clearing it either way. A target
 * published for another project is reported as such, never applied here.
 */
export function takeVaultTarget(programId: string | null): TakenVaultTarget | null {
  if (typeof window === 'undefined') return null;
  const target = window.C2C_VAULT_TARGET ?? null;
  window.C2C_VAULT_TARGET = null;
  if (!target) return null;
  if (!programId || target.programId !== programId) return { kind: 'other-project' };
  return { kind: 'here', documentId: target.documentId };
}

/** Whether the pending target is for `programId`: a Vault on another project leaves it for the one it is for. */
export function vaultTargetIsFor(programId: string | null): boolean {
  return typeof window !== 'undefined' && !!programId && window.C2C_VAULT_TARGET?.programId === programId;
}

/** Drop a pending target, for a sender whose navigation was refused. */
export function clearVaultTarget(): void {
  if (typeof window !== 'undefined') window.C2C_VAULT_TARGET = null;
}

/**
 * Where a vault document sits in the tree: its row and the folder that holds it.
 * Matches on the document's uuid (`docId`), which is what the filing reported.
 */
export function locateVaultDocument(
  tree: readonly (VaultDoc | VaultFolder)[],
  documentId: string,
): { folderId: string; rowId: string } | null {
  for (const node of tree) {
    if (isVaultDoc(node)) continue;
    const folder = node as VaultFolder;
    const row = folder.children.find((c) => isVaultDoc(c) && (c as VaultDoc).docId === documentId);
    if (row) return { folderId: folder.id, rowId: row.id };
    const nested = locateVaultDocument(folder.children, documentId);
    if (nested) return nested;
  }
  return null;
}
