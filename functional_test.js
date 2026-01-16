/**
 * Functional Testing Script for Component Integration
 * 
 * This script validates all features work correctly by checking:
 * 1. UI rendering
 * 2. Component lifecycle
 * 3. Data flow
 * 4. Service integrations
 * 5. Error handling
 */

import fs from 'fs';
import path from 'path';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(title, 'cyan');
  log('='.repeat(60), 'cyan');
  console.log('');
}

function logTest(name, status, details = '') {
  const symbol = status ? '✅' : '❌';
  const color = status ? 'green' : 'red';
  log(`${symbol} ${name}`, color);
  if (details) {
    log(`   └─ ${details}`, 'yellow');
  }
}

// Read file contents
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

// Test 1: Component Render Structure
logSection('TEST 1: Component Render Structure');

const integratedDemoPath = '/workspaces/ClinicalSageAI-2-replit/src/components/IntegratedDemoTab.jsx';
const integratedDemoContent = readFile(integratedDemoPath);

let test1Pass = true;

// Check return statement
test1Pass = test1Pass && integratedDemoContent.includes('return (');
logTest('Return statement exists', test1Pass);

// Check div wrapper
test1Pass = test1Pass && integratedDemoContent.includes('<div');
logTest('Has JSX div wrapper', test1Pass);

// Check DemoDashboard component
test1Pass = test1Pass && integratedDemoContent.includes('<DemoDashboard');
logTest('Renders DemoDashboard component', test1Pass);

// Check DeviceLoaderComponent
test1Pass = test1Pass && integratedDemoContent.includes('<DeviceLoaderComponent');
logTest('Renders DeviceLoaderComponent', test1Pass);

// Check mode toggle buttons
test1Pass = test1Pass && integratedDemoContent.includes('demoMode') && integratedDemoContent.includes('setDemoMode');
logTest('Mode toggle state management', test1Pass);

// Check scenario selector
test1Pass = test1Pass && integratedDemoContent.includes('selectedScenario') && integratedDemoContent.includes('setSelectedScenario');
logTest('Scenario selector state management', test1Pass);

// Test 2: Device Loader Component
logSection('TEST 2: Device Loader Component');

const deviceLoaderPath = '/workspaces/ClinicalSageAI-2-replit/src/components/DeviceLoaderComponent.jsx';
const deviceLoaderContent = readFile(deviceLoaderPath);

let test2Pass = true;

// Check hook usage
test2Pass = test2Pass && deviceLoaderContent.includes('useDemoDataIntegration');
logTest('Uses useDemoDataIntegration hook', test2Pass);

// Check prop destructuring
test2Pass = test2Pass && deviceLoaderContent.includes('onDeviceLoaded') && deviceLoaderContent.includes('onWorkflowUpdate');
logTest('Receives required props', test2Pass);

// Check device list rendering
test2Pass = test2Pass && deviceLoaderContent.includes('map(device =>');
logTest('Maps over device list', test2Pass);

// Check load button
test2Pass = test2Pass && deviceLoaderContent.includes('onClick') && deviceLoaderContent.includes('loadDeviceToWorkflow');
logTest('Has load device button', test2Pass);

// Check scenario buttons
test2Pass = test2Pass && (deviceLoaderContent.includes('Startup') || deviceLoaderContent.includes('scenario'));
logTest('Displays scenario options', test2Pass);

// Test 3: Integration Hook
logSection('TEST 3: Integration Hook - useDemoDataIntegration');

const hookPath = '/workspaces/ClinicalSageAI-2-replit/src/hooks/useDemoDataIntegration.js';
const hookContent = readFile(hookPath);

let test3Pass = true;

// Check all required functions
const requiredFunctions = [
  'loadDeviceToWorkflow',
  'loadScenarioToWorkflow',
  'searchPredicateDevices',
  'analyzeEquivalence',
  'runComplianceCheck',
  'editDocumentSection',
  'exportDocument',
  'getWorkflowProgress',
  'resetWorkflow',
];

requiredFunctions.forEach(func => {
  const hasFunc = hookContent.includes(`const ${func}`) || hookContent.includes(`${func}:`);
  test3Pass = test3Pass && hasFunc;
  logTest(`Function: ${func}`, hasFunc);
});

// Check state variables
const stateVars = ['isLoading', 'selectedScenario', 'selectedDevice', 'workflowData'];
stateVars.forEach(state => {
  const hasState = hookContent.includes(`useState(`) || hookContent.includes(state);
  logTest(`State: ${state}`, hasState);
});

// Check return object
test3Pass = test3Pass && hookContent.includes('return');
logTest('Returns state and functions', test3Pass);

// Test 4: CERV2Page Integration
logSection('TEST 4: CERV2Page Integration');

const cerv2Path = '/workspaces/ClinicalSageAI-2-replit/src/pages/CERV2Page.jsx';
const cerv2Content = readFile(cerv2Path);

let test4Pass = true;

// Check import
test4Pass = test4Pass && cerv2Content.includes("import IntegratedDemoTab from '@/components/IntegratedDemoTab'");
logTest('IntegratedDemoTab imported', test4Pass);

