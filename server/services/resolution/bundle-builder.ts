/**
 * Bundle Builder — Sprint 4
 *
 * Creates governed Resolution Bundles that collect coordinated fixes:
 * - updated assumptions
 * - affected decisions
 * - rewrite targets
 * - review thread(s)
 * - contradiction memo or resolution memo
 * - reapproval requirements
 *
 * @module server/services/resolution/bundle-builder
 */

import { db } from '../../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  resolutionBundles,
  resolutionBundleItems,
  resolutionPlans,
  type ResolutionBundle,
  type ResolutionBundleItem,
  type NewResolutionBundle,
  type NewResolutionBundleItem,
} from '../../../shared/schema/resolution';
import type {
  CreateResolutionBundleRequest,
  CreateBundleItemRequest,
  BundleState,
  BundleItemStatus,
} from '../../../shared/types/resolution';
import { VALID_BUNDLE_STATE_TRANSITIONS } from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a resolution bundle with its items.
 *
 * If a planId is provided, links the bundle to the resolution plan
 * and updates the plan's bundleId reference.
 */
export async function createResolutionBundle(
  organizationId: number,
  userId: number,
  request: CreateResolutionBundleRequest
): Promise<{ bundle: ResolutionBundle; items: ResolutionBundleItem[] }> {
  if (request.items.length === 0) {
    throw new Error('Resolution bundle must contain at least one item');
  }

  // Determine confidence from items
  const confidence = determinesBundleConfidence(request.items);

  // Determine review requirements
  const requiresReview = request.items.some(
    i => i.actionType === 'reapprove' || i.actionType === 'review'
  );
  const requiresReapproval = request.items.some(
    i => i.actionType === 'reapprove'
  );

  const bundleData: NewResolutionBundle = {
    organizationId,
    projectId: request.projectId,
    title: request.title,
    description: request.description,
    state: 'draft',
    planId: request.planId,
    requiresReview,
    requiresReapproval,
    confidence,
    createdById: userId,
  };

  const [bundle] = await db.insert(resolutionBundles).values(bundleData).returning();

  // Create bundle items
  const itemsData: NewResolutionBundleItem[] = request.items.map((item, index) => ({
    bundleId: bundle.id,
    objectType: item.objectType,
    objectId: item.objectId,
    objectTitle: item.objectTitle,
    actionType: item.actionType,
    actionDescription: item.actionDescription,
    sectionCode: item.sectionCode,
    impactRationale: item.impactRationale,
    preparedContent: item.preparedContent,
    preparedContentConfidence: item.preparedContentConfidence,
    status: 'pending' as const,
    sortOrder: index,
  }));

  const items = await db.insert(resolutionBundleItems).values(itemsData).returning();

  // Link bundle to plan if planId provided
  if (request.planId) {
    await db
      .update(resolutionPlans)
      .set({ bundleId: bundle.id, updatedAt: new Date() })
      .where(eq(resolutionPlans.id, request.planId));
  }

  return { bundle, items };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export async function getResolutionBundle(
  organizationId: number,
  bundleId: string
): Promise<{ bundle: ResolutionBundle; items: ResolutionBundleItem[] } | undefined> {
  const [bundle] = await db
    .select()
    .from(resolutionBundles)
    .where(and(
      eq(resolutionBundles.id, bundleId),
      eq(resolutionBundles.organizationId, organizationId)
    ))
    .limit(1);

  if (!bundle) return undefined;

  const items = await db
    .select()
    .from(resolutionBundleItems)
    .where(eq(resolutionBundleItems.bundleId, bundleId))
    .orderBy(resolutionBundleItems.sortOrder);

  return { bundle, items };
}

export async function getProjectBundles(
  organizationId: number,
  projectId: number,
  stateFilter?: BundleState
): Promise<ResolutionBundle[]> {
  const conditions = [
    eq(resolutionBundles.organizationId, organizationId),
    eq(resolutionBundles.projectId, projectId),
  ];
  if (stateFilter) {
    conditions.push(eq(resolutionBundles.state, stateFilter));
  }
  return db
    .select()
    .from(resolutionBundles)
    .where(and(...conditions))
    .orderBy(desc(resolutionBundles.createdAt));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transition a bundle to a new state.
 * Validates the transition against the state machine.
 */
export async function transitionBundleState(
  organizationId: number,
  userId: number,
  bundleId: string,
  targetState: BundleState,
  reason?: string
): Promise<ResolutionBundle> {
  const [bundle] = await db
    .select()
    .from(resolutionBundles)
    .where(and(
      eq(resolutionBundles.id, bundleId),
      eq(resolutionBundles.organizationId, organizationId)
    ))
    .limit(1);

  if (!bundle) {
    throw new Error(`Resolution bundle ${bundleId} not found`);
  }

  const currentState = bundle.state as BundleState;
  const validTargets = VALID_BUNDLE_STATE_TRANSITIONS[currentState];
  if (!validTargets.includes(targetState)) {
    throw new Error(
      `Invalid state transition: ${currentState} → ${targetState}. ` +
      `Valid transitions from ${currentState}: ${validTargets.join(', ')}`
    );
  }

  const updateData: Partial<ResolutionBundle> = {
    state: targetState,
    updatedAt: new Date(),
  };

  if (targetState === 'approved') {
    updateData.approvedById = userId;
    updateData.approvedAt = new Date();
  }
  if (targetState === 'applied') {
    updateData.completedAt = new Date();
  }
  if (reason) {
    updateData.resolutionMemo = (bundle.resolutionMemo ? bundle.resolutionMemo + '\n\n' : '') +
      `[${new Date().toISOString()}] State → ${targetState}: ${reason}`;
  }

  const [updated] = await db
    .update(resolutionBundles)
    .set(updateData)
    .where(eq(resolutionBundles.id, bundleId))
    .returning();

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE ITEM OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function updateBundleItemStatus(
  organizationId: number,
  bundleId: string,
  itemId: string,
  status: BundleItemStatus,
  userId?: number
): Promise<ResolutionBundleItem> {
  // Verify the bundle belongs to this organization before updating items
  const [bundle] = await db
    .select()
    .from(resolutionBundles)
    .where(and(
      eq(resolutionBundles.id, bundleId),
      eq(resolutionBundles.organizationId, organizationId)
    ))
    .limit(1);

  if (!bundle) {
    throw new Error(`Bundle ${bundleId} not found`);
  }

  const updateData: Record<string, unknown> = { status };
  if (status === 'completed') {
    updateData.completedAt = new Date();
    updateData.completedById = userId;
  }

  const [item] = await db
    .update(resolutionBundleItems)
    .set(updateData)
    .where(and(
      eq(resolutionBundleItems.id, itemId),
      eq(resolutionBundleItems.bundleId, bundleId)
    ))
    .returning();

  if (!item) {
    throw new Error(`Bundle item ${itemId} not found in bundle ${bundleId}`);
  }

  return item;
}

/**
 * Add a new item to an existing bundle (only in draft/proposed state).
 */
export async function addBundleItem(
  organizationId: number,
  bundleId: string,
  item: CreateBundleItemRequest
): Promise<ResolutionBundleItem> {
  const [bundle] = await db
    .select()
    .from(resolutionBundles)
    .where(and(
      eq(resolutionBundles.id, bundleId),
      eq(resolutionBundles.organizationId, organizationId)
    ))
    .limit(1);

  if (!bundle) {
    throw new Error(`Bundle ${bundleId} not found`);
  }
  if (!['draft', 'proposed'].includes(bundle.state)) {
    throw new Error(`Cannot add items to bundle in state ${bundle.state}`);
  }

  // Get max sort order
  const existing = await db
    .select()
    .from(resolutionBundleItems)
    .where(eq(resolutionBundleItems.bundleId, bundleId));

  const maxOrder = existing.reduce((max, i) => Math.max(max, i.sortOrder), -1);

  const [newItem] = await db.insert(resolutionBundleItems).values({
    bundleId,
    objectType: item.objectType,
    objectId: item.objectId,
    objectTitle: item.objectTitle,
    actionType: item.actionType,
    actionDescription: item.actionDescription,
    sectionCode: item.sectionCode,
    impactRationale: item.impactRationale,
    preparedContent: item.preparedContent,
    preparedContentConfidence: item.preparedContentConfidence,
    status: 'pending',
    sortOrder: maxOrder + 1,
  }).returning();

  return newItem;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE FROM PLAN (Auto-generation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-generate a bundle from a resolution plan's affected objects.
 * Maps each affected object to a bundle item with an appropriate action.
 */
export async function createBundleFromPlan(
  organizationId: number,
  userId: number,
  planId: string
): Promise<{ bundle: ResolutionBundle; items: ResolutionBundleItem[] }> {
  const [plan] = await db
    .select()
    .from(resolutionPlans)
    .where(and(
      eq(resolutionPlans.id, planId),
      eq(resolutionPlans.organizationId, organizationId)
    ))
    .limit(1);

  if (!plan) {
    throw new Error(`Resolution plan ${planId} not found`);
  }

  const affectedObjects = plan.affectedObjects as Array<{
    objectType: string;
    objectId: string;
    objectTitle?: string;
    sectionCode?: string;
    impactState?: string;
    impactRationale?: string;
  }>;

  if (!affectedObjects || affectedObjects.length === 0) {
    throw new Error('Resolution plan has no affected objects to bundle');
  }

  const items: CreateBundleItemRequest[] = affectedObjects.map(obj => ({
    objectType: obj.objectType,
    objectId: obj.objectId,
    objectTitle: obj.objectTitle,
    actionType: mapPathToAction(plan.recommendedPath, obj.impactState),
    actionDescription: buildItemDescription(plan.recommendedPath, obj),
    sectionCode: obj.sectionCode,
    impactRationale: obj.impactRationale,
  }));

  return createResolutionBundle(organizationId, userId, {
    projectId: plan.projectId,
    planId: plan.id,
    title: `Resolution: ${plan.triggerDescription}`,
    description: plan.rationale,
    items,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function determinesBundleConfidence(
  items: CreateBundleItemRequest[]
): 'strong' | 'moderate' | 'provisional' | 'uncertain' {
  if (items.length <= 2) return 'strong';
  if (items.length <= 5) return 'moderate';
  if (items.length <= 10) return 'provisional';
  return 'uncertain';
}

function mapPathToAction(
  path: string,
  impactState?: string
): 'rewrite' | 'review' | 'supersede' | 'reapprove' | 'harmonize' | 'escalate' {
  if (impactState === 'potential') return 'review';

  switch (path) {
    case 'harmonize': return 'harmonize';
    case 'supersede': return 'supersede';
    case 'rewrite': return 'rewrite';
    case 'review_only': return 'review';
    case 'escalate': return 'escalate';
    case 'mixed':
      return impactState === 'direct' ? 'rewrite' : 'harmonize';
    default: return 'review';
  }
}

function buildItemDescription(
  path: string,
  obj: { objectType: string; objectTitle?: string; impactState?: string }
): string {
  const title = obj.objectTitle || obj.objectType;
  const action = mapPathToAction(path, obj.impactState);

  switch (action) {
    case 'rewrite':
      return `Rewrite ${title} to address the resolution trigger`;
    case 'harmonize':
      return `Harmonize ${title} with updated upstream content`;
    case 'supersede':
      return `Supersede ${title} with updated version`;
    case 'reapprove':
      return `Re-approve ${title} after upstream changes`;
    case 'review':
      return `Review ${title} for potential impact`;
    case 'escalate':
      return `Escalate ${title} for manual review — impact unclear`;
    default:
      return `Review ${title}`;
  }
}
