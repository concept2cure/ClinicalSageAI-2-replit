/**
 * Assemble the v2 DossierMap surface's render contract from the REAL CTD
 * section-tracking store — project_sections — NOT the seed-only c2c_dossier_map
 * blob.
 *
 * SCOPE: the DossierMap surface is a project-readiness view ("this project's" CTD
 * dossier), so this assembler REQUIRES an explicit project id and scopes strictly to
 * that one project (within the caller's org). It never aggregates across the org's
 * projects — an org-wide roll-up would contaminate one program's filing readiness with
 * the most-advanced state of a *different* program's sections. A true portfolio roll-up
 * would be a separate, clearly-labeled view.
 *
 * Data flow:
 *   project_sections (organization_id, project_id, module, section_code, title, status)
 *     — the canonical per-(project, CTD section) tracking table a tenant populates by
 *       creating a regulatory project (server/routes/concept2cure.ts bootstraps every
 *       CTD section from the blueprint) and then working it through the authoring
 *       workflow (server/routes/project-sections.ts status transitions). Migration:
 *       db/migrations/20260220_ind_section_tracking.sql (+ 20260725 content columns).
 *   projects (status) — the parent; soft-deleted by status = 'archived', so an archived
 *     project returns nothing (the projects table has no deleted_at column; archive IS
 *     the soft delete — server/routes/concept2cure.ts DELETE handler).
 *
 * The surface renders one row per CTD module (M1–M5) shaped { m, label, pct, tone,
 * sections } (client/src/concept2cure/v2/surfaces/DossierMap.tsx). So this assembler
 * rolls the one project's real per-section tracking state up to the module grain, deduped
 * by section_code (keeping the most-advanced status if a code is tracked more than once
 * within the project — the same "most advanced wins" rule the IND/NDA assemblers use):
 *   pct  = complete sections / total sections in the module, rounded — a genuine derived
 *          readiness, never a stored blob number. Complete = approved / signed / locked
 *          (the completion set project-sections.ts's own summary route uses).
 *   tone = derived from pct only: 100% → 'ok', partial → 'warn', 0% → 'idle' — one of the
 *          tones the surface's CSS styles (.dmod-bar-f / .rd-chip). Never fabricated.
 *   label = the canonical CTD module title (fixed structure, not per-org data — the honest
 *          blueprint enrichment, matching the NDA assembler's MODULE_LABEL).
 *   sections = the distinct section codes tracked in the module, each rendered "<code>
 *          <title>" (leading 'm' stripped so an eCTD code m2.5 reads "2.5 …"), ordered by
 *          code. These are the real tracked sections, not a fabricated scaffold.
 * Only modules that actually have a tracked section are returned — the surface's "modules
 * we're tracking". A project with no CTD project sections (or an archived/other-org
 * project id) returns [] and the surface renders its own honest empty state.
 */
import { pool } from '../../db';
import { compareSectionCode } from '../../../shared/regulatory/section-code';

/** Canonical CTD module titles (M1–M5). Fixed structure, not per-org data — the honest
 *  blueprint enrichment. The surface prints the "M{m}" prefix itself, so these carry no
 *  redundant "(Module N)" suffix. */
const MODULE_LABEL: Record<string, string> = {
  '1': 'Administrative & prescribing',
  '2': 'CTD summaries',
  '3': 'Quality',
  '4': 'Nonclinical study reports',
  '5': 'Clinical study reports',
};
const MODULE_ORDER = ['1', '2', '3', '4', '5'];

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Sections at or beyond these statuses count as complete for the readiness percentage —
 *  the same completion set project-sections.ts's summary/progress query uses. */
const COMPLETE = new Set(['approved', 'signed', 'locked']);

/** project_sections.status vocabulary ordered by advancement, so that when one section
 *  code is tracked across several of the org's projects we keep the most-advanced state
 *  (mirrors the IND/NDA assemblers' RANK). */
const RANK: Record<string, number> = {
  not_started: 0,
  data_gathering: 1,
  drafting: 2,
  revision: 3,
  internal_review: 3,
  qa_review: 4,
  approved: 5,
  signed: 6,
  locked: 7,
};

/** Extract the CTD module digit ('1'..'5') from the module column ('M1', 'm1', '1'). */
function moduleDigit(raw: string): string | null {
  const m = /(\d)/.exec(raw);
  return m ? m[1] : null;
}

/** Display label for a section chip: strip a leading eCTD 'm' from the code and append the
 *  title, e.g. ('m2.5', 'Clinical Overview') → "2.5 Clinical Overview". */
function sectionLabel(code: string, title: string): string {
  const display = code.replace(/^m/i, '');
  const t = title.trim();
  return t ? `${display} ${t}` : display;
}

/** pct → tone, honest and derived only: complete is 'ok', any partial progress is 'warn',
 *  nothing complete is 'idle'. All three are styled by the surface CSS. */
function toneForPct(pct: number): string {
  if (pct >= 100) return 'ok';
  if (pct > 0) return 'warn';
  return 'idle';
}

interface Section { code: string; status: string; title: string }

/**
 * Assemble a single project's CTD module-completeness map. REQUIRES an explicit
 * projectId — the query is scoped to that one project (within the caller's org) and never
 * falls back to an org-wide roll-up. Returns [] when the project tracks no CTD sections,
 * is archived, or does not belong to the org — the surface renders its honest empty state.
 */
export async function assembleProjectDossierMap(
  orgId: number,
  projectId: number,
): Promise<Record<string, unknown>[]> {
  // One bulk, project-scoped query: every tracked section for THIS project (double-scoped
  // to the caller's org), excluding a soft-deleted (archived) project.
  const { rows } = await pool.query(
    `SELECT ps.section_code, ps.module, ps.title, ps.status
       FROM project_sections ps
       JOIN projects p ON p.id = ps.project_id
      WHERE ps.organization_id = $1
        AND p.organization_id = $1
        AND ps.project_id = $2
        AND p.status IS DISTINCT FROM 'archived'`,
    [orgId, projectId],
  );
  const sections = rows as Array<{ section_code: string; module: string; title: string; status: string }>;
  if (sections.length === 0) return [];

  // Dedup by section_code within each module, keeping the most-advanced status (and its
  // title). One entry per distinct code so the surface's chip keys stay unique and the
  // percentage counts each section once. (Within a single project section_code is unique,
  // so this is defensive — it does NOT merge across projects.)
  const byModule = new Map<string, Map<string, Section>>();
  for (const s of sections) {
    const mod = moduleDigit(str(s.module)) ?? moduleDigit(str(s.section_code));
    if (!mod || !MODULE_LABEL[mod]) continue;
    const code = str(s.section_code);
    if (!code) continue;
    const status = str(s.status).toLowerCase();
    const sectionMap = byModule.get(mod) ?? new Map<string, Section>();
    const prev = sectionMap.get(code);
    if (!prev || (RANK[status] ?? 0) > (RANK[prev.status] ?? 0)) {
      sectionMap.set(code, { code, status, title: str(s.title) });
    }
    byModule.set(mod, sectionMap);
  }

  return MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => {
    const sectionMap = byModule.get(m)!;
    const list = [...sectionMap.values()];
    const total = list.length;
    const complete = list.filter((x) => COMPLETE.has(x.status)).length;
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
    const secLabels = list
      .sort((a, b) => compareSectionCode(a.code, b.code))
      .map((x) => sectionLabel(x.code, x.title));
    return {
      m,
      label: MODULE_LABEL[m],
      pct,
      tone: toneForPct(pct),
      sections: secLabels,
    };
  });
}
