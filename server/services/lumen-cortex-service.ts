import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { db } from '../db';
import { sql, and, eq, inArray } from 'drizzle-orm';
import {
  lumenDataAtoms,
  lumenFilingDocuments,
  lumenObservationTerms,
  csrReports,
} from '@shared/schema';

const SEC_BASE_URL = 'https://data.sec.gov';
const SEC_ARCHIVE_URL = 'https://www.sec.gov/Archives/edgar/data';

const DEFAULT_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  'LumenCortexHarvester/1.0 (contact: compliance@c2c.ai)';

const REJECTION_SIGNAL_PATTERNS = [
  /complete response letter/gi,
  /refuse(d)? to file/gi,
  /not approved/gi,
  /rejected/gi,
  /denied/gi,
  /clinical hold/gi,
  /regulatory delay/gi,
  /warning letter/gi,
];

const SUBJECTIVE_PATTERNS = [
  /believe/gi,
  /expect/gi,
  /may/gi,
  /could/gi,
  /might/gi,
  /anticipate/gi,
];

const OBJECTIVE_PATTERNS = [/\b\d+%\b/g, /\b\d{4}\b/g, /\$\d+/g];

export interface Harvest10KOptions {
  organizationId: number;
  cik: string;
  limit?: number;
  includeAmended?: boolean;
}

export class LumenCortexService {
  async verifyNeonConnection() {
    const connectionString = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL || '';
    const isNeon = /neon\.tech|neondb/i.test(connectionString);
    await db.execute(sql`SELECT 1`);
    return {
      connected: true,
      neonDetected: isNeon,
      databaseUrlPresent: Boolean(connectionString),
    };
  }

  async harvest10KFilings(options: Harvest10KOptions) {
    const normalizedCik = this.normalizeCik(options.cik);
    const limit = options.limit ?? 10;
    const includeAmended = options.includeAmended ?? false;

    const submissions = await this.fetchSecSubmissions(normalizedCik);
    const filings = submissions?.filings?.recent;
    if (!filings) {
      return {
        success: false,
        message: 'No filing data available for the provided CIK.',
        harvested: 0,
        atomsCreated: 0,
      };
    }

    const eligibleIndexes = filings.form
      .map((form: string, index: number) => ({ form, index }))
      .filter(({ form }: { form: string }) =>
        includeAmended ? form.startsWith('10-K') : form === '10-K'
      )
      .slice(0, limit);

    const harvested = [] as Array<{
      accessionNo: string;
      filingDate: string;
      formType: string;
      primaryDocument: string;
      companyName: string;
    }>;

    for (const { index } of eligibleIndexes) {
      harvested.push({
        accessionNo: filings.accessionNumber[index],
        filingDate: filings.filingDate[index],
        formType: filings.form[index],
        primaryDocument: filings.primaryDocument[index],
        companyName: submissions.name || submissions.companyName || 'Unknown',
      });
    }

    if (harvested.length === 0) {
      return {
        success: true,
        harvested: 0,
        atomsCreated: 0,
        candidateFilings: 0,
      };
    }

    const existing = await db
      .select({ accessionNo: lumenFilingDocuments.accessionNo })
      .from(lumenFilingDocuments)
      .where(
        and(
          eq(lumenFilingDocuments.organizationId, options.organizationId),
          eq(lumenFilingDocuments.source, 'SEC'),
          inArray(
            lumenFilingDocuments.accessionNo,
            harvested.map(item => item.accessionNo)
          )
        )
      );

    const existingSet = new Set(existing.map(item => item.accessionNo));

    let harvestedCount = 0;
    let atomsCreated = 0;

    for (const filing of harvested) {
      if (existingSet.has(filing.accessionNo)) {
        continue;
      }

      const accessionNoNoDashes = filing.accessionNo.replace(/-/g, '');
      const filingUrl = `${SEC_ARCHIVE_URL}/${parseInt(normalizedCik, 10)}/${accessionNoNoDashes}/${filing.primaryDocument}`;

      const filingContent = await this.fetchFilingContent(filingUrl);
      const parsedText = this.extractReadableText(filingContent);
      const extractedSignals = this.extractSignals(parsedText);

      await db
        .insert(lumenFilingDocuments)
        .values({
          organizationId: options.organizationId,
          source: 'SEC',
          cik: normalizedCik,
          accessionNo: filing.accessionNo,
          filingDate: filing.filingDate,
          reportYear: this.extractReportYear(filing.filingDate),
          companyName: filing.companyName,
          formType: filing.formType,
          primaryDocument: filing.primaryDocument,
          filingUrl,
          content: parsedText,
          extractedSignals: extractedSignals.summary,
          rejectionSignals: extractedSignals.rejectionSignals,
        })
        .onConflictDoNothing();

      const dataAtoms = this.buildDataAtomsFromSignals({
        organizationId: options.organizationId,
        sourceId: filing.accessionNo,
        companyName: filing.companyName,
        signals: extractedSignals,
      });

      if (dataAtoms.length > 0) {
        await db.insert(lumenDataAtoms).values(dataAtoms).onConflictDoNothing();
        atomsCreated += dataAtoms.length;
      }

      harvestedCount += 1;
    }

    return {
      success: true,
      harvested: harvestedCount,
      atomsCreated,
      candidateFilings: harvested.length,
    };
  }

