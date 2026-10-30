/**
 * What the platform can carry for one market, as the server states it
 * (GET /api/submissions/market-support, docs/design/FILING_SPINE.md F19).
 *
 * A market is one agency and one application type. The statement is composed
 * on the server from the rule pack, the regional backbone, the region profile
 * and the channel with its adapter's refusal (services/regulatory/
 * market-support.ts). Nothing here computes or rephrases it: the summary and
 * the line are the server's words. A read that has not answered states no
 * support, and a failed read says it failed.
 *
 * Used on the project's submission rows and the New project wizard (and, with
 * F20, the New submission region options), so each says the same thing about a
 * market. The caller's element sets the type: these spans carry no text class.
 */
import React from 'react';
import { hasKeys, useLiveData } from './dataConnect';

/** The fields of the server's MarketSupport the screens read. */
export interface MarketSupportView {
  applicationType: string;
  market: string;
  region: string | null;
  agency: string | null;
  summary: string;
  line: string;
  buildable: boolean;
  offered: boolean;
  /** Rich build facts supplied by the same market read. Optional for older
   * responses; absence must not turn into a claim about an outline/channel. */
  outline?: { state: 'outline' | 'no_outline' | 'unmapped'; pack: { version: string; label: string } | null; detail: string };
  module1?: { state: 'structured' | 'flat' | 'placeholder' | null; detail: string };
  channel?: { state: 'unproven' | 'applicant_uploads' | 'portal' | 'refused' | 'none'; detail: string };
}

interface MarketSupportResponse {
  applicationType: string;
  asOf: string;
  markets: MarketSupportView[];
}

export function marketSupportPath(applicationType: string, market?: string | null): string {
  const q = new URLSearchParams({ applicationType });
  if (market) q.set('market', market);
  return `/api/submissions/market-support?${q.toString()}`;
}

/** Every market the platform names for one application type, in one read. */
export function useMarketSupport(applicationType: string | null | undefined, market?: string | null) {
  const path = applicationType ? marketSupportPath(applicationType, market) : null;
  const [bump, setBump] = React.useState(0);
  const state = useLiveData<MarketSupportResponse>(path, [path, bump], hasKeys<MarketSupportResponse>('markets'));
  return { ...state, retry: () => setBump((b) => b + 1) };
}

const sentence = (t: string): string => (/[.!?]$/.test(t) ? t : `${t}.`);
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function validOutline(outline: MarketSupportView['outline']): outline is NonNullable<MarketSupportView['outline']> {
  if (!outline || !hasText(outline.detail) || !['outline', 'no_outline', 'unmapped'].includes(outline.state)) return false;
  if (outline.state !== 'outline') return outline.pack === null;
  return !!outline.pack && hasText(outline.pack.label) && hasText(outline.pack.version);
}

/** Build facts from the market's own response, never a catalog promise of
 * validation or transmission. Null means the response omitted readable facts. */
export function marketBuildText(market: Pick<MarketSupportView, 'outline' | 'module1' | 'channel'>): string | null {
  const { outline, module1, channel } = market;
  if (!validOutline(outline) || !module1 || !hasText(module1.detail)
    || ![null, 'structured', 'flat', 'placeholder'].includes(module1.state)
    || !channel || !hasText(channel.detail)
    || !['unproven', 'applicant_uploads', 'portal', 'refused', 'none'].includes(channel.state)) return null;
  const start = outline.state === 'outline'
    ? `Uses the ${outline.pack!.label} outline (${outline.pack!.version}).`
    : sentence(outline.detail);
  return `${start} ${sentence(module1.detail)} ${sentence(channel.detail)}`;
}

/** The summary, then the line when it says more than the summary does; the
 *  line alone when it already opens with the summary ("Not offered: …"). */
export function marketSupportText(m: Pick<MarketSupportView, 'summary' | 'line'>): string {
  const summary = m.summary.toLowerCase();
  const line = m.line.replace(/;/g, ',').toLowerCase();
  if (line === summary) return sentence(m.summary);
  if (line.startsWith(summary)) return sentence(m.line);
  return `${sentence(m.summary)} ${sentence(m.line)}`;
}

export function MarketSupportLine({ applicationType, market }: { applicationType: string | null | undefined; market: string | null | undefined }) {
  const read = useMarketSupport(applicationType && market ? applicationType : null, market);
  if (!applicationType || !market) return null;
  if (read.loading) {
    return <span data-testid="market-support" data-state="loading">Checking platform support for this market…</span>;
  }
  const m = read.data?.markets?.[0];
  if (read.error || !m) {
    return (
      /* status, not alert: a list of rows that failed together would raise one
         alert per row. The Retry names its market for a screen reader, starting
         with the visible word (WCAG 2.5.3). */
      <span role="status" data-testid="market-support" data-state="error">
        Platform support for this market could not be read.{' '}
        <button type="button" className="btn ghost sm" aria-label={`Retry: platform support for ${applicationType.toUpperCase()} in ${market}`} onClick={read.retry}>
          Retry
        </button>
      </span>
    );
  }
  return (
    <span data-testid="market-support" data-state={m.offered ? (m.buildable ? 'buildable' : 'limited') : 'refused'}>
      {marketSupportText(m)}
    </span>
  );
}
