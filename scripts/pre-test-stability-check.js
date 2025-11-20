
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Running pre-test stability checks...');

// Check critical files exist
const criticalFiles = [
  'client/src/pages/CERV2Page.jsx',
  'client/src/components/ectd/EmbeddedFileBrowser.jsx',
  'server/index.ts',
  'package.json'
];

let allFilesExist = true;
criticalFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error(`❌ Critical file missing: ${file}`);
    allFilesExist = false;
  } else {
    console.log(`✅ Found: ${file}`);
  }
});

// Check for common syntax errors in CERV2Page
try {
  const cerv2Content = fs.readFileSync('client/src/pages/CERV2Page.jsx', 'utf8');
  
  // Check for basic React component structure
  if (!cerv2Content.includes('export default function CERV2Page')) {
    console.error('❌ CERV2Page.jsx missing proper export');
    allFilesExist = false;
  } else {
    console.log('✅ CERV2Page.jsx has proper export');
  }
  
  // Check for balanced brackets
  const openBraces = (cerv2Content.match(/{/g) || []).length;
  const closeBraces = (cerv2Content.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    console.error(`❌ CERV2Page.jsx has unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    allFilesExist = false;
  } else {
    console.log('✅ CERV2Page.jsx has balanced braces');
  }
} catch (err) {
  console.error('❌ Error reading CERV2Page.jsx:', err.message);
  allFilesExist = false;
}

// Check EmbeddedFileBrowser for the specific div issue
try {
  const browserContent = fs.readFileSync('client/src/components/ectd/EmbeddedFileBrowser.jsx', 'utf8');
  
  // Check for the problematic div pattern
  if (browserContent.includes('<div className="border rounded-md overflow-hidden bg-white" ...')) {
    console.error('❌ EmbeddedFileBrowser.jsx still has malformed div tag');
    allFilesExist = false;
  } else {
    console.log('✅ EmbeddedFileBrowser.jsx div tags appear correct');
  }
} catch (err) {
  console.error('❌ Error reading EmbeddedFileBrowser.jsx:', err.message);
  allFilesExist = false;
}

if (allFilesExist) {
  console.log('\n🎉 All stability checks passed! Ready for user testing.');
  process.exit(0);
} else {
  console.log('\n❌ Stability checks failed. Please fix the issues above before testing.');
  process.exit(1);
}
