// AdminPage.jsx - Page for administrative controls
import React from 'react';
import AdminEmbeddingPanel from '@/components/AdminEmbeddingPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Shield } from 'lucide-react';

export default function AdminPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Shield className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-2xl font-bold">Admin Controls</h1>
        </div>
      </div>

      <Separator className="mb-6" />

      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-3 lg:grid-cols-4">
          <TabsTrigger value="documents">Document Management</TabsTrigger>
          <TabsTrigger value="users">User Permissions</TabsTrigger>
          <TabsTrigger value="system">System Settings</TabsTrigger>
          <TabsTrigger value="logs" className="hidden lg:inline-flex">
            Audit Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <AdminEmbeddingPanel />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-card p-6">
            <h3 className="text-lg font-medium mb-2">User Management</h3>
            <p className="text-sm text-muted-foreground">
              User permission controls will be implemented in an upcoming release.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-card p-6">
            <h3 className="text-lg font-medium mb-2">System Configuration</h3>
            <p className="text-sm text-muted-foreground">
              System settings will be implemented in an upcoming release.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-card p-6">
            <h3 className="text-lg font-medium mb-2">Audit Logs</h3>
            <p className="text-sm text-muted-foreground">
              Audit logs will be implemented in an upcoming release.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
