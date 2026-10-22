/**
 * GSPR Service — catalog read, per-program mapping CRUD, and coverage/gap report.
 *
 * The validator is deterministic: given a program profile + the current set
 * of mappings + the catalog filter (MDR vs IVDR), it produces the gap set.
 * No LLM calls.
 */

import {
  isDeviceFamily,
  isIvdFamily,
  isProductType,
} from '../../../shared/constants/domain/product-types.js';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
  gsprRequirements,
  gsprProgramMappings,
  type GsprRequirement,
  type GsprProgramMapping,
  type InsertGsprProgramMapping,
} from '../../../shared/schema/gspr-postmarket';
import { publishRegulatoryChange, type PublishOutcome } from '../living-file/publish';
import { deviceFlagsFromMetadata } from '../pathway-engines/estar/program-device-flags';
import {
  euDeviceClassFrom,
  loadProgrammeEuDeviceRow,
  type ProgrammeEuDeviceRow,
} from './programme-eu-device-record';

// ─────────────────────────────────────────────────────────────────────────────
// Profile + filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The device facts GSPR scope reads. A boolean fact is `true` / `false` when
 * recorded and `undefined` when not: a clause that depends on an unrecorded
 * fact is scope undetermined, never out of scope.
 */
export interface GsprProgramProfile {
  regulation: 'MDR' | 'IVDR';
  productType: string;
  deviceClass: string | null;
  isSoftware?: boolean;
  isAiMl?: boolean;
  isIvd?: boolean;
  isSterile?: boolean;
  isImplantable?: boolean;
  isCombination?: boolean;
  hasPatientContact?: boolean;
}

export interface GsprFinding {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  requirementId: string;
  clause: string;
  title: string;
  message: string;
}

