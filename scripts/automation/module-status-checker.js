/**
 * Module Status Checker
 *
 * This script checks the health status of all critical modules in the TrialSage platform.
 */
import fetch from 'node-fetch';

const modules = [
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'CER2V™', path: '/cerv2' },
  { name: 'IND Wizard™', path: '/ind-wizard' },
  { name: 'eCTD Author™', path: '/ectd-author' },
  { name: 'CMC Module™', path: '/cmc' },
  { name: 'CSR Intelligence™', path: '/csr' },
  { name: 'Study Architect™', path: '/study-architect' },
  { name: 'Reports', path: '/reports' },
  { name: 'Vault™', path: '/vault' },
  { name: 'Regulatory Hub™', path: '/regulatory-intelligence-hub' },
  { name: 'Risk Heatmap™', path: '/regulatory-risk-dashboard' },
  { name: 'Analytics', path: '/analytics' },
];

async function checkModules() {
  const baseUrl = 'http://localhost:3000';

  logger.info('TrialSage™ Module Status Check');
  logger.info('==============================');

  for (const module of modules) {
    try {
      const url = `${baseUrl}${module.path}`;
      const response = await fetch(url);

      if (response.ok) {
        logger.info(`✅ ${module.name} (${module.path}): Available`);
      } else {
        logger.info(
          `❌ ${module.name} (${module.path}): Error ${response.status} - ${response.statusText}`
        );
      }
    } catch (error) {
      logger.info(`❌ ${module.name} (${module.path}): Connection failed - ${error.message}`);
    }
  }

  logger.info('\nEmergency Access Points:');
  logger.info('----------------------');
  logger.info(`• Main app: ${baseUrl}`);
  logger.info(`• Emergency portal: ${baseUrl}/emergency.html`);
  logger.info(`• Emergency server: http://localhost:8080`);
}

checkModules();
