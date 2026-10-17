import { LAUNCH_APPS, LAUNCH_SHELL_SURFACES, type LaunchApp } from '../../shared/constants/launch-scope';

/** Each release app must participate without a separately maintained list. */
export function launchQualificationSurfaces(apps: readonly LaunchApp[] = LAUNCH_APPS) {
  return apps.map(app => {
    const id = app.surfaces[0];
    if (!id) throw new Error(`Launch app ${app.id} has no surface to qualify`);
    return { id, app: app.label };
  });
}

export function accessQualificationSurfaces() {
  const surfaces = launchQualificationSurfaces();
  for (const id of ['compliance-reports','audit-trail','part11-console']) {
    if (!surfaces.some(surface=>surface.id===id)) surfaces.push({ id, app: LAUNCH_SHELL_SURFACES[id] ?? 'Audit and compliance reports' });
  }
  return surfaces;
}
