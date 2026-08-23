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

export function vaultCrossCuttingFolders(): VaultFolder[] {
  return [
    { id: 'cc-corr', code: 'Correspondence', label: 'Agency correspondence', children: [
      d('cc-c1', '—', 'FDA Day-74 filing communication', 'Letter', 'final', 100, 'FDA - CDER', 'v1.0', '3d ago', 'Filing review communication acknowledging receipt of NDA 212345 and confirming the 74-day filing decision.'),
      d('cc-c2', '—', 'Information Request — CMC stability (HAQ)', 'Letter', 'review', 60, 'FDA - CDER', 'v0.3', '2d ago', 'Agency requests justification for the 18-month stability trend and the 24-month shelf-life projection.'),
      d('cc-c3', '—', 'Type B Pre-IND meeting minutes', 'Minutes', 'final', 100, 'J. Chen', 'v1.0', '2w ago', 'FDA aligned on the nonclinical toxicology package. No further action.'),
    ]},
    { id: 'cc-tpl', code: 'Templates', label: 'Formatting templates', children: [
      d('cc-t1', '—', 'Concept2Cure House Style — CTD', 'Template', 'approved', 100, 'Reg Ops', 'v3.0', '1w ago', 'Corporate CTD/eCTD body template — extracted fonts, logo, margins and layout. Open in the Template library.'),
      d('cc-t2', '—', 'CSR — ICH E3 House Format', 'Template', 'approved', 100, 'Reg Ops', 'v2.0', '2w ago', 'Clinical study report house format, ICH E3 structure.'),
    ]},
    { id: 'cc-work', code: 'Working', label: 'Working drafts', children: [
      d('cc-w1', '—', 'ISS shell — pooled safety (WIP)', 'Working', 'draft', 35, 'Biostat', 'v0.3', '6h ago', 'Integrated summary of safety working draft; ADaM ADAE not yet locked.'),
      d('cc-w2', '—', '2.5 Clinical Overview — redline', 'Working', 'draft', 82, 'A. Müller', 'v0.9', '2h ago', 'Working redline of the Clinical Overview ahead of promotion to review.'),
    ]},
    { id: 'cc-src', code: 'Sources', label: 'Sources & evidence', children: [
      { id: 'cc-src-lit', code: 'literature', label: 'Literature', children: [
        d('cc-l1', '—', 'RTK-X inhibition in biliary tract cancer — meta-analysis', 'Literature', 'reviewed', 100, 'Corpus', '—', '1w ago', 'Eur J Cancer 2023 - imported to corpus - cited in §2.5.'),
      ]},
      { id: 'cc-src-pred', code: 'precedents', label: 'Precedents', children: [
        d('cc-p1', '—', 'Accelerated approval on ORR endpoint — SBA', 'Precedent', 'reviewed', 100, 'Corpus', '—', '1w ago', 'Drugs@FDA Summary Basis of Approval; ORR-based accelerated approval precedent.'),
      ]},
      { id: 'cc-src-data', code: 'datasets', label: 'Datasets', children: [
        d('cc-d1', '—', 'ADaM ADRS — responder analysis', 'Dataset', 'approved', 100, 'Data Mgmt', 'locked', '1w ago', 'ADaM responder dataset, data cut 2026-05-01 - locked - linked to §2.5 ORR claim.'),
      ]},
    ]},
    { id: 'cc-audit', code: 'Audit', label: 'Audit (read-only)', children: [
      d('cc-a1', '—', 'Corpus access & mutation log', 'Audit', 'final', 100, 'System', '—', 'live', '21 CFR Part 11 tamper-evident log of every upload, view, version and evidence link across the vault.'),
    ]},
  ];
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
