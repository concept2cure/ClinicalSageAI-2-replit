/** Actual existing catalog component; all API responses are intercepted synthetic records. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { SurfaceViewProps } from '../../../../../client/src/concept2cure/v2/surfaceViews';
import { Apps } from '../../../../../client/src/concept2cure/v2/surfaces/AdminSurfaces';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';

function Probe() {
  const [target, setTarget] = React.useState('');
  const surface = { id: 'apps', label: 'Workflows' } as SurfaceViewProps['surface'];
  return <div data-theme="light" className="c2c-v2" style={{ minHeight: '100vh' }}>
    <aside style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      Synthetic browser qualification · intercepted records · no production write, live signature, or agency transmission
    </aside>
    <Apps surface={surface} onAsk={() => {}} onNav={setTarget} segment="biopharma" />
    <output aria-label="Observed navigation" style={{ display: 'block', padding: 16 }}>{target}</output>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
