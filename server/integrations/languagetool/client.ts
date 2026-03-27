import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('languagetool-client');

export interface LanguageToolIssue {
  message: string;
  offset: number;
  length: number;
  ruleId?: string;
  category?: string;
}

export class LanguageToolClient {
  constructor(
    private readonly baseUrl = process.env.LANGUAGETOOL_BASE_URL || 'http://localhost:8010',
    private readonly timeoutMs = Number(process.env.LANGUAGETOOL_TIMEOUT_MS || 15000)
  ) {}

  async check(text: string, language = 'en-US'): Promise<LanguageToolIssue[]> {
    if (!text.trim()) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body = new URLSearchParams({
        text,
        language,
        enabledOnly: 'false',
      });

      const response = await fetch(`${this.baseUrl}/v2/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LanguageTool responded ${response.status}`);
      }

      const payload = (await response.json()) as {
        matches?: Array<{
          message: string;
          offset: number;
          length: number;
          rule?: { id?: string; category?: { id?: string } };
        }>;
      };

      return (payload.matches || []).map((match) => ({
        message: match.message,
        offset: match.offset,
        length: match.length,
        ruleId: match.rule?.id,
        category: match.rule?.category?.id,
      }));
    } catch (error: any) {
      logger.warn('LanguageTool check failed', { error: error?.message });
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
