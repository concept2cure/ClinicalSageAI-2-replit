import { getFirecrawlClient } from './client';

export interface FirecrawlScrapeResult {
  url: string;
  markdown?: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

export async function firecrawlScrape(url: string): Promise<FirecrawlScrapeResult> {
  const client = getFirecrawlClient();
  const response = await client.request<any>('/scrape', 'POST', {
    url,
    formats: ['markdown', 'html'],
  });

  const data = response?.data || response;
  return {
    url,
    markdown: data?.markdown,
    html: data?.html,
    metadata: data?.metadata || {},
  };
}
