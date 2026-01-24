/**
 * TrialSage Blockchain Security API Routes
 *
 * This module provides API endpoints for blockchain-based security operations:
 * - Document registration on blockchain
 * - Document verification against blockchain
 * - Audit event recording on blockchain
 * - Smart contract management
 * - AI-blockchain access verification
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const securityMiddleware = require('../middleware/security');

// Mock blockchain storage (replace with actual blockchain integration in production)
const blockchainRegistry = new Map();
const transactionLogs = [];
const smartContracts = new Map();

// Configuration
const BLOCKCHAIN_CONFIG = {
  network: 'ethereum', // 'ethereum', 'hyperledger', 'polygon'
  consensusAlgorithm: 'proof-of-authority',
  blockTime: 5000, // ms
  blockConfirmations: 6,
};

/**
 * Generate a block hash
 *
 * @param {Object} data - Block data
 * @returns {string} - SHA-256 hash
 */
function generateBlockHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * Create a mock blockchain transaction
 *
 * @param {Object} data - Transaction data
 * @returns {Object} - Transaction details
 */
function createTransaction(data) {
  const timestamp = Date.now();
  const blockNumber = Math.floor(timestamp / BLOCKCHAIN_CONFIG.blockTime);
  const previousHash =
    transactionLogs.length > 0
      ? transactionLogs[transactionLogs.length - 1].blockHash
      : '0000000000000000000000000000000000000000000000000000000000000000';

  const transaction = {
    transactionId: uuidv4(),
    timestamp,
    blockNumber,
    data,
    previousHash,
    blockHash: generateBlockHash({
      blockNumber,
      timestamp,
      data,
      previousHash,
    }),
  };

  transactionLogs.push(transaction);

  return transaction;
}

/**
 * Verify a transaction on the blockchain
 *
 * @param {string} documentId - Document ID
 * @param {string} documentHash - Document hash to verify
 * @returns {Object} - Verification result
 */
function verifyTransaction(documentId, documentHash) {
  const registryEntry = blockchainRegistry.get(documentId);

  if (!registryEntry) {
    return {
      verified: false,
      reason: 'Document not found in blockchain registry',
    };
  }

  return {
    verified: registryEntry.documentHash === documentHash,
    blockNumber: registryEntry.blockNumber,
    timestamp: registryEntry.timestamp,
    transactionId: registryEntry.transactionId,
  };
}

// Route to register a document on the blockchain
router.post('/register', async (req, res) => {
  try {
    const { documentId, documentHash, documentType, accessControl, metadata } = req.body;

    if (!documentId || !documentHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document ID and hash are required',
      });
    }

    // Create a blockchain transaction
    const transaction = createTransaction({
      documentId,
      documentHash,
      documentType: documentType || 'general',
      accessControl: accessControl || [],
      metadata: metadata || {},
      registeredBy: req.user?.id || 'system',
      registeredAt: new Date().toISOString(),
    });

    // Store in the registry
    blockchainRegistry.set(documentId, {
      documentHash,
      blockNumber: transaction.blockNumber,
      timestamp: transaction.timestamp,
      transactionId: transaction.transactionId,
    });

    // Log the registration
    securityMiddleware.auditLog('BLOCKCHAIN_DOCUMENT_REGISTERED', {
      documentId,
      documentHash: documentHash.substring(0, 10) + '...',
      transactionId: transaction.transactionId,
      userId: req.user?.id || 'system',
    });

    // Return the transaction receipt
    res.status(201).json({
      success: true,
      message: 'Document registered on blockchain',
      transactionId: transaction.transactionId,
      blockNumber: transaction.blockNumber,
      timestamp: transaction.timestamp,
    });
  } catch (error) {
    console.error('Error registering document on blockchain:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register document on blockchain',
    });
  }
});

// Route to verify a document on the blockchain
router.post('/verify', async (req, res) => {
  try {
    const { documentId, documentHash } = req.body;

    if (!documentId || !documentHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document ID and hash are required',
      });
    }

    // Verify the document
    const verification = verifyTransaction(documentId, documentHash);

    // Log the verification
    securityMiddleware.auditLog('BLOCKCHAIN_DOCUMENT_VERIFIED', {
      documentId,
      documentHash: documentHash.substring(0, 10) + '...',
      verified: verification.verified,
      userId: req.user?.id || 'system',
    });

    res.json({
      success: true,
      ...verification,
    });
  } catch (error) {
    console.error('Error verifying document on blockchain:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify document on blockchain',
    });
  }
});

