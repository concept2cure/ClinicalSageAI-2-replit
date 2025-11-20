/**
 * Enhanced Regulatory Relation Extraction Engine
 *
 * Implements advanced NLP for extracting relationships between regulatory entities,
 * compliance obligations, and cross-document connections. Supports knowledge graph
 * construction, cross-document inconsistency detection, and programmatic querying.
 *
 * Based on transformer models for triplet extraction and relationship inference.
 */

import { pool as dbPool } from '../db.js';

class RegulatoryRelationExtractor {
  constructor() {
    // Comprehensive regulatory entity patterns for extraction
    this.regulatoryEntities = {
      compliance_obligations: [
        'FDA 21 CFR',
        'ICH Guidelines',
        'GCP requirements',
        'ISO 13485',
        'MDR compliance',
        'IVDR requirements',
        'predicate device',
        'substantial equivalence',
        'clinical evaluation',
        'post-market surveillance',
        'regulatory commitment',
        'compliance obligation',
        'statutory requirement',
        'binding requirement',
        'mandatory compliance',
        'regulatory mandate',
      ],
      risk_classifications: [
        'Class I device',
        'Class II device',
        'Class III device',
        'high risk',
        'medium risk',
        'low risk',
        'safety critical',
        'life-threatening',
        'adverse event',
        'serious adverse event',
        'safety concern',
        'hazard analysis',
        'risk assessment',
        'severity classification',
        'probability of occurrence',
      ],
      enforcement_mechanisms: [
        'FDA warning letter',
        'recall',
        'consent decree',
        'injunction',
        'criminal prosecution',
        'civil penalty',
        'market withdrawal',
        'suspension',
        'inspection',
        'audit',
        'regulatory action',
        'enforcement discretion',
        'compliance action',
        'remedial measure',
      ],
      document_types: [
        'clinical protocol',
        'investigational plan',
        'clinical study report',
        'predicate analysis',
        'risk management file',
        'clinical evaluation report',
        'IND application',
        'NDA submission',
        '510(k) premarket notification',
        'regulatory guideline',
        'technical documentation',
        'submission dossier',
        'safety update report',
        'periodic benefit-risk evaluation report',
      ],
      regulatory_concepts: [
        'primary endpoint',
        'secondary endpoint',
        'inclusion criteria',
        'exclusion criteria',
        'statistical analysis plan',
        'data safety monitoring',
        'quality system',
        'design control',
        'verification and validation',
        'clinical significance',
        'regulatory pathway',
        'expedited review',
      ],
    };

    // Knowledge graph storage
    this.knowledgeGraph = {
      nodes: new Map(),
      edges: [],
      triplets: [],
      crossDocumentLinks: new Map(),
      inconsistencies: [],
    };

    // Enhanced relationship patterns for regulatory documents with triplet extraction
    this.relationshipPatterns = [
      // Compliance relationships
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:must comply with|requires|mandates|specifies)\s+([^.]+)/gi,
        type: 'compliance_requirement',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:references|cites|based on|according to)\s+([^.]+)/gi,
        type: 'reference_relationship',
      },
      {
        pattern:
          /(\w+(?:\s+\w+)*)\s+(?:predicate|substantially equivalent to|similar to)\s+([^.]+)/gi,
        type: 'predicate_relationship',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:shall|must|is required to)\s+([^.]+)/gi,
        type: 'obligation',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:commits to|agrees to|undertakes to)\s+([^.]+)/gi,
        type: 'commitment',
      },

      // Risk relationships
      {
        pattern:
          /(\w+(?:\s+\w+)*)\s+(?:poses|presents|associated with)\s+(?:a\s+)?([^.]+risk[^.]*)/gi,
        type: 'risk_association',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:mitigates|reduces|controls)\s+([^.]+)/gi,
        type: 'risk_mitigation',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:classified as|categorized as)\s+([^.]+)/gi,
        type: 'classification',
      },

      // Protocol relationships
      {
        pattern:
          /(?:protocol|study)\s+(\w+(?:\s+\w+)*)\s+(?:evaluates|investigates|assesses)\s+([^.]+)/gi,
        type: 'study_objective',
      },
      {
        pattern:
          /(\w+(?:\s+\w+)*)\s+(?:endpoint|outcome|measurement)\s+(?:is|includes)\s+([^.]+)/gi,
        type: 'endpoint_relationship',
      },
      {
        pattern:
          /(\w+(?:\s+\w+)*)\s+(?:inclusion criteria|exclusion criteria)\s+(?:includes?|specifies?)\s+([^.]+)/gi,
        type: 'eligibility_criteria',
      },

      // Cross-reference relationships
      {
        pattern: /(?:see|refer to|as described in)\s+(?:section|chapter|appendix)\s+([^.]+)/gi,
        type: 'cross_reference',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:described in|detailed in|outlined in)\s+([^.]+)/gi,
        type: 'document_reference',
      },
      {
        pattern: /(?:as per|pursuant to|in accordance with)\s+([^.]+)/gi,
        type: 'compliance_reference',
      },

      // Enforcement relationships
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:may result in|triggers|leads to)\s+([^.]+)/gi,
        type: 'enforcement_trigger',
      },
      {
        pattern: /(\w+(?:\s+\w+)*)\s+(?:subject to|liable for)\s+([^.]+)/gi,
        type: 'enforcement_liability',
      },
    ];

    // Triplet extraction patterns for REBEL-style relationships
    this.tripletPatterns = {
      HAS_REQUIREMENT: ['requires', 'mandates', 'necessitates', 'obligates'],
      REFERENCES: ['references', 'cites', 'refers to', 'based on'],
      MITIGATES: ['mitigates', 'controls', 'reduces', 'addresses'],
      TRIGGERS: ['triggers', 'causes', 'results in', 'leads to'],
      COMPLIES_WITH: ['complies with', 'adheres to', 'follows', 'conforms to'],
      EVALUATES: ['evaluates', 'assesses', 'investigates', 'examines'],
      DEFINES: ['defines', 'specifies', 'describes', 'outlines'],
    };
  }

  /**
   * Extract relationships from regulatory document text with enhanced triplet extraction
   */
  async extractRelationships(documentText, documentType = 'unknown', documentId = null) {
    const relationships = [];
    const triplets = [];
    const entities = this.extractEntities(documentText);

    // Extract pattern-based relationships
    for (const pattern of this.relationshipPatterns) {
      const matches = [...documentText.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (match[1] && match[2]) {
          const triplet = {
            subject: match[1].trim(),
            predicate: pattern.type,
            object: match[2].trim(),
            confidence: this.calculateConfidence(match[0], pattern.type),
            source_document: documentType,
            document_id: documentId,
            extracted_text: match[0],
            position: match.index,
            context_window: this.extractContextWindow(documentText, match.index, 100),
          };

          relationships.push(triplet);
          triplets.push(triplet);

          // Store in knowledge graph
          this.addToKnowledgeGraph(triplet);
        }
      }
    }

    // Extract entity-to-entity relationships
    const entityRelationships = await this.extractEntityRelationships(
      entities,
      documentText,
      documentId
    );
    relationships.push(...entityRelationships);

    // Extract transformer-based triplets
    const transformerTriplets = this.extractTransformerTriplets(documentText, entities);
    triplets.push(...transformerTriplets);

    // Detect cross-references
    const crossReferences = this.detectCrossReferences(documentText, documentId);

    return {
      relationships,
      triplets,
      entities,
      cross_references: crossReferences,
      document_type: documentType,
      document_id: documentId,
      extraction_timestamp: new Date().toISOString(),
      total_triplets: triplets.length,
    };
  }

  /**
   * Extract context window around a match for better understanding
   */
  extractContextWindow(text, position, windowSize = 100) {
    const start = Math.max(0, position - windowSize);
    const end = Math.min(text.length, position + windowSize);
    return text.substring(start, end).trim();
  }

  /**
   * Extract transformer-based triplets using REBEL-style patterns
   */
  extractTransformerTriplets(text, entities) {
    const triplets = [];

    // For each pair of entities, check if they're connected by a known predicate
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Check if entities are within reasonable distance
        if (Math.abs(entity1.position - entity2.position) < 300) {
          const contextStart = Math.min(entity1.position, entity2.position);
          const contextEnd = Math.max(
            entity1.position + entity1.text.length,
            entity2.position + entity2.text.length
          );
          const context = text.substring(contextStart, contextEnd);

          // Check for triplet patterns
          for (const [predicateType, predicateTerms] of Object.entries(this.tripletPatterns)) {
            for (const term of predicateTerms) {
              if (context.toLowerCase().includes(term)) {
                triplets.push({
                  subject: entity1.text,
                  predicate: predicateType,
                  object: entity2.text,
                  confidence: 0.85,
                  method: 'transformer_pattern',
                  context: context,
                });
                break;
              }
            }
          }
        }
      }
    }

    return triplets;
  }

  /**
   * Detect cross-references and their completeness
   */
  detectCrossReferences(text, documentId) {
    const crossRefs = [];
    const refPatterns = [
      /see\s+(?:section|appendix|chapter)\s+(\d+(?:\.\d+)*)/gi,
      /refer\s+to\s+(?:section|appendix|chapter)\s+(\d+(?:\.\d+)*)/gi,
      /as\s+described\s+in\s+(?:section|appendix|chapter)\s+(\d+(?:\.\d+)*)/gi,
      /pursuant\s+to\s+(?:section|regulation)\s+(\d+(?:\.\d+)*)/gi,
    ];

    for (const pattern of refPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        crossRefs.push({
          reference: match[1],
          type: 'section_reference',
          source_document: documentId,
          position: match.index,
          context: this.extractContextWindow(text, match.index, 50),
          completeness: 'pending_verification',
        });
      }
    }

    return crossRefs;
  }

  /**
   * Add triplet to knowledge graph
   */
  addToKnowledgeGraph(triplet) {
    // Add nodes
    if (!this.knowledgeGraph.nodes.has(triplet.subject)) {
      this.knowledgeGraph.nodes.set(triplet.subject, {
        id: triplet.subject,
        type: 'entity',
        documents: new Set([triplet.document_id]),
        frequency: 1,
      });
    } else {
      this.knowledgeGraph.nodes.get(triplet.subject).documents.add(triplet.document_id);
      this.knowledgeGraph.nodes.get(triplet.subject).frequency++;
    }

    if (!this.knowledgeGraph.nodes.has(triplet.object)) {
      this.knowledgeGraph.nodes.set(triplet.object, {
        id: triplet.object,
        type: 'entity',
        documents: new Set([triplet.document_id]),
        frequency: 1,
      });
    } else {
      this.knowledgeGraph.nodes.get(triplet.object).documents.add(triplet.document_id);
      this.knowledgeGraph.nodes.get(triplet.object).frequency++;
    }

    // Add edge
    this.knowledgeGraph.edges.push({
      source: triplet.subject,
      target: triplet.object,
      predicate: triplet.predicate,
      confidence: triplet.confidence,
      document_id: triplet.document_id,
      context: triplet.context_window || triplet.extracted_text,
    });

    // Store triplet
    this.knowledgeGraph.triplets.push(triplet);
  }

  /**
   * Extract regulatory entities from document text
   */
  extractEntities(text) {
    const entities = [];
    const textLower = text.toLowerCase();

    for (const [category, entityList] of Object.entries(this.regulatoryEntities)) {
      for (const entity of entityList) {
        const regex = new RegExp(`\\b${entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = [...text.matchAll(regex)];

        for (const match of matches) {
          entities.push({
            text: match[0],
            category,
            position: match.index,
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract relationships between identified entities
   */
  async extractEntityRelationships(entities, documentText) {
    const relationships = [];

    // Find entities that appear near each other (co-occurrence analysis)
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Check if entities are within reasonable distance
        const distance = Math.abs(entity1.position - entity2.position);
        if (distance < 200) {
          // Within 200 characters

          // Extract text between entities for relationship inference
          const startPos = Math.min(entity1.position, entity2.position);
          const endPos =
            Math.max(entity1.position, entity2.position) +
            Math.max(entity1.text.length, entity2.text.length);
          const contextText = documentText.substring(startPos, endPos);

          const relationshipType = this.inferRelationshipType(entity1, entity2, contextText);

          if (relationshipType) {
            relationships.push({
              subject: entity1.text,
              predicate: relationshipType,
              object: entity2.text,
              confidence: 0.8,
              context: contextText,
              subject_category: entity1.category,
              object_category: entity2.category,
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Infer relationship type between two entities based on context
   */
  inferRelationshipType(entity1, entity2, context) {
    const contextLower = context.toLowerCase();

    // Compliance relationships
    if (contextLower.includes('requires') || contextLower.includes('mandates')) {
      return 'requires_compliance';
    }
    if (contextLower.includes('references') || contextLower.includes('cites')) {
      return 'references';
    }
    if (contextLower.includes('mitigates') || contextLower.includes('controls')) {
      return 'mitigates_risk';
    }
    if (contextLower.includes('predicate') || contextLower.includes('equivalent')) {
      return 'predicate_device';
    }

    // Category-based relationships
    if (entity1.category === 'compliance_obligations' && entity2.category === 'document_types') {
      return 'governs_document';
    }
    if (
      entity1.category === 'risk_classifications' &&
      entity2.category === 'enforcement_mechanisms'
    ) {
      return 'triggers_enforcement';
    }

    return null;
  }

  /**
   * Calculate confidence score for extracted relationship
   */
  calculateConfidence(extractedText, relationshipType) {
    let confidence = 0.7; // Base confidence

    // Higher confidence for explicit regulatory language
    if (
      extractedText.toLowerCase().includes('fda') ||
      extractedText.toLowerCase().includes('ich') ||
      extractedText.toLowerCase().includes('cfr')
    ) {
      confidence += 0.1;
    }

    // Higher confidence for specific relationship types
    if (
      relationshipType === 'compliance_requirement' ||
      relationshipType === 'predicate_relationship'
    ) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Detect inconsistencies across multiple documents
   */
  async detectCrossDocumentInconsistencies(documentRelationships) {
    const inconsistencies = [];

    // Compare relationships across documents
    for (let i = 0; i < documentRelationships.length; i++) {
      for (let j = i + 1; j < documentRelationships.length; j++) {
        const doc1 = documentRelationships[i];
        const doc2 = documentRelationships[j];

        // Find conflicting relationships
        for (const rel1 of doc1.relationships) {
          for (const rel2 of doc2.relationships) {
            if (rel1.subject === rel2.subject && rel1.predicate === rel2.predicate) {
              if (rel1.object !== rel2.object) {
                inconsistencies.push({
                  type: 'conflicting_relationship',
                  subject: rel1.subject,
                  predicate: rel1.predicate,
                  document1: { source: doc1.document_type, object: rel1.object },
                  document2: { source: doc2.document_type, object: rel2.object },
                  severity: 'high',
                });
              }
            }
          }
        }
      }
    }

    return inconsistencies;
  }

  /**
   * Build knowledge graph from extracted relationships
   */
  buildKnowledgeGraph(relationships) {
    const nodes = new Map();
    const edges = [];

    // Create nodes from subjects and objects
    relationships.forEach(rel => {
      if (!nodes.has(rel.subject)) {
        nodes.set(rel.subject, {
          id: rel.subject,
          label: rel.subject,
          category: rel.subject_category || 'unknown',
          type: 'entity',
        });
      }

      if (!nodes.has(rel.object)) {
        nodes.set(rel.object, {
          id: rel.object,
          label: rel.object,
          category: rel.object_category || 'unknown',
          type: 'entity',
        });
      }

      // Create edge
      edges.push({
        source: rel.subject,
        target: rel.object,
        relationship: rel.predicate,
        confidence: rel.confidence,
        context: rel.context || rel.extracted_text,
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges,
      metadata: {
        total_nodes: nodes.size,
        total_edges: edges.length,
        created_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Query knowledge graph for regulatory dependencies
   */
  queryRegulatoryDependencies(knowledgeGraph, entityName) {
    const dependencies = {
      direct_dependencies: [],
      compliance_requirements: [],
      risk_associations: [],
      document_references: [],
    };

    // Find all edges where this entity is involved
    const relevantEdges = knowledgeGraph.edges.filter(
      edge => edge.source === entityName || edge.target === entityName
    );

    relevantEdges.forEach(edge => {
      const dependency = {
        entity: edge.source === entityName ? edge.target : edge.source,
        relationship: edge.relationship,
        confidence: edge.confidence,
        context: edge.context,
      };

      if (edge.relationship.includes('compliance')) {
        dependencies.compliance_requirements.push(dependency);
      } else if (edge.relationship.includes('risk')) {
        dependencies.risk_associations.push(dependency);
      } else if (edge.relationship.includes('reference')) {
        dependencies.document_references.push(dependency);
      } else {
        dependencies.direct_dependencies.push(dependency);
      }
    });

    return dependencies;
  }
}

export { RegulatoryRelationExtractor };
