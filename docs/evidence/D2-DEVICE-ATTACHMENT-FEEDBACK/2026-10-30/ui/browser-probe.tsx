/** Actual drawer, uploader, transport, receipt parser and store; network replies are synthetic. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DossierDrawer } from '../../../../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';
import { DossierStore } from '../../../../../client/src/concept2cure/mdx/store/dossierStore';
import { publishShellProject } from '../../../../../client/src/concept2cure/v2/shellProject';
import { setAuthToken, setOrgId } from '../../../../../client/src/utils/authToken';
import '../../../../../design-system/colors_and_type.css';
import '../../../../../client/src/index.css';
import '../../../../../client/src/concept2cure/v2/styles/app-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/misc-surfaces-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/coverage-v2.css';
import '../../../../../client/src/concept2cure/v2/styles/surface-text-ramp.css';
import '../../../../../client/src/concept2cure/mdx/app.css';
import '../../../../../client/src/concept2cure/mdx/pathway-tabs.css';
import '../../../../../client/src/concept2cure/mdx/files-tree.css';
import '../../../../../client/src/concept2cure/mdx/surface-text-ramp.css';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const TARGET = { id: 91, label: 'Synthetic performance evidence' };
const theme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
setAuthToken('synthetic-device-attachment-browser');
setOrgId('7');
publishShellProject({ id: PROGRAM, title: 'Synthetic device program', productType: 'device' });
DossierStore.clearAllPathways();
Object.assign(window, {
  deviceAttachmentObservation: () => DossierStore.readSectionAttachments('k510', TARGET.id, TARGET.label),
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Probe() {
  const [open, setOpen] = React.useState(true);
  return <QueryClientProvider client={client}>
    <div className="c2c-v2" data-theme={theme} style={{ minHeight: '100vh' }}>
      <div className="mdx-shell" data-theme={theme}>
        <aside style={{ padding: 16, fontSize: 12 }}>
          Synthetic browser qualification · intercepted replies · no hosted login, production write, signature or agency acceptance
        </aside>
        <DossierDrawer open={open} target={TARGET} pathway="k510" programId={PROGRAM} documentId={DOCUMENT} onClose={() => setOpen(false)} />
      </div>
    </div>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
