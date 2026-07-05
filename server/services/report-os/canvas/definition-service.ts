/**
 * @fileoverview CRUD for AnA-authored report canvases / dashboards.
 * @module server/services/report-os/canvas/definition-service
 *
 * A canvas is a titled, ordered set of governed report-type PANELS. This
 * service persists/reads them (org-scoped, soft-delete) and — critically —
 * validates every panel against the report_type_registry + the org's
 * entitlement tier before saving. A canvas can therefore never reference a
 * non-existent type or smuggle in a report the org isn't entitled to: the
 * governance that gates a direct run also gates a saved panel.
 *
 * The panel→run rendering is NOT here (the client generates each panel's run
 * through the existing governed /runs path); this module owns definitions only.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { reportDefinitions, reportTypeRegistry } from '@shared/schema/report-os';
import type {
  ReportCanvasPanel,
  ReportDefinitionRow,
  ReportDefinitionSpec,
  ReportScope,
} from '@shared/schema/report-os';
import { reportScopeEnum } from '@shared/schema/report-os';
import { resolveCapabilities } from '../../entitlements/resolver';
import { decideReportEntitlement } from '../entitlement-map';

export interface CreateDefinitionInput {
  organizationId: number;
  title: string;
  description?: string | null;
  kind?: 'dashboard' | 'report';
  spec: ReportDefinitionSpec;
  origin?: 'ana' | 'preset' | 'manual';
  persona?: string | null;
  clientWorkspaceId?: number | null;
  createdBy?: number | null;
}

export interface PanelValidationIssue {
  index: number;
  reportTypeId: string;
  reason: 'unknown_type' | 'not_entitled' | 'invalid_scope';
  requiredTier?: string;
}

const SCOPES = new Set<string>(reportScopeEnum);

/**
 * Validate a canvas spec against known registry types + the org's tier.
 * Returns the list of issues (empty = valid). Pure given `knownTypes` (typeId →
 * family) and `tier`; the DB fetch is done by the caller so this stays testable.
 */
export function validatePanels(
  panels: ReportCanvasPanel[],
  knownTypes: Map<string, string | null>,
  tier: Parameters<typeof decideReportEntitlement>[2],
): PanelValidationIssue[] {
  const issues: PanelValidationIssue[] = [];
  panels.forEach((panel, index) => {
    const family = knownTypes.get(panel.reportTypeId);
    if (family === undefined) {
      issues.push({ index, reportTypeId: panel.reportTypeId, reason: 'unknown_type' });
      return;
    }
    if (!SCOPES.has(panel.scopeType)) {
      issues.push({ index, reportTypeId: panel.reportTypeId, reason: 'invalid_scope' });
      return;
    }
    const decision = decideReportEntitlement(panel.reportTypeId, family ?? undefined, tier);
    if (!decision.entitled) {
      issues.push({
        index,
        reportTypeId: panel.reportTypeId,
        reason: 'not_entitled',
        requiredTier: decision.requiredTier,
      });
    }
  });
  return issues;
}

/** Fetch typeId → family for the given typeIds from the global registry. */
async function fetchKnownTypes(typeIds: string[]): Promise<Map<string, string | null>> {
  const known = new Map<string, string | null>();
  if (typeIds.length === 0) return known;
  const rows = await db
    .select({ typeId: reportTypeRegistry.typeId, family: reportTypeRegistry.family })
    .from(reportTypeRegistry);
  const want = new Set(typeIds);
  for (const r of rows) {
    if (want.has(r.typeId)) known.set(r.typeId, r.family ?? null);
  }
  return known;
}

export interface CreateDefinitionResult {
  ok: boolean;
  definition?: ReportDefinitionRow;
  issues?: PanelValidationIssue[];
}

/**
 * Create a canvas definition after validating every panel against the registry
 * + the org's entitlement tier. Returns `{ ok:false, issues }` if any panel is
 * unknown / not entitled / mis-scoped — never persists an ungoverned panel.
 */
export async function createDefinition(input: CreateDefinitionInput): Promise<CreateDefinitionResult> {
  const panels = input.spec?.panels ?? [];
  if (panels.length === 0) {
    return { ok: false, issues: [] };
  }
  const known = await fetchKnownTypes(panels.map((p) => p.reportTypeId));
  const caps = await resolveCapabilities(input.organizationId).catch(() => ({ tier: 'standard' as const }));
  const issues = validatePanels(panels, known, caps.tier);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const [row] = await db
    .insert(reportDefinitions)
    .values({
      organizationId: input.organizationId,
      clientWorkspaceId: input.clientWorkspaceId ?? null,
      title: input.title,
      description: input.description ?? null,
      kind: input.kind ?? 'dashboard',
      spec: input.spec,
      origin: input.origin ?? 'manual',
      persona: input.persona ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return { ok: true, definition: row };
}

/** List active (non-archived) canvas definitions for an org, newest first. */
export async function listDefinitions(organizationId: number): Promise<ReportDefinitionRow[]> {
  return db
    .select()
    .from(reportDefinitions)
    .where(and(eq(reportDefinitions.organizationId, organizationId), eq(reportDefinitions.status, 'active')))
    .orderBy(desc(reportDefinitions.updatedAt));
}

/** Fetch one canvas definition by id, org-scoped (null if not found in org). */
export async function getDefinition(
  organizationId: number,
  id: number,
): Promise<ReportDefinitionRow | null> {
  const [row] = await db
    .select()
    .from(reportDefinitions)
    .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Soft-archive a canvas definition, org-scoped. Returns the archived row or null. */
export async function archiveDefinition(
  organizationId: number,
  id: number,
): Promise<ReportDefinitionRow | null> {
  const [row] = await db
    .update(reportDefinitions)
    .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export type { ReportCanvasPanel, ReportDefinitionSpec, ReportScope };
