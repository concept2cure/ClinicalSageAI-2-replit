/**
 * BriefingBookPanel — E8. The reviewer-challenge / pre-mortem trust-strip for a
 * Pre-IND / EOP2 meeting briefing book, modeled on VerificationPanel.
 *
 * Where VerificationPanel answers "does the .docx match the source?", this panel
 * answers "where will the FDA push back on the sponsor's questions?" — it renders
 * the ANTICIPATED reviewer pushback surfaced by simulate_reviewer_challenges and
 * run_submission_premortem, grouped under each sponsor question.
 *
 * Honesty contract (21 CFR Part 11):
 *   - The header always reads "Anticipated FDA pushback" — this is anticipated,
 *     never an actual agency position.
 *   - A book assembled from sample/fixture meeting data is marked "Sample data —
 *     not assessed" and shows a non-exportable notice; sample/not_assessed is
 *     never sealable or exportable.
 *   - Microcopy is factual (no emoji, no cheerleading). The strip is a live
 *     region so assistive tech announces the verdict.
 */
import { I } from './icons';
import styles from './styles.module.css';

export type BriefingChallengeSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface BriefingAnticipatedChallenge {
  lens?: string;
  severity: BriefingChallengeSeverity;
  question: string;
  regulatoryBasis?: string;
  suggestedResponse?: string;
}

export interface BriefingSponsorQuestion {
  number: number;
  question: string;
  challenges: BriefingAnticipatedChallenge[];
}

/**
 * Client shape of composeBriefingBookPremortem (server/services/ana/
 * briefing-book-core.ts). Kept structurally identical so the SSE stream can map
 * the tool result straight onto it.
 */
export interface BriefingBookPremortemResult {
  /** Always true — anticipated pushback, never an actual FDA position. */
  anticipated: true;
  perQuestion: BriefingSponsorQuestion[];
  unmappedChallenges: BriefingAnticipatedChallenge[];
  overallRisk: BriefingChallengeSeverity | 'insufficient_data';
  precedentCount: number;
  dataSource: 'live' | 'fixture';
  /** Sample/not_assessed is never sealable/exportable. */
  sealable: boolean;
  assessment: 'assessed' | 'not_assessed';
  summary?: string;
}

const SEVERITY_LABEL: Record<BriefingChallengeSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function riskLabel(risk: BriefingBookPremortemResult['overallRisk']): string {
  if (risk === 'insufficient_data') return 'Insufficient precedent data';
  return `${SEVERITY_LABEL[risk]} anticipated risk`;
}

export interface BriefingBookPanelProps {
  premortem: BriefingBookPremortemResult;
}

function ChallengeItem({ challenge }: { challenge: BriefingAnticipatedChallenge }) {
  return (
    <li className={styles.briefChallenge} data-severity={challenge.severity}>
      <div className={styles.briefChallengeHead}>
        <span
          className={styles.briefSeverity}
          data-severity={challenge.severity}
        >
          {SEVERITY_LABEL[challenge.severity]}
        </span>
        {challenge.lens && <span className={styles.briefLens}>{challenge.lens}</span>}
      </div>
      <p className={styles.briefChallengeQ}>{challenge.question}</p>
      {challenge.regulatoryBasis && (
        <p className={styles.briefChallengeMeta}>Basis: {challenge.regulatoryBasis}</p>
      )}
      {challenge.suggestedResponse && (
        <p className={styles.briefChallengeMeta}>Suggested response: {challenge.suggestedResponse}</p>
      )}
    </li>
  );
}

export function BriefingBookPanel({ premortem }: BriefingBookPanelProps) {
  const {
    perQuestion,
    unmappedChallenges,
    overallRisk,
    precedentCount,
    assessment,
    sealable,
  } = premortem;
  const notAssessed = assessment === 'not_assessed';
  const totalChallenges =
    perQuestion.reduce((n, q) => n + q.challenges.length, 0) + unmappedChallenges.length;

  return (
    <section
      className={styles.briefPanel}
      data-risk={overallRisk}
      role="status"
      aria-live="polite"
      aria-label="Anticipated FDA pushback"
    >
      <div className={styles.briefHead}>
        <span className={styles.ico} aria-hidden="true">
          <I.alert size={14} />
        </span>
        <span className={styles.briefTitle}>Anticipated FDA pushback</span>
      </div>

      <p className={styles.briefDetail}>
        {totalChallenges} anticipated reviewer{' '}
        {totalChallenges === 1 ? 'challenge' : 'challenges'} across {perQuestion.length} sponsor{' '}
        {perQuestion.length === 1 ? 'question' : 'questions'}. {riskLabel(overallRisk)}
        {precedentCount > 0
          ? ` (n=${precedentCount} precedents).`
          : ' — pattern-only, confidence: low.'}
      </p>

      {/* Honesty notice: anticipated, never an actual agency position. */}
      <p className={styles.briefAnticipatedNote}>
        These are anticipated questions a reviewer may raise — not an actual FDA position.
      </p>

      {notAssessed && (
        <p className={styles.briefSampleNote} data-testid="brief-sample-notice">
          Sample data — not assessed.{' '}
          {!sealable && 'This briefing book cannot be sealed or exported until built from live meeting data.'}
        </p>
      )}

      {perQuestion.map(q => (
        <div key={q.number} className={styles.briefQuestion}>
          <h4 className={styles.briefQuestionTitle}>
            Question {q.number}. {q.question}
          </h4>
          {q.challenges.length > 0 ? (
            <ul className={styles.briefChallengeList} aria-label={`Anticipated pushback on question ${q.number}`}>
              {q.challenges.map((c, i) => (
                <ChallengeItem key={i} challenge={c} />
              ))}
            </ul>
          ) : (
            <p className={styles.briefChallengeMeta}>No anticipated pushback surfaced for this question.</p>
          )}
        </div>
      ))}

      {unmappedChallenges.length > 0 && (
        <div className={styles.briefQuestion}>
          <h4 className={styles.briefQuestionTitle}>General anticipated pushback</h4>
          <ul className={styles.briefChallengeList} aria-label="General anticipated pushback">
            {unmappedChallenges.map((c, i) => (
              <ChallengeItem key={i} challenge={c} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