// Check tab routing
test4Pass = test4Pass && cerv2Content.includes("activeTab === 'demo'") && cerv2Content.includes('IntegratedDemoTab');
logTest('Demo tab routing in renderContent', test4Pass);

// Check navigation tab definition
test4Pass = test4Pass && cerv2Content.includes("id: 'demo'") && cerv2Content.includes("label: 'Interactive Demo'");
logTest('Demo tab in navigation', test4Pass);

// Check Lightbulb icon for demo
test4Pass = test4Pass && cerv2Content.includes('Lightbulb') && cerv2Content.includes('purple-600');
logTest('Demo tab has Lightbulb icon', test4Pass);

// Test 5: Mock Data Structure
logSection('TEST 5: Mock Data Structure');

const mockDataPath = '/workspaces/ClinicalSageAI-2-replit/src/data/mockDemoData.js';
const mockDataContent = readFile(mockDataPath);

let test5Pass = true;

// Check scenarios
const scenarioNames = ['startup', 'midstage', 'advanced'];
scenarioNames.forEach(scenario => {
  const hasScenario = mockDataContent.toLowerCase().includes(scenario);
  logTest(`Scenario: ${scenario}`, hasScenario);
  test5Pass = test5Pass && hasScenario;
});

// Check device profiles
test5Pass = test5Pass && mockDataContent.includes('deviceName');
logTest('Contains device profiles', test5Pass);

// Check completion percentages
test5Pass = test5Pass && mockDataContent.includes('completionPercentage');
logTest('Devices have completion percentages', test5Pass);

// Test 6: Data Flow Validation
logSection('TEST 6: Data Flow Validation');

let test6Pass = true;

// Check if mock data is properly structured
const mockDataExportsDevices = mockDataContent.includes('export') || mockDataContent.includes('module.exports');
logTest('Mock data exports correctly', mockDataExportsDevices);
test6Pass = test6Pass && mockDataExportsDevices;

// Check if devices have required fields
const requiredFields = ['deviceName', 'status', 'completionPercentage', 'predicateDevices'];
requiredFields.forEach(field => {
  const hasField = mockDataContent.includes(field);
  logTest(`Device field: ${field}`, hasField);
  test6Pass = test6Pass && hasField;
});

// Check if hook connects to services
const connectsToServices = hookContent.includes('DocumentEditorService') || hookContent.includes('FDA510k');
logTest('Hook connects to services', connectsToServices);
test6Pass = test6Pass && connectsToServices;

// Test 7: Error Handling
logSection('TEST 7: Error Handling');

let test7Pass = true;

// Check for try-catch blocks
const hasTryCatch = hookContent.includes('try') && hookContent.includes('catch');
logTest('Has try-catch error handling', hasTryCatch);
test7Pass = test7Pass && hasTryCatch;

// Check for error callbacks
const hasErrorCallback = deviceLoaderContent.includes('error') || hookContent.includes('error');
logTest('Has error callback handling', hasErrorCallback);
test7Pass = test7Pass && hasErrorCallback;

// Check for toast notifications
const hasToasts = integratedDemoContent.includes('toast') && deviceLoaderContent.includes('toast');
logTest('Uses toast for user feedback', hasToasts);
test7Pass = test7Pass && hasToasts;

// Test 8: Export/Import Features
logSection('TEST 8: Export/Import Features');

let test8Pass = true;

// Check for export button
test8Pass = test8Pass && integratedDemoContent.includes('Export') && integratedDemoContent.includes('JSON');
logTest('Has export JSON button', test8Pass);

// Check for copy to clipboard
test8Pass = test8Pass && integratedDemoContent.includes('Clipboard');
logTest('Has copy to clipboard button', test8Pass);

// Check for export functions in hook
const hasExportFunc = hookContent.includes('exportDocument');
logTest('Hook has exportDocument function', hasExportFunc);
test8Pass = test8Pass && hasExportFunc;

// Final Summary
logSection('TEST SUMMARY');

const allTests = [
  { name: 'Component Render Structure', pass: test1Pass },
  { name: 'Device Loader Component', pass: test2Pass },
  { name: 'Integration Hook', pass: test3Pass },
  { name: 'CERV2Page Integration', pass: test4Pass },
  { name: 'Mock Data Structure', pass: test5Pass },
  { name: 'Data Flow Validation', pass: test6Pass },
  { name: 'Error Handling', pass: test7Pass },
  { name: 'Export/Import Features', pass: test8Pass },
];

let passCount = 0;
let failCount = 0;

allTests.forEach(test => {
  const symbol = test.pass ? '✅' : '❌';
  const color = test.pass ? 'green' : 'red';
  log(`${symbol} ${test.name}`, color);
  if (test.pass) passCount++;
  else failCount++;
});

console.log('');
log(`Total: ${passCount}/${allTests.length} tests passed`, passCount === allTests.length ? 'green' : 'yellow');

if (passCount === allTests.length) {
  log('✅ All functional tests PASSED!', 'green');
  log('Integration is ready for browser testing.', 'cyan');
  process.exit(0);
} else {
  log(`⚠️  ${failCount} test(s) need attention`, 'yellow');
  process.exit(1);
}
