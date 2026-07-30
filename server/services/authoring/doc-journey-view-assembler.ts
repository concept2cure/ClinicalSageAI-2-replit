/**
 * Assemble the v2 DocJourney surface's render contract from the REAL, org-scoped
 * authoring document loop — authoring_documents (+ authoring_sections, doc_revisions,
 * authoring_comments, frozen_documents) — the exact tables server/routes/authoring.router.ts
 * writes (doc create, section edits + revisions, review comments, freeze / e-sign).
 *
 * This is the GA read path: no seed-only blob (c2c_doc_journeys) and no fabricated
 * stage timeline. A document's "journey" is reconstructed from what the store ACTUALLY
 * recorded about it — its status transitions and their timestamps
 * (created_at → submitted_at → approved_at → frozen_at) enriched with the real
 * revision, comment and freeze history. Every stage emitted is backed by a recorded
 * event, and every `when` / `who` / `ver` is a real column value; a milestone the store
 * never recorded produces NO stage (never a fabricated timestamp).
 *
 * ── Shape the surface consumes ────────────────────────────────────────────────────────
 * The DocJourney surface renders ONE document's journey as a flat ordered stage list:
 * the DjStage rail fields ({ id, label, ic, when, who, ver, done, active, sub, kind })
 * plus, per stage, the content snapshot `snap` (a DjSnap: brief / doc / assemble). So
 * this assembler returns the stage list for the org's CURRENT document — the
 * most-recently-updated authoring_documents row for the tenant — or [] when the org has
 * authored nothing yet (the surface then renders its honest empty state).
 *
 * ── Scope & soft-delete ───────────────────────────────────────────────────────────────
 * The authoring store scopes by tenant_id (== the org id in this app), and it HARD-deletes
 * (server/routes/authoring.router.ts: `DELETE FROM authoring_documents`) — there is no
 * deleted_at column on any authoring table. So there is nothing to soft-delete-filter;
 * tenant isolation is the whole of the scoping. Every query below is filtered by tenant_id
 * and by this document's id/section ids, so cross-tenant rows can never enter the journey.
 *
 * ── Actor resolution ──────────────────────────────────────────────────────────────────
 * created_by on documents/revisions holds String(user.id); it is LEFT JOINed to users
 * (u.id::text = created_by, the router's own join idiom) to resolve a display name, and
 * falls back to the raw id when no user row matches (honest, never blank-fabricated).
 * Comments carry the router-written user_name/user_email; freezes carry frozen_by (email).
 */
