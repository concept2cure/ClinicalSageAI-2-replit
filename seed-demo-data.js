/**
 * Demo Data Seeding Script
 * Populates the system with realistic demo data for client presentations
 * 
 * Usage: npm run seed:demo
 * Or in development: node seed-demo-data.js
 */

import mockDemoData from './src/data/mockDemoData.js';
import fs from 'fs';
import path from 'path';

// Console styling
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  header: (msg) =>
    console.log(`\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  divider: () => console.log(`${colors.cyan}${'─'.repeat(60)}${colors.reset}`),
};

async function seedDemo() {
  try {
    log.header('CERV2 Demo Data Seeding');
    log.info('Populating system with realistic demo scenarios...\n');

    // Export summary statistics
    const summary = {
      timestamp: new Date().toISOString(),
      dataExports: {
        clients: mockDemoData.mockDemoClients.length,
        devices: mockDemoData.mockDeviceProfiles.length,
        documents: mockDemoData.mockDocuments.length,
        predicateDevices: mockDemoData.mockPredicateDevices.length,
        equivalenceAnalyses: mockDemoData.mockEquivalenceAnalyses.length,
        complianceChecks: mockDemoData.mockComplianceChecks.length,
        submissionPackages: mockDemoData.mockSubmissionPackages.length,
        fdaSubmissions: mockDemoData.mockFDASubmissions.length,
        scenarios: Object.keys(mockDemoData.mockDemoScenarios).length,
      },
      completionStages: {
        stage1_startup: {
          name: 'Just Started',
          completion: '5%',
          description: 'Basic device name only',
          deviceId: mockDemoData.mockDeviceProfiles[0]?.id,
        },
        stage2_profile: {
          name: 'Device Profile Complete',
          completion: '20%',
          description: 'All device specs filled in',
          deviceId: mockDemoData.mockDeviceProfiles[1]?.id,
        },
        stage3_predicate: {
          name: 'Predicate Selected',
          completion: '35%',
          description: 'Found matching predicate device',
          deviceId: mockDemoData.mockDeviceProfiles[2]?.id,
        },
        stage4_equivalence: {
          name: 'Equivalence Complete',
          completion: '50%',
          description: 'Equivalence analysis completed',
          deviceId: mockDemoData.mockDeviceProfiles[3]?.id,
        },
        stage5_compliance: {
          name: 'Compliance Check Complete',
          completion: '65%',
          description: 'Regulatory requirements validated',
          deviceId: mockDemoData.mockDeviceProfiles[4]?.id,
        },
        stage6_package: {
          name: 'Submission Package Complete',
          completion: '80%',
          description: 'All documents assembled',
          deviceId: mockDemoData.mockDeviceProfiles[5]?.id,
        },
        stage7_submitted: {
          name: 'Submitted to FDA',
          completion: '90%',
          description: 'Under FDA review',
          deviceId: mockDemoData.mockDeviceProfiles[6]?.id,
        },
        stage8_approved: {
          name: 'FDA Approved',
          completion: '100%',
          description: 'Cleared to market',
          deviceId: mockDemoData.mockDeviceProfiles[7]?.id,
        },
      },
      scenarios: Object.entries(mockDemoData.mockDemoScenarios).map(([key, scenario]) => ({
        name: key,
        description: scenario.description,
        devices: scenario.devices.length,
        organizations: scenario.organizations.length,
        documents: scenario.documents.length,
      })),
    };

    // Log clients
    log.divider();
    log.header('Demo Organizations');
    mockDemoData.mockDemoClients.forEach((client, idx) => {
      log.info(`${idx + 1}. ${client.name}`);
      console.log(`   Location: ${client.city}, ${client.state}, ${client.country}`);
      console.log(`   Industry: ${client.industry}`);
      console.log(`   Email: ${client.email}`);
    });

    // Log completion stages
    log.divider();
    log.header('8 Device Completion Stages');
    mockDemoData.mockDeviceProfiles.forEach((device, idx) => {
      log.info(
        `Stage ${idx + 1} (${device.completionPercentage}%): ${device.deviceName}`
      );
      console.log(`   Status: ${device.status}`);
      console.log(`   Manufacturer: ${device.manufacturer}`);
    });

    // Log documents
    log.divider();
    log.header('Demo Documents');
    mockDemoData.mockDocuments.forEach((doc) => {
      log.info(`${doc.title} (${doc.completionPercentage}%)`);
      console.log(`   Status: ${doc.status}`);
      console.log(`   Sections Completed: ${doc.sections.filter((s) => s.completed).length}/${doc.sections.length}`);
    });

    // Log predicate devices
    log.divider();
    log.header('Predicate Devices (FDA Cleared)');
    mockDemoData.mockPredicateDevices.forEach((pred) => {
      log.info(`${pred.deviceName} (${pred.kNumber})`);
      console.log(`   Manufacturer: ${pred.manufacturer}`);
      console.log(`   Clearance: ${pred.clearanceDate}`);
    });

    // Log equivalence analyses
    log.divider();
    log.header('Equivalence Analyses');
    mockDemoData.mockEquivalenceAnalyses.forEach((equiv, idx) => {
      log.info(`Analysis ${idx + 1}: Score ${equiv.equivalenceScore}/100`);
      console.log(`   Similarities: ${equiv.similarities.length} found`);
      console.log(`   Differences: ${equiv.differences.length} identified`);
    });

    // Log compliance checks
    log.divider();
    log.header('Compliance Checks');
    mockDemoData.mockComplianceChecks.forEach((comp, idx) => {
      const statusLabel = comp.status === 'passed' ? '✓ PASSED' : '⚠ NEEDS REVIEW';
      log.info(`Check ${idx + 1}: ${statusLabel} (${comp.complianceScore}/100)`);
      console.log(`   Can Proceed: ${comp.canProceedToSubmission ? 'Yes' : 'No'}`);
      console.log(`   Warnings: ${comp.warnings.length}`);
    });

    // Log FDA submissions
    log.divider();
    log.header('FDA Submissions');
    mockDemoData.mockFDASubmissions.forEach((sub) => {
      const statusLabel = sub.status === 'cleared' ? '🎉 CLEARED' : '⏳ UNDER REVIEW';
      log.info(`${sub.submissionNumber}: ${statusLabel}`);
      console.log(`   Submitted: ${sub.submissionDate}`);
      if (sub.decisionDate) {
        console.log(`   Decided: ${sub.decisionDate}`);
      } else if (sub.estimatedDecisionDate) {
        console.log(`   Est. Decision: ${sub.estimatedDecisionDate}`);
      }
    });

    // Log demo scenarios
    log.divider();
    log.header('Pre-Built Demo Scenarios');
    Object.entries(mockDemoData.mockDemoScenarios).forEach(([key, scenario]) => {
      log.info(key.charAt(0).toUpperCase() + key.slice(1));
      console.log(`   ${scenario.description}`);
      console.log(`   Devices: ${scenario.devices.length} at various stages`);
      console.log(`   Organizations: ${scenario.organizations.length}`);
      console.log(`   Documents: ${scenario.documents.length}`);
    });

    // Save summary to file
    log.divider();
    log.header('Saving Summary');

    const summaryPath = path.join(
      process.cwd(),
      'DEMO_DATA_SUMMARY.json'
    );
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    log.success(`Summary saved to: ${summaryPath}`);

    // Save a JSON export of all demo data
    const exportPath = path.join(
      process.cwd(),
      'mock-data-export.json'
    );
    fs.writeFileSync(
      exportPath,
      JSON.stringify(mockDemoData, null, 2)
    );
    log.success(`Full export saved to: ${exportPath}`);

    // Create integration guide
    log.divider();
    log.header('Integration Guide');
    log.info('To use demo data in your components:');
    console.log(`
    import mockDemoData from '@/data/mockDemoData';
    
    // Access specific data
    const clients = mockDemoData.mockDemoClients;
    const devices = mockDemoData.mockDeviceProfiles;
    const scenarios = mockDemoData.mockDemoScenarios;
    
    // Use pre-built scenarios
    const startupDemo = scenarios.startup;
    const advancedDemo = scenarios.advanced;
    `);

    log.divider();
    log.header('Summary Statistics');
    console.log(`
    ✓ Total Organizations: ${summary.dataExports.clients}
    ✓ Total Devices: ${summary.dataExports.devices} (spanning ${summary.dataExports.devices} stages)
    ✓ Total Documents: ${summary.dataExports.documents}
    ✓ Predicate Devices: ${summary.dataExports.predicateDevices}
    ✓ Equivalence Analyses: ${summary.dataExports.equivalenceAnalyses}
    ✓ Compliance Checks: ${summary.dataExports.complianceChecks}
    ✓ Submission Packages: ${summary.dataExports.submissionPackages}
    ✓ FDA Submissions: ${summary.dataExports.fdaSubmissions}
    ✓ Demo Scenarios: ${summary.dataExports.scenarios} (startup, midstage, advanced)
    `);

    log.success(
      '\n✓ Demo data seeding complete! Ready for client demonstrations.\n'
    );
  } catch (error) {
    log.error(`Seeding failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
seedDemo();

export default seedDemo;
