import { getFirecrawlClient } from './client';

export async function firecrawlExtract(url: string, prompt: string) {
  const client = getFirecrawlClient();
  return client.request('/extract', 'POST', { url, prompt });
}
