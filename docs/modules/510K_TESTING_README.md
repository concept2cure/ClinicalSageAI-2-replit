# 510(k) Functionality Testing and Debugging Guide

This document provides instructions for testing and debugging the 510(k) functionality implementation in the CERV2 module.

## Overview of Files

1. **`test_510k_functionality.js`**: Contains test case definitions for all major features of the 510(k) functionality
2. **`run_510k_tests.js`**: Provides an automated test runner that can execute the test cases
3. **`debug_510k_utilities.js`**: Offers debugging utilities to help diagnose and fix issues

## Manual Testing Procedure

### Basic Testing

1. Navigate to the CERV2 page `/cerv2`
2. Click on the "One-Click CER" button
3. In the dialog, change the document type to "510(K) Submission"
4. Fill in required device information
5. Click "Save & Continue"
6. Verify that:
   - The header changes to "FDA 510(k) Submission"
   - Navigation tabs update to show 510(k) specific options
   - The "One-Click" button text updates to "One-Click 510(k)"

### 510(k) Workflow Testing

1. Navigate through each tab in the 510(k) interface:

   - Predicate Finder
   - Substantial Equivalence
   - FDA Compliance
   - Final Submission

2. Test specific functionality:
   - **Predicate Finder**: Search for and select predicate devices
   - **Substantial Equivalence**: Document device comparisons
   - **FDA Compliance**: Run compliance check (verify it completes and doesn't get stuck at 98%)
   - **Final Submission**: Generate submission package

## Automated Testing

### Running the Test Suite

1. Open the browser console in the CERV2 page
2. Copy and paste the contents of both `test_510k_functionality.js` and `run_510k_tests.js` into the console
3. Run the automated tests by typing:
   ```javascript
   autoRunner.start();
   ```
4. Follow the on-screen prompts to proceed through each test
5. Review the test results summary after completion

### Individual Test Execution

You can also run individual tests by directly accessing the test objects:

```javascript
// Initialize test data
const { tests } = window.tests || require('./test_510k_functionality.js');

// Create the runner
const autoRunner = new AutomatedTestRunner(tests);

// Run specific test (replace 0 with the index of the test you want to run)
autoRunner.currentTestIndex = 0;
autoRunner.runNextTest();
```

## Debugging

### Using the Debug Utilities

1. Open the browser console in the CERV2 page
2. Copy and paste the contents of `debug_510k_utilities.js` into the console
3. Use the available utilities:

```javascript
// Show current application state
debugUtils.inspectState();

// Force document type to 510k
debugUtils.setDocumentType('510k');

// Navigate to a specific tab
debugUtils.setActiveTab('predicates');

// Fix stuck compliance check
debugUtils.fixComplianceCheck();

// Simulate finding predicate devices
debugUtils.simulatePredicatesFound();

// Inspect UI elements
debugUtils.inspectUI();

// Show help text
debugUtils.help();
```

### Common Issues and Solutions

#### Compliance Check Gets Stuck at 98%

**Issue**: The compliance check progress bar reaches 98% but never completes

**Solution**: Use the debug utility to force completion:

```javascript
debugUtils.fixComplianceCheck();
```

#### Document Type Not Switching Properly

**Issue**: The interface doesn't fully update when switching document types

**Solution**: Force the document type and check for console errors:

```javascript
debugUtils.setDocumentType('510k');
debugUtils.inspectState();
```

#### Tab Navigation Problems

**Issue**: Clicking on tabs doesn't navigate correctly

**Solution**: Use the debug utility to force tab change:

```javascript
debugUtils.setActiveTab('predicates');
```

## Test Coverage

The test suite covers the following critical functionality:

1. Document type switching between CER and 510(k)
2. Tab navigation within the 510(k) interface
3. Predicate device search and selection
4. Substantial equivalence documentation
5. Compliance check completion (including fixing the 98% bug)
6. Final submission generation
7. UI components functionality:
   - GuidedTooltip
   - InsightsDisplay
   - ProgressTracker
   - SubmissionTimeline
   - ReportGenerator

## Reporting Issues

When reporting issues, please include:

1. The specific test case ID (e.g., TC-001)
2. Steps to reproduce the issue
3. Expected behavior
4. Actual behavior
5. Console error messages (if any)
6. State information from `debugUtils.inspectState()`

## Continuous Integration

The test scripts can be integrated into a CI/CD pipeline by:

1. Adapting `run_510k_tests.js` to run in a headless browser environment
2. Converting user-interactive prompts to automated assertions
3. Adding reporting to capture test results in a CI-friendly format

---

**Note**: These testing utilities are designed specifically for the current implementation of the 510(k) functionality in the CERV2 module. They may need to be updated if the implementation changes significantly.
