import React, { useEffect, useMemo, useState } from 'react';
import SubscriptionTiers from '@/components/SubscriptionTiers';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react';

export default function SubscriptionsPage() {
  const [moduleCatalog, setModuleCatalog] = useState({
    loading: true,
    error: null,
    modules: [],
  });
  const [updatingModuleId, setUpdatingModuleId] = useState(null);

  const highlightedModules = useMemo(() => {
    return (moduleCatalog.modules || []).filter(m => m?.isHighlight);
  }, [moduleCatalog.modules]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resp = await apiRequest('GET', '/api/modules/catalog');
        const data = await resp.json();
        if (!mounted) return;
        setModuleCatalog({ loading: false, error: null, modules: data.modules || [] });
      } catch (e) {
        if (!mounted) return;
        setModuleCatalog({ loading: false, error: e?.message || 'Failed to load modules', modules: [] });
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const setModuleEnabled = async (moduleId, enabled) => {
    setUpdatingModuleId(moduleId);
    try {
      await apiRequest('POST', '/api/modules/subscribe', { moduleId, enabled, actor: 'end_user' });
      const resp = await apiRequest('GET', '/api/modules/catalog');
      const data = await resp.json();
      setModuleCatalog({ loading: false, error: null, modules: data.modules || [] });
    } catch (e) {
      setModuleCatalog(prev => ({ ...prev, error: e?.message || 'Failed to update subscription' }));
    } finally {
      setUpdatingModuleId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Platform Modules */}
        <div className="mb-14">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-4">
              Platform Modules
            </h1>
            <p className="text-xl text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
              Manage access to subscription-gated modules (including Medical Device & Diagnostics).
            </p>
          </div>

          {moduleCatalog.error && (
            <div className="max-w-3xl mx-auto mb-6">
              <div className="flex items-start gap-3 p-4 border border-red-200 bg-red-50 text-red-800 rounded-lg">
                <AlertCircle className="h-5 w-5 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold">Could not load module catalog</div>
                  <div className="opacity-90">{moduleCatalog.error}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(moduleCatalog.loading ? highlightedModules : moduleCatalog.modules).map(mod => (
              <Card
                key={mod.moduleId}
                className={mod.isHighlight ? 'border-2 border-primary shadow-sm' : ''}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">{mod.name}</CardTitle>
                    {mod.enabled ? (
                      <Badge className="bg-green-600 hover:bg-green-600">
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Lock className="h-4 w-4 mr-1" />
                        Locked
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    {mod.description || 'Module subscription'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {mod?.metadata?.pricing?.display ? (
                        <span>{mod.metadata.pricing.display}</span>
                      ) : (
                        <span>Pricing varies by plan</span>
                      )}
                    </div>
                    <Button
                      onClick={() => setModuleEnabled(mod.moduleId, !mod.enabled)}
                      disabled={updatingModuleId === mod.moduleId || moduleCatalog.loading}
                      variant={mod.enabled ? 'outline' : 'default'}
                    >
                      {mod.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Intelligence Bundles */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-4">
            Intelligence Bundles
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
            Specialized report packages tailored to your specific needs in clinical trial
            development.
          </p>
        </div>

        <SubscriptionTiers />
      </div>
    </div>
  );
}
