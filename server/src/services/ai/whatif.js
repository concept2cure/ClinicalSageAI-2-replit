// What-If Scenario Simulator for Quality Control
// Applies test result overrides to simulate different scenarios

/**
 * Apply overrides to test results to simulate "what-if" scenarios
 * @param {Object} summary - Current batch summary with test results
 * @param {Array} overrides - Array of test result overrides
 * @returns {Object} Modified summary with overrides applied
 */
export function applyOverrides(summary, overrides = []) {
  if (!summary || !Array.isArray(overrides) || overrides.length === 0) {
    return summary;
  }

  // Deep clone the summary to avoid mutating original
  const simulated = JSON.parse(JSON.stringify(summary));

  // Apply each override
  overrides.forEach(override => {
    const { test_id, test_name, new_result, new_status } = override;

    // Find and update the test in various possible locations
    if (simulated.tests && Array.isArray(simulated.tests)) {
      const testIndex = simulated.tests.findIndex(
        t => t.test_id === test_id || t.test_name === test_name
      );

      if (testIndex >= 0) {
        if (new_result !== undefined) {
          simulated.tests[testIndex].result = new_result;
        }
        if (new_status !== undefined) {
          simulated.tests[testIndex].status = new_status;
        }
        simulated.tests[testIndex].simulated = true;
      }
    }

    // Update issues array if exists
    if (simulated.issues && Array.isArray(simulated.issues)) {
      const issueIndex = simulated.issues.findIndex(
        i => i.test_id === test_id || i.test_name === test_name
      );

      if (issueIndex >= 0) {
        if (new_result !== undefined) {
          simulated.issues[issueIndex].result = new_result;
        }
        if (new_status !== undefined) {
          simulated.issues[issueIndex].status = new_status;
        }
        simulated.issues[issueIndex].simulated = true;
      }
    }

    // Update results array if exists
    if (simulated.results && Array.isArray(simulated.results)) {
      const resultIndex = simulated.results.findIndex(
        r => r.test_id === test_id || r.test_name === test_name
      );

      if (resultIndex >= 0) {
        if (new_result !== undefined) {
          simulated.results[resultIndex].value = new_result;
        }
        if (new_status !== undefined) {
          simulated.results[resultIndex].status = new_status;
        }
        simulated.results[resultIndex].simulated = true;
      }
    }
  });

  // Recalculate batch-level status based on simulated results
  if (simulated.tests && Array.isArray(simulated.tests)) {
    const failedTests = simulated.tests.filter(t => t.status === 'FAIL' || t.status === 'OOS');
    simulated.batch_status = failedTests.length > 0 ? 'HOLD' : 'PASS';
    simulated.failed_count = failedTests.length;
  }

  // Mark the entire summary as simulated
  simulated.is_simulation = true;
  simulated.simulation_timestamp = new Date().toISOString();
  simulated.overrides_applied = overrides.length;

  return simulated;
}
