/**
 * Whether a compiled Module 3 section still describes the sources it was
 * composed from — derived from the lineage, never from a flag.
 *
 * ── Why a flag was not enough ────────────────────────────────────────────────
 * `cmc_module3_sections.stale` is set by ONE of the three writers of
 * `cmc_source_objects` (cmc-write-through). module3-convergence-service and
 * POST /module3-os/source-objects write source objects without touching it,
 * and the write-through itself skips locked sections. The approve route and the
 * export gate both trusted the flag, so a specification or a batch result that
 * changed through either of the other two doors left an approved section
 * reading "current" over data it no longer matched, and it would have been
 * filed as signed content.
 *
 * The compile path records, per section, every source it read and that
 * source's hash at compile (`cmc_section_lineage`). That record is enough to
 * answer the question directly, whoever wrote the source:
 *   - a source the section read whose hash is no longer the one it read;
 *   - a source the section read that no longer exists;
 *   - a source of a type the section reads, recorded or updated after the
 *     compile and not in its lineage (the impact map is the write-through's own,
 *     `impactedSectionsForSourceType` / `impactedSectionsForChangeControl`).
 * Any of the three means the compiled text is not what the sources now say.
 * Recompiling rewrites the lineage and clears it.
 */
import {
  changeControlScopeOf,
  impactedSectionsForChangeControl,
  impactedSectionsForSourceType,
  type CmcSourceType,
} from '../module3Composer';

interface Queryable {
  query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
}

export interface SectionDrift {
  sectionKey: string;
  reasons: string[];
}

/** At most this many reasons are named per section; the rest are counted. */
const NAMED_REASONS = 5;

type SectionLineage = Map<string, { compiledAt: number; read: Set<string>; reasons: string[] }>;

/** Each section's compile time, the sources it read, and those sources' drift. */
function lineageBySection(rows: any[]): SectionLineage {
  const bySection: SectionLineage = new Map();
  for (const r of rows) {
    const entry = bySection.get(r.sectionKey) ?? {
      compiledAt: 0,
      read: new Set<string>(),
      reasons: [],
    };
    bySection.set(r.sectionKey, entry);
    if (!r.sourceObjectId) continue; // a section with no lineage is the gate's provenance check
    entry.read.add(String(r.sourceObjectId));
    entry.compiledAt = Math.max(entry.compiledAt, new Date(r.compiledAt).getTime());
    if (!r.liveId) {
      entry.reasons.push(`a source it was compiled from (${r.sourceObjectId}) no longer exists`);
    } else if (r.liveHash !== r.hashAtCompile) {
      entry.reasons.push(`${r.sourceType} "${r.sourceKey}" changed after compile`);
    }
  }
  return bySection;
}

/** The sections a source of this type feeds, by the write-through's own impact map. */
function sectionsFedBy(src: { sourceType: string; sourcePayload: unknown }): string[] {
  return src.sourceType === 'change_control'
    ? impactedSectionsForChangeControl(changeControlScopeOf(src.sourcePayload))
    : impactedSectionsForSourceType(src.sourceType as CmcSourceType);
}

/** Add a reason for each source recorded after a section's compile and not in its lineage. */
function noteNewerSources(bySection: SectionLineage, sources: any[]): void {
  for (const src of sources) {
    const touched = new Date(src.touchedAt).getTime();
    for (const key of sectionsFedBy(src)) {
      const entry = bySection.get(key);
      if (
        !entry ||
        entry.compiledAt === 0 ||
        entry.read.has(String(src.id)) ||
        touched <= entry.compiledAt
      )
        continue;
      entry.reasons.push(`${src.sourceType} "${src.sourceKey}" was recorded after compile`);
    }
  }
}

export async function findSectionDrift(
  q: Queryable,
  orgId: number,
  projectId: string,
  opts: { sectionKey?: string } = {}
): Promise<SectionDrift[]> {
  const sectionFilter = opts.sectionKey ? 'AND s.section_key = $3' : '';
  const params: unknown[] = opts.sectionKey
    ? [orgId, projectId, opts.sectionKey]
    : [orgId, projectId];

  const [lineageRes, sourcesRes] = await Promise.all([
    q.query(
      `SELECT s.section_key AS "sectionKey",
              l.source_object_id AS "sourceObjectId", l.source_hash_at_compile AS "hashAtCompile",
              l.created_at AS "compiledAt",
              o.id AS "liveId", o.source_hash AS "liveHash", o.source_type AS "sourceType", o.source_key AS "sourceKey"
         FROM cmc_module3_sections s
         LEFT JOIN cmc_section_lineage l
           ON l.section_id = s.id AND l.organization_id = s.organization_id
         LEFT JOIN cmc_source_objects o
           ON o.id = l.source_object_id AND o.organization_id = s.organization_id
        WHERE s.organization_id = $1 AND s.project_id = $2 ${sectionFilter}`,
      params
    ),
    q.query(
      `SELECT id, source_type AS "sourceType", source_key AS "sourceKey",
              source_payload AS "sourcePayload", GREATEST(created_at, updated_at) AS "touchedAt"
         FROM cmc_source_objects
        WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId]
    ),
  ]);

  const bySection = lineageBySection(lineageRes.rows);
  noteNewerSources(bySection, sourcesRes.rows);

  const drift: SectionDrift[] = [];
  for (const [sectionKey, entry] of bySection) {
    if (entry.reasons.length === 0) continue;
    const named = entry.reasons.slice(0, NAMED_REASONS);
    const more = entry.reasons.length - named.length;
    drift.push({ sectionKey, reasons: more > 0 ? [...named, `and ${more} more`] : named });
  }
  return drift.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
}

/** One sentence naming why each drifted section must be recompiled. */
export function describeDrift(drift: SectionDrift[]): string {
  return drift.map(d => `§${d.sectionKey}: ${d.reasons.join('; ')}`).join(' | ');
}
