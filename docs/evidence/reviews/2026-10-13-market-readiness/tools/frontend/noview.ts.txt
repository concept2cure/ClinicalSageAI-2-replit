import { readFileSync } from 'fs';
import { UI_SURFACES } from '<repo>/shared/constants/ui-surface-registry';
import { DEEP_LINK_ALIASES } from '<repo>/client/src/concept2cure/v2/registryModel';
const src = readFileSync('<repo>/client/src/concept2cure/v2/surfaceViews.ts','utf8');
const ids = new Set([...src.matchAll(/^\s+'?([a-z0-9-]+)'?: \{ component:/gm)].map(m=>m[1]));
console.log('registry ids without a view:', UI_SURFACES.filter(s=>!ids.has(s.id)).map(s=>s.id).join(', ') || 'none');
console.log('aliases:', JSON.stringify(DEEP_LINK_ALIASES));
