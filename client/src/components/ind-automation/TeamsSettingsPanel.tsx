import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle, AlertCircle, Loader2, InfoIcon, RefreshCw, ArrowRightCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import api from '../../services/api';

/**
 * TeamsSettingsPanel Component
 *
 * This component allows customers to configure their Microsoft Teams webhook URL
 * for receiving compliance and credential alerts.
 *
 * @param props Component properties
 * @param props.projectId The current project/organization ID
 */
export function TeamsSettingsPanel({ projectId }: { projectId: string }) {
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load existing webhook configuration when project changes
  useEffect(() => {
    if (!projectId) return;

    const fetchWebhookConfig = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/api/ind/${projectId}/teams-webhook`);
        if (response.data && response.data.webhook_url) {
          setWebhookUrl(response.data.webhook_url);
        }
      } catch (error) {
        console.error('Error fetching Teams webhook configuration:', error);
        // It's OK if there's no webhook configured yet - this will be a new setup
      } finally {
        setIsLoading(false);
      }
    };

    fetchWebhookConfig();
  }, [projectId]);

  const validateWebhookUrl = (url: string): boolean => {
    // Basic validation for webhook URL format
    if (!url?.trim()) return false;

    try {
      const webhookUrl = new URL(url);
      return (
        webhookUrl.protocol === 'https:' &&
        (webhookUrl.hostname.includes('webhook.office.com') ||
          webhookUrl.hostname.includes('office365.com'))
      );
    } catch (e) {
      return false;
    }
  };

  const handleSave = async () => {
    if (!projectId) {
      setStatusMessage({
        type: 'error',
        message: 'No project selected. Please select a project first.',
      });
      return;
    }

    if (!validateWebhookUrl(webhookUrl)) {
      setStatusMessage({
        type: 'error',
        message:
          'Please enter a valid Microsoft Teams webhook URL. It should start with https:// and contain webhook.office.com or office365.com',
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage({ type: null, message: '' });

    try {
      // First save the webhook URL
      const saveResponse = await api.post(`/api/ind/${projectId}/teams-webhook`, {
        webhook_url: webhookUrl,
      });

      if (!saveResponse.data || saveResponse.data.status === 'error') {
        throw new Error(saveResponse.data?.message || 'Failed to save webhook URL');
      }

      // Then send a test notification
      let testSuccess = false;
      try {
        const testResponse = await api.post(`/api/ind/${projectId}/teams-webhook/test`);
        testSuccess = testResponse.data && testResponse.data.status === 'success';
      } catch (testError) {
        console.error('Error testing Teams webhook:', testError);
        // We'll still show success for saving, even if the test fails
      }

      setStatusMessage({
        type: 'success',
        message: testSuccess
          ? 'Teams webhook URL saved and tested successfully! A test notification has been sent to your Teams channel.'
          : 'Teams webhook URL saved successfully, but the test notification could not be sent. Please verify your webhook URL is correct.',
      });
    } catch (error: any) {
      console.error('Error saving Teams webhook:', error);

      // Extract error message if available
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Failed to save Teams webhook URL. Please try again.';

      setStatusMessage({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!projectId || !webhookUrl || isSaving) return;

    if (!validateWebhookUrl(webhookUrl)) {
      setStatusMessage({
        type: 'error',
        message: 'Please enter a valid Microsoft Teams webhook URL before testing.',
      });
      return;
    }

    setStatusMessage({ type: null, message: '' });
    setIsSaving(true);

    try {
      const response = await api.post(`/api/ind/${projectId}/teams-webhook/test`);

      if (response.data && response.data.status === 'success') {
        setStatusMessage({
          type: 'success',
          message: 'Test successful! A notification has been sent to your Teams channel.',
        });
      } else {
        throw new Error(response.data?.message || 'Test message could not be delivered');
      }
    } catch (error: any) {
      console.error('Error testing Teams webhook:', error);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Failed to send test notification. Please verify your webhook URL.';

      setStatusMessage({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!projectId) {
      setStatusMessage({
        type: 'error',
        message: 'No project selected. Please select a project first.',
      });
      return;
    }

    if (!webhookUrl.trim()) {
      // Nothing to clear
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.delete(`/api/ind/${projectId}/teams-webhook`);

      if (!response.data || response.data.status === 'error') {
        throw new Error(response.data?.message || 'Failed to remove webhook URL');
      }

      setWebhookUrl('');
      setStatusMessage({
        type: 'info',
        message: 'Teams webhook URL has been removed. You will no longer receive Teams alerts.',
      });
    } catch (error: any) {
      console.error('Error removing Teams webhook:', error);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Failed to remove Teams webhook URL. Please try again.';

      setStatusMessage({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <ArrowRightCircle className="h-5 w-5 mr-2 text-primary" />
          Microsoft Teams Alerts
        </CardTitle>
        <CardDescription>
          Configure Microsoft Teams webhook to receive real-time alerts about credential
          expirations, security events and compliance rule violations.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {statusMessage.type && (
              <Alert variant={statusMessage.type === 'error' ? 'destructive' : 'default'}>
                {statusMessage.type === 'success' && <CheckCircle className="h-4 w-4" />}
                {statusMessage.type === 'error' && <AlertCircle className="h-4 w-4" />}
                <AlertTitle>
                  {statusMessage.type === 'success' && 'Success'}
                  {statusMessage.type === 'error' && 'Error'}
                  {statusMessage.type === 'info' && 'Information'}
                </AlertTitle>
                <AlertDescription>{statusMessage.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="teams-webhook" className="flex items-center">
                <span>Teams Webhook URL</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <InfoIcon className="h-4 w-4 ml-1 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>
                        Microsoft Teams webhooks allow TrialSage to send real-time alerts directly
                        to your Teams channels.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                id="teams-webhook"
                placeholder="https://company.webhook.office.com/webhookb2/..."
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                disabled={isSaving}
                className={
                  webhookUrl && !validateWebhookUrl(webhookUrl) ? 'border-destructive' : ''
                }
              />
              <div className="bg-muted p-3 rounded-md border text-sm mt-2">
                <h5 className="font-semibold mb-1 flex items-center">
                  <ArrowRightCircle className="h-4 w-4 mr-1" />
                  How to create a Teams webhook:
                </h5>
                <ol className="list-decimal ml-4 space-y-1 text-muted-foreground">
                  <li>
                    Open Microsoft Teams and navigate to the channel where you want to receive
                    alerts
                  </li>
                  <li>Click the "..." menu next to the channel name, then select "Connectors"</li>
                  <li>Search for "Incoming Webhook" and click "Configure"</li>
                  <li>Enter a name like "TrialSage Alerts" and upload an icon if desired</li>
                  <li>Click "Create" to generate your webhook URL</li>
                  <li>Copy the webhook URL and paste it here</li>
                </ol>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleSave}
                        disabled={isSaving || !webhookUrl.trim() || !validateWebhookUrl(webhookUrl)}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Save Webhook
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Save webhook URL and send a test notification</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {webhookUrl && validateWebhookUrl(webhookUrl) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          onClick={handleTest}
                          disabled={isSaving || !validateWebhookUrl(webhookUrl)}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Test Connection
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send a test message to verify your webhook</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {webhookUrl && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" onClick={handleClear} disabled={isSaving}>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          Remove Webhook
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Remove webhook URL and disable Teams notifications</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {webhookUrl && !validateWebhookUrl(webhookUrl) && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Invalid webhook URL</AlertTitle>
                  <AlertDescription>
                    Please enter a valid Microsoft Teams webhook URL. It should start with https://
                    and contain webhook.office.com or office365.com
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-start border-t pt-4">
        <h4 className="text-sm font-semibold mb-2">Alert Types You'll Receive:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Credential Alerts</h5>
            <ul className="text-sm space-y-1 list-disc pl-4">
              <li>ESG key expiration (keys older than 12 months)</li>
              <li>SAML certificate expiration (less than 30 days)</li>
              <li>IdP metadata changes detected</li>
              <li>ESG authentication failures</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Compliance Alerts</h5>
            <ul className="text-sm space-y-1 list-disc pl-4">
              <li>Missing forms in FDA submissions</li>
              <li>Missing acknowledgments from FDA</li>
              <li>Serial number duplication issues</li>
              <li>Metadata validation failures</li>
            </ul>
          </div>
        </div>

        <div className="w-full mt-4 pt-3 border-t">
          <div className="flex items-center text-sm text-muted-foreground">
            <InfoIcon className="h-4 w-4 mr-2" />
            <p>
              All alerts can be customized in the <strong>Compliance Rules</strong> tab with
              tenant-specific thresholds.
            </p>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

export default TeamsSettingsPanel;
