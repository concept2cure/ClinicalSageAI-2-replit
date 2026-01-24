/**
 * API client for CoAuthor services
 * Provides functions to interact with the CoAuthor API endpoints
 */

/**
 * Fetch CTD sections for display in the Canvas
 * @returns {Promise<Array>} Array of section objects with position and connection data
 */
export async function fetchCTDSections() {
  try {
    // We'll use mock data for now
    // In a real implementation, this would be `const response = await fetch('/api/coauthor/sections');`

    // Mock CTD sections with positioning and connections
    const mockSections = [
      {
        id: '1.1',
        title: 'Forms & Cover Letters',
        status: 'complete',
        x: 100,
        y: 100,
        connections: ['1.2'],
      },
      {
        id: '1.2',
        title: 'TOC & Indices',
        status: 'complete',
        x: 300,
        y: 100,
        connections: ['1.3', '2.1', '3.1'],
      },
      {
        id: '1.3',
        title: 'Administrative Info',
        status: 'pending',
        x: 500,
        y: 100,
        connections: ['2.1'],
      },
      {
        id: '2.1',
        title: 'CTD Overview',
        status: 'pending',
        x: 300,
        y: 200,
        connections: ['2.2', '2.3'],
      },
      {
        id: '2.2',
        title: 'Clinical Overview',
        status: 'critical',
        x: 500,
        y: 200,
        connections: ['2.3', '2.4', '2.5'],
      },
      {
        id: '2.3',
        title: 'Nonclinical Overview',
        status: 'pending',
        x: 700,
        y: 200,
        connections: ['2.4'],
      },
      {
        id: '2.4',
        title: 'Clinical Summaries',
        status: 'pending',
        x: 500,
        y: 300,
        connections: ['2.5'],
      },
      {
        id: '2.5',
        title: 'Nonclinical Summaries',
        status: 'pending',
        x: 700,
        y: 300,
      },
      {
        id: '3.1',
        title: 'Quality Reports',
        status: 'pending',
        x: 200,
        y: 400,
        connections: ['3.2', '3.3'],
      },
      {
        id: '3.2',
        title: 'Nonclinical Reports',
        status: 'pending',
        x: 400,
        y: 400,
        connections: ['3.3'],
      },
      {
        id: '3.3',
        title: 'Clinical Reports',
        status: 'critical',
        x: 600,
        y: 400,
      },
    ];

    return mockSections;
  } catch (error) {
    console.error('Error fetching CTD sections:', error);
    throw error;
  }
}

/**
 * Fetch risk connections for the Canvas visualization
 * @returns {Promise<Array>} Array of risk connection objects
 */
export async function fetchRiskConnections() {
  try {
    // We'll use mock data for now
    // In a real implementation, this would be `const response = await fetch('/api/coauthor/risks');`

    // Mock risk connections
    const mockConnections = [
      { source: '2.2', target: '3.3', riskLevel: 'high' },
      { source: '1.3', target: '2.1', riskLevel: 'medium' },
      { source: '3.1', target: '3.2', riskLevel: 'low' },
    ];

    return mockConnections;
  } catch (error) {
    console.error('Error fetching risk connections:', error);
    throw error;
  }
}

/**
 * Fetch section guidance for a specific section
 * @param {string} sectionId - The ID of the section
 * @returns {Promise<Object>} Guidance object with text and examples
 */
export async function fetchSectionGuidance(sectionId) {
  try {
    // In a real implementation, this would call the backend
    // const response = await fetch(`/api/coauthor/guidance/${sectionId}`);

    // For now, return mock guidance
    return {
      text: `Guidance for section ${sectionId} would be retrieved from the regulatory database.`,
      examples: [
        'Example 1 from FDA guidelines',
        'Example 2 from ICH guidelines',
        'Example 3 from EMA guidelines',
      ],
    };
  } catch (error) {
    console.error(`Error fetching guidance for section ${sectionId}:`, error);
    throw error;
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
    // In a real implementation, this would be:
    // const response = await fetch(`/api/coauthor/layout/${sectionId}`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ x, y })
    // });
    // return await response.json();

    // For now, just log the update and return a simulated response
    console.log(`Updated position for section ${sectionId} to x=${x}, y=${y}`);
    return { id: sectionId, x, y, updated: true };
  } catch (error) {
    console.error(`Error updating position for section ${sectionId}:`, error);
    throw error;
  }
}
