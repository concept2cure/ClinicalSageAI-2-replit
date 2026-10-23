/** Actual existing component; all records and network responses are synthetic interceptions. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarketApplicationNumber } from '../../../../../client/src/concept2cure/v2/surfaces/MarketApplicationNumber';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

function Probe() {
  const [submissionId, setSubmissionId] = React.useState(2);
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · existing market number component</h1>
    <p>Intercepted synthetic records. No production write, live signature, transmission or human acceptance is executed.</p>
    <section aria-label="Synthetic market number">
      <MarketApplicationNumber submissionId={submissionId} onChanged={() => { document.getElementById('observed-change')!.textContent = 'Synthetic number change observed'; }} />
    </section>
    <section aria-label="Qualification harness controls">
      <button type="button" onClick={() => setSubmissionId(3)}>Read unresolved synthetic market</button>
      <button type="button" onClick={() => setSubmissionId(4)}>Read resolved synthetic market</button>
    </section>
    <p id="observed-change" role="status" aria-label="Observed change callback" />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
