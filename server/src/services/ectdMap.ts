export function mapCOA(region: 'FDA' | 'EMA' | 'PMDA') {
  // Minimal mapping differences; expand as needed
  switch (region) {
    case 'EMA':
      return {
        path: 'm3/32-p/32-p-5/coa.pdf',
        title: '3.2.P.5.1 Certificate of Analysis (Batch) — EU',
      };
    case 'PMDA':
      return { path: 'm3/32-p/32-p-5/coa.pdf', title: '3.2.P.5.1 製品品質試験成績書' };
    default: // FDA
      return { path: 'm3/32-p/32-p-5/coa.pdf', title: '3.2.P.5.1 Certificate of Analysis (Batch)' };
  }
}
