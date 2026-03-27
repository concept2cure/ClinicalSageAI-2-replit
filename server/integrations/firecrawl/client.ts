import crypto from 'crypto';

export interface FirecrawlClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v1';
  }

  async request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          const isRetryable = res.status >= 500 || res.status === 429;
          if (isRetryable && attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            continue;
          }
          throw new Error(`provider_error:${res.status}:${txt.slice(0, 200)}`);
        }

        return (await res.json()) as T;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isAbort = error?.name === 'AbortError';
        if (attempt < maxAttempts && (isAbort || /provider_error:5|provider_error:429/.test(lastError.message))) {
          await new Promise(resolve => setTimeout(resolve, 250 * attempt));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('provider_error:unknown');
  }

  static verifyWebhookSignature(payload: string, signature: string | undefined, secret: string) {
    if (!signature) return false;
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  }
}

export function getFirecrawlClient() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('provider_error:FIRECRAWL_API_KEY missing');
  }
  return new FirecrawlClient({ apiKey });
}
