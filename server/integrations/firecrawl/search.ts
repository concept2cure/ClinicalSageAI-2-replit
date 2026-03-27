import { getFirecrawlClient } from './client';

export async function firecrawlSearch(query: string) {
  const client = getFirecrawlClient();
  return client.request('/search', 'POST', { query, limit: 5 });
}
