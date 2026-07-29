/**
 * Global search — single endpoint that searches across programs,
 * artifacts, Q-Subs, audit logs, AnA threads, and labeling documents in
 * the caller's organization. Returns one envelope per type so the kit's
 * search overlay can group results by category.
 *
 *   GET /api/mdx/search?q=<query>&type=<csv-types>&limit=<n>
 *
 * No new tables — pure read-only fanout over existing tables. Each type
 * query is fired in parallel, tenant-scoped, capped at 25 hits each by
 * default. The fanout is defensive: a missing optional table returns []
 * rather than erroring the whole search.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import {
  ok, clientError, orgRequired, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-search');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const SEARCH_TYPES = [
  'program', 'artifact', 'q_sub', 'audit', 'thread', 'labeling',
  'risk', 'study', 'udi', 'cdx', 'ldt', 'qms',
] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

const searchQuery = z.object({
  q:     z.string().min(2).max(200),
  type:  z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
});

interface SearchHit {
  type:       SearchType;
  id:         string | number;
  title:      string;
  snippet:    string | null;
  url:        string;
  metadata?:  Record<string, unknown>;
}

/** Run one type's query, swallow optional-table errors. */
async function safeQuery<T extends Record<string, unknown>>(
  sql: string, args: unknown[], mapper: (row: T) => SearchHit,
): Promise<SearchHit[]> {
  try {
    const { rows } = await pool.query<T>(sql, args);
    return rows.map(mapper);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '42703') return [];
    throw err;
  }
}

