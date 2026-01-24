import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, Mail, Save, Check, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailPreferences {
  email: string;
  weeklyDigest: boolean;
  watchlistAlerts: boolean;
  digestFormat: 'html' | 'pdf' | 'both';
  deliveryDay: 'monday' | 'friday';
  deliveryTime: string;
}

interface EmailPreferenceCenterProps {
  userId?: string;
  initialEmail?: string;
}

export default function EmailPreferenceCenter({
  userId = 'admin',
  initialEmail = ''
}: EmailPreferenceCenterProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
  
  const [preferences, setPreferences] = useState<EmailPreferences>({
    email: initialEmail,
    weeklyDigest: true,
    watchlistAlerts: true,
    digestFormat: 'both',
    deliveryDay: 'monday',
    deliveryTime: '09:00'
  });

  // Fetch user's current email preferences
  useEffect(() => {
    // This would be a real API call in production
    // Simulating API response with a delay
    const timer = setTimeout(() => {
      // Mock preferences - in production this would come from your API
      setPreferences({
        email: initialEmail || 'user@example.com',
        weeklyDigest: true,
        watchlistAlerts: true,
        digestFormat: 'both',
        deliveryDay: 'monday',
        deliveryTime: '09:00'
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // This would be a real API call in production
      // For example:
      // await fetch('/api/user/email-preferences', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ userId, ...preferences })
      // });
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Show success state temporarily
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      // toast call replaced
  // Original: toast({
        title: "Preferences saved",
        description: "Your email preferences have been updated successfully.",
      })
  console.log('Toast would show:', {
        title: "Preferences saved",
        description: "Your email preferences have been updated successfully.",
      });
    } catch (error) {
      console.error('Error saving email preferences:', error);
      // toast call replaced
  // Original: toast({
        title: "Error saving preferences",
        description: "There was a problem saving your email preferences. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error saving preferences",
        description: "There was a problem saving your email preferences. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const unsubscribeFromAll = async () => {
    setIsSaving(true);
    
    try {
      // This would be a real API call in production
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPreferences(prev => ({
        ...prev,
        weeklyDigest: false,
        watchlistAlerts: false
      }));
      
      // toast call replaced
  // Original: toast({
        title: "Unsubscribed",
        description: "You've been unsubscribed from all email notifications.",
      })
  console.log('Toast would show:', {
        title: "Unsubscribed",
        description: "You've been unsubscribed from all email notifications.",
      });
    } catch (error) {
      console.error('Error unsubscribing:', error);
      // toast call replaced
  // Original: toast({
        title: "Error unsubscribing",
        description: "There was a problem processing your request. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error unsubscribing",
        description: "There was a problem processing your request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Mail className="mr-2 h-5 w-5" />
          Email Notification Preferences
        </CardTitle>
        <CardDescription>
          Customize how and when you receive email notifications and digests
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={preferences.email}
                    onChange={e => setPreferences(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Your email address"
                    required
                  />
                </div>
                
                <div className="space-y-4 pt-4">
                  <h3 className="text-sm font-medium">Subscriptions</h3>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="weekly-digest">Weekly Digest</Label>
                      <p className="text-xs text-gray-500">
                        Receive a summary of the most important trends and insights
                      </p>
                    </div>
                    <Switch 
                      id="weekly-digest"
                      checked={preferences.weeklyDigest}
                      onCheckedChange={checked => 
                        setPreferences(prev => ({ ...prev, weeklyDigest: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="watchlist-alerts">Watchlist Alerts</Label>
                      <p className="text-xs text-gray-500">
                        Get notified when watched tags show significant changes
                      </p>
                    </div>
                    <Switch 
                      id="watchlist-alerts"
                      checked={preferences.watchlistAlerts}
                      onCheckedChange={checked => 
                        setPreferences(prev => ({ ...prev, watchlistAlerts: checked }))
                      }
                    />
                  </div>
                </div>
                
                {(preferences.weeklyDigest || preferences.watchlistAlerts) && (
                  <div className="space-y-4 pt-2">
                    <h3 className="text-sm font-medium">Delivery Options</h3>
                    
                    <div className="space-y-3">
                      <Label>Digest Format</Label>
                      <RadioGroup 
                        value={preferences.digestFormat} 
                        onValueChange={(value: 'html' | 'pdf' | 'both') => 
                          setPreferences(prev => ({ ...prev, digestFormat: value }))
                        }
                        className="flex flex-col space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="html" id="format-html" />
                          <Label htmlFor="format-html">HTML Email (Inline summary)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="pdf" id="format-pdf" />
                          <Label htmlFor="format-pdf">PDF Attachment</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="both" id="format-both" />
                          <Label htmlFor="format-both">Both HTML and PDF</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    
                    {preferences.weeklyDigest && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="delivery-day">Delivery Day</Label>
                          <Select 
                            value={preferences.deliveryDay}
                            onValueChange={(value: 'monday' | 'friday') => 
                              setPreferences(prev => ({ ...prev, deliveryDay: value }))
                            }
                          >
                            <SelectTrigger id="delivery-day">
                              <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monday">Monday</SelectItem>
                              <SelectItem value="friday">Friday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="delivery-time">Delivery Time</Label>
                          <Select 
                            value={preferences.deliveryTime}
                            onValueChange={value => 
                              setPreferences(prev => ({ ...prev, deliveryTime: value }))
                            }
                          >
                            <SelectTrigger id="delivery-time">
                              <SelectValue placeholder="Select time" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="08:00">8:00 AM</SelectItem>
                              <SelectItem value="09:00">9:00 AM</SelectItem>
                              <SelectItem value="12:00">12:00 PM</SelectItem>
                              <SelectItem value="16:00">4:00 PM</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={unsubscribeFromAll}
                  disabled={isSaving || (!preferences.weeklyDigest && !preferences.watchlistAlerts)}
                >
                  Unsubscribe from all
                </Button>
                
                <Button 
                  type="submit"
                  disabled={isSaving}
                  className="relative"
                >
                  {saved ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Saved
                    </>
                  ) : isSaving ? (
                    <>
                      <span className="animate-spin inline-block h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="preview">
            <div className="space-y-4">
              <div className="border p-4 rounded-md bg-gray-50">
                <h3 className="text-sm font-medium mb-2">Email Preview</h3>
                
                {preferences.weeklyDigest ? (
                  <div className="space-y-3">
                    <div className="bg-white p-3 border rounded-md">
                      <div className="text-sm font-medium">
                        Subject: TrialSage Weekly Digest - {new Date().toLocaleDateString()}
                      </div>
                      <div className="border-t mt-2 pt-2 text-sm">
                        <p>Hello,</p>
                        <p className="mt-2">Here's your weekly summary of agent activity and trends:</p>
                        
                        <div className="mt-3 bg-blue-50 p-2 rounded">
                          <p className="font-medium text-blue-800">Top Tags This Week</p>
                          <ul className="list-disc list-inside text-xs mt-1">
                            <li>PFS: 42 mentions (⬆️ 28%)</li>
                            <li>PHASE 3: 38 mentions (⬇️ 5%)</li>
                            <li>ONCOLOGY: 35 mentions (⬆️ 12%)</li>
                          </ul>
                        </div>
                        
                        <div className="mt-3 bg-amber-50 p-2 rounded">
                          <p className="font-medium text-amber-800">Watchlist Alerts</p>
                          <ul className="list-disc list-inside text-xs mt-1">
                            <li>RECIST: 125% increase</li>
                            <li>ORR: 114% increase</li>
                          </ul>
                        </div>
                        
                        <p className="mt-3">
                          View the full report in your dashboard or check the attached PDF.
                        </p>
                        
                        <p className="mt-3 text-xs text-gray-500">
                          Delivered {preferences.deliveryDay === 'monday' ? 'Mondays' : 'Fridays'} at {preferences.deliveryTime}
                        </p>
                      </div>
                    </div>
                    
                    {preferences.digestFormat !== 'html' && (
                      <div className="flex items-center text-sm text-gray-600">
                        <div className="bg-gray-200 p-2 rounded mr-2">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7 18H17V16H7V18Z" fill="currentColor"/>
                            <path d="M17 14H7V12H17V14Z" fill="currentColor"/>
                            <path d="M7 10H11V8H7V10Z" fill="currentColor"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M6 2C4.34315 2 3 3.34315 3 5V19C3 20.6569 4.34315 22 6 22H18C19.6569 22 21 20.6569 21 19V9C21 5.13401 17.866 2 14 2H6ZM6 4H13V9H19V19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V5C5 4.44772 5.44772 4 6 4ZM15 4.10002C16.6113 4.4271 17.9413 5.52906 18.584 7H15V4.10002Z" fill="currentColor"/>
                          </svg>
                        </div>
                        <span>Weekly-Digest-{new Date().toISOString().slice(0, 10)}.pdf</span>
                      </div>
                    )}
                  </div>
                ) : preferences.watchlistAlerts ? (
                  <div className="bg-white p-3 border rounded-md">
                    <div className="text-sm font-medium">
                      Subject: ⚠️ TrialSage Alert - Significant increase in watched tags
                    </div>
                    <div className="border-t mt-2 pt-2 text-sm">
                      <p>Hello,</p>
                      <p className="mt-2">We've detected significant changes in tags you're watching:</p>
                      
                      <div className="mt-3 bg-amber-50 p-2 rounded">
                        <div className="flex items-center">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mr-1" />
                          <p className="font-medium text-amber-800">RECIST: 125% increase</p>
                        </div>
                        <p className="text-xs mt-1">
                          Mentions increased from 8 to 18 in the past week
                        </p>
                      </div>
                      
                      <p className="mt-3">
                        Check your dashboard for more details and insights.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 text-gray-500">
                    <p>You are currently unsubscribed from all email notifications.</p>
                    <p className="text-sm mt-2">
                      Enable Weekly Digest or Watchlist Alerts to see a preview.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="text-sm text-gray-600 flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                {preferences.weeklyDigest ? (
                  <span>
                    Next digest will be delivered on {preferences.deliveryDay === 'monday' ? 'Monday' : 'Friday'} at {preferences.deliveryTime}
                  </span>
                ) : preferences.watchlistAlerts ? (
                  <span>
                    Alerts will be sent when significant changes are detected in your watched tags
                  </span>
                ) : (
                  <span>No scheduled emails</span>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}