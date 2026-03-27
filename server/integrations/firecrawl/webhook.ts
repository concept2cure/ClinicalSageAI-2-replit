import { FirecrawlClient } from './client';

export function verifyFirecrawlWebhook(payload: string, signature?: string) {
  const secret = process.env.FIRECRAWL_WEBHOOK_SECRET;
  if (!secret) return false;
  return FirecrawlClient.verifyWebhookSignature(payload, signature, secret);
}
