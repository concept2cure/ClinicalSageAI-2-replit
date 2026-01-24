/**
 * Document Section Recommender Service
 *
 * This service handles interactions with the section recommender API,
 * providing intelligent section recommendations and content suggestions
 * for regulatory document creation.
 */

import { apiRequest } from '../lib/queryClient';

class DocumentSectionRecommenderService {
  /**
   * Get recommended sections for a document based on device profile
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {Object} deviceProfile - The device profile information
   * @returns {Promise<Array>} - Array of recommended sections
   */
  async getRecommendedSections(documentType, deviceProfile) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/sections',
        method: 'POST',
        data: {
          documentType,
          deviceProfile,
        },
      });

      return response.sections;
    } catch (error) {
      console.error('Error getting recommended sections:', error);
      throw error;
    }
  }

  /**
   * Get content suggestions for a specific section
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {string} sectionKey - The section key
   * @param {Object} deviceProfile - The device profile information
   * @param {Object} predicateDevice - Optional predicate device information (for 510k)
   * @returns {Promise<Array>} - Array of content suggestions
   */
  async getSectionContentSuggestions(
    documentType,
    sectionKey,
    deviceProfile,
    predicateDevice = null
  ) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/content-suggestions',
        method: 'POST',
        data: {
          documentType,
          sectionKey,
          deviceProfile,
          predicateDevice,
        },
      });

      return response.suggestions;
    } catch (error) {
      console.error('Error getting content suggestions:', error);
      throw error;
    }
  }

  /**
   * Get requirements for a specific section
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {string} sectionKey - The section key
   * @returns {Promise<Array>} - Array of section requirements
   */
  async getSectionRequirements(documentType, sectionKey) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/requirements',
        method: 'GET',
        params: {
          documentType,
          sectionKey,
        },
      });

      return response.requirements;
    } catch (error) {
      console.error('Error getting section requirements:', error);
      throw error;
    }
  }

  /**
   * Get regulatory guidance for a specific section
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {string} sectionKey - The section key
   * @returns {Promise<Object>} - Regulatory guidance information
   */
  async getRegulatoryGuidance(documentType, sectionKey) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/guidance',
        method: 'GET',
        params: {
          documentType,
          sectionKey,
        },
      });

      return response.guidance;
    } catch (error) {
      console.error('Error getting regulatory guidance:', error);
      throw error;
    }
  }

  /**
   * Analyze content gaps in a document
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {Object} deviceProfile - The device profile information
   * @param {Object} existingContent - Content that already exists in the document
   * @returns {Promise<Object>} - Gap analysis results
   */
  async analyzeContentGaps(documentType, deviceProfile, existingContent) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/gap-analysis',
        method: 'POST',
        data: {
          documentType,
          deviceProfile,
          existingContent,
        },
      });

      return response.analysis;
    } catch (error) {
      console.error('Error analyzing content gaps:', error);
      throw error;
    }
  }

  /**
   * Generate a regulatory overview for a device
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {Object} deviceProfile - The device profile information
   * @returns {Promise<Object>} - Regulatory overview information
   */
  async generateRegulatoryOverview(documentType, deviceProfile) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/regulatory-overview',
        method: 'POST',
        data: {
          documentType,
          deviceProfile,
        },
      });

      return response.overview;
    } catch (error) {
      console.error('Error generating regulatory overview:', error);
      throw error;
    }
  }

  /**
   * Generate section content based on device profile
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {string} sectionKey - The section key
   * @param {Object} deviceProfile - The device profile information
   * @param {Object} predicateDevice - Optional predicate device information (for 510k)
   * @param {string} existingContent - Optional existing content to improve
   * @returns {Promise<Object>} - Generated content
   */
  async generateSectionContent(
    documentType,
    sectionKey,
    deviceProfile,
    predicateDevice = null,
    existingContent = ''
  ) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/generate-content',
        method: 'POST',
        data: {
          documentType,
          sectionKey,
          deviceProfile,
          predicateDevice,
          existingContent,
        },
      });

      return response.content;
    } catch (error) {
      console.error('Error generating section content:', error);
      throw error;
    }
  }

  /**
   * Validate section content against regulatory requirements
   *
   * @param {string} documentType - The type of document (e.g., '510k', 'cer')
   * @param {string} sectionKey - The section key
   * @param {string} content - The content to validate
   * @returns {Promise<Object>} - Validation results
   */
  async validateSectionContent(documentType, sectionKey, content) {
    try {
      const response = await apiRequest({
        url: '/api/section-recommender/validate-content',
        method: 'POST',
        data: {
          documentType,
          sectionKey,
          content,
        },
      });

      return response.validation;
    } catch (error) {
      console.error('Error validating section content:', error);
      throw error;
    }
  }
}

// Singleton instance
const documentSectionRecommenderService = new DocumentSectionRecommenderService();

export default documentSectionRecommenderService;
