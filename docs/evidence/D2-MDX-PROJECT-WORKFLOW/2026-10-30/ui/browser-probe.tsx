/** Shipped workstream and MDX host; only synthetic selection and callback observation live here. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../../client/src/services/portal/authService';
import { ProjectMdxWorkflow } from '../../../../../client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow';
import { MdxSurfaceHost } from '../../../../../client/src/concept2cure/mdx/MdxSurfaceHost';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import { useActiveSurfaceContext } from '../../../../../client/src/concept2cure/v2/surfaceContext';
import type { SurfaceViewProps } from '../../../../../client/src/concept2cure/v2/surfaceViews';
import { project } from './browser-fixtures.mjs';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/index.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

publishShellProject({ id: project.id, title: project.name, productType: 'device' });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Probe() {
  const [screen, setScreen] = React.useState('project-home');
  const [ask, setAsk] = React.useState('');
  const context = useActiveSurfaceContext(screen);
  const surface = { id: screen } as SurfaceViewProps['surface'];
  return <QueryClientProvider client={client}><AuthProvider><div className="c2c-v2" data-theme="light">
    <aside style={{ padding: 16, fontSize: 12 }}>Synthetic qualification · intercepted records · no authenticated client acceptance, production write or live signature</aside>
    {screen === 'device-engineering'
      ? <MdxSurfaceHost nav="device-engineering" surface={surface} segment="medtech" onNav={setScreen} onAsk={setAsk} />
      : <main className="page-inner"><ProjectMdxWorkflow project={project} otherFilings={[]} marketsState="ready"
        onNav={setScreen} onAsk={setAsk} available={() => true} onStage={() => {}} /></main>}
    <output aria-label="Observed synthetic context" style={{ display: 'block', padding: 16, overflowWrap: 'anywhere' }}>{JSON.stringify({ screen, ask, context })}</output>
  </div></AuthProvider></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
