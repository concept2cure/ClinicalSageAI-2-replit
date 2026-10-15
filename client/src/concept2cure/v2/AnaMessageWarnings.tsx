/**
 * The warnings an AnA message carries — a save that failed, a timeout, a
 * refused model pin — drawn under her answer, as a note.
 *
 * The one implementation for every host that shows her answers (row 74,
 * ADR-0015 §9). It was markup inline in the rail (Shell.tsx), and the
 * conversation screen drew none: the rail is not mounted while that screen is
 * open, so Home's questions, which land there, showed no warning at all.
 */
import { I } from './icons';

export function AnaMessageWarnings({ warnings }: { warnings: readonly string[] | null | undefined }) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null;
  return (
    <div className="ana-msg-warnings" role="note">
      {warnings.map((w, i) => (
        <div key={i} className="ana-msg-warning">
          <span className="ana-msg-warning-ic" aria-hidden="true">{I.alertTriangle}</span>
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
