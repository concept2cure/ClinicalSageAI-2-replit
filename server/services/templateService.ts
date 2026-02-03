import { Request, Response } from 'express';
import { eq, and, ilike, desc } from 'drizzle-orm';
import { db } from '../db';
import { ectdTemplates } from '../../shared/schema';

/**
 * Template Service for eCTD Document Templates Management
 *
 * Provides CRUD operations for regulatory document templates using existing ectdTemplates table
 */
export class TemplateService {
  /**
   * Get all templates with optional filtering
   */
  async getAllTemplates(
    organizationId: number,
    filters?: {
      category?: string;
      region?: string;
      searchQuery?: string;
    }
  ) {
    try {
      if (!db) throw new Error('Database not available');

      const conditions = [
        eq(ectdTemplates.organizationId, organizationId),
        eq(ectdTemplates.isActive, true),
      ];

      if (filters?.category && filters.category !== 'all') {
        conditions.push(eq(ectdTemplates.category, filters.category));
      }

      if (filters?.searchQuery) {
        conditions.push(ilike(ectdTemplates.templateName, `%${filters.searchQuery}%`));
      }

      const templates = await db
        .select()
        .from(ectdTemplates)
        .where(and(...conditions))
        .orderBy(desc(ectdTemplates.createdAt));

      // Enhanced template categorization and transformation
      const transformedTemplates = templates.map(template => {
        const categoryInfo = this.getCategoryDisplayInfo(template.category, template.moduleNumber);
        return {
          id: template.id,
          name: template.templateName,
          title: template.templateName,
          description: template.ichGuidance || this.generateTemplateDescription(template),
          category: categoryInfo.displayName,
          module: template.moduleNumber,
          regions: categoryInfo.regions,
          tags: template.tags || [],
          downloadCount: template.usageCount || 0,
          updatedAt: template.updatedAt,
          fileUrl: template.wordTemplate,
          fileType: 'docx',
          status: 'active',
          aiGuidance: true,
          templateType: template.category,
          moduleNumber: template.moduleNumber,
          complexity: this.assessTemplateComplexity(template),
          estimatedTime: this.estimateCompletionTime(template),
          requiredExpertise: this.getRequiredExpertise(template),
        };
      });

      return {
        templates: transformedTemplates,
        totalCount: transformedTemplates.length,
        categories: this.getAvailableCategories(transformedTemplates),
        regions: this.getAvailableRegions(transformedTemplates),
      };
    } catch (error) {
      console.error('Error fetching templates:', error);
      throw new Error('Failed to fetch templates');
    }
  }

  /**
   * Enhanced category display information with regulatory context
   */
  private getCategoryDisplayInfo(category: string | null, module: string | null) {
    const categoryMap: Record<
      string,
      { displayName: string; regions: string[]; description: string }
    > = {
      quality: {
        displayName: 'eCTD Module 3 - Quality',
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
        description: 'Chemistry, Manufacturing, and Controls documentation',
      },
      clinical: {
        displayName: 'CTD Module 5 - Clinical',
        regions: ['FDA', 'EMA', 'PMDA'],
        description: 'Clinical study reports and data',
      },
      nonclinical: {
        displayName: 'CTD Module 4 - Nonclinical',
        regions: ['FDA', 'EMA', 'PMDA'],
        description: 'Pharmacology and toxicology studies',
      },
      administrative: {
        displayName: 'CTD Module 1 - Administrative',
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
        description: 'Regional administrative information',
      },
    };

    // Module-specific overrides
    if (module?.startsWith('3.2.S')) {
      return {
        displayName: 'eCTD Module 3 - Drug Substance',
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
        description: 'Drug substance quality documentation',
      };
    }
    if (module?.startsWith('3.2.P')) {
      return {
        displayName: 'eCTD Module 3 - Drug Product',
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
        description: 'Drug product quality documentation',
      };
    }
    if (module?.startsWith('3.2.A')) {
      return {
        displayName: 'eCTD Module 3 - Appendices',
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
        description: 'Quality appendices and supporting documents',
      };
    }

    const categoryKey = category || 'other';
    return (
      categoryMap[categoryKey] || {
        displayName: 'Other Templates',
        regions: ['FDA'],
        description: 'Additional regulatory templates',
      }
    );
  }

