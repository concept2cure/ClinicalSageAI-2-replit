/**
 * Custom test runner for the device profile API tests
 */
const { execSync } = require('child_process');

logger.info('Running device profile API tests...');

try {
  // Run Jest with the correct options
  execSync('NODE_OPTIONS=--experimental-vm-modules npx jest', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  logger.info('✅ All tests completed successfully!');
} catch (error) {
  logger.error('❌ Test execution failed:', error.message);
  process.exit(1);
}
