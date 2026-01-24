/**
 * Blueprint API - Client-side API helper for Submission Blueprint Generator
 */

/**
 * Generate a submission blueprint
 *
 * @param {Array} modulesData Array of modules data for blueprint generation
 * @returns {Promise<Object>} Generated blueprint data
 */
export const fetchBlueprint = async modulesData => {
  const response = await fetch('/api/blueprint/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modules: modulesData }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate blueprint');
  }

  return response.json();
};
