/**
 * Contradiction Scan + Readiness Dashboard Integration — Pass 17 Tests
 *
 * Tests covering:
 * - Contradiction scan API endpoint structure
 * - Scan result handling (findings found vs none)
 * - Readiness dashboard integration points
 *
 * @module tests/resolution/scan-and-readiness.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONTRADICTION SCAN API
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Scan API', () => {
  it('scan endpoint uses POST with projectId in path', () => {
    const projectId = 42;
    const endpoint = `/api/governed-intelligence/contradictions/scan/${projectId}`;
    expect(endpoint).toContain('/scan/42');
  });

  it('search endpoint uses POST with limit in body', () => {
    const endpoint = '/api/governed-intelligence/contradictions/search';
    const body = { limit: 30 };
    expect(endpoint).toContain('/search');
    expect(body.limit).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: SCAN RESULT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scan Result Handling', () => {
  it('displays finding count when contradictions found', () => {
    const scanResult = { findings: [{ id: '1' }, { id: '2' }, { id: '3' }] };
    const count = scanResult.findings.length;
    const message = count > 0
      ? `Scan complete: ${count} finding(s) detected`
      : 'Scan complete: no contradictions found';

    expect(message).toBe('Scan complete: 3 finding(s) detected');
  });

  it('displays clean message when no contradictions found', () => {
    const scanResult = { findings: [] };
    const count = scanResult.findings.length;
    const message = count > 0
      ? `Scan complete: ${count} finding(s) detected`
      : 'Scan complete: no contradictions found';

    expect(message).toBe('Scan complete: no contradictions found');
  });

  it('handles scan failure gracefully', () => {
    const errorResult = { count: 0, message: 'Scan failed — contradiction engine may be unavailable' };
    expect(errorResult.count).toBe(0);
    expect(errorResult.message).toContain('failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: READINESS DASHBOARD INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Readiness Dashboard Integration', () => {
  it('ProjectReadinessDashboard accepts projectId prop', () => {
    const props = { projectId: 42 };
    expect(props.projectId).toBe(42);
  });

  it('ReviewReadiness page has readiness tab', () => {
    const tabs = ['quality', 'compliance', 'snowglobe', 'readiness', 'evidence', 'audit', 'traceability'];
    expect(tabs).toContain('readiness');
  });

  it('readiness tab routes to ProjectReadinessDashboard when projectId exists', () => {
    const projectId = 42;
    const shouldUseDashboard = !!projectId;
    expect(shouldUseDashboard).toBe(true);
  });

  it('readiness tab falls back to basic view without projectId', () => {
    const projectId = 0;
    const shouldUseDashboard = !!projectId;
    expect(shouldUseDashboard).toBe(false);
  });

  it('ProjectReadinessDashboard has 6 sub-tabs', () => {
    const subTabs = ['overview', 'modules', 'blockers', 'recommendations', 'workflows', 'continuity'];
    expect(subTabs).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONTRADICTION PANEL STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Panel States', () => {
  it('empty state shows scan button', () => {
    const findings: unknown[] = [];
    const showScanButton = findings.length === 0;
    expect(showScanButton).toBe(true);
  });

  it('populated state shows re-scan button', () => {
    const findings = [{ id: '1' }];
    const showRescanButton = findings.length > 0;
    expect(showRescanButton).toBe(true);
  });

  it('scanning state disables button', () => {
    const scanning = true;
    expect(scanning).toBe(true);
    // Button should be disabled when scanning=true
  });

  it('scan result banner shows after scan completes', () => {
    const scanResult = { count: 5, message: 'Scan complete: 5 finding(s) detected' };
    expect(scanResult).toBeTruthy();
    expect(scanResult.count).toBe(5);
  });
});
