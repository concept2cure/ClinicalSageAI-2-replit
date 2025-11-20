// Minimal parser: normalize plain text, naive due-date & region heuristics
export type ParsedEmail = {
  subject?: string;
  from?: string;
  to?: string;
  text: string;
  html?: string;
  region?: string;
  due?: string;
};

export function normalizeEmail(body: string): string {
  // strip > quotes & excess whitespace
  return (body || '')
    .replace(/^\s*>.*$/gm, '')
    .replace(/\r/g, '')
    .trim();
}

export function extractDueAndRegion(text: string): { region?: string; due?: string } {
  const t = text || '';
  const due = (t.match(
    /(?:due|respond by|no later than)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{4}|within\s+\d+\s+(?:business|working)\s+days)/i
  ) || [])[1];
  const regionMatch =
    /EMA|European Medicines Agency|FDA|Food and Drug Administration|PMDA|Health Canada|MHRA/i.exec(
      t
    );
  const region = regionMatch
    ? regionMatch[0].toUpperCase().includes('FDA')
      ? 'FDA'
      : regionMatch[0].toUpperCase().includes('EMA')
        ? 'EMA'
        : regionMatch[0].toUpperCase().includes('PMDA')
          ? 'PMDA'
          : regionMatch[0].toUpperCase().includes('MHRA')
            ? 'MHRA'
            : 'HC'
    : undefined;
  return { region, due };
}

export function naiveSplitQuestions(text: string): string[] {
  // crude bullet / numbered list split; AI refines later
  const blocks = text.split(/\n{2,}/).filter(b => b.length > 0);
  const candidates = blocks.filter(b =>
    /(?:question|please provide|justify|explain|clarify|describe|submit)/i.test(b)
  );
  return candidates.slice(0, 50);
}
