const fs = require('fs');
const path = require('path');

// Files to process
const targetFiles = [
  'client/src/components/DocumentDiffViewer.tsx',
  'client/src/components/SubmissionBuilderWebSocket.tsx',
  'client/src/hooks/useQcSocket.ts',
  'client/src/hooks/use-toast-context.tsx',
  'client/src/hooks/useQCWebSocket.tsx',
  'client/src/pages/CopilotDrawer.jsx',
  'client/src/pages/RiskAnalysis.tsx',
  'client/src/pages/IQOQDownload.tsx',
  'client/src/pages/SubmissionBuilder.tsx',
];

// Process each file
targetFiles.forEach(filePath => {
  try {
    const fullPath = path.resolve(filePath);

    // Skip if file doesn't exist
    if (!fs.existsSync(fullPath)) {
      console.log(`Skipping non-existent file: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');

    // Replace import statements
    content = content.replace(
      /import\s+{\s*toast\s*(?:,\s*ToastContainer)?\s*(?:,\s*[^}]+)?\s*}\s*from\s*['"]react-toastify['"];?/g,
      "import { useToast } from '../App';"
    );

    // Replace ToastContainer import
    content = content.replace(
      /import\s+{\s*ToastContainer\s*(?:,\s*[^}]+)?\s*}\s*from\s*['"]react-toastify['"];?/g,
      '// Toast container now provided by SecureToast'
    );

    // Remove CSS import
    content = content.replace(
      /import\s+['"]react-toastify\/dist\/ReactToastify\.css['"];?/g,
      '// Using custom toast styles'
    );

    // Replace toast.success calls
    content = content.replace(
      /toast\.success\(['"]([^'"]+)['"]\)/g,
      "useToast().showToast('$1', 'success')"
    );

    // Replace toast.error calls
    content = content.replace(
      /toast\.error\(['"]([^'"]+)['"]\)/g,
      "useToast().showToast('$1', 'error')"
    );

    // Replace toast.info calls
    content = content.replace(
      /toast\.info\(['"]([^'"]+)['"]\)/g,
      "useToast().showToast('$1', 'info')"
    );

    // Replace toast.warning calls
    content = content.replace(
      /toast\.warning\(['"]([^'"]+)['"]\)/g,
      "useToast().showToast('$1', 'warning')"
    );

    // Remove ToastContainer component
    content = content.replace(
      //,
      '<!-- Toast container now provided by SecureToast -->'
    );

    // Save the changes
    fs.writeFileSync(fullPath, content);
    console.log(`Updated: ${filePath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
});

console.log('Toast reference update complete.');
