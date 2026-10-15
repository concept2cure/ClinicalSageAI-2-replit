/**
 * Whether a surface can be opened in this release: the one rule a control on
 * a launch screen asks before it offers a door into another surface.
 *
 * Unknown (verdicts not yet read, or unreadable) counts as available, the rule
 * the rail uses: a lock is a claim about the customer's release and is never
 * invented. A surface whose feature flag keeps its API unmounted is not
 * available either, the rail's rule too (flagAllowsSurface); the CRL library
 * tile opened a 404 on Project home.
 *
 * Its own module, not a member of navEntitlements.tsx, so a test that mocks
 * `useNavEntitlements` reaches it: a call inside one module never goes
 * through that module's mock.
 */
import { flagAllowsSurface } from './clinicalRegulatoryGraphFlag';
import { isLaunchScopeLocked, useNavEntitlements } from './navEntitlements';

export function useSurfaceAvailable(): (id: string) => boolean {
  const { verdictFor } = useNavEntitlements();
  return (id: string) => flagAllowsSurface(id) && !isLaunchScopeLocked(verdictFor(id));
}
