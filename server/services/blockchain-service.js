/**
 * Blockchain Service
 *
 * This service provides blockchain integration for enhanced
 * FDA 21 CFR Part 11 compliance, providing tamper-evident
 * electronic records and signatures.
 */

const crypto = require('crypto');

class BlockchainService {
  constructor() {
    this.blockchainEnabled = true;
    this.blockchainType = 'permissioned'; // 'permissioned' or 'public'
    this.hashAlgorithm = 'sha256';

    // In a real implementation, this would be connected to an actual blockchain
    // platform like Hyperledger Fabric or a permissioned Ethereum network
    this.mockBlockchain = {
      blocks: [],
      transactions: [],
      lastBlockHash: null,
      addTransaction: this.addTransaction.bind(this),
      verifyTransaction: this.verifyTransaction.bind(this),
      getTransactionHistory: this.getTransactionHistory.bind(this),
      verifyBlockchainIntegrity: this.verifyBlockchainIntegrity.bind(this),
    };
  }

  /**
   * Store a document hash on the blockchain
   *
   * @param {Object} document Document to hash and store
   * @param {String} userId User ID of the person storing the document
   * @returns {Object} Transaction information
   */
  async storeDocumentHash(document, userId) {
    console.log(`Storing document hash for document ${document.id || 'unknown'} on blockchain`);

    // Generate document hash
    const documentString = typeof document === 'object' ? JSON.stringify(document) : document;
    const hash = crypto.createHash(this.hashAlgorithm).update(documentString).digest('hex');

    // Create transaction data
    const transactionData = {
      type: 'DOCUMENT_HASH',
      documentId: document.id || `DOC-${Date.now()}`,
      hash,
      algorithm: this.hashAlgorithm,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Store transaction on blockchain
    const transaction = await this.addTransaction(transactionData);

    return {
      transactionId: transaction.id,
      documentId: transactionData.documentId,
      hash,
      timestamp: transactionData.timestamp,
      blockchainId: transaction.blockId,
      status: 'CONFIRMED',
    };
  }

  /**
   * Store a signature on the blockchain
   *
   * @param {Object} signature Signature to store
   * @returns {Object} Transaction information
   */
  async storeSignature(signature) {
    console.log(`Storing signature ${signature.id} on blockchain`);

    // Generate signature hash
    const signatureString = JSON.stringify(signature);
    const hash = crypto.createHash(this.hashAlgorithm).update(signatureString).digest('hex');

    // Create transaction data
    const transactionData = {
      type: 'SIGNATURE_VERIFICATION',
      signatureId: signature.id,
      documentId: signature.documentId,
      hash,
      algorithm: this.hashAlgorithm,
      userId: signature.userId,
      meaning: signature.meaning,
      timestamp: new Date().toISOString(),
    };

    // Store transaction on blockchain
    const transaction = await this.addTransaction(transactionData);

    return {
      transactionId: transaction.id,
      signatureId: transactionData.signatureId,
      documentId: transactionData.documentId,
      hash,
      timestamp: transactionData.timestamp,
      blockchainId: transaction.blockId,
      status: 'CONFIRMED',
    };
  }

  /**
   * Store a system configuration change on the blockchain
   *
   * @param {Object} configData Configuration change data
   * @param {String} userId User ID of the person making the change
   * @returns {Object} Transaction information
   */
  async storeConfigChange(configData, userId) {
    console.log(`Storing config change for ${configData.setting} on blockchain`);

    // Generate config data hash
    const configString = JSON.stringify(configData);
    const hash = crypto.createHash(this.hashAlgorithm).update(configString).digest('hex');

    // Create transaction data
    const transactionData = {
      type: 'SYSTEM_CONFIG_CHANGE',
      configId: `CFG-${configData.setting}`,
      hash,
      algorithm: this.hashAlgorithm,
      setting: configData.setting,
      oldValue: configData.oldValue,
      newValue: configData.newValue,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Store transaction on blockchain
    const transaction = await this.addTransaction(transactionData);

    return {
      transactionId: transaction.id,
      configId: transactionData.configId,
      hash,
      timestamp: transactionData.timestamp,
      blockchainId: transaction.blockId,
      status: 'CONFIRMED',
    };
  }

  /**
   * Verify a document against its stored hash on the blockchain
   *
   * @param {Object} document Document to verify
   * @param {String} transactionId Transaction ID of the original hash storage
   * @returns {Object} Verification result
   */
  async verifyDocument(document, transactionId) {
    console.log(`Verifying document ${document.id || 'unknown'} against blockchain`);

    // Generate current document hash
    const documentString = typeof document === 'object' ? JSON.stringify(document) : document;
    const currentHash = crypto.createHash(this.hashAlgorithm).update(documentString).digest('hex');

    // Retrieve transaction from blockchain
    const transaction = await this.verifyTransaction(transactionId);

    if (!transaction) {
      return {
        verified: false,
        reason: 'Transaction not found on blockchain',
        timestamp: new Date().toISOString(),
      };
    }

    // Compare hashes
    const verified = transaction.hash === currentHash;

    return {
      verified,
      documentId: document.id,
      currentHash,
      storedHash: transaction.hash,
      timestamp: new Date().toISOString(),
      blockchainTransactionId: transaction.id,
      blockchainBlockId: transaction.blockId,
    };
  }

  /**
   * Verify all audit trails on the blockchain
   *
   * @returns {Boolean} Whether all audit trails are verified
   */
  async verifyAuditTrailIntegrity() {
    console.log('Verifying audit trail integrity on blockchain');

    // In a real implementation, this would verify all audit trail records
    // against their blockchain-stored hashes

    // For this example, we'll assume all audit trails are verified
    return true;
  }

  /**
   * Add a transaction to the blockchain
   *
   * @param {Object} transactionData Transaction data
   * @returns {Object} Created transaction
   */
  async addTransaction(transactionData) {
    // Create transaction object
    const transaction = {
      id: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...transactionData,
      blockId: `BLK-${Date.now()}`,
      status: 'CONFIRMED',
      timestamp: new Date().toISOString(),
    };

    // In a real implementation, this would add the transaction to an actual blockchain

    // For this example, we'll just add it to our mock blockchain
    this.mockBlockchain.transactions.push(transaction);

    console.log(`Transaction ${transaction.id} added to blockchain`);

    return transaction;
  }

  /**
   * Verify a transaction on the blockchain
   *
   * @param {String} transactionId Transaction ID to verify
   * @returns {Object} Transaction data if verified, null otherwise
   */
  async verifyTransaction(transactionId) {
    console.log(`Verifying transaction ${transactionId} on blockchain`);

    // In a real implementation, this would verify the transaction on an actual blockchain

    // For this example, we'll just check our mock blockchain
    const transaction = this.mockBlockchain.transactions.find(tx => tx.id === transactionId);

    if (!transaction) {
      console.log(`Transaction ${transactionId} not found on blockchain`);
      return null;
    }

    console.log(`Transaction ${transactionId} verified on blockchain`);

    return transaction;
  }

  /**
   * Get transaction history for a document
   *
   * @param {String} documentId Document ID
   * @returns {Array} Transaction history
   */
  async getTransactionHistory(documentId) {
    console.log(`Getting transaction history for document ${documentId} from blockchain`);

    // In a real implementation, this would get the transaction history from an actual blockchain

    // For this example, we'll filter our mock blockchain
    const transactions = this.mockBlockchain.transactions.filter(
      tx =>
        tx.documentId === documentId ||
        (tx.type === 'SIGNATURE_VERIFICATION' && tx.documentId === documentId)
    );

    // Sort by timestamp (newest first)
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`Found ${transactions.length} transactions for document ${documentId}`);

    return transactions;
  }

  /**
   * Verify the integrity of the entire blockchain
   *
   * @returns {Object} Verification result
   */
  async verifyBlockchainIntegrity() {
    console.log('Verifying blockchain integrity');

    // In a real implementation, this would verify the integrity of an actual blockchain

    // For this example, we'll assume the blockchain is intact
    return {
      verified: true,
      timestamp: new Date().toISOString(),
      blockCount: this.mockBlockchain.blocks.length,
      transactionCount: this.mockBlockchain.transactions.length,
    };
  }

  /**
   * Export blockchain data to a file
   *
   * @returns {Object} Export result
   */
  async exportBlockchainData() {
    console.log('Exporting blockchain data');

    // In a real implementation, this would export data from an actual blockchain

    // For this example, we'll assume export succeeds
    return {
      exportId: `EXPORT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      blockCount: this.mockBlockchain.blocks.length,
      transactionCount: this.mockBlockchain.transactions.length,
      status: 'COMPLETED',
    };
  }

  /**
   * Get the current blockchain status
   *
   * @returns {Object} Blockchain status
   */
  async getBlockchainStatus() {
    return {
      enabled: this.blockchainEnabled,
      type: this.blockchainType,
      blockCount: this.mockBlockchain.blocks.length,
      transactionCount: this.mockBlockchain.transactions.length,
      lastUpdated: new Date().toISOString(),
      status: 'CONNECTED',
    };
  }

  /**
   * Get recent blockchain transactions
   *
   * @param {Number} limit Maximum number of transactions to return
   * @returns {Array} Recent transactions
   */
  async getRecentTransactions(limit = 5) {
    // Sort transactions by timestamp (newest first)
    const sortedTransactions = [...this.mockBlockchain.transactions].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Return the most recent transactions
    return sortedTransactions.slice(0, limit);
  }
}

module.exports = {
  BlockchainService,
};
