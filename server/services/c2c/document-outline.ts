/**
 * A governed document's outline: its rule pack's sections with each one's live
 * status (GET /api/c2c/documents/:id/outline).
 *
 * A market's document (FILING_SPINE F22, `filing_scope = 'market'`) holds only
 * its own part of the pack, Module 1 and 3.2.R (shared/regulatory/filing-scope),
 * so its outline is that part, never the whole pack: the common modules are the
 * home filing's. Beside it are its gaps: the market pack's mandatory sections
 * outside its part that the project's home filing does not hold. A gap is
 * shown, never inserted (FILING_SPINE §3).
 *
 * The scope is read through to_jsonb, so a database the 20261015e column has
 * not reached reads every document as the home filing, as it was before F22.
 *
 * @module server/services/c2c/document-outline
 */
import { sectionHasContentSql } from './section-content.js';
import { marketOutlineView, type PackSectionLike } from '../../../shared/regulatory/filing-scope.js';
import { normalizeRulePackProvenance, rulePackProvenanceSelectSql } from '../../../shared/rule-pack-provenance.js';

interface Queryable { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }
type Spec = PackSectionLike & { key: string };

export interface GovernedDocumentOutline {
  document: {
    id: string; title: string; doc_type: string; agency: string; status: string; readiness: unknown;
    filing_scope: 'home' | 'market';
    provenance: ReturnType<typeof normalizeRulePackProvenance>;
  };
  outline: Array<Record<string, unknown>>;
  /** A market document's missing common sections; always [] for the home filing. */
  gaps: Array<{ key: string; label: string }>;
}

/** The keys the project's home filing holds (every home document of the project). */
async function homeSectionKeys(db: Queryable, orgId: number, projectId: string | null): Promise<Set<string>> {
  if (!projectId) return new Set();
  const r = await db.query(
    `SELECT DISTINCT s.section_key
       FROM c2c_document_sections s
       JOIN c2c_documents d ON d.id = s.document_id
      WHERE d.org_id = $1 AND d.project_id = $2
        AND COALESCE(to_jsonb(d)->>'filing_scope', 'home') = 'home'`,
    [orgId, projectId],
  );
  return new Set(r.rows.map((row) => String(row.section_key)));
}

function withLive(spec: Spec, live: Map<string, any>) {
  const row = live.get(spec.key);
  return {
    key: spec.key, parent_key: spec.parent_key, label: spec.label, mandatory: spec.mandatory, path_order: spec.path_order,
    ...(row ? {
      status: row.status, draft_source: row.draft_source, drafted_at: row.drafted_at,
      accepted_at: row.accepted_at, version: row.version, has_content: row.has_content,
    } : { status: 'todo', draft_source: null, drafted_at: null, accepted_at: null, version: 1, has_content: false }),
  };
}

/** null when the document is not this organization's (or does not exist). */
export async function readDocumentOutline(db: Queryable, orgId: number, documentId: string): Promise<GovernedDocumentOutline | null> {
  const docRes = await db.query(
    `SELECT d.id, d.doc_type, d.agency, d.rule_pack_version, d.title, d.project_id,
            d.status, d.readiness, rp.required_sections,
            COALESCE(to_jsonb(d)->>'filing_scope', 'home') AS filing_scope,
            ${rulePackProvenanceSelectSql('rp')}
       FROM c2c_documents d
       JOIN c2c_rule_packs rp
         ON rp.doc_type = d.doc_type AND rp.agency = d.agency AND rp.version = d.rule_pack_version
      WHERE d.id = $1 AND d.org_id = $2
      LIMIT 1`,
    [documentId, orgId],
  );
  const doc = docRes.rows[0];
  if (!doc) return null;

  const secRes = await db.query(
    `SELECT section_key, status, owner_id, draft_source, drafted_at, accepted_at, version,
            ${sectionHasContentSql('content')} AS has_content
       FROM c2c_document_sections
      WHERE document_id = $1`,
    [documentId],
  );
  const live = new Map<string, any>(secRes.rows.map((row) => [row.section_key, row]));

  const market = doc.filing_scope === 'market';
  const specs = (Array.isArray(doc.required_sections) ? doc.required_sections : []) as Spec[];
  const view = market
    ? marketOutlineView<Spec>(specs, await homeSectionKeys(db, orgId, doc.project_id ?? null))
    : { rows: specs, gaps: [] };

  return {
    document: {
      id: doc.id, title: doc.title, doc_type: doc.doc_type, agency: doc.agency, status: doc.status,
      readiness: doc.readiness, filing_scope: market ? 'market' : 'home',
      // What the tree below was built FROM. The editor navigates by this
      // outline, so this is the one place a filer is guaranteed to be
      // looking when the answer matters.
      provenance: normalizeRulePackProvenance(doc),
    },
    outline: view.rows.map((spec) => withLive(spec, live)),
    gaps: view.gaps,
  };
}