export interface GsprCoverageReport {
  programId: string;
  regulation: 'MDR' | 'IVDR';
  /** Clauses in scope, or of undetermined scope (they may apply). */
  totalApplicable: number;
  mappedApplies: number;
  mappedNotApplicable: number;
  mappedPartial: number;
  mappedTbd: number;
  /** Clauses in totalApplicable with no applicability decision. */
  unmapped: number;
  /** Of `unmapped`, those whose scope the program's recorded facts cannot settle. */
  scopeUndetermined: number;
  /** The device facts the program does not record that left a clause undetermined. */
  undeterminedFacts: string[];
  conformantCount: number;
  nonConformantCount: number;
  needsEvidenceCount: number;
  findings: GsprFinding[];
  coveragePercent: number;
  passesGate: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog filtering
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a scope condition holds: true, false, or the facts it is waiting on. */
type ScopeAnswer = true | false | { unknown: string[] };

/** One product-type scope tag against the profile. */
function scopeTagHolds(tag: string, profile: GsprProgramProfile): ScopeAnswer {
  const fact = (value: boolean | undefined, name: string): ScopeAnswer =>
    value === undefined ? { unknown: [name] } : value;
  const productType = profile.productType;
  // Family membership, not equality: `samd` is a device and `cdx` is an IVD.
  // Matching literally dropped every scoped requirement for those classes,
  // which produces a SHORT Annex I checklist — a coverage report that looks
  // complete and is not.
  const knownType = isProductType(productType) || productType === 'combination';
  const otherwise: ScopeAnswer = knownType ? false : { unknown: ['product type'] };
  switch (tag) {
    case 'device':
      return isDeviceFamily(productType) || otherwise;
    case 'ivd':
      return isIvdFamily(productType) || profile.isIvd === true || otherwise;
    case 'samd':
      return productType === 'samd' || fact(profile.isSoftware, 'software');
    case 'ai_ml':
      return fact(profile.isAiMl, 'AI/ML');
    case 'implantable':
      return fact(profile.isImplantable, 'implantable');
    case 'combination':
      return productType === 'combination' || fact(profile.isCombination, 'combination product');
    default:
      return productType === tag || { unknown: [`product-type scope "${tag}"`] };
  }
}

/**
 * Whether a requirement is in scope for the profile, or which unrecorded facts
 * leave it undetermined. 2026-10-15: an unknown fact used to count as false, so
 * a sterile-only, implantable-only or product-type-scoped clause left the
 * denominator whenever nobody had recorded the fact, and the gate passed
 * without it.
 */
function requirementScope(req: GsprRequirement, profile: GsprProgramProfile): ScopeAnswer {
  if (req.status !== 'active') return false;
  if (req.regulation !== profile.regulation) return false;

  // Every condition must hold (false excludes); undetermined if any is unknown.
  const conditions: ScopeAnswer[] = [];
  if (req.isSterileOnly) conditions.push(profile.isSterile ?? { unknown: ['sterile'] });
  if (req.isImplantableOnly) conditions.push(profile.isImplantable ?? { unknown: ['implantable'] });

  // Product-type scope, when declared: one tag must hold (true includes).
  const pt = (req.productTypeScope ?? []) as string[];
  if (pt.length > 0) {
    const tags = pt.map((tag) => scopeTagHolds(tag, profile));
    if (tags.some((t) => t === true)) conditions.push(true);
    else if (tags.every((t) => t === false)) conditions.push(false);
    else conditions.push({ unknown: tags.flatMap((t) => (typeof t === 'object' ? t.unknown : [])) });
  }

  if (conditions.some((c) => c === false)) return false;
  const unknown = conditions.flatMap((c) => (typeof c === 'object' ? c.unknown : []));
  return unknown.length > 0 ? { unknown: [...new Set(unknown)] } : true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Program profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure: the profile a program record states — its product type, its EU class,
 * and the device questions answered at intake (`metadata.deviceFlags`, read by
 * deviceFlagsFromMetadata). A question nobody answered stays undefined.
 * Patient contact is asked nowhere, so it is never stated.
 */
function gsprProfileFromProgram(
  program: ProgrammeEuDeviceRow,
  regulation: 'MDR' | 'IVDR'
): GsprProgramProfile {
  const flags = deviceFlagsFromMetadata(program.metadata);
  const productType = String(program.productType ?? '').trim().toLowerCase();
  return {
    regulation,
    productType,
    deviceClass: euDeviceClassFrom(program, regulation),
    isIvd: isIvdFamily(productType),
    isSoftware: productType === 'samd' ? true : flags?.softwareAiMl,
    // One intake question covers software and AI/ML: no software means no
    // AI/ML, but software says nothing about AI/ML.
    isAiMl: flags?.softwareAiMl === false ? false : undefined,
    isSterile: flags?.sterile,
    isImplantable: flags?.implantable,
    isCombination: productType === 'combination' ? true : flags?.combinationProduct,
  };
}

/** The program's GSPR profile from its record, or null when it is not in the organization. */
export async function loadGsprProgramProfile(
  organizationId: number,
  programId: string,
  regulation: 'MDR' | 'IVDR'
): Promise<GsprProgramProfile | null> {
  const program = await loadProgrammeEuDeviceRow(organizationId, programId);
  return program ? gsprProfileFromProgram(program, regulation) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog read
// ─────────────────────────────────────────────────────────────────────────────

export async function listCatalog(regulation?: 'MDR' | 'IVDR'): Promise<GsprRequirement[]> {
  if (regulation) {
    return db
      .select()
      .from(gsprRequirements)
      .where(
        and(eq(gsprRequirements.regulation, regulation), eq(gsprRequirements.status, 'active'))
      )
      .orderBy(gsprRequirements.chapter, gsprRequirements.clause);
  }
  return db
    .select()
    .from(gsprRequirements)
    .where(eq(gsprRequirements.status, 'active'))
    .orderBy(gsprRequirements.regulation, gsprRequirements.chapter, gsprRequirements.clause);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-program mapping CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listProgramMappings(
  organizationId: number,
  programId: string
): Promise<Array<{ mapping: GsprProgramMapping; requirement: GsprRequirement }>> {
  const mappings = await db
    .select()
    .from(gsprProgramMappings)
    .where(
      and(
        eq(gsprProgramMappings.organizationId, organizationId),
        eq(gsprProgramMappings.programId, programId)
      )
    );
  if (!mappings.length) return [];

  const reqIds = mappings.map(m => m.requirementId);
  const reqs = await db
    .select()
    .from(gsprRequirements)
    .where(inArray(gsprRequirements.id, reqIds));
  const byId = new Map(reqs.map(r => [r.id, r]));

  return mappings
    .map(m => {
      const req = byId.get(m.requirementId);
      return req ? { mapping: m, requirement: req } : null;
    })
    .filter((x): x is { mapping: GsprProgramMapping; requirement: GsprRequirement } => x !== null);
}

export async function upsertMapping(
  values: InsertGsprProgramMapping
): Promise<GsprProgramMapping & { publish?: PublishOutcome }> {
  const [existing] = await db
    .select()
    .from(gsprProgramMappings)
    .where(
      and(
        eq(gsprProgramMappings.organizationId, values.organizationId),
        eq(gsprProgramMappings.programId, values.programId),
        eq(gsprProgramMappings.requirementId, values.requirementId)
      )
    )
    .limit(1);

  let row: GsprProgramMapping;
  let applicabilityChanged = false;
  let evidenceChanged = false;
  if (existing) {
    applicabilityChanged = existing.applicability !== values.applicability;
    evidenceChanged = existing.primaryEvidenceId !== (values.primaryEvidenceId ?? null);
    const [updated] = await db
      .update(gsprProgramMappings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(gsprProgramMappings.id, existing.id))
      .returning();
    row = updated;
  } else {
    applicabilityChanged = true;
    const [created] = await db.insert(gsprProgramMappings).values(values).returning();
    row = created;
  }

  // Living-file: a GSPR coverage decision change impacts EU pathway readiness
  // (sufficiency, NB reviewer persona, post-market planning). Publish only
  // when the applicability or evidence linkage actually changed; pure status
  // updates are not propagated.
  let publish: PublishOutcome | undefined;
  if (applicabilityChanged || evidenceChanged) {
  /* WO-16C #133. This was a bare `await publishRegulatoryChange({…})`, and the
     helper's own docstring called its result "informational only" — so the
     per-channel propagation report was thrown away and a run where every channel
     errored looked exactly like one where nothing needed to change. The outcome
     travels with the result now. The mutation above stands either way: the
     regulatory change really happened, and refusing it because the downstream
     graph could not be notified would be the worse answer. */
    publish = await publishRegulatoryChange({
      organizationId: row.organizationId,
      programId: row.programId,
      event: 'device_profile_changed',
      sourceId: row.programId,
      sourceLabel: `GSPR mapping ${row.requirementId} → ${row.applicability}`,
      reason: applicabilityChanged ? 'gspr_applicability_changed' : 'gspr_evidence_changed',
      userId: typeof values.decidedBy === 'string' ? values.decidedBy : undefined,
    });
  }

  /* `undefined` when no publish was attempted — a pure status update is not
     propagated, and that is not the same as a propagation that failed. */
  return publish ? { ...row, publish } : row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage / gap report
// ─────────────────────────────────────────────────────────────────────────────

/** GSPR-006: a clause that may apply, waiting on facts the program does not record. */
function scopeUndeterminedFinding(req: GsprRequirement, unknown: string[]): GsprFinding {
  return {
    code: 'GSPR-006',
    severity: 'critical',
    requirementId: req.id,
    clause: req.clause,
    title: req.title,
    message:
      `${req.regulation} Annex ${req.annex} clause ${req.clause}: scope undetermined — not recorded on the ` +
      `program: ${unknown.join(', ')}. Record it, or record an applicability decision for this clause.`,
  };
}

export async function computeCoverage(
  organizationId: number,
  programId: string,
  profile: GsprProgramProfile
): Promise<GsprCoverageReport> {
  const catalog = await listCatalog(profile.regulation);
  // In scope, or of undetermined scope: both may apply, so both need a decision.
  const scoped: Array<{ req: GsprRequirement; unknown: string[] }> = catalog.flatMap(r => {
    const scope = requirementScope(r, profile);
    return scope === false ? [] : [{ req: r, unknown: scope === true ? [] : scope.unknown }];
  });

  const mappingsRaw = await db
    .select()
    .from(gsprProgramMappings)
    .where(
      and(
        eq(gsprProgramMappings.organizationId, organizationId),
        eq(gsprProgramMappings.programId, programId)
      )
    );
  const byRequirementId = new Map(mappingsRaw.map(m => [m.requirementId, m]));

  let mappedApplies = 0;
  let mappedNotApplicable = 0;
  let mappedPartial = 0;
  let mappedTbd = 0;
  let unmapped = 0;
  let scopeUndetermined = 0;
  const undeterminedFacts = new Set<string>();
  let conformantCount = 0;
  let nonConformantCount = 0;
  let needsEvidenceCount = 0;

  const findings: GsprFinding[] = [];

  for (const { req, unknown } of scoped) {
    const m = byRequirementId.get(req.id);
    if (!m) {
      unmapped += 1;
      if (unknown.length > 0) {
        // Nobody recorded the fact that decides this clause, and nobody decided
        // its applicability: it may apply and has not been looked at.
        scopeUndetermined += 1;
        unknown.forEach(f => undeterminedFacts.add(f));
        findings.push(scopeUndeterminedFinding(req, unknown));
        continue;
      }
      findings.push({
        code: 'GSPR-001',
        severity: 'critical',
        requirementId: req.id,
        clause: req.clause,
        title: req.title,
        message: `${req.regulation} Annex ${req.annex} clause ${req.clause} is in-scope for this program but has no applicability decision.`,
      });
      continue;
    }
    if (m.applicability === 'applies') mappedApplies += 1;
    else if (m.applicability === 'not_applicable') mappedNotApplicable += 1;
    else if (m.applicability === 'partial') mappedPartial += 1;
    else if (m.applicability === 'tbd') mappedTbd += 1;

    if (m.applicability === 'tbd') {
      findings.push({
        code: 'GSPR-002',
        severity: 'warning',
        requirementId: req.id,
        clause: req.clause,
        title: req.title,
        message: `${req.regulation} clause ${req.clause}: applicability is TBD. Confirm and revisit.`,
      });
    }

    if (m.conformanceStatus === 'conformant') conformantCount += 1;
    else if (m.conformanceStatus === 'non_conformant') {
      nonConformantCount += 1;
      findings.push({
        code: 'GSPR-003',
        severity: 'critical',
        requirementId: req.id,
        clause: req.clause,
        title: req.title,
        message: `${req.regulation} clause ${req.clause}: conformance status is non_conformant.`,
      });
    } else if (m.conformanceStatus === 'needs_evidence') {
      needsEvidenceCount += 1;
      findings.push({
        code: 'GSPR-004',
        severity: 'warning',
        requirementId: req.id,
        clause: req.clause,
        title: req.title,
        message: `${req.regulation} clause ${req.clause}: conformance needs evidence.`,
      });
    }

    if (m.applicability === 'applies' && !m.primaryEvidenceId) {
      findings.push({
        code: 'GSPR-005',
        severity: 'warning',
        requirementId: req.id,
        clause: req.clause,
        title: req.title,
        message: `${req.regulation} clause ${req.clause}: marked applies but no primary evidence linked.`,
      });
    }
  }

  const totalApplicable = scoped.length;
  const decided =
    mappedApplies + mappedNotApplicable + mappedPartial; // 'tbd' and unmapped don't count
  // FAIL CLOSED on an empty in-scope set. totalApplicable === 0 means no GSPR
  // requirements are in scope — almost always an UNSEEDED catalog (gspr_requirements
  // is populated only by scripts/seed-gspr.ts, not by the migration), or a
  // regulation/product-type the catalog has no rows for — NOT a conformant device.
  // Reporting 100% coverage + a passing conformity gate for "assessed nothing"
  // would put an unsubstantiated Annex I / GSPR conformity claim into a CER.
  // Honest value: 0% coverage, and the gate fails (mirrors the sibling guard in
  // post-market-readiness.ts, `req.length > 0 && ...`).
  const coveragePercent =
    totalApplicable === 0 ? 0 : Math.round((decided / totalApplicable) * 1000) / 10;

  return {
    programId,
    regulation: profile.regulation,
    totalApplicable,
    mappedApplies,
    mappedNotApplicable,
    mappedPartial,
    mappedTbd,
    unmapped,
    scopeUndetermined,
    undeterminedFacts: [...undeterminedFacts],
    conformantCount,
    nonConformantCount,
    needsEvidenceCount,
    findings,
    coveragePercent,
    passesGate:
      totalApplicable > 0 &&
      unmapped === 0 &&
      scopeUndetermined === 0 &&
      nonConformantCount === 0 &&
      mappedTbd === 0,
  };
}
