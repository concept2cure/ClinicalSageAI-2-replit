/**
 * Quality Management Plan (QMP) Service
 *
 * This service provides methods to interact with the QMP API endpoints
 * for managing Quality Management Plans in accordance with ICH E6(R3).
 *
 * Version: 1.0.0
 * Last Updated: May 8, 2025
 */

const API_BASE_URL = '/api/qmp-api';

/**
 * Fetch the complete QMP data
 */
export const fetchQmpData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/data`);

    if (!response.ok) {
      throw new Error(`Failed to fetch QMP data: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching QMP data:', error);
    throw error;
  }
};

/**
 * Update QMP metadata
 */
export const updateMetadata = async updates => {
  try {
    const response = await fetch(`${API_BASE_URL}/metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update metadata: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating QMP metadata:', error);
    throw error;
  }
};

/**
 * Fetch QMP objectives
 */
export const fetchObjectives = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/objectives`);

    if (!response.ok) {
      throw new Error(`Failed to fetch objectives: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching QMP objectives:', error);
    throw error;
  }
};

/**
 * Create a new objective
 */
export const createObjective = async objective => {
  try {
    const response = await fetch(`${API_BASE_URL}/objectives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(objective),
    });

    if (!response.ok) {
      throw new Error(`Failed to create objective: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating QMP objective:', error);
    throw error;
  }
};

/**
 * Update an existing objective
 */
export const updateObjective = async (id, updates) => {
  try {
    const response = await fetch(`${API_BASE_URL}/objectives/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update objective: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating QMP objective:', error);
    throw error;
  }
};

/**
 * Delete an objective
 */
export const deleteObjective = async id => {
  try {
    const response = await fetch(`${API_BASE_URL}/objectives/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete objective: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting QMP objective:', error);
    throw error;
  }
};

/**
 * Fetch QMP metrics
 */
export const fetchMetrics = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/metrics`);

    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching QMP metrics:', error);
    throw error;
  }
};

/**
 * Fetch QMP audit trail
 */
export const fetchAuditTrail = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/audit-trail`);

    if (!response.ok) {
      throw new Error(`Failed to fetch audit trail: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching QMP audit trail:', error);
    throw error;
  }
};

/**
 * Validate QMP against regulatory requirements
 */
export const validateQmp = async (framework = 'ich-e6r3') => {
  try {
    const response = await fetch(`${API_BASE_URL}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ framework }),
    });

    if (!response.ok) {
      throw new Error(`Failed to validate QMP: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error validating QMP:', error);
    throw error;
  }
};

/**
 * Reorder objectives
 * This is a client-side function that calls update for each affected objective
 */
export const reorderObjectives = async objectives => {
  try {
    // In a real implementation, we would have a backend endpoint for this
    // but for now we'll simulate by updating each objective
    const results = await Promise.all(
      objectives.map((objective, index) => updateObjective(objective.id, { displayOrder: index }))
    );

    return {
      message: 'Objectives reordered successfully',
      results,
    };
  } catch (error) {
    console.error('Error reordering objectives:', error);
    throw error;
  }
};

/**
 * Default export with all service functions
 */
export default {
  fetchQmpData,
  updateMetadata,
  fetchObjectives,
  createObjective,
  updateObjective,
  deleteObjective,
  fetchMetrics,
  fetchAuditTrail,
  validateQmp,
  reorderObjectives,
};
