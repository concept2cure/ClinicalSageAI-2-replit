import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Ban,
  CheckCircle2,
  Loader2,
  FileDown,
  Database,
  FileEdit,
  FileText,
  ShieldCheck,
  Bell,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ManualDataForm from './ManualDataForm';
import FDAFormsPanel from './FDAFormsPanel';
import SAMLSettingsPanel from './SAMLSettingsPanel';
import AlertPreferencesPanel from './AlertPreferencesPanel';

/**
 * INDAutomationPanel Component
 *
 * This component provides an interface for interacting with the IND Automation API
 * to generate Module 3 (Chemistry, Manufacturing, and Controls) documents
 */
export function INDAutomationPanel() {
  const [projectId, setProjectId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Load projects when component mounts
  useEffect(() => {
    fetchProjects();
  }, []);

  // Function to fetch available projects
  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch('/api/ind-automation/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        console.error('Failed to fetch projects');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Function to check if the IND service is available
  const checkServiceStatus = async () => {
    try {
      const response = await fetch('/api/ind-automation/status');
      const data = await response.json();

      if (response.ok) {
        setStatusMessage({
          type: 'success',
          message: 'IND Automation service is connected and ready',
        });

        // Refresh projects list when service is available
        fetchProjects();
      } else {
        setStatusMessage({
          type: 'error',
          message: 'IND Automation service is not available',
        });
      }
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message: 'Failed to connect to the IND Automation service',
      });
    }
  };

  // Function to generate Module 3 document
  const generateModule3 = async () => {
    if (!projectId.trim()) {
      setStatusMessage({
        type: 'error',
        message: 'Please enter or select a Project ID',
      });
      return;
    }

    setIsGenerating(true);
    setDocumentUrl(null);
    setStatusMessage({
      type: 'info',
      message: 'Generating Module 3 document...',
    });

    try {
      // Using window.open to trigger file download
      const downloadUrl = `/api/ind-automation/${projectId}/module3`;
      window.open(downloadUrl, '_blank');

      setDocumentUrl(downloadUrl);
      setStatusMessage({
        type: 'success',
        message: 'Module 3 document generated successfully!',
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message:
          'Failed to generate Module 3 document: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>IND Automation System</CardTitle>
        <CardDescription>
          Generate FDA Investigational New Drug (IND) application documents
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {statusMessage.type && (
            <Alert variant={statusMessage.type === 'error' ? 'destructive' : 'default'}>
              {statusMessage.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {statusMessage.type === 'error' && <Ban className="h-4 w-4" />}
              {statusMessage.type === 'info' && <Loader2 className="h-4 w-4 animate-spin" />}
              <AlertTitle>
                {statusMessage.type === 'success' && 'Success'}
                {statusMessage.type === 'error' && 'Error'}
                {statusMessage.type === 'info' && 'Processing'}
              </AlertTitle>
              <AlertDescription>{statusMessage.message}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="benchling" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="benchling">
                <Database className="h-4 w-4 mr-2" />
                From Benchling
              </TabsTrigger>
              <TabsTrigger value="manual">
                <FileEdit className="h-4 w-4 mr-2" />
                Manual CMC Data
              </TabsTrigger>
              <TabsTrigger value="fda-forms">
                <FileText className="h-4 w-4 mr-2" />
                FDA Forms
              </TabsTrigger>
              <TabsTrigger value="saml-settings">
                <ShieldCheck className="h-4 w-4 mr-2" />
                SAML Settings
              </TabsTrigger>
              <TabsTrigger value="alert-preferences">
                <Bell className="h-4 w-4 mr-2" />
                Alert Preferences
              </TabsTrigger>
            </TabsList>

            <TabsContent value="benchling" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="project-id">Project ID</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {projects.length > 0 ? (
                      <select
                        id="project-id"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        disabled={isGenerating}
                      >
                        <option value="">Select a project</option>
                        {projects.map(project => (
                          <option key={project.id} value={project.id}>
                            {project.name} ({project.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id="project-id"
                        placeholder={
                          isLoadingProjects ? 'Loading projects...' : 'Enter project identifier'
                        }
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        disabled={isGenerating || isLoadingProjects}
                      />
                    )}
                  </div>
                  <Button variant="outline" onClick={fetchProjects} disabled={isLoadingProjects}>
                    {isLoadingProjects ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-medium">
                  Module 3: Chemistry, Manufacturing, and Controls
                </h3>
                <p className="text-sm text-muted-foreground">
                  Generate a Module 3 document containing CMC information from Benchling for your
                  IND application.
                </p>

                <div className="flex gap-2 mt-4">
                  <Button onClick={generateModule3} disabled={isGenerating || !projectId.trim()}>
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>Generate Module 3</>
                    )}
                  </Button>

                  {documentUrl && (
                    <Button variant="outline" onClick={() => window.open(documentUrl, '_blank')}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Download Again
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <ManualDataForm />
            </TabsContent>

            <TabsContent value="fda-forms">
              <FDAFormsPanel />
            </TabsContent>

            <TabsContent value="saml-settings">
              <SAMLSettingsPanel />
            </TabsContent>

            <TabsContent value="alert-preferences">
              <AlertPreferencesPanel />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={checkServiceStatus} disabled={isGenerating}>
          Check Service Status
        </Button>
      </CardFooter>
    </Card>
  );
}

export default INDAutomationPanel;
