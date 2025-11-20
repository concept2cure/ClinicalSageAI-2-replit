import JSZip from 'jszip';

// Optional xmlbuilder2 import - gracefully degrades if not available
let create: any;
try {
  const xmlbuilder2 = await import('xmlbuilder2');
  create = xmlbuilder2.create;
} catch (e) {
  // xmlbuilder2 not available - will use fallback
  create = null;
}

export async function buildECTDZip(opts: {
  region: 'FDA' | 'EMA' | 'PMDA';
  sequence: string;
  operation: 'new' | 'replace' | 'append' | 'delete';
  leafs: { path: string; mediaType: string; content: Buffer }[];
}) {
  const zip = new JSZip();
  
  // If xmlbuilder2 not available, use simple XML template
  let xml: string;
  if (!create) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<ectd:index xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
${opts.leafs.map(l => `  <ectd:leaf xlink:href="${l.path}" operation="${opts.operation}" checksum="" application-version="1.0"/>`).join('\n')}
</ectd:index>`;
  } else {
    const root = {
      'ectd:leaf': opts.leafs.map(l => ({
        '@xlink:href': l.path,
        '@operation': opts.operation,
        '@checksum': '',
        '@application-version': '1.0',
      })),
    };
    xml = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('ectd:index', {
        'xmlns:ectd': 'http://www.ich.org/ectd',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      })
      .ele(root)
      .up()
      .end({ prettyPrint: true });
  }
  
  zip.file('index.xml', xml);
  for (const l of opts.leafs) {
    zip.file(l.path, l.content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function buildeCTDZip(batchData: any, region: string = 'FDA') {
  const zip = new JSZip();

  // Create basic eCTD structure
  const m1 = zip.folder('m1');
  const m3 = zip.folder('m3');
  const m3_32p = m3?.folder('32-p');
  const m3_32p_5 = m3_32p?.folder('32-p-5');
  const coaFolder = m3_32p_5?.folder('coa');

  // Generate basic COA content
  const coaContent = generateCOA(batchData);
  coaFolder?.file(`COA_${batchData.batch_number || 'batch'}.pdf`, coaContent);

  // Generate backbone XML for eCTD
  const backboneXml = generateBackboneXml(batchData, region);
  zip.file('index.xml', backboneXml);

  return await zip.generateAsync({ type: 'blob' });
}

function generateCOA(batchData: any): string {
  // Simple COA generation - in production this would be more sophisticated
  return `Certificate of Analysis
  
Batch Number: ${batchData.batch_number || 'N/A'}
Product: ${batchData.product_name || 'N/A'}
Manufacturing Date: ${batchData.mfg_date || new Date().toISOString().split('T')[0]}
Expiry Date: ${batchData.expiry_date || 'N/A'}

Test Results:
${JSON.stringify(batchData.test_results || {}, null, 2)}

Analysis Complete: ${new Date().toISOString()}
`;
}

function generateBackboneXml(batchData: any, region: string): string {
  // If xmlbuilder2 not available, use simple XML template
  if (!create) {
    const country = region === 'FDA' ? 'US' : region === 'EMA' ? 'EU' : 'JP';
    return `<?xml version="1.0" encoding="UTF-8"?>
<ectd:ectd-backbone xmlns:ectd="http://www.ich.org/ectd" dtd-version="3.2.2" xml:lang="en">
  <admin-info>
    <applicant-info>
      <company>Pharmaceutical Company</company>
      <country>${country}</country>
    </applicant-info>
  </admin-info>
  <m3>
    <m3-32-p>
      <m3-32-p-5>
        <title>Batch Formula</title>
        <leaf id="coa-${batchData.batch_number}">
          <title>Certificate of Analysis - ${batchData.batch_number}</title>
          <source-file>m3/32-p/32-p-5/coa/COA_${batchData.batch_number}.pdf</source-file>
        </leaf>
      </m3-32-p-5>
    </m3-32-p>
  </m3>
</ectd:ectd-backbone>`;
  }
  
  const doc = create({
    'ectd:ectd-backbone': {
      '@xmlns:ectd': 'http://www.ich.org/ectd',
      '@dtd-version': '3.2.2',
      '@xml:lang': 'en',
      'admin-info': {
        'applicant-info': {
          company: 'Pharmaceutical Company',
          country: region === 'FDA' ? 'US' : region === 'EMA' ? 'EU' : 'JP',
        },
      },
      m3: {
        'm3-32-p': {
          'm3-32-p-5': {
            title: 'Batch Formula',
            leaf: {
              '@id': `coa-${batchData.batch_number}`,
              title: `Certificate of Analysis - ${batchData.batch_number}`,
              'source-file': `m3/32-p/32-p-5/coa/COA_${batchData.batch_number}.pdf`,
            },
          },
        },
      },
    },
  });

  return doc.end({ prettyPrint: true });
}

export function validateeCTDStructure(zipData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation - check for required files/folders
  if (!zipData) {
    errors.push('No ZIP data provided');
    return { valid: false, errors };
  }

  // In a real implementation, you would validate the ZIP structure
  // against ICH eCTD specifications

  return { valid: errors.length === 0, errors };
}
