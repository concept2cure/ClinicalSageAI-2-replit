"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentSessions = exports.documentComments = exports.documentLocks = exports.electronicSignatures = exports.documentAuditTrail = exports.documentVersions = exports.documents = exports.insertClientSecuritySettingsSchema = exports.clientSecuritySettings = exports.insertClientWorkspaceSettingsSchema = exports.clientWorkspaceSettings = exports.insertClientAccessSchema = exports.clientAccess = exports.insertClientWorkspaceSchema = exports.clientWorkspaces = exports.supplyChainBatches = exports.supplyChainMaterials = exports.supplyChainSuppliers = exports.insertSectionPropagationSchema = exports.insertSectionPatchSchema = exports.insertSectionLinkSchema = exports.insertSectionSchema = exports.sectionPropagations = exports.sectionPatches = exports.sectionLinks = exports.sections = exports.insertModuleSubscriptionSchema = exports.insertAvailableModuleSchema = exports.moduleSubscriptions = exports.availableModules = exports.insertAuditTrailSchema = exports.insertValidationFindingSchema = exports.insertLeafPatchSchema = exports.insertLeafCitationSchema = exports.insertFactSchema = exports.insertLeafSchema = exports.auditTrail = exports.validationFindings = exports.leafPatches = exports.leafCitations = exports.facts = exports.leaves = exports.sharepoint_locks = exports.sharepoint_comments = exports.sharepoint_shares = exports.sharepoint_audit_log = exports.sharepoint_file_versions = exports.sharepoint_files = exports.insertOrganizationSchema = exports.organizations = void 0;
exports.analyticalMethods = exports.projectActivitiesRelations = exports.projectDocumentsRelations = exports.cerProjectsRelations = exports.usersRelations = exports.organizationsRelations = exports.insertClientUserPermissionSchema = exports.clientUserPermissions = exports.insertProjectMilestoneSchema = exports.projectMilestones = exports.insertProjectActivitySchema = exports.projectActivities = exports.insertProjectDocumentSchema = exports.projectDocuments = exports.insertCerProjectSchema = exports.cerProjects = exports.fdaIntegrationLogs = exports.dataLineageTracking = exports.deviceAuditTrail = exports.deviceSubmissionWorkflows = exports.deviceSubmissionDocuments = exports.pmaSubmissions = exports.cerv2DocumentSessions = exports.cerv2SectionVersions = exports.cerv2510kSections = exports.fda510kSubmissions = exports.medicalDevices = exports.insertOrganizationUserSchema = exports.organizationUsers = exports.insertUserSchema = exports.users = exports.insertActivityReactionSchema = exports.insertUserPresenceSchema = exports.insertNotificationPreferencesSchema = exports.insertUserFollowingSchema = exports.insertNotificationSchema = exports.insertActivityFeedSchema = exports.activityReactions = exports.userPresence = exports.notificationPreferences = exports.userFollowing = exports.notifications = exports.activityFeed = exports.insertDocumentSessionSchema = exports.insertDocumentCommentSchema = exports.insertDocumentLockSchema = exports.insertElectronicSignatureSchema = exports.insertDocumentAuditTrailSchema = exports.insertDocumentVersionSchema = exports.insertDocumentSchema = void 0;
exports.insertQmpSectionGatingSchema = exports.qmpSectionGating = exports.insertCtqFactorSchema = exports.ctqFactors = exports.insertQmpAuditTrailSchema = exports.qmpAuditTrail = exports.insertQualityManagementPlanSchema = exports.qualityManagementPlans = exports.cerApprovalsRelations = exports.insertCerExportSchema = exports.cerExports = exports.insertCerWorkflowSchema = exports.cerWorkflows = exports.insertCerComplianceCheckSchema = exports.cerComplianceChecks = exports.insertCerLiteratureSchema = exports.cerLiterature = exports.insertCerFaersDataSchema = exports.cerFaersData = exports.insertCerSectionSchema = exports.cerSections = exports.cerVersionHistory = exports.cerTemplates = exports.cerClinicalEvidence = exports.insertCerReportSchema = exports.cerReports = exports.cerEssentialRequirements = exports.deviceSubmissions = exports.deviceProfiles = exports.insertCerDocumentSchema = exports.cerDocuments = exports.insertCerApprovalSchema = exports.cerApprovals = exports.insertSimpleDocumentVersionSchema = exports.simpleDocumentVersions = exports.insertRegulatoryDocumentSchema = exports.insertDrugProductSchema = exports.insertDrugSubstanceSchema = exports.insertCmcChangeControlSchema = exports.insertQcTestingSchema = exports.insertStabilityStudySchema = exports.insertProcessValidationSchema = exports.insertAnalyticalMethodSchema = exports.regulatoryDocuments = exports.drugProducts = exports.drugSubstances = exports.cmcChangeControl = exports.qcTesting = exports.stabilityStudies = exports.processValidation = void 0;
exports.projectTasksRelations = exports.projectWorkflowStagesRelations = exports.projectModulesRelations = exports.projectsRelations = exports.insertProjectTemplateSchema = exports.projectTemplates = exports.insertTaskDependencySchema = exports.taskDependencies = exports.insertTaskAutomationSchema = exports.taskAutomation = exports.insertTaskTemplateSchema = exports.taskTemplates = exports.insertCrossModuleTaskLinkSchema = exports.crossModuleTaskLinks = exports.insertUnifiedTaskSchema = exports.unifiedTasks = exports.insertProjectTaskSchema = exports.projectTasks = exports.insertProjectWorkflowStageSchema = exports.projectWorkflowStages = exports.insertProjectModuleSchema = exports.projectModules = exports.insertProjectSchema = exports.projects = exports.insertDocumentAuditLogSchema = exports.documentAuditLog = exports.insertSimpleDocumentSchema = exports.simpleDocuments = exports.insertDocumentFolderSchema = exports.documentFolders = exports.croMilestonesRelations = exports.croTeamAssignmentsRelations = exports.croRegulatorySubmissionsRelations = exports.croStudiesRelations = exports.croClientsRelations = exports.insertCroMilestoneSchema = exports.croMilestones = exports.insertCroTeamAssignmentSchema = exports.croTeamAssignments = exports.insertCroRegulatorySubmissionSchema = exports.croRegulatorySubmissions = exports.insertCroStudySchema = exports.croStudies = exports.insertCroClientSchema = exports.croClients = exports.cerProjectsQmpRelation = exports.ctqFactorsRelations = exports.qualityManagementPlansRelations = exports.insertQmpTraceabilityMatrixSchema = exports.qmpTraceabilityMatrix = void 0;
exports.insertRegObligationTemplateSchema = exports.insertRegObligationEventSchema = exports.insertRegObligationSchema = exports.regObligationTemplates = exports.regObligationEvents = exports.regObligations = exports.insertComplianceCalendarSchema = exports.insertAgencyCommunicationSchema = exports.insertObligationUpdateSchema = exports.insertRegulatoryObligationSchema = exports.complianceCalendar = exports.agencyCommunications = exports.obligationUpdates = exports.regulatoryObligations = exports.insertStructuredObservationTermSchema = exports.structuredObservationTerms = exports.sharepointIntegrationRelations = exports.ectdCrossReferencesRelations = exports.ectdChangeControlRelations = exports.ectdCompilationsRelations = exports.ectdTemplatesRelations = exports.ectdGranulesRelations = exports.ectdModulesRelations = exports.integrationTokens = exports.sharepointIntegration = exports.indDocuments = exports.indApplications = exports.ectdCrossReferences = exports.ectdChangeControl = exports.ectdCompilations = exports.ectdTemplates = exports.ectdGranules = exports.ectdModules = exports.insertValidationHarmonizationOpportunitySchema = exports.insertValidationIssueSchema = exports.insertAgencyValidationResultSchema = exports.insertMultiAgencyValidationSessionSchema = exports.validationHarmonizationOpportunities = exports.validationIssues = exports.agencyValidationResults = exports.multiAgencyValidationSessions = exports.recentDocumentsRelations = exports.templateUsageRelations = exports.documentTemplatesRelations = exports.insertRecentDocumentSchema = exports.insertTemplateUsageSchema = exports.insertDocumentTemplateSchema = exports.recentDocuments = exports.templateUsage = exports.documentTemplates = void 0;
exports.insertIndPackagePlanDocumentSchema = exports.insertIndPackagePlanTimelineSchema = exports.insertIndPackagePlanRequirementSchema = exports.insertIndPackagePlanModalitySchema = exports.insertIndPackagePlanRegionSchema = exports.insertIndPackagePlanSchema = exports.indPackagePlanDocuments = exports.indPackagePlanTimelines = exports.indPackagePlanRequirements = exports.indPackagePlanModalities = exports.indPackagePlanRegions = exports.indPackagePlans = exports.insertRegMessageSchema = exports.insertRegResponseSchema = exports.insertRegQuestionSchema = exports.insertRegAttachmentSchema = exports.regMessages = exports.regResponses = exports.regQuestions = exports.regAttachments = exports.regulatoryCalendar = exports.postApprovalCommitments = exports.regulatoryChangeControl = exports.regulatoryIntelligence = exports.agencyCorrespondence = exports.complianceTracking = exports.regulatoryAgencies = exports.auditEvents = exports.deviations = exports.supplyChainCOAs = exports.supplyChainTemperatureReadings = exports.supplyChainShipments = exports.insertBatchGenealogySchema = exports.batchGenealogy = exports.insertBatchSchema = exports.batches = exports.insertMaterialSchema = exports.materials = exports.insertSupplyChainOrganizationSchema = exports.supplyChainOrganizations = exports.insertDoeAnalysisResultSchema = exports.insertDoeExperimentSchema = exports.insertDoeResponseSchema = exports.insertDoeFactorSchema = exports.insertDoeStudySchema = exports.doeAnalysisResults = exports.doeExperiments = exports.doeResponses = exports.doeFactors = exports.doeStudies = void 0;
exports.insertWorkflowProgressSchema = exports.insertIndTemplateSchema = exports.insertIndProjectSchema = exports.regulatoryAuditLogs = exports.gateApprovals = exports.stageGates = exports.regulatoryTasks = exports.regulatorySubmissions = exports.insertCoauthorValidationHistorySchema = exports.insertCoauthorValidationRuleSchema = exports.coauthorValidationHistory = exports.coauthorValidationRules = exports.insertCoauthorImportHistorySchema = exports.coauthorImportHistory = exports.insertCoauthorStatusHistorySchema = exports.insertDocumentVectorSchema = exports.documentVectors = exports.insertComponentSequenceReferenceSchema = exports.componentSequenceReferences = exports.componentCrossReferences = exports.documentComponents = exports.componentVersions = exports.components = exports.coauthorStatusHistory = exports.coauthorDocumentVersions = exports.coauthorDocuments = exports.coauthorAnnotations = exports.coauthorSections = exports.indSubmissions = exports.indTemplateUsageLogs = exports.workflowProgress = exports.indTemplates = exports.indProjects = exports.insertStaffAssignmentSchema = exports.insertSyncStatusSchema = exports.insertLinkEdgeSchema = exports.insertPatchSchema = exports.insertSectionLeafSchema = exports.insertDocumentSectionSchema = exports.insertSectionGraphNodeSchema = exports.staffAssignments = exports.syncStatus = exports.linkEdges = exports.patches = exports.sectionLeaves = exports.documentSections = exports.sectionGraphNodes = exports.supplyChainBatchRelations = exports.supplyChainMaterialRelations = exports.supplyChainSupplierRelations = void 0;
exports.insertCdiscPrmEpochSchema = exports.insertCdiscPrmStudyArmSchema = exports.insertCdiscPrmStudySchema = exports.cdiscTaskValidationQueue = exports.cdiscTaskWorkflows = exports.cdiscTaskMilestones = exports.cdiscTaskDeliverables = exports.cdiscDeviceRelationships = exports.cdiscDeviceDe = exports.cdiscDeviceDx = exports.cdiscPqManufacturing = exports.cdiscPqStability = exports.cdiscPqDomains = exports.cdiscDocsDefineArtifacts = exports.cdiscDocsAcrf = exports.cdiscDocsRepository = exports.cdiscComplianceVersions = exports.cdiscComplianceAgencyPrefs = exports.cdiscComplianceResults = exports.cdiscComplianceRules = exports.cdiscIndIse = exports.cdiscIndIss = exports.cdiscIndSend = exports.cdiscIndIntegration = exports.cdiscEctdSdsp = exports.cdiscEctdReviewersGuide = exports.cdiscEctdDatasets = exports.cdiscEctdDefineXml = exports.cdiscAdamSpecs = exports.csrReports = exports.cdiscCsrSap = exports.cdiscCsrTfl = exports.cdiscCsrTemplates = exports.cdiscCdashSdtmMappings = exports.cdiscCdashFields = exports.cdiscCdashForms = exports.cdiscPrmEndpoints = exports.cdiscPrmVisits = exports.cdiscPrmEpochs = exports.cdiscPrmStudyArms = exports.cdiscPrmStudies = exports.insertRegulatoryAuditLogSchema = exports.insertGateApprovalSchema = exports.insertStageGateSchema = exports.insertRegulatoryTaskSchema = exports.insertRegulatorySubmissionSchema = exports.insertCoauthorAnnotationSchema = exports.insertCoauthorSectionSchema = exports.insertIndSubmissionSchema = exports.insertIndTemplateUsageLogSchema = void 0;
exports.insertRagIngestionJobSchema = exports.insertRagSourceSchema = exports.insertRagKnowledgeGraphSchema = exports.insertRagQuerySchema = exports.insertRagChunkSchema = exports.insertRagDocumentSchema = exports.ragIngestionJobs = exports.ragSources = exports.ragKnowledgeGraph = exports.ragQueries = exports.ragChunks = exports.ragDocuments = exports.insertPkpdCompartmentSchema = exports.insertSpeciesComparisonSchema = exports.insertCrossSpeciesPkpdSchema = exports.insertIndNarrativeSectionSchema = exports.insertIndNarrativeSchema = exports.insertDltEventSchema = exports.insertDoseCohortSchema = exports.insertDoseLevelSchema = exports.insertDoseEscalationStudySchema = exports.pkpdCompartments = exports.speciesComparisons = exports.crossSpeciesPkpd = exports.indNarrativeSections = exports.indNarratives = exports.dltEvents = exports.doseCohorts = exports.doseLevels = exports.doseEscalationStudies = exports.insertTranslationalPatternSchema = exports.insertClinicalFeedbackSchema = exports.insertForesightPredictionSchema = exports.insertClinicalOutcomeSchema = exports.insertBiomarkerEndpointSchema = exports.translationalPatterns = exports.clinicalFeedback = exports.foresightPredictions = exports.clinicalOutcomes = exports.biomarkerEndpoints = exports.insertCdiscAdamSpecSchema = exports.insertCsrReportSchema = exports.insertCdiscCsrSapSchema = exports.insertCdiscCsrTflSchema = exports.insertCdiscCsrTemplateSchema = exports.insertCdiscCdashSdtmMappingSchema = exports.insertCdiscCdashFieldSchema = exports.insertCdiscCdashFormSchema = exports.insertCdiscPrmEndpointSchema = exports.insertCdiscPrmVisitSchema = void 0;
exports.insertFda510kDataMappingSchema = exports.insertFda510kSubmissionPackageSchema = exports.insertFda510kStageProgressSchema = exports.insertFda510kDocumentSchema = exports.insertFda510kTemplateSchema = exports.insertFda510kProjectSchema = exports.fda510kDataMappings = exports.fda510kSubmissionPackages = exports.fda510kStageProgress = exports.fda510kDocuments = exports.fda510kTemplates = exports.fda510kProjects = exports.insertDeviceComponentSchema = exports.insertDeviceTestStandardSchema = exports.insertDeviceDataCategorySchema = exports.insertDeviceDataCenterSchema = exports.deviceComponents = exports.deviceTestStandards = exports.deviceDataCategories = exports.deviceDataCenter = exports.insertReplacementRuleSchema = exports.insertContextMemberSchema = exports.insertContextGroupSchema = exports.insertChangeRequestSchema = exports.insertAiAuditLogSchema = exports.replacementRules = exports.contextMembers = exports.contextGroups = exports.changeRequests = exports.aiAuditLog = exports.insertCoauthorDocumentVersionSchema = exports.insertCoauthorDocumentSchema = void 0;
/**
 * Shared Database Schema
 *
 * This file defines the database schema for the application,
 * including all tables, relationships, and types.
 *
 * Multi-tenant architecture with two levels:
 * 1. Organizations (top-level tenants)
 * 2. ClientWorkspaces (sub-tenants under an organization)
 */
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var drizzle_zod_1 = require("drizzle-zod");
var drizzle_orm_2 = require("drizzle-orm");
// Custom pgvector type definition
var vector = function (name, config) {
    return (0, pg_core_1.customType)({
        dataType: function () {
            return "vector(".concat(config.dimensions, ")");
        },
        toDriver: function (value) {
            return JSON.stringify(value);
        },
        fromDriver: function (value) {
            if (typeof value === 'string') {
                return JSON.parse(value);
            }
            return value;
        },
    })(name);
};
/**
 * Organizations (Tenants) Table
 *
 * This is the root table for the multi-tenant system.
 * Each organization represents a separate tenant with isolated data.
 */
exports.organizations = (0, pg_core_1.pgTable)('organizations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').notNull().unique(),
    domain: (0, pg_core_1.text)('domain'),
    logo: (0, pg_core_1.text)('logo'),
    settings: (0, pg_core_1.json)('settings'),
    apiKey: (0, pg_core_1.text)('api_key').unique(),
    tier: (0, pg_core_1.text)('tier').default('standard').notNull(), // free, standard, professional, enterprise
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, suspended
    maxUsers: (0, pg_core_1.integer)('max_users').default(5),
    maxProjects: (0, pg_core_1.integer)('max_projects').default(10),
    maxStorage: (0, pg_core_1.integer)('max_storage').default(5), // in GB
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Organization Insert Schema
exports.insertOrganizationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.organizations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * ======================================================================================
 * SHAREPOINT FILE MANAGEMENT SYSTEM
 * ======================================================================================
 *
 * Enterprise-grade file management with SharePoint/OneDrive functionality
 * Supports multi-tenant isolation, version control, audit trails, and 21 CFR Part 11 compliance
 */
// SharePoint Files table - stores file metadata and hierarchy
exports.sharepoint_files = (0, pg_core_1.pgTable)('sharepoint_files', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }),
    parentId: (0, pg_core_1.integer)('parent_id'),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, pg_core_1.text)('type').notNull(), // 'file' or 'folder'
    mimeType: (0, pg_core_1.text)('mime_type'),
    size: (0, pg_core_1.integer)('size'),
    path: (0, pg_core_1.text)('path').notNull(), // Full path for breadcrumb navigation
    storageUrl: (0, pg_core_1.text)('storage_url'), // URL or path to actual file storage
    checksum: (0, pg_core_1.text)('checksum'), // For integrity verification
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, archived, deleted
    lockedBy: (0, pg_core_1.integer)('locked_by'),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    tags: (0, pg_core_1.text)('tags').array(),
    metadata: (0, pg_core_1.json)('metadata'),
    permissions: (0, pg_core_1.json)('permissions'), // Access control list
    createdBy: (0, pg_core_1.text)('created_by').notNull(),
    modifiedBy: (0, pg_core_1.text)('modified_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    modifiedAt: (0, pg_core_1.timestamp)('modified_at').defaultNow().notNull(),
}, function (table) { return ({
    orgPathIdx: (0, pg_core_1.index)('sharepoint_files_org_path_idx').on(table.organizationId, table.path),
    parentIdx: (0, pg_core_1.index)('sharepoint_files_parent_idx').on(table.parentId),
    statusIdx: (0, pg_core_1.index)('sharepoint_files_status_idx').on(table.status),
}); });
// SharePoint File Versions table - tracks all file versions
exports.sharepoint_file_versions = (0, pg_core_1.pgTable)('sharepoint_file_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    fileId: (0, pg_core_1.integer)('file_id').notNull().references(function () { return exports.sharepoint_files.id; }),
    versionNumber: (0, pg_core_1.text)('version_number').notNull(), // e.g., "1.0", "1.1", "2.0"
    size: (0, pg_core_1.integer)('size'),
    storageUrl: (0, pg_core_1.text)('storage_url').notNull(),
    checksum: (0, pg_core_1.text)('checksum').notNull(),
    changeComment: (0, pg_core_1.text)('change_comment'),
    isMajorVersion: (0, pg_core_1.boolean)('is_major_version').default(false),
    createdBy: (0, pg_core_1.text)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    fileVersionIdx: (0, pg_core_1.uniqueIndex)('file_version_idx').on(table.fileId, table.versionNumber),
}); });
// SharePoint Audit Log table - 21 CFR Part 11 compliance
exports.sharepoint_audit_log = (0, pg_core_1.pgTable)('sharepoint_audit_log', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }),
    fileId: (0, pg_core_1.integer)('file_id').references(function () { return exports.sharepoint_files.id; }),
    action: (0, pg_core_1.text)('action').notNull(), // create, read, update, delete, share, lock, unlock, version, restore
    details: (0, pg_core_1.json)('details'),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
    signature: (0, pg_core_1.text)('signature'), // Digital signature for Part 11 compliance
}, function (table) { return ({
    orgTimestampIdx: (0, pg_core_1.index)('sharepoint_audit_org_timestamp_idx').on(table.organizationId, table.timestamp),
    fileIdx: (0, pg_core_1.index)('sharepoint_audit_file_idx').on(table.fileId),
}); });
// SharePoint Shares table - tracks file/folder sharing
exports.sharepoint_shares = (0, pg_core_1.pgTable)('sharepoint_shares', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    fileId: (0, pg_core_1.integer)('file_id').notNull().references(function () { return exports.sharepoint_files.id; }),
    sharedWith: (0, pg_core_1.text)('shared_with').notNull(), // email or group
    permission: (0, pg_core_1.text)('permission').notNull(), // view, edit, admin
    shareType: (0, pg_core_1.text)('share_type').notNull(), // user, group, link
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
    shareLink: (0, pg_core_1.text)('share_link').unique(),
    password: (0, pg_core_1.text)('password'), // For password-protected links
    accessCount: (0, pg_core_1.integer)('access_count').default(0),
    createdBy: (0, pg_core_1.text)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    fileShareIdx: (0, pg_core_1.index)('sharepoint_shares_file_idx').on(table.fileId),
    sharedWithIdx: (0, pg_core_1.index)('sharepoint_shares_with_idx').on(table.sharedWith),
}); });
// SharePoint File Comments table - for collaboration
exports.sharepoint_comments = (0, pg_core_1.pgTable)('sharepoint_comments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    fileId: (0, pg_core_1.integer)('file_id').notNull().references(function () { return exports.sharepoint_files.id; }),
    parentCommentId: (0, pg_core_1.integer)('parent_comment_id'),
    content: (0, pg_core_1.text)('content').notNull(),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    isResolved: (0, pg_core_1.boolean)('is_resolved').default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    fileCommentIdx: (0, pg_core_1.index)('sharepoint_comments_file_idx').on(table.fileId),
}); });
// SharePoint File Locks table - for check-in/check-out
exports.sharepoint_locks = (0, pg_core_1.pgTable)('sharepoint_locks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    fileId: (0, pg_core_1.integer)('file_id').notNull().references(function () { return exports.sharepoint_files.id; }).unique(),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    lockType: (0, pg_core_1.text)('lock_type').notNull(), // exclusive, shared
    lockReason: (0, pg_core_1.text)('lock_reason'),
    lockedAt: (0, pg_core_1.timestamp)('locked_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
});
/**
 * ======================================================================================
 * DOCUMENT LEAVES & EVIDENCE GRAPH SYSTEM
 * ======================================================================================
 *
 * Tables for the Enhanced Document Editor integration with IND Wizard
 * Supports Facts hydration, tracked changes, and regulatory validation
 */
// Leaves table - stores document leaf content and metadata
exports.leaves = (0, pg_core_1.pgTable)('leaves', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    leafId: (0, pg_core_1.text)('leaf_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    ctdPath: (0, pg_core_1.text)('ctd_path').notNull(),
    templateId: (0, pg_core_1.integer)('template_id'),
    content: (0, pg_core_1.text)('content'),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, review, approved, published
    version: (0, pg_core_1.integer)('version').default(1).notNull(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.text)('created_by'),
    lastModifiedBy: (0, pg_core_1.text)('last_modified_by'),
});
// Facts table - evidence graph facts
exports.facts = (0, pg_core_1.pgTable)('facts', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    factId: (0, pg_core_1.text)('fact_id').notNull().unique(),
    type: (0, pg_core_1.text)('type').notNull(), // drug_substance, clinical, administrative, etc.
    key: (0, pg_core_1.text)('key').notNull(),
    value: (0, pg_core_1.text)('value').notNull(),
    source: (0, pg_core_1.text)('source'),
    confidence: (0, pg_core_1.real)('confidence').default(1.0),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Leaf citations table - maps facts to leaf blocks
exports.leafCitations = (0, pg_core_1.pgTable)('leaf_citations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    leafId: (0, pg_core_1.text)('leaf_id').notNull().references(function () { return exports.leaves.leafId; }),
    factId: (0, pg_core_1.text)('fact_id').notNull().references(function () { return exports.facts.factId; }),
    blockId: (0, pg_core_1.text)('block_id'),
    citationType: (0, pg_core_1.text)('citation_type'), // direct, indirect, reference
    confidence: (0, pg_core_1.real)('confidence'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Leaf patches table - proposed changes with tracked diffs
exports.leafPatches = (0, pg_core_1.pgTable)('leaf_patches', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    patchId: (0, pg_core_1.text)('patch_id').notNull().unique(),
    leafId: (0, pg_core_1.text)('leaf_id').notNull().references(function () { return exports.leaves.leafId; }),
    blocks: (0, pg_core_1.json)('blocks'), // Array of block changes
    citations: (0, pg_core_1.json)('citations'), // Array of citation changes
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, applied, rejected
    author: (0, pg_core_1.text)('author'),
    description: (0, pg_core_1.text)('description'),
    appliedAt: (0, pg_core_1.timestamp)('applied_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Validation findings table - validation results
exports.validationFindings = (0, pg_core_1.pgTable)('validation_findings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    findingId: (0, pg_core_1.text)('finding_id').notNull().unique(),
    leafId: (0, pg_core_1.text)('leaf_id').references(function () { return exports.leaves.leafId; }),
    documentId: (0, pg_core_1.text)('document_id'),
    category: (0, pg_core_1.text)('category').notNull(), // structure, content, formatting, compliance
    severity: (0, pg_core_1.text)('severity').notNull(), // error, warning, info
    check: (0, pg_core_1.text)('check').notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    resolved: (0, pg_core_1.boolean)('resolved').default(false),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at'),
    resolvedBy: (0, pg_core_1.text)('resolved_by'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Audit trail table - e-signatures and approvals
exports.auditTrail = (0, pg_core_1.pgTable)('audit_trail', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    trailId: (0, pg_core_1.text)('trail_id').notNull().unique(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 50 }).notNull(), // Added for Section Graph
    // section, document, leaf, project, module, task, etc.
    entityId: (0, pg_core_1.integer)('entity_id').notNull(), // Added for Section Graph
    leafId: (0, pg_core_1.text)('leaf_id').references(function () { return exports.leaves.leafId; }),
    action: (0, pg_core_1.text)('action').notNull(), // created, modified, approved, rejected, signed
    userId: (0, pg_core_1.text)('user_id').notNull(),
    userName: (0, pg_core_1.text)('user_name'),
    signature: (0, pg_core_1.text)('signature'), // Electronic signature hash
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    reason: (0, pg_core_1.text)('reason'),
    metadata: (0, pg_core_1.json)('metadata'),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, function (table) { return ({
    entityIdx: (0, pg_core_1.index)('audit_trail_entity_idx').on(table.entityType, table.entityId),
    actionIdx: (0, pg_core_1.index)('audit_trail_action_idx').on(table.action),
    userIdx: (0, pg_core_1.index)('audit_trail_user_idx').on(table.userId),
    timestampIdx: (0, pg_core_1.index)('audit_trail_timestamp_idx').on(table.timestamp),
}); });
// Insert schemas for leaves system
exports.insertLeafSchema = (0, drizzle_zod_1.createInsertSchema)(exports.leaves).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFactSchema = (0, drizzle_zod_1.createInsertSchema)(exports.facts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertLeafCitationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.leafCitations).omit({
    id: true,
    createdAt: true,
});
exports.insertLeafPatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.leafPatches).omit({
    id: true,
    createdAt: true,
});
exports.insertValidationFindingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.validationFindings).omit({
    id: true,
    createdAt: true,
});
exports.insertAuditTrailSchema = (0, drizzle_zod_1.createInsertSchema)(exports.auditTrail).omit({
    id: true,
    timestamp: true,
});
/**
 * ======================================================================================
 * MODULE SUBSCRIPTION SYSTEM
 * ======================================================================================
 *
 * Tables for managing module subscriptions for organizations
 * Supports toggling modules on/off per organization for SaaS licensing
 */
// Available modules table - defines all available modules in the system
exports.availableModules = (0, pg_core_1.pgTable)('available_modules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    moduleId: (0, pg_core_1.text)('module_id').notNull().unique(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category'), // submissions, authoring, intelligence, analytics
    path: (0, pg_core_1.text)('path'), // route path in the application
    icon: (0, pg_core_1.text)('icon'), // icon identifier
    isNew: (0, pg_core_1.boolean)('is_new').default(false),
    isHighlight: (0, pg_core_1.boolean)('is_highlight').default(false),
    sortOrder: (0, pg_core_1.integer)('sort_order').default(0),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Module subscriptions table - links organizations to enabled modules
exports.moduleSubscriptions = (0, pg_core_1.pgTable)('module_subscriptions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }, { onDelete: 'cascade' }),
    moduleId: (0, pg_core_1.text)('module_id').notNull().references(function () { return exports.availableModules.moduleId; }, { onDelete: 'cascade' }),
    enabled: (0, pg_core_1.boolean)('enabled').default(true).notNull(),
    enabledAt: (0, pg_core_1.timestamp)('enabled_at'),
    disabledAt: (0, pg_core_1.timestamp)('disabled_at'),
    enabledBy: (0, pg_core_1.text)('enabled_by'),
    disabledBy: (0, pg_core_1.text)('disabled_by'),
    metadata: (0, pg_core_1.json)('metadata'), // can store tier info, custom pricing, limits etc
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    // Ensure each organization can only have one subscription per module
    uniqueOrgModule: (0, pg_core_1.unique)().on(table.organizationId, table.moduleId),
    orgIdx: (0, pg_core_1.index)('module_subscriptions_org_idx').on(table.organizationId),
    moduleIdx: (0, pg_core_1.index)('module_subscriptions_module_idx').on(table.moduleId),
    enabledIdx: (0, pg_core_1.index)('module_subscriptions_enabled_idx').on(table.enabled),
}); });
// Insert schemas for module subscription system
exports.insertAvailableModuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.availableModules).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertModuleSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.moduleSubscriptions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * ======================================================================================
 * SECTION GRAPH & REAL-TIME SYNCHRONIZATION SYSTEM
 * ======================================================================================
 *
 * Tables for cross-document section synchronization and real-time propagation
 * Supports canonical sections, linking, patching, and conflict resolution
 */
// Sections table - canonical sections that can be linked across documents
exports.sections = (0, pg_core_1.pgTable)('sections', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sectionId: (0, pg_core_1.text)('section_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id'),
    title: (0, pg_core_1.text)('title'),
    content: (0, pg_core_1.text)('content'),
    contentHash: (0, pg_core_1.text)('content_hash'),
    version: (0, pg_core_1.integer)('version').default(1).notNull(),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, archived, deleted
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.text)('created_by'),
    lastModifiedBy: (0, pg_core_1.text)('last_modified_by'),
});
// Section links table - links documents to canonical sections
exports.sectionLinks = (0, pg_core_1.pgTable)('section_links', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    leafId: (0, pg_core_1.text)('leaf_id').notNull().references(function () { return exports.leaves.leafId; }),
    sectionId: (0, pg_core_1.text)('section_id').notNull().references(function () { return exports.sections.sectionId; }),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id'),
    blockRange: (0, pg_core_1.json)('block_range'), // {start: blockId, end: blockId}
    linkType: (0, pg_core_1.text)('link_type').default('reference'), // reference, canonical, override
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    leafSectionIdx: (0, pg_core_1.index)('leaf_section_idx').on(table.leafId, table.sectionId),
    sectionLinksIdx: (0, pg_core_1.index)('section_links_idx').on(table.sectionId),
}); });
// Section patches table - changes to canonical sections
exports.sectionPatches = (0, pg_core_1.pgTable)('section_patches', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sectionId: (0, pg_core_1.text)('section_id').notNull().references(function () { return exports.sections.sectionId; }),
    leafId: (0, pg_core_1.text)('leaf_id'), // source leaf that triggered the patch
    patch: (0, pg_core_1.json)('patch').notNull(), // {type, content, blocks, citations, metadata}
    author: (0, pg_core_1.json)('author'), // {id, name, email}
    version: (0, pg_core_1.integer)('version').notNull(),
    conflictsWith: (0, pg_core_1.integer)('conflicts_with'), // references another patch id if conflict
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, applied, rejected, conflict
    appliedAt: (0, pg_core_1.timestamp)('applied_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    sectionPatchesIdx: (0, pg_core_1.index)('section_patches_idx').on(table.sectionId, table.status),
    versionIdx: (0, pg_core_1.index)('section_version_idx').on(table.sectionId, table.version),
}); });
// Section propagations table - tracks propagation of changes to documents
exports.sectionPropagations = (0, pg_core_1.pgTable)('section_propagations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sectionId: (0, pg_core_1.text)('section_id').notNull(),
    patchId: (0, pg_core_1.integer)('patch_id').references(function () { return exports.sectionPatches.id; }),
    targetLeafId: (0, pg_core_1.text)('target_leaf_id').notNull(),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in_progress, completed, failed
    priority: (0, pg_core_1.text)('priority').default('normal'), // low, normal, high, critical
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    lastError: (0, pg_core_1.text)('last_error'),
    scheduledAt: (0, pg_core_1.timestamp)('scheduled_at').defaultNow().notNull(),
    executedAt: (0, pg_core_1.timestamp)('executed_at'),
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    propagationStatusIdx: (0, pg_core_1.index)('propagation_status_idx').on(table.status, table.priority),
    targetLeafIdx: (0, pg_core_1.index)('target_leaf_idx').on(table.targetLeafId),
}); });
// Insert schemas for section system
exports.insertSectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sections).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSectionLinkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectionLinks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSectionPatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectionPatches).omit({
    id: true,
    createdAt: true,
});
exports.insertSectionPropagationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectionPropagations).omit({
    id: true,
    scheduledAt: true,
});
/**
 * ======================================================================================
 * PHARMACEUTICAL SUPPLY CHAIN MANAGEMENT SYSTEM - GxP COMPLIANT DATA MODELS
 * ======================================================================================
 *
 * Comprehensive pharmaceutical supply chain entities for enterprise deployment
 * Includes GxP compliance, 21 CFR Part 11, ICH guidelines, and regulatory requirements
 */
// ============================================================================
// SUPPLIERS & VENDOR MANAGEMENT
// ============================================================================
exports.supplyChainSuppliers = (0, pg_core_1.pgTable)('supply_chain_suppliers', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    supplierCode: (0, pg_core_1.varchar)('supplier_code', { length: 50 }).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    legalName: (0, pg_core_1.text)('legal_name'),
    supplierType: (0, pg_core_1.varchar)('supplier_type', { length: 50 }).notNull(), // API, Excipient, Packaging, Testing, Contract
    qualificationStatus: (0, pg_core_1.varchar)('qualification_status', { length: 50 }).default('pending').notNull(), // pending, qualified, disqualified, suspended
    riskLevel: (0, pg_core_1.varchar)('risk_level', { length: 20 }).default('medium').notNull(), // low, medium, high, critical
    qualificationDate: (0, pg_core_1.date)('qualification_date'),
    nextAuditDate: (0, pg_core_1.date)('next_audit_date'),
    lastAuditDate: (0, pg_core_1.date)('last_audit_date'),
    auditScore: (0, pg_core_1.decimal)('audit_score', { precision: 5, scale: 2 }),
    // Contact Information
    primaryContact: (0, pg_core_1.text)('primary_contact'),
    contactEmail: (0, pg_core_1.text)('contact_email'),
    contactPhone: (0, pg_core_1.text)('contact_phone'),
    // Address Information
    address: (0, pg_core_1.text)('address'),
    city: (0, pg_core_1.text)('city'),
    state: (0, pg_core_1.text)('state'),
    postalCode: (0, pg_core_1.text)('postal_code'),
    country: (0, pg_core_1.text)('country'),
    // Regulatory & Compliance
    regulatoryLicenses: (0, pg_core_1.json)('regulatory_licenses'), // FDA registration, EMA authorization, etc.
    certifications: (0, pg_core_1.json)('certifications'), // ISO 9001, ICH Q7, GDP, etc.
    inspectionHistory: (0, pg_core_1.json)('inspection_history'),
    deviationHistory: (0, pg_core_1.json)('deviation_history'),
    // Business Information
    contractStatus: (0, pg_core_1.varchar)('contract_status', { length: 50 }).default('active'),
    contractExpiry: (0, pg_core_1.date)('contract_expiry'),
    paymentTerms: (0, pg_core_1.text)('payment_terms'),
    deliveryTerms: (0, pg_core_1.text)('delivery_terms'),
    // Performance Metrics
    qualityScore: (0, pg_core_1.decimal)('quality_score', { precision: 5, scale: 2 }),
    deliveryPerformance: (0, pg_core_1.decimal)('delivery_performance', { precision: 5, scale: 2 }),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    metadata: (0, pg_core_1.json)('metadata'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    supplierCodeOrg: (0, pg_core_1.uniqueIndex)('supplier_code_org_idx').on(table.supplierCode, table.organizationId),
    qualificationStatusIdx: (0, pg_core_1.index)('supplier_qualification_status_idx').on(table.qualificationStatus),
    riskLevelIdx: (0, pg_core_1.index)('supplier_risk_level_idx').on(table.riskLevel),
}); });
// ============================================================================
// MATERIALS & SPECIFICATIONS MANAGEMENT
// ============================================================================
exports.supplyChainMaterials = (0, pg_core_1.pgTable)('supply_chain_materials', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    materialCode: (0, pg_core_1.varchar)('material_code', { length: 100 }).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    materialType: (0, pg_core_1.varchar)('material_type', { length: 50 }).notNull(), // API, Excipient, PackagingMaterial, FinishedProduct
    materialCategory: (0, pg_core_1.varchar)('material_category', { length: 50 }), // DrugSubstance, DrugProduct, PrimaryPackaging, etc.
    // Chemical & Regulatory Information
    casNumber: (0, pg_core_1.varchar)('cas_number', { length: 50 }),
    molecularFormula: (0, pg_core_1.text)('molecular_formula'),
    molecularWeight: (0, pg_core_1.decimal)('molecular_weight', { precision: 10, scale: 4 }),
    // Regulatory Status
    regulatoryStatus: (0, pg_core_1.varchar)('regulatory_status', { length: 50 }).default('approved'), // approved, pending, restricted, banned
    dmeFileNumber: (0, pg_core_1.text)('dme_file_number'),
    cepNumber: (0, pg_core_1.text)('cep_number'),
    // Storage & Handling
    storageConditions: (0, pg_core_1.text)('storage_conditions'), // 2-8°C, -20°C, Room Temperature
    handlingInstructions: (0, pg_core_1.text)('handling_instructions'),
    shelfLife: (0, pg_core_1.integer)('shelf_life'), // months
    reorderPoint: (0, pg_core_1.decimal)('reorder_point', { precision: 10, scale: 3 }),
    // Supplier Information
    primarySupplierId: (0, pg_core_1.integer)('primary_supplier_id'),
    approvedSuppliers: (0, pg_core_1.json)('approved_suppliers'), // array of supplier IDs
    // Quality Specifications
    qualityGrade: (0, pg_core_1.varchar)('quality_grade', { length: 50 }), // USP, Ph.Eur, JP, In-house
    specificationVersion: (0, pg_core_1.varchar)('specification_version', { length: 20 }).default('1.0'),
    specifications: (0, pg_core_1.json)('specifications'), // detailed specs with parameters and limits
    // Batch Information
    batchSize: (0, pg_core_1.decimal)('batch_size', { precision: 12, scale: 3 }),
    batchSizeUnit: (0, pg_core_1.varchar)('batch_size_unit', { length: 20 }).default('kg'),
    // Traceability
    isControlled: (0, pg_core_1.boolean)('is_controlled').default(false), // controlled substance
    isHazardous: (0, pg_core_1.boolean)('is_hazardous').default(false),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    metadata: (0, pg_core_1.json)('metadata'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    materialCodeOrg: (0, pg_core_1.uniqueIndex)('material_code_org_idx').on(table.materialCode, table.organizationId),
    materialTypeIdx: (0, pg_core_1.index)('material_type_idx').on(table.materialType),
    casNumberIdx: (0, pg_core_1.index)('cas_number_idx').on(table.casNumber),
    storageConditionsIdx: (0, pg_core_1.index)('storage_conditions_idx').on(table.storageConditions),
}); });
// ============================================================================
// BATCH & LOT MANAGEMENT
// ============================================================================
exports.supplyChainBatches = (0, pg_core_1.pgTable)('supply_chain_batches', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    batchNumber: (0, pg_core_1.varchar)('batch_number', { length: 100 }).notNull(),
    lotNumber: (0, pg_core_1.varchar)('lot_number', { length: 100 }), // same as batch for API, different for DP
    materialId: (0, pg_core_1.integer)('material_id')
        .notNull()
        .references(function () { return exports.materials.id; }),
    // Batch Status & Lifecycle
    batchStatus: (0, pg_core_1.varchar)('batch_status', { length: 50 }).default('in_process').notNull(),
    // in_process, testing, quarantine, approved, rejected, released, recalled
    manufacturingStatus: (0, pg_core_1.varchar)('manufacturing_status', { length: 50 }).default('planned'),
    // planned, in_progress, completed, failed
    // Manufacturing Information
    manufacturingDate: (0, pg_core_1.date)('manufacturing_date'),
    expiryDate: (0, pg_core_1.date)('expiry_date'),
    retest_date: (0, pg_core_1.date)('retest_date'),
    manufacturingSiteId: (0, pg_core_1.integer)('manufacturing_site_id'),
    batchSize: (0, pg_core_1.decimal)('batch_size', { precision: 12, scale: 3 }),
    batchSizeUnit: (0, pg_core_1.varchar)('batch_size_unit', { length: 20 }).default('kg'),
    yield: (0, pg_core_1.decimal)('yield', { precision: 5, scale: 2 }), // percentage
    // Quality Information
    qcStatus: (0, pg_core_1.varchar)('qc_status', { length: 50 }).default('pending'), // pending, in_progress, passed, failed
    qcTestingDate: (0, pg_core_1.date)('qc_testing_date'),
    qcApprovalDate: (0, pg_core_1.date)('qc_approval_date'),
    qcApprovedBy: (0, pg_core_1.text)('qc_approved_by'),
    coaNumber: (0, pg_core_1.varchar)('coa_number', { length: 100 }),
    testResults: (0, pg_core_1.json)('test_results'), // detailed analytical results
    // Release Information
    releaseStatus: (0, pg_core_1.varchar)('release_status', { length: 50 }).default('not_released'),
    // not_released, pending_release, released, recalled
    qpReleaseDate: (0, pg_core_1.date)('qp_release_date'),
    qpReleasedBy: (0, pg_core_1.text)('qp_released_by'),
    releaseNotes: (0, pg_core_1.text)('release_notes'),
    // Genealogy & Traceability
    parentBatchIds: (0, pg_core_1.json)('parent_batch_ids'), // for traceability
    bomVersion: (0, pg_core_1.varchar)('bom_version', { length: 20 }), // Bill of Materials version
    processVersion: (0, pg_core_1.varchar)('process_version', { length: 20 }),
    // Storage & Distribution
    currentLocation: (0, pg_core_1.text)('current_location'),
    storageConditions: (0, pg_core_1.text)('storage_conditions'),
    distributionStatus: (0, pg_core_1.varchar)('distribution_status', { length: 50 }).default('in_stock'),
    // in_stock, shipped, delivered, consumed
    // Compliance & Documentation
    batchRecord: (0, pg_core_1.text)('batch_record'), // link to batch manufacturing record
    deviations: (0, pg_core_1.json)('deviations'), // any manufacturing deviations
    investigations: (0, pg_core_1.json)('investigations'),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    batchNumberOrg: (0, pg_core_1.uniqueIndex)('batch_number_org_idx').on(table.batchNumber, table.organizationId),
    lotNumberOrg: (0, pg_core_1.index)('lot_number_org_idx').on(table.lotNumber, table.organizationId),
    batchStatusIdx: (0, pg_core_1.index)('batch_status_idx').on(table.batchStatus),
    qcStatusIdx: (0, pg_core_1.index)('qc_status_idx').on(table.qcStatus),
    releaseStatusIdx: (0, pg_core_1.index)('release_status_idx').on(table.releaseStatus),
    materialBatchIdx: (0, pg_core_1.index)('material_batch_idx').on(table.materialId, table.batchNumber),
}); });
/**
 * ClientWorkspaces Table
 *
 * Represents client workspaces within an organization.
 * For CRO use case: different clients that the CRO works with.
 * For Biotech: could be different divisions or product lines.
 */
exports.clientWorkspaces = (0, pg_core_1.pgTable)('client_workspaces', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').notNull(),
    description: (0, pg_core_1.text)('description'),
    logo: (0, pg_core_1.text)('logo'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, archived
    quotaProjects: (0, pg_core_1.integer)('quota_projects').default(5), // Project quota for this client
    quotaStorage: (0, pg_core_1.integer)('quota_storage').default(1), // Storage quota in GB
    contactName: (0, pg_core_1.text)('contact_name'),
    contactEmail: (0, pg_core_1.text)('contact_email'),
    contactPhone: (0, pg_core_1.text)('contact_phone'),
    industry: (0, pg_core_1.text)('industry'),
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueOrgSlug: (0, pg_core_1.unique)('unique_org_slug').on(table.organizationId, table.slug),
    };
});
// Client Workspace Insert Schema
exports.insertClientWorkspaceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clientWorkspaces).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Client Access (User-Client Workspace Junction Table)
 *
 * Maps users to client workspaces with role information.
 * Similar to organizationUsers but for the client workspace level.
 */
exports.clientAccess = (0, pg_core_1.pgTable)('client_access', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    role: (0, pg_core_1.text)('role').default('viewer').notNull(), // admin, member, viewer
    permissions: (0, pg_core_1.json)('permissions'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueUserClient: (0, pg_core_1.unique)('unique_user_client').on(table.userId, table.clientWorkspaceId),
    };
});
// Client Access Insert Schema
exports.insertClientAccessSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clientAccess).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Client Workspace Settings Table
 *
 * Stores comprehensive settings for each client workspace including
 * general, quotas, modules, integration, appearance, and notifications.
 */
exports.clientWorkspaceSettings = (0, pg_core_1.pgTable)('client_workspace_settings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // General settings
    generalSettings: (0, pg_core_1.json)('general_settings'),
    // Quota settings
    quotaSettings: (0, pg_core_1.json)('quota_settings'),
    // Module settings
    moduleSettings: (0, pg_core_1.json)('module_settings'),
    // Integration settings
    integrationSettings: (0, pg_core_1.json)('integration_settings'),
    // Appearance settings
    appearanceSettings: (0, pg_core_1.json)('appearance_settings'),
    // Notification settings
    notificationSettings: (0, pg_core_1.json)('notification_settings'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueClientSettings: (0, pg_core_1.unique)('unique_client_settings').on(table.clientWorkspaceId),
    };
});
// Client Workspace Settings Insert Schema
exports.insertClientWorkspaceSettingsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clientWorkspaceSettings).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Client Security Settings Table
 *
 * Stores comprehensive security settings for each client workspace including
 * password policy, session settings, data protection, audit settings, and FDA compliance.
 */
exports.clientSecuritySettings = (0, pg_core_1.pgTable)('client_security_settings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Password policy settings
    passwordPolicySettings: (0, pg_core_1.json)('password_policy_settings'),
    // Session settings
    sessionSettings: (0, pg_core_1.json)('session_settings'),
    // Data protection settings
    dataProtectionSettings: (0, pg_core_1.json)('data_protection_settings'),
    // Audit settings
    auditSettings: (0, pg_core_1.json)('audit_settings'),
    // FDA compliance settings
    fdaComplianceSettings: (0, pg_core_1.json)('fda_compliance_settings'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueClientSecurity: (0, pg_core_1.unique)('unique_client_security').on(table.clientWorkspaceId),
    };
});
// Client Security Settings Insert Schema
exports.insertClientSecuritySettingsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clientSecuritySettings).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * ======================================================================================
 * DOCUMENT AUTHORING WITH 21 CFR PART 11 COMPLIANCE
 * ======================================================================================
 *
 * Complete document management system with electronic signatures, audit trails,
 * version control, and FDA 21 CFR Part 11 compliance requirements.
 */
// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================
exports.documents = (0, pg_core_1.pgTable)('documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    projectId: (0, pg_core_1.integer)('project_id').references(function () { return exports.projects.id; }), // Added for Section Graph
    module: (0, pg_core_1.varchar)('module', { length: 50 }), // Added for Section Graph (e.g., "M1", "M2", "M3")
    version: (0, pg_core_1.varchar)('version', { length: 20 }).default('1.0'), // Added for Section Graph
    regionScope: (0, pg_core_1.text)('region_scope'), // Added for Section Graph (e.g., "FDA", "EMA", "ALL")
    documentCode: (0, pg_core_1.varchar)('document_code', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    documentType: (0, pg_core_1.varchar)('document_type', { length: 50 }).notNull(), // SOP, Protocol, Report, etc.
    category: (0, pg_core_1.varchar)('category', { length: 50 }), // Quality, Clinical, Regulatory, etc.
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft').notNull(),
    // draft, in_review, pending_approval, approved, effective, obsolete
    currentVersionId: (0, pg_core_1.integer)('current_version_id'),
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    expiryDate: (0, pg_core_1.date)('expiry_date'),
    ownerId: (0, pg_core_1.integer)('owner_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    departmentId: (0, pg_core_1.integer)('department_id'),
    // Regulatory Compliance
    complianceLevel: (0, pg_core_1.varchar)('compliance_level', { length: 50 }).default('standard'),
    // standard, gxp, cfr_part_11
    regulatoryReferences: (0, pg_core_1.json)('regulatory_references'), // ICH, FDA, EMA guidelines
    validationStatus: (0, pg_core_1.varchar)('validation_status', { length: 50 }),
    // Security & Access
    accessLevel: (0, pg_core_1.varchar)('access_level', { length: 50 }).default('restricted'),
    // public, internal, restricted, confidential
    accessControlList: (0, pg_core_1.json)('access_control_list'), // user/role permissions
    encryptionStatus: (0, pg_core_1.boolean)('encryption_status').default(false),
    // Metadata
    keywords: (0, pg_core_1.text)('keywords'),
    description: (0, pg_core_1.text)('description'),
    metadata: (0, pg_core_1.json)('metadata'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false),
    lockedById: (0, pg_core_1.integer)('locked_by_id').references(function () { return exports.users.id; }),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    createdById: (0, pg_core_1.integer)('created_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    documentCodeOrg: (0, pg_core_1.uniqueIndex)('document_code_org_idx').on(table.documentCode, table.organizationId),
    documentStatusIdx: (0, pg_core_1.index)('document_status_idx').on(table.status),
    documentTypeIdx: (0, pg_core_1.index)('document_type_idx').on(table.documentType),
    ownerIdx: (0, pg_core_1.index)('document_owner_idx').on(table.ownerId),
    effectiveDateIdx: (0, pg_core_1.index)('document_effective_date_idx').on(table.effectiveDate),
}); });
// ============================================================================
// DOCUMENT VERSIONS
// ============================================================================
exports.documentVersions = (0, pg_core_1.pgTable)('document_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    versionNumber: (0, pg_core_1.varchar)('version_number', { length: 20 }).notNull(), // 1.0, 1.1, 2.0, etc.
    versionLabel: (0, pg_core_1.varchar)('version_label', { length: 50 }), // Draft A, Final, Approved
    content: (0, pg_core_1.text)('content').notNull(), // Document content (JSON/HTML/Markdown)
    changeDescription: (0, pg_core_1.text)('change_description'),
    changeType: (0, pg_core_1.varchar)('change_type', { length: 50 }), // minor, major, editorial
    // Version Status
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft').notNull(),
    // draft, in_review, approved, superseded
    isPublished: (0, pg_core_1.boolean)('is_published').default(false),
    publishedAt: (0, pg_core_1.timestamp)('published_at'),
    // Review & Approval
    reviewedById: (0, pg_core_1.integer)('reviewed_by_id').references(function () { return exports.users.id; }),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at'),
    approvedById: (0, pg_core_1.integer)('approved_by_id').references(function () { return exports.users.id; }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    // File Information
    filePath: (0, pg_core_1.text)('file_path'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    mimeType: (0, pg_core_1.varchar)('mime_type', { length: 100 }),
    checksum: (0, pg_core_1.varchar)('checksum', { length: 64 }), // SHA-256 hash for integrity
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    documentVersionIdx: (0, pg_core_1.uniqueIndex)('document_version_idx').on(table.documentId, table.versionNumber),
    versionStatusIdx: (0, pg_core_1.index)('version_status_idx').on(table.status),
    versionCreatedIdx: (0, pg_core_1.index)('version_created_idx').on(table.createdAt),
}); });
// ============================================================================
// AUDIT TRAIL (21 CFR PART 11 COMPLIANT - IMMUTABLE)
// ============================================================================
exports.documentAuditTrail = (0, pg_core_1.pgTable)('document_audit_trail', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.integer)('document_id').references(function () { return exports.documents.id; }),
    versionId: (0, pg_core_1.integer)('version_id').references(function () { return exports.documentVersions.id; }),
    // Action Information
    actionType: (0, pg_core_1.varchar)('action_type', { length: 50 }).notNull(),
    // create, read, update, delete, approve, reject, sign, lock, unlock, export
    actionCategory: (0, pg_core_1.varchar)('action_category', { length: 50 }).notNull(),
    // document, version, signature, permission, export
    actionDescription: (0, pg_core_1.text)('action_description').notNull(),
    actionResult: (0, pg_core_1.varchar)('action_result', { length: 20 }).notNull(), // success, failure
    // User Information (denormalized for compliance)
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    userName: (0, pg_core_1.text)('user_name').notNull(), // Stored for compliance even if user deleted
    userEmail: (0, pg_core_1.text)('user_email').notNull(),
    userRole: (0, pg_core_1.text)('user_role'),
    // System Information
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    userAgent: (0, pg_core_1.text)('user_agent'),
    sessionId: (0, pg_core_1.varchar)('session_id', { length: 100 }),
    // Before/After State
    previousValue: (0, pg_core_1.json)('previous_value'),
    newValue: (0, pg_core_1.json)('new_value'),
    // Compliance Fields
    reasonForChange: (0, pg_core_1.text)('reason_for_change'),
    justification: (0, pg_core_1.text)('justification'),
    // Integrity
    dataIntegrityCheck: (0, pg_core_1.varchar)('data_integrity_check', { length: 64 }), // Hash of record
    // Timestamp - IMMUTABLE
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, function (table) { return ({
    docAuditDocumentIdx: (0, pg_core_1.index)('doc_audit_document_idx').on(table.documentId),
    docAuditUserIdx: (0, pg_core_1.index)('doc_audit_user_idx').on(table.userId),
    docAuditTimestampIdx: (0, pg_core_1.index)('doc_audit_timestamp_idx').on(table.timestamp),
    docAuditActionIdx: (0, pg_core_1.index)('doc_audit_action_idx').on(table.actionType),
}); });
// ============================================================================
// ELECTRONIC SIGNATURES (21 CFR PART 11)
// ============================================================================
exports.electronicSignatures = (0, pg_core_1.pgTable)('electronic_signatures', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    versionId: (0, pg_core_1.integer)('version_id')
        .notNull()
        .references(function () { return exports.documentVersions.id; }),
    // Signature Details
    signatureType: (0, pg_core_1.varchar)('signature_type', { length: 50 }).notNull(),
    // approval, review, witness, acknowledgment
    signaturePurpose: (0, pg_core_1.text)('signature_purpose').notNull(),
    signatureLevel: (0, pg_core_1.integer)('signature_level').default(1), // 1=first, 2=second signature
    // Signer Information (denormalized for compliance)
    signerId: (0, pg_core_1.integer)('signer_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    signerName: (0, pg_core_1.text)('signer_name').notNull(),
    signerTitle: (0, pg_core_1.text)('signer_title'),
    signerEmail: (0, pg_core_1.text)('signer_email').notNull(),
    // Authentication
    authenticationMethod: (0, pg_core_1.varchar)('authentication_method', { length: 50 }).notNull(),
    // password, biometric, two_factor, smart_card
    authenticationTimestamp: (0, pg_core_1.timestamp)('authentication_timestamp').notNull(),
    secondFactorVerified: (0, pg_core_1.boolean)('second_factor_verified').default(false),
    // Signature Data
    signatureHash: (0, pg_core_1.varchar)('signature_hash', { length: 256 }).notNull(), // Cryptographic signature
    signatureMeaning: (0, pg_core_1.text)('signature_meaning'), // FDA requirement
    signatureManifest: (0, pg_core_1.json)('signature_manifest'), // Full signature details
    // Verification
    isValid: (0, pg_core_1.boolean)('is_valid').default(true),
    verificationStatus: (0, pg_core_1.varchar)('verification_status', { length: 50 }),
    verificationDate: (0, pg_core_1.timestamp)('verification_date'),
    // Compliance
    complianceStatement: (0, pg_core_1.text)('compliance_statement'),
    legalDisclaimer: (0, pg_core_1.text)('legal_disclaimer'),
    // Metadata
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    deviceInfo: (0, pg_core_1.json)('device_info'),
    signedAt: (0, pg_core_1.timestamp)('signed_at').defaultNow().notNull(),
}, function (table) { return ({
    signatureDocumentIdx: (0, pg_core_1.index)('signature_document_idx').on(table.documentId, table.versionId),
    signatureSignerIdx: (0, pg_core_1.index)('signature_signer_idx').on(table.signerId),
    signatureTypeIdx: (0, pg_core_1.index)('signature_type_idx').on(table.signatureType),
    signedAtIdx: (0, pg_core_1.index)('signed_at_idx').on(table.signedAt),
}); });
// ============================================================================
// DOCUMENT LOCKS (COLLABORATION)
// ============================================================================
exports.documentLocks = (0, pg_core_1.pgTable)('document_locks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    sectionId: (0, pg_core_1.varchar)('section_id', { length: 100 }), // Optional section-level locking
    lockType: (0, pg_core_1.varchar)('lock_type', { length: 50 }).notNull(), // exclusive, shared, section
    // Lock Owner
    lockedById: (0, pg_core_1.integer)('locked_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    lockedByName: (0, pg_core_1.text)('locked_by_name').notNull(),
    // Lock Details
    lockReason: (0, pg_core_1.text)('lock_reason'),
    lockToken: (0, pg_core_1.varchar)('lock_token', { length: 100 }).notNull(), // Unique token for lock
    // Timing
    lockedAt: (0, pg_core_1.timestamp)('locked_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    releasedAt: (0, pg_core_1.timestamp)('released_at'),
    // Auto-release
    autoRelease: (0, pg_core_1.boolean)('auto_release').default(true),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    lockDocumentIdx: (0, pg_core_1.index)('lock_document_idx').on(table.documentId),
    lockSectionIdx: (0, pg_core_1.index)('lock_section_idx').on(table.sectionId),
    lockUserIdx: (0, pg_core_1.index)('lock_user_idx').on(table.lockedById),
    lockTokenIdx: (0, pg_core_1.uniqueIndex)('lock_token_idx').on(table.lockToken),
}); });
// ============================================================================
// DOCUMENT COMMENTS
// ============================================================================
exports.documentComments = (0, pg_core_1.pgTable)('document_comments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    versionId: (0, pg_core_1.integer)('version_id').references(function () { return exports.documentVersions.id; }),
    parentCommentId: (0, pg_core_1.integer)('parent_comment_id'),
    // Comment Details
    commentType: (0, pg_core_1.varchar)('comment_type', { length: 50 }).default('general'),
    // general, review, approval, question, suggestion
    sectionReference: (0, pg_core_1.varchar)('section_reference', { length: 200 }), // Section/paragraph reference
    content: (0, pg_core_1.text)('content').notNull(),
    // Status
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('open'),
    // open, resolved, rejected, incorporated
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('normal'),
    // low, normal, high, critical
    // Resolution
    resolvedById: (0, pg_core_1.integer)('resolved_by_id').references(function () { return exports.users.id; }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at'),
    resolutionNote: (0, pg_core_1.text)('resolution_note'),
    // Author
    authorId: (0, pg_core_1.integer)('author_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    authorName: (0, pg_core_1.text)('author_name').notNull(),
    // Metadata
    attachments: (0, pg_core_1.json)('attachments'),
    mentions: (0, pg_core_1.json)('mentions'), // Tagged users
    isEdited: (0, pg_core_1.boolean)('is_edited').default(false),
    editedAt: (0, pg_core_1.timestamp)('edited_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    commentDocumentIdx: (0, pg_core_1.index)('comment_document_idx').on(table.documentId),
    commentAuthorIdx: (0, pg_core_1.index)('comment_author_idx').on(table.authorId),
    commentStatusIdx: (0, pg_core_1.index)('comment_status_idx').on(table.status),
    commentCreatedIdx: (0, pg_core_1.index)('comment_created_idx').on(table.createdAt),
}); });
// ============================================================================
// DOCUMENT ACCESS SESSIONS
// ============================================================================
exports.documentSessions = (0, pg_core_1.pgTable)('document_sessions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sessionToken: (0, pg_core_1.varchar)('session_token', { length: 256 }).notNull(),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Session Details
    documentId: (0, pg_core_1.integer)('document_id').references(function () { return exports.documents.id; }),
    sessionType: (0, pg_core_1.varchar)('session_type', { length: 50 }).default('read'),
    // read, write, review, approve
    // Security
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    userAgent: (0, pg_core_1.text)('user_agent'),
    deviceId: (0, pg_core_1.varchar)('device_id', { length: 100 }),
    // Timing
    startedAt: (0, pg_core_1.timestamp)('started_at').defaultNow().notNull(),
    lastActivityAt: (0, pg_core_1.timestamp)('last_activity_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    endedAt: (0, pg_core_1.timestamp)('ended_at'),
    // Status
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    endReason: (0, pg_core_1.varchar)('end_reason', { length: 50 }), // timeout, logout, forced, expired
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    sessionTokenIdx: (0, pg_core_1.uniqueIndex)('session_token_idx').on(table.sessionToken),
    sessionUserIdx: (0, pg_core_1.index)('session_user_idx').on(table.userId),
    sessionDocumentIdx: (0, pg_core_1.index)('session_document_idx').on(table.documentId),
    sessionActiveIdx: (0, pg_core_1.index)('session_active_idx').on(table.isActive),
}); });
// Export Insert Schemas
exports.insertDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documents).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDocumentVersionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentVersions).omit({
    id: true,
    createdAt: true,
});
exports.insertDocumentAuditTrailSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentAuditTrail).omit({
    id: true,
    timestamp: true,
});
exports.insertElectronicSignatureSchema = (0, drizzle_zod_1.createInsertSchema)(exports.electronicSignatures).omit({
    id: true,
    signedAt: true,
});
exports.insertDocumentLockSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentLocks).omit({
    id: true,
    lockedAt: true,
});
exports.insertDocumentCommentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentComments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDocumentSessionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentSessions).omit({
    id: true,
    startedAt: true,
    lastActivityAt: true,
});
/**
 * ============================================================================
 * ACTIVITY FEED & NOTIFICATIONS SYSTEM
 * ============================================================================
 * SharePoint-style activity tracking and notification management
 */
// Activity Feed Table - tracks all user activities across the system
exports.activityFeed = (0, pg_core_1.pgTable)('activity_feed', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    activityId: (0, pg_core_1.text)('activity_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }, { onDelete: 'cascade' }),
    // Actor information
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    userAvatar: (0, pg_core_1.text)('user_avatar'),
    // Activity details
    activityType: (0, pg_core_1.text)('activity_type').notNull(), // document_modified, component_updated, comment_added, etc.
    action: (0, pg_core_1.text)('action').notNull(), // created, modified, deleted, shared, commented, approved, etc.
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // document, component, comment, project, etc.
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    entityName: (0, pg_core_1.text)('entity_name'),
    entityIcon: (0, pg_core_1.text)('entity_icon'),
    // Additional context
    description: (0, pg_core_1.text)('description'), // Human-readable description
    previewSnippet: (0, pg_core_1.text)('preview_snippet'), // Preview of the content
    changes: (0, pg_core_1.json)('changes'), // Detailed change information
    metadata: (0, pg_core_1.json)('metadata'), // Additional activity metadata
    // Interaction tracking
    likes: (0, pg_core_1.integer)('likes').default(0),
    reactions: (0, pg_core_1.json)('reactions'), // { emoji: count, ... }
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'), // For temporary activities
}, function (table) { return ({
    activityOrgIdx: (0, pg_core_1.index)('activity_org_idx').on(table.organizationId),
    activityUserIdx: (0, pg_core_1.index)('activity_user_idx').on(table.userId),
    activityTypeIdx: (0, pg_core_1.index)('activity_type_idx').on(table.activityType),
    activityEntityIdx: (0, pg_core_1.index)('activity_entity_idx').on(table.entityType, table.entityId),
    activityCreatedIdx: (0, pg_core_1.index)('activity_created_idx').on(table.createdAt),
}); });
// Notifications Table - user-specific notifications
exports.notifications = (0, pg_core_1.pgTable)('notifications', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    notificationId: (0, pg_core_1.text)('notification_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }, { onDelete: 'cascade' }),
    // Recipient information
    recipientId: (0, pg_core_1.integer)('recipient_id')
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Notification details
    type: (0, pg_core_1.text)('type').notNull(), // mention, share, approval_request, compliance_alert, system_alert
    category: (0, pg_core_1.text)('category').notNull(), // collaboration, compliance, system, workflow
    priority: (0, pg_core_1.text)('priority').default('normal'), // low, normal, high, critical
    // Content
    title: (0, pg_core_1.text)('title').notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    icon: (0, pg_core_1.text)('icon'),
    actionUrl: (0, pg_core_1.text)('action_url'), // Where to navigate when clicked
    // Related activity (optional)
    activityId: (0, pg_core_1.text)('activity_id').references(function () { return exports.activityFeed.activityId; }),
    // Status tracking
    isRead: (0, pg_core_1.boolean)('is_read').default(false),
    readAt: (0, pg_core_1.timestamp)('read_at'),
    isDismissed: (0, pg_core_1.boolean)('is_dismissed').default(false),
    dismissedAt: (0, pg_core_1.timestamp)('dismissed_at'),
    // Email notification tracking
    emailSent: (0, pg_core_1.boolean)('email_sent').default(false),
    emailSentAt: (0, pg_core_1.timestamp)('email_sent_at'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'), // For temporary notifications
}, function (table) { return ({
    notificationRecipientIdx: (0, pg_core_1.index)('notification_recipient_idx').on(table.recipientId),
    notificationTypeIdx: (0, pg_core_1.index)('notification_type_idx').on(table.type),
    notificationReadIdx: (0, pg_core_1.index)('notification_read_idx').on(table.isRead),
    notificationCreatedIdx: (0, pg_core_1.index)('notification_created_idx').on(table.createdAt),
}); });
// User Following Table - tracks what users are following
exports.userFollowing = (0, pg_core_1.pgTable)('user_following', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }, { onDelete: 'cascade' }),
    // What is being followed
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // document, component, user, project, folder
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    entityName: (0, pg_core_1.text)('entity_name'),
    // Following settings
    autoFollowed: (0, pg_core_1.boolean)('auto_followed').default(false), // Automatically followed due to interaction
    notifyOnActivity: (0, pg_core_1.boolean)('notify_on_activity').default(true),
    // Timestamps
    followedAt: (0, pg_core_1.timestamp)('followed_at').defaultNow().notNull(),
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    followingUserIdx: (0, pg_core_1.index)('following_user_idx').on(table.userId),
    followingEntityIdx: (0, pg_core_1.index)('following_entity_idx').on(table.entityType, table.entityId),
    uniqueFollowing: (0, pg_core_1.unique)().on(table.userId, table.entityType, table.entityId),
}); });
// Notification Preferences Table - user notification settings
exports.notificationPreferences = (0, pg_core_1.pgTable)('notification_preferences', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: 'cascade' })
        .unique(),
    // Email preferences
    emailMentions: (0, pg_core_1.boolean)('email_mentions').default(true),
    emailShares: (0, pg_core_1.boolean)('email_shares').default(true),
    emailApprovals: (0, pg_core_1.boolean)('email_approvals').default(true),
    emailCompliance: (0, pg_core_1.boolean)('email_compliance').default(true),
    emailSystem: (0, pg_core_1.boolean)('email_system').default(true),
    emailDigest: (0, pg_core_1.text)('email_digest').default('daily'), // none, daily, weekly
    // In-app preferences
    inAppMentions: (0, pg_core_1.boolean)('in_app_mentions').default(true),
    inAppShares: (0, pg_core_1.boolean)('in_app_shares').default(true),
    inAppApprovals: (0, pg_core_1.boolean)('in_app_approvals').default(true),
    inAppCompliance: (0, pg_core_1.boolean)('in_app_compliance').default(true),
    inAppSystem: (0, pg_core_1.boolean)('in_app_system').default(true),
    // Toast preferences
    toastEnabled: (0, pg_core_1.boolean)('toast_enabled').default(true),
    toastDuration: (0, pg_core_1.integer)('toast_duration').default(5000), // milliseconds
    toastPosition: (0, pg_core_1.text)('toast_position').default('top-right'),
    // Quiet hours
    quietHoursEnabled: (0, pg_core_1.boolean)('quiet_hours_enabled').default(false),
    quietHoursStart: (0, pg_core_1.text)('quiet_hours_start'), // HH:MM format
    quietHoursEnd: (0, pg_core_1.text)('quiet_hours_end'), // HH:MM format
    timezone: (0, pg_core_1.text)('timezone').default('UTC'),
    // Other preferences
    autoFollowOnInteraction: (0, pg_core_1.boolean)('auto_follow_on_interaction').default(true),
    soundEnabled: (0, pg_core_1.boolean)('sound_enabled').default(false),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    preferencesUserIdx: (0, pg_core_1.index)('preferences_user_idx').on(table.userId),
}); });
// User Presence Table - tracks user online status
exports.userPresence = (0, pg_core_1.pgTable)('user_presence', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: 'cascade' })
        .unique(),
    // Status
    status: (0, pg_core_1.text)('status').default('offline'), // online, away, offline
    statusMessage: (0, pg_core_1.text)('status_message'),
    // Activity tracking
    lastActivityAt: (0, pg_core_1.timestamp)('last_activity_at').defaultNow().notNull(),
    lastHeartbeatAt: (0, pg_core_1.timestamp)('last_heartbeat_at').defaultNow().notNull(),
    // Current context
    currentDocumentId: (0, pg_core_1.text)('current_document_id'),
    currentComponentId: (0, pg_core_1.text)('current_component_id'),
    currentPageUrl: (0, pg_core_1.text)('current_page_url'),
    // Connection info
    socketId: (0, pg_core_1.text)('socket_id'),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    presenceUserIdx: (0, pg_core_1.index)('presence_user_idx').on(table.userId),
    presenceStatusIdx: (0, pg_core_1.index)('presence_status_idx').on(table.status),
    presenceActivityIdx: (0, pg_core_1.index)('presence_activity_idx').on(table.lastActivityAt),
}); });
// Activity Reactions Table - tracks likes and reactions on activities
exports.activityReactions = (0, pg_core_1.pgTable)('activity_reactions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    activityId: (0, pg_core_1.text)('activity_id')
        .notNull()
        .references(function () { return exports.activityFeed.activityId; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Reaction details
    reactionType: (0, pg_core_1.text)('reaction_type').notNull(), // like, love, celebrate, insightful, curious
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    reactionActivityIdx: (0, pg_core_1.index)('reaction_activity_idx').on(table.activityId),
    reactionUserIdx: (0, pg_core_1.index)('reaction_user_idx').on(table.userId),
    uniqueReaction: (0, pg_core_1.unique)().on(table.activityId, table.userId, table.reactionType),
}); });
// Insert Schemas for Activity & Notification System
exports.insertActivityFeedSchema = (0, drizzle_zod_1.createInsertSchema)(exports.activityFeed).omit({
    id: true,
    createdAt: true,
});
exports.insertNotificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.notifications).omit({
    id: true,
    createdAt: true,
});
exports.insertUserFollowingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userFollowing).omit({
    id: true,
    followedAt: true,
});
exports.insertNotificationPreferencesSchema = (0, drizzle_zod_1.createInsertSchema)(exports.notificationPreferences).omit({
    id: true,
    updatedAt: true,
});
exports.insertUserPresenceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userPresence).omit({
    id: true,
    lastActivityAt: true,
    lastHeartbeatAt: true,
});
exports.insertActivityReactionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.activityReactions).omit({
    id: true,
    createdAt: true,
});
/**
 * Users Table
 *
 * Represents users in the system.
 * Each user belongs to one or more organizations.
 */
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    email: (0, pg_core_1.text)('email').notNull().unique(),
    name: (0, pg_core_1.text)('name').notNull(),
    passwordHash: (0, pg_core_1.text)('password_hash').notNull(),
    title: (0, pg_core_1.text)('title'),
    department: (0, pg_core_1.text)('department'),
    avatar: (0, pg_core_1.text)('avatar'),
    bio: (0, pg_core_1.text)('bio'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, suspended
    lastLogin: (0, pg_core_1.timestamp)('last_login'),
    defaultOrganizationId: (0, pg_core_1.integer)('default_organization_id').references(function () { return exports.organizations.id; }),
    preferences: (0, pg_core_1.json)('preferences'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// User Insert Schema
exports.insertUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.users).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Organization Users (Junction Table)
 *
 * Maps users to organizations with role information.
 */
exports.organizationUsers = (0, pg_core_1.pgTable)('organization_users', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    role: (0, pg_core_1.text)('role').default('member').notNull(), // admin, manager, member, viewer
    permissions: (0, pg_core_1.json)('permissions'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueUserOrg: (0, pg_core_1.unique)('unique_user_org').on(table.userId, table.organizationId),
    };
});
// Organization User Insert Schema
exports.insertOrganizationUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.organizationUsers).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Projects Table
 *
 * Stores CER (Clinical Evaluation Report) projects.
 * Each project belongs to an organization (tenant).
 */
/**
 * ======================================================================================
 * MEDICAL DEVICE & DIAGNOSTICS MODULE
 * ======================================================================================
 *
 * Production-ready tables for FDA medical device submissions:
 * - 510(k) Premarket Notifications
 * - PMA (Premarket Approval) Applications
 * - CER (Clinical Evaluation Reports)
 *
 * Features:
 * - Full 21 CFR Part 11 compliance with audit trails
 * - Tenant-scoped data isolation
 * - Workflow orchestration and status tracking
 * - FDA integration readiness
 * - Electronic signatures and approvals
 */
// Medical Device Master Table - Core device information
exports.medicalDevices = (0, pg_core_1.pgTable)('medical_devices', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Device Identification
    deviceName: (0, pg_core_1.text)('device_name').notNull(),
    deviceModel: (0, pg_core_1.text)('device_model'),
    manufacturer: (0, pg_core_1.text)('manufacturer').notNull(),
    establishmentRegistrationNumber: (0, pg_core_1.text)('establishment_registration_number'),
    // Device Classification
    deviceClass: (0, pg_core_1.text)('device_class').notNull(), // Class I, II, III
    deviceType: (0, pg_core_1.text)('device_type'), // diagnostic, therapeutic, monitoring
    productCode: (0, pg_core_1.text)('product_code'), // FDA product code
    regulationNumber: (0, pg_core_1.text)('regulation_number'), // 21 CFR reference
    // UDI Information
    udiDeviceIdentifier: (0, pg_core_1.text)('udi_device_identifier'),
    udiProductionIdentifier: (0, pg_core_1.text)('udi_production_identifier'),
    gudidSubmissionStatus: (0, pg_core_1.text)('gudid_submission_status'), // pending, submitted, approved
    // Device Details
    intendedUse: (0, pg_core_1.text)('intended_use'),
    indicationsForUse: (0, pg_core_1.text)('indications_for_use'),
    technologyType: (0, pg_core_1.text)('technology_type'),
    isImplantable: (0, pg_core_1.boolean)('is_implantable').default(false),
    isSterile: (0, pg_core_1.boolean)('is_sterile').default(false),
    containsSoftware: (0, pg_core_1.boolean)('contains_software').default(false),
    // Regulatory Status
    regulatoryStatus: (0, pg_core_1.text)('regulatory_status').default('development'), // development, under_review, cleared, approved
    fdaClearanceNumber: (0, pg_core_1.text)('fda_clearance_number'),
    ceMarkStatus: (0, pg_core_1.text)('ce_mark_status'),
    // Metadata
    createdBy: (0, pg_core_1.integer)('created_by').notNull(),
    updatedBy: (0, pg_core_1.integer)('updated_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgDeviceIdx: (0, pg_core_1.index)('medical_devices_org_idx').on(table.organizationId),
    udiIdx: (0, pg_core_1.index)('medical_devices_udi_idx').on(table.udiDeviceIdentifier),
    statusIdx: (0, pg_core_1.index)('medical_devices_status_idx').on(table.regulatoryStatus),
}); });
// 510(k) Submissions Table
exports.fda510kSubmissions = (0, pg_core_1.pgTable)('fda_510k_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    deviceId: (0, pg_core_1.integer)('device_id')
        .notNull()
        .references(function () { return exports.medicalDevices.id; }),
    // Submission Information
    submissionNumber: (0, pg_core_1.text)('submission_number').unique(), // K-number when assigned
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // traditional, special, abbreviated
    submissionStatus: (0, pg_core_1.text)('submission_status').default('draft'), // draft, in_review, submitted, cleared, rejected
    // Predicate Device Information
    predicateDeviceName: (0, pg_core_1.text)('predicate_device_name'),
    predicateDeviceNumber: (0, pg_core_1.text)('predicate_device_number'),
    predicateManufacturer: (0, pg_core_1.text)('predicate_manufacturer'),
    substantialEquivalenceRationale: (0, pg_core_1.text)('substantial_equivalence_rationale'),
    // Testing & Validation
    performanceTestingSummary: (0, pg_core_1.text)('performance_testing_summary'),
    biocompatibilityTesting: (0, pg_core_1.json)('biocompatibility_testing'),
    sterilizationValidation: (0, pg_core_1.json)('sterilization_validation'),
    softwareValidation: (0, pg_core_1.json)('software_validation'),
    clinicalDataSummary: (0, pg_core_1.text)('clinical_data_summary'),
    // Compliance Information
    consensusStandardsUsed: (0, pg_core_1.text)('consensus_standards_used').array(),
    guidanceDocumentsReferenced: (0, pg_core_1.text)('guidance_documents_referenced').array(),
    // Submission Tracking
    targetSubmissionDate: (0, pg_core_1.date)('target_submission_date'),
    actualSubmissionDate: (0, pg_core_1.date)('actual_submission_date'),
    fdaAcknowledgmentDate: (0, pg_core_1.date)('fda_acknowledgment_date'),
    additionalInfoRequestDate: (0, pg_core_1.date)('additional_info_request_date'),
    clearanceDate: (0, pg_core_1.date)('clearance_date'),
    // Electronic Signatures
    preparedBy: (0, pg_core_1.integer)('prepared_by'),
    preparedDate: (0, pg_core_1.timestamp)('prepared_date'),
    reviewedBy: (0, pg_core_1.integer)('reviewed_by'),
    reviewedDate: (0, pg_core_1.timestamp)('reviewed_date'),
    approvedBy: (0, pg_core_1.integer)('approved_by'),
    approvedDate: (0, pg_core_1.timestamp)('approved_date'),
    electronicSignatures: (0, pg_core_1.json)('electronic_signatures'), // Array of signature records
    // Audit Trail
    auditTrail: (0, pg_core_1.json)('audit_trail'), // Comprehensive change history
    validationStatus: (0, pg_core_1.text)('validation_status').default('pending'), // pending, passed, failed
    validationErrors: (0, pg_core_1.json)('validation_errors'),
    // Metadata
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    org510kIdx: (0, pg_core_1.index)('fda_510k_org_idx').on(table.organizationId),
    device510kIdx: (0, pg_core_1.index)('fda_510k_device_idx').on(table.deviceId),
    status510kIdx: (0, pg_core_1.index)('fda_510k_status_idx').on(table.submissionStatus),
    submission510kIdx: (0, pg_core_1.uniqueIndex)('fda_510k_submission_idx').on(table.submissionNumber),
}); });
// CERV2 510(k) Sections Table - FDA eSTAR Document Structure
exports.cerv2510kSections = (0, pg_core_1.pgTable)('cerv2_510k_sections', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.integer)('document_id'), // Optional - can be template or document-specific
    // Section Identification
    sectionNumber: (0, pg_core_1.text)('section_number').notNull(), // e.g., "1.0", "2.0", "17.0"
    sectionTitle: (0, pg_core_1.text)('section_title').notNull(), // e.g., "Medical Device User Fee Cover Sheet"
    sectionKey: (0, pg_core_1.text)('section_key').notNull(), // e.g., "user-fee-cover", "software"
    category: (0, pg_core_1.text)('category').notNull(), // Administrative, Device, Testing, Software, Clinical, Additional
    // Hierarchical Structure
    parentSectionId: (0, pg_core_1.integer)('parent_section_id'), // For subsections
    level: (0, pg_core_1.integer)('level').default(1), // Section depth level
    displayOrder: (0, pg_core_1.integer)('display_order').notNull(), // Sort order
    // Section Configuration
    isRequired: (0, pg_core_1.boolean)('is_required').default(false),
    icon: (0, pg_core_1.text)('icon'), // Lucide icon name
    fields: (0, pg_core_1.json)('fields'), // Array of field definitions
    // Section Content & Status
    content: (0, pg_core_1.text)('content'), // Rich text content
    status: (0, pg_core_1.text)('status').default('todo'), // todo, drafting, validated
    completionPercentage: (0, pg_core_1.integer)('completion_percentage').default(0),
    // Compliance & Sources
    complianceNotes: (0, pg_core_1.text)('compliance_notes'),
    regulatoryReferences: (0, pg_core_1.text)('regulatory_references').array(), // e.g., ["21 CFR 807.87", "FDA Guidance 2023"]
    sources: (0, pg_core_1.json)('sources'), // Evidence/citation tracking
    // Collaboration
    assignedTo: (0, pg_core_1.integer)('assigned_to'),
    reviewer: (0, pg_core_1.integer)('reviewer'),
    dueDate: (0, pg_core_1.date)('due_date'),
    lastEditedBy: (0, pg_core_1.integer)('last_edited_by'),
    // Validation
    validationErrors: (0, pg_core_1.json)('validation_errors'),
    validationStatus: (0, pg_core_1.text)('validation_status').default('pending'),
    // Metadata
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgSectionIdx: (0, pg_core_1.index)('cerv2_sections_org_idx').on(table.organizationId),
    docSectionIdx: (0, pg_core_1.index)('cerv2_sections_doc_idx').on(table.documentId),
    orderIdx: (0, pg_core_1.index)('cerv2_sections_order_idx').on(table.displayOrder),
    statusIdx: (0, pg_core_1.index)('cerv2_sections_status_idx').on(table.status),
}); });
// CERV2 Section Versions Table - Version History & Change Tracking
exports.cerv2SectionVersions = (0, pg_core_1.pgTable)('cerv2_section_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sectionId: (0, pg_core_1.integer)('section_id')
        .notNull()
        .references(function () { return exports.cerv2510kSections.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Version Information
    versionNumber: (0, pg_core_1.integer)('version_number').notNull(), // 1, 2, 3, etc.
    versionLabel: (0, pg_core_1.text)('version_label'), // Optional: "Initial Draft", "Final Review", etc.
    changeType: (0, pg_core_1.text)('change_type').notNull(), // created, edited, reviewed, approved
    changeSummary: (0, pg_core_1.text)('change_summary'), // Brief description of changes
    // Snapshot of Section Data at this Version
    content: (0, pg_core_1.text)('content'), // Section content at this version
    fieldData: (0, pg_core_1.json)('field_data'), // All field values at this version
    status: (0, pg_core_1.text)('status'), // Section status at this version
    completionPercentage: (0, pg_core_1.integer)('completion_percentage'),
    // Change Details
    fieldsChanged: (0, pg_core_1.text)('fields_changed').array(), // List of field IDs that changed
    previousValues: (0, pg_core_1.json)('previous_values'), // Previous field values for diff
    newValues: (0, pg_core_1.json)('new_values'), // New field values for diff
    // User & Timestamp
    changedBy: (0, pg_core_1.integer)('changed_by'), // User ID who made the change
    changedByName: (0, pg_core_1.text)('changed_by_name'), // User name for display
    changedByEmail: (0, pg_core_1.text)('changed_by_email'), // User email
    changedAt: (0, pg_core_1.timestamp)('changed_at').defaultNow().notNull(),
    // Metadata
    ipAddress: (0, pg_core_1.text)('ip_address'), // For audit trail
    userAgent: (0, pg_core_1.text)('user_agent'), // Browser/device info
    comment: (0, pg_core_1.text)('comment'), // Optional comment from user
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    sectionVersionIdx: (0, pg_core_1.index)('cerv2_version_section_idx').on(table.sectionId),
    orgVersionIdx: (0, pg_core_1.index)('cerv2_version_org_idx').on(table.organizationId),
    timestampIdx: (0, pg_core_1.index)('cerv2_version_timestamp_idx').on(table.changedAt),
    userIdx: (0, pg_core_1.index)('cerv2_version_user_idx').on(table.changedBy),
}); });
// CERV2 Document Sessions Table - Tracks open editing sessions
exports.cerv2DocumentSessions = (0, pg_core_1.pgTable)('cerv2_document_sessions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.integer)('document_id').notNull(), // Reference to document
    userId: (0, pg_core_1.integer)('user_id').notNull(), // User with active session
    // Session Data
    openSections: (0, pg_core_1.text)('open_sections').array(), // List of section IDs currently open in tabs
    activeSectionId: (0, pg_core_1.text)('active_section_id'), // Currently focused section
    sectionOrder: (0, pg_core_1.text)('section_order').array(), // Order of tabs
    // Session State
    isDirty: (0, pg_core_1.boolean)('is_dirty').default(false),
    unsavedData: (0, pg_core_1.json)('unsaved_data'), // Temporary unsaved changes
    // Timestamps
    lastActivity: (0, pg_core_1.timestamp)('last_activity').defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'), // Auto-cleanup old sessions
}, function (table) { return ({
    userSessionIdx: (0, pg_core_1.uniqueIndex)('cerv2_session_user_doc_idx').on(table.userId, table.documentId),
    activityIdx: (0, pg_core_1.index)('cerv2_session_activity_idx').on(table.lastActivity),
}); });
// PMA Submissions Table
exports.pmaSubmissions = (0, pg_core_1.pgTable)('pma_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    deviceId: (0, pg_core_1.integer)('device_id')
        .notNull()
        .references(function () { return exports.medicalDevices.id; }),
    // PMA Identification
    pmaNumber: (0, pg_core_1.text)('pma_number').unique(), // P-number when assigned
    supplementNumber: (0, pg_core_1.text)('supplement_number'),
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // original, panel_track_supplement, 180_day_supplement
    // Clinical Trial Information
    clinicalTrialIds: (0, pg_core_1.text)('clinical_trial_ids').array(),
    pivotalStudySummary: (0, pg_core_1.text)('pivotal_study_summary'),
    clinicalDataOverview: (0, pg_core_1.json)('clinical_data_overview'),
    adverseEventsAnalysis: (0, pg_core_1.json)('adverse_events_analysis'),
    // Manufacturing Information
    manufacturingSiteAddresses: (0, pg_core_1.json)('manufacturing_site_addresses'),
    qualitySystemRegulation: (0, pg_core_1.json)('quality_system_regulation'),
    deviceMasterRecord: (0, pg_core_1.text)('device_master_record'),
    // Risk Analysis
    riskAnalysisMethod: (0, pg_core_1.text)('risk_analysis_method'), // FMEA, FTA, HAZOP
    riskMitigationMeasures: (0, pg_core_1.json)('risk_mitigation_measures'),
    residualRiskAssessment: (0, pg_core_1.json)('residual_risk_assessment'),
    // Advisory Committee
    advisoryCommitteeRequired: (0, pg_core_1.boolean)('advisory_committee_required').default(false),
    advisoryCommitteeMeeting: (0, pg_core_1.date)('advisory_committee_meeting'),
    advisoryCommitteeRecommendation: (0, pg_core_1.text)('advisory_committee_recommendation'),
    // Submission Status
    submissionStatus: (0, pg_core_1.text)('submission_status').default('draft'),
    fdaFilingDate: (0, pg_core_1.date)('fda_filing_date'),
    fdaApprovalDate: (0, pg_core_1.date)('fda_approval_date'),
    conditionsOfApproval: (0, pg_core_1.json)('conditions_of_approval'),
    // Post-Approval Requirements
    postApprovalStudies: (0, pg_core_1.json)('post_approval_studies'),
    annualReportsDue: (0, pg_core_1.json)('annual_reports_due'),
    // Compliance & Signatures
    electronicSignatures: (0, pg_core_1.json)('electronic_signatures'),
    auditTrail: (0, pg_core_1.json)('audit_trail'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgPmaIdx: (0, pg_core_1.index)('pma_org_idx').on(table.organizationId),
    devicePmaIdx: (0, pg_core_1.index)('pma_device_idx').on(table.deviceId),
    statusPmaIdx: (0, pg_core_1.index)('pma_status_idx').on(table.submissionStatus),
    pmaNumbderIdx: (0, pg_core_1.uniqueIndex)('pma_number_idx').on(table.pmaNumber),
}); });
// Medical Device Submission Documents
exports.deviceSubmissionDocuments = (0, pg_core_1.pgTable)('device_submission_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // 510k, pma, cer
    submissionId: (0, pg_core_1.integer)('submission_id').notNull(), // References the specific submission
    // Document Information
    documentType: (0, pg_core_1.text)('document_type').notNull(), // cover_letter, substantial_equivalence, clinical_data, etc.
    documentTitle: (0, pg_core_1.text)('document_title').notNull(),
    documentVersion: (0, pg_core_1.text)('document_version').default('1.0'),
    filePath: (0, pg_core_1.text)('file_path'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    mimeType: (0, pg_core_1.text)('mime_type'),
    // Document Status
    status: (0, pg_core_1.text)('status').default('draft'), // draft, under_review, approved, rejected
    reviewComments: (0, pg_core_1.json)('review_comments'),
    // Compliance & Validation
    isRequired: (0, pg_core_1.boolean)('is_required').default(false),
    isSubmitted: (0, pg_core_1.boolean)('is_submitted').default(false),
    validationStatus: (0, pg_core_1.text)('validation_status'),
    validationErrors: (0, pg_core_1.json)('validation_errors'),
    // Electronic Signatures
    uploadedBy: (0, pg_core_1.integer)('uploaded_by'),
    uploadedAt: (0, pg_core_1.timestamp)('uploaded_at'),
    approvedBy: (0, pg_core_1.integer)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgDocIdx: (0, pg_core_1.index)('device_docs_org_idx').on(table.organizationId),
    submissionDocIdx: (0, pg_core_1.index)('device_docs_submission_idx').on(table.submissionType, table.submissionId),
    statusDocIdx: (0, pg_core_1.index)('device_docs_status_idx').on(table.status),
}); });
// Medical Device Workflow Tracking
exports.deviceSubmissionWorkflows = (0, pg_core_1.pgTable)('device_submission_workflows', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Workflow Identification
    workflowType: (0, pg_core_1.text)('workflow_type').notNull(), // 510k_submission, pma_submission, cer_generation
    submissionType: (0, pg_core_1.text)('submission_type').notNull(),
    submissionId: (0, pg_core_1.integer)('submission_id').notNull(),
    // Workflow Steps
    currentStep: (0, pg_core_1.text)('current_step').notNull(),
    completedSteps: (0, pg_core_1.json)('completed_steps').default([]),
    pendingSteps: (0, pg_core_1.json)('pending_steps').default([]),
    totalSteps: (0, pg_core_1.integer)('total_steps'),
    // Progress Tracking
    progressPercentage: (0, pg_core_1.integer)('progress_percentage').default(0),
    estimatedCompletionDate: (0, pg_core_1.date)('estimated_completion_date'),
    // Status & Validation
    workflowStatus: (0, pg_core_1.text)('workflow_status').default('active'), // active, paused, completed, cancelled
    validationCheckpoints: (0, pg_core_1.json)('validation_checkpoints'),
    blockingIssues: (0, pg_core_1.json)('blocking_issues'),
    // Assignments
    assignedTo: (0, pg_core_1.integer)('assigned_to'),
    reviewers: (0, pg_core_1.integer)('reviewers').array(),
    // Timestamps
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    lastActivityAt: (0, pg_core_1.timestamp)('last_activity_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgWorkflowIdx: (0, pg_core_1.index)('device_workflow_org_idx').on(table.organizationId),
    workflowStatusIdx: (0, pg_core_1.index)('device_workflow_status_idx').on(table.workflowStatus),
    submissionWorkflowIdx: (0, pg_core_1.index)('device_workflow_submission_idx').on(table.submissionType, table.submissionId),
}); });
// 21 CFR Part 11 Audit Trail for Medical Devices
exports.deviceAuditTrail = (0, pg_core_1.pgTable)('device_audit_trail', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Audit Information
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // device, 510k, pma, cer, document
    entityId: (0, pg_core_1.integer)('entity_id').notNull(),
    action: (0, pg_core_1.text)('action').notNull(), // created, updated, deleted, submitted, approved, rejected
    // Change Details
    previousValues: (0, pg_core_1.json)('previous_values'),
    newValues: (0, pg_core_1.json)('new_values'),
    changedFields: (0, pg_core_1.text)('changed_fields').array(),
    changeReason: (0, pg_core_1.text)('change_reason'),
    // User & System Information
    userId: (0, pg_core_1.integer)('user_id').notNull(),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    userRole: (0, pg_core_1.text)('user_role'),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    sessionId: (0, pg_core_1.text)('session_id'),
    // Electronic Signature
    electronicSignature: (0, pg_core_1.text)('electronic_signature'),
    signatureTimestamp: (0, pg_core_1.timestamp)('signature_timestamp'),
    signatureMeaning: (0, pg_core_1.text)('signature_meaning'), // approval, review, authorship
    // Compliance
    complianceStandard: (0, pg_core_1.text)('compliance_standard').default('21 CFR Part 11'),
    dataIntegrityCheck: (0, pg_core_1.text)('data_integrity_check'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    orgAuditIdx: (0, pg_core_1.index)('device_audit_org_idx').on(table.organizationId),
    entityAuditIdx: (0, pg_core_1.index)('device_audit_entity_idx').on(table.entityType, table.entityId),
    userAuditIdx: (0, pg_core_1.index)('device_audit_user_idx').on(table.userId),
    timestampAuditIdx: (0, pg_core_1.index)('device_audit_timestamp_idx').on(table.createdAt),
}); });
// Data Lineage Tracking for 510(k) Compliance
exports.dataLineageTracking = (0, pg_core_1.pgTable)('data_lineage_tracking', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Project and Workflow
    projectId: (0, pg_core_1.text)('project_id').notNull(),
    workflowId: (0, pg_core_1.text)('workflow_id'),
    // Source Information
    sourceField: (0, pg_core_1.text)('source_field').notNull(), // e.g., "strategy.device_intake.deviceName"
    sourceValue: (0, pg_core_1.json)('source_value'),
    sourceStage: (0, pg_core_1.text)('source_stage'),
    sourceSection: (0, pg_core_1.text)('source_section'),
    // Target Information
    targetSection: (0, pg_core_1.text)('target_section').notNull(), // e.g., "FDA_3881"
    targetField: (0, pg_core_1.text)('target_field').notNull(), // e.g., "device_name"
    // Mapping Rules
    mappingRule: (0, pg_core_1.text)('mapping_rule').notNull(), // e.g., "DIRECT_COPY", "TRANSFORM"
    transformations: (0, pg_core_1.text)('transformations').array(), // e.g., ["TRIM", "UPPERCASE_FIRST"]
    // Tracking
    userId: (0, pg_core_1.integer)('user_id').notNull(),
    sessionId: (0, pg_core_1.text)('session_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    projectLineageIdx: (0, pg_core_1.index)('lineage_project_idx').on(table.projectId, table.organizationId),
    sourceFieldIdx: (0, pg_core_1.index)('lineage_source_idx').on(table.sourceField),
    targetFieldIdx: (0, pg_core_1.index)('lineage_target_idx').on(table.targetSection, table.targetField),
}); });
// FDA Integration Logs
exports.fdaIntegrationLogs = (0, pg_core_1.pgTable)('fda_integration_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Integration Details
    integrationType: (0, pg_core_1.text)('integration_type').notNull(), // openFDA, GUDID, CDRH_Portal, eSubmitter
    apiEndpoint: (0, pg_core_1.text)('api_endpoint'),
    httpMethod: (0, pg_core_1.text)('http_method'),
    // Request/Response
    requestPayload: (0, pg_core_1.json)('request_payload'),
    responsePayload: (0, pg_core_1.json)('response_payload'),
    httpStatusCode: (0, pg_core_1.integer)('http_status_code'),
    // Related Entity
    relatedEntityType: (0, pg_core_1.text)('related_entity_type'),
    relatedEntityId: (0, pg_core_1.integer)('related_entity_id'),
    // Status & Error Handling
    status: (0, pg_core_1.text)('status').notNull(), // success, failure, timeout, rate_limited
    errorMessage: (0, pg_core_1.text)('error_message'),
    errorCode: (0, pg_core_1.text)('error_code'),
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    // Performance Metrics
    requestDuration: (0, pg_core_1.integer)('request_duration'), // in milliseconds
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIntegrationIdx: (0, pg_core_1.index)('fda_integration_org_idx').on(table.organizationId),
    statusIntegrationIdx: (0, pg_core_1.index)('fda_integration_status_idx').on(table.status),
    typeIntegrationIdx: (0, pg_core_1.index)('fda_integration_type_idx').on(table.integrationType),
}); });
// Enhanced CER Projects Table with Medical Device Integration
exports.cerProjects = (0, pg_core_1.pgTable)('cer_projects', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id').references(function () { return exports.clientWorkspaces.id; }),
    // Link to Medical Device
    deviceId: (0, pg_core_1.integer)('device_id').references(function () { return exports.medicalDevices.id; }),
    // Project Information
    name: (0, pg_core_1.text)('name').notNull(),
    deviceName: (0, pg_core_1.text)('device_name').notNull(),
    deviceManufacturer: (0, pg_core_1.text)('device_manufacturer').notNull(),
    deviceType: (0, pg_core_1.text)('device_type'),
    deviceClass: (0, pg_core_1.text)('device_class'),
    regulatoryContext: (0, pg_core_1.text)('regulatory_context'), // MDR, IVDR, FDA, etc.
    description: (0, pg_core_1.text)('description'),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in-progress, review, approved, published
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    assignedToId: (0, pg_core_1.integer)('assigned_to_id').references(function () { return exports.users.id; }),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    startDate: (0, pg_core_1.timestamp)('start_date'),
    completionDate: (0, pg_core_1.timestamp)('completion_date'),
    reviewDate: (0, pg_core_1.timestamp)('review_date'),
    qmpId: (0, pg_core_1.integer)('qmp_id'), // Reference to Quality Management Plan
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CER Project Insert Schema
exports.insertCerProjectSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerProjects).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Documents Table
 *
 * Stores document references for CER projects with VAULT integration hooks.
 */
exports.projectDocuments = (0, pg_core_1.pgTable)('project_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.cerProjects.id; }),
    vaultDocumentId: (0, pg_core_1.uuid)('vault_document_id'), // Reference to document in VAULT
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, pg_core_1.text)('type').notNull(), // protocol, report, publication, etc.
    category: (0, pg_core_1.text)('category'), // literature, clinical-investigation, post-market, etc.
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in-review, approved, published
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    filePath: (0, pg_core_1.text)('file_path'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    mimeType: (0, pg_core_1.text)('mime_type'),
    checksum: (0, pg_core_1.text)('checksum'),
    uploadedById: (0, pg_core_1.integer)('uploaded_by_id').references(function () { return exports.users.id; }),
    metaData: (0, pg_core_1.json)('meta_data'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Document Insert Schema
exports.insertProjectDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Activities Table
 *
 * Tracks activities and changes within a CER project for audit trail purposes.
 */
exports.projectActivities = (0, pg_core_1.pgTable)('project_activities', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.cerProjects.id; }),
    userId: (0, pg_core_1.integer)('user_id').references(function () { return exports.users.id; }),
    activityType: (0, pg_core_1.text)('activity_type').notNull(), // create, update, delete, review, approve, etc.
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // project, document, section, etc.
    entityId: (0, pg_core_1.text)('entity_id').notNull(), // ID of the entity affected
    description: (0, pg_core_1.text)('description').notNull(),
    details: (0, pg_core_1.json)('details'),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Project Activity Insert Schema
exports.insertProjectActivitySchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectActivities).omit({
    id: true,
    createdAt: true,
});
/**
 * Project Milestones Table
 *
 * Tracks important milestones and deadlines for CER projects.
 */
exports.projectMilestones = (0, pg_core_1.pgTable)('project_milestones', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.cerProjects.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    dueDate: (0, pg_core_1.timestamp)('due_date').notNull(),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    completedById: (0, pg_core_1.integer)('completed_by_id').references(function () { return exports.users.id; }),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in-progress, completed, missed
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // low, medium, high, critical
    notifyDays: (0, pg_core_1.integer)('notify_days').default(7), // Days before due date to send notification
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Milestone Insert Schema
exports.insertProjectMilestoneSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectMilestones).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Client User Permissions Table
 *
 * Defines fine-grained permissions for users on specific projects.
 */
exports.clientUserPermissions = (0, pg_core_1.pgTable)('client_user_permissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    projectId: (0, pg_core_1.integer)('project_id').references(function () { return exports.cerProjects.id; }),
    // If projectId is null, permissions apply to all projects in the organization
    permissions: (0, pg_core_1.json)('permissions').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueUserProject: (0, pg_core_1.unique)('unique_user_project').on(table.userId, table.projectId),
    };
});
// Client User Permission Insert Schema
exports.insertClientUserPermissionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clientUserPermissions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Define table relationships
exports.organizationsRelations = (0, drizzle_orm_1.relations)(exports.organizations, function (_a) {
    var many = _a.many;
    return ({
        users: many(exports.organizationUsers),
        cerProjects: many(exports.cerProjects),
        projects: many(exports.projects),
        clientWorkspaces: many(exports.clientWorkspaces),
        projectTemplates: many(exports.projectTemplates),
    });
});
exports.usersRelations = (0, drizzle_orm_1.relations)(exports.users, function (_a) {
    var many = _a.many;
    return ({
        organizations: many(exports.organizationUsers),
        permissions: many(exports.clientUserPermissions),
        clientAccess: many(exports.clientAccess),
    });
});
exports.cerProjectsRelations = (0, drizzle_orm_1.relations)(exports.cerProjects, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.cerProjects.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.cerProjects.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        documents: many(exports.projectDocuments),
        activities: many(exports.projectActivities),
        milestones: many(exports.projectMilestones),
        approvals: many(exports.cerApprovals),
    });
});
exports.projectDocumentsRelations = (0, drizzle_orm_1.relations)(exports.projectDocuments, function (_a) {
    var one = _a.one;
    return ({
        project: one(exports.cerProjects, {
            fields: [exports.projectDocuments.projectId],
            references: [exports.cerProjects.id],
        }),
        organization: one(exports.organizations, {
            fields: [exports.projectDocuments.organizationId],
            references: [exports.organizations.id],
        }),
    });
});
exports.projectActivitiesRelations = (0, drizzle_orm_1.relations)(exports.projectActivities, function (_a) {
    var one = _a.one;
    return ({
        project: one(exports.cerProjects, {
            fields: [exports.projectActivities.projectId],
            references: [exports.cerProjects.id],
        }),
        organization: one(exports.organizations, {
            fields: [exports.projectActivities.organizationId],
            references: [exports.organizations.id],
        }),
        user: one(exports.users, {
            fields: [exports.projectActivities.userId],
            references: [exports.users.id],
        }),
    });
});
/**
 * CMC Database Schema - Real Pharmaceutical CMC Workflows
 */
// Analytical Methods Table - Core CMC functionality
exports.analyticalMethods = (0, pg_core_1.pgTable)('analytical_methods', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    methodCode: (0, pg_core_1.text)('method_code').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    purpose: (0, pg_core_1.text)('purpose').notNull(),
    analyte: (0, pg_core_1.text)('analyte').notNull(),
    matrix: (0, pg_core_1.text)('matrix').notNull(),
    technique: (0, pg_core_1.text)('technique').notNull(), // HPLC, GC, UV-VIS, etc.
    status: (0, pg_core_1.text)('status').default('development').notNull(), // development, validation, validated, retired
    ichQ2Parameters: (0, pg_core_1.json)('ich_q2_parameters'), // Validation parameters
    systemSuitability: (0, pg_core_1.json)('system_suitability'),
    acceptance_criteria: (0, pg_core_1.json)('acceptance_criteria'),
    robustness_data: (0, pg_core_1.json)('robustness_data'),
    validationDate: (0, pg_core_1.timestamp)('validation_date'),
    developedBy: (0, pg_core_1.integer)('developed_by').references(function () { return exports.users.id; }),
    validatedBy: (0, pg_core_1.integer)('validated_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Process Validation Table - 3 Stage Lifecycle
exports.processValidation = (0, pg_core_1.pgTable)('process_validation', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    processName: (0, pg_core_1.text)('process_name').notNull(),
    stage: (0, pg_core_1.text)('stage').notNull(), // design, qualification, verification
    batchNumbers: (0, pg_core_1.text)('batch_numbers').array(),
    criticalProcessParameters: (0, pg_core_1.json)('critical_process_parameters'),
    criticalQualityAttributes: (0, pg_core_1.json)('critical_quality_attributes'),
    controlStrategy: (0, pg_core_1.json)('control_strategy'),
    validationProtocol: (0, pg_core_1.text)('validation_protocol'),
    validationReport: (0, pg_core_1.text)('validation_report'),
    status: (0, pg_core_1.text)('status').default('planning').notNull(),
    leadValidator: (0, pg_core_1.integer)('lead_validator').references(function () { return exports.users.id; }),
    approvedBy: (0, pg_core_1.integer)('approved_by').references(function () { return exports.users.id; }),
    approvalDate: (0, pg_core_1.timestamp)('approval_date'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Stability Studies Table - ICH Q1 Compliance with Complete Lifecycle Support
exports.stabilityStudies = (0, pg_core_1.pgTable)('stability_studies', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyTitle: (0, pg_core_1.text)('study_title'),
    productName: (0, pg_core_1.text)('product_name').notNull(),
    batchNumber: (0, pg_core_1.text)('batch_number').notNull(),
    dosageForm: (0, pg_core_1.text)('dosage_form').notNull().default('Tablet'),
    strength: (0, pg_core_1.text)('strength'),
    scope: (0, pg_core_1.text)('scope').notNull().default('DP'), // DP = Drug Product, DS = Drug Substance
    climaticZone: (0, pg_core_1.text)('climatic_zone').notNull().default('II'),
    studyType: (0, pg_core_1.text)('study_type').notNull().default('long-term'), // long-term, accelerated, intermediate, stress
    storageConditions: (0, pg_core_1.text)('storage_conditions').array().notNull(), // ['LT', 'ACC', 'INT', 'REF']
    duration: (0, pg_core_1.integer)('duration').notNull().default(24), // months
    testParameters: (0, pg_core_1.text)('test_parameters').array().notNull(), // ['Assay', 'Related Substances', etc.]
    testingSchedule: (0, pg_core_1.json)('testing_schedule'),
    timePoints: (0, pg_core_1.text)('time_points').array(),
    stabilityData: (0, pg_core_1.json)('stability_data'),
    notes: (0, pg_core_1.text)('notes'),
    shelfLife: (0, pg_core_1.text)('shelf_life'),
    status: (0, pg_core_1.text)('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, PAUSED, COMPLETED
    startDate: (0, pg_core_1.timestamp)('start_date').notNull(),
    plannedEndDate: (0, pg_core_1.timestamp)('planned_end_date'),
    studyDirector: (0, pg_core_1.integer)('study_director').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Quality Control Testing Table
exports.qcTesting = (0, pg_core_1.pgTable)('qc_testing', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    sampleId: (0, pg_core_1.text)('sample_id').notNull(),
    sampleType: (0, pg_core_1.text)('sample_type').notNull(), // raw-material, in-process, finished-product
    testMethod: (0, pg_core_1.text)('test_method').notNull(),
    testResults: (0, pg_core_1.json)('test_results'),
    specifications: (0, pg_core_1.json)('specifications'),
    passFailStatus: (0, pg_core_1.text)('pass_fail_status'), // pass, fail, pending
    certificateOfAnalysis: (0, pg_core_1.text)('certificate_of_analysis'),
    analyst: (0, pg_core_1.integer)('analyst').references(function () { return exports.users.id; }),
    reviewedBy: (0, pg_core_1.integer)('reviewed_by').references(function () { return exports.users.id; }),
    testDate: (0, pg_core_1.timestamp)('test_date').notNull(),
    releaseDate: (0, pg_core_1.timestamp)('release_date'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CMC Change Control Table
exports.cmcChangeControl = (0, pg_core_1.pgTable)('cmc_change_control', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    changeNumber: (0, pg_core_1.text)('change_number').notNull(),
    changeType: (0, pg_core_1.text)('change_type').notNull(), // process, analytical, specification, etc.
    description: (0, pg_core_1.text)('description').notNull(),
    justification: (0, pg_core_1.text)('justification').notNull(),
    impactAssessment: (0, pg_core_1.json)('impact_assessment'),
    riskAssessment: (0, pg_core_1.json)('risk_assessment'),
    regulatoryFiling: (0, pg_core_1.text)('regulatory_filing'), // Prior approval, CBE-30, Annual Report
    status: (0, pg_core_1.text)('status').default('draft').notNull(),
    initiator: (0, pg_core_1.integer)('initiator').references(function () { return exports.users.id; }),
    approvers: (0, pg_core_1.integer)('approvers').array(),
    implementationDate: (0, pg_core_1.timestamp)('implementation_date'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Drug Substances Table - Enhanced CMC
exports.drugSubstances = (0, pg_core_1.pgTable)('drug_substances', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    substanceName: (0, pg_core_1.text)('substance_name').notNull(),
    structuralFormula: (0, pg_core_1.text)('structural_formula'),
    molecularFormula: (0, pg_core_1.text)('molecular_formula'),
    molecularWeight: (0, pg_core_1.decimal)('molecular_weight'),
    casNumber: (0, pg_core_1.text)('cas_number'),
    inn: (0, pg_core_1.text)('inn'), // International Nonproprietary Name
    manufacturingProcess: (0, pg_core_1.json)('manufacturing_process'),
    specifications: (0, pg_core_1.json)('specifications'),
    impuritiesProfile: (0, pg_core_1.json)('impurities_profile'),
    stability: (0, pg_core_1.json)('stability'),
    controlOfMaterials: (0, pg_core_1.json)('control_of_materials'),
    status: (0, pg_core_1.text)('status').default('development').notNull(),
    developmentPhase: (0, pg_core_1.text)('development_phase'), // preclinical, phase1, phase2, phase3, commercial
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Drug Products Table - Enhanced CMC
exports.drugProducts = (0, pg_core_1.pgTable)('drug_products', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    productName: (0, pg_core_1.text)('product_name').notNull(),
    dosageForm: (0, pg_core_1.text)('dosage_form').notNull(),
    strength: (0, pg_core_1.text)('strength').notNull(),
    routeOfAdministration: (0, pg_core_1.text)('route_of_administration'),
    composition: (0, pg_core_1.json)('composition'),
    manufacturingProcess: (0, pg_core_1.json)('manufacturing_process'),
    batchFormula: (0, pg_core_1.json)('batch_formula'),
    processControls: (0, pg_core_1.json)('process_controls'),
    specifications: (0, pg_core_1.json)('specifications'),
    packagingMaterials: (0, pg_core_1.json)('packaging_materials'),
    stability: (0, pg_core_1.json)('stability'),
    status: (0, pg_core_1.text)('status').default('development').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Regulatory Documents Table
exports.regulatoryDocuments = (0, pg_core_1.pgTable)('regulatory_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    title: (0, pg_core_1.text)('title').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    documentType: (0, pg_core_1.text)('document_type').notNull(), // IND, NDA, BLA, eCTD, etc.
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in-review, approved, published
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedById: (0, pg_core_1.integer)('last_modified_by_id').references(function () { return exports.users.id; }),
    filePath: (0, pg_core_1.text)('file_path'),
    metadata: (0, pg_core_1.json)('metadata'),
    complianceMetrics: (0, pg_core_1.json)('compliance_metrics'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CMC Schema Types and Insert Schemas
exports.insertAnalyticalMethodSchema = (0, drizzle_zod_1.createInsertSchema)(exports.analyticalMethods).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertProcessValidationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.processValidation).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertStabilityStudySchema = (0, drizzle_zod_1.createInsertSchema)(exports.stabilityStudies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertQcTestingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.qcTesting).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCmcChangeControlSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cmcChangeControl).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDrugSubstanceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.drugSubstances).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDrugProductSchema = (0, drizzle_zod_1.createInsertSchema)(exports.drugProducts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Regulatory Document Insert Schema
exports.insertRegulatoryDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regulatoryDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Simple Document Versions Table (renamed to avoid conflict)
 *
 * Tracks simple version history for non-compliant documents.
 * For 21 CFR Part 11 compliant version tracking, use the 'documentVersions' table defined earlier.
 */
exports.simpleDocumentVersions = (0, pg_core_1.pgTable)('simple_document_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.simpleDocuments.id; }),
    versionNumber: (0, pg_core_1.text)('version_number').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    changeDescription: (0, pg_core_1.text)('change_description'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Simple Document Version Insert Schema
exports.insertSimpleDocumentVersionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.simpleDocumentVersions).omit({
    id: true,
    createdAt: true,
});
/**
 * CER Approvals Table
 *
 * Tracks approval workflow for CER documents and sections.
 */
exports.cerApprovals = (0, pg_core_1.pgTable)('cer_approvals', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.cerProjects.id; }),
    documentId: (0, pg_core_1.integer)('document_id').references(function () { return exports.projectDocuments.id; }),
    sectionKey: (0, pg_core_1.text)('section_key'),
    approvalType: (0, pg_core_1.text)('approval_type').notNull(), // document, section, project
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, approved, rejected
    requestedById: (0, pg_core_1.integer)('requested_by_id').references(function () { return exports.users.id; }),
    requestedAt: (0, pg_core_1.timestamp)('requested_at').defaultNow().notNull(),
    approvedById: (0, pg_core_1.integer)('approved_by_id').references(function () { return exports.users.id; }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    rejectedById: (0, pg_core_1.integer)('rejected_by_id').references(function () { return exports.users.id; }),
    rejectedAt: (0, pg_core_1.timestamp)('rejected_at'),
    comments: (0, pg_core_1.text)('comments'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CER Approval Insert Schema
exports.insertCerApprovalSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerApprovals).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Documents Table
 *
 * Represents documents associated with CER projects.
 */
exports.cerDocuments = (0, pg_core_1.pgTable)('cer_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    cerProjectId: (0, pg_core_1.integer)('cer_project_id')
        .notNull()
        .references(function () { return exports.cerProjects.id; }),
    documentType: (0, pg_core_1.text)('document_type').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    version: (0, pg_core_1.text)('version').notNull(),
    status: (0, pg_core_1.text)('status').notNull(),
    content: (0, pg_core_1.json)('content'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    updatedById: (0, pg_core_1.integer)('updated_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CER Document Insert Schema
exports.insertCerDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Device Profiles Table
 *
 * Medical device profile information for 510(k) and CER submissions
 */
exports.deviceProfiles = (0, pg_core_1.pgTable)('device_profiles', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    deviceName: (0, pg_core_1.text)('device_name').notNull(),
    deviceType: (0, pg_core_1.text)('device_type'),
    manufacturer: (0, pg_core_1.text)('manufacturer'),
    intendedUse: (0, pg_core_1.text)('intended_use'),
    classification: (0, pg_core_1.text)('classification'),
    predicate: (0, pg_core_1.text)('predicate'),
    status: (0, pg_core_1.text)('status').default('draft'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
/**
 * Device Submissions Table
 *
 * Tracks 510(k) and MDR submission progress for devices
 */
exports.deviceSubmissions = (0, pg_core_1.pgTable)('device_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    deviceProfileId: (0, pg_core_1.integer)('device_profile_id')
        .notNull()
        .references(function () { return exports.deviceProfiles.id; }),
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // 510k, MDR, PMA
    status: (0, pg_core_1.text)('status').default('draft'),
    submissionNumber: (0, pg_core_1.text)('submission_number'),
    submissionDate: (0, pg_core_1.timestamp)('submission_date'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
/**
 * CER Essential Requirements Table
 *
 * Essential requirements mapping for MDR compliance
 */
exports.cerEssentialRequirements = (0, pg_core_1.pgTable)('cer_essential_requirements', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    requirementNumber: (0, pg_core_1.text)('requirement_number').notNull(),
    requirementText: (0, pg_core_1.text)('requirement_text'),
    status: (0, pg_core_1.text)('status').default('pending'),
    evidence: (0, pg_core_1.text)('evidence'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
/**
 * CER Reports Table
 *
 * Main reports for Clinical Evaluation Reports (CER)
 */
exports.cerReports = (0, pg_core_1.pgTable)('cer_reports', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    cerProjectId: (0, pg_core_1.integer)('cer_project_id').references(function () { return exports.cerProjects.id; }),
    reportId: (0, pg_core_1.text)('report_id').notNull().unique(),
    deviceName: (0, pg_core_1.text)('device_name').notNull(),
    deviceManufacturer: (0, pg_core_1.text)('device_manufacturer'),
    deviceType: (0, pg_core_1.text)('device_type'),
    status: (0, pg_core_1.text)('status').default('draft').notNull(),
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    content: (0, pg_core_1.json)('content'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerReports).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Clinical Evidence Table
 *
 * Clinical evidence data linked to CER reports
 */
exports.cerClinicalEvidence = (0, pg_core_1.pgTable)('cer_clinical_evidence', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    evidenceType: (0, pg_core_1.text)('evidence_type').notNull(),
    source: (0, pg_core_1.text)('source'),
    description: (0, pg_core_1.text)('description'),
    relevance: (0, pg_core_1.text)('relevance'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
/**
 * CER Templates Table
 *
 * Regulatory templates for CER generation
 */
exports.cerTemplates = (0, pg_core_1.pgTable)('cer_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    templateType: (0, pg_core_1.text)('template_type').notNull(),
    content: (0, pg_core_1.json)('content'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
/**
 * CER Version History Table
 *
 * Tracks version history and changes for CER reports
 */
exports.cerVersionHistory = (0, pg_core_1.pgTable)('cer_version_history', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    versionNumber: (0, pg_core_1.integer)('version_number').notNull(),
    changes: (0, pg_core_1.json)('changes'),
    changedBy: (0, pg_core_1.integer)('changed_by').references(function () { return exports.users.id; }),
    changeReason: (0, pg_core_1.text)('change_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
/**
 * CER Sections Table
 *
 * Individual sections within a CER report
 */
exports.cerSections = (0, pg_core_1.pgTable)('cer_sections', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    sectionId: (0, pg_core_1.text)('section_id').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    order: (0, pg_core_1.integer)('order').notNull(),
    content: (0, pg_core_1.json)('content'),
    status: (0, pg_core_1.text)('status').default('draft'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerSectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerSections).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER FAERS Data Table
 *
 * FDA Adverse Event Reporting System data for CER reports
 */
exports.cerFaersData = (0, pg_core_1.pgTable)('cer_faers_data', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    faersId: (0, pg_core_1.text)('faers_id').notNull(),
    eventDate: (0, pg_core_1.timestamp)('event_date'),
    eventType: (0, pg_core_1.text)('event_type'),
    severity: (0, pg_core_1.text)('severity'),
    deviceInfo: (0, pg_core_1.json)('device_info'),
    patientInfo: (0, pg_core_1.json)('patient_info'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerFaersDataSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerFaersData).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Literature Table
 *
 * Literature references and analysis for CER reports
 */
exports.cerLiterature = (0, pg_core_1.pgTable)('cer_literature', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    literatureId: (0, pg_core_1.text)('literature_id').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    authors: (0, pg_core_1.json)('authors'),
    publicationDate: (0, pg_core_1.timestamp)('publication_date'),
    journal: (0, pg_core_1.text)('journal'),
    doi: (0, pg_core_1.text)('doi'),
    pmid: (0, pg_core_1.text)('pmid'),
    relevanceScore: (0, pg_core_1.real)('relevance_score'),
    included: (0, pg_core_1.boolean)('included').default(false),
    summary: (0, pg_core_1.text)('summary'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerLiteratureSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerLiterature).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Compliance Checks Table
 *
 * Compliance verification for CER reports
 */
exports.cerComplianceChecks = (0, pg_core_1.pgTable)('cer_compliance_checks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    checkId: (0, pg_core_1.text)('check_id').notNull(),
    checkType: (0, pg_core_1.text)('check_type').notNull(),
    requirement: (0, pg_core_1.text)('requirement'),
    status: (0, pg_core_1.text)('status').default('pending'),
    result: (0, pg_core_1.json)('result'),
    notes: (0, pg_core_1.text)('notes'),
    checkedById: (0, pg_core_1.integer)('checked_by_id').references(function () { return exports.users.id; }),
    checkedAt: (0, pg_core_1.timestamp)('checked_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerComplianceCheckSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerComplianceChecks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Workflows Table
 *
 * Workflow management for CER reports
 */
exports.cerWorkflows = (0, pg_core_1.pgTable)('cer_workflows', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    workflowId: (0, pg_core_1.text)('workflow_id').notNull(),
    stage: (0, pg_core_1.text)('stage').notNull(),
    status: (0, pg_core_1.text)('status').default('pending'),
    assignedToId: (0, pg_core_1.integer)('assigned_to_id').references(function () { return exports.users.id; }),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerWorkflowSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerWorkflows).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CER Exports Table
 *
 * Export history for CER reports
 */
exports.cerExports = (0, pg_core_1.pgTable)('cer_exports', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    reportId: (0, pg_core_1.text)('report_id')
        .notNull()
        .references(function () { return exports.cerReports.reportId; }),
    exportId: (0, pg_core_1.text)('export_id').notNull(),
    format: (0, pg_core_1.text)('format').notNull(),
    fileName: (0, pg_core_1.text)('file_name'),
    filePath: (0, pg_core_1.text)('file_path'),
    exportedById: (0, pg_core_1.integer)('exported_by_id').references(function () { return exports.users.id; }),
    exportedAt: (0, pg_core_1.timestamp)('exported_at').defaultNow(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.insertCerExportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cerExports).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// CER Approvals Relations
exports.cerApprovalsRelations = (0, drizzle_orm_1.relations)(exports.cerApprovals, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.cerApprovals.organizationId],
            references: [exports.organizations.id],
        }),
        project: one(exports.cerProjects, {
            fields: [exports.cerApprovals.projectId],
            references: [exports.cerProjects.id],
        }),
        document: one(exports.cerDocuments, {
            fields: [exports.cerApprovals.documentId],
            references: [exports.cerDocuments.id],
        }),
        requestedBy: one(exports.users, {
            fields: [exports.cerApprovals.requestedById],
            references: [exports.users.id],
        }),
        approvedBy: one(exports.users, {
            fields: [exports.cerApprovals.approvedById],
            references: [exports.users.id],
        }),
        rejectedBy: one(exports.users, {
            fields: [exports.cerApprovals.rejectedById],
            references: [exports.users.id],
        }),
    });
});
/**
 * Quality Management Plans Table
 *
 * Stores quality management plans with tenant context.
 * Each QMP is associated with an organization and optionally a CER project.
 */
exports.qualityManagementPlans = (0, pg_core_1.pgTable)('quality_management_plans', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id').references(function () { return exports.clientWorkspaces.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    version: (0, pg_core_1.text)('version').default('1.0.0').notNull(),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, active, retired
    approvedById: (0, pg_core_1.integer)('approved_by_id').references(function () { return exports.users.id; }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    effectiveDate: (0, pg_core_1.timestamp)('effective_date'),
    expiryDate: (0, pg_core_1.timestamp)('expiry_date'),
    reviewFrequencyDays: (0, pg_core_1.integer)('review_frequency_days').default(365),
    lastReviewDate: (0, pg_core_1.timestamp)('last_review_date'),
    nextReviewDate: (0, pg_core_1.timestamp)('next_review_date'),
    reviewReminderDays: (0, pg_core_1.integer)('review_reminder_days').default(30),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// QMP Insert Schema
exports.insertQualityManagementPlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.qualityManagementPlans).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * QMP Audit Trail Table
 *
 * Tracks changes to quality management plans for compliance and audit purposes.
 */
exports.qmpAuditTrail = (0, pg_core_1.pgTable)('qmp_audit_trail', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    qmpId: (0, pg_core_1.integer)('qmp_id')
        .notNull()
        .references(function () { return exports.qualityManagementPlans.id; }),
    userId: (0, pg_core_1.integer)('user_id').references(function () { return exports.users.id; }),
    actionType: (0, pg_core_1.text)('action_type').notNull(), // create, update, approve, review, retire
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // qmp, ctq_factor, section_gate, etc.
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    previousState: (0, pg_core_1.json)('previous_state'),
    newState: (0, pg_core_1.json)('new_state'),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// QMP Audit Trail Insert Schema
exports.insertQmpAuditTrailSchema = (0, drizzle_zod_1.createInsertSchema)(exports.qmpAuditTrail).omit({
    id: true,
    createdAt: true,
});
/**
 * CTQ (Critical-to-Quality) Factors Table
 *
 * Stores critical quality factors with risk-based categorization.
 */
exports.ctqFactors = (0, pg_core_1.pgTable)('ctq_factors', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    qmpId: (0, pg_core_1.integer)('qmp_id')
        .notNull()
        .references(function () { return exports.qualityManagementPlans.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category').notNull(), // safety, efficacy, regulatory, clinical, etc.
    riskLevel: (0, pg_core_1.text)('risk_level').notNull(), // high, medium, low
    applicableSection: (0, pg_core_1.text)('applicable_section'), // benefit-risk, safety, equivalence, etc.
    validationCriteria: (0, pg_core_1.text)('validation_criteria'),
    validationMethod: (0, pg_core_1.text)('validation_method'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive
    requiresEvidenceType: (0, pg_core_1.text)('requires_evidence_type'), // document, data, attestation, etc.
    requirementType: (0, pg_core_1.text)('requirement_type').default('mandatory').notNull(), // mandatory, recommended, optional
    failureAction: (0, pg_core_1.text)('failure_action').default('block').notNull(), // block, warning, notify
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CTQ Factor Insert Schema
exports.insertCtqFactorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ctqFactors).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * QMP Section Gating Table
 *
 * Controls which CTQ factors are required for each CER section.
 */
exports.qmpSectionGating = (0, pg_core_1.pgTable)('qmp_section_gating', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    qmpId: (0, pg_core_1.integer)('qmp_id')
        .notNull()
        .references(function () { return exports.qualityManagementPlans.id; }),
    sectionKey: (0, pg_core_1.text)('section_key').notNull(), // benefit-risk, safety, equivalence, etc.
    sectionName: (0, pg_core_1.text)('section_name').notNull(),
    requiredCtqFactorIds: (0, pg_core_1.json)('required_ctq_factor_ids').notNull(), // Array of CTQ factor IDs
    minimumMandatoryCompletion: (0, pg_core_1.integer)('minimum_mandatory_completion').default(100), // Percentage
    minimumRecommendedCompletion: (0, pg_core_1.integer)('minimum_recommended_completion').default(80), // Percentage
    allowOverride: (0, pg_core_1.boolean)('allow_override').default(false),
    overrideRequiresApproval: (0, pg_core_1.boolean)('override_requires_approval').default(true),
    overrideRequiresReason: (0, pg_core_1.boolean)('override_requires_reason').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// QMP Section Gating Insert Schema
exports.insertQmpSectionGatingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.qmpSectionGating).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * QMP Traceability Matrix Table
 *
 * Maps quality requirements to implementation evidence for traceability.
 */
exports.qmpTraceabilityMatrix = (0, pg_core_1.pgTable)('qmp_traceability_matrix', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    qmpId: (0, pg_core_1.integer)('qmp_id')
        .notNull()
        .references(function () { return exports.qualityManagementPlans.id; }),
    ctqFactorId: (0, pg_core_1.integer)('ctq_factor_id').references(function () { return exports.ctqFactors.id; }),
    requirementId: (0, pg_core_1.text)('requirement_id').notNull(), // Unique ID for the requirement
    requirementText: (0, pg_core_1.text)('requirement_text').notNull(),
    requirementSource: (0, pg_core_1.text)('requirement_source'), // Regulation, standard, guidance, etc.
    verificationMethod: (0, pg_core_1.text)('verification_method'), // Review, test, inspection, analysis
    implementationEvidence: (0, pg_core_1.json)('implementation_evidence'), // References to documents, data, etc.
    verificationStatus: (0, pg_core_1.text)('verification_status').default('pending').notNull(), // pending, verified, failed
    verifiedById: (0, pg_core_1.integer)('verified_by_id').references(function () { return exports.users.id; }),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at'),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// QMP Traceability Matrix Insert Schema
exports.insertQmpTraceabilityMatrixSchema = (0, drizzle_zod_1.createInsertSchema)(exports.qmpTraceabilityMatrix).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Additional relations for QMP tables
exports.qualityManagementPlansRelations = (0, drizzle_orm_1.relations)(exports.qualityManagementPlans, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.qualityManagementPlans.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.qualityManagementPlans.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        ctqFactors: many(exports.ctqFactors),
        sectionGating: many(exports.qmpSectionGating),
        auditTrail: many(exports.qmpAuditTrail),
        traceabilityMatrix: many(exports.qmpTraceabilityMatrix),
    });
});
exports.ctqFactorsRelations = (0, drizzle_orm_1.relations)(exports.ctqFactors, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ctqFactors.organizationId],
            references: [exports.organizations.id],
        }),
        qmp: one(exports.qualityManagementPlans, {
            fields: [exports.ctqFactors.qmpId],
            references: [exports.qualityManagementPlans.id],
        }),
        traceabilityItems: many(exports.qmpTraceabilityMatrix),
    });
});
// Update CER Projects relations to include QMP reference
exports.cerProjectsQmpRelation = (0, drizzle_orm_1.relations)(exports.cerProjects, function (_a) {
    var one = _a.one;
    return ({
        qmp: one(exports.qualityManagementPlans, {
            fields: [exports.cerProjects.qmpId],
            references: [exports.qualityManagementPlans.id],
        }),
    });
});
/**
 * CRO (Contract Research Organization) Tables
 *
 * These tables support CRO-specific functionality including
 * client management, study oversight, and regulatory coordination
 */
/**
 * CRO Clients Table
 *
 * Represents pharmaceutical/biotech clients that the CRO works with
 */
exports.croClients = (0, pg_core_1.pgTable)('cro_clients', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    companyType: (0, pg_core_1.text)('company_type').notNull(), // biotech, pharma, medical_device, diagnostic
    industrySegment: (0, pg_core_1.text)('industry_segment'), // oncology, cardiology, neurology, etc.
    headquarters: (0, pg_core_1.text)('headquarters'),
    website: (0, pg_core_1.text)('website'),
    primaryContact: (0, pg_core_1.text)('primary_contact'),
    contactEmail: (0, pg_core_1.text)('contact_email'),
    contactPhone: (0, pg_core_1.text)('contact_phone'),
    regulatoryContact: (0, pg_core_1.text)('regulatory_contact'),
    regulatoryEmail: (0, pg_core_1.text)('regulatory_email'),
    contractStartDate: (0, pg_core_1.timestamp)('contract_start_date'),
    contractEndDate: (0, pg_core_1.timestamp)('contract_end_date'),
    contractValue: (0, pg_core_1.decimal)('contract_value'),
    contractStatus: (0, pg_core_1.text)('contract_status').default('active').notNull(), // active, expired, terminated, pending
    preferredRegions: (0, pg_core_1.json)('preferred_regions'), // Array of regulatory regions
    complianceRequirements: (0, pg_core_1.json)('compliance_requirements'), // Specific compliance needs
    riskLevel: (0, pg_core_1.text)('risk_level').default('medium').notNull(), // low, medium, high, critical
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CRO Clients Insert Schema
exports.insertCroClientSchema = (0, drizzle_zod_1.createInsertSchema)(exports.croClients).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CRO Studies Table
 *
 * Represents clinical studies managed by the CRO
 */
exports.croStudies = (0, pg_core_1.pgTable)('cro_studies', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientId: (0, pg_core_1.integer)('client_id')
        .notNull()
        .references(function () { return exports.croClients.id; }),
    studyNumber: (0, pg_core_1.text)('study_number').notNull(),
    studyTitle: (0, pg_core_1.text)('study_title').notNull(),
    studyType: (0, pg_core_1.text)('study_type').notNull(), // phase_1, phase_2, phase_3, phase_4, observational, device_study
    therapeuticArea: (0, pg_core_1.text)('therapeutic_area').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    compound: (0, pg_core_1.text)('compound'),
    deviceName: (0, pg_core_1.text)('device_name'),
    studyPhase: (0, pg_core_1.text)('study_phase'),
    studyDesign: (0, pg_core_1.text)('study_design'), // randomized, open_label, double_blind, etc.
    primaryEndpoint: (0, pg_core_1.text)('primary_endpoint'),
    secondaryEndpoints: (0, pg_core_1.json)('secondary_endpoints'), // Array of secondary endpoints
    targetEnrollment: (0, pg_core_1.integer)('target_enrollment'),
    currentEnrollment: (0, pg_core_1.integer)('current_enrollment').default(0),
    studyStatus: (0, pg_core_1.text)('study_status').default('planning').notNull(), // planning, startup, recruiting, active, completed, terminated
    regulatoryStatus: (0, pg_core_1.text)('regulatory_status').default('pre_ind').notNull(), // pre_ind, ind_submitted, ind_approved, etc.
    firstPatientIn: (0, pg_core_1.timestamp)('first_patient_in'),
    lastPatientOut: (0, pg_core_1.timestamp)('last_patient_out'),
    studyCompletionDate: (0, pg_core_1.timestamp)('study_completion_date'),
    regulatoryRegions: (0, pg_core_1.json)('regulatory_regions'), // Array of regulatory regions
    investigationalProduct: (0, pg_core_1.json)('investigational_product'), // Product details
    studyBudget: (0, pg_core_1.decimal)('study_budget'),
    csoAssignments: (0, pg_core_1.json)('cso_assignments'), // Clinical Study Operations assignments
    timeline: (0, pg_core_1.json)('timeline'), // Study milestones and timelines
    riskAssessment: (0, pg_core_1.json)('risk_assessment'), // Risk factors and mitigation
    complianceStatus: (0, pg_core_1.text)('compliance_status').default('compliant').notNull(), // compliant, minor_deviation, major_deviation, critical
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CRO Studies Insert Schema
exports.insertCroStudySchema = (0, drizzle_zod_1.createInsertSchema)(exports.croStudies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CRO Regulatory Submissions Table
 *
 * Tracks regulatory submissions managed by the CRO
 */
exports.croRegulatorySubmissions = (0, pg_core_1.pgTable)('cro_regulatory_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientId: (0, pg_core_1.integer)('client_id')
        .notNull()
        .references(function () { return exports.croClients.id; }),
    studyId: (0, pg_core_1.integer)('study_id').references(function () { return exports.croStudies.id; }),
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // ind, nda, bla, ide, 510k, pma, ce_mark
    submissionNumber: (0, pg_core_1.text)('submission_number'),
    regulatoryRegion: (0, pg_core_1.text)('regulatory_region').notNull(), // fda, ema, pmda, health_canada, etc.
    submissionStatus: (0, pg_core_1.text)('submission_status').default('draft').notNull(), // draft, submitted, under_review, approved, rejected
    submissionDate: (0, pg_core_1.timestamp)('submission_date'),
    expectedApprovalDate: (0, pg_core_1.timestamp)('expected_approval_date'),
    actualApprovalDate: (0, pg_core_1.timestamp)('actual_approval_date'),
    submissionPackage: (0, pg_core_1.json)('submission_package'), // Details of submission contents
    regulatoryStrategy: (0, pg_core_1.text)('regulatory_strategy'),
    meetingHistory: (0, pg_core_1.json)('meeting_history'), // FDA meetings, EMA meetings, etc.
    queries: (0, pg_core_1.json)('queries'), // Regulatory queries and responses
    amendments: (0, pg_core_1.json)('amendments'), // Submission amendments
    milestones: (0, pg_core_1.json)('milestones'), // Submission milestones
    budget: (0, pg_core_1.decimal)('budget'),
    assignedRegulator: (0, pg_core_1.text)('assigned_regulator'),
    consultants: (0, pg_core_1.json)('consultants'), // External regulatory consultants
    complianceScore: (0, pg_core_1.integer)('compliance_score'), // 0-100 compliance score
    riskLevel: (0, pg_core_1.text)('risk_level').default('medium').notNull(),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CRO Regulatory Submissions Insert Schema
exports.insertCroRegulatorySubmissionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.croRegulatorySubmissions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CRO Team Assignments Table
 *
 * Tracks team member assignments to CRO projects
 */
exports.croTeamAssignments = (0, pg_core_1.pgTable)('cro_team_assignments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    clientId: (0, pg_core_1.integer)('client_id').references(function () { return exports.croClients.id; }),
    studyId: (0, pg_core_1.integer)('study_id').references(function () { return exports.croStudies.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id').references(function () { return exports.croRegulatorySubmissions.id; }),
    role: (0, pg_core_1.text)('role').notNull(), // project_manager, clinical_monitor, regulatory_affairs, biostatistician, etc.
    responsibility: (0, pg_core_1.text)('responsibility'),
    assignmentType: (0, pg_core_1.text)('assignment_type').default('primary').notNull(), // primary, secondary, consultant, backup
    startDate: (0, pg_core_1.timestamp)('start_date').notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date'),
    utilizationPercentage: (0, pg_core_1.integer)('utilization_percentage').default(100), // Percentage of time allocated
    billableRate: (0, pg_core_1.decimal)('billable_rate'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, completed
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CRO Team Assignments Insert Schema
exports.insertCroTeamAssignmentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.croTeamAssignments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CRO Milestones Table
 *
 * Tracks project milestones and deliverables
 */
exports.croMilestones = (0, pg_core_1.pgTable)('cro_milestones', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientId: (0, pg_core_1.integer)('client_id')
        .notNull()
        .references(function () { return exports.croClients.id; }),
    studyId: (0, pg_core_1.integer)('study_id').references(function () { return exports.croStudies.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id').references(function () { return exports.croRegulatorySubmissions.id; }),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category').notNull(), // regulatory, clinical, operational, financial
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // low, medium, high, critical
    status: (0, pg_core_1.text)('status').default('planned').notNull(), // planned, in_progress, completed, delayed, cancelled
    plannedStartDate: (0, pg_core_1.timestamp)('planned_start_date'),
    actualStartDate: (0, pg_core_1.timestamp)('actual_start_date'),
    plannedEndDate: (0, pg_core_1.timestamp)('planned_end_date'),
    actualEndDate: (0, pg_core_1.timestamp)('actual_end_date'),
    dependencies: (0, pg_core_1.json)('dependencies'), // Array of dependent milestone IDs
    deliverables: (0, pg_core_1.json)('deliverables'), // Expected deliverables
    resources: (0, pg_core_1.json)('resources'), // Required resources
    budget: (0, pg_core_1.decimal)('budget'),
    actualCost: (0, pg_core_1.decimal)('actual_cost'),
    assignedTo: (0, pg_core_1.integer)('assigned_to').references(function () { return exports.users.id; }),
    completionPercentage: (0, pg_core_1.integer)('completion_percentage').default(0),
    qualityChecks: (0, pg_core_1.json)('quality_checks'), // Quality control measures
    riskFactors: (0, pg_core_1.json)('risk_factors'), // Associated risks
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// CRO Milestones Insert Schema
exports.insertCroMilestoneSchema = (0, drizzle_zod_1.createInsertSchema)(exports.croMilestones).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * CRO Relations
 */
exports.croClientsRelations = (0, drizzle_orm_1.relations)(exports.croClients, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.croClients.organizationId],
            references: [exports.organizations.id],
        }),
        studies: many(exports.croStudies),
        submissions: many(exports.croRegulatorySubmissions),
        teamAssignments: many(exports.croTeamAssignments),
        milestones: many(exports.croMilestones),
    });
});
exports.croStudiesRelations = (0, drizzle_orm_1.relations)(exports.croStudies, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.croStudies.organizationId],
            references: [exports.organizations.id],
        }),
        client: one(exports.croClients, {
            fields: [exports.croStudies.clientId],
            references: [exports.croClients.id],
        }),
        submissions: many(exports.croRegulatorySubmissions),
        teamAssignments: many(exports.croTeamAssignments),
        milestones: many(exports.croMilestones),
    });
});
exports.croRegulatorySubmissionsRelations = (0, drizzle_orm_1.relations)(exports.croRegulatorySubmissions, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.croRegulatorySubmissions.organizationId],
            references: [exports.organizations.id],
        }),
        client: one(exports.croClients, {
            fields: [exports.croRegulatorySubmissions.clientId],
            references: [exports.croClients.id],
        }),
        study: one(exports.croStudies, {
            fields: [exports.croRegulatorySubmissions.studyId],
            references: [exports.croStudies.id],
        }),
        teamAssignments: many(exports.croTeamAssignments),
        milestones: many(exports.croMilestones),
    });
});
exports.croTeamAssignmentsRelations = (0, drizzle_orm_1.relations)(exports.croTeamAssignments, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.croTeamAssignments.organizationId],
            references: [exports.organizations.id],
        }),
        user: one(exports.users, {
            fields: [exports.croTeamAssignments.userId],
            references: [exports.users.id],
        }),
        client: one(exports.croClients, {
            fields: [exports.croTeamAssignments.clientId],
            references: [exports.croClients.id],
        }),
        study: one(exports.croStudies, {
            fields: [exports.croTeamAssignments.studyId],
            references: [exports.croStudies.id],
        }),
        submission: one(exports.croRegulatorySubmissions, {
            fields: [exports.croTeamAssignments.submissionId],
            references: [exports.croRegulatorySubmissions.id],
        }),
    });
});
exports.croMilestonesRelations = (0, drizzle_orm_1.relations)(exports.croMilestones, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.croMilestones.organizationId],
            references: [exports.organizations.id],
        }),
        client: one(exports.croClients, {
            fields: [exports.croMilestones.clientId],
            references: [exports.croClients.id],
        }),
        study: one(exports.croStudies, {
            fields: [exports.croMilestones.studyId],
            references: [exports.croStudies.id],
        }),
        submission: one(exports.croRegulatorySubmissions, {
            fields: [exports.croMilestones.submissionId],
            references: [exports.croRegulatorySubmissions.id],
        }),
        assignedTo: one(exports.users, {
            fields: [exports.croMilestones.assignedTo],
            references: [exports.users.id],
        }),
    });
});
/**
 * Document Folder Table
 *
 * Represents a folder in the document management system.
 */
exports.documentFolders = (0, pg_core_1.pgTable)('document_folders', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    parentId: (0, pg_core_1.integer)('parent_id').references(function () { return exports.documentFolders.id; }),
    path: (0, pg_core_1.text)('path'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Document Folder Insert Schema
exports.insertDocumentFolderSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentFolders).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Simple Documents Table (renamed to avoid conflict)
 *
 * Represents a simple document in the system for non-compliance use cases.
 * For 21 CFR Part 11 compliant documents, use the 'documents' table defined earlier.
 */
exports.simpleDocuments = (0, pg_core_1.pgTable)('simple_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    folderId: (0, pg_core_1.integer)('folder_id').references(function () { return exports.documentFolders.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    type: (0, pg_core_1.text)('type').notNull(), // report, protocol, publication, etc.
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, review, approved, published
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    fileName: (0, pg_core_1.text)('file_name'),
    fileType: (0, pg_core_1.text)('file_type'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    filePath: (0, pg_core_1.text)('file_path'),
    content: (0, pg_core_1.json)('content'),
    metadata: (0, pg_core_1.json)('metadata'),
    tags: (0, pg_core_1.text)('tags').array(),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Simple Document Insert Schema
exports.insertSimpleDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.simpleDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Document Audit Log Table
 *
 * Tracks all document changes for compliance and regulatory requirements.
 * Provides complete audit trail for 21 CFR Part 11 compliance.
 */
exports.documentAuditLog = (0, pg_core_1.pgTable)('document_audit_log', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    action: (0, pg_core_1.text)('action').notNull(), // created, modified, reviewed, approved, rejected, published, archived, restored
    previousVersion: (0, pg_core_1.text)('previous_version'),
    newVersion: (0, pg_core_1.text)('new_version').notNull(),
    changes: (0, pg_core_1.json)('changes'), // Array of change objects: {field, oldValue, newValue, changeType}
    metadata: (0, pg_core_1.json)('metadata'), // contentLength, wordCount, complianceScore, ipAddress, userAgent, sessionId
    comments: (0, pg_core_1.text)('comments'),
    reviewDetails: (0, pg_core_1.json)('review_details'), // reviewerId, reviewerName, reviewType, decision, feedback
    complianceScore: (0, pg_core_1.integer)('compliance_score'), // 0-100 score
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    sessionId: (0, pg_core_1.text)('session_id'),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
});
// Document Audit Log Insert Schema
exports.insertDocumentAuditLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentAuditLog).omit({
    id: true,
    timestamp: true,
});
/**
 * Projects Table
 *
 * Core project entity that spans across all modules.
 * This is the central project record that can be linked to module-specific data.
 */
exports.projects = (0, pg_core_1.pgTable)('projects', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    code: (0, pg_core_1.text)('code'), // Project code or identifier
    description: (0, pg_core_1.text)('description'),
    status: (0, pg_core_1.text)('status').default('planning').notNull(), // planning, active, on-hold, completed, archived
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // low, medium, high, critical
    type: (0, pg_core_1.text)('type').notNull(), // research, clinical, regulatory, commercial, etc.
    startDate: (0, pg_core_1.timestamp)('start_date'),
    targetEndDate: (0, pg_core_1.timestamp)('target_end_date'),
    actualEndDate: (0, pg_core_1.timestamp)('actual_end_date'),
    progress: (0, pg_core_1.integer)('progress').default(0), // 0-100 percentage
    budget: (0, pg_core_1.integer)('budget'),
    budgetCurrency: (0, pg_core_1.text)('budget_currency').default('USD'),
    budgetStatus: (0, pg_core_1.text)('budget_status').default('within-budget'), // within-budget, at-risk, over-budget
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    ownerId: (0, pg_core_1.integer)('owner_id').references(function () { return exports.users.id; }),
    sponsors: (0, pg_core_1.text)('sponsors').array(), // List of sponsor IDs or names
    tags: (0, pg_core_1.text)('tags').array(),
    criticalToQualityFactors: (0, pg_core_1.json)('critical_to_quality_factors'), // CtQ factors array
    riskLevel: (0, pg_core_1.text)('risk_level').default('medium'), // low, medium, high
    riskAssessment: (0, pg_core_1.json)('risk_assessment'),
    qualityTargets: (0, pg_core_1.json)('quality_targets'),
    moduleReferences: (0, pg_core_1.json)('module_references'), // References to specific module instances
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Insert Schema
exports.insertProjectSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projects).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Modules Table
 *
 * Associates projects with specific module instances.
 * Maps the central project to module-specific projects (CER, IND, etc.)
 */
exports.projectModules = (0, pg_core_1.pgTable)('project_modules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.projects.id; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    moduleType: (0, pg_core_1.text)('module_type').notNull(), // cer, ind, cmc, csr, vault, etc.
    moduleInstanceId: (0, pg_core_1.integer)('module_instance_id').notNull(), // ID in the module's specific table
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, completed
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        uniqueProjectModule: (0, pg_core_1.unique)('unique_project_module').on(table.projectId, table.moduleType, table.moduleInstanceId),
    };
});
// Project Module Insert Schema
exports.insertProjectModuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectModules).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Workflow Stages Table
 *
 * Defines workflow stages for projects with CtQ integration.
 */
exports.projectWorkflowStages = (0, pg_core_1.pgTable)('project_workflow_stages', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.projects.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    order: (0, pg_core_1.integer)('order').notNull(),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in-progress, completed, blocked
    startDate: (0, pg_core_1.timestamp)('start_date'),
    endDate: (0, pg_core_1.timestamp)('end_date'),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    criticalToQualityFactors: (0, pg_core_1.json)('critical_to_quality_factors'), // Stage-specific CtQ factors
    completionCriteria: (0, pg_core_1.json)('completion_criteria'),
    autoAdvance: (0, pg_core_1.boolean)('auto_advance').default(false),
    assignees: (0, pg_core_1.text)('assignees').array(), // User IDs assigned to this stage
    reviewers: (0, pg_core_1.text)('reviewers').array(), // User IDs who must review/approve
    approvalStatus: (0, pg_core_1.text)('approval_status').default('not-started'), // not-started, pending, approved, rejected
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Workflow Stage Insert Schema
exports.insertProjectWorkflowStageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectWorkflowStages).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Tasks Table
 *
 * Tasks associated with projects that span across modules.
 */
exports.projectTasks = (0, pg_core_1.pgTable)('project_tasks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.projects.id; }),
    workflowStageId: (0, pg_core_1.integer)('workflow_stage_id').references(function () { return exports.projectWorkflowStages.id; }),
    parentTaskId: (0, pg_core_1.integer)('parent_task_id').references(function () { return exports.projectTasks.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    status: (0, pg_core_1.text)('status').default('todo').notNull(), // todo, in-progress, review, done, blocked
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // low, medium, high, urgent
    moduleType: (0, pg_core_1.text)('module_type'), // CMC, IND, Medical Device, eCTD, Vault, Protocol Design
    moduleIcon: (0, pg_core_1.text)('module_icon'), // Icon identifier for the module
    moduleColor: (0, pg_core_1.text)('module_color'), // Color for module visualization
    assigneeId: (0, pg_core_1.integer)('assignee_id').references(function () { return exports.users.id; }),
    reviewerId: (0, pg_core_1.integer)('reviewer_id').references(function () { return exports.users.id; }),
    estimatedHours: (0, pg_core_1.integer)('estimated_hours'),
    actualHours: (0, pg_core_1.integer)('actual_hours'),
    startDate: (0, pg_core_1.timestamp)('start_date'),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    completedById: (0, pg_core_1.integer)('completed_by_id').references(function () { return exports.users.id; }),
    blockedReason: (0, pg_core_1.text)('blocked_reason'),
    criticalToQuality: (0, pg_core_1.boolean)('critical_to_quality').default(false),
    qualityMetrics: (0, pg_core_1.json)('quality_metrics'),
    dependsOn: (0, pg_core_1.text)('depends_on').array(), // IDs of tasks this depends on
    linkedTasks: (0, pg_core_1.json)('linked_tasks'), // Cross-module task linkages
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Task Insert Schema
exports.insertProjectTaskSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectTasks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Unified Tasks Table
 *
 * Central table for managing tasks across ALL modules in the ecosystem.
 * This table acts as the single source of truth for task management,
 * connecting Protocol Design, CMC, Medical Device, IND Wizard, eCTD Co-Author, and Vault.
 */
exports.unifiedTasks = (0, pg_core_1.pgTable)('unified_tasks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    taskId: (0, pg_core_1.text)('task_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id').references(function () { return exports.clientWorkspaces.id; }),
    projectId: (0, pg_core_1.integer)('project_id').references(function () { return exports.projects.id; }),
    // Module Information
    moduleType: (0, pg_core_1.text)('module_type').notNull(), // CMC, IND, MedicalDevice, eCTD, Vault, ProtocolDesign
    moduleIcon: (0, pg_core_1.text)('module_icon'), // lucide-react icon name
    moduleColor: (0, pg_core_1.text)('module_color'), // Hex color for module visualization
    sourceEntityId: (0, pg_core_1.text)('source_entity_id'), // ID from the source module
    sourceEntityType: (0, pg_core_1.text)('source_entity_type'), // Type of entity in source module
    // Task Details
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category'), // document-prep, review, approval, analysis, compliance, etc.
    taskType: (0, pg_core_1.text)('task_type'), // milestone, deliverable, review, approval, action
    // Assignment & Ownership
    assigneeId: (0, pg_core_1.integer)('assignee_id').references(function () { return exports.users.id; }),
    assigneeName: (0, pg_core_1.text)('assignee_name'),
    assignedBy: (0, pg_core_1.integer)('assigned_by').references(function () { return exports.users.id; }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at'),
    teamId: (0, pg_core_1.integer)('team_id'),
    // Status & Progress
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in-progress, review, completed, blocked, cancelled
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // low, medium, high, critical
    progress: (0, pg_core_1.integer)('progress').default(0), // 0-100
    completionPercentage: (0, pg_core_1.integer)('completion_percentage').default(0),
    // Dates & Deadlines
    startDate: (0, pg_core_1.timestamp)('start_date'),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    estimatedHours: (0, pg_core_1.real)('estimated_hours'),
    actualHours: (0, pg_core_1.real)('actual_hours'),
    // Cross-Module Linkages
    linkedTasks: (0, pg_core_1.json)('linked_tasks'), // Array of linked task IDs across modules
    dependencies: (0, pg_core_1.json)('dependencies'), // Task dependencies with type and status
    blockedBy: (0, pg_core_1.text)('blocked_by').array(), // Task IDs blocking this task
    blocks: (0, pg_core_1.text)('blocks').array(), // Task IDs this task blocks
    // Enhanced Task Management Fields
    moduleSource: (0, pg_core_1.text)('module_source'), // Specific source module that created the task
    moduleData: (0, pg_core_1.json)('module_data'), // Module-specific data and context
    crossModuleLinks: (0, pg_core_1.json)('cross_module_links'), // Links to tasks in other modules
    automationRules: (0, pg_core_1.json)('automation_rules'), // Rules for automatic task generation
    escalationPath: (0, pg_core_1.json)('escalation_path'), // Escalation chain for overdue tasks
    // Approval Workflow
    approvalRequired: (0, pg_core_1.boolean)('approval_required').default(false),
    approvers: (0, pg_core_1.json)('approvers'), // List of required approvers
    approvalStatus: (0, pg_core_1.text)('approval_status'), // pending, partial, approved, rejected
    approvalHistory: (0, pg_core_1.json)('approval_history'),
    // Impact & Risk
    impactScore: (0, pg_core_1.real)('impact_score'), // 0-10 score for submission impact
    riskLevel: (0, pg_core_1.text)('risk_level'), // low, medium, high
    criticalPath: (0, pg_core_1.boolean)('critical_path').default(false),
    regulatoryImpact: (0, pg_core_1.boolean)('regulatory_impact').default(false),
    // Notifications & Automation
    notificationSettings: (0, pg_core_1.json)('notification_settings'),
    automationEnabled: (0, pg_core_1.boolean)('automation_enabled').default(true),
    aiSuggestions: (0, pg_core_1.json)('ai_suggestions'),
    // Metadata
    tags: (0, pg_core_1.text)('tags').array(),
    attachments: (0, pg_core_1.json)('attachments'),
    comments: (0, pg_core_1.json)('comments'),
    metadata: (0, pg_core_1.json)('metadata'),
    // Audit
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    taskIdIdx: (0, pg_core_1.index)('unified_task_id_idx').on(table.taskId),
    moduleIdx: (0, pg_core_1.index)('unified_module_idx').on(table.moduleType),
    statusIdx: (0, pg_core_1.index)('unified_status_idx').on(table.status),
    assigneeIdx: (0, pg_core_1.index)('unified_assignee_idx').on(table.assigneeId),
    dueDateIdx: (0, pg_core_1.index)('unified_due_date_idx').on(table.dueDate),
    priorityIdx: (0, pg_core_1.index)('unified_priority_idx').on(table.priority),
    projectIdx: (0, pg_core_1.index)('unified_project_idx').on(table.projectId),
}); });
// Unified Task Insert Schema
exports.insertUnifiedTaskSchema = (0, drizzle_zod_1.createInsertSchema)(exports.unifiedTasks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Cross-Module Task Links Table
 *
 * Tracks relationships and dependencies between tasks across different modules.
 */
exports.crossModuleTaskLinks = (0, pg_core_1.pgTable)('cross_module_task_links', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    linkId: (0, pg_core_1.text)('link_id').notNull().unique(),
    // Source Task
    sourceTaskId: (0, pg_core_1.text)('source_task_id')
        .notNull()
        .references(function () { return exports.unifiedTasks.taskId; }),
    sourceModule: (0, pg_core_1.text)('source_module').notNull(),
    // Target Task
    targetTaskId: (0, pg_core_1.text)('target_task_id')
        .notNull()
        .references(function () { return exports.unifiedTasks.taskId; }),
    targetModule: (0, pg_core_1.text)('target_module').notNull(),
    // Link Details
    linkType: (0, pg_core_1.text)('link_type').notNull(), // dependency, reference, parent-child, related
    dependencyType: (0, pg_core_1.text)('dependency_type'), // finish-to-start, start-to-start, etc.
    isBlocking: (0, pg_core_1.boolean)('is_blocking').default(false),
    // Status
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, satisfied, broken
    // Impact Analysis
    impactDescription: (0, pg_core_1.text)('impact_description'),
    riskLevel: (0, pg_core_1.text)('risk_level'), // low, medium, high
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    sourceIdx: (0, pg_core_1.index)('link_source_idx').on(table.sourceTaskId),
    targetIdx: (0, pg_core_1.index)('link_target_idx').on(table.targetTaskId),
    linkTypeIdx: (0, pg_core_1.index)('link_type_idx').on(table.linkType),
}); });
// Cross-Module Task Link Insert Schema
exports.insertCrossModuleTaskLinkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.crossModuleTaskLinks).omit({
    id: true,
    createdAt: true,
});
/**
 * Task Templates Table
 *
 * Stores reusable task templates for different regulatory submission types and milestones.
 */
exports.taskTemplates = (0, pg_core_1.pgTable)('task_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    templateId: (0, pg_core_1.text)('template_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Template Details
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category').notNull(), // NDA, ANDA, BLA, IND, milestone, regulatory, etc.
    submissionType: (0, pg_core_1.text)('submission_type'), // Specific submission type this applies to
    milestone: (0, pg_core_1.text)('milestone'), // Pre-IND, Phase 1, Phase 2, etc.
    // Template Configuration
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    isDefault: (0, pg_core_1.boolean)('is_default').default(false), // Default template for this category
    version: (0, pg_core_1.integer)('version').default(1),
    // Task Structure
    tasks: (0, pg_core_1.json)('tasks').notNull(), // Array of task definitions
    dependencies: (0, pg_core_1.json)('dependencies'), // Task dependency structure
    milestones: (0, pg_core_1.json)('milestones'), // Milestone definitions
    // Timing Configuration
    defaultDuration: (0, pg_core_1.integer)('default_duration'), // Total duration in days
    criticalPath: (0, pg_core_1.json)('critical_path'), // Pre-calculated critical path
    // Intelligence Features
    bestPractices: (0, pg_core_1.text)('best_practices'),
    regulatoryRequirements: (0, pg_core_1.json)('regulatory_requirements'),
    riskFactors: (0, pg_core_1.json)('risk_factors'),
    // Usage Statistics
    usageCount: (0, pg_core_1.integer)('usage_count').default(0),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at'),
    averageCompletionTime: (0, pg_core_1.real)('avg_completion_time'), // In days
    successRate: (0, pg_core_1.real)('success_rate'), // Percentage
    // Metadata
    tags: (0, pg_core_1.text)('tags').array(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    templateIdIdx: (0, pg_core_1.uniqueIndex)('template_id_idx').on(table.templateId),
    categoryIdx: (0, pg_core_1.index)('template_category_idx').on(table.category),
    submissionTypeIdx: (0, pg_core_1.index)('template_submission_type_idx').on(table.submissionType),
    orgIdx: (0, pg_core_1.index)('template_org_idx').on(table.organizationId),
}); });
// Task Template Insert Schema
exports.insertTaskTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.taskTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Task Automation Rules Table
 *
 * Defines rules for automatic task generation based on events and conditions.
 */
exports.taskAutomation = (0, pg_core_1.pgTable)('task_automation', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    automationId: (0, pg_core_1.text)('automation_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Rule Definition
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    ruleType: (0, pg_core_1.text)('rule_type').notNull(), // event-based, schedule-based, condition-based
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    priority: (0, pg_core_1.integer)('priority').default(50), // 0-100, higher executes first
    // Trigger Configuration
    triggerModule: (0, pg_core_1.text)('trigger_module'), // Module that triggers this rule
    triggerEvent: (0, pg_core_1.text)('trigger_event').notNull(), // Event that triggers the rule
    triggerConditions: (0, pg_core_1.json)('trigger_conditions'), // Additional conditions to check
    // Action Configuration
    actionType: (0, pg_core_1.text)('action_type').notNull(), // create-task, update-task, notify, escalate
    taskTemplate: (0, pg_core_1.json)('task_template'), // Template for task creation
    taskDefaults: (0, pg_core_1.json)('task_defaults'), // Default values for created tasks
    // Advanced Configuration
    delayMinutes: (0, pg_core_1.integer)('delay_minutes'), // Delay before action execution
    recurringSchedule: (0, pg_core_1.json)('recurring_schedule'), // For recurring tasks
    maxExecutions: (0, pg_core_1.integer)('max_executions'), // Maximum times this rule can execute
    // Intelligence Features
    workloadBalancing: (0, pg_core_1.boolean)('workload_balancing').default(true),
    smartAssignment: (0, pg_core_1.json)('smart_assignment'), // Rules for intelligent assignment
    riskAssessment: (0, pg_core_1.json)('risk_assessment'), // Auto risk scoring rules
    // Execution History
    lastExecutedAt: (0, pg_core_1.timestamp)('last_executed_at'),
    executionCount: (0, pg_core_1.integer)('execution_count').default(0),
    successCount: (0, pg_core_1.integer)('success_count').default(0),
    failureCount: (0, pg_core_1.integer)('failure_count').default(0),
    // Metadata
    tags: (0, pg_core_1.text)('tags').array(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    automationIdIdx: (0, pg_core_1.uniqueIndex)('automation_id_idx').on(table.automationId),
    ruleTypeIdx: (0, pg_core_1.index)('automation_rule_type_idx').on(table.ruleType),
    triggerModuleIdx: (0, pg_core_1.index)('automation_trigger_module_idx').on(table.triggerModule),
    triggerEventIdx: (0, pg_core_1.index)('automation_trigger_event_idx').on(table.triggerEvent),
    orgIdx: (0, pg_core_1.index)('automation_org_idx').on(table.organizationId),
}); });
// Task Automation Insert Schema
exports.insertTaskAutomationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.taskAutomation).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Task Dependencies Table
 *
 * Manages complex task relationships and dependencies across the system.
 */
exports.taskDependencies = (0, pg_core_1.pgTable)('task_dependencies', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    dependencyId: (0, pg_core_1.text)('dependency_id').notNull().unique(),
    // Task References
    predecessorTaskId: (0, pg_core_1.text)('predecessor_task_id')
        .notNull()
        .references(function () { return exports.unifiedTasks.taskId; }),
    successorTaskId: (0, pg_core_1.text)('successor_task_id')
        .notNull()
        .references(function () { return exports.unifiedTasks.taskId; }),
    // Dependency Configuration
    dependencyType: (0, pg_core_1.text)('dependency_type').notNull(),
    // finish-to-start, start-to-start, finish-to-finish, start-to-finish
    lagTime: (0, pg_core_1.integer)('lag_time').default(0), // Lag in hours (can be negative)
    // Dependency Status
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, satisfied, violated, bypassed
    isCritical: (0, pg_core_1.boolean)('is_critical').default(false), // Part of critical path
    isBlocking: (0, pg_core_1.boolean)('is_blocking').default(true), // Blocks successor if not satisfied
    // Impact Analysis
    impactScore: (0, pg_core_1.real)('impact_score'), // 0-10 impact on timeline
    riskLevel: (0, pg_core_1.text)('risk_level'), // low, medium, high
    cascadeEffect: (0, pg_core_1.json)('cascade_effect'), // Downstream impact analysis
    // Validation
    validationRules: (0, pg_core_1.json)('validation_rules'), // Custom validation rules
    violationReason: (0, pg_core_1.text)('violation_reason'), // Reason if violated
    bypassReason: (0, pg_core_1.text)('bypass_reason'), // Reason if bypassed
    bypassedBy: (0, pg_core_1.integer)('bypassed_by').references(function () { return exports.users.id; }),
    bypassedAt: (0, pg_core_1.timestamp)('bypassed_at'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    dependencyIdIdx: (0, pg_core_1.uniqueIndex)('dependency_id_idx').on(table.dependencyId),
    predecessorIdx: (0, pg_core_1.index)('dependency_predecessor_idx').on(table.predecessorTaskId),
    successorIdx: (0, pg_core_1.index)('dependency_successor_idx').on(table.successorTaskId),
    statusIdx: (0, pg_core_1.index)('dependency_status_idx').on(table.status),
    criticalIdx: (0, pg_core_1.index)('dependency_critical_idx').on(table.isCritical),
}); });
// Task Dependencies Insert Schema
exports.insertTaskDependencySchema = (0, drizzle_zod_1.createInsertSchema)(exports.taskDependencies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Project Templates Table
 *
 * Templates for creating standardized projects with predefined workflows.
 */
exports.projectTemplates = (0, pg_core_1.pgTable)('project_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    projectType: (0, pg_core_1.text)('project_type').notNull(), // research, clinical, regulatory, etc.
    moduleTypes: (0, pg_core_1.text)('module_types').array(), // List of modules this template is for
    industryFocus: (0, pg_core_1.text)('industry_focus').array(), // MedDevice, Biotech, Pharma, etc.
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // draft, active, archived
    workflowStages: (0, pg_core_1.json)('workflow_stages'), // Predefined workflow stages
    tasks: (0, pg_core_1.json)('tasks'), // Predefined task templates
    criticalToQualityFactors: (0, pg_core_1.json)('critical_to_quality_factors'), // Default CtQ factors
    regulatoryFramework: (0, pg_core_1.text)('regulatory_framework').array(), // MDR, IVDR, FDA, etc.
    settings: (0, pg_core_1.json)('settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Project Template Insert Schema
exports.insertProjectTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.projectTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Define relationships for the new project tables
exports.projectsRelations = (0, drizzle_orm_1.relations)(exports.projects, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.projects.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.projects.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        modules: many(exports.projectModules),
        workflowStages: many(exports.projectWorkflowStages),
        tasks: many(exports.projectTasks),
        owner: one(exports.users, {
            fields: [exports.projects.ownerId],
            references: [exports.users.id],
        }),
        creator: one(exports.users, {
            fields: [exports.projects.createdById],
            references: [exports.users.id],
        }),
    });
});
exports.projectModulesRelations = (0, drizzle_orm_1.relations)(exports.projectModules, function (_a) {
    var one = _a.one;
    return ({
        project: one(exports.projects, {
            fields: [exports.projectModules.projectId],
            references: [exports.projects.id],
        }),
        organization: one(exports.organizations, {
            fields: [exports.projectModules.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.projectModules.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
    });
});
exports.projectWorkflowStagesRelations = (0, drizzle_orm_1.relations)(exports.projectWorkflowStages, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        project: one(exports.projects, {
            fields: [exports.projectWorkflowStages.projectId],
            references: [exports.projects.id],
        }),
        organization: one(exports.organizations, {
            fields: [exports.projectWorkflowStages.organizationId],
            references: [exports.organizations.id],
        }),
        tasks: many(exports.projectTasks, { relationName: 'stageTasks' }),
    });
});
exports.projectTasksRelations = (0, drizzle_orm_1.relations)(exports.projectTasks, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        project: one(exports.projects, {
            fields: [exports.projectTasks.projectId],
            references: [exports.projects.id],
        }),
        organization: one(exports.organizations, {
            fields: [exports.projectTasks.organizationId],
            references: [exports.organizations.id],
        }),
        workflowStage: one(exports.projectWorkflowStages, {
            fields: [exports.projectTasks.workflowStageId],
            references: [exports.projectWorkflowStages.id],
            relationName: 'stageTasks',
        }),
        parentTask: one(exports.projectTasks, {
            fields: [exports.projectTasks.parentTaskId],
            references: [exports.projectTasks.id],
        }),
        subtasks: many(exports.projectTasks, { relationName: 'taskSubtasks' }),
        assignee: one(exports.users, {
            fields: [exports.projectTasks.assigneeId],
            references: [exports.users.id],
        }),
        completer: one(exports.users, {
            fields: [exports.projectTasks.completedById],
            references: [exports.users.id],
        }),
    });
});
/**
 * ====================================================================================
 * DOCUMENT TEMPLATES SYSTEM
 * ====================================================================================
 *
 * Database schema for regulatory document templates library
 */
/**
 * Document Templates Table
 *
 * Stores regulatory document templates for eCTD submissions
 */
exports.documentTemplates = (0, pg_core_1.pgTable)('document_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    category: (0, pg_core_1.text)('category').notNull(), // clinical, nonclinical, quality, administrative
    module: (0, pg_core_1.text)('module'), // eCTD module reference (e.g., "Module 2.5")
    region: (0, pg_core_1.text)('region'), // FDA, EMA, PMDA, Health_Canada, TGA
    type: (0, pg_core_1.text)('type').notNull(), // protocol, report, summary, cover-letter, etc.
    description: (0, pg_core_1.text)('description'),
    version: (0, pg_core_1.text)('version').default('1.0.0'),
    content: (0, pg_core_1.json)('content'), // Template content structure
    placeholders: (0, pg_core_1.json)('placeholders'), // Template placeholder fields
    tags: (0, pg_core_1.text)('tags').array(), // Searchable tags
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, archived
    isPublic: (0, pg_core_1.boolean)('is_public').default(true), // Public templates vs organization-specific
    downloadCount: (0, pg_core_1.integer)('download_count').default(0),
    ratingAverage: (0, pg_core_1.decimal)('rating_average', { precision: 3, scale: 2 }).default('0'),
    ratingCount: (0, pg_core_1.integer)('rating_count').default(0),
    fileUrl: (0, pg_core_1.text)('file_url'), // Link to actual template file
    fileSize: (0, pg_core_1.integer)('file_size'), // File size in bytes
    fileType: (0, pg_core_1.text)('file_type'), // docx, pdf, txt, etc.
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    categoryIdx: (0, pg_core_1.index)('document_templates_category_idx').on(table.category),
    moduleIdx: (0, pg_core_1.index)('document_templates_module_idx').on(table.module),
    regionIdx: (0, pg_core_1.index)('document_templates_region_idx').on(table.region),
    statusIdx: (0, pg_core_1.index)('document_templates_status_idx').on(table.status),
    orgIdx: (0, pg_core_1.index)('document_templates_org_idx').on(table.organizationId),
}); });
/**
 * Template Usage Tracking Table
 *
 * Tracks when templates are used to create documents
 */
exports.templateUsage = (0, pg_core_1.pgTable)('template_usage', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    templateId: (0, pg_core_1.integer)('template_id')
        .notNull()
        .references(function () { return exports.documentTemplates.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    projectId: (0, pg_core_1.integer)('project_id').references(function () { return exports.projects.id; }),
    documentTitle: (0, pg_core_1.text)('document_title'),
    usageType: (0, pg_core_1.text)('usage_type').notNull(), // create_new, download, preview
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    templateIdx: (0, pg_core_1.index)('template_usage_template_idx').on(table.templateId),
    userIdx: (0, pg_core_1.index)('template_usage_user_idx').on(table.userId),
    dateIdx: (0, pg_core_1.index)('template_usage_date_idx').on(table.createdAt),
}); });
/**
 * Recent Documents Table
 *
 * Tracks recently accessed/created documents from templates
 */
exports.recentDocuments = (0, pg_core_1.pgTable)('recent_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    templateId: (0, pg_core_1.integer)('template_id').references(function () { return exports.documentTemplates.id; }),
    title: (0, pg_core_1.text)('title').notNull(),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in_review, final, submitted
    fileUrl: (0, pg_core_1.text)('file_url'),
    lastEditedAt: (0, pg_core_1.timestamp)('last_edited_at').defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    userIdx: (0, pg_core_1.index)('recent_documents_user_idx').on(table.userId),
    dateIdx: (0, pg_core_1.index)('recent_documents_date_idx').on(table.lastEditedAt),
}); });
// Document Templates Insert Schema
exports.insertDocumentTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Template Usage Insert Schema
exports.insertTemplateUsageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.templateUsage).omit({
    id: true,
    createdAt: true,
});
// Recent Documents Insert Schema
exports.insertRecentDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.recentDocuments).omit({
    id: true,
    createdAt: true,
});
// Document Templates Relations
exports.documentTemplatesRelations = (0, drizzle_orm_1.relations)(exports.documentTemplates, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.documentTemplates.organizationId],
            references: [exports.organizations.id],
        }),
        creator: one(exports.users, {
            fields: [exports.documentTemplates.createdById],
            references: [exports.users.id],
        }),
        usage: many(exports.templateUsage),
    });
});
exports.templateUsageRelations = (0, drizzle_orm_1.relations)(exports.templateUsage, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.templateUsage.organizationId],
            references: [exports.organizations.id],
        }),
        template: one(exports.documentTemplates, {
            fields: [exports.templateUsage.templateId],
            references: [exports.documentTemplates.id],
        }),
        user: one(exports.users, {
            fields: [exports.templateUsage.userId],
            references: [exports.users.id],
        }),
        project: one(exports.projects, {
            fields: [exports.templateUsage.projectId],
            references: [exports.projects.id],
        }),
    });
});
exports.recentDocumentsRelations = (0, drizzle_orm_1.relations)(exports.recentDocuments, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.recentDocuments.organizationId],
            references: [exports.organizations.id],
        }),
        user: one(exports.users, {
            fields: [exports.recentDocuments.userId],
            references: [exports.users.id],
        }),
        template: one(exports.documentTemplates, {
            fields: [exports.recentDocuments.templateId],
            references: [exports.documentTemplates.id],
        }),
    });
});
/**
 * ====================================================================================
 * MULTI-AGENCY VALIDATION SYSTEM
 * ====================================================================================
 *
 * Database schema for the multi-agency validation system supporting
 * FDA, EMA, PMDA, Health Canada, and TGA regulatory compliance
 */
/**
 * Multi-Agency Validation Sessions Table
 *
 * Tracks validation sessions across multiple regulatory agencies
 */
exports.multiAgencyValidationSessions = (0, pg_core_1.pgTable)('multi_agency_validation_sessions', {
    sessionId: (0, pg_core_1.uuid)('session_id').primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    documentId: (0, pg_core_1.text)('document_id').notNull(),
    documentVersionId: (0, pg_core_1.text)('document_version_id'),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    tenantId: (0, pg_core_1.text)('tenant_id').notNull(),
    agencies: (0, pg_core_1.text)('agencies').array(), // ['FDA', 'EMA', 'PMDA']
    content: (0, pg_core_1.text)('content'), // Document content
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, processing, completed, failed
    validationStartedAt: (0, pg_core_1.timestamp)('validation_started_at').defaultNow().notNull(),
    validationCompletedAt: (0, pg_core_1.timestamp)('validation_completed_at'),
    totalIssuesFound: (0, pg_core_1.integer)('total_issues_found').default(0),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    sessionOrgIdx: (0, pg_core_1.index)('validation_sessions_org_idx').on(table.organizationId),
    sessionTenantIdx: (0, pg_core_1.index)('validation_sessions_tenant_idx').on(table.tenantId),
    sessionDocIdx: (0, pg_core_1.index)('validation_sessions_doc_idx').on(table.documentId),
    sessionStatusIdx: (0, pg_core_1.index)('validation_sessions_status_idx').on(table.status),
}); });
/**
 * Agency Validation Results Table
 *
 * Stores validation results for each agency in a session
 */
exports.agencyValidationResults = (0, pg_core_1.pgTable)('agency_validation_results', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sessionId: (0, pg_core_1.uuid)('session_id')
        .references(function () { return exports.multiAgencyValidationSessions.sessionId; })
        .notNull(),
    agency: (0, pg_core_1.text)('agency').notNull(), // FDA, EMA, PMDA, Health_Canada, TGA
    complianceScore: (0, pg_core_1.decimal)('compliance_score', { precision: 5, scale: 2 }),
    issuesFound: (0, pg_core_1.integer)('issues_found').default(0),
    processingTimeSeconds: (0, pg_core_1.integer)('processing_time_seconds'),
    validationDetails: (0, pg_core_1.json)('validation_details'),
    recommendations: (0, pg_core_1.json)('recommendations'),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, completed, failed
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    resultSessionIdx: (0, pg_core_1.index)('agency_results_session_idx').on(table.sessionId),
    resultAgencyIdx: (0, pg_core_1.index)('agency_results_agency_idx').on(table.agency),
    resultStatusIdx: (0, pg_core_1.index)('agency_results_status_idx').on(table.status),
}); });
/**
 * Validation Issues Table
 *
 * Stores individual validation issues found during multi-agency validation
 */
exports.validationIssues = (0, pg_core_1.pgTable)('validation_issues', {
    issueId: (0, pg_core_1.uuid)('issue_id').primaryKey().defaultRandom(),
    sessionId: (0, pg_core_1.uuid)('session_id')
        .references(function () { return exports.multiAgencyValidationSessions.sessionId; })
        .notNull(),
    agency: (0, pg_core_1.text)('agency').notNull(),
    issueType: (0, pg_core_1.text)('issue_type').notNull(), // terminology, formatting, content, compliance
    severity: (0, pg_core_1.text)('severity').notNull(), // critical, major, minor
    description: (0, pg_core_1.text)('description').notNull(),
    location: (0, pg_core_1.text)('location'), // Section/page reference
    conflictingRequirements: (0, pg_core_1.json)('conflicting_requirements'),
    suggestedFix: (0, pg_core_1.text)('suggested_fix'),
    status: (0, pg_core_1.text)('status').default('open').notNull(), // open, in_progress, resolved, dismissed
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    issueSessionIdx: (0, pg_core_1.index)('validation_issues_session_idx').on(table.sessionId),
    issueAgencyIdx: (0, pg_core_1.index)('validation_issues_agency_idx').on(table.agency),
    issueSeverityIdx: (0, pg_core_1.index)('validation_issues_severity_idx').on(table.severity),
    issueStatusIdx: (0, pg_core_1.index)('validation_issues_status_idx').on(table.status),
}); });
/**
 * Validation Harmonization Opportunities Table
 *
 * Tracks opportunities for harmonizing requirements across agencies
 */
exports.validationHarmonizationOpportunities = (0, pg_core_1.pgTable)('validation_harmonization_opportunities', {
    opportunityId: (0, pg_core_1.uuid)('opportunity_id').primaryKey().defaultRandom(),
    sessionId: (0, pg_core_1.uuid)('session_id')
        .references(function () { return exports.multiAgencyValidationSessions.sessionId; })
        .notNull(),
    agencies: (0, pg_core_1.text)('agencies').array(), // Agencies that could be harmonized
    requirementType: (0, pg_core_1.text)('requirement_type').notNull(),
    harmonizationPotential: (0, pg_core_1.text)('harmonization_potential').notNull(), // high, medium, low
    description: (0, pg_core_1.text)('description').notNull(),
    suggestedApproach: (0, pg_core_1.text)('suggested_approach'),
    potentialImpact: (0, pg_core_1.text)('potential_impact'),
    status: (0, pg_core_1.text)('status').default('identified').notNull(), // identified, under_review, implemented, dismissed
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    harmSessionIdx: (0, pg_core_1.index)('harmonization_session_idx').on(table.sessionId),
    harmPotentialIdx: (0, pg_core_1.index)('harmonization_potential_idx').on(table.harmonizationPotential),
    harmStatusIdx: (0, pg_core_1.index)('harmonization_status_idx').on(table.status),
}); });
// Insert schemas for multi-agency validation tables
exports.insertMultiAgencyValidationSessionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.multiAgencyValidationSessions).omit({
    sessionId: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertAgencyValidationResultSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyValidationResults).omit({
    id: true,
    createdAt: true,
});
exports.insertValidationIssueSchema = (0, drizzle_zod_1.createInsertSchema)(exports.validationIssues).omit({
    issueId: true,
    createdAt: true,
});
exports.insertValidationHarmonizationOpportunitySchema = (0, drizzle_zod_1.createInsertSchema)(exports.validationHarmonizationOpportunities).omit({
    opportunityId: true,
    createdAt: true,
});
/**
 * ====================================================================================
 * SEMANTIC DATA MODELS & STRUCTURED OBSERVATION TERMS
 * ====================================================================================
 *
 * Advanced semantic modeling for regulatory document intelligence,
 * cross-feature connectivity, and structured observation terminology
 */
// ========================================
// eCTD PYRAMID & DREAM eCTD MACHINE SCHEMA
// ========================================
/**
 * eCTD Modules Table
 *
 * Core eCTD structure (Modules 1-5) following ICH M4 guidelines
 * Hierarchical structure for complete eCTD Pyramid
 */
exports.ectdModules = (0, pg_core_1.pgTable)('ectd_modules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    projectId: (0, pg_core_1.integer)('project_id'), // Reference to IND/NDA project
    moduleNumber: (0, pg_core_1.text)('module_number').notNull(), // e.g., "1", "2", "3.2.P", "3.2.S"
    moduleName: (0, pg_core_1.text)('module_name').notNull(), // e.g., "Administrative Information", "Quality Overall Summary"
    parentModuleId: (0, pg_core_1.integer)('parent_module_id').references(function () { return exports.ectdModules.id; }),
    level: (0, pg_core_1.integer)('level').notNull(), // Hierarchy level (1=Module, 2=Section, 3=Subsection)
    isLeaf: (0, pg_core_1.boolean)('is_leaf').default(false), // True if can contain documents (granules)
    sortOrder: (0, pg_core_1.integer)('sort_order').notNull(),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, archived
    ichGuidance: (0, pg_core_1.text)('ich_guidance'), // ICH M4 guidance text
    isRequired: (0, pg_core_1.boolean)('is_required').default(false),
    allowCustomGranules: (0, pg_core_1.boolean)('allow_custom_granules').default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    moduleOrgIdx: (0, pg_core_1.index)('ectd_modules_org_idx').on(table.organizationId),
    moduleProjectIdx: (0, pg_core_1.index)('ectd_modules_project_idx').on(table.projectId),
    moduleNumberIdx: (0, pg_core_1.index)('ectd_modules_number_idx').on(table.moduleNumber),
    parentModuleIdx: (0, pg_core_1.index)('ectd_modules_parent_idx').on(table.parentModuleId),
}); });
/**
 * eCTD Granules Table
 *
 * Individual documents within modules - the atomic units of eCTD
 * Implements granule-level document management with status tracking
 */
exports.ectdGranules = (0, pg_core_1.pgTable)('ectd_granules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    moduleId: (0, pg_core_1.integer)('module_id')
        .references(function () { return exports.ectdModules.id; })
        .notNull(),
    granuleId: (0, pg_core_1.text)('granule_id').notNull(), // e.g., "1.2", "3.2.P.1", "3.2.S.4.2"
    granuleName: (0, pg_core_1.text)('granule_name').notNull(), // e.g., "Cover Letter", "Description and Composition"
    fileName: (0, pg_core_1.text)('file_name'), // Current file name
    fileExtension: (0, pg_core_1.text)('file_extension'), // .docx, .pdf, etc.
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, final, uploaded, inactive, locked
    version: (0, pg_core_1.text)('version').default('1.0').notNull(),
    lastEditedBy: (0, pg_core_1.integer)('last_edited_by'),
    lastEditedAt: (0, pg_core_1.timestamp)('last_edited_at'),
    documentPath: (0, pg_core_1.text)('document_path'), // Path to actual document
    sharepointUrl: (0, pg_core_1.text)('sharepoint_url'), // SharePoint integration
    sharepointDocId: (0, pg_core_1.text)('sharepoint_doc_id'),
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false), // Locked for compilation
    compiledInto: (0, pg_core_1.integer)('compiled_into'), // Reference to compiled module
    templateId: (0, pg_core_1.integer)('template_id'), // Reference to template used
    customGranule: (0, pg_core_1.boolean)('custom_granule').default(false), // User-created custom granule
    ichSection: (0, pg_core_1.text)('ich_section'), // ICH M4 section reference
    wordCount: (0, pg_core_1.integer)('word_count').default(0),
    metadata: (0, pg_core_1.json)('metadata'), // Additional metadata
    tags: (0, pg_core_1.text)('tags').array(), // User-defined tags
    sortOrder: (0, pg_core_1.integer)('sort_order').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    granuleOrgIdx: (0, pg_core_1.index)('ectd_granules_org_idx').on(table.organizationId),
    granuleModuleIdx: (0, pg_core_1.index)('ectd_granules_module_idx').on(table.moduleId),
    granuleIdIdx: (0, pg_core_1.index)('ectd_granules_id_idx').on(table.granuleId),
    granuleStatusIdx: (0, pg_core_1.index)('ectd_granules_status_idx').on(table.status),
    granuleVersionIdx: (0, pg_core_1.index)('ectd_granules_version_idx').on(table.version),
    granuleEditedIdx: (0, pg_core_1.index)('ectd_granules_edited_idx').on(table.lastEditedAt),
}); });
/**
 * eCTD Templates Table
 *
 * Template system for granules with ICH guidance integration
 */
exports.ectdTemplates = (0, pg_core_1.pgTable)('ectd_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    templateName: (0, pg_core_1.text)('template_name').notNull(),
    granuleId: (0, pg_core_1.text)('granule_id'), // Associated granule type
    moduleNumber: (0, pg_core_1.text)('module_number'), // Associated module
    category: (0, pg_core_1.text)('category').notNull(), // administrative, quality, nonclinical, clinical
    templateType: (0, pg_core_1.text)('template_type').notNull(), // ich_standard, custom, regulatory
    content: (0, pg_core_1.text)('content'), // Template content
    placeholders: (0, pg_core_1.json)('placeholders'), // Dynamic placeholders
    ichGuidance: (0, pg_core_1.text)('ich_guidance'), // ICH guidance for this template
    wordTemplate: (0, pg_core_1.text)('word_template'), // Word template file path
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    isDefault: (0, pg_core_1.boolean)('is_default').default(false),
    version: (0, pg_core_1.text)('version').default('1.0'),
    approvedBy: (0, pg_core_1.integer)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    usageCount: (0, pg_core_1.integer)('usage_count').default(0),
    tags: (0, pg_core_1.text)('tags').array(),
    createdBy: (0, pg_core_1.integer)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    templateOrgIdx: (0, pg_core_1.index)('ectd_templates_org_idx').on(table.organizationId),
    templateCategoryIdx: (0, pg_core_1.index)('ectd_templates_category_idx').on(table.category),
    templateTypeIdx: (0, pg_core_1.index)('ectd_templates_type_idx').on(table.templateType),
    templateActiveIdx: (0, pg_core_1.index)('ectd_templates_active_idx').on(table.isActive),
}); });
/**
 * eCTD Module Compilation Table
 *
 * Track compiled modules with ICH compliance and XML backbone generation
 */
exports.ectdCompilations = (0, pg_core_1.pgTable)('ectd_compilations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    moduleId: (0, pg_core_1.integer)('module_id')
        .references(function () { return exports.ectdModules.id; })
        .notNull(),
    compilationName: (0, pg_core_1.text)('compilation_name').notNull(),
    compilationType: (0, pg_core_1.text)('compilation_type').notNull(), // module, section, custom
    includedGranules: (0, pg_core_1.json)('included_granules'), // Array of granule IDs
    compiledFilePath: (0, pg_core_1.text)('compiled_file_path'),
    sharepointUrl: (0, pg_core_1.text)('sharepoint_url'),
    xmlBackbone: (0, pg_core_1.text)('xml_backbone'), // eCTD XML structure
    crossReferences: (0, pg_core_1.json)('cross_references'), // ICH cross-references
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, compiling, completed, failed
    compiledBy: (0, pg_core_1.integer)('compiled_by').notNull(),
    compiledAt: (0, pg_core_1.timestamp)('compiled_at'),
    version: (0, pg_core_1.text)('version').default('1.0'),
    changeLog: (0, pg_core_1.json)('change_log'), // Track changes in compilation
    validationResults: (0, pg_core_1.json)('validation_results'), // ICH validation results
    lockReason: (0, pg_core_1.text)('lock_reason'), // Reason for locking granules
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    compilationOrgIdx: (0, pg_core_1.index)('ectd_compilations_org_idx').on(table.organizationId),
    compilationModuleIdx: (0, pg_core_1.index)('ectd_compilations_module_idx').on(table.moduleId),
    compilationStatusIdx: (0, pg_core_1.index)('ectd_compilations_status_idx').on(table.status),
    compilationDateIdx: (0, pg_core_1.index)('ectd_compilations_date_idx').on(table.compiledAt),
}); });
/**
 * eCTD Change Control Table
 *
 * ICH Change Control Process v1.9 implementation
 */
exports.ectdChangeControl = (0, pg_core_1.pgTable)('ectd_change_control', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    granuleId: (0, pg_core_1.integer)('granule_id')
        .references(function () { return exports.ectdGranules.id; })
        .notNull(),
    changeType: (0, pg_core_1.text)('change_type').notNull(), // new, replace, delete, append
    changeReason: (0, pg_core_1.text)('change_reason').notNull(),
    previousVersion: (0, pg_core_1.text)('previous_version'),
    newVersion: (0, pg_core_1.text)('new_version').notNull(),
    changeDescription: (0, pg_core_1.text)('change_description'),
    sequenceNumber: (0, pg_core_1.text)('sequence_number'), // ICH sequence number
    xmlOperation: (0, pg_core_1.text)('xml_operation'), // ICH XML operation
    affectedSections: (0, pg_core_1.json)('affected_sections'), // Cross-references affected
    reviewRequired: (0, pg_core_1.boolean)('review_required').default(false),
    reviewedBy: (0, pg_core_1.integer)('reviewed_by'),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at'),
    approvedBy: (0, pg_core_1.integer)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, approved, rejected, implemented
    implementedAt: (0, pg_core_1.timestamp)('implemented_at'),
    rollbackInfo: (0, pg_core_1.json)('rollback_info'), // Rollback information
    auditTrail: (0, pg_core_1.json)('audit_trail'), // Complete audit trail
    createdBy: (0, pg_core_1.integer)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    changeOrgIdx: (0, pg_core_1.index)('ectd_change_org_idx').on(table.organizationId),
    changeGranuleIdx: (0, pg_core_1.index)('ectd_change_granule_idx').on(table.granuleId),
    changeTypeIdx: (0, pg_core_1.index)('ectd_change_type_idx').on(table.changeType),
    changeStatusIdx: (0, pg_core_1.index)('ectd_change_status_idx').on(table.status),
    changeSequenceIdx: (0, pg_core_1.index)('ectd_change_sequence_idx').on(table.sequenceNumber),
}); });
/**
 * eCTD Cross References Table
 *
 * ICH M4 cross-referencing system with XML hyperlink generation
 */
exports.ectdCrossReferences = (0, pg_core_1.pgTable)('ectd_cross_references', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    sourceGranuleId: (0, pg_core_1.integer)('source_granule_id')
        .references(function () { return exports.ectdGranules.id; })
        .notNull(),
    targetGranuleId: (0, pg_core_1.integer)('target_granule_id')
        .references(function () { return exports.ectdGranules.id; })
        .notNull(),
    referenceType: (0, pg_core_1.text)('reference_type').notNull(), // citation, cross_ref, hyperlink, table_ref
    sourceLocation: (0, pg_core_1.text)('source_location'), // Page, section, paragraph reference
    targetLocation: (0, pg_core_1.text)('target_location'), // Target location
    linkText: (0, pg_core_1.text)('link_text'), // Display text for link
    autoGenerated: (0, pg_core_1.boolean)('auto_generated').default(false), // AI-generated reference
    ichCompliant: (0, pg_core_1.boolean)('ich_compliant').default(true),
    validationStatus: (0, pg_core_1.text)('validation_status').default('valid'), // valid, broken, outdated
    lastValidated: (0, pg_core_1.timestamp)('last_validated'),
    xmlHyperlink: (0, pg_core_1.text)('xml_hyperlink'), // eCTD XML hyperlink format
    contextInfo: (0, pg_core_1.json)('context_info'), // Additional context
    createdBy: (0, pg_core_1.integer)('created_by').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    crossRefOrgIdx: (0, pg_core_1.index)('ectd_cross_ref_org_idx').on(table.organizationId),
    crossRefSourceIdx: (0, pg_core_1.index)('ectd_cross_ref_source_idx').on(table.sourceGranuleId),
    crossRefTargetIdx: (0, pg_core_1.index)('ectd_cross_ref_target_idx').on(table.targetGranuleId),
    crossRefTypeIdx: (0, pg_core_1.index)('ectd_cross_ref_type_idx').on(table.referenceType),
    crossRefValidationIdx: (0, pg_core_1.index)('ectd_cross_ref_validation_idx').on(table.validationStatus),
}); });
/**
 * IND Applications Table
 *
 * Stores IND application data and metadata
 */
exports.indApplications = (0, pg_core_1.pgTable)('ind_applications', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    applicationNumber: (0, pg_core_1.text)('application_number').unique(),
    sponsorName: (0, pg_core_1.text)('sponsor_name'),
    drugName: (0, pg_core_1.text)('drug_name'),
    drugEstablishedName: (0, pg_core_1.text)('drug_established_name'),
    drugCode: (0, pg_core_1.text)('drug_code'),
    indication: (0, pg_core_1.text)('indication'),
    phase: (0, pg_core_1.text)('phase'), // Phase 1, Phase 2, Phase 3, etc.
    submissionType: (0, pg_core_1.text)('submission_type'), // initial, amendment, etc.
    submissionDate: (0, pg_core_1.date)('submission_date'),
    status: (0, pg_core_1.text)('status').default('draft'), // draft, submitted, approved, rejected
    preIndData: (0, pg_core_1.json)('pre_ind_data'), // Pre-IND meeting data
    nonclinicalData: (0, pg_core_1.json)('nonclinical_data'), // Nonclinical study data
    cmcData: (0, pg_core_1.json)('cmc_data'), // Chemistry, Manufacturing, Controls data
    clinicalProtocolData: (0, pg_core_1.json)('clinical_protocol_data'), // Clinical protocol data
    investigatorBrochureData: (0, pg_core_1.json)('investigator_brochure_data'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdBy: (0, pg_core_1.integer)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    indOrgIdx: (0, pg_core_1.index)('ind_applications_org_idx').on(table.organizationId),
    indStatusIdx: (0, pg_core_1.index)('ind_applications_status_idx').on(table.status),
    indPhaseIdx: (0, pg_core_1.index)('ind_applications_phase_idx').on(table.phase),
}); });
/**
 * IND Documents Table
 *
 * Stores generated documents from templates for IND applications
 */
exports.indDocuments = (0, pg_core_1.pgTable)('ind_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    indApplicationId: (0, pg_core_1.integer)('ind_application_id')
        .references(function () { return exports.indApplications.id; })
        .notNull(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    templateId: (0, pg_core_1.integer)('template_id')
        .references(function () { return exports.ectdTemplates.id; }),
    title: (0, pg_core_1.text)('title').notNull(),
    content: (0, pg_core_1.text)('content'),
    documentType: (0, pg_core_1.text)('document_type'), // form, protocol, report, etc.
    moduleNumber: (0, pg_core_1.text)('module_number'), // CTD module reference
    version: (0, pg_core_1.text)('version').default('1.0'),
    status: (0, pg_core_1.text)('status').default('draft'), // draft, review, approved, finalized
    filePath: (0, pg_core_1.text)('file_path'), // Path to generated file
    sharepointUrl: (0, pg_core_1.text)('sharepoint_url'),
    aiGenerated: (0, pg_core_1.boolean)('ai_generated').default(false),
    aiModel: (0, pg_core_1.text)('ai_model'), // OpenAI model used
    aiTokensUsed: (0, pg_core_1.integer)('ai_tokens_used'),
    generationTime: (0, pg_core_1.integer)('generation_time'), // ms
    approvedBy: (0, pg_core_1.integer)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdBy: (0, pg_core_1.integer)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    indDocOrgIdx: (0, pg_core_1.index)('ind_documents_org_idx').on(table.organizationId),
    indDocApplicationIdx: (0, pg_core_1.index)('ind_documents_application_idx').on(table.indApplicationId),
    indDocStatusIdx: (0, pg_core_1.index)('ind_documents_status_idx').on(table.status),
    indDocModuleIdx: (0, pg_core_1.index)('ind_documents_module_idx').on(table.moduleNumber),
}); });
/**
 * SharePoint Integration Table
 *
 * Track SharePoint document synchronization and collaboration
 */
exports.sharepointIntegration = (0, pg_core_1.pgTable)('sharepoint_integration', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    granuleId: (0, pg_core_1.integer)('granule_id')
        .references(function () { return exports.ectdGranules.id; })
        .notNull(),
    sharepointSiteId: (0, pg_core_1.text)('sharepoint_site_id').notNull(),
    sharepointDocumentId: (0, pg_core_1.text)('sharepoint_document_id').notNull(),
    sharepointUrl: (0, pg_core_1.text)('sharepoint_url').notNull(),
    sharepointPath: (0, pg_core_1.text)('sharepoint_path'),
    sharepointVersion: (0, pg_core_1.text)('sharepoint_version'),
    syncStatus: (0, pg_core_1.text)('sync_status').default('synced').notNull(), // synced, pending, failed, conflict
    lastSyncAt: (0, pg_core_1.timestamp)('last_sync_at'),
    syncDirection: (0, pg_core_1.text)('sync_direction'), // upload, download, bidirectional
    lockStatus: (0, pg_core_1.text)('lock_status'), // unlocked, locked, checked_out
    lockedBy: (0, pg_core_1.text)('locked_by'), // SharePoint user
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    conflictResolution: (0, pg_core_1.json)('conflict_resolution'), // Conflict resolution log
    accessPermissions: (0, pg_core_1.json)('access_permissions'), // SharePoint permissions
    metadata: (0, pg_core_1.json)('metadata'), // SharePoint metadata
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    sharepointOrgIdx: (0, pg_core_1.index)('sharepoint_org_idx').on(table.organizationId),
    sharepointGranuleIdx: (0, pg_core_1.index)('sharepoint_granule_idx').on(table.granuleId),
    sharepointSiteIdx: (0, pg_core_1.index)('sharepoint_site_idx').on(table.sharepointSiteId),
    sharepointStatusIdx: (0, pg_core_1.index)('sharepoint_status_idx').on(table.syncStatus),
    sharepointSyncIdx: (0, pg_core_1.index)('sharepoint_sync_idx').on(table.lastSyncAt),
}); });
/**
 * Integration Tokens Table
 *
 * Store OAuth tokens for external integrations (Google, Microsoft, etc.)
 */
exports.integrationTokens = (0, pg_core_1.pgTable)('integration_tokens', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    userId: (0, pg_core_1.integer)('user_id')
        .references(function () { return exports.users.id; })
        .notNull(),
    provider: (0, pg_core_1.text)('provider').notNull(), // google, microsoft, sharepoint, etc.
    accessToken: (0, pg_core_1.text)('access_token').notNull(),
    refreshToken: (0, pg_core_1.text)('refresh_token'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    scope: (0, pg_core_1.text)('scope'), // OAuth scopes
    metadata: (0, pg_core_1.json)('metadata'), // Additional provider-specific metadata
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    intTokensOrgIdx: (0, pg_core_1.index)('integration_tokens_org_idx').on(table.organizationId),
    intTokensUserIdx: (0, pg_core_1.index)('integration_tokens_user_idx').on(table.userId),
    intTokensProviderIdx: (0, pg_core_1.index)('integration_tokens_provider_idx').on(table.provider),
    intTokensUniqueIdx: (0, pg_core_1.uniqueIndex)('integration_tokens_unique').on(table.organizationId, table.userId, table.provider),
}); });
// eCTD Relations
exports.ectdModulesRelations = (0, drizzle_orm_1.relations)(exports.ectdModules, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdModules.organizationId],
            references: [exports.organizations.id],
        }),
        parentModule: one(exports.ectdModules, {
            fields: [exports.ectdModules.parentModuleId],
            references: [exports.ectdModules.id],
        }),
        subModules: many(exports.ectdModules),
        granules: many(exports.ectdGranules),
        compilations: many(exports.ectdCompilations),
    });
});
exports.ectdGranulesRelations = (0, drizzle_orm_1.relations)(exports.ectdGranules, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdGranules.organizationId],
            references: [exports.organizations.id],
        }),
        module: one(exports.ectdModules, {
            fields: [exports.ectdGranules.moduleId],
            references: [exports.ectdModules.id],
        }),
        template: one(exports.ectdTemplates, {
            fields: [exports.ectdGranules.templateId],
            references: [exports.ectdTemplates.id],
        }),
        changeControl: many(exports.ectdChangeControl),
        crossReferencesSource: many(exports.ectdCrossReferences, { relationName: 'sourceGranule' }),
        crossReferencesTarget: many(exports.ectdCrossReferences, { relationName: 'targetGranule' }),
        sharepointIntegration: one(exports.sharepointIntegration),
    });
});
exports.ectdTemplatesRelations = (0, drizzle_orm_1.relations)(exports.ectdTemplates, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdTemplates.organizationId],
            references: [exports.organizations.id],
        }),
        granules: many(exports.ectdGranules),
    });
});
exports.ectdCompilationsRelations = (0, drizzle_orm_1.relations)(exports.ectdCompilations, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdCompilations.organizationId],
            references: [exports.organizations.id],
        }),
        module: one(exports.ectdModules, {
            fields: [exports.ectdCompilations.moduleId],
            references: [exports.ectdModules.id],
        }),
    });
});
exports.ectdChangeControlRelations = (0, drizzle_orm_1.relations)(exports.ectdChangeControl, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdChangeControl.organizationId],
            references: [exports.organizations.id],
        }),
        granule: one(exports.ectdGranules, {
            fields: [exports.ectdChangeControl.granuleId],
            references: [exports.ectdGranules.id],
        }),
    });
});
exports.ectdCrossReferencesRelations = (0, drizzle_orm_1.relations)(exports.ectdCrossReferences, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.ectdCrossReferences.organizationId],
            references: [exports.organizations.id],
        }),
        sourceGranule: one(exports.ectdGranules, {
            fields: [exports.ectdCrossReferences.sourceGranuleId],
            references: [exports.ectdGranules.id],
            relationName: 'sourceGranule',
        }),
        targetGranule: one(exports.ectdGranules, {
            fields: [exports.ectdCrossReferences.targetGranuleId],
            references: [exports.ectdGranules.id],
            relationName: 'targetGranule',
        }),
    });
});
exports.sharepointIntegrationRelations = (0, drizzle_orm_1.relations)(exports.sharepointIntegration, function (_a) {
    var one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.sharepointIntegration.organizationId],
            references: [exports.organizations.id],
        }),
        granule: one(exports.ectdGranules, {
            fields: [exports.sharepointIntegration.granuleId],
            references: [exports.ectdGranules.id],
        }),
    });
});
/**
 * Structured Observation Terms Table
 *
 * This table stores structured medical/regulatory observation terms
 * used for AI-powered document analysis and compliance checking.
 * Supports SNOMED, MedDRA, ICD-10, and custom regulatory terminologies.
 */
exports.structuredObservationTerms = (0, pg_core_1.pgTable)('structured_observation_terms', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; })
        .notNull(),
    termCode: (0, pg_core_1.text)('term_code').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    definition: (0, pg_core_1.text)('definition'),
    category: (0, pg_core_1.text)('category'),
    subcategory: (0, pg_core_1.text)('subcategory'),
    terminology: (0, pg_core_1.text)('terminology'),
    status: (0, pg_core_1.text)('status').default('active'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Structured Observation Terms Insert Schema
exports.insertStructuredObservationTermSchema = (0, drizzle_zod_1.createInsertSchema)(exports.structuredObservationTerms).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * OBLIGATIONS & COMMITMENTS LEDGER
 * ====================================================================================
 *
 * Comprehensive agency commitment management system for tracking regulatory
 * obligations, commitments, and compliance requirements across multiple agencies
 */
/**
 * Regulatory Obligations Table
 *
 * Tracks regulatory obligations and commitments made to agencies
 */
exports.regulatoryObligations = (0, pg_core_1.pgTable)('regulatory_obligations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id').references(function () { return exports.clientWorkspaces.id; }),
    submissionId: (0, pg_core_1.text)('submission_id'), // Associated submission
    obligationType: (0, pg_core_1.text)('obligation_type').notNull(), // commitment, condition, requirement, post_market
    category: (0, pg_core_1.text)('category').notNull(), // safety, efficacy, quality, manufacturing, labeling
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    agency: (0, pg_core_1.text)('agency').notNull(), // FDA, EMA, PMDA, HC, TGA, etc.
    agencyDivision: (0, pg_core_1.text)('agency_division'), // CDER, CBER, etc.
    regulatoryPathway: (0, pg_core_1.text)('regulatory_pathway'), // NDA, ANDA, BLA, 510k, etc.
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(), // critical, high, medium, low
    status: (0, pg_core_1.text)('status').default('open').notNull(), // open, in_progress, completed, overdue, cancelled
    assignedTo: (0, pg_core_1.integer)('assigned_to').references(function () { return exports.users.id; }),
    sourceDocument: (0, pg_core_1.text)('source_document'), // Letter, meeting minutes, etc.
    sourceReference: (0, pg_core_1.text)('source_reference'), // Document reference number
    legalBasis: (0, pg_core_1.text)('legal_basis'), // CFR reference, guidance, etc.
    consequenceOfNonCompliance: (0, pg_core_1.text)('consequence_of_non_compliance'),
    complianceEvidence: (0, pg_core_1.json)('compliance_evidence'), // Supporting evidence
    agencyCorrespondence: (0, pg_core_1.json)('agency_correspondence'), // Communication history
    milestones: (0, pg_core_1.json)('milestones'), // Progress milestones
    dependencies: (0, pg_core_1.json)('dependencies'), // Dependencies on other obligations
    riskAssessment: (0, pg_core_1.json)('risk_assessment'), // Risk analysis
    businessImpact: (0, pg_core_1.text)('business_impact'), // high, medium, low
    estimatedCost: (0, pg_core_1.decimal)('estimated_cost'),
    actualCost: (0, pg_core_1.decimal)('actual_cost'),
    completionDate: (0, pg_core_1.timestamp)('completion_date'),
    verificationMethod: (0, pg_core_1.text)('verification_method'),
    verificationEvidence: (0, pg_core_1.text)('verification_evidence'),
    reviewCycle: (0, pg_core_1.text)('review_cycle'), // quarterly, annually, as_needed
    nextReviewDate: (0, pg_core_1.timestamp)('next_review_date'),
    tags: (0, pg_core_1.json)('tags'), // Searchable tags
    attachments: (0, pg_core_1.json)('attachments'), // File attachments
    notes: (0, pg_core_1.text)('notes'),
    createdBy: (0, pg_core_1.integer)('created_by')
        .notNull()
        .references(function () { return exports.users.id; }),
    updatedBy: (0, pg_core_1.integer)('updated_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        orgWorkspaceIdx: (0, pg_core_1.index)('reg_obligations_org_workspace_idx').on(table.organizationId, table.clientWorkspaceId),
        statusIdx: (0, pg_core_1.index)('reg_obligations_status_idx').on(table.status),
        dueDateIdx: (0, pg_core_1.index)('reg_obligations_due_date_idx').on(table.dueDate),
        agencyIdx: (0, pg_core_1.index)('reg_obligations_agency_idx').on(table.agency),
        priorityIdx: (0, pg_core_1.index)('reg_obligations_priority_idx').on(table.priority),
    };
});
/**
 * Commitment Updates & Progress Tracking
 */
exports.obligationUpdates = (0, pg_core_1.pgTable)('obligation_updates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    obligationId: (0, pg_core_1.integer)('obligation_id')
        .notNull()
        .references(function () { return exports.regulatoryObligations.id; }),
    updateType: (0, pg_core_1.text)('update_type').notNull(), // status_change, progress, correspondence, milestone
    previousStatus: (0, pg_core_1.text)('previous_status'),
    newStatus: (0, pg_core_1.text)('new_status'),
    progressPercentage: (0, pg_core_1.integer)('progress_percentage').default(0),
    description: (0, pg_core_1.text)('description').notNull(),
    impactAssessment: (0, pg_core_1.text)('impact_assessment'),
    attachments: (0, pg_core_1.json)('attachments'),
    agencyResponse: (0, pg_core_1.text)('agency_response'),
    nextAction: (0, pg_core_1.text)('next_action'),
    actionDueDate: (0, pg_core_1.timestamp)('action_due_date'),
    createdBy: (0, pg_core_1.integer)('created_by')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
/**
 * Agency Communication Log
 */
exports.agencyCommunications = (0, pg_core_1.pgTable)('agency_communications', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    obligationId: (0, pg_core_1.integer)('obligation_id').references(function () { return exports.regulatoryObligations.id; }),
    submissionId: (0, pg_core_1.text)('submission_id'),
    communicationType: (0, pg_core_1.text)('communication_type').notNull(), // meeting, email, letter, phone, information_request
    direction: (0, pg_core_1.text)('direction').notNull(), // inbound, outbound
    agency: (0, pg_core_1.text)('agency').notNull(),
    agencyContact: (0, pg_core_1.text)('agency_contact'),
    subject: (0, pg_core_1.text)('subject').notNull(),
    summary: (0, pg_core_1.text)('summary').notNull(),
    keyDecisions: (0, pg_core_1.json)('key_decisions'),
    actionItems: (0, pg_core_1.json)('action_items'),
    followUpRequired: (0, pg_core_1.boolean)('follow_up_required').default(false),
    followUpDate: (0, pg_core_1.timestamp)('follow_up_date'),
    attachments: (0, pg_core_1.json)('attachments'),
    relatedObligations: (0, pg_core_1.integer)('related_obligations').array(),
    urgency: (0, pg_core_1.text)('urgency').default('normal').notNull(), // critical, high, normal, low
    confidentialityLevel: (0, pg_core_1.text)('confidentiality_level').default('internal').notNull(),
    meetingParticipants: (0, pg_core_1.json)('meeting_participants'),
    createdBy: (0, pg_core_1.integer)('created_by')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
/**
 * Compliance Calendar & Deadlines
 */
exports.complianceCalendar = (0, pg_core_1.pgTable)('compliance_calendar', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    obligationId: (0, pg_core_1.integer)('obligation_id').references(function () { return exports.regulatoryObligations.id; }),
    eventType: (0, pg_core_1.text)('event_type').notNull(), // deadline, review, meeting, submission
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    startDate: (0, pg_core_1.timestamp)('start_date').notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date'),
    allDay: (0, pg_core_1.boolean)('all_day').default(false),
    location: (0, pg_core_1.text)('location'),
    participants: (0, pg_core_1.json)('participants'),
    agency: (0, pg_core_1.text)('agency'),
    priority: (0, pg_core_1.text)('priority').default('medium').notNull(),
    status: (0, pg_core_1.text)('status').default('scheduled').notNull(), // scheduled, completed, cancelled, rescheduled
    reminderSettings: (0, pg_core_1.json)('reminder_settings'),
    recurrenceRule: (0, pg_core_1.text)('recurrence_rule'), // RFC 5545 RRULE
    timezone: (0, pg_core_1.text)('timezone').default('UTC'),
    createdBy: (0, pg_core_1.integer)('created_by')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// Obligation Insert Schemas
exports.insertRegulatoryObligationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regulatoryObligations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertObligationUpdateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.obligationUpdates).omit({
    id: true,
    createdAt: true,
});
exports.insertAgencyCommunicationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyCommunications).omit({
    id: true,
    createdAt: true,
});
exports.insertComplianceCalendarSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceCalendar).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * REGULATORY STEP 7: Obligations & Commitments Ledger (Per Specification)
 * ====================================================================================
 */
// Core obligation record (per specification) - matches existing UUID patterns exactly
exports.regObligations = (0, pg_core_1.pgTable)('reg_obligations', {
    oblId: (0, pg_core_1.uuid)('obl_id').primaryKey().defaultRandom(),
    subId: (0, pg_core_1.uuid)('sub_id').notNull(), // references reg_submissions(sub_id)
    productId: (0, pg_core_1.text)('product_id').notNull(),
    region: (0, pg_core_1.text)('region'), // 'FDA','EMA','PMDA', ...
    title: (0, pg_core_1.text)('title').notNull(),
    source: (0, pg_core_1.text)('source').notNull().default('AGENCY'), // 'AGENCY','APPROVAL','IR','INTERNAL'
    severity: (0, pg_core_1.text)('severity').notNull().default('MAJOR'), // 'CRITICAL','MAJOR','MINOR'
    status: (0, pg_core_1.text)('status').notNull().default('OPEN'), // 'OPEN','IN_PROGRESS','COMPLETED','DEFERRED','CANCELLED'
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    recurrence: (0, pg_core_1.json)('recurrence').notNull().default('{}'), // {freq:'YEARLY'|'QUARTERLY'|'MONTHLY', interval:1, until?:'YYYY-MM-DD'}
    ownerUserId: (0, pg_core_1.uuid)('owner_user_id'),
    priority: (0, pg_core_1.text)('priority').notNull().default('High'),
    evidence: (0, pg_core_1.json)('evidence').notNull().default('[]'), // linked artifacts at creation
    links: (0, pg_core_1.json)('links').notNull().default('[]'), // [{entity:'SECTION|LEAF|SPEC|CPP|STUDY', id:'...', code?:'3.2.P.8'}]
    note: (0, pg_core_1.text)('note'),
    createdBy: (0, pg_core_1.text)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    closedAt: (0, pg_core_1.timestamp)('closed_at'),
}, function (table) { return ({
    subDueIdx: (0, pg_core_1.index)('idx_reg_obl_sub_due').on(table.subId, table.dueDate),
    statusIdx: (0, pg_core_1.index)('idx_reg_obl_status').on(table.status),
}); });
// Event log (audit)
exports.regObligationEvents = (0, pg_core_1.pgTable)('reg_obligation_events', {
    evtId: (0, pg_core_1.uuid)('evt_id').primaryKey().defaultRandom(),
    oblId: (0, pg_core_1.uuid)('obl_id')
        .notNull()
        .references(function () { return exports.regObligations.oblId; }, { onDelete: 'cascade' }),
    event: (0, pg_core_1.text)('event').notNull(), // 'CREATED','AI_EXTRACT','ASSIGNED','SNOOZED','COMPLETED'
    byUser: (0, pg_core_1.text)('by_user'),
    payloadJson: (0, pg_core_1.json)('payload_json').notNull().default('{}'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Optional templates (seed obligations by region/product type)
exports.regObligationTemplates = (0, pg_core_1.pgTable)('reg_obligation_templates', {
    tplId: (0, pg_core_1.uuid)('tpl_id').primaryKey().defaultRandom(),
    region: (0, pg_core_1.text)('region'),
    title: (0, pg_core_1.text)('title').notNull(),
    defaultSeverity: (0, pg_core_1.text)('default_severity').notNull().default('MAJOR'),
    defaultRecurrence: (0, pg_core_1.json)('default_recurrence').notNull().default('{}'), // e.g., {"freq":"YEARLY","interval":1}
    defaultLinks: (0, pg_core_1.json)('default_links').notNull().default('[]'),
});
// Insert Schemas for new tables
exports.insertRegObligationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regObligations).omit({
    oblId: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRegObligationEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regObligationEvents).omit({
    evtId: true,
    createdAt: true,
});
exports.insertRegObligationTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regObligationTemplates).omit({
    tplId: true,
});
/**
 * Design of Experiments (DOE) Tables
 *
 * Support for statistical design of experiments functionality
 */
// DOE Studies Table
exports.doeStudies = (0, pg_core_1.pgTable)('doe_studies', {
    id: (0, pg_core_1.varchar)('id')
        .primaryKey()
        .$defaultFn(function () { return crypto.randomUUID(); }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    processId: (0, pg_core_1.varchar)('process_id').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    designType: (0, pg_core_1.text)('design_type').notNull(), // factorial, fractional_factorial, response_surface, etc.
    status: (0, pg_core_1.text)('status').default('planning').notNull(), // planning, active, completed, cancelled
    objectives: (0, pg_core_1.json)('objectives'), // Array of objectives
    constraints: (0, pg_core_1.json)('constraints'), // Array of constraints
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// DOE Factors Table
exports.doeFactors = (0, pg_core_1.pgTable)('doe_factors', {
    id: (0, pg_core_1.varchar)('id')
        .primaryKey()
        .$defaultFn(function () { return crypto.randomUUID(); }),
    studyId: (0, pg_core_1.varchar)('study_id')
        .notNull()
        .references(function () { return exports.doeStudies.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, pg_core_1.text)('type').default('continuous').notNull(), // continuous, discrete, categorical
    unit: (0, pg_core_1.text)('unit'),
    lowLevel: (0, pg_core_1.text)('low_level'), // String to handle both numeric and categorical
    highLevel: (0, pg_core_1.text)('high_level'),
    centerPoint: (0, pg_core_1.text)('center_point'),
    levels: (0, pg_core_1.json)('levels'), // For categorical factors
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// DOE Responses Table
exports.doeResponses = (0, pg_core_1.pgTable)('doe_responses', {
    id: (0, pg_core_1.varchar)('id')
        .primaryKey()
        .$defaultFn(function () { return crypto.randomUUID(); }),
    studyId: (0, pg_core_1.varchar)('study_id')
        .notNull()
        .references(function () { return exports.doeStudies.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    unit: (0, pg_core_1.text)('unit'),
    target: (0, pg_core_1.decimal)('target', { precision: 15, scale: 6 }),
    targetType: (0, pg_core_1.text)('target_type').default('maximize'), // minimize, maximize, target
    lowerLimit: (0, pg_core_1.decimal)('lower_limit', { precision: 15, scale: 6 }),
    upperLimit: (0, pg_core_1.decimal)('upper_limit', { precision: 15, scale: 6 }),
    importance: (0, pg_core_1.integer)('importance').default(1), // 1-5 scale
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// DOE Experiments (Runs) Table
exports.doeExperiments = (0, pg_core_1.pgTable)('doe_experiments', {
    id: (0, pg_core_1.varchar)('id')
        .primaryKey()
        .$defaultFn(function () { return crypto.randomUUID(); }),
    studyId: (0, pg_core_1.varchar)('study_id')
        .notNull()
        .references(function () { return exports.doeStudies.id; }, { onDelete: 'cascade' }),
    runOrder: (0, pg_core_1.integer)('run_order').notNull(),
    standardOrder: (0, pg_core_1.integer)('standard_order'),
    blockNumber: (0, pg_core_1.integer)('block_number').default(1),
    factorSettings: (0, pg_core_1.json)('factor_settings').notNull(), // {factorId: value}
    responseValues: (0, pg_core_1.json)('response_values'), // {responseId: value}
    status: (0, pg_core_1.text)('status').default('planned').notNull(), // planned, running, completed, failed
    notes: (0, pg_core_1.text)('notes'),
    conductedBy: (0, pg_core_1.text)('conducted_by'),
    conductedAt: (0, pg_core_1.timestamp)('conducted_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// DOE Analysis Results Table
exports.doeAnalysisResults = (0, pg_core_1.pgTable)('doe_analysis_results', {
    id: (0, pg_core_1.varchar)('id')
        .primaryKey()
        .$defaultFn(function () { return crypto.randomUUID(); }),
    studyId: (0, pg_core_1.varchar)('study_id')
        .notNull()
        .references(function () { return exports.doeStudies.id; }, { onDelete: 'cascade' }),
    responseId: (0, pg_core_1.varchar)('response_id')
        .notNull()
        .references(function () { return exports.doeResponses.id; }, { onDelete: 'cascade' }),
    analysisType: (0, pg_core_1.text)('analysis_type').notNull(), // anova, regression, optimization
    model: (0, pg_core_1.json)('model'), // Model coefficients and statistics
    statistics: (0, pg_core_1.json)('statistics'), // R-squared, p-values, etc.
    predictions: (0, pg_core_1.json)('predictions'), // Predicted values
    residuals: (0, pg_core_1.json)('residuals'), // Residual analysis
    optimizationResults: (0, pg_core_1.json)('optimization_results'), // Optimal settings
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// DOE Insert Schemas
exports.insertDoeStudySchema = (0, drizzle_zod_1.createInsertSchema)(exports.doeStudies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoeFactorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doeFactors).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoeResponseSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doeResponses).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoeExperimentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doeExperiments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoeAnalysisResultSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doeAnalysisResults).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * =============================================================================
 * GxP PHARMACEUTICAL SUPPLY CHAIN MANAGEMENT SCHEMA
 * =============================================================================
 *
 * Enterprise-grade data models for pharmaceutical supply chain management
 * following regulatory requirements (21 CFR Part 11, ICH Q7-Q10, EU GDP)
 */
/**
 * Supply Chain Organizations Table
 *
 * Represents different types of organizations in the pharmaceutical supply chain
 * (manufacturing sites, suppliers, distributors, testing labs, etc.)
 */
exports.supplyChainOrganizations = (0, pg_core_1.pgTable)('supply_chain_organizations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    name: (0, pg_core_1.text)('name').notNull(),
    organizationType: (0, pg_core_1.text)('organization_type').notNull(), // manufacturer, supplier, distributor, testing_lab, warehouse
    regulatoryClass: (0, pg_core_1.text)('regulatory_class').notNull(), // gmp, gdp, gcp, glp, iso
    duns: (0, pg_core_1.text)('duns'), // D-U-N-S Number
    registrationNumber: (0, pg_core_1.text)('registration_number'), // FDA registration, EMA number, etc.
    address: (0, pg_core_1.json)('address').notNull(), // Full address object
    contactInfo: (0, pg_core_1.json)('contact_info').notNull(),
    qualificationStatus: (0, pg_core_1.text)('qualification_status').default('pending').notNull(), // pending, qualified, disqualified, suspended
    qualificationDate: (0, pg_core_1.timestamp)('qualification_date'),
    qualifiedBy: (0, pg_core_1.integer)('qualified_by').references(function () { return exports.users.id; }),
    auditDate: (0, pg_core_1.timestamp)('audit_date'),
    auditScore: (0, pg_core_1.integer)('audit_score'), // 0-100 audit score
    certifications: (0, pg_core_1.text)('certifications').array(), // ['ISO9001', 'ISO13485', 'GMP_EU', 'FDA_510K']
    capabilities: (0, pg_core_1.text)('capabilities').array(), // ['drug_substance', 'drug_product', 'packaging', 'testing']
    riskLevel: (0, pg_core_1.text)('risk_level').default('medium').notNull(), // low, medium, high, critical
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, suspended, terminated
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        tenantOrgIdx: (0, pg_core_1.index)('supply_chain_orgs_tenant_idx').on(table.tenantId),
        typeIdx: (0, pg_core_1.index)('supply_chain_orgs_type_idx').on(table.organizationType),
        statusIdx: (0, pg_core_1.index)('supply_chain_orgs_status_idx').on(table.status),
        dunsUnique: (0, pg_core_1.uniqueIndex)('supply_chain_orgs_duns_unique').on(table.duns),
    };
});
// Supply Chain Organization Insert Schema
exports.insertSupplyChainOrganizationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.supplyChainOrganizations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Materials Master Table
 *
 * Central registry for all materials used in pharmaceutical manufacturing
 * (drug substances, drug products, excipients, components, raw materials)
 */
exports.materials = (0, pg_core_1.pgTable)('materials', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    materialCode: (0, pg_core_1.text)('material_code').notNull(), // Internal material code
    materialName: (0, pg_core_1.text)('material_name').notNull(),
    materialType: (0, pg_core_1.text)('material_type').notNull(), // drug_substance, drug_product, excipient, component, raw_material, packaging
    manufacturerSku: (0, pg_core_1.text)('manufacturer_sku'), // Manufacturer's SKU/Part Number
    casNumber: (0, pg_core_1.text)('cas_number'), // CAS Registry Number
    einecs: (0, pg_core_1.text)('einecs'), // European Inventory number
    molecularFormula: (0, pg_core_1.text)('molecular_formula'),
    molecularWeight: (0, pg_core_1.decimal)('molecular_weight', { precision: 10, scale: 4 }),
    physicalForm: (0, pg_core_1.text)('physical_form'), // solid, liquid, gas, powder, granules
    storageConditions: (0, pg_core_1.text)('storage_conditions').array(), // ['room_temp', 'refrigerated', 'frozen', 'light_protected']
    hazardClassification: (0, pg_core_1.text)('hazard_classification').array(), // ['explosive', 'flammable', 'toxic', 'corrosive']
    shelfLifeMonths: (0, pg_core_1.integer)('shelf_life_months'),
    reorderLevel: (0, pg_core_1.integer)('reorder_level'),
    reorderQuantity: (0, pg_core_1.integer)('reorder_quantity'),
    unitOfMeasure: (0, pg_core_1.text)('unit_of_measure').notNull(), // kg, L, pieces, vials
    costPerUnit: (0, pg_core_1.decimal)('cost_per_unit', { precision: 12, scale: 4 }),
    currency: (0, pg_core_1.text)('currency').default('USD'),
    regulatoryStatus: (0, pg_core_1.text)('regulatory_status').default('approved').notNull(), // approved, pending, rejected, withdrawn
    controlledSubstance: (0, pg_core_1.boolean)('controlled_substance').default(false),
    scheduleClass: (0, pg_core_1.text)('schedule_class'), // DEA schedule classification
    supplierOrgId: (0, pg_core_1.integer)('supplier_org_id').references(function () { return exports.supplyChainOrganizations.id; }),
    qualityGrade: (0, pg_core_1.text)('quality_grade'), // pharma, reagent, technical, analytical
    specifications: (0, pg_core_1.json)('specifications'), // Detailed quality specifications
    safetyDataSheet: (0, pg_core_1.json)('safety_data_sheet'), // SDS information
    certificates: (0, pg_core_1.text)('certificates').array(), // ['coa', 'halal', 'kosher', 'organic']
    customsCode: (0, pg_core_1.text)('customs_code'), // HS/HTS code
    countryOfOrigin: (0, pg_core_1.text)('country_of_origin'),
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, inactive, discontinued, obsolete
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        tenantIdx: (0, pg_core_1.index)('materials_tenant_idx').on(table.tenantId),
        codeUnique: (0, pg_core_1.uniqueIndex)('materials_code_unique').on(table.tenantId, table.materialCode),
        typeIdx: (0, pg_core_1.index)('materials_type_idx').on(table.materialType),
        supplierIdx: (0, pg_core_1.index)('materials_supplier_idx').on(table.supplierOrgId),
        statusIdx: (0, pg_core_1.index)('materials_status_idx').on(table.status),
        casIdx: (0, pg_core_1.index)('materials_cas_idx').on(table.casNumber),
    };
});
// Material Insert Schema
exports.insertMaterialSchema = (0, drizzle_zod_1.createInsertSchema)(exports.materials).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Batches/Lots Table
 *
 * Represents manufacturing batches/lots with complete traceability
 * and genealogy tracking for pharmaceutical manufacturing
 */
exports.batches = (0, pg_core_1.pgTable)('batches', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    batchNumber: (0, pg_core_1.text)('batch_number').notNull(),
    materialId: (0, pg_core_1.integer)('material_id')
        .notNull()
        .references(function () { return exports.materials.id; }),
    manufacturingOrgId: (0, pg_core_1.integer)('manufacturing_org_id')
        .notNull()
        .references(function () { return exports.supplyChainOrganizations.id; }),
    batchSize: (0, pg_core_1.decimal)('batch_size', { precision: 15, scale: 6 }).notNull(),
    batchSizeUnit: (0, pg_core_1.text)('batch_size_unit').notNull(), // kg, L, pieces
    manufacturedDate: (0, pg_core_1.date)('manufactured_date').notNull(),
    expiryDate: (0, pg_core_1.date)('expiry_date').notNull(),
    retestDate: (0, pg_core_1.date)('retest_date'),
    quarantineUntil: (0, pg_core_1.date)('quarantine_until'),
    batchStatus: (0, pg_core_1.text)('batch_status').default('quarantine').notNull(),
    // quarantine, qc_testing, released, rejected, recalled, expired, destroyed
    releaseDate: (0, pg_core_1.date)('release_date'),
    releasedBy: (0, pg_core_1.integer)('released_by').references(function () { return exports.users.id; }),
    rejectionReason: (0, pg_core_1.text)('rejection_reason'),
    recallDate: (0, pg_core_1.date)('recall_date'),
    recallReason: (0, pg_core_1.text)('recall_reason'),
    destructionDate: (0, pg_core_1.date)('destruction_date'),
    potency: (0, pg_core_1.decimal)('potency', { precision: 8, scale: 4 }), // % of label claim
    yield: (0, pg_core_1.decimal)('yield', { precision: 8, scale: 4 }), // Manufacturing yield %
    processParameters: (0, pg_core_1.json)('process_parameters'), // Temperature, pressure, time, etc.
    environmentalConditions: (0, pg_core_1.json)('environmental_conditions'), // Temp, humidity during mfg
    equipmentUsed: (0, pg_core_1.text)('equipment_used').array(), // Equipment IDs/names
    personnelInvolved: (0, pg_core_1.text)('personnel_involved').array(), // Personnel IDs
    qualityRemarks: (0, pg_core_1.text)('quality_remarks'),
    storageLocation: (0, pg_core_1.text)('storage_location'),
    currentQuantity: (0, pg_core_1.decimal)('current_quantity', { precision: 15, scale: 6 }),
    originalQuantity: (0, pg_core_1.decimal)('original_quantity', { precision: 15, scale: 6 }),
    reservedQuantity: (0, pg_core_1.decimal)('reserved_quantity', { precision: 15, scale: 6 }).default('0'),
    parentBatches: (0, pg_core_1.text)('parent_batches').array(), // Parent batch genealogy
    childBatches: (0, pg_core_1.text)('child_batches').array(), // Child batch genealogy
    costPerUnit: (0, pg_core_1.decimal)('cost_per_unit', { precision: 12, scale: 4 }),
    totalCost: (0, pg_core_1.decimal)('total_cost', { precision: 15, scale: 4 }),
    barcode: (0, pg_core_1.text)('barcode'),
    qrCode: (0, pg_core_1.text)('qr_code'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        tenantIdx: (0, pg_core_1.index)('batches_tenant_idx').on(table.tenantId),
        batchNumberUnique: (0, pg_core_1.uniqueIndex)('batches_number_unique').on(table.tenantId, table.batchNumber),
        materialIdx: (0, pg_core_1.index)('batches_material_idx').on(table.materialId),
        statusIdx: (0, pg_core_1.index)('batches_status_idx').on(table.batchStatus),
        mfgOrgIdx: (0, pg_core_1.index)('batches_mfg_org_idx').on(table.manufacturingOrgId),
        mfgDateIdx: (0, pg_core_1.index)('batches_mfg_date_idx').on(table.manufacturedDate),
        expiryIdx: (0, pg_core_1.index)('batches_expiry_idx').on(table.expiryDate),
        barcodeIdx: (0, pg_core_1.index)('batches_barcode_idx').on(table.barcode),
    };
});
// Batch Insert Schema
exports.insertBatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.batches).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Batch Genealogy Table
 *
 * Tracks the parent-child relationships between batches for complete traceability
 * (e.g., API batch -> Blend batch -> Final Product batch)
 */
exports.batchGenealogy = (0, pg_core_1.pgTable)('batch_genealogy', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    childBatchId: (0, pg_core_1.integer)('child_batch_id')
        .notNull()
        .references(function () { return exports.batches.id; }),
    parentBatchId: (0, pg_core_1.integer)('parent_batch_id')
        .notNull()
        .references(function () { return exports.batches.id; }),
    quantityUsed: (0, pg_core_1.decimal)('quantity_used', { precision: 15, scale: 6 }).notNull(),
    quantityUnit: (0, pg_core_1.text)('quantity_unit').notNull(),
    usageDate: (0, pg_core_1.date)('usage_date').notNull(),
    processStep: (0, pg_core_1.text)('process_step'), // blending, coating, encapsulation, etc.
    operatorId: (0, pg_core_1.integer)('operator_id').references(function () { return exports.users.id; }),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) {
    return {
        tenantIdx: (0, pg_core_1.index)('batch_genealogy_tenant_idx').on(table.tenantId),
        childIdx: (0, pg_core_1.index)('batch_genealogy_child_idx').on(table.childBatchId),
        parentIdx: (0, pg_core_1.index)('batch_genealogy_parent_idx').on(table.parentBatchId),
        uniqueRelation: (0, pg_core_1.uniqueIndex)('batch_genealogy_unique').on(table.childBatchId, table.parentBatchId),
    };
});
// Batch Genealogy Insert Schema
exports.insertBatchGenealogySchema = (0, drizzle_zod_1.createInsertSchema)(exports.batchGenealogy).omit({
    id: true,
    createdAt: true,
});
// ============================================================================
// SHIPMENTS & COLD CHAIN MONITORING
// ============================================================================
exports.supplyChainShipments = (0, pg_core_1.pgTable)('supply_chain_shipments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    shipmentNumber: (0, pg_core_1.varchar)('shipment_number', { length: 100 }).notNull(),
    // Shipment Details
    shipmentType: (0, pg_core_1.varchar)('shipment_type', { length: 50 }).notNull(), // inbound, outbound, transfer
    shipmentStatus: (0, pg_core_1.varchar)('shipment_status', { length: 50 }).default('planned').notNull(),
    // planned, picked, packed, shipped, in_transit, delivered, received
    // Origin & Destination
    originSupplierId: (0, pg_core_1.integer)('origin_supplier_id').references(function () { return exports.supplyChainSuppliers.id; }),
    destinationSupplierId: (0, pg_core_1.integer)('destination_supplier_id').references(function () { return exports.supplyChainSuppliers.id; }),
    originAddress: (0, pg_core_1.text)('origin_address'),
    destinationAddress: (0, pg_core_1.text)('destination_address'),
    // Logistics Information
    carrierId: (0, pg_core_1.integer)('carrier_id').references(function () { return exports.supplyChainSuppliers.id; }),
    trackingNumber: (0, pg_core_1.varchar)('tracking_number', { length: 100 }),
    carrierService: (0, pg_core_1.text)('carrier_service'), // Express, Standard, Overnight
    transportMode: (0, pg_core_1.varchar)('transport_mode', { length: 50 }), // Road, Air, Sea, Rail
    // Timing
    plannedShipDate: (0, pg_core_1.timestamp)('planned_ship_date'),
    actualShipDate: (0, pg_core_1.timestamp)('actual_ship_date'),
    plannedDeliveryDate: (0, pg_core_1.timestamp)('planned_delivery_date'),
    actualDeliveryDate: (0, pg_core_1.timestamp)('actual_delivery_date'),
    // Cold Chain Requirements
    temperatureMin: (0, pg_core_1.decimal)('temperature_min', { precision: 5, scale: 2 }), // °C
    temperatureMax: (0, pg_core_1.decimal)('temperature_max', { precision: 5, scale: 2 }), // °C
    humidityMin: (0, pg_core_1.decimal)('humidity_min', { precision: 5, scale: 2 }), // %RH
    humidityMax: (0, pg_core_1.decimal)('humidity_max', { precision: 5, scale: 2 }), // %RH
    // Cold Chain Monitoring
    temperatureMonitoringDevice: (0, pg_core_1.text)('temperature_monitoring_device'),
    deviceCalibrationDate: (0, pg_core_1.date)('device_calibration_date'),
    temperatureExcursions: (0, pg_core_1.json)('temperature_excursions'),
    coldChainIntact: (0, pg_core_1.boolean)('cold_chain_intact').default(true),
    // GDP (Good Distribution Practice) Compliance
    gdpCompliance: (0, pg_core_1.boolean)('gdp_compliance').default(true),
    qualifiedPerson: (0, pg_core_1.text)('qualified_person'), // QP responsible
    // Documentation
    packingList: (0, pg_core_1.json)('packing_list'), // batch numbers and quantities
    shippingDocuments: (0, pg_core_1.json)('shipping_documents'),
    customsClearance: (0, pg_core_1.json)('customs_clearance'),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    shipmentNumberOrg: (0, pg_core_1.uniqueIndex)('shipment_number_org_idx').on(table.shipmentNumber, table.organizationId),
    statusIdx: (0, pg_core_1.index)('shipment_status_idx').on(table.shipmentStatus),
    trackingIdx: (0, pg_core_1.index)('tracking_number_idx').on(table.trackingNumber),
    coldChainIdx: (0, pg_core_1.index)('cold_chain_intact_idx').on(table.coldChainIntact),
}); });
exports.supplyChainTemperatureReadings = (0, pg_core_1.pgTable)('supply_chain_temperature_readings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    shipmentId: (0, pg_core_1.integer)('shipment_id')
        .notNull()
        .references(function () { return exports.supplyChainShipments.id; }),
    deviceId: (0, pg_core_1.text)('device_id').notNull(),
    readingTime: (0, pg_core_1.timestamp)('reading_time').notNull(),
    temperature: (0, pg_core_1.decimal)('temperature', { precision: 5, scale: 2 }).notNull(), // °C
    humidity: (0, pg_core_1.decimal)('humidity', { precision: 5, scale: 2 }), // %RH
    location: (0, pg_core_1.text)('location'), // GPS coordinates or location name
    batteryLevel: (0, pg_core_1.integer)('battery_level'), // percentage
    // Data Quality
    dataQuality: (0, pg_core_1.varchar)('data_quality', { length: 20 }).default('good'), // good, questionable, bad
    calibrationStatus: (0, pg_core_1.varchar)('calibration_status', { length: 20 }).default('valid'),
    // Excursion Detection
    isExcursion: (0, pg_core_1.boolean)('is_excursion').default(false),
    excursionType: (0, pg_core_1.varchar)('excursion_type', { length: 20 }), // high, low, duration
    // Metadata
    rawData: (0, pg_core_1.json)('raw_data'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    shipmentTimeIdx: (0, pg_core_1.index)('temp_reading_shipment_time_idx').on(table.shipmentId, table.readingTime),
    deviceTimeIdx: (0, pg_core_1.index)('temp_reading_device_time_idx').on(table.deviceId, table.readingTime),
    excursionIdx: (0, pg_core_1.index)('temp_reading_excursion_idx').on(table.isExcursion),
}); });
// ============================================================================
// CERTIFICATES OF ANALYSIS (COAs)
// ============================================================================
exports.supplyChainCOAs = (0, pg_core_1.pgTable)('supply_chain_coas', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    coaNumber: (0, pg_core_1.varchar)('coa_number', { length: 100 }).notNull(),
    batchId: (0, pg_core_1.integer)('batch_id')
        .notNull()
        .references(function () { return exports.supplyChainBatches.id; }),
    materialId: (0, pg_core_1.integer)('material_id')
        .notNull()
        .references(function () { return exports.supplyChainMaterials.id; }),
    // COA Information
    coaVersion: (0, pg_core_1.varchar)('coa_version', { length: 20 }).default('1.0'),
    coaStatus: (0, pg_core_1.varchar)('coa_status', { length: 50 }).default('draft').notNull(),
    // draft, under_review, approved, superseded
    issuedDate: (0, pg_core_1.date)('issued_date'),
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    expiryDate: (0, pg_core_1.date)('expiry_date'),
    // Testing Information
    testingLaboratory: (0, pg_core_1.text)('testing_laboratory'),
    testingStartDate: (0, pg_core_1.date)('testing_start_date'),
    testingEndDate: (0, pg_core_1.date)('testing_end_date'),
    analystName: (0, pg_core_1.text)('analyst_name'),
    // Specifications & Results
    specificationVersion: (0, pg_core_1.varchar)('specification_version', { length: 20 }),
    testResults: (0, pg_core_1.json)('test_results'), // array of test parameters with results and specs
    overallResult: (0, pg_core_1.varchar)('overall_result', { length: 20 }).default('pending'), // pass, fail, pending
    outOfSpecifications: (0, pg_core_1.json)('out_of_specifications'), // OOS results requiring investigation
    // Approval Workflow
    reviewedBy: (0, pg_core_1.text)('reviewed_by'),
    reviewedDate: (0, pg_core_1.date)('reviewed_date'),
    approvedBy: (0, pg_core_1.text)('approved_by'), // Quality Person
    approvedDate: (0, pg_core_1.date)('approved_date'),
    // Digital Signature & 21 CFR Part 11
    digitalSignature: (0, pg_core_1.text)('digital_signature'),
    signatureTimestamp: (0, pg_core_1.timestamp)('signature_timestamp'),
    auditTrail: (0, pg_core_1.json)('audit_trail'),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    attachments: (0, pg_core_1.json)('attachments'), // chromatograms, spectra, etc.
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    coaNumberOrg: (0, pg_core_1.uniqueIndex)('coa_number_org_idx').on(table.coaNumber, table.organizationId),
    batchCoaIdx: (0, pg_core_1.index)('coa_batch_idx').on(table.batchId),
    statusIdx: (0, pg_core_1.index)('coa_status_idx').on(table.coaStatus),
    resultIdx: (0, pg_core_1.index)('coa_result_idx').on(table.overallResult),
}); });
// ============================================================================
// DEVIATIONS & CAPAs (Corrective and Preventive Actions)
// ============================================================================
exports.deviations = (0, pg_core_1.pgTable)('deviations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    deviationNumber: (0, pg_core_1.varchar)('deviation_number', { length: 100 }).notNull(),
    // Classification
    deviationType: (0, pg_core_1.varchar)('deviation_type', { length: 50 }).notNull(),
    // manufacturing, quality, supply_chain, cold_chain, documentation
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }).notNull(), // critical, major, minor
    impact: (0, pg_core_1.varchar)('impact', { length: 50 }), // product_quality, safety, compliance, delivery
    // Related Entities
    batchId: (0, pg_core_1.integer)('batch_id').references(function () { return exports.batches.id; }),
    materialId: (0, pg_core_1.integer)('material_id').references(function () { return exports.materials.id; }),
    shipmentId: (0, pg_core_1.integer)('shipment_id'),
    supplierId: (0, pg_core_1.integer)('supplier_id'),
    // Deviation Details
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    discoveryDate: (0, pg_core_1.timestamp)('discovery_date').notNull(),
    discoveredBy: (0, pg_core_1.text)('discovered_by').notNull(),
    location: (0, pg_core_1.text)('location'),
    // Investigation
    investigationRequired: (0, pg_core_1.boolean)('investigation_required').default(true),
    investigationStatus: (0, pg_core_1.varchar)('investigation_status', { length: 50 }).default('not_started'),
    // not_started, in_progress, completed, closed
    rootCause: (0, pg_core_1.text)('root_cause'),
    immediateAction: (0, pg_core_1.text)('immediate_action'),
    // CAPA (Corrective and Preventive Action)
    correctiveActions: (0, pg_core_1.json)('corrective_actions'),
    preventiveActions: (0, pg_core_1.json)('preventive_actions'),
    capaRequired: (0, pg_core_1.boolean)('capa_required').default(false),
    // Status & Workflow
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('open').notNull(),
    // open, under_investigation, capa_pending, resolved, closed
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'), // high, medium, low
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    dueDate: (0, pg_core_1.date)('due_date'),
    closedDate: (0, pg_core_1.date)('closed_date'),
    closedBy: (0, pg_core_1.text)('closed_by'),
    // Regulatory Impact
    regulatoryReportingRequired: (0, pg_core_1.boolean)('regulatory_reporting_required').default(false),
    regulatoryNotificationDate: (0, pg_core_1.date)('regulatory_notification_date'),
    // Quality Impact
    qualityImpactAssessment: (0, pg_core_1.text)('quality_impact_assessment'),
    batchDisposition: (0, pg_core_1.varchar)('batch_disposition', { length: 50 }), // accept, reject, rework, retest
    // Metadata
    attachments: (0, pg_core_1.json)('attachments'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    deviationNumberOrg: (0, pg_core_1.uniqueIndex)('deviation_number_org_idx').on(table.deviationNumber, table.organizationId),
    statusIdx: (0, pg_core_1.index)('deviation_status_idx').on(table.status),
    severityIdx: (0, pg_core_1.index)('deviation_severity_idx').on(table.severity),
    assignedIdx: (0, pg_core_1.index)('deviation_assigned_idx').on(table.assignedTo),
    batchDeviationIdx: (0, pg_core_1.index)('deviation_batch_idx').on(table.batchId),
}); });
// ============================================================================
// AUDIT TRAIL & 21 CFR PART 11 COMPLIANCE
// ============================================================================
exports.auditEvents = (0, pg_core_1.pgTable)('audit_events', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Event Information
    eventType: (0, pg_core_1.varchar)('event_type', { length: 100 }).notNull(),
    // create, update, delete, approve, release, sign, etc.
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 100 }).notNull(),
    // batch, material, supplier, coa, deviation, etc.
    entityId: (0, pg_core_1.integer)('entity_id').notNull(),
    // User & Session
    userId: (0, pg_core_1.integer)('user_id').references(function () { return exports.users.id; }),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    userRole: (0, pg_core_1.text)('user_role'),
    sessionId: (0, pg_core_1.text)('session_id'),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    // Timing (21 CFR Part 11 requirement)
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
    timestampUtc: (0, pg_core_1.timestamp)('timestamp_utc').defaultNow().notNull(),
    // Change Information
    oldValues: (0, pg_core_1.json)('old_values'), // before state
    newValues: (0, pg_core_1.json)('new_values'), // after state
    changedFields: (0, pg_core_1.json)('changed_fields'), // array of field names
    // Reason & Comments (21 CFR Part 11 requirement)
    reason: (0, pg_core_1.text)('reason'), // why was this change made
    comments: (0, pg_core_1.text)('comments'),
    // Digital Signature (if applicable)
    requiresSignature: (0, pg_core_1.boolean)('requires_signature').default(false),
    signatureStatus: (0, pg_core_1.varchar)('signature_status', { length: 50 }), // pending, signed, rejected
    signedBy: (0, pg_core_1.text)('signed_by'),
    signedDate: (0, pg_core_1.timestamp)('signed_date'),
    signatureMeaning: (0, pg_core_1.text)('signature_meaning'), // "Approved by", "Reviewed by", etc.
    // System Information
    applicationVersion: (0, pg_core_1.text)('application_version'),
    systemVersion: (0, pg_core_1.text)('system_version'),
    // Compliance
    regulatorySignificant: (0, pg_core_1.boolean)('regulatory_significant').default(false),
    gxpRelevant: (0, pg_core_1.boolean)('gxp_relevant').default(false),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    entityEventIdx: (0, pg_core_1.index)('audit_entity_event_idx').on(table.entityType, table.entityId, table.eventType),
    auditEventTimestampIdx: (0, pg_core_1.index)('audit_event_timestamp_idx').on(table.timestamp),
    userEventIdx: (0, pg_core_1.index)('audit_user_event_idx').on(table.userId, table.eventType),
    regulatoryIdx: (0, pg_core_1.index)('audit_regulatory_idx').on(table.regulatorySignificant),
    gxpIdx: (0, pg_core_1.index)('audit_gxp_idx').on(table.gxpRelevant),
}); });
// ============================================================================
// REGULATORY MANAGEMENT - COMPREHENSIVE MULTI-AGENCY COMPLIANCE
// ============================================================================
// Regulatory Agencies Master
exports.regulatoryAgencies = (0, pg_core_1.pgTable)('regulatory_agencies', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    agencyCode: (0, pg_core_1.varchar)('agency_code', { length: 10 }).notNull(), // FDA, EMA, PMDA, HC, WHO, TGA
    agencyName: (0, pg_core_1.text)('agency_name').notNull(),
    region: (0, pg_core_1.varchar)('region', { length: 50 }).notNull(),
    country: (0, pg_core_1.varchar)('country', { length: 100 }),
    contactInfo: (0, pg_core_1.json)('contact_info'),
    requirements: (0, pg_core_1.json)('requirements'), // region-specific requirements
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    agencyCodeOrg: (0, pg_core_1.uniqueIndex)('agency_code_org_idx').on(table.agencyCode, table.organizationId),
}); });
// Multi-Agency Compliance Tracking
exports.complianceTracking = (0, pg_core_1.pgTable)('compliance_tracking', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    productId: (0, pg_core_1.varchar)('product_id', { length: 100 }).notNull(),
    agencyId: (0, pg_core_1.integer)('agency_id')
        .notNull()
        .references(function () { return exports.regulatoryAgencies.id; }),
    complianceStatus: (0, pg_core_1.varchar)('compliance_status', { length: 50 }).default('pending'),
    // pending, compliant, non_compliant, in_review, under_assessment
    complianceScore: (0, pg_core_1.decimal)('compliance_score', { precision: 5, scale: 2 }),
    lastAssessmentDate: (0, pg_core_1.date)('last_assessment_date'),
    nextAssessmentDate: (0, pg_core_1.date)('next_assessment_date'),
    requirements: (0, pg_core_1.json)('requirements'), // specific requirements for this product/agency
    findings: (0, pg_core_1.json)('findings'), // compliance findings and gaps
    remediationActions: (0, pg_core_1.json)('remediation_actions'),
    riskLevel: (0, pg_core_1.varchar)('risk_level', { length: 20 }).default('medium'),
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    productAgencyIdx: (0, pg_core_1.uniqueIndex)('product_agency_idx').on(table.productId, table.agencyId),
    complianceStatusIdx: (0, pg_core_1.index)('compliance_status_idx').on(table.complianceStatus),
}); });
// Regulatory Submissions - Moved to line 6311 for enhanced version with intelligent task management
// This table has been replaced with a more comprehensive version below
// Agency Correspondence Management
exports.agencyCorrespondence = (0, pg_core_1.pgTable)('agency_correspondence', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id')
        .references(function () { return exports.regulatorySubmissions.id; }),
    correspondenceNumber: (0, pg_core_1.varchar)('correspondence_number', { length: 100 }).notNull(),
    correspondenceType: (0, pg_core_1.varchar)('correspondence_type', { length: 50 }).notNull(),
    // IR, RTF, CRL, approval_letter, meeting_minutes, guidance_request
    direction: (0, pg_core_1.varchar)('direction', { length: 20 }).notNull(), // inbound, outbound
    agencyId: (0, pg_core_1.integer)('agency_id')
        .notNull()
        .references(function () { return exports.regulatoryAgencies.id; }),
    subject: (0, pg_core_1.text)('subject').notNull(),
    content: (0, pg_core_1.text)('content'),
    receivedDate: (0, pg_core_1.date)('received_date'),
    responseDeadline: (0, pg_core_1.date)('response_deadline'),
    responseDate: (0, pg_core_1.date)('response_date'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('pending'),
    // pending, in_progress, responded, overdue, closed
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    documents: (0, pg_core_1.json)('documents'),
    versionHistory: (0, pg_core_1.json)('version_history'),
    threadId: (0, pg_core_1.varchar)('thread_id', { length: 100 }),
    parentCorrespondenceId: (0, pg_core_1.integer)('parent_correspondence_id'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    correspondenceNumberOrg: (0, pg_core_1.uniqueIndex)('correspondence_number_org_idx').on(table.correspondenceNumber, table.organizationId),
    statusIdx: (0, pg_core_1.index)('correspondence_status_idx').on(table.status),
    deadlineIdx: (0, pg_core_1.index)('correspondence_deadline_idx').on(table.responseDeadline),
    threadIdx: (0, pg_core_1.index)('correspondence_thread_idx').on(table.threadId),
}); });
// Regulatory Intelligence & Updates
exports.regulatoryIntelligence = (0, pg_core_1.pgTable)('regulatory_intelligence', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    intelId: (0, pg_core_1.varchar)('intel_id', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    summary: (0, pg_core_1.text)('summary'),
    content: (0, pg_core_1.text)('content'),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(),
    // guidance, regulation, alert, news, policy_change, deadline_reminder
    agencyId: (0, pg_core_1.integer)('agency_id')
        .references(function () { return exports.regulatoryAgencies.id; }),
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    publishedDate: (0, pg_core_1.date)('published_date'),
    source: (0, pg_core_1.text)('source'),
    url: (0, pg_core_1.text)('url'),
    impactLevel: (0, pg_core_1.varchar)('impact_level', { length: 20 }).default('medium'),
    // low, medium, high, critical
    applicableProducts: (0, pg_core_1.json)('applicable_products'),
    impactAssessment: (0, pg_core_1.text)('impact_assessment'),
    actionRequired: (0, pg_core_1.boolean)('action_required').default(false),
    actionItems: (0, pg_core_1.json)('action_items'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('active'),
    // active, archived, superseded
    tags: (0, pg_core_1.json)('tags'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    intelIdOrg: (0, pg_core_1.uniqueIndex)('intel_id_org_idx').on(table.intelId, table.organizationId),
    typeIdx: (0, pg_core_1.index)('intel_type_idx').on(table.type),
    impactLevelIdx: (0, pg_core_1.index)('intel_impact_level_idx').on(table.impactLevel),
    effectiveDateIdx: (0, pg_core_1.index)('intel_effective_date_idx').on(table.effectiveDate),
}); });
// Change Control Management
exports.regulatoryChangeControl = (0, pg_core_1.pgTable)('regulatory_change_control', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    changeControlNumber: (0, pg_core_1.varchar)('change_control_number', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    changeType: (0, pg_core_1.varchar)('change_type', { length: 50 }).notNull(),
    // major, minor, administrative, manufacturing, analytical, labeling
    affectedProducts: (0, pg_core_1.json)('affected_products'),
    affectedAgencies: (0, pg_core_1.json)('affected_agencies'),
    riskCategory: (0, pg_core_1.varchar)('risk_category', { length: 20 }).default('medium'),
    // low, medium, high, critical
    regulatoryImpact: (0, pg_core_1.text)('regulatory_impact'),
    notificationRequired: (0, pg_core_1.boolean)('notification_required').default(false),
    submissionType: (0, pg_core_1.varchar)('submission_type', { length: 50 }),
    // CBE, PAS, supplement, annual_report
    impactAssessment: (0, pg_core_1.text)('impact_assessment'),
    implementation: (0, pg_core_1.json)('implementation'), // plan and timeline
    agencyNotifications: (0, pg_core_1.json)('agency_notifications'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft'),
    // draft, under_review, approved, implemented, closed, rejected
    initiatedBy: (0, pg_core_1.text)('initiated_by'),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    implementationDate: (0, pg_core_1.date)('implementation_date'),
    dueDate: (0, pg_core_1.date)('due_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    changeControlNumberOrg: (0, pg_core_1.uniqueIndex)('change_control_number_org_idx').on(table.changeControlNumber, table.organizationId),
    statusIdx: (0, pg_core_1.index)('change_control_status_idx').on(table.status),
    riskCategoryIdx: (0, pg_core_1.index)('change_control_risk_idx').on(table.riskCategory),
}); });
// Post-Approval Commitments Tracking
exports.postApprovalCommitments = (0, pg_core_1.pgTable)('post_approval_commitments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id')
        .references(function () { return exports.regulatorySubmissions.id; }),
    commitmentNumber: (0, pg_core_1.varchar)('commitment_number', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(),
    // clinical_study, manufacturing_change, labeling_update, safety_study, quality_study
    agencyId: (0, pg_core_1.integer)('agency_id')
        .notNull()
        .references(function () { return exports.regulatoryAgencies.id; }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('pending'),
    // pending, in_progress, completed, submitted, approved, overdue, cancelled
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    dueDate: (0, pg_core_1.date)('due_date'),
    reminderDate: (0, pg_core_1.date)('reminder_date'),
    submissionDate: (0, pg_core_1.date)('submission_date'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    progressReport: (0, pg_core_1.text)('progress_report'),
    deliverables: (0, pg_core_1.json)('deliverables'),
    milestones: (0, pg_core_1.json)('milestones'),
    escalationRules: (0, pg_core_1.json)('escalation_rules'),
    notificationSettings: (0, pg_core_1.json)('notification_settings'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    commitmentNumberOrg: (0, pg_core_1.uniqueIndex)('commitment_number_org_idx').on(table.commitmentNumber, table.organizationId),
    statusIdx: (0, pg_core_1.index)('commitment_status_idx').on(table.status),
    dueDateIdx: (0, pg_core_1.index)('commitment_due_date_idx').on(table.dueDate),
    assignedIdx: (0, pg_core_1.index)('commitment_assigned_idx').on(table.assignedTo),
}); });
// Regulatory Calendar Events
exports.regulatoryCalendar = (0, pg_core_1.pgTable)('regulatory_calendar', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    eventId: (0, pg_core_1.varchar)('event_id', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    eventType: (0, pg_core_1.varchar)('event_type', { length: 50 }).notNull(),
    // deadline, meeting, submission, milestone, reminder, commitment_due
    eventDate: (0, pg_core_1.timestamp)('event_date').notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date'),
    allDay: (0, pg_core_1.boolean)('all_day').default(false),
    agencyId: (0, pg_core_1.integer)('agency_id')
        .references(function () { return exports.regulatoryAgencies.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id')
        .references(function () { return exports.regulatorySubmissions.id; }),
    commitmentId: (0, pg_core_1.integer)('commitment_id')
        .references(function () { return exports.postApprovalCommitments.id; }),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('scheduled'),
    // scheduled, completed, cancelled, rescheduled
    location: (0, pg_core_1.text)('location'),
    attendees: (0, pg_core_1.json)('attendees'),
    reminders: (0, pg_core_1.json)('reminders'),
    recurrence: (0, pg_core_1.json)('recurrence'), // recurring event settings
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    eventIdOrg: (0, pg_core_1.uniqueIndex)('event_id_org_idx').on(table.eventId, table.organizationId),
    eventDateIdx: (0, pg_core_1.index)('calendar_event_date_idx').on(table.eventDate),
    eventTypeIdx: (0, pg_core_1.index)('calendar_event_type_idx').on(table.eventType),
    statusIdx: (0, pg_core_1.index)('calendar_status_idx').on(table.status),
}); });
// ============================================================================
// REGULATORY CORRESPONDENCE MANAGEMENT
// ============================================================================
// Regulatory Attachments - Uploaded correspondence documents
exports.regAttachments = (0, pg_core_1.pgTable)('reg_attachments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    correspondenceId: (0, pg_core_1.integer)('correspondence_id')
        .references(function () { return exports.agencyCorrespondence.id; }),
    fileName: (0, pg_core_1.text)('file_name').notNull(),
    fileType: (0, pg_core_1.varchar)('file_type', { length: 50 }), // PDF, DOCX, etc.
    fileSize: (0, pg_core_1.integer)('file_size'), // in bytes
    filePath: (0, pg_core_1.text)('file_path'),
    uploadedBy: (0, pg_core_1.text)('uploaded_by'),
    extractedText: (0, pg_core_1.text)('extracted_text'), // Full text extracted from document
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    correspondenceAttachmentIdx: (0, pg_core_1.index)('reg_attachment_correspondence_idx').on(table.correspondenceId),
    orgAttachmentIdx: (0, pg_core_1.index)('reg_attachment_org_idx').on(table.organizationId),
}); });
// Regulatory Questions - Extracted questions from correspondence
exports.regQuestions = (0, pg_core_1.pgTable)('reg_questions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    correspondenceId: (0, pg_core_1.integer)('correspondence_id')
        .references(function () { return exports.agencyCorrespondence.id; }),
    attachmentId: (0, pg_core_1.integer)('attachment_id')
        .references(function () { return exports.regAttachments.id; }),
    questionText: (0, pg_core_1.text)('question_text').notNull(),
    sectionReference: (0, pg_core_1.text)('section_reference'), // Section of submission being questioned
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'), // low, medium, high, critical
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }).default('MAJOR'), // MAJOR, MINOR
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('pending'), // pending, in_progress, responded, closed
    region: (0, pg_core_1.text)('region'), // FDA, EMA, etc.
    dueDate: (0, pg_core_1.date)('due_date'),
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    correspondenceQuestionIdx: (0, pg_core_1.index)('reg_question_correspondence_idx').on(table.correspondenceId),
    statusQuestionIdx: (0, pg_core_1.index)('reg_question_status_idx').on(table.status),
    priorityQuestionIdx: (0, pg_core_1.index)('reg_question_priority_idx').on(table.priority),
    dueDateQuestionIdx: (0, pg_core_1.index)('reg_question_due_date_idx').on(table.dueDate),
}); });
// Regulatory Responses - Drafted responses to questions
exports.regResponses = (0, pg_core_1.pgTable)('reg_responses', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    questionId: (0, pg_core_1.integer)('question_id')
        .notNull()
        .references(function () { return exports.regQuestions.id; }),
    responseText: (0, pg_core_1.text)('response_text').notNull(),
    evidenceUsed: (0, pg_core_1.json)('evidence_used'), // Array of evidence references
    version: (0, pg_core_1.integer)('version').default(1),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft'), // draft, review, approved, submitted
    draftedBy: (0, pg_core_1.text)('drafted_by'),
    reviewedBy: (0, pg_core_1.text)('reviewed_by'),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    questionResponseIdx: (0, pg_core_1.index)('reg_response_question_idx').on(table.questionId),
    statusResponseIdx: (0, pg_core_1.index)('reg_response_status_idx').on(table.status),
    versionResponseIdx: (0, pg_core_1.index)('reg_response_version_idx').on(table.questionId, table.version),
}); });
// Regulatory Messages - Correspondence thread messages
exports.regMessages = (0, pg_core_1.pgTable)('reg_messages', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    correspondenceId: (0, pg_core_1.integer)('correspondence_id')
        .references(function () { return exports.agencyCorrespondence.id; }),
    questionId: (0, pg_core_1.integer)('question_id')
        .references(function () { return exports.regQuestions.id; }),
    messageType: (0, pg_core_1.varchar)('message_type', { length: 50 }).notNull(), // question, response, clarification, note
    messageText: (0, pg_core_1.text)('message_text').notNull(),
    sender: (0, pg_core_1.text)('sender'), // User or Agency
    senderType: (0, pg_core_1.varchar)('sender_type', { length: 20 }).default('internal'), // internal, agency
    attachments: (0, pg_core_1.json)('attachments'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    correspondenceMessageIdx: (0, pg_core_1.index)('reg_message_correspondence_idx').on(table.correspondenceId),
    questionMessageIdx: (0, pg_core_1.index)('reg_message_question_idx').on(table.questionId),
    typeMessageIdx: (0, pg_core_1.index)('reg_message_type_idx').on(table.messageType),
}); });
// Insert Schemas
exports.insertRegAttachmentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regAttachments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRegQuestionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regQuestions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRegResponseSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regResponses).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRegMessageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regMessages).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ============================================================================
// IND PACKAGE PLANNING & REGIONAL SCOPING
// ============================================================================
// IND Package Plans - Main table for package planning configurations
exports.indPackagePlans = (0, pg_core_1.pgTable)('ind_package_plans', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .notNull()
        .references(function () { return exports.clientWorkspaces.id; }),
    planId: (0, pg_core_1.varchar)('plan_id', { length: 100 }).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    drugName: (0, pg_core_1.text)('drug_name'),
    indication: (0, pg_core_1.text)('indication'),
    phase: (0, pg_core_1.varchar)('phase', { length: 20 }).default('Phase I'), // Phase I, II, III, etc.
    sponsor: (0, pg_core_1.text)('sponsor'),
    planType: (0, pg_core_1.varchar)('plan_type', { length: 50 }).default('multi_regional'), // single_region, multi_regional
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft'), // draft, active, completed, archived
    // Selected regions (stored as JSON array for quick access)
    selectedRegions: (0, pg_core_1.json)('selected_regions'), // ["US", "EU", "UK", "Canada", "Japan", "Australia"]
    // Selected modalities (stored as JSON array for quick access)
    selectedModalities: (0, pg_core_1.json)('selected_modalities'), // ["Small Molecule", "Biologics", etc.]
    // Package configuration
    packageConfig: (0, pg_core_1.json)('package_config'), // Complete package configuration
    // Compliance and readiness scores
    overallComplianceScore: (0, pg_core_1.decimal)('overall_compliance_score', { precision: 5, scale: 2 }),
    cmcReadinessScore: (0, pg_core_1.decimal)('cmc_readiness_score', { precision: 5, scale: 2 }),
    // Timeline estimates
    estimatedTimelineDays: (0, pg_core_1.integer)('estimated_timeline_days'),
    targetSubmissionDate: (0, pg_core_1.date)('target_submission_date'),
    // Integration data
    cmcProjectId: (0, pg_core_1.text)('cmc_project_id'), // Link to CMC wizard data
    lastSyncedAt: (0, pg_core_1.timestamp)('last_synced_at'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    createdById: (0, pg_core_1.integer)('created_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planIdOrg: (0, pg_core_1.uniqueIndex)('ind_plan_id_org_idx').on(table.planId, table.organizationId),
    statusIdx: (0, pg_core_1.index)('ind_plan_status_idx').on(table.status),
    phaseIdx: (0, pg_core_1.index)('ind_plan_phase_idx').on(table.phase),
}); });
// IND Package Plan Regions - Detailed regional configurations
exports.indPackagePlanRegions = (0, pg_core_1.pgTable)('ind_package_plan_regions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    planId: (0, pg_core_1.integer)('plan_id')
        .notNull()
        .references(function () { return exports.indPackagePlans.id; }),
    regionCode: (0, pg_core_1.varchar)('region_code', { length: 10 }).notNull(), // US, EU, UK, CA, JP, AU
    regionName: (0, pg_core_1.text)('region_name').notNull(), // United States, European Union, etc.
    // Regional specific requirements
    agencyName: (0, pg_core_1.text)('agency_name'), // FDA, EMA, MHRA, etc.
    submissionType: (0, pg_core_1.varchar)('submission_type', { length: 50 }), // IND, CTA, CTN, etc.
    regulatoryPathway: (0, pg_core_1.text)('regulatory_pathway'), // Traditional, Fast Track, etc.
    // Timeline estimates for this region
    estimatedDays: (0, pg_core_1.integer)('estimated_days'),
    criticalPath: (0, pg_core_1.boolean)('critical_path').default(false),
    // Requirements and templates
    requiredDocuments: (0, pg_core_1.json)('required_documents'), // List of required documents
    recommendedTemplates: (0, pg_core_1.json)('recommended_templates'), // Template recommendations
    specificRequirements: (0, pg_core_1.json)('specific_requirements'), // Region-specific requirements
    // Compliance status
    complianceStatus: (0, pg_core_1.varchar)('compliance_status', { length: 50 }).default('not_assessed'),
    // not_assessed, compliant, non_compliant, partially_compliant
    complianceScore: (0, pg_core_1.decimal)('compliance_score', { precision: 5, scale: 2 }),
    // Priority and status
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'), // high, medium, low
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('planned'), // planned, in_progress, completed
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planRegionIdx: (0, pg_core_1.uniqueIndex)('plan_region_idx').on(table.planId, table.regionCode),
    statusIdx: (0, pg_core_1.index)('region_status_idx').on(table.status),
    priorityIdx: (0, pg_core_1.index)('region_priority_idx').on(table.priority),
}); });
// IND Package Plan Modalities - Detailed modality configurations
exports.indPackagePlanModalities = (0, pg_core_1.pgTable)('ind_package_plan_modalities', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    planId: (0, pg_core_1.integer)('plan_id')
        .notNull()
        .references(function () { return exports.indPackagePlans.id; }),
    modalityCode: (0, pg_core_1.varchar)('modality_code', { length: 20 }).notNull(), // SM, BIO, GT, CT, OLIGO, RADIO
    modalityName: (0, pg_core_1.text)('modality_name').notNull(), // Small Molecule, Biologics, etc.
    // Modality-specific requirements
    specialRequirements: (0, pg_core_1.json)('special_requirements'), // Modality-specific requirements
    recommendedTemplates: (0, pg_core_1.json)('recommended_templates'), // Template recommendations
    additionalStudies: (0, pg_core_1.json)('additional_studies'), // Required additional studies
    // CMC considerations for this modality
    cmcComplexity: (0, pg_core_1.varchar)('cmc_complexity', { length: 20 }).default('standard'), // simple, standard, complex
    manufacturingRequirements: (0, pg_core_1.json)('manufacturing_requirements'),
    analyticalRequirements: (0, pg_core_1.json)('analytical_requirements'),
    // Timeline impact
    timelineImpactDays: (0, pg_core_1.integer)('timeline_impact_days').default(0),
    complexityMultiplier: (0, pg_core_1.decimal)('complexity_multiplier', { precision: 3, scale: 2 }).default('1.0'),
    // Priority and status
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('configured'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planModalityIdx: (0, pg_core_1.uniqueIndex)('plan_modality_idx').on(table.planId, table.modalityCode),
    statusIdx: (0, pg_core_1.index)('modality_status_idx').on(table.status),
    complexityIdx: (0, pg_core_1.index)('modality_complexity_idx').on(table.cmcComplexity),
}); });
// IND Package Plan Requirements - Cross-region/modality requirements matrix
exports.indPackagePlanRequirements = (0, pg_core_1.pgTable)('ind_package_plan_requirements', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    planId: (0, pg_core_1.integer)('plan_id')
        .notNull()
        .references(function () { return exports.indPackagePlans.id; }),
    regionCode: (0, pg_core_1.varchar)('region_code', { length: 10 }).notNull(),
    modalityCode: (0, pg_core_1.varchar)('modality_code', { length: 20 }),
    // Requirement details
    requirementType: (0, pg_core_1.varchar)('requirement_type', { length: 50 }).notNull(),
    // document, study, analysis, consultation, meeting
    requirementTitle: (0, pg_core_1.text)('requirement_title').notNull(),
    description: (0, pg_core_1.text)('description'),
    isMandatory: (0, pg_core_1.boolean)('is_mandatory').default(true),
    // Status and compliance
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('pending'),
    // pending, in_progress, completed, not_applicable, waived
    complianceLevel: (0, pg_core_1.varchar)('compliance_level', { length: 50 }), // full, partial, non_compliant
    // Timeline and dependencies
    estimatedEffort: (0, pg_core_1.integer)('estimated_effort'), // in person-days
    estimatedDuration: (0, pg_core_1.integer)('estimated_duration'), // in calendar days
    dependencies: (0, pg_core_1.json)('dependencies'), // List of dependent requirements
    // Documentation and templates
    templateRecommendations: (0, pg_core_1.json)('template_recommendations'),
    referenceGuidelines: (0, pg_core_1.json)('reference_guidelines'),
    // Assignment and tracking
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    dueDate: (0, pg_core_1.date)('due_date'),
    completionDate: (0, pg_core_1.date)('completion_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planRequirementIdx: (0, pg_core_1.index)('plan_requirement_idx').on(table.planId, table.requirementType),
    statusIdx: (0, pg_core_1.index)('requirement_status_idx').on(table.status),
    dueDateIdx: (0, pg_core_1.index)('requirement_due_date_idx').on(table.dueDate),
}); });
// IND Package Plan Timelines - Detailed timeline estimates and tracking
exports.indPackagePlanTimelines = (0, pg_core_1.pgTable)('ind_package_plan_timelines', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    planId: (0, pg_core_1.integer)('plan_id')
        .notNull()
        .references(function () { return exports.indPackagePlans.id; }),
    regionCode: (0, pg_core_1.varchar)('region_code', { length: 10 }),
    modalityCode: (0, pg_core_1.varchar)('modality_code', { length: 20 }),
    // Timeline details
    phaseType: (0, pg_core_1.varchar)('phase_type', { length: 50 }).notNull(),
    // planning, preparation, documentation, review, submission, approval
    phaseName: (0, pg_core_1.text)('phase_name').notNull(),
    description: (0, pg_core_1.text)('description'),
    // Time estimates
    estimatedDays: (0, pg_core_1.integer)('estimated_days').notNull(),
    bufferDays: (0, pg_core_1.integer)('buffer_days').default(0),
    totalDays: (0, pg_core_1.integer)('total_days').notNull(),
    // Monte Carlo simulation results
    optimisticDays: (0, pg_core_1.integer)('optimistic_days'), // P10
    expectedDays: (0, pg_core_1.integer)('expected_days'), // P50
    pessimisticDays: (0, pg_core_1.integer)('pessimistic_days'), // P90
    // Sequencing and dependencies
    sequenceOrder: (0, pg_core_1.integer)('sequence_order'),
    isParallel: (0, pg_core_1.boolean)('is_parallel').default(false),
    dependsOnPhases: (0, pg_core_1.json)('depends_on_phases'), // List of phase IDs
    // Risk and uncertainty
    riskLevel: (0, pg_core_1.varchar)('risk_level', { length: 20 }).default('medium'), // low, medium, high
    uncertaintyFactor: (0, pg_core_1.decimal)('uncertainty_factor', { precision: 3, scale: 2 }).default('1.2'),
    // Progress tracking
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('planned'),
    // planned, in_progress, completed, delayed, blocked
    actualStartDate: (0, pg_core_1.date)('actual_start_date'),
    actualEndDate: (0, pg_core_1.date)('actual_end_date'),
    actualDays: (0, pg_core_1.integer)('actual_days'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planTimelineIdx: (0, pg_core_1.index)('plan_timeline_idx').on(table.planId, table.sequenceOrder),
    statusIdx: (0, pg_core_1.index)('timeline_status_idx').on(table.status),
    phaseTypeIdx: (0, pg_core_1.index)('timeline_phase_type_idx').on(table.phaseType),
}); });
// IND Package Plan Documents - Document checklist and tracking
exports.indPackagePlanDocuments = (0, pg_core_1.pgTable)('ind_package_plan_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    planId: (0, pg_core_1.integer)('plan_id')
        .notNull()
        .references(function () { return exports.indPackagePlans.id; }),
    regionCode: (0, pg_core_1.varchar)('region_code', { length: 10 }).notNull(),
    modalityCode: (0, pg_core_1.varchar)('modality_code', { length: 20 }),
    // Document details
    documentType: (0, pg_core_1.varchar)('document_type', { length: 50 }).notNull(),
    // protocol, ib, cmc, nonclinical, clinical, regulatory_forms, administrative
    documentTitle: (0, pg_core_1.text)('document_title').notNull(),
    description: (0, pg_core_1.text)('description'),
    section: (0, pg_core_1.varchar)('section', { length: 50 }), // IND section (e.g., "2.3", "5.1")
    // Requirements and compliance
    isMandatory: (0, pg_core_1.boolean)('is_mandatory').default(true),
    isRegionSpecific: (0, pg_core_1.boolean)('is_region_specific').default(false),
    isModalitySpecific: (0, pg_core_1.boolean)('is_modality_specific').default(false),
    // Template and guidance
    recommendedTemplate: (0, pg_core_1.text)('recommended_template'),
    templateId: (0, pg_core_1.text)('template_id'),
    guidanceReferences: (0, pg_core_1.json)('guidance_references'),
    // Status and tracking
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('not_started'),
    // not_started, in_progress, draft_complete, review, approved, final
    completionPercentage: (0, pg_core_1.integer)('completion_percentage').default(0),
    // Assignment and timeline
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    estimatedEffort: (0, pg_core_1.integer)('estimated_effort'), // in person-hours
    targetDate: (0, pg_core_1.date)('target_date'),
    completionDate: (0, pg_core_1.date)('completion_date'),
    // Version and approval tracking
    currentVersion: (0, pg_core_1.varchar)('current_version', { length: 20 }).default('1.0'),
    lastReviewDate: (0, pg_core_1.date)('last_review_date'),
    reviewedBy: (0, pg_core_1.text)('reviewed_by'),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    // Links to actual documents
    documentId: (0, pg_core_1.integer)('document_id').references(function () { return exports.documents.id; }),
    filePath: (0, pg_core_1.text)('file_path'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    planDocumentIdx: (0, pg_core_1.index)('plan_document_idx').on(table.planId, table.documentType),
    indStatusIdx: (0, pg_core_1.index)('ind_document_status_idx').on(table.status),
    indTargetDateIdx: (0, pg_core_1.index)('ind_document_target_date_idx').on(table.targetDate),
    regionModalityIdx: (0, pg_core_1.index)('document_region_modality_idx').on(table.regionCode, table.modalityCode),
}); });
// Insert Schemas for Package Planning
exports.insertIndPackagePlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlans).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndPackagePlanRegionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlanRegions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndPackagePlanModalitySchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlanModalities).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndPackagePlanRequirementSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlanRequirements).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndPackagePlanTimelineSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlanTimelines).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndPackagePlanDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indPackagePlanDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ============================================================================
// SCHEMA RELATIONSHIPS
// ============================================================================
// Supply Chain Supplier Relationships
exports.supplyChainSupplierRelations = (0, drizzle_orm_1.relations)(exports.supplyChainSuppliers, function (_a) {
    var many = _a.many, one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.supplyChainSuppliers.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.supplyChainSuppliers.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        materials: many(exports.supplyChainMaterials),
        batches: many(exports.supplyChainBatches),
        shipments: many(exports.supplyChainShipments),
    });
});
// Supply Chain Material Relationships
exports.supplyChainMaterialRelations = (0, drizzle_orm_1.relations)(exports.supplyChainMaterials, function (_a) {
    var many = _a.many, one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.supplyChainMaterials.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.supplyChainMaterials.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        primarySupplier: one(exports.supplyChainSuppliers, {
            fields: [exports.supplyChainMaterials.primarySupplierId],
            references: [exports.supplyChainSuppliers.id],
        }),
        batches: many(exports.supplyChainBatches),
        coas: many(exports.supplyChainCOAs),
    });
});
// Supply Chain Batch Relationships
exports.supplyChainBatchRelations = (0, drizzle_orm_1.relations)(exports.supplyChainBatches, function (_a) {
    var many = _a.many, one = _a.one;
    return ({
        organization: one(exports.organizations, {
            fields: [exports.supplyChainBatches.organizationId],
            references: [exports.organizations.id],
        }),
        clientWorkspace: one(exports.clientWorkspaces, {
            fields: [exports.supplyChainBatches.clientWorkspaceId],
            references: [exports.clientWorkspaces.id],
        }),
        material: one(exports.supplyChainMaterials, {
            fields: [exports.supplyChainBatches.materialId],
            references: [exports.supplyChainMaterials.id],
        }),
        manufacturingSite: one(exports.supplyChainSuppliers, {
            fields: [exports.supplyChainBatches.manufacturingSiteId],
            references: [exports.supplyChainSuppliers.id],
        }),
        coas: many(exports.supplyChainCOAs),
    });
});
/**
 * ======================================================================================
 * SECTION GRAPH DATABASE SCHEMA
 * ======================================================================================
 *
 * Tables for cross-document synchronization and section management
 * Enables tracking of document sections, versioning, and change propagation
 */
// ============================================================================
// CORE SECTION GRAPH TABLES
// ============================================================================
// Renamed to avoid conflict with existing sections table
exports.sectionGraphNodes = (0, pg_core_1.pgTable)('section_graph_nodes', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    slug: (0, pg_core_1.text)('slug').notNull().unique(),
    title: (0, pg_core_1.text)('title').notNull(),
    canonical: (0, pg_core_1.boolean)('canonical').default(false).notNull(),
    ichReference: (0, pg_core_1.text)('ich_reference'), // Reference to ICH guidelines
    regionScope: (0, pg_core_1.text)('region_scope'), // e.g., "FDA", "EMA", "ALL"
    description: (0, pg_core_1.text)('description'),
    sectionType: (0, pg_core_1.varchar)('section_type', { length: 50 }), // e.g., "module", "chapter", "appendix"
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    slugIdx: (0, pg_core_1.uniqueIndex)('section_graph_slug_idx').on(table.slug),
    canonicalIdx: (0, pg_core_1.index)('section_graph_canonical_idx').on(table.canonical),
    regionScopeIdx: (0, pg_core_1.index)('section_graph_region_scope_idx').on(table.regionScope),
    orgIdx: (0, pg_core_1.index)('section_graph_org_idx').on(table.organizationId),
}); });
// Document Sections table - Link documents to sections
exports.documentSections = (0, pg_core_1.pgTable)('document_sections', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.documents.id; }),
    sectionId: (0, pg_core_1.integer)('section_id')
        .notNull()
        .references(function () { return exports.sectionGraphNodes.id; }),
    position: (0, pg_core_1.integer)('position').notNull().default(0), // Order within document
    leafId: (0, pg_core_1.integer)('leaf_id').references(function () { return exports.sectionLeaves.id; }),
    override: (0, pg_core_1.boolean)('override').default(false).notNull(), // Override canonical content
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    documentSectionIdx: (0, pg_core_1.uniqueIndex)('document_section_idx').on(table.documentId, table.sectionId),
    positionIdx: (0, pg_core_1.index)('document_section_position_idx').on(table.documentId, table.position),
    sectionIdx: (0, pg_core_1.index)('document_section_section_idx').on(table.sectionId),
    leafIdx: (0, pg_core_1.index)('document_section_leaf_idx').on(table.leafId),
}); });
// Section Leaves table - Store versioned content (renamed to avoid conflict with existing leaves table)
exports.sectionLeaves = (0, pg_core_1.pgTable)('section_leaves', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    latestPatchId: (0, pg_core_1.integer)('latest_patch_id'), // References the most recent patch
    valueHtml: (0, pg_core_1.text)('value_html'), // HTML content
    valueText: (0, pg_core_1.text)('value_text'), // Plain text content
    structuredJson: (0, pg_core_1.json)('structured_json'), // Structured data representation
    checksum: (0, pg_core_1.text)('checksum'), // Content integrity check
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('draft').notNull(),
    // draft, review, approved, published
    createdBy: (0, pg_core_1.integer)('created_by').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    statusIdx: (0, pg_core_1.index)('section_leaves_status_idx').on(table.status),
    checksumIdx: (0, pg_core_1.index)('section_leaves_checksum_idx').on(table.checksum),
    orgIdx: (0, pg_core_1.index)('section_leaves_org_idx').on(table.organizationId),
}); });
// Patches table - Track all changes
exports.patches = (0, pg_core_1.pgTable)('patches', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    leafId: (0, pg_core_1.integer)('leaf_id')
        .notNull()
        .references(function () { return exports.sectionLeaves.id; }),
    version: (0, pg_core_1.integer)('version').notNull().default(1),
    authorId: (0, pg_core_1.integer)('author_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
    diffOps: (0, pg_core_1.json)('diff_ops'), // JSON array of diff operations
    snapshot: (0, pg_core_1.text)('snapshot'), // Full content snapshot at this version
    reason: (0, pg_core_1.text)('reason'), // Change reason/comment
    changeType: (0, pg_core_1.varchar)('change_type', { length: 50 }), // edit, review, approval, revert
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    leafVersionIdx: (0, pg_core_1.uniqueIndex)('patch_leaf_version_idx').on(table.leafId, table.version),
    leafIdx: (0, pg_core_1.index)('patch_leaf_idx').on(table.leafId),
    authorIdx: (0, pg_core_1.index)('patch_author_idx').on(table.authorId),
    patchTimestampIdx: (0, pg_core_1.index)('patch_timestamp_idx').on(table.timestamp),
    changeTypeIdx: (0, pg_core_1.index)('patch_change_type_idx').on(table.changeType),
}); });
// Link Edges table - Define section relationships
exports.linkEdges = (0, pg_core_1.pgTable)('link_edges', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sourceSectionId: (0, pg_core_1.integer)('source_section_id')
        .notNull()
        .references(function () { return exports.sections.id; }),
    targetSectionId: (0, pg_core_1.integer)('target_section_id')
        .notNull()
        .references(function () { return exports.sections.id; }),
    linkType: (0, pg_core_1.varchar)('link_type', { length: 50 }).notNull(),
    // depends_on, duplicates, derived_from, references, supersedes
    strength: (0, pg_core_1.real)('strength').default(1.0), // Link strength/weight
    bidirectional: (0, pg_core_1.boolean)('bidirectional').default(false),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    sourceTargetIdx: (0, pg_core_1.uniqueIndex)('link_edge_source_target_idx').on(table.sourceSectionId, table.targetSectionId, table.linkType),
    sourceIdx: (0, pg_core_1.index)('link_edge_source_idx').on(table.sourceSectionId),
    targetIdx: (0, pg_core_1.index)('link_edge_target_idx').on(table.targetSectionId),
    linkTypeIdx: (0, pg_core_1.index)('link_edge_type_idx').on(table.linkType),
}); });
// Sync Status table - Track synchronization state
exports.syncStatus = (0, pg_core_1.pgTable)('sync_status', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 50 }).notNull(),
    // section, document, leaf, patch
    entityId: (0, pg_core_1.integer)('entity_id').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(),
    // pending, syncing, synced, failed, conflict
    lastError: (0, pg_core_1.text)('last_error'),
    lastPropagationTimestamp: (0, pg_core_1.timestamp)('last_propagation_timestamp'),
    syncDirection: (0, pg_core_1.varchar)('sync_direction', { length: 20 }),
    // upstream, downstream, bidirectional
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    nextRetryAt: (0, pg_core_1.timestamp)('next_retry_at'),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    syncEntityIdx: (0, pg_core_1.uniqueIndex)('sync_status_entity_idx').on(table.entityType, table.entityId),
    syncStatusIdx: (0, pg_core_1.index)('sync_status_status_idx').on(table.status),
    nextRetryIdx: (0, pg_core_1.index)('sync_status_next_retry_idx').on(table.nextRetryAt),
    syncOrgIdx: (0, pg_core_1.index)('sync_status_org_idx').on(table.organizationId),
}); });
// ============================================================================
// INTEGRATION TABLES
// ============================================================================
// Staff Assignments table - Track who owns what
exports.staffAssignments = (0, pg_core_1.pgTable)('staff_assignments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 50 }).notNull(),
    // section, document, project, module, task
    entityId: (0, pg_core_1.integer)('entity_id').notNull(),
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(),
    // owner, editor, reviewer, approver, viewer
    permissions: (0, pg_core_1.json)('permissions'), // Detailed permission settings
    assignedAt: (0, pg_core_1.timestamp)('assigned_at').defaultNow().notNull(),
    assignedBy: (0, pg_core_1.integer)('assigned_by').references(function () { return exports.users.id; }),
    validFrom: (0, pg_core_1.timestamp)('valid_from').defaultNow().notNull(),
    validUntil: (0, pg_core_1.timestamp)('valid_until'),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    staffEntityUserIdx: (0, pg_core_1.uniqueIndex)('staff_assignment_entity_user_idx').on(table.entityType, table.entityId, table.userId, table.role),
    staffEntityIdx: (0, pg_core_1.index)('staff_assignment_entity_idx').on(table.entityType, table.entityId),
    staffUserIdx: (0, pg_core_1.index)('staff_assignment_user_idx').on(table.userId),
    staffRoleIdx: (0, pg_core_1.index)('staff_assignment_role_idx').on(table.role),
    staffActiveIdx: (0, pg_core_1.index)('staff_assignment_active_idx').on(table.isActive),
}); });
// ============================================================================
// INSERT SCHEMAS FOR SECTION GRAPH
// ============================================================================
exports.insertSectionGraphNodeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectionGraphNodes).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDocumentSectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentSections).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSectionLeafSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectionLeaves).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertPatchSchema = (0, drizzle_zod_1.createInsertSchema)(exports.patches).omit({
    id: true,
    createdAt: true,
});
exports.insertLinkEdgeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.linkEdges).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSyncStatusSchema = (0, drizzle_zod_1.createInsertSchema)(exports.syncStatus).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertStaffAssignmentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.staffAssignments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * ======================================================================================
 * IND WIZARD, TEMPLATES & WORKFLOW MANAGEMENT SYSTEM
 * ======================================================================================
 *
 * Complete system for IND wizard projects, eCTD templates, and workflow progress
 * with real database persistence for production use.
 */
/**
 * IND Projects Table
 *
 * Stores IND wizard projects with all metadata and progress tracking.
 */
exports.indProjects = (0, pg_core_1.pgTable)('ind_projects', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    projectId: (0, pg_core_1.text)('project_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    // Project Information
    name: (0, pg_core_1.text)('name').notNull(),
    drugName: (0, pg_core_1.text)('drug_name').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    sponsor: (0, pg_core_1.text)('sponsor').notNull(),
    phase: (0, pg_core_1.text)('phase').notNull(), // Phase I, Phase II, Phase III, etc.
    targetSubmissionDate: (0, pg_core_1.timestamp)('target_submission_date'),
    // Status and Progress
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in-progress, submitted, approved, rejected
    stage: (0, pg_core_1.text)('stage').default('preparation').notNull(), // preparation, review, submission, complete
    progress: (0, pg_core_1.integer)('progress').default(0).notNull(), // 0-100
    currentStep: (0, pg_core_1.integer)('current_step').default(1).notNull(),
    // Project Data
    projectData: (0, pg_core_1.json)('project_data').notNull(), // Full project metadata
    stepData: (0, pg_core_1.json)('step_data').notNull(), // Data for each wizard step
    sections: (0, pg_core_1.json)('sections').notNull(), // Section completion status
    // CMC and CSR Integration
    cmcData: (0, pg_core_1.json)('cmc_data'),
    csrData: (0, pg_core_1.json)('csr_data'),
    analyticsData: (0, pg_core_1.json)('analytics_data'),
    // Compliance and AI
    complianceScore: (0, pg_core_1.integer)('compliance_score').default(0),
    aiCapabilities: (0, pg_core_1.json)('ai_capabilities'),
    deficiencies: (0, pg_core_1.json)('deficiencies'),
    // User and Timestamps
    ownerId: (0, pg_core_1.integer)('owner_id').references(function () { return exports.users.id; }),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
}, function (table) { return ({
    projectIdIdx: (0, pg_core_1.index)('ind_project_id_idx').on(table.projectId),
    orgIdx: (0, pg_core_1.index)('ind_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('ind_status_idx').on(table.status),
}); });
/**
 * IND Templates Table
 *
 * Stores IND/eCTD document templates specifically for IND wizard and CoAuthor modules.
 */
exports.indTemplates = (0, pg_core_1.pgTable)('ind_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    templateId: (0, pg_core_1.text)('template_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; }),
    // Template Information
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    category: (0, pg_core_1.text)('category').notNull(), // ectd, ind, clinical, regulatory, etc.
    type: (0, pg_core_1.text)('type').notNull(), // FDA, EMA, PMDA, generic, etc.
    region: (0, pg_core_1.text)('region'), // US, EU, JP, etc.
    // Template Content
    content: (0, pg_core_1.text)('content'), // Template content/structure
    sections: (0, pg_core_1.json)('sections'), // Section definitions
    blocks: (0, pg_core_1.json)('blocks'), // Content blocks/atoms
    metadata: (0, pg_core_1.json)('metadata'), // Additional template metadata
    // Configuration
    validationRules: (0, pg_core_1.json)('validation_rules'), // ICH-compliant validation rules
    requiredFields: (0, pg_core_1.json)('required_fields'),
    defaultValues: (0, pg_core_1.json)('default_values'),
    // Status and Version
    status: (0, pg_core_1.text)('status').default('active').notNull(), // draft, active, deprecated
    version: (0, pg_core_1.text)('version').default('1.0.0').notNull(),
    isPublic: (0, pg_core_1.boolean)('is_public').default(false).notNull(),
    // Usage Tracking
    usageCount: (0, pg_core_1.integer)('usage_count').default(0),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at'),
    // User and Timestamps
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    updatedById: (0, pg_core_1.integer)('updated_by_id').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    templateIdIdx: (0, pg_core_1.index)('ind_template_id_idx').on(table.templateId),
    categoryIdx: (0, pg_core_1.index)('ind_template_category_idx').on(table.category),
    typeIdx: (0, pg_core_1.index)('ind_template_type_idx').on(table.type),
    statusIdx: (0, pg_core_1.index)('ind_template_status_idx').on(table.status),
}); });
/**
 * Workflow Progress Table
 *
 * Tracks workflow progress and state for various modules.
 */
exports.workflowProgress = (0, pg_core_1.pgTable)('workflow_progress', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    workflowId: (0, pg_core_1.text)('workflow_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    // Workflow Information
    module: (0, pg_core_1.text)('module').notNull(), // ind-wizard, coauthor, cmc, etc.
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // project, document, report, etc.
    entityId: (0, pg_core_1.text)('entity_id').notNull(), // ID of the entity
    // Progress State
    currentState: (0, pg_core_1.json)('current_state').notNull(), // Complete workflow state
    completedSteps: (0, pg_core_1.json)('completed_steps'), // Array of completed step IDs
    pendingSteps: (0, pg_core_1.json)('pending_steps'), // Array of pending step IDs
    progressPercentage: (0, pg_core_1.integer)('progress_percentage').default(0),
    // Session Management
    sessionId: (0, pg_core_1.text)('session_id'),
    lastActivityAt: (0, pg_core_1.timestamp)('last_activity_at').defaultNow().notNull(),
    resumeData: (0, pg_core_1.json)('resume_data'), // Data to resume workflow
    // Status
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, paused, completed, abandoned
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    // User and Timestamps
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    workflowIdIdx: (0, pg_core_1.index)('workflow_id_idx').on(table.workflowId),
    entityIdx: (0, pg_core_1.index)('workflow_entity_idx').on(table.entityType, table.entityId),
    userIdx: (0, pg_core_1.index)('workflow_user_idx').on(table.userId),
    statusIdx: (0, pg_core_1.index)('workflow_status_idx').on(table.status),
}); });
/**
 * Template Usage Log Table
 *
 * Tracks template usage for analytics and optimization.
 */
exports.indTemplateUsageLogs = (0, pg_core_1.pgTable)('ind_template_usage_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    templateId: (0, pg_core_1.text)('template_id')
        .notNull()
        .references(function () { return exports.indTemplates.templateId; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .references(function () { return exports.organizations.id; }),
    // Usage Information
    usedBy: (0, pg_core_1.integer)('used_by').references(function () { return exports.users.id; }),
    usedForEntity: (0, pg_core_1.text)('used_for_entity'), // Entity type it was used for
    usedForEntityId: (0, pg_core_1.text)('used_for_entity_id'), // Entity ID
    generatedDocumentId: (0, pg_core_1.text)('generated_document_id'),
    // Metrics
    timeSpent: (0, pg_core_1.integer)('time_spent'), // Time spent in seconds
    changesCount: (0, pg_core_1.integer)('changes_count'), // Number of changes made
    completionScore: (0, pg_core_1.integer)('completion_score'), // How complete was the template used
    // Feedback
    userRating: (0, pg_core_1.integer)('user_rating'), // 1-5 rating
    feedback: (0, pg_core_1.text)('feedback'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
/**
 * IND Submissions Table
 *
 * Central submission tracking table that links IND projects to eCTD documents.
 * Provides unified workflow tracking and session persistence.
 */
exports.indSubmissions = (0, pg_core_1.pgTable)('ind_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    submissionId: (0, pg_core_1.text)('submission_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    // Session Management
    sessionId: (0, pg_core_1.text)('session_id'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    // IND Project Link
    indProjectId: (0, pg_core_1.text)('ind_project_id').references(function () { return exports.indProjects.projectId; }),
    // Phase Tracking
    currentPhase: (0, pg_core_1.text)('current_phase').default('ind-wizard').notNull(), // ind-wizard, ectd-coauthor, submission-review
    phases: (0, pg_core_1.json)('phases').notNull(), // { ind-wizard: { status, completedAt }, ectd-coauthor: { status, completedAt } }
    // Product Information (Core Data)
    drugName: (0, pg_core_1.text)('drug_name').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    sponsor: (0, pg_core_1.text)('sponsor').notNull(),
    phase: (0, pg_core_1.text)('phase').notNull(), // Phase I, II, III
    targetSubmissionDate: (0, pg_core_1.timestamp)('target_submission_date'),
    // IND Wizard Progress
    indWizardStatus: (0, pg_core_1.text)('ind_wizard_status').default('draft').notNull(), // draft, in-progress, completed
    indStepsCompleted: (0, pg_core_1.json)('ind_steps_completed').notNull(), // { step1: true, step2: true, ... }
    indStepData: (0, pg_core_1.json)('ind_step_data').notNull(), // Complete data from all 7 steps
    // eCTD Co-Author Progress
    ectdStatus: (0, pg_core_1.text)('ectd_status').default('not-started').notNull(), // not-started, in-progress, completed
    ectdModulesCompleted: (0, pg_core_1.json)('ectd_modules_completed'), // { module2: true, module3: false, ... }
    ectdDocumentIds: (0, pg_core_1.json)('ectd_document_ids'), // Array of document IDs created
    // Data Handoff Summary (Generated at IND Step 7)
    submissionSummary: (0, pg_core_1.json)('submission_summary'), // Summary data for eCTD templates
    module2Data: (0, pg_core_1.json)('module_2_data'), // Quality/CMC data
    module3Data: (0, pg_core_1.json)('module_3_data'), // Manufacturing data
    module5Data: (0, pg_core_1.json)('module_5_data'), // Clinical protocol data
    // Regulatory and Compliance
    regulatoryStrategy: (0, pg_core_1.text)('regulatory_strategy'),
    complianceScore: (0, pg_core_1.integer)('compliance_score').default(0),
    deficiencies: (0, pg_core_1.json)('deficiencies'),
    // User and Timestamps
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at'),
}, function (table) { return ({
    submissionIdIdx: (0, pg_core_1.index)('submission_id_idx').on(table.submissionId),
    sessionIdIdx: (0, pg_core_1.index)('session_id_idx').on(table.sessionId),
    indProjectIdIdx: (0, pg_core_1.index)('submission_ind_project_idx').on(table.indProjectId),
    orgIdx: (0, pg_core_1.index)('submission_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('submission_status_idx').on(table.indWizardStatus, table.ectdStatus),
}); });
// ==========================================================================================
// ECTD CO-AUTHOR TABLES
// ==========================================================================================
// Tables for eCTD Co-Author module - section management, canvas layout, and annotations
exports.coauthorSections = (0, pg_core_1.pgTable)('coauthor_sections', {
    id: (0, pg_core_1.serial)('id').primaryKey(), // Surrogate primary key for multi-tenant support
    sectionId: (0, pg_core_1.varchar)('section_id').notNull(), // e.g., '1.1', '2.7', '3.2' (not unique globally)
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    sessionId: (0, pg_core_1.varchar)('session_id'), // Links to IND session if applicable
    submissionId: (0, pg_core_1.varchar)('submission_id'), // Links to submission
    // Section Information
    title: (0, pg_core_1.text)('title').notNull(), // e.g., 'Module 1: Admin'
    moduleNumber: (0, pg_core_1.text)('module_number'), // e.g., '1', '2', '3', '4', '5'
    sectionType: (0, pg_core_1.text)('section_type'), // administrative, quality, nonclinical, clinical
    // Canvas Position
    x: (0, pg_core_1.integer)('x').notNull().default(50), // X coordinate on canvas
    y: (0, pg_core_1.integer)('y').notNull().default(50), // Y coordinate on canvas
    // Status and Workflow
    status: (0, pg_core_1.text)('status').notNull().default('pending'), // pending, in-progress, complete, critical, review
    connections: (0, pg_core_1.json)('connections').default([]), // Array of section IDs this connects to
    // Metadata
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('coauthor_section_org_idx').on(table.organizationId),
    sessionIdx: (0, pg_core_1.index)('coauthor_section_session_idx').on(table.sessionId),
    submissionIdx: (0, pg_core_1.index)('coauthor_section_submission_idx').on(table.submissionId),
    statusIdx: (0, pg_core_1.index)('coauthor_section_status_idx').on(table.status),
    sectionOrgUnique: (0, pg_core_1.uniqueIndex)('coauthor_section_lookup_idx').on(table.sectionId, table.organizationId),
}); });
exports.coauthorAnnotations = (0, pg_core_1.pgTable)('coauthor_annotations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sectionId: (0, pg_core_1.integer)('section_id')
        .notNull()
        .references(function () { return exports.coauthorSections.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Annotation Content
    notes: (0, pg_core_1.text)('notes').notNull(), // The actual annotation text
    // AI-Generated Advice
    aiAdvice: (0, pg_core_1.text)('ai_advice'), // AI-generated suggestions for this section
    adviceGeneratedAt: (0, pg_core_1.timestamp)('advice_generated_at'),
    // Metadata
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    sectionIdx: (0, pg_core_1.index)('coauthor_annotation_section_idx').on(table.sectionId),
    orgIdx: (0, pg_core_1.index)('coauthor_annotation_org_idx').on(table.organizationId),
}); });
/**
 * eCTD Co-Author Documents Table
 *
 * Stores documents created/edited in the eCTD Co-Author module
 */
exports.coauthorDocuments = (0, pg_core_1.pgTable)('coauthor_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Document Information
    title: (0, pg_core_1.text)('title').notNull(),
    content: (0, pg_core_1.text)('content'), // HTML content from TipTap editor
    sections: (0, pg_core_1.json)('sections'), // JSONB field containing module, version, and other information
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in-progress, review, approved, finalized
    templateId: (0, pg_core_1.integer)('template_id'), // Template reference
    // User tracking and metadata
    createdBy: (0, pg_core_1.text)('created_by'), // User who created the document
    clientWorkspace: (0, pg_core_1.text)('client_workspace'), // Client workspace
    completionPercentage: (0, pg_core_1.integer)('completion_percentage'), // Document completion percentage
    regulatoryComplianceScore: (0, pg_core_1.integer)('regulatory_compliance_score'), // Compliance score
    metadata: (0, pg_core_1.json)('metadata'), // Additional document-specific metadata
    // eCTD Module association
    ectdModuleId: (0, pg_core_1.integer)('ectd_module_id').references(function () { return exports.ectdModules.id; }),
    moduleNumber: (0, pg_core_1.text)('module_number'), // e.g., "3.2.S.4.1" for quick lookups
    moduleName: (0, pg_core_1.text)('module_name'), // Cached module name for display
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('coauthor_document_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('coauthor_document_status_idx').on(table.status),
    moduleIdx: (0, pg_core_1.index)('coauthor_document_module_idx').on(table.ectdModuleId),
    moduleNumberIdx: (0, pg_core_1.index)('coauthor_document_module_number_idx').on(table.moduleNumber),
}); });
/**
 * Co-Author Document Versions Table
 *
 * Stores version history for eCTD Co-Author documents
 * Each version represents a snapshot of the document at a specific point in time
 */
exports.coauthorDocumentVersions = (0, pg_core_1.pgTable)('coauthor_document_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.coauthorDocuments.id; }),
    versionNumber: (0, pg_core_1.integer)('version_number').notNull(),
    content: (0, pg_core_1.text)('content'), // Full HTML content at this version
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.text)('created_by'), // User ID as text
    changeSummary: (0, pg_core_1.text)('change_summary'), // What changed in this version
}, function (table) { return ({
    documentIdx: (0, pg_core_1.index)('coauthor_version_document_idx').on(table.documentId),
    versionIdx: (0, pg_core_1.index)('coauthor_version_number_idx').on(table.documentId, table.versionNumber),
    createdAtIdx: (0, pg_core_1.index)('coauthor_version_created_idx').on(table.createdAt),
    // Ensure unique version numbers per document
    uniqueDocumentVersion: (0, pg_core_1.unique)('unique_document_version').on(table.documentId, table.versionNumber),
}); });
/**
 * Co-Author Document Status History Table
 *
 * Tracks all status transitions for eCTD Co-Author documents
 * Provides audit trail for document lifecycle management
 */
exports.coauthorStatusHistory = (0, pg_core_1.pgTable)('coauthor_status_history', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.coauthorDocuments.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Status Transition Information
    fromStatus: (0, pg_core_1.text)('from_status'), // null for initial status
    toStatus: (0, pg_core_1.text)('to_status').notNull(), // draft, in-review, approved, published
    // Change Context
    reason: (0, pg_core_1.text)('reason'), // Reason for status change
    comments: (0, pg_core_1.text)('comments'), // Additional comments or feedback
    // For approval workflow
    isApproval: (0, pg_core_1.boolean)('is_approval').default(false), // Whether this is an approval action
    approvalLevel: (0, pg_core_1.text)('approval_level'), // Level of approval if applicable (e.g., 'manager', 'director', 'fda')
    // User Information
    changedById: (0, pg_core_1.integer)('changed_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    changedByName: (0, pg_core_1.text)('changed_by_name').notNull(), // Store name for display even if user is deleted
    changedByRole: (0, pg_core_1.text)('changed_by_role'), // User's role at time of change
    // Email Notification Tracking
    notificationSent: (0, pg_core_1.boolean)('notification_sent').default(false),
    notificationSentAt: (0, pg_core_1.timestamp)('notification_sent_at'),
    notificationRecipients: (0, pg_core_1.json)('notification_recipients'), // Array of email addresses
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'), // Additional context-specific data
    changedAt: (0, pg_core_1.timestamp)('changed_at').defaultNow().notNull(),
}, function (table) { return ({
    documentIdx: (0, pg_core_1.index)('coauthor_status_document_idx').on(table.documentId),
    orgIdx: (0, pg_core_1.index)('coauthor_status_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('coauthor_status_to_idx').on(table.toStatus),
    changedByIdx: (0, pg_core_1.index)('coauthor_status_changed_by_idx').on(table.changedById),
    changedAtIdx: (0, pg_core_1.index)('coauthor_status_changed_at_idx').on(table.changedAt),
}); });
/**
 * Component Content Management System (CCMS) Tables
 * For granular component-based storage and versioning
 */
/**
 * Components Table - Single Source of Truth for reusable content
 */
exports.components = (0, pg_core_1.pgTable)('components', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Unique Document Identifier
    udi: (0, pg_core_1.varchar)('udi', { length: 255 }).notNull(), // e.g., "3.2.S.4.1-paragraph-a1b2c3d4"
    // Component Information
    type: (0, pg_core_1.text)('type').notNull(), // heading, paragraph, table, list, figure, cross-reference
    level: (0, pg_core_1.integer)('level'), // For headings: 1-6
    content: (0, pg_core_1.json)('content').notNull(), // The actual content (text, structured data for tables, etc.)
    // Regulatory Context
    moduleContext: (0, pg_core_1.text)('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: (0, pg_core_1.text)('section_number'), // e.g., "3.2.S.4.1"
    // Metadata
    sourceFile: (0, pg_core_1.text)('source_file'), // Original file this was extracted from
    extractedAt: (0, pg_core_1.timestamp)('extracted_at').notNull(),
    wordCount: (0, pg_core_1.integer)('word_count'),
    checksum: (0, pg_core_1.text)('checksum'), // For detecting changes
    // Usage tracking
    usageCount: (0, pg_core_1.integer)('usage_count').default(0), // How many documents use this
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at'),
    // Status
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, deprecated, archived
    tags: (0, pg_core_1.json)('tags'), // Array of tags for categorization
    // eCTD 4.0 Priority Number for display order management
    priorityNumber: (0, pg_core_1.integer)('priority_number').default(0),
    displayOrder: (0, pg_core_1.integer)('display_order').default(0),
    // Context of Use (COU) - Mandate Section 2.2
    contextOfUse: (0, pg_core_1.text)('context_of_use'), // Regulatory purpose: clinical, quality, nonclinical, administrative
    contextGroup: (0, pg_core_1.text)('context_group'), // Combined COU + keywords for eCTD placement
    controlledVocabulary: (0, pg_core_1.json)('controlled_vocabulary'), // Enforced metadata terms
    // Lifecycle Management (LCM) - eCTD 4.0
    lifecycleState: (0, pg_core_1.text)('lifecycle_state').default('new'), // new, replace, delete
    replacedUdi: (0, pg_core_1.text)('replaced_udi'), // UDI of component being replaced
    replacementMapping: (0, pg_core_1.json)('replacement_mapping'), // 1-to-N replacement relationships
    // Source Data Reference - Mandate Table 2
    sourceDataReference: (0, pg_core_1.json)('source_data_reference'), // Links to LIMS, CDISC, raw data
    dataTraceability: (0, pg_core_1.json)('data_traceability'), // Full lineage tracking
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('component_org_idx').on(table.organizationId),
    udiIdx: (0, pg_core_1.uniqueIndex)('component_udi_idx').on(table.udi, table.organizationId),
    typeIdx: (0, pg_core_1.index)('component_type_idx').on(table.type),
    moduleIdx: (0, pg_core_1.index)('component_module_idx').on(table.moduleContext),
    statusIdx: (0, pg_core_1.index)('component_status_idx').on(table.status),
    priorityIdx: (0, pg_core_1.index)('component_priority_idx').on(table.priorityNumber),
    displayOrderIdx: (0, pg_core_1.index)('component_display_order_idx').on(table.displayOrder),
    contextOfUseIdx: (0, pg_core_1.index)('component_context_of_use_idx').on(table.contextOfUse),
    lifecycleStateIdx: (0, pg_core_1.index)('component_lifecycle_state_idx').on(table.lifecycleState),
}); });
/**
 * Component Versions Table - Version history for each component
 */
exports.componentVersions = (0, pg_core_1.pgTable)('component_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    componentId: (0, pg_core_1.integer)('component_id')
        .notNull()
        .references(function () { return exports.components.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Version Information
    versionNumber: (0, pg_core_1.integer)('version_number').notNull(),
    versionLabel: (0, pg_core_1.text)('version_label'), // e.g., "FDA Comments Addressed"
    // Content at this version
    content: (0, pg_core_1.json)('content').notNull(),
    diff: (0, pg_core_1.json)('diff'), // Changes from previous version
    // Change tracking
    changeDescription: (0, pg_core_1.text)('change_description'),
    changeType: (0, pg_core_1.text)('change_type'), // minor, major, formatting
    // Compliance
    complianceStatus: (0, pg_core_1.text)('compliance_status'), // compliant, needs-review, non-compliant
    complianceNotes: (0, pg_core_1.text)('compliance_notes'),
    validatedAgainst: (0, pg_core_1.json)('validated_against'), // List of regulations checked
    // User tracking
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    createdByName: (0, pg_core_1.text)('created_by_name'),
    approvedById: (0, pg_core_1.integer)('approved_by_id').references(function () { return exports.users.id; }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    componentIdx: (0, pg_core_1.index)('component_version_comp_idx').on(table.componentId),
    versionIdx: (0, pg_core_1.uniqueIndex)('component_version_unique_idx').on(table.componentId, table.versionNumber),
    createdAtIdx: (0, pg_core_1.index)('component_version_created_idx').on(table.createdAt),
}); });
/**
 * Document Components Table - Links documents to their components
 */
exports.documentComponents = (0, pg_core_1.pgTable)('document_components', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    documentId: (0, pg_core_1.integer)('document_id')
        .notNull()
        .references(function () { return exports.coauthorDocuments.id; }, { onDelete: 'cascade' }),
    componentId: (0, pg_core_1.integer)('component_id')
        .notNull()
        .references(function () { return exports.components.id; }),
    componentVersionId: (0, pg_core_1.integer)('component_version_id')
        .references(function () { return exports.componentVersions.id; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Position and structure
    position: (0, pg_core_1.integer)('position').notNull(), // Order in document
    parentComponentId: (0, pg_core_1.integer)('parent_component_id'), // For nested components
    depth: (0, pg_core_1.integer)('depth').default(0), // Nesting level
    // Override content (if different from component)
    overrideContent: (0, pg_core_1.json)('override_content'),
    isOverridden: (0, pg_core_1.boolean)('is_overridden').default(false),
    // Locking
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false),
    lockedById: (0, pg_core_1.integer)('locked_by_id').references(function () { return exports.users.id; }),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    lockReason: (0, pg_core_1.text)('lock_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    documentIdx: (0, pg_core_1.index)('doc_component_doc_idx').on(table.documentId),
    componentIdx: (0, pg_core_1.index)('doc_component_comp_idx').on(table.componentId),
    positionIdx: (0, pg_core_1.index)('doc_component_position_idx').on(table.documentId, table.position),
    lockedIdx: (0, pg_core_1.index)('doc_component_locked_idx').on(table.isLocked),
}); });
/**
 * Component Cross References Table - Track component relationships
 */
exports.componentCrossReferences = (0, pg_core_1.pgTable)('component_cross_references', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    sourceComponentId: (0, pg_core_1.integer)('source_component_id')
        .notNull()
        .references(function () { return exports.components.id; }, { onDelete: 'cascade' }),
    targetComponentId: (0, pg_core_1.integer)('target_component_id')
        .notNull()
        .references(function () { return exports.components.id; }, { onDelete: 'cascade' }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Reference Information
    referenceType: (0, pg_core_1.text)('reference_type').notNull(), // see-also, based-on, supersedes, related
    referenceText: (0, pg_core_1.text)('reference_text'), // The text that creates the reference
    // Validation
    isValid: (0, pg_core_1.boolean)('is_valid').default(true),
    validatedAt: (0, pg_core_1.timestamp)('validated_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    sourceIdx: (0, pg_core_1.index)('cross_ref_source_idx').on(table.sourceComponentId),
    targetIdx: (0, pg_core_1.index)('cross_ref_target_idx').on(table.targetComponentId),
    typeIdx: (0, pg_core_1.index)('cross_ref_type_idx').on(table.referenceType),
}); });
/**
 * Component Sequence References Table
 * Tracks UDI usage across eCTD sequences for cross-sequence component referencing
 * Implements eCTD 4.0 requirement: "UDI enables documents to be referenced and reused
 * across different submission units or sequences without physically resubmitting the file"
 */
exports.componentSequenceReferences = (0, pg_core_1.pgTable)('component_sequence_references', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Component being referenced
    componentId: (0, pg_core_1.integer)('component_id')
        .notNull()
        .references(function () { return exports.components.id; }, { onDelete: 'cascade' }),
    componentVersionId: (0, pg_core_1.integer)('component_version_id')
        .references(function () { return exports.componentVersions.id; }),
    udi: (0, pg_core_1.varchar)('udi', { length: 255 }).notNull(), // Denormalized for fast lookups
    // Sequence/Submission information
    sequenceNumber: (0, pg_core_1.text)('sequence_number').notNull(), // e.g., "SN0001", "SN0013"
    submissionId: (0, pg_core_1.integer)('submission_id'), // Reference to submission if exists
    applicationNumber: (0, pg_core_1.text)('application_number'), // IND number, NDA number, etc.
    // Document context where this component was used
    documentId: (0, pg_core_1.integer)('document_id')
        .references(function () { return exports.coauthorDocuments.id; }, { onDelete: 'set null' }),
    documentTitle: (0, pg_core_1.text)('document_title'),
    moduleContext: (0, pg_core_1.text)('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: (0, pg_core_1.text)('section_number'), // e.g., "3.2.S.4.1"
    // eCTD 4.0 Lifecycle management
    ectdOperation: (0, pg_core_1.text)('ectd_operation'), // new, replace, delete, append
    replacedUdi: (0, pg_core_1.varchar)('replaced_udi', { length: 255 }), // UDI of component this replaces
    // Tracking
    firstUsedInSequence: (0, pg_core_1.boolean)('first_used_in_sequence').default(false), // Is this the first time in this sequence?
    reusedFromSequence: (0, pg_core_1.text)('reused_from_sequence'), // Which sequence was it originally from?
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    componentIdx: (0, pg_core_1.index)('seq_ref_component_idx').on(table.componentId),
    udiIdx: (0, pg_core_1.index)('seq_ref_udi_idx').on(table.udi),
    sequenceIdx: (0, pg_core_1.index)('seq_ref_sequence_idx').on(table.sequenceNumber),
    orgIdx: (0, pg_core_1.index)('seq_ref_org_idx').on(table.organizationId),
    documentIdx: (0, pg_core_1.index)('seq_ref_document_idx').on(table.documentId),
    moduleIdx: (0, pg_core_1.index)('seq_ref_module_idx').on(table.moduleContext),
    // Composite index for "where is this UDI used?" queries
    udiSequenceIdx: (0, pg_core_1.index)('seq_ref_udi_sequence_idx').on(table.udi, table.sequenceNumber),
}); });
// Component Sequence References Insert Schema
exports.insertComponentSequenceReferenceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.componentSequenceReferences).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
/**
 * Document Vectors Table - Semantic embeddings for RAG/Search
 * Implements Phase 3 Regulatory Intelligence Layer requirements
 */
exports.documentVectors = (0, pg_core_1.pgTable)('document_vectors', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Source references
    componentId: (0, pg_core_1.integer)('component_id')
        .references(function () { return exports.components.id; }, { onDelete: 'cascade' }),
    componentVersionId: (0, pg_core_1.integer)('component_version_id')
        .references(function () { return exports.componentVersions.id; }, { onDelete: 'cascade' }),
    documentId: (0, pg_core_1.integer)('document_id')
        .references(function () { return exports.coauthorDocuments.id; }, { onDelete: 'cascade' }),
    // Chunk information
    chunkText: (0, pg_core_1.text)('chunk_text').notNull(), // The actual text that was embedded
    chunkIndex: (0, pg_core_1.integer)('chunk_index').notNull().default(0), // Position in source
    chunkSize: (0, pg_core_1.integer)('chunk_size').notNull(), // Number of tokens
    // Embedding data - proper pgvector support
    embedding: vector('embedding', { dimensions: 3072 }), // OpenAI text-embedding-3-large (3072 dimensions)
    embeddingModel: (0, pg_core_1.text)('embedding_model').notNull().default('text-embedding-3-large'),
    // Regulatory context
    moduleContext: (0, pg_core_1.text)('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: (0, pg_core_1.text)('section_number'), // e.g., "3.2.S.4.1"
    regulatoryEntities: (0, pg_core_1.json)('regulatory_entities'), // NER-extracted entities
    // Metadata for RAG
    metadata: (0, pg_core_1.json)('metadata'), // Additional context for retrieval
    tags: (0, pg_core_1.text)('tags').array(), // Searchable tags
    // Performance and tracking
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    lastAccessedAt: (0, pg_core_1.timestamp)('last_accessed_at'),
    accessCount: (0, pg_core_1.integer)('access_count').default(0),
}, function (table) { return ({
    // HNSW index for fast similarity search (will be created via raw SQL)
    componentIdx: (0, pg_core_1.index)('doc_vector_component_idx').on(table.componentId),
    documentIdx: (0, pg_core_1.index)('doc_vector_document_idx').on(table.documentId),
    moduleIdx: (0, pg_core_1.index)('doc_vector_module_idx').on(table.moduleContext),
    createdAtIdx: (0, pg_core_1.index)('doc_vector_created_idx').on(table.createdAt),
}); });
// Document Vectors Insert Schema
exports.insertDocumentVectorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.documentVectors).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastAccessedAt: true,
    accessCount: true,
});
// Co-Author Status History Insert Schema
exports.insertCoauthorStatusHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorStatusHistory).omit({
    id: true,
    changedAt: true,
});
/**
 * eCTD Co-Author Import History Table
 *
 * Tracks imports from IND submissions into eCTD documents with full audit trail
 */
exports.coauthorImportHistory = (0, pg_core_1.pgTable)('coauthor_import_history', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Import Source
    sourceType: (0, pg_core_1.text)('source_type').notNull(), // 'ind_submission', 'ind_document', 'cmc_data', 'csr_data'
    sourceId: (0, pg_core_1.text)('source_id').notNull(), // ID of the source record (submission_id, document_id, etc.)
    indSubmissionId: (0, pg_core_1.text)('ind_submission_id').references(function () { return exports.indSubmissions.submissionId; }),
    // Import Target
    targetDocumentId: (0, pg_core_1.integer)('target_document_id')
        .notNull()
        .references(function () { return exports.coauthorDocuments.id; }, { onDelete: 'cascade' }),
    targetModule: (0, pg_core_1.text)('target_module').notNull(), // e.g., 'Module 2.5', 'Module 2.7'
    // Import Details
    importType: (0, pg_core_1.text)('import_type').notNull(), // 'full', 'partial', 'merge'
    sectionsImported: (0, pg_core_1.json)('sections_imported').notNull(), // Array of section identifiers that were imported
    fieldMappings: (0, pg_core_1.json)('field_mappings').notNull(), // Mapping of source fields to target sections
    // Import Result
    status: (0, pg_core_1.text)('status').notNull(), // 'pending', 'in_progress', 'completed', 'failed'
    progress: (0, pg_core_1.integer)('progress').default(0), // 0-100
    // Content Changes
    contentBefore: (0, pg_core_1.text)('content_before'), // Snapshot of content before import
    contentAfter: (0, pg_core_1.text)('content_after'), // Snapshot of content after import
    changesSummary: (0, pg_core_1.json)('changes_summary'), // Summary of what was changed
    // Data Mapping Configuration
    mappingConfiguration: (0, pg_core_1.json)('mapping_configuration'), // Flexible field mapping rules
    transformationsApplied: (0, pg_core_1.json)('transformations_applied'), // Any transformations applied during import
    // Conflict Resolution
    conflictResolution: (0, pg_core_1.text)('conflict_resolution'), // 'merge', 'overwrite', 'skip'
    conflicts: (0, pg_core_1.json)('conflicts'), // Array of conflicts encountered
    // Error Handling
    errorMessage: (0, pg_core_1.text)('error_message'),
    errorDetails: (0, pg_core_1.json)('error_details'),
    // User Information
    importedById: (0, pg_core_1.integer)('imported_by_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    importedByName: (0, pg_core_1.text)('imported_by_name').notNull(),
    // Timestamps
    startedAt: (0, pg_core_1.timestamp)('started_at').defaultNow().notNull(),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'), // Additional import-specific metadata
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('coauthor_import_org_idx').on(table.organizationId),
    targetDocIdx: (0, pg_core_1.index)('coauthor_import_target_doc_idx').on(table.targetDocumentId),
    sourceIdx: (0, pg_core_1.index)('coauthor_import_source_idx').on(table.sourceType, table.sourceId),
    statusIdx: (0, pg_core_1.index)('coauthor_import_status_idx').on(table.status),
    indSubmissionIdx: (0, pg_core_1.index)('coauthor_import_ind_submission_idx').on(table.indSubmissionId),
    importedByIdx: (0, pg_core_1.index)('coauthor_import_by_idx').on(table.importedById),
    startedAtIdx: (0, pg_core_1.index)('coauthor_import_started_idx').on(table.startedAt),
}); });
// Co-Author Import History Insert Schema
exports.insertCoauthorImportHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorImportHistory).omit({
    id: true,
    startedAt: true,
});
/**
 * ======================================================================================
 * COAUTHOR VALIDATION SYSTEM
 * ======================================================================================
 *
 * Tables for comprehensive validation rules and history tracking
 */
// CoAuthor Validation Rules table - configurable validation rules
exports.coauthorValidationRules = (0, pg_core_1.pgTable)('coauthor_validation_rules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    ruleId: (0, pg_core_1.text)('rule_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    // Module and Section
    module: (0, pg_core_1.text)('module').notNull(), // Module 1, Module 2, Module 3, Module 4, Module 5
    section: (0, pg_core_1.text)('section'), // Specific section within module (e.g., '2.3', '3.2.S.1')
    // Agency-specific rule
    agency: (0, pg_core_1.text)('agency').notNull(), // FDA, EMA, PMDA, HealthCanada, ALL
    // Rule Classification
    category: (0, pg_core_1.text)('category').notNull(), // structure, content, formatting, compliance, completeness
    ruleType: (0, pg_core_1.text)('rule_type').notNull(), // required_section, min_word_count, format_check, terminology, reference_check
    severity: (0, pg_core_1.text)('severity').notNull(), // critical, major, minor, informational
    // Rule Details
    ruleName: (0, pg_core_1.text)('rule_name').notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    checkLogic: (0, pg_core_1.json)('check_logic').notNull(), // JSON containing rule parameters
    remediationText: (0, pg_core_1.text)('remediation_text').notNull(),
    // Auto-fix Capabilities
    autoFixAvailable: (0, pg_core_1.boolean)('auto_fix_available').default(false),
    autoFixLogic: (0, pg_core_1.json)('auto_fix_logic'),
    // Status
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    // Metadata
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    moduleIdx: (0, pg_core_1.index)('validation_rules_module_idx').on(table.module),
    agencyIdx: (0, pg_core_1.index)('validation_rules_agency_idx').on(table.agency),
    severityIdx: (0, pg_core_1.index)('validation_rules_severity_idx').on(table.severity),
    categoryIdx: (0, pg_core_1.index)('validation_rules_category_idx').on(table.category),
    ruleTypeIdx: (0, pg_core_1.index)('validation_rules_type_idx').on(table.ruleType),
}); });
// CoAuthor Validation History table - tracks all validation runs
exports.coauthorValidationHistory = (0, pg_core_1.pgTable)('coauthor_validation_history', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    validationId: (0, pg_core_1.text)('validation_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.integer)('document_id').references(function () { return exports.coauthorDocuments.id; }),
    // Document Context
    documentVersion: (0, pg_core_1.integer)('document_version'),
    module: (0, pg_core_1.text)('module').notNull(),
    agency: (0, pg_core_1.text)('agency').notNull(),
    // Validation Summary
    totalIssues: (0, pg_core_1.integer)('total_issues').default(0),
    criticalIssues: (0, pg_core_1.integer)('critical_issues').default(0),
    majorIssues: (0, pg_core_1.integer)('major_issues').default(0),
    minorIssues: (0, pg_core_1.integer)('minor_issues').default(0),
    informationalIssues: (0, pg_core_1.integer)('informational_issues').default(0),
    // Compliance Scoring
    complianceScore: (0, pg_core_1.real)('compliance_score'), // 0-100 percentage
    passedRules: (0, pg_core_1.integer)('passed_rules').default(0),
    failedRules: (0, pg_core_1.integer)('failed_rules').default(0),
    skippedRules: (0, pg_core_1.integer)('skipped_rules').default(0),
    // Detailed Results
    validationResults: (0, pg_core_1.json)('validation_results').notNull(), // Detailed results with all issues
    // Audit Information
    performedBy: (0, pg_core_1.text)('performed_by').notNull(),
    performedByUserId: (0, pg_core_1.integer)('performed_by_user_id').references(function () { return exports.users.id; }),
    performedAt: (0, pg_core_1.timestamp)('performed_at').defaultNow().notNull(),
    // Export Information
    exportedAt: (0, pg_core_1.timestamp)('exported_at'),
    reportPath: (0, pg_core_1.text)('report_path'),
    reportFormat: (0, pg_core_1.text)('report_format'), // PDF, XLSX, JSON
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'), // Additional validation context
}, function (table) { return ({
    documentIdx: (0, pg_core_1.index)('validation_history_document_idx').on(table.documentId),
    performedAtIdx: (0, pg_core_1.index)('validation_history_performed_idx').on(table.performedAt),
    agencyIdx: (0, pg_core_1.index)('validation_history_agency_idx').on(table.agency),
    complianceIdx: (0, pg_core_1.index)('validation_history_compliance_idx').on(table.complianceScore),
}); });
// Insert schemas for validation system
exports.insertCoauthorValidationRuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorValidationRules).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCoauthorValidationHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorValidationHistory).omit({
    id: true,
    performedAt: true,
});
// ============================================================================
// REGULATORY SUBMISSION CENTER TABLES
// ============================================================================
// Production-ready tables for intelligent task management and stage-gate controls
/**
 * Regulatory Submissions Table
 *
 * Tracks all regulatory submission types (IND, NDA, BLA, MAA, etc.)
 */
exports.regulatorySubmissions = (0, pg_core_1.pgTable)('regulatory_submissions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    submissionId: (0, pg_core_1.text)('submission_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    // Submission Details
    submissionType: (0, pg_core_1.text)('submission_type').notNull(), // IND, NDA, BLA, MAA, ANDA, etc.
    drugName: (0, pg_core_1.text)('drug_name').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    sponsor: (0, pg_core_1.text)('sponsor').notNull(),
    targetMarket: (0, pg_core_1.text)('target_market'), // US, EU, JP, etc.
    // Status and Progress
    status: (0, pg_core_1.text)('status').default('planning').notNull(), // planning, in-progress, under-review, submitted, approved, rejected
    currentGate: (0, pg_core_1.text)('current_gate').default('initiation').notNull(), // initiation, authoring, review, assembly, submission
    progressPercentage: (0, pg_core_1.integer)('progress_percentage').default(0),
    // Dates and Deadlines
    targetSubmissionDate: (0, pg_core_1.timestamp)('target_submission_date').notNull(),
    actualSubmissionDate: (0, pg_core_1.timestamp)('actual_submission_date'),
    regulatoryDeadline: (0, pg_core_1.timestamp)('regulatory_deadline'),
    // Compliance and Risk
    complianceScore: (0, pg_core_1.integer)('compliance_score').default(0),
    riskLevel: (0, pg_core_1.text)('risk_level').default('medium'), // low, medium, high, critical
    priorityLevel: (0, pg_core_1.text)('priority_level').default('normal'), // low, normal, high, urgent
    // Team and Assignment
    leadRegulatory: (0, pg_core_1.integer)('lead_regulatory').references(function () { return exports.users.id; }),
    leadQa: (0, pg_core_1.integer)('lead_qa').references(function () { return exports.users.id; }),
    leadClinical: (0, pg_core_1.integer)('lead_clinical').references(function () { return exports.users.id; }),
    teamMembers: (0, pg_core_1.json)('team_members'), // Array of user IDs
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'), // Additional submission-specific data
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    submissionIdIdx: (0, pg_core_1.index)('reg_submission_id_idx').on(table.submissionId),
    orgIdx: (0, pg_core_1.index)('reg_submission_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('reg_submission_status_idx').on(table.status),
    typeIdx: (0, pg_core_1.index)('reg_submission_type_idx').on(table.submissionType),
    gateIdx: (0, pg_core_1.index)('reg_submission_gate_idx').on(table.currentGate),
}); });
/**
 * Regulatory Tasks Table
 *
 * Individual tasks within a regulatory submission workflow
 */
exports.regulatoryTasks = (0, pg_core_1.pgTable)('regulatory_tasks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    taskId: (0, pg_core_1.text)('task_id').notNull().unique(),
    submissionId: (0, pg_core_1.text)('submission_id')
        .notNull()
        .references(function () { return exports.regulatorySubmissions.submissionId; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Task Details
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    taskType: (0, pg_core_1.text)('task_type').notNull(), // document-preparation, review, approval, data-entry, validation
    category: (0, pg_core_1.text)('category'), // regulatory, clinical, quality, manufacturing, safety
    // Assignment and Ownership
    assignedTo: (0, pg_core_1.integer)('assigned_to').references(function () { return exports.users.id; }),
    assignedBy: (0, pg_core_1.integer)('assigned_by').references(function () { return exports.users.id; }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at'),
    teamId: (0, pg_core_1.integer)('team_id'),
    // Status and Progress
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in-progress, review, completed, blocked, cancelled
    priority: (0, pg_core_1.text)('priority').default('normal').notNull(), // low, normal, high, urgent, critical
    estimatedHours: (0, pg_core_1.real)('estimated_hours'),
    actualHours: (0, pg_core_1.real)('actual_hours'),
    progressPercentage: (0, pg_core_1.integer)('progress_percentage').default(0),
    // Dates and Deadlines
    dueDate: (0, pg_core_1.timestamp)('due_date').notNull(),
    startDate: (0, pg_core_1.timestamp)('start_date'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    // Gate Association
    stageGate: (0, pg_core_1.text)('stage_gate'), // initiation, authoring, review, assembly, submission
    isGatekeeper: (0, pg_core_1.boolean)('is_gatekeeper').default(false), // Task blocks gate progression
    // Documents and Deliverables
    documentIds: (0, pg_core_1.json)('document_ids'), // Array of associated document IDs
    deliverables: (0, pg_core_1.json)('deliverables'), // Expected outputs
    // AI and Automation
    aiPriorityScore: (0, pg_core_1.real)('ai_priority_score'), // AI-calculated priority
    automationStatus: (0, pg_core_1.text)('automation_status'), // manual, semi-automated, automated
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdById: (0, pg_core_1.integer)('created_by_id').references(function () { return exports.users.id; }),
    lastModifiedBy: (0, pg_core_1.integer)('last_modified_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    taskIdIdx: (0, pg_core_1.index)('reg_task_id_idx').on(table.taskId),
    submissionIdx: (0, pg_core_1.index)('reg_task_submission_idx').on(table.submissionId),
    assignedToIdx: (0, pg_core_1.index)('reg_task_assigned_idx').on(table.assignedTo),
    statusIdx: (0, pg_core_1.index)('reg_task_status_idx').on(table.status),
    dueDateIdx: (0, pg_core_1.index)('reg_task_due_date_idx').on(table.dueDate),
    priorityIdx: (0, pg_core_1.index)('reg_task_priority_idx').on(table.priority),
}); });
/**
 * Stage Gates Table
 *
 * Defines the 5 regulatory stage gates and their requirements
 */
exports.stageGates = (0, pg_core_1.pgTable)('stage_gates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    gateId: (0, pg_core_1.text)('gate_id').notNull().unique(),
    submissionId: (0, pg_core_1.text)('submission_id')
        .notNull()
        .references(function () { return exports.regulatorySubmissions.submissionId; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Gate Information
    gateName: (0, pg_core_1.text)('gate_name').notNull(), // Initiation, Authoring, Review, Assembly, Submission
    gateOrder: (0, pg_core_1.integer)('gate_order').notNull(), // 1-5
    description: (0, pg_core_1.text)('description'),
    // Status and Progress
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, in-progress, completed, blocked
    completionPercentage: (0, pg_core_1.integer)('completion_percentage').default(0),
    // Requirements
    requiredTasks: (0, pg_core_1.json)('required_tasks'), // Array of task IDs that must be completed
    requiredDocuments: (0, pg_core_1.json)('required_documents'), // Array of document types required
    requiredApprovals: (0, pg_core_1.json)('required_approvals'), // Array of role-based approvals needed
    exitCriteria: (0, pg_core_1.json)('exit_criteria'), // Conditions to pass the gate
    // Dates
    plannedDate: (0, pg_core_1.timestamp)('planned_date'),
    actualStartDate: (0, pg_core_1.timestamp)('actual_start_date'),
    actualCompletionDate: (0, pg_core_1.timestamp)('actual_completion_date'),
    // Approval Status
    qaApproved: (0, pg_core_1.boolean)('qa_approved').default(false),
    regulatoryApproved: (0, pg_core_1.boolean)('regulatory_approved').default(false),
    clinicalApproved: (0, pg_core_1.boolean)('clinical_approved').default(false),
    finalApproved: (0, pg_core_1.boolean)('final_approved').default(false),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    gateIdIdx: (0, pg_core_1.index)('stage_gate_id_idx').on(table.gateId),
    submissionIdx: (0, pg_core_1.index)('stage_gate_submission_idx').on(table.submissionId),
    statusIdx: (0, pg_core_1.index)('stage_gate_status_idx').on(table.status),
    orderIdx: (0, pg_core_1.index)('stage_gate_order_idx').on(table.gateOrder),
}); });
/**
 * Gate Approvals Table
 *
 * Tracks approvals at each stage gate with e-signatures
 */
exports.gateApprovals = (0, pg_core_1.pgTable)('gate_approvals', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    approvalId: (0, pg_core_1.text)('approval_id').notNull().unique(),
    gateId: (0, pg_core_1.text)('gate_id')
        .notNull()
        .references(function () { return exports.stageGates.gateId; }),
    submissionId: (0, pg_core_1.text)('submission_id')
        .notNull()
        .references(function () { return exports.regulatorySubmissions.submissionId; }),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Approval Details
    approverRole: (0, pg_core_1.text)('approver_role').notNull(), // qa, regulatory, clinical, management
    approverId: (0, pg_core_1.integer)('approver_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    approverName: (0, pg_core_1.text)('approver_name').notNull(),
    // Decision and Status
    decision: (0, pg_core_1.text)('decision').notNull(), // approved, rejected, conditional, deferred
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, completed, expired
    comments: (0, pg_core_1.text)('comments'),
    conditions: (0, pg_core_1.text)('conditions'), // For conditional approvals
    // E-Signature (21 CFR Part 11 Compliance)
    signatureHash: (0, pg_core_1.text)('signature_hash').notNull(),
    signatureMeaning: (0, pg_core_1.text)('signature_meaning').notNull(), // e.g., "I approve this gate transition"
    signatureTimestamp: (0, pg_core_1.timestamp)('signature_timestamp').notNull(),
    ipAddress: (0, pg_core_1.text)('ip_address').notNull(),
    userAgent: (0, pg_core_1.text)('user_agent'),
    // Verification
    verificationMethod: (0, pg_core_1.text)('verification_method'), // password, biometric, token
    verificationToken: (0, pg_core_1.text)('verification_token'),
    // Dates
    requestedAt: (0, pg_core_1.timestamp)('requested_at').notNull(),
    respondedAt: (0, pg_core_1.timestamp)('responded_at'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    approvalIdIdx: (0, pg_core_1.index)('gate_approval_id_idx').on(table.approvalId),
    gateIdx: (0, pg_core_1.index)('gate_approval_gate_idx').on(table.gateId),
    approverIdx: (0, pg_core_1.index)('gate_approval_approver_idx').on(table.approverId),
    statusIdx: (0, pg_core_1.index)('gate_approval_status_idx').on(table.status),
}); });
// taskDependencies already defined earlier in the file - removed duplicate
/**
 * Regulatory Audit Logs Table
 *
 * Complete audit trail for 21 CFR Part 11 compliance
 */
exports.regulatoryAuditLogs = (0, pg_core_1.pgTable)('regulatory_audit_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    auditId: (0, pg_core_1.text)('audit_id').notNull().unique(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Entity Reference
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // submission, task, gate, approval, document
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    submissionId: (0, pg_core_1.text)('submission_id'), // Optional reference to submission
    // Action Details
    action: (0, pg_core_1.text)('action').notNull(), // created, modified, deleted, approved, rejected, signed, exported
    actionCategory: (0, pg_core_1.text)('action_category').notNull(), // data-change, status-change, approval, system
    previousValue: (0, pg_core_1.json)('previous_value'),
    newValue: (0, pg_core_1.json)('new_value'),
    changeReason: (0, pg_core_1.text)('change_reason'),
    // User Information
    userId: (0, pg_core_1.integer)('user_id')
        .notNull()
        .references(function () { return exports.users.id; }),
    userName: (0, pg_core_1.text)('user_name').notNull(),
    userRole: (0, pg_core_1.text)('user_role'),
    // System Information
    ipAddress: (0, pg_core_1.text)('ip_address').notNull(),
    userAgent: (0, pg_core_1.text)('user_agent'),
    sessionId: (0, pg_core_1.text)('session_id'),
    // Compliance Fields
    isGxpRelevant: (0, pg_core_1.boolean)('is_gxp_relevant').default(false),
    requiresJustification: (0, pg_core_1.boolean)('requires_justification').default(false),
    justification: (0, pg_core_1.text)('justification'),
    // Timestamps
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
}, function (table) { return ({
    auditIdIdx: (0, pg_core_1.index)('reg_audit_id_idx').on(table.auditId),
    entityIdx: (0, pg_core_1.index)('reg_audit_entity_idx').on(table.entityType, table.entityId),
    userIdx: (0, pg_core_1.index)('reg_audit_user_idx').on(table.userId),
    timestampIdx: (0, pg_core_1.index)('reg_audit_timestamp_idx').on(table.timestamp),
    submissionIdx: (0, pg_core_1.index)('reg_audit_submission_idx').on(table.submissionId),
}); });
// ============================================================================
// INSERT SCHEMAS
// ============================================================================
exports.insertIndProjectSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indProjects).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertWorkflowProgressSchema = (0, drizzle_zod_1.createInsertSchema)(exports.workflowProgress).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndTemplateUsageLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indTemplateUsageLogs).omit({
    id: true,
    createdAt: true,
});
exports.insertIndSubmissionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indSubmissions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCoauthorSectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorSections).omit({
    createdAt: true,
    updatedAt: true,
});
exports.insertCoauthorAnnotationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorAnnotations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Regulatory Submission Center Insert Schemas
exports.insertRegulatorySubmissionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regulatorySubmissions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRegulatoryTaskSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regulatoryTasks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertStageGateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.stageGates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertGateApprovalSchema = (0, drizzle_zod_1.createInsertSchema)(exports.gateApprovals).omit({
    id: true,
    createdAt: true,
});
// insertTaskDependencySchema already defined earlier - removed duplicate
exports.insertRegulatoryAuditLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.regulatoryAuditLogs).omit({
    id: true,
    timestamp: true,
});
/**
 * ======================================================================================
 * COMPREHENSIVE CDISC INTEGRATION SYSTEM - ENTIRE PLATFORM
 * ======================================================================================
 *
 * CDISC (Clinical Data Interchange Standards Consortium) tables for:
 * - Protocol Representation Model (PRM)
 * - CDASH (Clinical Data Acquisition Standards Harmonization)
 * - SDTM (Study Data Tabulation Model)
 * - ADaM (Analysis Data Model)
 * - Define-XML metadata
 * - SEND (Standard for Exchange of Nonclinical Data)
 * - Product Quality (PQ) domains
 * - Medical Device domains
 *
 * Full multi-tenant support with RLS policies
 * Complete audit trail for 21 CFR Part 11 compliance
 */
// ============================================================================
// 1. PROTOCOL DESIGNER - CDISC Protocol Representation Model (PRM)
// ============================================================================
// PRM Studies - Core study protocol information
exports.cdiscPrmStudies = (0, pg_core_1.pgTable)('cdisc_prm_studies', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull().unique(),
    protocolId: (0, pg_core_1.varchar)('protocol_id', { length: 100 }).notNull(),
    protocolTitle: (0, pg_core_1.text)('protocol_title').notNull(),
    protocolVersion: (0, pg_core_1.varchar)('protocol_version', { length: 20 }).notNull(),
    studyPhase: (0, pg_core_1.varchar)('study_phase', { length: 20 }), // Phase I, II, III, IV
    studyType: (0, pg_core_1.varchar)('study_type', { length: 50 }), // Interventional, Observational
    therapeuticArea: (0, pg_core_1.text)('therapeutic_area'),
    indication: (0, pg_core_1.text)('indication'),
    primaryObjective: (0, pg_core_1.text)('primary_objective'),
    secondaryObjectives: (0, pg_core_1.json)('secondary_objectives'),
    studyDesign: (0, pg_core_1.text)('study_design'),
    blindingSchema: (0, pg_core_1.varchar)('blinding_schema', { length: 50 }), // Open, Single, Double
    randomization: (0, pg_core_1.json)('randomization'), // Randomization details
    populationDescription: (0, pg_core_1.text)('population_description'),
    plannedSubjects: (0, pg_core_1.integer)('planned_subjects'),
    studyDuration: (0, pg_core_1.integer)('study_duration'), // in days
    regulatoryRequirements: (0, pg_core_1.json)('regulatory_requirements'),
    protocolStatus: (0, pg_core_1.varchar)('protocol_status', { length: 50 }).default('draft'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    amendmentHistory: (0, pg_core_1.json)('amendment_history'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.text)('created_by'),
    lastModifiedBy: (0, pg_core_1.text)('last_modified_by'),
}, function (table) { return ({
    tenantStudyIdx: (0, pg_core_1.uniqueIndex)('prm_tenant_study_idx').on(table.tenantId, table.studyId),
    protocolIdx: (0, pg_core_1.index)('prm_protocol_idx').on(table.protocolId),
    phaseIdx: (0, pg_core_1.index)('prm_phase_idx').on(table.studyPhase),
}); });
// PRM Study Arms - Treatment arms and cohorts
exports.cdiscPrmStudyArms = (0, pg_core_1.pgTable)('cdisc_prm_study_arms', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    armCode: (0, pg_core_1.varchar)('arm_code', { length: 20 }).notNull(),
    armName: (0, pg_core_1.text)('arm_name').notNull(),
    armDescription: (0, pg_core_1.text)('arm_description'),
    armType: (0, pg_core_1.varchar)('arm_type', { length: 50 }), // Treatment, Control, Placebo
    plannedSubjects: (0, pg_core_1.integer)('planned_subjects'),
    treatmentDescription: (0, pg_core_1.text)('treatment_description'),
    dosing: (0, pg_core_1.json)('dosing'), // Dosing regimen details
    duration: (0, pg_core_1.integer)('duration'), // in days
    sequenceNumber: (0, pg_core_1.integer)('sequence_number'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyArmIdx: (0, pg_core_1.uniqueIndex)('prm_study_arm_idx').on(table.studyId, table.armCode),
}); });
// PRM Study Epochs - Study periods/phases
exports.cdiscPrmEpochs = (0, pg_core_1.pgTable)('cdisc_prm_epochs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    epochCode: (0, pg_core_1.varchar)('epoch_code', { length: 20 }).notNull(),
    epochName: (0, pg_core_1.text)('epoch_name').notNull(),
    epochType: (0, pg_core_1.varchar)('epoch_type', { length: 50 }), // Screening, Treatment, Follow-up
    duration: (0, pg_core_1.integer)('duration'), // in days
    sequenceNumber: (0, pg_core_1.integer)('sequence_number'),
    description: (0, pg_core_1.text)('description'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyEpochIdx: (0, pg_core_1.uniqueIndex)('prm_study_epoch_idx').on(table.studyId, table.epochCode),
}); });
// PRM Study Visits - Scheduled visits
exports.cdiscPrmVisits = (0, pg_core_1.pgTable)('cdisc_prm_visits', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    visitNum: (0, pg_core_1.varchar)('visit_num', { length: 20 }).notNull(),
    visitName: (0, pg_core_1.text)('visit_name').notNull(),
    visitLabel: (0, pg_core_1.text)('visit_label'),
    epochCode: (0, pg_core_1.varchar)('epoch_code', { length: 20 }),
    visitDay: (0, pg_core_1.integer)('visit_day'), // Study day
    visitWindow: (0, pg_core_1.json)('visit_window'), // {lower: -3, upper: 3}
    visitType: (0, pg_core_1.varchar)('visit_type', { length: 50 }), // Scheduled, Unscheduled
    procedures: (0, pg_core_1.json)('procedures'), // List of procedures
    assessments: (0, pg_core_1.json)('assessments'), // List of assessments
    sequenceNumber: (0, pg_core_1.integer)('sequence_number'),
    isMandatory: (0, pg_core_1.boolean)('is_mandatory').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyVisitIdx: (0, pg_core_1.uniqueIndex)('prm_study_visit_idx').on(table.studyId, table.visitNum),
}); });
// PRM Endpoints - Primary and secondary endpoints
exports.cdiscPrmEndpoints = (0, pg_core_1.pgTable)('cdisc_prm_endpoints', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    endpointId: (0, pg_core_1.varchar)('endpoint_id', { length: 50 }).notNull(),
    endpointType: (0, pg_core_1.varchar)('endpoint_type', { length: 20 }).notNull(), // Primary, Secondary, Exploratory
    endpointName: (0, pg_core_1.text)('endpoint_name').notNull(),
    endpointDescription: (0, pg_core_1.text)('endpoint_description'),
    measurementType: (0, pg_core_1.varchar)('measurement_type', { length: 50 }), // Continuous, Binary, Time-to-event
    analysisMethod: (0, pg_core_1.text)('analysis_method'),
    timepoint: (0, pg_core_1.text)('timepoint'),
    successCriteria: (0, pg_core_1.text)('success_criteria'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyEndpointIdx: (0, pg_core_1.uniqueIndex)('prm_study_endpoint_idx').on(table.studyId, table.endpointId),
}); });
// ============================================================================
// 2. STUDY DESIGNER - CDASH Forms Implementation
// ============================================================================
// CDASH Form Templates - Standardized CRF templates
exports.cdiscCdashForms = (0, pg_core_1.pgTable)('cdisc_cdash_forms', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    formId: (0, pg_core_1.varchar)('form_id', { length: 100 }).notNull(),
    formName: (0, pg_core_1.text)('form_name').notNull(),
    formLabel: (0, pg_core_1.text)('form_label'),
    domain: (0, pg_core_1.varchar)('domain', { length: 20 }).notNull(), // DM, AE, CM, LB, VS, etc.
    formType: (0, pg_core_1.varchar)('form_type', { length: 50 }), // Enrollment, Visit, Event
    cdashVersion: (0, pg_core_1.varchar)('cdash_version', { length: 20 }).default('1.1'),
    formStructure: (0, pg_core_1.json)('form_structure'), // Complete form definition
    fields: (0, pg_core_1.json)('fields'), // Array of field definitions
    validationRules: (0, pg_core_1.json)('validation_rules'),
    isStandard: (0, pg_core_1.boolean)('is_standard').default(true),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    tenantFormIdx: (0, pg_core_1.uniqueIndex)('cdash_tenant_form_idx').on(table.tenantId, table.formId),
    domainIdx: (0, pg_core_1.index)('cdash_domain_idx').on(table.domain),
}); });
// CDASH Field Definitions - Individual form fields
exports.cdiscCdashFields = (0, pg_core_1.pgTable)('cdisc_cdash_fields', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    formId: (0, pg_core_1.varchar)('form_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscCdashForms.formId; }),
    fieldName: (0, pg_core_1.varchar)('field_name', { length: 50 }).notNull(),
    cdashVariable: (0, pg_core_1.varchar)('cdash_variable', { length: 40 }).notNull(),
    fieldLabel: (0, pg_core_1.text)('field_label'),
    fieldType: (0, pg_core_1.varchar)('field_type', { length: 30 }), // text, number, date, select
    dataType: (0, pg_core_1.varchar)('data_type', { length: 30 }), // Char, Num, Date
    fieldLength: (0, pg_core_1.integer)('field_length'),
    required: (0, pg_core_1.boolean)('required').default(false),
    controlledTerminology: (0, pg_core_1.varchar)('controlled_terminology', { length: 100 }),
    codeList: (0, pg_core_1.json)('code_list'), // Allowed values
    validationRules: (0, pg_core_1.json)('validation_rules'),
    sdtmMapping: (0, pg_core_1.varchar)('sdtm_mapping', { length: 40 }), // Target SDTM variable
    sequenceNumber: (0, pg_core_1.integer)('sequence_number'),
    isCore: (0, pg_core_1.boolean)('is_core').default(false),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    formFieldIdx: (0, pg_core_1.uniqueIndex)('cdash_form_field_idx').on(table.formId, table.fieldName),
    variableIdx: (0, pg_core_1.index)('cdash_variable_idx').on(table.cdashVariable),
}); });
// CDASH to SDTM Mappings
exports.cdiscCdashSdtmMappings = (0, pg_core_1.pgTable)('cdisc_cdash_sdtm_mappings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    cdashDomain: (0, pg_core_1.varchar)('cdash_domain', { length: 20 }).notNull(),
    cdashVariable: (0, pg_core_1.varchar)('cdash_variable', { length: 40 }).notNull(),
    sdtmDomain: (0, pg_core_1.varchar)('sdtm_domain', { length: 20 }).notNull(),
    sdtmVariable: (0, pg_core_1.varchar)('sdtm_variable', { length: 40 }).notNull(),
    mappingType: (0, pg_core_1.varchar)('mapping_type', { length: 30 }), // Direct, Derived, Conditional
    mappingLogic: (0, pg_core_1.text)('mapping_logic'),
    transformationRule: (0, pg_core_1.text)('transformation_rule'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    cdashSdtmIdx: (0, pg_core_1.uniqueIndex)('cdash_sdtm_idx').on(table.cdashDomain, table.cdashVariable, table.sdtmVariable),
}); });
// ============================================================================
// 3. CSR DATABASE INTELLIGENCE - CDISC Reporting
// ============================================================================
// CSR Templates - Clinical Study Report templates
exports.cdiscCsrTemplates = (0, pg_core_1.pgTable)('cdisc_csr_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    templateId: (0, pg_core_1.varchar)('template_id', { length: 100 }).notNull(),
    templateName: (0, pg_core_1.text)('template_name').notNull(),
    templateType: (0, pg_core_1.varchar)('template_type', { length: 50 }), // ICH E3, FDA, EMA
    sections: (0, pg_core_1.json)('sections'), // CSR section structure
    tflSpecs: (0, pg_core_1.json)('tfl_specs'), // Table, Figure, Listing specifications
    dataRequirements: (0, pg_core_1.json)('data_requirements'),
    version: (0, pg_core_1.varchar)('version', { length: 20 }).default('1.0'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    tenantTemplateIdx: (0, pg_core_1.uniqueIndex)('csr_tenant_template_idx').on(table.tenantId, table.templateId),
}); });
// TFL Metadata - Tables, Figures, Listings definitions
exports.cdiscCsrTfl = (0, pg_core_1.pgTable)('cdisc_csr_tfl', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    tflId: (0, pg_core_1.varchar)('tfl_id', { length: 50 }).notNull(),
    tflType: (0, pg_core_1.varchar)('tfl_type', { length: 20 }).notNull(), // Table, Figure, Listing
    tflNumber: (0, pg_core_1.varchar)('tfl_number', { length: 20 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    population: (0, pg_core_1.varchar)('population', { length: 50 }), // ITT, PP, Safety
    datasets: (0, pg_core_1.json)('datasets'), // Required ADaM datasets
    programmingLogic: (0, pg_core_1.text)('programming_logic'),
    shellTemplate: (0, pg_core_1.text)('shell_template'), // Shell/mock
    outputFormat: (0, pg_core_1.varchar)('output_format', { length: 20 }), // RTF, PDF, HTML
    csrSection: (0, pg_core_1.varchar)('csr_section', { length: 50 }),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('planned'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyTflIdx: (0, pg_core_1.uniqueIndex)('csr_study_tfl_idx').on(table.studyId, table.tflId),
    tflNumberIdx: (0, pg_core_1.index)('csr_tfl_number_idx').on(table.tflNumber),
}); });
// Statistical Analysis Plan (SAP) in CDISC format
exports.cdiscCsrSap = (0, pg_core_1.pgTable)('cdisc_csr_sap', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    sapVersion: (0, pg_core_1.varchar)('sap_version', { length: 20 }).notNull(),
    sapDate: (0, pg_core_1.date)('sap_date'),
    populations: (0, pg_core_1.json)('populations'), // Analysis populations
    endpoints: (0, pg_core_1.json)('endpoints'), // Statistical endpoints
    analysisSets: (0, pg_core_1.json)('analysis_sets'),
    statisticalMethods: (0, pg_core_1.json)('statistical_methods'),
    missingDataHandling: (0, pg_core_1.text)('missing_data_handling'),
    interimAnalyses: (0, pg_core_1.json)('interim_analyses'),
    multiplicity: (0, pg_core_1.text)('multiplicity'),
    sampleSizeCalculation: (0, pg_core_1.json)('sample_size_calculation'),
    adamDatasets: (0, pg_core_1.json)('adam_datasets'), // Required ADaM datasets
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studySapIdx: (0, pg_core_1.uniqueIndex)('csr_study_sap_idx').on(table.studyId, table.sapVersion),
}); });
// CSR Reports - Clinical Safety Reports
exports.csrReports = (0, pg_core_1.pgTable)('csr_reports', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    clientWorkspaceId: (0, pg_core_1.integer)('client_workspace_id')
        .references(function () { return exports.clientWorkspaces.id; }),
    reportId: (0, pg_core_1.text)('report_id').notNull().unique(),
    reportTitle: (0, pg_core_1.text)('report_title').notNull(),
    reportType: (0, pg_core_1.text)('report_type'), // periodic, expedited, annual
    studyId: (0, pg_core_1.text)('study_id'),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in_review, submitted, approved
    submissionDate: (0, pg_core_1.timestamp)('submission_date'),
    dueDate: (0, pg_core_1.timestamp)('due_date'),
    uploadDate: (0, pg_core_1.timestamp)('upload_date').defaultNow().notNull(),
    content: (0, pg_core_1.json)('content'),
    metadata: (0, pg_core_1.json)('metadata'),
    complianceStatus: (0, pg_core_1.text)('compliance_status'),
    regulatoryAgency: (0, pg_core_1.text)('regulatory_agency'), // FDA, EMA, PMDA, etc.
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// ADaM Dataset Specifications
exports.cdiscAdamSpecs = (0, pg_core_1.pgTable)('cdisc_adam_specs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    datasetName: (0, pg_core_1.varchar)('dataset_name', { length: 40 }).notNull(),
    datasetLabel: (0, pg_core_1.text)('dataset_label'),
    datasetClass: (0, pg_core_1.varchar)('dataset_class', { length: 40 }), // ADSL, BDS, OCCDS
    datasetStructure: (0, pg_core_1.json)('dataset_structure'),
    variables: (0, pg_core_1.json)('variables'), // Variable specifications
    derivations: (0, pg_core_1.json)('derivations'), // Derivation rules
    sourceDatasets: (0, pg_core_1.json)('source_datasets'), // SDTM sources
    keyVariables: (0, pg_core_1.json)('key_variables'),
    analysisVariables: (0, pg_core_1.json)('analysis_variables'),
    version: (0, pg_core_1.varchar)('version', { length: 20 }).default('1.0'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyDatasetIdx: (0, pg_core_1.uniqueIndex)('adam_study_dataset_idx').on(table.studyId, table.datasetName),
}); });
// ============================================================================
// 4. eCTD CO-AUTHOR - CDISC Dataset Generation
// ============================================================================
// Define-XML Generation Configuration
exports.cdiscEctdDefineXml = (0, pg_core_1.pgTable)('cdisc_ectd_define_xml', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    defineVersion: (0, pg_core_1.varchar)('define_version', { length: 20 }).default('2.1'),
    defineId: (0, pg_core_1.varchar)('define_id', { length: 100 }).notNull(),
    creationDateTime: (0, pg_core_1.timestamp)('creation_date_time').defaultNow().notNull(),
    studyName: (0, pg_core_1.text)('study_name'),
    studyDescription: (0, pg_core_1.text)('study_description'),
    protocolName: (0, pg_core_1.text)('protocol_name'),
    datasetMetadata: (0, pg_core_1.json)('dataset_metadata'), // All dataset definitions
    variableMetadata: (0, pg_core_1.json)('variable_metadata'), // All variable definitions
    codeLists: (0, pg_core_1.json)('code_lists'), // Controlled terminology
    valueLevelMetadata: (0, pg_core_1.json)('value_level_metadata'),
    whereClauseDef: (0, pg_core_1.json)('where_clause_def'),
    computationMethods: (0, pg_core_1.json)('computation_methods'),
    comments: (0, pg_core_1.json)('comments'),
    standards: (0, pg_core_1.json)('standards'), // SDTM, ADaM versions
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    xmlContent: (0, pg_core_1.text)('xml_content'), // Generated XML
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyDefineIdx: (0, pg_core_1.uniqueIndex)('ectd_study_define_idx').on(table.studyId, table.defineId),
}); });
// Dataset Packaging Configuration
exports.cdiscEctdDatasets = (0, pg_core_1.pgTable)('cdisc_ectd_datasets', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    datasetType: (0, pg_core_1.varchar)('dataset_type', { length: 20 }).notNull(), // SDTM, ADaM, SEND
    datasetName: (0, pg_core_1.varchar)('dataset_name', { length: 40 }).notNull(),
    datasetLabel: (0, pg_core_1.text)('dataset_label'),
    datasetLocation: (0, pg_core_1.text)('dataset_location'), // File path/URI
    fileFormat: (0, pg_core_1.varchar)('file_format', { length: 20 }).default('xpt'), // xpt, sas7bdat
    fileSize: (0, pg_core_1.integer)('file_size'), // in bytes
    recordCount: (0, pg_core_1.integer)('record_count'),
    variableCount: (0, pg_core_1.integer)('variable_count'),
    splitMethod: (0, pg_core_1.varchar)('split_method', { length: 50 }), // For split datasets
    datasetMd5: (0, pg_core_1.varchar)('dataset_md5', { length: 32 }),
    isSupplemental: (0, pg_core_1.boolean)('is_supplemental').default(false),
    version: (0, pg_core_1.varchar)('version', { length: 20 }),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('pending'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyDatasetIdx: (0, pg_core_1.uniqueIndex)('ectd_study_dataset_idx').on(table.studyId, table.datasetName),
}); });
// Reviewer's Guide Templates
exports.cdiscEctdReviewersGuide = (0, pg_core_1.pgTable)('cdisc_ectd_reviewers_guide', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    guideVersion: (0, pg_core_1.varchar)('guide_version', { length: 20 }).notNull(),
    guideType: (0, pg_core_1.varchar)('guide_type', { length: 30 }), // SDRG, ADRG
    sections: (0, pg_core_1.json)('sections'), // Guide sections
    conformanceFindings: (0, pg_core_1.json)('conformance_findings'),
    dataIssues: (0, pg_core_1.json)('data_issues'),
    traceabilityMatrix: (0, pg_core_1.json)('traceability_matrix'),
    customDomains: (0, pg_core_1.json)('custom_domains'),
    derivationDetails: (0, pg_core_1.json)('derivation_details'),
    validationResults: (0, pg_core_1.json)('validation_results'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyGuideIdx: (0, pg_core_1.uniqueIndex)('ectd_study_guide_idx').on(table.studyId, table.guideVersion),
}); });
// Study Data Standardization Plan (SDSP)
exports.cdiscEctdSdsp = (0, pg_core_1.pgTable)('cdisc_ectd_sdsp', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    sdspVersion: (0, pg_core_1.varchar)('sdsp_version', { length: 20 }).notNull(),
    standardsUsed: (0, pg_core_1.json)('standards_used'), // CDISC standards and versions
    domainsPlan: (0, pg_core_1.json)('domains_plan'), // Planned domains
    controlledTerminology: (0, pg_core_1.json)('controlled_terminology'),
    customVariables: (0, pg_core_1.json)('custom_variables'),
    dataFlowDiagram: (0, pg_core_1.text)('data_flow_diagram'),
    mappingStrategy: (0, pg_core_1.text)('mapping_strategy'),
    validationPlan: (0, pg_core_1.text)('validation_plan'),
    deliverySchedule: (0, pg_core_1.json)('delivery_schedule'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studySdspIdx: (0, pg_core_1.uniqueIndex)('ectd_study_sdsp_idx').on(table.studyId, table.sdspVersion),
}); });
// ============================================================================
// 5. IND WIZARD - CDISC Clinical Data Integration
// ============================================================================
// IND CDISC Integration
exports.cdiscIndIntegration = (0, pg_core_1.pgTable)('cdisc_ind_integration', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    indNumber: (0, pg_core_1.varchar)('ind_number', { length: 50 }).notNull(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    submissionType: (0, pg_core_1.varchar)('submission_type', { length: 50 }), // Initial, Amendment, Annual
    clinicalDataPackage: (0, pg_core_1.json)('clinical_data_package'), // SDTM/ADaM datasets
    nonclinicalDataPackage: (0, pg_core_1.json)('nonclinical_data_package'), // SEND datasets
    integratedAnalyses: (0, pg_core_1.json)('integrated_analyses'), // ISS/ISE references
    dataSubmissionDate: (0, pg_core_1.date)('data_submission_date'),
    dataStatus: (0, pg_core_1.varchar)('data_status', { length: 30 }).default('pending'),
    validationStatus: (0, pg_core_1.varchar)('validation_status', { length: 30 }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    indIntegrationIdx: (0, pg_core_1.uniqueIndex)('ind_integration_idx').on(table.indNumber, table.studyId),
}); });
// SEND Domains - Nonclinical data
exports.cdiscIndSend = (0, pg_core_1.pgTable)('cdisc_ind_send', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    domain: (0, pg_core_1.varchar)('domain', { length: 20 }).notNull(), // DM, EX, BW, CL, etc.
    domainLabel: (0, pg_core_1.text)('domain_label'),
    datasetName: (0, pg_core_1.varchar)('dataset_name', { length: 40 }).notNull(),
    speciesCode: (0, pg_core_1.varchar)('species_code', { length: 20 }),
    studyType: (0, pg_core_1.varchar)('study_type', { length: 50 }), // Tox, PK, Carcinogenicity
    testArticle: (0, pg_core_1.text)('test_article'),
    dataStructure: (0, pg_core_1.json)('data_structure'),
    variables: (0, pg_core_1.json)('variables'),
    controlledTerms: (0, pg_core_1.json)('controlled_terms'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    sendDomainIdx: (0, pg_core_1.uniqueIndex)('send_domain_idx').on(table.studyId, table.domain),
}); });
// Integrated Summary of Safety (ISS)
exports.cdiscIndIss = (0, pg_core_1.pgTable)('cdisc_ind_iss', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    issId: (0, pg_core_1.varchar)('iss_id', { length: 100 }).notNull(),
    indNumber: (0, pg_core_1.varchar)('ind_number', { length: 50 }).notNull(),
    pooledStudies: (0, pg_core_1.json)('pooled_studies'), // List of study IDs
    poolingStrategy: (0, pg_core_1.text)('pooling_strategy'),
    safetyPopulation: (0, pg_core_1.json)('safety_population'),
    adverseEvents: (0, pg_core_1.json)('adverse_events'), // AE summary
    seriousAe: (0, pg_core_1.json)('serious_ae'), // SAE summary
    deathsSummary: (0, pg_core_1.json)('deaths_summary'),
    labAbnormalities: (0, pg_core_1.json)('lab_abnormalities'),
    vitalSigns: (0, pg_core_1.json)('vital_signs'),
    exposureData: (0, pg_core_1.json)('exposure_data'),
    demographicData: (0, pg_core_1.json)('demographic_data'),
    analysisDatasets: (0, pg_core_1.json)('analysis_datasets'), // ADaM datasets used
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    issIdx: (0, pg_core_1.uniqueIndex)('iss_idx').on(table.issId),
}); });
// Integrated Summary of Efficacy (ISE)
exports.cdiscIndIse = (0, pg_core_1.pgTable)('cdisc_ind_ise', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    iseId: (0, pg_core_1.varchar)('ise_id', { length: 100 }).notNull(),
    indNumber: (0, pg_core_1.varchar)('ind_number', { length: 50 }).notNull(),
    pooledStudies: (0, pg_core_1.json)('pooled_studies'), // List of study IDs
    poolingRationale: (0, pg_core_1.text)('pooling_rationale'),
    efficacyPopulation: (0, pg_core_1.json)('efficacy_population'),
    primaryEndpoints: (0, pg_core_1.json)('primary_endpoints'),
    secondaryEndpoints: (0, pg_core_1.json)('secondary_endpoints'),
    subgroupAnalyses: (0, pg_core_1.json)('subgroup_analyses'),
    doseResponse: (0, pg_core_1.json)('dose_response'),
    timeToEvent: (0, pg_core_1.json)('time_to_event'),
    analysisDatasets: (0, pg_core_1.json)('analysis_datasets'), // ADaM datasets used
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    iseIdx: (0, pg_core_1.uniqueIndex)('ise_idx').on(table.iseId),
}); });
// ============================================================================
// 6. REGULATORY INTELLIGENCE - CDISC Compliance
// ============================================================================
// CDISC Validation Rules Repository
exports.cdiscComplianceRules = (0, pg_core_1.pgTable)('cdisc_compliance_rules', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    ruleId: (0, pg_core_1.varchar)('rule_id', { length: 50 }).notNull(),
    ruleCategory: (0, pg_core_1.varchar)('rule_category', { length: 50 }), // Structure, Content, Terminology
    standard: (0, pg_core_1.varchar)('standard', { length: 30 }), // SDTM, ADaM, SEND, CDASH
    standardVersion: (0, pg_core_1.varchar)('standard_version', { length: 20 }),
    agency: (0, pg_core_1.varchar)('agency', { length: 20 }), // FDA, EMA, PMDA
    ruleType: (0, pg_core_1.varchar)('rule_type', { length: 30 }), // Error, Warning, Info
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }), // Critical, Major, Minor
    description: (0, pg_core_1.text)('description'),
    checkLogic: (0, pg_core_1.text)('check_logic'), // Validation logic
    errorMessage: (0, pg_core_1.text)('error_message'),
    remediationGuidance: (0, pg_core_1.text)('remediation_guidance'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    expirationDate: (0, pg_core_1.date)('expiration_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    ruleIdx: (0, pg_core_1.uniqueIndex)('compliance_rule_idx').on(table.ruleId, table.standard),
    agencyIdx: (0, pg_core_1.index)('compliance_agency_idx').on(table.agency),
}); });
// Compliance Check Results
exports.cdiscComplianceResults = (0, pg_core_1.pgTable)('cdisc_compliance_results', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    checkRunId: (0, pg_core_1.varchar)('check_run_id', { length: 100 }).notNull(),
    checkDate: (0, pg_core_1.timestamp)('check_date').defaultNow().notNull(),
    standard: (0, pg_core_1.varchar)('standard', { length: 30 }),
    datasetName: (0, pg_core_1.varchar)('dataset_name', { length: 40 }),
    ruleId: (0, pg_core_1.varchar)('rule_id', { length: 50 }),
    findingType: (0, pg_core_1.varchar)('finding_type', { length: 30 }), // Error, Warning, Info
    findingMessage: (0, pg_core_1.text)('finding_message'),
    recordId: (0, pg_core_1.varchar)('record_id', { length: 100 }),
    variableName: (0, pg_core_1.varchar)('variable_name', { length: 40 }),
    value: (0, pg_core_1.text)('value'),
    expectedValue: (0, pg_core_1.text)('expected_value'),
    isResolved: (0, pg_core_1.boolean)('is_resolved').default(false),
    resolutionDate: (0, pg_core_1.timestamp)('resolution_date'),
    resolutionNotes: (0, pg_core_1.text)('resolution_notes'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    checkRunIdx: (0, pg_core_1.index)('compliance_check_run_idx').on(table.checkRunId),
    studyCheckIdx: (0, pg_core_1.index)('compliance_study_check_idx').on(table.studyId, table.checkDate),
}); });
// Regulatory Agency Preferences
exports.cdiscComplianceAgencyPrefs = (0, pg_core_1.pgTable)('cdisc_compliance_agency_prefs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    agency: (0, pg_core_1.varchar)('agency', { length: 20 }).notNull(), // FDA, EMA, PMDA, HC, TGA
    region: (0, pg_core_1.varchar)('region', { length: 50 }),
    preferredStandards: (0, pg_core_1.json)('preferred_standards'), // CDISC versions
    requiredDomains: (0, pg_core_1.json)('required_domains'),
    mandatoryVariables: (0, pg_core_1.json)('mandatory_variables'),
    submissionFormat: (0, pg_core_1.json)('submission_format'),
    specialRequirements: (0, pg_core_1.json)('special_requirements'),
    guidanceDocuments: (0, pg_core_1.json)('guidance_documents'),
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    agencyPrefIdx: (0, pg_core_1.uniqueIndex)('agency_pref_idx').on(table.agency, table.region),
}); });
// CDISC Standards Version Control
exports.cdiscComplianceVersions = (0, pg_core_1.pgTable)('cdisc_compliance_versions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    standard: (0, pg_core_1.varchar)('standard', { length: 30 }).notNull(),
    version: (0, pg_core_1.varchar)('version', { length: 20 }).notNull(),
    releaseDate: (0, pg_core_1.date)('release_date'),
    implementationDate: (0, pg_core_1.date)('implementation_date'),
    retirementDate: (0, pg_core_1.date)('retirement_date'),
    changes: (0, pg_core_1.json)('changes'), // Change summary
    impactedDomains: (0, pg_core_1.json)('impacted_domains'),
    migrationNotes: (0, pg_core_1.text)('migration_notes'),
    isSupported: (0, pg_core_1.boolean)('is_supported').default(true),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    standardVersionIdx: (0, pg_core_1.uniqueIndex)('standard_version_idx').on(table.standard, table.version),
}); });
// ============================================================================
// 7. VAULT DMS - CDISC Document Management
// ============================================================================
// CDISC Document Repository
exports.cdiscDocsRepository = (0, pg_core_1.pgTable)('cdisc_docs_repository', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    docId: (0, pg_core_1.varchar)('doc_id', { length: 100 }).notNull(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    docType: (0, pg_core_1.varchar)('doc_type', { length: 50 }).notNull(), // aCRF, Define-XML, SDRG, ADRG
    docName: (0, pg_core_1.text)('doc_name').notNull(),
    docVersion: (0, pg_core_1.varchar)('doc_version', { length: 20 }),
    filePath: (0, pg_core_1.text)('file_path'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    mimeType: (0, pg_core_1.varchar)('mime_type', { length: 100 }),
    linkedDatasets: (0, pg_core_1.json)('linked_datasets'), // Associated CDISC datasets
    annotations: (0, pg_core_1.json)('annotations'), // Document annotations
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('draft'),
    checksum: (0, pg_core_1.varchar)('checksum', { length: 64 }), // SHA-256
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false),
    lockedBy: (0, pg_core_1.text)('locked_by'),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.text)('created_by'),
    lastModifiedBy: (0, pg_core_1.text)('last_modified_by'),
}, function (table) { return ({
    docIdx: (0, pg_core_1.uniqueIndex)('docs_doc_idx').on(table.docId, table.docVersion),
    studyDocIdx: (0, pg_core_1.index)('docs_study_doc_idx').on(table.studyId, table.docType),
}); });
// Annotated CRF Management
exports.cdiscDocsAcrf = (0, pg_core_1.pgTable)('cdisc_docs_acrf', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscPrmStudies.studyId; }),
    acrfVersion: (0, pg_core_1.varchar)('acrf_version', { length: 20 }).notNull(),
    formName: (0, pg_core_1.text)('form_name'),
    pageNumber: (0, pg_core_1.integer)('page_number'),
    fieldName: (0, pg_core_1.varchar)('field_name', { length: 50 }),
    cdashVariable: (0, pg_core_1.varchar)('cdash_variable', { length: 40 }),
    sdtmDomain: (0, pg_core_1.varchar)('sdtm_domain', { length: 20 }),
    sdtmVariable: (0, pg_core_1.varchar)('sdtm_variable', { length: 40 }),
    annotation: (0, pg_core_1.text)('annotation'),
    coordinates: (0, pg_core_1.json)('coordinates'), // {x, y, width, height}
    isRequired: (0, pg_core_1.boolean)('is_required').default(false),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    acrfIdx: (0, pg_core_1.index)('acrf_idx').on(table.studyId, table.acrfVersion),
}); });
// Define-XML Artifacts
exports.cdiscDocsDefineArtifacts = (0, pg_core_1.pgTable)('cdisc_docs_define_artifacts', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    defineId: (0, pg_core_1.varchar)('define_id', { length: 100 })
        .notNull()
        .references(function () { return exports.cdiscEctdDefineXml.defineId; }),
    artifactType: (0, pg_core_1.varchar)('artifact_type', { length: 50 }), // Stylesheet, PDF, Schema
    artifactName: (0, pg_core_1.text)('artifact_name'),
    artifactPath: (0, pg_core_1.text)('artifact_path'),
    version: (0, pg_core_1.varchar)('version', { length: 20 }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    defineArtifactIdx: (0, pg_core_1.index)('define_artifact_idx').on(table.defineId, table.artifactType),
}); });
// ============================================================================
// 8. CMC & STABILITY - Product Quality CDISC
// ============================================================================
// Product Quality (PQ) Domains
exports.cdiscPqDomains = (0, pg_core_1.pgTable)('cdisc_pq_domains', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    productId: (0, pg_core_1.varchar)('product_id', { length: 100 }).notNull(),
    batchId: (0, pg_core_1.varchar)('batch_id', { length: 100 }),
    domain: (0, pg_core_1.varchar)('domain', { length: 20 }).notNull(), // IS, RS, MS, etc.
    domainLabel: (0, pg_core_1.text)('domain_label'),
    testCategory: (0, pg_core_1.varchar)('test_category', { length: 50 }), // Identity, Potency, Purity
    testName: (0, pg_core_1.text)('test_name'),
    testMethod: (0, pg_core_1.text)('test_method'),
    specification: (0, pg_core_1.text)('specification'),
    results: (0, pg_core_1.json)('results'), // Test results
    units: (0, pg_core_1.varchar)('units', { length: 50 }),
    testDate: (0, pg_core_1.date)('test_date'),
    laboratoryId: (0, pg_core_1.varchar)('laboratory_id', { length: 50 }),
    analystId: (0, pg_core_1.varchar)('analyst_id', { length: 50 }),
    equipmentId: (0, pg_core_1.varchar)('equipment_id', { length: 50 }),
    complianceStatus: (0, pg_core_1.varchar)('compliance_status', { length: 30 }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    pqDomainIdx: (0, pg_core_1.index)('pq_domain_idx').on(table.productId, table.domain),
    batchPqIdx: (0, pg_core_1.index)('batch_pq_idx').on(table.batchId, table.testCategory),
}); });
// Stability Data in CDISC Format
exports.cdiscPqStability = (0, pg_core_1.pgTable)('cdisc_pq_stability', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    batchId: (0, pg_core_1.varchar)('batch_id', { length: 100 }).notNull(),
    storageCondition: (0, pg_core_1.varchar)('storage_condition', { length: 50 }), // 25C/60RH, 40C/75RH
    orientation: (0, pg_core_1.varchar)('orientation', { length: 30 }), // Upright, Inverted
    container: (0, pg_core_1.varchar)('container', { length: 100 }),
    timepoint: (0, pg_core_1.varchar)('timepoint', { length: 20 }), // 0M, 3M, 6M, 12M
    timepointValue: (0, pg_core_1.integer)('timepoint_value'), // in days
    parameter: (0, pg_core_1.varchar)('parameter', { length: 100 }),
    result: (0, pg_core_1.decimal)('result', { precision: 15, scale: 5 }),
    units: (0, pg_core_1.varchar)('units', { length: 50 }),
    specification: (0, pg_core_1.text)('specification'),
    conformance: (0, pg_core_1.boolean)('conformance').default(true),
    oos: (0, pg_core_1.boolean)('oos').default(false), // Out of specification
    testDate: (0, pg_core_1.date)('test_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    stabilityStudyIdx: (0, pg_core_1.index)('stability_study_idx').on(table.studyId, table.batchId),
    timepointIdx: (0, pg_core_1.index)('stability_timepoint_idx').on(table.timepoint),
}); });
// Manufacturing Batch Records in CDISC Format
exports.cdiscPqManufacturing = (0, pg_core_1.pgTable)('cdisc_pq_manufacturing', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    batchId: (0, pg_core_1.varchar)('batch_id', { length: 100 }).notNull(),
    productId: (0, pg_core_1.varchar)('product_id', { length: 100 }).notNull(),
    processStep: (0, pg_core_1.varchar)('process_step', { length: 100 }),
    stepSequence: (0, pg_core_1.integer)('step_sequence'),
    parameter: (0, pg_core_1.varchar)('parameter', { length: 100 }),
    targetValue: (0, pg_core_1.decimal)('target_value', { precision: 15, scale: 5 }),
    actualValue: (0, pg_core_1.decimal)('actual_value', { precision: 15, scale: 5 }),
    lowerLimit: (0, pg_core_1.decimal)('lower_limit', { precision: 15, scale: 5 }),
    upperLimit: (0, pg_core_1.decimal)('upper_limit', { precision: 15, scale: 5 }),
    units: (0, pg_core_1.varchar)('units', { length: 50 }),
    equipment: (0, pg_core_1.varchar)('equipment', { length: 100 }),
    operator: (0, pg_core_1.varchar)('operator', { length: 100 }),
    startTime: (0, pg_core_1.timestamp)('start_time'),
    endTime: (0, pg_core_1.timestamp)('end_time'),
    duration: (0, pg_core_1.integer)('duration'), // in minutes
    inProcess: (0, pg_core_1.boolean)('in_process').default(false),
    deviation: (0, pg_core_1.boolean)('deviation').default(false),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    batchManufacturingIdx: (0, pg_core_1.index)('batch_manufacturing_idx').on(table.batchId, table.stepSequence),
}); });
// ============================================================================
// 9. MEDICAL DEVICE - Device-specific CDISC
// ============================================================================
// Device Exposure (DX) Domain
exports.cdiscDeviceDx = (0, pg_core_1.pgTable)('cdisc_device_dx', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    subjectId: (0, pg_core_1.varchar)('subject_id', { length: 50 }).notNull(),
    deviceId: (0, pg_core_1.varchar)('device_id', { length: 100 }).notNull(),
    deviceName: (0, pg_core_1.text)('device_name'),
    deviceType: (0, pg_core_1.varchar)('device_type', { length: 50 }),
    udi: (0, pg_core_1.varchar)('udi', { length: 100 }), // Unique Device Identifier
    serialNumber: (0, pg_core_1.varchar)('serial_number', { length: 100 }),
    lotNumber: (0, pg_core_1.varchar)('lot_number', { length: 100 }),
    implantDate: (0, pg_core_1.date)('implant_date'),
    explantDate: (0, pg_core_1.date)('explant_date'),
    exposureDuration: (0, pg_core_1.integer)('exposure_duration'), // in days
    anatomicalLocation: (0, pg_core_1.varchar)('anatomical_location', { length: 100 }),
    laterality: (0, pg_core_1.varchar)('laterality', { length: 20 }), // Left, Right, Bilateral
    deviceSize: (0, pg_core_1.varchar)('device_size', { length: 50 }),
    reasonForUse: (0, pg_core_1.text)('reason_for_use'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studySubjectDeviceIdx: (0, pg_core_1.index)('device_study_subject_idx').on(table.studyId, table.subjectId, table.deviceId),
}); });
// Device Events (DE) Domain
exports.cdiscDeviceDe = (0, pg_core_1.pgTable)('cdisc_device_de', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    subjectId: (0, pg_core_1.varchar)('subject_id', { length: 50 }).notNull(),
    deviceId: (0, pg_core_1.varchar)('device_id', { length: 100 }).notNull(),
    eventId: (0, pg_core_1.varchar)('event_id', { length: 100 }).notNull(),
    eventTerm: (0, pg_core_1.text)('event_term'),
    eventType: (0, pg_core_1.varchar)('event_type', { length: 50 }), // Malfunction, Deficiency, Failure
    eventDate: (0, pg_core_1.date)('event_date'),
    severity: (0, pg_core_1.varchar)('severity', { length: 30 }), // Mild, Moderate, Severe
    relationship: (0, pg_core_1.varchar)('relationship', { length: 50 }), // Related, Possibly Related, Not Related
    outcome: (0, pg_core_1.varchar)('outcome', { length: 50 }),
    actionTaken: (0, pg_core_1.text)('action_taken'),
    reportedToFda: (0, pg_core_1.boolean)('reported_to_fda').default(false),
    mdrReportNumber: (0, pg_core_1.varchar)('mdr_report_number', { length: 50 }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    deviceEventIdx: (0, pg_core_1.index)('device_event_idx').on(table.studyId, table.subjectId, table.eventId),
}); });
// Device-Subject Relationships
exports.cdiscDeviceRelationships = (0, pg_core_1.pgTable)('cdisc_device_relationships', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    subjectId: (0, pg_core_1.varchar)('subject_id', { length: 50 }).notNull(),
    deviceId: (0, pg_core_1.varchar)('device_id', { length: 100 }).notNull(),
    relationshipType: (0, pg_core_1.varchar)('relationship_type', { length: 50 }), // Primary, Companion, Accessory
    startDate: (0, pg_core_1.date)('start_date'),
    endDate: (0, pg_core_1.date)('end_date'),
    devicePerformance: (0, pg_core_1.json)('device_performance'), // Performance metrics
    patientReportedOutcomes: (0, pg_core_1.json)('patient_reported_outcomes'),
    clinicianAssessments: (0, pg_core_1.json)('clinician_assessments'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    deviceRelIdx: (0, pg_core_1.index)('device_rel_idx').on(table.studyId, table.subjectId, table.deviceId),
}); });
// ============================================================================
// 10. TASK MANAGEMENT - CDISC Workflow Integration
// ============================================================================
// CDISC Deliverables
exports.cdiscTaskDeliverables = (0, pg_core_1.pgTable)('cdisc_task_deliverables', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    taskId: (0, pg_core_1.varchar)('task_id', { length: 100 }).notNull(),
    deliverableId: (0, pg_core_1.varchar)('deliverable_id', { length: 100 }).notNull(),
    deliverableType: (0, pg_core_1.varchar)('deliverable_type', { length: 50 }), // Dataset, Document, Program
    cdiscStandard: (0, pg_core_1.varchar)('cdisc_standard', { length: 30 }), // SDTM, ADaM, CDASH
    deliverableName: (0, pg_core_1.text)('deliverable_name'),
    description: (0, pg_core_1.text)('description'),
    assignedTo: (0, pg_core_1.text)('assigned_to'),
    dueDate: (0, pg_core_1.date)('due_date'),
    completionDate: (0, pg_core_1.date)('completion_date'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('pending'),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    dependencies: (0, pg_core_1.json)('dependencies'), // Other deliverable IDs
    validationStatus: (0, pg_core_1.varchar)('validation_status', { length: 30 }),
    reviewStatus: (0, pg_core_1.varchar)('review_status', { length: 30 }),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    taskDeliverableIdx: (0, pg_core_1.uniqueIndex)('task_deliverable_idx').on(table.taskId, table.deliverableId),
}); });
// CDISC Milestones
exports.cdiscTaskMilestones = (0, pg_core_1.pgTable)('cdisc_task_milestones', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }).notNull(),
    milestoneId: (0, pg_core_1.varchar)('milestone_id', { length: 100 }).notNull(),
    milestoneName: (0, pg_core_1.text)('milestone_name'),
    milestoneType: (0, pg_core_1.varchar)('milestone_type', { length: 50 }), // DBL, SDTM, ADaM, TLF
    targetDate: (0, pg_core_1.date)('target_date'),
    actualDate: (0, pg_core_1.date)('actual_date'),
    deliverables: (0, pg_core_1.json)('deliverables'), // List of deliverable IDs
    completionCriteria: (0, pg_core_1.json)('completion_criteria'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('pending'),
    approvalRequired: (0, pg_core_1.boolean)('approval_required').default(true),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    approvalDate: (0, pg_core_1.date)('approval_date'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyMilestoneIdx: (0, pg_core_1.uniqueIndex)('study_milestone_idx').on(table.studyId, table.milestoneId),
}); });
// Dataset Preparation Workflows
exports.cdiscTaskWorkflows = (0, pg_core_1.pgTable)('cdisc_task_workflows', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    workflowId: (0, pg_core_1.varchar)('workflow_id', { length: 100 }).notNull(),
    workflowName: (0, pg_core_1.text)('workflow_name'),
    workflowType: (0, pg_core_1.varchar)('workflow_type', { length: 50 }), // SDTM, ADaM, Define-XML
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    steps: (0, pg_core_1.json)('steps'), // Workflow steps
    currentStep: (0, pg_core_1.integer)('current_step').default(1),
    totalSteps: (0, pg_core_1.integer)('total_steps'),
    startDate: (0, pg_core_1.timestamp)('start_date'),
    completionDate: (0, pg_core_1.timestamp)('completion_date'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('pending'),
    automationLevel: (0, pg_core_1.varchar)('automation_level', { length: 30 }), // Manual, Semi-Auto, Fully-Auto
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    workflowIdx: (0, pg_core_1.uniqueIndex)('workflow_idx').on(table.workflowId),
}); });
// Validation Task Queues
exports.cdiscTaskValidationQueue = (0, pg_core_1.pgTable)('cdisc_task_validation_queue', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.integer)('tenant_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    queueId: (0, pg_core_1.varchar)('queue_id', { length: 100 }).notNull(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 100 }),
    datasetName: (0, pg_core_1.varchar)('dataset_name', { length: 40 }),
    validationType: (0, pg_core_1.varchar)('validation_type', { length: 50 }), // Structure, Content, Business
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'),
    scheduledTime: (0, pg_core_1.timestamp)('scheduled_time'),
    startTime: (0, pg_core_1.timestamp)('start_time'),
    endTime: (0, pg_core_1.timestamp)('end_time'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('queued'),
    resultsSummary: (0, pg_core_1.json)('results_summary'),
    errorCount: (0, pg_core_1.integer)('error_count').default(0),
    warningCount: (0, pg_core_1.integer)('warning_count').default(0),
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    queueIdx: (0, pg_core_1.index)('validation_queue_idx').on(table.status, table.priority),
    studyQueueIdx: (0, pg_core_1.index)('validation_study_queue_idx').on(table.studyId, table.validationType),
}); });
// ============================================================================
// CDISC INTEGRATION SCHEMAS AND TYPES
// ============================================================================
// Create insert schemas for all CDISC tables
exports.insertCdiscPrmStudySchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscPrmStudies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscPrmStudyArmSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscPrmStudyArms).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscPrmEpochSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscPrmEpochs).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscPrmVisitSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscPrmVisits).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscPrmEndpointSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscPrmEndpoints).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCdashFormSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCdashForms).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCdashFieldSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCdashFields).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCdashSdtmMappingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCdashSdtmMappings).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCsrTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCsrTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCsrTflSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCsrTfl).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCdiscCsrSapSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscCsrSap).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCsrReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.csrReports).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    uploadDate: true,
});
exports.insertCdiscAdamSpecSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cdiscAdamSpecs).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ============================================================================
// FORESIGHTAI™ TRANSLATIONAL INTELLIGENCE ENGINE
// ============================================================================
/**
 * Biomarker-Endpoint Relationships Table
 * Core of the translational knowledge graph connecting preclinical markers to clinical outcomes
 */
exports.biomarkerEndpoints = (0, pg_core_1.pgTable)('biomarker_endpoints', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    biomarkerId: (0, pg_core_1.varchar)('biomarker_id', { length: 255 }).notNull(),
    biomarkerName: (0, pg_core_1.text)('biomarker_name').notNull(),
    biomarkerType: (0, pg_core_1.text)('biomarker_type'), // protein, gene, metabolite, imaging, clinical
    endpointId: (0, pg_core_1.varchar)('endpoint_id', { length: 255 }).notNull(),
    endpointName: (0, pg_core_1.text)('endpoint_name').notNull(),
    endpointType: (0, pg_core_1.text)('endpoint_type'), // primary, secondary, exploratory, safety
    correlationScore: (0, pg_core_1.real)('correlation_score').default(0),
    evidenceCount: (0, pg_core_1.integer)('evidence_count').default(0),
    phase: (0, pg_core_1.text)('phase'), // 0, I, II, III, IV
    indication: (0, pg_core_1.text)('indication'),
    species: (0, pg_core_1.text)('species'), // human, mouse, rat, dog, monkey
    dataSource: (0, pg_core_1.text)('data_source'), // csr, clinical_trial, publication, rwe
    confidence: (0, pg_core_1.real)('confidence').default(0.5),
    metadata: (0, pg_core_1.json)('metadata'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        biomarkerEndpointIdx: (0, pg_core_1.index)('biomarker_endpoint_idx').on(table.biomarkerId, table.endpointId),
        phaseIdx: (0, pg_core_1.index)('phase_idx').on(table.phase),
        organizationIdx: (0, pg_core_1.index)('biomarker_org_idx').on(table.organizationId),
    };
});
/**
 * Clinical Outcomes Table
 * Stores actual clinical outcomes linked to biomarker-endpoint relationships
 */
exports.clinicalOutcomes = (0, pg_core_1.pgTable)('clinical_outcomes', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 255 }).notNull(),
    biomarkerEndpointId: (0, pg_core_1.uuid)('biomarker_endpoint_id').references(function () { return exports.biomarkerEndpoints.id; }),
    outcomeType: (0, pg_core_1.text)('outcome_type').notNull(), // success, failure, partial, inconclusive
    outcomeValue: (0, pg_core_1.json)('outcome_value'), // Flexible storage for various outcome metrics
    phase: (0, pg_core_1.text)('phase'),
    patientCount: (0, pg_core_1.integer)('patient_count'),
    timepoint: (0, pg_core_1.text)('timepoint'), // Week 12, Month 6, etc
    statisticalSignificance: (0, pg_core_1.real)('statistical_significance'),
    adverseEvents: (0, pg_core_1.json)('adverse_events'),
    failureReasons: (0, pg_core_1.text)('failure_reasons').array(),
    metadata: (0, pg_core_1.json)('metadata'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    capturedAt: (0, pg_core_1.timestamp)('captured_at').defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) {
    return {
        studyIdx: (0, pg_core_1.index)('outcome_study_idx').on(table.studyId),
        biomarkerEndpointIdx: (0, pg_core_1.index)('outcome_biomarker_endpoint_idx').on(table.biomarkerEndpointId),
    };
});
/**
 * ForesightAI Predictions Table
 * Stores predictive scores and recommendations for studies
 */
exports.foresightPredictions = (0, pg_core_1.pgTable)('foresight_predictions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 255 }).notNull(),
    phase: (0, pg_core_1.text)('phase').notNull(),
    predictionType: (0, pg_core_1.text)('prediction_type').notNull(), // success_score, enrollment_rate, safety_risk
    successScore: (0, pg_core_1.real)('success_score'),
    confidenceInterval: (0, pg_core_1.json)('confidence_interval'), // {lower: 0.65, upper: 0.85}
    riskFactors: (0, pg_core_1.json)('risk_factors'), // [{factor: 'small_sample', impact: -0.15}]
    recommendations: (0, pg_core_1.json)('recommendations'), // [{type: 'protocol', action: 'increase_dose'}]
    similarTrials: (0, pg_core_1.json)('similar_trials'), // [{id: 'NCT123', similarity: 0.92}]
    failurePatterns: (0, pg_core_1.json)('failure_patterns'), // [{pattern: 'dose_toxicity', probability: 0.23}]
    modelVersion: (0, pg_core_1.text)('model_version'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
}, function (table) {
    return {
        studyPhaseIdx: (0, pg_core_1.index)('prediction_study_phase_idx').on(table.studyId, table.phase),
        orgIdx: (0, pg_core_1.index)('prediction_org_idx').on(table.organizationId),
    };
});
/**
 * Clinical Feedback Loop Table
 * Captures real-world outcomes for continuous learning
 */
exports.clinicalFeedback = (0, pg_core_1.pgTable)('clinical_feedback', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 255 }).notNull(),
    predictionId: (0, pg_core_1.uuid)('prediction_id').references(function () { return exports.foresightPredictions.id; }),
    phase: (0, pg_core_1.text)('phase'),
    feedbackType: (0, pg_core_1.text)('feedback_type').notNull(), // outcome, protocol_change, safety_event
    actualOutcome: (0, pg_core_1.text)('actual_outcome'),
    predictedOutcome: (0, pg_core_1.text)('predicted_outcome'),
    accuracyScore: (0, pg_core_1.real)('accuracy_score'),
    learningPoints: (0, pg_core_1.json)('learning_points'), // Extracted insights for model improvement
    impactOnModel: (0, pg_core_1.json)('impact_on_model'), // How this feedback affects future predictions
    verified: (0, pg_core_1.boolean)('verified').default(false),
    verifiedBy: (0, pg_core_1.text)('verified_by'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    capturedAt: (0, pg_core_1.timestamp)('captured_at').defaultNow().notNull(),
    processedAt: (0, pg_core_1.timestamp)('processed_at'),
}, function (table) {
    return {
        studyIdx: (0, pg_core_1.index)('feedback_study_idx').on(table.studyId),
        predictionIdx: (0, pg_core_1.index)('feedback_prediction_idx').on(table.predictionId),
    };
});
/**
 * Translational Patterns Table
 * Stores learned patterns from preclinical to clinical translation
 */
exports.translationalPatterns = (0, pg_core_1.pgTable)('translational_patterns', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patternName: (0, pg_core_1.text)('pattern_name').notNull(),
    patternType: (0, pg_core_1.text)('pattern_type').notNull(), // success, failure, correlation, anomaly
    preclinicalMarkers: (0, pg_core_1.json)('preclinical_markers'), // Array of markers
    clinicalEndpoints: (0, pg_core_1.json)('clinical_endpoints'), // Array of endpoints
    successRate: (0, pg_core_1.real)('success_rate'),
    occurrenceCount: (0, pg_core_1.integer)('occurrence_count').default(1),
    indication: (0, pg_core_1.text)('indication'),
    phase: (0, pg_core_1.text)('phase'),
    species: (0, pg_core_1.text)('species').array(),
    confidence: (0, pg_core_1.real)('confidence').default(0.5),
    lastObserved: (0, pg_core_1.timestamp)('last_observed'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) {
    return {
        patternTypeIdx: (0, pg_core_1.index)('pattern_type_idx').on(table.patternType),
        indicationIdx: (0, pg_core_1.index)('pattern_indication_idx').on(table.indication),
    };
});
// Insert schemas for ForesightAI tables
exports.insertBiomarkerEndpointSchema = (0, drizzle_zod_1.createInsertSchema)(exports.biomarkerEndpoints).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertClinicalOutcomeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clinicalOutcomes).omit({
    id: true,
    createdAt: true,
});
exports.insertForesightPredictionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.foresightPredictions).omit({
    id: true,
    createdAt: true,
});
exports.insertClinicalFeedbackSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clinicalFeedback).omit({
    id: true,
    capturedAt: true,
});
exports.insertTranslationalPatternSchema = (0, drizzle_zod_1.createInsertSchema)(exports.translationalPatterns).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ============================================================================
// PHASE 0/I PRODUCTION MODULES
// ============================================================================
/**
 * Dose Escalation Studies Table
 * Manages dose escalation trials for Phase 0/I oncology and other studies
 */
exports.doseEscalationStudies = (0, pg_core_1.pgTable)('dose_escalation_studies', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.varchar)('study_id', { length: 255 }).notNull().unique(),
    protocolNumber: (0, pg_core_1.text)('protocol_number').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    phase: (0, pg_core_1.text)('phase').notNull(), // 0, I, Ib
    escalationMethod: (0, pg_core_1.text)('escalation_method').notNull(), // fibonacci, 3+3, boin, crm, mTPI
    startingDose: (0, pg_core_1.decimal)('starting_dose', { precision: 10, scale: 4 }).notNull(),
    doseUnit: (0, pg_core_1.text)('dose_unit').notNull(), // mg, mg/kg, mg/m2
    maxDose: (0, pg_core_1.decimal)('max_dose', { precision: 10, scale: 4 }),
    targetToxicityRate: (0, pg_core_1.real)('target_toxicity_rate').default(0.33), // For BOIN/CRM
    toxicityWindow: (0, pg_core_1.integer)('toxicity_window').default(28), // DLT evaluation period in days
    status: (0, pg_core_1.text)('status').default('active').notNull(), // active, completed, terminated, suspended
    currentDoseLevel: (0, pg_core_1.integer)('current_dose_level').default(1),
    mtdDetermined: (0, pg_core_1.boolean)('mtd_determined').default(false),
    mtdDose: (0, pg_core_1.decimal)('mtd_dose', { precision: 10, scale: 4 }),
    recommendedPhase2Dose: (0, pg_core_1.decimal)('rp2d', { precision: 10, scale: 4 }),
    totalPatients: (0, pg_core_1.integer)('total_patients').default(0),
    dltsObserved: (0, pg_core_1.integer)('dlts_observed').default(0),
    safetyRunIn: (0, pg_core_1.boolean)('safety_run_in').default(false),
    stoppingRulesMet: (0, pg_core_1.boolean)('stopping_rules_met').default(false),
    stoppingReason: (0, pg_core_1.text)('stopping_reason'),
    regulatoryCompliance: (0, pg_core_1.json)('regulatory_compliance'), // FDA/EMA guideline checks
    escalationParameters: (0, pg_core_1.json)('escalation_parameters'), // Method-specific parameters
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdBy: (0, pg_core_1.text)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyIdIdx: (0, pg_core_1.index)('dose_study_id_idx').on(table.studyId),
    statusIdx: (0, pg_core_1.index)('dose_study_status_idx').on(table.status),
    orgIdx: (0, pg_core_1.index)('dose_study_org_idx').on(table.organizationId),
}); });
/**
 * Dose Levels Table
 * Predefined dose levels for escalation studies
 */
exports.doseLevels = (0, pg_core_1.pgTable)('dose_levels', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.uuid)('study_id').notNull().references(function () { return exports.doseEscalationStudies.id; }),
    levelNumber: (0, pg_core_1.integer)('level_number').notNull(),
    doseAmount: (0, pg_core_1.decimal)('dose_amount', { precision: 10, scale: 4 }).notNull(),
    doseUnit: (0, pg_core_1.text)('dose_unit').notNull(),
    escalationPercentage: (0, pg_core_1.real)('escalation_percentage'), // % increase from previous level
    maxPatientsPerCohort: (0, pg_core_1.integer)('max_patients_per_cohort').default(3),
    minPatientsPerCohort: (0, pg_core_1.integer)('min_patients_per_cohort').default(3),
    patientsEnrolled: (0, pg_core_1.integer)('patients_enrolled').default(0),
    patientsEvaluable: (0, pg_core_1.integer)('patients_evaluable').default(0),
    dltsInCohort: (0, pg_core_1.integer)('dlts_in_cohort').default(0),
    toxicityRate: (0, pg_core_1.real)('toxicity_rate'),
    pharmacokineticData: (0, pg_core_1.json)('pharmacokinetic_data'),
    pharmacodynamicData: (0, pg_core_1.json)('pharmacodynamic_data'),
    biomarkerData: (0, pg_core_1.json)('biomarker_data'),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, enrolling, completed, skipped
    decisionDate: (0, pg_core_1.timestamp)('decision_date'),
    decisionRationale: (0, pg_core_1.text)('decision_rationale'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyLevelIdx: (0, pg_core_1.uniqueIndex)('dose_level_idx').on(table.studyId, table.levelNumber),
}); });
/**
 * Dose Cohorts Table
 * Patient cohorts within each dose level
 */
exports.doseCohorts = (0, pg_core_1.pgTable)('dose_cohorts', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.uuid)('study_id').notNull().references(function () { return exports.doseEscalationStudies.id; }),
    doseLevelId: (0, pg_core_1.uuid)('dose_level_id').notNull().references(function () { return exports.doseLevels.id; }),
    cohortNumber: (0, pg_core_1.integer)('cohort_number').notNull(),
    patientId: (0, pg_core_1.text)('patient_id').notNull(),
    enrollmentDate: (0, pg_core_1.date)('enrollment_date').notNull(),
    firstDoseDate: (0, pg_core_1.date)('first_dose_date'),
    lastDoseDate: (0, pg_core_1.date)('last_dose_date'),
    dltEvaluationStartDate: (0, pg_core_1.date)('dlt_evaluation_start_date'),
    dltEvaluationEndDate: (0, pg_core_1.date)('dlt_evaluation_end_date'),
    evaluableForDlt: (0, pg_core_1.boolean)('evaluable_for_dlt').default(true),
    dltOccurred: (0, pg_core_1.boolean)('dlt_occurred').default(false),
    dltDetails: (0, pg_core_1.json)('dlt_details'),
    discontinuationDate: (0, pg_core_1.date)('discontinuation_date'),
    discontinuationReason: (0, pg_core_1.text)('discontinuation_reason'),
    bestResponse: (0, pg_core_1.text)('best_response'),
    adverseEvents: (0, pg_core_1.json)('adverse_events'),
    concomitantMedications: (0, pg_core_1.json)('concomitant_medications'),
    pkSamples: (0, pg_core_1.json)('pk_samples'),
    biomarkerResults: (0, pg_core_1.json)('biomarker_results'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyPatientIdx: (0, pg_core_1.uniqueIndex)('cohort_patient_idx').on(table.studyId, table.patientId),
    doseLevelIdx: (0, pg_core_1.index)('cohort_dose_level_idx').on(table.doseLevelId),
}); });
/**
 * DLT Events Table
 * Dose-Limiting Toxicity events tracking
 */
exports.dltEvents = (0, pg_core_1.pgTable)('dlt_events', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    studyId: (0, pg_core_1.uuid)('study_id').notNull().references(function () { return exports.doseEscalationStudies.id; }),
    cohortId: (0, pg_core_1.uuid)('cohort_id').notNull().references(function () { return exports.doseCohorts.id; }),
    patientId: (0, pg_core_1.text)('patient_id').notNull(),
    eventDate: (0, pg_core_1.date)('event_date').notNull(),
    ctcaeGrade: (0, pg_core_1.integer)('ctcae_grade').notNull(), // 3, 4, 5
    systemOrganClass: (0, pg_core_1.text)('system_organ_class').notNull(),
    preferredTerm: (0, pg_core_1.text)('preferred_term').notNull(),
    description: (0, pg_core_1.text)('description'),
    relatedness: (0, pg_core_1.text)('relatedness').notNull(), // definitely, probably, possibly, unlikely, unrelated
    seriousness: (0, pg_core_1.text)('seriousness').notNull(), // serious, non-serious
    outcome: (0, pg_core_1.text)('outcome'), // resolved, resolving, not resolved, fatal, unknown
    actionTaken: (0, pg_core_1.text)('action_taken'), // dose reduced, dose delayed, discontinued, none
    doseModification: (0, pg_core_1.json)('dose_modification'),
    rechallenge: (0, pg_core_1.boolean)('rechallenge').default(false),
    rechallengeOutcome: (0, pg_core_1.text)('rechallenge_outcome'),
    reportedToFda: (0, pg_core_1.boolean)('reported_to_fda').default(false),
    reportedToIrb: (0, pg_core_1.boolean)('reported_to_irb').default(false),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    studyIdx: (0, pg_core_1.index)('dlt_study_idx').on(table.studyId),
    cohortIdx: (0, pg_core_1.index)('dlt_cohort_idx').on(table.cohortId),
    patientIdx: (0, pg_core_1.index)('dlt_patient_idx').on(table.patientId),
}); });
/**
 * IND Narratives Table
 * Master table for IND narrative documents
 */
exports.indNarratives = (0, pg_core_1.pgTable)('ind_narratives', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    narrativeId: (0, pg_core_1.varchar)('narrative_id', { length: 255 }).notNull().unique(),
    indNumber: (0, pg_core_1.text)('ind_number'),
    protocolNumber: (0, pg_core_1.text)('protocol_number').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    drugName: (0, pg_core_1.text)('drug_name').notNull(),
    indication: (0, pg_core_1.text)('indication').notNull(),
    phase: (0, pg_core_1.text)('phase').notNull(),
    narrativeType: (0, pg_core_1.text)('narrative_type').notNull(), // initial, amendment, annual_report
    version: (0, pg_core_1.integer)('version').default(1),
    status: (0, pg_core_1.text)('status').default('draft').notNull(), // draft, in_review, approved, submitted
    complianceScore: (0, pg_core_1.real)('compliance_score'),
    complianceChecks: (0, pg_core_1.json)('compliance_checks'), // 21 CFR 312 compliance results
    crossReferences: (0, pg_core_1.json)('cross_references'), // Links between sections and data sources
    sourceData: (0, pg_core_1.json)('source_data'), // CSR IDs and other data sources used
    generatedSections: (0, pg_core_1.integer)('generated_sections').default(0),
    totalSections: (0, pg_core_1.integer)('total_sections').default(0),
    lastGeneratedAt: (0, pg_core_1.timestamp)('last_generated_at'),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
    submittedToFda: (0, pg_core_1.boolean)('submitted_to_fda').default(false),
    submissionDate: (0, pg_core_1.date)('submission_date'),
    fdaResponseDate: (0, pg_core_1.date)('fda_response_date'),
    fdaResponse: (0, pg_core_1.text)('fda_response'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdBy: (0, pg_core_1.text)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    narrativeIdIdx: (0, pg_core_1.index)('narrative_id_idx').on(table.narrativeId),
    indNumberIdx: (0, pg_core_1.index)('ind_number_idx').on(table.indNumber),
    statusIdx: (0, pg_core_1.index)('narrative_status_idx').on(table.status),
    orgIdx: (0, pg_core_1.index)('narrative_org_idx').on(table.organizationId),
}); });
/**
 * IND Narrative Sections Table
 * Individual sections of IND narratives
 */
exports.indNarrativeSections = (0, pg_core_1.pgTable)('ind_narrative_sections', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    narrativeId: (0, pg_core_1.uuid)('narrative_id').notNull().references(function () { return exports.indNarratives.id; }),
    sectionNumber: (0, pg_core_1.text)('section_number').notNull(), // 1.1, 2.3.4, etc.
    sectionTitle: (0, pg_core_1.text)('section_title').notNull(),
    sectionType: (0, pg_core_1.text)('section_type').notNull(), // pharmacology, toxicology, cmc, clinical, statistical
    templateId: (0, pg_core_1.text)('template_id'),
    content: (0, pg_core_1.text)('content'),
    htmlContent: (0, pg_core_1.text)('html_content'),
    wordCount: (0, pg_core_1.integer)('word_count').default(0),
    dataSource: (0, pg_core_1.json)('data_source'), // CSR sections, lab data, etc.
    citations: (0, pg_core_1.json)('citations'),
    tables: (0, pg_core_1.json)('tables'),
    figures: (0, pg_core_1.json)('figures'),
    reviewStatus: (0, pg_core_1.text)('review_status').default('pending'), // pending, reviewed, approved, rejected
    reviewComments: (0, pg_core_1.json)('review_comments'),
    complianceFlags: (0, pg_core_1.json)('compliance_flags'),
    version: (0, pg_core_1.integer)('version').default(1),
    previousVersionId: (0, pg_core_1.uuid)('previous_version_id'),
    createdBy: (0, pg_core_1.text)('created_by'),
    lastModifiedBy: (0, pg_core_1.text)('last_modified_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    narrativeIdx: (0, pg_core_1.index)('section_narrative_idx').on(table.narrativeId),
    sectionNumberIdx: (0, pg_core_1.index)('section_number_idx').on(table.sectionNumber),
}); });
/**
 * Cross-Species PK/PD Analysis Table
 * Allometric scaling and cross-species comparisons
 */
exports.crossSpeciesPkpd = (0, pg_core_1.pgTable)('cross_species_pkpd', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    analysisId: (0, pg_core_1.varchar)('analysis_id', { length: 255 }).notNull().unique(),
    studyId: (0, pg_core_1.text)('study_id').notNull(),
    drugName: (0, pg_core_1.text)('drug_name').notNull(),
    indication: (0, pg_core_1.text)('indication'),
    analysisType: (0, pg_core_1.text)('analysis_type').notNull(), // allometric, physiologic, in_vitro_in_vivo
    sourceSpecies: (0, pg_core_1.text)('source_species').array().notNull(), // mouse, rat, dog, monkey
    targetSpecies: (0, pg_core_1.text)('target_species').default('human').notNull(),
    scalingMethod: (0, pg_core_1.text)('scaling_method').notNull(), // simple_allometric, mle, physiologic_pk
    allometricExponent: (0, pg_core_1.real)('allometric_exponent').default(0.75), // For dose scaling
    clearanceExponent: (0, pg_core_1.real)('clearance_exponent').default(0.75),
    volumeExponent: (0, pg_core_1.real)('volume_exponent').default(1.0),
    humanEquivalentDose: (0, pg_core_1.decimal)('human_equivalent_dose', { precision: 10, scale: 4 }),
    humanPredictedCmax: (0, pg_core_1.decimal)('human_predicted_cmax', { precision: 12, scale: 4 }),
    humanPredictedAuc: (0, pg_core_1.decimal)('human_predicted_auc', { precision: 12, scale: 4 }),
    humanPredictedT12: (0, pg_core_1.decimal)('human_predicted_t12', { precision: 8, scale: 2 }),
    safetyMargin: (0, pg_core_1.real)('safety_margin').default(10), // Safety factor for first-in-human
    noaelDose: (0, pg_core_1.decimal)('noael_dose', { precision: 10, scale: 4 }),
    mabelDose: (0, pg_core_1.decimal)('mabel_dose', { precision: 10, scale: 4 }),
    padDose: (0, pg_core_1.decimal)('pad_dose', { precision: 10, scale: 4 }),
    recommendedStartingDose: (0, pg_core_1.decimal)('recommended_starting_dose', { precision: 10, scale: 4 }),
    confidenceInterval: (0, pg_core_1.json)('confidence_interval'),
    validationMetrics: (0, pg_core_1.json)('validation_metrics'),
    regulatoryGuidelines: (0, pg_core_1.json)('regulatory_guidelines'), // FDA, EMA guidelines met
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdBy: (0, pg_core_1.text)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    analysisIdIdx: (0, pg_core_1.index)('pkpd_analysis_id_idx').on(table.analysisId),
    studyIdx: (0, pg_core_1.index)('pkpd_study_idx').on(table.studyId),
    orgIdx: (0, pg_core_1.index)('pkpd_org_idx').on(table.organizationId),
}); });
/**
 * Species Comparison Matrices Table
 * Detailed PK/PD parameters across species
 */
exports.speciesComparisons = (0, pg_core_1.pgTable)('species_comparisons', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    analysisId: (0, pg_core_1.uuid)('analysis_id').notNull().references(function () { return exports.crossSpeciesPkpd.id; }),
    species: (0, pg_core_1.text)('species').notNull(), // mouse, rat, dog, monkey, human
    bodyWeight: (0, pg_core_1.real)('body_weight').notNull(), // kg
    doseAdministered: (0, pg_core_1.decimal)('dose_administered', { precision: 10, scale: 4 }).notNull(),
    doseUnit: (0, pg_core_1.text)('dose_unit').notNull(),
    route: (0, pg_core_1.text)('route').notNull(), // iv, po, sc, im
    cmax: (0, pg_core_1.decimal)('cmax', { precision: 12, scale: 4 }),
    tmax: (0, pg_core_1.real)('tmax'),
    auc0inf: (0, pg_core_1.decimal)('auc0_inf', { precision: 12, scale: 4 }),
    auc0last: (0, pg_core_1.decimal)('auc0_last', { precision: 12, scale: 4 }),
    t12: (0, pg_core_1.real)('t12'),
    clearance: (0, pg_core_1.real)('clearance'),
    volumeDistribution: (0, pg_core_1.real)('volume_distribution'),
    bioavailability: (0, pg_core_1.real)('bioavailability'),
    proteinBinding: (0, pg_core_1.real)('protein_binding'),
    metabolites: (0, pg_core_1.json)('metabolites'),
    tissueDistribution: (0, pg_core_1.json)('tissue_distribution'),
    toxicologyFindings: (0, pg_core_1.json)('toxicology_findings'),
    efficacyEndpoints: (0, pg_core_1.json)('efficacy_endpoints'),
    dataSource: (0, pg_core_1.text)('data_source'),
    studyReferences: (0, pg_core_1.json)('study_references'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    analysisIdx: (0, pg_core_1.index)('comparison_analysis_idx').on(table.analysisId),
    speciesIdx: (0, pg_core_1.index)('comparison_species_idx').on(table.species),
}); });
/**
 * PK/PD Compartmental Models Table
 * Compartmental analysis parameters
 */
exports.pkpdCompartments = (0, pg_core_1.pgTable)('pkpd_compartments', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    analysisId: (0, pg_core_1.uuid)('analysis_id').notNull().references(function () { return exports.crossSpeciesPkpd.id; }),
    modelType: (0, pg_core_1.text)('model_type').notNull(), // one_compartment, two_compartment, three_compartment, pbpk
    species: (0, pg_core_1.text)('species').notNull(),
    centralVolume: (0, pg_core_1.real)('central_volume'),
    peripheralVolume1: (0, pg_core_1.real)('peripheral_volume1'),
    peripheralVolume2: (0, pg_core_1.real)('peripheral_volume2'),
    clearanceCentral: (0, pg_core_1.real)('clearance_central'),
    intercompartmentalClearance1: (0, pg_core_1.real)('intercompartmental_clearance1'),
    intercompartmentalClearance2: (0, pg_core_1.real)('intercompartmental_clearance2'),
    absorptionRate: (0, pg_core_1.real)('absorption_rate'),
    eliminationRate: (0, pg_core_1.real)('elimination_rate'),
    distributionRate: (0, pg_core_1.real)('distribution_rate'),
    modelParameters: (0, pg_core_1.json)('model_parameters'),
    covariateEffects: (0, pg_core_1.json)('covariate_effects'),
    populationVariability: (0, pg_core_1.json)('population_variability'),
    residualError: (0, pg_core_1.json)('residual_error'),
    goodnessOfFit: (0, pg_core_1.json)('goodness_of_fit'),
    diagnosticPlots: (0, pg_core_1.json)('diagnostic_plots'),
    validationResults: (0, pg_core_1.json)('validation_results'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    analysisIdx: (0, pg_core_1.index)('compartment_analysis_idx').on(table.analysisId),
    speciesIdx: (0, pg_core_1.index)('compartment_species_idx').on(table.species),
}); });
// Insert schemas for new tables
exports.insertDoseEscalationStudySchema = (0, drizzle_zod_1.createInsertSchema)(exports.doseEscalationStudies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoseLevelSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doseLevels).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDoseCohortSchema = (0, drizzle_zod_1.createInsertSchema)(exports.doseCohorts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDltEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.dltEvents).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndNarrativeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indNarratives).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertIndNarrativeSectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.indNarrativeSections).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertCrossSpeciesPkpdSchema = (0, drizzle_zod_1.createInsertSchema)(exports.crossSpeciesPkpd).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSpeciesComparisonSchema = (0, drizzle_zod_1.createInsertSchema)(exports.speciesComparisons).omit({
    id: true,
    createdAt: true,
});
exports.insertPkpdCompartmentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.pkpdCompartments).omit({
    id: true,
    createdAt: true,
});
/**
 * ======================================================================================
 * BIOTECH AI INTELLIGENCE RAG SYSTEM
 * ======================================================================================
 *
 * Tables for Retrieval-Augmented Generation system specialized for biotech documents
 * Supports vector embeddings, semantic search, and knowledge graph integration
 */
/**
 * RAG Documents Table
 * Stores metadata for ingested documents
 */
exports.ragDocuments = (0, pg_core_1.pgTable)('rag_documents', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    documentId: (0, pg_core_1.text)('document_id').notNull().unique(),
    title: (0, pg_core_1.text)('title').notNull(),
    documentType: (0, pg_core_1.text)('document_type').notNull(), // pdf, word, csr, protocol, regulatory, patent, literature
    source: (0, pg_core_1.text)('source'), // file_upload, pubmed, patent_db, clinicaltrials.gov, etc.
    sourceUrl: (0, pg_core_1.text)('source_url'),
    fileHash: (0, pg_core_1.text)('file_hash'),
    fileName: (0, pg_core_1.text)('file_name'),
    fileSize: (0, pg_core_1.integer)('file_size'),
    mimeType: (0, pg_core_1.text)('mime_type'),
    status: (0, pg_core_1.text)('status').default('pending').notNull(), // pending, processing, indexed, failed, archived
    processingStatus: (0, pg_core_1.json)('processing_status'), // { stage, progress, errors }
    language: (0, pg_core_1.text)('language').default('en'),
    pageCount: (0, pg_core_1.integer)('page_count'),
    wordCount: (0, pg_core_1.integer)('word_count'),
    chunkCount: (0, pg_core_1.integer)('chunk_count'),
    // Biotech specific metadata
    therapeuticArea: (0, pg_core_1.text)('therapeutic_area'),
    indication: (0, pg_core_1.text)('indication'),
    phase: (0, pg_core_1.text)('phase'),
    compound: (0, pg_core_1.text)('compound'),
    sponsor: (0, pg_core_1.text)('sponsor'),
    regulatoryAgency: (0, pg_core_1.text)('regulatory_agency'),
    documentDate: (0, pg_core_1.date)('document_date'),
    // Vector and search metadata
    embedModel: (0, pg_core_1.text)('embed_model').default('text-embedding-3-small'),
    embeddingDimensions: (0, pg_core_1.integer)('embedding_dimensions').default(1536),
    averageEmbedding: (0, pg_core_1.json)('average_embedding'), // Document-level embedding
    // Access control
    confidential: (0, pg_core_1.boolean)('confidential').default(false),
    accessLevel: (0, pg_core_1.text)('access_level').default('organization'), // public, organization, workspace, restricted
    allowedUsers: (0, pg_core_1.json)('allowed_users'), // Array of user IDs
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    indexedAt: (0, pg_core_1.timestamp)('indexed_at'),
    lastAccessedAt: (0, pg_core_1.timestamp)('last_accessed_at'),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('rag_documents_org_idx').on(table.organizationId),
    typeIdx: (0, pg_core_1.index)('rag_documents_type_idx').on(table.documentType),
    statusIdx: (0, pg_core_1.index)('rag_documents_status_idx').on(table.status),
    therapeuticIdx: (0, pg_core_1.index)('rag_documents_therapeutic_idx').on(table.therapeuticArea),
    compoundIdx: (0, pg_core_1.index)('rag_documents_compound_idx').on(table.compound),
    dateIdx: (0, pg_core_1.index)('rag_documents_date_idx').on(table.documentDate),
}); });
/**
 * RAG Chunks Table
 * Stores document chunks with vector embeddings
 * Supports pgvector for similarity search
 */
exports.ragChunks = (0, pg_core_1.pgTable)('rag_chunks', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    documentId: (0, pg_core_1.uuid)('document_id')
        .notNull()
        .references(function () { return exports.ragDocuments.id; }, { onDelete: 'cascade' }),
    chunkId: (0, pg_core_1.text)('chunk_id').notNull().unique(),
    chunkIndex: (0, pg_core_1.integer)('chunk_index').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    contentHash: (0, pg_core_1.text)('content_hash'),
    // Position and context
    pageNumber: (0, pg_core_1.integer)('page_number'),
    sectionTitle: (0, pg_core_1.text)('section_title'),
    subsectionTitle: (0, pg_core_1.text)('subsection_title'),
    paragraphIndex: (0, pg_core_1.integer)('paragraph_index'),
    startOffset: (0, pg_core_1.integer)('start_offset'),
    endOffset: (0, pg_core_1.integer)('end_offset'),
    // Vector embedding - proper pgvector support
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small (1536 dimensions)
    embeddingModel: (0, pg_core_1.text)('embedding_model').default('text-embedding-3-small'),
    // Chunk metadata
    tokenCount: (0, pg_core_1.integer)('token_count'),
    characterCount: (0, pg_core_1.integer)('character_count'),
    chunkType: (0, pg_core_1.text)('chunk_type'), // paragraph, table, figure, list, header, footer
    language: (0, pg_core_1.text)('language').default('en'),
    // Biotech entity extraction
    entities: (0, pg_core_1.json)('entities'), // { drugs: [], targets: [], diseases: [], biomarkers: [], etc. }
    keywords: (0, pg_core_1.json)('keywords'), // Array of extracted keywords
    concepts: (0, pg_core_1.json)('concepts'), // Medical/scientific concepts
    references: (0, pg_core_1.json)('references'), // Citations and references found in chunk
    // Search optimization
    searchVector: (0, pg_core_1.text)('search_vector'), // Full text search vector
    relevanceScore: (0, pg_core_1.real)('relevance_score'), // Pre-computed relevance for common queries
    accessCount: (0, pg_core_1.integer)('access_count').default(0),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    lastAccessedAt: (0, pg_core_1.timestamp)('last_accessed_at'),
}, function (table) { return ({
    documentIdx: (0, pg_core_1.index)('rag_chunks_document_idx').on(table.documentId),
    chunkIndexIdx: (0, pg_core_1.index)('rag_chunks_index_idx').on(table.documentId, table.chunkIndex),
    sectionIdx: (0, pg_core_1.index)('rag_chunks_section_idx').on(table.sectionTitle),
}); });
/**
 * RAG Queries Table
 * Tracks search queries and performance
 */
exports.ragQueries = (0, pg_core_1.pgTable)('rag_queries', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.integer)('user_id').references(function () { return exports.users.id; }),
    queryId: (0, pg_core_1.text)('query_id').notNull().unique(),
    // Query details
    query: (0, pg_core_1.text)('query').notNull(),
    enhancedQuery: (0, pg_core_1.text)('enhanced_query'), // Query after enhancement
    queryType: (0, pg_core_1.text)('query_type'), // search, qa, summary, analysis, comparison
    queryVector: (0, pg_core_1.json)('query_vector'), // Query embedding
    // Search parameters
    searchMode: (0, pg_core_1.text)('search_mode').default('hybrid'), // semantic, keyword, hybrid
    topK: (0, pg_core_1.integer)('top_k').default(10),
    minScore: (0, pg_core_1.real)('min_score'),
    filters: (0, pg_core_1.json)('filters'), // Document type, date range, etc.
    // Results
    resultsCount: (0, pg_core_1.integer)('results_count'),
    results: (0, pg_core_1.json)('results'), // Cached search results
    responseTime: (0, pg_core_1.real)('response_time'), // in milliseconds
    // Performance metrics
    precision: (0, pg_core_1.real)('precision'),
    recall: (0, pg_core_1.real)('recall'),
    relevanceFeedback: (0, pg_core_1.json)('relevance_feedback'), // User feedback on results
    // Session tracking
    sessionId: (0, pg_core_1.text)('session_id'),
    conversationId: (0, pg_core_1.text)('conversation_id'),
    followUp: (0, pg_core_1.boolean)('follow_up').default(false),
    parentQueryId: (0, pg_core_1.text)('parent_query_id'),
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('rag_queries_org_idx').on(table.organizationId),
    userIdx: (0, pg_core_1.index)('rag_queries_user_idx').on(table.userId),
    sessionIdx: (0, pg_core_1.index)('rag_queries_session_idx').on(table.sessionId),
    typeIdx: (0, pg_core_1.index)('rag_queries_type_idx').on(table.queryType),
    createdIdx: (0, pg_core_1.index)('rag_queries_created_idx').on(table.createdAt),
}); });
/**
 * RAG Knowledge Graph Table
 * Stores biotech entity relationships for graph-based retrieval
 */
exports.ragKnowledgeGraph = (0, pg_core_1.pgTable)('rag_knowledge_graph', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Entity information
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    entityType: (0, pg_core_1.text)('entity_type').notNull(), // drug, target, disease, pathway, biomarker, gene, protein
    entityName: (0, pg_core_1.text)('entity_name').notNull(),
    entityAliases: (0, pg_core_1.json)('entity_aliases'), // Alternative names
    // Relationship
    relationshipType: (0, pg_core_1.text)('relationship_type'), // inhibits, activates, treats, causes, associates_with
    relatedEntityId: (0, pg_core_1.text)('related_entity_id'),
    relatedEntityType: (0, pg_core_1.text)('related_entity_type'),
    relatedEntityName: (0, pg_core_1.text)('related_entity_name'),
    // Relationship metadata
    confidence: (0, pg_core_1.real)('confidence').default(1.0),
    evidence: (0, pg_core_1.json)('evidence'), // { sources: [], publications: [], trials: [] }
    strength: (0, pg_core_1.real)('strength'), // Relationship strength score
    direction: (0, pg_core_1.text)('direction'), // unidirectional, bidirectional
    // Source tracking
    sourceDocumentIds: (0, pg_core_1.json)('source_document_ids'), // Array of document IDs
    sourceChunkIds: (0, pg_core_1.json)('source_chunk_ids'), // Array of chunk IDs
    // Scientific metadata
    mechanism: (0, pg_core_1.text)('mechanism'),
    therapeuticClass: (0, pg_core_1.text)('therapeutic_class'),
    molecularWeight: (0, pg_core_1.real)('molecular_weight'),
    chemicalFormula: (0, pg_core_1.text)('chemical_formula'),
    uniprotId: (0, pg_core_1.text)('uniprot_id'),
    pubchemId: (0, pg_core_1.text)('pubchem_id'),
    drugbankId: (0, pg_core_1.text)('drugbank_id'),
    // Graph metrics
    centrality: (0, pg_core_1.real)('centrality'), // Node importance in graph
    clustering: (0, pg_core_1.real)('clustering'), // Local clustering coefficient
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('rag_knowledge_org_idx').on(table.organizationId),
    entityIdx: (0, pg_core_1.index)('rag_knowledge_entity_idx').on(table.entityId, table.entityType),
    relatedIdx: (0, pg_core_1.index)('rag_knowledge_related_idx').on(table.relatedEntityId, table.relatedEntityType),
    typeIdx: (0, pg_core_1.index)('rag_knowledge_type_idx').on(table.entityType),
    relationshipIdx: (0, pg_core_1.index)('rag_knowledge_relationship_idx').on(table.relationshipType),
    uniqueRelationship: (0, pg_core_1.uniqueIndex)('rag_knowledge_unique_rel').on(table.entityId, table.relatedEntityId, table.relationshipType),
}); });
/**
 * RAG Sources Table
 * Tracks regulatory document sources for automated crawling
 */
exports.ragSources = (0, pg_core_1.pgTable)('rag_sources', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    sourceName: (0, pg_core_1.text)('source_name').notNull(), // FDA, EMA, ICH, WHO, etc.
    sourceType: (0, pg_core_1.text)('source_type').notNull(), // rss_feed, api, web_scraping
    sourceUrl: (0, pg_core_1.text)('source_url').notNull(),
    documentType: (0, pg_core_1.text)('document_type'), // guidance, warning_letter, epar, etc.
    // Crawling configuration
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    crawlFrequency: (0, pg_core_1.text)('crawl_frequency'), // daily, weekly, monthly
    lastCrawledAt: (0, pg_core_1.timestamp)('last_crawled_at'),
    nextCrawlAt: (0, pg_core_1.timestamp)('next_crawl_at'),
    // Statistics
    documentsIngested: (0, pg_core_1.integer)('documents_ingested').default(0),
    lastDocumentDate: (0, pg_core_1.date)('last_document_date'),
    failureCount: (0, pg_core_1.integer)('failure_count').default(0),
    // Configuration
    crawlConfig: (0, pg_core_1.json)('crawl_config'), // { selectors, patterns, limits, etc. }
    authentication: (0, pg_core_1.json)('authentication'), // Encrypted API keys if needed
    rateLimit: (0, pg_core_1.integer)('rate_limit').default(10), // Requests per minute
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('rag_sources_org_idx').on(table.organizationId),
    sourceNameIdx: (0, pg_core_1.index)('rag_sources_name_idx').on(table.sourceName),
    activeIdx: (0, pg_core_1.index)('rag_sources_active_idx').on(table.isActive),
    nextCrawlIdx: (0, pg_core_1.index)('rag_sources_next_crawl_idx').on(table.nextCrawlAt),
}); });
/**
 * RAG Ingestion Jobs Table
 * Tracks document ingestion and processing jobs
 */
exports.ragIngestionJobs = (0, pg_core_1.pgTable)('rag_ingestion_jobs', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    jobId: (0, pg_core_1.text)('job_id').notNull().unique(),
    jobType: (0, pg_core_1.text)('job_type').notNull(), // single, batch, crawl, scheduled
    // Source information
    source: (0, pg_core_1.text)('source'), // FDA, EMA, ICH, WHO, user_upload, etc.
    sourceId: (0, pg_core_1.uuid)('source_id').references(function () { return exports.ragSources.id; }),
    documentUrl: (0, pg_core_1.text)('document_url'),
    documentTitle: (0, pg_core_1.text)('document_title'),
    documentType: (0, pg_core_1.text)('document_type'),
    // Job status
    status: (0, pg_core_1.text)('status').default('queued').notNull(), // queued, processing, completed, failed, cancelled
    priority: (0, pg_core_1.integer)('priority').default(5), // 1-10, higher is more urgent
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    maxRetries: (0, pg_core_1.integer)('max_retries').default(3),
    // Processing details
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    failedAt: (0, pg_core_1.timestamp)('failed_at'),
    processingTime: (0, pg_core_1.real)('processing_time'), // in seconds
    // Results
    documentId: (0, pg_core_1.uuid)('document_id').references(function () { return exports.ragDocuments.id; }),
    chunksProcessed: (0, pg_core_1.integer)('chunks_processed'),
    entitiesExtracted: (0, pg_core_1.integer)('entities_extracted'),
    error: (0, pg_core_1.text)('error'),
    errorDetails: (0, pg_core_1.json)('error_details'),
    // Progress tracking
    progress: (0, pg_core_1.integer)('progress').default(0), // 0-100
    progressMessage: (0, pg_core_1.text)('progress_message'),
    stages: (0, pg_core_1.json)('stages'), // { parsing: complete, chunking: in_progress, embedding: pending }
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('rag_jobs_org_idx').on(table.organizationId),
    statusIdx: (0, pg_core_1.index)('rag_jobs_status_idx').on(table.status),
    priorityIdx: (0, pg_core_1.index)('rag_jobs_priority_idx').on(table.priority, table.createdAt),
    sourceIdx: (0, pg_core_1.index)('rag_jobs_source_idx').on(table.source),
    createdIdx: (0, pg_core_1.index)('rag_jobs_created_idx').on(table.createdAt),
}); });
// Insert schemas for RAG tables
exports.insertRagDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRagChunkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragChunks).omit({
    id: true,
    createdAt: true,
});
exports.insertRagQuerySchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragQueries).omit({
    id: true,
    createdAt: true,
});
exports.insertRagKnowledgeGraphSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragKnowledgeGraph).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRagSourceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragSources).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertRagIngestionJobSchema = (0, drizzle_zod_1.createInsertSchema)(exports.ragIngestionJobs).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// CoAuthor Documents insert schemas and types
exports.insertCoauthorDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// CoAuthor Document Versions insert schemas and types
exports.insertCoauthorDocumentVersionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coauthorDocumentVersions).omit({
    id: true,
    createdAt: true,
});
/**
 * ======================================================================================
 * PHASE 3 AI REGULATORY INTELLIGENCE TABLES
 * ======================================================================================
 *
 * Tables for Phase 3 deployment of Regulatory Intelligence Layer and eCTD 4.0 automation
 * Includes NER extraction, global change management, and audit trail for 21 CFR Part 11
 */
// AI Audit Log for comprehensive tracking of all AI operations
exports.aiAuditLog = (0, pg_core_1.pgTable)('ai_audit_log', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_2.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    transactionId: (0, pg_core_1.uuid)('transaction_id').unique().notNull(),
    userId: (0, pg_core_1.text)('user_id'),
    aiService: (0, pg_core_1.varchar)('ai_service', { length: 50 }).notNull(), // 'ner-extract', 'generate-embedding', 'consistency-check'
    promptFull: (0, pg_core_1.text)('prompt_full'),
    modelUsed: (0, pg_core_1.varchar)('model_used', { length: 50 }),
    responseStructured: (0, pg_core_1.json)('response_structured'),
    affectedUdis: (0, pg_core_1.json)('affected_udis'), // Array of component UDIs
    tokensUsed: (0, pg_core_1.integer)('tokens_used').default(0),
    success: (0, pg_core_1.boolean)('success').default(false),
    approvalStatus: (0, pg_core_1.varchar)('approval_status', { length: 20 }),
    digitalSignature: (0, pg_core_1.text)('digital_signature'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    sessionId: (0, pg_core_1.varchar)('session_id'),
}, function (table) { return ({
    transactionIdx: (0, pg_core_1.index)('ai_audit_transaction_idx').on(table.transactionId),
    serviceIdx: (0, pg_core_1.index)('ai_audit_service_idx').on(table.aiService),
    createdIdx: (0, pg_core_1.index)('ai_audit_created_idx').on(table.createdAt),
}); });
// Change Requests for global change management
exports.changeRequests = (0, pg_core_1.pgTable)('change_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_2.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 100 }).notNull(),
    originalValue: (0, pg_core_1.text)('original_value').notNull(),
    newValue: (0, pg_core_1.text)('new_value').notNull(),
    affectedUdis: (0, pg_core_1.json)('affected_udis'), // Array of component UDIs
    stagingData: (0, pg_core_1.json)('staging_data'),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('pending').notNull(), // 'pending', 'approved', 'rejected', 'completed', 'failed'
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'), // 'low', 'medium', 'high', 'critical'
    reason: (0, pg_core_1.text)('reason'),
    targetDate: (0, pg_core_1.timestamp)('target_date'),
    digitalSignature: (0, pg_core_1.text)('digital_signature'),
    initiatedBy: (0, pg_core_1.text)('initiated_by').notNull(),
    reviewedBy: (0, pg_core_1.text)('reviewed_by'),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at'),
    reviewNotes: (0, pg_core_1.text)('review_notes'),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    executedBy: (0, pg_core_1.text)('executed_by'),
    executedAt: (0, pg_core_1.timestamp)('executed_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    executionSummary: (0, pg_core_1.json)('execution_summary'),
    error: (0, pg_core_1.text)('error'),
    failureReason: (0, pg_core_1.text)('failure_reason'),
    failedAt: (0, pg_core_1.timestamp)('failed_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, function (table) { return ({
    statusIdx: (0, pg_core_1.index)('change_requests_status_idx').on(table.status),
    orgIdx: (0, pg_core_1.index)('change_requests_org_idx').on(table.organizationId),
    createdIdx: (0, pg_core_1.index)('change_requests_created_idx').on(table.createdAt),
}); });
// eCTD 4.0 Context Groups for eliminating document duplication
exports.contextGroups = (0, pg_core_1.pgTable)('context_groups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_2.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    groupType: (0, pg_core_1.varchar)('group_type', { length: 50 }).notNull(), // 'module', 'section', 'document'
    contextOfUse: (0, pg_core_1.varchar)('context_of_use', { length: 100 }).notNull(), // e.g., "3.2.S.4.1"
    priorityNumber: (0, pg_core_1.integer)('priority_number').default(0),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('context_groups_org_idx').on(table.organizationId),
    contextIdx: (0, pg_core_1.index)('context_groups_context_idx').on(table.contextOfUse),
}); });
// Context Members - links components to context groups
exports.contextMembers = (0, pg_core_1.pgTable)('context_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_2.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    contextGroupId: (0, pg_core_1.uuid)('context_group_id').references(function () { return exports.contextGroups.id; }),
    componentUdi: (0, pg_core_1.varchar)('component_udi', { length: 255 }).notNull(), // Reference to component, not duplication
    version: (0, pg_core_1.varchar)('version', { length: 20 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('active').notNull(), // 'active', 'replaced', 'deleted'
    sequenceReferences: (0, pg_core_1.json)('sequence_references'), // ['SN0000', 'SN0001', ...]
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, function (table) { return ({
    groupIdx: (0, pg_core_1.index)('context_members_group_idx').on(table.contextGroupId),
    udiIdx: (0, pg_core_1.index)('context_members_udi_idx').on(table.componentUdi),
    statusIdx: (0, pg_core_1.index)('context_members_status_idx').on(table.status),
}); });
// Replacement Rules for eCTD 4.0 flexible patterns
exports.replacementRules = (0, pg_core_1.pgTable)('replacement_rules', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_2.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    ruleType: (0, pg_core_1.varchar)('rule_type', { length: 20 }).notNull(), // '1-to-N', 'N-to-1', 'N-to-M'
    sourceUdis: (0, pg_core_1.json)('source_udis').notNull(), // Array of source component UDIs
    targetUdis: (0, pg_core_1.json)('target_udis').notNull(), // Array of target component UDIs
    sequenceReferences: (0, pg_core_1.json)('sequence_references'), // Sequences affected by this rule
    appliedAt: (0, pg_core_1.timestamp)('applied_at'),
    createdBy: (0, pg_core_1.text)('created_by').notNull(),
    organizationId: (0, pg_core_1.integer)('organization_id').references(function () { return exports.organizations.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
}, function (table) { return ({
    orgIdx: (0, pg_core_1.index)('replacement_rules_org_idx').on(table.organizationId),
    typeIdx: (0, pg_core_1.index)('replacement_rules_type_idx').on(table.ruleType),
    createdIdx: (0, pg_core_1.index)('replacement_rules_created_idx').on(table.createdAt),
}); });
// Insert schemas for Phase 3 tables
exports.insertAiAuditLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.aiAuditLog).omit({
    id: true,
    createdAt: true,
});
exports.insertChangeRequestSchema = (0, drizzle_zod_1.createInsertSchema)(exports.changeRequests).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertContextGroupSchema = (0, drizzle_zod_1.createInsertSchema)(exports.contextGroups).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertContextMemberSchema = (0, drizzle_zod_1.createInsertSchema)(exports.contextMembers).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertReplacementRuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.replacementRules).omit({
    id: true,
    createdAt: true,
});
// Electronic Signatures Table (21 CFR Part 11)
// ============================================================================
// DEVICE DATA CENTER - 510(k) FILE MANAGEMENT SYSTEM
// ============================================================================
/**
 * Device Data Center for 510(k) submissions
 * Supports comprehensive tagging by category, test standard, and device component
 * Includes deep search capabilities and metadata management
 */
// Device Data Center Files table - stores device test and regulatory files
exports.deviceDataCenter = (0, pg_core_1.pgTable)('device_data_center', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }),
    // Basic file information
    fileName: (0, pg_core_1.text)('file_name').notNull(),
    fileType: (0, pg_core_1.text)('file_type').notNull(), // pdf, docx, xlsx, etc.
    fileSize: (0, pg_core_1.integer)('file_size'),
    storageUrl: (0, pg_core_1.text)('storage_url'),
    checksum: (0, pg_core_1.text)('checksum'),
    // Device information
    deviceName: (0, pg_core_1.text)('device_name'),
    deviceModel: (0, pg_core_1.text)('device_model'),
    deviceIdentifier: (0, pg_core_1.text)('device_identifier'), // UDI or internal ID
    // 510(k) specific categorization
    category: (0, pg_core_1.text)('category').notNull(), // bench_test_report, biocompatibility, predicate_labeling, etc.
    subcategory: (0, pg_core_1.text)('subcategory'), // More specific categorization
    // Test standards and compliance
    testStandards: (0, pg_core_1.text)('test_standards').array(), // ISO 10993, IEC 60601, etc.
    testType: (0, pg_core_1.text)('test_type'), // mechanical, electrical, biocompatibility, etc.
    testDate: (0, pg_core_1.date)('test_date'),
    testLabName: (0, pg_core_1.text)('test_lab_name'),
    testLabCertification: (0, pg_core_1.text)('test_lab_certification'), // ISO 17025, etc.
    // Device components
    deviceComponents: (0, pg_core_1.text)('device_components').array(), // housing, circuit_board, sensor, etc.
    componentVersion: (0, pg_core_1.text)('component_version'),
    // Regulatory metadata
    regulatoryStatus: (0, pg_core_1.text)('regulatory_status'), // draft, under_review, approved, superseded
    submissionNumber: (0, pg_core_1.text)('submission_number'), // K-number once assigned
    predicateDevice: (0, pg_core_1.text)('predicate_device'), // K-number of predicate
    predicateKNumber: (0, pg_core_1.text)('predicate_k_number'), // For predicate evidence files
    // Identity & provenance (comprehensive metadata per specification)
    reportId: (0, pg_core_1.text)('report_id'), // Report/document unique ID
    version: (0, pg_core_1.text)('version'), // Document version (semver or custom)
    authorOwner: (0, pg_core_1.text)('author_owner'), // User reference or name
    confidentiality: (0, pg_core_1.text)('confidentiality'), // Public, Internal, Confidential
    // Article under test metadata
    lotBatch: (0, pg_core_1.text)('lot_batch'), // Lot or batch number
    sampleId: (0, pg_core_1.text)('sample_id'), // Sample identifier
    buildRev: (0, pg_core_1.text)('build_rev'), // Build revision
    configuration: (0, pg_core_1.text)('configuration'), // Device configuration
    productCode: (0, pg_core_1.text)('product_code'), // FDA product code
    deviceClass: (0, pg_core_1.text)('device_class'), // Class I, II, III
    // Protocol & standardization
    protocolId: (0, pg_core_1.text)('protocol_id'), // Test protocol identifier
    acceptanceCriteriaRef: (0, pg_core_1.text)('acceptance_criteria_ref'), // Reference to acceptance criteria
    // Execution metadata
    environment: (0, pg_core_1.text)('environment'), // Test environment (temp/humidity)
    nSamples: (0, pg_core_1.integer)('n_samples'), // Number of samples tested
    cycles: (0, pg_core_1.integer)('cycles'), // Number of test cycles
    sterilizationMethod: (0, pg_core_1.text)('sterilization_method'), // EO, Radiation, Moist Heat
    sal: (0, pg_core_1.text)('sal'), // Sterility Assurance Level (e.g., 10^-6)
    agingDuration: (0, pg_core_1.text)('aging_duration'), // Aging test duration
    // Outcome metadata
    result: (0, pg_core_1.text)('result'), // Pass, Fail, Not-run
    margin: (0, pg_core_1.text)('margin'), // Margin vs acceptance (% or units)
    deviations: (0, pg_core_1.text)('deviations').array(), // List of deviations
    // Regulatory mapping
    sectionRefs: (0, pg_core_1.text)('section_refs').array(), // eSTAR items or 510(k) section IDs
    rtaChecklistRefs: (0, pg_core_1.text)('rta_checklist_refs').array(), // RTA checklist references
    // Tags for flexible categorization
    tags: (0, pg_core_1.text)('tags').array(), // Custom tags for easy searching
    // NEW: Hierarchical multi-category tagging system (complements single category field above)
    categories: (0, pg_core_1.text)('categories').array(), // Array of category codes for multi-category support
    components: (0, pg_core_1.text)('components').array(), // Array of component codes (hierarchical device components)
    standardRef: (0, pg_core_1.json)('standard_ref'), // Structured standard reference: { family, code, edition_year, clause, region }
    // Document relationships
    relatedDocuments: (0, pg_core_1.integer)('related_documents').array(), // IDs of related documents
    parentDocumentId: (0, pg_core_1.integer)('parent_document_id'), // For document versioning/hierarchy
    // Searchable metadata
    metadata: (0, pg_core_1.json)('metadata'), // Flexible JSON for additional metadata (now includes category-specific templates)
    searchableContent: (0, pg_core_1.text)('searchable_content'), // Extracted text for full-text search
    // Audit fields
    uploadedBy: (0, pg_core_1.text)('uploaded_by').notNull(),
    reviewedBy: (0, pg_core_1.text)('reviewed_by'),
    approvedBy: (0, pg_core_1.text)('approved_by'),
    comments: (0, pg_core_1.text)('comments'),
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at'),
    approvedAt: (0, pg_core_1.timestamp)('approved_at'),
}, function (table) { return ({
    // Performance indexes for fast searching
    orgIdx: (0, pg_core_1.index)('device_data_org_idx').on(table.organizationId),
    categoryIdx: (0, pg_core_1.index)('device_data_category_idx').on(table.category),
    deviceIdx: (0, pg_core_1.index)('device_data_device_idx').on(table.deviceName),
    statusIdx: (0, pg_core_1.index)('device_data_status_idx').on(table.regulatoryStatus),
    // GIN indexes for array searching
    tagsIdx: (0, pg_core_1.index)('device_data_tags_gin_idx').using('gin', table.tags),
    standardsIdx: (0, pg_core_1.index)('device_data_standards_gin_idx').using('gin', table.testStandards),
    componentsIdx: (0, pg_core_1.index)('device_data_components_gin_idx').using('gin', table.deviceComponents),
    // Full-text search index
    contentIdx: (0, pg_core_1.index)('device_data_content_idx').using('gin', (0, drizzle_orm_2.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["to_tsvector('english', ", ")"], ["to_tsvector('english', ", ")"])), table.searchableContent)),
}); });
// Device Data Center Categories - predefined categories for consistency (hierarchical)
exports.deviceDataCategories = (0, pg_core_1.pgTable)('device_data_categories', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    categoryCode: (0, pg_core_1.text)('category_code').notNull().unique(),
    categoryName: (0, pg_core_1.text)('category_name').notNull(),
    description: (0, pg_core_1.text)('description'),
    parentCategory: (0, pg_core_1.text)('parent_category'),
    parentId: (0, pg_core_1.integer)('parent_id'), // Hierarchical parent reference
    level: (0, pg_core_1.integer)('level').default(0), // Hierarchy depth (0=top-level, 1=subcategory, etc.)
    synonyms: (0, pg_core_1.text)('synonyms').array(), // Aliases for smart search (e.g., "EMC" <-> "60601-1-2")
    requiredFor510k: (0, pg_core_1.boolean)('required_for_510k').default(false),
    displayOrder: (0, pg_core_1.integer)('display_order'),
    icon: (0, pg_core_1.text)('icon'), // Icon name for UI
    color: (0, pg_core_1.text)('color'), // Color code for UI
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Device Test Standards - reference table for test standards (normalized)
exports.deviceTestStandards = (0, pg_core_1.pgTable)('device_test_standards', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    standardCode: (0, pg_core_1.text)('standard_code').notNull().unique(), // ISO 10993-1, IEC 60601-1, etc.
    standardName: (0, pg_core_1.text)('standard_name').notNull(),
    standardBody: (0, pg_core_1.text)('standard_body'), // ISO, IEC, ASTM, etc.
    family: (0, pg_core_1.text)('family'), // ISO, IEC, AAMI, ASTM, CLSI, FDA
    version: (0, pg_core_1.text)('version'),
    editionYear: (0, pg_core_1.integer)('edition_year'), // Normalized edition year (e.g., 2020)
    clause: (0, pg_core_1.text)('clause'), // Optional clause reference (e.g., "8.2.1")
    region: (0, pg_core_1.text)('region'), // US, EU, Global
    description: (0, pg_core_1.text)('description'),
    applicableCategories: (0, pg_core_1.text)('applicable_categories').array(),
    requiredTests: (0, pg_core_1.json)('required_tests'), // JSON array of required tests
    effectiveDate: (0, pg_core_1.date)('effective_date'),
    supersededBy: (0, pg_core_1.text)('superseded_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// Device Components Registry - track all device components (hierarchical)
exports.deviceComponents = (0, pg_core_1.pgTable)('device_components', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id').notNull().references(function () { return exports.organizations.id; }),
    componentCode: (0, pg_core_1.text)('component_code').notNull(),
    componentName: (0, pg_core_1.text)('component_name').notNull(),
    componentType: (0, pg_core_1.text)('component_type'), // mechanical, electrical, software, etc.
    parentId: (0, pg_core_1.integer)('parent_id'), // Hierarchical parent reference (e.g., Hardware -> PCB)
    level: (0, pg_core_1.integer)('level').default(0), // Hierarchy depth (0=System, 1=Hardware/Software, 2=Specific)
    bomRef: (0, pg_core_1.text)('bom_ref'), // BOM or configuration ID for traceability
    manufacturer: (0, pg_core_1.text)('manufacturer'),
    partNumber: (0, pg_core_1.text)('part_number'),
    version: (0, pg_core_1.text)('version'),
    specifications: (0, pg_core_1.json)('specifications'),
    testRequirements: (0, pg_core_1.text)('test_requirements').array(),
    relatedStandards: (0, pg_core_1.text)('related_standards').array(),
    status: (0, pg_core_1.text)('status').default('active'), // active, obsolete, under_review
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    orgComponentIdx: (0, pg_core_1.uniqueIndex)('device_components_org_code_idx').on(table.organizationId, table.componentCode),
}); });
// Insert schemas for Device Data Center
exports.insertDeviceDataCenterSchema = (0, drizzle_zod_1.createInsertSchema)(exports.deviceDataCenter).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertDeviceDataCategorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.deviceDataCategories).omit({
    id: true,
    createdAt: true,
});
exports.insertDeviceTestStandardSchema = (0, drizzle_zod_1.createInsertSchema)(exports.deviceTestStandards).omit({
    id: true,
    createdAt: true,
});
exports.insertDeviceComponentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.deviceComponents).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ============================================================================
// 510(k) WORKFLOW MANAGEMENT - COMPLETE END-TO-END TRACKING
// ============================================================================
// 510k Workflow Projects - Enhanced project tracking for 510k submissions
exports.fda510kProjects = (0, pg_core_1.pgTable)('fda_510k_projects', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.projects.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id')
        .references(function () { return exports.fda510kSubmissions.id; }),
    // Workflow Stage Tracking
    currentStage: (0, pg_core_1.text)('current_stage').default('setup'), // setup, strategy, evidence_plan, evidence, authoring, estar_rta, submit_ai
    currentStageProgress: (0, pg_core_1.integer)('current_stage_progress').default(0), // 0-100
    overallProgress: (0, pg_core_1.integer)('overall_progress').default(0), // 0-100
    // Device Information (Initial Intake)
    deviceName: (0, pg_core_1.text)('device_name').notNull(),
    deviceClassification: (0, pg_core_1.text)('device_classification'), // Class I, II, III
    productCode: (0, pg_core_1.text)('product_code'),
    regulationNumber: (0, pg_core_1.text)('regulation_number'),
    panelCode: (0, pg_core_1.text)('panel_code'),
    // Flags for Special Requirements
    hasSoftware: (0, pg_core_1.boolean)('has_software').default(false),
    hasCybersecurity: (0, pg_core_1.boolean)('has_cybersecurity').default(false),
    hasSterility: (0, pg_core_1.boolean)('has_sterility').default(false),
    hasBiocompatibility: (0, pg_core_1.boolean)('has_biocompatibility').default(true),
    hasClinicalData: (0, pg_core_1.boolean)('has_clinical_data').default(false),
    hasAI: (0, pg_core_1.boolean)('has_ai').default(false),
    // Team Assignment
    projectLead: (0, pg_core_1.integer)('project_lead').references(function () { return exports.users.id; }),
    regulatoryLead: (0, pg_core_1.integer)('regulatory_lead').references(function () { return exports.users.id; }),
    qualityLead: (0, pg_core_1.integer)('quality_lead').references(function () { return exports.users.id; }),
    teamMembers: (0, pg_core_1.json)('team_members'), // Array of user IDs with roles
    // Important Dates
    projectStartDate: (0, pg_core_1.timestamp)('project_start_date').defaultNow(),
    targetSubmissionDate: (0, pg_core_1.date)('target_submission_date'),
    actualSubmissionDate: (0, pg_core_1.date)('actual_submission_date'),
    // Status and Validation
    status: (0, pg_core_1.text)('status').default('active'), // active, on-hold, completed, archived
    lockedForSubmission: (0, pg_core_1.boolean)('locked_for_submission').default(false),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    lockedBy: (0, pg_core_1.integer)('locked_by').references(function () { return exports.users.id; }),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    org510kProjectIdx: (0, pg_core_1.index)('fda_510k_projects_org_idx').on(table.organizationId),
    project510kIdx: (0, pg_core_1.index)('fda_510k_projects_project_idx').on(table.projectId),
    stage510kIdx: (0, pg_core_1.index)('fda_510k_projects_stage_idx').on(table.currentStage),
}); });
// 510k Document Templates - Reusable templates for document generation
exports.fda510kTemplates = (0, pg_core_1.pgTable)('fda_510k_templates', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Template Identification
    templateCode: (0, pg_core_1.text)('template_code').notNull().unique(), // e.g., "FDA_3514", "FDA_3601", "510K_SUMMARY"
    templateName: (0, pg_core_1.text)('template_name').notNull(),
    templateType: (0, pg_core_1.text)('template_type').notNull(), // form, letter, summary, narrative
    fdaFormNumber: (0, pg_core_1.text)('fda_form_number'), // e.g., "FDA 3514"
    // Template Content
    templateContent: (0, pg_core_1.text)('template_content'), // HTML/Markdown template with placeholders
    placeholders: (0, pg_core_1.json)('placeholders'), // Array of {key, label, type, required, source}
    // Mapping Configuration
    dataMapping: (0, pg_core_1.json)('data_mapping'), // Maps workflow data to template placeholders
    validationRules: (0, pg_core_1.json)('validation_rules'), // Field validation requirements
    // Version Control
    version: (0, pg_core_1.text)('version').default('1.0'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    isDraft: (0, pg_core_1.boolean)('is_draft').default(false),
    // Metadata
    createdBy: (0, pg_core_1.integer)('created_by').references(function () { return exports.users.id; }),
    updatedBy: (0, pg_core_1.integer)('updated_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    templateCodeIdx: (0, pg_core_1.uniqueIndex)('fda_510k_templates_code_idx').on(table.templateCode),
    orgTemplateIdx: (0, pg_core_1.index)('fda_510k_templates_org_idx').on(table.organizationId),
}); });
// 510k Document Instances - Generated documents from templates
exports.fda510kDocuments = (0, pg_core_1.pgTable)('fda_510k_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.fda510kProjects.id; }),
    templateId: (0, pg_core_1.integer)('template_id')
        .references(function () { return exports.fda510kTemplates.id; }),
    // Document Identification
    documentId: (0, pg_core_1.text)('document_id').notNull().unique(), // System-wide unique ID
    documentType: (0, pg_core_1.text)('document_type').notNull(), // Same as templateType
    documentName: (0, pg_core_1.text)('document_name').notNull(),
    // Content and Data
    content: (0, pg_core_1.text)('content'), // Final rendered content
    formData: (0, pg_core_1.json)('form_data'), // Structured data for forms
    attachments: (0, pg_core_1.json)('attachments'), // Array of file references
    // Status and Locking
    status: (0, pg_core_1.text)('status').default('draft'), // draft, review, approved, locked, submitted
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    lockedBy: (0, pg_core_1.integer)('locked_by').references(function () { return exports.users.id; }),
    // Version Control
    version: (0, pg_core_1.integer)('version').default(1),
    previousVersionId: (0, pg_core_1.integer)('previous_version_id'), // Reference to previous version
    changeLog: (0, pg_core_1.json)('change_log'), // Array of changes
    // Digital Signatures
    signatures: (0, pg_core_1.json)('signatures'), // Array of signature records
    signatureRequired: (0, pg_core_1.boolean)('signature_required').default(false),
    // Validation and Compliance
    validationStatus: (0, pg_core_1.text)('validation_status').default('pending'), // pending, passed, failed
    validationErrors: (0, pg_core_1.json)('validation_errors'),
    complianceScore: (0, pg_core_1.integer)('compliance_score'), // 0-100
    // Metadata
    createdBy: (0, pg_core_1.integer)('created_by').references(function () { return exports.users.id; }),
    updatedBy: (0, pg_core_1.integer)('updated_by').references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    documentIdIdx: (0, pg_core_1.uniqueIndex)('fda_510k_documents_id_idx').on(table.documentId),
    projectDocIdx: (0, pg_core_1.index)('fda_510k_documents_project_idx').on(table.projectId),
    statusDocIdx: (0, pg_core_1.index)('fda_510k_documents_status_idx').on(table.status),
}); });
// 510k Workflow Stage Progress - Track completion of each stage
exports.fda510kStageProgress = (0, pg_core_1.pgTable)('fda_510k_stage_progress', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.fda510kProjects.id; }),
    // Stage Information
    stageName: (0, pg_core_1.text)('stage_name').notNull(), // setup, strategy, evidence_plan, etc.
    sectionName: (0, pg_core_1.text)('section_name').notNull(), // device_intake, predicate_search, etc.
    // Progress Tracking
    status: (0, pg_core_1.text)('status').default('pending'), // pending, in_progress, completed, blocked
    progress: (0, pg_core_1.integer)('progress').default(0), // 0-100
    isRequired: (0, pg_core_1.boolean)('is_required').default(true),
    // Data Collection
    collectedData: (0, pg_core_1.json)('collected_data'), // Form data collected for this section
    validationStatus: (0, pg_core_1.text)('validation_status').default('pending'), // pending, passed, failed
    validationErrors: (0, pg_core_1.json)('validation_errors'),
    // Timestamps
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    completedBy: (0, pg_core_1.integer)('completed_by').references(function () { return exports.users.id; }),
    // Metadata
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    projectStageIdx: (0, pg_core_1.index)('fda_510k_stage_progress_project_idx').on(table.projectId, table.stageName),
}); });
// 510k Submission Packages - Final compiled packages for FDA submission
exports.fda510kSubmissionPackages = (0, pg_core_1.pgTable)('fda_510k_submission_packages', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    projectId: (0, pg_core_1.integer)('project_id')
        .notNull()
        .references(function () { return exports.fda510kProjects.id; }),
    submissionId: (0, pg_core_1.integer)('submission_id')
        .references(function () { return exports.fda510kSubmissions.id; }),
    // Package Information
    packageId: (0, pg_core_1.text)('package_id').notNull().unique(), // Unique package identifier
    packageName: (0, pg_core_1.text)('package_name').notNull(),
    packageType: (0, pg_core_1.text)('package_type').default('510k'), // 510k, pma, etc.
    // Package Contents
    documents: (0, pg_core_1.json)('documents'), // Array of document IDs and metadata
    attachments: (0, pg_core_1.json)('attachments'), // Supporting files
    estarData: (0, pg_core_1.json)('estar_data'), // eSTAR specific data
    // FDA Submission Details
    submissionMethod: (0, pg_core_1.text)('submission_method').default('esg'), // esg, paper
    esgTransactionId: (0, pg_core_1.text)('esg_transaction_id'),
    fdaAcknowledgmentNumber: (0, pg_core_1.text)('fda_acknowledgment_number'),
    // Package Status
    status: (0, pg_core_1.text)('status').default('draft'), // draft, ready, submitted, accepted, rejected
    isLocked: (0, pg_core_1.boolean)('is_locked').default(false),
    lockedAt: (0, pg_core_1.timestamp)('locked_at'),
    // Validation
    rtaChecklistComplete: (0, pg_core_1.boolean)('rta_checklist_complete').default(false),
    rtaChecklistResults: (0, pg_core_1.json)('rta_checklist_results'),
    finalValidation: (0, pg_core_1.json)('final_validation'),
    // Submission Tracking
    submittedAt: (0, pg_core_1.timestamp)('submitted_at'),
    submittedBy: (0, pg_core_1.integer)('submitted_by').references(function () { return exports.users.id; }),
    acknowledgmentDate: (0, pg_core_1.date)('acknowledgment_date'),
    // Metadata
    metadata: (0, pg_core_1.json)('metadata'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    packageIdIdx: (0, pg_core_1.uniqueIndex)('fda_510k_packages_id_idx').on(table.packageId),
    projectPackageIdx: (0, pg_core_1.index)('fda_510k_packages_project_idx').on(table.projectId),
}); });
// 510k Data Mappings - Maps workflow data to document templates
exports.fda510kDataMappings = (0, pg_core_1.pgTable)('fda_510k_data_mappings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    organizationId: (0, pg_core_1.integer)('organization_id')
        .notNull()
        .references(function () { return exports.organizations.id; }),
    // Mapping Identification
    mappingCode: (0, pg_core_1.text)('mapping_code').notNull().unique(),
    mappingName: (0, pg_core_1.text)('mapping_name').notNull(),
    // Source and Target
    sourceType: (0, pg_core_1.text)('source_type').notNull(), // workflow, form, database, api
    sourceReference: (0, pg_core_1.text)('source_reference').notNull(), // Table.field or API endpoint
    targetTemplate: (0, pg_core_1.text)('target_template').notNull(), // Template code
    targetField: (0, pg_core_1.text)('target_field').notNull(), // Placeholder in template
    // Transformation Rules
    transformationType: (0, pg_core_1.text)('transformation_type'), // direct, calculated, conditional
    transformationRules: (0, pg_core_1.json)('transformation_rules'), // Rules for data transformation
    // Validation
    isRequired: (0, pg_core_1.boolean)('is_required').default(false),
    validationRules: (0, pg_core_1.json)('validation_rules'),
    // Metadata
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, function (table) { return ({
    mappingCodeIdx: (0, pg_core_1.uniqueIndex)('fda_510k_mappings_code_idx').on(table.mappingCode),
    orgMappingIdx: (0, pg_core_1.index)('fda_510k_mappings_org_idx').on(table.organizationId),
}); });
// Insert schemas for new 510k workflow tables
exports.insertFda510kProjectSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kProjects).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFda510kTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kTemplates).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFda510kDocumentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kDocuments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFda510kStageProgressSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kStageProgress).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFda510kSubmissionPackageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kSubmissionPackages).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFda510kDataMappingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fda510kDataMappings).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6;
// ============================================================================
// CER (CLINICAL EVALUATION REPORTS) - MDR/IVDR COMPLIANT
// ============================================================================
