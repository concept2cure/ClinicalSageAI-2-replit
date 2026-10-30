/** The Communication Center's existing letter-visibility policy, shared by its source intake. */
import { COMMUNICATION_VISIBILITY_TIERS, type CommunicationVisibilityTier } from '../../../shared/types/communication-center';

export function canViewVisibilityTier(visibilityTier: CommunicationVisibilityTier, userRole?: string): boolean {
  const role = (userRole || '').toLowerCase();
  if (!COMMUNICATION_VISIBILITY_TIERS.includes(visibilityTier)) return false;
  if (visibilityTier === 'restricted_legal_sensitive') {
    return ['admin', 'owner', 'compliance', 'legal'].some(r => role.includes(r));
  }
  if (visibilityTier === 'publishops_only') return role.includes('publishops') || role.includes('admin');
  if (visibilityTier === 'c2c_internal') return role.includes('c2c') || role.includes('admin');
  return true;
}
