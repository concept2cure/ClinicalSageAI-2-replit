import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Mail,
  MessageSquare,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import api from '../../services/api';

type Preferences = {
  email: boolean;
  teams: boolean;
  warning_alerts: boolean;
  error_alerts: boolean;
};

export default function AlertPreferencesPanel() {
  const [preferences, setPreferences] = useState<Preferences>({
    email: true,
    teams: false,
    warning_alerts: true,
    error_alerts: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [alertStatus, setAlertStatus] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/ind-automation/alert-preferences');
      setPreferences(response.data);
    } catch (error) {
      console.error('Failed to fetch alert preferences:', error);
      setAlertStatus({
        type: 'error',
        message: 'Failed to load your alert preferences. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleChange = (setting: keyof Preferences) => {
    setPreferences(prev => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    setAlertStatus({ type: 'info', message: 'Saving your preferences...' });

    try {
      const response = await api.post('/api/ind-automation/alert-preferences', preferences);

      if (response.data.status === 'success') {
        setAlertStatus({
          type: 'success',
          message: 'Your alert preferences have been saved successfully.',
        });
      } else {
        throw new Error(response.data.message || 'Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      setAlertStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    setAlertStatus({ type: 'info', message: 'Sending test alert...' });

    try {
      const response = await api.post('/api/ind-automation/alert-test');

      if (response.data.status === 'success') {
        setAlertStatus({
          type: 'success',
          message: 'Test alert sent successfully. Check your configured channels.',
        });
      } else {
        throw new Error(response.data.message || 'Failed to send test alert');
      }
    } catch (error) {
      console.error('Error sending test alert:', error);
      setAlertStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h3 className="text-lg font-medium">Alert Channel Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Configure how you'd like to receive system alerts and notifications.
        </p>
      </div>

      {alertStatus.type && (
        <Alert variant={alertStatus.type === 'error' ? 'destructive' : 'default'}>
          {alertStatus.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
          {alertStatus.type === 'error' && <AlertCircle className="h-4 w-4" />}
          {alertStatus.type === 'info' && <Info className="h-4 w-4" />}
          <AlertTitle>
            {alertStatus.type === 'success' && 'Success'}
            {alertStatus.type === 'error' && 'Error'}
            {alertStatus.type === 'info' && 'Information'}
          </AlertTitle>
          <AlertDescription>{alertStatus.message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="p-6">
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-md font-medium mb-2">Notification Channels</h4>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <Label htmlFor="email-toggle" className="font-normal">
                    Email Notifications
                  </Label>
                </div>
                <Switch
                  id="email-toggle"
                  checked={preferences.email}
                  onCheckedChange={() => handleToggleChange('email')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <Label htmlFor="teams-toggle" className="font-normal">
                    Microsoft Teams Notifications
                  </Label>
                </div>
                <Switch
                  id="teams-toggle"
                  checked={preferences.teams}
                  onCheckedChange={() => handleToggleChange('teams')}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-md font-medium mb-2">Alert Types</h4>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <Label htmlFor="warnings-toggle" className="font-normal">
                    Warning Alerts
                  </Label>
                </div>
                <Switch
                  id="warnings-toggle"
                  checked={preferences.warning_alerts}
                  onCheckedChange={() => handleToggleChange('warning_alerts')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <Label htmlFor="errors-toggle" className="font-normal">
                    Error Alerts
                  </Label>
                </div>
                <Switch
                  id="errors-toggle"
                  checked={preferences.error_alerts}
                  onCheckedChange={() => handleToggleChange('error_alerts')}
                />
              </div>
            </div>

            <div className="flex flex-col space-y-2 pt-4">
              <p className="text-sm text-muted-foreground">
                These settings control alert notifications for Traefik health monitoring, SSL
                certificate expiration, and other system health events. You will always receive
                critical system alerts regardless of these settings.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={handleTestAlert}
                disabled={isTesting || (!preferences.email && !preferences.teams)}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Test...
                  </>
                ) : (
                  'Send Test Alert'
                )}
              </Button>

              <Button onClick={handleSavePreferences} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Preferences'
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
