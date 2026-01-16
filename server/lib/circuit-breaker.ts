export class CircuitBreaker {
  private failures = 0;
  private lastFail = 0;
  private threshold = 3;
  private timeout = 10000;
  
  async execute(fn: () => Promise<any>, fallback: any) {
    if (this.failures >= this.threshold && Date.now() - this.lastFail < this.timeout) {
        console.warn('[CircuitBreaker] Open. Serving fallback.');
        return fallback;
    }
    try {
        const res = await fn();
        this.failures = 0;
        return res;
    } catch (e) {
        this.failures++;
        this.lastFail = Date.now();
        console.error('[CircuitBreaker] Execution failed.');
        return fallback;
    }
  }
}
