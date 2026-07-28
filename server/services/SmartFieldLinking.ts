import { EventEmitter } from 'events';
import CrossReferenceMapper from './CrossReferenceMapping.js';
import { db } from '../db';
import { fda510kDocuments, fda510kProjects, fda510kStageProgress } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Maps a workflow field category to the (stage, section) pair whose
 * `collected_data` blob holds it. Hoisted to module scope so the write path and
 * the completeness read agree on one mapping.
 */
const STAGE_MAPPING: Record<string, { stage: string; section: string }> = {
  device: { stage: 'setup', section: 'device_info' },
  manufacturer: { stage: 'setup', section: 'manufacturer_info' },
  predicate: { stage: 'strategy', section: 'predicate_comparison' },
  testing: { stage: 'evidence_plan', section: 'test_plan' },
  labeling: { stage: 'submission_review', section: 'labeling' },
  clinical: { stage: 'clinical_regulatory', section: 'clinical_data' },
};

interface FieldLink {
  workflowField: string;
  documentFields: {
    documentType: string;
    fieldPath: string;
    section?: string;
  }[];
  validation?: {
    required?: boolean;
    maxLength?: number;
    pattern?: string;
  };
  transform?: (value: any) => any;
}

/**
 * A field mutation plus the authorization context it must be executed under.
 *
 * SECURITY (C2C-DEVICE-001): `organizationId` and `projectId` are the tenant
 * predicates for every read and write this service performs. They are typed
 * optional ONLY so the shared signature keeps compiling at every existing call
 * site (server/routes/fieldSync.routes.ts supplies them through `metadata`);
 * they are REQUIRED at runtime — `updateField` refuses the mutation when the
 * scope cannot be resolved from either place. Callers must derive both from a
 * verified principal, never from a request body or socket payload.
 */
interface FieldUpdate {
  source: 'workflow' | 'document';
  field: string;
  value: any;
  previousValue?: any;
  timestamp: Date;
  userId?: number;
  organizationId?: number;
  projectId?: number;
  metadata?: Record<string, any>;
}

/** Resolved, validated tenant scope for one propagation. */
interface FieldScope {
  organizationId: number;
  projectId: number;
  userId?: number;
}

export class SmartFieldLinking extends EventEmitter {
  private fieldLinks: Map<string, FieldLink> = new Map();
  private fieldSubscriptions: Map<string, Set<string>> = new Map();
  private crossReferenceMapper: CrossReferenceMapper;
  private updateQueue: FieldUpdate[] = [];
  private isProcessing = false;

  constructor() {
    super();
    this.crossReferenceMapper = new CrossReferenceMapper();
    this.initializeFieldLinks();
  }

