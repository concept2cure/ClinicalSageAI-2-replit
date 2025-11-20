const fs = require('fs');
const path = require('path');

function verifyReorganization() {
  console.log('🔍 Verifying reorganization...');

  const checks = [
    // Client structure
    { path: 'trialsage-clean/client/src/App.jsx', name: 'React App entry point' },
    { path: 'trialsage-clean/client/src/pages', name: 'Client pages directory' },
    { path: 'trialsage-clean/client/src/components', name: 'Client components directory' },

    // Server structure
    { path: 'trialsage-clean/server/index.ts', name: 'Server entry point' },
    { path: 'trialsage-clean/server/routes', name: 'Server routes directory' },
    { path: 'trialsage-clean/server/services', name: 'Server services directory' },
    { path: 'trialsage-clean/server/db', name: 'Database directory' },

    // Data structure
    { path: 'trialsage-clean/data', name: 'Data directory' },
    { path: 'trialsage-clean/uploads', name: 'Uploads directory' },

    // Configuration
    { path: 'trialsage-clean/package.json', name: 'Package configuration' },
    { path: 'trialsage-clean/.replit', name: 'Replit configuration' },
  ];

  let passed = 0;
  let failed = 0;

  checks.forEach(check => {
    if (fs.existsSync(check.path)) {
      console.log(`✅ ${check.name}`);
      passed++;
    } else {
      console.log(`❌ ${check.name} - Missing: ${check.path}`);
      failed++;
    }
  });

  console.log(`\n📊 Verification Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log(`🎉 Reorganization verification successful!`);
    console.log(`📁 You can now replace the old structure with trialsage-clean/`);
  } else {
    console.log(`⚠️  Please review failed checks before proceeding`);
  }

  return failed === 0;
}

verifyReorganization();
