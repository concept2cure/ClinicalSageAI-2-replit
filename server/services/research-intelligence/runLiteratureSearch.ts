export async function runLiteratureSearch(message: string) {
  const term = encodeURIComponent(message.slice(0, 200));
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${term}`;
  const withTimeout = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  let searchRes: Response;
  try {
    searchRes = await withTimeout(searchUrl);
  } catch {
    return {
      provider: 'PubMed',
      summary: 'PubMed lookup timed out.',
      results: [],
    };
  }
  if (!searchRes.ok) {
    return {
      provider: 'PubMed',
      summary: `PubMed lookup failed with status ${searchRes.status}.`,
      results: [],
    };
  }
  const searchJson: any = await searchRes.json();
  const ids: string[] = searchJson?.esearchresult?.idlist || [];
  if (!ids.length) {
    return {
      provider: 'PubMed',
      summary: 'No PubMed hits found for this query.',
      results: [],
    };
  }

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryRes = await withTimeout(summaryUrl).catch(() => null);
  const summaryJson: any = summaryRes?.ok ? await summaryRes.json() : {};
  const results = ids.map(id => ({
    pmid: id,
    title: summaryJson?.result?.[id]?.title || '',
    pubdate: summaryJson?.result?.[id]?.pubdate || '',
    source: summaryJson?.result?.[id]?.source || '',
  }));

  return {
    provider: 'PubMed',
    summary: `Literature-first route returned ${results.length} PubMed results.`,
    results,
  };
}
