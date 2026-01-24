/**
 * Compliance Guardrails SDK Service
 * 
 * Enterprise-grade service providing a pre-submission validation API
 * that enforces regulatory compliance rules programmatically.
 * 
 * Features:
 * - Rule-based validation engine
 * - Customizable guardrail profiles
 * - API for CI/CD integration
 * - Full audit trail for validation runs
 * 
 * Part 11 Compliance: All validations are logged with complete audit trail
 */

import { Pool } from 'pg';
import OpenAI from 'openai';

// Types
export interface GuardrailRule {
  id: string;
  orgId?: string;
  ruleCode: string;
  ruleName: string;
  description: string;
  category: 'content' | 'structure' | 'formatting' | 'reference' | 'regulatory' | 'data_integrity' | 'technical';
  severity: 'error' | 'warning' | 'info';
  applicableTo?: string[];
  submissionTypes?: string[];
  modulePaths?: string[];
  regulatoryBasis?: string;
  guidanceReferences?: string[];
  validationLogic: Record<string, any>;
  errorMessage: string;
  remediationGuidance?: string;
  autoFixAvailable: boolean;
  autoFixLogic?: Record<string, any>;
  isActive: boolean;
  isSystemRule: boolean;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardrailProfile {
  id: string;
  orgId?: string;
  profileCode: string;
  profileName: string;
  description?: string;
  submissionType?: string;
  agency?: string;
  ruleIds: string[];
  severityOverrides?: Record<string, string>;
  disabledRules?: string[];
  customSettings?: Record<string, any>;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationRun {
  id: string;
  programId?: string;
  submissionId?: string;
  documentId?: string;
  profileId: string;
  runType: 'manual' | 'automated' | 'api' | 'ci_cd';
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  totalRulesChecked: number;
  errorCount: number;
  warningCount: number;
  passCount: number;
  overallResult: 'pass' | 'pass_with_warnings' | 'fail';
  executionTimeMs?: number;
  apiClientId?: string;
  triggeredBy: string;
}

export interface ValidationFinding {
  id: string;
  runId: string;
  ruleId: string;
  ruleCode: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  location?: Record<string, any>;
  foundValue?: string;
  expectedValue?: string;
  message: string;
  remediationGuidance?: string;
  autoFixApplied: boolean;
  autoFixResult?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  acknowledgeReason?: string;
}

export interface ValidationResult {
  runId: string;
  status: 'pass' | 'pass_with_warnings' | 'fail';
  summary: {
    totalRules: number;
    passed: number;
    errors: number;
    warnings: number;
    infos: number;
    executionTimeMs: number;
  };
  findings: ValidationFinding[];
  canProceed: boolean;
  blockingFindings: ValidationFinding[];
}

export interface APIAuditEntry {
  id: string;
  apiKeyId?: string;
  clientId?: string;
  endpoint: string;
  method: string;
  requestBody?: Record<string, any>;
  responseStatus: number;
  responseTime: number;
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  createdAt: Date;
}

// Validation function types
type ValidationFunction = (content: any, rule: GuardrailRule, context: ValidationContext) => ValidationCheckResult;

interface ValidationContext {
  submissionType?: string;
  modulePath?: string;
  agency?: string;
  allContent?: Map<string, any>;
}

interface ValidationCheckResult {
  passed: boolean;
  foundValue?: string;
  expectedValue?: string;
  location?: Record<string, any>;
}

export class ComplianceGuardrailsSDKService {
  private pool: Pool;
  private openai: OpenAI;
  private validationFunctions: Map<string, ValidationFunction>;

  constructor(pool: Pool, openaiApiKey?: string) {
    this.pool = pool;
    this.openai = new OpenAI({ apiKey: openaiApiKey || process.env.OPENAI_API_KEY });
    this.validationFunctions = new Map();
    this.registerBuiltInValidators();
  }

  // ==================== RULE MANAGEMENT ====================

  /**
   * Create a new guardrail rule
   */
  async createRule(rule: Partial<GuardrailRule>): Promise<GuardrailRule> {
    const result = await this.pool.query(`
      INSERT INTO innovation.guardrail_rules (
        org_id, rule_code, rule_name, description, category, severity,
        applicable_to, submission_types, module_paths, regulatory_basis,
        guidance_references, validation_logic, error_message,
        remediation_guidance, auto_fix_available, auto_fix_logic,
        is_active, is_system_rule, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      rule.orgId,
      rule.ruleCode,
      rule.ruleName,
      rule.description,
      rule.category,
      rule.severity || 'warning',
      rule.applicableTo,
      rule.submissionTypes,
      rule.modulePaths,
      rule.regulatoryBasis,
      rule.guidanceReferences,
      JSON.stringify(rule.validationLogic),
      rule.errorMessage,
      rule.remediationGuidance,
      rule.autoFixAvailable || false,
      rule.autoFixLogic ? JSON.stringify(rule.autoFixLogic) : null,
      true,
      false,
      rule.version || '1.0'
    ]);

    return this.mapRule(result.rows[0]);
  }

  /**
   * Get rules with filters
   */
  async getRules(options: {
    orgId?: string;
    category?: string;
    severity?: string;
    submissionType?: string;
    modulePath?: string;
    activeOnly?: boolean;
  } = {}): Promise<GuardrailRule[]> {
    let query = `SELECT * FROM innovation.guardrail_rules WHERE 1=1`;
    const params: any[] = [];

    if (options.orgId) {
      params.push(options.orgId);
      query += ` AND (org_id IS NULL OR org_id = $${params.length})`;
    } else {
      query += ` AND org_id IS NULL`; // System rules only
    }
    if (options.category) {
      params.push(options.category);
      query += ` AND category = $${params.length}`;
    }
    if (options.severity) {
      params.push(options.severity);
      query += ` AND severity = $${params.length}`;
    }
    if (options.submissionType) {
      params.push(options.submissionType);
      query += ` AND (submission_types IS NULL OR $${params.length} = ANY(submission_types))`;
    }
    if (options.modulePath) {
      params.push(options.modulePath);
      query += ` AND (module_paths IS NULL OR $${params.length} = ANY(module_paths))`;
    }
    if (options.activeOnly !== false) {
      query += ` AND is_active = TRUE`;
    }

    query += ` ORDER BY 
      CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      category, rule_code`;

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapRule);
  }

  /**
   * Get rule by ID
   */
  async getRule(ruleId: string): Promise<GuardrailRule | null> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.guardrail_rules WHERE id = $1
    `, [ruleId]);

    return result.rows.length > 0 ? this.mapRule(result.rows[0]) : null;
  }

  // ==================== PROFILE MANAGEMENT ====================

  /**
   * Create a guardrail profile
   */
  async createProfile(profile: Partial<GuardrailProfile>): Promise<GuardrailProfile> {
    const result = await this.pool.query(`
      INSERT INTO innovation.guardrail_profiles (
        org_id, profile_code, profile_name, description, submission_type,
        agency, rule_ids, severity_overrides, disabled_rules, custom_settings,
        is_default, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
      RETURNING *
    `, [
      profile.orgId,
      profile.profileCode,
      profile.profileName,
      profile.description,
      profile.submissionType,
      profile.agency,
      profile.ruleIds,
      profile.severityOverrides ? JSON.stringify(profile.severityOverrides) : null,
      profile.disabledRules,
      profile.customSettings ? JSON.stringify(profile.customSettings) : null,
      profile.isDefault || false
    ]);

    return this.mapProfile(result.rows[0]);
  }

  /**
   * Get profiles
   */
  async getProfiles(options: {
    orgId?: string;
    submissionType?: string;
    agency?: string;
  } = {}): Promise<GuardrailProfile[]> {
    let query = `SELECT * FROM innovation.guardrail_profiles WHERE is_active = TRUE`;
    const params: any[] = [];

    if (options.orgId) {
      params.push(options.orgId);
      query += ` AND (org_id IS NULL OR org_id = $${params.length})`;
    }
    if (options.submissionType) {
      params.push(options.submissionType);
      query += ` AND (submission_type IS NULL OR submission_type = $${params.length})`;
    }
    if (options.agency) {
      params.push(options.agency);
      query += ` AND (agency IS NULL OR agency = $${params.length})`;
    }

    query += ` ORDER BY is_default DESC, profile_name`;

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapProfile);
  }

  /**
   * Get default profile for context
   */
  async getDefaultProfile(options: {
    orgId?: string;
    submissionType?: string;
    agency?: string;
  }): Promise<GuardrailProfile | null> {
    const profiles = await this.getProfiles(options);
    return profiles.find(p => p.isDefault) || profiles[0] || null;
  }

  // ==================== VALIDATION ENGINE ====================

  /**
   * Run validation against content
   */
  async validate(options: {
    content: any;
    contentType: 'document' | 'section' | 'field' | 'submission';
    profileId?: string;
    programId?: string;
    submissionId?: string;
    documentId?: string;
    submissionType?: string;
    modulePath?: string;
    runType?: 'manual' | 'automated' | 'api' | 'ci_cd';
    triggeredBy?: string;
    apiClientId?: string;
  }): Promise<ValidationResult> {
    const startTime = Date.now();

    // Get profile
    let profile: GuardrailProfile | null = null;
    if (options.profileId) {
      const profileResult = await this.pool.query(`
        SELECT * FROM innovation.guardrail_profiles WHERE id = $1
      `, [options.profileId]);
      if (profileResult.rows.length > 0) {
        profile = this.mapProfile(profileResult.rows[0]);
      }
    } else {
      profile = await this.getDefaultProfile({
        submissionType: options.submissionType
      });
    }

    if (!profile) {
      throw new Error('No validation profile available');
    }

    // Create validation run
    const runResult = await this.pool.query(`
      INSERT INTO innovation.guardrail_validation_runs (
        program_id, submission_id, document_id, profile_id, run_type,
        status, started_at, triggered_by, api_client_id
      ) VALUES ($1, $2, $3, $4, $5, 'running', NOW(), $6, $7)
      RETURNING *
    `, [
      options.programId,
      options.submissionId,
      options.documentId,
      profile.id,
      options.runType || 'manual',
      options.triggeredBy || 'system',
      options.apiClientId
    ]);

    const runId = runResult.rows[0].id;
    const findings: ValidationFinding[] = [];

    // Get rules for this profile
    const rules = await this.getRulesForProfile(profile);
    const context: ValidationContext = {
      submissionType: options.submissionType,
      modulePath: options.modulePath
    };

    let passCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Run each rule
    for (const rule of rules) {
      // Check if rule is disabled
      if (profile.disabledRules?.includes(rule.id)) {
        continue;
      }

      // Check applicability
      if (!this.isRuleApplicable(rule, options)) {
        passCount++;
        continue;
      }

      // Get effective severity (may be overridden)
      const effectiveSeverity = profile.severityOverrides?.[rule.id] || rule.severity;

      // Execute validation
      const result = await this.executeRule(rule, options.content, context);

      if (result.passed) {
        passCount++;
      } else {
        // Record finding
        const findingResult = await this.pool.query(`
          INSERT INTO innovation.guardrail_findings (
            run_id, rule_id, rule_code, severity, category, location,
            found_value, expected_value, message, remediation_guidance,
            auto_fix_applied
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)
          RETURNING *
        `, [
          runId,
          rule.id,
          rule.ruleCode,
          effectiveSeverity,
          rule.category,
          result.location ? JSON.stringify(result.location) : null,
          result.foundValue,
          result.expectedValue,
          rule.errorMessage,
          rule.remediationGuidance
        ]);

        const finding = this.mapFinding(findingResult.rows[0]);
        findings.push(finding);

        switch (effectiveSeverity) {
          case 'error':
            errorCount++;
            break;
          case 'warning':
            warningCount++;
            break;
          case 'info':
            infoCount++;
            break;
        }
      }
    }

    // Determine overall result
    let overallResult: 'pass' | 'pass_with_warnings' | 'fail';
    if (errorCount > 0) {
      overallResult = 'fail';
    } else if (warningCount > 0) {
      overallResult = 'pass_with_warnings';
    } else {
      overallResult = 'pass';
    }

    const executionTimeMs = Date.now() - startTime;

    // Update run with results
    await this.pool.query(`
      UPDATE innovation.guardrail_validation_runs
      SET status = 'completed',
          completed_at = NOW(),
          total_rules_checked = $2,
          error_count = $3,
          warning_count = $4,
          pass_count = $5,
          overall_result = $6,
          execution_time_ms = $7
      WHERE id = $1
    `, [runId, rules.length, errorCount, warningCount, passCount, overallResult, executionTimeMs]);

    return {
      runId,
      status: overallResult,
      summary: {
        totalRules: rules.length,
        passed: passCount,
        errors: errorCount,
        warnings: warningCount,
        infos: infoCount,
        executionTimeMs
      },
      findings,
      canProceed: errorCount === 0,
      blockingFindings: findings.filter(f => f.severity === 'error')
    };
  }

  /**
   * Get rules for a profile
   */
  private async getRulesForProfile(profile: GuardrailProfile): Promise<GuardrailRule[]> {
    if (profile.ruleIds && profile.ruleIds.length > 0) {
      const result = await this.pool.query(`
        SELECT * FROM innovation.guardrail_rules
        WHERE id = ANY($1) AND is_active = TRUE
        ORDER BY 
          CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
          category
      `, [profile.ruleIds]);
      return result.rows.map(this.mapRule);
    }

    // Default: get all applicable rules
    return this.getRules({
      orgId: profile.orgId || undefined,
      submissionType: profile.submissionType || undefined
    });
  }

  /**
   * Check if rule is applicable
   */
  private isRuleApplicable(rule: GuardrailRule, options: any): boolean {
    if (rule.submissionTypes && options.submissionType) {
      if (!rule.submissionTypes.includes(options.submissionType)) {
        return false;
      }
    }
    if (rule.modulePaths && options.modulePath) {
      if (!rule.modulePaths.some(p => options.modulePath.startsWith(p))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute a single rule
   */
  private async executeRule(
    rule: GuardrailRule,
    content: any,
    context: ValidationContext
  ): Promise<ValidationCheckResult> {
    const logic = rule.validationLogic;

    // Try custom validator first
    if (this.validationFunctions.has(rule.ruleCode)) {
      const validator = this.validationFunctions.get(rule.ruleCode)!;
      return validator(content, rule, context);
    }

    // Built-in validation types
    switch (logic.type) {
      case 'required_field':
        return this.validateRequiredField(content, logic);
      
      case 'regex_pattern':
        return this.validateRegexPattern(content, logic);
      
      case 'length_constraint':
        return this.validateLengthConstraint(content, logic);
      
      case 'value_range':
        return this.validateValueRange(content, logic);
      
      case 'enum_value':
        return this.validateEnumValue(content, logic);
      
      case 'cross_reference':
        return this.validateCrossReference(content, logic, context);
      
      case 'custom_function':
        return this.validateCustomFunction(content, logic);
      
      default:
        // Unknown validation type - pass by default
        console.warn(`[GuardrailsSDK] Unknown validation type: ${logic.type}`);
        return { passed: true };
    }
  }

  // ==================== BUILT-IN VALIDATORS ====================

  private registerBuiltInValidators(): void {
    // Register any custom validators here
    this.validationFunctions.set('CTD_SECTION_REQUIRED', (content, rule, context) => {
      const sectionPath = rule.validationLogic.sectionPath;
      const hasSection = this.checkNestedPath(content, sectionPath);
      return {
        passed: hasSection,
        expectedValue: `Section at ${sectionPath}`,
        foundValue: hasSection ? 'Present' : 'Missing'
      };
    });

    this.validationFunctions.set('DATE_FORMAT_CHECK', (content, rule, context) => {
      const fieldPath = rule.validationLogic.fieldPath;
      const value = this.getNestedValue(content, fieldPath);
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const passed = !value || dateRegex.test(value);
      return {
        passed,
        expectedValue: 'YYYY-MM-DD format',
        foundValue: value
      };
    });
  }

  private validateRequiredField(content: any, logic: any): ValidationCheckResult {
    const fieldPath = logic.fieldPath || logic.path;
    const value = this.getNestedValue(content, fieldPath);
    const passed = value !== undefined && value !== null && value !== '';
    return {
      passed,
      expectedValue: 'Non-empty value',
      foundValue: value ? String(value).substring(0, 100) : '(empty)',
      location: { path: fieldPath }
    };
  }

  private validateRegexPattern(content: any, logic: any): ValidationCheckResult {
    const fieldPath = logic.fieldPath || logic.path;
    const pattern = new RegExp(logic.pattern, logic.flags || '');
    const value = this.getNestedValue(content, fieldPath);
    const passed = !value || pattern.test(String(value));
    return {
      passed,
      expectedValue: `Pattern: ${logic.pattern}`,
      foundValue: value ? String(value).substring(0, 100) : '(empty)',
      location: { path: fieldPath }
    };
  }

  private validateLengthConstraint(content: any, logic: any): ValidationCheckResult {
    const fieldPath = logic.fieldPath || logic.path;
    const value = this.getNestedValue(content, fieldPath);
    const length = value ? String(value).length : 0;
    let passed = true;

    if (logic.minLength !== undefined && length < logic.minLength) {
      passed = false;
    }
    if (logic.maxLength !== undefined && length > logic.maxLength) {
      passed = false;
    }

    return {
      passed,
      expectedValue: `Length ${logic.minLength || 0}-${logic.maxLength || '∞'}`,
      foundValue: `Length: ${length}`,
      location: { path: fieldPath }
    };
  }

  private validateValueRange(content: any, logic: any): ValidationCheckResult {
    const fieldPath = logic.fieldPath || logic.path;
    const value = this.getNestedValue(content, fieldPath);
    const numValue = parseFloat(value);
    let passed = true;

    if (!isNaN(numValue)) {
      if (logic.min !== undefined && numValue < logic.min) passed = false;
      if (logic.max !== undefined && numValue > logic.max) passed = false;
    }

    return {
      passed,
      expectedValue: `Range: ${logic.min ?? '-∞'} to ${logic.max ?? '∞'}`,
      foundValue: String(value),
      location: { path: fieldPath }
    };
  }

  private validateEnumValue(content: any, logic: any): ValidationCheckResult {
    const fieldPath = logic.fieldPath || logic.path;
    const value = this.getNestedValue(content, fieldPath);
    const allowedValues = logic.allowedValues || [];
    const passed = !value || allowedValues.includes(value);

    return {
      passed,
      expectedValue: `One of: ${allowedValues.join(', ')}`,
      foundValue: String(value),
      location: { path: fieldPath }
    };
  }

  private validateCrossReference(content: any, logic: any, context: ValidationContext): ValidationCheckResult {
    const sourceField = logic.sourceField;
    const targetField = logic.targetField;
    const sourceValue = this.getNestedValue(content, sourceField);
    
    // Check if referenced value exists in context
    let targetValue = null;
    if (context.allContent) {
      for (const [key, doc] of context.allContent.entries()) {
        const val = this.getNestedValue(doc, targetField);
        if (val === sourceValue) {
          targetValue = val;
          break;
        }
      }
    }

    const passed = !sourceValue || targetValue !== null;
    return {
      passed,
      expectedValue: `Reference to existing ${targetField}`,
      foundValue: sourceValue ? `Reference: ${sourceValue}` : '(empty)',
      location: { sourcePath: sourceField, targetPath: targetField }
    };
  }

  private validateCustomFunction(content: any, logic: any): ValidationCheckResult {
    // Custom functions should be registered separately
    const funcName = logic.functionName;
    if (this.validationFunctions.has(funcName)) {
      const validator = this.validationFunctions.get(funcName)!;
      return validator(content, { validationLogic: logic } as any, {});
    }
    return { passed: true };
  }

  // ==================== UTILITY METHODS ====================

  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  private checkNestedPath(obj: any, path: string): boolean {
    return this.getNestedValue(obj, path) !== undefined;
  }

  // ==================== API AUDIT ====================

  /**
   * Log API call for audit
   */
  async logAPICall(entry: Partial<APIAuditEntry>): Promise<void> {
    await this.pool.query(`
      INSERT INTO innovation.guardrail_api_audit (
        api_key_id, client_id, endpoint, method, request_body,
        response_status, response_time, ip_address, user_agent, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      entry.apiKeyId,
      entry.clientId,
      entry.endpoint,
      entry.method,
      entry.requestBody ? JSON.stringify(entry.requestBody) : null,
      entry.responseStatus,
      entry.responseTime,
      entry.ipAddress,
      entry.userAgent,
      entry.errorMessage
    ]);
  }

  // ==================== FINDING MANAGEMENT ====================

  /**
   * Acknowledge a finding
   */
  async acknowledgeFinding(
    findingId: string,
    acknowledgedBy: string,
    reason: string
  ): Promise<ValidationFinding> {
    const result = await this.pool.query(`
      UPDATE innovation.guardrail_findings
      SET acknowledged = TRUE,
          acknowledged_by = $2,
          acknowledged_at = NOW(),
          acknowledge_reason = $3
      WHERE id = $1
      RETURNING *
    `, [findingId, acknowledgedBy, reason]);

    return this.mapFinding(result.rows[0]);
  }

  /**
   * Get findings for a run
   */
  async getRunFindings(runId: string): Promise<ValidationFinding[]> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.guardrail_findings
      WHERE run_id = $1
      ORDER BY 
        CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        category
    `, [runId]);

    return result.rows.map(this.mapFinding);
  }

  /**
   * Get validation history
   */
  async getValidationHistory(options: {
    programId?: string;
    submissionId?: string;
    documentId?: string;
    limit?: number;
  }): Promise<ValidationRun[]> {
    let query = `SELECT * FROM innovation.guardrail_validation_runs WHERE 1=1`;
    const params: any[] = [];

    if (options.programId) {
      params.push(options.programId);
      query += ` AND program_id = $${params.length}`;
    }
    if (options.submissionId) {
      params.push(options.submissionId);
      query += ` AND submission_id = $${params.length}`;
    }
    if (options.documentId) {
      params.push(options.documentId);
      query += ` AND document_id = $${params.length}`;
    }

    query += ` ORDER BY started_at DESC`;

    if (options.limit) {
      params.push(options.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapRun);
  }

  // ==================== STATISTICS ====================

  /**
   * Get validation statistics
   */
  async getStatistics(options: {
    programId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<{
    totalRuns: number;
    byResult: Record<string, number>;
    avgExecutionTime: number;
    topFailingRules: Array<{ ruleCode: string; count: number }>;
    trendData: Array<{ date: string; pass: number; fail: number }>;
  }> {
    const params: any[] = [];
    let whereClause = '1=1';

    if (options.programId) {
      params.push(options.programId);
      whereClause += ` AND program_id = $${params.length}`;
    }
    if (options.dateFrom) {
      params.push(options.dateFrom);
      whereClause += ` AND started_at >= $${params.length}`;
    }
    if (options.dateTo) {
      params.push(options.dateTo);
      whereClause += ` AND started_at <= $${params.length}`;
    }

    // Basic stats
    const statsResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        overall_result,
        AVG(execution_time_ms) as avg_time
      FROM innovation.guardrail_validation_runs
      WHERE ${whereClause} AND status = 'completed'
      GROUP BY overall_result
    `, params);

    let totalRuns = 0;
    const byResult: Record<string, number> = {};
    let avgExecutionTime = 0;

    for (const row of statsResult.rows) {
      byResult[row.overall_result] = parseInt(row.total);
      totalRuns += parseInt(row.total);
      avgExecutionTime = parseFloat(row.avg_time);
    }

    // Top failing rules
    const failingResult = await this.pool.query(`
      SELECT gf.rule_code, COUNT(*) as count
      FROM innovation.guardrail_findings gf
      JOIN innovation.guardrail_validation_runs gvr ON gvr.id = gf.run_id
      WHERE ${whereClause.replace(/program_id/g, 'gvr.program_id').replace(/started_at/g, 'gvr.started_at')}
        AND gf.severity = 'error'
      GROUP BY gf.rule_code
      ORDER BY count DESC
      LIMIT 10
    `, params);

    const topFailingRules = failingResult.rows.map(row => ({
      ruleCode: row.rule_code,
      count: parseInt(row.count)
    }));

    // Trend data (last 30 days)
    const trendResult = await this.pool.query(`
      SELECT 
        DATE(started_at) as date,
        COUNT(*) FILTER (WHERE overall_result = 'pass') as pass,
        COUNT(*) FILTER (WHERE overall_result IN ('fail', 'pass_with_warnings')) as fail
      FROM innovation.guardrail_validation_runs
      WHERE ${whereClause} AND started_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(started_at)
      ORDER BY date
    `, params);

    const trendData = trendResult.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      pass: parseInt(row.pass),
      fail: parseInt(row.fail)
    }));

    return {
      totalRuns,
      byResult,
      avgExecutionTime,
      topFailingRules,
      trendData
    };
  }

  // ==================== MAPPERS ====================

  private mapRule(row: any): GuardrailRule {
    return {
      id: row.id,
      orgId: row.org_id,
      ruleCode: row.rule_code,
      ruleName: row.rule_name,
      description: row.description,
      category: row.category,
      severity: row.severity,
      applicableTo: row.applicable_to,
      submissionTypes: row.submission_types,
      modulePaths: row.module_paths,
      regulatoryBasis: row.regulatory_basis,
      guidanceReferences: row.guidance_references,
      validationLogic: row.validation_logic,
      errorMessage: row.error_message,
      remediationGuidance: row.remediation_guidance,
      autoFixAvailable: row.auto_fix_available,
      autoFixLogic: row.auto_fix_logic,
      isActive: row.is_active,
      isSystemRule: row.is_system_rule,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapProfile(row: any): GuardrailProfile {
    return {
      id: row.id,
      orgId: row.org_id,
      profileCode: row.profile_code,
      profileName: row.profile_name,
      description: row.description,
      submissionType: row.submission_type,
      agency: row.agency,
      ruleIds: row.rule_ids || [],
      severityOverrides: row.severity_overrides,
      disabledRules: row.disabled_rules,
      customSettings: row.custom_settings,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapRun(row: any): ValidationRun {
    return {
      id: row.id,
      programId: row.program_id,
      submissionId: row.submission_id,
      documentId: row.document_id,
      profileId: row.profile_id,
      runType: row.run_type,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalRulesChecked: parseInt(row.total_rules_checked) || 0,
      errorCount: parseInt(row.error_count) || 0,
      warningCount: parseInt(row.warning_count) || 0,
      passCount: parseInt(row.pass_count) || 0,
      overallResult: row.overall_result,
      executionTimeMs: row.execution_time_ms ? parseInt(row.execution_time_ms) : undefined,
      apiClientId: row.api_client_id,
      triggeredBy: row.triggered_by
    };
  }

  private mapFinding(row: any): ValidationFinding {
    return {
      id: row.id,
      runId: row.run_id,
      ruleId: row.rule_id,
      ruleCode: row.rule_code,
      severity: row.severity,
      category: row.category,
      location: row.location,
      foundValue: row.found_value,
      expectedValue: row.expected_value,
      message: row.message,
      remediationGuidance: row.remediation_guidance,
      autoFixApplied: row.auto_fix_applied,
      autoFixResult: row.auto_fix_result,
      acknowledged: row.acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      acknowledgeReason: row.acknowledge_reason
    };
  }
}

export default ComplianceGuardrailsSDKService;
