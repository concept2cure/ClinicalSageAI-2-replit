import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import { finished } from 'stream/promises';
import { ECTDGenerator, type CER2VDocument } from './ectd-generator';

export interface ECTDExportResult {
  filename: string;
  buffer: Buffer;
  manifest: RegTraceManifest;
}

export interface EvidenceAttachment {
  name: string;
  path: string;
}

export interface RegTraceManifest {
  manifestVersion: string;
  exportId: string;
  generatedAt: string;
  generator: {
    name: string;
    version: string;
  };
  device: {
    identifier: string;
    intendedUse: string;
    regulatoryPathway: string;
  };
  evidence: Array<{
    id: string;
    description: string;
    sha256: string;
    source: string;
  }>;
  claims: Array<{
    id: string;
    text: string;
    evidenceIds: string[];
  }>;
  standards: Array<{
    id: string;
    requirement: string;
    evidenceIds: string[];
  }>;
  outcomes: Array<{
    id: string;
    text: string;
    evidenceIds: string[];
  }>;
  cerSections: Array<{
    id: string;
    title: string;
    evidenceIds: string[];
  }>;
  integrity: {
    hashAlgorithm: string;
    merkleRoot: string | null;
    evidenceCount: number;
  };
  citationSummary?: {
    totalTokens: number;
    resolvedTokens: number;
    unresolvedTokens: number;
  };
  warnings: string[];
  signature: {
    algorithm: string | null;
    value: string | null;
  };
}

export class ECTDExporter {
  private generator = new ECTDGenerator();

  private computeMerkleRoot(hashes: string[]): string | null {
    if (!hashes.length) return null;
    let level = hashes.slice().sort();
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || level[i];
        const combined = `${left}${right}`;
        next.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }
      level = next;
    }
    return level[0];
  }

  buildRegTraceManifest(
    cer: CER2VDocument,
    options?: { csrId?: string; citationSummary?: RegTraceManifest['citationSummary'] }
  ): RegTraceManifest {
    const exportId = `regtrace-${options?.csrId || 'export'}-${Date.now()}`;
    const evidence = cer.clinicalEvidence.map((entry, index) => {
      const hash = crypto.createHash('sha256').update(entry).digest('hex');
      return {
        id: `evidence-${index + 1}`,
        description: entry,
        sha256: hash,
        source: 'CSR',
      };
    });
    const merkleRoot = this.computeMerkleRoot(evidence.map(item => item.sha256));

    return {
      manifestVersion: '1.0.0',
      exportId,
      generatedAt: new Date().toISOString(),
      generator: {
        name: 'CER2V RegTrace',
        version: '0.1.0',
      },
      device: {
        identifier: cer.deviceIdentifier,
        intendedUse: cer.intendedUse,
        regulatoryPathway: cer.regulatoryPathway,
      },
      evidence,
      claims: [
        {
          id: 'claim-1',
          text: 'Substantial equivalence supported by predicate analysis',
          evidenceIds: evidence.slice(0, 1).map(item => item.id),
        },
      ],
      standards: [
        {
          id: 'standard-1',
          requirement: 'ISO 10993-5 cytotoxicity report',
          evidenceIds: [],
        },
      ],
      outcomes: [
        {
          id: 'outcome-1',
          text: 'Clinical success rate above 90%',
          evidenceIds: evidence.slice(0, 1).map(item => item.id),
        },
      ],
      cerSections: [
        {
          id: 'section-1',
          title: 'Predicate analysis',
          evidenceIds: evidence.slice(0, 1).map(item => item.id),
        },
      ],
      integrity: {
        hashAlgorithm: 'sha256',
        merkleRoot,
        evidenceCount: evidence.length,
      },
      citationSummary: options?.citationSummary || {
        totalTokens: 0,
        resolvedTokens: 0,
        unresolvedTokens: 0,
      },
      warnings: [],
      signature: {
        algorithm: null,
        value: null,
      },
    };
  }

  async exportZip(
    cer: CER2VDocument,
    options?: {
      csrId?: string;
      citationSummary?: RegTraceManifest['citationSummary'];
      evidenceFiles?: EvidenceAttachment[];
    }
  ): Promise<ECTDExportResult> {
    const ectdXml = this.generator.exportToECTD(cer);
    const manifest = this.buildRegTraceManifest(cer, options);
    const summary = {
      deviceIdentifier: cer.deviceIdentifier,
      regulatoryPathway: cer.regulatoryPathway,
      intendedUse: cer.intendedUse,
      evidenceCount: cer.clinicalEvidence.length,
      csrId: options?.csrId || null,
      generatedAt: new Date().toISOString(),
    };
    const integrityCertificate = {
      exportId: manifest.exportId,
      generatedAt: manifest.generatedAt,
      hashAlgorithm: manifest.integrity.hashAlgorithm,
      merkleRoot: manifest.integrity.merkleRoot,
      evidenceCount: manifest.integrity.evidenceCount,
      note: 'Integrity certificate generated by CER2V RegTrace (unsigned).',
    };

    const filename = `cer2v-${options?.csrId || 'export'}-${Date.now()}.zip`;
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(stream);

    archive.append(ectdXml, { name: 'ectd.xml' });
    archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'regtrace-manifest.json' });
    archive.append(JSON.stringify(integrityCertificate, null, 2), {
      name: 'integrity-certificate.json',
    });

    if (options?.evidenceFiles?.length) {
      options.evidenceFiles.forEach(file => {
        if (fs.existsSync(file.path)) {
          const baseName = path.basename(file.path);
          archive.append(fs.createReadStream(file.path), {
            name: `evidence/${file.name || baseName}`,
          });
        } else {
          manifest.warnings.push(`Missing evidence file: ${file.path}`);
        }
      });
    }

    await archive.finalize();
    await finished(stream);

    return {
      filename,
      buffer: Buffer.concat(chunks),
      manifest,
    };
  }
}
