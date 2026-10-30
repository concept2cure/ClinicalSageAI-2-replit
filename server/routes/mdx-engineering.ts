/**
 * Engineering aggregator — backs the `engineering` rail surface.
 *
 *   GET /api/mdx/engineering/:programId
 *
 * ## Why this route was rewritten
 *
 * It previously returned a summary shape — `{ dhfCompletion, openEcrs,
 * bomLines, riskLastUpdated, deliverables }` — while the client hook
 * read `{ dhf, trace, risks, ecrs, issues }`. Every field resolved to
 * `undefined`, the hook mapped that to `null`, and the surface silently
 * substituted design-kit fixtures. The endpoint worked, the tables had
 * real rows, and the user still saw example risk records for someone
 * else's glucose sensor. The contract now matches the consumer.
 *
 * ## Scope honesty
 *
 * Each panel's store, and how it is read for the project:
 *
 *   risks      risk_items                 org + program   → program-scoped
 *   trace      c2c_design_controls        org + program   → program-scoped
 *   issues     qms_nonconforming_products org + program   → program-scoped
 *   documents  concept2cure_artifacts     org + project bridge, plus
 *              software_lifecycle_items   org + program   → program-scoped
 *   dhf        c2c_document_sections      the project's c2c_documents
 *                                         (org_id + project_id) → program-scoped
 *   ecrs       qms_change_controls        org + program   → program-scoped
 *
 * Rather than quietly presenting org-wide rows as though they belonged
 * to the selected program, every panel reports its own `scope` in
 * `meta.scopes`, and the surface does not draw a panel reported
 * organization-scoped (EngineeringSurface.tsx keyedToProject).
 *
 * Narrowed on 2026-10-29 (D2):
 *   - the trace (fold F1 slice A): c2c_design_controls.program_id from
 *     migrations/20261029c_design_controls_and_risk_items_program_keys.sql;
 *   - non-conformances: qms_nonconforming_products.program_id from
 *     migrations/20261029d_nonconforming_products_program_key.sql, stamped by
 *     POST /api/mdx/qms/nonconforming and AnA log_nonconforming_product;
 *   - documents: no column. An artifact names its legacy project
 *     (concept2cure_artifacts.project_id → projects.id), and the project is
 *     anchored to the program by projects.regulatory_program_id, the bridge
 *     the device Vault reads (server/routes/mdx-vault.ts).
 *   Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/.
 *
 * Narrowed under founder decision P-60 (2026-10-29): a device or diagnostics
 * company runs several products, and their design history and design changes
 * are per product (21 CFR 820.30(j), ISO 13485 §7.3.10). Evidence:
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/.
 *   - dhf: the project's own document sections (c2c_document_sections under
 *     the c2c_documents whose project_id is the program). It no longer reads
 *     cerv2_510k_sections, which holds ONE device kit per organization (unique
 *     on organization and section key, 20260506), so it is not shown under a
 *     project. The panel is the project's authored sections and their status,
 *     not an inspected design history file index.
 *   - ecrs: the project's change controls from the one change register,
 *     qms_change_controls (server/services/qms/changeControl.service.ts), by
 *     the program key migrations/20261029l_qms_change_controls_program_key.sql
 *     adds, which POST /api/mdx/qms/changes and AnA qms_change_create stamp.
 *     It no longer reads change_requests, which nothing writes.
 *
 * Every panel degrades independently: a missing table (42P01, pre-
 * migration tenants) yields an empty array for that panel, never a 500
 * that blanks the whole surface.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import type { QueryResultRow } from 'pg';
import { requestPgClient, MissingRequestDbContextError, type RequestSqlClient } from '../db/requestDb';
import { governedActorId } from '../middleware/orgMembership';
import { designControlTraceState } from '../../shared/regulatory/design-controls-trace';
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, ProgramReadAccessError } from '../services/c2c/current-program-access';

const router = Router();
const log = createScopedLogger('mdx-engineering');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Panel tenancy, reported to the client so it can label the section. */
type Scope = 'program' | 'organization';

/**
 * Run a panel query, returning [] when the table has not been migrated
 * into this deployment yet. One missing optional table must not take
 * down the four panels that do have data.
 */
