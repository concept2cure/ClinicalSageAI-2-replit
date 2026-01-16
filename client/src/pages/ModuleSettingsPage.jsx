
import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button';
import ModuleSettings from '../components/client-portal/ModuleSettings';

const ModuleSettingsPage = () => {
  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <Link href="/client-portal">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portal
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Module Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure which modules are visible in your Client Portal
        </p>
      </div>
      
      <ModuleSettings />
    </div>
  );
};

export default ModuleSettingsPage;
