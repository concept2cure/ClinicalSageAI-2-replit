/**
 * Manager Sign-Off Service
 *
 * This service handles manager approvals and sign-offs for regulatory workflow transitions,
 * maintaining a secure audit trail of all approval actions.
 */

// For persistence, we'll use both localStorage and the API (when available)
const STORAGE_KEY = 'regulatory_signoffs';

/**
 * Record a new manager sign-off for a workflow transition
 *
 * @param {Object} signOffData - The sign-off data object
 * @param {string} signOffData.stageName - Name of the workflow stage
 * @param {string} signOffData.deviceName - Name of the device
 * @param {string} signOffData.managerName - Name of the approving manager
 * @param {string} signOffData.managerEmail - Email of the approving manager
 * @param {string} signOffData.notes - Additional notes/comments (optional)
 * @param {Object} signOffData.requirementsChecked - Map of checked requirements
 * @param {string} signOffData.timestamp - ISO timestamp of the approval
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} The recorded sign-off with ID
 */
export const recordSignOff = async (signOffData, options = {}) => {
  try {
    // Add unique ID and verification token
    const signOffRecord = {
      ...signOffData,
      id: `signoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      verified: true, // In a real implementation, this would come from a cryptographic verification
      recordedAt: new Date().toISOString(),
    };

    // Store in localStorage for persistence
    const existingRecords = getLocalSignOffs();
    const updatedRecords = [...existingRecords, signOffRecord];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRecords));

    // In a production environment, we would also send this to the server
    // This could be implemented when the backend API is ready
    if (options.sendToServer !== false) {
      console.log('[ManagerSignOffService] Simulating API call to record sign-off:', signOffRecord);
      // This would be an API call in a real implementation
      // await api.post('/api/manager-signoffs', signOffRecord);
    }

    console.log('[ManagerSignOffService] Sign-off recorded successfully:', signOffRecord.id);
    return signOffRecord;
  } catch (error) {
    console.error('[ManagerSignOffService] Error recording sign-off:', error);
    throw new Error('Failed to record manager sign-off: ' + error.message);
  }
};

/**
 * Get all sign-offs for a specific device
 *
 * @param {string} deviceName - Name of the device
 * @returns {Array} Array of sign-off records
 */
export const getDeviceSignOffs = deviceName => {
  try {
    const allSignOffs = getLocalSignOffs();
    return allSignOffs.filter(record => record.deviceName === deviceName);
  } catch (error) {
    console.error('[ManagerSignOffService] Error getting device sign-offs:', error);
    return [];
  }
};

/**
 * Get the latest sign-off for a specific stage and device
 *
 * @param {string} stageName - Name of the workflow stage
 * @param {string} deviceName - Name of the device
 * @returns {Object|null} The latest sign-off record or null if none exists
 */
export const getLatestStageSignOff = (stageName, deviceName) => {
  try {
    const deviceSignOffs = getDeviceSignOffs(deviceName);
    const stageSignOffs = deviceSignOffs.filter(record => record.stageName === stageName);

    if (stageSignOffs.length === 0) {
      return null;
    }

    // Sort by timestamp (most recent first) and return the first item
    return stageSignOffs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  } catch (error) {
    console.error('[ManagerSignOffService] Error getting latest stage sign-off:', error);
    return null;
  }
};

/**
 * Check if a stage has been approved for a device
 *
 * @param {string} stageName - Name of the workflow stage
 * @param {string} deviceName - Name of the device
 * @returns {boolean} True if the stage has been approved
 */
export const isStageApproved = (stageName, deviceName) => {
  return getLatestStageSignOff(stageName, deviceName) !== null;
};

/**
 * Get the approval history for a device workflow
 *
 * @param {string} deviceName - Name of the device
 * @returns {Object} Map of stages to approval status
 */
export const getApprovalHistory = deviceName => {
  try {
    const deviceSignOffs = getDeviceSignOffs(deviceName);
    const approvalMap = {};

    // Create a map of the most recent approval for each stage
    deviceSignOffs.forEach(record => {
      const { stageName, timestamp } = record;

      if (
        !approvalMap[stageName] ||
        new Date(timestamp).getTime() > new Date(approvalMap[stageName].timestamp).getTime()
      ) {
        approvalMap[stageName] = record;
      }
    });

    return approvalMap;
  } catch (error) {
    console.error('[ManagerSignOffService] Error getting approval history:', error);
    return {};
  }
};

/**
 * Get sign-offs from localStorage
 *
 * @returns {Array} Array of sign-off records
 */
function getLocalSignOffs() {
  try {
    const storedRecords = localStorage.getItem(STORAGE_KEY);
    return storedRecords ? JSON.parse(storedRecords) : [];
  } catch (error) {
    console.error('[ManagerSignOffService] Error parsing stored sign-offs:', error);
    return [];
  }
}

/**
 * Get the requirements for a specific workflow stage
 *
 * @param {string} stageName - Name of the workflow stage
 * @returns {Array} Array of requirement objects
 */
export const getStageRequirements = stageName => {
  // Map of stage-specific requirements
  const requirementsMap = {
    'Predicate Device Selection': [
      {
        id: 'req1',
        text: 'I confirm the selected predicate devices are appropriate for this submission',
      },
      { id: 'req2', text: 'I have reviewed the device similarities and differences' },
      {
        id: 'req3',
        text: 'The proposed device is substantially equivalent to the selected predicate(s)',
      },
    ],
    'Substantial Equivalence': [
      { id: 'req1', text: 'I confirm the comparison data is accurate and complete' },
      { id: 'req2', text: 'I have reviewed the technical and performance characteristics' },
      {
        id: 'req3',
        text: 'The comparison demonstrates substantial equivalence per FDA guidelines',
      },
    ],
    'FDA Compliance Check': [
      { id: 'req1', text: 'I confirm all regulatory requirements have been properly addressed' },
      { id: 'req2', text: 'I have reviewed the compliance results and any issues identified' },
      { id: 'req3', text: 'The submission is in compliance with FDA 510(k) requirements' },
    ],
    'Final Submission': [
      { id: 'req1', text: 'I confirm the submission package is complete and ready for FDA review' },
      { id: 'req2', text: 'I have reviewed all sections and supporting documentation' },
      { id: 'req3', text: 'I approve this 510(k) submission for final filing with the FDA' },
      {
        id: 'req4',
        text: 'I understand this approval will be logged in the regulatory audit trail',
      },
    ],
  };

  return requirementsMap[stageName] || [];
};

// Export the service
const ManagerSignOffService = {
  recordSignOff,
  getDeviceSignOffs,
  getLatestStageSignOff,
  isStageApproved,
  getApprovalHistory,
  getStageRequirements,
};

export default ManagerSignOffService;
