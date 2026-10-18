/**
 * Add a market to a project (docs/design/FILING_SPINE.md F22).
 *
 * A project is one filing in its home market. A global team files the same
 * product elsewhere: an NDA project files an MAA with EMA. The market is the
 * agency's own regional modules, so adding it writes, in the caller's
 * transaction and nothing else:
 *   - a governed document, `filing_scope = 'market'`, holding only that
 *     market's Module 1 subtree and 3.2.R from the market's own rule pack, with
 *     their ancestors as containers (insert-only, like the home scaffold, so
 *     the Part 11 BEFORE UPDATE trigger never fires). The common modules stay
 *     the home document's;
 *   - the market on `regulatory_programs.target_agencies`;
 *   - the submission for the market, anchored to the project
 *     (ensureSubmissionSpine, the intake's own path);
 *   - the governed action, with the person's stated reason.
 *
 * Refused by name, before anything is written:
 *   - a device or IVD program (a device filing is not eCTD; F19);
 *   - a market the platform does not offer for the application type (the
 *     server's market statement: a UK IND, a market with no channel and no
 *     outline);
 *   - an application type with no governed document class;
 *   - a market with no rule pack of its own. Module 1 is regional, so the
 *     harmonised fallback the home scaffold may use is not taken here;
 *   - a market already on the project (409).
 *
 * @module server/services/c2c/add-project-market
 */
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { recordGovernedAction } from '../../routes/c2c/actions.js';
import { ensureSubmissionSpine } from '../../routes/c2c/project-intake.js';
import { resolveDocumentClass, describeUnmappedClass } from './document-class.js';
import { filingDocumentClassOf } from '../../../shared/regulatory/filing-document-classes.js';
import { findActiveRulePack } from './rule-pack-lookup.js';
import { readMarketSupport, documentAgencyFor } from '../regulatory/market-support.js';
import { regionalSubtree, type PackSectionLike } from '../../../shared/regulatory/filing-scope.js';
import { DEVICE_FAMILY_PRODUCT_TYPES } from '../../../shared/constants/domain/product-types.js';

export type AddMarketRefusalCode =
  | 'PROJECT_NOT_FOUND' | 'DEVICE_PROGRAM' | 'MARKET_NOT_OFFERED' | 'UNMAPPED_PROGRAM_TYPE'
  | 'NO_RULE_PACK' | 'MARKET_EXISTS' | 'NO_HOME_FILING' | 'NOT_AN_APPLICATION';

export class AddMarketRefusal extends Error {
  constructor(readonly status: 404 | 409 | 422, readonly code: AddMarketRefusalCode, message: string) {
    super(message);
    this.name = 'AddMarketRefusal';
  }
}

type PackSection = PackSectionLike;

/** The market's own part of a pack (the shared rule, shared/regulatory/filing-scope.ts). */
export function marketSubtree(sections: unknown): PackSection[] {
  return regionalSubtree<PackSection>(sections);
}

export interface AddMarketInput {
  client: PoolClient;
  orgId: number;
  userId: number;
  programId: string;
  /** As the market statement takes it: an agency ('EMA', 'PMDA') or a region. */
  agency: string;
  applicationType: string;
  /** The person's stated reason, already checked by the route. */
  reason: string;
  /** The submission's title, as the person named it; else the project's name and the market. */
  title?: string;
  /** The submission's client type, as the person chose it; else the product type's. */
  clientType?: string;
}

export interface AddMarketResult {
  documentId: string;
  sectionCount: number;
  submissionId: number;
  agency: string;
}

interface ProgramRow {
  name: string; product_name: string | null; product_type: string | null; primary_agency: string | null;
  target_agencies: unknown; program_type: string | null;
}

async function readProgram(client: PoolClient, programId: string, orgId: number): Promise<ProgramRow> {
  const { rows } = await client.query(
    `SELECT name, product_name, product_type, primary_agency, target_agencies, program_type
       FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [programId, orgId],
  );
  if (!rows[0]) throw new AddMarketRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return rows[0] as ProgramRow;
}

/** The market's class, pack and agency key, or the refusal that names what is missing. */
async function resolveMarket(client: PoolClient, input: AddMarketInput, program: ProgramRow) {
  if (DEVICE_FAMILY_PRODUCT_TYPES.includes((program.product_type ?? '') as never)) {
    throw new AddMarketRefusal(422, 'DEVICE_PROGRAM',
      'A device or diagnostic project files on its own pathway, not as an eCTD market. Nothing was added.');
  }
  // A filing document class (a supplement, a CSR, a meeting package) is
  // authored, never sequenced here: adding a "market" to one, or an
  // application market to a project that is one, would write the submission
  // spine its creation deliberately does not (2026-10-18). The project's own
  // class is read too: a PAS project asked for an NDA market was given an NDA
  // document and an NDA submission (review finding, 2026-10-18).
  const documentClass = filingDocumentClassOf(input.applicationType) ?? filingDocumentClassOf(program.program_type);
  if (documentClass) {
    throw new AddMarketRefusal(422, 'NOT_AN_APPLICATION',
      `This project's filing is a document (${documentClass.label}), not an application, so no market or submission is added to it. Nothing was added.`);
  }
  const marketInput = { applicationType: input.applicationType, market: input.agency };
  const [statement] = await readMarketSupport(client, [marketInput]);
  if (!statement?.offered) {
    throw new AddMarketRefusal(422, 'MARKET_NOT_OFFERED', `${statement?.line ?? 'This market is not offered.'} Nothing was added.`);
  }
  const documentAgency = documentAgencyFor(marketInput) ?? input.agency;
  const klass = resolveDocumentClass(input.applicationType, documentAgency);
  if (!klass) {
    throw new AddMarketRefusal(422, 'UNMAPPED_PROGRAM_TYPE',
      `${describeUnmappedClass(input.applicationType, documentAgency)} Nothing was added.`);
  }
  const pack = await findActiveRulePack(client, klass.docType, klass.agency);
  if (!pack) {
    throw new AddMarketRefusal(422, 'NO_RULE_PACK',
      `No rule pack defines the ${input.applicationType.toUpperCase()} regional modules for ${documentAgency}. Nothing was added.`);
  }
  return { klass, pack, documentAgency };
}

