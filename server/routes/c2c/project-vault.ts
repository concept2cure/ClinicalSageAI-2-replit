/**
 * /api/c2c/project-vault/:id — Vault (DMS) surface read-model.
 *
 * Serves the display shape that client/src/concept2cure/v2/surfaces/Vault.tsx
 * renders (its `Spine` of VaultFolder / VaultDoc), populated from REAL,
 * org-scoped data:
 *
 *   regulatory_programs      → project name + product modality (→ vault view)
 *   c2c_documents            → one top-level folder per active document build
 *   c2c_rule_packs           → the required-section spec tree for each build
 *   c2c_document_sections    → LIVE section status / version / owner / timestamp
 *   users                    → real owner attribution (section & document owner_id)
 *   concept2cure_artifacts   → the "Module 3 (CMC)" branch: governed §3.x
 *                              artifacts the CMC compile bridge files, via the
 *                              program→project anchor
 *   vault.documents          → the "Uploaded files" branch: what this surface's
 *                              own Upload button ingests
 *
 * This is the same document/section data the existing
 * `GET /api/c2c/projects/:id/vault-structure` endpoint reads, but mapped
 * SERVER-SIDE straight into the Vault.tsx display shape (folder tree of
 * VaultDoc/VaultFolder) so the surface can render it with a single fetch and
 * no client-side converter — and with real owner + relative-modified
 * provenance instead of the client converter's placeholders.
 *
 * Response envelope: { success: true, data: <displayShape> }.
 *
 * HONESTY (regulated product): every field is projected or faithfully derived
 * from a real column. Nothing is fabricated. The fixture-only "cross-cutting"
 * DMS folders (Agency correspondence, Templates, Working drafts, Sources &
 * evidence, Audit) and the surface's client-synthesized corpus-indexing / chunk
 * counts are NOT emitted here — they have no backing store in this model. See
 * the route module's design notes / PR caveats.
 *
 * Mounted (by the central bootstrap) at /api/c2c/project-vault behind
 * authMiddleware, which supplies org context on req. Uses its own sub-prefix
 * (not stacked on /api/c2c/projects) to avoid a second authMiddleware pass on
 * the shared prefix — matching the per-surface read-model convention in
 * register-inline-routes.ts.
 *
 * @module server/routes/c2c/project-vault
 */

import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { productTypesToSegments } from '../../services/report-os/segment.js';
import {
  filingTypesForView,
  foldersForView,
  VAULT_DOC_KINDS,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy.js';
import { sectionHasContentSql, sectionCompletionPct } from '../../services/c2c/section-content.js';
import {
  resolveVaultView,
  resolveOrgVaultView,
  isFolderInView,
  folderLabel,
} from '../../services/vault/vault-filing.service.js';
import { listClientDocuments } from '../../services/clinical-regulatory-evidence/evidence-spine.service.js';
import { writeChainedAuditRow } from '../../services/auditService.js';

const logger = createScopedLogger('c2c-project-vault-routes');

// ─── Display-shape types (mirror client Vault.tsx VaultDoc / VaultFolder) ──────

interface VaultDoc {
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
  /** Discriminator: an authored section vs an uploaded vault.documents row. */
  src?: 'authored' | 'upload';
  /** Upload-only extras (all projected from real columns). */
  docId?: string;
  sizeLabel?: string;
  hash?: string;
  filing?: UploadFiling;
}

/** The placement block for an uploaded document — mirrors vault-ingest. */
interface UploadFiling {
  folderId: string | null;
  folderLabel: string;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  confidence: string | null;
  rationale: string | null;
}

interface VaultFolder {
  id: string;
  code: string;
  label: string;
  children: Array<VaultFolder | VaultDoc>;
}

/** One Data Room source with its derived pipeline stage. */
interface DataRoomRow {
  id: number;
  title: string;
  kind: string;
  sizeLabel: string;
  addedAt: string;
  /** captured → classified → filed; DERIVED, never stored guesswork:
   *  'filed' = its checksum matches a vault document in this program,
   *  'classified' = the capture path stamped a dossier classification,
   *  'captured' = neither. */
  stage: 'captured' | 'classified' | 'filed';
  readState: string;
  suggestedFolder: string | null;
  suggestedFolderLabel: string;
  evidenceKind: string | null;
  confidence: string | null;
  needsReview: boolean;
}

interface DataRoomBlock {
  captured: number;
  classified: number;
  filed: number;
  sources: DataRoomRow[];
}

interface VaultDisplayShape {
  program: string;
  spine: string;
  standard: string;
  documentCount: number;
  tree: VaultFolder[];
  /** Honest signal: the c2c document store is not provisioned in this env. */
  pendingStore?: boolean;
  /** Uploaded documents awaiting a person's filing decision. */
  unfiledCount?: number;
  /** The capture→classify→file pipeline over the project's Data Room. */
  dataRoom?: DataRoomBlock;
  /**
   * Branches that could not be served, with why. A vault that silently omits
   * "Uploaded files" because its store is unprovisioned reads exactly like a
   * vault with no uploads — this field is the difference. The ONE degradation
   * contract for every derived branch (Module 3, the filing cabinet, the data
   * room); a real failure — anything but a missing store — is a 500, never a
   * silent degrade.
   */
  unavailable?: Array<{ branch: string; reason: string }>;
}

// ─── Row shapes (what the SQL projects) ────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string | null;
  product_type: string | null;
}

