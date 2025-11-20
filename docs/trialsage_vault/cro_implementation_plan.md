# TrialSage Client Portal Implementation Plan: CRO Multi-Client Support

## Executive Summary

This implementation plan outlines the development roadmap for transforming TrialSage from a single-organization platform to a comprehensive enterprise solution supporting CRO master accounts managing multiple biotech clients.

The enhanced system will feature:

- Full multi-tier hierarchy (CRO → Client → Program → Study)
- Tenant isolation with enterprise-grade security architecture
- Contract and project tracking for client engagements
- CRO-specific dashboards and analytics
- Context-aware AI assistance
- Comprehensive regulatory compliance controls

## Implementation Phases

### Phase 1: Core Database & Authentication Architecture (Weeks 1-4)

#### 1.1 Database Schema Enhancement

- Extend database schema to support CRO multi-client hierarchy
- Implement tenant-aware relationships for all entities
- Create row-level security policies for tenant isolation
- Set up audit logging infrastructure for all data changes

**Key Deliverables:**

- Enhanced schema with CRO, client, program, and study relationships
- Row-level security implementation for multi-tenant data access
- Database migration scripts for existing installations
- Comprehensive data access layer with tenant context enforcement

#### 1.2 Authentication & Authorization System

- Implement enterprise SSO integration (SAML/OIDC)
- Develop tenant-aware role-based access control system
- Create user management interfaces for CRO administrators
- Build client organization management console

**Key Deliverables:**

- SSO integration with major identity providers
- Enhanced permission system supporting cross-tenant roles
- User management interfaces for CRO and client administrators
- Organization management console for CRO administrators

### Phase 2: Client/Program/Study Management (Weeks 5-8)

#### 2.1 Client Management

- Develop CRO client organization creation and management
- Implement client settings and configuration
- Create client-specific dashboard shell
- Build client user management interfaces

**Key Deliverables:**

- Client organization creation and management interface
- Client settings configuration panel
- Client dashboard framework with basic metrics
- Client user management with role assignment

#### 2.2 Program & Study Management

- Implement program creation and management within clients
- Develop study creation and configuration within programs
- Build hierarchical navigation system across all levels
- Create context switching interface for CRO users

**Key Deliverables:**

- Program management interface with client context
- Study creation and configuration interface
- Hierarchical navigation system (breadcrumbs, context switching)
- Context-aware module loading framework

### Phase 3: Contract & Project Tracking (Weeks 9-12)

#### 3.1 Contract Management

- Develop contract metadata tracking system
- Implement contract milestone and deliverable tracking
- Create contract financial data management
- Build contract document linkage to vault system

**Key Deliverables:**

- Contract creation and management interface
- Milestone and deliverable tracking system
- Contract financial dashboard
- Document management integration for contracts

#### 3.2 Project Tracking

- Implement project status tracking across hierarchy
- Develop resource allocation tracking
- Build timeline visualization for projects
- Create project risk assessment framework

**Key Deliverables:**

- Project status tracking interface
- Resource allocation management system
- Interactive timeline visualization
- Risk assessment and management interface

### Phase 4: CRO Dashboards & Analytics (Weeks 13-16)

#### 4.1 Cross-Client Dashboards

- Develop CRO executive dashboard with cross-client metrics
- Implement client management dashboard
- Create regulatory submission tracking dashboard
- Build resource utilization dashboard

**Key Deliverables:**

- CRO executive dashboard with portfolio overview
- Client management dashboard with performance metrics
- Regulatory submission tracking across clients
- Resource utilization visualization and management

#### 4.2 Analytics Framework

- Implement cross-client analytics engine
- Develop financial analytics module
- Create operational analytics
- Build regulatory intelligence analytics

**Key Deliverables:**

- Cross-client analytics framework with tenant isolation
- Financial analytics interfaces for CRO management
- Operational performance metrics and analytics
- Regulatory intelligence analytics with insights

