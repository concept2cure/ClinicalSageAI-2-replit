/**
 * Feature Persistence Utility
 *
 * Provides a reusable document-store abstraction over projectMemoryEntries
 * for feature routes that need persistent storage. Each feature uses a
 * unique `category` namespace and optional `subcategory` for entity types.
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { projectMemoryEntries, projectIntelligenceProfiles } from '../../shared/schema';

const profileCache = new Map<number, { profileId: number; projectId: number }>();

export async function getFeatureStoreIds(
  orgId: number,
): Promise<{ profileId: number; projectId: number }> {
  const cached = profileCache.get(orgId);
  if (cached) return cached;

  try {
    const projectRows = await db.execute(
      sql`SELECT id FROM projects WHERE organization_id = ${orgId} LIMIT 1`,
    );
    const projectId = Number((projectRows.rows[0] as any)?.id) || 0;
    if (!projectId) return { profileId: 0, projectId: 0 };

    const [existing] = await db
      .select({ id: projectIntelligenceProfiles.id })
      .from(projectIntelligenceProfiles)
      .where(
        and(
          eq(projectIntelligenceProfiles.organizationId, orgId),
          eq(projectIntelligenceProfiles.projectId, projectId),
        ),
      )
      .limit(1);

    if (existing) {
      const ids = { profileId: existing.id, projectId };
      profileCache.set(orgId, ids);
      return ids;
    }

    const [inserted] = await db
      .insert(projectIntelligenceProfiles)
      .values({ organizationId: orgId, projectId, profileStatus: 'active' } as any)
      .returning({ id: projectIntelligenceProfiles.id });

    const ids = { profileId: inserted.id, projectId };
    profileCache.set(orgId, ids);
    return ids;
  } catch {
    return { profileId: 0, projectId: 0 };
  }
}

function rowToEntity(row: any): any {
  try {
    const data = JSON.parse(row.content);
    return { id: row.id, ...data, createdAt: row.createdAt, updatedAt: row.updatedAt };
  } catch {
    return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
}

export function createFeatureStore(category: string) {
  return {
    async query(
      orgId: number,
      subcategory?: string,
      filter?: (e: any) => boolean,
    ): Promise<any[]> {
      const conditions: any[] = [
        eq(projectMemoryEntries.organizationId, orgId),
        eq(projectMemoryEntries.category, category),
      ];
      if (subcategory) {
        conditions.push(eq(projectMemoryEntries.subcategory, subcategory));
      }

      const rows = await db
        .select()
        .from(projectMemoryEntries)
        .where(and(...conditions))
        .orderBy(desc(projectMemoryEntries.updatedAt));

      let entities = rows.map(rowToEntity);
      if (filter) entities = entities.filter(filter);
      return entities;
    },

    async getById(id: number, orgId: number): Promise<any | null> {
      const [row] = await db
        .select()
        .from(projectMemoryEntries)
        .where(
          and(
            eq(projectMemoryEntries.id, id),
            eq(projectMemoryEntries.organizationId, orgId),
            eq(projectMemoryEntries.category, category),
          ),
        )
        .limit(1);
      return row ? rowToEntity(row) : null;
    },

    async insert(
      orgId: number,
      subcategory: string,
      title: string,
      data: any,
    ): Promise<any> {
      const { profileId, projectId } = await getFeatureStoreIds(orgId);
      const [row] = await db
        .insert(projectMemoryEntries)
        .values({
          projectProfileId: profileId,
          projectId,
          organizationId: orgId,
          category,
          subcategory,
          title: title.slice(0, 500),
          content: JSON.stringify(data),
          extractedBy: 'system',
          status: 'active',
        } as any)
        .returning();
      return rowToEntity(row);
    },

    async update(id: number, orgId: number, data: any, title?: string): Promise<any | null> {
      const setClause: any = {
        content: JSON.stringify(data),
        updatedAt: new Date(),
      };
      if (title) setClause.title = title.slice(0, 500);

      const [row] = await db
        .update(projectMemoryEntries)
        .set(setClause)
        .where(
          and(
            eq(projectMemoryEntries.id, id),
            eq(projectMemoryEntries.organizationId, orgId),
            eq(projectMemoryEntries.category, category),
          ),
        )
        .returning();
      return row ? rowToEntity(row) : null;
    },

    async remove(id: number, orgId: number): Promise<boolean> {
      await db
        .delete(projectMemoryEntries)
        .where(
          and(
            eq(projectMemoryEntries.id, id),
            eq(projectMemoryEntries.organizationId, orgId),
            eq(projectMemoryEntries.category, category),
          ),
        );
      return true;
    },

    rowToEntity,
  };
}
