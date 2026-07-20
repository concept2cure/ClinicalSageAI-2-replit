/**
 * /api/c2c/project-vault/:id — Vault (DMS) surface read-model.
 *
 * Serves the display shape that client/src/concept2cure/v2/surfaces/Vault.tsx
 * renders (its `Spine` of VaultFolder / VaultDoc), populated from REAL,
 * org-scoped data:
 *
 *   regulatory_programs   → project name + product modality (→ vault view)
 *   c2c_documents         → one top-level folder per active document build
 *   c2c_rule_packs        → the required-section spec tree for each build
 *   c2c_document_sections → LIVE section status / version / owner / timestamp
 *   users                 → real owner attribution (section & document owner_id)
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

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { productTypesToSegments } from '../../services/report-os/segment.js';
import {
  filingTypesForView,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy.js';

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
}

interface VaultFolder {
  id: string;
  code: string;
  label: string;
  children: Array<VaultFolder | VaultDoc>;
}

interface VaultDisplayShape {
  program: string;
  spine: string;
  standard: string;
  documentCount: number;
  tree: VaultFolder[];
  /** Honest signal: the c2c document store is not provisioned in this env. */
  pendingStore?: boolean;
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
    pct: hasContent ? 100 : 0,
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

      // 2) Derive the vault view: project product_type → segment; else the union
      //    across the org's programs; else the cross-sponsor service view.
      let view: VaultViewId;
      const projSegs = project.product_type ? productTypesToSegments([project.product_type]) : [];
      if (projSegs.length > 0) {
        view = projSegs[0];
      } else {
        const orgTypesRes = await pool.query(
          `SELECT DISTINCT product_type FROM regulatory_programs
            WHERE organization_id = $1 AND product_type IS NOT NULL`,
          [orgId],
        );
        const orgSegs = productTypesToSegments(
          orgTypesRes.rows.map((r: { product_type: string }) => r.product_type),
        );
        view = orgSegs[0] ?? 'service';
      }

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
                  (ds.content -> 'paragraphs') IS NOT NULL AS has_content,
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

      const data: VaultDisplayShape = {
        program: project.name || 'Vault',
        spine: vaultViewLabel(view),
        standard: view,
        documentCount: countDocs(tree),
        tree,
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

  return router;
}
