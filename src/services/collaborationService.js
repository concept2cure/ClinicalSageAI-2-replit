/**
 * Collaboration Service
 *
 * This service handles interactions with the collaboration API endpoint,
 * managing project messages, tasks, milestones, and approvals.
 */

import axios from 'axios';

const API_BASE_URL = '/api/collaboration';

/**
 * Get all messages for a project
 * @param {string} projectId - Project identifier
 * @param {string} moduleType - Module type (e.g., 'cer', '510k', 'ind')
 * @returns {Promise<Array>} - List of messages
 */
export const getProjectMessages = async (projectId, moduleType) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/messages`, {
      params: { projectId, moduleType },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching project messages:', error);
    throw error;
  }
};

/**
 * Send a new message
 * @param {Object} message - Message object
 * @returns {Promise<Object>} - Created message
 */
export const sendMessage = async message => {
  try {
    const response = await axios.post(`${API_BASE_URL}/messages`, message);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Get tasks for a project
 * @param {string} projectId - Project identifier
 * @param {string} moduleType - Module type
 * @returns {Promise<Array>} - List of tasks
 */
export const getProjectTasks = async (projectId, moduleType) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/tasks`, {
      params: { projectId, moduleType },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    throw error;
  }
};

/**
 * Create a new task
 * @param {Object} task - Task object
 * @returns {Promise<Object>} - Created task
 */
export const createTask = async task => {
  try {
    const response = await axios.post(`${API_BASE_URL}/tasks`, task);
    return response.data;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
};

/**
 * Update a task
 * @param {string} taskId - Task identifier
 * @param {Object} updates - Task updates
 * @returns {Promise<Object>} - Updated task
 */
export const updateTask = async (taskId, updates) => {
  try {
    const response = await axios.patch(`${API_BASE_URL}/tasks/${taskId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
};

/**
 * Get milestones for a project
 * @param {string} projectId - Project identifier
 * @param {string} moduleType - Module type
 * @returns {Promise<Array>} - List of milestones
 */
export const getProjectMilestones = async (projectId, moduleType) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/milestones`, {
      params: { projectId, moduleType },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching project milestones:', error);
    throw error;
  }
};

/**
 * Complete a milestone
 * @param {string} milestoneId - Milestone identifier
 * @param {Object} data - Completion data
 * @returns {Promise<Object>} - Updated milestone
 */
export const completeMilestone = async (milestoneId, data) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/milestones/${milestoneId}/complete`, data);
    return response.data;
  } catch (error) {
    console.error('Error completing milestone:', error);
    throw error;
  }
};

/**
 * Get pending approval requests for a project
 * @param {string} projectId - Project identifier
 * @param {string} moduleType - Module type
 * @returns {Promise<Array>} - List of approval requests
 */
export const getApprovalRequests = async (projectId, moduleType) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/approvals`, {
      params: { projectId, moduleType },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching approval requests:', error);
    throw error;
  }
};

/**
 * Create a new approval request
 * @param {Object} request - Approval request
 * @returns {Promise<Object>} - Created approval request
 */
export const createApprovalRequest = async request => {
  try {
    const response = await axios.post(`${API_BASE_URL}/approvals`, request);
    return response.data;
  } catch (error) {
    console.error('Error creating approval request:', error);
    throw error;
  }
};

/**
 * Process an approval request
 * @param {string} requestId - Request identifier
 * @param {Object} decision - Approval decision
 * @returns {Promise<Object>} - Updated approval request
 */
export const processApprovalRequest = async (requestId, decision) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/approvals/${requestId}/process`, decision);
    return response.data;
  } catch (error) {
    console.error('Error processing approval request:', error);
    throw error;
  }
};

/**
 * Get AI suggestions for a project
 * @param {string} projectId - Project identifier
 * @param {string} moduleType - Module type
 * @param {string} context - Additional context for AI suggestions
 * @returns {Promise<Array>} - List of AI suggestions
 */
export const getAiSuggestions = async (projectId, moduleType, context = {}) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/ai-suggestions`, {
      projectId,
      moduleType,
      context,
    });
    return response.data;
  } catch (error) {
    console.error('Error getting AI suggestions:', error);
    throw error;
  }
};

/**
 * Get project team members
 * @param {string} projectId - Project identifier
 * @returns {Promise<Array>} - List of team members
 */
export const getProjectTeam = async projectId => {
  try {
    const response = await axios.get(`${API_BASE_URL}/team`, {
      params: { projectId },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching project team:', error);
    throw error;
  }
};

/**
 * Get AI assistance for a specific task or milestone
 * @param {string} itemId - Item identifier
 * @param {string} itemType - Item type ('task' or 'milestone')
 * @param {Object} context - Additional context for AI
 * @returns {Promise<Object>} - AI assistance response
 */
export const getAiAssistance = async (itemId, itemType, context = {}) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/ai-assistance`, {
      itemId,
      itemType,
      context,
    });
    return response.data;
  } catch (error) {
    console.error('Error getting AI assistance:', error);
    throw error;
  }
};
