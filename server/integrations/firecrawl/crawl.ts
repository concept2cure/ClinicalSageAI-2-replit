import { getFirecrawlClient } from './client';

export async function firecrawlCrawl(url: string, limit = 10) {
  const client = getFirecrawlClient();
  return client.request('/crawl', 'POST', { url, limit });
}
