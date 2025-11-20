// /server/routes/rate-limiter.js

/**
 * Rate limiter for API endpoints
 *
 * Implements a simple in-memory rate limiter with sliding window to prevent
 * abuse of the API endpoints. This is particularly important for AI-powered
 * endpoints that can be expensive to run.
 */

// Store for tracking request counts by IP address
const requestCounts = new Map();

// Rate limit configuration (per IP address)
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up tracking every 5 minutes

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();

  for (const [ip, data] of requestCounts.entries()) {
    // Remove timestamps older than the window
    data.timestamps = data.timestamps.filter(ts => now - ts < WINDOW_MS);

    // If no timestamps remain, remove the IP address entry
    if (data.timestamps.length === 0) {
      requestCounts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Rate limiter middleware
 */
function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();

  // Initialize or get the tracking data for this IP
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { timestamps: [] });
  }

  const ipData = requestCounts.get(ip);

  // Filter out timestamps older than the window
  ipData.timestamps = ipData.timestamps.filter(ts => now - ts < WINDOW_MS);

  // Check if rate limit is exceeded
  if (ipData.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = ipData.timestamps[0];
    const resetTime = WINDOW_MS - (now - oldestTimestamp);
    const resetSeconds = Math.ceil(resetTime / 1000);

    res.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW);
    res.set('X-RateLimit-Remaining', 0);
    res.set('X-RateLimit-Reset', resetSeconds);
    res.set('Retry-After', resetSeconds);

    return res.status(429).json({
      error: 'Rate limit exceeded',
      response: `You've made too many requests. Please try again in ${resetSeconds} seconds.`,
      retryAfter: resetSeconds,
    });
  }

  // Add current timestamp to the tracking data
  ipData.timestamps.push(now);

  // Set rate limit headers
  res.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW);
  res.set('X-RateLimit-Remaining', MAX_REQUESTS_PER_WINDOW - ipData.timestamps.length);

  next();
}

module.exports = { rateLimiter };
