/**
 * Module 3 composition and persistence for one project — the ONE path by
 * which a `cmc_module3_sections` row is written from canonical sources.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Three callers wrote sections: POST /compile (compose all, upsert with
 * lineage and a provenance event), POST /sections/:key/refresh (which took
 * `deterministicJson` FROM THE REQUEST BODY and wrote it verbatim — so a
 * caller could write `completeness: 100, missingInputs: []` and the approve
 * route and the export gate, which trust that record as the compiler's
 * verdict, would let an empty section through), and AnA's
 * module3_refresh_stale (its own UPDATE, no lineage rewrite, no provenance
 * event, no appendices). One composition, one persistence, three callers.
 *
 * A section's compiled record is only ever what the composer produced from
 * the project's own source objects. Nothing here reads a body.
 *
 * @module server/services/cmc/module3-compile
 */
import type { PoolClient } from 'pg';
import { createSourceHash } from '../cmc-module3-compiler';
import { composeModule3FromCanonicalSources, type CanonicalSource, type ComposedSection } from '../module3Composer';
import { composeAppendices, composeRegional, emittableAppendices } from '../module3-extensions';
import { regionCodeForPrimaryRegion, resolveSubmissionSpine } from './submission-spine';

/** A client that can run queries — a pg PoolClient, or anything shaped like one. */
export type Queryable = Pick<PoolClient, 'query'>;

export interface ProjectComposition {
  sources: CanonicalSource[];
  sections: ComposedSection[];
}

/** The project's canonical source objects, newest first. */
export async function loadCanonicalSources(client: Queryable, orgId: number, projectId: string): Promise<CanonicalSource[]> {
  const { rows } = await client.query(
    `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
     FROM cmc_source_objects
     WHERE organization_id = $1 AND project_id = $2
     ORDER BY updated_at DESC`,
    [orgId, projectId],
  );
  return rows as CanonicalSource[];
}

/**
 * Compose every Module 3 section for the project from its canonical sources:
 * the core §3.2.S/§3.2.P/3.1/3.3 rules, the emittable 3.2.A appendices, and
 * 3.2.R for the region the linked submission records.
 *
 * Returns no sections at all when the project has no sources: composing from
 * nothing yields seventeen bodies reading "no source data available", which a
 * caller must refuse rather than persist as not-stale.
 *
 * An appendix or regional pass that throws is SAID (warned) and skipped; the
 * core composition stands.
 */
export async function composeProjectModule3(
  client: Queryable,
  orgId: number,
  projectId: string,
): Promise<ProjectComposition> {
  const sources = await loadCanonicalSources(client, orgId, projectId);
  if (sources.length === 0) return { sources, sections: [] };

  let sections = composeModule3FromCanonicalSources(sources);

  /* An OPTIONAL appendix with no matched source is not emitted at all —
     composeAppendices scores an unmatched optional rule 100% complete, and
     emitting it would file a fully-complete section about data nobody
     recorded. A required appendix IS emitted, with its honest incompleteness. */
  try {
    sections = sections.concat(emittableAppendices(composeAppendices(sources)));
  } catch (appendixErr) {
    console.warn('[module3-compile] appendix (3.2.A) composition skipped:', appendixErr instanceof Error ? appendixErr.message : String(appendixErr));
  }

  /* 3.2.R for the region the linked submission records, resolved through the
     same spine identity the eCTD compile runs against. No spine, or a market
     with no generator → nothing composed: an honest gap beats a guessed
     region's regional form in a filing. */
  /* Inside the caller's transaction a failed statement aborts the whole
     transaction even when caught — so the regional read runs under a
     savepoint, and a failure rolls back to it rather than poisoning the
     section writes that follow. */
  await client.query('SAVEPOINT m3_regional');
  try {
    const prog = await client.query(
      `SELECT id, program_type AS "programType", product_name AS "productName", name, code
         FROM regulatory_programs
        WHERE id = $1 AND organization_id = $2`,
      [projectId, orgId],
    );
    const p = prog.rows[0] as
      | { id: string; programType: string | null; productName: string | null; name: string | null; code: string | null }
      | undefined;
    if (p) {
      const spine = await resolveSubmissionSpine(
        { programId: p.id, programType: p.programType, productName: p.productName, title: p.name, programCode: p.code },
        orgId,
      );
      const region = regionCodeForPrimaryRegion(spine?.primaryRegion);
      if (region) sections = sections.concat(composeRegional(sources, region));
    }
    await client.query('RELEASE SAVEPOINT m3_regional');
  } catch (regionalErr) {
    await client.query('ROLLBACK TO SAVEPOINT m3_regional').catch(() => undefined);
    console.warn('[module3-compile] regional (3.2.R) composition skipped:', regionalErr instanceof Error ? regionalErr.message : String(regionalErr));
  }

  return { sources, sections };
}

/** The record the section row stores: the structured payload plus the compiler's own verdict on it. */
export function compiledRecordOf(section: ComposedSection): Record<string, unknown> {
  return { ...section.structuredPayload, completeness: section.completeness, missingInputs: section.missingInputs };
}

export interface PersistOptions {
  actorId: string;
  /** 'compiled' keeps the section's approval state; 'refreshed' returns it to draft. */
  event: 'compiled' | 'refreshed';
  /** Extra provenance payload — a refresh records the diff against the prior record. */
  eventPayload?: Record<string, unknown>;
}

/**
 * Write one composed section: upsert the row, rewrite its lineage to the
 * sources it was composed from, and record the provenance event. Runs inside
 * the caller's transaction. Returns the section row id.
 *
 * A refresh returns the section to draft: its content changed, so any approval
 * it carried was over content that no longer exists.
 */
export async function persistComposedSection(
  client: Queryable,
  orgId: number,
  projectId: string,
  section: ComposedSection,
  opts: PersistOptions,
): Promise<string> {
  const resetApproval = opts.event === 'refreshed';
  const upsert = await client.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,null,'draft')
     ON CONFLICT (organization_id, project_id, section_key)
     DO UPDATE SET deterministic_json = excluded.deterministic_json,
                   compiled_hash = excluded.compiled_hash,
                   stale = false,
                   stale_reason = null,
                   narrative_text = excluded.narrative_text,
                   ${resetApproval ? "approval_state = 'draft', approved_version_id = null," : ''}
                   updated_at = now()
     RETURNING id`,
    [
      orgId,
      projectId,
      section.sectionKey,
      section.sectionPath,
      JSON.stringify(compiledRecordOf(section)),
      section.narrativeDraft,
      createSourceHash(section.structuredPayload),
    ],
  );
  const sectionId = String(upsert.rows[0]?.id ?? '');
  if (!sectionId) throw new Error(`Section ${section.sectionKey} was not written`);

  /* Lineage is rewritten to exactly the sources this composition read —
     scoped by org as well as id, because the id comes from RETURNING. */
  await client.query(`DELETE FROM cmc_section_lineage WHERE section_id = $1 AND organization_id = $2`, [sectionId, orgId]);
  for (const lin of section.lineage) {
    await client.query(
      `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile)
       VALUES ($1, $2, $3, $4)`,
      [orgId, sectionId, lin.sourceObjectId, lin.sourceHashAtCompile],
    );
  }
  await client.query(
    `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
     VALUES ($1,$2,'section',$3,$4,$5::jsonb,$6)`,
    [
      orgId,
      projectId,
      sectionId,
      opts.event,
      JSON.stringify({
        sectionKey: section.sectionKey,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        narrativeMechanism: 'deterministic_with_ai_optional',
        ...(opts.eventPayload ?? {}),
      }),
      opts.actorId,
    ],
  );
  return sectionId;
}
