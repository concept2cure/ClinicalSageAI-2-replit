const { MemStorage } = require('./server/storage.ts');

const storage = new MemStorage();
logger.info('MemStorage methods:');
logger.info('- getDeviceSubmissionWorkflows:', typeof storage.getDeviceSubmissionWorkflows);
logger.info('- createDeviceSubmissionWorkflow:', typeof storage.createDeviceSubmissionWorkflow);
logger.info('- updateDeviceSubmissionWorkflow:', typeof storage.updateDeviceSubmissionWorkflow);
logger.info('- getCerv2510kSections:', typeof storage.getCerv2510kSections);
logger.info('- createCerv2510kSection:', typeof storage.createCerv2510kSection);
logger.info('- updateCerv2510kSection:', typeof storage.updateCerv2510kSection);
