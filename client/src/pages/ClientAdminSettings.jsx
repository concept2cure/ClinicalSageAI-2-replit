import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Settings as SettingsIcon } from 'lucide-react';
import ClientWorkspaceSettings from '../components/client/ClientWorkspaceSettings';
import ClientSecuritySettings from '../components/client/ClientSecuritySettings';
import { useTenant } from '../contexts/TenantContext';

const ClientAdminSettings = () => {
  const { currentClientWorkspace } = useTenant();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            <CardTitle>Client Admin Panel</CardTitle>
            <Badge variant="outline">Workspace</Badge>
          </div>
          <CardDescription>
            Manage branding, integrations, and security for {currentClientWorkspace?.name || 'this workspace'}.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="workspace" className="w-full">
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="workspace" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Workspace Settings
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="space-y-4">
          <ClientWorkspaceSettings visibleTabs={['general', 'integration', 'appearance', 'notifications']} />
        </TabsContent>
        <TabsContent value="security" className="space-y-4">
          <ClientSecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientAdminSettings;