### Phase 5: AI Assistant Enhancement (Weeks 17-20)

#### 5.1 Context-Aware AI Framework

- Implement hierarchical context management for AI
- Develop client-aware prompting system
- Create role-based response tailoring
- Build multi-context RAG implementation

**Key Deliverables:**

- Context-aware AI assistant framework
- Client-specific knowledge retrieval system
- Role-based response customization
- Secure multi-tenant vector storage implementation

#### 5.2 Advanced AI Features

- Implement cross-document intelligence across contexts
- Develop deliverable generation with context awareness
- Create regulatory analysis with client-specific guidelines
- Build proactive notification system

**Key Deliverables:**

- Cross-document intelligence with tenant isolation
- Context-aware document generation system
- Regulatory analysis framework with client customization
- Proactive notification engine with context awareness

### Phase 6: Security & Compliance Enhancements (Weeks 21-24)

#### 6.1 Multi-Tenant Security

- Implement tenant identification layer
- Develop cross-tenant protection mechanisms
- Create tenant-specific encryption
- Build security monitoring for cross-tenant access attempts

**Key Deliverables:**

- Tenant identification and context enforcement
- Cross-tenant protection mechanisms
- Client-specific encryption implementation
- Security monitoring and alerting system

#### 6.2 Regulatory Compliance

- Implement 21 CFR Part 11 compliance features
- Develop electronic signature system with tenant awareness
- Create audit trail with tenant context
- Build compliance reporting framework

**Key Deliverables:**

- CFR Part 11 compliant features across platform
- Electronic signature system with tenant context
- Comprehensive audit trail implementation
- Compliance reporting system for regulatory requirements

## Technical Architecture

### Database Layer

#### Enhanced Schema

The database schema will be extended to support the multi-tenant CRO-client structure:

```sql
-- Core Organizations (CROs and Clients)
CREATE TABLE organizations (
    org_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    org_type VARCHAR(50) NOT NULL, -- 'CRO' or 'CLIENT'
    parent_org_id UUID REFERENCES organizations(org_id), -- For clients, points to CRO
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    settings JSONB
);

-- Programs within Clients
CREATE TABLE programs (
    program_id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    therapeutic_area VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL, -- User who created
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Studies within Programs
CREATE TABLE studies (
    study_id UUID PRIMARY KEY,
    program_id UUID NOT NULL REFERENCES programs(program_id),
    org_id UUID NOT NULL REFERENCES organizations(org_id), -- Denormalized for query performance
    name VARCHAR(255) NOT NULL,
    protocol_number VARCHAR(100),
    phase VARCHAR(20),
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNING',
    start_date DATE,
    end_date DATE,
    lead_id UUID, -- Study lead
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Contracts between CRO and Clients
CREATE TABLE contracts (
    contract_id UUID PRIMARY KEY,
    cro_id UUID NOT NULL REFERENCES organizations(org_id),
    client_id UUID NOT NULL REFERENCES organizations(org_id),
    contract_number VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    effective_date DATE,
    expiration_date DATE,
    value DECIMAL,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Row-Level Security Policies
-- Example for studies table
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;

-- Policy for CRO users (can see all studies for clients under their CRO)
CREATE POLICY cro_studies_policy ON studies
    USING (org_id IN (
        SELECT client_id FROM client_organizations
        WHERE cro_id = current_setting('app.current_cro_id')::UUID
    ));

-- Policy for client users (can only see their own studies)
CREATE POLICY client_studies_policy ON studies
    USING (org_id = current_setting('app.current_client_id')::UUID);
```

### API Layer

The API layer will be enhanced to support the multi-tenant structure with proper context management:

```javascript
// Example API middleware for tenant context
const tenantContextMiddleware = async (req, res, next) => {
  try {
    // Extract tenant info from authenticated user
    const { userId, orgId, orgType } = req.user;

    // Set tenant context for database queries
    if (orgType === 'CRO') {
      // CRO users get their CRO ID set
      req.tenantContext = {
        cro_id: orgId,
        client_id: req.params.clientId || req.query.clientId, // Optional client context
      };
    } else {
      // Client users get their client ID set
      req.tenantContext = {
        client_id: orgId,
      };

      // Look up the parent CRO
      const client = await db.organizations.findOne({
        where: { org_id: orgId, org_type: 'CLIENT' },
      });

      if (client && client.parent_org_id) {
        req.tenantContext.cro_id = client.parent_org_id;
      }
    }

    // Set database session variables for RLS policies
    await db.query(`
      SET LOCAL app.current_user_id = '${userId}';
      SET LOCAL app.current_client_id = '${req.tenantContext.client_id || ''}';
      SET LOCAL app.current_cro_id = '${req.tenantContext.cro_id || ''}';
    `);

    next();
  } catch (error) {
    next(error);
  }
};

// Example API routes for CRO client management
router.get('/api/cro/clients', tenantContextMiddleware, async (req, res) => {
  // Get all clients for the CRO
  const clients = await db.organizations.findAll({
    where: {
      parent_org_id: req.tenantContext.cro_id,
      org_type: 'CLIENT',
    },
  });

  res.json(clients);
});

router.post('/api/cro/clients', tenantContextMiddleware, async (req, res) => {
  // Create a new client for the CRO
  const { name, settings } = req.body;

  const newClient = await db.organizations.create({
    name,
    org_type: 'CLIENT',
    parent_org_id: req.tenantContext.cro_id,
    settings: settings || {},
    created_by: req.user.userId,
  });

  res.status(201).json(newClient);
});
```

### Frontend Architecture

The frontend will be enhanced to support the CRO-client context management:

```typescript
// Context provider for tenant context
interface TenantContext {
  croId: string | null;
  clientId: string | null;
  programId: string | null;
  studyId: string | null;
  setContext: (context: Partial<TenantContext>) => void;
  canAccessClient: (clientId: string) => boolean;
}

const TenantContext = createContext<TenantContext>({
  croId: null,
  clientId: null,
  programId: null,
  studyId: null,
  setContext: () => {},
  canAccessClient: () => false
});

// TenantProvider component
const TenantProvider: React.FC = ({ children }) => {
  const [croId, setCroId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const { user } = useAuth();

  const setContext = useCallback((context: Partial<TenantContext>) => {
    if (context.croId !== undefined) setCroId(context.croId);
    if (context.clientId !== undefined) setClientId(context.clientId);
    if (context.programId !== undefined) setProgramId(context.programId);
    if (context.studyId !== undefined) setStudyId(context.studyId);
  }, []);

  const canAccessClient = useCallback((clientId: string) => {
    // CRO admins can access any client under their CRO
    if (user?.orgType === 'CRO' && user?.role === 'ADMIN') return true;

    // Users can access their own client
    if (user?.orgId === clientId) return true;

    // Other access rules...
    return false;
  }, [user]);

  // Reset lower levels when higher level changes
  useEffect(() => {
    if (!clientId) {
      setProgramId(null);
      setStudyId(null);
    }
  }, [clientId]);

  useEffect(() => {
    if (!programId) {
      setStudyId(null);
    }
  }, [programId]);

  return (
    <TenantContext.Provider value={{
      croId,
      clientId,
      programId,
      studyId,
      setContext,
      canAccessClient
    }}>
      {children}
    </TenantContext.Provider>
  );
};

// Context-aware component example
const ClientSelector: React.FC = () => {
  const { croId, setContext } = useContext(TenantContext);
  const { data: clients, isLoading } = useQuery(['clients', croId],
    () => api.get(`/api/cro/clients?croId=${croId}`).then(res => res.data)
  );

  const handleClientChange = (clientId: string) => {
    setContext({ clientId, programId: null, studyId: null });
  };

  if (isLoading) return <Spinner />;

  return (
    <Select
      label="Select Client"
      options={clients.map(c => ({ label: c.name, value: c.org_id }))}
      onChange={handleClientChange}
    />
  );
};
```

