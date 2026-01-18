import { Pinecone } from '@pinecone-database/pinecone';
import type { RegulatoryPrecedent } from '../../types/smart-claims.types';

export class RegulatoryPrecedentEngine {
  private pinecone: Pinecone;
  private index: ReturnType<Pinecone['index']>;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing PINECONE_API_KEY.');
    }
    this.pinecone = new Pinecone({ apiKey });
    this.index = this.pinecone.index('regulatory-precedents');
  }

  async findSimilarPrecedents(claimEmbedding: number[], deviceType: string): Promise<RegulatoryPrecedent[]> {
    const queryResult = await this.index.query({
      vector: claimEmbedding,
      topK: 10,
      filter: { device_type: deviceType },
      includeMetadata: true,
    });

    return (queryResult.matches || []).map((match: any) => ({
      precedentId: match.id,
      devicePredicate: match.metadata?.predicate_name || 'Unknown',
      regulatoryPathway: match.metadata?.pathway || '510k',
      fdaDecision: match.metadata?.decision || 'unknown',
      similarityScore: match.score || 0,
      kNumber: match.metadata?.k_number || match.id,
      panel: match.metadata?.panel || 'Unknown',
      decisionDate: match.metadata?.decision_date || 'unknown',
      keyQuotes: match.metadata?.key_quotes || [],
    }));
  }

  async predictFdaFeedback(_claim: string, precedents: RegulatoryPrecedent[]): Promise<string[]> {
    const concerns: string[] = [];

    const rejections = precedents.filter(p =>
      String(p.fdaDecision).toLowerCase().includes('denied') ||
      String(p.fdaDecision).toLowerCase().includes('no-substantially-equivalent')
    );

    for (const rejection of rejections) {
      if ((rejection.keyQuotes || []).some(q => String(q).toLowerCase().includes('insufficient clinical'))) {
        concerns.push('Likely FDA concern: Insufficient clinical data to support claim');
      }
      if ((rejection.keyQuotes || []).some(q => String(q).toLowerCase().includes('predicate'))) {
        concerns.push('Likely FDA concern: Inadequate predicate device comparison');
      }
    }

    return [...new Set(concerns)];
  }
}
