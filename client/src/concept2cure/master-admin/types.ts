/**
 * Master Administration — shared payload types.
 *
 * These mirror the JSON shapes returned by /api/admin/master/* (see
 * server/routes/admin/master-admin.ts). Numbers come back as JS numbers;
 * timestamps as ISO strings (or null).
 */

export interface OverviewPayload {
  tenants: { total: number; active: number; suspended: number; new_30d: number };
  users: {
    total: number;
    active: number;
    suspended: number;
    active_30d: number;
    new_30d: number;
  };
  usage: { credits_30d: number; events_30d: number };
  modules: { enabled: number };
  audit: { last_24h: number; last_7d: number };
  tiers: Array<{ tier: string; count: number }>;
  generatedAt: string;
}

export interface TenantRow {
  id: number;
  name: string;
  slug: string;
  tier: string;
  status: string;
  client_type: string;
  seats_purchased: number | null;
  max_users: number | null;
  payment_status: string | null;
  created_at: string;
  member_count: number;
  last_active: string | null;
  enabled_modules: number;
  credits_30d: number;
}

export interface TenantDetailPayload {
  tenant: {
    id: number;
    name: string;
    slug: string;
    domain: string | null;
    tier: string;
    status: string;
    client_type: string;
    billing_cycle: string | null;
    payment_status: string | null;
    seats_purchased: number | null;
    max_users: number | null;
    max_projects: number | null;
    max_storage: number | null;
    trial_ends_at: string | null;
    next_billing_date: string | null;
    created_at: string;
    updated_at: string;
  };
  members: Array<{
    id: number;
    name: string;
    email: string;
    title: string | null;
    status: string;
    last_login: string | null;
    mfa_enabled: boolean | null;
    role: string;
  }>;
  modules: Array<{
    module_id: string;
    name: string | null;
    category: string | null;
    enabled: boolean;
    enabled_at: string | null;
    updated_at: string | null;
  }>;
  usage: Array<{ feature_id: string; credits: number; events: number }>;
  recentAudit: AuditEvent[];
}

export interface PlatformUser {
  id: number;
  email: string;
  name: string;
  title: string | null;
  status: string;
  last_login: string | null;
  mfa_enabled: boolean | null;
  created_at: string;
  memberships: Array<{ orgId: number; orgName: string; role: string }>;
}

export interface ModuleEntitlement {
  module_id: string;
  name: string | null;
  category: string | null;
  description: string | null;
  enabled_orgs: number;
  total_subscriptions: number;
}

export interface SystemHealthPayload {
  status: 'healthy' | 'degraded';
  database: { ok: boolean; pool: { total?: number; idle?: number; waiting?: number } };
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    env: string;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  };
  generatedAt: string;
}

export interface AuditEvent {
  id: string;
  tenant_id: number | null;
  user_id: number | null;
  action: string;
  table_name: string;
  record_id: string;
  ip_address: string | null;
  created_at: string;
  actor_email?: string | null;
  tenant_name?: string | null;
}

export interface AuditPayload {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export type StatusValue = 'active' | 'suspended' | 'inactive';

export interface BillingPayload {
  byPaymentStatus: Array<{ payment_status: string; count: number }>;
  trialsEndingSoon: Array<{ id: number; name: string; slug: string; tier: string; trial_ends_at: string }>;
  pastDue: Array<{
    id: number;
    name: string;
    slug: string;
    tier: string;
    payment_status: string | null;
    next_billing_date: string | null;
  }>;
  unacknowledgedAlerts: Array<{
    id: number;
    organization_id: number;
    type: string;
    threshold: number | null;
    message: string;
    created_at: string;
    organization_name: string | null;
  }>;
}

export interface FeatureFlag {
  id: number;
  feature_key: string;
  description: string | null;
  enabled: boolean;
  enabled_for_organization_ids: number[] | null;
  enabled_for_client_workspace_ids: number[] | null;
  updated_at: string;
}

export interface ConnectorHealth {
  id: number;
  organization_id: number;
  connector_id: string;
  is_valid: boolean | null;
  last_validated_at: string | null;
  created_at: string;
  organization_name: string | null;
}

export interface ResearchJob {
  id: number;
  organization_id: number | null;
  status: string;
  progress: number | null;
  credits_used: number | null;
  created_at: string;
  completed_at: string | null;
  organization_name: string | null;
}

export interface JobsPayload {
  jobs: ResearchJob[];
  summary7d: Array<{ status: string; count: number }>;
}

export interface CatalogModule {
  module_id: string;
  name: string | null;
  category: string | null;
}
