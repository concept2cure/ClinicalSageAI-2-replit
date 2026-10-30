/** Controlled host seam around the actual chooser; no product/editor implementation. */
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/authoring-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { SourceAssemblyDialog } from '../../../../../client/src/concept2cure/v2/editor/SourceAssemblyDialog';
import { authService } from '../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import { peekEditorTarget } from '../../../../../client/src/concept2cure/v2/editorTarget';
import { registerCeremonyOpen } from '../../../../../client/src/concept2cure/v2/ceremony';
import { setAuthToken } from '../../../../../client/src/utils/authToken';
import type { AssemblySourceSelector } from '../../../../../shared/authoring/assembly-sources';
import { actor, bearer, OTHER_PROGRAM, PROGRAM, sources } from './fixtures.mjs';

declare global { interface Window {
  chooserNavigation: string[];
  chooserPeek: () => unknown;
  chooserVisit: (programId: string) => void;
  chooserRefresh: () => Promise<boolean>;
  chooserReplace: () => void;
  chooserRawSwap: () => void;
} }
const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const mode = params.get('mode');
authService.setToken(bearer(), actor, 'synthetic-refresh', 3600);
publishShellProject({ id: PROGRAM, title: 'Synthetic source assembly project', productType: 'ivd' });
window.chooserNavigation = [];
window.chooserPeek = peekEditorTarget;
window.chooserVisit = programId => publishShellProject({ id: programId, title: 'Synthetic selected project' });
window.chooserRefresh = () => authService.refreshToken();
window.chooserReplace = () => authService.setToken(bearer('replacement'), actor, 'replacement-refresh', 3600);
window.chooserRawSwap = () => setAuthToken(bearer('unadopted'));
function Probe() {
  const [visible, setVisible] = useState(true);
  const admitted = useRef(true);
  const close = () => {
    if (mode === 'close-project') publishShellProject({ id: OTHER_PROGRAM, title: 'Synthetic other project' });
    if (mode === 'close-session') window.chooserReplace();
    if (mode === 'close-ceremony') registerCeremonyOpen();
    if (mode === 'close-parent') admitted.current = false;
    flushSync(() => setVisible(false));
  };
  return <div className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`} data-theme={theme} style={{ height: '100vh' }}>
    <main aria-label="Actual source chooser with synthetic current records">
      {visible ? <SourceAssemblyDialog programId={PROGRAM} sources={sources as AssemblySourceSelector[]}
        titles={['Synthetic analytical evidence', 'Synthetic retained Vault evidence']} onClose={close}
        isCurrent={() => admitted.current}
        onNav={route => window.chooserNavigation.push(route)} /> : <p>Chooser closed.</p>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
