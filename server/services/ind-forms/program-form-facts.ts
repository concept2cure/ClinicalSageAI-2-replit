/**
 * Existing IND forms program-facts reader and governed writer, extracted from
 * ind-forms.routes.ts so its reached route remains within the repository's
 * unchanged file ceiling. One record/reader for forms and program receipts.
 */
import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { db, pool } from '../../db';
import { organizations } from '@shared/schema';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { sponsors as indSponsors } from '../../../shared/schema/ind-master-data';
import { sponsorRevisionExpression, type SponsorWithRevision } from '../ind-master-data/ind-master-data-service';
import { writeChainedAuditRow } from '../auditService';
import { ProgramRecordWriteRefusal, requireGovernedProgramWriteTx } from '../c2c/governed-program-write';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { FDA_APPLICATION_NUMBER_PATTERN, usableIdentifier } from '../ectd/regulatory-identifiers';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ind-program-facts');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The open program's recorded Module 1 facts and explicit applicant registry
 * binding. Unbound legacy forms retain the organization name; an unavailable
 * explicit binding never falls back to a different applicant.
 */
export interface ResolvedProgram {
  id: string;
  code: string | null;
  name: string | null;
  productName: string | null;
  indication: string | null;
  applicationNumber: string | null;
  programType: string | null;
  primaryAgency: string | null;
  sponsorName: string | null;
  applicantSponsorId: string | null;
  boundSponsor: SponsorWithRevision | null;
  /** Exact opaque UTC timestamp, including PostgreSQL microseconds. */
  factsVersion: string;
  /** regulatory_programs.sponsor_address / ind_type (20261008b): the 1571's
   *  address and IND type, stored on the program (P-20 follow-up). */
  sponsorAddress: string | null;
  indType: string | null;
}

/**
 * Resolve a program-spine ident (regulatory_programs UUID or program code),
 * org-scoped. Null when nothing in the caller's organization matches; failed
 * reads are explicit errors, never an unbound or fabricated program.
 *
 * Selects the FORM FACTS as well as the identity: recorded applicant,
 * product, indication and the agency-assigned application number. Those four are
 * held once, on the program record, and every Module 1 form takes them from
 * there — which is what stops a filing's sponsor name depending on who typed it
 * into which panel.
 */
