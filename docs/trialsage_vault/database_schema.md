# TrialSage Vault Client Portal: Database Schema

This document outlines the database schema for the TrialSage Vault Client Portal, designed to support multi-tenancy, document management, and comprehensive regulatory workflows.

## Core Entities

### Organizations

Represents client companies using the TrialSage Vault platform.

| Column            | Type         | Description                                |
| ----------------- | ------------ | ------------------------------------------ |
| org_id            | UUID         | Primary key                                |
| name              | VARCHAR(255) | Organization name                          |
| subscription_plan | VARCHAR(50)  | Subscription tier (Basic, Pro, Enterprise) |
| created_at        | TIMESTAMP    | Record creation timestamp                  |
| updated_at        | TIMESTAMP    | Record update timestamp                    |
| settings          | JSONB        | Organization-specific settings             |
| status            | VARCHAR(20)  | Status (Active, Suspended, Archived)       |

### Users

Stores user accounts for accessing the system.

| Column        | Type         | Description                        |
| ------------- | ------------ | ---------------------------------- |
| user_id       | UUID         | Primary key                        |
| org_id        | UUID         | Foreign key to organizations       |
| email         | VARCHAR(255) | User email address (unique)        |
| name          | VARCHAR(255) | User full name                     |
| password_hash | VARCHAR(255) | Hashed password (if not using SSO) |
| created_at    | TIMESTAMP    | Record creation timestamp          |
| updated_at    | TIMESTAMP    | Record update timestamp            |
| last_login_at | TIMESTAMP    | Last login timestamp               |
| is_active     | BOOLEAN      | Account active status              |
| avatar_url    | VARCHAR(255) | Profile image URL                  |
| title         | VARCHAR(100) | Job title                          |
| department    | VARCHAR(100) | Department within organization     |
| preferences   | JSONB        | User preferences                   |

### Roles

Defines system roles for authorization.

| Column      | Type         | Description                             |
| ----------- | ------------ | --------------------------------------- |
| role_id     | VARCHAR(50)  | Primary key (e.g., "ceo", "regulatory") |
| name        | VARCHAR(100) | Display name                            |
| description | TEXT         | Role description                        |
| permissions | JSONB        | Permission set for the role             |

### UserRoles

Maps users to roles, potentially scoped to projects.

| Column     | Type        | Description                        |
| ---------- | ----------- | ---------------------------------- |
| user_id    | UUID        | Foreign key to users               |
| role_id    | VARCHAR(50) | Foreign key to roles               |
| org_id     | UUID        | Foreign key to organizations       |
| project_id | UUID        | Foreign key to projects (nullable) |
| created_at | TIMESTAMP   | Assignment timestamp               |
| created_by | UUID        | User who assigned the role         |

### Projects

Represents a project or program within an organization.

| Column           | Type         | Description                                |
| ---------------- | ------------ | ------------------------------------------ |
| project_id       | UUID         | Primary key                                |
| org_id           | UUID         | Foreign key to organizations               |
| name             | VARCHAR(255) | Project name                               |
| description      | TEXT         | Project description                        |
| status           | VARCHAR(50)  | Status (Planning, Active, Completed, etc.) |
| start_date       | DATE         | Project start date                         |
| end_date         | DATE         | Actual or estimated end date               |
| created_at       | TIMESTAMP    | Record creation timestamp                  |
| created_by       | UUID         | User who created the project               |
| updated_at       | TIMESTAMP    | Record update timestamp                    |
| therapeutic_area | VARCHAR(100) | Therapeutic area                           |
| indication       | VARCHAR(255) | Target indication                          |
| metadata         | JSONB        | Additional project metadata                |

### Studies

Represents clinical trials or studies within projects.

