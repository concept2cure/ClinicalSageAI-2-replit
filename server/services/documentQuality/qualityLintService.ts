import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LanguageToolClient } from '../../integrations/languagetool/client';
import { ValeClient } from '../../integrations/vale/client';
import type { DocumentQualityIssue, DocumentQualityReport } from '../documentIntelligence/contracts';
import {
  runConcept2CureMedicalWritingRules,
  type RegulatoryDocumentClass,
} from './rules/concept2cureMedicalWritingRules';

export class DocumentQualityLintService {
  constructor(
    private readonly languageToolClient = new LanguageToolClient(),
    private readonly valeClient = new ValeClient()
  ) {}

  async lint(params: {
    artifactId: string;
    versionId: string;
    text: string;
    advisoryMode?: boolean;
    documentClass?: RegulatoryDocumentClass;
  }): Promise<DocumentQualityReport> {
    const [valeIssues, languageToolIssues, concept2cureIssues] = await Promise.all([
      this.runVale(params.text),
      this.runLanguageTool(params.text),
      Promise.resolve(runConcept2CureMedicalWritingRules(params.text, params.documentClass || 'general')),
    ]);

    return {
      artifactId: params.artifactId,
      versionId: params.versionId,
      advisoryMode: params.advisoryMode ?? true,
      generatedAt: new Date().toISOString(),
      issues: [...concept2cureIssues, ...valeIssues, ...languageToolIssues],
    };
  }

  private async runLanguageTool(text: string): Promise<DocumentQualityIssue[]> {
    const issues = await this.languageToolClient.check(text);
    return issues.slice(0, 100).map((issue) => ({
      checker: 'languagetool',
      severity: 'warning',
      message: issue.message,
      offsetStart: issue.offset,
      offsetEnd: issue.offset + issue.length,
      ruleId: issue.ruleId,
    }));
  }

  private async runVale(text: string): Promise<DocumentQualityIssue[]> {
    const tempDir = await mkdtemp(join(tmpdir(), 'c2c-vale-'));
    const tempFile = join(tempDir, 'candidate.md');

    try {
      await writeFile(tempFile, text, 'utf8');
      const parsed = await this.valeClient.lint(tempFile);
      return parsed.map((entry) => ({
        checker: 'vale',
        severity: entry.severity,
        message: entry.message,
        offsetStart: undefined,
        offsetEnd: undefined,
        ruleId: entry.rule,
      }));
    } catch {
      return [];
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
