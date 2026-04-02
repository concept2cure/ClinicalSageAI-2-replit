/**
 * Blueprint API - Client-side API helper for Submission Blueprint Generator
 */
import { apiRequest } from '@/lib/queryClient';

/**
 * Generate a submission blueprint
 *
 * @param {Array} modulesData Array of modules data for blueprint generation
 * @returns {Promise<Object>} Generated blueprint data
 */
export const fetchBlueprint = async modulesData => {
  const response = await apiRequest('POST', '/api/blueprint/generate', { modules: modulesData });

  if (!response.ok) {
    throw new Error('Failed to generate blueprint');
  }

  return response.json();
};
