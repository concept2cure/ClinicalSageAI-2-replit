/**
 * Release Hash Generator Service
 * 
 * Generates cryptographic release hashes for regulatory submission packages
 * to ensure integrity verification and compliance with 21 CFR Part 11.
 * 
 * Phase 6 Component - eCTD Co-Author + Document Drafting
 * Critical for Trust Rails pillar compliance
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { AuditLogger } from '../audit/auditLogger';

export interface HashAlgorithm {
  name: 'SHA-256' | 'SHA-512' | 'MD5';
  cryptoName: string;
}

export const HASH_ALGORITHMS: Record<string, HashAlgorithm> = {
  'SHA-256': { name: 'SHA-256', cryptoName: 'sha256' },
  'SHA-512': { name: 'SHA-512', cryptoName: 'sha512' },
  'MD5': { name: 'MD5', cryptoName: 'md5' }, // For legacy compatibility only
};

export interface FileHashEntry {
  filePath: string;
  fileName: string;
  hash: string;
  algorithm: string;
  size: number;
  lastModified: Date;
}

export interface ReleaseManifest {
  releaseId: string;
  projectId?: string;
  submissionType?: string;
  version: string;
  createdAt: Date;
  algorithm: string;
  files: FileHashEntry[];
  bundleHash: string; // Overall hash of all files combined
  metadata?: Record<string, any>;
}

export interface ReleasePackage {
  manifest: ReleaseManifest;
  manifestHash: string; // Hash of the manifest itself
  verificationCode: string; // Short verification code for human readability
}

/**
 * Release Hash Generator
 * Generates cryptographic hashes for regulatory submission packages
 */
export class ReleaseHashGenerator {
  private auditLogger: AuditLogger;
  private defaultAlgorithm: HashAlgorithm;

  constructor(algorithm: string = 'SHA-256') {
    this.auditLogger = new AuditLogger();
    this.defaultAlgorithm = HASH_ALGORITHMS[algorithm] || HASH_ALGORITHMS['SHA-256'];
  }

