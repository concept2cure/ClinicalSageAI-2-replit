/**
 * Project therapeutic-area context resolver (Feature 2.7).
 *
 * Pulls the project's therapeutic_area slug, looks up its profile,
 * and returns both the structured profile (for programmatic consumers
 * like the gap-classifier extender) and the rendered context block
 * (for direct prompt injection). Tenant-scoped on every read.
 *
 * @module server/services/ana/therapeutic-area-context
 */
import { getPool } from '../../db/runtime.js';
import {
  getProfile,
  renderProfileForPrompt,
  profileRetrievalBoost,
  listAcceptedSlugs,
  type TherapeuticAreaProfile,
  type RenderProfileOptions,
} from './therapeutic-area-profiles/index.js';

export interface ProjectTherapeuticContextResult {
  projectId: number;
  organizationId: number;
  therapeuticArea: string | null;
  /** Resolved profile, or null when the slug doesn't match any registered profile. */
  profile: TherapeuticAreaProfile | null;
  /** Markdown-ish context block for prompt injection. Empty string when no profile. */
  contextBlock: string;
  /** Whitespace-joined retrieval keywords for embedding-query boost. */
  retrievalBoost: string;
}

export async function getProjectTherapeuticContext(
  projectId: number,
  organizationId: number,
  options: RenderProfileOptions = {}
): Promise<ProjectTherapeuticContextResult> {
  const empty: ProjectTherapeuticContextResult = {
    projectId,
    organizationId,
    therapeuticArea: null,
    profile: null,
    contextBlock: '',
    retrievalBoost: '',
  };

  let area: string | null = null;
  try {
    const { rows } = await getPool().query(
      `SELECT therapeutic_area
         FROM projects
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1`,
      [projectId, organizationId]
    );
    if (rows.length === 0) return empty;
    area = (rows[0]?.therapeutic_area as string | null) ?? null;
  } catch (err: any) {
    if (err?.code === '42703' || err?.code === '42P01') return empty; // column / table missing
    throw err;
  }

  const profile = getProfile(area);
  if (!profile) {
    return { ...empty, therapeuticArea: area };
  }
  return {
    projectId,
    organizationId,
    therapeuticArea: area,
    profile,
    contextBlock: renderProfileForPrompt(profile, options),
    retrievalBoost: profileRetrievalBoost(profile),
  };
}

/**
 * Persist the therapeutic-area slug on a project. Returns the new value
 * (or null if cleared). Tenant-scoped.
 */
export async function setProjectTherapeuticArea(
  projectId: number,
  organizationId: number,
  rawSlug: string | null
): Promise<{
  ok: boolean;
  therapeuticArea: string | null;
  resolvedToProfile: string | null;
}> {
  const slug = rawSlug ? String(rawSlug).trim().toLowerCase() : null;
  if (slug && !listAcceptedSlugs().includes(slug.replace(/[\s_]+/g, '-'))) {
    const err = new Error(
      `Unknown therapeutic area slug: "${slug}". Accepted: ${listAcceptedSlugs().join(', ')}`
    );
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }

  try {
    const result = await getPool().query(
      `UPDATE projects
          SET therapeutic_area = $3,
              updated_at       = NOW()
        WHERE id = $1
          AND organization_id = $2
        RETURNING therapeutic_area`,
      [projectId, organizationId, slug]
    );
    if (result.rows.length === 0) {
      return { ok: false, therapeuticArea: null, resolvedToProfile: null };
    }
    const newArea = result.rows[0].therapeutic_area as string | null;
    const resolved = getProfile(newArea);
    return {
      ok: true,
      therapeuticArea: newArea,
      resolvedToProfile: resolved?.id ?? null,
    };
  } catch (err: any) {
    if (err?.code === '42703') {
      // Column missing — surface so the caller can return a 503.
      const surfaced = new Error('therapeutic_area column not migrated yet');
      (surfaced as any).code = 'MIGRATION_PENDING';
      throw surfaced;
    }
    throw err;
  }
}
