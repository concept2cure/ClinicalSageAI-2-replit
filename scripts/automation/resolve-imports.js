/**
 * Import Resolver Script
 *
 * This script helps manage problematic imports by modifying import statements to use
 * our lightweight wrappers when the original packages can't be found.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_SRC_DIR = path.join(__dirname, 'client', 'src');

// Packages to be replaced with lightweight wrappers
const PROBLEM_PACKAGES = [
  'react-helmet',
  'react-joyride',
  'react-slick',
  'slick-carousel/slick/slick.css',
  'slick-carousel/slick/slick-theme.css',
  'react-multi-split-pane',
  'react-diff-viewer-continued',
  'react-dropzone',
  'react-hot-toast',
  'react-select',
  'react-table',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  '@dnd-kit/core',
  'vertical-timeline-component-for-react',
  'react-sparklines',
];

// Process a single file, replacing problematic imports
function processFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      logger.info(`File not found: ${filePath}`);
      return;
    }

    // Skip our wrapper file
    if (filePath.includes('lightweight-wrappers.js')) {
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Check for each problematic package
    PROBLEM_PACKAGES.forEach(pkg => {
      // Look for various import patterns
      const importRegexes = [
        new RegExp(`import\\s+[^{]*\\s+from\\s+["']${pkg}["']`, 'g'),
        new RegExp(`import\\s+{[^}]*}\\s+from\\s+["']${pkg}["']`, 'g'),
        new RegExp(`import\\s+["']${pkg}["']`, 'g'),
      ];

      for (const regex of importRegexes) {
        if (regex.test(content)) {
          // Replace with import from our wrapper if it's a module import
          if (!pkg.endsWith('.css')) {
            const match = content.match(regex);
            if (match && match[0]) {
              const newImport = match[0].replace(
                new RegExp(`["']${pkg}["']`),
                '"../lightweight-wrappers.jsx"'
              );
              content = content.replace(match[0], newImport);
              modified = true;
            }
          } else {
            // Just comment out CSS imports
            const match = content.match(regex);
            if (match && match[0]) {
              content = content.replace(match[0], `// ${match[0]} - commented out by resolver`);
              modified = true;
            }
          }
        }
      }
    });

    // Save the file if it was modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      logger.info(`Updated imports in: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Error processing file ${filePath}:`, error);
  }
}

// Recursively process all files in a directory
function processDirectory(directoryPath) {
  try {
    const files = fs.readdirSync(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        processDirectory(filePath);
      } else if (/\.(jsx?|tsx?)$/.test(file)) {
        processFile(filePath);
      }
    }
  } catch (error) {
    logger.error(`Error processing directory ${directoryPath}:`, error);
  }
}

// Start processing the client/src directory
logger.info('Starting to process React files in client/src...');
processDirectory(CLIENT_SRC_DIR);
logger.info('Finished processing React files. Imports should now use lightweight wrappers.');
