/**
 * Blockchain Service
 *
 * This service provides blockchain-based security features for the TrialSage platform,
 * including document verification, audit trails, and cryptographic security.
 * It integrates with a private Ethereum-based blockchain for enhanced security.
 */

import crypto from 'crypto';
import { db } from '../db.js';

// Mock Web3 client (in production, would connect to actual blockchain)
const mockWeb3 = {
  async connect() {
    console.log('[Blockchain] Connecting to private blockchain...');
    return true;
  },

  async writeTransaction(data) {
    const txHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data) + Date.now())
      .digest('hex');

    console.log(`[Blockchain] Transaction written with hash: ${txHash}`);
    return {
      hash: txHash,
      blockNumber: Math.floor(Math.random() * 1000000),
      timestamp: new Date().toISOString(),
    };
  },

  async verifyTransaction(txHash) {
    // In production, this would check the blockchain
    console.log(`[Blockchain] Verifying transaction: ${txHash}`);
    return true;
  },

  async getTransactionReceipt(txHash) {
    console.log(`[Blockchain] Getting receipt for transaction: ${txHash}`);
    return {
      hash: txHash,
      blockNumber: Math.floor(Math.random() * 1000000),
      status: 'confirmed',
      timestamp: new Date().toISOString(),
    };
  },
};

// Blockchain Operations
let isInitialized = false;
let config = {
  enabled: false,
  privateChain: true,
  verificationEnabled: true,
};

/**
 * Initialize blockchain service
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} - Initialization status
 */
