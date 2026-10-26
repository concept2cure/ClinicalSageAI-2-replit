/** Reuse the historical actual Data Room/Workbench host; Vite binds current synthetic records. */
import '../../../D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/probe';
import { setAuthToken } from '../../../../../client/src/utils/authToken';
import { positiveBearer } from './positive-api.mjs';
declare global { interface Window { sourceAssemblyRawSwap: () => void } }
window.sourceAssemblyRawSwap = () => setAuthToken(positiveBearer('unadopted-raw-swap'));
