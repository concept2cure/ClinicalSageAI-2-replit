/**
 * Protocol API - Client-side API helper for Protocol Designer module
 */
import { apiRequest } from '@/lib/queryClient';

/**
 * Get protocol data by ID
 *
 * @param {string} id Protocol ID
 * @returns {Promise<Object>} Protocol data
 */
export const getProtocol = async id => {
  const response = await apiRequest('GET', `/api/protocol/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch protocol');
  }
  return response.json();
};

/**
 * Save protocol data
 *
 * @param {Object} protocol Protocol data to save
 * @returns {Promise<Object>} Saved protocol data
 */
export const saveProtocol = async protocol => {
  const response = await apiRequest('POST', '/api/protocol/save', protocol);

  if (!response.ok) {
    throw new Error('Failed to save protocol');
  }

  return response.json();
};

/**
 * Generate schedule table based on protocol data
 *
 * @param {Object} protocol Protocol data
 * @returns {Promise<Array>} Generated schedule array
 */
export const generateSchedule = async protocol => {
  const response = await apiRequest('POST', '/api/protocol/generate-schedule', protocol);

  if (!response.ok) {
    throw new Error('Failed to generate schedule');
  }

  return response.json();
};

/**
 * Validate protocol against regulatory guidelines
 *
 * @param {Object} protocol Protocol data
 * @returns {Promise<Array>} Validation results array
 */
export const validateProtocol = async protocol => {
  const response = await apiRequest('POST', '/api/protocol/validate', protocol);

  if (!response.ok) {
    throw new Error('Failed to validate protocol');
  }

  return response.json();
};
