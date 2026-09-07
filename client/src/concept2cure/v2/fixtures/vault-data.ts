/**
 * Vault (DMS) fixture data — cross-cutting DMS folders and status vocabulary.
 *
 * Extracted from kit vault-dms.jsx (the inline _vaultCrossCutting builder and
 * _V_STATUS map). These are the corpus folders that sit alongside the dossier
 * spine: Agency correspondence, Templates, Working drafts, Sources & evidence,
 * and the read-only Audit log.
 */

/* ── Vault document node (leaf in the folder tree) ── */

/** The placement block for an uploaded document — projected by
 *  server/routes/c2c/project-vault.ts from real vault.documents columns. */
export interface VaultDocFiling {
  folderId: string | null;
  folderLabel: string;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  confidence: string | null;
  rationale: string | null;
}

export interface VaultDoc {
  id: string;
  num: string;
  title: string;
  type: string;
  status: string;
  pct: number;
  owner: string;
  ver: string;
  updated: string;
  preview: string;
  blocker?: boolean;
  flag?: string;
  /** 'authored' (rule-pack section) vs 'upload' (vault.documents row). */
  src?: 'authored' | 'upload';
  /** Upload-only extras, all projected from real columns. */
  docId?: string;
  sizeLabel?: string;
  hash?: string;
  filing?: VaultDocFiling;
}

export interface VaultFolder {
  id: string;
  code: string;
  label: string;
  children: (VaultFolder | VaultDoc)[];
}

/* ── Validation status vocabulary (shared/evidenceSchema.ts) ── */

export interface VaultStatus {
  label: string;
  tone: string;
}

export const VAULT_STATUS: Record<string, VaultStatus> = {
  final: { label: 'Final', tone: 'ok' },
  approved: { label: 'Approved', tone: 'ok' },
  reviewed: { label: 'Reviewed', tone: 'ok' },
  review: { label: 'In review', tone: 'ai' },
  pending_review: { label: 'Pending review', tone: 'ai' },
  draft: { label: 'Draft', tone: 'warn' },
  not_started: { label: 'Not started', tone: 'idle' },
  rejected: { label: 'Rejected', tone: 'warn' },
  /* An ingested file is complete AS a file — it has no drafting lifecycle, so
     neither "Draft" (the unknown-status fallback) nor "Final" (an approval
     claim) would be true of it. */
  uploaded: { label: 'Uploaded', tone: 'ok' },
  /* Upload filing states — the placement lifecycle, not an authoring one.
     'suggested' = the classifier proposed a folder and a person has not yet
     confirmed it; 'confirmed' = filed by a person (audited); 'unfiled' = the
     rules could not place it and it sits in the visible review queue. */
  suggested: { label: 'Auto-filed · confirm', tone: 'ai' },
  confirmed: { label: 'Filed', tone: 'ok' },
  unfiled: { label: 'Unfiled', tone: 'warn' },
};

export function vaultStatus(s: string): VaultStatus {
  return VAULT_STATUS[s] || VAULT_STATUS.draft;
}

/* ── Cross-cutting DMS folders ── */

function d(
  id: string, num: string, title: string, type: string, status: string,
  pct: number, owner: string, ver: string, updated: string, preview: string,
): VaultDoc {
  return { id, num, title, type, status, pct, owner, ver, updated, preview };
}


/* ── File-type icon selector (shared with VaultTree) ── */

export function vaultFileIconKey(doc: VaultDoc): string {
  const t = (doc.type || '').toLowerCase();
  if (/form/.test(t)) return 'fileText';
  if (/table|data/.test(t)) return 'grid';
  if (/csr|study report|report/.test(t)) return 'barChart';
  if (/label/.test(t)) return 'tag';
  if (/plan|charter/.test(t)) return 'clipboardList';
  return 'fileText';
}

/* ── Tree helpers ── */

export function isVaultDoc(n: VaultDoc | VaultFolder): n is VaultDoc {
  return n && ('num' in n || 'title' in n) && !('children' in n);
}

export function flattenDocs(nodes: (VaultDoc | VaultFolder)[]): VaultDoc[] {
  const out: VaultDoc[] = [];
  for (const n of nodes) {
    if (isVaultDoc(n)) out.push(n);
    else if ('children' in n) out.push(...flattenDocs(n.children));
  }
  return out;
}
