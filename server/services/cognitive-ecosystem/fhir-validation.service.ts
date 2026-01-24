/**
 * =============================================================================
 * FHIR Validation Engine
 * =============================================================================
 * Enterprise FHIR validation service implementing FHIRPath expressions,
 * validation rules, and comprehensive resource validation.
 * 
 * Features:
 * - FHIR R4/R5 resource validation
 * - FHIRPath expression execution
 * - Custom validation rule management
 * - Profile-based validation
 * - Batch validation support
 * - Severity-based result categorization
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  FHIRValidationRule,
  FHIRValidationRuleType,
  FHIRSeverity,
  FHIRValidationResult,
  FHIRValidationStatus,
  FHIRValidationIssue,
  ServiceResult,
  PaginatedResult
} from './types';

export interface FHIRValidationConfig {
  pool: Pool;
  enableCaching?: boolean;
  cacheTimeoutMs?: number;
  maxBatchSize?: number;
}

export interface ValidationRequest {
  resource: Record<string, unknown>;
  profileUrl?: string;
  ruleIds?: string[];
  includeWarnings?: boolean;
}

export interface BatchValidationRequest {
  resources: ValidationRequest[];
  stopOnFirstError?: boolean;
}

export class FHIRValidationEngine {
  private pool: Pool;
  private readonly fhirSchema = 'fhir';
  private readonly enableCaching: boolean;
  private readonly cacheTimeoutMs: number;
  private readonly maxBatchSize: number;
  private ruleCache: Map<string, FHIRValidationRule[]> = new Map();
  private ruleCacheTime: Map<string, number> = new Map();

  constructor(config: FHIRValidationConfig) {
    this.pool = config.pool;
    this.enableCaching = config.enableCaching ?? true;
    this.cacheTimeoutMs = config.cacheTimeoutMs ?? 300000; // 5 minutes
    this.maxBatchSize = config.maxBatchSize ?? 100;
  }

  // ===========================================================================
  // VALIDATION RULES MANAGEMENT
  // ===========================================================================

  /**
   * Create a validation rule
   */
  async createValidationRule(
    rule: Omit<FHIRValidationRule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<FHIRValidationRule>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.fhirSchema}.validation_rules (
          id, tenant_id, rule_name, rule_type, resource_type, fhir_path,
          expression, error_message, severity, profile_url, is_active,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          id,
          rule.tenantId,
          rule.ruleName,
          rule.ruleType,
          rule.resourceType,
          rule.fhirPath,
          rule.expression,
          rule.errorMessage,
          rule.severity,
          rule.profileUrl,
          rule.isActive ?? true,
          now,
          now
        ]
      );

      // Invalidate cache
      this.invalidateRuleCache(rule.tenantId, rule.resourceType);

      return {
        success: true,
        data: this.mapValidationRule(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RULE_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get validation rules for a resource type
   */
  async getValidationRules(
    tenantId: string,
    resourceType: string,
    options?: { profileUrl?: string; includeInactive?: boolean }
  ): Promise<ServiceResult<FHIRValidationRule[]>> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = `${tenantId}:${resourceType}:${options?.profileUrl || 'default'}`;
      if (this.enableCaching && this.isCacheValid(cacheKey)) {
        return {
          success: true,
          data: this.ruleCache.get(cacheKey) || [],
          metadata: { executionTimeMs: Date.now() - startTime, cached: true }
        };
      }

      let whereClause = 'WHERE tenant_id = $1 AND resource_type = $2';
      const params: unknown[] = [tenantId, resourceType];
      let paramIndex = 3;

      if (!options?.includeInactive) {
        whereClause += ' AND is_active = true';
      }

      if (options?.profileUrl) {
        whereClause += ` AND (profile_url = $${paramIndex++} OR profile_url IS NULL)`;
        params.push(options.profileUrl);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.fhirSchema}.validation_rules 
         ${whereClause}
         ORDER BY severity DESC, rule_name`,
        params
      );

      const rules = result.rows.map(this.mapValidationRule);

      // Update cache
      if (this.enableCaching) {
        this.ruleCache.set(cacheKey, rules);
        this.ruleCacheTime.set(cacheKey, Date.now());
      }

      return {
        success: true,
        data: rules,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RULES_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update a validation rule
   */
  async updateValidationRule(
    ruleId: string,
    updates: Partial<Omit<FHIRValidationRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ServiceResult<FHIRValidationRule>> {
    const startTime = Date.now();

    try {
      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (updates.ruleName !== undefined) {
        updateFields.push(`rule_name = $${paramIndex++}`);
        params.push(updates.ruleName);
      }
      if (updates.ruleType !== undefined) {
        updateFields.push(`rule_type = $${paramIndex++}`);
        params.push(updates.ruleType);
      }
      if (updates.resourceType !== undefined) {
        updateFields.push(`resource_type = $${paramIndex++}`);
        params.push(updates.resourceType);
      }
      if (updates.fhirPath !== undefined) {
        updateFields.push(`fhir_path = $${paramIndex++}`);
        params.push(updates.fhirPath);
      }
      if (updates.expression !== undefined) {
        updateFields.push(`expression = $${paramIndex++}`);
        params.push(updates.expression);
      }
      if (updates.errorMessage !== undefined) {
        updateFields.push(`error_message = $${paramIndex++}`);
        params.push(updates.errorMessage);
      }
      if (updates.severity !== undefined) {
        updateFields.push(`severity = $${paramIndex++}`);
        params.push(updates.severity);
      }
      if (updates.profileUrl !== undefined) {
        updateFields.push(`profile_url = $${paramIndex++}`);
        params.push(updates.profileUrl);
      }
      if (updates.isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        params.push(updates.isActive);
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(ruleId);

      const result = await this.pool.query(
        `UPDATE ${this.fhirSchema}.validation_rules 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Rule not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const rule = this.mapValidationRule(result.rows[0]);
      
      // Invalidate cache
      this.invalidateRuleCache(rule.tenantId, rule.resourceType);

      return {
        success: true,
        data: rule,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RULE_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Delete a validation rule
   */
  async deleteValidationRule(ruleId: string): Promise<ServiceResult<void>> {
    const startTime = Date.now();

    try {
      // Get rule first for cache invalidation
      const ruleResult = await this.pool.query(
        `SELECT tenant_id, resource_type FROM ${this.fhirSchema}.validation_rules WHERE id = $1`,
        [ruleId]
      );

      if (ruleResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Rule not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      await this.pool.query(
        `DELETE FROM ${this.fhirSchema}.validation_rules WHERE id = $1`,
        [ruleId]
      );

      // Invalidate cache
      this.invalidateRuleCache(ruleResult.rows[0].tenant_id, ruleResult.rows[0].resource_type);

      return {
        success: true,
        data: undefined,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RULE_DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // RESOURCE VALIDATION
  // ===========================================================================

  /**
   * Validate a FHIR resource
   */
  async validateResource(
    tenantId: string,
    request: ValidationRequest
  ): Promise<ServiceResult<FHIRValidationResult>> {
    const startTime = Date.now();

    try {
      const resource = request.resource;
      const resourceType = resource.resourceType as string;

      if (!resourceType) {
        return {
          success: false,
          error: { code: 'INVALID_RESOURCE', message: 'Resource must have resourceType' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Get applicable rules
      const rulesResult = await this.getValidationRules(tenantId, resourceType, {
        profileUrl: request.profileUrl
      });

      if (!rulesResult.success) {
        return {
          success: false,
          error: rulesResult.error,
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      let rules = rulesResult.data!;

      // Filter by specific rule IDs if provided
      if (request.ruleIds && request.ruleIds.length > 0) {
        rules = rules.filter(r => request.ruleIds!.includes(r.id));
      }

      // Execute validation rules
      const issues: FHIRValidationIssue[] = [];
      let hasError = false;

      for (const rule of rules) {
        const ruleResult = this.executeRule(rule, resource);
        
        if (!ruleResult.passed) {
          const issue: FHIRValidationIssue = {
            severity: rule.severity,
            code: rule.ruleType,
            diagnostics: rule.errorMessage,
            location: rule.fhirPath || resourceType,
            ruleId: rule.id
          };

          if (rule.severity === FHIRSeverity.ERROR || rule.severity === FHIRSeverity.FATAL) {
            hasError = true;
          }

          if (request.includeWarnings || rule.severity !== FHIRSeverity.WARNING) {
            issues.push(issue);
          }
        }
      }

      // Store validation result
      const resultId = uuidv4();
      const status = hasError ? FHIRValidationStatus.FAILED : FHIRValidationStatus.PASSED;

      await this.pool.query(
        `INSERT INTO ${this.fhirSchema}.validation_results (
          id, tenant_id, resource_type, resource_id, profile_url,
          validation_status, issues, validated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          resultId,
          tenantId,
          resourceType,
          resource.id as string || null,
          request.profileUrl,
          status,
          JSON.stringify(issues)
        ]
      );

      const validationResult: FHIRValidationResult = {
        id: resultId,
        tenantId,
        resourceType,
        resourceId: resource.id as string,
        profileUrl: request.profileUrl,
        validationStatus: status,
        issues,
        validatedAt: new Date()
      };

      return {
        success: true,
        data: validationResult,
        metadata: { 
          executionTimeMs: Date.now() - startTime,
          rulesEvaluated: rules.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Validate multiple FHIR resources
   */
  async validateBatch(
    tenantId: string,
    request: BatchValidationRequest
  ): Promise<ServiceResult<{
    results: FHIRValidationResult[];
    summary: {
      total: number;
      passed: number;
      failed: number;
      errors: number;
      warnings: number;
    };
  }>> {
    const startTime = Date.now();

    try {
      if (request.resources.length > this.maxBatchSize) {
        return {
          success: false,
          error: { 
            code: 'BATCH_TOO_LARGE', 
            message: `Maximum batch size is ${this.maxBatchSize}` 
          },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const results: FHIRValidationResult[] = [];
      const summary = {
        total: request.resources.length,
        passed: 0,
        failed: 0,
        errors: 0,
        warnings: 0
      };

      for (const validationRequest of request.resources) {
        const result = await this.validateResource(tenantId, validationRequest);

        if (!result.success) {
          if (request.stopOnFirstError) {
            return {
              success: false,
              error: result.error,
              metadata: { 
                executionTimeMs: Date.now() - startTime,
                processedCount: results.length
              }
            };
          }
          summary.failed++;
          continue;
        }

        const validationResult = result.data!;
        results.push(validationResult);

        if (validationResult.validationStatus === FHIRValidationStatus.PASSED) {
          summary.passed++;
        } else {
          summary.failed++;
        }

        for (const issue of validationResult.issues) {
          if (issue.severity === FHIRSeverity.ERROR || issue.severity === FHIRSeverity.FATAL) {
            summary.errors++;
          } else if (issue.severity === FHIRSeverity.WARNING) {
            summary.warnings++;
          }
        }
      }

      return {
        success: true,
        data: { results, summary },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BATCH_VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get validation history for a resource
   */
  async getValidationHistory(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    options?: { limit?: number }
  ): Promise<ServiceResult<FHIRValidationResult[]>> {
    const startTime = Date.now();

    try {
      const limit = options?.limit || 10;

      const result = await this.pool.query(
        `SELECT * FROM ${this.fhirSchema}.validation_results 
         WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3
         ORDER BY validated_at DESC
         LIMIT $4`,
        [tenantId, resourceType, resourceId, limit]
      );

      return {
        success: true,
        data: result.rows.map(this.mapValidationResult),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HISTORY_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // FHIRPATH EXECUTION
  // ===========================================================================

  /**
   * Evaluate a FHIRPath expression against a resource
   */
  evaluateFHIRPath(resource: Record<string, unknown>, path: string): unknown[] {
    // Simplified FHIRPath evaluation
    // In production, use a proper FHIRPath library like fhirpath.js
    
    const segments = path.split('.');
    let current: unknown[] = [resource];

    for (const segment of segments) {
      const next: unknown[] = [];
      
      for (const item of current) {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          
          // Handle array index notation
          const indexMatch = segment.match(/^(\w+)\[(\d+)\]$/);
          if (indexMatch) {
            const [, field, index] = indexMatch;
            const arr = obj[field];
            if (Array.isArray(arr) && arr[parseInt(index)] !== undefined) {
              next.push(arr[parseInt(index)]);
            }
          }
          // Handle where() function (simplified)
          else if (segment.startsWith('where(')) {
            // Skip where clauses for now
            next.push(item);
          }
          // Handle exists() function
          else if (segment === 'exists()') {
            next.push(current.length > 0);
          }
          // Handle count() function
          else if (segment === 'count()') {
            next.push(current.length);
          }
          // Handle empty() function
          else if (segment === 'empty()') {
            next.push(current.length === 0);
          }
          // Handle regular field access
          else {
            const value = obj[segment];
            if (Array.isArray(value)) {
              next.push(...value);
            } else if (value !== undefined) {
              next.push(value);
            }
          }
        }
      }
      
      current = next;
    }

    return current;
  }

  /**
   * Execute a validation rule against a resource
   */
  private executeRule(
    rule: FHIRValidationRule,
    resource: Record<string, unknown>
  ): { passed: boolean; value?: unknown } {
    try {
      switch (rule.ruleType) {
        case FHIRValidationRuleType.REQUIRED:
          return this.checkRequired(resource, rule.fhirPath || '');
        
        case FHIRValidationRuleType.CARDINALITY:
          return this.checkCardinality(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.PATTERN:
          return this.checkPattern(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.VALUESET:
          return this.checkValueSet(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.REFERENCE:
          return this.checkReference(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.INVARIANT:
          return this.checkInvariant(resource, rule.expression);
        
        case FHIRValidationRuleType.EXTENSION:
          return this.checkExtension(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.SLICE:
          return this.checkSlice(resource, rule.fhirPath || '', rule.expression);
        
        case FHIRValidationRuleType.CUSTOM:
          return this.executeCustomRule(resource, rule);
        
        default:
          return { passed: true };
      }
    } catch (error) {
      // Rule execution error = validation failure
      return { passed: false };
    }
  }

  private checkRequired(resource: Record<string, unknown>, path: string): { passed: boolean } {
    const values = this.evaluateFHIRPath(resource, path);
    return { passed: values.length > 0 && values.some(v => v !== null && v !== undefined && v !== '') };
  }

  private checkCardinality(
    resource: Record<string, unknown>, 
    path: string, 
    expression: string | undefined
  ): { passed: boolean; value?: number } {
    const values = this.evaluateFHIRPath(resource, path);
    const count = values.length;

    if (!expression) return { passed: true, value: count };

    // Parse expression like "0..1" or "1..*"
    const match = expression.match(/^(\d+)\.\.(\d+|\*)$/);
    if (!match) return { passed: true, value: count };

    const min = parseInt(match[1]);
    const max = match[2] === '*' ? Infinity : parseInt(match[2]);

    return { passed: count >= min && count <= max, value: count };
  }

  private checkPattern(
    resource: Record<string, unknown>,
    path: string,
    expression: string | undefined
  ): { passed: boolean } {
    if (!expression) return { passed: true };

    const values = this.evaluateFHIRPath(resource, path);
    const regex = new RegExp(expression);

    return { passed: values.every(v => typeof v === 'string' && regex.test(v)) };
  }

  private checkValueSet(
    resource: Record<string, unknown>,
    path: string,
    expression: string | undefined
  ): { passed: boolean } {
    if (!expression) return { passed: true };

    const values = this.evaluateFHIRPath(resource, path);
    
    try {
      const allowedValues = JSON.parse(expression) as string[];
      return { 
        passed: values.every(v => {
          if (typeof v === 'string') return allowedValues.includes(v);
          if (typeof v === 'object' && v !== null) {
            const code = (v as Record<string, unknown>).code || 
                        (v as Record<string, unknown>).value;
            return allowedValues.includes(code as string);
          }
          return false;
        })
      };
    } catch {
      return { passed: true };
    }
  }

  private checkReference(
    resource: Record<string, unknown>,
    path: string,
    expression: string | undefined
  ): { passed: boolean } {
    const values = this.evaluateFHIRPath(resource, path);
    
    // Check that all values have valid reference format
    return { 
      passed: values.every(v => {
        if (typeof v === 'object' && v !== null) {
          const ref = v as Record<string, unknown>;
          if (ref.reference && typeof ref.reference === 'string') {
            // Validate reference format: ResourceType/id or url
            return /^[A-Z][a-zA-Z]+\/[a-zA-Z0-9\-\.]+$/.test(ref.reference) ||
                   ref.reference.startsWith('http://') ||
                   ref.reference.startsWith('https://') ||
                   ref.reference.startsWith('urn:');
          }
        }
        return false;
      })
    };
  }

  private checkInvariant(
    resource: Record<string, unknown>,
    expression: string | undefined
  ): { passed: boolean } {
    if (!expression) return { passed: true };

    // Execute FHIRPath expression that should return true/false
    const result = this.evaluateFHIRPath(resource, expression);
    return { passed: result.length > 0 && result[0] === true };
  }

  private checkExtension(
    resource: Record<string, unknown>,
    path: string,
    expression: string | undefined
  ): { passed: boolean } {
    // Check for required extension URL
    if (!expression) return { passed: true };

    const extensions = this.evaluateFHIRPath(resource, `${path}.extension`);
    return {
      passed: extensions.some(ext => {
        const e = ext as Record<string, unknown>;
        return e.url === expression;
      })
    };
  }

  private checkSlice(
    resource: Record<string, unknown>,
    path: string,
    expression: string | undefined
  ): { passed: boolean } {
    // Slice validation - simplified
    if (!expression) return { passed: true };

    try {
      const sliceDefinition = JSON.parse(expression) as {
        discriminator: string;
        value: unknown;
        min?: number;
        max?: number;
      };

      const values = this.evaluateFHIRPath(resource, path);
      const matching = values.filter(v => {
        const obj = v as Record<string, unknown>;
        return this.evaluateFHIRPath(obj, sliceDefinition.discriminator)[0] === sliceDefinition.value;
      });

      const min = sliceDefinition.min || 0;
      const max = sliceDefinition.max || Infinity;

      return { passed: matching.length >= min && matching.length <= max };
    } catch {
      return { passed: true };
    }
  }

  private executeCustomRule(
    resource: Record<string, unknown>,
    rule: FHIRValidationRule
  ): { passed: boolean } {
    // Execute custom JavaScript-like validation
    if (!rule.expression) return { passed: true };

    try {
      // Simplified custom rule execution
      // In production, use a proper sandboxed JavaScript executor
      const expr = rule.expression;
      
      // Simple equality check: field == value
      const eqMatch = expr.match(/^(\S+)\s*==\s*['"]?([^'"]+)['"]?$/);
      if (eqMatch) {
        const [, path, expected] = eqMatch;
        const values = this.evaluateFHIRPath(resource, path);
        return { passed: values.some(v => String(v) === expected) };
      }

      // Simple existence check: field.exists()
      const existsMatch = expr.match(/^(\S+)\.exists\(\)$/);
      if (existsMatch) {
        const values = this.evaluateFHIRPath(resource, existsMatch[1]);
        return { passed: values.length > 0 };
      }

      return { passed: true };
    } catch {
      return { passed: false };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private isCacheValid(cacheKey: string): boolean {
    const cacheTime = this.ruleCacheTime.get(cacheKey);
    if (!cacheTime) return false;
    return Date.now() - cacheTime < this.cacheTimeoutMs;
  }

  private invalidateRuleCache(tenantId: string, resourceType: string): void {
    // Remove all cache entries for this tenant/resource combination
    for (const key of this.ruleCache.keys()) {
      if (key.startsWith(`${tenantId}:${resourceType}:`)) {
        this.ruleCache.delete(key);
        this.ruleCacheTime.delete(key);
      }
    }
  }

  /**
   * Clear entire rule cache
   */
  clearCache(): void {
    this.ruleCache.clear();
    this.ruleCacheTime.clear();
  }

  // ===========================================================================
  // BUILT-IN RULES
  // ===========================================================================

  /**
   * Get built-in rules for common resource types
   */
  getBuiltInRules(resourceType: string): Omit<FHIRValidationRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>[] {
    const commonRules: Omit<FHIRValidationRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>[] = [
      {
        ruleName: 'resourceType-present',
        ruleType: FHIRValidationRuleType.REQUIRED,
        resourceType,
        fhirPath: 'resourceType',
        expression: undefined,
        errorMessage: 'Resource must have a resourceType',
        severity: FHIRSeverity.ERROR,
        isActive: true
      }
    ];

    const resourceSpecificRules: Record<string, typeof commonRules> = {
      Patient: [
        {
          ruleName: 'patient-identifier-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'Patient',
          fhirPath: 'identifier',
          expression: undefined,
          errorMessage: 'Patient must have at least one identifier',
          severity: FHIRSeverity.ERROR,
          isActive: true
        },
        {
          ruleName: 'patient-name-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'Patient',
          fhirPath: 'name',
          expression: undefined,
          errorMessage: 'Patient must have at least one name',
          severity: FHIRSeverity.WARNING,
          isActive: true
        }
      ],
      MedicationRequest: [
        {
          ruleName: 'medicationrequest-medication-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'MedicationRequest',
          fhirPath: 'medicationCodeableConcept',
          expression: undefined,
          errorMessage: 'MedicationRequest must specify a medication',
          severity: FHIRSeverity.ERROR,
          isActive: true
        },
        {
          ruleName: 'medicationrequest-subject-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'MedicationRequest',
          fhirPath: 'subject',
          expression: undefined,
          errorMessage: 'MedicationRequest must have a subject',
          severity: FHIRSeverity.ERROR,
          isActive: true
        },
        {
          ruleName: 'medicationrequest-status-valid',
          ruleType: FHIRValidationRuleType.VALUESET,
          resourceType: 'MedicationRequest',
          fhirPath: 'status',
          expression: '["active","on-hold","cancelled","completed","entered-in-error","stopped","draft","unknown"]',
          errorMessage: 'MedicationRequest status must be a valid value',
          severity: FHIRSeverity.ERROR,
          isActive: true
        }
      ],
      AdverseEvent: [
        {
          ruleName: 'adverseevent-subject-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'AdverseEvent',
          fhirPath: 'subject',
          expression: undefined,
          errorMessage: 'AdverseEvent must have a subject',
          severity: FHIRSeverity.ERROR,
          isActive: true
        },
        {
          ruleName: 'adverseevent-date-required',
          ruleType: FHIRValidationRuleType.REQUIRED,
          resourceType: 'AdverseEvent',
          fhirPath: 'date',
          expression: undefined,
          errorMessage: 'AdverseEvent should have a date',
          severity: FHIRSeverity.WARNING,
          isActive: true
        }
      ]
    };

    return [...commonRules, ...(resourceSpecificRules[resourceType] || [])];
  }

  /**
   * Install built-in rules for a tenant
   */
  async installBuiltInRules(tenantId: string, resourceTypes: string[]): Promise<ServiceResult<number>> {
    const startTime = Date.now();
    let installedCount = 0;

    try {
      for (const resourceType of resourceTypes) {
        const builtInRules = this.getBuiltInRules(resourceType);
        
        for (const rule of builtInRules) {
          await this.createValidationRule({
            ...rule,
            tenantId
          });
          installedCount++;
        }
      }

      return {
        success: true,
        data: installedCount,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INSTALL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapValidationRule = (row: Record<string, unknown>): FHIRValidationRule => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    ruleName: row.rule_name as string,
    ruleType: row.rule_type as FHIRValidationRuleType,
    resourceType: row.resource_type as string,
    fhirPath: row.fhir_path as string | undefined,
    expression: row.expression as string | undefined,
    errorMessage: row.error_message as string,
    severity: row.severity as FHIRSeverity,
    profileUrl: row.profile_url as string | undefined,
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapValidationResult = (row: Record<string, unknown>): FHIRValidationResult => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    resourceType: row.resource_type as string,
    resourceId: row.resource_id as string,
    profileUrl: row.profile_url as string | undefined,
    validationStatus: row.validation_status as FHIRValidationStatus,
    issues: row.issues as FHIRValidationIssue[],
    validatedAt: new Date(row.validated_at as string)
  });
}
