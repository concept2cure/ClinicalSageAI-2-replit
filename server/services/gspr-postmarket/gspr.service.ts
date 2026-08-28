/**
 * GSPR Service — catalog read, per-program mapping CRUD, and coverage/gap report.
 *
 * The validator is deterministic: given a program profile + the current set
 * of mappings + the catalog filter (MDR vs IVDR), it produces the gap set.
 * No LLM calls.
 */

import { isDeviceFamily, isIvdFamily } from '../../../shared/constants/domain/product-types.js';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
  gsprRequirements,
  gsprProgramMappings,
  type GsprRequirement,
  type GsprProgramMapping,
  type InsertGsprProgramMapping,
} from '../../../shared/schema/gspr-postmarket';
import { publishRegulatoryChange } from '../living-file/publish';

// ─────────────────────────────────────────────────────────────────────────────
// Profile + filter
// ─────────────────────────────────────────────────────────────────────────────

export interface GsprProgramProfile {
  regulation: 'MDR' | 'IVDR';
  productType: string;
  deviceClass: string | null;
  isSoftware?: boolean;
  isAiMl?: boolean;
  isIvd?: boolean;
  isSterile?: boolean;
  isImplantable?: boolean;
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
  totalApplicable: number;
  mappedApplies: number;
  mappedNotApplicable: number;
  mappedPartial: number;
  mappedTbd: number;
  unmapped: number;
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

/** Returns true if a requirement is in scope for the given profile. */
function requirementInScope(req: GsprRequirement, profile: GsprProgramProfile): boolean {
  if (req.status !== 'active') return false;
  if (req.regulation !== profile.regulation) return false;

  // Sterile-only requirements only fire for sterile devices
  if (req.isSterileOnly && profile.isSterile !== true) return false;

  // Implantable-only requirements only fire for implantable devices
  if (req.isImplantableOnly && profile.isImplantable !== true) return false;

  // Product-type scope, when declared, must include the program's product type
  const pt = (req.productTypeScope ?? []) as string[];
  if (pt.length > 0) {
    if (profile.isIvd && pt.includes('ivd')) return true;
    if (profile.isSoftware && pt.includes('samd')) return true;
    if (profile.isAiMl && pt.includes('ai_ml')) return true;
    if (profile.isImplantable && pt.includes('implantable')) return true;
    if (profile.productType === 'combination' && pt.includes('combination')) return true;
    // Family membership, not equality: `samd` is a device and `cdx` is an IVD.
    // Matching literally dropped every scoped requirement for those classes,
    // which produces a SHORT Annex I checklist — a coverage report that looks
    // complete and is not.
    if (profile.productType === 'samd' && pt.includes('samd')) return true;
    if (isIvdFamily(profile.productType) && pt.includes('ivd')) return true;
    if (isDeviceFamily(profile.productType) && pt.includes('device')) return true;
    return false;
  }
  return true;
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
): Promise<GsprProgramMapping> {
  const [existing] = await db
    .select()
    .from(gsprProgramMappings)
    .where(
      and(
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
  if (applicabilityChanged || evidenceChanged) {
    await publishRegulatoryChange({
      organizationId: row.organizationId,
      programId: row.programId,
      event: 'device_profile_changed',
      sourceId: row.programId,
      sourceLabel: `GSPR mapping ${row.requirementId} → ${row.applicability}`,
      reason: applicabilityChanged ? 'gspr_applicability_changed' : 'gspr_evidence_changed',
      userId: typeof values.decidedBy === 'string' ? values.decidedBy : undefined,
    });
  }

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage / gap report
// ─────────────────────────────────────────────────────────────────────────────

export async function computeCoverage(
  organizationId: number,
  programId: string,
  profile: GsprProgramProfile
): Promise<GsprCoverageReport> {
  const catalog = await listCatalog(profile.regulation);
  const inScope = catalog.filter(r => requirementInScope(r, profile));

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
  let conformantCount = 0;
  let nonConformantCount = 0;
  let needsEvidenceCount = 0;

  const findings: GsprFinding[] = [];

  for (const req of inScope) {
    const m = byRequirementId.get(req.id);
    if (!m) {
      unmapped += 1;
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

  const totalApplicable = inScope.length;
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
    conformantCount,
    nonConformantCount,
    needsEvidenceCount,
    findings,
    coveragePercent,
    passesGate:
      totalApplicable > 0 &&
      unmapped === 0 &&
      nonConformantCount === 0 &&
      mappedTbd === 0,
  };
}
