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
import {
  applicationNotReadable,
  applicationRefusal,
  CompositionOutOfScopeError,
  compositionRefusal,
  programNotRecorded,
  type CompositionRefusal,
} from './composition-scope';
import { getPool } from '../../db';

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
 * The 3.2.R region this project composes for, or null.
 *
 * ONE reader, because two callers need the same answer and a second
 * implementation would let them disagree about which regional sections exist:
 * the compile (which composes and persists them) and the build board (which
 * has to list, score and offer for approval exactly what the compile wrote).
 * The board used to enumerate core rules and appendices only, so a persisted
 * 3.2.R.1.<region> row appeared on no surface while the export gate counted
 * it — the board could report 100% ready against a gate that refuses.
 *
 * Null is a real answer: no linked submission spine, or a market with no
 * generator. An honest gap beats a guessed region's regional form in a filing.
 */
/**
 * The region the linked submission records, and what it files. The
 * application type decides which regional section is written: an IND's US
 * 3.2.R is 21 CFR 312.23(a)(7)'s, not a marketing application's
 * (services/cmc/us-ind-regional.ts).
 */
const LEGACY_NUMERIC_PROJECT = /^\d+$/;

export async function resolveProjectRegional(
  client: Queryable,
  orgId: number,
  projectId: string,
): Promise<{
  region: 'US' | 'EU' | 'JP' | 'CA' | null;
  /** What the linked submission files, or null when there is no spine. */
  applicationType: string | null;
  /** The program's own declared type, which is NOT NULL on a readable row. */
  programType: string | null;
  /** The product class the person recorded on the program (P-21). */
  productType: string | null;
}> {
  /* A legacy numeric project (a projects.id, from before programs; recognised
     as place-module3-into-submission's isOtherProject does) has no program
     row, and asking regulatory_programs — a uuid column — for one raised a
     cast error, which a caller holding a transaction then had to recover
     from. Not a program: nothing is read. */
  if (LEGACY_NUMERIC_PROJECT.test(String(projectId).trim())) {
    return { region: null, applicationType: null, programType: null, productType: null };
  }
  const prog = await client.query(
    `SELECT id, program_type AS "programType", product_type AS "productType",
            product_name AS "productName", name, code
       FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2`,
    [projectId, orgId],
  );
  const p = prog.rows[0] as
    | {
        id: string;
        programType: string | null;
        productType: string | null;
        productName: string | null;
        name: string | null;
        code: string | null;
      }
    | undefined;
  if (!p) return { region: null, applicationType: null, programType: null, productType: null };
  /* Run the spine reads on the CALLER'S connection. This function is reached
     from composeProjectModule3, which the compile route calls with an open
     transaction — taking a second pooled connection here is what stalled that
     transaction under a saturated pool.

     Under a savepoint, because resolveSubmissionSpine swallows its own lookup
     failures and returns "no spine" — so a statement of its own that fails
     (an absent table, a timeout) leaves the caller's transaction aborted while
     reporting nothing. The program's own fields are already read above and
     stand either way: the spine is consulted for the REGION, and it can never
     disagree about the application type, since findProgramSubmission only ever
     matches a submission whose application_type equals the program's
     program_type. */
  await client.query('SAVEPOINT m3_spine');
  let spine: Awaited<ReturnType<typeof resolveSubmissionSpine>> = null;
  try {
    spine = await resolveSubmissionSpine(
      { programId: p.id, programType: p.programType, productName: p.productName, title: p.name, programCode: p.code },
      orgId,
      client,
    );
    await client.query('RELEASE SAVEPOINT m3_spine');
  } catch (spineErr) {
    await client.query('ROLLBACK TO SAVEPOINT m3_spine').catch(() => undefined);
    console.warn(
      '[module3-compile] submission spine read failed; no 3.2.R region resolved:',
      spineErr instanceof Error ? spineErr.message : String(spineErr),
    );
  }
  return {
    region: regionCodeForPrimaryRegion(spine?.primaryRegion),
    applicationType: spine?.applicationType ?? null,
    /* Reported alongside the spine's, because a program need only have no
       `submissions` row yet for the spine to resolve null — and the program's
       own declared type is what the composition boundary then judges
       (composition-scope.ts). */
    programType: p.programType,
    productType: p.productType,
  };
}

/**
 * The composition boundary, judged for one program — ONE decision for every
 * CMC entry point that states regulatory content.
 *
 * `compositionRefusal` is the rule; this is how a program is put to it: its
 * canonical sources, then the submission spine under a savepoint (a failed
 * statement aborts the caller's transaction even when caught), then the rule.
 * A spine that cannot be read is a refusal, not a shrug: it is what says this
 * program files an IND and not an NDA.
 *
 * Compose is not the only place small-molecule reasoning reaches a filing. The
 * QbD analysis, the ICH compliance verdict, the control strategy, the Q1E
 * shelf life and batch poolability, and the build board all state CMC content
 * or figures for a program; each asks this before it computes anything
 * (2026-10-22, docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/).
 *
 * Runs on the caller's client, which must hold an open transaction (the
 * savepoint needs one). A caller without one uses
 * `assessProgramCompositionScope`.
 */
