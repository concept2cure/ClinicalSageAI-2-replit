/**
 * Harvest Engine for IND Wizard
 *
 * Applies rules to automatically extract and populate IND sections with data from source documents.
 * Each rule has:
 * - A condition (JavaScript expression evaluated against section context)
 * - An action (instruction on what data to pull and from where)
 *
 * Example rule:
 * {
 *   "condition": "section=='3.2.P.5.4' && !hasTable('MethodValidation')",
 *   "action": "pullTable(source='vault', docType='Validation Report', tableId='MethodValidation')"
 * }
 */

import { createClient } from '@supabase/supabase-js';
import { Parser } from 'expr-eval';
import { logger } from '../utils/logger.js';
// import { dataHarvester } from './dataHarvester.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize expression parser
const parser = new Parser({
  operators: {
    logical: true,
    comparison: true,
  },
});

/**
 * Execute harvest rules for a submission
 *
 * @param {string} submissionId - The IND submission ID
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Execution results
 */
export async function executeHarvest(submissionId, options = {}) {
  try {
    logger.info(`Starting harvest execution for submission ${submissionId}`);

    // Get all enabled rules
    const { data: rules, error: rulesError } = await supabase
      .from('harvest_rules')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (rulesError) {
      throw new Error(`Error fetching harvest rules: ${rulesError.message}`);
    }

    logger.info(`Found ${rules.length} enabled harvest rules`);

    // Track results
    const results = {
      rulesExecuted: 0,
      rulesMatched: 0,
      blocksCreated: 0,
      executionDetails: [],
    };

    // Execute each rule
    for (const rule of rules) {
      try {
        // Parse rule JSON
        const ruleConfig = rule.rule_json;

        if (!ruleConfig.condition || !ruleConfig.action) {
          logger.warn(`Rule ${rule.id} has invalid format: missing condition or action`);
          continue;
        }

        // Gather section context for evaluation
        const sectionContext = await buildSectionContext(submissionId, rule.section_code);

        // Track rule execution
        results.rulesExecuted++;

        // Evaluate condition
        try {
          const conditionResult = evaluateCondition(ruleConfig.condition, sectionContext);

          if (conditionResult) {
            // Condition matched, execute action
            results.rulesMatched++;

            const actionResult = await executeAction(
              ruleConfig.action,
              submissionId,
              rule.section_code,
              sectionContext
            );

            // Count blocks created
            results.blocksCreated += actionResult.blocksCreated || 0;

            // Record execution for audit
            await recordExecution(rule.id, submissionId, rule.section_code, {
              condition: ruleConfig.condition,
              action: ruleConfig.action,
              result: actionResult,
              success: true,
            });

            // Add to execution details
            results.executionDetails.push({
              ruleId: rule.id,
              sectionCode: rule.section_code,
              conditionMatched: true,
              actionResult,
            });

            logger.info(
              `Rule ${rule.id} matched for section ${rule.section_code}: ${actionResult.blocksCreated} blocks created`
            );
          } else {
            // Record rule execution (condition not met)
            await recordExecution(rule.id, submissionId, rule.section_code, {
              condition: ruleConfig.condition,
              result: 'Condition not met',
              success: false,
            });

            // Add to execution details
            results.executionDetails.push({
              ruleId: rule.id,
              sectionCode: rule.section_code,
              conditionMatched: false,
            });

            logger.debug(`Rule ${rule.id} condition not met for section ${rule.section_code}`);
          }
        } catch (conditionError) {
          logger.error(`Error evaluating condition for rule ${rule.id}: ${conditionError.message}`);

          // Record execution error
          await recordExecution(rule.id, submissionId, rule.section_code, {
            condition: ruleConfig.condition,
            error: conditionError.message,
            success: false,
          });

          // Add to execution details
          results.executionDetails.push({
            ruleId: rule.id,
            sectionCode: rule.section_code,
            error: conditionError.message,
          });
        }
      } catch (ruleError) {
        logger.error(`Error processing rule ${rule.id}: ${ruleError.message}`);

        // Add to execution details
        results.executionDetails.push({
          ruleId: rule.id,
          sectionCode: rule.section_code,
          error: ruleError.message,
        });
      }
    }

    logger.info(
      `Harvest execution complete: ${results.rulesMatched}/${results.rulesExecuted} rules matched, ${results.blocksCreated} blocks created`
    );

    return results;
  } catch (error) {
    logger.error(`Error in executeHarvest: ${error.message}`, error);
    throw error;
  }
}

