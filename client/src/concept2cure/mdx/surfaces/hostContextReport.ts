/**
 * A device screen hands what AnA may see of one of its panels up to the host.
 *
 * The host (mdx/MdxSurfaceHost.tsx) publishes each device screen's AnA context
 * under the screen's id, and the store holds one context at a time, so a second
 * publish from inside the screen would replace the host's. A panel's context is
 * handed up instead, and the host merges it into its one publish for the
 * project in context. Engineering's risk register and design-control trace
 * (./engineeringPanelsContext.ts) and IVDR evidence's readiness board
 * (./IvdSurface.tsx) report through this one hook (D2, 2026-10-29).
 *
 * Only a change of content is reported. The effect is keyed on the context's
 * serialization, as usePublishSurfaceContext is (v2/surfaceContext.ts). The host
 * stores what it receives, which re-renders the screen with the same content,
 * so reporting on every render would never settle. Null is reported on unmount.
 *
 * @module client/src/concept2cure/mdx/surfaces/hostContextReport
 */
import { useEffect, useRef } from 'react';

export function useReportToHost<T>(report: ((ctx: T | null) => void) | undefined, ctx: T | null): void {
  const key = ctx ? JSON.stringify(ctx) : '';
  const latest = useRef({ report, ctx });
  latest.current = { report, ctx };
  useEffect(() => {
    latest.current.report?.(latest.current.ctx);
  }, [key]);
  useEffect(() => {
    const box = latest;
    return () => box.current.report?.(null);
  }, []);
}
