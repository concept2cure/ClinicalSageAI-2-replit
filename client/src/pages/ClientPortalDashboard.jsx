import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';

const ClientPortalDashboard = () => {
  const { toast } = useToast();
  const [activeModule, setActiveModule] = useState('vault');
  const [authenticated, setAuthenticated] = useState(
    localStorage.getItem('authenticated') === 'true'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (authenticated) {
      fetchDocuments();
      fetchActivity();
      fetchProjects();
    }
  }, [authenticated]);

  const handleLogin = e => {
    e.preventDefault();
    setLoading(true);

    // For demonstration, accept admin/admin123 as valid credentials
    if (username === 'admin' && password === 'admin123') {
      setTimeout(() => {
        setLoading(false);
        setAuthenticated(true);
        localStorage.setItem('authenticated', 'true');
        toast({
          title: 'Login Successful',
          description: 'Welcome to the TrialSage Client Portal',
        });
        // Redirect to the client portal HTML page
        window.location.href = '/client-portal.html';
      }, 1000);
    } else {
      setTimeout(() => {
        setLoading(false);
        toast({
          title: 'Login Failed',
          description: 'Login failed. Please check your credentials.',
          variant: 'destructive',
        });
      }, 1000);
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    localStorage.removeItem('authenticated');
    toast({
      title: 'Logged Out',
      description: 'You have been logged out successfully.',
    });
  };

  const fetchDocuments = () => {
    // Mock data for demonstration
    setDocuments([
      {
        id: 1,
        title: 'ENZYMAX FORTE - Clinical Protocol',
        description: 'Phase 2 study protocol for refractory epilepsy',
        document_type: 'Clinical',
        category: 'IND',
        tags: ['Protocol', 'Phase 2'],
        ai_tags: ['Epilepsy', 'Neurology'],
        created_at: '2025-04-25T14:32:45Z',
        file_name: 'enzymax_protocol_v2.pdf',
      },
      {
        id: 2,
        title: 'CARDIOPLEX - CMC Documentation',
        description: 'Chemistry, Manufacturing, and Controls details',
        document_type: 'Regulatory',
        category: 'NDA',
        tags: ['CMC', 'Quality'],
        ai_tags: ['Cardiovascular', 'API Specification'],
        created_at: '2025-04-22T09:15:30Z',
        file_name: 'cardioplex_cmc_v1.pdf',
      },
      {
        id: 3,
        title: 'NEUROEASE - Toxicology Report',
        description: 'Preclinical toxicology study results',
        document_type: 'Safety',
        category: 'IND',
        tags: ['Preclinical', 'Toxicology'],
        ai_tags: ['Neurology', 'Safety Assessment'],
        created_at: '2025-04-20T16:45:12Z',
        file_name: 'neuroease_tox_report.pdf',
      },
    ]);
  };

  const fetchActivity = () => {
    // Mock data for demonstration
    setRecentActivity([
      {
        id: 1,
        type: 'document',
        action: 'upload',
        user: 'Maria Rodriguez',
        item: 'ENZYMAX FORTE - Toxicology Report',
        timestamp: '2025-04-26T14:32:45Z',
      },
      {
        id: 2,
        type: 'workflow',
        action: 'approval',
        user: 'John Smith',
        item: 'CARDIOPLEX - Drug Chemistry Specifications',
        timestamp: '2025-04-25T09:15:30Z',
      },
      {
        id: 3,
        type: 'ai',
        action: 'alert',
        user: 'TrialSage AI',
        item: 'Missing endpoint in NEUROEASE clinical protocol',
        timestamp: '2025-04-24T16:45:12Z',
      },
      {
        id: 4,
        type: 'document',
        action: 'download',
        user: 'Sarah Johnson',
        item: 'ENZYMAX FORTE - Clinical Protocol',
        timestamp: '2025-04-23T11:22:05Z',
      },
      {
        id: 5,
        type: 'document',
        action: 'edit',
        user: 'Alex Chen',
        item: 'IMMUNOTROL - IND Amendment',
        timestamp: '2025-04-22T08:30:17Z',
      },
    ]);
  };

  const fetchProjects = () => {
    // Mock data for demonstration
    setActiveProjects([
      {
        id: 1,
        name: 'ENZYMAX FORTE',
        type: 'IND',
        status: 'Active',
        phase: 'Phase 2',
        therapeutic: 'Neurology',
        progress: 65,
        updated: '2025-04-25T14:32:45Z',
      },
      {
        id: 2,
        name: 'CARDIOPLEX',
        type: 'NDA',
        status: 'Submitted',
        phase: 'Phase 3',
        therapeutic: 'Cardiovascular',
        progress: 90,
        updated: '2025-04-22T09:15:30Z',
      },
      {
        id: 3,
        name: 'NEUROEASE',
        type: 'IND',
        status: 'Draft',
        phase: 'Phase 2',
        therapeutic: 'Neurology',
        progress: 42,
        updated: '2025-04-20T16:45:12Z',
      },
    ]);
  };

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const navigateToModule = module => {
    setActiveModule(module);

    // Navigate to the specific module using the solutions HTML files
    if (module === 'ind') {
      window.location.href = '/solutions_ind_wizard.html';
    } else if (module === 'vault') {
      window.location.href = '/solutions_vault.html';
    } else if (module === 'csr') {
      window.location.href = '/solutions_csr_intelligence.html';
    } else if (module === 'study') {
      window.location.href = '/solutions_study_architect.html';
    } else if (module === 'cmc') {
      // Fallback to client portal for now
      window.location.href = '/client-portal.html';
    } else if (module === 'timeline') {
      // Fallback to client portal for now
      window.location.href = '/client-portal.html';
    } else if (module === 'lumen') {
      window.location.href = '/client-portal/lumen-cortex';
    } else {
      // Default to client portal
      window.location.href = '/client-portal.html';
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-pink-50 p-4">
        <Card className="w-[350px] sm:w-[400px]">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <span className="text-3xl font-bold text-pink-600">TrialSage</span>
              <span className="text-xs align-top font-medium text-gray-500">™</span>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    placeholder="Enter your username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                  />
                </div>
                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full bg-pink-600 hover:bg-pink-700"
                    disabled={loading}
                  >
                    {loading ? 'Logging in...' : 'Login'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center text-sm text-muted-foreground">
            Default credentials: admin / admin123
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-2xl font-bold text-pink-600">TrialSage</span>
            <span className="text-xs align-top font-medium text-gray-500">™</span>
            <span className="ml-2 text-sm text-gray-400">Client Portal</span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="hidden md:flex space-x-4">
              <Button
                variant={activeModule === 'vault' ? 'default' : 'ghost'}
                className={activeModule === 'vault' ? 'bg-pink-600 hover:bg-pink-700' : ''}
                onClick={() => navigateToModule('vault')}
              >
                Vault™
              </Button>
              <Button
                variant={activeModule === 'ind' ? 'default' : 'ghost'}
                className={activeModule === 'ind' ? 'bg-pink-600 hover:bg-pink-700' : ''}
                onClick={() => navigateToModule('ind')}
              >
                IND Wizard™
              </Button>
              <Button
                variant={activeModule === 'csr' ? 'default' : 'ghost'}
                className={activeModule === 'csr' ? 'bg-pink-600 hover:bg-pink-700' : ''}
                onClick={() => navigateToModule('csr')}
              >
                CSR Intelligence™
              </Button>
              <Button
                variant={activeModule === 'lumen' ? 'default' : 'ghost'}
                className={activeModule === 'lumen' ? 'bg-pink-600 hover:bg-pink-700' : ''}
                onClick={() => navigateToModule('lumen')}
              >
                Lumen Cortex™
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="hidden sm:inline text-sm font-medium">John Smith</span>
              <Button size="sm" variant="outline" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome, John</h1>
          <p className="text-gray-500">Last login: April 26, 2025, 8:12 AM EDT</p>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Documents</p>
                  <p className="text-2xl font-bold">248</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="bg-pink-100 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-pink-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Submissions</p>
                  <p className="text-2xl font-bold">5</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-green-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Approved Documents</p>
                  <p className="text-2xl font-bold">52</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="bg-amber-100 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-amber-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pending Reviews</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="projects" className="mb-8">
          <TabsList>
            <TabsTrigger value="projects">Active Projects</TabsTrigger>
            <TabsTrigger value="documents">Recent Documents</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            <Card>
              <CardHeader>
                <CardTitle>Your Active Projects</CardTitle>
                <CardDescription>View and manage your ongoing regulatory projects</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {activeProjects.map(project => (
                    <Card key={project.id} className="overflow-hidden">
                      <div className="p-4">
                        <div className="flex flex-wrap justify-between items-start gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{project.name}</h3>
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  project.status === 'Active'
                                    ? 'bg-blue-100 text-blue-800'
                                    : project.status === 'Submitted'
                                      ? 'bg-green-100 text-green-800'
                                      : project.status === 'Draft'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {project.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {project.type} • {project.phase} • {project.therapeutic}
                            </p>
                          </div>

                          <Button
                            size="sm"
                            className={
                              project.name === 'ENZYMAX FORTE'
                                ? 'bg-pink-600 hover:bg-pink-700'
                                : ''
                            }
                            onClick={() => {
                              if (project.name === 'ENZYMAX FORTE') {
                                window.location.href = '/solutions_ind_wizard.html';
                              }
                            }}
                          >
                            View Details
                          </Button>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">Progress</span>
                            <span className="text-xs font-medium">{project.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                project.progress >= 80
                                  ? 'bg-green-500'
                                  : project.progress >= 40
                                    ? 'bg-blue-500'
                                    : 'bg-amber-500'
                              }`}
                              style={{ width: `${project.progress}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          Last updated: {formatDate(project.updated)}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>
                  Access your recently uploaded and modified documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {documents.map(doc => (
                    <Card key={doc.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">{doc.title}</h3>
                          <p className="text-sm text-muted-foreground mb-2">{doc.description}</p>
                          <div className="flex flex-wrap gap-2 my-2">
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                              {doc.document_type}
                            </span>
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                              {doc.category}
                            </span>
                            {doc.tags &&
                              doc.tags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"
                                >
                                  {tag}
                                </span>
                              ))}
                            {doc.ai_tags &&
                              doc.ai_tags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-700/10"
                                >
                                  AI: {tag}
                                </span>
                              ))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Uploaded on {formatDate(doc.created_at)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            Download
                          </Button>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Track recent actions on your documents and submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map(activity => (
                    <div key={activity.id} className="flex items-start space-x-4">
                      <div
                        className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                          activity.type === 'document'
                            ? 'bg-blue-100 text-blue-600'
                            : activity.type === 'workflow'
                              ? 'bg-green-100 text-green-600'
                              : activity.type === 'ai'
                                ? 'bg-pink-100 text-pink-600'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {activity.type === 'document' && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        )}
                        {activity.type === 'workflow' && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        )}
                        {activity.type === 'ai' && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {activity.user} {activity.action === 'upload' && 'uploaded'}
                          {activity.action === 'approval' && 'approved'}
                          {activity.action === 'alert' && 'flagged'}
                          {activity.action === 'download' && 'downloaded'}
                          {activity.action === 'edit' && 'edited'} {activity.item}
                        </div>
                        <p className="text-sm text-gray-500">{formatDate(activity.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick access modules grid */}
        <h2 className="text-xl font-bold mb-4">TrialSage™ Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('vault')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-pink-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-pink-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">TrialSage Vault™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Secure document management with full audit trails and 21 CFR Part 11 compliance
                </p>
                <div className="text-sm text-pink-600 font-medium flex items-center">
                  Access Vault
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-pink-200">
            <CardContent className="p-0">
              <div
                className="p-6 cursor-pointer bg-pink-50 rounded-[inherit]"
                onClick={() => navigateToModule('ind')}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-pink-200 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-pink-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">IND Wizard™</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Guided IND application workflow with smart document generation and submission
                  tools
                </p>
                <div className="text-sm text-pink-700 font-medium flex items-center">
                  Launch IND Wizard
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('csr')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-purple-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-purple-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">CSR Intelligence™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Analyze 3,200+ clinical study reports with powerful AI search and insight
                  extraction
                </p>
                <div className="text-sm text-purple-600 font-medium flex items-center">
                  Access CSR Intelligence
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('study')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-emerald-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Study Architect™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Design clinical study protocols with AI-guided tools and statistical simulation
                  features
                </p>
                <div className="text-sm text-emerald-600 font-medium flex items-center">
                  Launch Study Architect
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('cmc')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-amber-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-amber-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">CMC Automation™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Streamline Chemistry, Manufacturing, and Controls documentation with AI-powered
                  tools
                </p>
                <div className="text-sm text-amber-600 font-medium flex items-center">
                  Access CMC Tools
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('timeline')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-indigo-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-indigo-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Regulatory Timeline™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Visualize and manage global regulatory submission timelines with predictive
                  analytics
                </p>
                <div className="text-sm text-indigo-600 font-medium flex items-center">
                  View Timeline
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-6 cursor-pointer" onClick={() => navigateToModule('lumen')}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-slate-100 p-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-slate-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Lumen Cortex™</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Monitor hunter status, trigger force hunts, and track intelligence volume in
                  real time.
                </p>
                <div className="text-sm text-slate-700 font-medium flex items-center">
                  Open Command Center
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <span className="text-lg font-bold text-pink-600">TrialSage</span>
            <span className="text-xs align-top font-medium text-gray-500">™</span>
            <span className="text-sm text-gray-400 ml-2">Client Portal</span>
          </div>
          <div className="text-sm text-gray-500">
            &copy; 2025 Concept2Cures Inc. All rights reserved.
          </div>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <a href="#" className="text-sm text-gray-500 hover:text-gray-700">
              Help
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-700">
              Documentation
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-700">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ClientPortalDashboard;