export async function programCompositionRefusal(
  client: Queryable,
  orgId: number,
  projectId: string,
): Promise<CompositionRefusal | null> {
  return (await judgeProgramComposition(client, orgId, projectId)).refusal;
}

/**
 * The boundary's verdict and the regional facts it was judged on. Compose
 * needs both (3.2.R is written for the region the spine resolved); every
 * other caller needs only the verdict, through `programCompositionRefusal`.
 */
async function judgeProgramComposition(
  client: Queryable,
  orgId: number,
  projectId: string,
  knownSources?: CanonicalSource[],
): Promise<{ refusal: CompositionRefusal | null; regional: Awaited<ReturnType<typeof resolveProjectRegional>> | null }> {
  const sources = knownSources ?? (await loadCanonicalSources(client, orgId, projectId));
  await client.query('SAVEPOINT m3_scope');
  let regional: Awaited<ReturnType<typeof resolveProjectRegional>>;
  try {
    regional = await resolveProjectRegional(client, orgId, projectId);
    await client.query('RELEASE SAVEPOINT m3_scope');
  } catch (spineErr) {
    await client.query('ROLLBACK TO SAVEPOINT m3_scope').catch(() => undefined);
    const detail = spineErr instanceof Error ? spineErr.message : String(spineErr);
    console.warn('[module3-compile] submission spine unreadable; refused at the composition boundary:', detail);
    return { refusal: applicationNotReadable(), regional: null };
  }
  /* No program row: program_type is NOT NULL, so a null one means the
     project is not a program at all — a settled answer, not a failed read. */
  if (regional.programType === null) return { refusal: programNotRecorded(), regional };
  /* The program's own declared type, not the spine's: the spine can only
     carry the same one (see resolveProjectRegional), and reaching for it would
     make a failed spine read look like an unknown application. */
  return { refusal: compositionRefusal(sources, regional.programType, regional.productType), regional };
}

/** A pool that lends a connection: pg's Pool, or a test's stand-in for one. */
export interface ConnectionSource {
  connect(): Promise<Queryable & { release(): void }>;
}

/**
 * One pooled connection, one read-only transaction, released whatever happens
 * — for a reader that holds no transaction of its own.
 *
 * The compose path and the boundary read the spine under a savepoint, and
 * Postgres refuses `SAVEPOINT` outside a transaction block. Handed a bare pool,
 * they failed on the first statement: the build board's 3.2.R enumeration was
 * skipped on every call, and AnA's 2.3 Quality Overall Summary answered "could
 * not be read" for every program (found 2026-10-22; the PGlite tests in
 * composition-boundary-readers.pglite.test.ts run them on a real engine). The
 * connection is tenant-scoped by poolInstrumentation, as the compile route's is.
 */
