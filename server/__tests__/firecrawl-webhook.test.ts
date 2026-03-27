import crypto from 'crypto';
import { verifyFirecrawlWebhook } from '../integrations/firecrawl/webhook';

describe('firecrawl webhook verification', () => {
  const original = process.env.FIRECRAWL_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.FIRECRAWL_WEBHOOK_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.FIRECRAWL_WEBHOOK_SECRET = original;
  });

  test('accepts valid signature', () => {
    const payload = JSON.stringify({ ok: true });
    const sig = crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');
    expect(verifyFirecrawlWebhook(payload, sig)).toBe(true);
  });

  test('rejects invalid signature', () => {
    const payload = JSON.stringify({ ok: true });
    expect(verifyFirecrawlWebhook(payload, 'bad-signature')).toBe(false);
  });
});
