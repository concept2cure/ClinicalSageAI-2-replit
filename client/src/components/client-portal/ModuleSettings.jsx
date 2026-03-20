import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Brain,
  Beaker,
  BookOpen,
  BarChart,
  Database,
  Shield,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ModuleSettings = () => {
  const { toast } = useToast();

  // Default module configuration
  const defaultModules = [
    {
      id: 'ectd-coauthor',
      name: 'eCTD Co-Author™',
      icon: <FileText className="h-5 w-5" />,
      description: 'IND & eCTD submission automation with AI co-authoring',
      enabled: true,
    },
    {
      id: 'coauthor',
      name: 'eCTD Co-Author™',
      icon: <FileText className="h-5 w-5" />,
      description: 'AI-assisted co-authoring of CTD submission sections',
      enabled: true,
    },
    {
      id: 'cmc',
      name: 'CMC Wizard™',
      icon: <Beaker className="h-5 w-5" />,
      description: 'Chemistry, Manufacturing, and Controls documentation',
      enabled: true,
    },
    {
      id: 'csr-intelligence',
      name: 'CSR Intelligence™',
      icon: <Brain className="h-5 w-5" />,
      description: 'AI-powered Clinical Study Report analysis',
      enabled: true,
    },
    {
      id: 'study-architect',
      name: 'Study Architect™',
      icon: <BookOpen className="h-5 w-5" />,
      description: 'Protocol development with regulatory intelligence',
      enabled: true,
    },
    {
      id: 'vault',
      name: 'C2C Vault™',
      icon: <Database className="h-5 w-5" />,
      description: 'Secure document storage with intelligent retrieval',
      enabled: true,
    },
    {
      id: 'analytics',
      name: 'Analytics Dashboard',
      icon: <BarChart className="h-5 w-5" />,
      description: 'Metrics and insights on regulatory performance',
      enabled: true,
    },
    {
      id: 'cerv2',
      name: 'Medical Device & Diagnostics RA™',
      icon: <Shield className="h-5 w-5" />,
      description: 'Regulatory automation for medical device submissions',
      enabled: true,
    },
    {
      id: 'foresight-ai',
      name: 'AnA Predictions™ Journey Navigator',
      icon: <Brain className="h-5 w-5" />,
      description: 'Translational Intelligence Engine',
      enabled: true,
    },
  ];

  // Load settings from localStorage or use defaults
  const [modules, setModules] = useState(() => {
    const saved = localStorage.getItem('moduleSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultModules;
      }
    }
    return defaultModules;
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Toggle module enabled state
  const toggleModule = moduleId => {
    setModules(prev =>
      prev.map(mod => (mod.id === moduleId ? { ...mod, enabled: !mod.enabled } : mod))
    );
    setHasChanges(true);
  };

  // Save settings
  const saveSettings = () => {
    localStorage.setItem('moduleSettings', JSON.stringify(modules));

    // Dispatch event to notify other components
    window.dispatchEvent(
      new CustomEvent('moduleSettingsChanged', {
        detail: { modules },
      })
    );

    setHasChanges(false);

    toast({
      title: 'Settings Saved',
      description: 'Module settings have been updated successfully.',
    });
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setModules(defaultModules);
    setHasChanges(true);

    toast({
      title: 'Reset to Defaults',
      description: 'Module settings have been reset.',
    });
  };

  // Count enabled modules
  const enabledCount = modules.filter(m => m.enabled).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <SettingsIcon className="h-5 w-5" />
                <span>Module Settings</span>
              </CardTitle>
              <CardDescription>
                Enable or disable modules based on your needs. Changes will take effect immediately.
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              {enabledCount} of {modules.length} enabled
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {modules.map(module => (
              <div
                key={module.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start space-x-4 flex-1">
                  <div
                    className={`mt-1 ${module.enabled ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {module.icon}
                  </div>
                  <div className="flex-1">
                    <Label
                      htmlFor={module.id}
                      className={`font-medium cursor-pointer ${!module.enabled && 'text-muted-foreground'}`}
                    >
                      {module.name}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                  </div>
                </div>
                <Switch
                  id={module.id}
                  checked={module.enabled}
                  onCheckedChange={() => toggleModule(module.id)}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t">
            <Button variant="outline" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
            <Button onClick={saveSettings} disabled={!hasChanges}>
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModuleSettings;
