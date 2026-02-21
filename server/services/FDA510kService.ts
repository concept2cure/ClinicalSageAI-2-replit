export type PredicateSearchResult = {
  results: any[];
  meta?: Record<string, any>;
};

export async function searchPredicates(query: string, limit = 25): Promise<PredicateSearchResult> {
  if (!query || typeof query !== 'string') {
    throw new Error('Query is required');
  }

  const url = `https://api.fda.gov/device/510k.json?search=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openFDA error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  return {
    results: data.results || [],
    meta: data.meta || {},
  };
}

export default {
  searchPredicates,
};
