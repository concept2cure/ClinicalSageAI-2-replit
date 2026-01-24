-- Core tables for TrialSage CRO platform
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'CRO' | 'CLIENT'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY, -- Supabase UID
  email TEXT NOT NULL
);

CREATE TABLE user_organizations (
  user_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL,
  PRIMARY KEY(user_id, org_id)
);

CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  program_id UUID REFERENCES programs(id),
  phase TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);