export async function inReadOnlyTransaction<T>(
  work: (client: Queryable) => Promise<T>,
  pool: ConnectionSource = getPool() as unknown as ConnectionSource,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** `programCompositionRefusal` for a caller holding no transaction. */
export async function assessProgramCompositionScope(
  orgId: number,
  projectId: string,
): Promise<CompositionRefusal | null> {
  return inReadOnlyTransaction((client) => programCompositionRefusal(client, orgId, projectId));
}

/** The regional facts of a program the boundary admits; its refusal, thrown, otherwise. */
function admitted(judged: Awaited<ReturnType<typeof judgeProgramComposition>>) {
  if (judged.refusal || !judged.regional) {
    throw new CompositionOutOfScopeError(judged.refusal ?? applicationNotReadable());
  }
  return judged.regional;
}

/**
 * The boundary for a reader holding no transaction that must also enumerate
 * the 3.2.R sections compose writes — the build board. Judged on the sources
 * the caller already read, which must be in compose's order (newest first:
 * the newest drug substance is the one judged); returns the regional facts
 * compose would write 3.2.R for, or throws the refusal compose would.
 *
 * One difference, on purpose. A program with NO CMC records yet is admitted
 * past "modality not established": nothing is recorded, so nothing is
 * established, and the board is where the first record is made. Its declared
 * product class and its application are still judged, so a biologic program
 * or one filing an NDA, an MAA or an EU CTA is refused before anything is
 * recorded. (Compose has nothing to compose for it either way.)
 *
 * The class is judged by `compositionRefusal` itself, which asks it first. The
 * application is judged here, by `applicationRefusal`, because
 * `compositionRefusal` answers "modality not established" before it reaches
 * the application. Until 2026-10-29 this branch asked nothing more, so an
 * NDA or CTA program with nothing recorded got an empty, admitted board, and
 * the task assessment that reads the board would have told it to record its
 * drug substance (P-62, docs/evidence/CMC-M3-GA/2026-10-29/p62-one-cmc-home/).
 */
export async function admitProgramComposition(
  orgId: number,
  projectId: string,
  knownSources: CanonicalSource[],
): Promise<Awaited<ReturnType<typeof resolveProjectRegional>>> {
  return inReadOnlyTransaction(async (client) => {
    const judged = await judgeProgramComposition(client, orgId, projectId, knownSources);
    const nothingRecordedYet =
      knownSources.length === 0 && judged.refusal?.code === 'CMC_MODALITY_NOT_ESTABLISHED' && judged.regional;
    if (!nothingRecordedYet) return admitted(judged);
    const application = applicationRefusal(judged.regional!.programType);
    if (application) throw new CompositionOutOfScopeError(application);
    return judged.regional!;
  });
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

  /* ── The composition boundary, BEFORE anything is composed ───────────────
     What this platform composes is small-molecule Module 3 for a US IND
     (composition-scope.ts). The spine read has to happen first, because it is
     what establishes the application type the boundary judges — and a failed
     statement aborts the caller's transaction even when caught, so it runs
     under its own savepoint. A spine that cannot be read is a refusal, not a
     shrug: it is what says this program files an IND and not an NDA. */
  const regional = admitted(await judgeProgramComposition(client, orgId, projectId, sources));

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
  /* The spine was already resolved for the boundary above, so the region is
     not read twice. A composeRegional that throws is still SAID and skipped;
     the core composition stands. */
  try {
    if (regional.region) {
      sections = sections.concat(
        composeRegional(sources, regional.region, { applicationType: regional.applicationType }),
      );
    }
  } catch (regionalErr) {
    console.warn('[module3-compile] regional (3.2.R) composition skipped:', regionalErr instanceof Error ? regionalErr.message : String(regionalErr));
  }

  return { sources, sections };
}

/**
 * The record the section row stores: the structured payload, the composed
 * TABLES, and the compiler's own verdict on both.
 *
 * The tables are part of the deterministic content of a section — §3.2.S.4.4's
 * capability indices and §3.2.P.1's composition are tables, not prose — and
 * they were not written. Placement reads them back out of this record and
 * refuses a section whose row has no `tables` key, because it cannot tell a
 * section that composes none from one compiled before they were carried; with
 * no writer, that refusal caught every section and nothing could be filed. One
 * writer, and the legacy case now means what it says.
 */
export function compiledRecordOf(section: ComposedSection): Record<string, unknown> {
  return {
    ...section.structuredPayload,
    tables: section.tables ?? [],
    completeness: section.completeness,
    missingInputs: section.missingInputs,
  };
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
  /* An approval is a signature over CONTENT. The approve route binds a §11
     signature to a sha256 of the section's deterministic_json at the moment it
     was signed; a compile that replaces that content leaves the signature
     bound to a record that no longer exists, and this upsert kept
     approval_state = 'approved' and forced stale = false while doing it — so
     re-running a build over an approved Module 3 produced a section that read
     as approved-and-current, passed the export gate, and would have been FILED
     as signed content nobody signed.
     So: a compile that CHANGES the section returns it to draft, exactly as a
     refresh does, and one that changes nothing leaves the approval alone. The
     comparison is on the stored record and narrative rather than
     compiled_hash, which is a hash of the structured payload only and would
     miss a narrative that changed under it. */
  const upsert = await client.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,null,'draft')
     ON CONFLICT (organization_id, project_id, section_key)
     DO UPDATE SET deterministic_json = excluded.deterministic_json,
                   compiled_hash = excluded.compiled_hash,
                   stale = false,
                   stale_reason = null,
                   narrative_text = excluded.narrative_text,
                   ${resetApproval
                     ? "approval_state = 'draft', approved_version_id = null,"
                     : `approval_state = CASE
                            WHEN cmc_module3_sections.deterministic_json IS DISTINCT FROM excluded.deterministic_json
                              OR cmc_module3_sections.narrative_text IS DISTINCT FROM excluded.narrative_text
                            THEN 'draft' ELSE cmc_module3_sections.approval_state END,
                        approved_version_id = CASE
                            WHEN cmc_module3_sections.deterministic_json IS DISTINCT FROM excluded.deterministic_json
                              OR cmc_module3_sections.narrative_text IS DISTINCT FROM excluded.narrative_text
                            THEN NULL ELSE cmc_module3_sections.approved_version_id END,`}
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
