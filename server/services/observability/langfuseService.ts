import { redactUnknownObject, redactSensitiveText } from './redaction';
import crypto from 'crypto';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export interface LangfuseEventInput {
  name: string;
  traceId: string;
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
}

export class LangfuseService {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly publicKey?: string;
  private readonly secretKey?: string;

  constructor() {
    this.enabled = parseBoolean(process.env.LANGFUSE_ENABLED, false);
    this.baseUrl = (process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/$/, '');
    this.publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    this.secretKey = process.env.LANGFUSE_SECRET_KEY;
  }

  isEnabled(): boolean {
    return this.enabled && Boolean(this.publicKey && this.secretKey);
  }

  diagnostics() {
    return {
      enabled: this.enabled,
      configured: Boolean(this.publicKey && this.secretKey),
      baseUrl: this.baseUrl,
    };
  }

  async emitEvent(event: LangfuseEventInput): Promise<void> {
    if (!this.isEnabled()) return;

    const auth = Buffer.from(`${this.publicKey}:${this.secretKey}`).toString('base64');
    const body = redactUnknownObject({
      batch: [
        {
          id: crypto.randomUUID(),
          type: 'event-create',
          timestamp: new Date().toISOString(),
          body: {
            traceId: event.traceId,
            name: event.name,
            level: event.level || 'DEFAULT',
            metadata: event.metadata || {},
            input: event.input,
            output: event.output,
          },
        },
      ],
    });

    try {
      await fetch(`${this.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error: any) {
      console.warn('[LangfuseService] emit failed:', redactSensitiveText(error?.message || String(error)));
    }
  }
}