| Column            | Type         | Description                                   |
| ----------------- | ------------ | --------------------------------------------- |
| study_id          | UUID         | Primary key                                   |
| project_id        | UUID         | Foreign key to projects                       |
| org_id            | UUID         | Foreign key to organizations                  |
| name              | VARCHAR(255) | Study name                                    |
| description       | TEXT         | Study description                             |
| phase             | VARCHAR(20)  | Clinical phase (I, II, III, IV)               |
| status            | VARCHAR(50)  | Status (Planning, Enrolling, Completed, etc.) |
| start_date        | DATE         | Study start date                              |
| end_date          | DATE         | Actual or estimated end date                  |
| created_at        | TIMESTAMP    | Record creation timestamp                     |
| created_by        | UUID         | User who created the study                    |
| updated_at        | TIMESTAMP    | Record update timestamp                       |
| lead_id           | UUID         | Study lead user ID                            |
| enrollment_target | INTEGER      | Target enrollment number                      |
| enrollment_actual | INTEGER      | Actual enrollment number                      |
| metadata          | JSONB        | Additional study metadata                     |

## Document Management

### Documents

Represents logical documents with metadata.

| Column              | Type         | Description                               |
| ------------------- | ------------ | ----------------------------------------- |
| doc_id              | UUID         | Primary key                               |
| org_id              | UUID         | Foreign key to organizations              |
| project_id          | UUID         | Foreign key to projects (nullable)        |
| study_id            | UUID         | Foreign key to studies (nullable)         |
| title               | VARCHAR(255) | Document title                            |
| doc_type            | VARCHAR(100) | Document type (Protocol, CSR, SOP, etc.)  |
| status              | VARCHAR(50)  | Status (Draft, In Review, Approved, etc.) |
| current_version_id  | UUID         | Current version ID                        |
| created_by          | UUID         | User who created the document             |
| created_at          | TIMESTAMP    | Creation timestamp                        |
| updated_at          | TIMESTAMP    | Last update timestamp                     |
| regulatory_category | VARCHAR(100) | Regulatory category or CTD section        |
| external_ref        | VARCHAR(255) | External reference (e.g., DocuShare ID)   |
| metadata            | JSONB        | Additional document metadata              |

### DocumentVersions

Stores individual versions of documents.

| Column         | Type         | Description                                  |
| -------------- | ------------ | -------------------------------------------- |
| version_id     | UUID         | Primary key                                  |
| doc_id         | UUID         | Foreign key to documents                     |
| version_number | INTEGER      | Version number (1, 2, 3, etc.)               |
| storage_key    | VARCHAR(255) | Storage path or key to retrieve file         |
| file_name      | VARCHAR(255) | Original filename                            |
| file_size      | BIGINT       | File size in bytes                           |
| mime_type      | VARCHAR(100) | File MIME type                               |
| uploaded_by    | UUID         | User who uploaded this version               |
| uploaded_at    | TIMESTAMP    | Upload timestamp                             |
| change_summary | TEXT         | Description of changes from previous version |
| is_approved    | BOOLEAN      | Whether this version is approved/final       |
| approval_id    | UUID         | Reference to approval/signature record       |
| checksum       | VARCHAR(255) | File checksum for integrity verification     |

### DocumentTags

Maps documents to tags for organization and search.

| Column     | Type         | Description              |
| ---------- | ------------ | ------------------------ |
| doc_id     | UUID         | Foreign key to documents |
| tag        | VARCHAR(100) | Tag value                |
| created_at | TIMESTAMP    | Tag assignment timestamp |
| created_by | UUID         | User who applied the tag |

### Folders

Optional hierarchy for document organization.

| Column           | Type         | Description                                  |
| ---------------- | ------------ | -------------------------------------------- |
| folder_id        | UUID         | Primary key                                  |
| org_id           | UUID         | Foreign key to organizations                 |
| parent_folder_id | UUID         | Parent folder ID (nullable for root folders) |
| name             | VARCHAR(255) | Folder name                                  |
| description      | TEXT         | Folder description                           |
| project_id       | UUID         | Project scope (nullable for global folders)  |
| created_at       | TIMESTAMP    | Creation timestamp                           |
| created_by       | UUID         | User who created the folder                  |
| updated_at       | TIMESTAMP    | Last update timestamp                        |
| is_system        | BOOLEAN      | Whether this is a system-generated folder    |