export async function resolveProgramIdent(
  ident: string,
  organizationId: number,
  database: Pick<typeof db, 'select'> = db,
  forUpdate = false,
): Promise<ResolvedProgram | null> {
  const byUuid = UUID_RE.test(ident);
  try {
    const query = database
      .select({
        id: regulatoryPrograms.id,
        code: regulatoryPrograms.code,
        name: regulatoryPrograms.name,
        productName: regulatoryPrograms.productName,
        indication: regulatoryPrograms.indication,
        applicationNumber: regulatoryPrograms.applicationNumber,
        programType: regulatoryPrograms.programType,
        primaryAgency: regulatoryPrograms.primaryAgency,
        sponsorName: organizations.name,
        applicantSponsorId: regulatoryPrograms.applicantSponsorId,
        factsVersion: sql<string>`to_char(${regulatoryPrograms.updatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        boundSponsor: {
          ...getTableColumns(indSponsors),
          revision: sponsorRevisionExpression,
        },
        sponsorAddress: regulatoryPrograms.sponsorAddress,
        indType: regulatoryPrograms.indType,
      })
      .from(regulatoryPrograms)
      .leftJoin(organizations, eq(organizations.id, regulatoryPrograms.organizationId))
      .leftJoin(indSponsors, and(eq(indSponsors.id, regulatoryPrograms.applicantSponsorId), eq(indSponsors.organizationId, regulatoryPrograms.organizationId)))
      .where(
        and(
          byUuid ? eq(regulatoryPrograms.id, ident) : eq(regulatoryPrograms.code, ident),
          eq(regulatoryPrograms.organizationId, organizationId),
          isNull(regulatoryPrograms.deletedAt),
        ),
      )
      .limit(1);
    // The governed writer uses this same full-facts reader for its row lock.
    // Lock only the program, never the nullable sides of its outer joins.
    const [row] = await (forUpdate ? query.for('update', { of: regulatoryPrograms }) : query);
    if (!row) return null;
    return {
      ...row,
      // An explicit binding is authoritative. A dangling/foreign binding must
      // never become a different organization-named applicant by fallback.
      sponsorName: row.applicantSponsorId ? row.boundSponsor?.name ?? null : row.sponsorName,
    };
  } catch (error) {
    logger.error('program facts read failed', { err: error instanceof Error ? error.message : String(error) });
    throw new ProgramFactsWriteRefusal('PROGRAM_FACTS_UNAVAILABLE', 503, 'The recorded program facts could not be read. Reload them before generating a form or recording another change.');
  }
}

/** A clearable text from a request body: undefined = not sent (unchanged);
 *  null or blank = cleared; otherwise the trimmed text. */
function clearableText(v: unknown): string | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return t === '' ? null : t;
}

const SPONSOR_ADDRESS_MAX = 1000;

/** Existing recorded program form facts, including the explicit registry link.
 * Full-precision factsVersion is opaque to clients; it is never a JS Date. */
type ProgramFactsPatch = {
  sponsorAddress?: string | null;
  indType?: string | null;
  applicationNumber?: string | null;
  applicantSponsorId?: string | null;
};
function patchRefusal(patch: ProgramFactsPatch, indTypes: string[]): string | null {
  if (typeof patch.sponsorAddress === 'string' && patch.sponsorAddress.length > SPONSOR_ADDRESS_MAX) {
    return `The sponsor address is longer than ${SPONSOR_ADDRESS_MAX} characters.`;
  }
  if (typeof patch.indType === 'string' && !indTypes.includes(patch.indType)) {
    return `IND type must be one of ${indTypes.join(', ')}.`;
  }
  if (typeof patch.applicationNumber === 'string' && !usableIdentifier('applicationNumber', patch.applicationNumber)) {
    return 'The agency application number is not a usable regulatory identifier.';
  }
  if (typeof patch.applicantSponsorId === 'string' && !UUID_RE.test(patch.applicantSponsorId)) {
    return 'applicantSponsorId must identify an existing sponsor UUID, or null to clear the binding.';
  }
  return null;
}

function parseProgramFacts(
  body: Record<string, unknown>,
  indTypes: string[],
): { ident: string; patch: ProgramFactsPatch; reason: string; expectedFactsVersion: string } | { refusal: string } {
  const ident = typeof body.projectIdent === 'string' ? body.projectIdent.trim() : '';
  if (ident === '' || /^\d+$/.test(ident)) {
    return { refusal: 'projectIdent (the program UUID or code) is required: these facts are recorded on a program.' };
  }
  const patch: ProgramFactsPatch = {};
  const fields = ['sponsorAddress', 'indType', 'applicationNumber', 'applicantSponsorId'] as const;
  for (const key of fields) {
    const value = clearableText(body[key]);
    if (value === false) return { refusal: `${key} is text, or null to clear.` };
    if (value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { refusal: 'State a program fact to record.' };
  const refusal = patchRefusal(patch, indTypes);
  if (refusal) return { refusal };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 8 || reason.length > 2000) return { refusal: 'State a reason for the change (8–2000 characters).' };
  const expectedFactsVersion = typeof body.expectedFactsVersion === 'string' ? body.expectedFactsVersion : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(expectedFactsVersion)) {
    return { refusal: 'Reload the recorded program facts and provide their exact expectedFactsVersion.' };
  }
  return { ident, patch, reason, expectedFactsVersion };
}

export class ProgramFactsWriteRefusal extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}

/** The persisted identity/form facts in both a read and write receipt. */
function programFactsReceipt(program: ResolvedProgram) {
  return {
    programId: program.id,
    applicationNumber: program.applicationNumber,
    applicantSponsorId: program.applicantSponsorId,
    sponsorAddress: program.sponsorAddress,
    indType: program.indType,
    sponsorName: program.sponsorName,
    boundSponsor: program.boundSponsor,
    factsVersion: program.factsVersion,
  };
}

async function validateAndLockSponsor(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  program: ResolvedProgram, patch: ProgramFactsPatch, organizationId: number,
): Promise<void> {
  if (typeof patch.indType === 'string' && (program.programType ?? '').trim().toUpperCase() !== 'IND') {
    throw new ProgramFactsWriteRefusal('VALIDATION', 400, `An IND type is recorded only on an IND program; this program is ${program.programType ?? 'of no recorded type'}.`);
  }
  if (typeof patch.applicationNumber === 'string' && (program.primaryAgency ?? '').trim().toUpperCase() === 'FDA' && !FDA_APPLICATION_NUMBER_PATTERN.test(patch.applicationNumber)) {
    throw new ProgramFactsWriteRefusal('VALIDATION', 400, 'FDA application numbers are the six digits FDA assigned, including leading zeros and without an IND/NDA/BLA prefix.');
  }
  const nextSponsorId = patch.applicantSponsorId === undefined ? program.applicantSponsorId : patch.applicantSponsorId;
  if (nextSponsorId) {
    const selected = await client.query('SELECT id FROM ind_sponsors WHERE id=$1 AND organization_id=$2 FOR SHARE', [nextSponsorId, organizationId]);
    if (selected.rows.length !== 1) throw new ProgramFactsWriteRefusal('NOT_FOUND', 404, 'Applicant sponsor not found for this organization. Nothing was written.');
  }
}

async function updateProgramFacts(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  program: ResolvedProgram, patch: ProgramFactsPatch, organizationId: number,
): Promise<void> {
  await client.query(
    `UPDATE regulatory_programs SET
       sponsor_address=CASE WHEN $3::boolean THEN $4::text ELSE sponsor_address END,
       ind_type=CASE WHEN $5::boolean THEN $6::text ELSE ind_type END,
       application_number=CASE WHEN $7::boolean THEN $8::text ELSE application_number END,
       applicant_sponsor_id=CASE WHEN $9::boolean THEN $10::uuid ELSE applicant_sponsor_id END,
       updated_at=GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
     WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
    [program.id, organizationId,
      patch.sponsorAddress !== undefined, patch.sponsorAddress ?? null,
      patch.indType !== undefined, patch.indType ?? null,
      patch.applicationNumber !== undefined, patch.applicationNumber ?? null,
      patch.applicantSponsorId !== undefined, patch.applicantSponsorId ?? null],
  );
}

export async function recordProgramFormFacts(
  body: Record<string, unknown>,
  ctx: { organizationId: number; userId: number },
  indTypes: string[],
) {
  const parsed = parseProgramFacts(body, indTypes);
  if ('refusal' in parsed) throw new ProgramFactsWriteRefusal('VALIDATION', 400, parsed.refusal);
  const { ident, patch, reason, expectedFactsVersion } = parsed;
  let client: PoolClient | undefined;
  let commitStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const database = drizzle(client);
    // Acquire the program write lock through its existing facts reader before
    // the authority helper's share lock and the selected sponsor's share lock.
    const resolved = await resolveProgramIdent(ident, ctx.organizationId, database, true);
    if (!resolved) throw new ProgramFactsWriteRefusal('NOT_FOUND', 404, 'Project not found for this organization.');
    await requireGovernedProgramWriteTx(client, ctx.organizationId, ctx.userId, resolved.id);
    const program = await resolveProgramIdent(resolved.id, ctx.organizationId, database);
    if (!program) throw new ProgramFactsWriteRefusal('NOT_FOUND', 404, 'Project not found for this organization.');
    if (program.factsVersion !== expectedFactsVersion) {
      throw new ProgramFactsWriteRefusal('PROGRAM_FACTS_CONFLICT', 409, 'The recorded program facts changed. Reload them before saving another change. Nothing was written.');
    }
    await validateAndLockSponsor(client, program, patch, ctx.organizationId);
    await updateProgramFacts(client, program, patch, ctx.organizationId);
    const next = await resolveProgramIdent(program.id, ctx.organizationId, database);
    if (!next) throw new Error('Program facts could not be read after their update');
    await writeChainedAuditRow(client, {
      action: 'ind_form.program_facts.update', userId: ctx.userId, organizationId: ctx.organizationId,
      resourceType: 'regulatory_program', resourceId: program.id, reason,
      details: { reason, programCode: program.code, fields: Object.keys(patch),
        before: programFactsReceipt(program), after: programFactsReceipt(next) },
    });
    commitStarted = true;
    await client.query('COMMIT');
    return { ...programFactsReceipt(next), auditTrail: { persisted: true as const, chained: true as const } };
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* preserve the original refusal */ }
    }
    if (err instanceof ProgramFactsWriteRefusal || err instanceof ProgramRecordWriteRefusal) {
      throw err;
    }
    logger.error('program facts transaction failed', { err: err instanceof Error ? err.message : String(err), commitStarted });
    throw new ProgramFactsWriteRefusal(
      commitStarted ? 'PROGRAM_FACTS_UNCONFIRMED' : 'PROGRAM_FACTS_UNAVAILABLE',
      503,
      commitStarted
        ? 'The program change could not be confirmed. Reload its recorded facts and audit history before retrying.'
        : 'The program facts and their audit entry could not be recorded. Nothing was written.',
    );
  } finally {
    client?.release();
  }
}
