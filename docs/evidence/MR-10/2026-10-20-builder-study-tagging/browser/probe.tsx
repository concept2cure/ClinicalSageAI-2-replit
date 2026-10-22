/** Automated fixture host for the actual Builder; no regulated or agency data. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { BuilderWorkspace } from '../../../../../client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces';
import { useSubmissionReadSession } from '../../../../../client/src/concept2cure/v2/surfaces/submissionScopedRead';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/submission-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

const issued = Math.floor(Date.now() / 1000);
const claims = { sub: '9', userId: 9, organizationId: 1, iat: issued, exp: issued + 3600, jti: 'synthetic-study-tagging-browser' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify(claims)), 'synthetic-fixture-signature']
  .map(part => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).join('.');
if (!await authService.adoptSession(token, false, { userId: '9', organizationId: '1' })) throw new Error('Synthetic fixture actor was not confirmed.');

function Probe() {
  const session = useSubmissionReadSession();
  const [id, setId] = useState(21);
  const [status, setStatus] = useState('validated');
  const [notice, setNotice] = useState('');
  const seq = { id, sequenceNumber: id === 21 ? '0000' : '0001', type: 'original', status, region: 'fda', validationStatus: null };
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · actual Submission Builder</h1>
    <p>Automated UI fixture. This does not witness human testing or FDA acceptance.</p>
    <button onClick={() => { setId(id === 21 ? 22 : 21); setNotice(''); }}>Switch fixture sequence</button>
    <button onClick={() => setStatus('frozen')}>Freeze fixture sequence</button>
    <p role="status" data-testid="host-notice">{notice}</p>
    <BuilderWorkspace key={`${session.key}:${id}`} seq={seq} session={session} scopeContext={`synthetic:${id}`}
      onSequenceChanged={result => { setNotice(result.text); setStatus('assembling'); }} />
  </div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