/**
 * Build context for rule evaluation
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code
 * @returns {Promise<Object>} - Section context
 */
async function buildSectionContext(submissionId, sectionCode) {
  try {
    // Get blocks for this section
    const { data: blocks, error: blocksError } = await supabase
      .from('ind_blocks')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('section_code', sectionCode);

    if (blocksError) {
      throw new Error(`Error fetching section blocks: ${blocksError.message}`);
    }

    // Get submission details
    const { data: submission, error: submissionError } = await supabase
      .from('ind_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (submissionError && submissionError.code !== 'PGRST116') {
      // Not found
      throw new Error(`Error fetching submission: ${submissionError.message}`);
    }

    // Build context with helper functions
    const context = {
      section: sectionCode,
      submission: submission || {},
      blockCount: blocks.length,

      // Helper: check if section has a specific table
      hasTable: tableName =>
        blocks.some(
          b =>
            b.block_type === 'table' &&
            (b.content.meta?.name === tableName || b.content.caption === tableName)
        ),

      // Helper: check if section has a figure
      hasFigure: figureName =>
        blocks.some(
          b =>
            b.block_type === 'figure' &&
            (b.content.caption === figureName || b.content.altText === figureName)
        ),

      // Helper: check if section has text matching pattern
      hasText: pattern =>
        blocks.some(
          b =>
            b.block_type === 'markdown' && new RegExp(pattern, 'i').test(b.content.markdown || '')
        ),

      // Helper: check section is empty
      isEmpty: () => blocks.length === 0,

      // Platform metadata
      platform: {
        date: new Date().toISOString().split('T')[0],
      },
    };

    return context;
  } catch (error) {
    logger.error(`Error building section context: ${error.message}`, error);
    throw error;
  }
}

/**
 * Evaluate rule condition
 *
 * @param {string} condition - The condition expression
 * @param {Object} context - The evaluation context
 * @returns {boolean} - Condition result
 */
function evaluateCondition(condition, context) {
  try {
    // For simple conditions (section=='x.y.z')
    if (condition.includes('section==')) {
      const sectionMatch = /section\s*==\s*['"]([^'"]+)['"]/.exec(condition);
      if (sectionMatch && sectionMatch[1] === context.section) {
        // Further evaluate rest of condition
        const restCondition = condition.replace(/section\s*==\s*['"][^'"]+['"](\s*&&\s*)?/, '');
        if (!restCondition) return true;

        // Handle special function calls
        if (restCondition.includes('hasTable')) {
          const tableMatch = /!?hasTable\(['"]([^'"]+)['"]\)/.exec(restCondition);
          if (tableMatch) {
            const negated = restCondition.startsWith('!');
            const hasTable = context.hasTable(tableMatch[1]);
            return negated ? !hasTable : hasTable;
          }
        }

        if (restCondition.includes('isEmpty')) {
          const isEmptyCall = /isEmpty\(\)/.test(restCondition);
          if (isEmptyCall) {
            return context.isEmpty();
          }
        }
      }
    }

    // For complex conditions, use expr-eval parser
    // Convert context to a flat object for evaluation
    const flatContext = {
      section: context.section,
      blockCount: context.blockCount,
      isEmpty: context.isEmpty(),
      ...Object.keys(context.submission || {}).reduce((acc, key) => {
        acc[`submission_${key}`] = context.submission[key];
        return acc;
      }, {}),
    };

    // Parse and evaluate
    const expr = parser.parse(condition);
    return expr.evaluate(flatContext);
  } catch (error) {
    logger.error(`Error evaluating condition "${condition}": ${error.message}`, error);
    throw new Error(`Failed to evaluate condition: ${error.message}`);
  }
}

