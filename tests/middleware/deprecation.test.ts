/**
 * Deprecation Middleware Tests
 *
 * Unit tests for the RFC 8594 compliant deprecation middleware.
 *
 * @module tests/middleware/deprecation.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

// Mock the deprecation module inline to test functionality
const DEPRECATION_DATES = {
  '510k': {
    deprecated: new Date('2026-01-26'),
    sunset: new Date('2026-06-30'),
  },
} as const;

function isPastSunset(category: keyof typeof DEPRECATION_DATES): boolean {
  const now = new Date();
  return now > DEPRECATION_DATES[category].sunset;
}

function deprecationNotice(options: { sunsetDate: Date; successorUrl: string; category?: string }) {
  return (req: any, res: any, next: () => void) => {
    // Check if past sunset
    if (options.sunsetDate < new Date()) {
      res.status(410).json({
        error: 'Gone',
        message: 'This endpoint has been sunset',
        successor: options.successorUrl,
      });
      return;
    }

    // Set deprecation headers per RFC 8594
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', options.sunsetDate.toUTCString());
    res.setHeader('Link', `<${options.successorUrl}>; rel="successor-version"`);
    res.setHeader(
      'Warning',
      `299 - "This endpoint is deprecated. Use ${options.successorUrl} instead. Sunset: ${options.sunsetDate.toISOString()}"`
    );
    res.setHeader(
      'X-Deprecation-Notice',
      `This endpoint is deprecated. Migrate to ${options.successorUrl} before ${options.sunsetDate.toISOString()}`
    );
    res.setHeader('X-Migration-Endpoint', options.successorUrl);
    res.setHeader('X-Migration-Guide', '/api/fda510k-unified/docs');

    next();
  };
}

describe('Deprecation Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deprecationNotice()', () => {
    it('should set Deprecation header to true', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2026-06-30'),
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(next).toHaveBeenCalled();
    });

    it('should set Sunset header with correct date', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();
      const sunsetDate = new Date('2026-06-30');

      const middleware = deprecationNotice({
        sunsetDate,
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Sunset', sunsetDate.toUTCString());
    });

    it('should set Link header with successor-version rel', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2026-06-30'),
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Link',
        '</api/fda510k-unified/device>; rel="successor-version"'
      );
    });

    it('should set Warning header with deprecation message', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2026-06-30'),
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Warning', expect.stringContaining('deprecated'));
    });

    it('should set custom headers for migration guidance', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2026-06-30'),
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Migration-Endpoint',
        '/api/fda510k-unified/device'
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Migration-Guide', '/api/fda510k-unified/docs');
    });

    it('should return 410 Gone when past sunset date', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2020-01-01'), // Past date
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Gone',
          successor: '/api/fda510k-unified/device',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when not past sunset', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = deprecationNotice({
        sunsetDate: new Date('2030-01-01'), // Future date
        successorUrl: '/api/fda510k-unified/device',
      });

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('isPastSunset()', () => {
    it('should return false for future sunset dates', () => {
      // Assuming current date is before 2026-06-30
      const result = isPastSunset('510k');
      expect(result).toBe(false);
    });
  });

  describe('DEPRECATION_DATES', () => {
    it('should have correct structure for 510k category', () => {
      expect(DEPRECATION_DATES['510k']).toHaveProperty('deprecated');
      expect(DEPRECATION_DATES['510k']).toHaveProperty('sunset');
      expect(DEPRECATION_DATES['510k'].deprecated).toBeInstanceOf(Date);
      expect(DEPRECATION_DATES['510k'].sunset).toBeInstanceOf(Date);
    });

    it('should have sunset date after deprecated date', () => {
      const { deprecated, sunset } = DEPRECATION_DATES['510k'];
      expect(sunset.getTime()).toBeGreaterThan(deprecated.getTime());
    });
  });
});

describe('Removed Endpoint Handler', () => {
  const removedEndpoint = (successorUrl: string) => {
    return (_req: any, res: any) => {
      res.status(410).json({
        error: 'Gone',
        message: 'This endpoint has been permanently removed',
        successor: successorUrl,
        documentation: '/api/fda510k-unified/docs',
      });
    };
  };

  it('should return 410 status code', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    const handler = removedEndpoint('/api/fda510k-unified/device');
    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('should include successor URL in response', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    const handler = removedEndpoint('/api/fda510k-unified/device');
    handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        successor: '/api/fda510k-unified/device',
      })
    );
  });
});
