/**
 * AnA review queue route — surfaces every cerv2_510k_sections row where
 * draft_source='ana' and the user has not yet accepted, scoped to the
 * caller's organization.
 *
 *   GET /api/mdx/ana-drafts
 *     ?pathway=k510|pma|cer   (optional filter)
 *     ?program_id=<UUID>      (optional filter — single program)
 *     ?age=today|week|older   (optional filter — drafted_at bucket)
 *     ?limit=<n>              (default 100, max 500)
 *
 * Returns `{ data: AnaDraftCard[] }` with the same field set the kit's
 * AnA review queue surface needs (see brief to Claude Design). Joins
 * cerv2_510k_sections → regulatory_programs to expose program code +
 * pathway. Read-only; the accept action lives on the per-section route
 * (POST /api/cerv2-sections/:id/accept-ana-draft).
 *
 * Backs surface 11 of the paying-client beta brief.
 *
 * Mounted at /api/mdx via register-inline-routes.ts.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';
import { REGULATORY_PATH_TO_PATHWAY, REGULATORY_PATHWAYS } from '../../shared/constants/mdx';

const router = Router();
const log = createScopedLogger('mdx-ana-drafts');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const querySchema = z.object({
  pathway:    z.enum(REGULATORY_PATHWAYS as readonly [string, ...string[]]).optional(),
  program_id: z.string().min(1).optional(),
  age:        z.enum(['today', 'week', 'older']).optional(),
  limit:      z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

interface AnaDraftRow {
  section_id:      number;
  section_key:     string;
  section_number:  string;
  section_title:   string;
  drafted_at:      Date;
  drafted_summary: string | null;
  category:        string | null;
  /* From regulatory_programs (joined). May be null when a draft was
     written before the program had a kit pathway assigned, but the seed
     guarantees join coverage today. */
  program_id:      string | null;
  program_code:    string | null;
  program_name:    string | null;
  regulatory_path: string | null;
}

/** GET /api/mdx/ana-drafts — pending AnA-drafted sections for the org. */
router.get('/ana-drafts', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const { pathway, program_id: programId, age, limit = 100 } = parsed.data;

  /* Build the age predicate against drafted_at. The kit's filter buckets:
       today  = within the calendar day
       week   = within last 7 days
       older  = anything past 7 days
     We use absolute intervals rather than calendar-day to avoid surprises
     across timezone boundaries — the kit displays relative time anyway. */
  const ageClause =
    age === 'today'  ? `AND s.drafted_at >= NOW() - INTERVAL '1 day'`
    : age === 'week' ? `AND s.drafted_at >= NOW() - INTERVAL '7 days'`
    : age === 'older' ? `AND s.drafted_at <  NOW() - INTERVAL '7 days'`
    : '';

  /* The pathway filter operates on regulatory_programs.regulatory_path
     mapped through REGULATORY_PATH_TO_PATHWAY (e.g. '510k' → 'k510'),
     applied after the SQL query to keep the SQL pathway-agnostic. */

  try {
    const { rows } = await pool.query<AnaDraftRow>(
      `SELECT
          s.id              AS section_id,
          s.section_key,
          s.section_number,
          s.section_title,
          s.drafted_at,
          s.drafted_summary,
          s.category,
          p.id              AS program_id,
          p.code            AS program_code,
          p.name            AS program_name,
          p.regulatory_path AS regulatory_path
       FROM cerv2_510k_sections s
       LEFT JOIN regulatory_programs p
              ON p.organization_id = s.organization_id
             AND p.deleted_at IS NULL
       WHERE s.organization_id = $1
         AND s.draft_source    = 'ana'
         AND s.accepted_at    IS NULL
         ${programId ? 'AND p.id = $3' : ''}
         ${ageClause}
       ORDER BY s.drafted_at DESC
       LIMIT $2`,
      programId ? [orgId, limit, programId] : [orgId, limit],
    );

    /* Map regulatory_path → kit pathway, drop rows that don't match the
       requested pathway. */
    const cards = rows
      .map((r) => {
        const kitPathway = r.regulatory_path
          ? REGULATORY_PATH_TO_PATHWAY[r.regulatory_path.toLowerCase()] ?? null
          : null;
        return {
          sectionId:      r.section_id,
          sectionKey:     r.section_key,
          sectionNumber:  r.section_number,
          sectionTitle:   r.section_title,
          category:       r.category,
          programId:      r.program_id,
          programCode:    r.program_code,
          programName:    r.program_name,
          pathway:        kitPathway,
          draftedAt:      r.drafted_at,
          draftedSummary: r.drafted_summary,
        };
      })
      .filter((c) => (pathway ? c.pathway === pathway : true));

    return ok(res, cards, { count: cards.length });
  } catch (err: unknown) {
    /* If the migration hasn't been applied the draft_source column is
       missing and pg raises 42703. Surface a clear 503 so ops know to
       run db:push. */
    const code = (err as { code?: string }).code;
    if (code === '42703') {
      /* draft_source column missing — caller hasn't applied migration
         20260506. Use 409 (conflict) rather than 503 because the table
         exists but is missing a column; clientError supports 409. */
      return clientError(
        res,
        409,
        'AnA review queue not provisioned — apply migration 20260506_kit_section_draft_provenance.sql',
      );
    }
    return serverError(res, log, 'ana-drafts', err);
  }
});

export default router;
