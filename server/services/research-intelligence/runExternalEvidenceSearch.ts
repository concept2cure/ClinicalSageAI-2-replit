import { firecrawlSearch } from '../../integrations/firecrawl/search';
import { firecrawlScrape } from '../../integrations/firecrawl/scrape';

export async function runExternalEvidenceSearch(message: string) {
  const results = await firecrawlSearch(message);
  const candidates: string[] = [];

  const pushUrl = (u: unknown) => {
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) candidates.push(u);
  };

  const rows = (results as any)?.data || (results as any)?.results || [];
  if (Array.isArray(rows)) {
    for (const row of rows.slice(0, 5)) {
      pushUrl(row?.url);
      pushUrl(row?.link);
      pushUrl(row?.source?.url);
    }
  }

  const rankDomain = (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.endsWith('.gov')) return 3;
      if (host.endsWith('.edu')) return 2;
      if (host.endsWith('.org')) return 1;
      return 0;
    } catch {
      return 0;
    }
  };
  const prioritized = Array.from(new Set(candidates))
    .sort((a, b) => rankDomain(b) - rankDomain(a))
    .slice(0, 2);
  const scrapedDocuments = [] as Array<{
    url: string;
    title?: string;
    markdown?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  }>;
  for (const url of prioritized) {
    const scraped = await firecrawlScrape(url);
    scrapedDocuments.push({
      url,
      title: (scraped.metadata?.title as string) || undefined,
      markdown: scraped.markdown,
      html: scraped.html,
      metadata: scraped.metadata || {},
    });
  }

  return {
    provider: 'Firecrawl',
    searchResults: results,
    scrapedDocuments,
    quotaUnitsToCharge: scrapedDocuments.length,
    sourcesSummary: scrapedDocuments.map(d => d.url),
  };
}
