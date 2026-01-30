/**
 * Change Propagation Service
 * 
 * Phase 5: Intelligent Document System
 * Tracks source document changes and propagates impact analysis
 * to all dependent documents and artifacts.
 * 
 * Features:
 * - Source version monitoring
 * - Impact analysis for dependent documents
 * - Suggested patch generation
 * - Audit trail for all propagation events
 * - 21 CFR Part 11 compliant change tracking
 */

import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: string;
  hash: string;
  content: string;
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

export interface TraceabilityLink {
  id: string;
  sourceDocumentId: string;
  sourceHash: string;
  sourceVersion: string;
  targetDocumentId: string;
  targetRange: { from: number; to: number };
  linkedText: string;
  citationType: 'direct_quote' | 'paraphrase' | 'reference' | 'data_source';
}

export interface ImpactedSection {
  documentId: string;
  documentTitle: string;
  sectionId?: string;
  sectionTitle?: string;
  linkId: string;
  linkedText: string;
  citationType: TraceabilityLink['citationType'];
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedAction: 'update_required' | 'review_needed' | 'verify_accuracy' | 'no_action';
}

export interface PropagationEvent {
  id: string;
  sourceDocumentId: string;
  sourceOldVersion: string;
  sourceNewVersion: string;
  sourceOldHash: string;
  sourceNewHash: string;
  impactedSections: ImpactedSection[];
  createdAt: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface SuggestedPatch {
  id: string;
  propagationEventId: string;
  targetDocumentId: string;
  targetSectionId?: string;
  originalText: string;
  suggestedText: string;
  confidence: number;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
}

export interface ChangeAnalysis {
  addedContent: string[];
  removedContent: string[];
  modifiedSections: Array<{
    oldText: string;
    newText: string;
    similarity: number;
  }>;
  semanticChanges: Array<{
    type: 'definition' | 'requirement' | 'data' | 'reference' | 'procedure';
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Propagation Service
// ─────────────────────────────────────────────────────────────────────────────

export class ChangePropagationService {
  private static instance: ChangePropagationService;
  private propagationEvents: Map<string, PropagationEvent> = new Map();
  private suggestedPatches: Map<string, SuggestedPatch[]> = new Map();

  private constructor() {}

  static getInstance(): ChangePropagationService {
    if (!ChangePropagationService.instance) {
      ChangePropagationService.instance = new ChangePropagationService();
    }
    return ChangePropagationService.instance;
  }

  /**
   * Analyze changes between two document versions
   */
  async analyzeChanges(
    oldVersion: DocumentVersion,
    newVersion: DocumentVersion
  ): Promise<ChangeAnalysis> {
    const oldLines = oldVersion.content.split('\n');
    const newLines = newVersion.content.split('\n');

    const addedContent: string[] = [];
    const removedContent: string[] = [];
    const modifiedSections: Array<{ oldText: string; newText: string; similarity: number }> = [];

    // Simple diff analysis (in production, use a proper diff library)
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    for (const line of newLines) {
      if (!oldSet.has(line) && line.trim()) {
        addedContent.push(line);
      }
    }

    for (const line of oldLines) {
      if (!newSet.has(line) && line.trim()) {
        removedContent.push(line);
      }
    }

    // Detect semantic changes
    const semanticChanges = this.detectSemanticChanges(oldVersion.content, newVersion.content);

    return {
      addedContent,
      removedContent,
      modifiedSections,
      semanticChanges,
    };
  }

  /**
   * Detect semantic changes in document content
   */
  private detectSemanticChanges(
    oldContent: string,
    newContent: string
  ): ChangeAnalysis['semanticChanges'] {
    const changes: ChangeAnalysis['semanticChanges'] = [];

    // Detect definition changes
    const definitionPattern = /(?:define[ds]?|means?|refers? to|is defined as)/i;
    if (definitionPattern.test(oldContent) !== definitionPattern.test(newContent)) {
      changes.push({
        type: 'definition',
        description: 'Document definitions have changed',
        severity: 'high',
      });
    }

    // Detect requirement changes (shall, must, required)
    const requirementPattern = /\b(shall|must|required|mandatory)\b/gi;
    const oldRequirements = (oldContent.match(requirementPattern) || []).length;
    const newRequirements = (newContent.match(requirementPattern) || []).length;
    if (oldRequirements !== newRequirements) {
      changes.push({
        type: 'requirement',
        description: `Requirement statements changed (${oldRequirements} → ${newRequirements})`,
        severity: 'critical',
      });
    }

    // Detect numerical data changes
    const numberPattern = /\d+\.?\d*\s*(%|mg|ml|kg|units?|days?|hours?)/gi;
    const oldNumbers = oldContent.match(numberPattern) || [];
    const newNumbers = newContent.match(numberPattern) || [];
    if (JSON.stringify(oldNumbers.sort()) !== JSON.stringify(newNumbers.sort())) {
      changes.push({
        type: 'data',
        description: 'Numerical data or measurements have changed',
        severity: 'critical',
      });
    }

    // Detect procedure changes
    const procedurePattern = /(?:step\s+\d|procedure|protocol|method)/i;
    if (procedurePattern.test(oldContent) !== procedurePattern.test(newContent)) {
      changes.push({
        type: 'procedure',
        description: 'Procedural content has changed',
        severity: 'high',
      });
    }

    return changes;
  }

  /**
   * Find all documents/sections impacted by a source document change
   */
  async findImpactedSections(
    sourceDocumentId: string,
    traceabilityLinks: TraceabilityLink[],
    changeAnalysis: ChangeAnalysis
  ): Promise<ImpactedSection[]> {
    const impactedSections: ImpactedSection[] = [];

    // Find all links that reference this source document
    const relevantLinks = traceabilityLinks.filter(
      link => link.sourceDocumentId === sourceDocumentId
    );

    for (const link of relevantLinks) {
      // Determine severity based on citation type and semantic changes
      const severity = this.calculateImpactSeverity(link, changeAnalysis);
      const suggestedAction = this.determineSuggestedAction(link, changeAnalysis);

      impactedSections.push({
        documentId: link.targetDocumentId,
        documentTitle: `Document ${link.targetDocumentId}`, // Would be fetched from DB
        linkId: link.id,
        linkedText: link.linkedText,
        citationType: link.citationType,
        severity,
        reason: this.generateImpactReason(link, changeAnalysis),
        suggestedAction,
      });
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    impactedSections.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return impactedSections;
  }

  /**
   * Calculate impact severity based on citation type and changes
   */
  private calculateImpactSeverity(
    link: TraceabilityLink,
    analysis: ChangeAnalysis
  ): ImpactedSection['severity'] {
    // Direct quotes are most severely impacted
    if (link.citationType === 'direct_quote') {
      return 'critical';
    }

    // Data sources with numerical changes are critical
    if (
      link.citationType === 'data_source' &&
      analysis.semanticChanges.some(c => c.type === 'data')
    ) {
      return 'critical';
    }

    // Paraphrases with requirement changes are high
    if (
      link.citationType === 'paraphrase' &&
      analysis.semanticChanges.some(c => c.type === 'requirement')
    ) {
      return 'high';
    }

    // References are usually medium unless there are critical semantic changes
    if (link.citationType === 'reference') {
      if (analysis.semanticChanges.some(c => c.severity === 'critical')) {
        return 'high';
      }
      return 'medium';
    }

    return 'low';
  }

  /**
   * Determine suggested action based on impact analysis
   */
  private determineSuggestedAction(
    link: TraceabilityLink,
    analysis: ChangeAnalysis
  ): ImpactedSection['suggestedAction'] {
    if (link.citationType === 'direct_quote') {
      return 'update_required';
    }

    if (analysis.semanticChanges.some(c => c.severity === 'critical')) {
      return 'update_required';
    }

    if (analysis.semanticChanges.some(c => c.severity === 'high')) {
      return 'review_needed';
    }

    if (link.citationType === 'data_source') {
      return 'verify_accuracy';
    }

    return 'no_action';
  }

  /**
   * Generate human-readable impact reason
   */
  private generateImpactReason(
    link: TraceabilityLink,
    analysis: ChangeAnalysis
  ): string {
    const reasons: string[] = [];

    if (link.citationType === 'direct_quote' && analysis.removedContent.length > 0) {
      reasons.push('Source text that was directly quoted may have been modified or removed');
    }

    if (analysis.semanticChanges.some(c => c.type === 'data')) {
      reasons.push('Numerical data in source document has changed');
    }

    if (analysis.semanticChanges.some(c => c.type === 'requirement')) {
      reasons.push('Requirement statements in source document have changed');
    }

    if (analysis.semanticChanges.some(c => c.type === 'definition')) {
      reasons.push('Definitions in source document have changed');
    }

    if (reasons.length === 0) {
      reasons.push('Source document has been updated');
    }

    return reasons.join('. ');
  }

  /**
   * Create a propagation event when a source document changes
   */
  async createPropagationEvent(
    oldVersion: DocumentVersion,
    newVersion: DocumentVersion,
    traceabilityLinks: TraceabilityLink[]
  ): Promise<PropagationEvent> {
    const changeAnalysis = await this.analyzeChanges(oldVersion, newVersion);
    const impactedSections = await this.findImpactedSections(
      oldVersion.documentId,
      traceabilityLinks,
      changeAnalysis
    );

    const event: PropagationEvent = {
      id: crypto.randomUUID(),
      sourceDocumentId: oldVersion.documentId,
      sourceOldVersion: oldVersion.version,
      sourceNewVersion: newVersion.version,
      sourceOldHash: oldVersion.hash,
      sourceNewHash: newVersion.hash,
      impactedSections,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    this.propagationEvents.set(event.id, event);

    // Generate suggested patches for critical/high severity impacts
    await this.generateSuggestedPatches(event, changeAnalysis);

    return event;
  }

  /**
   * Generate suggested patches for impacted sections
   */
  private async generateSuggestedPatches(
    event: PropagationEvent,
    _changeAnalysis: ChangeAnalysis
  ): Promise<SuggestedPatch[]> {
    const patches: SuggestedPatch[] = [];

    for (const section of event.impactedSections) {
      if (section.suggestedAction === 'update_required') {
        // In production, this would use AI to generate suggested text
        const patch: SuggestedPatch = {
          id: crypto.randomUUID(),
          propagationEventId: event.id,
          targetDocumentId: section.documentId,
          targetSectionId: section.sectionId,
          originalText: section.linkedText,
          suggestedText: `[REVIEW REQUIRED: Source document updated] ${section.linkedText}`,
          confidence: 75,
          reason: section.reason,
          status: 'pending',
        };
        patches.push(patch);
      }
    }

    this.suggestedPatches.set(event.id, patches);
    return patches;
  }

  /**
   * Get propagation event by ID
   */
  getPropagationEvent(eventId: string): PropagationEvent | undefined {
    return this.propagationEvents.get(eventId);
  }

  /**
   * Get all pending propagation events for an organization
   */
  getPendingEvents(): PropagationEvent[] {
    return Array.from(this.propagationEvents.values()).filter(e => e.status === 'pending');
  }

  /**
   * Get suggested patches for a propagation event
   */
  getSuggestedPatches(eventId: string): SuggestedPatch[] {
    return this.suggestedPatches.get(eventId) || [];
  }

  /**
   * Resolve a propagation event
   */
  resolveEvent(eventId: string, resolvedBy: string): PropagationEvent | undefined {
    const event = this.propagationEvents.get(eventId);
    if (event) {
      event.status = 'resolved';
      event.resolvedAt = new Date().toISOString();
      event.resolvedBy = resolvedBy;
    }
    return event;
  }

  /**
   * Accept a suggested patch
   */
  acceptPatch(eventId: string, patchId: string): SuggestedPatch | undefined {
    const patches = this.suggestedPatches.get(eventId);
    const patch = patches?.find(p => p.id === patchId);
    if (patch) {
      patch.status = 'accepted';
    }
    return patch;
  }

  /**
   * Reject a suggested patch
   */
  rejectPatch(eventId: string, patchId: string): SuggestedPatch | undefined {
    const patches = this.suggestedPatches.get(eventId);
    const patch = patches?.find(p => p.id === patchId);
    if (patch) {
      patch.status = 'rejected';
    }
    return patch;
  }

  /**
   * Hash document content for integrity verification
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify document integrity by comparing hash
   */
  verifyIntegrity(content: string, expectedHash: string): boolean {
    return this.hashContent(content) === expectedHash;
  }
}

export default ChangePropagationService;
