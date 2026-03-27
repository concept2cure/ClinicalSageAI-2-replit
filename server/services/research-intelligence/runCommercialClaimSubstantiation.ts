import { firecrawlSearch } from '../../integrations/firecrawl/search';

export async function runCommercialClaimSubstantiation(message: string) {
  const search = await firecrawlSearch(`${message} competitor claim evidence`);
  const rows = (search as any)?.data || (search as any)?.results || [];
  const top = Array.isArray(rows)
    ? rows.slice(0, 5).map((r: any) => ({
        title: r?.title || r?.name || '',
        url: r?.url || r?.link || '',
      }))
    : [];

  return {
    provider: 'CommercialEvidence',
    summary: `Commercial claim substantiation path returned ${top.length} public sources.`,
    sources: top,
  };
}
