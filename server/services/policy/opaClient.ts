import type { Request } from 'express';

export interface PolicyInput {
  organizationId: number | null;
  userId: number | null;
  role: string;
  action: string;
  route: string;
  module: string;
  resourceType: string;
  resourceOwnerProjectId?: number | null;
  projectId?: number | null;
  artifactLifecycleState?: string | null;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export class OpaClient {
  private readonly enabled = parseBoolean(process.env.OPA_ENABLED, false);
  private readonly enforce = (process.env.OPA_MODE || 'observe') === 'enforce';
  private readonly baseUrl = (process.env.OPA_BASE_URL || 'http://localhost:8181').replace(/\/$/, '');
  private readonly policyPath = process.env.OPA_POLICY_PATH || 'concept2cure/allow';
  private readonly timeoutMs = Number(process.env.OPA_TIMEOUT_MS || 3000);

  diagnostics() {
    return {
      enabled: this.enabled,
      mode: this.enforce ? 'enforce' : 'observe',
      baseUrl: this.baseUrl,
      policyPath: this.policyPath,
    };
  }

  isEnabled() {
    return this.enabled;
  }

  isEnforceMode() {
    return this.enforce;
  }

  buildInput(req: Request, action: string, module: string, resourceType: string): PolicyInput {
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).tenantId || 0) || null;
    const userId = Number((req as any).userId || (req as any).user?.id || 0) || null;
    const projectId = Number(req.params.projectId || req.body?.projectId || 0) || null;

    return {
      organizationId,
      userId,
      role: String((req as any).userRole || (req as any).user?.role || 'unknown'),
      action,
      route: req.originalUrl,
      module,
      resourceType,
      projectId,
      resourceOwnerProjectId: projectId,
      artifactLifecycleState: req.body?.artifactState || null,
    };
  }

  async evaluate(input: PolicyInput): Promise<{ allow: boolean; reason?: string; raw?: unknown }> {
    if (!this.enabled) {
      return { allow: true, reason: 'OPA disabled' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/data/${this.policyPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OPA HTTP ${response.status}`);
      }

      const payload = await response.json();
      const result = payload?.result;
      if (typeof result === 'boolean') {
        return { allow: result, raw: payload };
      }
      if (result && typeof result.allow === 'boolean') {
        return { allow: result.allow, reason: result.reason, raw: payload };
      }
      return { allow: false, reason: 'Invalid OPA result shape', raw: payload };
    } catch (error: any) {
      return {
        allow: !this.enforce,
        reason: `OPA unavailable: ${error?.message || String(error)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const opaClient = new OpaClient();
