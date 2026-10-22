export const meta = {
  name: 'ana-knowledge-audit',
  description: "Find factual regulatory errors in AnA's question flows and war-game auditors, then adversarially verify each",
  phases: [{ title: 'Find', detail: 'one finder per file pair' }, { title: 'Verify', detail: 'two skeptics per finding' }],
}
const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  file: { type: 'string' }, line: { type: 'integer' }, quote: { type: 'string', description: 'the exact text as it appears in the file' },
  error: { type: 'string', description: 'what is factually wrong, specifically' },
  correct: { type: 'string', description: 'the correct statement' },
  severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  confidence: { type: 'string', enum: ['high', 'medium'] } },
  required: ['file', 'line', 'quote', 'error', 'correct', 'severity', 'confidence'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, why: { type: 'string' }, correctedText: { type: 'string' } }, required: ['real', 'why', 'correctedText'] }
const PROMPT = (files) => `You are a senior regulatory affairs expert (FDA drugs/biologics/devices, ICH, EU) auditing the regulatory knowledge an AI assistant (AnA) serves to pharma, biotech and device clients. Read these files IN FULL (they are question flows / auditors whose strings are shown to clients):\n${files.join('\n')}\n\nReport ONLY statements in client-facing strings that are FACTUALLY WRONG and that you are confident about: a citation to a CFR section/paragraph that does not exist or says something else; a removed regulation cited as in force (e.g. 21 CFR 820.x QSR sections after the QMSR took effect 2026-02-02, unless marked as former); a superseded guideline cited as current (ICH E6(R2) is superseded by E6(R3) 2025-01-06; check others like E2B(R2)→E2B(R3), Q3D(R1)→(R2), E9 addendum); wrong timelines (e.g. IND safety report 15/7 calendar days, 30-day IND review, PDUFA goal dates, 510(k) 90 FDA days, MDR 30/5 days, BPDR 45 days, field alert 3 working days, annual report within 60 days of anniversary); wrong numbers or thresholds; wrong section numbering of a guideline structure (ICH E3, M4, M11, E2C(R2), E2F); claims that something is required that is not, or vice versa. Do NOT report style, wording, emphasis, missing nice-to-haves, or things you are unsure of. Do NOT edit files. Cite line numbers. If a file has no confident errors, return an empty list for it.`
const groups = args.groups
const results = await pipeline(
  groups,
  (files, _o, i) => agent(PROMPT(files), { label: `find-${i + 1}`, phase: 'Find', schema: FIND }),
  (found, files, i) => parallel((found?.findings ?? []).map((f, j) => () =>
    parallel(['regulation', 'code'].map((lens) => () => agent(
      lens === 'regulation'
        ? `Adversarially verify a claimed regulatory error. Try to REFUTE it; default to real=false if you are not confident it is a genuine factual error a regulator would recognise. Claim: in ${f.file}:${f.line} the text "${f.quote}" is wrong because: ${f.error}. Proposed correct statement: ${f.correct}. Judge on regulatory substance only (your expert knowledge of CFR, ICH, FDA/EMA guidance). If real, give correctedText: the exact replacement wording for the quoted text, keeping its meaning and style, and do not invent paragraph numbers you are unsure of.`
        : `Read ${f.file} around line ${f.line} (read-only). Confirm the quoted text "${f.quote}" really exists there and is shown to clients (a string, not a code comment or test), and that the claimed error ("${f.error}") reads the text correctly in its context (e.g. not already qualified as "formerly", not about a different section). real=true only if both hold. correctedText: the replacement for the quoted text if real.`,
      { label: `verify-${i + 1}.${j + 1}-${lens}`, phase: 'Verify', schema: VERDICT })))
      .then((vs) => ({ ...f, verdicts: vs, confirmed: vs.filter(Boolean).every((v) => v.real) && vs.filter(Boolean).length === 2 })))),
)
const all = results.flat().filter(Boolean)
return { total: all.length, confirmed: all.filter((f) => f.confirmed), rejected: all.filter((f) => !f.confirmed).map((f) => ({ file: f.file, line: f.line, quote: f.quote, why: f.verdicts.filter(Boolean).map((v) => v.why).join(' | ') })) }