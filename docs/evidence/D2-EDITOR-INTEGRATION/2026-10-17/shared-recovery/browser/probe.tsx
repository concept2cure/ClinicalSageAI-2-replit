import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../../../design-system/colors_and_type.css';
import '../../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/journey-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import { ReportEngine } from '../../../../../../client/src/concept2cure/v2/surfaces/ReportEngine';
import { authService } from '../../../../../../client/src/services/portal/authService';
import { publishShellProject } from '../../../../../../client/src/concept2cure/v2/shellProject';
import { peekEditorTarget } from '../../../../../../client/src/concept2cure/v2/editorTarget';
import { UI_SURFACES } from '../../../../../../shared/constants/ui-surface-registry';

declare global {
  interface Window { recoveryNavigation: Array<{ route: string; target: ReturnType<typeof peekEditorTarget> }> }
}
window.recoveryNavigation = [];
const user = await authService.adoptSession('synthetic-browser-session');
if (!user) throw new Error('Synthetic session adoption failed');
publishShellProject({ id: '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a', title: 'Synthetic recovery project' });
const theme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
const surface = UI_SURFACES.find(item => item.id === 'report-engine');
if (!surface) throw new Error('Reporting registry entry missing');
createRoot(document.getElementById('root')!).render(
  <div data-theme={theme} className={`c2c-v2 ${theme === 'dark' ? 'dark' : ''}`} style={{ minHeight: '100vh' }}>
    <main className="page" aria-label="Actual Reporting surface with synthetic API">
      <div className="page-inner"><ReportEngine surface={surface} segment="biopharma" onAsk={() => {}}
        onNav={route => window.recoveryNavigation.push({ route, target: peekEditorTarget() })} /></div>
    </main>
  </div>);