### FolderDocuments

Maps documents to folders (many-to-many).

| Column    | Type      | Description                       |
| --------- | --------- | --------------------------------- |
| folder_id | UUID      | Foreign key to folders            |
| doc_id    | UUID      | Foreign key to documents          |
| added_at  | TIMESTAMP | When document was added to folder |
| added_by  | UUID      | User who added document to folder |

## Workflow Management

### Workflows

Represents workflow instances (e.g., approval processes).

| Column       | Type         | Description                                  |
| ------------ | ------------ | -------------------------------------------- |
| workflow_id  | UUID         | Primary key                                  |
| org_id       | UUID         | Foreign key to organizations                 |
| type         | VARCHAR(100) | Workflow type (DocumentApproval, CAPA, etc.) |
| status       | VARCHAR(50)  | Status (Active, Completed, Cancelled)        |
| entity_type  | VARCHAR(50)  | Related entity type (Document, Study, etc.)  |
| entity_id    | UUID         | ID of the related entity                     |
| initiator_id | UUID         | User who initiated the workflow              |
| initiated_at | TIMESTAMP    | Initiation timestamp                         |
| completed_at | TIMESTAMP    | Completion timestamp (nullable)              |
| due_date     | TIMESTAMP    | Workflow due date (nullable)                 |
| config       | JSONB        | Workflow configuration                       |

### Tasks

Individual tasks within workflows.

| Column        | Type         | Description                       |
| ------------- | ------------ | --------------------------------- |
| task_id       | UUID         | Primary key                       |
| org_id        | UUID         | Foreign key to organizations      |
| workflow_id   | UUID         | Foreign key to workflows          |
| title         | VARCHAR(255) | Task title/name                   |
| description   | TEXT         | Task description                  |
| assigned_to   | UUID         | User assigned to the task         |
| status        | VARCHAR(50)  | Status (Pending, Completed, etc.) |
| due_date      | TIMESTAMP    | Task due date                     |
| created_at    | TIMESTAMP    | Creation timestamp                |
| completed_at  | TIMESTAMP    | Completion timestamp (nullable)   |
| entity_type   | VARCHAR(50)  | Related entity type               |
| entity_id     | UUID         | Related entity ID                 |
| sequence      | INTEGER      | Task sequence within workflow     |
| prerequisites | UUID[]       | Array of prerequisite task IDs    |

### Comments

Comments on documents, tasks, or other entities.

| Column        | Type        | Description                                   |
| ------------- | ----------- | --------------------------------------------- |
| comment_id    | UUID        | Primary key                                   |
| org_id        | UUID        | Foreign key to organizations                  |
| entity_type   | VARCHAR(50) | Entity type (Document, Task, etc.)            |
| entity_id     | UUID        | Entity ID                                     |
| author_id     | UUID        | User who wrote the comment                    |
| created_at    | TIMESTAMP   | Creation timestamp                            |
| updated_at    | TIMESTAMP   | Last update timestamp                         |
| content       | TEXT        | Comment text                                  |
| reply_to_id   | UUID        | Parent comment ID for replies (nullable)      |
| is_resolved   | BOOLEAN     | Whether issue/comment is resolved             |
| position_data | JSONB       | Position info (e.g., for document annotation) |

### ElectronicSignatures

Records Part 11 compliant electronic signatures.

