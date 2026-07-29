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
 * The five panels do not all have the same tenancy granularity, because
 * the underlying tables do not:
 *
 *   risks   risk_items            org + program   → program-scoped
 *   trace   c2c_design_controls   org only        → organization-scoped
 *   dhf     cerv2_510k_sections   org only        → organization-scoped
 *   ecrs    change_requests       org only        → organization-scoped
 *   issues  qms_nonconforming_…   org only        → organization-scoped
 *
 * Rather than quietly presenting org-wide rows as though they belonged
 * to the selected program, every panel reports its own `scope` in
 * `meta.scopes`. The surface labels anything organization-scoped so the
 * user knows what they are reading. Narrowing the remaining four to
 * program granularity needs a `program_id` column on each table and is
 * tracked separately — but mislabelling them is not acceptable in the
 * meantime.
 *
 * Every panel degrades independently: a missing table (42P01, pre-
 * migration tenants) yields an empty array for that panel, never a 500
 * that blanks the whole surface.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, notFoundInTenant, serverError } from '../lib/api-response';
import type { QueryResultRow } from 'pg';
import { pool } from '../db';

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
async function panel<T extends QueryResultRow>(
  name: string,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows;
  } catch (err) {
    /* 42P01 = undefined_table. Anything else is a real fault worth
       knowing about, but still must not blank the other panels. */
    const code = (err as { code?: string })?.code;
    if (code !== '42P01') {
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

/** change_requests.status → the surface's ECR state vocabulary. */
function ecrState(status: string | null): 'open' | 'review' | 'approved' | 'closed' {
  const s = (status ?? '').toLowerCase();
  if (s === 'completed' || s === 'rejected' || s === 'failed') return 'closed';
  if (s === 'approved') return 'approved';
  if (s === 'pending') return 'review';
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
    return clientError(res, 422, 'programId must be a UUID');
  }

  try {
    /* Verify tenancy before reading anything. A valid UUID from another
       org and a non-existent UUID both 404, so neither leaks. */
    const program = await pool.query<{ id: string }>(
      `SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [programId, orgId],
    );
    if (program.rows.length === 0) return notFoundInTenant(res, 'Program');

    /* ── Risks — ISO 14971, program-scoped ───────────────────────────
       Controls are aggregated per risk so the surface can show the
       control text without an N+1 round trip. */
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
              u.username AS owner,
              ARRAY_REMOVE(ARRAY_AGG(c.description ORDER BY c.id), NULL)            AS controls,
              ARRAY_REMOVE(ARRAY_AGG(c.verification_evidence ORDER BY c.id), NULL)  AS verification
         FROM risk_items r
         LEFT JOIN risk_controls c ON c.risk_item_id = r.id
         LEFT JOIN users u         ON u.id = r.assigned_to
        WHERE r.organization_id = $1 AND r.program_id = $2 AND r.deleted_at IS NULL
        GROUP BY r.id, u.username
        ORDER BY r.severity DESC, r.probability DESC, r.id`,
      [orgId, programId],
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

    /* ── Design-controls traceability — organization-scoped ──────────── */
    const traceRows = await panel<{
      id: number;
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
        WHERE organization_id = $1
        ORDER BY id`,
      [orgId],
    );

    const trace = traceRows.map((t) => ({
      id: `UN-${String(t.id).padStart(3, '0')}`,
      need: t.req,
      input: t.cat ?? '—',
      output: Array.isArray(t.outputs) ? t.outputs.join(' · ') || '—' : '—',
      verif: t.ver_ref ?? t.ver ?? '—',
      valid: t.val_ref ?? t.val ?? '—',
      risk: t.risk_ref ?? '—',
      /* Verified only when both verification and validation are on
         record — 820.30 treats them as separate obligations. */
      state: t.ver && t.val ? 'verified' : t.ver || t.val ? 'in-progress' : 'open',
    }));

    /* ── DHF sections — organization-scoped ──────────────────────────── */
    const dhfRows = await panel<{
      id: number;
      section_number: string;
      section_title: string;
      status: string | null;
      is_required: boolean | null;
      completion_percentage: number | null;
      updated_at: Date | null;
    }>(
      'dhf',
      `SELECT id, section_number, section_title, status, is_required,
              completion_percentage, updated_at
         FROM cerv2_510k_sections
        WHERE organization_id = $1 AND category = 'device'
        ORDER BY display_order NULLS LAST, section_number`,
      [orgId],
    );

    const dhf = dhfRows.map((d) => {
      const raw = (d.status ?? 'draft').toLowerCase();
      const status =
        raw === 'validated' || raw === 'approved'
          ? 'ready'
          : raw === 'review' || raw === 'in_review'
            ? 'review'
            : d.is_required && raw === 'empty'
              ? 'blocked'
              : 'draft';
      return {
        id: String(d.id),
        num: d.section_number,
        label: d.section_title,
        ver: '—',
        owner: '—',
        updated: ago(d.updated_at),
        status,
        meta: `${d.completion_percentage ?? 0}% complete${d.is_required ? ' · required' : ''}`,
      };
    });

    /* ── Engineering change requests — organization-scoped ───────────── */
    const ecrRows = await panel<{
      id: string;
      entity_type: string;
      reason: string | null;
      priority: string | null;
      status: string | null;
      initiated_by: string;
      created_at: Date | null;
      new_value: string;
    }>(
      'ecrs',
      `SELECT id, entity_type, reason, priority, status, initiated_by, created_at, new_value
         FROM change_requests
        WHERE organization_id = $1
        ORDER BY created_at DESC NULLS LAST
        LIMIT 50`,
      [orgId],
    );

    const ecrs = ecrRows.map((e) => ({
      id: `ECR-${e.id.slice(0, 8)}`,
      title: e.reason || `${e.entity_type} change`,
      impact: e.entity_type,
      opened: ago(e.created_at),
      state: ecrState(e.status),
      owner: e.initiated_by,
      riskChange: e.priority ? `${e.priority} priority` : '—',
      linked: e.entity_type,
    }));

    /* ── Non-conformances — organization-scoped ──────────────────────── */
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
        WHERE organization_id = $1
        ORDER BY detected_at DESC NULLS LAST
        LIMIT 50`,
      [orgId],
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
          a static catalogue. Organization-scoped: concept2cure_artifacts
          has no program column. ─────────────────────────────────────── */
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
      `SELECT id, title, ctd_section, type, status, version, updated_at
         FROM concept2cure_artifacts
        WHERE organization_id = $1
          AND (ctd_section ILIKE '3%' OR ctd_section ILIKE '4%' OR type ILIKE '%design%')
          AND status != 'archived'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 50`,
      [orgId],
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
    const requiredDhf = dhfRows.filter((d) => d.is_required);
    const readyDhf = requiredDhf.filter((d) =>
      ['validated', 'approved'].includes((d.status ?? '').toLowerCase()),
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
    );
    summary.riskLastUpdated = lastRisk[0]?.updated_at?.toISOString() ?? null;

    const scopes: Record<string, Scope> = {
      risks: 'program',
      trace: 'organization',
      dhf: 'organization',
      ecrs: 'organization',
      issues: 'organization',
      documents: 'organization',
    };

    return ok(
      res,
      { summary, dhf, trace, risks, ecrs, issues, documents },
      { scopes },
    );
  } catch (err) {
    return serverError(res, log, 'engineering', err);
  }
});

export default router;