  /**
   * Generate intelligent template descriptions based on content analysis
   */
  private generateTemplateDescription(template: any): string {
    const module = template.moduleNumber;
    const category = template.category;

    if (module?.includes('3.2.S.4')) {
      return 'Comprehensive template for drug substance control documentation including specifications, analytical procedures, and batch analysis data per ICH Q6A guidelines.';
    }
    if (module?.includes('3.2.P.2')) {
      return 'Pharmaceutical development template covering formulation rationale, manufacturing process development, and quality by design principles per ICH Q8(R2).';
    }
    if (module?.includes('3.2.S.7') || module?.includes('3.2.P.8')) {
      return 'Stability studies documentation template including study design, data analysis, and shelf-life determination per ICH Q1A(R2) guidelines.';
    }
    if (category === 'quality') {
      return 'Professional eCTD Module 3 template for chemistry, manufacturing, and controls documentation with built-in regulatory guidance.';
    }

    return `Professional regulatory template for ${template.templateName.toLowerCase()} with integrated compliance checking and AI-powered guidance.`;
  }

  /**
   * Assess template complexity based on regulatory requirements
   */
  private assessTemplateComplexity(
    template: any
  ): 'Basic' | 'Intermediate' | 'Advanced' | 'Expert' {
    const module = template.moduleNumber;

    // Expert level templates
    if (module?.includes('3.2.P.2') || module?.includes('3.2.S.2')) {
      return 'Expert'; // Pharmaceutical development, manufacturing
    }

    // Advanced level templates
    if (
      module?.includes('3.2.S.4') ||
      module?.includes('3.2.P.5') ||
      module?.includes('3.2.S.7') ||
      module?.includes('3.2.P.8')
    ) {
      return 'Advanced'; // Control sections, stability
    }

    // Intermediate level templates
    if (module?.includes('3.2.S.1') || module?.includes('3.2.P.1') || module?.includes('3.2.A')) {
      return 'Intermediate'; // General information, appendices
    }

    return 'Basic';
  }

  /**
   * Estimate completion time based on template complexity and requirements
   */
  private estimateCompletionTime(template: any): string {
    const complexity = this.assessTemplateComplexity(template);
    const timeMap = {
      Basic: '2-4 hours',
      Intermediate: '1-2 days',
      Advanced: '3-5 days',
      Expert: '1-2 weeks',
    };

    return timeMap[complexity];
  }

  /**
   * Determine required expertise level for template completion
   */
  private getRequiredExpertise(template: any): string[] {
    const module = template.moduleNumber;
    const expertise = [];

    if (module?.includes('3.2.S') || module?.includes('3.2.P')) {
      expertise.push('CMC Specialist');
    }
    if (module?.includes('3.2.S.2') || module?.includes('3.2.P.2') || module?.includes('3.2.P.3')) {
      expertise.push('Manufacturing Scientist');
    }
    if (module?.includes('3.2.S.4') || module?.includes('3.2.P.5')) {
      expertise.push('Analytical Chemist');
    }
    if (module?.includes('3.2.S.7') || module?.includes('3.2.P.8')) {
      expertise.push('Stability Scientist');
    }
    if (module?.includes('3.2.A.1')) {
      expertise.push('Quality Engineer');
    }

    return expertise.length > 0 ? expertise : ['Regulatory Affairs Specialist'];
  }

  /**
   * Extract available categories from templates
   */
  private getAvailableCategories(templates: any[]): string[] {
    return [...new Set(templates.map(t => t.category))];
  }

  /**
   * Extract available regions from templates
   */
  private getAvailableRegions(templates: any[]): string[] {
    return [...new Set(templates.flatMap(t => t.regions))];
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: number, organizationId: number) {
    try {
      if (!db) throw new Error('Database not available');

      const [template] = await db
        .select()
        .from(ectdTemplates)
        .where(and(eq(ectdTemplates.id, id), eq(ectdTemplates.organizationId, organizationId)))
        .limit(1);

      if (!template) return null;

      // Transform to match frontend expectations
      return {
        id: template.id,
        name: template.templateName,
        title: template.templateName,
        description: template.ichGuidance || 'eCTD regulatory template',
        category: template.category,
        module: template.moduleNumber,
        content: template.content,
        fileUrl: template.wordTemplate,
      };
    } catch (error) {
      console.error('Error fetching template by ID:', error);
      throw new Error('Failed to fetch template');
    }
  }

