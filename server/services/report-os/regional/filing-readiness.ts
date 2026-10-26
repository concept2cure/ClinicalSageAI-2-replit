/**
 * The `regional` engine: one market's Module 1 content gaps for one program,
 * with that market's own statement of what the platform can carry.
 *
 * ── WHY THIS ENGINE EXISTS ──────────────────────────────────────────────────
 * Thirty-five of the registered report types name a market in their title, and
 * until now no engine computed any of them: `reportEngineFor` returned null and
 * the canvas showed each as not computed in this release. That is the honest
 * state QA 2026-10-08 (j8) left behind — before it, POST /runs answered every
 * one of them with the Executive Readiness Digest under the market's heading,
 * a report claiming an analysis nothing performed.
 *
 * The missing piece was never a provider per market. It was a market-specific
 * COMPUTATION, and the platform already holds exactly one that is region-aware
 * and carries a basis on every line: `shared/regulatory/regional-module1.ts`,
 * the record of where FDA, EMA and PMDA file Module 1 documents. Module 1 is
 * the only regional part of the CTD — ICH M4 harmonises Modules 2–5 — so a
 * market's filing readiness IS its Module 1 content question, and that record
 * answers it per application kind with `requiredModule1`.
 *
 * ── WHAT BOUNDS IT, AND WHY THAT BOUND IS NOT A CHOICE ──────────────────────
 * `REGIONAL_MODULE1` models US, EU and JP, and says so: "Not modelled: Module 1
 * for any other regulator (CA, UK, CH, AU, CN, KR, BR, IN, SG). A caller gets
 * nothing for those, never another regulator's tree." Its `kinds` are
 * US ind/nda/bla/anda, EU maa, JP jnda. Those six (jurisdiction, kind) pairs are
 * the whole computable set, and {@link REGIONAL_FILING_TYPES} is their report
 * types — four of them. Every other market type stays not computed with its own
 * reason, which is the market's, not this module's: the agency has no Module 1
 * record here, or a device filing is not eCTD and has no Module 1 at all.
 *
 * Widening the engine therefore means adding a regulator's Module 1 tree to that
 * record, with a basis per heading. It does not mean adding a case here.
 *
 * ── WHAT IT WILL NOT CLAIM ──────────────────────────────────────────────────
 * 1. A market this program is not filing in. The type's market must be the
 *    program's recorded market, or the run is refused: an FDA NDA readiness
 *    assessment of a program recorded as an EU MAA is the j8 defect with one
 *    more step of indirection.
 * 2. Coverage it did not measure. A heading counts as covered only when current, non-empty
 *    recorded section or artifact content of this program carries a CTD code at or
 *    under it. When NOTHING in the program records a Module 1 code, coverage is
 *    reported as not assessed — never as every heading missing. Absence of
 *    recorded codes is not absence of documents (CLAUDE.md: an error is never
 *    rendered as an empty result).
 * 3. A conditional heading as satisfied or as not required. `requiredModule1`
 *    returns `undetermined` for a heading whose condition nobody has stated,
 *    and that reaches the report as its own line with the condition named.
 * 4. A declared dependency it does not compute. Each report type declares its
 *    `dataDependencies`; this engine computes Module 1 content and the market
 *    statement. The rest are recorded as `missing` provider observations with
 *    the reason, so the run's evidence panel shows what was and was not read.
 * 5. A confidence. Nothing here measures one, so `confidence` is null, and the
 *    truthfulness gate holds every run of these types at `partial` with its own
 *    sentence ("this report type requires a confidence, and none was computed
 *    for this run"). That is the same ceiling three shipped domain registers
 *    already sit at, and it is the honest one: a content-gap assessment
 *    measures no confidence, so it never claims `final`.
 *
 * Org-scoped and read-only. The market statement comes from
 * `services/regulatory/market-support.ts`, the one canonical answer the market
 * rows, the New submission options and the New project picker also read, so no
 * sentence here is written twice.
 *
 * @module server/services/report-os/regional/filing-readiness
 */

import { pool } from '../../../db';
import {
  REGIONAL_MODULE1,
  flattenModule1,
  requiredModule1,
} from '../../../../shared/regulatory/regional-module1';
import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';
import { REGIONAL_FILING_TYPES } from './filing-types';
import { readRecordedRegionalFiling, regionalDeclarationRefusal, regionalFilingApplicability, type ModeledRegionalFiling } from './filing-applicability';
import { readMarketSupport, type MarketSupport } from '../../regulatory/market-support';
import type { ProviderResult, RunComputationResult } from '../orchestrator';

