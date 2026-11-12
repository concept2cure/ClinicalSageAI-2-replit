/**
 * InterviewCompletePanel — what a finished interview found, and what can be
 * done with it next.
 *
 * The interview engine emits `intelligence_flow_complete` when the last
 * question is answered: its summary, every issue its checks detected, and the
 * next actions it offers (each one a registered AnA tool; see
 * buildSuggestedActions in server/services/ana/intelligence-questions/engine.ts).
 * useAnaChat has kept that on the message since the interviews landed and no
 * component drew it, so the issues and the offer to run the war game stopped
 * at the browser.
 *
 * The next actions are not drawn here. The conversation draws them as its own
 * suggestion chips (ConversationThread, TurnSuggestions): choosing one sends
 * its label to AnA as the person's next message, and nothing runs until then.
 */
import type { DetectedIssue, IntelligenceFlowCompleteEvent } from '@shared/types/intelligence-questions';

import { I } from './icons';
import styles from './styles.module.css';

const RAIL: Record<DetectedIssue['severity'], 'critical' | 'medium' | 'low'> = { critical: 'critical', warning: 'medium', info: 'low' };
const ORDER: Record<DetectedIssue['severity'], number> = { critical: 0, warning: 1, info: 2 };

export function InterviewCompletePanel({ completion }: { completion: IntelligenceFlowCompleteEvent }) {
  const issues = [...completion.issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <section className={styles.premortemPanel} aria-label="Interview complete">
      <header className={styles.premortemHeader}>
        <span className={styles.ico} aria-hidden="true"><I.check size={15} /></span>
        <span className={styles.premortemTitle}>{completion.flowName} — interview complete</span>
      </header>

      <p className={styles.premortemDetail}>{completion.summary}</p>

      {issues.length > 0 && (
        <div className={styles.premortemSection}>
          <h3 className={styles.premortemSectionTitle}>Issues the interview found</h3>
          <ol className={styles.premortemRiskList}>
            {issues.map((issue) => (
              <li key={`${issue.questionId}:${issue.checkId}`} className={styles.premortemRisk} data-severity={RAIL[issue.severity]}>
                <div className={styles.premortemRiskHead}>
                  <span className={styles.premortemRiskSeverity}>{issue.severity.toUpperCase()}</span>
                  <span className={styles.premortemRiskTitle}>{issue.title}</span>
                </div>
                <p className={styles.premortemDetail}>{issue.message}</p>
                {issue.reference && (
                  <p className={styles.premortemCite}>
                    <span className={styles.ico} aria-hidden="true"><I.book size={11} /></span>
                    <span>{issue.reference}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

    </section>
  );
}