export async function initialize(options = {}) {
  if (isInitialized) return { status: 'already_initialized' };

  try {
    console.log('[Blockchain] Initializing blockchain service...');

    // Update configuration
    config = {
      ...config,
      ...options,
    };

    if (!config.enabled) {
      console.log('[Blockchain] Service disabled in configuration');
      return {
        status: 'disabled',
        config,
      };
    }

    // Connect to blockchain
    const connected = await mockWeb3.connect();

    if (!connected) {
      throw new Error('Failed to connect to blockchain network');
    }

    // Initialize database tables if needed
    await db.query(`
      CREATE TABLE IF NOT EXISTS blockchain_transactions (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) NOT NULL,
        block_number INTEGER,
        document_id VARCHAR(255),
        document_type VARCHAR(50),
        user_id INTEGER,
        operation VARCHAR(50) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS blockchain_verifications (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        document_hash VARCHAR(64) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        verified_at TIMESTAMP,
        status VARCHAR(20) NOT NULL,
        verification_count INTEGER DEFAULT 0,
        last_verified_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    isInitialized = true;

    console.log('[Blockchain] Service initialized successfully');

    return {
      status: 'success',
      config,
      initialized: true,
    };
  } catch (error) {
    console.error('[Blockchain] Initialization error:', error);

    return {
      status: 'error',
      error: error.message,
      initialized: false,
    };
  }
}

/**
 * Create a hash for a document
 * @param {string} documentContent - Document content to hash
 * @returns {string} - Document hash
 */
export function hashDocument(documentContent) {
  return crypto.createHash('sha256').update(documentContent).digest('hex');
}

/**
 * Register a document in the blockchain
 * @param {Object} document - Document metadata
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Registration result
 */
export async function registerDocument(document, userId) {
  if (!isInitialized || !config.enabled) {
    throw new Error('Blockchain service not initialized or disabled');
  }

  try {
    console.log(`[Blockchain] Registering document: ${document.id}`);

    // Create document hash
    const documentHash = hashDocument(document.content || JSON.stringify(document));

    // Prepare transaction data
    const txData = {
      operation: 'REGISTER_DOCUMENT',
      documentId: document.id,
      documentType: document.type,
      documentHash,
      timestamp: new Date().toISOString(),
      userId,
    };

    // Write to blockchain
    const txReceipt = await mockWeb3.writeTransaction(txData);

    // Store transaction details in database
    await db.query(
      `
      INSERT INTO blockchain_transactions
      (tx_hash, block_number, document_id, document_type, user_id, operation, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        txReceipt.hash,
        txReceipt.blockNumber,
        document.id,
        document.type,
        userId,
        txData.operation,
        JSON.stringify({
          documentHash,
          timestamp: txData.timestamp,
        }),
      ]
    );

    // Create verification record
    await db.query(
      `
      INSERT INTO blockchain_verifications
      (document_id, document_type, document_hash, tx_hash, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
      [document.id, document.type, documentHash, txReceipt.hash, 'REGISTERED']
    );

    return {
      documentId: document.id,
      documentHash,
      transactionHash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      timestamp: txData.timestamp,
      status: 'REGISTERED',
    };
  } catch (error) {
    console.error(`[Blockchain] Error registering document ${document.id}:`, error);
    throw error;
  }
}

/**
 * Update document in blockchain (register new version)
 * @param {Object} document - Document metadata
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Update result
 */
export async function updateDocument(document, userId) {
  if (!isInitialized || !config.enabled) {
    throw new Error('Blockchain service not initialized or disabled');
  }

  try {
    console.log(`[Blockchain] Updating document: ${document.id}`);

    // Get previous document hash
    const prevDocQuery = await db.query(
      `
      SELECT document_hash, tx_hash
      FROM blockchain_verifications
      WHERE document_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [document.id]
    );

    const prevDocData = prevDocQuery.rows[0];

    // Create new document hash
    const documentHash = hashDocument(document.content || JSON.stringify(document));

    // Prepare transaction data
    const txData = {
      operation: 'UPDATE_DOCUMENT',
      documentId: document.id,
      documentType: document.type,
      documentHash,
      previousHash: prevDocData ? prevDocData.document_hash : null,
      previousTx: prevDocData ? prevDocData.tx_hash : null,
      version: document.version || 'new',
      timestamp: new Date().toISOString(),
      userId,
    };

    // Write to blockchain
    const txReceipt = await mockWeb3.writeTransaction(txData);

    // Store transaction details in database
    await db.query(
      `
      INSERT INTO blockchain_transactions
      (tx_hash, block_number, document_id, document_type, user_id, operation, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        txReceipt.hash,
        txReceipt.blockNumber,
        document.id,
        document.type,
        userId,
        txData.operation,
        JSON.stringify({
          documentHash,
          previousHash: txData.previousHash,
          previousTx: txData.previousTx,
          version: txData.version,
          timestamp: txData.timestamp,
        }),
      ]
    );

    // Create verification record
    await db.query(
      `
      INSERT INTO blockchain_verifications
      (document_id, document_type, document_hash, tx_hash, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
      [document.id, document.type, documentHash, txReceipt.hash, 'UPDATED']
    );

    return {
      documentId: document.id,
      documentHash,
      transactionHash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      previousHash: txData.previousHash,
      version: txData.version,
      timestamp: txData.timestamp,
      status: 'UPDATED',
    };
  } catch (error) {
    console.error(`[Blockchain] Error updating document ${document.id}:`, error);
    throw error;
  }
}

/**
 * Verify document against blockchain record
 * @param {Object} document - Document to verify
 * @param {string} userId - User ID performing verification
 * @returns {Promise<Object>} - Verification result
 */
export async function verifyDocument(document, userId) {
  if (!isInitialized || !config.enabled || !config.verificationEnabled) {
    throw new Error('Blockchain verification not available');
  }

  try {
    console.log(`[Blockchain] Verifying document: ${document.id}`);

    // Get document hash
    const documentHash = hashDocument(document.content || JSON.stringify(document));

    // Get blockchain record
    const verificationQuery = await db.query(
      `
      SELECT *
      FROM blockchain_verifications
      WHERE document_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [document.id]
    );

    if (verificationQuery.rows.length === 0) {
      return {
        documentId: document.id,
        verified: false,
        status: 'NOT_REGISTERED',
        error: 'Document not registered in blockchain',
      };
    }

    const verification = verificationQuery.rows[0];

    // Compare hashes
    const hashesMatch = verification.document_hash === documentHash;

    // Verify transaction in blockchain
    const txValid = await mockWeb3.verifyTransaction(verification.tx_hash);

    // Update verification record
    await db.query(
      `
      UPDATE blockchain_verifications
      SET 
        verified_at = NOW(),
        verification_count = verification_count + 1,
        last_verified_by = $1,
        status = $2
      WHERE id = $3
    `,
      [userId, hashesMatch && txValid ? 'VERIFIED' : 'INVALID', verification.id]
    );

    // Add verification transaction
    const txData = {
      operation: 'VERIFY_DOCUMENT',
      documentId: document.id,
      documentType: document.type,
      verificationResult: hashesMatch && txValid,
      originalTxHash: verification.tx_hash,
      timestamp: new Date().toISOString(),
      userId,
    };

    const txReceipt = await mockWeb3.writeTransaction(txData);

    await db.query(
      `
      INSERT INTO blockchain_transactions
      (tx_hash, block_number, document_id, document_type, user_id, operation, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        txReceipt.hash,
        txReceipt.blockNumber,
        document.id,
        document.type,
        userId,
        txData.operation,
        JSON.stringify({
          verificationResult: txData.verificationResult,
          originalTxHash: txData.originalTxHash,
          timestamp: txData.timestamp,
        }),
      ]
    );

    return {
      documentId: document.id,
      verified: hashesMatch && txValid,
      hashValid: hashesMatch,
      blockchainValid: txValid,
      storedHash: verification.document_hash,
      calculatedHash: documentHash,
      transactionHash: verification.tx_hash,
      verificationTransactionHash: txReceipt.hash,
      timestamp: new Date().toISOString(),
      status: hashesMatch && txValid ? 'VERIFIED' : 'INVALID',
    };
  } catch (error) {
    console.error(`[Blockchain] Error verifying document ${document.id}:`, error);
    throw error;
  }
}

/**
 * Create blockchain audit trail
 * @param {string} operation - Audit operation
 * @param {string} resourceId - Resource ID
 * @param {Object} data - Audit data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Audit result
 */
export async function createAuditTrail(operation, resourceId, data, userId) {
  if (!isInitialized || !config.enabled) {
    throw new Error('Blockchain service not initialized or disabled');
  }

  try {
    console.log(`[Blockchain] Creating audit trail: ${operation} for ${resourceId}`);

    // Prepare transaction data
    const txData = {
      operation,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
    };

    // Create hash of audit data
    const auditHash = hashDocument(JSON.stringify(txData));

    // Write to blockchain
    const txReceipt = await mockWeb3.writeTransaction({
      ...txData,
      auditHash,
    });

    // Store transaction details in database
    await db.query(
      `
      INSERT INTO blockchain_transactions
      (tx_hash, block_number, document_id, document_type, user_id, operation, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        txReceipt.hash,
        txReceipt.blockNumber,
        resourceId,
        'AUDIT',
        userId,
        operation,
        JSON.stringify({
          auditHash,
          data,
          timestamp: txData.timestamp,
        }),
      ]
    );

    return {
      operation,
      resourceId,
      auditHash,
      transactionHash: txReceipt.hash,
      blockNumber: txReceipt.blockNumber,
      timestamp: txData.timestamp,
      status: 'RECORDED',
    };
  } catch (error) {
    console.error(`[Blockchain] Error creating audit trail for ${resourceId}:`, error);
    throw error;
  }
}

/**
 * Get document blockchain history
 * @param {string} documentId - Document ID
 * @returns {Promise<Array>} - Document history
 */
export async function getDocumentHistory(documentId) {
  if (!isInitialized || !config.enabled) {
    throw new Error('Blockchain service not initialized or disabled');
  }

  try {
    console.log(`[Blockchain] Getting history for document: ${documentId}`);

    // Get transactions for document
    const transactionsQuery = await db.query(
      `
      SELECT tx.*
      FROM blockchain_transactions tx
      WHERE tx.document_id = $1
      ORDER BY tx.created_at DESC
    `,
      [documentId]
    );

    // Get verifications for document
    const verificationsQuery = await db.query(
      `
      SELECT *
      FROM blockchain_verifications
      WHERE document_id = $1
      ORDER BY created_at DESC
    `,
      [documentId]
    );

    // Format history
    const history = transactionsQuery.rows.map(tx => {
      let metadata = tx.metadata;

      // If metadata is stored as string, parse it
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          console.warn(`[Blockchain] Error parsing metadata JSON for tx ${tx.tx_hash}`);
        }
      }

      return {
        timestamp: tx.created_at,
        operation: tx.operation,
        transactionHash: tx.tx_hash,
        blockNumber: tx.block_number,
        userId: tx.user_id,
        metadata,
      };
    });

    const verifications = verificationsQuery.rows.map(v => ({
      documentHash: v.document_hash,
      transactionHash: v.tx_hash,
      status: v.status,
      verifiedAt: v.verified_at,
      verificationCount: v.verification_count,
      createdAt: v.created_at,
    }));

    return {
      documentId,
      verifications,
      history,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Blockchain] Error getting document history for ${documentId}:`, error);
    throw error;
  }
}

/**
 * Get blockchain status
 * @returns {Promise<Object>} - Blockchain status
 */
export async function getBlockchainStatus() {
  return {
    initialized: isInitialized,
    config,
    uptime: isInitialized ? '(simulated)' : 0,
    lastChecked: new Date().toISOString(),
  };
}

// Export module config for testing
export const getConfig = () => ({ ...config });
