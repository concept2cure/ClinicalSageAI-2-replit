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

/**
 * One reason, with the source it belongs to.
 *
 * The reasons were sentences only, so a consumer could tell THAT a section had
 * drifted but not WHICH deliverable had drifted it — and the deliverable view
 * below must never tell a reader their specifications are out of date because
 * a batch record changed. The sentence is unchanged, so `describeDrift` and
 * both of its callers read exactly as they did.
 */
interface DriftReason {
  sourceType: string;
  text: string;
}

/** The only two section filters the lineage read accepts. */
type SectionFilter = '' | 'AND s.section_key = $3';

/** At most this many reasons are named per section; the rest are counted. */
const NAMED_REASONS = 5;

type SectionLineage = Map<string, { compiledAt: number; read: Set<string>; reasons: DriftReason[] }>;

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
      entry.reasons.push({
        sourceType: String(r.sourceType ?? ''),
        text: `a source it was compiled from (${r.sourceObjectId}) no longer exists`,
      });
    } else if (r.liveHash !== r.hashAtCompile) {
      entry.reasons.push({
        sourceType: String(r.sourceType ?? ''),
        text: `${r.sourceType} "${r.sourceKey}" changed after compile`,
      });
    }
  }
  return bySection;
}

/** The sections a source of this type feeds, by the write-through's own impact map. */
export function sectionsFedBy(src: { sourceType: string; sourcePayload: unknown }): string[] {
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
      entry.reasons.push({
        sourceType: String(src.sourceType ?? ''),
        text: `${src.sourceType} "${src.sourceKey}" was recorded after compile`,
      });
    }
  }
}

/* The two reads both views make. One copy, so the section view and the
   deliverable view below can never answer from different data.

   The lineage read takes its section filter as an argument rather than being
   concatenated at each call site, so the file keeps exactly ONE value
   interpolated into SQL text — `sectionFilter`, which is one of the two fixed
   literals below, chosen by a boolean, and never a caller's string
   (ci:sql-interpolation's baseline allows that one). */
function lineageSql(sectionFilter: SectionFilter): string {
  return `SELECT s.section_key AS "sectionKey",
              l.source_object_id AS "sourceObjectId", l.source_hash_at_compile AS "hashAtCompile",
              l.created_at AS "compiledAt",
              o.id AS "liveId", o.source_hash AS "liveHash", o.source_type AS "sourceType", o.source_key AS "sourceKey"
         FROM cmc_module3_sections s
         LEFT JOIN cmc_section_lineage l
           ON l.section_id = s.id AND l.organization_id = s.organization_id
         LEFT JOIN cmc_source_objects o
           ON o.id = l.source_object_id AND o.organization_id = s.organization_id
        WHERE s.organization_id = $1 AND s.project_id = $2 ${sectionFilter}`;
}

const SOURCES_SQL = `SELECT id, source_type AS "sourceType", source_key AS "sourceKey",
              source_payload AS "sourcePayload", GREATEST(created_at, updated_at) AS "touchedAt"
         FROM cmc_source_objects
        WHERE organization_id = $1 AND project_id = $2`;

export async function findSectionDrift(
  q: Queryable,
  orgId: number,
  projectId: string,
  opts: { sectionKey?: string } = {}
): Promise<SectionDrift[]> {
  const sectionFilter: SectionFilter = opts.sectionKey ? 'AND s.section_key = $3' : '';
  const params: unknown[] = opts.sectionKey
    ? [orgId, projectId, opts.sectionKey]
    : [orgId, projectId];

  const [lineageRes, sourcesRes] = await Promise.all([
    q.query(lineageSql(sectionFilter), params),
    q.query(SOURCES_SQL, [orgId, projectId]),
  ]);

  const bySection = lineageBySection(lineageRes.rows);
  noteNewerSources(bySection, sourcesRes.rows);

  return driftFrom(bySection);
}

/** The drift entries of a lineage map, in section order, reasons capped. */
function driftFrom(bySection: SectionLineage): SectionDrift[] {
  const drift: SectionDrift[] = [];
  for (const [sectionKey, entry] of bySection) {
    if (entry.reasons.length === 0) continue;
    const named = entry.reasons.slice(0, NAMED_REASONS).map((r) => r.text);
    const more = entry.reasons.length - named.length;
    drift.push({ sectionKey, reasons: more > 0 ? [...named, `and ${more} more`] : named });
  }
  return drift.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
}

/** One sentence naming why each drifted section must be recompiled. */
export function describeDrift(drift: SectionDrift[]): string {
  return drift.map(d => `§${d.sectionKey}: ${d.reasons.join('; ')}`).join(' | ');
}

