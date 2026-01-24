import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from '@/hooks/use-auth';

interface DigestPreferences {
  include_exports: boolean;
  include_risk_changes: boolean;
  include_version_changes: boolean;
  include_sap: boolean;
  risk_change_threshold: number;
}

export default function DigestPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<DigestPreferences>({
    include_exports: true,
    include_risk_changes: true,
    include_version_changes: true,
    include_sap: false,
    risk_change_threshold: 10
  });
  
  // Fetch user preferences when component loads
  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) return;
      
      try {
        const response = await apiRequest('GET', `/api/user/preferences?user_id=${user.id}`);
        const data = await response.json();
        
        if (data && data.prefs) {
          setPreferences(data.prefs);
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
        // toast call replaced
  // Original: toast({
          title: "Failed to load preferences",
          description: "Your digest preferences could not be loaded. Default settings will be used.",
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "Failed to load preferences",
          description: "Your digest preferences could not be loaded. Default settings will be used.",
          variant: "destructive",
        });
      }
    };
    
    fetchPreferences();
  }, [user, toast]);
  
  const handleSavePreferences = async () => {
    if (!user) return;
    
    setSaving(true);
    
    try {
      const response = await apiRequest('POST', '/api/user/save-digest-prefs', {
        user_id: user.id,
        prefs: preferences
      });
      
      if (response.ok) {
        // toast call replaced
  // Original: toast({
          title: "Preferences saved",
          description: "Your digest preferences have been updated successfully.",
        })
  console.log('Toast would show:', {
          title: "Preferences saved",
          description: "Your digest preferences have been updated successfully.",
        });
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      // toast call replaced
  // Original: toast({
        title: "Failed to save preferences",
        description: "Your digest preferences could not be saved. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Failed to save preferences",
        description: "Your digest preferences could not be saved. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  const sendTestDigest = async () => {
    if (!user) return;
    
    setSaving(true);
    
    try {
      const response = await apiRequest('POST', '/api/notify/send-weekly-digest', {
        user_id: user.id,
        user_email: user.email || 'test@example.com' // Fallback for testing
      });
      
      if (response.ok) {
        // toast call replaced
  // Original: toast({
          title: "Test digest sent",
          description: "A test weekly digest has been generated and sent.",
        })
  console.log('Toast would show:', {
          title: "Test digest sent",
          description: "A test weekly digest has been generated and sent.",
        });
      } else {
        throw new Error('Failed to send test digest');
      }
    } catch (error) {
      console.error('Error sending test digest:', error);
      // toast call replaced
  // Original: toast({
        title: "Failed to send test digest",
        description: "The test digest could not be sent. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Failed to send test digest",
        description: "The test digest could not be sent. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Weekly Digest Preferences</CardTitle>
        <CardDescription>
          Customize what information is included in your weekly digest emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Content Preferences</h3>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="include_exports" 
              checked={preferences.include_exports} 
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, include_exports: !!checked }))}
            />
            <label htmlFor="include_exports" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Include PDF Exports
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="include_risk_changes" 
              checked={preferences.include_risk_changes} 
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, include_risk_changes: !!checked }))}
            />
            <label htmlFor="include_risk_changes" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Include Risk Assessment Changes
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="include_version_changes" 
              checked={preferences.include_version_changes} 
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, include_version_changes: !!checked }))}
            />
            <label htmlFor="include_version_changes" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Include Protocol Version Changes
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="include_sap" 
              checked={preferences.include_sap} 
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, include_sap: !!checked }))}
            />
            <label htmlFor="include_sap" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Include Statistical Analysis Plan Updates
            </label>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Risk Change Threshold (%)</h3>
            <span className="text-sm font-medium">{preferences.risk_change_threshold}%</span>
          </div>
          <Slider 
            value={[preferences.risk_change_threshold]} 
            min={1} 
            max={20} 
            step={1}
            onValueChange={(value) => setPreferences(prev => ({ ...prev, risk_change_threshold: value[0] }))}
          />
          <p className="text-sm text-muted-foreground">
            Only notify about risk assessment changes that exceed this threshold
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={sendTestDigest}
          disabled={saving}
        >
          Send Test Digest
        </Button>
        <Button 
          onClick={handleSavePreferences}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </CardFooter>
    </Card>
  );
}