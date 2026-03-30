// server/services/aiRecommendationService.ts
import { storage } from '../storage';
import {
  User,
  DocumentTemplate,
} from '../../shared/schema';

// These types are not in the current schema — use local definitions
type InsertAiInsight = any;
type LearningModule = any;
type UserActivity = any;

// Initialize OpenAI client
// The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = 'gpt-4o';
import { ai } from '../lib/unified-ai-client';

export class AiRecommendationService {
  /**
   * Generate AI insights for the user based on their activity, learning patterns, and domain
   */
  async generateAiInsights(userId: number): Promise<InsertAiInsight[]> {
    try {
      // Fetch user data
      const user = await storage.getUser(userId);
      if (!user) throw new Error('User not found');

      // Fetch user's recent activity
      const activity = await (storage as any).getUserActivityByUserId(userId);

      // Fetch user's progress data
      const progress = await (storage as any).getUserProgressByUserId(userId);

      // Generate insights based on user data
      const aiInsights = await this.generateInsightsWithOpenAI(user as any, activity, progress);

      return aiInsights;
    } catch (error) {
      console.error('Error generating AI insights:', error);
      throw error;
    }
  }

  /**
   * Use OpenAI to analyze user data and generate personalized insights
   */
  private async generateInsightsWithOpenAI(
    user: User,
    activity: UserActivity[],
    progress: any[]
  ): Promise<InsertAiInsight[]> {
    const prompt = this.buildInsightPrompt(user, activity, progress);

    const aiResult = await ai.chat({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an AI learning assistant for a regulatory affairs platform called Concept2Cure. 
          Your task is to analyze user activity data and generate actionable insights that will help 
          the user improve their regulatory documentation skills and workflow efficiency. 
          Provide highly specific, domain-relevant insights based on patterns you observe in their usage.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    // Parse the insights from the response
    const responseContent = aiResult.content;
    const parsedResponse = responseContent ? JSON.parse(responseContent) : { insights: [] };

    // Convert to the InsertAiInsight format
    return parsedResponse.insights.map((insight: any) => ({
      userId: user.id,
      title: insight.title,
      description: insight.description,
      source: insight.source || 'AI Activity Analysis',
      relevanceScore: insight.relevanceScore || 90,
      confidenceScore: insight.confidenceScore || 85,
      tags: insight.tags || [],
      isRead: false,
      isSaved: false,
    }));
  }

  /**
   * Build prompt for OpenAI to generate insights
   */
  private buildInsightPrompt(user: any, activity: UserActivity[], progress: any[]): string {
    const userInfo = {
      role: user.role,
      domain: user.domain,
      expertiseLevel: user.expertiseLevel,
      interests: user.interests,
    };

    // Simplify activity data for the prompt
    const simplifiedActivity = activity.map(item => ({
      type: item.activityType,
      resourceId: item.resourceId,
      action: item.action,
      timestamp: item.timestamp,
    }));

    // Simplify progress data for the prompt
    const simplifiedProgress = progress.map(item => ({
      resourceType: item.moduleId ? 'learning' : 'template',
      resourceId: item.moduleId || item.templateId,
      progress: item.progress,
      completed: item.completed,
    }));

    const promptData = {
      user: userInfo,
      activity: simplifiedActivity,
      progress: simplifiedProgress,
    };

    return `
      Please analyze the following user data and generate 3-5 personalized insights that would be valuable
      for their regulatory affairs work. Format your response as a JSON object with an "insights" array.
      Each insight should have the following structure:
      {
        "title": "Brief, specific title",
        "description": "Detailed, actionable insight",
        "source": "What data this insight is based on",
        "relevanceScore": number from 0-100,
        "confidenceScore": number from 0-100,
        "tags": ["tag1", "tag2", ...]
      }
      
      USER DATA:
      ${JSON.stringify(promptData, null, 2)}
      
      Focus on patterns in their behavior, potential skill gaps, efficiency improvements,
      and domain-specific recommendations. Be concrete and specific.
    `;
  }

  /**
   * Score the relevance of learning modules for a specific user
   */
  async scoreModuleRelevanceWithAI(userId: number, modules: LearningModule[]): Promise<any[]> {
    let user: any;

    try {
      // Fetch user data
      user = await storage.getUser(userId);
      if (!user) throw new Error('User not found');

      const prompt = this.buildModuleScoringPrompt(user, modules);

      const aiResult = await ai.chat({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an AI learning assistant for a regulatory affairs platform. Your task is to score the relevance 
            of learning modules for a specific user based on their role, domain, expertise level, and interests.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      // Parse the scored modules from the response
      const responseContent = aiResult.content;
      const parsedResponse = responseContent ? JSON.parse(responseContent) : { scoredModules: [] };

      return parsedResponse.scoredModules;
    } catch (error) {
      console.error('Error scoring module relevance:', error);

      // If we get an error but already have the user data, try the fallback scoring
      if (user) {
        // Fall back to a simpler scoring method if AI scoring fails
        return modules.map(module => ({
          id: module.id,
          relevanceScore: this.calculateBaseRelevanceScore(user, module),
        }));
      }

      // Otherwise, just return empty results
      return [];
    }
  }

  /**
   * Calculate a basic relevance score without using AI
   */
  private calculateBaseRelevanceScore(user: any, module: LearningModule): number {
    let score = 70; // Base score

    // Domain match
    if (
      user.domain &&
      module.domains &&
      Array.isArray(module.domains) &&
      module.domains.includes(user.domain)
    ) {
      score += 15;
    }

    // Interest matches
    if (
      user.interests &&
      Array.isArray(user.interests) &&
      module.tags &&
      Array.isArray(module.tags)
    ) {
      const interestMatches = user.interests.filter(interest =>
        module.tags.includes(interest)
      ).length;
      score += interestMatches * 5;
    }

    // Expertise level match
    if (user.expertiseLevel === module.level) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Build prompt for OpenAI to score module relevance
   */
  private buildModuleScoringPrompt(user: any, modules: LearningModule[]): string {
    const userInfo = {
      role: user.role,
      domain: user.domain,
      expertiseLevel: user.expertiseLevel,
      interests: user.interests,
    };

    // Simplify module data for the prompt
    const simplifiedModules = modules.map(module => ({
      id: module.id,
      title: module.title,
      description: module.description,
      level: module.level,
      tags: module.tags,
      domains: module.domains,
    }));

    return `
      Please score the relevance of the following learning modules for the user based on their profile.
      
      USER PROFILE:
      ${JSON.stringify(userInfo, null, 2)}
      
      MODULES TO SCORE:
      ${JSON.stringify(simplifiedModules, null, 2)}
      
      For each module, generate a relevance score (0-100) based on:
      - How well the module matches the user's domain
      - How well the module content aligns with the user's interests
      - How appropriate the module's level is for the user's expertise
      - How useful the module would be for the user's role
      
      Return your response as a JSON object with a "scoredModules" array, where each element has:
      {
        "id": module id,
        "relevanceScore": score from 0-100,
        "reasoning": brief explanation of the score
      }
    `;
  }

  /**
   * Generate personalized learning paths for the user
   */
  async generatePersonalizedLearningPath(userId: number): Promise<any> {
    try {
      // Fetch user data
      const user = await storage.getUser(userId);
      if (!user) throw new Error('User not found');

      // Fetch all available modules
      const modules = await (storage as any).getLearningModules();

      // Fetch user's progress
      const progress = await (storage as any).getUserProgressByUserId(userId);

      const prompt = this.buildLearningPathPrompt(user as any, modules, progress);

      const aiResult = await ai.chat({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an AI learning assistant for a regulatory affairs platform. Your task is to generate a personalized 
            learning path for a user based on their profile, available learning modules, and current progress.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      // Parse the learning path from the response
      const responseContent = aiResult.content;
      return responseContent ? JSON.parse(responseContent) : { learningPath: [] };
    } catch (error) {
      console.error('Error generating learning path:', error);
      throw error;
    }
  }

  /**
   * Build prompt for OpenAI to generate personalized learning path
   */
  private buildLearningPathPrompt(user: any, modules: LearningModule[], progress: any[]): string {
    const userInfo = {
      role: user.role,
      domain: user.domain,
      expertiseLevel: user.expertiseLevel,
      interests: user.interests,
    };

    // Simplify module data for the prompt
    const simplifiedModules = modules.map(module => ({
      id: module.id,
      title: module.title,
      description: module.description,
      level: module.level,
      tags: module.tags,
      domains: module.domains,
    }));

    // Simplify progress data
    const completedModuleIds = progress.filter(p => p.moduleId && p.completed).map(p => p.moduleId);

    const inProgressModuleIds = progress
      .filter(p => p.moduleId && !p.completed && p.progress > 0)
      .map(p => p.moduleId);

    return `
      Please generate a personalized learning path for this user based on their profile, 
      available modules, and current progress.
      
      USER PROFILE:
      ${JSON.stringify(userInfo, null, 2)}
      
      CURRENT PROGRESS:
      Completed modules: ${JSON.stringify(completedModuleIds)}
      In-progress modules: ${JSON.stringify(inProgressModuleIds)}
      
      AVAILABLE MODULES:
      ${JSON.stringify(simplifiedModules, null, 2)}
      
      Generate a learning path with 3-5 tracks. Each track should:
      - Have a clear theme (e.g., "Regulatory Strategy", "CSR Mastery")
      - Include 3-5 modules in a logical sequence
      - Start with any in-progress modules if relevant to the track
      - Exclude already completed modules
      - Be tailored to the user's domain, interests, and expertise level
      
      Return your response as a JSON object with:
      {
        "learningPath": [
          {
            "trackName": "Track name",
            "description": "Track description",
            "modules": [
              {
                "id": module id,
                "rationale": "Why this module is included"
              },
              ...
            ]
          },
          ...
        ]
      }
    `;
  }
}