/**
 * Why a regional run was not made. Carried as an error so a failure to compute
 * is a failed run and never another market's report in its place.
 */
export class RegionalNotComputed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegionalNotComputed';
  }
}

const now = () => new Date().toISOString();

/** The report type's own declaration, from the deployed registry row. */
export interface Declared {
  region?: string | null;
  label?: string | null;
  dataDependencies?: readonly string[] | null;
}

type ProgramContext = ModeledRegionalFiling;

/** A json column that may arrive as text, as its object or as nothing. */
function jsonObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    ? (parsed as Record<string, unknown>)
    : {};
}

/** This program's own record, or a refusal. Org-filtered: another organization's is not found. */
async function readProjectMetadata(organizationId: number, projectId: number): Promise<unknown> {
  const { rows } = await pool.query(
    `SELECT metadata FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [projectId, organizationId],
  );
  if (rows.length === 0) {
    throw new RegionalNotComputed('This project was not found in this organization, so no market readiness was assessed.');
  }
  return (rows[0] as { metadata: unknown }).metadata;
}

/**
 * Every CTD code this program records, normalized.
 *
 * Both halves of the program's content are read: the authoring sections
 * (`sections`, whose code lives on `metadata.sectionCode`, `metadata.code` or
 * `section_id` — the same three places `orchestrator.ts` reads) and the governed
 * artifacts (`concept2cure_artifacts.ctd_section`). A code that is not a CTD
 * code normalizes to null and is dropped.
 */
async function readRecordedCodes(organizationId: number, projectId: number): Promise<Set<string>> {
  const [sectionRows, artifactRows] = await Promise.all([
    pool.query(
      `SELECT section_id, metadata FROM sections WHERE organization_id = $1 AND project_id = $2
       AND status NOT IN ('archived', 'deleted', 'superseded', 'withdrawn') AND content ~ '[^[:space:]]'`,
      [organizationId, projectId],
    ),
    pool.query(
      `SELECT ctd_section FROM concept2cure_artifacts WHERE organization_id = $1 AND project_id = $2 AND ctd_section IS NOT NULL
       AND status NOT IN ('archived', 'deleted', 'superseded', 'withdrawn') AND content ~ '[^[:space:]]'`,
      [organizationId, projectId],
    ),
  ]);
  const codes = new Set<string>();
  const add = (raw: unknown) => {
    const code = normalizeCtdCode(typeof raw === 'string' ? raw : null);
    if (code) codes.add(code);
  };
  for (const row of sectionRows.rows as Array<{ section_id: unknown; metadata: unknown }>) {
    const meta = jsonObject(row.metadata);
    add(meta.sectionCode);
    add(meta.code);
    add(row.section_id);
  }
  for (const row of artifactRows.rows as Array<{ ctd_section: unknown }>) add(row.ctd_section);
  return codes;
}

/**
 * Whether anything recorded sits at or under `heading`.
 *
 * A document filed at 1.8.2 covers 1.8.2; one at 1.8.2.1 covers 1.8.2 as well,
 * because an eCTD heading with children is a container and its content IS its
 * children. The converse does not hold: a document at 1.8 does not cover 1.8.2.
 */
function covered(codes: ReadonlySet<string>, heading: string): boolean {
  if (codes.has(heading)) return true;
  const prefix = `${heading}.`;
  for (const code of codes) if (code.startsWith(prefix)) return true;
  return false;
}

/** The market statement for this program's filing, or null when it cannot be read. */
async function readMarket(ctx: ProgramContext): Promise<MarketSupport | null> {
  try {
    const [support] = await readMarketSupport(pool, [{
      applicationType: ctx.kind,
      market: ctx.agency,
      continuingLifecycle: ctx.continuingLifecycle,
    }]);
    return support ?? null;
  } catch {
    /* Any failure to READ the statement, which is one thing to a reader and so
       one sentence: readMarketSupport throws when no active rule pack can be
       read at all (a store that was not read, not a platform with no outline),
       and a connection failure lands here too. Either way the statement was not
       read, and the Module 1 assessment does not depend on it — so the run
       proceeds and the market provider says exactly that rather than inventing a
       market line or failing an assessment that did complete. A market the
       statement DOES judge unsupported is not this branch: that is
       `offer.tier === 'not_offered'`, with the market's own reason. */
    return null;
  }
}

/**
 * The report type's declared region, label and dependencies, read from the
 * deployed registry when the caller did not already hold the row.
 *
 * POST /runs selects the row before it dispatches and passes it; the
 * subscription sweep does not hold one. Reading it here rather than in the
 * sweep keeps a scheduled market assessment exactly as honest as an interactive
 * one: the same region assertion, and the same disclosure of every declared
 * dependency this engine does not compute. A row that cannot be read is not a
 * reason to assess the wrong market, so the read failing is a refusal.
 */
async function readDeclared(typeId: string): Promise<Declared> {
  const { rows } = await pool.query(
    `SELECT label, governance_requirements, data_dependencies FROM report_type_registry WHERE type_id = $1 LIMIT 1`,
    [typeId],
  );
  if (rows.length === 0) {
    throw new RegionalNotComputed(`${typeId} is not in the deployed report type registry, so no market readiness was assessed.`);
  }
  const row = rows[0] as { label: unknown; governance_requirements: unknown; data_dependencies: unknown };
  const region = jsonObject(row.governance_requirements).region;
  let deps = row.data_dependencies;
  if (typeof deps === 'string') {
    try { deps = JSON.parse(deps); } catch { deps = null; }
  }
  return {
    label: typeof row.label === 'string' ? row.label : null,
    region: typeof region === 'string' ? region : null,
    dataDependencies: Array.isArray(deps) ? deps.filter((d): d is string => typeof d === 'string') : null,
  };
}

/**
 * The declared dependencies this engine answers in full. Everything else a type
 * declares is disclosed — as a part answered ({@link PARTIAL_DEPENDENCIES}) or
 * as not computed at all.
 *
 * `section_status` is in full: the assessment reads this program's recorded
 * section and artifact placement, which is what that dependency names.
 */
const COMPUTED_DEPENDENCIES: ReadonlySet<string> = new Set(['section_status']);

/**
 * A declared dependency this engine answers only in PART, with the part named.
 *
 * `module_completeness` was first listed as fully computed, which overclaims: a
 * reader of the run's evidence panel sees a dependency absent from the missing
 * list and infers it was assessed. This engine examines Module 1 — the only
 * regional part of the CTD, which is why a market assessment is a Module 1
 * question at all — and does not look at Modules 2–5. Saying so is the
 * difference between a market assessment and a claim about the whole dossier.
 */
const PARTIAL_DEPENDENCIES: Readonly<Record<string, string>> = Object.freeze({
  module_completeness:
    'assessed for Module 1 only. Module 1 is the only regional part of the CTD (ICH M4 harmonises Modules 2–5), ' +
    'so this market assessment examines Module 1 and does not examine Modules 2–5.',
});

/**
 * The project id this assessment runs over, or a refusal.
 *
 * Project scope only, and said so rather than guessed. The report-os scope
 * model passes a project id under `submission` scope as well
 * (orchestrator.ts), but only `project` scope is checked for this
 * organization's ownership before the engine runs, and a submission id that
 * collided with one of this organization's project ids would be assessed as
 * that project. A program scope is a group of projects, each with its own
 * market, which is not one market's readiness.
 */
function oneProgramScope(scopeType: string, scopeId: string): number {
  if (scopeType !== 'project') {
    throw new RegionalNotComputed(
      `A market's filing readiness is assessed for one project, not for a ${scopeType} scope, so it was not run here.`,
    );
  }
  const projectId = Number(scopeId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new RegionalNotComputed('This scope does not name a project, so no market readiness was assessed.');
  }
  return projectId;
}

