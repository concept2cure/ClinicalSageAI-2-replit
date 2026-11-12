/**
 * ConsentElementsCheck — the 21 CFR 50.25 required elements of informed
 * consent, as the editor's check for an informed-consent document.
 *
 * P-102 (founder, 2026-11-05): "informed consent is one record"; the checklist
 * and its completeness are the editor's checks for that type. The server sends
 * `consent_elements` on the section check only for a consent document, read by
 * the same gate the consent record is held to
 * (server/services/protocol-consent/protocol-consent-logic.ts, consentDocumentGate).
 * This draws it inside the Check panel. It is a view: it computes nothing.
 *
 * Honest state: it reports what the document's text satisfies, element by
 * element, and says why an element is not complete. It never says the consent
 * form is compliant; an IRB decides that.
 */
export interface ConsentElementsCheckData {
  basis: string;
  required_total: number;
  required_complete: number;
  ready: boolean;
  findings: string[];
  elements: Array<{ key: string; title: string; section: string; required: boolean; complete: boolean; citation: string }>;
  applicable_clinical_trial_note?: string;
}

export function ConsentElementsCheck({ check }: { check: ConsentElementsCheckData }) {
  const open = check.elements.filter((e) => !e.complete);
  return (
    <div
      data-testid="section-check-consent"
      style={{ display: 'grid', gap: 6, marginTop: 2, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 12 }}
    >
      <span>
        <b style={{ fontWeight: 600 }}>
          {check.required_complete} of {check.required_total} required elements of informed consent are complete in this document.
        </b>{' '}
        <span style={{ opacity: 0.75 }}>{check.basis}</span>
      </span>
      {check.ready ? (
        <span>Every required element has its text. An IRB still decides whether the form is adequate.</span>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
          {check.findings.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
      <details>
        <summary style={{ cursor: 'pointer' }}>Show all {check.elements.length} elements</summary>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
          {check.elements.map((e) => (
            <li key={e.key}>
              <strong>{e.complete ? 'Complete' : 'Not complete'}:</strong> {e.title}
              {e.section ? ` (section ${e.section})` : ''}
              <span style={{ opacity: 0.75 }}> · {e.citation}</span>
            </li>
          ))}
        </ul>
      </details>
      {open.some((e) => e.key === 'clinicaltrials_gov') && check.applicable_clinical_trial_note && (
        <span style={{ opacity: 0.75 }}>{check.applicable_clinical_trial_note}</span>
      )}
    </div>
  );
}
