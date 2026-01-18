import { load } from 'cheerio';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export class FDAPrecedentIngester {
  private pinecone: Pinecone;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing PINECONE_API_KEY.');
    }
    this.pinecone = new Pinecone({ apiKey });
  }

  async ingestRecent510kDecisions(daysBack = 30): Promise<number> {
    const decisions = await this.scrape510kDecisions(daysBack);

    for (const decision of decisions) {
      await this.processAndStorePrecedent(decision);
    }

    return decisions.length;
  }

  async scrape510kDecisions(daysBack: number): Promise<any[]> {
    const url = `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?startDate=${this.getDateString(daysBack)}`;

    const response = await fetch(url);
    const html = await response.text();
    const $ = load(html);

    const decisions: any[] = [];

    $('table tr').each((i, row) => {
      if (i === 0) return;
      const $row = $(row);
      const kNumber = $row.find('td').eq(0).text().trim();
      const deviceName = $row.find('td').eq(1).text().trim();
      const decision = $row.find('td').eq(3).text().trim();

      if (kNumber && deviceName) {
        decisions.push({
          kNumber,
          deviceName,
          decision,
          decisionDate: new Date().toISOString(),
        });
      }
    });

    return decisions;
  }

  async processAndStorePrecedent(decision: any): Promise<void> {
    const summaryUrl = `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${decision.kNumber}`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryHtml = await summaryResponse.text();
    const $ = load(summaryHtml);

    const decisionSummary = $('td[headers="conditions_of_approval"]').text().trim();
    const predicates = this.extractPredicates($);

    const embedding = await this.generateEmbedding(
      `${decision.deviceName} ${decisionSummary} ${predicates.join(' ')}`
    );

    await this.pinecone.index('regulatory-precedents').upsert([
      {
        id: decision.kNumber,
        values: embedding,
        metadata: {
          device_name: decision.deviceName,
          decision: decision.decision,
          decision_date: decision.decisionDate,
          predicates,
          summary: decisionSummary,
          pathway: '510k',
        },
      },
    ]);
  }

  private extractPredicates($: ReturnType<typeof load>): string[] {
    const predicates: string[] = [];
    $('td[headers="predicate_devices"]').each((_, elem) => {
      predicates.push($(elem).text().trim());
    });
    return predicates.filter(Boolean);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('Missing OPENAI_API_KEY.');
    }
    const openai = new OpenAI({ apiKey: openaiKey });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });
    return response.data[0].embedding;
  }

  private getDateString(daysBack: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return date.toISOString().split('T')[0];
  }
}
