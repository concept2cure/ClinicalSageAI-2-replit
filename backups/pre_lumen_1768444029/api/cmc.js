/**
 * CMC API - Client-side API helper for Chemistry, Manufacturing, and Controls module
 */

/**
 * Get all stability studies
 *
 * @returns {Promise<Array>} List of stability studies
 */
export const getStabilityStudies = async () => {
  const response = await fetch('/api/cmc/stability');
  if (!response.ok) {
    throw new Error('Failed to fetch stability studies');
  }
  return response.json();
};

/**
 * Upload a stability study
 *
 * @param {FormData} formData Form data containing file and metadata
 * @returns {Promise<Object>} Upload result
 */
export const uploadStabilityStudy = async formData => {
  const response = await fetch('/api/cmc/stability/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload stability study');
  }

  return response.json();
};

/**
 * Get process diagram by ID
 *
 * @param {string} id Process diagram ID
 * @returns {Promise<Object>} Process diagram data
 */
export const getProcessDiagram = async id => {
  const response = await fetch(`/api/cmc/process-diagram/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch process diagram');
  }
  return response.json();
};

/**
 * Save process diagram
 *
 * @param {Object} diagramData Process diagram data
 * @returns {Promise<Object>} Saved diagram data
 */
export const saveProcessDiagram = async diagramData => {
  const response = await fetch('/api/cmc/process-diagram/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(diagramData),
  });

  if (!response.ok) {
    throw new Error('Failed to save process diagram');
  }

  return response.json();
};

/**
 * Get all analytical methods
 *
 * @returns {Promise<Array>} List of analytical methods
 */
export const getAnalyticalMethods = async () => {
  const response = await fetch('/api/cmc/analytical-methods');
  if (!response.ok) {
    throw new Error('Failed to fetch analytical methods');
  }
  return response.json();
};

/**
 * Save an analytical method
 *
 * @param {Object} methodData Analytical method data
 * @returns {Promise<Object>} Saved method data
 */
export const saveAnalyticalMethod = async methodData => {
  const response = await fetch('/api/cmc/analytical-methods/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(methodData),
  });

  if (!response.ok) {
    throw new Error('Failed to save analytical method');
  }

  return response.json();
};

/**
 * Get all certificates of analysis
 *
 * @returns {Promise<Array>} List of certificates
 */
export const getCertificates = async () => {
  const response = await fetch('/api/cmc/certificates');
  if (!response.ok) {
    throw new Error('Failed to fetch certificates');
  }
  return response.json();
};

/**
 * Save a certificate of analysis
 *
 * @param {Object} certificateData Certificate data
 * @returns {Promise<Object>} Saved certificate data
 */
export const saveCertificate = async certificateData => {
  const response = await fetch('/api/cmc/certificates/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(certificateData),
  });

  if (!response.ok) {
    throw new Error('Failed to save certificate');
  }

  return response.json();
};
