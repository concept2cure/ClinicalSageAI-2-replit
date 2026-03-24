export interface AskAnaSanitizedInput {
  query: string;
  audience: string;
  responseFormat: string;
  sanitizedDocumentContent?: string;
  warnings: string[];
}

export interface AskAnaValidationSuccess {
  ok: true;
  value: AskAnaSanitizedInput;
}

export interface AskAnaValidationFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
}

export type AskAnaValidationResult = AskAnaValidationSuccess | AskAnaValidationFailure;

export function sanitizeAskAnaInput(body: any): AskAnaValidationResult {
  const rawQuery = body?.query;
  if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Validation error',
      message: '`query` must be a non-empty string',
    };
  }

  const warnings: string[] = [];
  const query = rawQuery.trim().slice(0, 8000);
  if (rawQuery.trim().length > 8000) {
    warnings.push('query_truncated_to_8000_chars');
  }

  const audience = String(body?.audience || 'regulatory_lead').toLowerCase();
  const responseFormat = String(body?.responseFormat || 'markdown').toLowerCase();

  const sanitizedDocumentContent =
    typeof body?.documentContent === 'string' ? body.documentContent.slice(0, 12000) : undefined;
  if (typeof body?.documentContent === 'string' && body.documentContent.length > 12000) {
    warnings.push('document_content_truncated_to_12000_chars');
  }

  return {
    ok: true,
    value: {
      query,
      audience,
      responseFormat,
      sanitizedDocumentContent,
      warnings,
    },
  };
}