  /**
   * Generate release package with hashes for a set of files
   */
  async generateReleasePackage(
    filePaths: string[],
    options: {
      releaseId?: string;
      projectId?: string;
      submissionType?: string;
      version?: string;
      algorithm?: string;
      organizationId?: string;
      userId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<ReleasePackage> {
    try {
      const algorithm = HASH_ALGORITHMS[options.algorithm || 'SHA-256'] || this.defaultAlgorithm;
      const releaseId = options.releaseId || this.generateReleaseId();

      logger.info(`Generating release package ${releaseId} with ${filePaths.length} files`);

      // Hash each file
      const fileHashes: FileHashEntry[] = [];
      for (const filePath of filePaths) {
        const fileHash = await this.hashFile(filePath, algorithm);
        fileHashes.push(fileHash);
      }

      // Generate bundle hash (hash of all file hashes combined)
      const bundleHash = this.generateBundleHash(fileHashes, algorithm);

      // Create manifest
      const manifest: ReleaseManifest = {
        releaseId,
        projectId: options.projectId,
        submissionType: options.submissionType,
        version: options.version || '1.0.0',
        createdAt: new Date(),
        algorithm: algorithm.name,
        files: fileHashes,
        bundleHash,
        metadata: options.metadata,
      };

      // Hash the manifest itself
      const manifestHash = this.hashObject(manifest, algorithm);

      // Generate human-readable verification code
      const verificationCode = this.generateVerificationCode(manifestHash);

      const releasePackage: ReleasePackage = {
        manifest,
        manifestHash,
        verificationCode,
      };

      // Audit log
      if (options.organizationId && options.userId) {
        await this.auditLogger.log({
          action: 'release_package_generated',
          userId: options.userId,
          organizationId: options.organizationId,
          resourceType: 'release_package',
          resourceId: releaseId,
          details: {
            algorithm: algorithm.name,
            fileCount: filePaths.length,
            bundleHash,
            manifestHash,
            verificationCode,
          },
          timestamp: new Date(),
        });
      }

      logger.info(`Release package generated: ${releaseId} (verification: ${verificationCode})`);
      return releasePackage;

    } catch (error: any) {
      logger.error('Error generating release package:', error);
      throw new Error(`Failed to generate release package: ${error.message}`);
    }
  }

  /**
   * Hash a single file
   */
  async hashFile(filePath: string, algorithm: HashAlgorithm): Promise<FileHashEntry> {
    try {
      const stats = await fs.stat(filePath);
      const fileBuffer = await fs.readFile(filePath);
      
      const hash = crypto
        .createHash(algorithm.cryptoName)
        .update(fileBuffer)
        .digest('hex');

      return {
        filePath,
        fileName: path.basename(filePath),
        hash,
        algorithm: algorithm.name,
        size: stats.size,
        lastModified: stats.mtime,
      };
    } catch (error: any) {
      throw new Error(`Failed to hash file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Hash a string or buffer
   */
  hashContent(content: string | Buffer, algorithm: HashAlgorithm = this.defaultAlgorithm): string {
    return crypto
      .createHash(algorithm.cryptoName)
      .update(content)
      .digest('hex');
  }

  /**
   * Hash an object (converts to canonical JSON first)
   */
  hashObject(obj: any, algorithm: HashAlgorithm = this.defaultAlgorithm): string {
    const canonical = this.canonicalizeObject(obj);
    return this.hashContent(canonical, algorithm);
  }

  /**
   * Generate bundle hash from multiple file hashes
   */
  private generateBundleHash(files: FileHashEntry[], algorithm: HashAlgorithm): string {
    // Sort files by path for deterministic ordering
    const sortedFiles = [...files].sort((a, b) => a.filePath.localeCompare(b.filePath));
    
    // Concatenate all hashes
    const combined = sortedFiles.map(f => f.hash).join('');
    
    // Hash the combined string
    return crypto
      .createHash(algorithm.cryptoName)
      .update(combined)
      .digest('hex');
  }

  /**
   * Verify a release package against files
   */
  async verifyReleasePackage(
    releasePackage: ReleasePackage,
    filePaths: string[]
  ): Promise<{
    valid: boolean;
    errors: string[];
    fileResults: Array<{ file: string; valid: boolean; error?: string }>;
  }> {
    const errors: string[] = [];
    const fileResults: Array<{ file: string; valid: boolean; error?: string }> = [];

    try {
      const algorithm = HASH_ALGORITHMS[releasePackage.manifest.algorithm];
      if (!algorithm) {
        errors.push(`Unknown algorithm: ${releasePackage.manifest.algorithm}`);
        return { valid: false, errors, fileResults };
      }

      // Verify manifest hash
      const computedManifestHash = this.hashObject(releasePackage.manifest, algorithm);
      if (computedManifestHash !== releasePackage.manifestHash) {
        errors.push('Manifest hash mismatch - manifest has been tampered');
      }

      // Verify file count
      if (filePaths.length !== releasePackage.manifest.files.length) {
        errors.push(
          `File count mismatch: expected ${releasePackage.manifest.files.length}, got ${filePaths.length}`
        );
      }

      // Verify each file hash
      for (const manifestFile of releasePackage.manifest.files) {
        const actualFile = filePaths.find(
          fp => path.basename(fp) === manifestFile.fileName
        );

        if (!actualFile) {
          fileResults.push({
            file: manifestFile.fileName,
            valid: false,
            error: 'File not found',
          });
          errors.push(`Missing file: ${manifestFile.fileName}`);
          continue;
        }

        try {
          const actualHash = await this.hashFile(actualFile, algorithm);
          
          if (actualHash.hash === manifestFile.hash) {
            fileResults.push({ file: manifestFile.fileName, valid: true });
          } else {
            fileResults.push({
              file: manifestFile.fileName,
              valid: false,
              error: 'Hash mismatch',
            });
            errors.push(`Hash mismatch for ${manifestFile.fileName}`);
          }
        } catch (error: any) {
          fileResults.push({
            file: manifestFile.fileName,
            valid: false,
            error: error.message,
          });
          errors.push(`Error verifying ${manifestFile.fileName}: ${error.message}`);
        }
      }

      // Verify bundle hash
      const fileHashes = releasePackage.manifest.files;
      const computedBundleHash = this.generateBundleHash(fileHashes, algorithm);
      if (computedBundleHash !== releasePackage.manifest.bundleHash) {
        errors.push('Bundle hash mismatch');
      }

      return {
        valid: errors.length === 0,
        errors,
        fileResults,
      };

    } catch (error: any) {
      errors.push(`Verification error: ${error.message}`);
      return { valid: false, errors, fileResults };
    }
  }

  /**
   * Save release package manifest to file
   */
  async saveManifest(releasePackage: ReleasePackage, outputPath: string): Promise<void> {
    try {
      const content = JSON.stringify(releasePackage, null, 2);
      await fs.writeFile(outputPath, content, 'utf-8');
      logger.info(`Manifest saved to ${outputPath}`);
    } catch (error: any) {
      throw new Error(`Failed to save manifest: ${error.message}`);
    }
  }

  /**
   * Load release package manifest from file
   */
  async loadManifest(manifestPath: string): Promise<ReleasePackage> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to load manifest: ${error.message}`);
    }
  }

  /**
   * Generate eCTD package hash
   * Specifically for eCTD folder structures
   */
  async generateECTDPackageHash(
    ectdRootPath: string,
    options: {
      includeIndex?: boolean; // Include index.xml in hash
      algorithm?: string;
    } = {}
  ): Promise<{
    packageHash: string;
    fileCount: number;
    totalSize: number;
  }> {
    try {
      const algorithm = HASH_ALGORITHMS[options.algorithm || 'SHA-256'] || this.defaultAlgorithm;
      
      // Recursively find all files
      const files = await this.findFilesRecursively(ectdRootPath);
      
      // Filter out index.xml if needed
      let relevantFiles = files;
      if (!options.includeIndex) {
        relevantFiles = files.filter(f => !f.endsWith('index.xml'));
      }

      // Hash all files
      const fileHashes: FileHashEntry[] = [];
      let totalSize = 0;
      
      for (const file of relevantFiles) {
        const hash = await this.hashFile(file, algorithm);
        fileHashes.push(hash);
        totalSize += hash.size;
      }

      // Generate package hash
      const packageHash = this.generateBundleHash(fileHashes, algorithm);

      return {
        packageHash,
        fileCount: relevantFiles.length,
        totalSize,
      };

    } catch (error: any) {
      throw new Error(`Failed to generate eCTD package hash: ${error.message}`);
    }
  }

  /**
   * Helper: Generate a unique release ID
   */
  private generateReleaseId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(4).toString('hex');
    return `REL-${timestamp}-${random}`;
  }

  /**
   * Helper: Generate human-readable verification code
   * Takes first 8 and last 8 characters of hash
   */
  private generateVerificationCode(hash: string): string {
    const prefix = hash.substring(0, 8);
    const suffix = hash.substring(hash.length - 8);
    return `${prefix.toUpperCase()}-${suffix.toUpperCase()}`;
  }

  /**
   * Helper: Canonicalize object for consistent hashing
   */
  private canonicalizeObject(obj: any): string {
    // Sort object keys recursively for deterministic JSON
    const sortedObj = this.sortObjectKeys(obj);
    return JSON.stringify(sortedObj);
  }

  /**
   * Helper: Recursively sort object keys
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        sorted[key] = this.sortObjectKeys(obj[key]);
      });

    return sorted;
  }

  /**
   * Helper: Recursively find all files in directory
   */
  private async findFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    async function traverse(currentPath: string) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await traverse(dirPath);
    return files;
  }

