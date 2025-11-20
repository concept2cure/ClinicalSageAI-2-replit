import { apiRequest } from './queryClient';

/**
 * TrialSage Blockchain Security Client
 *
 * This module provides client-side functions for interacting with the
 * TrialSage blockchain security services, which exceed FDA 21 CFR Part 11
 * requirements for tamper-evidence and data integrity.
 */

/**
 * Get blockchain verification statistics
 *
 * @returns {Promise<Object>} - Blockchain statistics
 */
export async function getBlockchainStatistics() {
  const response = await apiRequest('GET', '/api/blockchain/statistics');
  return response.json();
}

/**
 * Get recent blockchain verifications
 *
 * @param {number} limit - Number of verifications to return
 * @returns {Promise<Array<Object>>} - Recent verifications
 */
export async function getRecentVerifications(limit = 10) {
  const response = await apiRequest('GET', `/api/blockchain/verifications?limit=${limit}`);
  return response.json();
}

/**
 * Get blockchain verification errors
 *
 * @param {number} limit - Number of errors to return
 * @returns {Promise<Array<Object>>} - Verification errors
 */
export async function getVerificationErrors(limit = 10) {
  const response = await apiRequest('GET', `/api/blockchain/errors?limit=${limit}`);
  return response.json();
}

/**
 * Register a document on the blockchain
 *
 * @param {Object} documentInfo - Document information
 * @returns {Promise<Object>} - Registration results
 */
export async function registerDocumentOnBlockchain(documentInfo) {
  const response = await apiRequest('POST', '/api/blockchain/register', documentInfo);
  return response.json();
}

/**
 * Verify a document on the blockchain
 *
 * @param {Object} verificationInfo - Verification information
 * @returns {Promise<Object>} - Verification results
 */
export async function verifyDocumentOnBlockchain(verificationInfo) {
  const response = await apiRequest('POST', '/api/blockchain/verify', verificationInfo);
  return response.json();
}

/**
 * Record an audit event on the blockchain
 *
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} - Record results
 */
export async function recordAuditEventOnBlockchain(eventType, eventData) {
  const response = await apiRequest('POST', '/api/blockchain/audit', { eventType, eventData });
  return response.json();
}

/**
 * Verify AI access to blockchain data
 *
 * @param {string} userId - User ID
 * @param {string} recordId - Record ID
 * @param {string} operationType - Operation type
 * @returns {Promise<Object>} - Verification results
 */
export async function verifyAIBlockchainAccess(userId, recordId, operationType) {
  const response = await apiRequest('POST', '/api/blockchain/ai-access', {
    userId,
    recordId,
    operationType,
  });
  return response.json();
}

/**
 * Calculate document hash for blockchain verification
 *
 * @param {Object} document - Document to hash
 * @returns {string} - Document hash
 */
export function calculateDocumentHash(document) {
  // In a real implementation, this would calculate the hash on the client side
  // For this example, we'll simulate the hash calculation
  return 'simulated-document-hash';
}

/**
 * Get blockchain configuration
 *
 * @returns {Object} - Blockchain configuration
 */
export function getBlockchainConfiguration() {
  return {
    networkType: 'Ethereum (Private)',
    nodeEndpoint: 'https://blockchain.trialsage.com',
    smartContractAddress: '0x8F5e7C6eFa6a5678f1e238A3aB7d0941e5782c79',
    verificationFrequency: 'real-time',
    authMethod: 'api-key',
  };
}
