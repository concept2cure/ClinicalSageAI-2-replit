/**
 * Artifact Compute worker entry point.
 * In production this process should run in a locked-down container runtime
 * (no egress by default, bounded CPU/memory, strict timeout).
 */

/**
 * Runtime profiles allowed in the locked-down artifact-compute worker. All
 * share the same policy: no network egress, bounded CPU/memory, strict
 * timeout. New profiles must be added here so the policy gate covers them.
 *   - docx-python   → native Word authoring (docx-python-runtime.py)
 *   - python-script → AnA-authored general scripting sandbox (python-script-runtime.py)
 *   - docx-insert   → surgical insertions into an existing .docx (docx-insert-runtime.py)
 *   - docx-xml      → raw OOXML surgery on word/document.xml (docx-xml-runtime.py)
 *   - docx-validate → OOXML/ZIP integrity validation (docx-validate-runtime.py)
 */
export type RuntimeProfile =
  | 'docx-python'
  | 'python-script'
  | 'docx-insert'
  | 'docx-xml'
  | 'docx-validate';

const ALLOWED_PROFILES: ReadonlySet<RuntimeProfile> = new Set<RuntimeProfile>([
  'docx-python',
  'python-script',
  'docx-insert',
  'docx-xml',
  'docx-validate',
]);

export interface WorkerEnvelope {
  runtimeProfile: RuntimeProfile;
  networkEnabled: boolean;
  timeoutSeconds: number;
}

export function validateEnvelope(envelope: WorkerEnvelope): void {
  if (!ALLOWED_PROFILES.has(envelope.runtimeProfile)) {
    throw new Error(`Runtime profile not allowed: ${envelope.runtimeProfile}`);
  }
  if (envelope.networkEnabled) {
    throw new Error('Network egress is disabled for compute jobs by policy');
  }
  if (envelope.timeoutSeconds > 300) {
    throw new Error('Timeout exceeds maximum policy for artifact compute worker');
  }
}
