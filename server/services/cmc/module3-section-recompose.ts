/**
 * Canonical Module 3 section recomposition + persistence.
 *
 * ONE implementation of "compose a §3.2 section from the project's canonical
 * source objects and write it down". Before this file the same compose+persist
 * body existed three times — the compile loop in
 * api/cmc/module3OperatingSystemRoutes.ts, POST /build-section in
 * api/cmc/module3ConvergenceRoutes.ts, and module3RefreshStale in
 * services/ana-ri/module3-command-handlers.ts — and a fourth "refresh" endpoint
 * that wrote CALLER-SUPPLIED JSON into deterministic_json without consulting
 * the sources at all. Three copies drifting is how a section's stored payload,
 * its narrative_text and its compiled_hash came to describe different content;
 * a fourth copy that skipped composition entirely is how client JSON reached a
 * 21 CFR Part 11 signed approval snapshot.
 *
 * Everything a caller can vary is a parameter (`eventType`,
 * `resetApprovalToDraft`, the extra provenance payload). Nothing about WHICH
 * bytes get written is.
 */

import {
  composeModule3FromCanonicalSources,
  type CanonicalSource,
  type ComposedSection,
} from '../module3Composer';
import { composeAppendices, composeRegional, emittableAppendices } from '../module3-extensions';
import { regionCodeForPrimaryRegion, resolveSubmissionSpine } from './submission-spine';
import { createSourceHash } from '../cmc-module3-compiler';

/**
 * The minimum surface this module needs from a `pg` Pool or PoolClient. Callers
 * inside a transaction pass their PoolClient; callers that do not need one pass
 * the pool itself.
 */
export interface Module3QueryRunner {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
}

/** The optional composition passes that run on top of the core S/P/3.1/3.3 set. */
export type ComposePass = 'appendices' | 'regional';

/** A pass that could not run, and why. Reported, never silently dropped. */
export interface ComposePassSkip {
  pass: ComposePass;
  reason: string;
}

export interface ComposeAllResult {
  sections: ComposedSection[];
  skipped: ComposePassSkip[];
}

/** Which optional pass emits this section key, or null for a core section. */
export function composePassForSectionKey(sectionKey: string): ComposePass | null {
  if (sectionKey === '3.2.A' || sectionKey.startsWith('3.2.A.')) return 'appendices';
  if (sectionKey === '3.2.R' || sectionKey.startsWith('3.2.R.')) return 'regional';
  return null;
}

/**
 * When a requested section key did not come back from composition, this says
 * whether the pass that WOULD have emitted it failed to run.
 *
 * The distinction is load-bearing: "3.2.R.1.US is not in the composition rules"
 * is a verdict about the user's dossier, while "the regional pass could not run"
 * is an error on our side. Rendering the second as the first tells an operator
 * their regional section does not apply when in fact we never looked.
 */
export function failedPassForSectionKey(
  sectionKey: string,
  skipped: ComposePassSkip[],
): ComposePassSkip | null {
  const pass = composePassForSectionKey(sectionKey);
  if (!pass) return null;
  return skipped.find((s) => s.pass === pass) ?? null;
}

/** One wording for "we could not compose this, and it is not your dossier's fault". */
export function composePassFailureMessage(sectionKey: string, skip: ComposePassSkip): string {
  const label = skip.pass === 'regional' ? 'regional (3.2.R)' : 'appendix (3.2.A)';
  return `Section ${sectionKey} could not be recomposed: the ${label} composition pass did not run — ${skip.reason}. This is a failure to compose, not a finding that the section does not apply.`;
}

/** Wording shared by every caller that refuses to compose from nothing. */
export const NO_CANONICAL_SOURCES_ERROR =
  'No canonical source objects for this project — nothing to compile.';
export const NO_CANONICAL_SOURCES_HINT =
  'Upsert source objects via POST /api/cmc/module3-os/source-objects/:projectId first.';

/**
 * Load the project's canonical source objects, newest first — the single input
 * to every composition below.
 */
