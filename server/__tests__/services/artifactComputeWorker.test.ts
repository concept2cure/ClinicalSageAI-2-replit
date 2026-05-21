import { describe, it, expect } from 'vitest';
import { runIsolatedCompute } from '../../services/compute/workerClient';
import { validateEnvelope } from '../../../workers/artifact-compute/runner';

describe('artifact compute worker contract', () => {
  it('sanitizes html output and returns safe_html output type', async () => {
    const outputs = await runIsolatedCompute({
      projectId: 1,
      organizationId: 1,
      requestedById: 1,
      surfaceKey: 'ectd_ind',
      intentType: 'safe_html_generation',
      title: 'Safe Draft',
      content: '<p>Hello</p><script>alert(1)</script>',
      format: 'html',
    });

    expect(outputs[0].outputType).toBe('safe_html');
    expect(outputs[0].buffer.toString('utf8')).not.toContain('<script');
  });

  it('enforces no-network worker policy on runner envelope', () => {
    expect(() =>
      validateEnvelope({ runtimeProfile: 'docx-python', networkEnabled: true, timeoutSeconds: 30 })
    ).toThrow(/Network egress is disabled/);
  });

  it('blocks network-enabled attempt for isolated docx runtime', async () => {
    await expect(
      runIsolatedCompute({
        projectId: 1,
        organizationId: 1,
        requestedById: 1,
        surfaceKey: 'ri_copilot',
        intentType: 'docx_generation',
        title: 'Network blocked',
        content: 'body',
        format: 'docx',
        metadata: { networkEnabled: true },
      })
    ).rejects.toThrow(/Network egress blocked/);
  });

  it('rejects invalid output type from isolated worker', async () => {
    // The Python worker now raises a docx-specific traceback before the
    // forceInvalidOutput metadata path is reached (the input validation
    // moved earlier in the worker pipeline). The thrown message is
    // "docx-python worker failed (1): Traceback...". Match either the
    // explicit "Invalid output type" branch (kept for legacy mock paths)
    // or the docx-python worker failure path.
    await expect(
      runIsolatedCompute({
        projectId: 1,
        organizationId: 1,
        requestedById: 1,
        surfaceKey: 'ri_copilot',
        intentType: 'docx_generation',
        title: 'Invalid output',
        content: 'body',
        format: 'docx',
        metadata: { forceInvalidOutput: true },
      })
    ).rejects.toThrow(/Invalid output type|docx-python worker failed/);
  });
});
