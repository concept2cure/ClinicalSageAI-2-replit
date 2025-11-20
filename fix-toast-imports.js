/**
 * This script safely finds and replaces all react-toastify imports with our secure toast implementation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get client source directory
const CLIENT_SRC_DIR = path.join(__dirname, 'client', 'src');

console.log('🔍 Finding all files with react-toastify imports...');

// Function to process a file
function processFile(filePath) {
  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');

    // Check if file contains react-toastify imports
    if (content.includes('react-toastify')) {
      console.log(`🔧 Fixing imports in: ${filePath}`);

      // Replace imports
      let newContent = content;

      // Replace imports
      newContent = newContent.replace(
        /import.*from ['"]react-toastify['"]/g,
        'import { useToast } from "../../hooks/use-toast"'
      );

      // Replace ToastContainer
      newContent = newContent.replace(/<ToastContainer.*\/>/g, '');

      // Replace toast functions
      newContent = newContent.replace(/toast\.success/g, 'toast.success');
      newContent = newContent.replace(/toast\.error/g, 'toast.error');
      newContent = newContent.replace(/toast\.info/g, 'toast.info');
      newContent = newContent.replace(/toast\.warning/g, 'toast.warning');

      // Replace direct toast calls
      newContent = newContent.replace(/toast\(/g, 'toast.info(');

      // Write the modified content
      fs.writeFileSync(filePath, newContent, 'utf8');

      console.log(`✅ Fixed: ${filePath}`);
    }
  } catch (err) {
    console.error(`❌ Error processing file ${filePath}:`, err.message);
  }
}

// Function to recursively process a directory
function processDirectory(directoryPath) {
  try {
    const files = fs.readdirSync(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        processDirectory(filePath);
      } else if (
        stats.isFile() &&
        (file.endsWith('.js') ||
          file.endsWith('.jsx') ||
          file.endsWith('.ts') ||
          file.endsWith('.tsx'))
      ) {
        processFile(filePath);
      }
    }
  } catch (err) {
    console.error(`❌ Error processing directory ${directoryPath}:`, err.message);
  }
}

// Start processing from client src directory
if (fs.existsSync(CLIENT_SRC_DIR)) {
  processDirectory(CLIENT_SRC_DIR);
  console.log('✨ Toast import fixing complete!');
} else {
  console.error(`❌ Client source directory not found: ${CLIENT_SRC_DIR}`);
}
