// server/repositories/learningRepository.ts
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  users,
  learningModules,
  documentTemplates,
  userProgress,
  aiInsights,
  userActivity,
  userMetrics,
  InsertLearningModule,
  InsertDocumentTemplate,
  InsertUserProgress,
  InsertAiInsight,
  InsertUserActivity,
  InsertUserMetrics,
} from '../../shared/schema';

export class LearningRepository {
  // Learning Modules
  async getLearningModules() {
    return db.select().from(learningModules);
  }

  async getLearningModuleById(id: number) {
    const [module] = await db.select().from(learningModules).where(eq(learningModules.id, id));
    return module;
  }

  async getLearningModulesByDomain(domain: string) {
    // Note: This is a workaround as we're using JSON arrays in the schema
    // In a production environment, this would ideally be optimized with database indexes
    const modules = await db.select().from(learningModules);
    return modules.filter(
      module => Array.isArray(module.domains) && module.domains.includes(domain)
    );
  }

  async createLearningModule(data: InsertLearningModule) {
    const [module] = await db.insert(learningModules).values(data).returning();
    return module;
  }

  async updateLearningModule(id: number, data: Partial<InsertLearningModule>) {
    const [updatedModule] = await db
      .update(learningModules)
      .set(data)
      .where(eq(learningModules.id, id))
      .returning();
    return updatedModule;
  }

  // Document Templates
  async getDocumentTemplates() {
    return db.select().from(documentTemplates);
  }

