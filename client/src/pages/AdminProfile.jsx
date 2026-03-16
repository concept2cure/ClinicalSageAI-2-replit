import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  BarChart3,
  Building2,
  CheckCircle,
  LogOut,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  Key,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export default function AdminProfile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [experienceMode, setExperienceMode] = useState('admin');
  const [activeTab, setActiveTab] = useState('profile');
  const [adminSettings, setAdminSettings] = useState({
    emailNotifications: true,
    twoFactorAuth: false,
    darkMode: false,
    dataRetention: '90',
  });

  const user = {
    name: 'Sarah Johnson, Ph.D.',
    email: 'sarah.johnson@concept2cure.ai',
    role: 'Administrator',
    company: 'Concept2Cure.AI',
    avatar: '/avatars/admin-avatar.png',
    teams: [
      { id: 1, name: 'Regulatory Affairs', role: 'Admin' },
      { id: 2, name: 'Clinical Operations', role: 'Viewer' },
      { id: 3, name: 'Executive Strategy', role: 'Admin' },
    ],
    recentActivity: [
      {
        id: 1,
        action: 'Generated CSR Report',
        date: 'Today, 10:23 AM',
        module: 'CSR Intelligence',
      },
      {
        id: 2,
        action: 'Reviewed IND Application',
        date: 'Yesterday, 3:45 PM',
        module: 'IND Wizard',
      },
      { id: 3, action: 'Updated team permissions', date: 'Apr 21, 2025', module: 'Admin Panel' },
      {
        id: 4,
        action: 'Uploaded reference documents',
        date: 'Apr 20, 2025',
        module: 'Document Vault',
      },
    ],
    permissions: [
      { id: 1, name: 'IND Wizard', access: 'Full' },
      { id: 2, name: 'CSR Intelligence', access: 'Full' },
      { id: 3, name: 'Document Vault', access: 'Full' },
      { id: 4, name: 'CMC Blueprint', access: 'Full' },
      { id: 5, name: 'Ask Lumen', access: 'Full' },
    ],
    clientInfo: {
      companyName: 'MediNova Therapeutics',
      plan: 'Enterprise',
      seats: 25,
      usedSeats: 18,
      subscriptionRenewal: 'January 15, 2026',
      modules: [
        'IND Wizard',
        'CSR Intelligence',
        'Document Vault',
        'CMC Blueprint',
        'Ask Lumen',
        'Analytics',
      ],
    },
  };

  const handleAdminSettingChange = (setting, value) => {
    setAdminSettings(prev => ({
      ...prev,
      [setting]: value,
    }));

    toast({
      title: 'Setting Updated',
      description: `The ${setting} setting has been updated.`,
    });
  };

  const toggleExperienceMode = () => {
    const newMode = experienceMode === 'admin' ? 'client' : 'admin';
    setExperienceMode(newMode);

    toast({
      title: `Switched to ${newMode === 'admin' ? 'Admin' : 'Client'} View`,
      description: `You are now viewing the platform as a ${newMode === 'admin' ? 'system administrator' : 'client user'}.`,
    });
  };

  return (
    <div className="min-h-screen bg-[#f9f9fb]">
      {/* Top Header */}
      <header className="bg-white border-b border-[#e5e5e7] py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex flex-col items-start">
            <div className="flex items-center">
              <div className="bg-gradient-to-r from-[#0071e3] to-[#2b8fff] rounded p-1.5 mr-2">
                <div className="text-white font-bold text-xs tracking-wide">C2C.AI</div>
              </div>
              <span className="text-lg font-semibold text-[#1d1d1f] tracking-tight">
                CONCEPT2CURE.AI
              </span>
            </div>
            <span className="ml-7 text-sm text-[#86868b] mt-0.5">Concept2Cure Platform</span>
          </div>

          <div className="flex items-center space-x-4">
            <Link to="/">
              <Button variant="outline" size="sm">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Experience Mode Toggle */}
      <div className="bg-white border-b border-[#e5e5e7] py-3">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-[#424245]">
              <span className="font-medium">Current View:</span>{' '}
              {experienceMode === 'admin' ? 'Administrator' : 'Client'} Experience
            </div>

            <div className="flex items-center space-x-3">
              <span
                className={`text-sm ${experienceMode === 'admin' ? 'text-[#06c] font-medium' : 'text-[#86868b]'}`}
              >
                Admin
              </span>
              <Switch
                checked={experienceMode === 'client'}
                onCheckedChange={toggleExperienceMode}
              />
              <span
                className={`text-sm ${experienceMode === 'client' ? 'text-[#06c] font-medium' : 'text-[#86868b]'}`}
              >
                Client
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-1/4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <Avatar className="h-16 w-16 border-2 border-white shadow-md">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback>
                      {user.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>

                  <Badge className={experienceMode === 'admin' ? 'bg-purple-600' : 'bg-[#06c]'}>
                    {experienceMode === 'admin' ? 'Admin' : 'Client'}
                  </Badge>
                </div>
                <CardTitle className="mt-2">{user.name}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </CardHeader>

              <CardContent>
                <nav className="space-y-1">
                  <Button
                    variant={activeTab === 'profile' ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActiveTab('profile')}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Button>

                  <Button
                    variant={activeTab === 'teams' ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActiveTab('teams')}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Teams & Licenses
                  </Button>

                  {experienceMode === 'admin' && (
                    <Button
                      variant={activeTab === 'system' ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                      onClick={() => setActiveTab('system')}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      System Settings
                    </Button>
                  )}

                  {experienceMode === 'client' && (
                    <Button
                      variant={activeTab === 'analytics' ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                      onClick={() => setActiveTab('analytics')}
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Usage Analytics
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setLocation('/concept2cure/login')}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </nav>

                <div className="mt-6 pt-6 border-t border-[#e5e5e7]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[#1d1d1f]">Assigned Modules</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {user.permissions.map(permission => (
                      <Badge key={permission.id} variant="outline" className="bg-[#f8f9ff]">
                        {permission.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:w-3/4">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                    <CardDescription>Manage your account details and preferences</CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div className="grid gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name</Label>
                          <div className="py-2 px-3 bg-[#f5f5f7] rounded-md text-[#1d1d1f]">
                            {user.name}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <div className="py-2 px-3 bg-[#f5f5f7] rounded-md text-[#1d1d1f]">
                            {user.email}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="role">Role</Label>
                          <div className="py-2 px-3 bg-[#f5f5f7] rounded-md text-[#1d1d1f]">
                            {user.role}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="company">Company</Label>
                          <div className="py-2 px-3 bg-[#f5f5f7] rounded-md text-[#1d1d1f]">
                            {experienceMode === 'admin'
                              ? user.company
                              : user.clientInfo.companyName}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="twoFactor">Two-Factor Authentication</Label>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-[#424245]">
                            {adminSettings.twoFactorAuth
                              ? 'Two-factor authentication is enabled for your account'
                              : 'Enable two-factor authentication for added security'}
                          </div>
                          <Switch
                            id="twoFactor"
                            checked={adminSettings.twoFactorAuth}
                            onCheckedChange={checked =>
                              handleAdminSettingChange('twoFactorAuth', checked)
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notifications">Email Notifications</Label>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-[#424245]">
                            Receive email notifications for important updates and alerts
                          </div>
                          <Switch
                            id="notifications"
                            checked={adminSettings.emailNotifications}
                            onCheckedChange={checked =>
                              handleAdminSettingChange('emailNotifications', checked)
                            }
                          />
                        </div>
                      </div>

                      <div className="border-t border-[#e5e5e7] pt-4 mt-2">
                        <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
                        <div className="space-y-3">
                          {user.recentActivity.map(activity => (
                            <div
                              key={activity.id}
                              className="flex justify-between py-2 border-b border-[#e5e5e7] last:border-0"
                            >
                              <div>
                                <div className="font-medium">{activity.action}</div>
                                <div className="text-sm text-[#86868b]">{activity.module}</div>
                              </div>
                              <div className="text-sm text-[#86868b]">{activity.date}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Teams Tab */}
            {activeTab === 'teams' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Teams & License Management</CardTitle>
                    <CardDescription>
                      {experienceMode === 'admin'
                        ? 'Manage organization teams and license assignments'
                        : 'Manage your team members and license allocations'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {experienceMode === 'admin' ? (
                      <div className="space-y-6">
                        <div className="bg-[#f8f9ff] p-4 rounded-lg border border-[#e5e5e7]">
                          <h3 className="text-lg font-semibold mb-2">Admin Tools</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button variant="outline" className="justify-start">
                              <UserCog className="mr-2 h-4 w-4" />
                              User Management
                            </Button>
                            <Button variant="outline" className="justify-start">
                              <Key className="mr-2 h-4 w-4" />
                              License Administration
                            </Button>
                            <Button variant="outline" className="justify-start">
                              <Shield className="mr-2 h-4 w-4" />
                              Permission Templates
                            </Button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Client Companies</h3>
                            <Button size="sm">Add Company</Button>
                          </div>

                          <div className="space-y-4">
                            <Card>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center">
                                    <Avatar className="h-10 w-10 mr-3">
                                      <AvatarFallback>MT</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <h4 className="font-semibold">
                                        {user.clientInfo.companyName}
                                      </h4>
                                      <div className="text-sm text-[#86868b]">
                                        Enterprise Plan · {user.clientInfo.usedSeats}/
                                        {user.clientInfo.seats} Seats Used
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-[#f8f9ff]">
                                      Active
                                    </Badge>
                                    <Button size="sm" variant="outline">
                                      Manage
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center">
                                    <Avatar className="h-10 w-10 mr-3">
                                      <AvatarFallback>BP</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <h4 className="font-semibold">BioPhase Therapeutics</h4>
                                      <div className="text-sm text-[#86868b]">
                                        Professional Plan · 12/15 Seats Used
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-[#f8f9ff]">
                                      Active
                                    </Badge>
                                    <Button size="sm" variant="outline">
                                      Manage
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center">
                                    <Avatar className="h-10 w-10 mr-3">
                                      <AvatarFallback>GL</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <h4 className="font-semibold">GenLabs Inc.</h4>
                                      <div className="text-sm text-[#86868b]">
                                        Standard Plan · 5/5 Seats Used
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-[#f8f9ff]">
                                      Active
                                    </Badge>
                                    <Button size="sm" variant="outline">
                                      Manage
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-[#f8f9ff] p-4 rounded-lg border border-[#e5e5e7]">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-semibold mb-1">License Information</h3>
                              <p className="text-[#424245]">
                                {user.clientInfo.plan} Plan · {user.clientInfo.usedSeats}/
                                {user.clientInfo.seats} Seats Used
                              </p>
                              <p className="text-sm text-[#86868b]">
                                Renewal Date: {user.clientInfo.subscriptionRenewal}
                              </p>
                            </div>
                            <div>
                              <Button variant="secondary" size="sm">
                                Upgrade Plan
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Your Team Members</h3>
                            <Button size="sm">Add Team Member</Button>
                          </div>

                          <div className="bg-white border rounded-md overflow-hidden">
                            <div className="grid grid-cols-4 gap-4 p-4 border-b bg-[#f9f9fb] font-medium">
                              <div>Name</div>
                              <div>Email</div>
                              <div>Role</div>
                              <div>Actions</div>
                            </div>

                            <div className="divide-y">
                              <div className="grid grid-cols-4 gap-4 p-4 items-center">
                                <div className="font-medium">Sarah Johnson, Ph.D.</div>
                                <div className="text-[#424245]">{user.email}</div>
                                <div>
                                  <Badge>Administrator</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline">
                                    Edit
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-4 p-4 items-center">
                                <div className="font-medium">Michael Chen</div>
                                <div className="text-[#424245]">michael.chen@medinova.com</div>
                                <div>
                                  <Badge variant="outline">Manager</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline">
                                    Edit
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-4 p-4 items-center">
                                <div className="font-medium">Emily Rodriguez</div>
                                <div className="text-[#424245]">emily.r@medinova.com</div>
                                <div>
                                  <Badge variant="outline">Standard</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline">
                                    Edit
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-4 p-4 items-center">
                                <div className="font-medium">David Park</div>
                                <div className="text-[#424245]">d.park@medinova.com</div>
                                <div>
                                  <Badge variant="outline">Viewer</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline">
                                    Edit
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-lg font-semibold mb-4">Module Access Management</h3>

                          <div className="bg-white border rounded-md overflow-hidden">
                            <div className="grid grid-cols-4 gap-4 p-4 border-b bg-[#f9f9fb] font-medium">
                              <div>Module</div>
                              <div>Seats Allocated</div>
                              <div>Status</div>
                              <div>Actions</div>
                            </div>

                            <div className="divide-y">
                              {user.clientInfo.modules.map((module, index) => (
                                <div
                                  key={module}
                                  className="grid grid-cols-4 gap-4 p-4 items-center"
                                >
                                  <div className="font-medium">{module}</div>
                                  <div className="text-[#424245]">
                                    {Math.min(user.clientInfo.seats, 5 + index)}
                                  </div>
                                  <div>
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                      Active
                                    </Badge>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline">
                                      Manage Access
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* System Settings Tab - Admin Only */}
            {activeTab === 'system' && experienceMode === 'admin' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>System Settings</CardTitle>
                    <CardDescription>Manage global system configuration settings</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Security Settings</h3>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="enforceMultiFactor" className="text-base font-medium">
                              Enforce Multi-Factor Authentication
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              Require all users to set up MFA for their accounts
                            </p>
                          </div>
                          <Switch id="enforceMultiFactor" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="passwordPolicy" className="text-base font-medium">
                              Enhanced Password Policy
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              Require 12+ character passwords with special characters
                            </p>
                          </div>
                          <Switch id="passwordPolicy" defaultChecked />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="sessionTimeout" className="text-base font-medium">
                              Session Timeout
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              How long until inactive users are logged out
                            </p>
                          </div>
                          <Select defaultValue="30">
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select timeout" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 minutes</SelectItem>
                              <SelectItem value="30">30 minutes</SelectItem>
                              <SelectItem value="60">60 minutes</SelectItem>
                              <SelectItem value="120">2 hours</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-[#e5e5e7] pt-6">
                      <h3 className="text-lg font-semibold">Data Management</h3>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="dataRetention" className="text-base font-medium">
                              Data Retention Period
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              How long to keep audit logs and system data
                            </p>
                          </div>
                          <Select
                            value={adminSettings.dataRetention}
                            onValueChange={value =>
                              handleAdminSettingChange('dataRetention', value)
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="30">30 days</SelectItem>
                              <SelectItem value="90">90 days</SelectItem>
                              <SelectItem value="180">180 days</SelectItem>
                              <SelectItem value="365">1 year</SelectItem>
                              <SelectItem value="unlimited">Unlimited</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="backupFrequency" className="text-base font-medium">
                              Backup Frequency
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              How often to back up system data
                            </p>
                          </div>
                          <Select defaultValue="daily">
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hourly">Hourly</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-[#e5e5e7] pt-6">
                      <h3 className="text-lg font-semibold">Compliance Settings</h3>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="cfr11Compliance" className="text-base font-medium">
                              21 CFR Part 11 Compliance Mode
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              Enable full FDA 21 CFR Part 11 compliance features
                            </p>
                          </div>
                          <Switch id="cfr11Compliance" defaultChecked />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="auditTrails" className="text-base font-medium">
                              Extended Audit Trails
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              Track detailed user actions for regulatory compliance
                            </p>
                          </div>
                          <Switch id="auditTrails" defaultChecked />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="gdprMode" className="text-base font-medium">
                              GDPR Compliance Mode
                            </Label>
                            <p className="text-sm text-[#86868b]">
                              Enable enhanced privacy features for EU regulations
                            </p>
                          </div>
                          <Switch id="gdprMode" defaultChecked />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Analytics Tab - Client Only */}
            {activeTab === 'analytics' && experienceMode === 'client' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Usage Analytics</CardTitle>
                    <CardDescription>Track your team's usage of Concept2Cure platform</CardDescription>
                  </CardHeader>

                  <CardContent>
                    <Tabs defaultValue="module">
                      <TabsList className="mb-4">
                        <TabsTrigger value="module">Module Usage</TabsTrigger>
                        <TabsTrigger value="users">User Activity</TabsTrigger>
                        <TabsTrigger value="documents">Documents</TabsTrigger>
                      </TabsList>

                      <TabsContent value="module" className="space-y-4">
                        <div className="bg-[#f8f9ff] p-4 rounded-lg border border-[#e5e5e7] mb-6">
                          <div className="font-medium mb-2">Usage Period</div>
                          <Select defaultValue="30">
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">Last 7 days</SelectItem>
                              <SelectItem value="30">Last 30 days</SelectItem>
                              <SelectItem value="90">Last 90 days</SelectItem>
                              <SelectItem value="365">Last year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-center">
                                  <div className="text-4xl font-bold text-[#06c]">87%</div>
                                  <div className="text-sm text-[#86868b] mt-1">
                                    License Utilization
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-center">
                                  <div className="text-4xl font-bold text-[#06c]">34</div>
                                  <div className="text-sm text-[#86868b] mt-1">
                                    Documents Generated
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-center">
                                  <div className="text-4xl font-bold text-[#06c]">128</div>
                                  <div className="text-sm text-[#86868b] mt-1">
                                    AI Assistant Queries
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          <Card>
                            <CardHeader>
                              <CardTitle>Module Usage Distribution</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#0071e3] mr-2"></div>
                                      <span>IND Wizard</span>
                                    </div>
                                    <span className="font-medium">42%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#0071e3] h-2 rounded-full"
                                      style={{ width: '42%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#34c759] mr-2"></div>
                                      <span>CSR Intelligence</span>
                                    </div>
                                    <span className="font-medium">25%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#34c759] h-2 rounded-full"
                                      style={{ width: '25%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#5856d6] mr-2"></div>
                                      <span>Document Vault</span>
                                    </div>
                                    <span className="font-medium">18%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#5856d6] h-2 rounded-full"
                                      style={{ width: '18%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#ff9500] mr-2"></div>
                                      <span>Ask Lumen</span>
                                    </div>
                                    <span className="font-medium">15%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#ff9500] h-2 rounded-full"
                                      style={{ width: '15%' }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>

                      <TabsContent value="users">
                        <div className="bg-white border rounded-md overflow-hidden">
                          <div className="grid grid-cols-5 gap-4 p-4 border-b bg-[#f9f9fb] font-medium">
                            <div>User</div>
                            <div>Activity Level</div>
                            <div>Most Used Module</div>
                            <div>Actions</div>
                            <div>Last Active</div>
                          </div>

                          <div className="divide-y">
                            <div className="grid grid-cols-5 gap-4 p-4 items-center">
                              <div className="font-medium">Sarah Johnson</div>
                              <div>
                                <Badge className="bg-green-100 text-green-800">High</Badge>
                              </div>
                              <div>IND Wizard</div>
                              <div>42 documents, 68 queries</div>
                              <div className="text-[#86868b]">Today, 10:23 AM</div>
                            </div>

                            <div className="grid grid-cols-5 gap-4 p-4 items-center">
                              <div className="font-medium">Michael Chen</div>
                              <div>
                                <Badge className="bg-green-100 text-green-800">High</Badge>
                              </div>
                              <div>CSR Intelligence</div>
                              <div>38 documents, 42 queries</div>
                              <div className="text-[#86868b]">Today, 9:45 AM</div>
                            </div>

                            <div className="grid grid-cols-5 gap-4 p-4 items-center">
                              <div className="font-medium">Emily Rodriguez</div>
                              <div>
                                <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                              </div>
                              <div>Document Vault</div>
                              <div>22 documents, 18 queries</div>
                              <div className="text-[#86868b]">Yesterday, 4:12 PM</div>
                            </div>

                            <div className="grid grid-cols-5 gap-4 p-4 items-center">
                              <div className="font-medium">David Park</div>
                              <div>
                                <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                              </div>
                              <div>Ask Lumen</div>
                              <div>8 documents, 36 queries</div>
                              <div className="text-[#86868b]">Yesterday, 2:30 PM</div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="documents">
                        <div className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle>Document Analytics</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="p-4 bg-[#f8f9ff] rounded-lg border border-[#e5e5e7]">
                                  <div className="text-2xl font-bold">
                                    {user.clientInfo.usedSeats * 4}
                                  </div>
                                  <div className="text-sm text-[#86868b]">Total Documents</div>
                                </div>

                                <div className="p-4 bg-[#f8f9ff] rounded-lg border border-[#e5e5e7]">
                                  <div className="text-2xl font-bold">16</div>
                                  <div className="text-sm text-[#86868b]">Created This Month</div>
                                </div>

                                <div className="p-4 bg-[#f8f9ff] rounded-lg border border-[#e5e5e7]">
                                  <div className="text-2xl font-bold">8</div>
                                  <div className="text-sm text-[#86868b]">Pending Review</div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold">Document Types</h3>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#0071e3] mr-2"></div>
                                      <span>IND Applications</span>
                                    </div>
                                    <span className="font-medium">35%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#0071e3] h-2 rounded-full"
                                      style={{ width: '35%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#34c759] mr-2"></div>
                                      <span>Clinical Study Reports</span>
                                    </div>
                                    <span className="font-medium">28%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#34c759] h-2 rounded-full"
                                      style={{ width: '28%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#5856d6] mr-2"></div>
                                      <span>Protocols</span>
                                    </div>
                                    <span className="font-medium">20%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#5856d6] h-2 rounded-full"
                                      style={{ width: '20%' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <div className="flex items-center">
                                      <div className="w-3 h-3 rounded-full bg-[#ff9500] mr-2"></div>
                                      <span>Other</span>
                                    </div>
                                    <span className="font-medium">17%</span>
                                  </div>
                                  <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                                    <div
                                      className="bg-[#ff9500] h-2 rounded-full"
                                      style={{ width: '17%' }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