  async syncObservationTermsFromCSR(organizationId: number, limit = 100) {
    const csrRows = await db
      .select()
      .from(csrReports)
      .where(eq(csrReports.organizationId, organizationId))
      .limit(limit);

    const terms = [] as Array<{
      organizationId: number;
      term: string;
      termType: string;
      category: string;
      sourceType: string;
      sourceId: string;
      weight: number;
      metadata: Record<string, unknown>;
    }>;

    for (const csr of csrRows) {
      const extracted = this.extractObservationTermsFromCSR(csr.content || {});
      extracted.forEach(item => {
        terms.push({
          organizationId,
          term: item.term,
          termType: item.termType,
          category: item.category,
          sourceType: 'csr',
          sourceId: csr.reportId,
          weight: item.weight,
          metadata: {
            reportTitle: csr.reportTitle,
            reportType: csr.reportType,
            studyId: csr.studyId,
          },
        });
      });
    }

    if (terms.length > 0) {
      await db.insert(lumenObservationTerms).values(terms).onConflictDoNothing();
    }

    return {
      success: true,
      termsCreated: terms.length,
      csrProcessed: csrRows.length,
    };
  }

  private normalizeCik(cik: string) {
    const digits = cik.replace(/\D/g, '');
    return digits.padStart(10, '0');
  }

