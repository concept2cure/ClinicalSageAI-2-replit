import { UI_SURFACES } from '<repo>/shared/constants/ui-surface-registry';
import { isLaunchSurface, LAUNCH_SURFACE_IDS } from '<repo>/shared/constants/launch-scope';
console.log('UI_SURFACES', UI_SURFACES.length);
console.log('first8', UI_SURFACES.slice(0,8).map(s=>s.id+(isLaunchSurface(s.id)?'':'(OUT)')).join(', '));
const inScope = UI_SURFACES.filter(s=>isLaunchSurface(s.id));
console.log('inScope registry', inScope.length, 'launch ids', LAUNCH_SURFACE_IDS.size);
console.log('launch ids not in registry', [...LAUNCH_SURFACE_IDS].filter(i=>!UI_SURFACES.some(s=>s.id===i)).join(','));