router.get('/search', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);

  const q = parsed.data.q.trim();
  const ilike = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const limit = parsed.data.limit ?? 25;
  const requestedTypes = (parsed.data.type ?? SEARCH_TYPES.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean) as SearchType[];
  const wants = (t: SearchType) => requestedTypes.length === 0 || requestedTypes.includes(t);

  try {
    const fanout: Promise<SearchHit[]>[] = [];

    if (wants('program')) {
      fanout.push(safeQuery<{ id: string; name: string; code: string | null; status: string | null; description: string | null }>(
        `SELECT id, name, code, status, description FROM regulatory_programs
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (name ILIKE $2 OR code ILIKE $2 OR description ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'program', id: r.id,
          title: r.code ? `${r.code} · ${r.name}` : r.name,
          snippet: r.description?.slice(0, 200) ?? null,
          url: `/programs/${r.id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    if (wants('artifact')) {
      fanout.push(safeQuery<{ id: number; artifact_id: string; title: string; ctd_section: string | null; status: string }>(
        `SELECT id, artifact_id, title, ctd_section, status FROM concept2cure_artifacts
          WHERE organization_id = $1 AND status != 'archived'
            AND (title ILIKE $2 OR content ILIKE $2)
          ORDER BY updated_at DESC LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'artifact', id: r.id,
          title: r.title,
          snippet: r.ctd_section ? `§${r.ctd_section}` : null,
          url: `/vault/${r.artifact_id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    if (wants('q_sub')) {
      fanout.push(safeQuery<{ id: string; q_number: string | null; title: string; stage: string | null }>(
        `SELECT id::text AS id, q_number, title, stage FROM q_submissions
          WHERE program_id::uuid IN (SELECT id FROM regulatory_programs WHERE organization_id = $1)
            AND (title ILIKE $2 OR q_number ILIKE $2)
          ORDER BY created_at DESC LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'q_sub', id: r.id,
          title: r.q_number ? `${r.q_number} · ${r.title}` : r.title,
          snippet: null,
          url: `/q-subs/${r.id}`,
          metadata: { stage: r.stage },
        }),
      ));
    }

    if (wants('audit')) {
      fanout.push(safeQuery<{ id: number; action: string; resource_type: string; record_id: string | null; created_at: Date }>(
        `SELECT id, action, table_name AS resource_type, record_id::text, created_at
           FROM audit_logs
          WHERE tenant_id = $1
            AND (action ILIKE $2 OR table_name ILIKE $2 OR record_id::text ILIKE $2)
          ORDER BY created_at DESC LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'audit', id: r.id,
          title: `${r.action} ${r.resource_type}`,
          snippet: r.record_id ? `record ${r.record_id}` : null,
          url: `/audit/${r.id}`,
          metadata: { createdAt: r.created_at },
        }),
      ));
    }

    if (wants('thread')) {
      fanout.push(safeQuery<{ id: string; title: string | null; updated_at: Date }>(
        `SELECT id, title, updated_at FROM chat_threads
          WHERE organization_id = $1 AND COALESCE(title, '') ILIKE $2
          ORDER BY updated_at DESC LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'thread', id: r.id,
          title: r.title ?? `Thread ${r.id}`,
          snippet: null,
          url: `/ana/threads/${r.id}`,
          metadata: { updatedAt: r.updated_at },
        }),
      ));
    }

    if (wants('labeling')) {
      fanout.push(safeQuery<{ id: number; device_name: string; doc_kind: string; language: string; status: string }>(
        `SELECT id, device_name, doc_kind, language, status FROM labeling_documents
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (device_name ILIKE $2 OR doc_kind ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'labeling', id: r.id,
          title: `${r.device_name} · ${r.doc_kind} (${r.language})`,
          snippet: null,
          url: `/labeling/${r.id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    if (wants('risk')) {
      fanout.push(safeQuery<{ id: number; ref_code: string | null; hazard: string; harm: string; status: string }>(
        `SELECT id, ref_code, hazard, harm, status FROM risk_items
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (hazard ILIKE $2 OR harm ILIKE $2 OR COALESCE(ref_code,'') ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'risk', id: r.id,
          title: r.ref_code ? `${r.ref_code} · ${r.hazard}` : r.hazard,
          snippet: r.harm,
          url: `/risk/${r.id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    if (wants('study')) {
      fanout.push(safeQuery<{ id: number; study_id: string; title: string; status: string }>(
        `SELECT id, study_id, title, status FROM clinical_studies
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (title ILIKE $2 OR study_id ILIKE $2 OR COALESCE(nct_id,'') ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'study', id: r.id,
          title: `${r.study_id} · ${r.title}`,
          snippet: null,
          url: `/clinical/${r.id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    if (wants('udi')) {
      fanout.push(safeQuery<{ id: number; device_name: string; udi_di: string; gudid_status: string | null }>(
        `SELECT id, device_name, udi_di, gudid_status FROM udi_records
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (device_name ILIKE $2 OR udi_di ILIKE $2 OR COALESCE(product_code,'') ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'udi', id: r.id,
          title: `${r.device_name} (${r.udi_di})`,
          snippet: null,
          url: `/udi/${r.id}`,
          metadata: { gudidStatus: r.gudid_status },
        }),
      ));
    }

    if (wants('cdx')) {
      fanout.push(safeQuery<{ id: number; drug_name: string; biomarker: string | null; approval_status: string }>(
        `SELECT id, drug_name, biomarker, approval_status FROM cdx_pairings
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (drug_name ILIKE $2 OR COALESCE(biomarker,'') ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'cdx', id: r.id,
          title: r.biomarker ? `${r.drug_name} · ${r.biomarker}` : r.drug_name,
          snippet: null,
          url: `/cdx/${r.id}`,
          metadata: { status: r.approval_status },
        }),
      ));
    }

    if (wants('ldt')) {
      fanout.push(safeQuery<{ id: number; lab_name: string; test_name: string; current_phase: number }>(
        `SELECT id, lab_name, test_name, current_phase FROM ldt_inventory
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (lab_name ILIKE $2 OR test_name ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'ldt', id: r.id,
          title: `${r.lab_name} · ${r.test_name}`,
          snippet: `Phase ${r.current_phase}`,
          url: `/ldt/${r.id}`,
        }),
      ));
    }

    if (wants('qms')) {
      fanout.push(safeQuery<{ id: number; doc_number: string; title: string; doc_type: string; status: string }>(
        `SELECT id, doc_number, title, doc_type, status FROM qms_documents
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (doc_number ILIKE $2 OR title ILIKE $2)
          LIMIT $3`,
        [orgId, ilike, limit],
        (r) => ({
          type: 'qms', id: r.id,
          title: `${r.doc_number} · ${r.title}`,
          snippet: r.doc_type,
          url: `/qms/documents/${r.id}`,
          metadata: { status: r.status },
        }),
      ));
    }

    const results = await Promise.all(fanout);
    const flat: SearchHit[] = results.flat();
    /* Group by type for the kit's grouped search UI. */
    const grouped: Record<string, SearchHit[]> = {};
    for (const hit of flat) {
      (grouped[hit.type] ||= []).push(hit);
    }
    return ok(res, grouped, {
      query: q,
      total: flat.length,
      types: Object.keys(grouped),
    });
  } catch (err) { return serverError(res, log, 'search', err); }
});

export default router;