  /**
   * Create new template
   */
  async createTemplate(templateData: {
    name: string;
    category: string;
    module?: string;
    description?: string;
    organizationId: number;
    createdBy?: number;
    fileUrl?: string;
    templateType?: string;
    granuleId?: string;
    ichGuidance?: string;
    tags?: string[];
    type?: string;
    fileSize?: number;
    fileType?: string;
    version?: string;
    isPublic?: boolean;
  }) {
    try {
      if (!db) throw new Error('Database not available');

      const insertData: any = {
        organizationId: templateData.organizationId,
        templateName: templateData.name,
        category: templateData.category,
        moduleNumber: templateData.module,
        granuleId: templateData.granuleId,
        templateType: templateData.templateType || templateData.type || 'custom',
        ichGuidance: templateData.description || templateData.ichGuidance,
        wordTemplate: templateData.fileUrl,
        isActive: true,
        isDefault: false,
        version: templateData.version || '1.0',
        usageCount: 0,
        createdBy: templateData.createdBy || 1,
        tags: templateData.tags || [],
      };

      const [newTemplate] = await db.insert(ectdTemplates).values(insertData).returning();

      return {
        id: newTemplate.id,
        name: newTemplate.templateName,
        category: newTemplate.category,
        success: true,
      };
    } catch (error) {
      console.error('Error creating template:', error);
      throw new Error('Failed to create template');
    }
  }