async function readPanel<T extends QueryResultRow>(
  q: RequestSqlClient,
  name: string,
  sql: string,
  params: unknown[],
  unavailable: string[],
): Promise<T[]> {
  try {
    const { rows } = await q.query(sql, params);
    return rows as T[];
  } catch (err) {
    /* 42P01 = undefined_table: the table has not been migrated in this
       tenant yet. That is a deployment state, not a fault, and an empty
       panel is a true statement about it.
       Anything ELSE is a fault — a permission denial, an RLS fail-closed, a
       broken query — and returning [] for those published the fault as a
       FINDING: "this tenant has recorded no hazards", "dhfCompletion 0%",
       with nothing but a server-side log line to say otherwise. The whole
       point of the MDX DataState primitive
       (client/src/concept2cure/mdx/lib/dataState.ts) is that an error and an
       empty result are not the same render, and this route was the one place
       that collapsed them again on its way out.
       The panel still degrades independently — the other six render — but it
       now says which one could not be read, in `meta.unavailable`. */
    const code = (err as { code?: string })?.code;
    if (code !== '42P01') {
      unavailable.push(name);
      log.warn(`engineering panel ${name} failed`, {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  }
}

/* ── ISO 14971 scale mapping ──────────────────────────────────────────
   risk_items stores severity/probability as 1–5 integers. The surface's
   heatmap is keyed `S{n}P{n}`. Values outside 1–5 are clamped rather
   than dropped: a malformed row must still appear in the risk file,
   because an invisible hazard is more dangerous than a mis-binned one. */
function band(prefix: 'S' | 'P', value: number | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const n = Math.min(5, Math.max(1, Math.round(value)));
  return `${prefix}${n}`;
}

/** risk_items.status → the surface's three-state vocabulary. */
function riskState(status: string | null): 'verified' | 'in-progress' | 'open' {
  const s = (status ?? '').toLowerCase();
  if (s === 'verified' || s === 'closed' || s === 'accepted') return 'verified';
  if (s === 'mitigated' || s === 'in_progress' || s === 'in-progress' || s === 'controlled') {
    return 'in-progress';
  }
  return 'open';
}

/**
 * qms_change_controls.status (CHANGE_STATES, changeControl.service.ts) → the
 * surface's ECR vocabulary. 'open' (proposed) and 'review' (under assessment)
 * are the changes still awaiting a decision, which the screen counts as open
 * change requests. An approved change being implemented or verified is decided
 * and under way ('approved'); closed, rejected and cancelled are over. An
 * unknown state reads as open, so it is looked at rather than hidden.
 */
function ecrState(status: string | null): 'open' | 'review' | 'approved' | 'closed' {
  const s = (status ?? '').toLowerCase();
  if (s === 'closed' || s === 'rejected' || s === 'cancelled') return 'closed';
  if (s === 'approved' || s === 'in_implementation' || s === 'verification') return 'approved';
  if (s === 'under_assessment') return 'review';
  return 'open';
}

/** Relative age label ("4d ago"), matching the surface's existing copy. */
function ago(value: Date | string | null): string {
  if (!value) return '—';
  const then = value instanceof Date ? value : new Date(value);
  const ms = Date.now() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 0 ? 'today' : `${days}d ago`;
}

router.get('/engineering/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) {
    return clientError(res, 422, 'The project id must be a UUID.');
  }

  try {
    // The aggregate is the first read on Engineering. Its prose and counts
    // require the same current project-sharing admission as the risk register.
    const q = requestPgClient(req);
    const identity = { organizationId: orgId, userId: governedActorId(req) ?? undefined, programId };
    const scope = await getCurrentAccessibleProgramScope(q, identity);
    const panel = <T extends QueryResultRow>(name: string, sql: string, params: unknown[], unavailable: string[]) =>
      readPanel<T>(q, name, sql, params, unavailable);

    /* ── Risks — ISO 14971, program-scoped ───────────────────────────
       Controls are aggregated per risk so the surface can show the
       control text without an N+1 round trip. */
    /* Per-REQUEST, never module-level: two tenants' requests are in flight
       concurrently and must not see each other's failures. */
    const unavailable: string[] = [];

    const riskRows = await panel<{
      id: number;
      ref_code: string | null;
      hazard: string;
      hazardous_situation: string | null;
      harm: string;
      severity: number;
      probability: number;
      residual_severity: number | null;
      residual_probability: number | null;
      control_strategy: string | null;
      status: string | null;
      owner: string | null;
      controls: string[] | null;
      verification: string[] | null;
    }>(
      'risks',
      `SELECT r.id, r.ref_code, r.hazard, r.hazardous_situation, r.harm,
              r.severity, r.probability,
              r.residual_severity, r.residual_probability,
              r.control_strategy, r.status,
              COALESCE(u.name, u.email) AS owner,
              ARRAY_REMOVE(ARRAY_AGG(c.description ORDER BY c.id), NULL)            AS controls,
              ARRAY_REMOVE(ARRAY_AGG(c.verification_evidence ORDER BY c.id), NULL)  AS verification
         FROM risk_items r
         LEFT JOIN risk_controls c ON c.risk_item_id = r.id AND c.organization_id = r.organization_id
         -- The owner's name is shown only when the assignee belongs to the risk's
         -- organization: public.users has no RLS, and assigned_to was accepted
         -- unchecked before mdx-risk-management.ts began refusing non-members.
         LEFT JOIN users u         ON u.id = r.assigned_to
                                  AND EXISTS (SELECT 1 FROM organization_users ou
                                               WHERE ou.user_id = r.assigned_to
                                                 AND ou.organization_id = r.organization_id)
        WHERE r.organization_id = $1 AND r.program_id = $2 AND r.deleted_at IS NULL
        GROUP BY r.id, u.id
        ORDER BY r.severity DESC, r.probability DESC, r.id`,
      [orgId, programId],
      unavailable,
    );

    const risks = riskRows.map((r) => {
      /* Residual falls back to initial when no control has moved the
         needle yet — that is the ISO 14971 position before mitigation,
         not missing data. */
      const rs = band('S', r.residual_severity ?? r.severity);
      const rp = band('P', r.residual_probability ?? r.probability);
      return {
        id: r.ref_code || `R-${r.id}`,
        hazard: r.hazard,
        situation: r.hazardous_situation ?? '',
        harm: r.harm,
        severity: band('S', r.severity),
        probBefore: band('P', r.probability),
        controlClass: r.control_strategy ?? 'design',
        control: (r.controls ?? []).join(' · ') || '—',
        verif: (r.verification ?? []).filter(Boolean).join(' · ') || '—',
        probAfter: rp,
        residual: rs && rp ? `${rs}${rp}` : null,
        state: riskState(r.status),
        owner: r.owner ?? '—',
      };
    });

    /* ── Design-controls traceability — program-scoped ────────────────
       The project's own design inputs only, after the admitProject check
       above (D2, fold F1 slice A, 2026-10-29). An input recorded with no
       project is the organization's unscoped input, and another project's is
       that project's: neither is read here. On a database without
       c2c_design_controls.program_id (20261029c not applied) the read fails
       and the panel is named in meta.unavailable, never shown as empty. */
    const traceRows = await panel<{
      id: string;
      cat: string | null;
      req: string;
      risk_ref: string | null;
      outputs: unknown;
      ver: string | null;
      ver_ref: string | null;
      val: string | null;
      val_ref: string | null;
    }>(
      'trace',
      `SELECT id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref
         FROM c2c_design_controls
        WHERE organization_id = $1 AND program_id = $2
        ORDER BY id`,
      [orgId, programId],
      unavailable,
    );

    const trace = traceRows.map((t) => {
      /* `outputs` is JSONB holding design-output OBJECTS. Array.prototype.join
         stringifies each to '[object Object]', which is what the OUTPUT column
         of the traceability matrix rendered for every traced input. */
      const outputs = Array.isArray(t.outputs) ? (t.outputs as unknown[]) : [];
      const outputLabel =
        outputs
          .map((o) =>
            o && typeof o === 'object'
              ? [(o as { id?: unknown }).id, (o as { desc?: unknown }).desc]
                  .filter((v) => typeof v === 'string' && v.length)
                  .join(' ')
              : String(o),
          )
          .filter((label) => label.length)
          .join(' · ') || '—';
      return {
        /* The column is TEXT ('dc-<n>'); it was typed `number` and run through
           padStart, yielding 'UN-dc-...' — a second prefix on an id that
           already has one, matching nothing the write path ever issued. */
        id: t.id,
        need: t.req,
        input: t.cat ?? '—',
        output: outputLabel,
        verif: t.ver_ref ?? t.ver ?? '—',
        valid: t.val_ref ?? t.val ?? '—',
        risk: t.risk_ref ?? '—',
        /* Outcome, not presence — shared/regulatory/design-controls-trace.ts.
           `val` holds a status string, so the old `t.ver && t.val` read the
           literal 'pending' as truthy and called an unvalidated design input
           verified, contradicting the v2 DesignControls surface over the very
           same row. 820.30(f) and (g) are separate obligations. */
        state: designControlTraceState({ ver: t.ver, val: t.val, outputCount: outputs.length }),
      };
    });

    /* ── Design history — program-scoped (P-60, 2026-10-29) ──────────────
       The sections of the project's own documents. c2c_documents.project_id
       IS the regulatory_programs key (migrations/20260528_phase9_document_schema.sql),
       held to the document's organization by c2c_documents_project_same_org_fk
       (20260926b, NOT VALID), so no bridge through projects is needed; the
       organization is still repeated, so a legacy row naming this program from
       another organization's document pulls nothing in. An archived document
       is not read. An empty heading (todo, with sections filed under it) is
       left out by the rule the documents' own readiness counts by
       (c2c_document_counted_readiness, 20260528), so it is never called a
       blocker. This is what was authored here as document sections, not an
       inspected design history file index. On a failed read the panel is named
       in meta.unavailable, never shown as empty. */
    const dhfRows = await panel<{
      id: number;
      section_key: string;
      label: string;
      status: string | null;
      mandatory: boolean | null;
      version: number | null;
      updated_at: Date | null;
      document_id: string;
      document_title: string;
    }>(
      'dhf',
      `SELECT s.id, s.section_key, s.label, s.status, s.mandatory, s.version, s.updated_at,
              d.id AS document_id, d.title AS document_title
         FROM c2c_document_sections s
         JOIN c2c_documents d ON d.id = s.document_id
        WHERE d.org_id = $1 AND d.project_id = $2::uuid AND d.status <> 'archived'
          AND (s.status <> 'todo' OR NOT EXISTS (
                SELECT 1 FROM c2c_document_sections held
                 WHERE held.document_id = s.document_id AND held.parent_key = s.section_key))
        ORDER BY d.created_at, d.id, s.path_order, s.id`,
      [orgId, programId],
      unavailable,
    );

    const dhf = dhfRows.map((d) => {
      const raw = (d.status ?? 'todo').toLowerCase();
      /* Ready is approved or locked, the readiness rule's numerator. A
         mandatory section with nothing written blocks its document. */
      const status =
        raw === 'approved' || raw === 'locked'
          ? 'ready'
          : raw === 'review'
            ? 'review'
            : d.mandatory && raw === 'todo'
              ? 'blocked'
              : 'draft';
      return {
        id: String(d.id),
        num: d.section_key,
        label: d.label,
        ver: d.version === null ? '—' : `v${d.version}`,
        owner: '—',
        updated: ago(d.updated_at),
        status,
        meta: `${d.document_title}${d.mandatory ? ' · mandatory' : ''}`,
        documentId: d.document_id,
        document: d.document_title,
      };
    });

    /* ── Design changes — program-scoped (P-60, 2026-10-29) ─────────────
       The project's own change controls from the one change register, by the
       program key 20261029l adds. A change with no project is the
       organization's, which the Quality register lists; another project's is
       that project's. Neither is read here. Every live change of the project
       is read, not the newest 50, so the open count counts all of them. On a
       database without the column the read fails and the panel is named in
       meta.unavailable, never shown as empty. */
    const ecrRows = await panel<{
      id: number;
      change_number: string;
      title: string;
      change_type: string | null;
      classification: string | null;
      risk_level: string | null;
      status: string | null;
      created_at: Date | null;
    }>(
      'ecrs',
      `SELECT id, change_number, title, change_type, classification, risk_level, status, created_at
         FROM qms_change_controls
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`,
      [orgId, programId],
      unavailable,
    );

    const ecrs = ecrRows.map((e) => ({
      id: e.change_number,
      title: e.title,
      impact: (e.change_type ?? 'other').replace(/_/g, ' '),
      opened: ago(e.created_at),
      state: ecrState(e.status),
      owner: '—',
      riskChange: [e.classification, e.risk_level ? `${e.risk_level} risk` : null].filter(Boolean).join(' · ') || '—',
      linked: '—',
    }));

    /* ── Non-conformances — program-scoped ───────────────────────────────
       The project's own records only, after the admitProject check above
       (D2, 2026-10-29). A record with no project is the organization's,
       which the Quality register lists; another project's is that project's.
       Neither is read here. On a database without
       qms_nonconforming_products.program_id (20261029d not applied) the read
       fails and the panel is named in meta.unavailable, never shown as empty. */
    const ncRows = await panel<{
      id: number;
      nc_number: string;
      description: string | null;
      disposition: string | null;
      capa_linked: boolean | null;
      detected_at: Date | null;
      device_name: string | null;
    }>(
      'issues',
      `SELECT id, nc_number, description, disposition, capa_linked, detected_at, device_name
         FROM qms_nonconforming_products
        WHERE organization_id = $1 AND program_id = $2
        ORDER BY detected_at DESC NULLS LAST
        LIMIT 50`,
      [orgId, programId],
      unavailable,
    );

    const issues = ncRows.map((n) => ({
      id: n.nc_number,
      title: n.description || n.device_name || 'Non-conformance',
      /* Undispositioned product is the high-severity case — it is the
         state in which non-conforming stock can still ship. */
      severity: !n.disposition ? 'high' : n.capa_linked ? 'medium' : 'low',
      age: ago(n.detected_at),
      owner: '—',
      state: n.disposition ?? 'open',
      linked: n.capa_linked ? 'CAPA' : '—',
    }));

    /* ── Engineering documents — the surface's primary zone.
          Sourced from the governed artifact table (Module 3/4 design and
          manufacturing content) plus IEC 62304 software deliverables, so
          the document list is the tenant's real work product rather than
          a static catalogue. Program-scoped (D2, 2026-10-29): an artifact
          is this project's when its legacy project is this organization's
          and is anchored to the program, the bridge the device Vault reads
          (server/routes/mdx-vault.ts). EXISTS rather than a JOIN, so the
          bridge can neither duplicate nor drop an artifact, and the
          organization is repeated on `projects` so a legacy anchor naming
          this program from another organization's project pulls nothing in.
          An artifact whose project is unanchored is shown under no project.
          On a database without projects.regulatory_program_id the read
          fails and `documents` is named in meta.unavailable. ───────────── */
    const artifactRows = await panel<{
      id: number;
      title: string;
      ctd_section: string | null;
      type: string | null;
      status: string | null;
      version: number | null;
      updated_at: Date | null;
    }>(
      'documents',
      `SELECT a.id, a.title, a.ctd_section, a.type, a.status, a.version, a.updated_at
         FROM concept2cure_artifacts a
        WHERE a.organization_id = $1
          AND EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = a.project_id
                         AND p.organization_id = a.organization_id
                         AND p.regulatory_program_id = $2::uuid)
          AND (a.ctd_section ILIKE '3%' OR a.ctd_section ILIKE '4%' OR a.type ILIKE '%design%')
          AND a.status != 'archived'
        ORDER BY a.updated_at DESC NULLS LAST
        LIMIT 50`,
      [orgId, programId],
      unavailable,
    );

    const softwareRows = await panel<{
      id: number;
      title: string;
      identifier: string | null;
      item_kind: string | null;
      doc_level: string | null;
      status: string | null;
      updated_at: Date | null;
    }>(
      'software',
      `SELECT id, title, identifier, item_kind, doc_level, status, updated_at
         FROM software_lifecycle_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 50`,
      [orgId, programId],
      unavailable,
    );

    /** Artifact/software status → the DocumentsPanel status vocabulary. */
    const docStatus = (raw: string | null): string => {
      const s = (raw ?? '').toLowerCase();
      if (s === 'approved' || s === 'locked' || s === 'released' || s === 'validated') return 'ready';
      if (s === 'review' || s === 'in_review' || s === 'pending_approval') return 'review';
      return 'draft';
    };

    const documents = [
      ...artifactRows.map((a) => ({
        id: `art-${a.id}`,
        framework: a.ctd_section?.startsWith('3') ? 'iso13485' : 'cfr820',
        dhfRef: a.ctd_section ?? undefined,
        type: a.type ?? 'Artifact',
        title: a.title,
        ver: a.version === null ? '—' : `v${a.version}`,
        status: docStatus(a.status),
        /* Completion is binary at the artifact level — the table stores
           no per-section progress, so reporting a fabricated percentage
           would be worse than reporting the two states we can prove. */
        completion: docStatus(a.status) === 'ready' ? 100 : 0,
        owner: '—',
        lastEdit: ago(a.updated_at),
        sections: 0,
        sectionsComplete: 0,
      })),
      ...softwareRows.map((s) => ({
        id: `swl-${s.id}`,
        framework: 'iec62304',
        type: s.item_kind ?? 'Software deliverable',
        title: s.title || s.identifier || 'Software item',
        ver: s.doc_level ?? '—',
        status: docStatus(s.status),
        completion: docStatus(s.status) === 'ready' ? 100 : 0,
        owner: '—',
        lastEdit: ago(s.updated_at),
        sections: 0,
        sectionsComplete: 0,
      })),
    ];

    /* ── Summary metrics, derived from the same rows the panels show,
          so a card can never disagree with the table beneath it. ────── */
    /* The project's mandatory document sections approved or locked, over its
       mandatory sections; the screen calls it that, not DHF completion. */
    const requiredDhf = dhfRows.filter((d) => d.mandatory);
    const readyDhf = requiredDhf.filter((d) =>
      ['approved', 'locked'].includes((d.status ?? '').toLowerCase()),
    );
    const summary = {
      dhfCompletion: requiredDhf.length
        ? Math.round((readyDhf.length / requiredDhf.length) * 100)
        : 0,
      openEcrs: ecrs.filter((e) => e.state === 'open' || e.state === 'review').length,
      openRisks: risks.filter((r) => r.state !== 'verified').length,
      openIssues: issues.filter((i) => i.state === 'open').length,
      riskLastUpdated: null as string | null,
    };

    const lastRisk = await panel<{ updated_at: Date | null }>(
      'riskLastUpdated',
      `SELECT MAX(updated_at) AS updated_at FROM risk_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
      unavailable,
    );
    summary.riskLastUpdated = lastRisk[0]?.updated_at?.toISOString() ?? null;

    /* Derived fields inherit their inputs' failures.
       `summary` counts open risks, ECRs and issues, and DHF completion, over
       the very arrays above — so a contributor that failed and returned []
       becomes `openRisks: 0`, a confident zero about a regulated record that
       was never read. `documents` is the artifact rows plus the IEC 62304
       software rows, so a failed software panel silently shortens it.
       Naming the query in the log and the payload field it feeds in `meta` is
       deliberate: the operator needs the former, the surface needs the latter. */
    /* riskLastUpdated is deliberately NOT here. It is the one summary field no
       consumer renders — grep the mdx client and it appears only in the hook's
       type — so escalating its failure would withhold three numbers that DID
       read cleanly (DHF completion, open risks, open change requests) to
       protect a value nobody sees. That is over-correction in the opposite
       direction to the defect. It still names itself in meta.unavailable, so
       whoever starts rendering it can gate on it then. */
    const SUMMARY_INPUTS = ['dhf', 'ecrs', 'risks', 'issues'];
    if (unavailable.some((n) => SUMMARY_INPUTS.includes(n))) unavailable.push('summary');
    if (unavailable.includes('software')) unavailable.push('documents');

    /* Every panel is read for the project since P-60 (the header). The
       report stays, so the surface keeps drawing only what it says is keyed. */
    const scopes: Record<string, Scope> = {
      risks: 'program',
      trace: 'program',
      dhf: 'program',
      ecrs: 'program',
      issues: 'program',
      documents: 'program',
    };

    await requireProgramScopeStillCurrent(q, identity, scope);
    return ok(
      res,
      { summary, dhf, trace, risks, ecrs, issues, documents },
      /* `unavailable` names the panels whose read FAILED, so the surface can
         render an error for those and a true empty for the rest, instead of
         one indistinguishable "nothing here". Always present, so a consumer
         never has to tell an absent key from an empty list. */
      { scopes, unavailable: [...new Set(unavailable)] },
    );
  } catch (err) {
    if (err instanceof ProgramReadAccessError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof MissingRequestDbContextError) return res.status(503).json({
      error: 'PROJECT_ACCESS_UNAVAILABLE', message: 'Current project access could not be verified. No engineering data was supplied.',
    });
    return serverError(res, log, 'engineering', err);
  }
});

export default router;
