/** Reuses the recorded-applicant browser fixture. Actual components, synthetic intercepted API only. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { MarketApplicationNumber } from '../../../../../client/src/concept2cure/v2/surfaces/MarketApplicationNumber';
import { DispatchWorkspace } from '../../../../../client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/submission-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

const issued = Math.floor(Date.now() / 1000);
const claims = { sub: '9', userId: 9, organizationId: 1, iat: issued, exp: issued + 3600, jti: 'synthetic-nonus-release-browser' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify(claims)), 'synthetic-fixture-signature']
  .map(part => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).join('.');
if (!await authService.adoptSession(token, false, { userId: '9', organizationId: '1' })) throw new Error('Synthetic actor not confirmed.');

const region = new URLSearchParams(location.search).get('region') ?? 'ema';
function Probe() {
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · existing market and Dispatch components</h1>
    <p>Intercepted synthetic records. The governed callback is observed; no live signature, transmission or human acceptance is executed.</p>
    <section aria-label="Recorded synthetic market number">
      <MarketApplicationNumber submissionId={3} canChange={false} />
    </section>
    <section aria-label="Synthetic dispatch qualification">
      <DispatchWorkspace sub={{ id: 3, title: 'Synthetic market application', primaryRegion: region, applicationType: region === 'ema' ? 'maa' : 'nda' }}
        seq={{ id: 7, sequenceNumber: '0000', type: 'original', status: 'dispatched', region, validationStatus: 'passed' }}
        onGoverned={(sequence, action) => { document.getElementById('dispatch-request')!.textContent = JSON.stringify({ sequenceId: sequence.id, region: sequence.region, action }); }} />
      <p id="dispatch-request" role="status" aria-label="Observed dispatch callback" />
    </section>
  </div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