/**
 * The governed document this market already has, if any: the project's own
 * filing (its home market) or an added market's. A market whose submission
 * exists, or that is already an added market, is refused (409). The home
 * market without its submission (a project from before intake wrote one) gets
 * the submission only: its document is the filing itself.
 */
async function existingDocument(client: PoolClient, input: AddMarketInput, klass: { docType: string; agency: string }) {
  const sub = await client.query(
    `SELECT 1 FROM submissions WHERE program_id = $1 AND organization_id = $2 AND lower(application_type) = $3 AND deleted_at IS NULL LIMIT 1`,
    [input.programId, input.orgId, input.applicationType.toLowerCase()],
  );
  const doc = await client.query(
    `SELECT id, filing_scope FROM c2c_documents WHERE project_id = $1 AND org_id = $2 AND doc_type = $3 AND agency = $4
      ORDER BY created_at LIMIT 1`,
    [input.programId, input.orgId, klass.docType, klass.agency],
  );
  const found = doc.rows[0] as { id: string; filing_scope: string } | undefined;
  /* A market is added to a project that has a filing of its own (2026-10-15,
     security review): on one with none, the market's document would be the
     project's only one, and the home scaffold, which skips a project holding
     any document, would never write the filing. */
  const home = await client.query(
    `SELECT 1 FROM c2c_documents WHERE project_id = $1 AND org_id = $2 AND filing_scope = 'home' LIMIT 1`,
    [input.programId, input.orgId],
  );
  if (home.rows.length === 0) {
    throw new AddMarketRefusal(409, 'NO_HOME_FILING',
      'This project has no filing of its own yet, so no market can be added to it. Nothing was added.');
  }
  if (sub.rows.length > 0 || found?.filing_scope === 'market') {
    throw new AddMarketRefusal(409, 'MARKET_EXISTS',
      `This project already files ${input.applicationType.toUpperCase()} with ${input.agency}. Nothing was added.`);
  }
  return found?.id ?? null;
}

export async function addProjectMarket(input: AddMarketInput): Promise<AddMarketResult> {
  const { client, orgId, userId, programId } = input;
  const program = await readProgram(client, programId, orgId);
  const { klass, pack, documentAgency } = await resolveMarket(client, input, program);
  const homeDocumentId = await existingDocument(client, input, klass);
  const { documentId, sectionCount } = homeDocumentId
    ? { documentId: homeDocumentId, sectionCount: 0 }
    : await scaffoldMarketDocument(client, input, program, klass, pack);
  const agencies = Array.isArray(program.target_agencies) ? (program.target_agencies as unknown[]).map(String) : [];
  if (!homeDocumentId && !agencies.includes(documentAgency)) {
    await client.query(
      `UPDATE regulatory_programs SET target_agencies = $3::json, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [programId, orgId, JSON.stringify([...agencies, documentAgency])],
    );
  }

  const spine = await ensureSubmissionSpine({
    client, orgId, userId, programId,
    name: input.title?.trim() || `${program.name} — ${input.applicationType.toUpperCase()} (${documentAgency})`,
    productName: program.product_name ?? program.name, applicationType: input.applicationType.toLowerCase(),
    productType: program.product_type ?? '', primaryAgency: documentAgency, clientType: input.clientType,
  });

  await recordGovernedAction(client, {
    orgId, userId, command: 'transition', target: `project:${programId}`, reason: input.reason,
    payload: {
      event: homeDocumentId ? 'home_submission_added' : 'market_added', agency: documentAgency,
      applicationType: input.applicationType.toLowerCase(), documentId, docType: klass.docType,
      rulePackVersion: pack.version, sectionCount, submissionId: spine.id,
    },
    domain: 'projects', surface: 'api',
  });
  return { documentId, sectionCount, submissionId: spine.id, agency: documentAgency };
}

/** The market's own document: its Module 1 and 3.2.R, insert-only. */
async function scaffoldMarketDocument(
  client: PoolClient, input: AddMarketInput, program: ProgramRow,
  klass: { docType: string; agency: string }, pack: { version: string; label: string; required_sections: unknown },
) {
  const { orgId, userId, programId } = input;
  const documentId = `doc_${randomUUID().replace(/-/g, '')}`;
  const title = program.product_name ? `${program.product_name} — ${pack.label}` : pack.label;
  await client.query(
    `INSERT INTO c2c_documents
       (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, owner_id, filing_scope)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 0, $8, 'market')`,
    [documentId, orgId, programId, klass.docType, klass.agency, pack.version, title, userId],
  );
  const subtree = marketSubtree(pack.required_sections);
  const sections = await client.query(
    `INSERT INTO c2c_document_sections
       (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
     SELECT $1, s.key, s.parent_key, s.label, COALESCE(s.path_order, 0), COALESCE(s.mandatory, false),
            'todo', '{}'::jsonb, 'template', 1
       FROM jsonb_to_recordset($2::jsonb) AS s(key text, parent_key text, label text, mandatory boolean, path_order integer)
      WHERE s.key IS NOT NULL AND s.label IS NOT NULL
     RETURNING section_key`,
    [documentId, JSON.stringify(subtree)],
  );

  return { documentId, sectionCount: sections.rows.length };
}