## CRO Dashboard Framework

The CRO Dashboard will provide cross-client insights while maintaining tenant isolation:

```typescript
// Example CRO Executive Dashboard
const CROExecutiveDashboard: React.FC = () => {
  const { croId } = useContext(TenantContext);
  const { data, isLoading } = useQuery(['cro-dashboard', croId],
    () => api.get(`/api/cro/${croId}/dashboard`).then(res => res.data)
  );

  if (isLoading) return <DashboardSkeleton />;

  return (
    <DashboardLayout>
      <DashboardHeader
        title="CRO Executive Dashboard"
        subtitle={`${data.clientCount} Active Clients · ${data.studyCount} Active Studies`}
      />

      <DashboardGrid>
        {/* Client Portfolio Overview */}
        <DashboardCard title="Client Portfolio" size="medium">
          <ClientPortfolioChart data={data.clientPortfolio} />
        </DashboardCard>

        {/* Regulatory Submissions Status */}
        <DashboardCard title="Regulatory Submissions" size="medium">
          <SubmissionsStatusChart data={data.regulatorySubmissions} />
        </DashboardCard>

        {/* Upcoming Milestones */}
        <DashboardCard title="Upcoming Milestones" size="large">
          <MilestoneTimeline milestones={data.upcomingMilestones} />
        </DashboardCard>

        {/* Resource Utilization */}
        <DashboardCard title="Resource Utilization" size="medium">
          <ResourceUtilizationChart data={data.resourceUtilization} />
        </DashboardCard>

        {/* Risk Assessment */}
        <DashboardCard title="Risk Assessment" size="medium">
          <RiskAssessmentHeatmap data={data.riskAssessment} />
        </DashboardCard>

        {/* Financial Overview */}
        <DashboardCard title="Financial Overview" size="large">
          <FinancialMetricsTable data={data.financialMetrics} />
        </DashboardCard>
      </DashboardGrid>
    </DashboardLayout>
  );
};
```

## Context-Aware AI Assistant

The AI Assistant will be enhanced to dynamically adjust to client/program/study context:

```typescript
// AI Assistant Context Management
interface AIAssistantContext {
  cro_id?: string;
  client_id?: string;
  program_id?: string;
  study_id?: string;
  user_role: string;
  module_context?: string; // e.g., 'vault', 'ind-wizard'
}

// Backend handler for AI queries
async function handleAIQuery(query: string, context: AIAssistantContext) {
  // 1. Build context-specific system prompt
  let systemPrompt = "You are TrialSage AI Assistant, a helpful expert in clinical trials and regulatory submissions.";

  // Add specific context
  if (context.client_id) {
    const client = await db.organizations.findByPk(context.client_id);
    systemPrompt += `\nYou are currently assisting with ${client.name}'s projects.`;
  }

  if (context.study_id) {
    const study = await db.studies.findByPk(context.study_id);
    systemPrompt += `\nSpecifically, you are focused on the study "${study.name}" (${study.protocol_number}).`;
  }

  // Add role-specific instruction
  if (context.user_role === 'CRO_ADMIN') {
    systemPrompt += "\nThe user is a CRO administrator who oversees multiple client projects.";
  } else if (context.user_role === 'CLIENT_ADMIN') {
    systemPrompt += "\nThe user is a client administrator who manages their organization's studies.";
  }

  // 2. Retrieve relevant documents based on context
  const relevantDocs = await retrieveRelevantDocuments(query, context);

  // 3. Build full prompt with context and relevant information
  const fullPrompt = buildPromptWithContext(query, systemPrompt, relevantDocs);

  // 4. Call AI model with appropriate context
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemPrompt },
      ...relevantDocs.map(doc => ({
        role: "system",
        content: `Relevant document: ${doc.title}\n${doc.content}`
      })),
      { role: "user", content: query }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  // 5. Log interaction with context for audit
  await logAIInteraction({
    query,
    response: response.choices[0].message.content,
    context,
    timestamp: new Date(),
    user_id: context.user_id
  });

  return response.choices[0].message.content;
}