interface DocRow {
  id: string;
  doc_type: string | null;
  agency: string | null;
  rule_pack_version: string | null;
  title: string | null;
  status: string | null;
  readiness: number | null;
  updated_at: string | Date | null;
  owner_name: string | null;
  required_sections: unknown;
}

interface SectionSpec {
  key: string;
  parent_key?: string | null;
  label?: string | null;
  mandatory?: boolean | null;
  path_order?: number | null;
}

interface LiveSection {
  section_key: string;
  status: string | null;
  version: number | null;
  updated_at: string | Date | null;
  has_content: boolean;
  owner_name: string | null;
}

interface SpecNode {
  spec: SectionSpec;
  children: SpecNode[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Org id from tenant/user context (integer — c2c tables key on numeric org). */
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** ISO/Date → "3d ago"; empty/invalid → em dash. Never fabricates a time. */
function relativeTime(value: unknown): string {
  if (!value) return '—';
  const t = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.round(days / 7);
  if (wks < 5) return `${wks}w ago`;
  const mos = Math.round(days / 30);
  return `${mos}mo ago`;
}

/**
 * Normalize the c2c section/document status vocabulary
 * (todo | drafted | review | approved | locked) into the vocabulary the Vault
 * surface's status chip understands (vaultStatus: final | approved | reviewed |
 * review | draft | not_started | ...). A faithful semantic mapping of a real
 * value — not a fabricated status. When no live status exists, fall back on the
 * real content-presence flag.
 */
function normalizeStatus(raw: string | null | undefined, hasContent: boolean): string {
  if (!raw) return hasContent ? 'draft' : 'not_started';
  switch (raw) {
    case 'approved': return 'approved';
    case 'locked':   return 'final';
    case 'review':   return 'review';
    case 'drafted':  return 'draft';
    case 'todo':     return 'not_started';
    default:         return hasContent ? 'draft' : 'not_started';
  }
}

/** Spine label = the view's primary filing framework + its governing refs
 *  (same basis the shipped client `vaultStructureToSpine` converter uses). */
function vaultViewLabel(view: VaultViewId): string {
  const filings = filingTypesForView(view);
  const primary = filings[0];
  if (!primary) return view;
  const refs = (primary as { regulatoryRefs?: string[] }).regulatoryRefs;
  const suffix = refs && refs.length ? ` · ${refs.join(' · ')}` : '';
  return `${primary.label}${suffix}`;
}

/** Bytes → '3.4 MB' (real size only; null → em dash, never invented). */
function prettySize(bytes: unknown): string {
  const n = typeof bytes === 'string' ? Number(bytes) : (bytes as number);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const KIND_LABEL = new Map(VAULT_DOC_KINDS.map(k => [k.value as string, k.label]));

export interface UploadRow {
  id: string;
  document_code: string | null;
  document_title: string | null;
  document_type: string | null;
  version: string | null;
  file_name: string | null;
  file_size: string | number | null;
  mime_type: string | null;
  content_hash: string | null;
  folder_id: string | null;
  evidence_kind: string | null;
  ctd_section: string | null;
  placement_status: string | null;
  placement_confidence: string | null;
  placement_rationale: string | null;
  updated_at: string | Date | null;
  owner_name: string | null;
}

/** An uploaded vault.documents row → a VaultDoc leaf (all real columns).
 *  Exported for the tree-merge regression test. */
export function uploadLeaf(view: VaultViewId, row: UploadRow): VaultDoc {
  const placementStatus = row.placement_status || 'unfiled';
  const kind = row.evidence_kind ? KIND_LABEL.get(row.evidence_kind) ?? row.evidence_kind : null;
  const title = row.document_title || row.file_name || 'Document';
  const size = prettySize(row.file_size);
  const leaf: VaultDoc = {
    id: `up-${row.id}`,
    num: row.ctd_section ?? '—',
    title,
    type: kind ?? (row.document_type && row.document_type !== 'OTHER' ? row.document_type : 'File'),
    status: placementStatus,
    // Uploads have no authoring completion; 0 rather than a fabricated figure.
    pct: 0,
    owner: row.owner_name ?? '—',
    ver: row.version ? `v${row.version}` : '—',
    updated: relativeTime(row.updated_at),
    preview: `${row.file_name ?? title} · ${size}` +
      (row.content_hash ? ` · SHA-256 ${row.content_hash.slice(0, 12)}…` : ''),
    src: 'upload',
    docId: row.id,
    sizeLabel: size,
    hash: row.content_hash ?? undefined,
    filing: {
      folderId: row.folder_id,
      folderLabel: folderLabel(view, row.folder_id),
      evidenceKind: row.evidence_kind,
      ctdSection: row.ctd_section,
      placementStatus,
      confidence: row.placement_confidence,
      rationale: row.placement_rationale,
    },
  };
  if (placementStatus === 'unfiled') {
    leaf.flag = row.placement_rationale ?? 'Not filed into the dossier yet.';
  }
  return leaf;
}

/**
 * The filing cabinet: the program's vault-view folder taxonomy with every
 * uploaded document placed where its (suggested or confirmed) filing says,
 * plus an always-visible Unfiled queue. Folders render even when empty — the
 * cabinet IS the dossier shape a regulatory associate expects to see.
 * Exported for the tree-merge regression test.
 */
export function filingCabinet(view: VaultViewId, uploads: UploadRow[]): VaultFolder {
  const unfiled = uploads.filter(u => !u.folder_id || (u.placement_status || 'unfiled') === 'unfiled');
  const byFolder = new Map<string, UploadRow[]>();
  for (const u of uploads) {
    if (!u.folder_id || (u.placement_status || 'unfiled') === 'unfiled') continue;
    const list = byFolder.get(u.folder_id) ?? [];
    list.push(u);
    byFolder.set(u.folder_id, list);
  }
  const children: Array<VaultFolder | VaultDoc> = [];
  children.push({
    id: 'cab-unfiled',
    code: '',
    label: 'Unfiled · needs review',
    children: unfiled.map(u => uploadLeaf(view, u)),
  });
  for (const folder of foldersForView(view)) {
    children.push({
      id: `cab-${folder.id}`,
      code: '',
      label: folder.label,
      children: (byFolder.get(folder.id) ?? []).map(u => uploadLeaf(view, u)),
    });
  }
  return {
    id: 'cabinet',
    code: '',
    label: 'Source files · filing cabinet',
    children,
  };
}

/** A rule-pack section spec merged with its live row → a VaultDoc leaf. */
function leafDoc(doc: DocRow, spec: SectionSpec, live: LiveSection | undefined): VaultDoc {
  const hasContent = live?.has_content ?? false;
  const mandatory = spec.mandatory ?? false;
  const docTitle = doc.title || doc.doc_type || 'Document';
  const label = spec.label ?? spec.key;
  const leaf: VaultDoc = {
    id: `sec-${doc.id}-${spec.key}`,
    num: spec.key,
    title: label,
    type: mandatory ? 'Required' : 'Optional',
    status: normalizeStatus(live?.status ?? null, hasContent),
    // Completion, on the SAME definition the document row beside this one uses
    // (c2c_documents.readiness = % of sections approved/locked). This used to be
    // `hasContent ? 100 : 0`, so one typed sentence reported a finished section
    // next to a document reporting 0%. Drafting progress is still carried by
    // `status` and by the mandatory-without-content blocker below.
    pct: sectionCompletionPct(live?.status ?? null),
    // Owner is resolved ONLY from a real user (section owner_id); unattributed
    // sections stay '—' rather than borrowing the target agency's name.
    owner: live?.owner_name ?? '—',
    ver: live?.version != null ? `v${live.version}` : '—',
    updated: live ? relativeTime(live.updated_at) : '—',
    preview: `${docTitle} · ${spec.key} · ${label}${mandatory ? ' · mandatory section' : ''}`,
  };
  if (mandatory && !hasContent) {
    leaf.blocker = true;
    leaf.flag = 'Mandatory section — no content yet';
  }
  return leaf;
}

/** Fallback leaf for a document with no rule-pack section spec. */
function docLevelLeaf(doc: DocRow): VaultDoc {
  const readiness = typeof doc.readiness === 'number' ? doc.readiness : 0;
  const docTitle = doc.title || doc.doc_type || 'Document';
  return {
    id: `doc-${doc.id}`,
    num: '—',
    title: docTitle,
    type: 'Document',
    status: normalizeStatus(doc.status, readiness > 0),
    pct: readiness,
    owner: doc.owner_name ?? '—',
    ver: '—',
    updated: relativeTime(doc.updated_at),
    preview: docTitle + (doc.agency ? ` · ${doc.agency}` : ''),
  };
}

/** Build the nested VaultFolder/VaultDoc tree for one document's sections. */
function sectionsToNodes(
  doc: DocRow,
  specs: SectionSpec[],
  live: Map<string, LiveSection>,
): Array<VaultFolder | VaultDoc> {
  const sorted = [...specs].sort(
    (a, b) => (a.path_order ?? 0) - (b.path_order ?? 0),
  );
  const byKey: Record<string, SpecNode> = {};
  const roots: SpecNode[] = [];
  for (const spec of sorted) byKey[spec.key] = { spec, children: [] };
  for (const spec of sorted) {
    const node = byKey[spec.key];
    const parent = spec.parent_key ? byKey[spec.parent_key] : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const toNode = (n: SpecNode): VaultFolder | VaultDoc => {
    if (n.children.length > 0) {
      return {
        id: `sec-${doc.id}-${n.spec.key}`,
        code: n.spec.key,
        label: n.spec.label ?? n.spec.key,
        children: n.children.map(toNode),
      };
    }
    return leafDoc(doc, n.spec, live.get(n.spec.key));
  };
  return roots.map(toNode);
}

/** One document → its top-level VaultFolder. */
function documentFolder(doc: DocRow, live: Map<string, LiveSection>): VaultFolder {
  const specs = Array.isArray(doc.required_sections)
    ? (doc.required_sections as SectionSpec[])
    : [];
  const children = specs.length > 0
    ? sectionsToNodes(doc, specs, live)
    : [docLevelLeaf(doc)];
  return {
    id: `vaultdoc-${doc.id}`,
    code: (doc.doc_type ?? '').toUpperCase(),
    label: doc.title || doc.doc_type || 'Document',
    children,
  };
}

/** Count leaf VaultDocs in a tree. */
function countDocs(nodes: Array<VaultFolder | VaultDoc>): number {
  let n = 0;
  for (const node of nodes) {
    if ('children' in node) n += countDocs(node.children);
    else n += 1;
  }
  return n;
}

/** Missing table (42P01) / missing column (42703) — a store this environment
 *  has not provisioned. The branch degrades honestly instead of 500ing. */
function isMissingStore(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
}

interface M3ArtifactRow {
  id: string | number;
  artifact_id: string;
  title: string | null;
  ctd_section: string;
  status: string | null;
  version: number | null;
  updated_at: string | Date | null;
}

/**
 * The Module 3 (CMC) branch: governed §3.x artifacts the CMC compile bridge
 * files into concept2cure_artifacts, reached through the program→project
 * anchor (the same EXISTS idiom mdx-vault.ts uses — org predicate repeated on
 * projects so a mis-anchored row can never pull another tenant's data in).
 * These rows were invisible in this surface even though the CMC module's
 * "vault" affordances pointed here — the data room now lists what the
 * pipeline files, organized by CTD section.
 */
async function module3Branch(programId: string, orgId: number): Promise<VaultFolder | null> {
  const artRes = await pool.query(
    `SELECT a.id, a.artifact_id, a.title, a.ctd_section, a.status, a.version, a.updated_at
       FROM concept2cure_artifacts a
      WHERE a.organization_id = $2
        AND a.status != 'archived'
        AND a.ctd_section LIKE '3.%'
        AND EXISTS (SELECT 1 FROM projects p
                     WHERE p.id = a.project_id
                       AND p.organization_id = a.organization_id
                       AND p.regulatory_program_id = $1::uuid)
      ORDER BY a.ctd_section, a.version DESC`,
    [programId, orgId],
  );
  if (artRes.rows.length === 0) return null;
  const children: VaultDoc[] = (artRes.rows as M3ArtifactRow[]).map((a) => ({
    id: `m3art-${a.id}`,
    num: a.ctd_section,
    title: a.title || a.ctd_section,
    type: 'Governed artifact',
    // The same status vocabulary the artifact registry stores, mapped through
    // the one normalizer; completion is the section-approval definition the
    // rest of this read-model uses (approved/locked = 100, else 0).
    status: normalizeStatus(a.status === 'draft' ? 'drafted' : a.status, true),
    pct: sectionCompletionPct(a.status),
    owner: '—',
    ver: a.version != null ? `v${a.version}` : '—',
    updated: relativeTime(a.updated_at),
    preview: `${a.title || a.ctd_section} · CTD §${a.ctd_section} · compiled from CMC canonical sources`,
  }));
  return { id: 'm3-cmc', code: 'M3', label: 'Module 3 (CMC)', children };
}

/* The Uploaded-files branch is the filing cabinet (uploadLeaf / filingCabinet
   above): the same vault.documents rows the flat "Uploaded files" list showed,
   carrying their dossier PLACEMENT — the classifier's suggested folder, the
   person-confirmed filing, or the visible Unfiled queue — instead of a single
   undifferentiated bucket. One uploads branch; two never merged. */

// ─── Router factory ─────────────────────────────────────────────────────────────

export default function createProjectVaultRoutes(): Router {
  const router = Router();

  /**
   * GET /api/c2c/project-vault/:id
   * The Vault (DMS) surface display shape for one project, from real data.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(403).json({ success: false, error: 'FORBIDDEN' });

    const id = Array.isArray(req.params.id) ? (req.params.id[0] ?? '') : req.params.id;
    // Guard the uuid cast — a non-uuid id would otherwise throw 22P02 → 500.
    if (!UUID_RE.test(id)) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

    try {
      // 1) Project (org-scoped) → name + product modality.
      const projRes = await pool.query(
        `SELECT id, name, product_type
           FROM regulatory_programs
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          LIMIT 1`,
        [id, orgId],
      );
      if (projRes.rows.length === 0) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
      const project = projRes.rows[0] as ProjectRow;

      // 2) Derive the vault view (project product_type → segment; else the org
      //    union; else the cross-sponsor service view). Same mapping the
      //    ingest path uses (vault-filing.service), so a file cannot be
      //    classified against one view and rendered under another — computed
      //    from the project row already fetched, not a second read.
      const projSegs = project.product_type ? productTypesToSegments([project.product_type]) : [];
      const view: VaultViewId = projSegs[0] ?? (await resolveOrgVaultView(orgId));

      // 3) The project's active document builds + their rule-pack section specs.
      const docsRes = await pool.query(
        `SELECT d.id, d.doc_type, d.agency, d.rule_pack_version, d.title,
                d.status, d.readiness, d.updated_at,
                COALESCE(du.name, du.email) AS owner_name,
                rp.required_sections
           FROM c2c_documents d
           LEFT JOIN c2c_rule_packs rp
             ON rp.doc_type = d.doc_type AND rp.agency = d.agency
                AND rp.version = d.rule_pack_version
           LEFT JOIN users du ON du.id = d.owner_id
          WHERE d.project_id = $1 AND d.org_id = $2
          ORDER BY d.updated_at DESC`,
        [id, orgId],
      );

      // 4) Per-document live section status (+ owner + timestamp) → display tree.
      const tree: VaultFolder[] = [];
      for (const doc of docsRes.rows as DocRow[]) {
        const secRes = await pool.query(
          // The document_id was already resolved from the org-filtered
          // c2c_documents query above; the EXISTS re-asserts that ownership
          // inline (defense in depth + explicit org_id scoping so the section
          // read never widens past the caller's tenant).
          `SELECT ds.section_key, ds.status, ds.version, ds.updated_at,
                  ${sectionHasContentSql('ds.content')} AS has_content,
                  COALESCE(u.name, u.email) AS owner_name
             FROM c2c_document_sections ds
             LEFT JOIN users u ON u.id = ds.owner_id
            WHERE ds.document_id = $1
              AND EXISTS (SELECT 1 FROM c2c_documents d
                           WHERE d.id = ds.document_id AND d.org_id = $2)`,
          [doc.id, orgId],
        );
        const live = new Map<string, LiveSection>(
          (secRes.rows as LiveSection[]).map((r): [string, LiveSection] => [r.section_key, r]),
        );
        tree.push(documentFolder(doc, live));
      }

      // 5) Derived branches: what the pipelines file for this program. ONE
      //    degradation contract for all of them — a store this environment has
      //    not provisioned is REPORTED in `unavailable`, never rendered as an
      //    empty branch (which would read as "no documents"); any other
      //    failure is a real error and 500s.
      const unavailable: Array<{ branch: string; reason: string }> = [];
      try {
        const m3 = await module3Branch(id, orgId);
        if (m3) tree.push(m3);
      } catch (err) {
        if (!isMissingStore(err)) throw err;
        unavailable.push({
          branch: 'Module 3 (CMC)',
          reason: 'The governed artifact registry (or its program anchor) is not provisioned in this environment.',
        });
      }

      // 6) Uploaded files → the filing cabinet: the same vault.documents rows
      //    the Upload button ingests, placed where their (suggested or
      //    confirmed) filing says, plus the always-visible Unfiled queue.
      let uploads: UploadRow[] = [];
      let uploadsStoreMissing = false;
      try {
        const upRes = await pool.query(
          `SELECT d.id, d.document_code, d.document_title, d.document_type,
                  d.version, d.file_name, d.file_size, d.mime_type, d.content_hash,
                  d.folder_id, d.evidence_kind, d.ctd_section,
                  d.placement_status, d.placement_confidence, d.placement_rationale,
                  d.updated_at,
                  COALESCE(u.name, u.email) AS owner_name
             FROM vault.documents d
             LEFT JOIN users u ON u.id = d.created_by
            WHERE d.program_id = $1 AND d.deleted_at IS NULL
              AND EXISTS (
                SELECT 1 FROM regulatory_programs rp
                 WHERE rp.id = d.program_id
                   AND rp.organization_id = $2
                   AND rp.deleted_at IS NULL
              )
            ORDER BY d.updated_at DESC`,
          [id, orgId],
        );
        uploads = upRes.rows as UploadRow[];
        tree.push(filingCabinet(view, uploads));
      } catch (err) {
        if (!isMissingStore(err)) throw err;
        uploadsStoreMissing = true;
        unavailable.push({
          branch: 'Uploaded files',
          reason: 'The vault document store (vault.documents) is not provisioned in this environment.',
        });
      }
      const unfiledCount = uploads.filter(
        u => !u.folder_id || (u.placement_status || 'unfiled') === 'unfiled',
      ).length;

      // 7) The Data Room pipeline: every captured source with its DERIVED
      //    stage — 'filed' is a checksum join against the uploads, computed
      //    not stored, so it cannot go stale. With the uploads store missing
      //    that join cannot be derived, and a room whose Filed count silently
      //    read zero would be the error-as-empty lie — so the room is
      //    reported unavailable alongside it.
      let dataRoom: DataRoomBlock | undefined;
      if (uploadsStoreMissing) {
        unavailable.push({
          branch: 'Data room',
          reason: "The 'filed' stage joins captured sources against the uploads store, which is not provisioned — pipeline stages cannot be derived.",
        });
      } else {
        try {
          const sources = await listClientDocuments(orgId, { programId: id });
          const vaultHashes = new Set(
            uploads.map(u => u.content_hash).filter((h): h is string => Boolean(h)),
          );
          const rows: DataRoomRow[] = sources.map(s => {
            const meta = (s.metadata ?? {}) as Record<string, unknown>;
            const dossier = (meta.dossier ?? null) as
              | { evidenceKind?: string | null; suggestedFolder?: string | null;
                  confidence?: string | null; needsReview?: boolean }
              | null;
            const filed = Boolean(s.checksum && vaultHashes.has(s.checksum));
            const stage: DataRoomRow['stage'] = filed ? 'filed' : dossier ? 'classified' : 'captured';
            const mime = typeof meta.mimeType === 'string' ? meta.mimeType : '';
            const kind =
              /pdf/i.test(mime) ? 'PDF'
              : /word|docx?/i.test(mime) ? 'Word'
              : /sheet|excel|csv/i.test(mime) ? 'Sheet'
              : /image/i.test(mime) ? 'Image'
              : /text|markdown/i.test(mime) ? 'Text'
              : 'File';
            const readState =
              s.extractionStatus === 'extracted' ? 'Read'
              : s.extractionStatus === 'failed' ? 'Text not readable'
              : 'Not processed yet';
            const suggestedFolder = dossier?.suggestedFolder ?? null;
            return {
              id: s.id,
              title: s.title ?? 'Untitled source',
              kind,
              sizeLabel: prettySize(meta.fileSize),
              addedAt: relativeTime(s.createdAt),
              stage,
              readState,
              suggestedFolder,
              suggestedFolderLabel: folderLabel(view, suggestedFolder),
              evidenceKind: dossier?.evidenceKind ?? null,
              confidence: dossier?.confidence ?? null,
              needsReview: Boolean(dossier?.needsReview),
            };
          });
          dataRoom = {
            captured: rows.length,
            classified: rows.filter(r => r.stage !== 'captured').length,
            filed: rows.filter(r => r.stage === 'filed').length,
            sources: rows,
          };
        } catch (err) {
          if (!isMissingStore(err)) throw err;
          unavailable.push({
            branch: 'Data room',
            reason: 'The data room store (cre_evidence_sources) is not provisioned in this environment.',
          });
        }
      }

      const data: VaultDisplayShape = {
        program: project.name || 'Vault',
        spine: vaultViewLabel(view),
        standard: view,
        documentCount: countDocs(tree),
        tree,
        unfiledCount,
        ...(dataRoom ? { dataRoom } : {}),
        ...(unavailable.length ? { unavailable } : {}),
      };
      return res.json({ success: true, data });
    } catch (err: unknown) {
      // Fail closed on a not-yet-provisioned store (missing table) → honest,
      // empty vault so the surface degrades to its fixture rather than 500ing.
      if ((err as { code?: string })?.code === '42P01') {
        const empty: VaultDisplayShape = {
          program: 'Vault',
          spine: '',
          standard: 'service',
          documentCount: 0,
          tree: [],
          pendingStore: true,
        };
        return res.json({ success: true, data: empty });
      }
      logger.error('project vault read error', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'Failed to build project vault' });
    }
  });

  /**
   * POST /api/c2c/project-vault/:id/file — commit a filing decision.
   *
   * The classifier only ever SUGGESTS; this is where a person confirms the
   * suggestion, moves the document to another folder, or explicitly unfiles
   * it. The placement change and its hash-chained Part 11 audit row commit in
   * one transaction — a filing decision is a governed act on a regulated
   * corpus, not a UI preference.
   *
   * Body:
   *   documentId  vault.documents uuid (required)
   *   confirm     true → keep the suggested folder, mark it confirmed
   *   folderId    move to this folder (must exist in the program's view
   *               taxonomy) · null → unfile
   *   evidenceKind / ctdSection  optional refinements recorded with the move
   *   note        optional reason, recorded as the placement rationale
   */
  /**
   * GET /api/c2c/project-vault/:id/documents/:documentId/download
   *
   * Hand back the bytes of one uploaded vault document.
   *
   * The Vault's own "Download" button did `onAsk('Download ' + sel.title)` —
   * it typed a sentence into the assistant rail. On a document management
   * system, on the control labelled Download, next to a download icon. No file
   * ever left the vault through this surface, and the ingest path had been
   * writing the bytes to disk all along (vault-ingest.ts stores them at
   * `s3_key` and treats a write failure as FATAL precisely so a content hash
   * never describes bytes nobody holds).
   *
   * Scoped exactly like every other read here: the program is re-checked
   * against the caller's organization, and the document against the program.
   * The row's content_hash is verified against the bytes on disk before they
   * are sent — a governed document store that serves a file it cannot prove is
   * the file it recorded is not a governed store, and a silent mismatch is how
   * a superseded or tampered copy leaves the building.
   */
  router.get('/:id/documents/:documentId/download', async (req: Request, res: Response) => {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(403).json({ success: false, error: 'FORBIDDEN' });

    const id = Array.isArray(req.params.id) ? (req.params.id[0] ?? '') : req.params.id;
    if (!UUID_RE.test(id)) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const documentId = String(req.params.documentId ?? '');
    if (!UUID_RE.test(documentId)) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

    try {
      // The program must be this org's before any document of it is served.
      const prog = await pool.query(
        `SELECT id FROM regulatory_programs
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, orgId],
      );
      if (prog.rows.length === 0) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

      const docRes = await pool.query(
        `SELECT id, file_name, document_title, mime_type, file_size, s3_key, content_hash
           FROM vault.documents
          WHERE id = $1 AND program_id = $2 AND deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM regulatory_programs rp
               WHERE rp.id = vault.documents.program_id
                 AND rp.organization_id = $3
                 AND rp.deleted_at IS NULL
            )
          LIMIT 1`,
        [documentId, id, orgId],
      );
      if (docRes.rows.length === 0) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
      const doc = docRes.rows[0] as {
        id: string; file_name: string | null; document_title: string | null;
        mime_type: string | null; file_size: string | number | null;
        s3_key: string | null; content_hash: string | null;
      };

      if (!doc.s3_key) {
        // A row with no storage key describes a document whose bytes were never
        // kept. Say that rather than 404 — the record exists, the file does not.
        return res.status(409).json({
          success: false,
          error: 'NO_STORED_FILE',
          message: 'This vault record has no stored file — it was catalogued without content.',
        });
      }

      const resolved = path.resolve(process.cwd(), doc.s3_key);
      // Refuse a key that escapes the storage root. `s3_key` is written by this
      // codebase today, but a path-traversal read is not a risk worth carrying
      // on the assumption that it always will be.
      const root = path.resolve(process.cwd(), 'uploads');
      if (!resolved.startsWith(root + path.sep)) {
        logger.error('vault download refused: storage key escapes the uploads root', { documentId });
        return res.status(409).json({ success: false, error: 'NO_STORED_FILE' });
      }

      let bytes: Buffer;
      try {
        bytes = await fs.readFile(resolved);
      } catch {
        logger.error('vault download: stored file missing on disk', { documentId, key: doc.s3_key });
        return res.status(409).json({
          success: false,
          error: 'STORED_FILE_MISSING',
          message: 'The vault record exists but its stored file could not be read. Nothing was downloaded.',
        });
      }

      if (doc.content_hash) {
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== doc.content_hash) {
          logger.error('vault download refused: content hash mismatch', {
            documentId, recorded: doc.content_hash.slice(0, 12), actual: actual.slice(0, 12),
          });
          return res.status(409).json({
            success: false,
            error: 'CONTENT_HASH_MISMATCH',
            message:
              'The stored file does not match the hash recorded for it, so it was not served. Report this — the vault copy may have been altered.',
          });
        }
      }

      const name = doc.file_name || doc.document_title || 'document';
      const safe = name.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
      res.setHeader('Content-Length', String(bytes.length));
      // The recorded hash travels with the file, so a caller can check the copy
      // it received against the record without a second request.
      if (doc.content_hash) res.setHeader('X-Content-SHA256', doc.content_hash);
      return res.send(bytes);
    } catch (err) {
      logger.error('vault download failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'DOWNLOAD_FAILED' });
    }
  });

  router.post('/:id/file', async (req: Request, res: Response) => {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    const userId: number | null = (req as any).user?.id ?? null;

    const id = Array.isArray(req.params.id) ? (req.params.id[0] ?? '') : req.params.id;
    if (!UUID_RE.test(id)) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

    const body = (req.body ?? {}) as {
      documentId?: unknown; confirm?: unknown; folderId?: unknown;
      evidenceKind?: unknown; ctdSection?: unknown; note?: unknown;
    };
    const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    if (!UUID_RE.test(documentId)) {
      return res.status(400).json({ success: false, error: 'documentId (uuid) is required' });
    }
    const confirm = body.confirm === true;
    const folderIdRaw = body.folderId;
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    const evidenceKind =
      typeof body.evidenceKind === 'string' && body.evidenceKind.trim() ? body.evidenceKind.trim() : null;
    const ctdSection =
      typeof body.ctdSection === 'string' && body.ctdSection.trim() ? body.ctdSection.trim() : null;

    try {
      // Program ownership — same guard as the read.
      const projRes = await pool.query(
        `SELECT id FROM regulatory_programs
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, orgId],
      );
      if (projRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND' });
      }
      const view = await resolveVaultView(id, orgId);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const docRes = await client.query(
          `SELECT id, document_title, folder_id, evidence_kind, ctd_section,
                  placement_status, placement_rationale
             FROM vault.documents
            WHERE id = $1 AND program_id = $2 AND deleted_at IS NULL
              AND EXISTS (
                SELECT 1 FROM regulatory_programs rp
                 WHERE rp.id = vault.documents.program_id
                   AND rp.organization_id = $3
                   AND rp.deleted_at IS NULL
              )
            FOR UPDATE`,
          [documentId, id, orgId],
        );
        if (docRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, error: 'DOCUMENT_NOT_FOUND' });
        }
        const before = docRes.rows[0] as {
          id: string; document_title: string | null; folder_id: string | null;
          evidence_kind: string | null; ctd_section: string | null;
          placement_status: string | null; placement_rationale: string | null;
        };

        // Resolve the target placement.
        let targetFolder: string | null;
        if (confirm && folderIdRaw === undefined) {
          if (!before.folder_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: 'NOTHING_TO_CONFIRM',
              message: 'This document has no suggested folder — choose one to file it.',
            });
          }
          targetFolder = before.folder_id;
        } else if (folderIdRaw === null) {
          targetFolder = null; // explicit unfile
        } else if (typeof folderIdRaw === 'string' && folderIdRaw.trim()) {
          targetFolder = folderIdRaw.trim();
          if (!isFolderInView(view, targetFolder)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: 'INVALID_FOLDER',
              message: `Folder '${targetFolder}' does not exist in this program's ${view} vault taxonomy.`,
            });
          }
        } else {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: 'NO_TARGET',
            message: 'Pass confirm:true, a folderId, or folderId:null to unfile.',
          });
        }

        const newStatus = targetFolder ? 'confirmed' : 'unfiled';
        const rationale =
          note ??
          (targetFolder
            ? confirm
              ? `Suggested filing confirmed${before.placement_rationale ? ` (${before.placement_rationale})` : ''}.`
              : 'Filed by user.'
            : 'Unfiled by user — awaiting a filing decision.');

        const upd = await client.query(
          `UPDATE vault.documents SET
             folder_id = $1,
             evidence_kind = COALESCE($2, evidence_kind),
             ctd_section = $3,
             placement_status = $4,
             placement_confidence = NULL,
             placement_rationale = $5,
             placed_by = $6,
             placed_at = NOW(),
             updated_at = NOW()
           WHERE id = $7 AND program_id = $8
             AND EXISTS (
               SELECT 1 FROM regulatory_programs rp
                WHERE rp.id = vault.documents.program_id
                  AND rp.organization_id = $9
                  AND rp.deleted_at IS NULL
             )
           RETURNING folder_id, evidence_kind, ctd_section, placement_status,
                     placement_confidence, placement_rationale`,
          [
            targetFolder,
            evidenceKind,
            // An explicit move to a non-CTD folder clears a stale CTD section;
            // confirming keeps what the classifier read.
            ctdSection ?? (confirm ? before.ctd_section : null),
            newStatus,
            rationale,
            userId,
            documentId,
            id,
            orgId,
          ],
        );
        const after = upd.rows[0] as {
          folder_id: string | null; evidence_kind: string | null; ctd_section: string | null;
          placement_status: string; placement_rationale: string | null;
        };

        await writeChainedAuditRow(client, {
          tenantId: orgId,
          userId: userId ?? undefined,
          action: 'vault.document.file',
          resourceType: 'vault_document',
          resourceId: documentId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            programId: id,
            documentTitle: before.document_title,
            view,
            from: {
              folderId: before.folder_id,
              placementStatus: before.placement_status,
              ctdSection: before.ctd_section,
            },
            to: {
              folderId: after.folder_id,
              placementStatus: after.placement_status,
              ctdSection: after.ctd_section,
            },
            rationale,
          },
        });
        await client.query('COMMIT');

        return res.json({
          success: true,
          filing: {
            folderId: after.folder_id,
            folderLabel: folderLabel(view, after.folder_id),
            evidenceKind: after.evidence_kind,
            ctdSection: after.ctd_section,
            placementStatus: after.placement_status,
            confidence: null,
            rationale: after.placement_rationale,
            needsReview: after.placement_status === 'unfiled',
          },
        });
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '42P01' || (err as { code?: string })?.code === '42703') {
        return res.status(409).json({
          success: false,
          error: 'STORE_PENDING',
          message: 'The vault uploads store is not provisioned in this environment.',
        });
      }
      logger.error('project vault file error', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'Failed to record the filing decision' });
    }
  });

  return router;
}