/**
 * One market's filing readiness for one program.
 *
 * `declaredByCaller` is the report type's registry row when the caller already
 * holds it; without it the row is read here ({@link readDeclared}). Either way
 * every declared `dataDependencies` entry this engine does not answer in full
 * becomes its own provider observation with the reason, so nothing the type
 * promised is silently absent from the run's evidence.
 */
/** One phase's provider rows and the blockers they raise. */
interface Observations {
  providers: ProviderResult[];
  blockers: string[];
  criticalBlockers: string[];
}

/** What `requiredModule1` said, with each heading's own title to hand. */
interface Module1Assessment {
  required: string[];
  undetermined: Array<{ code: string; condition: string }>;
  headingTitle: Map<string, string>;
  missingRequired: string[];
  /** False when nothing in the program records a CTD code, so nothing was matched. */
  assessed: boolean;
}

/** `US Module 1 1.3.1 Product information`, or as much of it as is known. */
const headingLine = (ctx: ProgramContext, a: Module1Assessment, code: string): string =>
  `${ctx.jurisdiction} Module 1 ${code} ${a.headingTitle.get(code) ?? ''}`.trim();

/**
 * The Module 1 half: what this market requires of this filing, and what the
 * program records under it.
 *
 * A required heading with no document is a CRITICAL blocker — the sequence is
 * incomplete against the agency's own heading table — and is named individually
 * so the report says which. A heading conditional on a fact nobody stated is a
 * blocker but NOT critical: it may well not apply once the fact is stated
 * (`requiredModule1`'s own contract, which never returns "not required" for an
 * unstated condition).
 */
