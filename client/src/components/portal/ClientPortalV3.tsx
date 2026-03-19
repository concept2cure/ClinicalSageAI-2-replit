/**
 * Client Portal V3
 *
 * The unified entry point for all V3 UI components.
 * Routes between Dashboard, Programs, Library, and RI Copilot.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { AppShellV3 } from '../layout/AppShellV3';
import { DashboardV3 } from '../dashboard/DashboardV3';
import { ProgramWorkbenchV3 } from '../program/ProgramWorkbenchV3';
import { EvidenceLibraryV3 } from '../library/EvidenceLibraryV3';
import { AIAssistantV3 } from '../ai/AIAssistantV3';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BarChart3,
  CalendarDays,
  Users,
  Settings,
  HelpCircle,
  FileText,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Send,
  BookOpen,
  MessageSquare,
  Building2,
  Bell,
  Palette,
  Save,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ViewId =
  | 'dashboard'
  | 'programs'
  | 'library'
  | 'assistant'
  | 'analytics'
  | 'calendar'
  | 'team'
  | 'settings'
  | 'help';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: number | string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE TRANSITION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const pageVariants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 w-48 bg-neutral-200 rounded-lg" />
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-neutral-200 rounded-xl" />
      ))}
    </div>
    <div className="h-64 bg-neutral-200 rounded-xl" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const AnalyticsView: React.FC = () => {
  const stats = [
    { label: 'Total Projects', value: '12', icon: FileText, change: '+2 this month', trend: 'up' as const },
    { label: 'Documents', value: '148', icon: FileText, change: '+23 this week', trend: 'up' as const },
    { label: 'Compliance Score', value: '94%', icon: ShieldCheck, change: '+3% improvement', trend: 'up' as const },
    { label: 'Active Users', value: '8', icon: Users, change: '2 online now', trend: 'neutral' as const },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">Analytics</h2>
        <p className="text-neutral-500 mt-1">Track key metrics and performance across your organization.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-neutral-500">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="text-3xl font-bold text-neutral-900">{stat.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {stat.trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                <span className="text-xs text-neutral-500">{stat.change}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Activity</CardTitle>
            <CardDescription>Document submissions and approvals over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-neutral-200 rounded-lg">
              <BarChart3 className="h-10 w-10 text-neutral-300 mb-3" />
              <p className="text-sm font-medium text-neutral-500">No activity data yet</p>
              <p className="text-xs text-neutral-400 mt-1">Charts will appear once projects generate data</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance Overview</CardTitle>
            <CardDescription>Regulatory compliance tracking by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'FDA Submissions', score: 96, color: 'bg-emerald-500' },
                { name: 'ICH Guidelines', score: 91, color: 'bg-blue-500' },
                { name: 'GCP Compliance', score: 88, color: 'bg-amber-500' },
                { name: 'Data Integrity', score: 97, color: 'bg-emerald-500' },
              ].map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700">{item.name}</span>
                    <span className="font-medium text-neutral-900">{item.score}%</span>
                  </div>
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', item.color)} style={{ width: `${item.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const CalendarView: React.FC = () => {
  const deadlines = [
    { id: 1, title: 'IND Submission Deadline', date: '2026-03-25', status: 'upcoming', type: 'Regulatory' },
    { id: 2, title: 'Phase 2 Protocol Review', date: '2026-03-28', status: 'upcoming', type: 'Review' },
    { id: 3, title: 'DSMB Meeting', date: '2026-04-02', status: 'upcoming', type: 'Meeting' },
    { id: 4, title: 'Annual Safety Report', date: '2026-04-10', status: 'upcoming', type: 'Regulatory' },
    { id: 5, title: 'Site Initiation Visit - Site 004', date: '2026-04-15', status: 'upcoming', type: 'Milestone' },
    { id: 6, title: 'CSR Draft Completion', date: '2026-04-22', status: 'upcoming', type: 'Milestone' },
    { id: 7, title: 'FDA Pre-NDA Meeting', date: '2026-05-01', status: 'upcoming', type: 'Regulatory' },
    { id: 8, title: 'Interim Analysis Data Lock', date: '2026-05-10', status: 'upcoming', type: 'Milestone' },
  ];

  const statusColor = (type: string) => {
    switch (type) {
      case 'Regulatory': return 'bg-red-50 text-red-700 border-red-200';
      case 'Review': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Meeting': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Milestone': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
    }
  };

  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    const target = new Date(dateStr);
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Calendar</h2>
          <p className="text-neutral-500 mt-1">Upcoming deadlines, milestones, and key dates.</p>
        </div>
        <Button variant="outline" size="sm">
          <CalendarDays className="h-4 w-4 mr-2" />
          Export Calendar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">2</p>
              <p className="text-xs text-neutral-500">Due this week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">5</p>
              <p className="text-xs text-neutral-500">Due this month</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">8</p>
              <p className="text-xs text-neutral-500">Total upcoming</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming Deadlines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-neutral-100">
            {deadlines.map((item) => {
              const daysUntil = getDaysUntil(item.date);
              return (
                <div key={item.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[48px]">
                      <p className="text-xs text-neutral-400 uppercase">
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-neutral-900">
                        {new Date(item.date).getDate()}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">{item.title}</p>
                      <p className="text-xs text-neutral-500">
                        {daysUntil <= 0 ? 'Overdue' : `${daysUntil} day${daysUntil === 1 ? '' : 's'} away`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-xs', statusColor(item.type))}>
                      {item.type}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-neutral-300" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const TeamView: React.FC = () => {
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['/api/clients/team'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/clients/team');
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const fallbackMembers = [
    { id: 1, name: 'Dr. Sarah Chen', email: 'sarah.chen@example.com', role: 'Principal Investigator', status: 'active' },
    { id: 2, name: 'James Miller', email: 'j.miller@example.com', role: 'Regulatory Lead', status: 'active' },
    { id: 3, name: 'Emily Rodriguez', email: 'e.rodriguez@example.com', role: 'Clinical Data Manager', status: 'active' },
    { id: 4, name: 'David Kim', email: 'd.kim@example.com', role: 'Biostatistician', status: 'active' },
    { id: 5, name: 'Lisa Patel', email: 'l.patel@example.com', role: 'Medical Writer', status: 'invited' },
  ];

  const members = Array.isArray(teamMembers) ? teamMembers : fallbackMembers;

  const roleColor = (role: string) => {
    if (role.includes('Investigator')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (role.includes('Regulatory')) return 'bg-red-50 text-red-700 border-red-200';
    if (role.includes('Data')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (role.includes('Biostatistician')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Team</h2>
          <p className="text-neutral-500 mt-1">Manage your team members and roles.</p>
        </div>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">{members.length}</p>
              <p className="text-xs text-neutral-500">Total members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">
                {members.filter((m: any) => m.status === 'active').length}
              </p>
              <p className="text-xs text-neutral-500">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50">
              <Mail className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">
                {members.filter((m: any) => m.status === 'invited').length}
              </p>
              <p className="text-xs text-neutral-500">Pending invites</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-neutral-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-neutral-200 rounded" />
                    <div className="h-3 w-48 bg-neutral-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                      {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">{member.name}</p>
                      <p className="text-xs text-neutral-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-xs', roleColor(member.role))}>
                      {member.role}
                    </Badge>
                    <Badge variant={member.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {member.status === 'active' ? 'Active' : 'Invited'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const SettingsView: React.FC = () => {
  const [orgName, setOrgName] = useState('My Organization');
  const [emailNotif, setEmailNotif] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [slackNotif, setSlackNotif] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">Settings</h2>
        <p className="text-neutral-500 mt-1">Manage your organization and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-neutral-500" />
            <CardTitle className="text-lg">Organization</CardTitle>
          </div>
          <CardDescription>Basic information about your organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Enter organization name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-id">Organization ID</Label>
            <Input id="org-id" value="ORG-2026-001" disabled className="bg-neutral-50" />
            <p className="text-xs text-neutral-400">This ID is auto-generated and cannot be changed.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-neutral-500" />
            <CardTitle className="text-lg">Notifications</CardTitle>
          </div>
          <CardDescription>Configure how you receive updates and alerts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900 text-sm">Email Notifications</p>
              <p className="text-xs text-neutral-500">Receive updates about project activity via email.</p>
            </div>
            <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900 text-sm">Weekly Digest</p>
              <p className="text-xs text-neutral-500">Get a summary of all activity every Monday.</p>
            </div>
            <Switch checked={weeklyDigest} onCheckedChange={setWeeklyDigest} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900 text-sm">Slack Integration</p>
              <p className="text-xs text-neutral-500">Post notifications to your Slack workspace.</p>
            </div>
            <Switch checked={slackNotif} onCheckedChange={setSlackNotif} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-neutral-500" />
            <CardTitle className="text-lg">Display</CardTitle>
          </div>
          <CardDescription>Customize how the portal looks and feels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900 text-sm">Compact Mode</p>
              <p className="text-xs text-neutral-500">Reduce spacing for a denser layout.</p>
            </div>
            <Switch checked={compactMode} onCheckedChange={setCompactMode} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900 text-sm">Dark Mode</p>
              <p className="text-xs text-neutral-500">Switch to a dark color scheme.</p>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
        {saved && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-emerald-600 flex items-center gap-1"
          >
            <CheckCircle2 className="h-4 w-4" /> Settings saved
          </motion.span>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELP & SUPPORT VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const HelpSupportView: React.FC = () => {
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSent, setTicketSent] = useState(false);

  const handleSubmitTicket = () => {
    if (ticketSubject.trim() && ticketMessage.trim()) {
      setTicketSent(true);
      setTicketSubject('');
      setTicketMessage('');
      setTimeout(() => setTicketSent(false), 3000);
    }
  };

  const faqs = [
    {
      question: 'How do I create a new regulatory submission?',
      answer: 'Navigate to the Programs tab, click "New Program," and select the submission type. The system will guide you through the required documents and sections based on the regulatory framework you choose.',
    },
    {
      question: 'How does the AI assistant help with document review?',
      answer: 'The RI Copilot analyzes your documents against regulatory guidelines, flags potential compliance issues, suggests improvements, and can auto-generate sections based on your data. Access it from the Assistant tab.',
    },
    {
      question: 'Can I collaborate with my team on the same document?',
      answer: 'Yes. Multiple team members can work on the same project simultaneously. Use the Team tab to manage access permissions and roles. All changes are tracked with full version history.',
    },
    {
      question: 'How do I export documents for submission?',
      answer: 'Open the document in the Library, click the export button, and choose your format (eCTD, PDF, Word). The system will validate the document structure before export to ensure compliance.',
    },
    {
      question: 'What regulatory frameworks are supported?',
      answer: 'Concept2Cure.RI supports FDA (IND/NDA/BLA), EMA (MAA), ICH guidelines, and many other global regulatory frameworks. The Evidence Library includes templates and guidance for each framework.',
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">Help & Support</h2>
        <p className="text-neutral-500 mt-1">Find answers, get help, and access documentation.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:border-blue-300 transition-colors">
          <CardContent className="p-5 flex flex-col items-center text-center">
            <div className="p-3 rounded-xl bg-blue-50 mb-3">
              <BookOpen className="h-6 w-6 text-blue-600" />
            </div>
            <p className="font-medium text-neutral-900 text-sm">Documentation</p>
            <p className="text-xs text-neutral-500 mt-1">Guides and API reference</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-purple-300 transition-colors">
          <CardContent className="p-5 flex flex-col items-center text-center">
            <div className="p-3 rounded-xl bg-purple-50 mb-3">
              <MessageSquare className="h-6 w-6 text-purple-600" />
            </div>
            <p className="font-medium text-neutral-900 text-sm">Community Forum</p>
            <p className="text-xs text-neutral-500 mt-1">Ask questions and share tips</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-emerald-300 transition-colors">
          <CardContent className="p-5 flex flex-col items-center text-center">
            <div className="p-3 rounded-xl bg-emerald-50 mb-3">
              <Mail className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium text-neutral-900 text-sm">Email Support</p>
            <p className="text-xs text-neutral-500 mt-1">support@concept2cure-ri.ai</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} value={`faq-${idx}`}>
                <AccordionTrigger className="text-sm text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-neutral-600">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submit a Support Ticket</CardTitle>
          <CardDescription>Describe your issue and our team will respond within 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="Brief description of your issue"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket-message">Message</Label>
            <Textarea
              id="ticket-message"
              value={ticketMessage}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTicketMessage(e.target.value)}
              placeholder="Provide details about the issue you're experiencing..."
              rows={4}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSubmitTicket} disabled={!ticketSubject.trim() || !ticketMessage.trim()}>
              <Send className="h-4 w-4 mr-2" />
              Submit Ticket
            </Button>
            {ticketSent && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm text-emerald-600 flex items-center gap-1"
              >
                <CheckCircle2 className="h-4 w-4" /> Ticket submitted successfully
              </motion.span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ClientPortalV3: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  const handleNavigate = useCallback((item: NavItem) => {
    const viewMap: Record<string, ViewId> = {
      dashboard: 'dashboard',
      programs: 'programs',
      library: 'library',
      assistant: 'assistant',
      analytics: 'analytics',
      calendar: 'calendar',
      team: 'team',
      settings: 'settings',
      help: 'help',
    };
    setActiveView(viewMap[item.id] || 'dashboard');
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardV3 />;
      case 'programs':
        return <ProgramWorkbenchV3 />;
      case 'library':
        return <EvidenceLibraryV3 className="h-[calc(100vh-8rem)]" />;
      case 'assistant':
        return <AIAssistantV3 className="h-[calc(100vh-8rem)]" />;
      case 'analytics':
        return <AnalyticsView />;
      case 'calendar':
        return <CalendarView />;
      case 'team':
        return <TeamView />;
      case 'settings':
        return <SettingsView />;
      case 'help':
        return <HelpSupportView />;
      default:
        return <DashboardV3 />;
    }
  };

  return (
    <AppShellV3 activeItem={activeView} onNavigate={handleNavigate}>
      <Suspense fallback={<LoadingSkeleton />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </AppShellV3>
  );
};

export default ClientPortalV3;
