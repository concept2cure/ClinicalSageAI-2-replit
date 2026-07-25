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
import {
  hasSurfacedActivity,
  type AgentActivityItem,
  type AgentActivitySummary,
} from './useAgentActivity';

export interface AgentActivityCardProps {
  summary: AgentActivitySummary | null | undefined;
  /** Max items to list under the summary line. Defaults to 3. */
  maxItems?: number;
  /**
   * Open one run in the conversation. When provided, each listed run becomes a
   * button — clicking a finished one pulls its research memo, clicking a live
   * one asks where it stands. Omit to render the card read-only.
   */
  onOpenInvestigation?: (item: AgentActivityItem) => void;
}

/** Has this run produced a memo to read? Pure; drives copy and ordering. */
export function isCompletedStatus(status: string): boolean {
  const s = status.toLowerCase();
  if (s.includes('stalled')) return false;
  return s.includes('complete') || s.includes('finish') || s.includes('ready');
}

/**
 * The chat turn a click sends. Names the investigation id so AnA routes it to
 * `check_deep_investigation`, and asks for the memo only when there is one —
 * a live or stalled run is asked for its honest status instead. Pure.
 */
export function composeInvestigationPrompt(item: AgentActivityItem): string {
  const subject = item.question ? ` on "${item.question}"` : '';
  return isCompletedStatus(item.status)
    ? `Show me the research memo from the deep investigation${subject} (investigation_id ${item.id}). Give me the findings in full, with the sources.`
    : `Where does the deep investigation${subject} (investigation_id ${item.id}) stand right now? Report its honest status and what it has found so far.`;
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
    if (status.toLowerCase().includes('stalled')) return 2;
    if (isCompletedStatus(status)) return 1;
    return 0; // running / queued / in progress
  };
  return [...summary.items].sort((a, b) => rank(a.status) - rank(b.status)).slice(0, Math.max(0, max));
}

export function AgentActivityCard({
  summary,
  maxItems = 3,
  onOpenInvestigation,
}: AgentActivityCardProps) {
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
          {items.map((it) => {
            const label = it.question || 'Deep investigation';
            const body = (
              <>
                <ScanIco size={13} className={styles.agentItemIco} aria-hidden="true" />
                <span className={styles.agentItemQ} title={it.question}>
                  {label}
                </span>
                <span className={styles.agentItemStatus}>{it.status}</span>
              </>
            );
            return (
              <li key={it.id} className={styles.agentItem}>
                {onOpenInvestigation ? (
                  <button
                    type="button"
                    className={styles.agentItemBtn}
                    onClick={() => onOpenInvestigation(it)}
                    // The accessible name states the outcome, not just the topic,
                    // so the action is unambiguous without the surrounding text.
                    aria-label={
                      isCompletedStatus(it.status)
                        ? `Read the research memo: ${label}`
                        : `Check progress: ${label}`
                    }
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
