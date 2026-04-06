/**
 * Workflow Template Service
 *
 * This service provides unified workflow management capabilities for all modules,
 * enabling consistent document approval processes across the platform.
 */

/**
 * Fetch workflow templates for a specific organization and module type
 *
 * @param {string} organizationId - The organization ID
 * @param {string} moduleType - The module type (e.g., 'medical_device', 'cmc', 'ectd', 'study', 'vault')
 * @returns {Promise<Array>} List of available workflow templates
 */
export async function fetchWorkflowTemplates(organizationId, moduleType) {
 if (!organizationId) {
 throw new Error('Organization ID is required');
 }

 try {
 let url = `/api/module-integration/workflow-templates?organizationId=${organizationId}`;
 if (moduleType) {
 url += `&moduleType=${moduleType}`;
 }

 const response = await fetch(url);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to fetch workflow templates');
 }

 return await response.json();
 } catch (error) {
 console.error('Error fetching workflow templates:', error);
 throw error;
 }
}

/**
 * Create a new workflow template
 *
 * @param {string} organizationId - The organization ID
 * @param {string} name - Template name
 * @param {string} description - Template description
 * @param {string} moduleType - The module type
 * @param {Array} steps - Workflow steps
 * @param {boolean} isDefault - Whether this is the default template for the module
 * @returns {Promise<object>} The created workflow template
 */
export async function createWorkflowTemplate(
 organizationId,
 name,
 description,
 moduleType,
 steps,
 isDefault = false
) {
 if (
 !organizationId ||
 !name ||
 !moduleType ||
 !steps ||
 !Array.isArray(steps) ||
 steps.length === 0
 ) {
 throw new Error('Missing required parameters for creating workflow template');
 }

 try {
 const templateData = {
 organizationId,
 name,
 description,
 moduleType,
 steps,
 isDefault,
 createdAt: new Date().toISOString(),
 };

 const response = await fetch('/api/module-integration/workflow-template', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(templateData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to create workflow template');
 }

 return await response.json();
 } catch (error) {
 console.error('Error creating workflow template:', error);
 throw error;
 }
}

/**
 * Update an existing workflow template
 *
 * @param {string} templateId - The template ID to update
 * @param {object} updates - The fields to update
 * @returns {Promise<object>} The updated workflow template
 */
export async function updateWorkflowTemplate(templateId, updates) {
 if (!templateId || !updates) {
 throw new Error('Template ID and updates are required');
 }

 try {
 const updateData = {
 ...updates,
 updatedAt: new Date().toISOString(),
 };

 const response = await fetch(`/api/module-integration/workflow-template/${templateId}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(updateData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to update workflow template');
 }

 return await response.json();
 } catch (error) {
 console.error('Error updating workflow template:', error);
 throw error;
 }
}

/**
 * Delete a workflow template
 *
 * @param {string} templateId - The template ID to delete
 * @returns {Promise<object>} Result of deletion
 */
export async function deleteWorkflowTemplate(templateId) {
 if (!templateId) {
 throw new Error('Template ID is required');
 }

 try {
 const response = await fetch(`/api/module-integration/workflow-template/${templateId}`, {
 method: 'DELETE',
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to delete workflow template');
 }

 return await response.json();
 } catch (error) {
 console.error('Error deleting workflow template:', error);
 throw error;
 }
}

/**
 * Start a workflow for a document using a template
 *
 * @param {string} documentId - The document ID
 * @param {string} templateId - The workflow template ID
 * @param {string} userId - The user starting the workflow
 * @param {string} [comment] - Optional comment
 * @returns {Promise<object>} The started workflow information
 */
export async function startDocumentWorkflow(documentId, templateId, userId, comment = '') {
 if (!documentId || !templateId || !userId) {
 throw new Error('Missing required parameters for starting workflow');
 }

 try {
 const workflowData = {
 documentId,
 templateId,
 userId,
 comment,
 startedAt: new Date().toISOString(),
 };

 const response = await fetch('/api/module-integration/start-workflow', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(workflowData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to start document workflow');
 }

 return await response.json();
 } catch (error) {
 console.error('Error starting document workflow:', error);
 throw error;
 }
}

/**
 * Get the current workflow status for a document
 *
 * @param {string} documentId - The document ID
 * @returns {Promise<object>} The current workflow status
 */
export async function getDocumentWorkflowStatus(documentId) {
 if (!documentId) {
 throw new Error('Document ID is required');
 }

 try {
 const response = await fetch(`/api/module-integration/workflow-status/${documentId}`);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to retrieve workflow status');
 }

 return await response.json();
 } catch (error) {
 console.error('Error retrieving workflow status:', error);
 throw error;
 }
}

/**
 * Transition a document workflow to the next step
 *
 * @param {string} workflowId - The workflow ID
 * @param {string} userId - The user transitioning the workflow
 * @param {string} action - The action ('approve', 'reject', 'request_changes')
 * @param {string} [comment] - Optional comment
 * @returns {Promise<object>} The updated workflow status
 */
export async function transitionWorkflow(workflowId, userId, action, comment = '') {
 if (!workflowId || !userId || !action) {
 throw new Error('Missing required parameters for workflow transition');
 }

 try {
 const transitionData = {
 workflowId,
 userId,
 action,
 comment,
 timestamp: new Date().toISOString(),
 };

 const response = await fetch('/api/module-integration/transition-workflow', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(transitionData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to transition workflow');
 }

 return await response.json();
 } catch (error) {
 console.error('Error transitioning workflow:', error);
 throw error;
 }
}

/**
 * Get active workflows for an organization
 *
 * @param {string} organizationId - The organization ID
 * @param {string} [moduleType] - Optional module type filter
 * @param {string} [userId] - Optional user ID to filter by assignee
 * @returns {Promise<Array>} List of active workflows
 */
export async function getActiveWorkflows(organizationId, moduleType, userId) {
 if (!organizationId) {
 throw new Error('Organization ID is required');
 }

 try {
 let url = `/api/module-integration/active-workflows?organizationId=${organizationId}`;
 if (moduleType) {
 url += `&moduleType=${moduleType}`;
 }
 if (userId) {
 url += `&userId=${userId}`;
 }

 const response = await fetch(url);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to fetch active workflows');
 }

 return await response.json();
 } catch (error) {
 console.error('Error fetching active workflows:', error);
 throw error;
 }
}

/**
 * Get pending approvals for a user
 *
 * @param {string} userId - The user ID
 * @param {string} [organizationId] - Optional organization ID filter
 * @returns {Promise<Array>} List of pending approvals
 */
export async function getPendingApprovals(userId, organizationId) {
 if (!userId) {
 throw new Error('User ID is required');
 }

 try {
 let url = `/api/module-integration/pending-approvals?userId=${userId}`;
 if (organizationId) {
 url += `&organizationId=${organizationId}`;
 }

 const response = await fetch(url);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to fetch pending approvals');
 }

 return await response.json();
 } catch (error) {
 console.error('Error fetching pending approvals:', error);
 throw error;
 }
}

/**
 * Get document workflow history
 *
 * @param {string} documentId - The document ID
 * @returns {Promise<Array>} List of workflow history events
 */
export async function getDocumentWorkflowHistory(documentId) {
 if (!documentId) {
 throw new Error('Document ID is required');
 }

 try {
 const response = await fetch(`/api/module-integration/workflow-history/${documentId}`);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to fetch workflow history');
 }

 return await response.json();
 } catch (error) {
 console.error('Error fetching workflow history:', error);
 throw error;
 }
}