  private async fetchSecSubmissions(cik: string) {
    const url = `${SEC_BASE_URL}/submissions/CIK${cik}.json`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'application/json',
      },
    });
    return response.data;
  }

  private async fetchFilingContent(url: string) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    return response.data;
  }

  private extractReadableText(rawContent: string) {
    if (!rawContent) {
      return '';
    }

    if (rawContent.includes('<html') || rawContent.includes('<HTML')) {
      const $ = cheerio.load(rawContent);
      $('script, style, noscript').remove();
      return $('body').text().replace(/\s+/g, ' ').trim();
    }

    return rawContent.replace(/\s+/g, ' ').trim();
  }

  private extractSignals(text: string) {
    const sentences = text.split(/(?<=\.)\s+/g).slice(0, 4000);

    const rejectionSignals = this.collectMatches(sentences, REJECTION_SIGNAL_PATTERNS, 6);
    const subjectiveSignals = this.collectMatches(sentences, SUBJECTIVE_PATTERNS, 6);
    const objectiveSignals = this.collectMatches(sentences, OBJECTIVE_PATTERNS, 6);

    return {
      rejectionSignals,
      subjectiveSignals,
      objectiveSignals,
      summary: {
        rejectionCount: rejectionSignals.length,
        subjectiveCount: subjectiveSignals.length,
        objectiveCount: objectiveSignals.length,
        fingerprint: crypto
          .createHash('sha256')
          .update(text.slice(0, 10000))
          .digest('hex'),
      },
    };
  }

  private collectMatches(sentences: string[], patterns: RegExp[], max = 6) {
    const matches = [] as Array<{ snippet: string; pattern: string }>;

    for (const sentence of sentences) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(sentence)) {
          matches.push({
            snippet: sentence.trim().slice(0, 320),
            pattern: pattern.source,
          });
        }
      }
      if (matches.length >= max) {
        break;
      }
    }

    return matches;
  }

  private extractReportYear(filingDate?: string) {
    if (!filingDate) return undefined;
    const year = parseInt(filingDate.slice(0, 4), 10);
    return Number.isNaN(year) ? undefined : year;
  }

  private buildDataAtomsFromSignals(params: {
    organizationId: number;
    sourceId: string;
    companyName: string;
    signals: ReturnType<LumenCortexService['extractSignals']>;
  }) {
    const atoms = [] as Array<{
      organizationId: number;
      sourceType: string;
      sourceId: string;
      atomType: string;
      title: string;
      content: string;
      structuredData: Record<string, unknown>;
      tags: string[];
      confidence: number;
      status: string;
    }>;

    params.signals.rejectionSignals.forEach((signal, index) => {
      atoms.push({
        organizationId: params.organizationId,
        sourceType: '10k',
        sourceId: params.sourceId,
        atomType: 'rejection_reason',
        title: `${params.companyName} rejection signal ${index + 1}`,
        content: signal.snippet,
        structuredData: signal,
        tags: ['10k', 'rejection', 'regulatory'],
        confidence: 0.78,
        status: 'active',
      });
    });

    params.signals.subjectiveSignals.forEach((signal, index) => {
      atoms.push({
        organizationId: params.organizationId,
        sourceType: '10k',
        sourceId: params.sourceId,
        atomType: 'subjective_signal',
        title: `${params.companyName} subjective signal ${index + 1}`,
        content: signal.snippet,
        structuredData: signal,
        tags: ['10k', 'subjective', 'risk'],
        confidence: 0.62,
        status: 'active',
      });
    });

    params.signals.objectiveSignals.forEach((signal, index) => {
      atoms.push({
        organizationId: params.organizationId,
        sourceType: '10k',
        sourceId: params.sourceId,
        atomType: 'objective_signal',
        title: `${params.companyName} objective signal ${index + 1}`,
        content: signal.snippet,
        structuredData: signal,
        tags: ['10k', 'objective', 'metric'],
        confidence: 0.7,
        status: 'active',
      });
    });

    return atoms;
  }

  private extractObservationTermsFromCSR(content: Record<string, any>) {
    const bucket = new Map<string, { termType: string; category: string; weight: number }>();

    const addTerms = (terms: string[], termType: string, category: string, weight = 1) => {
      terms.forEach(term => {
        const normalized = term.trim();
        if (!normalized) return;
        const existing = bucket.get(normalized);
        if (existing) {
          bucket.set(normalized, {
            termType: existing.termType,
            category: existing.category,
            weight: Math.max(existing.weight, weight),
          });
        } else {
          bucket.set(normalized, { termType, category, weight });
        }
      });
    };

    addTerms(this.extractTextList(content, ['endpoints', 'primary_endpoints', 'secondary_endpoints']), 'objective', 'endpoint', 1.1);
    addTerms(this.extractTextList(content, ['adverse_events', 'safety', 'safety_signals']), 'objective', 'safety', 1.2);
    addTerms(this.extractTextList(content, ['biomarkers', 'lab_values']), 'objective', 'biomarker', 1.1);
    addTerms(this.extractTextList(content, ['patient_reported_outcomes', 'quality_of_life']), 'subjective', 'patient_reported', 0.9);
    addTerms(this.extractTextList(content, ['protocol_deviations', 'enrollment', 'dropout_reasons']), 'objective', 'operations', 0.9);

    return Array.from(bucket.entries()).map(([term, meta]) => ({
      term,
      termType: meta.termType,
      category: meta.category,
      weight: meta.weight,
    }));
  }

  private extractTextList(content: Record<string, any>, keys: string[]) {
    const terms = new Set<string>();

    keys.forEach(key => {
      const value = content?.[key];
      this.flattenValue(value).forEach(item => terms.add(item));
    });

    return Array.from(terms).filter(term => term.length >= 3);
  }

  private flattenValue(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.flatMap(item => this.flattenValue(item));
    }
    if (typeof value === 'string') {
      return value
        .split(/[,;\n]/g)
        .map(entry => entry.trim())
        .filter(Boolean);
    }
    if (typeof value === 'object') {
      return Object.values(value).flatMap(item => this.flattenValue(item));
    }
    return [];
  }
}

export const lumenCortexService = new LumenCortexService();
