/** Human selection metadata from the same verified FDA bytes the producer uses. */
import { descriptorFor, listVendoredTemplates, type EstarTemplateType, type EstarTemplateVariant } from './estar-template-registry';
import { fillEstarSubmission } from './estar-fill';
import { listEstarAttachmentSlots } from './estar-attachment-slots';

export class EstarAttachmentCatalogError extends Error {
  readonly status = 422;
  constructor(readonly code: string, message: string) { super(message); this.name='EstarAttachmentCatalogError'; }
}
export async function readVerifiedEstarAttachmentTemplate(type: EstarTemplateType, variant: EstarTemplateVariant) {
  const descriptor=descriptorFor(type,variant);
  const hit=descriptor && (await listVendoredTemplates()).find(t=>t.fileName.toLowerCase()===descriptor.expectedFileName.toLowerCase());
  if (!descriptor || !hit || hit.integrity!=='verified') throw new EstarAttachmentCatalogError(
    'ESTAR_ATTACHMENT_CATALOG_UNAVAILABLE','The official attachment destinations require the available, checksum-verified FDA template.');
  return {descriptor,templateBytes:hit.bytes};
}
export async function readEstarAttachmentCatalog(type: EstarTemplateType, variant: EstarTemplateVariant) {
  if (!['510k','de_novo','pma'].includes(type) || !['device','ivd'].includes(variant)) {
    throw new EstarAttachmentCatalogError('ESTAR_ATTACHMENT_SELECTION_UNSUPPORTED', 'Attachment selection is available for device and IVD marketing submissions. PreSTAR remains administrative preparation.');
  }
  const {descriptor,templateBytes}=await readVerifiedEstarAttachmentTemplate(type,variant);
  // Explicitly verified above; passing these bytes avoids reading a different
  // file between readiness assessment and extracting its attachment controls.
  const readiness=await fillEstarSubmission({type,variant,data:{},templateBytes});
  if (!readiness.templateAvailable || !readiness.fieldMapPopulated) throw new EstarAttachmentCatalogError(
    'ESTAR_ATTACHMENT_CATALOG_UNAVAILABLE','This official template is not ready for attachment selection.');
  const slots=await listEstarAttachmentSlots(templateBytes);
  if (!slots.length) throw new EstarAttachmentCatalogError('ESTAR_ATTACHMENT_CATALOG_UNAVAILABLE','No verified attachment destinations could be read from this FDA template.');
  return {descriptorId:descriptor.id,type,variant,templateVersion:descriptor.version,slots};
}
