// Build optimization script for deployment
import fs from 'fs';
import path from 'path';

console.log('🛠️ Optimizing build for deployment...');

// Remove large unnecessary files
const filesToRemove = ['node_modules/.cache', '.vite', 'dist/cache', 'tmp'];

filesToRemove.forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.rmSync(file, { recursive: true, force: true });
      console.log(`✅ Removed: ${file}`);
    } catch (error) {
      console.log(`⚠️ Could not remove ${file}: ${error.message}`);
    }
  }
});

console.log('✅ Build optimization complete!');
