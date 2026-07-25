/**
 * AgentActivityCard — the visual half of the live agent surface.
 *
 * Renders a compact card on the home screen when AnA has background deep
 * investigations running or freshly finished, so a returning user can see what
 * she is working on without asking. Presentational and pure: it takes a summary
 * (fetched by {@link useAgentActivity}) and renders the card, or nothing at all
 * when there is nothing worth surfacing — the same gate the greeting uses.
 *
 * Copy honors AnA's tone floor: no emoji, no exclamation marks. Status strings
 * come straight from the server's honest describeInvestigationStatus (a stalled
 * run says so).
 *
 * @module client/src/concept2cure/components/ana/AgentActivityCard
 */

import { I } from './icons';
import styles from './styles.module.css';
import { hasSurfacedActivity, type AgentActivitySummary } from './useAgentActivity';

export interface AgentActivityCardProps {
  summary: AgentActivitySummary | null | undefined;
  /** Max items to list under the summary line. Defaults to 3. */
  maxItems?: number;
}

/**
 * One-line description of the snapshot ("2 investigations running · 1 memo
 * ready"). Returns '' when there is nothing to surface. Pure; exported for
 * tests.
 */
export function describeActivitySummary(summary: AgentActivitySummary): string {
  const parts: string[] = [];
  if (summary.activeCount > 0) {
    parts.push(`${summary.activeCount} investigation${summary.activeCount === 1 ? '' : 's'} running`);
  }
  if (summary.recentlyCompletedCount > 0) {
    parts.push(
      `${summary.recentlyCompletedCount} research memo${summary.recentlyCompletedCount === 1 ? '' : 's'} ready`,
    );
  }
  return parts.join(' · ');
}

/** Pick the items worth listing: active/recent first, stalled last, bounded. */
function itemsToList(summary: AgentActivitySummary, max: number): AgentActivitySummary['items'] {
  const rank = (status: string): number => {
    const s = status.toLowerCase();
    if (s.includes('stalled')) return 2;
    if (s.includes('complete') || s.includes('finish') || s.includes('ready')) return 1;
    return 0; // running / queued / in progress
  };
  return [...summary.items].sort((a, b) => rank(a.status) - rank(b.status)).slice(0, Math.max(0, max));
}

export function AgentActivityCard({ summary, maxItems = 3 }: AgentActivityCardProps) {
  if (!hasSurfacedActivity(summary)) return null;
  const s = summary as AgentActivitySummary;

  const ScanIco = I.scan;
  const summaryLine = describeActivitySummary(s);
  const active = s.activeCount > 0;
  const items = itemsToList(s, maxItems);

  return (
    <div className={styles.agentCard} role="status" aria-live="polite">
      <div className={styles.agentHead}>
        <span
          className={active ? styles.agentDotLive : styles.agentDotDone}
          aria-hidden="true"
        />
        <span className={styles.agentTitle}>Background AI work</span>
        <span className={styles.agentSummary}>{summaryLine}</span>
      </div>
      {items.length > 0 && (
        <ul className={styles.agentList}>
          {items.map((it) => (
            <li key={it.id} className={styles.agentItem}>
              <ScanIco size={13} className={styles.agentItemIco} aria-hidden="true" />
              <span className={styles.agentItemQ} title={it.question}>
                {it.question || 'Deep investigation'}
              </span>
              <span className={styles.agentItemStatus}>{it.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
