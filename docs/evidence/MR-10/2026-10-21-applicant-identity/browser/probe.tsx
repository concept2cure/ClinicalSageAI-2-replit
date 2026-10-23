/** Actual forms component; all intercepted API records are explicitly synthetic. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { IndFormsPanel } from '../../../../../client/src/concept2cure/v2/surfaces/IndFormsPanel';
import { DispatchWorkspace } from '../../../../../client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/submission-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

const issued = Math.floor(Date.now() / 1000);
const claims = { sub: '9', userId: 9, organizationId: 1, iat: issued, exp: issued + 3600, jti: 'synthetic-applicant-browser' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify(claims)), 'synthetic-fixture-signature']
  .map(part => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).join('.');
if (!await authService.adoptSession(token, false, { userId: '9', organizationId: '1' })) throw new Error('Synthetic actor not confirmed.');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
publishShellProject({ id: A, title: 'Synthetic program A' });

function Probe() {
  const [program, setProgram] = useState(A);
  const [visit, setVisit] = useState(0);
  const [dispatch, setDispatch] = useState(false);
  const open = (id: string) => { publishShellProject({ id, title: `Synthetic program ${id}` }); setProgram(id); };
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · existing IND forms</h1>
    <p>Intercepted synthetic qualification records. Human witnessing and agency acceptance are unexecuted.</p>
    <p>Program {program} · visit {visit}</p>
    <button onClick={() => open(A)}>Open synthetic program A</button>
    <button onClick={() => open(B)}>Open synthetic program B</button>
    <button onClick={() => { open(B); open(A); setVisit(value => value + 1); }}>Revisit synthetic program A</button>
    <IndFormsPanel note={(message) => { document.getElementById('qualification-receipt')!.textContent = String(message); }} />
    <p id="qualification-receipt" role="status" aria-label="Qualification notification" />
    <button onClick={() => setDispatch(true)}>Show synthetic dispatch renewal</button>
    {dispatch && <section aria-label="Synthetic dispatch qualification">
      <p>Actual dispatch component; its governed callback is observed here. Backend signature/audit execution is qualified separately.</p>
      <DispatchWorkspace sub={{ id: 3, title: 'Synthetic IND', primaryRegion: 'fda', applicationType: 'ind' }}
        seq={{ id: 7, sequenceNumber: '0000', type: 'original', status: 'dispatched', region: 'fda', validationStatus: 'passed' }}
        onGoverned={(_sequence, action) => { document.getElementById('dispatch-request')!.textContent = `Existing governed ${action} callback requested`; }} />
      <p id="dispatch-request" role="status" aria-label="Observed dispatch callback" />
    </section>}
  </div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
