# Zero-Tolerance Trust Protocol - Verification Requirements

## Overview

This document defines the mandatory verification requirements for all development tasks to ensure absolute proof of execution, prevent misrepresentation, and guarantee full end-to-end functionality including UI/UX impact.

**Status**: ACTIVE - Enforced as of July 9, 2025
**Authority**: Direct mandate from platform owner following critical trust failure

## Phase 1: Automated & Enforced Proof Generation

### 1.1 Automated Code Change Verification (Checksum & Diff)

**Goal**: Generate irrefutable proof of every file modification.

**Mechanism**:

- Before any file edit: Calculate and store SHA224 checksum of file content
- After file edit: Calculate new SHA224 checksum
- If checksums differ: Generate complete diff between versions
- Store both checksums and diff for reporting

**Proof Requirements**:

```bash
# Example verification script
echo "Pre-edit checksum: $(sha224sum file.jsx)"
# [Perform edit]
echo "Post-edit checksum: $(sha224sum file.jsx)"
git diff --no-index file.jsx.before file.jsx.after
```

### 1.2 Database State Verification Script

**Goal**: Generate executable proof for all database operations.

**Mechanism**:
Create temporary verification scripts (e.g., `temp_db_verify_[timestamp].js`) that:

```javascript
// temp_db_verify_commitments.js
const { pool } = require('../server/db');

async function verifyDatabase() {
  try {
    // Verify schema
    const schemaCheck = await pool.query(
      `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1
    `,
      ['regulatory_commitments']
    );

    // Verify data
    const dataCheck = await pool.query(`
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical,
             COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM regulatory_commitments
    `);

    // Output results
    const results = {
      timestamp: new Date().toISOString(),
      schema: schemaCheck.rows,
      data: dataCheck.rows[0],
      verified: true,
    };

    require('fs').writeFileSync(
      'temp_db_output_commitments.json',
      JSON.stringify(results, null, 2)
    );

    console.log('Verification complete:', results);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyDatabase();
```

**Proof**: Execute script and present output file content in report.

### 1.3 API Endpoint Automated Test Script

**Goal**: Provide executable proof of API functionality and responses.

**Mechanism**:
Create temporary API test scripts (e.g., `temp_api_test_[endpoint].js`) that:

```javascript
// temp_api_test_extract_commitments.js
const fetch = require('node-fetch');

async function testAPI() {
  const testCases = [
    {
      name: 'Extract Commitments - Full Scope',
      url: 'http://localhost:5000/api/ai/commitments/extract',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'default',
        'X-User-ID': 'test-user',
      },
      body: JSON.stringify({
        documentText: 'Test document with commitment deadline by Q4 2025',
        scope: 'entire-ectd',
        analysisDepth: 'comprehensive',
      }),
    },
  ];

  const results = [];

  for (const test of testCases) {
    try {
      const response = await fetch(test.url, {
        method: test.method,
        headers: test.headers,
        body: test.body,
      });

      const data = await response.json();

      results.push({
        testName: test.name,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      results.push({
        testName: test.name,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  require('fs').writeFileSync('temp_api_output_commitments.json', JSON.stringify(results, null, 2));

  console.log('API tests complete:', results);
}

testAPI();
```

**Proof**: Execute script and present output file content in report.

### 1.4 Frontend UI Verification (Automated Screenshots & User-Witnessed Output)

**Goal**: Provide verifiable proof of UI impact and functionality.

**Mechanism (Tiered Approach)**:

#### Tier 1 - Automated (if environment permits):

```javascript
// temp_ui_verify_modal.js (using puppeteer if available)
const puppeteer = require('puppeteer');

async function verifyUI() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:5000/coauthor');

  // Click Extract Commitments button
  await page.click('button:contains("Extract Commitments")');

  // Wait for modal
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Take screenshot
  await page.screenshot({ path: 'temp_ui_modal_open.png' });

  // Verify modal elements
  const modalTitle = await page.$eval('[role="dialog"] h2', el => el.textContent);
  const hasDocumentScope = (await page.$('[role="dialog"] select')) !== null;

  const results = {
    timestamp: new Date().toISOString(),
    modalTitle,
    hasDocumentScope,
    screenshotPath: 'temp_ui_modal_open.png',
  };

  require('fs').writeFileSync('temp_ui_output.json', JSON.stringify(results, null, 2));

  await browser.close();
}

verifyUI();
```

#### Tier 2 - User-Witnessed & Agent-Instructed:

When automated UI testing is not available, inject debug code:

```javascript
// Injected into React component
useEffect(() => {
  if (commitmentExtractionDialogOpen) {
    console.log('🔍 VERIFICATION: Extract Commitments Modal OPENED', {
      timestamp: new Date().toISOString(),
      dialogState: commitmentExtractionDialogOpen,
      hasDocumentScope: !!selectedDocumentScope,
      hasVersionSelector: !!selectedVersion,
      elementsFound: {
        title: !!document.querySelector('[role="dialog"] h2'),
        scopeSelector: !!document.querySelector('[role="dialog"] select'),
        extractButton: !!document.querySelector('[role="dialog"] button:contains("Extract")'),
      },
    });
  }
}, [commitmentExtractionDialogOpen]);
```

**User Verification Request Template**:

```
Please verify the following UI elements:
1. Click the "Extract Commitments" button (orange gradient)
2. Confirm modal opens with title "Extract Regulatory Commitments"
3. Check for "Document Scope" dropdown with options
4. Check for "eCTD Version" dropdown
5. Take screenshot and describe what you see
6. Open browser console and report any VERIFICATION messages
```

## Phase 2: Protocol Enforcement & Reporting

### 2.1 Protocol Documentation

This VERIFICATION_PROTOCOL.md file serves as the definitive source of verification rules and must be consulted before declaring any task complete.

### 2.2 Zero-Tolerance for Proof Failure

- If proof generation fails, the task is NOT complete
- Must diagnose and fix proof generation before proceeding
- No assumptions or "should work" statements allowed
- Only verifiable facts are acceptable

### 2.3 Unconditional Data Integrity

All database operations must include:

- Verification of NOT NULL constraints
- Tenant isolation checks
- Foreign key relationship validation
- Transaction rollback capability for testing

## Implementation Checklist

For EVERY task completion claim:

- [ ] Code changes verified with checksums and diffs
- [ ] Database state verified with executable script
- [ ] API endpoints verified with test script and actual responses
- [ ] UI changes verified through automated or user-witnessed methods
- [ ] All verification outputs included in report
- [ ] No assumptions made about functionality
- [ ] End-to-end flow tested and proven

## Enforcement

This protocol is mandatory and supersedes all previous verification approaches. Failure to follow this protocol constitutes a breach of operational integrity.

---

_Last Updated: July 9, 2025_
_Status: ACTIVE - Zero Tolerance Enforcement_
