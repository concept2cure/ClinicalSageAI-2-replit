/**
 * Admin Portal Index and Routes
 *
 * Central routing and navigation for the admin portal with:
 * - Role-based access control
 * - Lazy-loaded components
 * - Protected routes
 * - Breadcrumb navigation
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 * @note Requires react-router-dom to be installed: npm install react-router-dom @types/react-router-dom
 */

import React, { Suspense, lazy, useCallback } from 'react';
// @ts-expect-error - react-router-dom needs to be installed
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield,
  Users,
  Settings,
  Activity,
  FileText,
  Lock,
  Key,
  UserCheck,
  Building2,
  Monitor,
  Globe,
  Award,
  History,
  AlertTriangle,
  BookOpen,
  Network,
  ArrowRightLeft,
  LayoutDashboard,
  ChevronRight,
  Loader2,
  Home,
  Bell,
  Search,
  Menu,
  LogOut,
  User,
} from 'lucide-react';
import { getAuthHeaders, getOrgId } from '@/utils/authToken';

// ─────────────────────────────────────────────────────────────────────────────
// LAZY-LOADED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Admin Components
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));
const UserManagement = lazy(() => import('./admin/UserManagement'));
const RolePermissionManager = lazy(() => import('./admin/RolePermissionManager'));
const OrganizationManagement = lazy(() => import('./admin/OrganizationManagement'));
const DelegationOfAuthority = lazy(() => import('./admin/DelegationOfAuthority'));
const AccessControlMatrix = lazy(() => import('./admin/AccessControlMatrix'));

// Security Components
const SecuritySettings = lazy(() => import('./settings/SecuritySettings'));
const SessionManager = lazy(() => import('./admin/SessionManager'));
const IPAllowlistManagement = lazy(() => import('./security/IPAllowlistManagement'));
const SecurityAlerts = lazy(() => import('./security/SecurityAlertsDashboard'));
const ElectronicSignature = lazy(() => import('./security/ElectronicSignature'));

// Compliance Components
const ComplianceDashboard = lazy(() => import('./compliance/ComplianceDashboard'));
const AuditTrailViewer = lazy(() => import('./audit/AuditTrailViewer'));
const TrainingManagement = lazy(() => import('./admin/TrainingManagement'));

// Monitoring Components
const ActivityMonitor = lazy(() => import('./monitoring/ActivityMonitor'));

// Auth Components
const LoginPage = lazy(() => import('./auth/LoginPage'));
const MFASetup = lazy(() => import('./auth/MfaSetup'));
const PasswordReset = lazy(() => import('./auth/PasswordReset'));

// Onboarding Components
const OnboardingWizard = lazy(() => import('./onboarding/OnboardingWizard'));

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  requiredPermissions?: string[];
  children?: NavItem[];
}