function module1Observations(ctx: ProgramContext, a: Module1Assessment): Observations {
  const providers: ProviderResult[] = [];
  const blockers: string[] = [];
  const criticalBlockers: string[] = [];

  if (!a.assessed) {
    /* No section and no artifact of this program records a CTD code. That is the
       absence of a RECORD of where its content sits, not the absence of content:
       reporting every required heading as missing would turn an unrecorded
       program into a damning gap list. */
    const blocker =
      'Module 1 coverage was not assessed: no section or governed document of this project records a CTD section code on current non-empty content, ' +
      `so nothing could be matched against the ${a.required.length} ${ctx.jurisdiction} Module 1 heading(s) ` +
      `a ${ctx.kind.toUpperCase()} requires.`;
    providers.push({ provider: 'module1_content', observedAt: now(), status: 'missing', blocker });
    blockers.push(blocker);
  } else {
    const missing = a.missingRequired.length;
    const present = a.required.length - missing;
    providers.push({
      provider: 'module1_content',
      observedAt: now(),
      status: missing === 0 ? 'ready' : present > 0 ? 'partial' : 'missing',
      ...(missing > 0
        ? {
            blocker:
              `${missing} of ${a.required.length} required ${ctx.jurisdiction} Module 1 heading(s) ` +
              'have no document recorded under them.',
          }
        : {}),
    });
    for (const code of a.missingRequired) {
      const line = `${headingLine(ctx, a, code)}: required for this filing, and no document is recorded under it.`;
      blockers.push(line);
      criticalBlockers.push(line);
    }
  }

  for (const u of a.undetermined) {
    blockers.push(
      `${headingLine(ctx, a, u.code)}: required only if ${u.condition.replace(/_/g, ' ')} holds, ` +
        'and that is not recorded for this project.',
    );
  }
  providers.push({
    provider: 'module1_applicability',
    observedAt: now(),
    status: a.undetermined.length === 0 ? 'ready' : 'partial',
    ...(a.undetermined.length > 0
      ? { blocker: `${a.undetermined.length} Module 1 heading(s) are conditional on a fact this project does not record.` }
      : {}),
  });
  return { providers, blockers, criticalBlockers };
}

/** The market half: what the platform can carry for this filing, in the market's own words. */
function marketObservations(market: MarketSupport | null): Observations {
  if (!market) {
    const blocker =
      'The market statement could not be read, so what this platform can carry for this filing is not stated here.';
    return {
      providers: [{ provider: 'market_support', observedAt: now(), status: 'missing', blocker }],
      blockers: [blocker],
      criticalBlockers: [],
    };
  }
  const blockers: string[] = [];
  const notOffered = market.offer.tier === 'not_offered';
  const providers: ProviderResult[] = [{
    provider: 'market_support',
    observedAt: now(),
    status: notOffered ? 'missing' : market.buildable ? 'ready' : 'partial',
    ...(notOffered ? { blocker: market.offer.reason } : {}),
  }];
  if (notOffered) blockers.push(market.offer.reason);
  /* Buildable is the narrow claim: an outline AND Module 1 built to the agency's
     own headings. Everywhere else the packager files Module 1 flat or reuses
     another region's backbone, and that is a limit of the FILING, not of the
     assessment, so it is stated as a blocker on the run. */
  if (!market.buildable) blockers.push(market.module1.detail);
  return { providers, blockers, criticalBlockers: [] };
}

/**
 * Everything the type declared that this engine does not answer in full,
 * disclosed rather than left to read as assessed-and-clear. A part answered is a
 * `partial` row naming the part; nothing answered is a `missing` row.
 */
function declaredObservations(declared: Declared): Observations {
  const providers: ProviderResult[] = [];
  const blockers: string[] = [];
  for (const dep of declared.dataDependencies ?? []) {
    if (COMPUTED_DEPENDENCIES.has(dep)) continue;
    const part = PARTIAL_DEPENDENCIES[dep];
    const blocker = part
      ? `${dep.replace(/_/g, ' ')}: ${part}`
      : `${dep.replace(/_/g, ' ')}: not computed by this assessment, ` +
        "which reads this market's Module 1 content and the market statement only.";
    providers.push({ provider: dep, observedAt: now(), status: part ? 'partial' : 'missing', blocker });
    blockers.push(blocker);
  }
  return { providers, blockers, criticalBlockers: [] };
}

