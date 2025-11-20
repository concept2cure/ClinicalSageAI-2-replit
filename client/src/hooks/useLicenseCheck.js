// client/src/hooks/useLicenseCheck.js
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient.js';

export const useLicenseCheck = (clientId) => {
  const { data: licenseData, isLoading, error } = useQuery({
    queryKey: ['/api/licenses/client', clientId, 'check'],
    queryFn: async () => {
      if (!clientId) {
        return { hasLicense: false, features: {}, isBlocked: false };
      }
      
      try {
        const data = await apiRequest(`/api/licenses/client/${clientId}`, { method: 'GET' });
        
        if (!data?.license) {
          return { hasLicense: false, features: {}, isBlocked: false };
        }
        
        const license = data.license;
        const now = new Date();
        const validUntil = new Date(license.validUntil || license.valid_until);
        
        // Check if license is active and not expired
        const isActive = license.status === 'active' && validUntil >= now;
        
        return {
          hasLicense: isActive,
          license,
          features: license.features || {},
          licenseKey: license.licenseKey || license.license_key,
          validUntil: license.validUntil || license.valid_until,
          status: license.status,
          maxSubmissions: license.maxSubmissions || license.max_submissions || 0,
          maxProjects: license.maxProjects || license.max_projects || 0,
          maxUsers: license.maxUsers || license.max_users || 0,
          isBlocked: false,
        };
      } catch (err) {
        console.error('Error checking license:', err);
        // If 403 (forbidden) or 404 (not found), allow access but no license
        if (err.response?.status === 403 || err.response?.status === 404) {
          return { hasLicense: false, features: {}, isBlocked: false };
        }
        // For other errors (500, network), block access for security
        return { hasLicense: false, features: {}, isBlocked: true, error: err.message };
      }
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  
  return {
    hasLicense: licenseData?.hasLicense || false,
    license: licenseData?.license,
    features: licenseData?.features || {},
    isLoadingLicense: isLoading,
    licenseError: error,
    isBlocked: licenseData?.isBlocked || false,
    canUse510k: licenseData?.features?.fda510k || false,
    canUsePMA: licenseData?.features?.fdaPMA || false,
    canUseCER: licenseData?.features?.euMDR || false,
    canUseAI: licenseData?.features?.aiAssistance || false,
  };
};

export default useLicenseCheck;