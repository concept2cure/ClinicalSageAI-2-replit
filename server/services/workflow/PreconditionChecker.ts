export async function checkPreconditions(preconditions: any[] = [], runContext: Record<string, any> = {}) {
  const results: Array<{ preconditionId?: string; passed: boolean; actualValue?: any; expectedValue?: any; errorMessage?: string }> = [];

  for (const p of preconditions || []) {
    const { id, type, target, operator, value } = p as any;
    let actual: any;
    try {
      // VERY SIMPLE evaluator for MVP
      if (type === 'DATA_PRESENT') {
        actual = runContext[target];
        const passed = (operator === 'EXISTS') ? (actual !== undefined && actual !== null && actual !== '') : !!actual;
        results.push({ preconditionId: id, passed, actualValue: actual, expectedValue: value, errorMessage: passed ? undefined : (p.errorMessage || 'Required data missing') });
      } else if (type === 'STEP_COMPLETE') {
        // target is step id; runContext.completedSteps contains ids
        actual = Array.isArray(runContext.completedSteps) && runContext.completedSteps.includes(target);
        const passed = operator === 'EQUALS' ? actual === value : !!actual;
        results.push({ preconditionId: id, passed, actualValue: actual, expectedValue: value, errorMessage: passed ? undefined : (p.errorMessage || 'Step not complete') });
      } else {
        // Default: unsupported precondition type -> fail safe (not passed)
        results.push({ preconditionId: id, passed: false, errorMessage: `Unsupported precondition type: ${type}` });
      }
    } catch (e: any) {
      results.push({ preconditionId: id, passed: false, errorMessage: e?.message || String(e) });
    }
  }

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}
