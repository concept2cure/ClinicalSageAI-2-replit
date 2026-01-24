const { MemStorage } = require('./server/storage.ts');

const storage = new MemStorage();
console.log('MemStorage methods:');
console.log('- getDeviceSubmissionWorkflows:', typeof storage.getDeviceSubmissionWorkflows);
console.log('- createDeviceSubmissionWorkflow:', typeof storage.createDeviceSubmissionWorkflow);
console.log('- updateDeviceSubmissionWorkflow:', typeof storage.updateDeviceSubmissionWorkflow);
console.log('- getCerv2510kSections:', typeof storage.getCerv2510kSections);
console.log('- createCerv2510kSection:', typeof storage.createCerv2510kSection);
console.log('- updateCerv2510kSection:', typeof storage.updateCerv2510kSection);
