export async function enqueueEvidenceWatchlistRefresh(payload: Record<string, unknown>) {
  return { queued: true, jobType: 'refresh_public_evidence_watchlists', payload };
}

export async function enqueueAsyncFirecrawlJob(payload: Record<string, unknown>) {
  return { queued: true, jobType: 'process_async_firecrawl_jobs', payload };
}

export async function enqueueWebhookRetry(payload: Record<string, unknown>) {
  return { queued: true, jobType: 'retry_transient_failures', payload };
}

export function deDupEvidenceKey(canonicalUrl: string, contentHash: string) {
  return `${canonicalUrl}::${contentHash}`;
}