| Column            | Type         | Description                                   |
| ----------------- | ------------ | --------------------------------------------- |
| signature_id      | UUID         | Primary key                                   |
| org_id            | UUID         | Foreign key to organizations                  |
| user_id           | UUID         | User who signed                               |
| entity_type       | VARCHAR(50)  | Entity type (Document, Workflow, etc.)        |
| entity_id         | UUID         | Entity ID                                     |
| signed_at         | TIMESTAMP    | Signature timestamp                           |
| ip_address        | VARCHAR(50)  | IP address of signer                          |
| signature_meaning | VARCHAR(100) | Meaning of signature (Approval, Review, etc.) |
| signature_data    | TEXT         | Actual signature data or representation       |
| certificate_id    | VARCHAR(255) | Digital certificate ID if applicable          |

## Audit and Compliance

### AuditLogs

Comprehensive audit trail for system actions.

| Column      | Type         | Description                                 |
| ----------- | ------------ | ------------------------------------------- |
| audit_id    | UUID         | Primary key                                 |
| org_id      | UUID         | Foreign key to organizations                |
| user_id     | UUID         | User who performed the action (nullable)    |
| timestamp   | TIMESTAMP    | Action timestamp                            |
| entity_type | VARCHAR(50)  | Entity type (Document, User, Project, etc.) |
| entity_id   | UUID         | Entity ID                                   |
| action      | VARCHAR(50)  | Action type (CREATE, UPDATE, DELETE, etc.)  |
| details     | JSONB        | Action details (old/new values, etc.)       |
| ip_address  | VARCHAR(50)  | IP address                                  |
| user_agent  | VARCHAR(255) | User agent string                           |
| session_id  | VARCHAR(255) | Session identifier                          |

### ActivityLogs

User-facing activity history.

| Column        | Type         | Description                            |
| ------------- | ------------ | -------------------------------------- |
| activity_id   | UUID         | Primary key                            |
| org_id        | UUID         | Foreign key to organizations           |
| user_id       | UUID         | User who performed the activity        |
| timestamp     | TIMESTAMP    | Activity timestamp                     |
| activity_type | VARCHAR(100) | Activity type (DocumentUploaded, etc.) |
| entity_type   | VARCHAR(50)  | Entity type                            |
| entity_id     | UUID         | Entity ID                              |
| title         | VARCHAR(255) | Activity title                         |
| description   | TEXT         | Activity description                   |
| metadata      | JSONB        | Additional activity metadata           |

## Regulatory Intelligence

### RegulatoryReferences

Knowledge base of regulatory documents and guidelines.

| Column         | Type         | Description                         |
| -------------- | ------------ | ----------------------------------- |
| ref_id         | UUID         | Primary key                         |
| category       | VARCHAR(100) | Category (CTD, CFR, ICH, etc.)      |
| ref_code       | VARCHAR(100) | Reference code (e.g., "ICH E6(R2)") |
| title          | VARCHAR(255) | Reference title                     |
| description    | TEXT         | Description or summary              |
| content        | TEXT         | Full text content                   |
| url            | VARCHAR(255) | External reference URL              |
| version        | VARCHAR(50)  | Version or revision                 |
| effective_date | DATE         | When guidance became effective      |
| metadata       | JSONB        | Additional metadata                 |

### SubmissionProjects

Regulatory submission projects.

| Column          | Type         | Description                              |
| --------------- | ------------ | ---------------------------------------- |
| submission_id   | UUID         | Primary key                              |
| org_id          | UUID         | Foreign key to organizations             |
| project_id      | UUID         | Foreign key to projects                  |
| name            | VARCHAR(255) | Submission name                          |
| type            | VARCHAR(100) | Submission type (IND, NDA, CTA, etc.)    |
| agency          | VARCHAR(100) | Regulatory agency (FDA, EMA, etc.)       |
| status          | VARCHAR(50)  | Status (In Preparation, Submitted, etc.) |
| target_date     | DATE         | Target submission date                   |
| submitted_date  | DATE         | Actual submission date (nullable)        |
| created_at      | TIMESTAMP    | Creation timestamp                       |
| created_by      | UUID         | User who created submission project      |
| updated_at      | TIMESTAMP    | Last update timestamp                    |
| tracking_number | VARCHAR(100) | Agency tracking number                   |
| metadata        | JSONB        | Additional metadata                      |

