/**
 * API client for CoAuthor services
 * Provides functions to interact with the CoAuthor API endpoints
 */
import { apiRequest } from '@/lib/queryClient';

/**
 * Fetch CTD sections for display in the Canvas
 * @returns {Promise<Array>} Array of section objects with position and connection data
 */
export async function fetchCTDSections() {
  try {
    const response = await apiRequest('GET', '/api/coauthor/sections');
    if (!response.ok) {
      console.error('Failed to fetch CTD sections:', response.status);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching CTD sections:', error);
    return [];
  }
}

/**
 * Fetch risk connections for the Canvas visualization
 * @returns {Promise<Array>} Array of risk connection objects
 */
export async function fetchRiskConnections() {
  try {
    const response = await apiRequest('GET', '/api/coauthor/risks');
    if (!response.ok) {
      console.error('Failed to fetch risk connections:', response.status);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching risk connections:', error);
    return [];
  }
}

/**
 * Fetch section guidance for a specific section
 * @param {string} sectionId - The ID of the section
 * @returns {Promise<Object>} Guidance object with text and examples
 */
export async function fetchSectionGuidance(sectionId) {
  try {
    const response = await apiRequest('GET', `/api/coauthor/guidance/${sectionId}`);
    if (!response.ok) {
      console.error(`Failed to fetch guidance for section ${sectionId}:`, response.status);
      return { text: '', examples: [] };
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching guidance for section ${sectionId}:`, error);
    return { text: '', examples: [] };
  }
}

/**
 * Update the position of a section in the Canvas
 * @param {string} sectionId - The ID of the section
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {Promise<Object>} The updated section object
 */
export async function updateSectionPosition(sectionId, x, y) {
  try {
    const response = await apiRequest('POST', `/api/coauthor/layout/${sectionId}`, { x, y });
    if (!response.ok) {
      console.error(`Failed to update position for section ${sectionId}:`, response.status);
      return { id: sectionId, x, y, updated: false };
    }
    return await response.json();
  } catch (error) {
    console.error(`Error updating position for section ${sectionId}:`, error);
    return { id: sectionId, x, y, updated: false };
  }
}
