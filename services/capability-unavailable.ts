/** Stable refusal for retained prototypes that have no qualified product execution contract. */
export class CapabilityUnavailableError extends Error {
  constructor(public readonly code: 'PREDICTIVE_ENGINE_UNAVAILABLE' | 'PARALLEL_WORKFLOW_RETIRED', message: string) {
    super(message);
    this.name = 'CapabilityUnavailableError';
  }
}
