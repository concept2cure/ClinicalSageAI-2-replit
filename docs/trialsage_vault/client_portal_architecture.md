# TrialSage Vault Client Portal: System Design Blueprint

## High-Level System Architecture

The TrialSage Vault client portal is designed as a modern multi-tier web application, with a clear separation between front-end, back-end, and data layers for scalability and maintainability. The architecture follows **industrial SaaS standards** (high availability, multi-tenancy, robust security) and is optimized for deployment on Replit's cloud environment. Key components include:

- **Front-End:** A **React** single-page application (SPA) built with **Vite**, providing a dynamic and responsive UI. The UI follows a Microsoft 365-style design language for familiarity and elegance, with role-based dashboards and intuitive document-centric workflows. The front-end communicates with the backend via RESTful APIs (or GraphQL) over HTTPS and uses web sockets for real-time updates (e.g., live notifications, collaborative editing signals). It also embeds interactive AI components that guide users through complex tasks.

- **Back-End:** A **Node.js** server (e.g., using Express or NestJS) that serves the REST/GraphQL API and implements the core business logic. The backend is structured into modules/microservices corresponding to major domains: **Auth**, **Project/Study Management**, **Document Management**, **Workflow Engine**, **AI Assistant**, and **Analytics**. This modular design ensures each service is cohesive and can scale independently if needed.

  - **Database:** A **Supabase** (PostgreSQL) database holds structured data (projects, users, documents metadata, audit logs, etc.), enabling relational queries and robust transactions. Supabase's row-level security is used to enforce tenant isolation and role-based data access (each SQL query is automatically scoped to the user's organization/permissions). This multi-tenant approach ensures data for different biotech clients is securely partitioned at the database level.
  - **File Storage:** Document files (e.g. PDFs, Word, images) are stored in a secure **object storage** (Supabase Storage or an S3-compatible service). Each file is encrypted at rest and tagged with metadata (owner, project, version, etc.). A content delivery mechanism streams documents to users with access, and virus scanning is applied to all uploads.
  - **AI Integration:** The back-end integrates with **OpenAI (GPT-4)** or similar AI services for the intelligent assistant and document analysis features. For data privacy and compliance, all prompts are filtered to remove sensitive identifiers, and if needed an on-premise or private instance of the model can be used. A **vector database** (either PostgreSQL with pgvector or an external service like Pinecone) is included to enable **Retrieval-Augmented Generation (RAG)**: the system can answer questions using knowledge from your organizational documents.
  - **Third-Party Integrations:** Modules integrate with external systems as needed. For example, a **DocuSign/Adobe Sign API** for electronic signatures (Part 11 compliant signing), **identity providers** for SSO (OAuth2/OIDC with corporate AD), and optionally **DocuShare** or other document repositories for legacy data migration. (The portal can sync or import documents from external systems like Xerox DocuShare, ensuring continuity of document management.)