/** The run's own record of what it assessed, for the renderer and the evidence panel. */
function regionalSummary(
  ctx: ProgramContext,
  a: Module1Assessment,
  market: MarketSupport | null,
  scope: { scopeType: string; scopeId: string; recordedCodes: string[] },
): Record<string, unknown> {
  const spec = REGIONAL_MODULE1[ctx.jurisdiction].spec;
  return {
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    market: {
      jurisdiction: ctx.jurisdiction,
      agency: ctx.agency,
      registryId: ctx.registryId,
      filing: ctx.entryLabel,
      applicationKind: ctx.kind,
      /* The specification the heading numbers and titles come from, so the
         report's own numbering can be re-audited without re-deriving it. */
      module1Spec: spec.ref,
      module1SpecConfidence: spec.confidence,
      ...(market
        ? {
            line: market.line,
            summary: market.summary,
            offer: market.offer,
            buildable: market.buildable,
            module1Shape: market.module1.state,
            module1Detail: market.module1.detail,
            outline: market.outline.state,
            outlinePack: market.outline.pack,
            channel: market.channel.state,
          }
        : {}),
    },
    module1: {
      assessed: a.assessed,
      requiredHeadings: a.required.length,
      coveredHeadings: a.assessed ? a.required.length - a.missingRequired.length : null,
      /* Null, not [], when nothing was matched: an empty list is "none missing",
         which is the opposite of what an unassessed program means. */
      missingHeadings: a.assessed
        ? a.missingRequired.map((code) => ({ code, title: a.headingTitle.get(code) ?? null }))
        : null,
      undetermined: a.undetermined.map((u) => ({
        code: u.code,
        title: a.headingTitle.get(u.code) ?? null,
        condition: u.condition,
      })),
      recordedCodeCount: scope.recordedCodes.length,
      recordedCodes: scope.recordedCodes,
      coverageBasis: 'Current non-empty recorded content placed at CTD codes. Content quality, approvals and the complete set of documents within each heading were not assessed.',
    },
  };
}

/**
 * One market's filing readiness for one program.
 *
 * `declaredByCaller` is the report type's registry row when the caller already
 * holds it; without it the row is read here ({@link readDeclared}). Either way
 * every declared `dataDependencies` entry this engine does not answer in full
 * becomes its own provider observation with the reason, so nothing the type
 * promised is silently absent from the run's evidence.
 */
export async function computeRegionalRun(
  typeId: string,
  organizationId: number,
  scopeType: string,
  scopeId: string,
  declaredByCaller?: Declared,
): Promise<RunComputationResult> {
  const binding = REGIONAL_FILING_TYPES[typeId];
  if (!binding) throw new RegionalNotComputed(`No market readiness is computed for ${typeId}.`);
  const declared = declaredByCaller ?? (await readDeclared(typeId));
  const declaration = regionalDeclarationRefusal(typeId, declared);
  if (declaration) throw new RegionalNotComputed(declaration.availabilityReason);
  const projectId = oneProgramScope(scopeType, scopeId);

  const context = readRecordedRegionalFiling(await readProjectMetadata(organizationId, projectId));
  const applicability = regionalFilingApplicability(typeId, declared, context);
  if (!applicability.runnable) throw new RegionalNotComputed(applicability.availabilityReason);
  const ctx = applicability.filing;

  const { required, undetermined } = requiredModule1(ctx.jurisdiction, ctx.kind);
  const codes = await readRecordedCodes(organizationId, projectId);
  const assessment: Module1Assessment = {
    required,
    undetermined,
    headingTitle: new Map(flattenModule1(ctx.jurisdiction, ctx.kind).map((h) => [h.number, h.title])),
    missingRequired: required.filter((code) => !covered(codes, code)),
    assessed: codes.size > 0,
  };
  const market = await readMarket(ctx);

  const phases = [
    module1Observations(ctx, assessment),
    marketObservations(market),
    declaredObservations(declared),
  ];
  return {
    providers: phases.flatMap((o) => o.providers),
    /* Nothing here measures a confidence, so none is reported and the
       truthfulness gate holds every run of these types at `partial` with its own
       sentence. See this module's header for why that is the right ceiling
       rather than a taxonomy edit. */
    confidence: null,
    blockers: phases.flatMap((o) => o.blockers),
    criticalBlockers: phases.flatMap((o) => o.criticalBlockers),
    summary: regionalSummary(ctx, assessment, market, { scopeType, scopeId, recordedCodes: [...codes].sort() }),
  };
}
