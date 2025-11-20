import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Bell, Lock, User, Globe, Eye, Database, Shield, Mail, Bot, RefreshCw, Key, Copy } from "lucide-react";
import { useResearchCompanion } from "@/hooks/use-research-companion";

// Research Companion Settings Component
function ResearchCompanionSettings() {
  const { apiKey, setApiKey, clearApiKey, isEnabled } = useResearchCompanion();
  const [inputApiKey, setInputApiKey] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const { toast } = useToast();
  
  const handleSaveApiKey = () => {
    if (inputApiKey.trim()) {
      setApiKey(inputApiKey.trim());
      setInputApiKey("");
    }
  };
  
  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      // toast call replaced
  // Original: toast({
        title: "Copied to clipboard",
        description: "API key copied to clipboard",
      })
  console.log('Toast would show:', {
        title: "Copied to clipboard",
        description: "API key copied to clipboard",
      });
    }
  };
  
  const displayApiKey = isRevealed && apiKey ? apiKey : apiKey ? "•".repeat(Math.min(apiKey.length, 30)) : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="enableCompanion">Enable Research Companion</Label>
          <p className="text-sm text-muted-foreground">
            Get contextual AI assistance with clinical research tasks
          </p>
        </div>
        <Switch 
          id="enableCompanion" 
          checked={isEnabled}
          disabled={!apiKey}
        />
      </div>
      
      <div className="pt-2 space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
          {apiKey && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 text-xs"
              onClick={clearApiKey}
            >
              Reset
            </Button>
          )}
        </div>
        
        {apiKey ? (
          <div>
            <div className="flex gap-2">
              <Input 
                id="openaiApiKey" 
                value={displayApiKey}
                readOnly
                className="font-mono bg-muted"
              />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsRevealed(!isRevealed)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              API key is stored securely in your browser's local storage.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <Input 
                id="openaiApiKey" 
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="sk-..." 
                className="font-mono"
              />
              <Button onClick={handleSaveApiKey} disabled={!inputApiKey.trim()}>
                Save
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Enter your OpenAI API key to enable the Research Companion.
            </p>
          </div>
        )}
      </div>
      
      <div className="rounded-md bg-sky-50 border border-sky-200 p-3 dark:bg-sky-900/20 dark:border-sky-900">
        <div className="flex gap-2">
          <Bot className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-sky-800 dark:text-sky-300">
              About Research Companion
            </h3>
            <p className="text-xs text-sky-700 dark:text-sky-400 mt-1">
              The Research Companion uses OpenAI's API to provide context-aware assistance with clinical
              research tasks. It can help you understand CSRs, design protocols, and navigate regulatory requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  
  // Example form state
  const [formState, setFormState] = useState({
    email: user?.email || "",
    name: user?.name || "",
    company: user?.company || "",
    emailNotifications: true,
    dataSharing: false,
    twoFactorAuth: false,
    apiAccess: false,
    theme: "light",
    language: "en"
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleToggleChange = (name: string, checked: boolean) => {
    setFormState(prev => ({ ...prev, [name]: checked }));
  };

  const handleThemeChange = (theme: string) => {
    setFormState(prev => ({ ...prev, theme }));
  };

  const handleLanguageChange = (language: string) => {
    setFormState(prev => ({ ...prev, language }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // toast call replaced
  // Original: toast({
        title: "Settings updated",
        description: "Your settings have been successfully updated.",
      })
  console.log('Toast would show:', {
        title: "Settings updated",
        description: "Your settings have been successfully updated.",
      });
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Account</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>API</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and company details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      name="email" 
                      type="email" 
                      value={formState.email} 
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      name="name" 
                      value={formState.name} 
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company / Organization</Label>
                  <Input 
                    id="company" 
                    name="company" 
                    value={formState.company} 
                    onChange={handleInputChange}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription Plan</CardTitle>
                <CardDescription>
                  Your current subscription and billing information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Current Plan</p>
                    <p className="text-sm text-muted-foreground">Enterprise Plan</p>
                  </div>
                  <Badge className="bg-primary">Active</Badge>
                </div>
                <div>
                  <p className="font-medium">Features</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Unlimited CSR uploads</li>
                    <li>Advanced analytics and insights</li>
                    <li>Custom protocol optimization</li>
                    <li>AI-powered trial design assistance</li>
                    <li>Predictive analysis tools</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline" onClick={() => setActiveTab("billing")}>
                  Manage Subscription
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Manage your email notification preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailNotifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications about your account and reports.
                    </p>
                  </div>
                  <Switch 
                    id="emailNotifications" 
                    checked={formState.emailNotifications} 
                    onCheckedChange={(checked) => handleToggleChange("emailNotifications", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="productUpdates">Product Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications about new features and improvements.
                    </p>
                  </div>
                  <Switch 
                    id="productUpdates" 
                    checked={true} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="reportCompletions">Report Completions</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications when your reports are ready.
                    </p>
                  </div>
                  <Switch 
                    id="reportCompletions" 
                    checked={true} 
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your security preferences and account protection.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="twoFactorAuth">Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Add an extra layer of security to your account.
                    </p>
                  </div>
                  <Switch 
                    id="twoFactorAuth" 
                    checked={formState.twoFactorAuth} 
                    onCheckedChange={(checked) => handleToggleChange("twoFactorAuth", checked)}
                  />
                </div>
                <div className="pt-4">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <Lock className="mr-2 h-4 w-4" />
                    Change Password
                  </Button>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="dataSharing">Data Sharing</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow sharing anonymized data for service improvement.
                    </p>
                  </div>
                  <Switch 
                    id="dataSharing" 
                    checked={formState.dataSharing} 
                    onCheckedChange={(checked) => handleToggleChange("dataSharing", checked)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appearance Settings</CardTitle>
                <CardDescription>
                  Customize the appearance and localization of your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant={formState.theme === "light" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleThemeChange("light")}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Light
                    </Button>
                    <Button 
                      variant={formState.theme === "dark" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleThemeChange("dark")}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Dark
                    </Button>
                    <Button 
                      variant={formState.theme === "system" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleThemeChange("system")}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      System
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant={formState.language === "en" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleLanguageChange("en")}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      English
                    </Button>
                    <Button 
                      variant={formState.language === "es" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleLanguageChange("es")}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      Spanish
                    </Button>
                    <Button 
                      variant={formState.language === "fr" ? "default" : "outline"} 
                      className="justify-start"
                      onClick={() => handleLanguageChange("fr")}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      French
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Access</CardTitle>
                <CardDescription>
                  Manage your API access and credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="apiAccess">Enable API Access</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow access to the LumenTrialGuide.AI API for integrations.
                    </p>
                  </div>
                  <Switch 
                    id="apiAccess" 
                    checked={formState.apiAccess} 
                    onCheckedChange={(checked) => handleToggleChange("apiAccess", checked)}
                  />
                </div>
                
                {formState.apiAccess && (
                  <div className="pt-4 space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="apiKey" 
                        value="••••••••••••••••••••••••••••••"
                        readOnly
                        className="font-mono"
                      />
                      <Button variant="outline" size="sm">
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your API key is confidential. Do not share it with anyone.
                    </p>
                    <div className="pt-2">
                      <Button variant="outline" size="sm">
                        Regenerate API Key
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="pt-4">
                  <a 
                    href="/api-documentation" 
                    className="text-primary hover:underline flex items-center"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    View API Documentation
                  </a>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Research Companion</CardTitle>
                  <CardDescription>
                    Configure the AI Research Companion
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ResearchCompanionSettings />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}