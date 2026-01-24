/**
 * CER Compliance Service
 *
 * This service handles the interactions with the compliance engine API
 * for objective compliance status and dashboard metrics.
 */

import axios from 'axios';

/**
 * Get compliance metrics for dashboard displays
 */
export const getComplianceMetrics = async (documentId = 'current', framework = 'mdr') => {
  try {
    const response = await axios.get(`/api/cer/qmp-integration/compliance-metrics`, {
      params: { documentId, framework },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching compliance metrics:', error);
    throw error;
  }
};

/**
 * Get objective-specific compliance score
 */
export const getObjectiveCompliance = async (
  objectiveId,
  documentId = 'current',
  framework = 'mdr'
) => {
  try {
    const response = await axios.post(`/api/cer/qmp-integration/objective-compliance`, {
      objectiveId,
      documentId,
      framework,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching objective compliance:', error);
    throw error;
  }
};

/**
 * Get all QMP objectives that cover a specific CER section
 */
export const getSectionObjectives = async sectionName => {
  try {
    const response = await axios.get(
      `/api/cer/qmp-integration/section-objectives/${encodeURIComponent(sectionName)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching section objectives:', error);
    throw error;
  }
};

/**
 * Validate CER document with scope defined by QMP objectives
 */
export const validateCerWithQmpScope = async (documentId, framework = 'mdr') => {
  try {
    const response = await axios.post(`/api/cer/qmp-integration/validate-scoped`, {
      documentId,
      framework,
    });
    return response.data;
  } catch (error) {
    console.error('Error validating CER with QMP scope:', error);
    throw error;
  }
};

/**
 * Get enhanced dashboard metrics
 */
export const getDashboardMetrics = async () => {
  try {
    const response = await axios.get(`/api/cer/qmp-integration/dashboard-metrics`);
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    throw error;
  }
};

export default {
  getComplianceMetrics,
  getObjectiveCompliance,
  getSectionObjectives,
  validateCerWithQmpScope,
  getDashboardMetrics,
};
