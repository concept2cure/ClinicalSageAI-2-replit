/**
 * Module Document Registration Utility
 *
 * This utility handles the registration of documents from various modules into the
 * unified workflow system, enabling cross-module document management and approval processes.
 */

/**
 * Register a document from any module into the unified workflow system
 *
 * @param {string} organizationId - The organization ID
 * @param {string} userId - The ID of the user registering the document
 * @param {string} moduleType - The module type (e.g., 'medical_device', 'cmc', 'ectd', 'study', 'vault')
 * @param {object} documentMetadata - Document metadata specific to the module
 * @returns {Promise<object>} The registered document information
 */
export async function registerModuleDocument(organizationId, userId, moduleType, documentMetadata) {
 if (!organizationId || !userId || !moduleType || !documentMetadata) {
 throw new Error('Missing required parameters for document registration');
 }

 try {
 // Add common metadata
 const registrationData = {
 organizationId,
 userId,
 moduleType,
 documentMetadata: {
 ...documentMetadata,
 registeredAt: new Date().toISOString(),
 registeredBy: userId,
 status: 'registered',
 },
 };

 // Make API call to register the document
 const response = await fetch('/api/module-integration/register-document', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(registrationData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to register document in workflow system');
 }

 return await response.json();
 } catch (error) {
 console.error('Error registering document:', error);
 throw error;
 }
}

/**
 * Update document status in the workflow system
 *
 * @param {string} documentId - The registered document ID
 * @param {string} status - New status ('registered', 'in_review', 'approved', 'rejected')
 * @param {string} userId - The ID of the user updating the status
 * @param {string} [comment] - Optional comment about the status change
 * @returns {Promise<object>} Updated document information
 */
export async function updateDocumentStatus(documentId, status, userId, comment = '') {
 if (!documentId || !status || !userId) {
 throw new Error('Missing required parameters for status update');
 }

 try {
 const updateData = {
 documentId,
 status,
 userId,
 comment,
 updatedAt: new Date().toISOString(),
 };

 const response = await fetch('/api/module-integration/update-document-status', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(updateData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to update document status');
 }

 return await response.json();
 } catch (error) {
 console.error('Error updating document status:', error);
 throw error;
 }
}

/**
 * Get document registration information
 *
 * @param {string} documentId - The registered document ID
 * @returns {Promise<object>} Document registration information
 */
export async function getDocumentRegistration(documentId) {
 if (!documentId) {
 throw new Error('Document ID is required');
 }

 try {
 const response = await fetch(`/api/module-integration/document/${documentId}`);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to retrieve document registration');
 }

 return await response.json();
 } catch (error) {
 console.error('Error retrieving document registration:', error);
 throw error;
 }
}

/**
 * Get document workflow history
 *
 * @param {string} documentId - The registered document ID
 * @returns {Promise<Array>} Document workflow history
 */
export async function getDocumentWorkflowHistory(documentId) {
 if (!documentId) {
 throw new Error('Document ID is required');
 }

 try {
 const response = await fetch(`/api/module-integration/document/${documentId}/history`);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to retrieve document workflow history');
 }

 return await response.json();
 } catch (error) {
 console.error('Error retrieving document workflow history:', error);
 throw error;
 }
}

/**
 * Add a document comment
 *
 * @param {string} documentId - The registered document ID
 * @param {string} userId - The user adding the comment
 * @param {string} comment - The comment text
 * @returns {Promise<object>} The created comment
 */
export async function addDocumentComment(documentId, userId, comment) {
 if (!documentId || !userId || !comment) {
 throw new Error('Missing required parameters for adding comment');
 }

 try {
 const commentData = {
 documentId,
 userId,
 comment,
 createdAt: new Date().toISOString(),
 };

 const response = await fetch('/api/module-integration/document-comment', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(commentData),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to add document comment');
 }

 return await response.json();
 } catch (error) {
 console.error('Error adding document comment:', error);
 throw error;
 }
}