  /**
   * Initialize field links based on cross-reference mappings
   */
  private initializeFieldLinks() {
    // Device Information Fields
    this.registerFieldLink({
      workflowField: 'device.deviceName',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'coverPage.deviceName', section: '5.1' },
        { documentType: 'FDA3514', fieldPath: 'section1.proprietaryName' },
        { documentType: 'FDA3601', fieldPath: 'deviceIdentification.name' },
        { documentType: 'FDA3881', fieldPath: 'device.tradeName' }
      ],
      validation: { required: true, maxLength: 200 }
    });

    this.registerFieldLink({
      workflowField: 'device.intendedUse',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'indications.intendedUse', section: '6.1' },
        { documentType: 'FDA3514', fieldPath: 'section3.intendedUse' },
        { documentType: 'FDA3881', fieldPath: 'device.indications' }
      ],
      validation: { required: true, maxLength: 5000 }
    });

    this.registerFieldLink({
      workflowField: 'device.classification',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'classification.deviceClass', section: '2.1' },
        { documentType: 'FDA3514', fieldPath: 'section2.classification' },
        { documentType: 'FDA3654', fieldPath: 'regulatory.classification' }
      ],
      validation: { required: true, pattern: '^Class (I|II|III)$' }
    });

    // Manufacturer Information
    this.registerFieldLink({
      workflowField: 'manufacturer.companyName',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'applicant.name', section: '1.1' },
        { documentType: 'FDA3514', fieldPath: 'applicant.organizationName' },
        { documentType: 'FDA3601', fieldPath: 'manufacturer.name' },
        { documentType: 'FDA3881', fieldPath: 'sponsor.companyName' }
      ],
      validation: { required: true, maxLength: 300 }
    });

    this.registerFieldLink({
      workflowField: 'manufacturer.address',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'applicant.address', section: '1.2' },
        { documentType: 'FDA3514', fieldPath: 'applicant.address' },
        { documentType: 'FDA3601', fieldPath: 'manufacturer.facilityAddress' }
      ],
      transform: (value: any) => {
        // Transform address object to formatted string
        if (typeof value === 'object') {
          return `${value.street}, ${value.city}, ${value.state} ${value.zip}, ${value.country}`;
        }
        return value;
      }
    });

    // Predicate Device Information
    this.registerFieldLink({
      workflowField: 'predicate.kNumber',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'substantialEquivalence.predicateDevice', section: '12.1' },
        { documentType: 'FDA3514', fieldPath: 'section5.predicateDeviceNumber' },
        { documentType: 'FDA3881', fieldPath: 'comparison.predicateK' }
      ],
      validation: { 
        required: true, 
        pattern: '^K\\d{6}$'
      },
      transform: (value: string) => value.toUpperCase()
    });

    // Testing Information
    this.registerFieldLink({
      workflowField: 'testing.biocompatibility',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'performance.biocompatibility', section: '14.1' },
        { documentType: 'FDA3654', fieldPath: 'testing.biocompatibilityData' }
      ]
    });

    this.registerFieldLink({
      workflowField: 'testing.sterilization',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'sterilization.method', section: '15.1' },
        { documentType: 'FDA3601', fieldPath: 'processing.sterilizationMethod' }
      ]
    });

    // Labeling
    this.registerFieldLink({
      workflowField: 'labeling.userManual',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'labeling.instructions', section: '11.1' },
        { documentType: 'FDA3514', fieldPath: 'section7.labelingSpecimen' }
      ]
    });

    // Clinical Data
    this.registerFieldLink({
      workflowField: 'clinical.studyProtocol',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'clinical.protocol', section: '21.1' },
        { documentType: 'FDA3654', fieldPath: 'clinical.studyDesign' }
      ]
    });

    console.log(`✅ Smart Field Linking initialized with ${this.fieldLinks.size} field mappings`);
  }

  /**
   * Register a field link between workflow and documents
   */
  private registerFieldLink(link: FieldLink) {
    this.fieldLinks.set(link.workflowField, link);
    
    // Create reverse mapping for document fields
    link.documentFields.forEach(docField => {
      const key = `${docField.documentType}.${docField.fieldPath}`;
      if (!this.fieldSubscriptions.has(key)) {
        this.fieldSubscriptions.set(key, new Set());
      }
      this.fieldSubscriptions.get(key)!.add(link.workflowField);
    });
  }

  /**
   * Resolve the tenant scope a mutation must run under.
   *
   * Accepts the scope either as top-level fields or via `metadata` (the shape
   * the HTTP router already sends). Throws rather than guessing: an update with
   * no provable tenant context is refused.
   */
  private resolveScope(update: FieldUpdate): FieldScope {
    const meta = update.metadata ?? {};
    const organizationId = Number(update.organizationId ?? meta.organizationId);
    const projectId = Number(update.projectId ?? meta.projectId);
    if (
      !Number.isInteger(organizationId) || organizationId <= 0 ||
      !Number.isInteger(projectId) || projectId <= 0
    ) {
      throw new Error('field_update_missing_tenant_context');
    }
    return { organizationId, projectId, userId: update.userId };
  }

  /**
   * Prove the project belongs to the organization before anything is read or
   * written under it. Fails CLOSED when the database is unavailable.
   */
  private async assertProjectInOrg(organizationId: number, projectId: number): Promise<void> {
    if (!db) {
      throw new Error('field_update_database_unavailable');
    }
    const rows = await db
      .select({ id: fda510kProjects.id })
      .from(fda510kProjects)
      .where(
        and(
          eq(fda510kProjects.id, projectId),
          eq(fda510kProjects.organizationId, organizationId)
        )
      )
      .limit(1);
    if (rows.length === 0) {
      throw new Error('project_not_in_organization');
    }
  }

  /**
   * Update a field value and propagate changes.
   *
   * SECURITY (C2C-DEVICE-001): the tenant scope is resolved and the project's
   * ownership is proved BEFORE the update is queued, so an unauthorized write
   * never reaches the propagation path. The queued item carries the resolved
   * scope in both places, so the `fieldUpdated` event subscribers (the SSE
   * stream in fieldSync.routes.ts filters on `metadata.organizationId`) always
   * see a proven tenant.
   */
  async updateField(update: FieldUpdate): Promise<void> {
    const scope = this.resolveScope(update);
    await this.assertProjectInOrg(scope.organizationId, scope.projectId);

    const scoped: FieldUpdate = {
      ...update,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      metadata: {
        ...(update.metadata ?? {}),
        organizationId: scope.organizationId,
        projectId: scope.projectId,
      },
    };

    // Add to queue
    this.updateQueue.push(scoped);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processUpdateQueue();
    }
  }

  /**
   * Process queued updates
   */
  private async processUpdateQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.updateQueue.length > 0) {
      const update = this.updateQueue.shift()!;

      try {
        // Re-resolve rather than trust the queue entry: every propagation runs
        // under an explicit tenant scope or not at all.
        const scope = this.resolveScope(update);

        if (update.source === 'workflow') {
          await this.propagateFromWorkflow(update, scope);
        } else {
          await this.propagateFromDocument(update, scope);
        }

        // Emit update event for real-time sync
        this.emit('fieldUpdated', update);
      } catch (error) {
        console.error('Error processing field update:', error);
        this.emit('updateError', { update, error });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Propagate changes from workflow to documents
   */
  private async propagateFromWorkflow(update: FieldUpdate, scope: FieldScope): Promise<void> {
    const link = this.fieldLinks.get(update.field);
    if (!link) return;

    // Validate field value
    if (link.validation) {
      const validationResult = this.validateField(update.value, link.validation);
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.error}`);
      }
    }

    // Transform value if needed
    const transformedValue = link.transform ? link.transform(update.value) : update.value;

    // Update all linked document fields
    for (const docField of link.documentFields) {
      await this.updateDocumentField(
        docField.documentType,
        docField.fieldPath,
        transformedValue,
        scope
      );
    }
  }

  /**
   * Propagate changes from document to workflow
   */
  private async propagateFromDocument(update: FieldUpdate, scope: FieldScope): Promise<void> {
    const [documentType, ...fieldPathParts] = update.field.split('.');
    const fieldPath = fieldPathParts.join('.');

    const key = `${documentType}.${fieldPath}`;
    const workflowFields = this.fieldSubscriptions.get(key);

    if (!workflowFields) return;

    for (const workflowField of workflowFields) {
      await this.updateWorkflowField(workflowField, update.value, scope);
    }
  }

  /**
   * Update a document field in the database
   */
  private async updateDocumentField(
    documentType: string,
    fieldPath: string,
    value: any,
    scope: FieldScope
  ): Promise<void> {
    if (!db) {
      console.error('Database connection not available');
      return;
    }

    // SECURITY (C2C-DEVICE-001): this SELECT used to match on documentType
    // ALONE, so it read — and then overwrote — whichever tenant's row happened
    // to sort first. Both the read and the write are now bound to the caller's
    // organization AND project, which are notNull columns on this table.
    const documents = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.organizationId, scope.organizationId),
          eq(fda510kDocuments.projectId, scope.projectId),
          eq(fda510kDocuments.documentType, documentType)
        )
      )
      .orderBy(desc(fda510kDocuments.version))
      .limit(1);

    if (documents.length > 0) {
      const document = documents[0];
      const content = typeof document.content === 'string'
        ? JSON.parse(document.content)
        : (document.content ?? {});

      // Update nested field using path
      this.setNestedField(content, fieldPath, value);

      await db
        .update(fda510kDocuments)
        .set({
          content: JSON.stringify(content),
          updatedBy: scope.userId ?? document.updatedBy,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(fda510kDocuments.id, document.id),
            eq(fda510kDocuments.organizationId, scope.organizationId),
            eq(fda510kDocuments.projectId, scope.projectId)
          )
        );
    }
  }

  /**
   * Update a workflow field in the database
   */
  private async updateWorkflowField(
    fieldPath: string,
    value: any,
    scope: FieldScope
  ): Promise<void> {
    if (!db) {
      console.error('Database connection not available');
      return;
    }

    // Parse field path to determine stage and section
    const [category] = fieldPath.split('.');

    const mapping = STAGE_MAPPING[category];
    if (!mapping) return;

    // SECURITY (C2C-DEVICE-001): projectId was not even referenced here, so the
    // first stage-progress row in the WHOLE TABLE matching stage+section was
    // overwritten. fda_510k_stage_progress has no organization_id column — its
    // tenant boundary is transitive through fda_510k_projects, which
    // assertProjectInOrg() proved for this scope before the queue ran.
    const progress = await db
      .select()
      .from(fda510kStageProgress)
      .where(
        and(
          eq(fda510kStageProgress.projectId, scope.projectId),
          eq(fda510kStageProgress.stageName, mapping.stage),
          eq(fda510kStageProgress.sectionName, mapping.section)
        )
      )
      .limit(1);

    if (progress.length > 0) {
      const data = (progress[0].collectedData as Record<string, any> | null) || {};
      this.setNestedField(data, fieldPath, value);

      await db
        .update(fda510kStageProgress)
        .set({
          collectedData: data,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(fda510kStageProgress.id, progress[0].id),
            eq(fda510kStageProgress.projectId, scope.projectId)
          )
        );
    }
  }

  /**
   * Keys that must never be traversed or assigned when walking a dotted field
   * path, because they resolve to the object prototype rather than to data.
   *
   * SECURITY: `field` is caller-supplied — it arrives as `data.field` on the
   * socket `update-field` handler and in the body of
   * POST /api/field-sync/update-field. Walking it with `key in current` followed
   * by `current[key] = {}` meant `field = "__proto__.polluted"` resolved
   * `current` to Object.prototype and assigned onto it, polluting EVERY object in
   * the process — a global integrity break reachable by any authenticated user.
   * (Flagged by Semgrep prototype-pollution-loop on the read mirror below; the
   * write path was the exploitable half.)
   */
  private static readonly UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  /**
   * Helper to set nested field value.
   *
   * Rejects prototype-resolving segments outright rather than sanitising them:
   * a field path containing `__proto__` is never legitimate 510(k) data, so
   * refusing is both safe and honest. Intermediate containers are created with
   * a null prototype and own-property checks so no inherited key can be
   * mistaken for existing data.
   */
  private setNestedField(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    for (const key of [...keys, lastKey]) {
      if (SmartFieldLinking.UNSAFE_PATH_KEYS.has(key)) {
        throw new Error(`Unsafe field path segment: ${key}`);
      }
    }

    let current = obj;
    for (const key of keys) {
      // hasOwnProperty, not `in`: `in` sees inherited keys, so an inherited
      // property would be traversed instead of a fresh container being created.
      if (
        !Object.prototype.hasOwnProperty.call(current, key) ||
        typeof current[key] !== 'object' ||
        current[key] === null
      ) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Helper to read a nested field value (mirror of setNestedField).
   * Returns undefined when any segment of the path is absent.
   */
  private getNestedField(obj: any, path: string): any {
    if (obj == null || typeof obj !== 'object') return undefined;
    let current: any = obj;
    for (const key of path.split('.')) {
      // Same guard as setNestedField: a prototype-resolving segment is never
      // real data, and `hasOwnProperty` (not `in`) keeps an inherited property
      // from being reported as a stored field value — which would otherwise let
      // a crafted path make completeness look satisfied.
      if (SmartFieldLinking.UNSAFE_PATH_KEYS.has(key)) return undefined;
      if (
        current == null ||
        typeof current !== 'object' ||
        !Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * Validate field value
   */
  private validateField(value: any, validation: any): { valid: boolean; error?: string } {
    if (validation.required && !value) {
      return { valid: false, error: 'Field is required' };
    }

    if (validation.maxLength && value?.length > validation.maxLength) {
      return { valid: false, error: `Maximum length is ${validation.maxLength}` };
    }

    if (validation.pattern && value) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return { valid: false, error: `Value does not match required pattern: ${validation.pattern}` };
      }
    }

    return { valid: true };
  }

  /**
   * Get all field links for a workflow section
   */
  getFieldLinksForSection(section: string): FieldLink[] {
    const links: FieldLink[] = [];
    
    this.fieldLinks.forEach((link, key) => {
      if (key.startsWith(section)) {
        links.push(link);
      }
    });
    
    return links;
  }

  /**
   * Check field completeness for a project.
   *
   * SECURITY / INTEGRITY (C2C-DEVICE-002): this used to report EVERY required
   * field complete for EVERY project, because checkWorkflowFieldValue() was a
   * `return true` stub — a fabricated 100% readiness signal on a 510(k)
   * submission gate. It now reads the project's real stage-progress data, and
   * anything it cannot determine is reported in `unknown` and counted as NOT
   * complete rather than silently passing.
   *
   * `organizationId` is optional only for signature compatibility with the
   * existing HTTP caller (server/routes/fieldSync.routes.ts already proves
   * project ownership before calling). When supplied — as the socket handler
   * does — the project's tenancy is re-proved here and a foreign project throws
   * `project_not_in_organization`. New callers should always supply it.
   */
  async checkFieldCompleteness(projectId: number, organizationId?: number): Promise<{
    complete: number;
    total: number;
    missing: string[];
    unknown: string[];
  }> {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new Error('field_completeness_missing_project_context');
    }
    if (organizationId !== undefined) {
      if (!Number.isInteger(organizationId) || organizationId <= 0) {
        throw new Error('field_update_missing_tenant_context');
      }
      await this.assertProjectInOrg(organizationId, projectId);
    }

    const missing: string[] = [];
    const unknown: string[] = [];
    let complete = 0;
    const total = this.fieldLinks.size;

    // Check each field link
    for (const [fieldPath, link] of this.fieldLinks) {
      if (link.validation?.required) {
        // Check if field has value in workflow data
        const hasValue = await this.checkWorkflowFieldValue(projectId, fieldPath);

        if (hasValue === true) {
          complete++;
        } else if (hasValue === 'unknown') {
          // Not provable => not complete. Never counted as satisfied.
          unknown.push(fieldPath);
        } else {
          missing.push(fieldPath);
        }
      } else {
        complete++; // Optional fields count as complete
      }
    }

    return { complete, total, missing, unknown };
  }

  /**
   * Check whether a workflow field actually holds a value for this project.
   *
   * Returns true / false when it can be determined from the project's
   * stage-progress data, and the string 'unknown' when it cannot (no database,
   * no stage mapping for the field's category, or a query error). 'unknown' is
   * never treated as satisfied by the caller.
   */
  private async checkWorkflowFieldValue(
    projectId: number,
    fieldPath: string
  ): Promise<boolean | 'unknown'> {
    if (!db) return 'unknown';

    const [category] = fieldPath.split('.');
    const mapping = STAGE_MAPPING[category];
    if (!mapping) return 'unknown';

    try {
      const progress = await db
        .select({ collectedData: fda510kStageProgress.collectedData })
        .from(fda510kStageProgress)
        .where(
          and(
            eq(fda510kStageProgress.projectId, projectId),
            eq(fda510kStageProgress.stageName, mapping.stage),
            eq(fda510kStageProgress.sectionName, mapping.section)
          )
        )
        .limit(1);

      if (progress.length === 0) return false;

      const value = this.getNestedField(progress[0].collectedData, fieldPath);
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    } catch (error) {
      console.error('Error reading workflow field value:', error);
      return 'unknown';
    }
  }

  /**
   * Subscribe to field updates
   */
  subscribeToField(fieldPath: string, callback: (update: FieldUpdate) => void): void {
    this.on(`field:${fieldPath}`, callback);
  }

  /**
   * Unsubscribe from field updates
   */
  unsubscribeFromField(fieldPath: string, callback: (update: FieldUpdate) => void): void {
    this.off(`field:${fieldPath}`, callback);
  }
}

// Export singleton instance
export const smartFieldLinking = new SmartFieldLinking();