// Route to record an audit event on the blockchain
router.post('/audit', async (req, res) => {
  try {
    const { eventHash, eventType, eventData } = req.body;

    if (!eventHash || !eventType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Event hash and type are required',
      });
    }

    // Create a blockchain transaction
    const transaction = createTransaction({
      eventHash,
      eventType,
      eventData: eventData || {},
      recordedBy: req.user?.id || 'system',
      recordedAt: new Date().toISOString(),
    });

    // Log the audit event
    securityMiddleware.auditLog('BLOCKCHAIN_AUDIT_RECORDED', {
      eventType,
      transactionId: transaction.transactionId,
      userId: req.user?.id || 'system',
    });

    // Return the transaction receipt
    res.status(201).json({
      success: true,
      message: 'Audit event recorded on blockchain',
      transactionId: transaction.transactionId,
      blockNumber: transaction.blockNumber,
      timestamp: transaction.timestamp,
    });
  } catch (error) {
    console.error('Error recording audit event on blockchain:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to record audit event on blockchain',
    });
  }
});

// Route to create a smart contract for document access control
router.post('/smart-contract', async (req, res) => {
  try {
    const { documentId, documentHash, accessRules } = req.body;

    if (!documentId || !documentHash || !accessRules) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document ID, hash, and access rules are required',
      });
    }

    // Create a contract address
    const contractAddress = '0x' + crypto.randomBytes(20).toString('hex');

    // Store the smart contract
    smartContracts.set(contractAddress, {
      documentId,
      documentHash,
      accessRules,
      createdBy: req.user?.id || 'system',
      createdAt: new Date().toISOString(),
      active: true,
    });

    // Create a blockchain transaction for the contract creation
    const transaction = createTransaction({
      contractAddress,
      documentId,
      documentHash,
      accessRulesHash: crypto
        .createHash('sha256')
        .update(JSON.stringify(accessRules))
        .digest('hex'),
      createdBy: req.user?.id || 'system',
      createdAt: new Date().toISOString(),
    });

    // Log the smart contract creation
    securityMiddleware.auditLog('BLOCKCHAIN_SMART_CONTRACT_CREATED', {
      documentId,
      contractAddress,
      transactionId: transaction.transactionId,
      userId: req.user?.id || 'system',
    });

    // Return the contract details
    res.status(201).json({
      success: true,
      message: 'Smart contract created',
      contractAddress,
      transactionId: transaction.transactionId,
      blockNumber: transaction.blockNumber,
      timestamp: transaction.timestamp,
    });
  } catch (error) {
    console.error('Error creating smart contract:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create smart contract',
    });
  }
});

// Route to verify access using AI and blockchain
router.post('/verify-access', async (req, res) => {
  try {
    const { userId, documentId, accessType, aiDecision, aiConfidence, aiReasoning } = req.body;

    if (!userId || !documentId || !accessType || aiDecision === undefined) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User ID, document ID, access type, and AI decision are required',
      });
    }

    // Record the AI decision on the blockchain
    const transaction = createTransaction({
      userId,
      documentId,
      accessType,
      aiDecision,
      aiConfidence: aiConfidence || 0,
      aiReasoning: aiReasoning || '',
      verifiedAt: new Date().toISOString(),
    });

    // Check if the document has a smart contract
    let smartContractVerification = false;
    let contractAddress = null;

    for (const [address, contract] of smartContracts.entries()) {
      if (contract.documentId === documentId) {
        contractAddress = address;

        // In a real implementation, this would execute the smart contract logic
        // For this example, we'll just check if the user is in the access rules
        const userHasAccess = contract.accessRules.some(
          rule => rule.userId === userId && rule.accessType === accessType
        );

        smartContractVerification = userHasAccess;
        break;
      }
    }

    // Final verification result combines AI and smart contract
    const verified = aiDecision && (contractAddress ? smartContractVerification : true);

    // Log the verification
    securityMiddleware.auditLog('AI_BLOCKCHAIN_ACCESS_VERIFICATION', {
      userId,
      documentId,
      accessType,
      verified,
      aiDecision,
      smartContractVerification,
      transactionId: transaction.transactionId,
    });

    res.json({
      success: true,
      verified,
      aiDecision,
      aiConfidence: aiConfidence || 0,
      blockchainVerified: true,
      smartContractVerification,
      contractAddress,
      transactionId: transaction.transactionId,
      blockNumber: transaction.blockNumber,
      timestamp: transaction.timestamp,
    });
  } catch (error) {
    console.error('Error verifying access with AI and blockchain:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify access with AI and blockchain',
    });
  }
});

// Route to get blockchain configuration
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: BLOCKCHAIN_CONFIG,
  });
});

// Endpoint to get a document's blockchain verification information
router.get('/documents/:documentId/verification', async (req, res) => {
  try {
    const { documentId } = req.params;

    const registryEntry = blockchainRegistry.get(documentId);

    if (!registryEntry) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not registered on blockchain',
      });
    }

    res.json({
      success: true,
      documentId,
      registered: true,
      blockNumber: registryEntry.blockNumber,
      timestamp: registryEntry.timestamp,
      transactionId: registryEntry.transactionId,
    });
  } catch (error) {
    console.error('Error getting document verification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get document verification information',
    });
  }
});

module.exports = router;
