/**
 * API client for CoAuthor services
 * Provides functions to interact with the CoAuthor API endpoints
 */

import { authService } from '../services/authService';

const getOrganizationId = () =>
  localStorage.getItem('currentOrganizationId') || localStorage.getItem('organizationId');

const buildHeaders = (extraHeaders = {}) => {
  const token = authService.getToken();
  const organizationId = getOrganizationId();
  const headers = { ...extraHeaders };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (organizationId) {
    headers['X-Organization-Id'] = organizationId;
  }

  return headers;
};

const parseError = async response => {
  const payload = await response.json().catch(() => ({}));
  return payload?.error || payload?.message || 'Request failed';
};

/**
 * Fetch CTD sections for display in the Canvas
 * @returns {Promise<Array>} Array of section objects with position and connection data
 */
export async function fetchCTDSections() {
  try {
    const response = await fetch('/api/coauthor/sections', {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
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
    const response = await fetch('/api/coauthor/risks', {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
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
    const response = await fetch(`/api/coauthor/guidance/${sectionId}`, {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
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
    const response = await fetch(`/api/coauthor/layout/${sectionId}`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ x, y }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error(`Error updating position for section ${sectionId}:`, error);
    throw error;
  }
}

export async function fetchSectionAnnotation(sectionId) {
  try {
    const response = await fetch(`/api/coauthor/annotation/${sectionId}`, {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error(`Error fetching annotation for section ${sectionId}:`, error);
    throw error;
  }
}

export async function saveSectionAnnotation(sectionId, notes) {
  try {
    const response = await fetch(`/api/coauthor/annotation/${sectionId}`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ notes }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return true;
  } catch (error) {
    console.error(`Error saving annotation for section ${sectionId}:`, error);
    throw error;
  }
}

export async function fetchSectionAdvice(sectionId, text) {
  try {
    const response = await fetch('/api/coauthor/advice', {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sectionId, text }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error(`Error fetching AI advice for section ${sectionId}:`, error);
    throw error;
  }
}

export async function searchCoauthorComponents(query, options = {}) {
  try {
    const response = await fetch('/api/coauthor/search', {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, ...options }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error('Error searching coauthor components:', error);
    throw error;
  }
}

export async function chatWithCoauthor(query, documentContext = []) {
  try {
    const response = await fetch('/api/coauthor/chat', {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, documentContext }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error('Error chatting with coauthor assistant:', error);
    throw error;
  }
}

export async function fetchValidationRules({ agency = 'ALL', module = 'ALL' } = {}) {
  try {
    const params = new URLSearchParams();
    if (agency) params.set('agency', agency);
    if (module) params.set('module', module);

    const response = await fetch(`/api/coauthor/validate/rules?${params.toString()}`, {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching validation rules:', error);
    throw error;
  }
}
