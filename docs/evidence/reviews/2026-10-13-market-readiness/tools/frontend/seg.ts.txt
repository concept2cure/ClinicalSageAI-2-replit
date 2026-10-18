import { SEGMENT_MODULES, SEGMENT_CONTEXT } from '<repo>/client/src/concept2cure/v2/registryModel';
import { isLaunchSurface } from '<repo>/shared/constants/launch-scope';
for (const [seg, groups] of Object.entries(SEGMENT_MODULES as any)) {
  const ids = (groups as any[]).flatMap((g) => g.items);
  const inScope = ids.filter((i) => isLaunchSurface(i));
  console.log(seg, 'modules', ids.length, 'inScope', inScope.length, inScope.join(','));
}
for (const [seg, ctx] of Object.entries(SEGMENT_CONTEXT as any)) {
  const a = (ctx as any).actions.map((x: any) => x.surface);
  console.log('home actions', seg, a.map((s: string) => s + (isLaunchSurface(s) ? '' : '(OUT)')).join(', '));
}
