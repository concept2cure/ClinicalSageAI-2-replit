/**
 * eCTD v4.0 (ICH / HL7 RPS) publishing engine — public surface.
 *
 * @module server/services/ectd/ectd4
 */

export * from './types';
export * from './ids';
export { buildRpsMessage, RPS_MESSAGE_PATH } from './rps-message-builder';
export {
  forwardCompatToV4,
  mapOperation,
  sectionToCou,
  ICH_COU_OID,
  type ForwardCompatInput,
  type ForwardCompatResult,
} from './forward-compat';
export {
  validateRpsMessage,
  type RpsFinding,
  type RpsSeverity,
  type RpsValidationResult,
} from './rps-validator';
export {
  packageRpsSubmission,
  type RpsPackagerInput,
  type RpsPackageResult,
} from './rps-packager';
