import { UI_SURFACES } from '<repo>/shared/constants/ui-surface-registry';
import { LAUNCH_SURFACE_IDS, LAUNCH_APPS } from '<repo>/shared/constants/launch-scope';
import { RAIL_CORE, RAIL_EXPLORE, RAIL_QUICK, RAIL_SPECIALIST, NAV_HIDDEN } from '<repo>/client/src/concept2cure/v2/registryModel';
const rail = [...RAIL_CORE, ...RAIL_SPECIALIST, ...RAIL_EXPLORE, ...RAIL_QUICK] as any[];
for (const app of LAUNCH_APPS) for (const id of app.surfaces) {
  const s = UI_SURFACES.find(x=>x.id===id);
  const r = rail.filter(x=>(x.target??x.id)===id).map(x=>x.label);
  console.log(`${app.label} | ${id} | registry="${s?.label}" | rail=${r.length?r.join('/'):'-'} | navHidden=${NAV_HIDDEN.has(id)}`);
}
