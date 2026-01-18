import natural from 'natural';
import type { EvidenceCluster, Contradiction } from '../../types/smart-claims.types';

export class EvidenceClusteringEngine {
  private tokenizer = new natural.WordTokenizer();

  async clusterEvidence(claimId: string, evidenceDocs: any[]): Promise<EvidenceCluster[]> {
    const clusters: EvidenceCluster[] = [];

    const byType = this.groupByEvidenceType(evidenceDocs);

    for (const [type, docs] of Object.entries(byType)) {
      const methodologyClusters = this.clusterByMethodology(docs as any[]);

      for (const clusterDocs of methodologyClusters) {
        const cluster: EvidenceCluster = {
          clusterId: `cluster-${claimId}-${type}-${Date.now()}`,
          evidenceType: type as EvidenceCluster['evidenceType'],
          strengthScore: await this.calculateClusterStrength(clusterDocs),
          consistencyScore: await this.calculateConsistency(clusterDocs),
          primaryCERs: clusterDocs.filter(d => d.isPrimary).map(d => d.id),
          supportingCERs: clusterDocs.filter(d => !d.isPrimary).map(d => d.id),
          contradictoryEvidence: await this.findContradictions(clusterDocs),
        };

        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private groupByEvidenceType(docs: any[]): Record<string, any[]> {
    return docs.reduce((acc, doc) => {
      const type = this.inferEvidenceType(doc);
      if (!acc[type]) acc[type] = [];
      acc[type].push(doc);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private inferEvidenceType(doc: any): EvidenceCluster['evidenceType'] {
    if (doc.studyType === 'RCT' || doc.studyType === 'clinical-trial') return 'clinical-trial';
    if (doc.dataSource === 'Registry' || doc.dataSource === 'EHR') return 'real-world-evidence';
    if (doc.source === 'PubMed' || doc.source === 'journal') return 'literature';
    if (doc.testType === 'bench' || doc.testType === 'preclinical') return 'bench-testing';
    return 'predicate';
  }

  private clusterByMethodology(docs: any[]): any[][] {
    const clusters = new Map<string, any[]>();

    for (const doc of docs) {
      const key = `${doc.studyDesign || 'observational'}-${doc.sampleSize > 100 ? 'large' : 'small'}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(doc);
    }

    return Array.from(clusters.values());
  }

  private async calculateClusterStrength(docs: any[]): Promise<number> {
    let totalStrength = 0;

    for (const doc of docs) {
      let docStrength = 50;

      if (doc.sampleSize > 500) docStrength += 25;
      else if (doc.sampleSize > 100) docStrength += 15;

      if (doc.studyDesign === 'RCT') docStrength += 20;
      else if (doc.studyDesign === 'prospective') docStrength += 10;

      if (doc.followUpMonths >= 24) docStrength += 10;
      else if (doc.followUpMonths >= 12) docStrength += 5;

      if (doc.sites > 5) docStrength += 5;

      totalStrength += docStrength;
    }

    return Math.round(totalStrength / docs.length);
  }

  private async calculateConsistency(docs: any[]): Promise<number> {
    if (docs.length < 2) return 100;

    const effectSizes = docs
      .map(doc => doc.effectSize || doc.oddsRatio || doc.riskRatio)
      .filter(Boolean);

    if (effectSizes.length < 2) return 85;

    const variance = this.calculateVariance(effectSizes as number[]);
    return Math.max(0, 100 - variance * 100);
  }

  private async findContradictions(docs: any[]): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    for (let i = 0; i < docs.length; i += 1) {
      for (let j = i + 1; j < docs.length; j += 1) {
        if (this.isContradictory(docs[i], docs[j])) {
          contradictions.push({
            doc1Id: docs[i].id,
            doc2Id: docs[j].id,
            nature: `Conflicting results: ${docs[i].primaryEndpoint} vs ${docs[j].primaryEndpoint}`,
            resolutionStrategy: this.suggestResolution(docs[i], docs[j]),
          });
        }
      }
    }

    return contradictions;
  }

  private isContradictory(doc1: any, doc2: any): boolean {
    return Boolean(
      doc1.primaryEndpoint &&
        doc2.primaryEndpoint &&
        doc1.pValue < 0.05 &&
        doc2.pValue < 0.05 &&
        Math.abs(doc1.effectSize - doc2.effectSize) > 0.5
    );
  }

  private suggestResolution(doc1: any, doc2: any): string {
    if (doc1.studyDesign !== doc2.studyDesign) {
      return `Meta-analysis or hierarchical modeling to reconcile different study designs (${doc1.studyDesign} vs ${doc2.studyDesign})`;
    }
    return 'Subgroup analysis to identify sources of heterogeneity';
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  }
}
