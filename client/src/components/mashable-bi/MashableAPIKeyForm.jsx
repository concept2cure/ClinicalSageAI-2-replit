/**
 * MashableBI API Key Form
 *
 * This component provides an interface for users to enter the MashableBI API key
 * when it's missing from the configuration.
 */

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
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
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { Lock, KeySquare, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function MashableAPIKeyForm({ onKeyConfigured }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('Please enter a valid API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send the API key to the server to be saved
      const response = await apiRequest('POST', '/api/mashable-bi/configure', {
        apiKey: apiKey.trim(),
      });

      if (!response.ok) {
        throw new Error('Failed to configure MashableBI API key');
      }

      // Show success message
      toast({
        title: 'API Key Configured',
        description: 'MashableBI Analytics is now ready to use',
        variant: 'default',
      });

      // Notify parent component
      if (onKeyConfigured) {
        onKeyConfigured();
      }
    } catch (err) {
      console.error('Error configuring MashableBI API key:', err);
      setError(err.message || 'Failed to configure API key');

      toast({
        title: 'Configuration Failed',
        description: 'Unable to configure MashableBI API key. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <KeySquare className="mr-2 h-5 w-5" />
          MashableBI Configuration
        </CardTitle>
        <CardDescription>
          Enter your MashableBI API key to enable analytics integration
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">MashableBI API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your MashableBI API key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                This key will be securely stored and used to authorize API calls to MashableBI
                Analytics.
              </p>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} disabled={loading || !apiKey.trim()} className="w-full">
          {loading ? 'Configuring...' : 'Configure MashableBI'}
        </Button>
      </CardFooter>
    </Card>
  );
}