  /**
   * Generate hash chain for audit trail
   * Each entry includes hash of previous entry
   */
  generateHashChain(
    entries: Array<{ data: any }>,
    algorithm: HashAlgorithm = this.defaultAlgorithm
  ): Array<{ data: any; hash: string; prevHash: string | null }> {
    const chain: Array<{ data: any; hash: string; prevHash: string | null }> = [];
    let prevHash: string | null = null;

    for (const entry of entries) {
      const entryWithPrev = { ...entry.data, prevHash };
      const hash = this.hashObject(entryWithPrev, algorithm);
      
      chain.push({
        data: entry.data,
        hash,
        prevHash,
      });

      prevHash = hash;
    }

    return chain;
  }

  /**
   * Verify hash chain integrity
   */
  verifyHashChain(
    chain: Array<{ data: any; hash: string; prevHash: string | null }>,
    algorithm: HashAlgorithm = this.defaultAlgorithm
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let prevHash: string | null = null;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];

      // Verify prevHash matches
      if (entry.prevHash !== prevHash) {
        errors.push(`Entry ${i}: prevHash mismatch`);
      }

      // Verify hash
      const entryWithPrev = { ...entry.data, prevHash: entry.prevHash };
      const computedHash = this.hashObject(entryWithPrev, algorithm);
      
      if (computedHash !== entry.hash) {
        errors.push(`Entry ${i}: hash mismatch`);
      }

      prevHash = entry.hash;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const releaseHashGenerator = new ReleaseHashGenerator();
