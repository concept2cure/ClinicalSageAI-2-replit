/**
 * Concept2Cure Client Portal V2 - Unified Dashboard
 *
 * Smart dashboard that renders the appropriate role-based view
 * based on the current user's role and permissions.
 *
 * @version 2.0.0
 */

import React, { Suspense, lazy } from 'react';
import { usePortal } from '../../core/portalContext';
import type { UserRole } from '../../core/portalTypes';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load dashboard components for better performance
const ExecutiveDashboard = lazy(() => import('./ExecutiveDashboard'));
const RegulatoryLeadDashboard = lazy(() => import('./RegulatoryLeadDashboard'));
const ClinicalOpsDashboard = lazy(() => import('./ClinicalOpsDashboard'));

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>

    {/* Metrics skeleton */}
    <div className="grid gap-4 md:grid-cols-4">
      {[1, 2, 3, 4].map(i => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Main content skeleton */}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map roles to their primary dashboard component
 */
const ROLE_DASHBOARD_MAP: Partial<Record<UserRole, React.ComponentType>> = {
  admin: RegulatoryLeadDashboard,
  regulatory_lead: RegulatoryLeadDashboard,
  clinical_ops: ClinicalOpsDashboard,
  medical_writer: RegulatoryLeadDashboard,
  biostatistician: ClinicalOpsDashboard,
  quality_assurance: RegulatoryLeadDashboard,
  legal_counsel: ExecutiveDashboard,
  executive: ExecutiveDashboard,
  cmc_specialist: RegulatoryLeadDashboard,
  safety_officer: ClinicalOpsDashboard,
  project_manager: ExecutiveDashboard,
  viewer: ExecutiveDashboard,
  external_partner: ExecutiveDashboard,
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface UnifiedDashboardProps {
  /** Force a specific dashboard type regardless of role */
  forceType?: 'executive' | 'regulatory' | 'clinical';
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({ forceType }) => {
  const { currentRole } = usePortal();

  // Determine which dashboard to render
  let DashboardComponent: React.ComponentType;

  if (forceType) {
    switch (forceType) {
      case 'executive':
        DashboardComponent = ExecutiveDashboard;
        break;
      case 'regulatory':
        DashboardComponent = RegulatoryLeadDashboard;
        break;
      case 'clinical':
        DashboardComponent = ClinicalOpsDashboard;
        break;
      default:
        DashboardComponent = ExecutiveDashboard;
    }
  } else {
    DashboardComponent = ROLE_DASHBOARD_MAP[currentRole] || ExecutiveDashboard;
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardComponent />
    </Suspense>
  );
};

export default UnifiedDashboard;
