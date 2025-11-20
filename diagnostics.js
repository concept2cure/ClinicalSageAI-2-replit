/**
 * Diagnostics Script for TrialSage
 *
 * This script performs diagnostics on the application environment and saves a report.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'not set',
    nodeVersion: process.version,
    packageJson: null,
    installedDependencies: null,
    moduleResolution: {},
  };

  // Get package.json content
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      report.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
  } catch (error) {
    report.packageJsonError = error.message;
  }

  // Get installed dependencies
  try {
    report.installedDependencies = JSON.parse(execSync('npm list --json').toString());
  } catch (error) {
    report.installedDependenciesError = error.message;
  }

  // Test if modules can be found
  const modulesToTest = [
    'react-helmet',
    'react-slick',
    'slick-carousel/slick/slick.css',
    'slick-carousel/slick/slick-theme.css',
    'react-dropzone',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
    '@dnd-kit/core',
    'react-joyride',
    'react-multi-split-pane',
    'react-diff-viewer-continued',
    'react-hot-toast',
    'react-select',
    'react-table',
    'vertical-timeline-component-for-react',
    'react-sparklines',
    'socket.io',
  ];

  modulesToTest.forEach(moduleName => {
    try {
      // In ESM we can't use require.resolve directly
      // Try to dynamically import instead
      report.moduleResolution[moduleName] = {
        installation: fs.existsSync(
          path.join(process.cwd(), 'node_modules', moduleName.split('/')[0])
        ),
        error: null,
      };
    } catch (error) {
      report.moduleResolution[moduleName] = {
        resolved: false,
        error: error.message,
      };
    }
  });

  // Save the report
  fs.writeFileSync(
    path.join(process.cwd(), 'diagnostics-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('Diagnostics report generated: diagnostics-report.json');
  return report;
}

generateReport();