// Frontend AI Assistant component
const AIAssistant: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { croId, clientId, programId, studyId } = useContext(TenantContext);
  const { user } = useAuth();

  const submitQuery = async () => {
    const context: AIAssistantContext = {
      cro_id: croId,
      client_id: clientId,
      program_id: programId,
      study_id: studyId,
      user_role: user.role,
      module_context: getCurrentModuleContext()
    };

    const response = await api.post('/api/ai/query', {
      query,
      context
    });

    // Display response
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        <AIIcon /> Ask TrialSage Assistant
      </button>

      {isOpen && (
        <AIAssistantPanel onClose={() => setIsOpen(false)}>
          <AIContextDisplay
            client={clientId ? getClientName(clientId) : 'All Clients'}
            study={studyId ? getStudyName(studyId) : 'All Studies'}
          />

          <AIQueryInput
            value={query}
            onChange={setQuery}
            onSubmit={submitQuery}
            placeholder="Ask about regulations, study design, or get help with documents..."
          />

          <AIResponseArea>
            {/* Response content */}
          </AIResponseArea>
        </AIAssistantPanel>
      )}
    </>
  );
};
```

## Resource Requirements

### Development Team

- 1 Project Manager
- 2 Backend Developers (Java/Node.js)
- 2 Frontend Developers (React)
- 1 Database Specialist (PostgreSQL)
- 1 Security Engineer
- 1 DevOps Engineer
- 1 QA Engineer
- 1 UI/UX Designer

### Infrastructure

- Multi-tenant PostgreSQL database with PgVector extension
- Document storage (S3/Azure Blob)
- Vector database for AI embeddings
- Kubernetes cluster for microservices
- CI/CD pipeline for continuous deployment
- Monitoring and alerting system

### External Services

- OpenAI API or Azure OpenAI Service
- Identity provider integration (Auth0, Okta, or Azure AD)
- Email/notification service

## Risk Assessment and Mitigation

| Risk                                          | Likelihood | Impact   | Mitigation                                                                                                                                                        |
| --------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data leakage between tenants                  | Low        | Critical | Implement comprehensive testing of row-level security; conduct security audit by third party; implement monitoring for suspicious access patterns                 |
| Performance degradation with multiple tenants | Medium     | High     | Design for scale from beginning; implement database sharding strategy; use caching for common queries; conduct load testing with simulated multi-tenant scenarios |
| Complex permission model leading to errors    | Medium     | High     | Implement robust test suite for permissions; create visual permission diagnostics tool; conduct regular permission audits                                         |
| AI context leakage                            | Low        | Critical | Implement strict context validation; maintain separate vector stores; apply privacy filtering to AI inputs; log and audit all AI interactions                     |
| Regulatory compliance gaps                    | Medium     | Critical | Engage compliance consultant for review; implement comprehensive audit trails; conduct validation testing against 21 CFR Part 11 requirements                     |

## Conclusion

This implementation plan provides a comprehensive roadmap for enhancing TrialSage to support CRO master accounts managing multiple biotech clients. By following this phased approach, we can deliver a secure, scalable, and feature-rich platform that meets the needs of enterprise CRO organizations while maintaining strict data isolation and regulatory compliance.

The architecture emphasizes:

- Clear separation of client data through robust tenant isolation
- Flexible role-based permissions across the organizational hierarchy
- Powerful cross-client analytics for CRO management
- Context-aware AI assistance that respects tenant boundaries
- Enterprise-grade security and compliance features

With this implementation, TrialSage will position itself as a leading platform for CRO organizations managing complex portfolios of biotech clients and their associated regulatory programs and studies.