interface BreadcrumbItem {
  label: string;
  path?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/admin',
    icon: LayoutDashboard,
    description: 'Admin overview and quick actions',
  },
  {
    id: 'users',
    label: 'User Management',
    path: '/admin/users',
    icon: Users,
    description: 'Manage users, roles, and permissions',
    children: [
      {
        id: 'users-list',
        label: 'All Users',
        path: '/admin/users',
        icon: Users,
      },
      {
        id: 'roles',
        label: 'Roles & Permissions',
        path: '/admin/users/roles',
        icon: Shield,
      },
      {
        id: 'access-matrix',
        label: 'Access Control Matrix',
        path: '/admin/users/access-matrix',
        icon: Network,
      },
      {
        id: 'delegation',
        label: 'Delegation of Authority',
        path: '/admin/users/delegation',
        icon: ArrowRightLeft,
      },
    ],
  },
  {
    id: 'organizations',
    label: 'Organizations',
    path: '/admin/organizations',
    icon: Building2,
    description: 'Multi-tenant organization management',
  },
  {
    id: 'security',
    label: 'Security',
    path: '/admin/security',
    icon: Shield,
    description: 'Security settings and controls',
    badge: 'Critical',
    badgeVariant: 'destructive',
    children: [
      {
        id: 'security-settings',
        label: 'Security Settings',
        path: '/admin/security/settings',
        icon: Settings,
      },
      {
        id: 'sessions',
        label: 'Session Management',
        path: '/admin/security/sessions',
        icon: Monitor,
      },
      {
        id: 'ip-allowlist',
        label: 'IP Allowlist',
        path: '/admin/security/ip-allowlist',
        icon: Globe,
      },
      {
        id: 'security-alerts',
        label: 'Security Alerts',
        path: '/admin/security/alerts',
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    path: '/admin/compliance',
    icon: Award,
    description: 'Regulatory compliance monitoring',
    children: [
      {
        id: 'compliance-dashboard',
        label: 'Compliance Dashboard',
        path: '/admin/compliance',
        icon: Award,
      },
      {
        id: 'audit-trail',
        label: 'Audit Trail',
        path: '/admin/compliance/audit',
        icon: History,
      },
      {
        id: 'training',
        label: 'Training Management',
        path: '/admin/compliance/training',
        icon: BookOpen,
      },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    path: '/admin/monitoring',
    icon: Activity,
    description: 'System activity and health monitoring',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LOADING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
      <p className="mt-2 text-sm text-gray-500">Loading...</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BREADCRUMB COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => (
  <nav className="flex items-center space-x-1 text-sm text-gray-500">
    <Link to="/admin" className="hover:text-gray-700 flex items-center">
      <Home className="h-4 w-4" />
    </Link>
    {items.map((item, index) => (
      <React.Fragment key={index}>
        <ChevronRight className="h-4 w-4" />
        {item.path ? (
          <Link to={item.path} className="hover:text-gray-700">
            {item.label}
          </Link>
        ) : (
          <span className="text-gray-900 font-medium">{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const AdminSidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <aside
      className={`bg-gray-900 text-white transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-400" />
            <span className="font-bold">Admin Portal</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="text-gray-400 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <nav className="p-2 space-y-1">
          {ADMIN_NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <div key={item.id}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <Badge variant={item.badgeVariant || 'secondary'} className="text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>

                {!isCollapsed && item.children && active && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-gray-800 pl-4">
                    {item.children.map(child => {
                      const ChildIcon = child.icon;
                      const childActive = location.pathname === child.path;

                      return (
                        <Link
                          key={child.id}
                          to={child.path}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            childActive
                              ? 'bg-gray-800 text-white'
                              : 'text-gray-500 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          <ChildIcon className="h-4 w-4" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Admin User</p>
              <p className="text-xs text-gray-500 truncate">Administrator</p>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="w-full text-gray-400">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </aside>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HEADER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[];
}

const AdminHeader: React.FC<HeaderProps> = ({ breadcrumbs }) => (
  <header className="bg-white border-b px-6 py-4">
    <div className="flex items-center justify-between">
      <Breadcrumb items={breadcrumbs} />
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            3
          </span>
        </Button>
      </div>
    </div>
  </header>
);

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACCESS CARDS
// ─────────────────────────────────────────────────────────────────────────────

const QuickAccessCards: React.FC = () => {
  const cards = [
    {
      title: 'User Management',
      description: 'Add, edit, or remove users and manage roles',
      icon: Users,
      path: '/admin/users',
      color: 'blue',
    },
    {
      title: 'Security Settings',
      description: 'Configure authentication and security policies',
      icon: Shield,
      path: '/admin/security/settings',
      color: 'red',
    },
    {
      title: 'Compliance Dashboard',
      description: 'Monitor regulatory compliance status',
      icon: Award,
      path: '/admin/compliance',
      color: 'purple',
    },
    {
      title: 'Audit Trail',
      description: 'View and export audit logs',
      icon: History,
      path: '/admin/compliance/audit',
      color: 'green',
    },
    {
      title: 'Activity Monitor',
      description: 'Real-time system activity tracking',
      icon: Activity,
      path: '/admin/monitoring',
      color: 'orange',
    },
    {
      title: 'Training Management',
      description: 'Manage compliance training programs',
      icon: BookOpen,
      path: '/admin/compliance/training',
      color: 'cyan',
    },
  ];

  const colorClasses: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', iconBg: 'bg-red-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', iconBg: 'bg-purple-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-orange-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', iconBg: 'bg-cyan-100' },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        const colors = colorClasses[card.color];

        return (
          <Link key={card.path} to={card.path}>
            <Card className={`hover:shadow-md transition-shadow cursor-pointer ${colors.bg}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${colors.iconBg}`}>
                    <Icon className={`h-6 w-6 ${colors.text}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{card.title}</h3>
                    <p className="text-sm text-gray-600">{card.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────

const AdminHomePage: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="text-gray-500">
        Welcome to the Concept2Cure Admin Portal. Manage users, security, and compliance.
      </p>
    </div>

    <QuickAccessCards />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { action: 'User login', user: 'Dr. Sarah Chen', time: '2 min ago' },
              { action: 'Document approved', user: 'Dr. Michael Park', time: '15 min ago' },
              { action: 'Role assigned', user: 'Admin', time: '1 hour ago' },
              { action: 'Password reset', user: 'System', time: '2 hours ago' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="font-medium text-sm">{item.action}</p>
                  <p className="text-xs text-gray-500">{item.user}</p>
                </div>
                <span className="text-xs text-gray-400">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alerts & Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { type: 'warning', message: '3 users have expiring training', action: 'View' },
              { type: 'info', message: '2 pending access requests', action: 'Review' },
              { type: 'success', message: 'Compliance score: 94%', action: 'Details' },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  item.type === 'warning'
                    ? 'bg-amber-50'
                    : item.type === 'success'
                      ? 'bg-green-50'
                      : 'bg-blue-50'
                }`}
              >
                <p className="text-sm">{item.message}</p>
                <Button variant="ghost" size="sm">
                  {item.action}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN PORTAL LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export const AdminPortalLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const location = useLocation();

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];

    // Build breadcrumbs from path
    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      if (segment === 'admin') return; // Skip 'admin' in breadcrumbs

      const label = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      breadcrumbs.push({
        label,
        path: index < pathSegments.length - 1 ? currentPath : undefined,
      });
    });

    return breadcrumbs;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <AdminSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader breadcrumbs={getBreadcrumbs()} />

        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Dashboard */}
              <Route index element={<AdminHomePage />} />

              {/* User Management */}
              <Route path="users" element={<UserManagement />} />
              <Route path="users/roles" element={<RolePermissionManager />} />
              <Route path="users/access-matrix" element={<AccessControlMatrix />} />
              <Route path="users/delegation" element={<DelegationOfAuthority />} />

              {/* Organizations */}
              <Route path="organizations" element={<OrganizationManagement />} />

              {/* Security */}
              <Route path="security" element={<Navigate to="/admin/security/settings" replace />} />
              <Route path="security/settings" element={<SecuritySettings />} />
              <Route path="security/sessions" element={<SessionManager />} />
              <Route path="security/ip-allowlist" element={<IPAllowlistManagement />} />
              <Route path="security/alerts" element={<SecurityAlerts />} />

              {/* Compliance */}
              <Route path="compliance" element={<ComplianceDashboard />} />
              <Route path="compliance/audit" element={<AuditTrailViewer />} />
              <Route path="compliance/training" element={<TrainingManagement />} />

              {/* Monitoring */}
              <Route path="monitoring" element={<ActivityMonitor />} />

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES (Outside Admin Layout)
// ─────────────────────────────────────────────────────────────────────────────

export const AuthRoutes: React.FC = () => {
  const handleOnboardingComplete = useCallback(async (data: any) => {
      const organizationId = getOrgId();
      if (!organizationId) {
        throw new Error('No organization context is available for onboarding.');
      }

      const onboardingProfile = {
        version: 1,
        completedAt: new Date().toISOString(),
        organization: {
          name: data.organizationName,
          domain: data.domain,
          country: data.country,
          industry: data.industry,
          businessModel: data.businessModel,
          archetypeId: data.archetype?.id || null,
        },
        subscription: {
          tier: data.subscriptionTier,
          modelPack: data.modelPack,
          selectedModules: data.selectedModules,
          estimatedSeats: data.estimatedSeats,
          estimatedStorageGB: data.estimatedStorageGB,
          billingEmail: data.billingEmail,
          billingCycle: data.billingCycle,
        },
        compliance: data.complianceCustomizations,
        onboardingAdmin: {
          adminEmail: data.adminEmail,
          adminName: data.adminName,
          initialUsers: data.initialUsers,
        },
      };

      const res = await fetch(`/api/organizations/${organizationId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          onboardingProfile,
          onboardingStatus: 'company_onboarding_completed',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || err?.message || 'We could not persist organization onboarding settings.'
        );
      }
  }, []);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="mfa-setup" element={<MFASetup />} />
        <Route path="password-reset" element={<PasswordReset />} />
        <Route
          path="onboarding"
          element={<OnboardingWizard onComplete={handleOnboardingComplete} />}
        />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </Suspense>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  ADMIN_NAV_ITEMS as adminNavItems,
  AdminSidebar,
  AdminHeader,
  Breadcrumb,
  LoadingFallback,
  QuickAccessCards,
  AdminHomePage,
};

export default AdminPortalLayout;
