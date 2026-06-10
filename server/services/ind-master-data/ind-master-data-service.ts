/**
 * IND Master-Data service
 *
 * Org-scoped CRUD for the three IND master-data registries (sponsor, US agent,
 * investigator). Every read/write is tenant-scoped from the caller's
 * organizationId (never from request input) and every mutation is audited —
 * mirroring server/services/submission-service/submission-service.ts.
 *
 * NOTE: tables are imported directly from the domain file (not the schema
 * barrel) because the barrel re-export (`export * from './ind-master-data'`) is
 * added by a human as part of the INTEGRATION NOTES in the schema file.
 *
 * @module server/services/ind-master-data/ind-master-data-service
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db';
import {
  sponsors,
  regulatoryAgents,
  investigators,
  type Sponsor,
  type RegulatoryAgent,
  type Investigator,
  type InsertSponsor,
  type InsertRegulatoryAgent,
  type InsertInvestigator,
} from '../../../shared/schema/ind-master-data';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ind-master-data-service');

// ── Standardized errors ─────────────────────────────────────────────────────

export type IndMasterDataErrorCode = 'NOT_FOUND' | 'VALIDATION';

export class IndMasterDataError extends Error {
  constructor(public code: IndMasterDataErrorCode, message: string) {
    super(message);
    this.name = 'IndMasterDataError';
  }
}

interface Ctx {
  organizationId: number;
  userId: number;
}

// Fields a caller may set; the service always overrides organizationId/createdBy
// from ctx so request input can never spoof tenant or actor.
type SponsorWrite = Omit<InsertSponsor, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>;
type RegulatoryAgentWrite = Omit<InsertRegulatoryAgent, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>;
type InvestigatorWrite = Omit<InsertInvestigator, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>;

// ── Sponsors ────────────────────────────────────────────────────────────────

export async function createSponsor(input: SponsorWrite, ctx: Ctx): Promise<Sponsor> {
  const [row] = await db
    .insert(sponsors)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SPONSOR_CREATED',
    resourceType: 'ind_sponsor',
    resourceId: row.id,
    details: { name: row.name },
  });
  logger.info('Created IND sponsor', { sponsorId: row.id, organizationId: ctx.organizationId });
  return row as Sponsor;
}

export async function listSponsors(ctx: { organizationId: number }): Promise<Sponsor[]> {
  const rows = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.organizationId, ctx.organizationId))
    .orderBy(desc(sponsors.updatedAt));
  return rows as Sponsor[];
}

export async function getSponsor(id: string, ctx: { organizationId: number }): Promise<Sponsor> {
  const [row] = await db
    .select()
    .from(sponsors)
    .where(and(eq(sponsors.id, id), eq(sponsors.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Sponsor not found for this organization.');
  return row as Sponsor;
}

export async function updateSponsor(id: string, patch: Partial<SponsorWrite>, ctx: Ctx): Promise<Sponsor> {
  await getSponsor(id, ctx); // tenant ownership check
  const [row] = await db
    .update(sponsors)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(sponsors.id, id), eq(sponsors.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Sponsor not found for this organization.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SPONSOR_UPDATED',
    resourceType: 'ind_sponsor',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  });
  return row as Sponsor;
}

// ── Regulatory agents (US agent — 21 CFR 312.3) ──────────────────────────────

export async function createRegulatoryAgent(input: RegulatoryAgentWrite, ctx: Ctx): Promise<RegulatoryAgent> {
  const [row] = await db
    .insert(regulatoryAgents)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_REGULATORY_AGENT_CREATED',
    resourceType: 'ind_regulatory_agent',
    resourceId: row.id,
    details: { name: row.name, isUsAgent: row.isUsAgent },
  });
  logger.info('Created IND regulatory agent', { agentId: row.id, organizationId: ctx.organizationId });
  return row as RegulatoryAgent;
}

export async function listRegulatoryAgents(ctx: { organizationId: number }): Promise<RegulatoryAgent[]> {
  const rows = await db
    .select()
    .from(regulatoryAgents)
    .where(eq(regulatoryAgents.organizationId, ctx.organizationId))
    .orderBy(desc(regulatoryAgents.updatedAt));
  return rows as RegulatoryAgent[];
}

export async function getRegulatoryAgent(id: string, ctx: { organizationId: number }): Promise<RegulatoryAgent> {
  const [row] = await db
    .select()
    .from(regulatoryAgents)
    .where(and(eq(regulatoryAgents.id, id), eq(regulatoryAgents.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Regulatory agent not found for this organization.');
  return row as RegulatoryAgent;
}

export async function updateRegulatoryAgent(
  id: string,
  patch: Partial<RegulatoryAgentWrite>,
  ctx: Ctx,
): Promise<RegulatoryAgent> {
  await getRegulatoryAgent(id, ctx);
  const [row] = await db
    .update(regulatoryAgents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(regulatoryAgents.id, id), eq(regulatoryAgents.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Regulatory agent not found for this organization.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_REGULATORY_AGENT_UPDATED',
    resourceType: 'ind_regulatory_agent',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  });
  return row as RegulatoryAgent;
}

// ── Investigators (Form 1572) ────────────────────────────────────────────────

export async function createInvestigator(input: InvestigatorWrite, ctx: Ctx): Promise<Investigator> {
  const [row] = await db
    .insert(investigators)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_INVESTIGATOR_CREATED',
    resourceType: 'ind_investigator',
    resourceId: row.id,
    details: { lastName: row.lastName, siteName: row.siteName },
  });
  logger.info('Created IND investigator', { investigatorId: row.id, organizationId: ctx.organizationId });
  return row as Investigator;
}

export async function listInvestigators(ctx: { organizationId: number }): Promise<Investigator[]> {
  const rows = await db
    .select()
    .from(investigators)
    .where(eq(investigators.organizationId, ctx.organizationId))
    .orderBy(desc(investigators.updatedAt));
  return rows as Investigator[];
}

export async function getInvestigator(id: string, ctx: { organizationId: number }): Promise<Investigator> {
  const [row] = await db
    .select()
    .from(investigators)
    .where(and(eq(investigators.id, id), eq(investigators.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Investigator not found for this organization.');
  return row as Investigator;
}

export async function updateInvestigator(
  id: string,
  patch: Partial<InvestigatorWrite>,
  ctx: Ctx,
): Promise<Investigator> {
  await getInvestigator(id, ctx);
  const [row] = await db
    .update(investigators)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(investigators.id, id), eq(investigators.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Investigator not found for this organization.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_INVESTIGATOR_UPDATED',
    resourceType: 'ind_investigator',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  });
  return row as Investigator;
}

export default {
  createSponsor,
  listSponsors,
  getSponsor,
  updateSponsor,
  createRegulatoryAgent,
  listRegulatoryAgents,
  getRegulatoryAgent,
  updateRegulatoryAgent,
  createInvestigator,
  listInvestigators,
  getInvestigator,
  updateInvestigator,
  IndMasterDataError,
};
