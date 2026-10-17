import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import { ReportingPdfError } from './writer';
import { companyLogoBytes } from '../../company-documents/validation';
import { imageSize } from '../../templates/imageSize';

/** Presentation only. Report body fonts and governed stamps remain canonical. */
export const REPORT_PDF_BRANDING_RENDERER = 'company-letterhead-report-pdf-v1';
export interface ReportPdfBranding {
  profile: CompanyDocumentProfile;
  logo?: Buffer;
}

const refusal = (message: string): never => {
  throw new ReportingPdfError(422, 'REPORT_PDF_BRANDING_INVALID', `${message} Nothing was exported. Update the company letterhead in Settings and retry.`);
};

/** No URL, file path or SVG reaches PDFKit. Bound raster expansion before decode. */
export async function prepareReportPdfBranding(profile?: CompanyDocumentProfile | null): Promise<ReportPdfBranding | undefined> {
  if (!profile?.applyToReports) return undefined;
  const brand: ReportPdfBranding = { profile };
  const logo = profile.letterhead.brand.logo;
  if (!logo || profile.letterhead.header?.showLogo === false) return brand;
  let bytes: Buffer;
  try { bytes = companyLogoBytes(logo)!.bytes; }
  catch (error) { return refusal(error instanceof Error ? error.message : 'The saved company logo is invalid.'); }
  const { width, height } = imageSize(bytes)!;
  if (logo.mimeType === 'image/gif') {
    try {
      // Reuse the one native canvas already pinned for the document runtime.
      // Letterhead is static: an animated GIF's first frame is used.
      const { createCanvas, loadImage } = await import('@napi-rs/canvas');
      const image = await loadImage(bytes);
      const canvas = createCanvas(width, height);
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      brand.logo = canvas.toBuffer('image/png');
    } catch { return refusal('The company GIF logo could not be decoded.'); }
  } else brand.logo = bytes;
  return brand;
}