### SubmissionDocuments

Maps documents to submission sections.

| Column        | Type        | Description                                 |
| ------------- | ----------- | ------------------------------------------- |
| submission_id | UUID        | Foreign key to submission_projects          |
| ref_id        | UUID        | Foreign key to regulatory_references        |
| doc_id        | UUID        | Foreign key to documents (nullable)         |
| status        | VARCHAR(50) | Status (Not Started, In Progress, Complete) |
| assigned_to   | UUID        | User assigned to prepare this section       |
| due_date      | DATE        | Due date for this section                   |
| notes         | TEXT        | Notes about this submission document        |
| created_at    | TIMESTAMP   | Creation timestamp                          |
| updated_at    | TIMESTAMP   | Last update timestamp                       |

## AI and Analytics

### AIEmbeddings

Vector embeddings for documents and content.

| Column          | Type        | Description                             |
| --------------- | ----------- | --------------------------------------- |
| embedding_id    | UUID        | Primary key                             |
| org_id          | UUID        | Foreign key to organizations            |
| entity_type     | VARCHAR(50) | Entity type (Document, Reference, etc.) |
| entity_id       | UUID        | Entity ID                               |
| chunk_index     | INTEGER     | Index of content chunk within entity    |
| embedding       | VECTOR      | Vector embedding (using pgvector)       |
| content_excerpt | TEXT        | Text excerpt that was embedded          |
| created_at      | TIMESTAMP   | Creation timestamp                      |
| updated_at      | TIMESTAMP   | Last update timestamp                   |

### AIQueries

Log of AI assistant interactions.

| Column          | Type         | Description                                 |
| --------------- | ------------ | ------------------------------------------- |
| query_id        | UUID         | Primary key                                 |
| org_id          | UUID         | Foreign key to organizations                |
| user_id         | UUID         | User who made the query                     |
| timestamp       | TIMESTAMP    | Query timestamp                             |
| question        | TEXT         | User's question                             |
| context         | JSONB        | Context provided to AI (e.g., document IDs) |
| answer          | TEXT         | AI's response                               |
| model_used      | VARCHAR(100) | AI model used                               |
| tokens_used     | INTEGER      | Token count used                            |
| feedback_rating | INTEGER      | User feedback rating (if provided)          |
| feedback_text   | TEXT         | User feedback comments                      |
| citations       | JSONB        | Sources cited in the response               |

### DashboardConfigurations

User dashboard configurations.

| Column     | Type         | Description                                  |
| ---------- | ------------ | -------------------------------------------- |
| config_id  | UUID         | Primary key                                  |
| org_id     | UUID         | Foreign key to organizations                 |
| user_id    | UUID         | User who owns the dashboard                  |
| name       | VARCHAR(255) | Dashboard name                               |
| is_default | BOOLEAN      | Whether this is the user's default dashboard |
| layout     | JSONB        | Dashboard layout configuration               |
| created_at | TIMESTAMP    | Creation timestamp                           |
| updated_at | TIMESTAMP    | Last update timestamp                        |
| role_id    | VARCHAR(50)  | Associated role (for role-specific defaults) |
| is_shared  | BOOLEAN      | Whether dashboard is shared with others      |

### SavedReports

Saved custom reports.

| Column           | Type         | Description                             |
| ---------------- | ------------ | --------------------------------------- |
| report_id        | UUID         | Primary key                             |
| org_id           | UUID         | Foreign key to organizations            |
| created_by       | UUID         | User who created the report             |
| name             | VARCHAR(255) | Report name                             |
| description      | TEXT         | Report description                      |
| query_definition | JSONB        | Report query parameters and definition  |
| schedule         | JSONB        | Schedule configuration (if recurring)   |
| last_run_at      | TIMESTAMP    | Last generation timestamp               |
| created_at       | TIMESTAMP    | Creation timestamp                      |
| updated_at       | TIMESTAMP    | Last update timestamp                   |
| is_system        | BOOLEAN      | Whether this is a system-defined report |
| category         | VARCHAR(100) | Report category                         |