export async function loadCanonicalSources(
  client: Module3QueryRunner,
  orgId: number,
  projectId: string,
): Promise<CanonicalSource[]> {
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
 * Compose the full Module 3 set the product actually emits: the core S/P/3.1/3.3
 * sections, the EMITTABLE 3.2.A appendices, and the 3.2.R regional sections for
 * the region the linked submission spine records.
 *
 * Appendices and regional composition are best-effort and SAID, not swallowed:
 * a skipped pass comes back in `skipped` with its reason, so a caller can tell
 * "this section does not apply" from "we could not look". This is the behaviour
 * the compile route has carried; every caller now inherits it, so `refresh` can
 * refresh the appendix and regional sections `compile` is able to create.
 *
 * `reader` MUST NOT be a caller's in-transaction client. The regulatory_programs
 * read below is best-effort, and in PostgreSQL a failed statement aborts the
 * surrounding transaction — the caller's next write would then fail with
 * "current transaction is aborted" and bury the real cause. Pass the pool; this
 * function only reads, and never writes.
 */
export async function composeAllSections(
  reader: Module3QueryRunner,
  orgId: number,
  projectId: string,
  sources: CanonicalSource[],
): Promise<ComposeAllResult> {
  let composed = composeModule3FromCanonicalSources(sources);
  const skipped: ComposePassSkip[] = [];

  try {
    composed = composed.concat(emittableAppendices(composeAppendices(sources)));
  } catch (appendixErr) {
    const reason = appendixErr instanceof Error ? appendixErr.message : String(appendixErr);
    skipped.push({ pass: 'appendices', reason });
    console.warn('[module3-recompose] appendix (3.2.A) composition skipped:', reason);
  }

  try {
    const prog = await reader.query(
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
      if (region) composed = composed.concat(composeRegional(sources, region));
    }
  } catch (regionalErr) {
    const reason = regionalErr instanceof Error ? regionalErr.message : String(regionalErr);
    skipped.push({ pass: 'regional', reason });
    console.warn('[module3-recompose] regional (3.2.R) composition skipped:', reason);
  }

  return { sections: composed, skipped };
}

/**
 * Recompose exactly one section from the project's canonical sources.
 *
 * `section` is null when the key did not come back from composition; `skipped`
 * says whether an optional pass failed, so the caller can tell "no such section"
 * from "we could not compose it". Composition runs over the SAME full set the
 * compile route emits, so 3.2.A and 3.2.R keys resolve here too.
 *
 * `reader` carries the same rule as composeAllSections: pass the pool, not the
 * caller's in-transaction client.
 */
export async function composeSingleSection(
  reader: Module3QueryRunner,
  orgId: number,
  projectId: string,
  sectionKey: string,
  sources: CanonicalSource[],
): Promise<{ section: ComposedSection | null; skipped: ComposePassSkip[] }> {
  const { sections, skipped } = await composeAllSections(reader, orgId, projectId, sources);
  return { section: sections.find((s) => s.sectionKey === sectionKey) ?? null, skipped };
}

/**
 * The deterministic_json bytes for a composed section — one definition.
 *
 * `tables` is part of the persisted shape because the composer's narrative
 * CITES its tables and `cmc_module3_sections` has no other column that could
 * hold them: without this the tables survived only inside the governed
 * artifact's rendered content, and IND placement — which reads this row —
 * filed a narrative pointing at tables that were nowhere in the document.
 * `compiled_hash` is still computed from `structuredPayload` alone (see the
 * upsert below), so adding them causes no hash drift and no staleness churn;
 * the Part 11 approval snapshot now freezes the tables along with the prose,
 * which is the behaviour a signed section is supposed to have.
 */
export function deterministicJsonFor(section: ComposedSection): Record<string, unknown> {
  return {
    ...section.structuredPayload,
    completeness: section.completeness,
    missingInputs: section.missingInputs,
    tables: section.tables ?? [],
  };
}

export interface PersistComposedSectionOptions {
  orgId: number;
  projectId: string;
  section: ComposedSection;
  actorId: string | number | null | undefined;
  /** Provenance event_type — 'compiled' for a build, 'refreshed' for a refresh. */
  eventType: 'compiled' | 'refreshed';
  /**
   * Whether the write resets approval_state to 'draft'.
   *
   * The compile and build-section paths deliberately do NOT: recompiling leaves
   * the row's approval state alone (a newly-inserted row is 'draft' anyway).
   * The refresh path and the stale-refresh command DO: replacing the content of
   * an approved section un-approves it, because the signature that was applied
   * was applied to the previous content.
   */
  resetApprovalToDraft: boolean;
  /** Merged into the provenance event payload alongside the standard fields. */
  eventPayloadExtra?: Record<string, unknown>;
}

/**
 * Write one composed section: deterministic_json + narrative_text +
 * compiled_hash together (they must never disagree), the org-scoped lineage
 * rewrite, and the provenance event. Returns the section id, or null when the
 * upsert returned no row.
 *
 * Run this inside a transaction whenever the caller has one — the three writes
 * are one fact about the section.
 */
export async function persistComposedSection(
  client: Module3QueryRunner,
  opts: PersistComposedSectionOptions,
): Promise<string | null> {
  const { orgId, projectId, section, actorId, eventType, resetApprovalToDraft } = opts;

  const upsert = await client.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,null,'draft')
     ON CONFLICT (organization_id, project_id, section_key)
     DO UPDATE SET deterministic_json = excluded.deterministic_json,
                   compiled_hash = excluded.compiled_hash,
                   stale = excluded.stale,
                   stale_reason = excluded.stale_reason,
                   narrative_text = excluded.narrative_text,
                   ${resetApprovalToDraft ? "approval_state = 'draft'," : ''}
                   updated_at = now()
     RETURNING id`,
    [
      orgId,
      projectId,
      section.sectionKey,
      section.sectionPath,
      JSON.stringify(deterministicJsonFor(section)),
      section.narrativeDraft,
      createSourceHash(section.structuredPayload),
    ],
  );
  const sectionId = upsert.rows[0]?.id ?? null;
  if (!sectionId) return null;

  /* Scoped by org as well as section id. `sectionId` comes from the upsert's
     RETURNING, so before the arbiter carried organization_id this deleted the
     VICTIM's lineage rows — the traceability tying each Module 3 section back
     to the source objects it was compiled from. The scoping is not optional. */
  await client.query(
    `DELETE FROM cmc_section_lineage WHERE section_id = $1 AND organization_id = $2`,
    [sectionId, orgId],
  );
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
      eventType,
      JSON.stringify({
        sectionKey: section.sectionKey,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        narrativeMechanism: 'deterministic_with_ai_optional',
        ...(opts.eventPayloadExtra ?? {}),
      }),
      actorId ?? 'system',
    ],
  );

  return String(sectionId);
}