/* ── S12: the same facts, read by deliverable ────────────────────────────────
   P-83 asks that a work project's deliverables be "mapped downstream", and
   that a new version flag the sections that used the old one. For CMC both
   halves already exist, read by SECTION: `cmc_section_lineage` records what a
   section was composed from, and `findSectionDrift` above says which sections
   no longer match their sources.

   What a work project's "Feeds" list needs (THE_PROGRAM_2026-11-01 §7a, "In
   the UI (no new screen)") is the other direction: for each deliverable the
   project holds, the sections it feeds and which of those are out of date
   BECAUSE OF IT. Same two reads, same impact map, attributed. */

/** One kind of CMC deliverable, and where its records go. */
export interface DeliverableFeeds {
  /** The canonical source type — the register the deliverable comes from. */
  sourceType: string;
  /** How many records of it this project holds. */
  records: number;
  /** When one of them was last recorded or changed, ISO; null when unknown. */
  lastRecordedAt: string | null;
  /** The §3.2 sections its records feed, by the write-through's own impact map. */
  feeds: string[];
  /** Of those, the ones currently out of date because of THIS deliverable. */
  drifted: string[];
  /** Why, in the words the drift read already uses. */
  reasons: string[];
}

export interface ProjectDeliverableFeeds {
  deliverables: DeliverableFeeds[];
  /** Present when the read failed: a failure is never an empty project. */
  notEvaluated?: string;
}

/** The union of the sections a set of records feeds, sorted and deduped. */
function feedsOf(records: Array<{ sourceType: string; sourcePayload: unknown }>): string[] {
  const keys = new Set<string>();
  for (const r of records) for (const k of sectionsFedBy(r)) keys.add(k);
  return [...keys].sort();
}

/**
 * Each CMC deliverable this project holds, the sections it feeds, and the ones
 * out of date because of it.
 *
 * Composes what exists rather than re-deriving it: `sectionsFedBy` is the
 * write-through's own impact map, and the drift comes from the same lineage
 * read `findSectionDrift` uses, attributed by the source type each reason
 * belongs to. A reader is never told their specifications are stale because a
 * batch record changed.
 *
 * A failed read is reported as one. A project whose registers could not be
 * read has not been shown to hold no deliverables.
 */
export async function projectDeliverableFeeds(
  q: Queryable,
  orgId: number,
  projectId: string,
): Promise<ProjectDeliverableFeeds> {
  let lineageRows: any[];
  let sourceRows: any[];
  try {
    const [lineageRes, sourcesRes] = await Promise.all([
      q.query(lineageSql(''), [orgId, projectId]),
      q.query(SOURCES_SQL, [orgId, projectId]),
    ]);
    lineageRows = lineageRes.rows;
    sourceRows = sourcesRes.rows;
  } catch (err) {
    return {
      deliverables: [],
      notEvaluated:
        'This project’s CMC records could not be read, so what each deliverable feeds is not established: ' +
        (err instanceof Error ? err.message : String(err)),
    };
  }

  const bySection = lineageBySection(lineageRows);
  noteNewerSources(bySection, sourceRows);

  const byType = new Map<string, { records: any[]; lastRecordedAt: number }>();
  for (const row of sourceRows) {
    const type = String(row.sourceType ?? '');
    if (!type) continue;
    const entry = byType.get(type) ?? { records: [], lastRecordedAt: 0 };
    entry.records.push(row);
    const touched = new Date(row.touchedAt).getTime();
    if (Number.isFinite(touched) && touched > entry.lastRecordedAt) entry.lastRecordedAt = touched;
    byType.set(type, entry);
  }

  const deliverables: DeliverableFeeds[] = [];
  for (const [sourceType, entry] of byType) {
    const drifted: string[] = [];
    const reasons: string[] = [];
    for (const [sectionKey, section] of bySection) {
      const mine = section.reasons.filter((r) => r.sourceType === sourceType);
      if (mine.length === 0) continue;
      drifted.push(sectionKey);
      for (const r of mine.slice(0, NAMED_REASONS)) reasons.push(`§${sectionKey}: ${r.text}`);
    }
    deliverables.push({
      sourceType,
      records: entry.records.length,
      lastRecordedAt: entry.lastRecordedAt ? new Date(entry.lastRecordedAt).toISOString() : null,
      feeds: feedsOf(entry.records),
      drifted: drifted.sort(),
      reasons,
    });
  }
  return { deliverables: deliverables.sort((a, b) => a.sourceType.localeCompare(b.sourceType)) };
}
