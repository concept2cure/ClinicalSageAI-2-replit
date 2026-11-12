/**
 * WarGameReportPanel — the war game's report, under the answer that ran it.
 *
 * The engine (server/services/ana/intelligence-questions/war-game/engine.ts)
 * has emitted `war_game_report` on the stream since the war game landed, and
 * useAnaChat keeps it on the message. Its view, WarGameReport.tsx, was deleted
 * on 2026-08-04 with the rail's dead code, so the findings, their regulatory
 * basis and — since 2026-10-22 — the count of checks the interview could not
 * feed reached the browser and were never drawn. This draws them, in the same
 * calm shape as the CRL pre-mortem beside it (CrlPremortemPanel).
 *
 * Honest state is the point of it:
 *   - a check that could not be assessed is listed as such, never as passed;
 *   - "no findings" says how many checks that covers, and that it is not proof;
 *   - a war game that assessed nothing says nothing was assessed;
 *   - the headline is the engine's assessment word. The score is the engine's
 *     figure, shown as detail with the number of checks behind it.
 *
 * A pure view: it owns no chat state and computes nothing the engine did not.
 */
import type { WarGameFinding, WarGameReport } from '@shared/types/intelligence-questions';

import { I } from './icons';
import styles from './styles.module.css';

const ASSESSMENT: Record<WarGameReport['overallAssessment'], { label: string; tone: 'high' | 'moderate' | 'low' }> = {
  audit_ready: { label: 'Audit-ready', tone: 'high' },
  needs_work: { label: 'Needs work', tone: 'moderate' },
  significant_gaps: { label: 'Significant gaps', tone: 'low' },
  not_ready: { label: 'Not ready', tone: 'low' },
};

const CATEGORY: Record<WarGameReport['category'], string> = {
  protocol: 'Protocol', ind: 'IND', csr: 'Clinical study report', '510k': '510(k)', cer: 'Clinical evaluation report',
  sop: 'SOP', nda: 'NDA', bla: 'BLA', pma: 'PMA', cmc: 'CMC', risk_management: 'Risk management',
  safety_narrative: 'Safety narrative', labeling: 'Labeling', briefing_book: 'Briefing book', stability: 'Stability',
};

/** The premortem's severity rail reads critical/medium/low; the war game's are critical/warning/info. */
const RAIL: Record<WarGameFinding['severity'], 'critical' | 'medium' | 'low'> = { critical: 'critical', warning: 'medium', info: 'low' };
const ORDER: Record<WarGameFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Finding({ f }: { f: WarGameFinding }) {
  return (
    <li className={styles.premortemRisk} data-severity={RAIL[f.severity]}>
      <div className={styles.premortemRiskHead}>
        <span className={styles.premortemRiskSeverity}>{f.severity.toUpperCase()}</span>
        <span className={styles.premortemRiskTitle}>{f.title}</span>
      </div>
      <p className={styles.premortemDetail}>{f.observation}</p>
      <p className={styles.premortemDetail}>{f.requirement}</p>
      <p className={styles.premortemDetail}><strong>What to do:</strong> {f.recommendation}</p>
      <p className={styles.premortemCite}>
        <span className={styles.ico} aria-hidden="true"><I.book size={11} /></span>
        <span>{f.reference}</span>
      </p>
    </li>
  );
}

export function WarGameReportPanel({ report }: { report: WarGameReport }) {
  const assessed = report.rulesAssessed ?? 0;
  const total = report.rulesTotal ?? assessed;
  const notAssessed = report.notAssessed ?? [];
  const unassessedCount = Math.max(total - assessed, notAssessed.length);
  const findings = [...report.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const critical = findings.filter((f) => f.severity === 'critical');
  const rest = findings.filter((f) => f.severity !== 'critical');
  const nothingAssessed = assessed === 0;
  const a = ASSESSMENT[report.overallAssessment];

  return (
    <section className={styles.premortemPanel} aria-label="War game report">
      <header className={styles.premortemHeader}>
        <span className={styles.ico} aria-hidden="true"><I.shieldCheck size={15} /></span>
        <span className={styles.premortemTitle}>War game — {CATEGORY[report.category] ?? report.category}</span>
      </header>

      <div className={styles.premortemEstimate} data-class={nothingAssessed ? 'none' : a.tone} role="status">
        <div className={styles.premortemEstimateHead}>
          <span className={styles.premortemEstimateLabel}>Assessment</span>
          <span className={styles.premortemEstimateValue}>{nothingAssessed ? 'Not assessed' : a.label}</span>
        </div>
        <p className={styles.premortemMeta}>
          {nothingAssessed
            ? `Nothing was assessed: none of the ${plural(total, 'check')} could be read from this interview's answers.`
            : `${assessed} of ${plural(total, 'check')} assessed · score ${report.overallScore}/100 over those · regulatory risk ${report.regulatoryRiskLevel}`}
        </p>
      </div>

      <p className={styles.premortemHonesty}>
        A war game reads the interview&rsquo;s answers against codified reviewer checks. It is a rehearsal, not an
        agency&rsquo;s review, and a check that found nothing is not proof of soundness.
      </p>

      <div className={styles.premortemSection}>
        <h3 className={styles.premortemSectionTitle}>Findings</h3>
        {findings.length === 0 ? (
          <p className={styles.premortemDetail}>
            {nothingAssessed
              ? 'No findings, because no check could run.'
              : `No finding from the ${plural(assessed, 'check')} assessed. A person must still confirm the document is complete.`}
          </p>
        ) : (
          <>
            {/* Criticals are open; the rest are one disclosure away, so a long
                report reads as its blockers first (progressive disclosure). */}
            {(critical.length > 0 ? critical : findings).length > 0 && (
              <ol className={styles.premortemRiskList}>{(critical.length > 0 ? critical : findings).map((f) => <Finding key={f.id} f={f} />)}</ol>
            )}
            {critical.length > 0 && rest.length > 0 && (
              <details>
                <summary className={styles.premortemMeta}>Show {plural(rest.length, 'more finding')} (warnings and notes)</summary>
                <ol className={styles.premortemRiskList}>{rest.map((f) => <Finding key={f.id} f={f} />)}</ol>
              </details>
            )}
          </>
        )}
      </div>

      {unassessedCount > 0 && (
        <div className={styles.premortemSection}>
          <h3 className={styles.premortemSectionTitle}>Not assessed</h3>
          <p className={styles.premortemDetail}>
            {plural(unassessedCount, 'check')} could not be assessed, because the interview does not ask what
            {unassessedCount === 1 ? ' it reads' : ' they read'}. They are not scored and are not passes.
          </p>
          {notAssessed.length > 0 && (
            <details>
              <summary className={styles.premortemMeta}>Show the checks</summary>
              <ul className={styles.premortemFixList}>
                {notAssessed.map((n) => (
                  <li key={n.ruleId} className={styles.premortemFix}>
                    <span className={styles.premortemFixAction}>{n.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