  /**
   * Track template usage
   */
  async trackTemplateUsage(templateId: number, usageType: string) {
    try {
      if (!db) throw new Error('Database not available');

      // Get current template to increment usage count
      const [template] = await db
        .select()
        .from(ectdTemplates)
        .where(eq(ectdTemplates.id, templateId))
        .limit(1);

      if (template) {
        await db
          .update(ectdTemplates)
          .set({
            usageCount: (template.usageCount || 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(ectdTemplates.id, templateId));
      }

      return { success: true };
    } catch (error) {
      console.error('Error tracking template usage:', error);
      throw new Error('Failed to track template usage');
    }
  }

  /**
   * Get recent documents (placeholder - would need separate table)
   */
  async getRecentDocuments(userId: number, organizationId: number, limit = 10) {
    try {
      // Return empty array since we don't have a recent documents table yet
      return { documents: [] };
    } catch (error) {
      console.error('Error fetching recent documents:', error);
      throw new Error('Failed to fetch recent documents');
    }
  }

  /**
   * Get featured templates (most used)
   */
  async getFeaturedTemplates(organizationId: number, limit = 5) {
    try {
      if (!db) throw new Error('Database not available');

      const templates = await db
        .select()
        .from(ectdTemplates)
        .where(
          and(eq(ectdTemplates.organizationId, organizationId), eq(ectdTemplates.isActive, true))
        )
        .orderBy(desc(ectdTemplates.usageCount))
        .limit(limit);

      const transformedTemplates = templates.map(template => ({
        id: template.id,
        name: template.templateName,
        category: template.category,
        downloadCount: template.usageCount || 0,
        description: template.ichGuidance || 'eCTD regulatory template',
      }));

      return { templates: transformedTemplates };
    } catch (error) {
      console.error('Error fetching featured templates:', error);
      throw new Error('Failed to fetch featured templates');
    }
  }

  /**
   * Initialize default templates if database is empty
   */
  async initializeDefaultTemplates(organizationId: number) {
    try {
      if (!db) throw new Error('Database not available');

      // Check if templates already exist
      const existingTemplates = await db
        .select()
        .from(ectdTemplates)
        .where(eq(ectdTemplates.organizationId, organizationId))
        .limit(1);

      if (existingTemplates.length > 0) {
        return { message: 'Templates already exist' };
      }

      // Insert default eCTD templates
      const defaultTemplates = [
        {
          organizationId,
          templateName: 'Clinical Protocol Template',
          granuleId: '3.2.P.1',
          moduleNumber: '3.2.P',
          category: 'clinical',
          templateType: 'ich_standard',
          ichGuidance: 'ICH M4 compliant clinical protocol template for regulatory submissions',
          isActive: true,
          isDefault: true,
          version: '1.0',
          usageCount: 0,
          tags: ['protocol', 'clinical', 'ich'],
          createdBy: 1,
        },
        {
          organizationId,
          templateName: 'NDA Cover Letter Template',
          granuleId: '1.2',
          moduleNumber: '1',
          category: 'administrative',
          templateType: 'ich_standard',
          ichGuidance: 'Standard cover letter template for NDA submissions to FDA',
          isActive: true,
          isDefault: true,
          version: '1.0',
          usageCount: 0,
          tags: ['nda', 'cover-letter', 'administrative'],
          createdBy: 1,
        },
        {
          organizationId,
          templateName: 'Clinical Overview Template',
          granuleId: '2.5',
          moduleNumber: '2',
          category: 'clinical',
          templateType: 'ich_standard',
          ichGuidance: 'Comprehensive clinical overview template following ICH M4 guidelines',
          isActive: true,
          isDefault: true,
          version: '1.0',
          usageCount: 0,
          tags: ['overview', 'clinical', 'module-2'],
          createdBy: 1,
        },
      ];

      for (const template of defaultTemplates) {
        await db.insert(ectdTemplates).values(template);
      }

      return {
        message: 'Default templates initialized successfully',
        count: defaultTemplates.length,
      };
    } catch (error) {
      console.error('Error initializing default templates:', error);
      throw new Error('Failed to initialize default templates');
    }
  }

  /**
   * Update existing template
   */
  async updateTemplate(
    templateId: number,
    organizationId: number,
    updateData: {
      name?: string;
      category?: string;
      module?: string;
      description?: string;
      templateType?: string;
      granuleId?: string;
      ichGuidance?: string;
      tags?: string[];
      isActive?: boolean;
      fileUrl?: string;
    }
  ) {
    try {
      if (!db) throw new Error('Database not available');

      const updateFields: any = {};

      if (updateData.name) updateFields.templateName = updateData.name;
      if (updateData.category) updateFields.category = updateData.category;
      if (updateData.module) updateFields.moduleNumber = updateData.module;
      if (updateData.description) updateFields.ichGuidance = updateData.description;
      if (updateData.templateType) updateFields.templateType = updateData.templateType;
      if (updateData.granuleId) updateFields.granuleId = updateData.granuleId;
      if (updateData.ichGuidance) updateFields.ichGuidance = updateData.ichGuidance;
      if (updateData.tags) updateFields.tags = updateData.tags;
      if (updateData.isActive !== undefined) updateFields.isActive = updateData.isActive;
      if (updateData.fileUrl) updateFields.wordTemplate = updateData.fileUrl;

      updateFields.updatedAt = new Date();

      const [updatedTemplate] = await db
        .update(ectdTemplates)
        .set(updateFields)
        .where(
          and(eq(ectdTemplates.id, templateId), eq(ectdTemplates.organizationId, organizationId))
        )
        .returning();

      if (!updatedTemplate) return null;

      return {
        id: updatedTemplate.id,
        name: updatedTemplate.templateName,
        category: updatedTemplate.category,
        module: updatedTemplate.moduleNumber,
        success: true,
      };
    } catch (error) {
      console.error('Error updating template:', error);
      throw new Error('Failed to update template');
    }
  }

  /**
   * Delete template (soft delete)
   */
  async deleteTemplate(templateId: number, organizationId: number) {
    try {
      if (!db) throw new Error('Database not available');

      const [deletedTemplate] = await db
        .update(ectdTemplates)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(eq(ectdTemplates.id, templateId), eq(ectdTemplates.organizationId, organizationId))
        )
        .returning();

      return deletedTemplate ? { success: true } : null;
    } catch (error) {
      console.error('Error deleting template:', error);
      throw new Error('Failed to delete template');
    }
  }

  /**
   * Duplicate existing template
   */
  async duplicateTemplate(templateId: number, organizationId: number, newName?: string) {
    try {
      if (!db) throw new Error('Database not available');

      // Get original template
      const [originalTemplate] = await db
        .select()
        .from(ectdTemplates)
        .where(
          and(eq(ectdTemplates.id, templateId), eq(ectdTemplates.organizationId, organizationId))
        )
        .limit(1);

      if (!originalTemplate) return null;

      // Create duplicate
      const duplicateData: any = {
        organizationId: originalTemplate.organizationId,
        templateName: newName || `${originalTemplate.templateName} (Copy)`,
        granuleId: originalTemplate.granuleId,
        moduleNumber: originalTemplate.moduleNumber,
        category: originalTemplate.category,
        templateType: 'custom', // Mark as custom even if original was standard
        content: originalTemplate.content,
        placeholders: originalTemplate.placeholders,
        ichGuidance: originalTemplate.ichGuidance,
        wordTemplate: originalTemplate.wordTemplate,
        isActive: true,
        isDefault: false,
        version: '1.0',
        usageCount: 0,
        tags: originalTemplate.tags || [],
        createdBy: 1, // TODO: Get from authentication
      };

      const [duplicatedTemplate] = await db.insert(ectdTemplates).values(duplicateData).returning();

      return {
        id: duplicatedTemplate.id,
        name: duplicatedTemplate.templateName,
        category: duplicatedTemplate.category,
        success: true,
      };
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw new Error('Failed to duplicate template');
    }
  }
}

// Export a singleton instance
export const templateService = new TemplateService();
