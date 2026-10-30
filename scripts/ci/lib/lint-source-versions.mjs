/** Lint historical bytes without placing them in a scanned source directory. */
export async function lintSourceVersions(sources, cwd) {
  if (sources.length === 0) return [];
  // Load only for --since; arithmetic/report-only invocations need no linter.
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd, warnIgnored: false });
  const report = [];
  for (const { filePath, source } of sources) {
    // filePath is the real name, including exact-basename config and ignores.
    report.push(...await eslint.lintText(source, { filePath }));
  }
  return report;
}
