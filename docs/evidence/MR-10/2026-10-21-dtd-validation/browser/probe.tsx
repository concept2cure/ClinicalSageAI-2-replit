/** Actual compile component; all intercepted API records are explicitly synthetic. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, authService } from '../../../../../client/src/services/portal/authService';
import { EctdCompile } from '../../../../../client/src/concept2cure/v2/surfaces/EctdCompile';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import type { SurfaceViewProps } from '../../../../../client/src/concept2cure/v2/surfaceViews';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/submission-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

const issued = Math.floor(Date.now() / 1000);
const claims = { sub: '9', userId: 9, organizationId: 1, iat: issued, exp: issued + 3600, jti: 'synthetic-dtd-compile-browser' };
const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify(claims)), 'synthetic-fixture-signature']
  .map(part => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).join('.');
if (!await authService.adoptSession(token, false, { userId: '9', organizationId: '1' })) throw new Error('Synthetic actor not confirmed.');
publishShellProject({ id: 42, title: 'Synthetic program 42' });

function Probe() {
  const [program, setProgram] = useState(42);
  const [visit, setVisit] = useState(0);
  const open = (id: number) => { publishShellProject({ id, title: `Synthetic program ${id}` }); setProgram(id); };
  const props = { surface: { id: 'ectd-compile', label: 'eCTD Compile' }, onAsk: () => {}, onNav: () => {}, segment: 'biopharma' } as SurfaceViewProps;
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Synthetic qualification · existing eCTD Compile</h1>
    <p>Intercepted synthetic records and synthetic schemas. Human witnessing and agency acceptance are unexecuted.</p>
    <p>Program {program} · visit {visit}</p>
    <button onClick={() => open(42)}>Open synthetic program A</button>
    <button onClick={() => open(43)}>Open synthetic program B</button>
    <button onClick={() => { open(43); open(42); setVisit(value => value + 1); }}>Revisit synthetic program A</button>
    <EctdCompile {...props} />
  </div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