  async getDocumentTemplateById(id: number) {
    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id));
    return template;
  }

  async getDocumentTemplatesByDomain(domain: string) {
    const templates = await db.select().from(documentTemplates);
    return templates.filter(
      template => Array.isArray(template.domains) && template.domains.includes(domain)
    );
  }

  async createDocumentTemplate(data: InsertDocumentTemplate) {
    const [template] = await db.insert(documentTemplates).values(data).returning();
    return template;
  }

  async updateDocumentTemplate(id: number, data: Partial<InsertDocumentTemplate>) {
    const [updatedTemplate] = await db
      .update(documentTemplates)
      .set(data)
      .where(eq(documentTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async incrementTemplateUseCount(id: number) {
    const [updatedTemplate] = await db
      .update(documentTemplates)
      .set({
        useCount: sql`${documentTemplates.useCount} + 1`,
      })
      .where(eq(documentTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  // User Progress
  async getUserProgressByUserId(userId: number) {
    return db.select().from(userProgress).where(eq(userProgress.userId, userId));
  }

  async getUserModuleProgress(userId: number, moduleId: number) {
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.moduleId, moduleId)));
    return progress;
  }

  async getUserTemplateProgress(userId: number, templateId: number) {
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.templateId, templateId)));
    return progress;
  }

  async createOrUpdateUserProgress(data: InsertUserProgress) {
    // Check if progress entry exists
    let existing;

    if (data.moduleId) {
      existing = await this.getUserModuleProgress(data.userId, data.moduleId);
    } else if (data.templateId) {
      existing = await this.getUserTemplateProgress(data.userId, data.templateId);
    }

    if (existing) {
      // Update existing progress
      const [updatedProgress] = await db
        .update(userProgress)
        .set({
          progress: data.progress,
          lastAccessed: new Date(),
          completed: data.completed,
          completedAt: data.completed ? new Date() : existing.completedAt,
        })
        .where(eq(userProgress.id, existing.id))
        .returning();
      return updatedProgress;
    } else {
      // Create new progress entry
      const [newProgress] = await db.insert(userProgress).values(data).returning();
      return newProgress;
    }
  }

  // AI Insights
  async getAiInsightsByUserId(userId: number) {
    return db
      .select()
      .from(aiInsights)
      .where(eq(aiInsights.userId, userId))
      .orderBy(desc(aiInsights.createdAt));
  }

  async getAiInsightById(id: number) {
    const [insight] = await db.select().from(aiInsights).where(eq(aiInsights.id, id));
    return insight;
  }

  async createAiInsight(data: InsertAiInsight) {
    const [insight] = await db.insert(aiInsights).values(data).returning();
    return insight;
  }

  async updateAiInsight(id: number, data: Partial<InsertAiInsight>) {
    const [updatedInsight] = await db
      .update(aiInsights)
      .set(data)
      .where(eq(aiInsights.id, id))
      .returning();
    return updatedInsight;
  }

  async markInsightAsRead(id: number) {
    const [updatedInsight] = await db
      .update(aiInsights)
      .set({ isRead: true })
      .where(eq(aiInsights.id, id))
      .returning();
    return updatedInsight;
  }

  async saveOrUnsaveInsight(id: number, save: boolean) {
    const [updatedInsight] = await db
      .update(aiInsights)
      .set({ isSaved: save })
      .where(eq(aiInsights.id, id))
      .returning();
    return updatedInsight;
  }

  // User Activity
  async getUserActivityByUserId(userId: number, limit = 10) {
    return db
      .select()
      .from(userActivity)
      .where(eq(userActivity.userId, userId))
      .orderBy(desc(userActivity.timestamp))
      .limit(limit);
  }

  async logUserActivity(data: InsertUserActivity) {
    const [activity] = await db.insert(userActivity).values(data).returning();
    return activity;
  }

  // User Metrics
  async getUserMetrics(userId: number) {
    const [metrics] = await db.select().from(userMetrics).where(eq(userMetrics.userId, userId));
    return metrics;
  }

  async createOrUpdateUserMetrics(userId: number, data: Partial<InsertUserMetrics>) {
    const existing = await this.getUserMetrics(userId);

    if (existing) {
      const [updatedMetrics] = await db
        .update(userMetrics)
        .set({
          ...data,
          lastUpdated: new Date(),
        })
        .where(eq(userMetrics.userId, userId))
        .returning();
      return updatedMetrics;
    } else {
      const [newMetrics] = await db
        .insert(userMetrics)
        .values({
          userId,
          ...data,
          lastUpdated: new Date(),
        })
        .returning();
      return newMetrics;
    }
  }

  // Recommendations
  async getRecommendedModulesForUser(userId: number, limit = 5) {
    // Get user info and preferences
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return [];

    // Get user's completed modules
    const progress = await this.getUserProgressByUserId(userId);
    const completedModuleIds = progress.filter(p => p.moduleId && p.completed).map(p => p.moduleId);

    // Get all modules
    const allModules = await this.getLearningModules();

    // Filter out completed modules
    const availableModules = allModules.filter(module => !completedModuleIds.includes(module.id));

    // Score modules based on relevance to user's domain and interests
    const scoredModules = availableModules.map(module => {
      let relevanceScore = 0;

      // Domain match
      if (user.domain && Array.isArray(module.domains) && module.domains.includes(user.domain)) {
        relevanceScore += 50;
      }

      // Interest matches
      if (Array.isArray(user.interests) && Array.isArray(module.tags)) {
        const interestMatches = user.interests.filter(interest =>
          module.tags.includes(interest)
        ).length;
        relevanceScore += interestMatches * 10;
      }

      // If user has started this module, boost its score
      const moduleProgress = progress.find(p => p.moduleId === module.id);
      if (moduleProgress && moduleProgress.progress > 0) {
        relevanceScore += 20;
      }

      return {
        ...module,
        relevanceScore,
      };
    });

    // Sort by relevance score and return top N
    return scoredModules.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  }

  async getRecommendedTemplatesForUser(userId: number, limit = 3) {
    // Get user info and preferences
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return [];

    // Get all templates
    const allTemplates = await this.getDocumentTemplates();

    // Score templates based on relevance to user's domain and interests
    const scoredTemplates = allTemplates.map(template => {
      let relevanceScore = 0;

      // Domain match
      if (
        user.domain &&
        Array.isArray(template.domains) &&
        template.domains.includes(user.domain)
      ) {
        relevanceScore += 50;
      }

      // Interest/role matches
      if (Array.isArray(user.interests) && Array.isArray(template.recommendedFor)) {
        const matchCount = user.interests.filter(interest =>
          template.recommendedFor.includes(interest)
        ).length;
        relevanceScore += matchCount * 15;
      }

      // Popular templates get a boost
      relevanceScore += Math.min(template.useCount, 100) / 5;

      return {
        ...template,
        relevanceScore,
      };
    });

    // Sort by relevance score and return top N
    return scoredTemplates.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  }

  // Recent user activity for "continue where you left off"
  async getRecentUserActivity(userId: number, limit = 3) {
    const activity = await this.getUserActivityByUserId(userId, 20);
    const uniqueResources = new Map();

    // Deduplicate by taking the most recent activity for each resource
    activity.forEach(item => {
      const key = `${item.activityType}-${item.resourceId}`;
      if (!uniqueResources.has(key)) {
        uniqueResources.set(key, item);
      }
    });

    const recentItems = Array.from(uniqueResources.values()).slice(0, limit);

    // Enhance with additional data based on activity type
    const enhancedActivity = await Promise.all(
      recentItems.map(async item => {
        let resourceData = null;
        let progress = 0;

        if (item.activityType === 'learning') {
          resourceData = await this.getLearningModuleById(item.resourceId);
          const progressData = await this.getUserModuleProgress(userId, item.resourceId);
          progress = progressData?.progress || 0;
        } else if (item.activityType === 'document' || item.activityType === 'template') {
          resourceData = await this.getDocumentTemplateById(item.resourceId);
          const progressData = await this.getUserTemplateProgress(userId, item.resourceId);
          progress = progressData?.progress || 0;
        }

        return {
          id: `${item.activityType}-${item.resourceId}`,
          type: item.activityType,
          resourceId: item.resourceId,
          title: resourceData?.title || 'Unknown Resource',
          timestamp: item.timestamp,
          progress: progress,
        };
      })
    );

    return enhancedActivity;
  }
}
