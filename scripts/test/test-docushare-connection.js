import { VaultDMSService } from './server/services/VaultDMSService.js';

// Mock storage client for testing
const mockStorageClient = {
  upload: () => Promise.resolve({ url: 'mock-url' }),
  download: () => Promise.resolve('mock-content'),
};

// Mock database pool for testing
const mockDbPool = {
  query: () => Promise.resolve({ rows: [] }),
};

async function testDocuShareConnection() {
  try {
    const vaultDmsService = new VaultDMSService(mockDbPool, mockStorageClient);

    // Check connection
    const isConnected = await vaultDmsService.checkDocuShareConnection();
    logger.info('Connection result:', isConnected);

    // Or use it in a try-catch for error handling
    try {
      await vaultDmsService.checkDocuShareConnection();
      logger.info('DocuShare is ready');
    } catch (error) {
      logger.info('DocuShare connection failed:', error.message);
    }
  } catch (error) {
    logger.error('Test failed:', error.message);
  }
}

testDocuShareConnection();
