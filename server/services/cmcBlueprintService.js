/**
 * AI-CMC Blueprint Generator Service
 *
 * Provides functionality for generating and managing Chemistry, Manufacturing,
 * and Controls (CMC) documentation for regulatory submissions.
 */

import { supabase } from '../lib/supabaseClient.js';
import { logger } from '../utils/logger.js';
import { getOpenAIClient } from './openai-client';

// Initialize OpenAI with API key from environment
const openai = getOpenAIClient();

class CMCBlueprintService {
  /**
   * Create a new CMC blueprint from a template
   *
   * @param {string} name - Blueprint name
   * @param {string} description - Blueprint description
   * @param {string} templateId - Template ID
   * @param {string} productName - Product name
   * @param {string} tenantId - Tenant ID
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - The created blueprint
   */
  async createBlueprint(name, description, templateId, productName, tenantId, projectId, userId) {
    try {
      // Get the template
      const { data: template, error: templateError } = await supabase
        .from('cmc_blueprint_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError || !template) {
        throw new Error(`Template not found: ${templateError?.message}`);
      }

      // Create a new blueprint based on the template
      const { data: blueprint, error: blueprintError } = await supabase
        .from('cmc_blueprints')
        .insert({
          name,
          description,
          template_id: templateId,
          product_name: productName,
          tenant_id: tenantId,
          project_id: projectId,
          structure: template.structure,
          content: {},
          status: 'DRAFT',
          created_by: userId,
          updated_by: userId,
        })
        .select('*')
        .single();

      if (blueprintError) {
        throw new Error(`Failed to create blueprint: ${blueprintError.message}`);
      }

      logger.info(`Created new CMC blueprint: ${blueprint.id}`);
      return blueprint;
    } catch (err) {
      logger.error(`Error in createBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Get a CMC blueprint by ID
   *
   * @param {string} blueprintId - Blueprint ID
   * @returns {Promise<Object>} - The blueprint
   */
  async getBlueprint(blueprintId) {
    try {
      const { data: blueprint, error } = await supabase
        .from('cmc_blueprints')
        .select(
          `
          *,
          template:template_id(id, name, region, category),
          created_by_user:created_by(name, email),
          updated_by_user:updated_by(name, email)
        `
        )
        .eq('id', blueprintId)
        .single();

      if (error) {
        throw new Error(`Blueprint not found: ${error.message}`);
      }

      return blueprint;
    } catch (err) {
      logger.error(`Error in getBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Update a CMC blueprint
   *
   * @param {string} blueprintId - Blueprint ID
   * @param {Object} updates - Updates to apply
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - The updated blueprint
   */
  async updateBlueprint(blueprintId, updates, userId) {
    try {
      // Check if blueprint exists
      const { data: existing, error: existingError } = await supabase
        .from('cmc_blueprints')
        .select('id, is_locked, locked_by')
        .eq('id', blueprintId)
        .single();

      if (existingError) {
        throw new Error(`Blueprint not found: ${existingError.message}`);
      }

      // Check if blueprint is locked
      if (existing.is_locked && existing.locked_by !== userId) {
        throw new Error('Blueprint is locked by another user');
      }

      // Prepare updates
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      };

      // Update the blueprint
      const { data: blueprint, error } = await supabase
        .from('cmc_blueprints')
        .update(updateData)
        .eq('id', blueprintId)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update blueprint: ${error.message}`);
      }

      logger.info(`Updated CMC blueprint: ${blueprint.id}`);
      return blueprint;
    } catch (err) {
      logger.error(`Error in updateBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Lock a blueprint for editing
   *
   * @param {string} blueprintId - Blueprint ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Lock status
   */
  async lockBlueprint(blueprintId, userId) {
    try {
      // Check current lock status
      const { data: existing, error: existingError } = await supabase
        .from('cmc_blueprints')
        .select('id, is_locked, locked_by, locked_at')
        .eq('id', blueprintId)
        .single();

      if (existingError) {
        throw new Error(`Blueprint not found: ${existingError.message}`);
      }

      // If already locked by someone else
      if (existing.is_locked && existing.locked_by !== userId) {
        throw new Error('Blueprint is already locked by another user');
      }

      // Update lock status
      const { data: blueprint, error } = await supabase
        .from('cmc_blueprints')
        .update({
          is_locked: true,
          locked_by: userId,
          locked_at: new Date().toISOString(),
        })
        .eq('id', blueprintId)
        .select('id, is_locked, locked_by, locked_at')
        .single();

      if (error) {
        throw new Error(`Failed to lock blueprint: ${error.message}`);
      }

      logger.info(`Locked CMC blueprint: ${blueprint.id} by user ${userId}`);
      return blueprint;
    } catch (err) {
      logger.error(`Error in lockBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Unlock a blueprint
   *
   * @param {string} blueprintId - Blueprint ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Lock status
   */
  async unlockBlueprint(blueprintId, userId) {
    try {
      // Check current lock status
      const { data: existing, error: existingError } = await supabase
        .from('cmc_blueprints')
        .select('id, is_locked, locked_by')
        .eq('id', blueprintId)
        .single();

      if (existingError) {
        throw new Error(`Blueprint not found: ${existingError.message}`);
      }

      // If locked by another user, only admins can unlock
      if (existing.is_locked && existing.locked_by !== userId) {
        // TODO: Check if user is admin
        throw new Error('Blueprint is locked by another user');
      }

      // Update lock status
      const { data: blueprint, error } = await supabase
        .from('cmc_blueprints')
        .update({
          is_locked: false,
          locked_by: null,
          locked_at: null,
        })
        .eq('id', blueprintId)
        .select('id, is_locked')
        .single();

      if (error) {
        throw new Error(`Failed to unlock blueprint: ${error.message}`);
      }

      logger.info(`Unlocked CMC blueprint: ${blueprint.id} by user ${userId}`);
      return blueprint;
    } catch (err) {
      logger.error(`Error in unlockBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Generate content for a specific section using AI
   *
   * @param {string} blueprintId - Blueprint ID
   * @param {string} sectionPath - Section path (e.g., "3.2.S.1.1")
   * @param {Object} context - Context information for generation
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Generated content
   */
  async generateSectionContent(blueprintId, sectionPath, context, userId) {
    try {
      // Get blueprint information
      const { data: blueprint, error: blueprintError } = await supabase
        .from('cmc_blueprints')
        .select('*')
        .eq('id', blueprintId)
        .single();

      if (blueprintError) {
        throw new Error(`Blueprint not found: ${blueprintError.message}`);
      }

      // Get tenant AI settings
      const { data: aiSettings, error: settingsError } = await supabase
        .from('cmc_ai_settings')
        .select('*')
        .eq('tenant_id', blueprint.tenant_id)
        .single();

      // Default settings if not found
      const settings = aiSettings || {
        model_name: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 2000,
        content_style: 'FORMAL',
        citations_required: true,
      };

      // Get prompt template for this section type
      const { data: promptTemplate, error: promptError } = await supabase
        .from('cmc_prompt_templates')
        .select('*')
        .eq('section_type', sectionPath)
        .single();

      if (promptError) {
        logger.warn(`No specific prompt template found for section ${sectionPath}, using default`);
      }

      // Build the prompt
      let prompt = '';
      let systemPrompt = '';

      if (promptTemplate) {
        // Replace template variables
        prompt = this._replaceTemplateVariables(promptTemplate.prompt_template, {
          ...context,
          product_name: blueprint.product_name,
        });

        systemPrompt =
          promptTemplate.system_prompt ||
          'You are an expert regulatory writer specializing in creating Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical regulatory submissions.';
      } else {
        // Default prompt if no template exists
        prompt = `Generate a professional regulatory submission section for ${sectionPath} of a CMC document for ${blueprint.product_name}. 
          Include all standard elements required for this section according to ICH guidelines.
          Context information: ${JSON.stringify(context)}`;

        systemPrompt =
          'You are an expert regulatory writer specializing in creating Chemistry, Manufacturing, and Controls (CMC) documentation for pharmaceutical regulatory submissions.';
      }

      // Call OpenAI API
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
      });

      const generatedContent = response.choices[0].message.content;

      // Log this generation
      await supabase.from('cmc_generation_log').insert({
        blueprint_id: blueprintId,
        section_path: sectionPath,
        prompt,
        generated_content: generatedContent,
        model_used: 'gpt-4o',
        tokens_used: response.usage?.total_tokens || 0,
        created_by: userId,
      });

      // Update the blueprint content with this new section
      // First get current content
      const content = blueprint.content || {};

      // Update section content
      content[sectionPath] = generatedContent;

      // Save updated content
      await this.updateBlueprint(blueprintId, { content }, userId);

      return {
        section_path: sectionPath,
        content: generatedContent,
        tokens_used: response.usage?.total_tokens || 0,
      };
    } catch (err) {
      logger.error(`Error in generateSectionContent: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Get section library items
   *
   * @param {string} category - Section category
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Array>} - Library items
   */
  async getSectionLibraryItems(category, tenantId) {
    try {
      // Get tenant-specific and global items
      const { data, error } = await supabase
        .from('cmc_section_library')
        .select('*')
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .eq('category', category)
        .eq('approval_status', 'APPROVED')
        .order('title', { ascending: true });

      if (error) {
        throw new Error(`Failed to get section library: ${error.message}`);
      }

      return data;
    } catch (err) {
      logger.error(`Error in getSectionLibrary: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Generate a complete blueprint
   *
   * @param {string} blueprintId - Blueprint ID
   * @param {Object} context - Context information for generation
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Generation status
   */
  async generateCompleteBlueprint(blueprintId, context, userId) {
    try {
      // Get blueprint information
      const { data: blueprint, error: blueprintError } = await supabase
        .from('cmc_blueprints')
        .select('*')
        .eq('id', blueprintId)
        .single();

      if (blueprintError) {
        throw new Error(`Blueprint not found: ${blueprintError.message}`);
      }

      // Extract all section paths from the structure
      const sectionPaths = this._extractSectionPaths(blueprint.structure);

      // Generate content for each section sequentially
      const results = [];
      for (const sectionPath of sectionPaths) {
        try {
          // Skip sections that already have content
          if (blueprint.content && blueprint.content[sectionPath]) {
            results.push({
              section_path: sectionPath,
              status: 'SKIPPED',
              message: 'Section already has content',
            });
            continue;
          }

          // Generate content for this section
          const result = await this.generateSectionContent(
            blueprintId,
            sectionPath,
            context,
            userId
          );

          results.push({
            section_path: sectionPath,
            status: 'SUCCESS',
            tokens_used: result.tokens_used,
          });

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (sectionErr) {
          results.push({
            section_path: sectionPath,
            status: 'ERROR',
            message: sectionErr.message,
          });
        }
      }

      // Update blueprint status
      await this.updateBlueprint(blueprintId, { status: 'DRAFT_COMPLETE' }, userId);

      return {
        blueprint_id: blueprintId,
        sections_processed: results.length,
        sections_successful: results.filter(r => r.status === 'SUCCESS').length,
        sections_skipped: results.filter(r => r.status === 'SKIPPED').length,
        sections_failed: results.filter(r => r.status === 'ERROR').length,
        results,
      };
    } catch (err) {
      logger.error(`Error in generateCompleteBlueprint: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * List available templates
   *
   * @param {string} region - Optional region filter
   * @param {string} category - Optional category filter
   * @returns {Promise<Array>} - Templates
   */
  async listTemplates(region, category) {
    try {
      let query = supabase.from('cmc_blueprint_templates').select('*').eq('is_active', true);

      if (region) {
        query = query.eq('region', region);
      }

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        throw new Error(`Failed to list templates: ${error.message}`);
      }

      return data;
    } catch (err) {
      logger.error(`Error in listTemplates: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Export blueprint to Word document
   *
   * @param {string} blueprintId - Blueprint ID
   * @returns {Promise<Buffer>} - Document buffer
   */
  async exportToWord(blueprintId) {
    try {
      // Get blueprint information
      const { data: blueprint, error: blueprintError } = await supabase
        .from('cmc_blueprints')
        .select('*')
        .eq('id', blueprintId)
        .single();

      if (blueprintError) {
        throw new Error(`Blueprint not found: ${blueprintError.message}`);
      }

      // TODO: Implement Word document generation
      // This would require a document generation library

      // Placeholder implementation
      throw new Error('Word export not yet implemented');
    } catch (err) {
      logger.error(`Error in exportToWord: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Export blueprint to PDF document
   *
   * @param {string} blueprintId - Blueprint ID
   * @returns {Promise<Buffer>} - Document buffer
   */
  async exportToPdf(blueprintId) {
    try {
      // Get blueprint information
      const { data: blueprint, error: blueprintError } = await supabase
        .from('cmc_blueprints')
        .select('*')
        .eq('id', blueprintId)
        .single();

      if (blueprintError) {
        throw new Error(`Blueprint not found: ${blueprintError.message}`);
      }

      // TODO: Implement PDF document generation
      // This would require a PDF generation library

      // Placeholder implementation
      throw new Error('PDF export not yet implemented');
    } catch (err) {
      logger.error(`Error in exportToPdf: ${err.message}`, err);
      throw err;
    }
  }

  // Private helper methods

  /**
   * Replace template variables in a string
   *
   * @param {string} template - Template string
   * @param {Object} variables - Variables to replace
   * @returns {string} - String with variables replaced
   * @private
   */
  _replaceTemplateVariables(template, variables) {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Extract all section paths from a blueprint structure
   *
   * @param {Object} structure - Blueprint structure
   * @returns {Array} - Array of section paths
   * @private
   */
  _extractSectionPaths(structure) {
    const paths = [];

    // Recursive function to extract paths
    const extractPaths = (section, parentPath = null) => {
      const currentPath = section.id;
      paths.push(currentPath);

      if (section.subsections && section.subsections.length > 0) {
        for (const subsection of section.subsections) {
          extractPaths(subsection);
        }
      }
    };

    // Process each section
    if (structure && structure.sections) {
      for (const section of structure.sections) {
        extractPaths(section);
      }
    }

    return paths;
  }
}

export default new CMCBlueprintService();
