/**
 * Phase 2 of automated source attribution: the cross-registry link.
 *
 * See docs/architecture/SOURCE_ATTRIBUTION_AUTOMATED_DESIGN.md §3. RAG retrieval
 * (enhancedEmbeddingService / advancedRAGPipeline over lumen_data_atoms) returns
 * Data Room chunks identified by an ARTIFACT ID STRING —
 * `lumen_data_atoms.source_id = concept2cure_artifacts.artifact_id`. The
 * verified-quote attribution primitive (source-attribution.ts) needs the
 * CANONICAL `cre_evidence_sources.id` to record a span against. These are two
 * different registries; nothing at retrieval time maps one to the other. This
 * module resolves that link.
 *
 * ── THE LINK (verified in code, not assumed) ─────────────────────────────────
 * A Data Room upload that creates a canonical source records the artifact id on
 * the source's metadata. routes/chat/upload.ts uses the SAME artifact id for the
 * atom's `source_id` (the INSERT into lumen_data_atoms) and the source's
 * `metadata.artifactId` (the createSource call). So the resolvable join is:
 *
 *     cre_evidence_sources.metadata->>'artifactId'  ===  lumen_data_atoms.source_id
 *
 * This is more direct than the `provenance->>'fileUploadId'` chain an earlier
 * draft of the design assumed (source ← fileUploadId → upload → artifact → atom):
 * the artifact id is already on the source's metadata, so no intermediate hop is
 * needed. (An index-time stamp of the resolved id onto the atom remains a valid
 * optimization; resolving at read time additionally covers atoms that already
 * exist, with no migration or re-ingest.)
 *
 * ── HONEST BY CONSTRUCTION ───────────────────────────────────────────────────
 * An atom whose upload never created a canonical source — e.g. the
 * routes/concept2cure.ts data-room path, which writes atoms but no
 * cre_evidence_sources — resolves to NOTHING. No id is invented, so no span can
 * be attributed to a source that does not exist. Silence is the correct answer,
 * exactly as the attribution primitive requires: "a usage exists because someone
 * recorded it," never because a title or id looked plausible.
 *
 * ── TENANT-SCOPED ────────────────────────────────────────────────────────────
 * The join filters `cre_evidence_sources.organization_id`, so an artifact id
 * colliding across tenants never resolves to another tenant's source.
 *
 * @module server/services/clinical-regulatory-evidence/retrieval-source-link
 */

import { pool } from '../../db';
import type { Queryable } from './span-lineage.service';

/** Default executor — the pool (its own transaction per statement). */
const defaultExec: Queryable = pool as unknown as Queryable;

/**
 * Resolve retrieval artifact ids to canonical `cre_evidence_sources.id`s.
 *
 * @param orgId       The tenant whose sources may be cited.
 * @param artifactIds The `lumen_data_atoms.source_id` values from retrieval
 *                    (artifact id strings). Duplicates and empties are ignored.
 * @param exec        Optional transaction-bound executor; defaults to the pool.
 * @returns A Map from artifact id → cre_evidence_sources.id, containing ONLY the
 *          artifact ids that have a canonical source in this org. Artifact ids
 *          with no source are absent from the map (never mapped to a guessed id).
 */
export async function resolveEvidenceSourceIdsByArtifact(
  orgId: number,
  artifactIds: readonly string[],
  exec: Queryable = defaultExec,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  if (!Number.isInteger(orgId) || orgId <= 0) return out;
  const ids = [
    ...new Set(
      (artifactIds ?? []).filter(
        (a): a is string => typeof a === 'string' && a.length > 0,
      ),
    ),
  ];
  if (ids.length === 0) return out;

  // Two link forms exist, both keyed off lumen_data_atoms.source_id (see
  // routes/chat/upload.ts + routes/concept2cure.ts):
  //   (1) an artifact-id string, linked via cre_evidence_sources
  //       .metadata->>'artifactId' (numeric-workspace uploads);
  //   (2) the direct-embed form 'cre_source:<id>' where <id> IS the canonical
  //       cre_evidence_sources.id (program-scoped Data Room uploads,
  //       upload.ts:505). Even here the id is VERIFIED to exist + be org-owned
  //       before it is returned — the embedded number is never trusted blind.
  const CRE_SOURCE_RE = /^cre_source:(\d+)$/;
  const byArtifactId: string[] = [];
  const directByNumericId = new Map<number, string>(); // cre_evidence_sources.id → original key
  for (const s of ids) {
    const m = CRE_SOURCE_RE.exec(s);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0) directByNumericId.set(n, s);
      // a malformed 'cre_source:<non-numeric>' is treated as a plain artifact
      // id below (it will simply not match) — never resolved.
      else byArtifactId.push(s);
    } else {
      byArtifactId.push(s);
    }
  }

  // Form (1): metadata.artifactId join.
  if (byArtifactId.length > 0) {
    const { rows } = await exec.query<{ artifact_id: string | null; id: number }>(
      `SELECT (metadata->>'artifactId') AS artifact_id, id
         FROM cre_evidence_sources
        WHERE organization_id = $1
          AND metadata->>'artifactId' = ANY($2::text[])`,
      [orgId, byArtifactId],
    );
    for (const r of rows) {
      // Defensive: if two sources improbably claim the same artifact id, the
      // first row wins deterministically — either is a correct citation of the
      // same upload.
      if (r.artifact_id && !out.has(r.artifact_id)) {
        out.set(r.artifact_id, Number(r.id));
      }
    }
  }

  // Form (2): 'cre_source:<id>' — verify each embedded id exists AND belongs to
  // this org before mapping it. A 'cre_source:<id>' pointing at a missing or
  // cross-tenant source resolves to nothing (honest silence, no cross-tenant leak).
  if (directByNumericId.size > 0) {
    const wantedIds = [...directByNumericId.keys()];
    const { rows } = await exec.query<{ id: number }>(
      `SELECT id
         FROM cre_evidence_sources
        WHERE organization_id = $1
          AND id = ANY($2::int[])`,
      [orgId, wantedIds],
    );
    for (const r of rows) {
      const key = directByNumericId.get(Number(r.id));
      if (key && !out.has(key)) out.set(key, Number(r.id));
    }
  }

  return out;
}

/**
 * Convenience: resolve a single artifact id to its canonical source id, or null.
 * Prefer the batch form above inside a retrieval loop — one query beats N.
 */
export async function resolveEvidenceSourceId(
  orgId: number,
  artifactId: string | null | undefined,
  exec: Queryable = defaultExec,
): Promise<number | null> {
  if (!artifactId) return null;
  const map = await resolveEvidenceSourceIdsByArtifact(orgId, [artifactId], exec);
  return map.get(artifactId) ?? null;
}
