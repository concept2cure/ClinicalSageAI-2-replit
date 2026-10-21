/** Fixture host for the actual three placement surfaces; no regulated records. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { BuilderWorkspace } from '../../../../../client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces';
import { VaultPlaceIntoSubmission } from '../../../../../client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission';
import { AuthoringPlaceIntoFiling } from '../../../../../client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling';
import { useSubmissionReadSession } from '../../../../../client/src/concept2cure/v2/surfaces/submissionScopedRead';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/submission-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

const issued = Math.floor(Date.now() / 1000);
const claims = { sub: '9', userId: 9, organizationId: 1, iat: issued, exp: issued + 3600, jti: 'synthetic-study-placement-browser' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify(claims)), 'synthetic-fixture-signature']
  .map(part => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).join('.');
if (!await authService.adoptSession(token, false, { userId: '9', organizationId: '1' })) throw new Error('Synthetic actor not confirmed.');

function Probe() {
  const session = useSubmissionReadSession();
  const query = new URLSearchParams(location.search);
  const [lane, setLane] = useState(query.get('lane') ?? 'builder');
  const [status, setStatus] = useState(query.get('frozen') === '1' ? 'frozen' : 'assembling');
  const [closed, setClosed] = useState(false);
  const seq = { id: 21, sequenceNumber: '0000', type: 'original', status, region: 'fda', validationStatus: null };
  const nav = () => { setLane('builder'); setClosed(false); };
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · actual study placement surfaces</h1>
    <p>Automated fixture with intercepted synthetic records. Human witnessing and agency acceptance are unexecuted.</p>
    <p data-testid="lane">{lane}</p>
    <button onClick={() => setStatus('frozen')}>Freeze fixture sequence</button>
    {lane === 'builder' && <BuilderWorkspace key={`${session.key}:${status}`} seq={seq} session={session} scopeContext="synthetic-study-placement"
      onSequenceChanged={() => setStatus('assembling')} />}
    {lane === 'vault' && !closed && <VaultPlaceIntoSubmission documentUuid="a1000000-0000-4000-8000-0000000000a1"
      documentTitle="Synthetic Vault study report" mimeType="application/pdf" filing={{ ctdSection: '5.3.5.1', placementStatus: 'confirmed' }}
      onClose={() => setClosed(true)} onNav={nav} />}
    {lane === 'authoring' && <AuthoringPlaceIntoFiling docId="D1" docTitle="Synthetic saved study report" activeSectionCode="5.3.5.1"
      docStatus="APPROVED" dirty={false} onNav={nav} fireToast={() => {}} />}
  </div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