- **Real-Time & Background Services:** A real-time **notification service** (possibly via web sockets or Supabase's real-time channels) pushes updates to users (e.g., a document status change or a new comment). A background job worker (could be a Node worker thread or serverless function) handles intensive tasks such as generating large reports, performing AI batch analyses (like auto-tagging new documents, or re-indexing content), and sending scheduled email alerts.

- **Deployment & Scalability:** The entire system is containerized for Replit deployment. Replit can host the Node backend and static front-end as a unified deployment (or separate Repls for API and front-end if needed). The design is **cloud-agnostic** to allow future migration, but optimized for Replit's always-on container and horizontal scaling if demand grows.

In summary, the architecture is a flexible **modular monolith** that can evolve into microservices as needed. It emphasizes separation of concerns: the front-end for presentation and persona-specific UX, the Node backend for API and orchestration, the database for persistence, and external services for specialized capabilities (AI, BI, search). This separation, combined with strong integration points, allows rapid development and testing on Replit and smooth future expansion.

## Feature and Module Breakdown

The client portal is composed of multiple integrated modules, each providing distinct features while working together in a unified platform. Below is a breakdown of the core features and modules:

### Multi-Persona Role Management

The system supports multiple user personas – **CEO, Investor, Clinical Operations, Medical Writer, Regulatory Affairs, and CMC** – each with tailored access and views. A robust **Role-Based Access Control (RBAC)** system is built in, defining fine-grained permissions for each role (e.g., Investors might have read-only access to certain summary data, while Regulatory Affairs can approve documents, etc.).

### Project & Study Management

The platform is **multi-project and multi-study** by design, allowing organizations to manage an entire portfolio of clinical trials and regulatory projects in one place. Users can create and configure new **Projects** (e.g., a specific drug development program or product line) and under each project, track one or more **Studies/Trials**. Each study has attributes like phase (I, II, III, etc.), status, timeline, and team members.

### Document Management & Vault Module

This is the heart of TrialSage Vault – an **enterprise-grade document repository** with advanced lifecycle management, version control, and compliance features. Users can upload or create documents and organize them in **smart folders** (the system can offer default folders for common categories like _Regulatory_, _CMC_, _Quality_, etc., possibly mirroring CTD structure or internal taxonomy). Key capabilities of this module include:

- **Document Lifecycle Workflow:** Each document progresses through states: _Draft_, _In Review_, _Approved/Finalized_, _Superseded_, and _Archived_. Transitions can be controlled by role (e.g., only a Regulatory Affairs manager can mark a document as Approved). The system enforces **21 CFR Part 11-compliant** controls on these transitions – for example, requiring an electronic signature to approve a document, and capturing a time-stamped audit entry on every status change.

- **Version Control:** All document edits or new uploads create a new version, while preserving previous versions for reference. Users can easily compare versions side-by-side. An **AI-powered comparison** feature highlights changes in wording or data between versions to aid reviewers (leveraging NLP to detect even subtle modifications).

- **Metadata & Smart Tagging:** Every document is richly annotated with metadata – author, creation date, associated project and study, document type, regulatory category (e.g., whether it belongs to a specific CTD module or is a SOP, etc.), and custom tags. An **AI tagging service** scans content upon upload to suggest tags and identify regulatory context.

- **Smart Folders & Filters:** Users can dynamically filter and view documents based on metadata. The UI allows filtering by attributes like document type, author, date, tag, or status. Folders can be virtual (saved searches) or physical; e.g., a _CMC Documents_ folder might automatically include anything tagged as CMC.

- **Search and Semantic Query:** A **Semantic Search** engine is integrated, allowing users to search documents by content meaning, not just exact keywords. This uses NLP to interpret queries (even plain English questions) and find relevant documents or passages.

- **Access Control & Sharing:** Document permissions are strictly controlled. By default, documents are accessible only to project team members with appropriate roles. Fine-grained access rules can restrict certain folders to specific roles (e.g., Investor role may not access internal meeting minutes).

- **Audit Trails:** Every action on a document is logged in a tamper-evident audit trail (viewable by admins or compliance officers). The audit log records who viewed, edited, approved, or downloaded a document, with timestamp and IP/device info.

- **Retention & Compliance Policies:** An **Auto-Retention Scheduler** is included. Admins can define retention rules (e.g., "Archive trial documents 2 years after study completion" or "Delete draft documents that were never finalized after 5 years" in compliance with company policy or regulations).

### AI-Powered Regulatory Intelligence Assistant

The **AI Assistant** is a core differentiating feature of the portal, offering users intelligent guidance across all areas of the platform. This isn't just a chatbot, but a domain-specific expert system trained on pharmaceutical regulatory knowledge and integrated with your organization's document corpus. The assistant has several manifestations in the UI:

- **Vault Concierge:** A conversational interface that understands natural language and helps users navigate the platform, find documents, summarize content, answer regulatory questions, and suggest next steps. For example, a user could ask, "Show me all CMC documents for Project X that are ready for FDA submission" or "Explain the enrollment criteria from our Phase II protocol and compare them to our Phase III design."

- **Document Creation Co-Pilot:** When creating documents, the AI can suggest content, templates, and formatting based on the type of document and its regulatory context. For instance, if a user is drafting a clinical study protocol, the AI could suggest standard inclusion/exclusion criteria, safety monitoring provisions, or statistical analysis approaches based on precedent in your organization's documents or best practices.

- **Regulatory Validator:** The assistant can scan documents for potential compliance issues. Imagine uploading a draft CSR, and the AI highlighting missing elements required by ICH E3, inconsistencies in adverse event reporting, or areas where the document may not align with previous submissions.

- **Cross-Document Insights:** The system can surface relationships and potential discrepancies across multiple documents. For example, it might alert a user that the dosing described in a protocol doesn't match what's in the Investigator Brochure, or that a safety assessment in one document contradicts statements in another.

The AI Assistant is deeply integrated with other modules. It has access to document context, project data, and regulatory requirements, making its suggestions highly relevant and specific. For sensitive operations, it acts as an advisor, providing recommendations but leaving final decisions to authorized human users (especially for regulated processes).

### Workflows & Collaboration

The **Workflow Engine** automates and tracks complex processes that span multiple steps, documents, and team members. It's designed to enforce regulatory compliance while improving efficiency through guided procedures and transparent status tracking.

- **Document Review & Approval Process:** The system implements electronic workflows for document reviews, capturing comments, version control, and final electronic approvals. For example, a new clinical protocol might flow from creation by a medical writer to review by biostatistics, medical, operations, and finally approval by a medical director. Each step is tracked, with due dates, notifications, and clear 'to-do' items for all participants. The workflow enforces that the proper sequence is followed and appropriate roles are involved.

- **Submission Preparation Workflow:** A specialized workflow for regulatory submissions assembles required documents, tracks completeness, validates against regulatory requirements (e.g., is every required section of an IND or CTD present?), and creates the final submission package. This workflow might include steps for QC review, regulatory approval, and electronic transmission to health authorities.

- **Collaborative Editing:** For documents that require input from multiple experts, such as clinical protocols or regulatory submissions, the system offers collaborative editing features. Users can leave comments, suggest changes, and see contributions from team members in real-time or asynchronously. Version control ensures that edits don't overwrite each other.

- **Task Management & Status Tracking:** Users receive a personalized dashboard showing their pending tasks across all workflows (documents to review, approvals needed, etc.) with due dates and priority indicators. Project managers can view the status of all active workflows, identify bottlenecks, and reassign tasks if needed.

- **Template Library:** A collection of workflow templates for common processes (new study initiation, regulatory submission, safety reporting, etc.) allows teams to standardize their procedures while allowing for customization when needed. These templates can be organization-specific, embedding your SOPs and best practices.

The workflow engine is designed to be configurable rather than rigid – authorized administrators can define new workflows or modify existing ones through a visual designer, without requiring developer intervention. This gives organizations the flexibility to adapt processes as they grow or as regulations change.

### Analytics & Business Intelligence

The **Analytics Module** transforms the wealth of data in the system into actionable insights, helping executives and project leaders make informed decisions and identify trends or issues before they become problems.

- **Operational Dashboards:** Each user role has tailored dashboards showing relevant metrics. For example:

  - **CEO/Executive View:** High-level program status, regulatory milestones, submission timelines, and resource allocation across the portfolio
  - **Project Manager View:** Detailed timeline tracking, document status, team productivity, and critical path analysis
  - **Regulatory Affairs View:** Submission readiness, document completeness, agency correspondence tracking, and approval probabilities

- **Document Analytics:** Insights into document management activities, such as:

  - Creation and approval cycle times (e.g., "average time from draft to approval for protocols")
  - Document quality metrics (completeness, consistency, compliance with standards)
  - Usage patterns (which documents are most referenced, downloaded, or shared)
  - Version comparison (how extensively documents change between versions)

- **Timeline & Milestone Tracking:** Visual representations of project and study timelines, with actual vs. planned progress, critical path analysis, and risk flagging for delayed activities.

- **Regulatory Intelligence:** Aggregated insights from your submission history and external data sources to inform strategy:

  - Historical agency feedback patterns
  - Success rates for different submission approaches
  - Comparative analysis of your regulatory strategies vs. industry benchmarks

- **Resource Allocation:** Understanding of team workload, bottlenecks, and capacity, helping leaders optimize staffing and prioritize activities.

- **Custom Reports & Exports:** Users can create ad-hoc reports or schedule regular exports (e.g., monthly study progress report or quarterly submission planning summary) in various formats (PDF, Excel, PowerPoint) for sharing with stakeholders who may not access the system directly.

The analytics capabilities are powered by **MashableBI** integration, leveraging its visualization capabilities and extendable architecture. For organizations with existing BI tools (e.g., Tableau, Power BI), data can be exposed through secure APIs or automated exports to feed those systems.

### Mobile & Remote Access

In recognition that modern teams work from anywhere, the platform offers robust mobile and remote access capabilities:

- **Responsive Web Design:** The entire portal is mobile-responsive, allowing users to access critical information and perform basic tasks from any device with a web browser.

- **Dedicated Mobile App:** An optional companion mobile app (iOS/Android) provides optimized access to key features:

  - Document viewing and approval (with biometric authentication for Part 11 compliance)
  - Notification management and task responses
  - Timeline tracking and status updates
  - Offline access to selected documents (with security controls)

- **Secure Remote Access:** For users outside the corporate network, the system provides secure access options:

  - VPN-less secure connections using modern authentication
  - Session timeout controls and device verification
  - Optional IP restrictions or geo-fencing for highly sensitive content

- **Offline Capabilities:** Selected documents can be securely cached for offline access (e.g., for review during travel), with full audit trails and automatic synchronization when connectivity is restored.

The mobile experience maintains the same security and compliance standards as the desktop version, ensuring that convenience doesn't compromise regulatory requirements or data protection.

### Security & Compliance Framework

The **Security & Compliance** framework ensures that the entire system meets or exceeds regulated industry requirements, particularly for pharmaceutical and biotech organizations subject to FDA and international regulations.

- **21 CFR Part 11 Compliance:** The system is designed to comply with FDA requirements for electronic records and signatures, including:

  - Secure, computer-generated, time-stamped audit trails for all record changes
  - Ability to produce accurate and complete copies of records for inspection
  - System validation documentation and procedural controls
  - Unique, non-reusable electronic signatures linked to specific individuals

- **Data Protection & Privacy:** Comprehensive security measures protect sensitive information:

  - End-to-end encryption for data in transit and at rest
  - Role-based access controls down to the document level
  - Data residency options to comply with regional requirements (e.g., GDPR)
  - Privacy impact assessments and data minimization principles

- **Authentication & Identity:** Robust user verification through:

  - Multi-factor authentication (MFA) for all users
  - Single Sign-On (SSO) integration with corporate identity providers
  - Detailed session management and inactivity timeouts
  - Biometric options for mobile approval actions

- **Audit & Traceability:** Comprehensive logging and monitoring:

  - Tamper-evident audit trails for all system actions
  - Automated alerts for suspicious activities or compliance violations
  - Regular audit log reviews and export capabilities for inspections
  - Chain of custody tracking for all document handling

- **Validation & Qualification:** Support for system validation requirements:

  - Documentation package including requirements, specifications, and test cases
  - Installation and operational qualification (IQ/OQ) protocols
  - Change control and version management
  - Risk-based validation approach focusing on GxP-critical functions

- **Disaster Recovery & Business Continuity:** Robust data protection mechanisms:
  - Automated backups with point-in-time recovery
  - Redundant storage and processing capabilities
  - Documented recovery procedures and regular testing
  - Guaranteed uptime commitments appropriate for critical business functions

The security framework is designed to be demonstrably compliant but not burdensome – security controls are implemented in ways that enhance rather than impede user experience, with friction minimized for routine activities while maintaining appropriate safeguards for sensitive operations.

## Implementation Roadmap

The implementation will follow a phased approach to deliver value quickly while building toward the complete vision:

### Phase 1: Core Platform & Document Vault (Months 1-3)

- Basic user authentication and role management
- Document repository with version control and metadata
- Simple project/study organization structure
- Essential document workflows (draft → review → approve)
- Foundational audit logging and compliance features
- Initial responsive UI with role-based dashboards

### Phase 2: Enhanced Intelligence & Collaboration (Months 4-6)

- AI Assistant integration (document analysis, tagging, search)
- Advanced workflow engine with configurable processes
- Collaborative features (comments, notifications, shared editing)
- Expanded analytics with operational dashboards
- Mobile optimization and remote access capabilities
- Integration with electronic signature systems

### Phase 3: Enterprise Scale & Integration (Months 7-9)

- Advanced regulatory intelligence and validation
- Full business intelligence suite with MashableBI
- External system integrations (DocuShare, CTMS, etc.)
- Enterprise features (SSO, advanced security, multi-tenant controls)
- Performance optimization for large document volumes
- Comprehensive validation documentation package

This phased approach allows for feedback and refinement between releases, ensuring that the final system aligns perfectly with user needs while maintaining compliance with regulatory requirements.

## Technical Stack Summary

- **Frontend:** React 18+, Vite, Tailwind CSS, ShadcnUI, TanStack Query
- **Backend:** Node.js, Express/NestJS, JWT authentication
- **Database:** Supabase (PostgreSQL), pgvector for embeddings
- **Storage:** Supabase Storage (or S3-compatible alternative)
- **AI Integration:** OpenAI API (GPT-4), potentially with Azure OpenAI for compliance
- **Search:** PostgreSQL full-text search + vector similarity search
- **Real-time:** WebSockets/Socket.IO or Supabase Realtime
- **Deployment:** Replit with potential for containerization
- **Security:** TLS, JWT, row-level security, encrypted storage
- **Monitoring:** Application logs, audit trails, performance metrics

This tech stack balances modern development practices with enterprise-grade reliability and security, while remaining deployable within Replit's environment.
