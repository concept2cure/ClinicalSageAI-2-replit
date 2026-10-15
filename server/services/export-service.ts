import path from 'path';
import { promises as fsPromises } from 'fs';
import JSZip from 'jszip';

/**
 * Service for exporting and bundling study session data
 */
export class ExportService {
  private readonly basePath: string;

  constructor() {
    this.basePath = process.env.DATA_PATH || path.join(process.cwd(), 'data');
  }

  /**
   * Creates a session archive bundle with all study artifacts
   * @param studyId - The ID of the study session
   * @param persona - The persona perspective (optional)
   * @returns Path to the generated ZIP file
   */
  async createSessionArchive(studyId: string, persona?: string): Promise<string> {
    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const archiveDir = path.join(this.basePath, 'sessions', studyId);
    const zipFilename = `${studyId}_bundle_${timestamp}.zip`;
    const zipPath = path.join(this.basePath, 'exports', zipFilename);

    // Ensure directories exist
    await fsPromises.mkdir(path.join(this.basePath, 'exports'), { recursive: true });
    await fsPromises.mkdir(archiveDir, { recursive: true });

    // Write the files this export can produce; the manifest lists them
    const files = await this.generateArchiveFiles(studyId, archiveDir, persona);

    // Zip exactly those files, not whatever an earlier run left in the directory
    await this.createZipArchive(archiveDir, files, zipPath);

    return zipPath;
  }

  /**
   * Write the files to be included in the archive and return their names.
   *
   * 2026-10-15: study_insights.json was written as [] with insight_count 0 —
   * there is no insight storage, so that read as "this study has no insights" —
   * file_count was guessed, and a missing persona was recorded as 'unknown'.
   * The manifest now lists the files written and names what was not exported.
   */
  private async generateArchiveFiles(
    studyId: string,
    archiveDir: string,
    persona?: string
  ): Promise<string[]> {
    try {
      const files: string[] = [];
      const notExported: string[] = ['study insights: no insight storage is implemented'];
      const write = async (name: string, content: string) => {
        await fsPromises.writeFile(path.join(archiveDir, name), content);
        files.push(name);
      };

      // Get protocol content if available
      const protocol = await this.getLatestProtocol(studyId);
      if (protocol) {
        await write('protocol.txt', protocol.original || 'No protocol content available');
        if (protocol.fixed) await write('protocol_repaired.txt', protocol.fixed);
      } else {
        notExported.push('protocol: protocol retrieval is not wired');
      }

      // Add any prediction results if available
      const predictionResults = await this.getPredictionResults(studyId);
      if (predictionResults) {
        await write('success_prediction.json', JSON.stringify(predictionResults, null, 2));
      } else {
        notExported.push('success prediction: no prediction model is wired');
      }

      // Add summary report if available
      const summaryReport = await this.getSummaryReport(studyId);
      if (summaryReport && summaryReport.content) {
        await write('summary_report.md', summaryReport.content);
      } else {
        notExported.push('summary report: no summary generator is wired');
      }

      const manifest = {
        study_id: studyId,
        persona: persona ?? null,
        generated_at: new Date().toISOString(),
        files: [...files, 'manifest.json'],
        not_exported: notExported,
      };
      await write('manifest.json', JSON.stringify(manifest, null, 2));
      return files;
    } catch (error) {
      console.error('Error generating archive files:', error);
      throw new Error('Failed to generate session archive files', { cause: error });
    }
  }

  /**
   * Create a ZIP archive of the named files in a directory.
   *
   * 2026-10-15: this gzipped a home-made `name:length:` stream (through a
   * `require`, which is undefined in this ESM bundle) and renamed the .tar.gz
   * to .zip — no ZIP reader could open it.
   */
  private async createZipArchive(sourceDir: string, fileNames: string[], targetZip: string): Promise<void> {
    try {
      const zip = new JSZip();
      for (const name of fileNames) {
        zip.file(name, await fsPromises.readFile(path.join(sourceDir, name)));
      }
      await fsPromises.writeFile(targetZip, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    } catch (error) {
      console.error('Error creating archive:', error);
      throw new Error('Failed to create archive file', { cause: error });
    }
  }

  /**
   * Get the latest protocol content for a study
   */
  private async getLatestProtocol(studyId: string): Promise<any> {
    // Protocol retrieval is not wired (the previous implementation issued a
    // server-side fetch of a relative URL, which can never resolve in Node and
    // always failed silently). Return null honestly so the export omits the
    // protocol files rather than appearing to attempt a fetch.
    // See FORENSIC_CODE_AUDIT_2026-05-29.md HI-4.
    console.warn(
      `getLatestProtocol: protocol retrieval not wired for study ${studyId}; omitting from export.`
    );
    return null;
  }

  /**
   * Get prediction results for a study
   */
  private async getPredictionResults(studyId: string): Promise<any> {
    // No success-prediction model is wired. Return null so the export simply omits
    // success_prediction.json, rather than writing a fabricated probability into a
    // user's deliverable. See FORENSIC_CODE_AUDIT_2026-05-29.md HI-4.
    console.warn(
      `getPredictionResults: no prediction model wired for study ${studyId}; omitting from export.`
    );
    return null;
  }

  /**
   * Get summary report for a study
   */
  private async getSummaryReport(studyId: string): Promise<any> {
    // No summary-report generator is wired. Return null so the export omits
    // summary_report.md, rather than writing a fabricated study summary into a
    // user's deliverable. See FORENSIC_CODE_AUDIT_2026-05-29.md HI-4.
    console.warn(
      `getSummaryReport: no summary generator wired for study ${studyId}; omitting from export.`
    );
    return null;
  }
}

// Export singleton instance
export const exportService = new ExportService();
