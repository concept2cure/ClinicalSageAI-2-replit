import subprocess, os, re, shutil, sys, datetime
REPO='/home/user/ClinicalSageAI-2-replit'
OUT=os.path.join(REPO,'docs/evidence/DOCUMENT-FIDELITY/2026-09-24')
os.makedirs(os.path.join(OUT,'red'),exist_ok=True); os.makedirs(os.path.join(OUT,'green'),exist_ok=True)
HEAD=subprocess.check_output(['git','rev-parse','--short=9','HEAD'],cwd=REPO,text=True).strip()

def rep(path, old, new, count=1):
    return ('rep', path, old, new, count)
def cut(path, start, end, new):
    return ('cut', path, start, end, new)

FINDINGS = [
 ('F-34','Form 3881 defaulted to Prescription Use; Form 3654 pre-certified Part 54 "no financial interests"', '380bd650a',
  [rep('server/services/FDAFormGenerator.ts',
       "prescriptionUse: workflowData?.device_information?.prescriptionUse === true,",
       "prescriptionUse: workflowData?.device_information?.prescriptionUse !== false,"),
   cut('server/services/FDAFormGenerator.ts',
       "      financialInterests:\n        typeof workflowData?.certification?.financialInterests === 'boolean'",
       "      deviceCompliance:",
       "      financialInterests: workflowData?.certification?.financialInterests || false,\n"),
   rep('server/services/FDAFormGenerator.ts',
       "${data.financialInterests === false ? 'checked' : ''}", "${!data.financialInterests ? 'checked' : ''}"),
   rep('server/services/FDAFormGenerator.ts',
       "${data.financialInterests === true ? 'checked' : ''}", "${data.financialInterests ? 'checked' : ''}")],
  ['server/services/__tests__/FDAFormGenerator.no-fabricated-content.test.ts']),
 ('F-35','Entity decoded before tag strip: "&lt; 0.05% and assay was &gt;" deleted from the built .docx', 'cd716f6d6',
  [rep('server/services/docx/masterDocumentBuilder.ts',
       "  let text = inlineMarksToText(html);",
       "  let text = inlineMarksToText(html)\n    .replace(/&amp;/g, '&')\n    .replace(/&nbsp;/g, ' ')\n    .replace(/&lt;/g, '<')\n    .replace(/&gt;/g, '>')\n    .replace(/&quot;/g, '\"');")],
  ['server/export/__tests__/entity-comparators-survive-export.test.ts']),
 ('F-36','The plain-text fallback PDF carried nothing saying it was not the formatted document', 'b34301f6b',
  [rep('server/export/renderers.ts',
       "    doc.fontSize(9);\n    doc.text(FALLBACK_PDF_NOTICE, { align: 'left' });\n    doc.moveDown(0.4);\n    doc.text('\\u2500'.repeat(64), { align: 'left' });\n    doc.moveDown(0.8);\n", "")],
  ['server/export/__tests__/renderers-fallback.test.ts']),
 ('F-37','Editor-JSON to HTML (every PDF) dropped marks, images, table structure and tracked changes', 'd52b24909',
  [rep('server/export/renderers.ts',
       "    return applyMarks(escapeHtml(node.text || ''), node.marks || []);",
       "    return escapeHtml(node.text || '');"),
   rep('server/export/renderers.ts', "  if (node.type === 'image') {", "  if (false && node.type === 'image') {"),
   rep('server/export/renderers.ts', "  if (node.type === 'table') {", "  if (false && node.type === 'table') {"),
   rep('server/export/renderers.ts', "  if (node.type === 'tableRow') {", "  if (false && node.type === 'tableRow') {")],
  ['server/export/__tests__/editor-json-to-html.test.ts']),
 ('F-38','FDA backbone defaulted application-type to fdaat1 (NDA); an IND resolved to fdast9 (IND Safety Reports)', '6d1b9a5df',
  [cut('server/services/submission-gateways/regional-packager.ts',
       "  const explicitApp = resolveApplicationTypeCode(",
       "  const subSubTypeCode =",
       "  const appTypeCode =\n    resolveApplicationTypeCode(fda.applicationType ?? '') ??\n    resolveApplicationTypeCode(input.submissionType) ??\n    'fdaat1';\n  const subTypeCode =\n    resolveSubmissionTypeCode(fda.submissionType ?? input.submissionType) ?? 'fdast1';\n")],
  ['server/services/submission-gateways/__tests__/fda-filing-identity.test.ts']),
 ('F-39','A draft cut off at the model token limit was accepted into coauthor_documents as finished', 'e854953f8',
  [cut('server/routes/batch-draft-routes.ts', "    const finishReason =", "    const model = typeof body.model", "")],
  ['server/routes/__tests__/batch-draft-accept-lineage.pglite.integration.test.ts']),
 ('F-40','Signature manifest printed a content hash nobody compared; a sealed record nobody signed exported', '7087ae5c4',
  [cut('server/routes/authoring.router.ts',
       "    if (exportSignatures.length > 0 && !anySignatureCovers(", "    // Create audit event", ""),
   rep('server/services/authoring/authoring-export.ts',
       "      lines.push(signatureVerdictLine(s.content_hash, currentHash));\n", "")],
  ['server/routes/__tests__/authoringExportSignatureManifest.test.ts']),
]

def apply(edit):
    kind, path = edit[0], os.path.join(REPO, edit[1])
    s = open(path).read()
    if kind == 'rep':
        _,_,old,new,count = edit
        n = s.count(old); assert n >= 1, f'{edit[1]}: anchor missing: {old[:60]!r}'
        s = s.replace(old, new, count)
    else:
        _,_,start,end,new = edit
        a = s.index(start); b = s.index(end, a)
        s = s[:a] + new + s[b:]
    open(path,'w').write(s)

def run(tests):
    r = subprocess.run(['npx','vitest','run',*tests], cwd=REPO, capture_output=True, text=True, timeout=900)
    out = re.sub(r'\x1b\[[0-9;]*m','', r.stdout + r.stderr)
    keep = [l for l in out.splitlines() if re.search(r'^\s*(✓|×)|→|Test Files|Tests\s|AssertionError|FAIL ', l)]
    return r.returncode, '\n'.join(keep)

only = sys.argv[1:]
for fid, title, commit, edits, tests in FINDINGS:
    if only and fid not in only: continue
    files = sorted({e[1] for e in edits})
    backup = {f: open(os.path.join(REPO,f)).read() for f in files}
    try:
        for e in edits: apply(e)
        rc, out = run(tests)
    finally:
        for f,c in backup.items(): open(os.path.join(REPO,f),'w').write(c)
    desc = '\n'.join(f"  - {e[1]}: " + (f"replace {e[2][:70]!r}..." if e[0]=='rep' else f"remove/replace block from {e[2][:50]!r} to {e[3][:40]!r}") for e in edits)
    with open(os.path.join(OUT,'red',f'{fid}.txt'),'w') as fh:
        fh.write(f"{fid} — RED: the test run against the code with this fix reverted\n{title}\n\nFix commit: {commit}. Tree: {HEAD} with ONLY the lines below reverted to the pre-fix logic,\nthen restored byte-for-byte after the run:\n{desc}\n\nvitest exit code: {rc} (non-zero = the test caught the defect)\n\n{out}\n")
    rc2, out2 = run(tests)
    with open(os.path.join(OUT,'green',f'{fid}.txt'),'w') as fh:
        fh.write(f"{fid} — GREEN: the same tests against {HEAD} as committed\n{title}\n\nvitest exit code: {rc2}\n\n{out2}\n")
    print(f"{fid}: red rc={rc}  green rc={rc2}")
