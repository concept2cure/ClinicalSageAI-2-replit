import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const SAMLSettingsPanel: React.FC = () => {
  const { id: tenantId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settings, setSettings] = useState({
    idp_entity_id: '',
    idp_sso_url: '',
    idp_x509_cert: '',
    sp_entity_id: '',
    sp_acs_url: '',
  });

  // Check if user has admin permissions
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    // Check permissions - in a real app, this would come from your auth context
    const checkPermissions = async () => {
      try {
        const response = await fetch('/api/ind-automation/auth/check-permissions');
        const data = await response.json();
        setIsAdmin(data.permissions?.includes('saml.write') || false);
      } catch (error: any) {
        console.error("Error checking permissions:", error.message);
        setIsAdmin(false);
      }
    };
    
    checkPermissions();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    
    const loadSettings = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/ind-automation/saml/settings/${tenantId}`);
        if (!response.ok) {
          throw new Error(`Failed to load SAML settings: ${response.statusText}`);
        }
        const data = await response.json();
        setSettings(data);
      } catch (error: any) {
        setLoadError(error.message || 'Failed to load SAML settings');
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [tenantId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
    // Clear success/error states when form is modified
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    
    setLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    
    try {
      const response = await fetch(`/api/ind-automation/saml/settings/${tenantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save SAML settings: ${response.statusText}`);
      }
      
      setSaveSuccess(true);
      // toast call replaced
  // Original: toast({
        title: "SAML Settings Saved",
        description: "Your SAML configuration has been saved successfully.",
      })
  console.log('Toast would show:', {
        title: "SAML Settings Saved",
        description: "Your SAML configuration has been saved successfully.",
      });
    } catch (error: any) {
      setSaveError(error.message || 'Failed to save SAML settings');
      // toast call replaced
  // Original: toast({
        title: "Failed to Save Settings",
        description: error.message || 'An error occurred while saving SAML settings',
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Failed to Save Settings",
        description: error.message || 'An error occurred while saving SAML settings',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SAML Settings</CardTitle>
          <CardDescription>
            Configure SAML SSO integration for enterprise authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don't have permission to access SAML settings. Please contact your administrator.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SAML Settings</CardTitle>
        <CardDescription>
          Configure SAML SSO integration for enterprise authentication
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        
        {saveError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Saving Settings</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        
        {saveSuccess && (
          <Alert variant="default" className="mb-4 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-700">Settings Saved</AlertTitle>
            <AlertDescription className="text-green-600">
              Your SAML configuration has been saved successfully.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="idp" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="idp">Identity Provider</TabsTrigger>
              <TabsTrigger value="sp">Service Provider</TabsTrigger>
            </TabsList>
            
            <TabsContent value="idp" className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="idp_entity_id" className="text-sm font-medium">
                  IdP Entity ID
                </label>
                <Input
                  id="idp_entity_id"
                  name="idp_entity_id"
                  value={settings.idp_entity_id}
                  onChange={handleChange}
                  placeholder="e.g., https://idp.example.com/saml/metadata"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="idp_sso_url" className="text-sm font-medium">
                  IdP SSO URL
                </label>
                <Input
                  id="idp_sso_url"
                  name="idp_sso_url"
                  value={settings.idp_sso_url}
                  onChange={handleChange}
                  placeholder="e.g., https://idp.example.com/saml/sso"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="idp_x509_cert" className="text-sm font-medium">
                  IdP X.509 Certificate
                </label>
                <Textarea
                  id="idp_x509_cert"
                  name="idp_x509_cert"
                  value={settings.idp_x509_cert}
                  onChange={handleChange}
                  placeholder="Paste IdP X.509 Certificate (PEM format)"
                  className="font-mono text-xs"
                  rows={8}
                  required
                />
              </div>
            </TabsContent>
            
            <TabsContent value="sp" className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="sp_entity_id" className="text-sm font-medium">
                  SP Entity ID
                </label>
                <Input
                  id="sp_entity_id"
                  name="sp_entity_id"
                  value={settings.sp_entity_id}
                  onChange={handleChange}
                  placeholder="e.g., https://lumentrial.ai/saml/metadata"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="sp_acs_url" className="text-sm font-medium">
                  SP Assertion Consumer Service URL
                </label>
                <Input
                  id="sp_acs_url"
                  name="sp_acs_url"
                  value={settings.sp_acs_url}
                  onChange={handleChange}
                  placeholder="e.g., https://lumentrial.ai/api/saml/acs"
                  required
                />
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="mt-6">
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : "Save SAML Settings"}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        These settings enable Enterprise SAML SSO authentication for your tenant.
      </CardFooter>
    </Card>
  );
};

export default SAMLSettingsPanel;