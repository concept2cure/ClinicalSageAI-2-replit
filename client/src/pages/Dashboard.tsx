import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  SearchIcon,
  FileText,
  Send,
  Clipboard,
  PieChart,
  BarChart,
  FileCheck,
  ChevronRight,
  Rocket,
  Sparkles,
  FileStack,
} from 'lucide-react';

// Dashboard cards data
const usageCards = [
  {
    title: 'CSR Uploads',
    icon: <FileText className="h-5 w-5 text-blue-500" />,
    used: 42,
    total: 100,
    color: 'bg-blue-500',
  },
  {
    title: 'Protocol Analyses',
    icon: <Clipboard className="h-5 w-5 text-emerald-500" />,
    used: 7,
    total: 20,
    color: 'bg-emerald-500',
  },
  {
    title: 'IND Submissions',
    icon: <Send className="h-5 w-5 text-amber-500" />,
    used: 3,
    total: 5,
    color: 'bg-amber-500',
  },
  {
    title: 'CER Reports',
    icon: <FileCheck className="h-5 w-5 text-purple-500" />,
    used: 12,
    total: 25,
    color: 'bg-purple-500',
  },
];

const featureCards = [
  {
    title: 'Concept2Cure',
    icon: <Rocket className="h-8 w-8 text-purple-500" />,
    description:
      'AI-powered regulatory submission assistant. Draft 510(k)s, INDs, NDAs with Claude-style conversational interface',
    actions: [
      {
        label: 'New Submission',
        icon: <Sparkles className="mr-2 h-4 w-4" />,
        path: '/concept2cure',
      },
      {
        label: 'My Projects',
        icon: <FileStack className="mr-2 h-4 w-4" />,
        path: '/concept2cure',
      },
      {
        label: 'Templates',
        icon: <FileText className="mr-2 h-4 w-4" />,
        path: '/concept2cure',
      },
    ],
    launchPath: '/concept2cure',
    featured: true,
  },
  {
    title: 'CSR Intelligence',
    icon: <FileText className="h-8 w-8 text-blue-500" />,
    description:
      'Search, analyze, and compare 3,021 clinical study reports across 34 therapeutic areas',
    actions: [
      {
        label: 'Search Library',
        icon: <SearchIcon className="mr-2 h-4 w-4" />,
        path: '/csr-intelligence',
      },
      {
        label: 'Upload CSR',
        icon: <FileText className="mr-2 h-4 w-4" />,
        path: '/csr-intelligence/upload',
      },
      {
        label: 'Analytics',
        icon: <BarChart className="mr-2 h-4 w-4" />,
        path: '/csr-intelligence/analytics',
      },
    ],
    launchPath: '/csr-intelligence',
  },
  {
    title: 'Protocol Optimizer',
    icon: <Clipboard className="h-8 w-8 text-emerald-500" />,
    description:
      'Optimize clinical trial protocols with intelligence from 3,021 successful studies',
    actions: [
      {
        label: 'New Protocol',
        icon: <FileText className="mr-2 h-4 w-4" />,
        path: '/protocol-optimizer/new',
      },
      {
        label: 'Analyze Protocol',
        icon: <Clipboard className="mr-2 h-4 w-4" />,
        path: '/protocol-optimizer/analyze',
      },
      {
        label: 'Intelligence Panel',
        icon: <PieChart className="mr-2 h-4 w-4" />,
        path: '/protocol-optimizer/intelligence',
      },
    ],
    launchPath: '/protocol-optimizer',
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Concept2Cure Hero Banner */}
      <Card className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 dark:from-purple-950/30 dark:via-indigo-950/30 dark:to-blue-950/30 border-purple-100 dark:border-purple-900 overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Rocket className="h-6 w-6 text-purple-600" />
                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full">NEW</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                Concept2Cure™ AI Assistant
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-lg">
                Experience our Claude-style conversational interface for regulatory submissions. 
                Draft 510(k)s, INDs, NDAs, and more with AI-powered assistance.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/concept2cure">
                <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-200 dark:shadow-purple-900/50">
                  <Rocket className="mr-2 h-4 w-4" />
                  Launch Concept2Cure
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Welcome banner */}
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-100 dark:border-emerald-900">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                Welcome to TrialSage
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Your advanced clinical intelligence platform
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-slate-500 dark:text-slate-400">Your Plan</p>
                <p className="font-medium text-emerald-600 dark:text-emerald-500">Enterprise</p>
              </div>
              <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Manage Subscription
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {usageCards.map((card, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {card.icon}
                  <h3 className="font-medium">{card.title}</h3>
                </div>
              </div>
              <Progress
                value={(card.used / card.total) * 100}
                className={`h-2 mb-2 ${card.color}`}
              />
              <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>{card.used} used</span>
                <span>{card.total} total</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features tabs */}
      <Tabs defaultValue="all-features" className="mt-8">
        <TabsList className="mb-4">
          <TabsTrigger value="all-features">All Features</TabsTrigger>
          <TabsTrigger value="core-modules">Core Modules</TabsTrigger>
          <TabsTrigger value="advanced-intelligence">Advanced Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="all-features" className="space-y-6">
          {/* Feature cards */}
          {featureCards.map((feature, index) => (
            <Card key={index} className="overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="p-6 lg:col-span-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 lg:col-span-2 bg-slate-50 dark:bg-slate-800/50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {feature.actions.map((action, idx) => (
                      <Link key={idx} href={action.path}>
                        <a className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-3 flex items-center text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700">
                          {action.icon}
                          {action.label}
                        </a>
                      </Link>
                    ))}
                  </div>

                  <div className="mt-4">
                    <Link href={feature.launchPath}>
                      <a className="inline-flex items-center text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400">
                        Launch {feature.title}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </a>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="core-modules">
          <Card>
            <CardHeader>
              <CardTitle>Core Modules</CardTitle>
              <CardDescription>
                Essential tools for clinical research and development
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Core modules content will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced-intelligence">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Intelligence</CardTitle>
              <CardDescription>AI-powered analysis and research automation tools</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Advanced intelligence features will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