/**
 * Execute rule action
 *
 * @param {string} action - The action instruction
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code
 * @param {Object} context - The section context
 * @returns {Promise<Object>} - Action result
 */
async function executeAction(action, submissionId, sectionCode, context) {
  try {
    // Parse action parameters
    const actionType = action.split('(')[0].trim();
    const paramsString = action.substring(action.indexOf('(') + 1, action.lastIndexOf(')'));
    const params = parseActionParams(paramsString);

    // Track created blocks
    const createdBlocks = [];

    // Execute based on action type
    switch (actionType) {
      case 'pullTable':
        // Get source document based on parameters
        const { data: documents, error: docError } = await supabase
          .from('ind_references')
          .select('*')
          .eq('document_type', params.docType)
          .limit(1);

        if (docError) {
          throw new Error(`Error fetching source document: ${docError.message}`);
        }

        if (!documents || documents.length === 0) {
          return {
            blocksCreated: 0,
            message: `No documents found with type '${params.docType}'`,
          };
        }

        // Use document ID to create block
        const document = documents[0];

        // Extract tables from document if found
        const tableData = await extractTableFromDocument(document, params.tableId);

        // Create the table block
        const { data: tableBlock, error: tableError } = await supabase
          .from('ind_blocks')
          .insert({
            submission_id: submissionId,
            section_code: sectionCode,
            block_type: 'table',
            content: {
              rows: tableData.rows || [['Auto-extracted from ' + document.title]],
              caption: tableData.caption || params.tableId,
              meta: {
                name: params.tableId,
                source_document_id: document.id,
                source_document_type: document.document_type,
                auto_extracted: true,
                extraction_time: new Date().toISOString(),
              },
            },
            created_by: 'harvest_engine',
            source_document_id: document.id,
          })
          .select('id')
          .single();

        if (tableError) {
          throw new Error(`Error creating table block: ${tableError.message}`);
        }

        createdBlocks.push(tableBlock.id);
        break;

      case 'copySection':
        // Copy content from another section
        const { data: sourceBlocks, error: sourceError } = await supabase
          .from('ind_blocks')
          .select('*')
          .eq('submission_id', submissionId)
          .eq('section_code', params.sourceSection);

        if (sourceError) {
          throw new Error(`Error fetching source section: ${sourceError.message}`);
        }

        if (!sourceBlocks || sourceBlocks.length === 0) {
          return {
            blocksCreated: 0,
            message: `No blocks found in source section '${params.sourceSection}'`,
          };
        }

        // Copy each block to target section
        for (const sourceBlock of sourceBlocks) {
          const newBlock = {
            submission_id: submissionId,
            section_code: sectionCode,
            block_type: sourceBlock.block_type,
            content: sourceBlock.content,
            created_by: 'harvest_engine',
            source_block_id: sourceBlock.id,
            meta: {
              copied_from_section: params.sourceSection,
              auto_copied: true,
              copy_time: new Date().toISOString(),
            },
          };

          const { data: copiedBlock, error: copyError } = await supabase
            .from('ind_blocks')
            .insert(newBlock)
            .select('id')
            .single();

          if (copyError) {
            throw new Error(`Error copying block: ${copyError.message}`);
          }

          createdBlocks.push(copiedBlock.id);
        }
        break;

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    return {
      blocksCreated: createdBlocks.length,
      blockIds: createdBlocks,
    };
  } catch (error) {
    logger.error(`Error executing action "${action}": ${error.message}`, error);
    throw error;
  }
}

/**
 * Parse action parameters
 *
 * @param {string} paramsString - The parameters string
 * @returns {Object} - Parsed parameters
 */
function parseActionParams(paramsString) {
  const params = {};

  // Match key-value pairs: key='value' or key="value"
  const paramRegex = /(\w+)\s*=\s*['"]([^'"]*)['"]/g;
  let match;

  while ((match = paramRegex.exec(paramsString)) !== null) {
    params[match[1]] = match[2];
  }

  return params;
}

/**
 * Extract table from document
 *
 * @param {Object} document - Document metadata
 * @param {string} tableId - Identifier for the table to extract
 * @returns {Promise<Object>} - Extracted table data
 */
async function extractTableFromDocument(document, tableId) {
  try {
    // Check if document has already been processed
    const { data: existingTables, error: tableError } = await supabase
      .from('ind_extracted_tables')
      .select('*')
      .eq('document_id', document.id)
      .eq('table_id', tableId);

    if (tableError) {
      logger.warn(`Error checking for existing extracted tables: ${tableError.message}`);
    } else if (existingTables && existingTables.length > 0) {
      // Return already extracted table
      return {
        rows: existingTables[0].rows || [],
        caption: existingTables[0].caption || tableId,
      };
    }

    // Use dataHarvester if available
    if (typeof dataHarvester !== 'undefined' && typeof dataHarvester.extractTables === 'function') {
      try {
        const tables = await dataHarvester.extractTables(document.id);

        // Find table by name or index
        const targetTable = tables.find(
          t => t.caption === tableId || t.index === parseInt(tableId, 10)
        );

        if (targetTable) {
          // Store extracted table for future use
          await supabase
            .from('ind_extracted_tables')
            .insert({
              document_id: document.id,
              table_id: tableId,
              rows: targetTable.rows,
              caption: targetTable.caption,
              extraction_time: new Date().toISOString(),
            })
            .catch(err => logger.warn(`Error storing extracted table: ${err.message}`));

          return targetTable;
        }
      } catch (harvesterError) {
        logger.warn(`dataHarvester error: ${harvesterError.message}`);
      }
    }

    // Fallback: Create placeholder table
    return {
      rows: [
        ['Table ID', 'Source Document', 'Description'],
        [tableId, document.title, `Auto-extracted from ${document.document_type}`],
      ],
      caption: `${tableId} (placeholder)`,
    };
  } catch (error) {
    logger.error(`Error extracting table: ${error.message}`, error);

    // Fallback with error message
    return {
      rows: [['Error extracting table:', error.message]],
      caption: tableId,
    };
  }
}

/**
 * Record rule execution for audit
 *
 * @param {string} ruleId - The rule ID
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code
 * @param {Object} executionResult - Execution results
 * @returns {Promise<void>}
 */
async function recordExecution(ruleId, submissionId, sectionCode, executionResult) {
  try {
    await supabase
      .from('harvest_rule_executions')
      .insert({
        rule_id: ruleId,
        submission_id: submissionId,
        section_code: sectionCode,
        execution_result: executionResult,
        success: executionResult.success || false,
        block_ids_created: executionResult.result?.blockIds || [],
      })
      .catch(error => {
        logger.warn(`Error recording rule execution: ${error.message}`);
      });
  } catch (error) {
    logger.warn(`Error in recordExecution: ${error.message}`);
  }
}

/**
 * Get harvest execution history
 *
 * @param {string} submissionId - The IND submission ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Execution history
 */
export async function getHarvestHistory(submissionId, options = {}) {
  try {
    let query = supabase
      .from('harvest_rule_executions')
      .select('*, harvest_rules!inner(*)')
      .eq('submission_id', submissionId);

    if (options.successful) {
      query = query.eq('success', true);
    }

    if (options.section) {
      query = query.eq('section_code', options.section);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    // Order by most recent first
    query = query.order('execution_time', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error fetching harvest history: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error(`Error getting harvest history: ${error.message}`, error);
    throw error;
  }
}

export default {
  executeHarvest,
  getHarvestHistory,
};