import { pool } from '../../db';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Real timestamp → the surface's compact "Jun 14" label; '' when absent/unparseable. */
function fmtWhen(v: unknown): string {
  if (v == null) return '';
  const d = new Date(str(v));
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A person's display name from the joined user, else the raw actor reference. */
function actorName(name: unknown, email: unknown, raw: unknown): string {
  const n = str(name).trim();
  if (n) return n;
  const e = str(email).trim();
  if (e) return e;
  return str(raw).trim();
}

/** Distinct, order-preserving list of non-empty names. */
function distinct(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** A locked/terminal document status shows the head stage as done, not in-progress. */
const TERMINAL = new Set(['approved', 'frozen', 'locked', 'signed']);

interface DocRow {
  id: string;
  title: string | null;
  module: string | null;
  product_code: string | null;
  status: string | null;
  version: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  frozen_at: string | null;
  creator_name: string | null;
  creator_email: string | null;
}
interface SectionRow { id: string; code: string | null; title: string | null; content: string | null; order_index: number | null; updated_at: string | null }
interface RevisionRow { id: string; section_id: string; content: string | null; created_by: string | null; created_at: string | null; author_name: string | null; author_email: string | null }
interface CommentRow { id: string; section_id: string | null; doc_id: string | null; body: string | null; status: string | null; created_by: string | null; user_name: string | null; user_email: string | null; created_at: string | null; resolved_at: string | null; resolved_by: string | null }
interface FrozenRow { version: string | null; content_hash: string | null; frozen_by: string | null; frozen_reason: string | null; frozen_at: string | null }

/** One assembled stage row = DjStage rail fields + its DjSnap content snapshot. */
type StageRow = Record<string, unknown> & { id: string; done: boolean; active: boolean };

/**
 * Assemble the current document's journey for an org, as the flat stage list the
 * DocJourney surface renders. Returns [] when the org has no authoring document.
 */
export async function assembleOrgDocJourney(orgId: number): Promise<Record<string, unknown>[]> {
  // The org's current document = the most-recently-touched authoring_documents row.
  const docRes = await pool.query(
    `SELECT d.id, d.title, d.module, d.product_code, d.status, d.version,
            d.created_by, d.created_at, d.updated_at, d.submitted_at, d.approved_at, d.frozen_at,
            u.name AS creator_name, u.email AS creator_email
       FROM authoring_documents d
       LEFT JOIN users u ON u.id::text = d.created_by
      WHERE d.tenant_id = $1
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST, d.id DESC
      LIMIT 1`,
    [orgId],
  );
  const doc = docRes.rows[0] as DocRow | undefined;
  if (!doc) return [];
  const docId = str(doc.id);

  // Sections first (revisions are keyed by section_id, so we need their ids).
  const secRes = await pool.query(
    `SELECT id, code, title, content, order_index, updated_at
       FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index NULLS LAST, id`,
    [docId, orgId],
  );
  const sections = secRes.rows as SectionRow[];
  const sectionIds = sections.map((s) => str(s.id));

  // Revisions (via this doc's sections) and comments (by doc_id, or by section for the
  // rows the router wrote before doc_id was populated) and freeze snapshots — one bulk,
  // tenant-scoped query each.
  const [revRes, cmtRes, frzRes] = await Promise.all([
    sectionIds.length
      ? pool.query(
          `SELECT r.id, r.section_id, r.content, r.created_by, r.created_at,
                  u.name AS author_name, u.email AS author_email
             FROM doc_revisions r
             LEFT JOIN users u ON u.id::text = r.created_by
            WHERE r.section_id = ANY($1) AND r.tenant_id = $2
            ORDER BY r.created_at DESC NULLS LAST, r.id DESC`,
          [sectionIds, orgId],
        )
      : Promise.resolve({ rows: [] as RevisionRow[] }),
    pool.query(
      `SELECT id, section_id, doc_id, body, status, created_by, user_name, user_email,
              created_at, resolved_at, resolved_by
         FROM authoring_comments
        WHERE (doc_id = $1 OR section_id = ANY($2)) AND tenant_id = $3
        ORDER BY created_at DESC NULLS LAST, id DESC`,
      [docId, sectionIds, orgId],
    ),
    pool.query(
      `SELECT version, content_hash, frozen_by, frozen_reason, frozen_at
         FROM frozen_documents
        WHERE document_id = $1 AND tenant_id = $2
        ORDER BY frozen_at DESC NULLS LAST`,
      [docId, orgId],
    ),
  ]);
  const revisions = revRes.rows as RevisionRow[];
  const comments = cmtRes.rows as CommentRow[];
  const frozen = (frzRes.rows as FrozenRow[])[0];

  const sectionById = new Map<string, SectionRow>(sections.map((s) => [str(s.id), s]));
  const titleForSection = (sectionId: string): string => {
    const s = sectionById.get(sectionId);
    return str(s?.title) || str(s?.code) || 'Section';
  };
  const contentForSection = (sectionId: string): string => str(sectionById.get(sectionId)?.content);

  const version = str(doc.version).trim() || '—';
  const status = str(doc.status).toLowerCase();
  const isTerminal = TERMINAL.has(status);

  const stages: StageRow[] = [];

  // ── 1. Created — always present; the document exists. ────────────────────────────────
  const creator = actorName(doc.creator_name, doc.creator_email, doc.created_by);
  stages.push({
    id: 'created',
    label: 'Created',
    ic: 'sparkles',
    when: fmtWhen(doc.created_at),
    who: creator || '—',
    ver: version,
    done: true,
    active: false,
    sub: str(doc.module).trim() ? `Draft started · ${str(doc.module)}` : 'Draft started',
    kind: 'brief',
    snap: {
      mode: 'brief',
      title: 'Document',
      lines: [
        ['Document', str(doc.title) || 'Untitled document'],
        ['Module', str(doc.module).trim() || '—'],
        ['Product', str(doc.product_code).trim() || '—'],
        ['Status', str(doc.status).trim() || 'draft'],
        ['Created by', creator || '—'],
        ['Created', fmtWhen(doc.created_at) || '—'],
      ] as [string, string][],
    },
  });

  // ── 2. Authoring — present when the document has real revisions or section content. ───
  const authored = sections.filter((s) => str(s.content).trim() !== '');
  if (revisions.length > 0 || authored.length > 0) {
    const latestRev = revisions[0];
    const revAuthors = distinct(revisions.map((r) => actorName(r.author_name, r.author_email, r.created_by)));
    // The section shown = the most-recently-revised one, else the first authored section.
    const shownSectionId = latestRev ? str(latestRev.section_id) : str(authored[0]?.id);
    const heading = titleForSection(shownSectionId);
    const body = str(latestRev?.content) || contentForSection(shownSectionId);
    const when = fmtWhen(latestRev?.created_at ?? sections.reduce<string | null>((a, s) => (s.updated_at ?? a), null));
    stages.push({
      id: 'authoring',
      label: 'Authoring',
      ic: 'penLine',
      when,
      who: revAuthors.join(' · ') || creator || '—',
      ver: version,
      done: true,
      active: false,
      sub: `${revisions.length} revision${revisions.length === 1 ? '' : 's'} · ${sections.length} section${sections.length === 1 ? '' : 's'}`,
      kind: 'draft',
      snap: {
        mode: 'doc',
        wm: isTerminal ? undefined : `DRAFT ${version}`,
        heading,
        body: body ? [body] : [],
        prov: latestRev
          ? `Latest revision by ${actorName(latestRev.author_name, latestRev.author_email, latestRev.created_by) || '—'}${fmtWhen(latestRev.created_at) ? ` · ${fmtWhen(latestRev.created_at)}` : ''}`
          : 'Section content authored in Document Authoring.',
      },
    });
  }

  // ── 3. Internal review — present when the document has comments. ──────────────────────
  if (comments.length > 0) {
    const resolvedCount = comments.filter((c) => str(c.status).toLowerCase() === 'resolved').length;
    const rep = comments.find((c) => str(c.status).toLowerCase() === 'open') ?? comments[0];
    const repSectionId = str(rep.section_id);
    const heading = repSectionId ? titleForSection(repSectionId) : str(doc.title) || 'Document';
    const body = repSectionId ? contentForSection(repSectionId) : '';
    const commenters = distinct(comments.map((c) => actorName(c.user_name, c.user_email, c.created_by)));
    stages.push({
      id: 'review',
      label: 'Internal review',
      ic: 'messageSquare',
      when: fmtWhen(rep.created_at),
      who: commenters.join(' · ') || '—',
      ver: version,
      done: true,
      active: false,
      sub: `${comments.length} comment${comments.length === 1 ? '' : 's'} · ${resolvedCount} resolved`,
      kind: 'review',
      snap: {
        mode: 'doc',
        heading,
        body: body ? [body] : [],
        comment: {
          by: actorName(rep.user_name, rep.user_email, rep.created_by) || 'Reviewer',
          body: str(rep.body),
          status: str(rep.status).toLowerCase() || 'open',
        },
      },
    });
  }

  // ── 4. Submitted for review — present when submitted_at was recorded. ─────────────────
  if (doc.submitted_at) {
    stages.push({
      id: 'submitted',
      label: 'Submitted for review',
      ic: 'send',
      when: fmtWhen(doc.submitted_at),
      who: creator || '—',
      ver: version,
      done: true,
      active: false,
      sub: 'Entered the review workflow',
      kind: 'submit',
      snap: {
        mode: 'assemble',
        heading: 'Submitted for review',
        lines: [
          ['Document', str(doc.title) || 'Untitled document'],
          ['Module', str(doc.module).trim() || '—'],
          ['Submitted', fmtWhen(doc.submitted_at) || '—'],
          ['Status', str(doc.status).trim() || '—'],
        ] as [string, string][],
        note: 'The document entered its review-and-approval workflow.',
      },
    });
  }

  // ── 5. Approved · e-signed — present when approved_at was recorded. ───────────────────
  if (doc.approved_at) {
    // The approver is recorded on the auto-freeze the approval writes (frozen_by), not on
    // authoring_documents; honest-null when no freeze row carries it.
    const approver = str(frozen?.frozen_by).trim();
    const shownSectionId = sectionIds[0] ?? '';
    stages.push({
      id: 'approved',
      label: 'Approved · e-signed',
      ic: 'checkCircle',
      when: fmtWhen(doc.approved_at),
      who: approver || '—',
      ver: str(frozen?.version).trim() || version,
      done: true,
      active: false,
      sub: '21 CFR §11 e-signature',
      kind: 'approve',
      snap: {
        mode: 'doc',
        seal: `APPROVED ${str(frozen?.version).trim() || version}`,
        heading: shownSectionId ? titleForSection(shownSectionId) : str(doc.title) || 'Document',
        body: shownSectionId && contentForSection(shownSectionId) ? [contentForSection(shownSectionId)] : [],
        prov: approver
          ? `Approved by ${approver}${fmtWhen(doc.approved_at) ? ` · ${fmtWhen(doc.approved_at)}` : ''} · 21 CFR §11`
          : `Approved${fmtWhen(doc.approved_at) ? ` · ${fmtWhen(doc.approved_at)}` : ''} · 21 CFR §11`,
      },
    });
  }

  // ── 6. Frozen · immutable — present when a freeze snapshot exists. ────────────────────
  if (frozen && frozen.frozen_at) {
    stages.push({
      id: 'frozen',
      label: 'Frozen · immutable',
      ic: 'shieldCheck',
      when: fmtWhen(frozen.frozen_at),
      who: str(frozen.frozen_by).trim() || '—',
      ver: str(frozen.version).trim() || version,
      done: true,
      active: false,
      sub: str(frozen.content_hash).trim() ? `SHA-256 ${str(frozen.content_hash).slice(0, 12)}…` : 'Immutable snapshot',
      kind: 'freeze',
      snap: {
        mode: 'assemble',
        heading: 'Immutable freeze',
        lines: [
          ['Version', str(frozen.version).trim() || version],
          ['Frozen by', str(frozen.frozen_by).trim() || '—'],
          ['Reason', str(frozen.frozen_reason).trim() || '—'],
          ['Content hash', str(frozen.content_hash).trim() || '—'],
          ['Frozen', fmtWhen(frozen.frozen_at) || '—'],
        ] as [string, string][],
        note: 'A tamper-evident snapshot of the approved content (21 CFR Part 11).',
      },
    });
  }

  // The last recorded stage is the journey head. If the document is still in progress
  // (non-terminal status) the head is the ACTIVE (pulsing) stage rather than a completed
  // one; a terminal document (approved/frozen) has every stage done.
  if (stages.length > 0 && !isTerminal) {
    const head = stages[stages.length - 1];
    head.done = false;
    head.active = true;
  }

  return stages;
}