## Database Index Strategy

The following indexes will be created to optimize query performance:

1. **Organizations**

   - Primary key on `org_id`

2. **Users**

   - Primary key on `user_id`
   - Index on `org_id`
   - Unique index on `email`
   - Index on `is_active`

3. **UserRoles**

   - Composite index on `(user_id, role_id, project_id)`
   - Index on `org_id`

4. **Projects**

   - Primary key on `project_id`
   - Index on `org_id`
   - Index on `status`
   - Index on `therapeutic_area`

5. **Studies**

   - Primary key on `study_id`
   - Index on `project_id`
   - Index on `org_id`
   - Index on `status`
   - Index on `phase`

6. **Documents**

   - Primary key on `doc_id`
   - Index on `org_id`
   - Index on `project_id`
   - Index on `study_id`
   - Index on `doc_type`
   - Index on `status`
   - Index on `regulatory_category`
   - Full-text search index on `title` and `metadata`

7. **DocumentVersions**

   - Primary key on `version_id`
   - Index on `doc_id`
   - Index on `version_number`
   - Index on `uploaded_at`

8. **DocumentTags**

   - Composite index on `(doc_id, tag)`
   - Index on `tag`

9. **Workflows**

   - Primary key on `workflow_id`
   - Index on `org_id`
   - Index on `status`
   - Index on `entity_id, entity_type`

10. **Tasks**

    - Primary key on `task_id`
    - Index on `org_id`
    - Index on `workflow_id`
    - Index on `assigned_to`
    - Index on `status`
    - Index on `due_date`

11. **Comments**

    - Primary key on `comment_id`
    - Index on `entity_id, entity_type`
    - Index on `reply_to_id`

12. **AuditLogs**

    - Primary key on `audit_id`
    - Index on `org_id`
    - Index on `user_id`
    - Index on `timestamp`
    - Index on `entity_id, entity_type`
    - Index on `action`

13. **AIEmbeddings**
    - Primary key on `embedding_id`
    - Index on `org_id`
    - Index on `entity_id, entity_type`
    - Vector index on `embedding` for similarity search

## Row-Level Security Policies

PostgreSQL Row-Level Security (RLS) policies will be implemented to enforce data isolation between organizations:

1. **Organization Isolation**

   - All tables with `org_id` will have RLS policies that restrict access to rows matching the current user's organization.

2. **Project-Level Access**

   - Documents, studies, and related entities will have RLS policies that respect project-level permissions.

3. **Role-Based Access**
   - Document and workflow tables will have RLS policies that respect user roles and permissions.

## Database Configuration

The database will be configured with the following options:

1. **Extensions**

   - Enable `pgvector` for vector similarity search
   - Enable `pg_trgm` for fuzzy text search
   - Enable `uuid-ossp` for UUID generation

2. **Performance Options**

   - Configure appropriate connection pool settings
   - Set vacuum and maintenance parameters for optimal performance
   - Implement partitioning for large tables (e.g., audit logs by date)

3. **Backup and Recovery**
   - Configure automated backups with point-in-time recovery
   - Implement transaction logging for reliable recovery
   - Set up replication for high availability

## Data Migration Strategy

For importing data from existing systems:

1. **Define staging tables** for temporary data storage during import
2. **Create ETL processes** to transform and validate imported data
3. **Implement verification procedures** to ensure data integrity
4. **Develop rollback mechanisms** in case of migration issues

## Schema Evolution

The schema is designed to evolve gracefully:

1. **Use nullable columns** for new features to maintain backward compatibility
2. **Implement JSON fields** for flexible metadata that may vary by implementation
3. **Version database changes** through migration scripts
4. **Document schema changes** thoroughly for traceability
