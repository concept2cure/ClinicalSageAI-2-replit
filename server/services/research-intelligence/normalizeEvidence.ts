function extractRegulatorySignals(text: string) {
  const lower = text.toLowerCase();
  const nctIds = Array.from(new Set((text.match(/\bNCT\d{8}\b/g) || []).map(v => v.toUpperCase())));
  const dois = Array.from(
    new Set((text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi) || []).map(v => v.toLowerCase()))
  );
  const hasSafetyLanguage = /\b(adverse event|serious adverse|toxicity|safety)\b/.test(lower);
  const hasEfficacyLanguage = /\b(efficacy|endpoint|response rate|hazard ratio|p-value)\b/.test(
    lower
  );
  const hasRegulatoryLanguage = /\b(510\(k\)|pma|cer|ifu|labeling|fda|ema)\b/.test(lower);
  return {
    nctIds,
    dois,
    hasSafetyLanguage,
    hasEfficacyLanguage,
    hasRegulatoryLanguage,
  };
}

export function normalizeEvidence(input: any) {
  const url = input?.url || input?.sourceUrl || null;
  let domain: string | null = null;
  let canonicalUrl: string | null = null;
  if (url) {
    try {
      const u = new URL(url);
      domain = u.hostname.toLowerCase();
      u.hash = '';
      canonicalUrl = u.toString();
    } catch {
      domain = null;
      canonicalUrl = null;
    }
  }
  const rawMarkdown = typeof input?.markdown === 'string' ? input.markdown : '';
  const rawHtml = typeof input?.html === 'string' ? input.html : '';
  const title = String(input?.title || input?.metadata?.title || '').trim();
  const combined = `${rawMarkdown}\n${rawHtml}`;

  if (!url || (!rawMarkdown && !rawHtml)) {
    throw new Error('normalization_failed:missing_url_or_content');
  }

  return {
    sourceProvider: input?.provider || 'unknown',
    normalizedAt: new Date().toISOString(),
    url,
    canonicalUrl,
    domain,
    title,
    excerpt: rawMarkdown.slice(0, 1200) || rawHtml.slice(0, 1200),
    regulatorySignals: extractRegulatorySignals(combined),
    payload: {
      ...input,
      markdown: rawMarkdown || undefined,
      html: rawHtml || undefined,
    },
  };
}
