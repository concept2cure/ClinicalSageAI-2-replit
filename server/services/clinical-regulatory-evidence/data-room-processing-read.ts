/** Safe read projection over the processor's canonical pure stage parser.
 * No admission, writes, byte loading or provider calls occur here. */
import { summarizeDataRoomProcessing, type DataRoomProcessingSummary } from '../../../shared/data-room-processing-status.js';
import { parseProcessingStage } from './data-room-processing-state.js';

export function sourceProcessingSummary(metadata: unknown, observedAt: string | null = null): DataRoomProcessingSummary | null {
  try {
    parseProcessingStage(metadata);
    return summarizeDataRoomProcessing(metadata, observedAt);
  } catch {
    return { state: 'unknown', retryable: false, reasonCode: 'STAGE_METADATA_INVALID', leaseExpiresAt: null, nextRetryAt: null };
  }
}
