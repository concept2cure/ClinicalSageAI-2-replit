/**
 * Artifact Compute worker entry point.
 * In production this process should run in a locked-down container runtime
 * (no egress by default, bounded CPU/memory, strict timeout).
 */

export interface WorkerEnvelope {
  runtimeProfile: 'docx-python';
  networkEnabled: boolean;
  timeoutSeconds: number;
}

export function validateEnvelope(envelope: WorkerEnvelope): void {
  if (envelope.runtimeProfile !== 'docx-python') {
    throw new Error('Only docx-python profile is currently allowed');
  }
  if (envelope.networkEnabled) {
    throw new Error('Network egress is disabled for compute jobs by policy');
  }
  if (envelope.timeoutSeconds > 300) {
    throw new Error('Timeout exceeds maximum policy for artifact compute worker');
  }
}
